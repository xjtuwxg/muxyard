import type { ITheme } from '@xterm/xterm'

export const THEME_STORAGE_KEY = 'muxyard.appearance.v1'
export type ThemeId = 'daylight' | 'paper' | 'graphite' | 'dusk' | 'grove'
export interface ThemeOverrides {
  accent?: string
  terminalBackground?: string
  terminalForeground?: string
}
export interface Appearance {
  theme: ThemeId | 'system'
  overrides: Partial<Record<ThemeId, ThemeOverrides>>
}
interface Palette {
  id: ThemeId
  name: string
  description: string
  mode: 'light' | 'dark'
  bg: string
  surface: string
  sidebar: string
  inset: string
  text: string
  muted: string
  accent: string
  border: string
  terminal: string
}
export const palettes: Palette[] = [
  {
    id: 'daylight',
    name: 'Daylight',
    description: 'Clear skies. A fresh perspective.',
    mode: 'light',
    bg: '#f2f5fa',
    surface: '#ffffff',
    sidebar: '#eaf0f8',
    inset: '#f8faff',
    text: '#1c2d45',
    muted: '#52647b',
    accent: '#245bd7',
    border: '#d1dbe9',
    terminal: '#fbfcff'
  },
  {
    id: 'paper',
    name: 'Paper',
    description: 'Warm paper. A quieter workspace.',
    mode: 'light',
    bg: '#f2eee6',
    surface: '#fffdf7',
    sidebar: '#eae4d9',
    inset: '#f6f1e8',
    text: '#352f29',
    muted: '#6c5e50',
    accent: '#98502c',
    border: '#d8cdbd',
    terminal: '#fffcf5'
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'Cool charcoal. Nothing in the way.',
    mode: 'dark',
    bg: '#101318',
    surface: '#1b2029',
    sidebar: '#151921',
    inset: '#11151d',
    text: '#e3eaf5',
    muted: '#a3afc1',
    accent: '#86afff',
    border: '#343e4e',
    terminal: '#101318'
  },
  {
    id: 'dusk',
    name: 'Dusk',
    description: 'Soft violet. Room to think.',
    mode: 'dark',
    bg: '#191724',
    surface: '#252234',
    sidebar: '#1e1b2b',
    inset: '#171521',
    text: '#eee7fb',
    muted: '#b3a9c7',
    accent: '#c4a1f5',
    border: '#443b58',
    terminal: '#191724'
  },
  {
    id: 'grove',
    name: 'Grove',
    description: 'Forest shade. The original Muxyard.',
    mode: 'dark',
    bg: '#111714',
    surface: '#1b241e',
    sidebar: '#151c18',
    inset: '#101713',
    text: '#e0e9df',
    muted: '#a0b3a5',
    accent: '#accbb0',
    border: '#384a3e',
    terminal: '#101713'
  }
]
export const defaultAppearance = (): Appearance => ({ theme: 'system', overrides: {} })
const isHex = (value: unknown): value is string =>
  typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
export function parseAppearance(serialized: string | null): Appearance {
  try {
    const value = JSON.parse(serialized ?? 'null')
    if (!value || (value.theme !== 'system' && !palettes.some((p) => p.id === value.theme)))
      return defaultAppearance()
    const overrides: Appearance['overrides'] = {}
    for (const palette of palettes) {
      const candidate = value.overrides?.[palette.id]
      if (!candidate || typeof candidate !== 'object') continue
      const safe: ThemeOverrides = {}
      for (const key of ['accent', 'terminalBackground', 'terminalForeground'] as const)
        if (isHex(candidate[key])) safe[key] = candidate[key].toLowerCase()
      if (Object.keys(safe).length) overrides[palette.id] = safe
    }
    return { theme: value.theme, overrides }
  } catch {
    return defaultAppearance()
  }
}
function channels(hex: string): number[] {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
}
function luminance(hex: string): number {
  return channels(hex)
    .map((channel) => {
      const value = channel / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
}
export function contrast(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}
export function mix(first: string, second: string, amount: number): string {
  const a = channels(first),
    b = channels(second)
  return (
    '#' +
    a
      .map((value, index) =>
        Math.round(value * (1 - amount) + b[index] * amount)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}
export function readableColor(color: string, background: string, minimum = 4.5): string {
  if (contrast(color, background) >= minimum) return color
  const target =
    contrast('#ffffff', background) > contrast('#000000', background) ? '#ffffff' : '#000000'
  let low = 0,
    high = 1
  for (let i = 0; i < 20; i++) {
    const middle = (low + high) / 2
    if (contrast(mix(color, target, middle), background) >= minimum) high = middle
    else low = middle
  }
  return mix(color, target, high)
}
export interface ResolvedTheme {
  id: ThemeId
  name: string
  mode: 'light' | 'dark'
  tokens: Record<string, string>
  terminal: ITheme
}
export function resolveTheme(appearance: Appearance, systemDark: boolean): ResolvedTheme {
  const id =
    appearance.theme === 'system' ? (systemDark ? 'graphite' : 'daylight') : appearance.theme
  const palette = palettes.find((p) => p.id === id) ?? palettes[0]
  const custom = appearance.overrides[palette.id] ?? {}
  const light = palette.mode === 'light'
  const accent = readableColor(custom.accent ?? palette.accent, palette.surface)
  const accentSoft = mix(palette.surface, accent, light ? 0.1 : 0.14)
  const hover = mix(palette.surface, palette.text, light ? 0.045 : 0.06)
  const surfaces = [palette.bg, palette.surface, palette.sidebar, palette.inset, accentSoft, hover]
  const legible = (color: string): string =>
    surfaces.reduce((value, bg) => readableColor(value, bg), color)
  const status = (color: string): string => {
    let value = readableColor(color, palette.surface)
    for (let i = 0; i < 4; i++) value = readableColor(value, mix(palette.surface, value, 0.1))
    return value
  }
  const warning = status(light ? '#95600c' : '#e5bb7c')
  const danger = status(light ? '#b52c3f' : '#f19b9f')
  const success = status(light ? '#187042' : '#94cba5')
  const violet = status(light ? '#7843b1' : '#c7acf3')
  const background = custom.terminalBackground ?? palette.terminal
  const foreground = readableColor(custom.terminalForeground ?? palette.text, background)
  const terminalLight = luminance(background) > 0.35
  const terminalAccent = readableColor(custom.accent ?? palette.accent, background)
  const ansi = terminalLight
    ? [
        '#263247',
        '#a52637',
        '#1d6c3d',
        '#87600b',
        '#2456ac',
        '#7b3596',
        '#006a79',
        '#536071',
        '#596576',
        '#b32a3b',
        '#18703f',
        '#846005',
        '#2556b2',
        '#823e9d',
        '#007080',
        '#354257'
      ]
    : [
        '#8591a5',
        '#e98f97',
        '#9acb9e',
        '#e2c38a',
        '#8db4f2',
        '#c8a1e4',
        '#87c6cf',
        '#dce4ef',
        '#a1adc0',
        '#f2a2ab',
        '#b5d7a0',
        '#efd29b',
        '#a7c7ff',
        '#dac0f5',
        '#a3dce4',
        '#f1f5fc'
      ]
  const keys = [
    'black',
    'red',
    'green',
    'yellow',
    'blue',
    'magenta',
    'cyan',
    'white',
    'brightBlack',
    'brightRed',
    'brightGreen',
    'brightYellow',
    'brightBlue',
    'brightMagenta',
    'brightCyan',
    'brightWhite'
  ] as const
  const terminal: ITheme = {
    background,
    foreground,
    cursor: terminalAccent,
    cursorAccent: background,
    overviewRulerBorder: '#00000000',
    scrollbarSliderBackground: readableColor(mix(background, foreground, 0.42), background, 3),
    scrollbarSliderHoverBackground: readableColor(mix(background, foreground, 0.56), background, 3),
    scrollbarSliderActiveBackground: readableColor(mix(background, foreground, 0.7), background, 3),
    selectionBackground: mix(background, terminalAccent, terminalLight ? 0.24 : 0.3),
    selectionInactiveBackground: mix(background, terminalAccent, 0.15),
    selectionForeground: readableColor(
      foreground,
      mix(background, terminalAccent, terminalLight ? 0.24 : 0.3)
    ),
    ...Object.fromEntries(keys.map((key, index) => [key, readableColor(ansi[index], background)]))
  }
  return {
    id: palette.id,
    name: palette.name,
    mode: palette.mode,
    terminal,
    tokens: {
      bg: palette.bg,
      surface: palette.surface,
      elevated: palette.surface,
      sidebar: palette.sidebar,
      inset: palette.inset,
      text: legible(palette.text),
      muted: legible(palette.muted),
      subtle: legible(mix(palette.muted, palette.surface, 0.12)),
      faint: mix(palette.muted, palette.surface, 0.3),
      border: palette.border,
      'control-border': readableColor(palette.border, palette.surface, 3),
      accent,
      'accent-text': legible(accent),
      'accent-soft': accentSoft,
      'accent-hover': mix(accent, light ? '#000000' : '#ffffff', 0.08),
      'on-accent':
        contrast('#ffffff', accent) > contrast('#000000', accent) ? '#ffffff' : '#000000',
      hover,
      warning,
      'warning-soft': mix(palette.surface, warning, 0.1),
      danger,
      'danger-soft': mix(palette.surface, danger, 0.1),
      success,
      'success-soft': mix(palette.surface, success, 0.1),
      violet,
      'violet-soft': mix(palette.surface, violet, 0.1),
      'terminal-bg': background,
      'terminal-fg': foreground,
      overlay: light ? '#17243566' : '#070911b8',
      shadow: light ? '#192b4324' : '#00000066',
      selection: mix(palette.surface, accent, 0.22),
      'selection-text': legible(palette.text)
    }
  }
}
