export interface Host {
  id: string
  name: string
  kind: 'local' | 'ssh'
  address: string
  socket?: string
}

export type AgentKind = 'Claude Code' | 'Codex' | 'OpenCode' | 'Gemini' | 'Aider'

export interface Pane {
  id: string
  sessionId: string
  sessionName: string
  windowId: string
  windowIndex: number
  windowName: string
  index: number
  active: boolean
  windowActive: boolean
  command: string
  path: string
  title: string
  dead: boolean
  agent?: AgentKind
}

export interface TmuxSession {
  id: string
  name: string
  attached: number
  windows: number
  panes: Pane[]
}

export interface Snapshot {
  sessions: TmuxSession[]
  checkedAt: number
}

export type TmuxAction =
  | { type: 'select'; sessionId: string; paneId: string }
  | { type: 'split'; sessionId: string; paneId: string; direction: 'horizontal' | 'vertical' }
  | { type: 'zoom'; sessionId: string; paneId: string }

export interface TerminalEvent {
  id: string
  data?: string
  exitCode?: number
}

export interface DesktopAPI {
  hosts: {
    list(): Promise<Host[]>
    save(host: Host): Promise<Host[]>
    remove(id: string): Promise<Host[]>
    importSSH(): Promise<Host[]>
  }
  tmux: {
    discover(hostId: string): Promise<Snapshot>
    action(hostId: string, action: TmuxAction): Promise<void>
  }
  terminal: {
    open(request: {
      id: string
      hostId: string
      sessionId: string
      cols: number
      rows: number
    }): Promise<void>
    write(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    acknowledge(id: string, characters: number): void
    close(id: string): Promise<void>
    subscribe(listener: (event: TerminalEvent) => void): () => void
  }
}

declare global {
  interface Window {
    muxyard?: DesktopAPI
  }
}
