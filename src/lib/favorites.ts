// Favourite projects, kept per screen — the control centre, the schedule, coop
// management and the project list each remember their own stars, because the
// project someone lives in on one screen is not the one they pin on another.
export type FavScope = 'control' | 'gantt' | 'coops' | 'projects'

// The control centre key predates the scoping, so its stars survive the change.
const KEYS: Record<FavScope, string> = {
  control: 'cc_favs',
  gantt: 'favs_gantt',
  coops: 'favs_coops',
  projects: 'favs_projects',
}

export function readFavs(scope: FavScope): string[] {
  try {
    const a = JSON.parse(localStorage.getItem(KEYS[scope]) ?? '[]')
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}

/** Toggles and persists; returns the next list for setState. */
export function toggleFav(scope: FavScope, favs: string[], id: string): string[] {
  const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id]
  try { localStorage.setItem(KEYS[scope], JSON.stringify(next)) } catch { /* private browsing */ }
  return next
}
