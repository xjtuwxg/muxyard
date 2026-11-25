import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import {
  defaultAppearance,
  parseAppearance,
  resolveTheme,
  THEME_STORAGE_KEY,
  type Appearance,
  type ThemeOverrides,
  type ResolvedTheme
} from './themes'

function readAppearance(): Appearance {
  try {
    return parseAppearance(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return defaultAppearance()
  }
}
function apply(theme: ResolvedTheme): void {
  const root = document.documentElement
  root.dataset.theme = theme.id
  root.dataset.appearance = theme.mode
  root.style.colorScheme = theme.mode
  for (const [key, value] of Object.entries(theme.tokens)) root.style.setProperty(`--${key}`, value)
}
export function initializeAppearance(): void {
  apply(resolveTheme(readAppearance(), matchMedia('(prefers-color-scheme: dark)').matches))
}
interface ThemeState {
  appearance: Appearance
  theme: ResolvedTheme
  choose: (theme: Appearance['theme']) => void
  customize: (overrides: ThemeOverrides) => void
  reset: () => void
}
const ThemeContext = createContext<ThemeState | null>(null)
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState(readAppearance)
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches
  )
  const theme = useMemo(() => resolveTheme(appearance, systemDark), [appearance, systemDark])
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)')
    const changed = () => setSystemDark(query.matches)
    query.addEventListener('change', changed)
    changed()
    return () => query.removeEventListener('change', changed)
  }, [])
  useLayoutEffect(() => {
    apply(theme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(appearance))
    } catch {}
  }, [theme, appearance])
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (
        event.storageArea === localStorage &&
        (event.key === THEME_STORAGE_KEY || event.key === null)
      )
        setAppearance(parseAppearance(event.newValue))
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [])
  return (
    <ThemeContext.Provider
      value={{
        appearance,
        theme,
        choose: (selected) => setAppearance((value) => ({ ...value, theme: selected })),
        customize: (overrides) =>
          setAppearance((value) => ({
            ...value,
            overrides: { ...value.overrides, [theme.id]: overrides }
          })),
        reset: () => setAppearance(defaultAppearance())
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}
export function useTheme(): ThemeState {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('Appearance requires ThemeProvider.')
  return context
}
