import type { ThemeSetting } from '@shared/models'

const STORAGE_KEY = 'volt.theme'

export function readCachedTheme(): ThemeSetting {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'dark' || value === 'light' || value === 'system') return value
  } catch {
    // storage unavailable
  }
  return 'system'
}

export function resolveTheme(theme: ThemeSetting): 'dark' | 'light' {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(theme: ThemeSetting): void {
  document.documentElement.dataset['theme'] = resolveTheme(theme)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // storage unavailable
  }
}
