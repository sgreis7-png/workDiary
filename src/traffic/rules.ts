// Parity spec for the SQL in 0065 — no runtime code calls this module.
// Threshold → color, one function per spec table (chapter 4). Pure, date-in / color-out.
// These mirror the plpgsql in 0065; keep the two in step when a threshold moves.
import { dayDiff, todayIso, worst, type Color, type Settings } from './model'

/** Spec 4.1 project level. delta = forecast − contract (days). */
export function timeColor(contract: string | null, delta: number | null, s: Settings, today = todayIso()): { color: Color; delta: number | null } {
  if (!contract) return { color: 'red', delta: null }
  if (dayDiff(contract, today) < 0) return { color: 'red', delta }
  if (delta === null) return { color: 'amber', delta }
  if (delta <= s.time_amber_days) return { color: 'green', delta }
  if (delta <= s.time_red_days) return { color: 'amber', delta }
  return { color: 'red', delta }
}

export interface CategoryFacts {
  critical: boolean
  planned_finish: string | null
  start: string | null
  base_start: string | null
  pct: number
  blocked: boolean
  blocked_due?: string | null
}

/** Spec 4.1 category level. */
export function categoryColor(c: CategoryFacts, s: Settings, today = todayIso()): Color {
  const out: Color[] = ['green']
  if (c.planned_finish && dayDiff(c.planned_finish, today) < 0 && c.pct < 100) out.push('amber')
  if (c.critical && c.start && c.base_start && dayDiff(c.start, c.base_start) > 0) out.push('amber')
  if (c.critical && c.blocked) {
    const fixSoon = c.blocked_due != null && dayDiff(c.blocked_due, today) <= s.issue_block_resolve_days
    if (!fixSoon) out.push('red')
  }
  return worst(...out)
}

export interface SupplyFacts {
  status: 'not_ordered' | 'ordered' | 'shipped' | 'on_site'
  need_date: string
  eta: string | null
  critical: boolean
}

/** Spec 4.2, one item already inside the lookahead window. */
export function supplyItemColor(i: SupplyFacts, s: Settings, today = todayIso()): Color {
  if (i.status === 'on_site') return 'green'
  const daysToNeed = dayDiff(i.need_date, today)
  if (i.status === 'not_ordered') return daysToNeed <= s.supply_red_window_days ? 'red' : 'amber'
  if (!i.eta) return 'amber'
  const slack = dayDiff(i.need_date, i.eta) // positive = eta before need
  if (slack < 0) return i.critical ? 'red' : 'amber'
  return slack >= s.supply_eta_margin_days ? 'green' : 'amber'
}

export interface CrewFacts { name: string; critical: boolean; ratio: number; absences: number }

/** Spec 4.4. ratio = actual / agreed over the window; absences = work days with 0. */
export function crewColor(rows: CrewFacts[], s: Settings): Color {
  if (rows.length === 0) return 'na'
  const out: Color[] = ['green']
  for (const r of rows) {
    const pct = r.ratio * 100
    if (r.absences >= 2) out.push('red')
    if (r.critical && pct < s.crew_red_pct) out.push('red')
    else if (pct < s.crew_green_pct) out.push('amber')
    if (r.critical && r.absences === 1) out.push('amber')
  }
  return worst(...out)
}

export interface IssueFacts {
  opened_on: string
  owner_email: string | null
  due_date: string | null
  blocking: boolean
  systemic: boolean
}

/** Spec 4.5, open issues only. */
export function issuesColor(items: IssueFacts[], s: Settings, today = todayIso()): Color {
  const out: Color[] = ['green']
  for (const i of items) {
    if (i.blocking || i.systemic) out.push('red')
    const age = dayDiff(today, i.opened_on)
    if (age > s.issue_open_days && (!i.owner_email || !i.due_date)) out.push('amber')
  }
  return worst(...out)
}

export interface CommitmentFacts {
  due_date: string
  status: 'open' | 'confirmed' | 'done'
  blocking: boolean
  notice_sent_on: string | null
}

/** Spec part A. Mirrors tl_client() in migration 0071. */
export function clientColor(items: CommitmentFacts[], s: Settings, today = todayIso()): Color {
  if (items.length === 0) return 'na'
  const out: Color[] = ['green']
  for (const c of items) {
    if (c.status === 'done') continue
    const overdue = dayDiff(today, c.due_date) > 0
    if (overdue && c.blocking) out.push('red')
    else if (c.status === 'open' && dayDiff(c.due_date, today) <= s.client_window_days) out.push('amber')
  }
  return worst(...out)
}

/** Spec 4.6. Returns the Hebrew reason, or null when the project is reporting. */
export function grayReason(f: { entryInLastWorkdays: boolean; ganttAgeDays: number | null }, s: Settings): string | null {
  if (!f.entryInLastWorkdays) return `לא התקבל יומן עבודה ב-${s.gray_missing_workdays} ימי העבודה האחרונים`
  if (f.ganttAgeDays === null) return 'אין גאנט פעיל לפרויקט'
  if (f.ganttAgeDays > s.gray_gantt_days) return `הגאנט לא עודכן ${f.ganttAgeDays} ימים (מעל ${s.gray_gantt_days})`
  return null
}
