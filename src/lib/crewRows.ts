// Structured crew / blocking / arrivals keys inside entries.values. Stored as JSON strings
// like progress_coops so drafts, the offline queue and the report pick them up unchanged.
export const CREW_KEY = 'crew_rows'
export const ISSUE_BLOCKING_KEY = 'issue_blocking'
export const ARRIVED_KEY = 'arrived_items'

// `hours` stays in the stored JSON (older entries and the report read it); when a row has
// from/to it is derived from them, so both shapes render the same way.
export interface CrewRow { contractor: string; workers: number; hours: number; from: string; to: string }

const num = (v: unknown, max = 999) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)))

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
const time = (v: unknown): string => (typeof v === 'string' && HHMM.test(v) ? v : '')
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/** Hours between two HH:MM stamps, wrapping past midnight; '' when either side is missing. */
export function spanHours(from: string, to: string): number | null {
  if (!HHMM.test(from) || !HHMM.test(to)) return null
  const d = minutes(to) - minutes(from)
  return Math.round(((d <= 0 ? d + 24 * 60 : d) / 60) * 100) / 100
}

export function parseCrew(raw: string | undefined): CrewRow[] {
  if (!raw) return []
  try {
    const a = JSON.parse(raw)
    if (!Array.isArray(a)) return []
    return a.map((r) => {
      const from = time(r?.from), to = time(r?.to)
      const span = spanHours(from, to)
      return { contractor: String(r?.contractor ?? ''), workers: num(r?.workers), hours: span ?? num(r?.hours, 24), from, to }
    })
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
