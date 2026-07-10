// Progress-report + missing-material tables. Rows are serialized as JSON strings
// inside the entry's `values` map, so they ride the existing draft persistence
// (IndexedDB), offline queue and Supabase JSONB storage with no schema change.
import type { Lang } from '../i18n'

export const PROGRESS_KEY = 'progress_table'
export const HOUSE_PCT_KEY = 'progress_house_pct'
export const MISSING_KEY = 'missing_material'

export interface ProgressRow { task: string; pct: number; remarks: string }
export interface MissingRow { code: string; desc: string; amount: string; reason: string }

// Standard Big Dutchman installation tasks — pre-seeded on every new report.
export const DEFAULT_TASKS: { he: string; en: string }[] = [
  { he: 'סט קצה קדמי', en: 'End set front' },
  { he: 'מערכת', en: 'System' },
  { he: 'סט קצה אחורי', en: 'End set rear' },
  { he: 'תאורת FlexLED', en: 'FlexLED lights' },
  { he: 'קיר מחיצה', en: 'Partition wall' },
  { he: 'מסועי זבל', en: 'Manure conveyors' },
  { he: 'הזנה (אוגר וסילו)', en: 'Feed (Auger & Silo)' },
  { he: 'מסוע ביצים', en: 'Egg conveyor' },
  { he: 'איסוף ביצים', en: 'Egg collection' },
]

export const MISSING_REASONS: { id: string; he: string; en: string }[] = [
  { id: '1', he: 'ניזוק באתר', en: 'Damaged on site' },
  { id: '2', he: 'נגנב באתר', en: 'Stolen on site' },
  { id: '3', he: 'הפרש בין רשימת האריזה לכמות בארגז', en: 'Difference between packing list and amount in box' },
  { id: '4', he: 'לא סופק מספיק', en: 'Not enough delivered' },
]

export const defaultProgressRows = (lang: Lang): ProgressRow[] =>
  DEFAULT_TASKS.map((t) => ({ task: t[lang], pct: 0, remarks: '' }))

const clampPct = (n: unknown) => Math.min(100, Math.max(0, Math.round(Number(n) || 0)))

/** undefined/'' → seeded defaults; '[]' (user deleted all rows) stays empty. */
export function parseProgress(raw: string | undefined, lang: Lang): ProgressRow[] {
  if (raw === undefined || raw === '') return defaultProgressRows(lang)
  try {
    const a = JSON.parse(raw)
    if (!Array.isArray(a)) return defaultProgressRows(lang)
    return a.map((r) => ({ task: String(r?.task ?? ''), pct: clampPct(r?.pct), remarks: String(r?.remarks ?? '') }))
  } catch { return defaultProgressRows(lang) }
}

export function parseMissing(raw: string | undefined): MissingRow[] {
  if (!raw) return []
  try {
    const a = JSON.parse(raw)
    if (!Array.isArray(a)) return []
    return a.map((r) => ({
      code: String(r?.code ?? ''), desc: String(r?.desc ?? ''),
      amount: String(r?.amount ?? ''), reason: String(r?.reason ?? ''),
    }))
  } catch { return [] }
}

export const reasonLabel = (id: string, lang: Lang): string =>
  MISSING_REASONS.find((r) => r.id === id)?.[lang] ?? ''

/** Rows worth showing in reports (missing-material rows the user actually filled). */
export const filledMissing = (rows: MissingRow[]): MissingRow[] =>
  rows.filter((r) => (r.code + r.desc + r.amount).trim() || r.reason)
