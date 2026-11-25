import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  contrast,
  defaultAppearance,
  palettes,
  parseAppearance,
  resolveTheme
} from '../src/renderer/src/themes'

test('built-in palettes keep body text, secondary labels, controls, and terminal output readable', () => {
  for (const palette of palettes) {
    const theme = resolveTheme({ theme: palette.id, overrides: {} }, false)
    for (const foreground of ['text', 'muted', 'subtle', 'accent-text'])
      for (const surface of ['bg', 'surface', 'sidebar', 'inset', 'hover', 'accent-soft'])
        assert.ok(
          contrast(theme.tokens[foreground], theme.tokens[surface]) >= 4.5,
          `${palette.id}: ${foreground} on ${surface}`
        )
    assert.ok(contrast(theme.tokens['on-accent'], theme.tokens.accent) >= 4.5)
    assert.ok(contrast(theme.tokens['on-accent'], theme.tokens['accent-hover']) >= 4.5)
    assert.ok(contrast(theme.tokens['control-border'], theme.tokens.surface) >= 3)
    for (const status of ['warning', 'danger', 'success', 'violet'])
      assert.ok(
        contrast(theme.tokens[status], theme.tokens[`${status}-soft`]) >= 4.5,
        `${palette.id}: ${status}`
      )
    const background = theme.terminal.background!
    for (const key of [
      'foreground',
      'red',
      'green',
      'yellow',
      'blue',
      'magenta',
      'cyan',
      'brightBlack'
    ] as const)
      assert.ok(contrast(theme.terminal[key]!, background) >= 4.5, `${palette.id}: terminal ${key}`)
    assert.ok(
      contrast(theme.terminal.selectionForeground!, theme.terminal.selectionBackground!) >= 4.5
    )
  }
})

test('system appearance selects light or dark and explicit selections survive OS changes', () => {
  assert.equal(resolveTheme(defaultAppearance(), false).id, 'daylight')
  assert.equal(resolveTheme(defaultAppearance(), true).id, 'graphite')
  assert.equal(resolveTheme({ theme: 'paper', overrides: {} }, true).id, 'paper')
})

test('saved preferences reject unknown palettes and unsafe colors while retaining valid overrides', () => {
  for (const value of [null, 'not JSON', '{}', '{"theme":"unknown"}'])
    assert.deepEqual(parseAppearance(value), defaultAppearance())
  const saved = parseAppearance(
    JSON.stringify({
      theme: 'paper',
      overrides: {
        paper: {
          accent: '#FFAA00',
          terminalBackground: 'url(bad)',
          terminalForeground: '#123456',
          extra: 'no'
        },
        graphite: { accent: '#88aaff' },
        unknown: { accent: '#000000' }
      }
    })
  )
  assert.deepEqual(saved, {
    theme: 'paper',
    overrides: {
      paper: { accent: '#ffaa00', terminalForeground: '#123456' },
      graphite: { accent: '#88aaff' }
    }
  })
})

test('custom terminal colors and accents retain readable contrast across light and dark backgrounds', () => {
  for (const id of ['daylight', 'graphite'] as const) {
    for (const background of ['#ffffff', '#000000', '#777777', '#fff100', '#14283d']) {
      const theme = resolveTheme(
        {
          theme: id,
          overrides: {
            [id]: {
              accent: background,
              terminalBackground: background,
              terminalForeground: background
            }
          }
        },
        false
      )
      assert.equal(theme.terminal.background, background)
      assert.ok(contrast(theme.terminal.foreground!, background) >= 4.5)
      assert.ok(contrast(theme.terminal.cursor!, background) >= 4.5)
      assert.ok(contrast(theme.tokens.accent, theme.tokens.surface) >= 4.5)
    }
  }
})
