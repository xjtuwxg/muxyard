import { useEffect, useRef, useState } from 'react'
import { Check, CircleAlert, Network, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import type { DesktopAPI, Host, HostProbe, SSHCandidate } from '../../shared/types'

export default function SSHImportDialog({
  api,
  onImported
}: {
  api: DesktopAPI
  onImported: (hosts: Host[]) => void
}) {
  const [candidates, setCandidates] = useState<SSHCandidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<Record<string, HostProbe>>({})
  const [checking, setChecking] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    api.hosts
      .candidates()
      .then((value) => {
        if (mounted.current) setCandidates(value)
      })
      .catch((error) => {
        if (mounted.current) setError(String(error))
      })
      .finally(() => {
        if (mounted.current) setLoading(false)
      })
    return () => {
      mounted.current = false
    }
  }, [api])
  async function check(address: string): Promise<HostProbe> {
    setChecking((value) => new Set(value).add(address))
    const result = await api.hosts
      .probe(address)
      .catch((error) => ({ reachable: false, sessions: 0, error: String(error) }))
    if (mounted.current) {
      setResults((value) => ({ ...value, [address]: result }))
      setChecking((value) => {
        const next = new Set(value)
        next.delete(address)
        return next
      })
    }
    return result
  }
  async function checkAll(): Promise<void> {
    const remaining = candidates.filter(
      (candidate) =>
        !candidate.added && candidate.address.toLowerCase().includes(filter.toLowerCase())
    )
    // Bound parallel SSH attempts so a large config cannot flood the machine.
    await Promise.all(
      Array.from({ length: Math.min(3, remaining.length) }, async () => {
        while (remaining.length && mounted.current) {
          const candidate = remaining.shift()!
          const result = await check(candidate.address)
          if (mounted.current)
            setSelected((value) => {
              const next = new Set(value)
              if (result.reachable) next.add(candidate.address)
              else next.delete(candidate.address)
              return next
            })
        }
      })
    )
  }
  return (
    <div className="ssh-import-dialog">
      <div className="modal-symbol">
        <Network size={24} />
      </div>
      <div className="eyebrow">CHOOSE WHAT BELONGS HERE</div>
      <h2 id="modal-title">Bring in your SSH machines.</h2>
      <p className="modal-description">
        Select the machines you actually use. Reading your config does not connect to or import
        anything.
      </p>
      <div className="ssh-import-tools">
        <div className="search-field">
          <Search size={14} />
          <input
            aria-label="Filter SSH hosts"
            placeholder="Filter aliases…"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <button
          className="subtle-button"
          disabled={loading || checking.size > 0 || saving}
          onClick={() => void checkAll()}
        >
          <RefreshCw size={13} className={checking.size ? 'spinning' : ''} /> Check & select
          reachable
        </button>
      </div>
      <div className="ssh-candidate-list">
        {candidates
          .filter((candidate) => candidate.address.toLowerCase().includes(filter.toLowerCase()))
          .map((candidate) => {
            const result = results[candidate.address]
            const busy = checking.has(candidate.address)
            return (
              <div
                className={`ssh-candidate ${result && !result.reachable ? 'unavailable' : ''}`}
                key={candidate.address}
              >
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Import ${candidate.address}`}
                    checked={candidate.added || selected.has(candidate.address)}
                    disabled={candidate.added || saving || checking.size > 0}
                    onChange={(event) => {
                      const checked = event.target.checked
                      setSelected((value) => {
                        const next = new Set(value)
                        if (checked) next.add(candidate.address)
                        else next.delete(candidate.address)
                        return next
                      })
                    }}
                  />
                  <span>
                    <strong>{candidate.address}</strong>
                    <small title={result?.error}>
                      {candidate.added
                        ? 'Already in your workspace'
                        : busy
                          ? 'Checking connection…'
                          : result
                            ? result.reachable
                              ? `Connected · ${result.sessions} tmux sessions`
                              : result.error || 'Unavailable'
                            : 'Not checked · no connection attempted'}
                    </small>
                  </span>
                </label>
                {!candidate.added && (
                  <button
                    className="icon-button"
                    aria-label={`Check ${candidate.address}`}
                    disabled={checking.size > 0 || saving}
                    onClick={() => void check(candidate.address)}
                  >
                    {busy ? (
                      <RefreshCw size={15} className="spinning" />
                    ) : result?.reachable ? (
                      <Check size={15} />
                    ) : result ? (
                      <CircleAlert size={15} />
                    ) : (
                      <Network size={15} />
                    )}
                  </button>
                )}
              </div>
            )
          })}
        {loading && <div className="candidate-empty">Reading ~/.ssh/config…</div>}
        {!loading && !candidates.length && (
          <div className="candidate-empty">
            No literal Host aliases found in ~/.ssh/config. You can add aliases from Include files
            manually.
          </div>
        )}
      </div>
      <div className="form-note">
        <ShieldCheck size={16} />
        <p>
          Connection checks use your existing SSH keys and known hosts. Unavailable machines are
          left unselected. You can still choose an offline machine manually.
        </p>
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <button
        className="primary-button submit-button"
        disabled={!selected.size || checking.size > 0 || saving}
        onClick={() => {
          setSaving(true)
          setError('')
          void api.hosts
            .importSSH([...selected])
            .then(onImported)
            .catch((error) => setError(String(error)))
            .finally(() => {
              if (mounted.current) setSaving(false)
            })
        }}
      >
        {saving
          ? 'Adding machines…'
          : `Add ${selected.size} selected ${selected.size === 1 ? 'machine' : 'machines'}`}
      </button>
    </div>
  )
}
