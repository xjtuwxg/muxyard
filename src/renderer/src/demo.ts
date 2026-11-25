import type { Host, Pane, Snapshot } from '../../shared/types'

export const demoHosts: Host[] = [
  { id: 'demo-local', name: 'This Mac', kind: 'local', address: '' },
  { id: 'demo-dev', name: 'Dev server', kind: 'ssh', address: 'dev@atlas' },
  { id: 'demo-lab', name: 'GPU lab', kind: 'ssh', address: 'research@gpu-01' }
]

function pane(
  id: number,
  session: number,
  name: string,
  window: number,
  windowName: string,
  command: string,
  path: string
): Pane {
  return {
    id: `%${id}`,
    sessionId: `$${session}`,
    sessionName: name,
    windowId: `@${window}`,
    windowIndex: window,
    windowName,
    index: 0,
    active: true,
    windowActive: window === 0,
    command,
    path,
    title: windowName,
    dead: false,
    agent:
      command === 'claude'
        ? 'Claude Code'
        : command === 'codex'
          ? 'Codex'
          : command === 'opencode'
            ? 'OpenCode'
            : undefined
  }
}

export function demoSnapshots(): Record<string, Snapshot> {
  return {
    'demo-local': {
      checkedAt: Date.now(),
      sessions: [
        {
          id: '$0',
          name: 'atlas-api',
          windows: 3,
          attached: 1,
          panes: [
            pane(0, 0, 'atlas-api', 0, 'agent', 'claude', '~/Projects/atlas'),
            pane(1, 0, 'atlas-api', 1, 'server', 'node', '~/Projects/atlas'),
            pane(2, 0, 'atlas-api', 2, 'shell', 'zsh', '~/Projects/atlas')
          ]
        },
        {
          id: '$1',
          name: 'web-studio',
          windows: 2,
          attached: 0,
          panes: [
            pane(3, 1, 'web-studio', 3, 'frontend', 'codex', '~/Projects/web-studio'),
            pane(4, 1, 'web-studio', 4, 'preview', 'node', '~/Projects/web-studio')
          ]
        },
        {
          id: '$2',
          name: 'dotfiles',
          windows: 1,
          attached: 0,
          panes: [pane(5, 2, 'dotfiles', 5, 'editor', 'nvim', '~/.dotfiles')]
        }
      ]
    },
    'demo-dev': {
      checkedAt: Date.now(),
      sessions: [
        {
          id: '$0',
          name: 'platform',
          windows: 2,
          attached: 0,
          panes: [
            pane(0, 0, 'platform', 0, 'migration', 'claude', '/srv/platform'),
            pane(1, 0, 'platform', 1, 'logs', 'tail', '/srv/platform')
          ]
        }
      ]
    },
    'demo-lab': {
      checkedAt: Date.now(),
      sessions: [
        {
          id: '$0',
          name: 'experiments',
          windows: 1,
          attached: 0,
          panes: [
            pane(0, 0, 'experiments', 0, 'research', 'opencode', '/home/research/experiments')
          ]
        }
      ]
    }
  }
}

export const demoOutput =
  '\x1b[38;2;159;202;172m❯\x1b[0m claude\r\n\r\n' +
  '\x1b[38;2;224;172;129m  ✳  Claude Code\x1b[0m  \x1b[2m/ Sample terminal preview\x1b[0m\r\n' +
  '\x1b[2m     ~/Projects/atlas\x1b[0m\r\n\r\n' +
  '\x1b[1m❯ Add cursor pagination to the projects endpoint.\x1b[0m\r\n\r\n' +
  '  I’ll follow the existing API conventions and add coverage\r\n  for forward and backward pagination.\r\n\r\n' +
  '\x1b[38;2;159;202;172m  ●\x1b[0m Read src/routes/projects.ts\r\n' +
  '\x1b[38;2;159;202;172m  ●\x1b[0m Read src/lib/pagination.ts\r\n' +
  '\x1b[38;2;159;202;172m  ●\x1b[0m Update src/routes/projects.ts\r\n\r\n' +
  '\x1b[2m    24\x1b[0m  router.get("/projects", async (context) => {\r\n' +
  '\x1b[38;2;159;202;172m  + 25    const cursor = context.req.query("cursor")\r\n' +
  '  + 26    const limit = parseLimit(context.req.query("limit"))\x1b[0m\r\n' +
  '\x1b[2m    27\x1b[0m    const projects = await listProjects({ cursor, limit })\r\n\r\n' +
  '\x1b[38;2;159;202;172m  ✓\x1b[0m 12 tests passed\r\n\r\n' +
  '  Pagination is ready for review.\r\n\r\n' +
  '\x1b[2m─────────────────────────────────────────────────────────────\x1b[0m\r\n' +
  '\x1b[38;2;159;202;172m❯\x1b[0m '
