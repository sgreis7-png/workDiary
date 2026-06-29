// In-memory mock data layer. Mirrors the Supabase schema in the implementation plan
// (docs/superpowers/plans/2026-06-29-work-diary.md). Swap these functions for real
// supabase-js calls during backend wiring — the shapes are intentionally identical.

export type Role = 'member' | 'admin'
export type FieldType = 'text' | 'long_text' | 'number' | 'date' | 'phone' | 'select' | 'photo'
export interface Option { he: string; en: string }

export interface FieldDef {
  id: string; key: string; label_he: string; label_en: string
  type: FieldType; required: boolean; options: Option[]; sort_order: number; active: boolean
}
export interface Project { id: string; name: string; active: boolean }
export interface AppUser {
  id: string; name: string; email: string; role: Role; active: boolean
  registered: boolean   // false = admin authorized the email, worker hasn't set a password yet
  password?: string     // demo only — real auth stores a hash in Supabase Auth
}
export interface Entry {
  id: string; project_id: string; created_by: string; work_date: string
  created_at: string; last_sent_at: string | null; values: Record<string, string>
  photos: string[] // data/URL strings (mock); storage paths in prod
}

const uid = () => Math.random().toString(36).slice(2, 10)

export const FIELD_DEFS: FieldDef[] = [
  { id: '1', key: 'manager_name', label_he: 'שם מנהל העבודה', label_en: 'Work manager name', type: 'text', required: true, options: [], sort_order: 10, active: true },
  { id: '2', key: 'phone', label_he: 'טלפון', label_en: 'Phone', type: 'phone', required: true, options: [], sort_order: 20, active: true },
  { id: '3', key: 'work_date', label_he: 'תאריך העבודה', label_en: 'Work date', type: 'date', required: true, options: [], sort_order: 30, active: true },
  { id: '4', key: 'site_location', label_he: 'מיקום האתר', label_en: 'Site location', type: 'text', required: true, options: [], sort_order: 40, active: true },
  { id: '5', key: 'weather', label_he: 'מזג האוויר', label_en: 'Weather', type: 'select', required: true, sort_order: 50, active: true,
    options: [{ he: 'שמש', en: 'Sunny' }, { he: 'מעונן', en: 'Cloudy' }, { he: 'גשם', en: 'Rain' }, { he: 'רוח', en: 'Wind' }, { he: 'אחר', en: 'Other' }] },
  { id: '6', key: 'daily_content', label_he: 'תוכן יומי - קטע לביצוע', label_en: 'Daily content / section to execute', type: 'long_text', required: true, options: [], sort_order: 60, active: true },
  { id: '7', key: 'contractor', label_he: 'שם הקבלן ומספר העובדים', label_en: 'Contractor & number of workers', type: 'text', required: true, options: [], sort_order: 70, active: true },
  { id: '8', key: 'equipment', label_he: 'ציוד בשימוש ולמי שייך', label_en: 'Equipment in use & owner', type: 'text', required: true, options: [], sort_order: 80, active: true },
  { id: '9', key: 'manager_notes', label_he: 'הערות מנהל עבודה', label_en: 'Work manager notes', type: 'long_text', required: false, options: [], sort_order: 85, active: true },
  { id: '10', key: 'site_photos', label_he: 'תמונות מהשטח', label_en: 'Site photos', type: 'photo', required: true, options: [], sort_order: 90, active: true },
]

export const PROJECTS: Project[] = [
  { id: 'p1', name: 'בני נצרים', active: true },
  { id: 'p2', name: 'כפר יובל', active: true },
  { id: 'p3', name: 'מסועי ביצים — דצמן', active: true },
  { id: 'p4', name: 'חממות ערבה', active: false },
]

export const USERS: AppUser[] = [
  { id: 'u1', name: 'פבל איסחיזוב', email: 'pavel@agrotop.co.il', role: 'admin', active: true, registered: true, password: 'demo' },
  { id: 'u2', name: 'אלון טל', email: 'alon@agrotop.co.il', role: 'member', active: true, registered: true, password: 'demo' },
  { id: 'u3', name: 'ספיר כהן', email: 'sapir@agrotop.co.il', role: 'member', active: true, registered: false },
  { id: 'u4', name: 'חמודה', email: 'hamuda@contractor.co.il', role: 'member', active: false, registered: false },
]

// gradient swatch placeholders standing in for real site photos
const ph = (a: string, b: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='320'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient></defs><rect width='480' height='320' fill='url(%23g)'/><g fill='rgba(255,255,255,.18)'><rect x='40' y='220' width='400' height='8'/><rect x='40' y='244' width='300' height='8'/><circle cx='380' cy='90' r='44'/></g></svg>`
  )}`

export const ENTRIES: Entry[] = [
  {
    id: 'e1', project_id: 'p2', created_by: 'u2', work_date: '2026-06-29',
    created_at: '2026-06-29T15:40:00Z', last_sent_at: '2026-06-29T16:05:00Z',
    values: {
      manager_name: 'אלון טל', phone: '054-4885100', work_date: '2026-06-29', site_location: 'כפר יובל',
      weather: 'שמש', daily_content: 'השלמת פטות, הרכבת אגד קידמי ואחורי. הגיע מכולה של ציוד ביג דצמן לשטח, בעיקר חלקים למסועי ביצים.',
      contractor: 'חמודה — סה״כ 5 פועלים פלוס חמד', equipment: 'מעמיס טלסקופי ו-3 במות. אגרוטופ.',
      manager_notes: 'יותר מידי טעויות ביצור בקונסטרוקציה. היום גילינו עוד שני אגדים שהקלידים/פלטות לא רותכו במקום הנכון — סה״כ 4 קלידים לריתוך. בנוסף הלבשה שהגיעה מחוררת בכמה מקומות.',
    },
    photos: [ph('#3aaa35', '#1c5a1a'), ph('#c2541f', '#7a2f12'), ph('#277d23', '#0f3a0d')],
  },
  {
    id: 'e2', project_id: 'p1', created_by: 'u3', work_date: '2026-06-28',
    created_at: '2026-06-28T14:10:00Z', last_sent_at: null,
    values: {
      manager_name: 'פבל איסחיזוב', phone: '052-5162702', work_date: '2026-06-28', site_location: 'בני נצרים',
      weather: 'שמש', daily_content: 'מסגרות והרכבה מסדרונות.', contractor: 'עדי — 4 עובדים',
      equipment: 'JCB. אגרוטופ.', manager_notes: '',
    },
    photos: [ph('#d8a01a', '#8a5a0a'), ph('#3aaa35', '#0f3a0d')],
  },
  {
    id: 'e4', project_id: 'p1', created_by: 'u3', work_date: '2026-06-29',
    created_at: '2026-06-29T11:20:00Z', last_sent_at: null,
    values: {
      manager_name: 'ספיר כהן', phone: '050-7781234', work_date: '2026-06-29', site_location: 'בני נצרים',
      weather: 'שמש', daily_content: 'יציקת רצפה בחממה 3 והכנת תשתית למערכת השקיה.', contractor: 'אבו-סאלם — 6 עובדים',
      equipment: 'משאבת בטון + ערבל. שכור.', manager_notes: '',
    },
    photos: [ph('#277d23', '#0f3a0d'), ph('#6c747a', '#2b3034')],
  },
  {
    id: 'e5', project_id: 'p3', created_by: 'u1', work_date: '2026-06-29',
    created_at: '2026-06-29T09:05:00Z', last_sent_at: '2026-06-29T12:00:00Z',
    values: {
      manager_name: 'פבל איסחיזוב', phone: '052-5162702', work_date: '2026-06-29', site_location: 'מסועי ביצים — דצמן',
      weather: 'מעונן', daily_content: 'התקנת מנועי מסוע והרצת בדיקה ראשונית.', contractor: 'עדי — 4 עובדים',
      equipment: 'מנוף 25 טון. אגרוטופ.', manager_notes: 'נדרשת השלמת חיווט חשמל מחר.',
    },
    photos: [ph('#d8a01a', '#8a5a0a')],
  },
  {
    id: 'e3', project_id: 'p3', created_by: 'u2', work_date: '2026-06-25',
    created_at: '2026-06-25T13:00:00Z', last_sent_at: '2026-06-25T17:20:00Z',
    values: {
      manager_name: 'אלון טל', phone: '054-4885100', work_date: '2026-06-25', site_location: 'מסועי ביצים',
      weather: 'מעונן', daily_content: 'יישור מסועים והתקנת מנועים.', contractor: 'ספיר — 3 עובדים',
      equipment: 'מלגזה + פיגומים. שכור.', manager_notes: 'ממתינים לאספקת חיישנים.',
    },
    photos: [ph('#6c747a', '#2b3034')],
  },
]

// ---- query helpers (same names you'll expose from the supabase api modules) ----

export const projectName = (id: string) => PROJECTS.find((p) => p.id === id)?.name ?? '—'
export const userName = (id: string) => USERS.find((u) => u.id === id)?.name ?? '—'

// stable color per project, used by the calendar chips and legends
export const PROJECT_COLORS = ['#3aaa35', '#c2541f', '#277d23', '#d8a01a', '#6c747a', '#1c5a1a', '#a8431a']
export function projectColor(id: string): string {
  const i = PROJECTS.findIndex((p) => p.id === id)
  return PROJECT_COLORS[(i < 0 ? 0 : i) % PROJECT_COLORS.length]
}
export function entriesByDate(): Record<string, Entry[]> {
  const map: Record<string, Entry[]> = {}
  for (const e of ENTRIES) (map[e.work_date] ||= []).push(e)
  return map
}

export function listEntries(): Entry[] {
  return [...ENTRIES].sort((a, b) => b.work_date.localeCompare(a.work_date))
}
export function getEntry(id: string): Entry | undefined {
  return ENTRIES.find((e) => e.id === id)
}
export function createEntry(project_id: string, values: Record<string, string>, photos: string[]): Entry {
  const e: Entry = {
    id: uid(), project_id, created_by: 'u1', work_date: values.work_date || '',
    created_at: new Date().toISOString(), last_sent_at: null, values, photos,
  }
  ENTRIES.unshift(e)
  return e
}

export interface SearchFilters { projectId?: string; from?: string; to?: string; text?: string }
export function searchEntries(f: SearchFilters): Entry[] {
  return listEntries().filter((e) => {
    if (f.projectId && e.project_id !== f.projectId) return false
    if (f.from && e.work_date < f.from) return false
    if (f.to && e.work_date > f.to) return false
    if (f.text) {
      const hay = Object.values(e.values).join(' ').toLowerCase()
      if (!hay.includes(f.text.toLowerCase())) return false
    }
    return true
  })
}
