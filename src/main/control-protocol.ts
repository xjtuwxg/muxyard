interface Pending {
  resolve: (lines: string[]) => void
  reject: (error: Error) => void
  complete?: (lines: string[]) => void
  timer: ReturnType<typeof setTimeout>
}

export function decodeOutput(value: string): Buffer {
  const bytes: number[] = []
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '\\' && /^[0-7]{3}$/.test(value.slice(index + 1, index + 4))) {
      bytes.push(parseInt(value.slice(index + 1, index + 4), 8))
      index += 3
    } else bytes.push(value.charCodeAt(index))
  }
  return Buffer.from(bytes)
}

// The protocol is framed as bytes: a UTF-8 character may span output notifications.
export class ControlProtocol {
  private buffer = ''
  private pending: Pending[] = []
  private block: { guard: string; lines: string[]; pending?: Pending } | undefined
  private started = false
  private stopped = false
  readonly ready: Promise<void>
  private readyResolve!: () => void
  private readyReject!: (error: Error) => void
  constructor(
    private write: (command: string) => void,
    private notification: (line: string) => void,
    private failure?: (error: Error) => void
  ) {
    this.ready = new Promise((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
    })
  }
  feed(data: Buffer): void {
    if (this.stopped) return
    this.buffer += data.toString('latin1')
    if (this.buffer.length > 16 * 1024 * 1024) {
      this.fail(new Error('Tmux control output exceeded the protocol buffer limit.'))
      return
    }
    let newline: number
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, '')
      this.buffer = this.buffer.slice(newline + 1)
      this.line(line)
    }
  }
  request(args: string[], complete?: (lines: string[]) => void): Promise<string[]> {
    return this.sequence([{ args, complete }]).then((results) => results[0])
  }
  sequence(
    commands: { args: string[]; complete?: (lines: string[]) => void }[]
  ): Promise<string[][]> {
    if (this.stopped) return Promise.reject(new Error('The pane connection is closed.'))
    if (commands.some((command) => command.args.some((value) => /[\r\n\0]/.test(value))))
      return Promise.reject(
        new Error(
          'Control-mode arguments cannot contain line breaks or NUL bytes. Use Classic terminal for this target.'
        )
      )
    if (this.pending.length + commands.length > 256)
      return Promise.reject(new Error('Too many queued tmux commands.'))
    const replies = commands.map(
      ({ complete }) =>
        new Promise<string[]>((resolve, reject) => {
          const timer = setTimeout(
            () => this.fail(new Error('Tmux control command timed out. Reattach to continue.')),
            12000
          )
          this.pending.push({ resolve, reject, complete, timer })
        })
    )
    // A command list runs without another event-loop turn between its commands.
    // This keeps captured screen contents and cursor metadata at the same instant.
    this.write(
      commands
        .map(({ args }) => args.map((value) => `'${value.replaceAll("'", "'\\''")}'`).join(' '))
        .join(' ; ') + '\n'
    )
    return Promise.all(replies).catch((error) => {
      if (commands.length > 1) this.fail(error)
      throw error
    })
  }
  fail(error: Error): void {
    if (this.stopped) return
    this.stopped = true
    this.readyReject(error)
    const pending = [...this.pending, ...(this.block?.pending ? [this.block.pending] : [])]
    for (const command of pending) {
      clearTimeout(command.timer)
      command.reject(error)
    }
    this.pending = []
    this.block = undefined
    this.failure?.(error)
  }
  private line(line: string): void {
    if (this.block) {
      const success = line === `%end ${this.block.guard}`
      const failure = line === `%error ${this.block.guard}`
      if (!success && !failure) {
        this.block.lines.push(Buffer.from(line, 'latin1').toString('utf8'))
        return
      }
      const block = this.block
      this.block = undefined
      if (!this.started) {
        this.started = true
        if (failure) this.readyReject(new Error(block.lines.join('\n')))
        else this.readyResolve()
      } else if (block.pending) {
        clearTimeout(block.pending.timer)
        if (failure) block.pending.reject(new Error(block.lines.join('\n')))
        else {
          // Emit initial screen state before parsing later streamed pane output.
          block.pending.complete?.(block.lines)
          block.pending.resolve(block.lines)
        }
      }
      return
    }
    if (line.startsWith('%begin ')) {
      this.block = {
        guard: line.slice(7),
        lines: [],
        pending:
          this.started && Number(line.split(' ').at(-1)) & 1 ? this.pending.shift() : undefined
      }
    } else this.notification(line)
  }
}
