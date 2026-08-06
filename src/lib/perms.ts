// Per-user area permissions: admin grants override role defaults.
import { supabase } from './supabase'
import type { Role } from '../data'

export type PermLevel = 'none' | 'view' | 'edit'
export type PermArea =
  | 'dashboard' | 'logbook' | 'calendar' | 'search' | 'projects' | 'export'
  | 'defects' | 'form_builder' | 'coops_manage' | 'alert_rules'

export const PERM_AREAS: { key: PermArea; label: string; label_en: string }[] = [
  { key: 'logbook', label: 'יומן עבודה', label_en: 'Work diary' },
  { key: 'calendar', label: 'לוח שנה', label_en: 'Calendar' },
  { key: 'search', label: 'חיפוש', label_en: 'Search' },
  { key: 'projects', label: 'פרויקטים', label_en: 'Projects' },
  { key: 'export', label: 'ייצוא דוחות', label_en: 'Report export' },
  { key: 'dashboard', label: 'סקירה / סטטיסטיקות', label_en: 'Overview / statistics' },
  { key: 'defects', label: 'ניהול ליקויים', label_en: 'Defect management' },
  { key: 'coops_manage', label: 'ניהול לולים — עריכה ומחיקה', label_en: 'Coop management — edit & delete' },
  { key: 'alert_rules', label: 'כללי התראות', label_en: 'Alert rules' },
  { key: 'form_builder', label: 'בוני טפסים', label_en: 'Form builders' },
]

/** Role defaults — an explicit user_permissions row overrides these. */
const MEMBER_DEFAULTS: Record<PermArea, PermLevel> = {
  logbook: 'edit',
  calendar: 'view',
  search: 'view',
  projects: 'view',
  export: 'view',
  dashboard: 'none', // סטטיסטיקות — לאדמין, אלא אם הוענקה גישה
  defects: 'edit',
  form_builder: 'none',
  coops_manage: 'none', // מחיקה/עריכת לולים — לאדמין, אלא אם הוענקה
  alert_rules: 'none',  // כללי התראות אישיים — לאדמין, אלא אם הוענקה
}

export function resolvePerm(role: Role, overrides: Record<string, PermLevel>, area: PermArea): PermLevel {
  if (role === 'admin') return 'edit'
  return overrides[area] ?? MEMBER_DEFAULTS[area]
}

/** Area→level overrides for a user (own rows for members; any row for admins). */
export async function fetchPermOverrides(email: string): Promise<Record<string, PermLevel>> {
  const { data, error } = await supabase.from('user_permissions')
    .select('area,level').ilike('email', email)
  if (error) throw error
  const m: Record<string, PermLevel> = {}
  for (const r of data as { area: string; level: PermLevel }[]) m[r.area] = r.level
  return m
}

export async function setPermOverride(email: string, area: PermArea, level: PermLevel): Promise<void> {
  const { error } = await supabase.from('user_permissions')
    .upsert({ email: email.toLowerCase(), area, level, updated_at: new Date().toISOString() }, { onConflict: 'email,area' })
  if (error) throw error
}

export async function clearPermOverride(email: string, area: PermArea): Promise<void> {
  const { error } = await supabase.from('user_permissions')
    .delete().ilike('email', email).eq('area', area)
  if (error) throw error
}
