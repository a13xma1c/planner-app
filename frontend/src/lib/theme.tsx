import { useCallback, useEffect, useMemo, type ReactNode } from 'react'

import { useLocalStorage } from './hooks'
import { ThemeContext, type Theme } from './themeContext'

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
  )
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useLocalStorage<Theme>('planner.theme', 'system')
  const resolved: 'light' | 'dark' =
    theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', resolved === 'dark')
    root.style.colorScheme = resolved
  }, [resolved])

  const toggle = useCallback(
    () => setTheme(resolved === 'dark' ? 'light' : 'dark'),
    [resolved, setTheme],
  )
  const value = useMemo(
    () => ({ theme, resolved, setTheme, toggle }),
    [theme, resolved, setTheme, toggle],
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
