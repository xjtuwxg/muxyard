import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Command,
  Cpu,
  Folder,
  House,
  Laptop,
  LayoutDashboard,
  Maximize2,
  Monitor,
  Network,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  Columns2,
  Rows2,
  Unplug,
  X,
  Trash2,
  PanelLeft,
  PanelRight,
  Minimize2
} from 'lucide-react'
import type { Host, Pane, Snapshot, TmuxAction, TmuxSession } from '../../shared/types'
import TerminalView from './TerminalView'
import PaneWorkspace from './PaneWorkspace'
import SSHImportDialog from './SSHImportDialog'
import { demoHosts, demoSnapshots } from './demo'

const api = window.muxyard
const localHost: Host = { id: 'local', name: 'This Mac', kind: 'local', address: '' }
interface Tab {
  key: string
  host: Host
  session: TmuxSession
  status: string
  attempt: number
}
interface TerminalLayout {
  sidebar: boolean
  inspector: boolean
  focus: boolean
}
function initialTerminalLayout(): TerminalLayout {
  try {
    const saved = JSON.parse(localStorage.getItem('muxyard.terminalLayout') ?? '{}')
    return {
      sidebar: saved.sidebar === true,
      inspector: saved.inspector === true,
      focus: saved.focus === true
    }
  } catch {
    return { sidebar: false, inspector: false, focus: false }
  }
}
const errorMessage = (error: unknown): string =>
  String(error).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')

function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? 'small' : ''}`}>
      <span className="brand-mark">
        <i />
        <i />
        <i />
      </span>
      {!small && (
        <span>
          muxyard<span className="brand-period">.</span>
        </span>
      )}
    </div>
  )
}

function AgentIcon({ pane }: { pane: Pane }) {
  return (
    <span
      className={`agent-icon ${pane.agent === 'Claude Code' ? 'claude' : pane.agent === 'Codex' ? 'codex' : 'other'}`}
    >
      {pane.agent === 'Claude Code' ? (
        <Sparkles size={17} />
      ) : pane.agent === 'Codex' ? (
        <Command size={16} />
      ) : (
        <Cpu size={16} />
      )}
    </span>
  )
}

export default function App() {
  const [realHosts, setRealHosts] = useState<Host[]>([localHost])
  const [demo, setDemo] = useState(!api)
  const hosts = demo ? demoHosts : realHosts
  const [selectedHost, setSelectedHost] = useState(demo ? 'demo-local' : 'local')
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>(demo ? demoSnapshots() : {})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [scanning, setScanning] = useState(false)
  const [filter, setFilter] = useState('')
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [selectedPanes, setSelectedPanes] = useState<Record<string, string>>({})
  const [modal, setModal] = useState<'host' | 'help' | 'import' | null>(null)
  const [paneMode, setPaneMode] = useState(true)
  const [layout, setLayout] = useState<TerminalLayout>(initialTerminalLayout)
  const [focusRequest, setFocusRequest] = useState(0)
  const [paneSelections, setPaneSelections] = useState<
    Record<string, { paneId: string; serial: number }>
  >({})
  const paneConnections = useRef(new Map<string, string>())
  const connectedHosts = useRef(new Set<string>())
  const inFlight = useRef(new Map<string, Promise<void>>())
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const [agentFilter, setAgentFilter] = useState(false)
  const generation = useRef(0)
  const searching = useRef<HTMLInputElement>(null)
  const shortcutHandler = useRef<(event: KeyboardEvent) => void>(() => {})
  const activeTab = tabs.find((tab) => tab.key === activeKey)
  const focusActive = Boolean(activeTab && layout.focus)
  const host = hosts.find((item) => item.id === selectedHost) ?? hosts[0]
  const visibleHosts = hosts.filter(
    (item) =>
      item.kind === 'local' || item.id === selectedHost || (snapshots[item.id] && !errors[item.id])
  )
  const otherHosts = hosts.filter((item) => !visibleHosts.includes(item))
  const currentSnapshot = snapshots[host.id]
  const currentSessions = currentSnapshot?.sessions ?? []
  const allSessions = hosts.flatMap((host) =>
    (snapshots[host.id]?.sessions ?? []).map((session) => ({ host, session }))
  )
  const agents = allSessions.flatMap(({ host, session }) =>
    session.panes.filter((pane) => pane.agent).map((pane) => ({ host, session, pane }))
  )
  const activeSession = activeTab
    ? (snapshots[activeTab.host.id]?.sessions.find(
        (session) => session.id === activeTab.session.id
      ) ?? activeTab.session)
    : undefined
  const activePane =
    (demo
      ? activeSession?.panes.find((pane) => pane.id === selectedPanes[activeKey ?? ''])
      : undefined) ??
    activeSession?.panes.find((pane) => pane.active && pane.windowActive) ??
    activeSession?.panes[0]
  const windows = [...new Set(activeSession?.panes.map((pane) => pane.windowId) ?? [])]
    .map((id) => {
      const panes = activeSession!.panes.filter((pane) => pane.windowId === id)
      return {
        id,
        name: panes[0].windowName,
        index: panes[0].windowIndex,
        panes,
        selected: id === activePane?.windowId
      }
    })
    .sort((left, right) => left.index - right.index)
  const shownSessions = currentSessions.filter(
    (session) =>
      `${session.name} ${session.panes.map((pane) => `${pane.path} ${pane.command} ${pane.agent ?? ''}`).join(' ')}`
        .toLowerCase()
        .includes(filter.toLowerCase()) &&
      (!agentFilter || session.panes.some((pane) => pane.agent))
  )

  useEffect(() => {
    api?.hosts
      .list()
      .then(setRealHosts)
      .catch((error) => setNotice(errorMessage(error)))
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem('muxyard.terminalLayout', JSON.stringify(layout))
    } catch {}
  }, [layout])

  const refresh = useCallback(
    async (ids?: string[]) => {
      if (demo || !api) return
      const current = generation.current
      setScanning(true)
      await Promise.all(
        hosts
          .filter((host) =>
            ids
              ? ids.includes(host.id)
              : host.kind === 'local' || connectedHosts.current.has(host.id)
          )
          .map(async (host) => {
            const requestKey = `${current}:${host.id}`
            const existing = inFlight.current.get(requestKey)
            if (existing) return existing
            let request!: Promise<void>
            request = (async () => {
              try {
                const snapshot = await api.tmux.discover(host.id)
                if (generation.current !== current) return
                setSnapshots((value) => ({ ...value, [host.id]: snapshot }))
                connectedHosts.current.add(host.id)
                setErrors((value) => {
                  const next = { ...value }
                  delete next[host.id]
                  return next
                })
              } catch (error) {
                if (generation.current === current) {
                  connectedHosts.current.delete(host.id)
                  setErrors((value) => ({ ...value, [host.id]: errorMessage(error) }))
                }
              } finally {
                if (inFlight.current.get(requestKey) === request)
                  inFlight.current.delete(requestKey)
              }
            })()
            inFlight.current.set(requestKey, request)
            return request
          })
      )
      if (generation.current === current) setScanning(false)
    },
    [demo, hosts]
  )

  useEffect(() => {
    generation.current += 1
    if (demo) return
    let inProgress = false
    const scan = async (): Promise<void> => {
      if (inProgress) return
      inProgress = true
      try {
        await refresh()
      } finally {
        inProgress = false
      }
    }
    void scan()
    const interval = setInterval(() => void scan(), 8000)
    return () => {
      generation.current += 1
      clearInterval(interval)
    }
  }, [refresh, demo])

  useEffect(() => {
    if (!demo && hosts.some((host) => host.id === selectedHost)) void refresh([selectedHost])
  }, [selectedHost, hosts, demo, refresh])

  useEffect(() => {
    const listener = (event: KeyboardEvent): void => {
      shortcutHandler.current(event)
      if (event.defaultPrevented) return
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        setLayout((value) => ({ ...value, focus: false, sidebar: true }))
        requestAnimationFrame(() => searching.current?.focus())
      }
      if (event.key === 'Escape') {
        setModal(null)
        setNotice('')
      }
    }
    window.addEventListener('keydown', listener, true)
    return () => window.removeEventListener('keydown', listener, true)
  }, [])

  function toggleDemo(): void {
    if (!api) {
      setNotice(
        'The browser preview uses sample data. Run the desktop app to connect to real hosts.'
      )
      return
    }
    generation.current += 1
    setTabs([])
    setActiveKey(null)
    setErrors({})
    setFilter('')
    setAgentFilter(false)
    setScanning(false)
    setSelectedHost(demo ? 'local' : 'demo-local')
    setSnapshots(demo ? {} : demoSnapshots())
    setDemo(!demo)
    connectedHosts.current.clear()
    inFlight.current.clear()
  }

  function openSession(host: Host, session: TmuxSession): void {
    const key = `${host.id}:${session.id}`
    setSelectedHost(host.id)
    setTabs((value) =>
      value.some((tab) => tab.key === key)
        ? value
        : [...value, { key, host, session, status: demo ? 'Demo' : 'Connecting', attempt: 0 }]
    )
    setActiveKey(key)
  }

  function closeTab(key: string): void {
    setTabs((value) => value.filter((tab) => tab.key !== key))
    if (activeKey === key) setActiveKey(null)
  }

  async function action(
    host: Host,
    session: TmuxSession,
    pane: Pane,
    type: TmuxAction['type'],
    direction?: 'horizontal' | 'vertical'
  ): Promise<void> {
    setSelectedPanes((value) => ({ ...value, [`${host.id}:${session.id}`]: pane.id }))
    if (demo) {
      if (type === 'split')
        setNotice(
          'This is a sample workspace. In the desktop app, this splits the selected tmux pane.'
        )
      if (type === 'zoom')
        setNotice('This is a sample workspace. In the desktop app, this toggles tmux pane zoom.')
      if (['new-window', 'next-window', 'previous-window'].includes(type))
        setNotice(
          'This is a sample workspace. Attach a real session to create and navigate tmux windows.'
        )
      return
    }
    if (!api) return
    const key = `${host.id}:${session.id}`
    if (paneMode && type === 'select') {
      setPaneSelections((value) => ({
        ...value,
        [key]: { paneId: pane.id, serial: (value[key]?.serial ?? 0) + 1 }
      }))
      return
    }
    setPending(true)
    try {
      const request: TmuxAction =
        type === 'split'
          ? { type, sessionId: session.id, paneId: pane.id, direction: direction! }
          : { type, sessionId: session.id, paneId: pane.id }
      const connection = paneMode ? paneConnections.current.get(key) : undefined
      if (connection) await api.panes.action(connection, request)
      else {
        await api.tmux.action(host.id, request)
        await refresh([host.id])
      }
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  function setFocusMode(enabled: boolean): void {
    setLayout((value) => ({ ...value, focus: enabled }))
    setFocusRequest((value) => value + 1)
  }

  shortcutHandler.current = (event) => {
    if (modal || event.isComposing || event.altKey) return
    const target = event.target as HTMLElement | null
    if (target?.closest('input, textarea, [contenteditable="true"]') && !target.closest('.xterm'))
      return
    if (
      activeTab &&
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === 'f'
    ) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!event.repeat) setFocusMode(!layout.focus)
      return
    }
    if (activeTab && event.metaKey && !event.ctrlKey && event.key.toLowerCase() === 'b') {
      event.preventDefault()
      event.stopImmediatePropagation()
      const panel = event.shiftKey ? 'inspector' : 'sidebar'
      if (!event.repeat)
        setLayout((value) => ({
          ...value,
          focus: false,
          [panel]: value.focus ? true : !value[panel]
        }))
      return
    }
    let type: TmuxAction['type'] | undefined
    let direction: 'horizontal' | 'vertical' | undefined
    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 't')
      type = 'new-window'
    else if (event.ctrlKey && !event.metaKey && event.key === 'Tab')
      type = event.shiftKey ? 'previous-window' : 'next-window'
    else if (event.metaKey && !event.ctrlKey && event.key.toLowerCase() === 'd') {
      type = 'split'
      direction = event.shiftKey ? 'vertical' : 'horizontal'
    }
    if (!type) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.repeat) return
    if (!activeTab || !activeSession || !activePane) {
      setNotice('Attach a tmux session first to create windows and panes.')
      return
    }
    if (!demo && activeTab.status !== 'Attached') {
      setNotice('Wait for the session to attach, or reattach it before changing its windows.')
      return
    }
    void action(activeTab.host, activeSession, activePane, type, direction)
  }

  async function importHosts(): Promise<void> {
    if (demo || !api) {
      setNotice('Exit the demo in the desktop app to import your SSH hosts.')
      return
    }
    setModal('import')
  }

  async function removeHost(id = host.id): Promise<void> {
    if (!api || demo || id === 'local') return
    try {
      const next = await api.hosts.remove(id)
      setTabs((value) => value.filter((tab) => tab.host.id !== id))
      if (activeTab?.host.id === id) setActiveKey(null)
      setRealHosts(next)
      connectedHosts.current.delete(id)
      if (selectedHost === id) setSelectedHost('local')
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  return (
    <div
      className={`app-shell ${activeTab ? 'has-terminal' : ''} ${layout.sidebar ? 'sidebar-visible' : ''} ${layout.inspector ? 'inspector-visible' : ''} ${focusActive ? 'is-focus' : ''}`}
    >
      <aside className="sidebar">
        <div className="sidebar-title">
          <Brand />
          <span className="version-label">ALPHA</span>
        </div>
        <button
          className={`overview-nav ${!activeKey ? 'selected' : ''}`}
          onClick={() => {
            setActiveKey(null)
            setAgentFilter(false)
          }}
        >
          <LayoutDashboard size={16} /> Overview{' '}
          <span className="nav-counter">{allSessions.length}</span>
        </button>
        <div className="search-field">
          <Search size={14} />
          <input
            ref={searching}
            placeholder="Find a session…"
            aria-label="Find a session"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value)
              setActiveKey(null)
            }}
          />
          <kbd>⌘ K</kbd>
        </div>
        <div className="sidebar-section-heading">
          <span>MACHINES</span>
          <button
            className="icon-button"
            title="Add machine"
            aria-label="Add machine"
            onClick={() => setModal('host')}
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="host-list">
          {visibleHosts.map((item) => (
            <div className="host-group" key={item.id}>
              <button
                className={`host-nav ${item.id === selectedHost ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedHost(item.id)
                  setActiveKey(null)
                  setFilter('')
                }}
              >
                {item.kind === 'local' ? <Laptop size={16} /> : <Server size={16} />}
                <span>{item.name}</span>
                <i
                  className={`connection-dot ${errors[item.id] ? 'error' : snapshots[item.id] ? 'connected' : ''}`}
                />
                <ChevronDown size={12} />
              </button>
              {item.id === selectedHost && (
                <div className="session-tree">
                  {(snapshots[item.id]?.sessions ?? [])
                    .filter((session) => session.name.toLowerCase().includes(filter.toLowerCase()))
                    .map((session) => (
                      <button
                        key={session.id}
                        className={`session-nav ${activeTab?.host.id === item.id && activeTab.session.id === session.id ? 'selected' : ''}`}
                        onClick={() => openSession(item, session)}
                      >
                        <SquareTerminal size={13} />
                        <span>{session.name}</span>
                        {session.panes.some((pane) => pane.agent) && (
                          <span className="tiny-agent-dot" />
                        )}
                      </button>
                    ))}
                  {!snapshots[item.id]?.sessions.length && (
                    <span className="tree-empty">
                      {errors[item.id]
                        ? 'Connection unavailable'
                        : scanning
                          ? 'Discovering sessions…'
                          : 'No sessions yet'}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
          {otherHosts.length > 0 && (
            <details className="other-machines">
              <summary>
                Other machines <span>{otherHosts.length}</span>
              </summary>
              {otherHosts.map((item) => (
                <div className="other-machine-row" key={item.id}>
                  <button
                    className="host-nav"
                    onClick={() => {
                      setSelectedHost(item.id)
                      setActiveKey(null)
                      setFilter('')
                    }}
                  >
                    <Server size={14} />
                    <span>
                      {item.name}
                      <small>
                        {errors[item.id] ? 'Unavailable · retry on click' : 'Connect on demand'}
                      </small>
                    </span>
                    <i className={`connection-dot ${errors[item.id] ? 'error' : ''}`} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Remove ${item.name}`}
                    title="Remove saved machine"
                    onClick={() => void removeHost(item.id)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </details>
          )}
        </div>
        <button className="import-button" onClick={() => void importHosts()}>
          <ArrowDownToLine size={14} /> Import SSH config
        </button>
        <div className="sidebar-spacer" />
        <div className="local-first-note">
          <ShieldCheck size={16} />
          <div>
            Local first. Yours always.<span>SSH directly to your machines.</span>
          </div>
        </div>
        <div className="sidebar-bottom">
          <span>
            <i className="connection-dot connected" />
            {demo ? 'Sample workspace' : 'Desktop workspace'}
          </span>
          <button
            className="icon-button"
            aria-label="Help and shortcuts"
            title="Help and shortcuts"
            onClick={() => setModal('help')}
          >
            <CircleHelp size={16} />
          </button>
        </div>
      </aside>

      <main className="main-workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={12} />
            <strong>{activeTab ? activeTab.session.name : 'Overview'}</strong>
          </div>
          <div className="topbar-actions">
            <span className="privacy-label">
              <ShieldCheck size={13} /> No cloud. No account.
            </span>
            <button
              className={`subtle-button demo-toggle ${demo ? 'is-demo' : ''}`}
              onClick={toggleDemo}
            >
              {demo ? <Radio size={13} /> : <Sparkles size={13} />}
              {demo ? (api ? 'Exit demo' : 'Demo preview') : 'Explore demo'}
            </button>
            <button className="primary-button small-button" onClick={() => setModal('host')}>
              <Plus size={14} /> Add machine
            </button>
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            <span className="demo-label">DEMO</span> Sample machines and terminal output. No
            connection to your servers.
            <span className="demo-banner-right">
              Take a look around <ArrowUpRight size={12} />
            </span>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button
              className="icon-button"
              aria-label="Dismiss message"
              onClick={() => setNotice('')}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {tabs.length > 0 && (
          <nav
            className={`tabbar ${tabs.length === 1 ? 'single-session' : ''}`}
            aria-label="Attached sessions"
          >
            <button
              className={`home-tab ${!activeKey ? 'selected' : ''}`}
              aria-label="Show overview"
              onClick={() => setActiveKey(null)}
            >
              <House size={15} />
            </button>
            {tabs.map((tab) => (
              <div
                className={`session-tab ${tab.key === activeKey ? 'selected' : ''}`}
                key={tab.key}
              >
                <button
                  className="tab-select"
                  onClick={() => {
                    setActiveKey(tab.key)
                    setSelectedHost(tab.host.id)
                  }}
                >
                  <SquareTerminal size={13} />
                  <span>{tab.session.name}</span>
                  <small>{tab.host.name}</small>
                </button>
                <button
                  className="tab-close"
                  aria-label={`Detach ${tab.session.name}`}
                  title="Detach client; keep session running"
                  onClick={() => closeTab(tab.key)}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </nav>
        )}

        {!activeKey && (
          <div className="overview-scroll">
            <div className="overview-content">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span className="mini-line" /> YOUR TERMINAL, WITH ROOM TO BREATHE
                  </div>
                  <h1>
                    Pick up where you left off<span>.</span>
                  </h1>
                  <p>Same sessions. Same agents. A better place to bring them together.</p>
                </div>
                <button
                  className="subtle-button refresh-button"
                  onClick={() => void refresh([host.id])}
                  disabled={scanning || demo}
                >
                  <RefreshCw className={scanning ? 'spinning' : ''} size={14} />
                  {scanning ? 'Refreshing' : 'Refresh'}
                </button>
              </div>

              <div className="stats-row">
                <div className="stat-item">
                  <span className="stat-icon">
                    <Network size={17} />
                  </span>
                  <div>
                    <strong>{hosts.length}</strong>
                    <span>machines</span>
                  </div>
                </div>
                <div className="stat-item">
                  <span className="stat-icon">
                    <SquareTerminal size={17} />
                  </span>
                  <div>
                    <strong>{allSessions.length}</strong>
                    <span>sessions discovered</span>
                  </div>
                </div>
                <div className="stat-item">
                  <span className="stat-icon agent-stat">
                    <Sparkles size={17} />
                  </span>
                  <div>
                    <strong>{agents.length}</strong>
                    <span>agent processes detected</span>
                  </div>
                </div>
                <div className="persistence-note">
                  <span className="orbit-icon">↗</span>
                  <span>
                    You can close the app.
                    <br />
                    <strong>Your sessions stay running.</strong>
                  </span>
                </div>
              </div>

              <div className="section-heading">
                <div>
                  <h2>Sessions</h2>
                  <span className="count-badge">{currentSessions.length}</span>
                  <span className="heading-divider" />
                  <span className="host-heading">
                    {host.kind === 'local' ? <Laptop size={14} /> : <Server size={14} />}
                    {host.name}
                  </span>
                </div>
                <div>
                  <button
                    className={`filter-button ${agentFilter ? 'active' : ''}`}
                    onClick={() => setAgentFilter(!agentFilter)}
                  >
                    <Sparkles size={13} /> Agents only
                  </button>
                  {host.kind === 'ssh' && !demo && (
                    <button
                      className="icon-button"
                      title="Remove machine from Muxyard"
                      aria-label="Remove machine"
                      onClick={() => void removeHost()}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {errors[host.id] && (
                <div className="connection-error">
                  <Unplug size={19} />
                  <div>
                    <strong>Couldn’t discover sessions on {host.name}</strong>
                    <p>{errors[host.id]}</p>
                    {host.kind === 'ssh' && (
                      <p>
                        First verify <code>ssh {host.address}</code> in Terminal, add your key to
                        ssh-agent, and confirm the host key. Then refresh.
                      </p>
                    )}
                    <small>
                      {currentSnapshot
                        ? 'Showing the last successful snapshot. It may be out of date.'
                        : 'No sessions have been loaded from this machine.'}
                    </small>
                  </div>
                </div>
              )}

              <div className="session-grid">
                {shownSessions.map((session) => {
                  const sessionAgents = session.panes.filter((pane) => pane.agent)
                  const attached = tabs.some(
                    (tab) =>
                      tab.host.id === host.id &&
                      tab.session.id === session.id &&
                      tab.status === 'Attached'
                  )
                  return (
                    <button
                      className="session-card"
                      key={session.id}
                      onClick={() => openSession(host, session)}
                    >
                      <div className="card-top">
                        <span className="session-card-icon">
                          <SquareTerminal size={20} />
                        </span>
                        <span className={`session-state ${attached ? 'attached' : ''}`}>
                          <i />
                          {attached ? 'Attached here' : 'Available'}
                        </span>
                        <ArrowUpRight className="card-arrow" size={17} />
                      </div>
                      <h3>{session.name}</h3>
                      <div className="card-path">
                        <Folder size={12} />
                        <span>{session.panes[0]?.path ?? '—'}</span>
                      </div>
                      <div className="card-agents">
                        {sessionAgents.length ? (
                          <>
                            <div className="agent-icon-stack">
                              {sessionAgents.slice(0, 3).map((pane) => (
                                <AgentIcon key={pane.id} pane={pane} />
                              ))}
                            </div>
                            <span>
                              {[...new Set(sessionAgents.map((pane) => pane.agent))].join(', ')}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="plain-process">
                              <SquareTerminal size={14} />
                            </span>
                            <span>
                              {[...new Set(session.panes.map((pane) => pane.command))].join(' · ')}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="card-footer">
                        <span>
                          {session.windows} {session.windows === 1 ? 'window' : 'windows'}
                          <i />
                          {session.panes.length} {session.panes.length === 1 ? 'pane' : 'panes'}
                        </span>
                        <span className="attach-link">
                          Attach <ArrowRight size={13} />
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {!shownSessions.length && (
                <div className="empty-state">
                  <div className="empty-icon">
                    <SquareTerminal size={28} />
                  </div>
                  <h3>
                    {filter || agentFilter
                      ? 'No matching sessions'
                      : scanning && !currentSnapshot
                        ? 'Finding your sessions…'
                        : 'Your sessions belong here'}
                  </h3>
                  <p>
                    {filter || agentFilter
                      ? 'Try a different search or show all sessions.'
                      : 'Start tmux on this machine, then refresh. Muxyard finds sessions you already use.'}
                  </p>
                  {!filter && !agentFilter && <code>tmux new -s my-project</code>}
                  <div className="empty-actions">
                    <button className="subtle-button" onClick={toggleDemo}>
                      <Sparkles size={14} /> Explore the demo
                    </button>
                    <button className="subtle-button" onClick={() => setModal('host')}>
                      <Plus size={14} /> Connect a machine
                    </button>
                  </div>
                </div>
              )}

              <div className="section-heading agents-heading">
                <div>
                  <h2>In the agent yard</h2>
                  <span className="count-badge">{agents.length}</span>
                </div>
                <span className="section-caption">Found in your existing panes</span>
              </div>
              <div className="agent-list">
                {agents.length ? (
                  agents.map(({ host, session, pane }) => (
                    <button
                      className="agent-row"
                      key={`${host.id}:${pane.id}`}
                      onClick={() => {
                        openSession(host, session)
                        void action(host, session, pane, 'select')
                      }}
                    >
                      <AgentIcon pane={pane} />
                      <div className="agent-row-name">
                        <strong>{pane.agent}</strong>
                        <span>
                          {session.name} <ChevronRight size={10} /> {pane.windowName}
                        </span>
                      </div>
                      <span className="agent-machine">
                        {host.kind === 'local' ? <Laptop size={13} /> : <Server size={13} />}
                        {host.name}
                      </span>
                      <span className={`process-badge ${errors[host.id] ? 'stale' : ''}`}>
                        <i />
                        {errors[host.id]
                          ? 'Stale snapshot'
                          : pane.dead
                            ? 'Exited'
                            : 'Process detected'}
                      </span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))
                ) : (
                  <div className="agent-empty">
                    <Sparkles size={18} />
                    <span>
                      Already running Claude Code, Codex, OpenCode, Gemini, or Aider in tmux?
                      <br />
                      <strong>They appear here when tmux reports the agent process name.</strong>
                    </span>
                  </div>
                )}
              </div>
              <div className="agent-disclaimer">
                <CircleHelp size={12} />
                <span>
                  Process detection doesn’t imply an agent is working or waiting for input. Exact
                  task status needs an agent integration.
                </span>
              </div>
              <div className="overview-footer">
                <Brand small />
                <span>Keep your workflow. Lose the window hunting.</span>
                <button onClick={() => setModal('help')}>
                  A few things to know <ArrowUpRight size={12} />
                </button>
              </div>
            </div>
          </div>
        )}

        {focusActive && activeTab && activeSession && (
          <div className="focus-toolbar">
            <span
              className={`connection-dot ${activeTab.status === 'Attached' || demo ? 'connected' : 'error'}`}
            />
            <span className="focus-context">
              <strong>{activeSession.name}</strong>
              <span>/</span>
              {windows.find((item) => item.selected)?.name ?? activeTab.host.name}
            </span>
            {demo && <span className="demo-label">DEMO</span>}
            <div className="focus-actions">
              <button
                className="icon-button"
                aria-label="New tmux window"
                title="New tmux window (Ctrl+T / ⌘T)"
                disabled={pending || !activePane}
                onClick={() =>
                  activePane && void action(activeTab.host, activeSession, activePane, 'new-window')
                }
              >
                <Plus size={14} />
              </button>
              <button
                className="icon-button"
                aria-label="Split"
                title="Split side by side (⌘D)"
                disabled={pending || !activePane}
                onClick={() =>
                  activePane &&
                  void action(activeTab.host, activeSession, activePane, 'split', 'horizontal')
                }
              >
                <Columns2 size={14} />
              </button>
              <button
                className="focus-exit-button"
                aria-label="Exit focus mode"
                title="Exit focus mode (⌘⇧F / Ctrl+Shift+F)"
                onClick={() => setFocusMode(false)}
              >
                <Minimize2 size={13} /> Exit focus <kbd>⌘⇧F</kbd>
              </button>
            </div>
          </div>
        )}

        {activeTab && activeSession && (
          <div className="workspace-toolbar">
            <div>
              <button
                className="icon-button"
                aria-label={layout.sidebar ? 'Hide machines' : 'Show machines'}
                aria-expanded={layout.sidebar}
                title="Toggle machines (⌘B)"
                onClick={() => setLayout((value) => ({ ...value, sidebar: !value.sidebar }))}
              >
                <PanelLeft size={15} />
              </button>
              <button
                className="icon-button"
                aria-label="Back to overview"
                title="Back to overview"
                onClick={() => setActiveKey(null)}
              >
                <LayoutDashboard size={14} />
              </button>
              <i
                className={`connection-dot ${activeTab.status === 'Attached' || demo ? 'connected' : 'error'}`}
              />
              <strong>{activeSession.name}</strong>
              <span className="toolbar-host">{activeTab.host.name}</span>
              <span className="toolbar-status">{activeTab.status}</span>
            </div>
            <div>
              <button
                className="icon-button"
                aria-label={layout.inspector ? 'Hide pane list' : 'Show pane list'}
                aria-expanded={layout.inspector}
                title="Toggle pane list (⌘⇧B)"
                onClick={() => setLayout((value) => ({ ...value, inspector: !value.inspector }))}
              >
                <PanelRight size={15} />
              </button>
              <button
                className="subtle-button focus-mode-button"
                aria-label="Enter focus mode"
                title="Focus mode (⌘⇧F / Ctrl+Shift+F)"
                onClick={() => setFocusMode(true)}
              >
                <Maximize2 size={13} /> Focus
              </button>
              {!demo && (
                <div className="view-mode-control">
                  <button className={paneMode ? 'selected' : ''} onClick={() => setPaneMode(true)}>
                    Pane view
                  </button>
                  <button
                    className={!paneMode ? 'selected' : ''}
                    onClick={() => setPaneMode(false)}
                  >
                    Classic terminal
                  </button>
                </div>
              )}
              <button
                className="subtle-button"
                disabled={pending || !activePane}
                title="Split selected pane side by side (⌘D)"
                onClick={() =>
                  activePane &&
                  void action(activeTab.host, activeSession, activePane, 'split', 'horizontal')
                }
              >
                <Columns2 size={14} /> Split
              </button>
              <button
                className="icon-button"
                disabled={pending || !activePane}
                title="Split selected pane top and bottom (⌘⇧D)"
                aria-label="Split top and bottom"
                onClick={() =>
                  activePane &&
                  void action(activeTab.host, activeSession, activePane, 'split', 'vertical')
                }
              >
                <Rows2 size={15} />
              </button>
              <button
                className="icon-button"
                disabled={pending || !activePane}
                title="Toggle selected pane zoom"
                aria-label="Toggle pane zoom"
                onClick={() =>
                  activePane && void action(activeTab.host, activeSession, activePane, 'zoom')
                }
              >
                <Maximize2 size={15} />
              </button>
              {!['Attached', 'Connecting', 'Demo'].includes(activeTab.status) && (
                <button
                  className="subtle-button"
                  onClick={() =>
                    setTabs((value) =>
                      value.map((tab) =>
                        tab.key === activeKey
                          ? { ...tab, status: 'Connecting', attempt: tab.attempt + 1 }
                          : tab
                      )
                    )
                  }
                >
                  <RefreshCw size={13} /> Reattach
                </button>
              )}
              <button
                className="subtle-button detach-button"
                onClick={() => closeTab(activeTab.key)}
              >
                <Unplug size={14} /> Detach
              </button>
            </div>
          </div>
        )}

        {activeTab && activeSession && (
          <nav className="window-tabbar" aria-label="Tmux windows">
            <span className="window-tabbar-label">WINDOWS</span>
            <div className="window-tabs" role="tablist" aria-label="Tmux windows">
              {windows.map((item) => (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={item.selected}
                  aria-label={`Window ${item.index}: ${item.name}`}
                  className={`window-tab ${item.selected ? 'selected' : ''}`}
                  onClick={() =>
                    void action(
                      activeTab.host,
                      activeSession,
                      item.panes.find((pane) => pane.active) ?? item.panes[0],
                      'select'
                    )
                  }
                >
                  <span className="window-index">{item.index}</span>
                  <span className="window-tab-name">{item.name}</span>
                  <small>
                    {item.panes.length} {item.panes.length === 1 ? 'pane' : 'panes'}
                  </small>
                </button>
              ))}
            </div>
            <button
              className="new-window-button"
              aria-label="New tmux window"
              title="New tmux window (Ctrl+T / ⌘T)"
              disabled={pending || !activePane || (!demo && activeTab.status !== 'Attached')}
              onClick={() =>
                activePane && void action(activeTab.host, activeSession, activePane, 'new-window')
              }
            >
              <Plus size={14} /> New window <kbd>⌃T</kbd>
            </button>
          </nav>
        )}

        <div className={`terminal-workspace ${!activeKey ? 'hidden' : ''}`}>
          <div className="terminal-stack">
            {tabs.map((tab) =>
              paneMode && !demo && api ? (
                <PaneWorkspace
                  key={`${tab.key}:${tab.attempt}:panes`}
                  api={api}
                  hostId={tab.host.id}
                  session={tab.session}
                  visible={tab.key === activeKey}
                  focusRequest={focusRequest}
                  selection={paneSelections[tab.key]}
                  onConnection={(id) => {
                    if (id) paneConnections.current.set(tab.key, id)
                    else paneConnections.current.delete(tab.key)
                  }}
                  onSession={(session) =>
                    setSnapshots((value) => {
                      const snapshot = value[tab.host.id] ?? { sessions: [], checkedAt: Date.now() }
                      return {
                        ...value,
                        [tab.host.id]: {
                          checkedAt: Date.now(),
                          sessions: snapshot.sessions.some((item) => item.id === session.id)
                            ? snapshot.sessions.map((item) =>
                                item.id === session.id ? session : item
                              )
                            : [...snapshot.sessions, session]
                        }
                      }
                    })
                  }
                  onAction={(pane, type, direction) =>
                    void action(tab.host, tab.session, pane, type, direction)
                  }
                  onStatus={(status) =>
                    setTabs((value) =>
                      value.map((item) =>
                        item.key === tab.key && item.status !== status ? { ...item, status } : item
                      )
                    )
                  }
                />
              ) : (
                <TerminalView
                  key={`${tab.key}:${tab.attempt}`}
                  api={api}
                  hostId={tab.host.id}
                  sessionId={tab.session.id}
                  visible={tab.key === activeKey}
                  focusRequest={focusRequest}
                  demo={demo}
                  onStatus={(status) =>
                    setTabs((value) =>
                      value.map((item) =>
                        item.key === tab.key && item.status !== status ? { ...item, status } : item
                      )
                    )
                  }
                />
              )
            )}
          </div>
          {activeTab && activeSession && (
            <aside className="pane-inspector">
              <div className="inspector-heading">
                WINDOWS & PANES<span>{activeSession.panes.length}</span>
              </div>
              {[...new Set(activeSession.panes.map((pane) => pane.windowId))].map((windowId) => (
                <div className="window-group" key={windowId}>
                  <div className="window-group-heading">
                    <SquareTerminal size={13} />
                    <span>
                      {activeSession.panes.find((pane) => pane.windowId === windowId)?.windowName}
                    </span>
                  </div>
                  {activeSession.panes
                    .filter((pane) => pane.windowId === windowId)
                    .map((pane) => (
                      <button
                        key={pane.id}
                        disabled={pending}
                        className={`pane-button ${activePane?.id === pane.id ? 'selected' : ''}`}
                        onClick={() => void action(activeTab.host, activeSession, pane, 'select')}
                      >
                        <span className="pane-process-icon">
                          {pane.agent ? <Sparkles size={13} /> : <ChevronRight size={13} />}
                        </span>
                        <div>
                          <strong>{pane.agent ?? pane.command}</strong>
                          <span>
                            pane {pane.index} <i /> {pane.id}
                          </span>
                        </div>
                        {activePane?.id === pane.id && <span className="tiny-agent-dot" />}
                      </button>
                    ))}
                </div>
              ))}
              <div className="inspector-note">
                <ShieldCheck size={15} />
                <strong>Attached, never replaced.</strong>
                <p>Detach or close Muxyard. Your tmux session keeps running.</p>
              </div>
              <div className="shared-note">
                <CircleHelp size={13} />
                <p>Window and pane selection is shared with other clients of this tmux session.</p>
              </div>
            </aside>
          )}
        </div>
        <footer className="statusbar">
          <span>
            <i
              className={`connection-dot ${demo || (currentSnapshot && !errors[host.id]) ? 'connected' : ''}`}
            />
            {demo
              ? 'Demo workspace · sample data'
              : errors[host.id]
                ? 'Connection unavailable'
                : scanning
                  ? 'Discovering sessions'
                  : currentSnapshot
                    ? 'Connected directly'
                    : 'Ready'}
          </span>
          <span>
            {activeKey
              ? paneMode && !demo
                ? 'Ctrl+T new window · ⌘D split · Ctrl+Tab switch windows'
                : 'Shift + drag to select text when tmux mouse mode is on'
              : '⌘ K  Find a session'}
            <i />
            tmux owns your sessions <ShieldCheck size={11} />
          </span>
        </footer>
      </main>

      {modal && (
        <div
          className="modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) setModal(null)
          }}
        >
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={18} />
            </button>
            {modal === 'import' && api ? (
              <SSHImportDialog
                api={api}
                onImported={(next) => {
                  setRealHosts(next)
                  setModal(null)
                  setNotice(
                    'Selected machines added. Choose a machine to connect; other saved machines stay quiet.'
                  )
                }}
              />
            ) : modal === 'host' ? (
              <HostForm
                demo={demo}
                onSave={async (value) => {
                  if (!api || demo)
                    throw new Error('Exit the demo in the desktop app to add a real machine.')
                  const next = await api.hosts.save(value)
                  setRealHosts(next)
                  setSelectedHost(value.id)
                  setActiveKey(null)
                  setModal(null)
                }}
              />
            ) : (
              <>
                <div className="modal-symbol">
                  <CircleHelp size={24} />
                </div>
                <div className="eyebrow">GOOD TO KNOW</div>
                <h2 id="modal-title">Your workflow, still yours.</h2>
                <div className="help-content">
                  <p>
                    <strong>Connect over your existing SSH setup.</strong> Muxyard uses macOS
                    OpenSSH, your SSH config, known hosts, and ssh-agent. Verify the connection in
                    Terminal first. Password prompts and new host-key approval aren’t supported
                    inside Muxyard yet.
                  </p>
                  <p>
                    <strong>Attach, don’t migrate.</strong> Existing sessions and agents keep their
                    exact state. Detach closes only Muxyard’s client. Other attached clients stay
                    connected.
                  </p>
                  <p>
                    <strong>Mouse-friendly controls.</strong> Click a session to attach, click a
                    pane to select it, and use the toolbar to split or zoom. Pane view renders
                    separate clickable terminals without changing your tmux mouse configuration.
                    Classic terminal keeps all your tmux bindings and overlays. Pane view supports
                    Ctrl+B c, n, p, %, ", and z; use Classic terminal for other custom prefix
                    bindings.
                  </p>
                  <p>
                    <strong>Shared tmux state.</strong> Selecting a window or pane also affects
                    other clients of the same session. Named sockets can be added as separate
                    machine profiles.
                  </p>
                  <p>
                    <strong>Agent detection has limits.</strong> The list recognizes agent
                    executable names reported by tmux. A process shown as node or python may not be
                    recognized. Working, waiting, and completed states need future hooks.
                  </p>
                  <div className="shortcut-row">
                    <span>New tmux window</span>
                    <kbd>Ctrl+T / ⌘T</kbd>
                  </div>
                  <div className="shortcut-row">
                    <span>Toggle focus mode</span>
                    <kbd>⌘⇧F / Ctrl+Shift+F</kbd>
                  </div>
                  <div className="shortcut-row">
                    <span>Toggle machines / pane list</span>
                    <kbd>⌘B / ⌘⇧B</kbd>
                  </div>
                  <div className="shortcut-row">
                    <span>Next / previous window</span>
                    <kbd>Ctrl+Tab / Ctrl+Shift+Tab</kbd>
                  </div>
                  <div className="shortcut-row">
                    <span>Split side by side / top and bottom</span>
                    <kbd>⌘D / ⌘⇧D</kbd>
                  </div>
                  <div className="shortcut-row">
                    <span>Find a session</span>
                    <kbd>⌘ K</kbd>
                  </div>
                  <div className="shortcut-row">
                    <span>Find in terminal</span>
                    <kbd>⌘ F</kbd>
                  </div>
                  <div className="shortcut-row">
                    <span>Copy selected text</span>
                    <kbd>⌘ C</kbd>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function HostForm({ demo, onSave }: { demo: boolean; onSave: (host: Host) => Promise<void> }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [socket, setSocket] = useState('')
  const [kind, setKind] = useState<'ssh' | 'local'>('ssh')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        setSaving(true)
        setError('')
        void onSave({
          id: `host-${crypto.randomUUID()}`,
          name: name.trim(),
          kind,
          address: address.trim(),
          ...(socket.trim() ? { socket: socket.trim() } : {})
        })
          .catch((error) => setError(errorMessage(error)))
          .finally(() => setSaving(false))
      }}
    >
      <div className="modal-symbol">
        <Network size={24} />
      </div>
      <div className="eyebrow">BRING YOUR OWN SESSIONS</div>
      <h2 id="modal-title">Make room for a machine.</h2>
      <p className="modal-description">
        Connect directly. Your sessions and credentials stay where they belong.
      </p>
      <div className="segmented-control">
        <button
          type="button"
          className={kind === 'ssh' ? 'selected' : ''}
          onClick={() => setKind('ssh')}
        >
          <Server size={14} /> Remote SSH
        </button>
        <button
          type="button"
          className={kind === 'local' ? 'selected' : ''}
          onClick={() => setKind('local')}
        >
          <Monitor size={14} /> Local socket
        </button>
      </div>
      <label>
        Display name
        <input
          required
          autoFocus
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={kind === 'ssh' ? 'e.g. Dev server' : 'e.g. Local experiments'}
        />
      </label>
      {kind === 'ssh' && (
        <label>
          SSH alias or destination
          <input
            required
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="dev-server or user@hostname"
          />
          <span className="field-help">
            Uses ~/.ssh/config, including ports, keys, and ProxyJump.
          </span>
        </label>
      )}
      <label>
        Tmux socket name <span className="optional">optional</span>
        <input
          value={socket}
          onChange={(event) => setSocket(event.target.value)}
          placeholder="Default socket"
        />
        <span className="field-help">For sessions started with tmux -L socket-name.</span>
      </label>
      {kind === 'ssh' && (
        <div className="form-note">
          <ShieldCheck size={16} />
          <p>
            First connect with <code>ssh {address || 'your-host'}</code> in Terminal. Confirm its
            host key and enable key-based authentication.
          </p>
        </div>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {demo && (
        <div className="field-help">
          You’re exploring a demo. Exit it to connect a real machine.
        </div>
      )}
      <button type="submit" className="primary-button submit-button" disabled={saving || demo}>
        {saving ? <RefreshCw size={15} className="spinning" /> : <Plus size={15} />}
        {saving ? 'Saving…' : 'Add machine'}
      </button>
    </form>
  )
}
