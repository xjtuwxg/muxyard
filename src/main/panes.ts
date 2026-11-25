import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { Host, Pane, PaneEvent, TmuxSession, TmuxAction } from '../shared/types'
import { PANE_FORMAT, parseSnapshot, shellQuote, sshArgs, tmuxArgs, actionArgs } from './tmux'
import { ControlProtocol, decodeOutput } from './control-protocol'
import { sshExecutable, requireLocalTmux } from './platform'

export class PaneConnection {
  private child: ChildProcessWithoutNullStreams
  private protocol: ControlProtocol
  private hydrated = new Set<string>()
  private session?: TmuxSession
  private closed = false
  private outstanding = 0
  private refreshTimer?: ReturnType<typeof setTimeout>
  private refreshing = false
  private refreshAgain = false
  private startup: ReturnType<typeof setTimeout>
  private stderr = ''
  private inputQueue: Promise<unknown> = Promise.resolve()
  readonly ready: Promise<void>

  constructor(
    readonly id: string,
    host: Host,
    private sessionId: string,
    private emit: (event: PaneEvent) => void
  ) {
    const args = tmuxArgs(host, ['-C', 'attach-session', '-t', sessionId])
    if (host.kind === 'local') requireLocalTmux()
    const env = { ...process.env }
    delete env.TMUX
    delete env.TMUX_PANE
    this.child =
      host.kind === 'local'
        ? spawn('tmux', args, { env })
        : spawn(sshExecutable(), [...sshArgs(host), ['tmux', ...args].map(shellQuote).join(' ')], {
            env
          })
    this.protocol = new ControlProtocol(
      (command) => this.child.stdin.write(command),
      (line) => this.notify(line),
      (error) => this.close(error.message)
    )
    this.startup = setTimeout(() => this.close('Tmux control attachment timed out.'), 12000)
    this.child.stdout.on('data', (data: Buffer) => this.protocol.feed(data))
    this.child.stderr.on('data', (data: Buffer) => {
      this.stderr = (this.stderr + data.toString()).slice(-8192)
    })
    this.child.on('error', (error) => this.close(error.message))
    this.child.on('exit', () => this.close(this.stderr.trim() || undefined))
    this.child.stdin.on('error', (error) => this.close(error.message))
    this.ready = this.protocol.ready.then(async () => {
      clearTimeout(this.startup)
      await this.refresh()
    })
  }
  private notify(line: string): void {
    const output = line.match(/^%output (%\d+) (.*)$/s)
    if (output) {
      if (this.hydrated.has(output[1])) this.output(output[1], decodeOutput(output[2]))
      return
    }
    if (line.startsWith('%exit')) {
      this.close()
      return
    }
    if (
      /^%(layout-change|window-pane-changed|session-window-changed|(?:unlinked-)?window-(?:add|close|renamed)|pane-mode-changed|session-renamed|sessions-changed)\b/.test(
        line
      )
    )
      this.scheduleRefresh()
  }
  private scheduleRefresh(): void {
    if (this.closed || this.refreshTimer) return
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined
      void this.refresh().catch((error) => this.close(String(error)))
    }, 30)
  }
  async refresh(): Promise<void> {
    if (this.refreshing) {
      this.refreshAgain = true
      return
    }
    this.refreshing = true
    try {
      do {
        this.refreshAgain = false
        const lines = await this.protocol.request([
          'list-panes',
          '-s',
          '-t',
          this.sessionId,
          '-F',
          PANE_FORMAT
        ])
        const session = parseSnapshot(lines.join('\n')).sessions.find(
          (session) => session.id === this.sessionId
        )
        if (!session) throw new Error('The attached session no longer exists.')
        this.session = session
        this.emit({ id: this.id, session })
      } while (this.refreshAgain && !this.closed)
    } finally {
      this.refreshing = false
    }
  }
  private pane(paneId: string): Pane {
    const pane = this.session?.panes.find((pane) => pane.id === paneId)
    if (!pane) throw new Error('This pane is no longer part of the attached session.')
    return pane
  }
  async capture(paneId: string): Promise<void> {
    this.pane(paneId)
    this.hydrated.delete(paneId)
    let captured: string[] = []
    await this.protocol
      .sequence([
        {
          args: ['capture-pane', '-p', '-e', '-N', '-S', '-1000', '-t', paneId],
          complete: (lines) => {
            captured = lines
          }
        },
        {
          args: ['display-message', '-p', '-t', paneId, PANE_FORMAT],
          complete: (lines) => {
            const pane =
              parseSnapshot(lines.join('\n'))
                .sessions.flatMap((session) => session.panes)
                .find((pane) => pane.id === paneId) ?? this.pane(paneId)
            const modes = pane.modes ?? '1000000'
            const alternate = modes[1] === '1' ? '\x1b[?1049h' : ''
            const cursor = `\x1b[${(pane.cursorY ?? 0) + 1};${(pane.cursorX ?? 0) + 1}H`
            const applicationCursor = modes[2] === '1' ? '\x1b[?1h' : ''
            const mouse = [1000, 1002, 1003, 1006]
              .map((mode, index) => (modes[3 + index] === '1' ? `\x1b[?${mode}h` : ''))
              .join('')
            const visible = modes[0] === '0' ? '\x1b[?25l' : '\x1b[?25h'
            const wrap = modes[7] === '0' ? '\x1b[?7l' : '\x1b[?7h'
            const insert = modes[8] === '1' ? '\x1b[4h' : '\x1b[4l'
            const keypad = modes[9] === '1' ? '\x1b=' : '\x1b>'
            this.output(
              paneId,
              Buffer.from(
                `\x1bc${alternate}\x1b[H${captured.join('\r\n')}${cursor}${wrap}${insert}${keypad}\x1b7${applicationCursor}${mouse}${visible}`
              ),
              true,
              pane
            )
            this.hydrated.add(paneId)
          }
        }
      ])
      .catch((error) => {
        this.close(String(error))
        throw error
      })
  }
  input(paneId: string, data: string): Promise<void> {
    this.pane(paneId)
    if (typeof data !== 'string' || Buffer.byteLength(data) > 1024 * 1024)
      throw new Error('Pane input is too large.')
    const result = this.inputQueue.then(() => this.sendInput(paneId, data))
    this.inputQueue = result.catch(() => {})
    return result
  }
  private async sendInput(paneId: string, data: string): Promise<void> {
    const bytes = Buffer.from(data)
    for (let offset = 0; offset < bytes.length; offset += 1024) {
      await this.protocol.request([
        'send-keys',
        '-H',
        '-t',
        paneId,
        ...[...bytes.subarray(offset, offset + 1024)].map((byte) => byte.toString(16))
      ])
    }
  }
  async select(paneId: string): Promise<void> {
    const pane = this.pane(paneId)
    await this.protocol.request(['select-window', '-t', `${this.sessionId}:${pane.windowId}`])
    await this.protocol.request(['select-pane', '-t', paneId])
    await this.refresh()
  }
  async resize(cols: number, rows: number): Promise<void> {
    if (
      !Number.isInteger(cols) ||
      !Number.isInteger(rows) ||
      cols < 10 ||
      rows < 5 ||
      cols > 1000 ||
      rows > 1000
    )
      throw new Error('Invalid pane workspace dimensions.')
    await this.protocol.request(['refresh-client', '-C', `${cols},${rows}`])
    await this.refresh()
  }
  async action(action: TmuxAction): Promise<void> {
    if (action.sessionId !== this.sessionId)
      throw new Error('This action targets a different session.')
    const pane = this.pane(action.paneId)
    if (action.type === 'select') {
      await this.select(pane.id)
      return
    }
    await this.protocol.request(actionArgs(action, pane))
    await this.refresh()
  }
  private output(paneId: string, data: Buffer, reset = false, pane?: Pane): void {
    this.outstanding += data.length
    if (this.outstanding > 256 * 1024) this.child.stdout.pause()
    this.emit({
      id: this.id,
      paneId,
      data: data.toString('base64'),
      reset,
      ...(pane ? { cols: pane.width, rows: pane.height } : {})
    })
  }
  acknowledge(bytes: number): void {
    if (!Number.isSafeInteger(bytes) || bytes < 0) return
    this.outstanding = Math.max(0, this.outstanding - bytes)
    if (this.outstanding < 128 * 1024) this.child.stdout.resume()
  }
  close(error?: string): void {
    if (this.closed) return
    this.closed = true
    clearTimeout(this.startup)
    clearTimeout(this.refreshTimer)
    this.protocol.fail(new Error(error || 'The pane client disconnected.'))
    this.child.kill()
    this.emit({ id: this.id, closed: true, ...(error ? { error } : {}) })
  }
}

export class PaneConnections {
  private connections = new Map<string, PaneConnection>()
  constructor(private emit: (event: PaneEvent) => void) {}
  async open(id: string, host: Host, sessionId: string): Promise<void> {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id) || this.connections.has(id))
      throw new Error('Invalid pane connection ID.')
    if (!/^\$\d+$/.test(sessionId)) throw new Error('Invalid session ID.')
    if (this.connections.size >= 12)
      throw new Error('Detach a session before opening more pane workspaces.')
    const connection = new PaneConnection(id, host, sessionId, (event) => {
      if (event.closed && this.connections.get(id) === connection) this.connections.delete(id)
      this.emit(event)
    })
    this.connections.set(id, connection)
    try {
      await connection.ready
    } catch (error) {
      connection.close()
      throw error
    }
  }
  get(id: string): PaneConnection {
    const connection = this.connections.get(id)
    if (!connection) throw new Error('The pane workspace is disconnected. Reattach to continue.')
    return connection
  }
  close(id: string): void {
    this.connections.get(id)?.close()
    this.connections.delete(id)
  }
  closeAll(): void {
    for (const id of this.connections.keys()) this.close(id)
  }
}
