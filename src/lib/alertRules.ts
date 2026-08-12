// Personal alert rules ("כללי התראות") — CRUD on alert_rules (RLS: owner rows only).
import { supabase } from './supabase'

export interface AlertRule {
  id: string
  email: string
  project_id: string | null
  /** 'overdue' is event-driven: the hourly job notices a finish date that has passed while the
   *  task is unfinished, so frequency and alert_hour carry defaults and mean nothing. */
  kind: 'missing' | 'filled' | 'overdue'
  /** 'once' is the default for an overdue rule: the real-time alert fires and that is the end
   *  of it. The others add a repeating summary of what is still late. */
  frequency: 'once' | 'daily' | 'weekly' | 'monthly'
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

export type RuleSchedulePatch = Pick<AlertRule, 'frequency' | 'alert_hour' | 'weekday' | 'month_day'>

/** Edit a rule's schedule in place. Scope (kind, project, tasks) stays what it was —
 *  changing what a rule watches is a new rule, not an edit. */
export async function updateRule(id: string, patch: RuleSchedulePatch): Promise<void> {
  const { error } = await supabase.from('alert_rules').update(patch).eq('id', id)
  if (error) throw error
}

// ---------- overdue rules: which tasks a rule watches ----------
//
// Empty means every task in the rule's project, which is the common case. Naming tasks is for the
// manager who cares about four dates in a hundred-row schedule.

export interface OverdueTaskChoice {
  id: string
  name: string
  finish_ts: string
  pct: number
  project_id: string
}

/** Non-summary tasks of the active charts for a project, for the picker. Summary rows are left
 *  out because their dates are rolled up from their children — alerting on one would fire for a
 *  parent whose own children are the thing that slipped. */
export async function fetchSchedulableTasks(projectId: string): Promise<OverdueTaskChoice[]> {
  const { data: charts, error: cErr } = await supabase
    .from('gantt_charts').select('id,project_id').eq('project_id', projectId).eq('active', true)
  if (cErr) throw cErr
  const ids = (charts ?? []).map((c: { id: string }) => c.id)
  if (!ids.length) return []

  const { data, error } = await supabase
    .from('gantt_tasks').select('id,name,finish_ts,pct,chart_id,is_summary')
    .in('chart_id', ids).eq('is_summary', false).order('sort_order')
  if (error) throw error
  return ((data ?? []) as { id: string; name: string; finish_ts: string; pct: number }[])
    .map((t) => ({ ...t, project_id: projectId }))
}

/** How many of a project's tasks are already past their finish date and unfinished.
 *
 *  Shown before a rule is saved: an "every task" rule on a schedule that is already behind will
 *  announce all of them at once, and that is worth knowing before it happens rather than after. */
export async function countLateTasks(projectId: string | null): Promise<number> {
  let q = supabase.from('gantt_charts').select('id').eq('active', true)
  if (projectId) q = q.eq('project_id', projectId)
  const { data: charts } = await q
  const ids = (charts ?? []).map((c: { id: string }) => c.id)
  if (!ids.length) return 0

  const today = new Date().toISOString().slice(0, 10)
  const { count } = await supabase
    .from('gantt_tasks').select('id', { count: 'exact', head: true })
    .in('chart_id', ids).eq('is_summary', false).lt('finish_ts', today).lt('pct', 100)
  return count ?? 0
}

export async function setRuleTasks(ruleId: string, taskIds: string[]): Promise<void> {
  await supabase.from('alert_rule_tasks').delete().eq('rule_id', ruleId)
  if (!taskIds.length) return
  const { error } = await supabase.from('alert_rule_tasks')
    .insert(taskIds.map((task_id) => ({ rule_id: ruleId, task_id })))
  if (error) throw error
}

export async function fetchRuleTaskCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('alert_rule_tasks').select('rule_id')
  if (error) throw error
  const m: Record<string, number> = {}
  for (const r of (data ?? []) as { rule_id: string }[]) m[r.rule_id] = (m[r.rule_id] ?? 0) + 1
  return m
}
