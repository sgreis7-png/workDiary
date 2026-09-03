// Supabase access for the traffic-light module. Every write goes through RLS
// (migration 0064); traffic_light() is the only aggregate and it checks the area itself.
import { supabase } from '../lib/supabase'
import type { AxisKey, ProjectLight, Settings } from './model'
import type { WbsTemplate } from './wbs'

export async function fetchTrafficLight(projectId?: string): Promise<ProjectLight[]> {
  const { data, error } = await supabase.rpc('traffic_light', { p_project: projectId ?? null })
  if (error) throw error
  return (data ?? []) as ProjectLight[]
}

export interface SnapshotMeta { id: string; taken_at: string }
export async function fetchSnapshots(limit = 12): Promise<SnapshotMeta[]> {
  const { data, error } = await supabase.from('traffic_light_snapshots')
    .select('id,taken_at').order('taken_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as SnapshotMeta[]
}
export async function fetchSnapshot(id: string): Promise<SnapshotMeta & { payload: ProjectLight[] }> {
  const { data, error } = await supabase.from('traffic_light_snapshots').select('id,taken_at,payload').eq('id', id).single()
  if (error) throw error
  return data as SnapshotMeta & { payload: ProjectLight[] }
}

// ---------- settings ----------
export async function fetchSettings(): Promise<Settings> {
  const { data, error } = await supabase.from('traffic_light_settings').select('*').eq('id', 1).single()
  if (error) throw error
  return data as Settings
}
export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const { error } = await supabase.from('traffic_light_settings')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1)
  if (error) throw error
}

// ---------- WBS templates ----------
export async function fetchTemplates(): Promise<WbsTemplate[]> {
  const { data, error } = await supabase.from('wbs_templates').select('*').order('project_type').order('sort_order')
  if (error) throw error
  return (data ?? []) as WbsTemplate[]
}
export async function upsertTemplate(t: Partial<WbsTemplate> & { project_type: string; name_he: string; name_en: string; sort_order: number }): Promise<void> {
  const { error } = await supabase.from('wbs_templates').upsert(t, { onConflict: 'id' })
  if (error) throw error
}
export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('wbs_templates').delete().eq('id', id)
  if (error) throw error
}

// ---------- contractors ----------
export interface Contractor { id: string; project_id: string; name: string; agreed_workers: number; critical: boolean; active: boolean }
export async function fetchContractors(projectId: string): Promise<Contractor[]> {
  const { data, error } = await supabase.from('project_contractors').select('*')
    .eq('project_id', projectId).order('critical', { ascending: false }).order('name')
  if (error) throw error
  return (data ?? []) as Contractor[]
}
export async function upsertContractor(c: Partial<Contractor> & { project_id: string; name: string }): Promise<Contractor> {
  const { data, error } = await supabase.from('project_contractors').upsert(c, { onConflict: 'id' }).select('*').single()
  if (error) throw error
  return data as Contractor
}
export async function deleteContractor(id: string): Promise<void> {
  const { error } = await supabase.from('project_contractors').delete().eq('id', id)
  if (error) throw error
}

// ---------- deliveries ----------
export type DeliveryStatus = 'not_ordered' | 'ordered' | 'shipped' | 'on_site'
export const DELIVERY_STATUSES: DeliveryStatus[] = ['not_ordered', 'ordered', 'shipped', 'on_site']
export interface Delivery {
  id: string; project_id: string; item: string; wbs_template_id: string | null
  need_date: string; status: DeliveryStatus; eta: string | null
  owner_email: string | null; notes: string | null; updated_at: string; updated_by: string | null
}
export async function fetchDeliveries(projectId: string): Promise<Delivery[]> {
  const { data, error } = await supabase.from('project_deliveries').select('*').eq('project_id', projectId).order('need_date')
  if (error) throw error
  return (data ?? []) as Delivery[]
}
export async function upsertDelivery(d: Partial<Delivery> & { project_id: string; item: string; need_date: string }, by: string): Promise<Delivery> {
  const { data, error } = await supabase.from('project_deliveries')
    .upsert({ ...d, updated_by: by.toLowerCase(), updated_at: new Date().toISOString() }, { onConflict: 'id' }).select('*').single()
  if (error) throw error
  return data as Delivery
}
export async function deleteDelivery(id: string): Promise<void> {
  const { error } = await supabase.from('project_deliveries').delete().eq('id', id)
  if (error) throw error
}

// ---------- issues ----------
export type OwnerKind = 'engineering' | 'purchasing' | 'customer' | 'contractor' | 'weather' | 'other'
export const OWNER_KINDS: OwnerKind[] = ['engineering', 'purchasing', 'customer', 'contractor', 'weather', 'other']
export interface Issue {
  id: string; project_id: string; seq: number; entry_id: string | null; opened_on: string
  description: string; owner_kind: OwnerKind; owner_email: string | null; due_date: string | null
  blocking: boolean; wbs_template_id: string | null; systemic: boolean
  closed_on: string | null; closure_note: string | null; created_by: string | null
}
export async function fetchIssues(projectId: string, open: boolean): Promise<Issue[]> {
  let q = supabase.from('issues').select('*').eq('project_id', projectId).order('seq', { ascending: false })
  q = open ? q.is('closed_on', null) : q.not('closed_on', 'is', null)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as Issue[]
}
export async function updateIssue(id: string, patch: Partial<Issue>): Promise<void> {
  const { data, error } = await supabase.from('issues').update(patch).eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('אין הרשאה לערוך פריט זה')
}
export async function createIssue(i: { project_id: string; description: string; owner_kind: OwnerKind; blocking: boolean; opened_on?: string }): Promise<Issue> {
  const { data, error } = await supabase.from('issues').insert(i).select('*').single()
  if (error) throw error
  return data as Issue
}

// ---------- tasks born from the board ----------
export async function createTrafficTask(
  projectId: string, axis: AxisKey | 'gray', title: string, createdBy: string,
  assignee: string | null = null, due: string | null = null,
): Promise<void> {
  const { error } = await supabase.from('work_tasks').insert({
    title, project_id: projectId, source: 'traffic_light', axis,
    assignee_email: assignee?.toLowerCase() ?? null, due_date: due, created_by: createdBy.toLowerCase(),
  })
  if (error) throw error
}
