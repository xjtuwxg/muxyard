import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { Copy, Search, X, ArrowDown, ArrowUp } from 'lucide-react'
import type { DesktopAPI } from '../../shared/types'
import { demoOutput } from './demo'
import '@xterm/xterm/css/xterm.css'

interface Props {
  api?: DesktopAPI
  hostId: string
  sessionId: string
  visible: boolean
  demo: boolean
  onStatus: (status: string) => void
}

export default function TerminalView({ api, hostId, sessionId, visible, demo, onStatus }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const instance = useRef<{ terminal: Terminal; fit: FitAddon; search: SearchAddon } | null>(null)
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const status = useRef(onStatus)
  status.current = onStatus

  useEffect(() => {
    if (!container.current) return
    const terminal = new Terminal({
      fontFamily: '"SFMono-Regular", Menlo, Monaco, monospace',
      fontSize: 13,
      lineHeight: 1.5,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      allowProposedApi: false,
      theme: {
        background: '#111416',
        foreground: '#d2d6d3',
        cursor: '#a8cbb4',
        selectionBackground: '#526a5d88',
        black: '#24292b',
        red: '#de9090',
        green: '#a8cbb4',
        yellow: '#d7c08c',
        blue: '#96b8d5',
        magenta: '#b6a3cd',
        cyan: '#99c8c8',
        white: '#d2d6d3',
        brightBlack: '#77807f'
      }
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    terminal.loadAddon(fit)
    terminal.loadAddon(search)
    terminal.open(container.current)
    fit.fit()
    instance.current = { terminal, fit, search }
    let cancelled = false
    const id = crypto.randomUUID()
    let opened = false
    let unsubscribe = (): void => {}
    const input = terminal.onData((data) => {
      if (opened) api?.terminal.write(id, data)
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
    if (demo) {
      terminal.write(demoOutput)
      status.current('Demo')
    } else if (api) {
      status.current('Connecting')
      unsubscribe = api.terminal.subscribe((event) => {
        if (event.id !== id) return
        if (event.data !== undefined)
          terminal.write(event.data, () => {
            if (!cancelled) api.terminal.acknowledge(id, event.data!.length)
          })
        if (event.exitCode !== undefined) {
          opened = false
          status.current('Disconnected')
          terminal.write(
            `\r\n\x1b[2m[Client disconnected · exit ${event.exitCode}. Reattach to continue.]\x1b[0m\r\n`
          )
        }
      })
      api.terminal
        .open({ id, hostId, sessionId, cols: terminal.cols, rows: terminal.rows })
        .then(() => {
          if (cancelled) {
            void api.terminal.close(id)
            return
          }
          opened = true
          fit.fit()
          api.terminal.resize(id, terminal.cols, terminal.rows)
          status.current('Attached')
        })
        .catch((error) => {
          if (!cancelled) {
            status.current('Connection failed')
            terminal.write(`\r\n\x1b[31m${String(error).replaceAll('\x1b', '')}\x1b[0m\r\n`)
          }
        })
    }
    const observer = new ResizeObserver(() => {
      if (!container.current?.clientWidth || !container.current?.clientHeight) return
      fit.fit()
      if (opened) api?.terminal.resize(id, terminal.cols, terminal.rows)
    })
    observer.observe(container.current)
    return () => {
      cancelled = true
      unsubscribe()
      observer.disconnect()
      input.dispose()
      if (!demo) void api?.terminal.close(id)
      terminal.dispose()
      instance.current = null
    }
  }, [api, hostId, sessionId, demo])

  useEffect(() => {
    if (visible)
      requestAnimationFrame(() => {
        instance.current?.fit.fit()
        instance.current?.terminal.focus()
      })
  }, [visible])

  async function copy(): Promise<void> {
    const text = instance.current?.terminal.getSelection()
    if (text) {
      await navigator.clipboard.writeText(text)
      setMessage('Copied')
    } else setMessage('Select terminal text first')
    setTimeout(() => setMessage(''), 2200)
  }

  return (
    <div className="terminal-view" style={{ display: visible ? 'flex' : 'none' }}>
      <div className="terminal-utility">
        <span>{demo ? 'SAMPLE TERMINAL' : 'LIVE TERMINAL'}</span>
        <div className="utility-actions">
          <span className="copy-message" role="status">
            {message}
          </span>
          <button
            className="icon-button"
            title="Find in terminal (⌘F)"
            aria-label="Find in terminal"
            onClick={() => setSearching(!searching)}
          >
            <Search size={14} />
          </button>
          <button
            className="icon-button"
            title="Copy selected text (⌘C)"
            aria-label="Copy selected text"
            onClick={() => void copy()}
          >
            <Copy size={14} />
          </button>
        </div>
      </div>
      {searching && (
        <div className="terminal-search">
          <Search size={14} />
          <input
            autoFocus
            placeholder="Find in terminal…"
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
            aria-label="Previous match"
            onClick={() => instance.current?.search.findPrevious(query)}
          >
            <ArrowUp size={14} />
          </button>
          <button
            className="icon-button"
            aria-label="Next match"
            onClick={() => instance.current?.search.findNext(query)}
          >
            <ArrowDown size={14} />
          </button>
          <button
            className="icon-button"
            aria-label="Close search"
            onClick={() => setSearching(false)}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div ref={container} className="terminal-container" />
    </div>
  )
}
