// Per-user area permissions: admin grants override role defaults.
import { supabase } from './supabase'
import type { Role } from '../data'

export type PermLevel = 'none' | 'view' | 'edit'
export type PermArea =
  | 'dashboard' | 'logbook' | 'calendar' | 'search' | 'projects' | 'export'
  | 'defects' | 'form_builder' | 'coops_manage' | 'alert_rules'

export const PERM_AREAS: { key: PermArea; label: string }[] = [
  { key: 'logbook', label: 'יומן עבודה' },
  { key: 'calendar', label: 'לוח שנה' },
  { key: 'search', label: 'חיפוש' },
  { key: 'projects', label: 'פרויקטים' },
  { key: 'export', label: 'ייצוא דוחות' },
  { key: 'dashboard', label: 'סקירה / סטטיסטיקות' },
  { key: 'defects', label: 'ניהול ליקויים' },
  { key: 'coops_manage', label: 'ניהול לולים — עריכה ומחיקה' },
  { key: 'alert_rules', label: 'כללי התראות' },
  { key: 'form_builder', label: 'בוני טפסים' },
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

export interface PermOverride { email: string; area: PermArea; level: PermLevel }

export function resolvePerm(role: Role, overrides: Record<string, PermLevel>, area: PermArea): PermLevel {
  if (role === 'admin') return 'edit'
  return overrides[area] ?? MEMBER_DEFAULTS[area]
}

export async function fetchMyPermOverrides(email: string): Promise<Record<string, PermLevel>> {
  const { data, error } = await supabase.from('user_permissions')
    .select('area,level').ilike('email', email)
  if (error) throw error
  const m: Record<string, PermLevel> = {}
  for (const r of data as { area: string; level: PermLevel }[]) m[r.area] = r.level
  return m
}

export async function fetchPermOverridesFor(email: string): Promise<Record<string, PermLevel>> {
  return fetchMyPermOverrides(email)
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
