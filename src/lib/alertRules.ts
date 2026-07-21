// Personal alert rules ("כללי התראות") — CRUD on alert_rules (RLS: owner rows only).
import { supabase } from './supabase'

export interface AlertRule {
  id: string
  email: string
  project_id: string | null
  kind: 'missing' | 'filled'
  frequency: 'daily' | 'weekly' | 'monthly'
  alert_hour: number
  weekday: number | null
  month_day: number | null
  active: boolean
  created_at: string
}

export type NewAlertRule = Omit<AlertRule, 'id' | 'email' | 'created_at' | 'active'>

export async function fetchMyRules(): Promise<AlertRule[]> {
  const { data, error } = await supabase.from('alert_rules').select('*').order('created_at')
  if (error) throw error
  return data as AlertRule[]
}

export async function createRule(r: NewAlertRule): Promise<AlertRule> {
  const { data: u } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('alert_rules')
    .insert({ ...r, email: u.user?.email?.toLowerCase() }).select('*').single()
  if (error) throw error
  return data as AlertRule
}

export async function deleteRule(id: string): Promise<void> {
  const { error } = await supabase.from('alert_rules').delete().eq('id', id)
  if (error) throw error
}

export async function toggleRule(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('alert_rules').update({ active }).eq('id', id)
  if (error) throw error
}
