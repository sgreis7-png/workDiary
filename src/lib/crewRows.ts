// Structured crew / blocking / arrivals keys inside entries.values. Stored as JSON strings
// like progress_coops so drafts, the offline queue and the report pick them up unchanged.
export const CREW_KEY = 'crew_rows'
export const ISSUE_BLOCKING_KEY = 'issue_blocking'
export const ARRIVED_KEY = 'arrived_items'

export interface CrewRow { contractor: string; workers: number; hours: number }

const num = (v: unknown, max = 999) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)))

export function parseCrew(raw: string | undefined): CrewRow[] {
  if (!raw) return []
  try {
    const a = JSON.parse(raw)
    if (!Array.isArray(a)) return []
    return a.map((r) => ({ contractor: String(r?.contractor ?? ''), workers: num(r?.workers), hours: num(r?.hours, 24) }))
  } catch { return [] }
}

export const filledCrew = (rows: CrewRow[]): CrewRow[] =>
  rows.filter((r) => r.contractor.trim() !== '' || r.workers > 0)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function parseArrived(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const a = JSON.parse(raw)
    return Array.isArray(a) ? a.map(String).filter((s) => UUID.test(s)) : []
  } catch { return [] }
}
