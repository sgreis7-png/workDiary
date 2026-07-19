// Light/dark theme: persisted choice, system preference as the default.
export type Theme = 'light' | 'dark'
const KEY = 'appTheme'

export function getTheme(): Theme {
  const v = localStorage.getItem(KEY)
  if (v === 'light' || v === 'dark') return v
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(t: Theme): void {
  document.documentElement.setAttribute('data-theme', t)
}

export function setTheme(t: Theme): void {
  localStorage.setItem(KEY, t)
  applyTheme(t)
}

export function initTheme(): void {
  applyTheme(getTheme())
}
