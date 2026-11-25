import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { SearchAddon } from '@xterm/addon-search'
import { Copy, Maximize2, Search, X } from 'lucide-react'
import type { DesktopAPI, Pane, PaneEvent, TmuxSession } from '../../shared/types'
import '@xterm/xterm/css/xterm.css'

interface Props {
  api: DesktopAPI
  hostId: string
  session: TmuxSession
  visible: boolean
  selection?: { paneId: string; serial: number }
  onStatus: (status: string) => void
  onSession: (session: TmuxSession) => void
  onConnection: (id?: string) => void
  onAction: (pane: Pane, type: 'split' | 'zoom', direction?: 'horizontal' | 'vertical') => void
}

export default function PaneWorkspace(props: Props) {
  const callbacks = useRef(props)
  callbacks.current = props
  const [id] = useState(() => crypto.randomUUID())
  const [session, setSession] = useState(props.session)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [focused, setFocused] = useState<string>()
  const desiredPane = useRef<string | undefined>(undefined)
  const listeners = useRef(new Map<string, (event: PaneEvent) => void>())
  const container = useRef<HTMLDivElement>(null)
  const lastSize = useRef('')
  const windowId =
    session.panes.find((pane) => pane.windowActive)?.windowId ?? session.panes[0]?.windowId
  const panes = session.panes.filter((pane) => pane.windowId === windowId)
  const activeId = focused ?? panes.find((pane) => pane.active)?.id
  const width = Math.max(1, ...panes.map((pane) => (pane.left ?? 0) + (pane.width ?? 80)))
  const height = Math.max(1, ...panes.map((pane) => (pane.top ?? 0) + (pane.height ?? 24)))
  const zoomed = panes.some((pane) => pane.zoomed)

  useEffect(() => {
    let cancelled = false
    callbacks.current.onStatus('Connecting')
    const unsubscribe = props.api.panes.subscribe((event) => {
      if (event.id !== id) return
      if (event.session) {
        let next = event.session
        const desired = next.panes.find((pane) => pane.id === desiredPane.current)
        if (desired && !(desired.active && desired.windowActive)) {
          next = {
            ...next,
            panes: next.panes.map((pane) => ({
              ...pane,
              active: pane.windowId === desired.windowId ? pane.id === desired.id : pane.active,
              windowActive: pane.windowId === desired.windowId
            }))
          }
        } else {
          desiredPane.current = undefined
          setFocused(undefined)
        }
        setSession(next)
        callbacks.current.onSession(next)
      }
      if (event.paneId && event.data) {
        const listener = listeners.current.get(event.paneId)
        if (listener) listener(event)
        else props.api.panes.acknowledge(id, atob(event.data).length)
      }
      if (event.closed) {
        setReady(false)
        callbacks.current.onStatus('Disconnected')
        setError(event.error || 'This pane client disconnected. Use Reattach to continue.')
      }
    })
    props.api.panes
      .open({ id, hostId: props.hostId, sessionId: props.session.id })
      .then(() => {
        if (cancelled) {
          void props.api.panes.close(id)
          return
        }
        setReady(true)
        callbacks.current.onConnection(id)
        callbacks.current.onStatus('Attached')
      })
      .catch((error) => {
        if (!cancelled) {
          setError(String(error))
          callbacks.current.onStatus('Connection failed')
        }
      })
    return () => {
      cancelled = true
      callbacks.current.onConnection()
      unsubscribe()
      void props.api.panes.close(id)
    }
  }, [id, props.api, props.hostId, props.session.id])

  useEffect(() => {
    if (!ready || !props.selection) return
    const paneId = props.selection.paneId
    desiredPane.current = paneId
    setFocused(paneId)
    void props.api.panes.select(id, paneId).catch((error) => setError(String(error)))
  }, [props.selection, ready, id, props.api])

  useEffect(() => {
    if (!ready || !props.visible || !container.current) return
    let timer: ReturnType<typeof setTimeout>
    const resize = (): void => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (!container.current?.clientWidth || !container.current.clientHeight) return
        const verticalBands = new Set(panes.map((pane) => pane.top ?? 0)).size || 1
        const cols = Math.min(
          1000,
          Math.max(10, Math.floor((container.current.clientWidth - 20) / 7.83))
        )
        const rows = Math.min(
          1000,
          Math.max(5, Math.floor((container.current.clientHeight - 40 * verticalBands) / 19.5))
        )
        const size = `${cols},${rows}`
        if (lastSize.current === size) return
        lastSize.current = size
        void props.api.panes.resize(id, cols, rows).catch((error) => setError(String(error)))
      }, 100)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(container.current)
    resize()
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [ready, props.visible, props.api, id, panes.map((pane) => pane.top).join(',')])

  function select(pane: Pane): void {
    if (pane.id === desiredPane.current || (pane.id === activeId && pane.windowActive)) return
    desiredPane.current = pane.id
    setFocused(pane.id)
    // Input is always routed by pane ID, so typing need not wait for this round trip.
    const nextSession = {
      ...session,
      panes: session.panes.map((item) => ({
        ...item,
        active: item.windowId === pane.windowId ? item.id === pane.id : item.active,
        windowActive: item.windowId === pane.windowId
      }))
    }
    setSession(nextSession)
    callbacks.current.onSession(nextSession)
    void props.api.panes.select(id, pane.id).catch((error) => setError(String(error)))
  }

  return (
    <div className="pane-workspace" style={{ display: props.visible ? 'flex' : 'none' }}>
      <div className="pane-workspace-caption">
        <span>LIVE PANES</span>
        <span>
          Click a pane to focus · Ctrl+B % to split · Classic terminal for custom bindings
        </span>
      </div>
      {error && (
        <div className="pane-connection-error" role="status">
          <span>{error}</span>
          <button
            className="icon-button"
            aria-label="Dismiss pane message"
            onClick={() => setError('')}
          >
            <X size={13} />
          </button>
        </div>
      )}
      <div ref={container} className="pane-layout">
        {!ready && !error && <div className="pane-loading">Attaching to your existing panes…</div>}
        {ready &&
          session.panes.map((pane) => {
            const shown = pane.windowId === windowId && (!zoomed || pane.active)
            return (
              <div
                className={`gui-pane ${activeId === pane.id ? 'focused' : ''}`}
                data-pane-id={pane.id}
                key={pane.id}
                style={{
                  display: shown ? 'flex' : 'none',
                  left: zoomed ? 0 : `${((pane.left ?? 0) / width) * 100}%`,
                  top: zoomed ? 0 : `${((pane.top ?? 0) / height) * 100}%`,
                  width: zoomed ? '100%' : `${((pane.width ?? 80) / width) * 100}%`,
                  height: zoomed ? '100%' : `${((pane.height ?? 24) / height) * 100}%`
                }}
                onMouseDownCapture={() => select(pane)}
                onFocusCapture={() => select(pane)}
              >
                <PaneSurface
                  api={props.api}
                  connectionId={id}
                  pane={pane}
                  active={activeId === pane.id && shown && props.visible}
                  register={(listener) => {
                    listeners.current.set(pane.id, listener)
                    return () => {
                      listeners.current.delete(pane.id)
                    }
                  }}
                  onAction={(type, direction) => callbacks.current.onAction(pane, type, direction)}
                  onError={setError}
                />
              </div>
            )
          })}
      </div>
    </div>
  )
}

function PaneSurface({
  api,
  connectionId,
  pane,
  active,
  register,
  onAction,
  onError
}: {
  api: DesktopAPI
  connectionId: string
  pane: Pane
  active: boolean
  register: (listener: (event: PaneEvent) => void) => () => void
  onAction: (type: 'split' | 'zoom', direction?: 'horizontal' | 'vertical') => void
  onError: (message: string) => void
}) {
  const element = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const instance = useRef<{ terminal: Terminal; search: SearchAddon } | undefined>(undefined)
  const handlers = useRef({ onAction, onError, pane })
  handlers.current = { onAction, onError, pane }
  const registerRef = useRef(register)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [copyMessage, setCopyMessage] = useState('')

  useEffect(() => {
    if (!element.current) return
    const terminal = new Terminal({
      cols: pane.width || 80,
      rows: pane.height || 24,
      fontFamily: '"SFMono-Regular", Menlo, Monaco, monospace',
      fontSize: 13,
      lineHeight: 1.5,
      scrollback: 10000,
      cursorBlink: true,
      cursorStyle: 'bar',
      theme: {
        background: '#111416',
        foreground: '#d2d6d3',
        cursor: '#a8cbb4',
        selectionBackground: '#526a5d88'
      }
    })
    const search = new SearchAddon()
    terminal.loadAddon(search)
    // Tmux already answers device queries on the server. Forwarding xterm's
    // answers as keystrokes would inject duplicate replies into the program.
    const queryHandlers = [
      ...[undefined, '?'].map((prefix) =>
        terminal.parser.registerCsiHandler(
          { ...(prefix ? { prefix } : {}), final: 'n' },
          () => true
        )
      ),
      ...[undefined, '>', '='].map((prefix) =>
        terminal.parser.registerCsiHandler(
          { ...(prefix ? { prefix } : {}), final: 'c' },
          () => true
        )
      ),
      terminal.parser.registerCsiHandler(
        { prefix: '?', intermediates: '$', final: 'p' },
        () => true
      ),
      terminal.parser.registerCsiHandler({ prefix: '>', final: 'q' }, () => true),
      terminal.parser.registerCsiHandler({ final: 't' }, () => true),
      ...[4, 10, 11, 12].map((code) =>
        terminal.parser.registerOscHandler(code, (data) => data.includes('?'))
      ),
      terminal.parser.registerDcsHandler({ intermediates: '$', final: 'q' }, () => true),
      terminal.parser.registerDcsHandler({ intermediates: '+', final: 'q' }, () => true)
    ]
    terminal.open(element.current)
    instance.current = { terminal, search }
    let prefix = false
    let cancelled = false
    let unacknowledged = 0
    const input = terminal.onData((data) => {
      if (data === '\x02') {
        if (!prefix) {
          prefix = true
          return
        }
        prefix = false
      } else if (prefix || data.startsWith('\x02')) {
        const key = prefix ? data : data.slice(1)
        prefix = false
        if (key === '%') handlers.current.onAction('split', 'horizontal')
        else if (key === '"') handlers.current.onAction('split', 'vertical')
        else if (key === 'z') handlers.current.onAction('zoom')
        else
          handlers.current.onError(
            'This tmux prefix binding is available in Classic terminal. Pane view supports Ctrl+B %, ", and z.'
          )
        return
      }
      void api.panes
        .input(connectionId, pane.id, data)
        .catch((error) => handlers.current.onError(String(error)))
    })
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown' && event.metaKey && event.key === 'f') {
        setSearching(true)
        return false
      }
      if (
        event.type === 'keydown' &&
        event.metaKey &&
        event.key === 'c' &&
        terminal.hasSelection()
      ) {
        void navigator.clipboard.writeText(terminal.getSelection())
        return false
      }
      return true
    })
    const unregister = registerRef.current((event) => {
      if (!event.data) return
      const bytes = Uint8Array.from(atob(event.data), (character) => character.charCodeAt(0))
      unacknowledged += bytes.length
      if (event.reset) {
        terminal.reset()
        if (event.cols && event.rows) terminal.resize(event.cols, event.rows)
      }
      terminal.write(bytes, () => {
        if (!cancelled) {
          unacknowledged -= bytes.length
          api.panes.acknowledge(connectionId, bytes.length)
        }
      })
    })
    return () => {
      cancelled = true
      if (unacknowledged) api.panes.acknowledge(connectionId, unacknowledged)
      unregister()
      for (const handler of queryHandlers) handler.dispose()
      input.dispose()
      terminal.dispose()
      instance.current = undefined
    }
  }, [api, connectionId, pane.id])

  useEffect(() => {
    const terminal = instance.current?.terminal
    if (!terminal) return
    terminal.resize(Math.max(2, pane.width || 80), Math.max(2, pane.height || 24))
    void api.panes
      .capture(connectionId, pane.id)
      .catch((error) => handlers.current.onError(String(error)))
  }, [api, connectionId, pane.id, pane.width, pane.height])

  useEffect(() => {
    if (!viewport.current || !element.current) return
    const fit = (): void => {
      const screen = element.current?.querySelector<HTMLElement>('.xterm-screen')
      if (!screen || !viewport.current || !element.current || !viewport.current.clientWidth) return
      const scale = Math.min(
        1,
        viewport.current.clientWidth / Math.max(1, screen.offsetWidth),
        viewport.current.clientHeight / Math.max(1, screen.offsetHeight)
      )
      element.current.style.transform = `scale(${scale})`
    }
    const observer = new ResizeObserver(fit)
    observer.observe(viewport.current)
    requestAnimationFrame(fit)
    return () => observer.disconnect()
  }, [pane.width, pane.height])

  useEffect(() => {
    if (active) instance.current?.terminal.focus()
  }, [active])

  return (
    <>
      <div
        className="gui-pane-header"
        onMouseDown={(event) => {
          if (!(event.target as HTMLElement).closest('button')) {
            event.preventDefault()
            instance.current?.terminal.focus()
          }
        }}
      >
        <span className="pane-focus-dot" />
        <strong>{pane.agent ?? pane.command}</strong>
        <span>{pane.id}</span>
        <span className="pane-header-spacer" />
        <small>{copyMessage}</small>
        <button
          className="icon-button"
          aria-label={`Find in pane ${pane.id}`}
          title="Find in this pane (⌘F)"
          onClick={() => setSearching(!searching)}
        >
          <Search size={12} />
        </button>
        <button
          className="icon-button"
          aria-label={`Copy from pane ${pane.id}`}
          title="Copy selected text"
          onClick={() => {
            const text = instance.current?.terminal.getSelection()
            if (text) void navigator.clipboard.writeText(text).then(() => setCopyMessage('Copied'))
            else setCopyMessage('Select text first')
            setTimeout(() => setCopyMessage(''), 1800)
          }}
        >
          <Copy size={12} />
        </button>
        <button
          className="icon-button"
          aria-label={`Zoom pane ${pane.id}`}
          onClick={() => onAction('zoom')}
        >
          <Maximize2 size={12} />
        </button>
      </div>
      {searching && (
        <div className="terminal-search">
          <Search size={13} />
          <input
            autoFocus
            placeholder="Find in this pane…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              instance.current?.search.findNext(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') instance.current?.search.findNext(query)
              if (event.key === 'Escape') {
                setSearching(false)
                instance.current?.terminal.focus()
              }
            }}
          />
          <button
            className="icon-button"
            aria-label="Close pane search"
            onClick={() => setSearching(false)}
          >
            <X size={13} />
          </button>
        </div>
      )}
      <div className="pane-screen-viewport" ref={viewport}>
        <div ref={element} className="pane-xterm" />
      </div>
    </>
  )
}
