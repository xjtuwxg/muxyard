import * as pty from 'node-pty'
import type { Host, TerminalEvent } from '../shared/types'
import { shellQuote, sshArgs, tmuxArgs } from './tmux'

interface Connection {
  process: pty.IPty
  unacknowledged: number
  paused: boolean
}

export class Terminals {
  private connections = new Map<string, Connection>()
  constructor(private emit: (event: TerminalEvent) => void) {}

  open(id: string, host: Host, sessionId: string, cols: number, rows: number): void {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || this.connections.has(id))
      throw new Error('Invalid terminal ID.')
    if (this.connections.size >= 12)
      throw new Error('Detach a terminal before opening more than 12 connections.')
    const args = tmuxArgs(host, ['attach-session', '-t', sessionId])
    const file = host.kind === 'local' ? 'tmux' : '/usr/bin/ssh'
    const argv =
      host.kind === 'local'
        ? args
        : [...sshArgs(host, true), ['tmux', ...args].map(shellQuote).join(' ')]
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    }
    delete env.TMUX
    delete env.TMUX_PANE
    const child = pty.spawn(file, argv, {
      name: 'xterm-256color',
      cols: this.dimension(cols),
      rows: this.dimension(rows),
      cwd: process.env.HOME,
      env
    })
    const connection: Connection = { process: child, unacknowledged: 0, paused: false }
    this.connections.set(id, connection)
    child.onData((data) => {
      connection.unacknowledged += data.length
      if (connection.unacknowledged > 256 * 1024 && !connection.paused) {
        child.pause()
        connection.paused = true
      }
      this.emit({ id, data })
    })
    child.onExit(({ exitCode }) => {
      if (this.connections.get(id) !== connection) return
      this.connections.delete(id)
      this.emit({ id, exitCode })
    })
  }
  write(id: string, data: string): void {
    if (typeof data === 'string' && data.length <= 1024 * 1024)
      this.connections.get(id)?.process.write(data)
  }
  resize(id: string, cols: number, rows: number): void {
    this.connections.get(id)?.process.resize(this.dimension(cols), this.dimension(rows))
  }
  acknowledge(id: string, characters: number): void {
    const connection = this.connections.get(id)
    if (!connection || !Number.isSafeInteger(characters) || characters < 0) return
    connection.unacknowledged = Math.max(0, connection.unacknowledged - characters)
    if (connection.paused && connection.unacknowledged < 128 * 1024) {
      connection.paused = false
      connection.process.resume()
    }
  }
  close(id: string): void {
    const connection = this.connections.get(id)
    this.connections.delete(id)
    connection?.process.kill()
  }
  closeAll(): void {
    for (const id of this.connections.keys()) this.close(id)
  }
  private dimension(value: number): number {
    if (!Number.isInteger(value) || value < 2 || value > 1000)
      throw new Error('Invalid terminal size.')
    return value
  }
}
