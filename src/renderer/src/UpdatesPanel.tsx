import { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowUpRight, RefreshCw, X } from 'lucide-react'
import type { UpdateState } from '../../shared/types'

const api = window.muxyard?.updates
export function useUpdates(open: () => void) {
  const [state, setState] = useState<UpdateState>()
  const opener = useRef(open)
  opener.current = open
  useEffect(() => {
    if (!api) return
    let live = true,
      received = false
    const unsubscribe = api.subscribe((next) => {
      received = true
      setState(next)
    })
    const close = api.onOpen(() => opener.current())
    void api
      .get()
      .then((initial) => {
        if (live && !received) setState(initial)
      })
      .catch(() => {})
    return () => {
      live = false
      unsubscribe()
      close()
    }
  }, [])
  return state
}

export function UpdatesButton({ state, onOpen }: { state?: UpdateState; onOpen: () => void }) {
  if (!api) return null
  return (
    <button
      className="icon-button updates-button"
      aria-label="Software updates"
      title="Software updates"
      onClick={onOpen}
    >
      <ArrowDownToLine size={15} />
      {state?.release && <i className="update-dot" />}
    </button>
  )
}

export function UpdateNotice({ state, onOpen }: { state?: UpdateState; onOpen: () => void }) {
  if (
    !state?.release ||
    !['available', 'ready'].includes(state.status) ||
    state.dismissedVersion === state.release.version
  )
    return null
  return (
    <aside className="update-notice" aria-label="Update available">
      <button onClick={onOpen}>
        <ArrowDownToLine size={16} />
        <span>
          <strong>{state.status === 'ready' ? 'Ready to install' : 'A new Muxyard is here'}</strong>
          <small>
            Version {state.release.version} ·{' '}
            {state.status === 'ready' ? 'Restart when you’re ready' : 'See what’s new'}
          </small>
        </span>
      </button>
      <button
        className="icon-button"
        aria-label="Dismiss update reminder"
        onClick={() => {
          void api?.dismiss().catch(() => {})
        }}
      >
        <X size={14} />
      </button>
    </aside>
  )
}

export default function UpdatesPanel({ state }: { state?: UpdateState }) {
  const [error, setError] = useState('')
  const panel = useRef<HTMLDivElement>(null)
  const run = (action: () => Promise<unknown>): void => {
    setError('')
    void action().catch((reason) =>
      setError(
        String(reason)
          .replace(/^Error:.*?Error: /, '')
          .replace(/^Error: /, '')
      )
    )
  }
  useEffect(() => {
    const dialog = panel.current?.closest('[role="dialog"]')
    if (!(dialog instanceof HTMLElement)) return
    dialog.querySelector<HTMLElement>('.updates-check')?.focus()
    const trap = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return
      const targets = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), summary'
        )
      ]
      const first = targets[0],
        last = targets.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    dialog.addEventListener('keydown', trap)
    return () => dialog.removeEventListener('keydown', trap)
  }, [])
  if (!api) return null
  const busy = !state || ['checking', 'downloading', 'ready'].includes(state.status)
  const title =
    state?.status === 'ready'
      ? 'Ready when you are.'
      : state?.release
        ? 'A little newer. A little better.'
        : 'Keep your yard up to date.'
  return (
    <div ref={panel} className="updates-panel">
      <div className="eyebrow">SOFTWARE UPDATES</div>
      <h2 id="modal-title">{title}</h2>
      <p className="modal-description">
        Muxyard {state?.currentVersion ?? '…'}
        {state?.release ? ` → ${state.release.version}` : ''}
      </p>
      <div className="update-status" role="status">
        {state?.status === 'checking'
          ? 'Checking GitHub Releases…'
          : state?.status === 'current'
            ? 'You’re running the latest version in this channel.'
            : state?.status === 'downloading'
              ? `Downloading update… ${Math.floor(state.progress ?? 0)}%`
              : state?.status === 'ready'
                ? 'Your update is downloaded. Restart to finish installing.'
                : state?.release
                  ? `Version ${state.release.version} is available.`
                  : 'Check for the latest release whenever you like.'}
      </div>
      {state?.status === 'downloading' && (
        <progress aria-label="Update download progress" max={100} value={state.progress ?? 0} />
      )}
      {(error || state?.error) && (
        <p className="update-error" role="alert">
          {error || state?.error}
        </p>
      )}
      <p className="update-explanation">{state?.installation.reason}</p>
      <div className="update-actions">
        {state?.status === 'ready' ? (
          <button className="primary-button" onClick={() => run(() => api.install())}>
            Restart and install
          </button>
        ) : state?.release && state.installation.supported ? (
          <button
            className="primary-button"
            disabled={state.status !== 'available'}
            onClick={() => run(() => api.download())}
          >
            <ArrowDownToLine size={14} /> Download update
          </button>
        ) : null}
        <button
          className="subtle-button updates-check"
          disabled={busy}
          onClick={() => run(() => api.check())}
        >
          <RefreshCw size={14} /> Check for updates
        </button>
        <button className="subtle-button" onClick={() => run(() => api.openRelease())}>
          View downloads <ArrowUpRight size={14} />
        </button>
      </div>
      <fieldset className="update-preferences" disabled={busy}>
        <legend>Update preferences</legend>
        {(
          [
            ['automaticChecks', 'Check automatically on startup and every six hours'],
            ['automaticDownload', 'Download updates automatically when supported'],
            ['includePrereleases', 'Include preview releases']
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={state?.preferences[key] ?? false}
              onChange={(event) => run(() => api.configure({ [key]: event.target.checked }))}
            />{' '}
            {label}
          </label>
        ))}
      </fieldset>
      <p className="update-footnote">
        Updates apply after restarting Muxyard. Reattach to your tmux sessions afterward; Muxyard
        closes its clients without terminating the sessions. Session lifetime still follows your
        server’s tmux configuration.
      </p>
      {state?.checkedAt && (
        <p className="update-footnote">Last checked {new Date(state.checkedAt).toLocaleString()}</p>
      )}
      {state?.release?.notes && (
        <details className="update-notes">
          <summary>Release notes</summary>
          <pre>{state.release.notes}</pre>
        </details>
      )}
    </div>
  )
}
