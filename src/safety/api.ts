import { supabase } from '../lib/supabase'
import type { SafetyFormInput, SafetyFormRec, SafetyTopic, SafetyWorker } from './model'
import { dedupeWorkers } from './model'

const COLS = 'id,project_id,training_date,topics,workers,instructor_name,'
  + 'instructor_qualification,instructor_signature,created_by,created_at,updated_at'

export interface SafetyFilters { projectId?: string; from?: string; to?: string }

export async function listSafetyForms(f: SafetyFilters = {}): Promise<SafetyFormRec[]> {
  let q = supabase.from('safety_forms').select(COLS)
    .order('training_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (f.projectId) q = q.eq('project_id', f.projectId)
  if (f.from) q = q.gte('training_date', f.from)
  if (f.to) q = q.lte('training_date', f.to)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as unknown as SafetyFormRec[]
}

export async function getSafetyForm(id: string): Promise<SafetyFormRec | null> {
  const { data, error } = await supabase.from('safety_forms').select(COLS).eq('id', id).maybeSingle()
  if (error) throw error
  return data as unknown as SafetyFormRec | null
}

export async function createSafetyForm(input: SafetyFormInput): Promise<string> {
  const { data, error } = await supabase.from('safety_forms').insert(input).select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

// RLS (migration 0061) restricts update/delete to the author or an admin; a mismatched
// row simply matches nothing and Postgres reports success with zero rows affected — not
// an error. .select('id') lets us tell "0 rows" apart from "it worked" and fail loudly.
export async function updateSafetyForm(id: string, input: SafetyFormInput): Promise<void> {
  const { data, error } = await supabase.from('safety_forms')
    .update({ ...input, updated_at: new Date().toISOString() }).eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('אין הרשאה לערוך טופס זה')
}

export async function deleteSafetyForm(id: string): Promise<void> {
  const { data, error } = await supabase.from('safety_forms').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('אין הרשאה למחוק טופס זה')
}

// ---------- topics ----------

export async function fetchSafetyTopics(): Promise<SafetyTopic[]> {
  const { data, error } = await supabase.from('safety_topics')
    .select('id,label,sort_order,active').order('sort_order')
  if (error) throw error
  return (data ?? []) as unknown as SafetyTopic[]
}

export async function createSafetyTopic(label: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('safety_topics').insert({ label, sort_order: sortOrder })
  if (error) throw error
}

export async function updateSafetyTopic(
  id: string, patch: Partial<Pick<SafetyTopic, 'label' | 'active'>>,
): Promise<void> {
  const { error } = await supabase.from('safety_topics').update(patch).eq('id', id)
  if (error) throw error
}

export async function reorderSafetyTopics(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, i) =>
    supabase.from('safety_topics').update({ sort_order: (i + 1) * 10 }).eq('id', id)))
}

// ---------- worker suggestions ----------

/** Names+ids from the project's last 20 forms, for autocomplete. */
export async function fetchWorkerSuggestions(projectId: string): Promise<{ name: string; id_number: string }[]> {
  const { data, error } = await supabase.from('safety_forms')
    .select('workers').eq('project_id', projectId)
    .order('training_date', { ascending: false }).limit(20)
  if (error) throw error
  return dedupeWorkers((data ?? []) as unknown as { workers: SafetyWorker[] }[])
}
