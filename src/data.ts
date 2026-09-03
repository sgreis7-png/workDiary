// Shared types + pure helpers. All data access lives in ./api (Supabase) and the
// reference-data cache in ./store. (This file used to hold the in-memory mock.)

/** 'manager' sits between the two: sees every project, administers nobody. Being answerable
 *  for a particular project is separate — project_assignments.is_manager. */
export type Role = 'member' | 'manager' | 'admin'
export type FieldType = 'text' | 'long_text' | 'number' | 'date' | 'phone' | 'select' | 'photo'
export interface Option { he: string; en: string }

export interface FieldDef {
  id: string; key: string; label_he: string; label_en: string
  type: FieldType; required: boolean; options: Option[]; sort_order: number; active: boolean
}
export interface Project {
  id: string; name: string; active: boolean
  location?: string | null; budget?: number | null; pmo?: string | null
  start_date?: string | null; end_date?: string | null; staff?: string | null; notes?: string | null
  priority?: number | null // company priority (admin)
  work_days?: number[] | null // dow 0=Sunday..6; scheduled alerts fire only on these days
  contract_due_date?: string | null // תאריך מסירה חוזי (traffic light, time axis)
  project_type?: string | null      // wbs_templates.project_type; default 'coop'

}
export type ProjectInput = Omit<Project, 'id'>


/** A row of the allowlist, optionally joined with profile status. */
export interface AppUser {
  id: string; name: string; email: string; role: Role; active: boolean
  registered: boolean
}

export interface Entry {
  id: string; project_id: string; created_by: string; work_date: string
  created_at: string; last_sent_at: string | null; values: Record<string, string>
  photos: string[]    // signed URLs — empty when the caller asked not to sign them
  photo_count: number // always accurate, whether or not the URLs were signed
}

export interface SearchFilters { projectId?: string; userId?: string; from?: string; to?: string; text?: string; malfunction?: string }

// stable color per project, by its position in the active list
export const PROJECT_COLORS = ['#3aaa35', '#c2541f', '#277d23', '#d8a01a', '#6c747a', '#1c5a1a', '#a8431a']
export function colorForIndex(i: number): string {
  return PROJECT_COLORS[(i < 0 ? 0 : i) % PROJECT_COLORS.length]
}

/** Case-insensitive substring match across all field values of an entry. */
export function entryMatchesText(values: Record<string, string>, text: string): boolean {
  if (!text) return true
  // report-table values are JSON strings — match their cell contents, not the JSON syntax
  const flat = Object.values(values).map((v) => {
    if (typeof v !== 'string' || !v.startsWith('[')) return v
    try { return (JSON.parse(v) as Record<string, unknown>[]).map((r) => Object.values(r ?? {}).join(' ')).join(' ') }
    catch { return v }
  })
  return flat.join(' ').toLowerCase().includes(text.toLowerCase())
}

/** Group entries (or anything with work_date) by their date string. */
export function groupByDate<T extends { work_date: string }>(items: T[]): Record<string, T[]> {
  const map: Record<string, T[]> = {}
  for (const it of items) (map[it.work_date] ||= []).push(it)
  return map
}

// ---------- malfunction (בלת"מ) ----------
export const MALFUNCTION_DEPT_KEY = 'malfunction_dept'
export const MALFUNCTION_TEXT_KEY = 'malfunction'

export interface MalfunctionDept { id: string; he: string; en: string }
export const MALFUNCTION_DEPTS: MalfunctionDept[] = [
  { id: 'none',        he: 'אין',          en: 'None' },
  { id: 'engineering', he: 'הנדסה',        en: 'Engineering' },
  { id: 'purchasing',  he: 'רכש-הספקות',   en: 'Purchasing & supply' },
  { id: 'customer',    he: 'לקוח',         en: 'Customer' },
  { id: 'contractor',  he: 'קבלן',         en: 'Contractor' },
  { id: 'weather',     he: 'מזג אוויר',    en: 'Weather' },
  { id: 'other',       he: 'אחר',          en: 'Other' },
]

/** Departments the form offered before 2026-09 (migration 0064 replaced the options). */
const LEGACY_DEPTS: { match: string[]; id: string }[] = [
  { match: ['logistics_warehouse', 'לוגיסטיקה ומחסן', 'logistics & warehouse', 'רכש', 'purchasing'], id: 'purchasing' },
  { match: ['contractors', 'קבלנים'], id: 'contractor' },
  { match: ['customers', 'לקוחות'], id: 'customer' },
  { match: ['finance', 'כספים'], id: 'other' },
]

/** Map a stored dept value (he OR en OR canonical id, any case; blank) to a canonical id.
 *  Unknown / blank → 'none' (fail-safe: never counts as a malfunction unless clearly one). */
export function deptIdOf(value: string | undefined | null): string {
  const v = String(value ?? '').trim().toLowerCase()
  if (!v) return 'none'
  const hit = MALFUNCTION_DEPTS.find(
    (d) => d.id === v || d.he.toLowerCase() === v || d.en.toLowerCase() === v,
  )
  if (hit) return hit.id
  const legacy = LEGACY_DEPTS.find((l) => l.match.some((m) => m.toLowerCase() === v))
  return legacy ? legacy.id : 'none'
}

/** True when the entry records a real malfunction (dept id ≠ 'none'). */
export function hasMalfunction(values: Record<string, string>): boolean {
  return deptIdOf(values?.[MALFUNCTION_DEPT_KEY]) !== 'none'
}

/** Localized label for a canonical dept id. */
export function deptLabel(id: string, lang: 'he' | 'en'): string {
  const d = MALFUNCTION_DEPTS.find((x) => x.id === id)
  return d ? d[lang] : id
}

// ---------- safety (בטיחות) ----------
// Fixed keys rendered in their own form section (not field_definitions rows).
// safety_training holds the localized yes/no label; safety_incident holds the
// incident description — empty string means "no incident" and is kept out of
// the report entirely.
export const SAFETY_TRAINING_KEY = 'safety_training'
export const SAFETY_INCIDENT_KEY = 'safety_incident'
