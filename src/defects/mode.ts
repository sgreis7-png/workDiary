// App-mode selection: ניהול עבודה (existing diary) vs ניהול ליקויים (stage-gate QC).
export type AppMode = 'work' | 'defects'
const KEY = 'appMode'

export function getMode(): AppMode | null {
  const v = localStorage.getItem(KEY)
  return v === 'work' || v === 'defects' ? v : null
}
export function setMode(m: AppMode): void {
  localStorage.setItem(KEY, m)
}
