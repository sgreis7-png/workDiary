// Progress-report + missing-material tables. Rows are serialized as JSON strings
// inside the entry's `values` map, so they ride the existing draft persistence
// (IndexedDB), offline queue and Supabase JSONB storage with no schema change.
import type { Lang } from '../i18n'
import { COOP_TEMPLATE, type WbsTemplate } from '../traffic/wbs'

export const PROGRESS_KEY = 'progress_table'      // legacy: single flat table
export const HOUSE_PCT_KEY = 'progress_house_pct'  // legacy: single overall pct
export const COOPS_KEY = 'progress_coops'          // current: per-coop reports
export const MISSING_KEY = 'missing_material'

export interface ProgressRow { task: string; pct: number; remarks: string }
/** bd = the Big Dutchman equipment sub-form ("ציוד BD") nested inside a coop report. */
export interface CoopReport { name: string; pct: number; rows: ProgressRow[]; bd: ProgressRow[] }
export interface MissingRow { code: string; desc: string; amount: string; reason: string }

// Standard coop categories (spec 5.1) — the DB template wbs_templates is the live list;
// this is the seed and the offline fallback.
export const DEFAULT_TASKS: { he: string; en: string }[] = COOP_TEMPLATE.map((t) => ({ he: t.name_he, en: t.name_en }))

// Big Dutchman installation tasks — the "ציוד BD" sub-form inside each coop report.
export const BD_TASKS: { he: string; en: string }[] = [
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

const templateRows = (template?: WbsTemplate[]) =>
  template && template.length ? template.filter((t) => t.active !== false).sort((a, b) => a.sort_order - b.sort_order)
    .map((t) => ({ he: t.name_he, en: t.name_en })) : DEFAULT_TASKS

export const defaultProgressRows = (lang: Lang, template?: WbsTemplate[]): ProgressRow[] =>
  templateRows(template).map((t) => ({ task: t[lang], pct: 0, remarks: '' }))

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

export const coopName = (lang: Lang, n: number) => (lang === 'he' ? `לול ${n}` : `Coop ${n}`)

// Stored rows keep the task name in whatever language the entry was created in.
// For read-only display, map known standard names to the viewer's language;
// custom (user-typed) tasks — and any legacy name, which is history and must not be
// relabeled under a current category — pass through untouched. (The traffic-light
// computation does its own legacy→category mapping in SQL; this is display only.)
export function taskLabel(task: string, lang: Lang): string {
  const s = String(task ?? '').trim()
  const hit = DEFAULT_TASKS.find((t) => t.he === s || t.en === s)
    ?? BD_TASKS.find((t) => t.he === s || t.en === s)
  if (hit) return hit[lang]
  return task
}

/** "לול 3" ↔ "Coop 3" for display; custom coop names pass through. */
export function coopLabel(name: string, lang: Lang): string {
  const m = String(name ?? '').trim().match(/^(?:לול|Coop)\s*(\d+)$/i)
  return m ? coopName(lang, Number(m[1])) : name
}

export const defaultBdRows = (lang: Lang): ProgressRow[] =>
  BD_TASKS.map((t) => ({ task: t[lang], pct: 0, remarks: '' }))

export const defaultCoop = (lang: Lang, n = 1, template?: WbsTemplate[]): CoopReport =>
  ({ name: coopName(lang, n), pct: 0, rows: defaultProgressRows(lang, template), bd: defaultBdRows(lang) })

/** BD sub-form is worth showing in reports only once something was filled in. */
export const bdActive = (bd: ProgressRow[]): boolean =>
  bd.some((r) => r.pct > 0 || r.remarks.trim() !== '')

/**
 * Overall coop percent — the mean of the entered tasks, never a hand-typed number.
 * The BD sub-form joins the pool only once something was filled there, so an
 * untouched all-zero BD table does not drag a structure-only report down.
 */
export function computedPct(rows: ProgressRow[], bd: ProgressRow[]): number {
  const pool = bdActive(bd) ? [...rows, ...bd] : rows
  if (!pool.length) return 0
  return Math.round(pool.reduce((s, r) => s + r.pct, 0) / pool.length)
}

const normRow = (r: unknown): ProgressRow => {
  const o = r as Record<string, unknown> | null
  return { task: String(o?.task ?? ''), pct: clampPct(o?.pct), remarks: String(o?.remarks ?? '') }
}

/**
 * Per-coop progress reports. Prefers COOPS_KEY; entries written before the
 * multi-coop format fall back to the legacy flat keys and render as one coop.
 * Returns [] when the entry has no progress data at all.
 */
export function parseCoops(values: Record<string, string | undefined>, lang: Lang): CoopReport[] {
  const raw = values[COOPS_KEY]
  if (raw !== undefined && raw !== '') {
    try {
      const a = JSON.parse(raw)
      if (Array.isArray(a)) {
        // normalize standard task/coop names to the requested language — rows
        // are stored in whatever language the entry was created in
        const langRow = (r: ProgressRow): ProgressRow => ({ ...r, task: taskLabel(r.task, lang) })
        return a.map((c, i) => {
          const o = c as Record<string, unknown> | null
          const rows = Array.isArray(o?.rows) ? (o.rows as unknown[]).map(normRow).map(langRow) : []
          const bd = Array.isArray(o?.bd) ? (o.bd as unknown[]).map(normRow).map(langRow) : []
          return {
            name: coopLabel(String(o?.name ?? '') || coopName(lang, i + 1), lang),
            // derived from the tasks whenever any exist — a stored hand-typed total
            // (entries saved before the total became computed) is deliberately ignored
            pct: rows.length || bdActive(bd) ? computedPct(rows, bd) : clampPct(o?.pct),
            rows,
            bd,
          }
        })
      }
    } catch { /* fall through to legacy */ }
  }
  const legacyRows = values[PROGRESS_KEY]
  const legacyPct = String(values[HOUSE_PCT_KEY] ?? '').trim()
  if ((legacyRows === undefined || legacyRows === '') && !legacyPct) return []
  return [{
    name: coopName(lang, 1),
    pct: clampPct(legacyPct),
    rows: parseProgress(legacyRows, lang).map((r) => ({ ...r, task: taskLabel(r.task, lang) })),
    bd: [],
  }]
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
