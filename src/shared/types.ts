export interface Host {
  id: string
  name: string
  kind: 'local' | 'ssh'
  address: string
  socket?: string
  pinned?: boolean
}
export interface NewSession {
  name: string
  directory?: string
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
  width?: number
  height?: number
  left?: number
  top?: number
  cursorX?: number
  cursorY?: number
  modes?: string
  zoomed?: boolean
}

export interface SSHCandidate {
  address: string
  added: boolean
}
export interface HostProbe {
  reachable: boolean
  sessions: number
  error?: string
}
export interface PaneEvent {
  id: string
  paneId?: string
  data?: string
  reset?: boolean
  cols?: number
  rows?: number
  session?: TmuxSession
  error?: string
  closed?: boolean
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
  | { type: 'new-window' | 'next-window' | 'previous-window'; sessionId: string; paneId: string }
  | { type: 'select'; sessionId: string; paneId: string }
  | { type: 'split'; sessionId: string; paneId: string; direction: 'horizontal' | 'vertical' }
  | { type: 'zoom'; sessionId: string; paneId: string }

export interface TerminalEvent {
  id: string
  data?: string
  exitCode?: number
}

export interface DesktopAPI {
  platform: string
  hosts: {
    list(): Promise<Host[]>
    save(host: Host): Promise<Host[]>
    remove(id: string): Promise<Host[]>
    pin(id: string, pinned: boolean): Promise<Host[]>
    candidates(): Promise<SSHCandidate[]>
    probe(address: string): Promise<HostProbe>
    importSSH(addresses: string[]): Promise<Host[]>
  }
  tmux: {
    create(hostId: string, request: NewSession): Promise<TmuxSession>
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
  panes: {
    open(request: { id: string; hostId: string; sessionId: string }): Promise<void>
    capture(id: string, paneId: string): Promise<void>
    input(id: string, paneId: string, data: string): Promise<void>
    select(id: string, paneId: string): Promise<void>
    action(id: string, action: TmuxAction): Promise<void>
    resize(id: string, cols: number, rows: number): Promise<void>
    acknowledge(id: string, bytes: number): void
    close(id: string): Promise<void>
    subscribe(listener: (event: PaneEvent) => void): () => void
  }
}

declare global {
  interface Window {
    muxyard?: DesktopAPI
  }
}
