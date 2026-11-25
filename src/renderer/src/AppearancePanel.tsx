import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Check, Monitor, Moon, Palette, RotateCcw, Sun } from 'lucide-react'
import { palettes, resolveTheme, type ThemeOverrides } from './themes'
import { useTheme } from './ThemeProvider'

function ColorField({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <label className="appearance-color-field">
      <span>{label}</span>
      <div className="color-input-pair">
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          aria-label={`${label} hex`}
          value={draft}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => {
            setDraft(event.target.value)
            if (/^#[a-f0-9]{6}$/i.test(event.target.value))
              onChange(event.target.value.toLowerCase())
          }}
          onBlur={() => setDraft(value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              setDraft(value)
            }
          }}
        />
      </div>
    </label>
  )
}
export default function AppearancePanel() {
  const { appearance, theme, choose, customize, reset } = useTheme()
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const dialog = panel.current?.closest('[role="dialog"]')
    const previous = document.activeElement
    if (!(dialog instanceof HTMLElement)) return
    dialog.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const targets = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]):not([tabindex="-1"]), input:not([disabled])'
        )
      ]
      const first = targets[0],
        last = targets.at(-1)
      if (
        (event.shiftKey && document.activeElement === first) ||
        (!event.shiftKey && document.activeElement === last)
      ) {
        event.preventDefault()
        ;(event.shiftKey ? last : first)?.focus()
      }
    }
    dialog.addEventListener('keydown', trap)
    return () => {
      dialog.removeEventListener('keydown', trap)
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])
  const custom = appearance.overrides[theme.id] ?? {}
  const change = (key: keyof ThemeOverrides, value: string) =>
    customize({ ...custom, [key]: value })
  return (
    <div className="appearance-panel" ref={panel}>
      <div className="eyebrow">
        <Palette size={13} /> MAKE YOURSELF AT HOME
      </div>
      <h2 id="modal-title">A workspace in your colors.</h2>
      <p className="modal-description">
        Choose a palette, then make it yours. Your terminals stay connected.
      </p>
      <div className="appearance-system">
        <Monitor size={18} />
        <div>
          <strong>Follow system appearance</strong>
          <span>Daylight in light mode, Graphite in dark mode.</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="Follow system appearance"
          aria-checked={appearance.theme === 'system'}
          className={`appearance-switch ${appearance.theme === 'system' ? 'checked' : ''}`}
          onClick={() => choose(appearance.theme === 'system' ? theme.id : 'system')}
        >
          <span />
        </button>
      </div>
      <div
        className="theme-grid"
        role="radiogroup"
        aria-label="Color theme"
        onKeyDown={(event) => {
          if (
            !['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)
          )
            return
          event.preventDefault()
          const current = palettes.findIndex((p) => p.id === theme.id)
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? palettes.length - 1
                : (current +
                    (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) +
                    palettes.length) %
                  palettes.length
          choose(palettes[next].id)
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
        }}
      >
        {palettes.map((palette) => {
          const preview = resolveTheme({ ...appearance, theme: palette.id }, false)
          const selected = theme.id === palette.id
          return (
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              aria-label={palette.name}
              key={palette.id}
              className={`theme-card ${selected ? 'selected' : ''}`}
              onClick={() => choose(palette.id)}
              style={
                {
                  '--preview-bg': preview.tokens.bg,
                  '--preview-surface': preview.tokens.surface,
                  '--preview-sidebar': preview.tokens.sidebar,
                  '--preview-text': preview.tokens.text,
                  '--preview-muted': preview.tokens.muted,
                  '--preview-accent': preview.tokens.accent,
                  '--preview-terminal': preview.terminal.background,
                  '--preview-terminal-text': preview.terminal.foreground,
                  '--preview-border': preview.tokens.border
                } as CSSProperties
              }
            >
              <span className="theme-preview" aria-hidden="true">
                <span className="preview-sidebar">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span className="preview-workspace">
                  <span className="preview-tabs">
                    <i />
                    shell<span>agent</span>
                  </span>
                  <span className="preview-terminal">
                    <span>~/my-project</span>
                    <span>
                      <b>❯</b> ready when you are
                      <span className="preview-cursor" />
                    </span>
                  </span>
                </span>
              </span>
              <span className="theme-card-label">
                <strong>{palette.name}</strong>
                {selected ? (
                  <Check size={14} />
                ) : palette.mode === 'light' ? (
                  <Sun size={14} />
                ) : (
                  <Moon size={14} />
                )}
              </span>
              <span className="theme-description">{palette.description}</span>
            </button>
          )
        })}
      </div>
      <div className="appearance-custom-heading">
        <div>
          <strong>Fine-tune {theme.name}</strong>
          <span>Custom colors are saved separately for each palette.</span>
        </div>
        <button
          type="button"
          className="subtle-button"
          onClick={() => customize({})}
          disabled={!Object.values(custom).some(Boolean)}
        >
          <RotateCcw size={12} /> Reset colors
        </button>
      </div>
      <div className="appearance-colors" key={theme.id}>
        <ColorField
          label="Accent color"
          value={custom.accent ?? theme.tokens.accent}
          onChange={(value) => change('accent', value)}
        />
        <ColorField
          label="Terminal background"
          value={theme.terminal.background!}
          onChange={(value) => change('terminalBackground', value)}
        />
        <ColorField
          label="Terminal text"
          value={custom.terminalForeground ?? theme.terminal.foreground!}
          onChange={(value) => change('terminalForeground', value)}
        />
      </div>
      <p className="appearance-readability">
        Text and accent colors adjust for readable contrast. Programs that set their own colors keep
        them.
      </p>
      <div className="appearance-footer">
        <span>
          <Check size={13} /> Saved automatically on this computer
        </span>
        <button type="button" onClick={reset}>
          Restore defaults
        </button>
      </div>
    </div>
  )
}
