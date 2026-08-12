// Favourite projects — one list shared by every screen with a project picker,
// so a star set on the control centre shows up on the schedule, the defect
// screens and the project list too. The storage key predates the sharing.
const KEY = 'cc_favs'

export function readFavs(): string[] {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}

/** Toggles and persists; returns the next list for setState. */
export function toggleFav(favs: string[], id: string): string[] {
  const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id]
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private browsing */ }
  return next
}
