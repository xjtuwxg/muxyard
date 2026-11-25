import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AgentKind, Host, Pane, Snapshot, TmuxAction } from '../shared/types'

const execFileAsync = promisify(execFile)
export const FIELD = '\t'
const fields = [
  'session_id',
  'session_name',
  'session_attached',
  'session_windows',
  'window_id',
  'window_index',
  'window_name',
  'window_active',
  'pane_id',
  'pane_index',
  'pane_active',
  'pane_current_command',
  'pane_current_path',
  'pane_title',
  'pane_dead',
  'pane_width',
  'pane_height',
  'pane_left',
  'pane_top',
  'cursor_x',
  'cursor_y',
  'cursor_flag',
  'alternate_on',
  'keypad_cursor_flag',
  'mouse_standard_flag',
  'mouse_button_flag',
  'mouse_all_flag',
  'mouse_sgr_flag',
  'window_zoomed_flag',
  'wrap_flag',
  'insert_flag',
  'keypad_flag'
]
export const PANE_FORMAT = fields.map((field) => `#{${field}}`).join(FIELD)

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

export function validateHost(host: Host): Host {
  if (!host || typeof host.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(host.id))
    throw new Error('Invalid host ID.')
  if (typeof host.name !== 'string' || !host.name.trim() || host.name.length > 80)
    throw new Error('Enter a host name (up to 80 characters).')
  if (!['local', 'ssh'].includes(host.kind)) throw new Error('Invalid host type.')
  if (
    host.kind === 'ssh' &&
    (typeof host.address !== 'string' ||
      !/^(?:[a-zA-Z0-9_.-]+@)?[a-zA-Z0-9_][a-zA-Z0-9_.:-]*$/.test(host.address))
  ) {
    throw new Error(
      'Enter an SSH config alias or user@hostname. Put ports and jump hosts in ~/.ssh/config.'
    )
  }
  if (
    host.socket !== undefined &&
    (typeof host.socket !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(host.socket))
  )
    throw new Error('Socket names may contain letters, numbers, underscores, and hyphens.')
  return {
    id: host.id,
    name: host.name.trim(),
    kind: host.kind,
    address: host.kind === 'local' ? '' : host.address,
    ...(host.socket ? { socket: host.socket } : {})
  }
}

export function detectAgent(command: string): AgentKind | undefined {
  const name = command.split('/').at(-1)?.toLowerCase()
  return (
    {
      claude: 'Claude Code',
      codex: 'Codex',
      opencode: 'OpenCode',
      gemini: 'Gemini',
      aider: 'Aider'
    } as Record<string, AgentKind>
  )[name ?? '']
}

export function parseSnapshot(output: string): Snapshot {
  const sessions = new Map<string, Snapshot['sessions'][number]>()
  for (const row of output.split('\n')) {
    if (!row) continue
    const f = row.split(FIELD)
    if (
      (f.length !== fields.length && f.length !== 15) ||
      !/^\$\d+$/.test(f[0]) ||
      !/^@\d+$/.test(f[4]) ||
      !/^%\d+$/.test(f[8])
    )
      continue
    if (!sessions.has(f[0]))
      sessions.set(f[0], {
        id: f[0],
        name: f[1],
        attached: Number(f[2]),
        windows: Number(f[3]),
        panes: []
      })
    const pane: Pane = {
      sessionId: f[0],
      sessionName: f[1],
      windowId: f[4],
      windowIndex: Number(f[5]),
      windowName: f[6],
      windowActive: f[7] === '1',
      id: f[8],
      index: Number(f[9]),
      active: f[10] === '1',
      command: f[11],
      path: f[12],
      title: f[13],
      dead: f[14] === '1',
      agent: detectAgent(f[11])
    }
    if (f.length === fields.length) {
      Object.assign(pane, {
        width: Number(f[15]),
        height: Number(f[16]),
        left: Number(f[17]),
        top: Number(f[18]),
        cursorX: Number(f[19]),
        cursorY: Number(f[20]),
        modes: f.slice(21, 28).join('') + f.slice(29, 32).join(''),
        zoomed: f[28] === '1'
      })
    }
    sessions.get(f[0])!.panes.push(pane)
  }
  return { sessions: [...sessions.values()], checkedAt: Date.now() }
}

export function tmuxArgs(host: Host, args: string[]): string[] {
  return ['-u', ...(host.socket ? ['-L', host.socket] : []), ...args]
}

export function sshArgs(host: Host, tty = false): string[] {
  return [
    ...(tty ? ['-tt'] : []),
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'ConnectTimeout=8',
    '-o',
    'ServerAliveInterval=15',
    '-o',
    'ServerAliveCountMax=2',
    '-o',
    `RequestTTY=${tty ? 'force' : 'no'}`,
    '--',
    host.address
  ]
}

export function commandFor(host: Host, args: string[]): { file: string; args: string[] } {
  const command = tmuxArgs(host, args)
  if (host.kind === 'local') return { file: 'tmux', args: command }
  return {
    file: '/usr/bin/ssh',
    args: [...sshArgs(host), ['tmux', ...command].map(shellQuote).join(' ')]
  }
}

export async function runTmux(host: Host, args: string[]): Promise<string> {
  const command = commandFor(host, args)
  try {
    const { stdout } = await execFileAsync(command.file, command.args, {
      timeout: 12000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, LC_ALL: 'C' }
    })
    return stdout
  } catch (error) {
    const err = error as Error & { stderr?: string; code?: string | number }
    const detail = err.stderr?.trim() || err.message
    if (
      args[0] === 'list-panes' &&
      /^(no server running on |error connecting to .* \(No such file or directory\))/.test(detail)
    )
      return ''
    if (err.code === 'ENOENT' || /tmux: (command )?not found/.test(detail))
      throw new Error(
        'tmux was not found. Install tmux on this host and ensure it is on the non-interactive SSH PATH.'
      )
    throw new Error(detail)
  }
}

export async function discover(host: Host): Promise<Snapshot> {
  return parseSnapshot(await runTmux(host, ['list-panes', '-a', '-F', PANE_FORMAT]))
}

export function actionArgs(action: TmuxAction, pane: Pane): string[] {
  switch (action.type) {
    case 'new-window':
      return ['new-window', '-t', `${pane.sessionId}:`, '-c', pane.path]
    case 'next-window':
      return ['next-window', '-t', pane.sessionId]
    case 'previous-window':
      return ['previous-window', '-t', pane.sessionId]
    case 'select':
      return [
        'select-window',
        '-t',
        `${pane.sessionId}:${pane.windowId}`,
        ';',
        'select-pane',
        '-t',
        pane.id
      ]
    case 'zoom':
      return ['resize-pane', '-Z', '-t', pane.id]
    case 'split':
      if (!['horizontal', 'vertical'].includes(action.direction))
        throw new Error('Invalid split direction.')
      return [
        'split-window',
        action.direction === 'horizontal' ? '-h' : '-v',
        '-t',
        pane.id,
        '-c',
        pane.path
      ]
    default:
      throw new Error('Unknown tmux action.')
  }
}
