import { supabase } from '../lib/supabase'
import type { HandoverExtraFieldDef, HandoverInput, HandoverRec, HandoverSystem } from './model'

const COLS = 'id,project_id,handover_date,client_name,site_location,project_nature,'
  + 'attendees,systems,notes,extra_fields,receiver_name,receiver_role,receiver_signature,signed_at,'
  + 'created_by,created_at,updated_at'

export interface HandoverFilters { projectId?: string; from?: string; to?: string }

export async function listHandovers(f: HandoverFilters = {}): Promise<HandoverRec[]> {
  let q = supabase.from('handover_forms').select(COLS)
    .order('handover_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (f.projectId) q = q.eq('project_id', f.projectId)
  if (f.from) q = q.gte('handover_date', f.from)
  if (f.to) q = q.lte('handover_date', f.to)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as unknown as HandoverRec[]
}

export async function getHandover(id: string): Promise<HandoverRec | null> {
  const { data, error } = await supabase.from('handover_forms').select(COLS).eq('id', id).maybeSingle()
  if (error) throw error
  return data as unknown as HandoverRec | null
}

export async function createHandover(input: HandoverInput): Promise<string> {
  const { data, error } = await supabase.from('handover_forms').insert(input).select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

// RLS (migration 0077) allows update/delete to admins only — a signed handover is not
// rewritten by the person who filled it. A non-admin's update matches no row, and Postgres
// reports success with zero rows affected rather than an error; .select('id') is what tells
// the two apart, so the screen can say "you cannot" instead of "saved".
//
// The thrown message is a sentinel, not user-visible text — this layer has no lang, so the
// callers (HandoverFormScreen's save catch, HandoverView's delete catch) map it through
// src/handover/i18n.ts. A literal Hebrew string here would reach an English user verbatim.
export async function updateHandover(id: string, input: HandoverInput): Promise<void> {
  const { data, error } = await supabase.from('handover_forms')
    .update({ ...input, updated_at: new Date().toISOString() }).eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('forbidden')
}

export async function deleteHandover(id: string): Promise<void> {
  const { data, error } = await supabase.from('handover_forms').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('forbidden')
}

/** Both catalogues keep `label` unique; a second person adding the same field hits 23505.
 *  The screens turn this into "that field already exists" — a raw Postgres string in the
 *  middle of a handover is not something a foreman can act on. */
export const DUPLICATE_LABEL = 'duplicate_label'
const isDuplicate = (e: { code?: string }) => e?.code === '23505'

// ---------- system catalogue ----------

const SYSTEM_COLS = 'id,label,sort_order,active,builtin,created_by'

export async function fetchHandoverSystems(): Promise<HandoverSystem[]> {
  const { data, error } = await supabase.from('handover_systems')
    .select(SYSTEM_COLS).order('sort_order')
  if (error) throw error
  return (data ?? []) as unknown as HandoverSystem[]
}

export async function createHandoverSystem(label: string, sortOrder: number): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  const { error } = await supabase.from('handover_systems')
    .insert({ label, sort_order: sortOrder, created_by: auth.user?.id })
  if (error) throw new Error(isDuplicate(error) ? DUPLICATE_LABEL : error.message)
}

export async function updateHandoverSystem(
  id: string, patch: Partial<Pick<HandoverSystem, 'label' | 'active'>>,
): Promise<void> {
  const { data, error } = await supabase.from('handover_systems')
    .update(patch).eq('id', id).select('id')
  if (error) throw new Error(isDuplicate(error) ? DUPLICATE_LABEL : error.message)
  if (!data || data.length === 0) throw new Error('forbidden')
}

export async function deleteHandoverSystem(id: string): Promise<void> {
  const { data, error } = await supabase.from('handover_systems').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('forbidden')
}

export async function reorderHandoverSystems(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, i) =>
    supabase.from('handover_systems').update({ sort_order: (i + 1) * 10 }).eq('id', id)))
}

// ---------- header-field catalogue ----------

const FIELD_COLS = 'id,label,sort_order,active,builtin,created_by'

export async function fetchHandoverExtraFields(): Promise<HandoverExtraFieldDef[]> {
  const { data, error } = await supabase.from('handover_extra_fields')
    .select(FIELD_COLS).order('sort_order')
  if (error) throw error
  return (data ?? []) as unknown as HandoverExtraFieldDef[]
}

export async function createHandoverExtraField(label: string, sortOrder: number): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  const { error } = await supabase.from('handover_extra_fields')
    .insert({ label, sort_order: sortOrder, created_by: auth.user?.id })
  if (error) throw new Error(isDuplicate(error) ? DUPLICATE_LABEL : error.message)
}

export async function updateHandoverExtraField(
  id: string, patch: Partial<Pick<HandoverExtraFieldDef, 'label' | 'active'>>,
): Promise<void> {
  const { data, error } = await supabase.from('handover_extra_fields')
    .update(patch).eq('id', id).select('id')
  if (error) throw new Error(isDuplicate(error) ? DUPLICATE_LABEL : error.message)
  if (!data || data.length === 0) throw new Error('forbidden')
}

export async function deleteHandoverExtraField(id: string): Promise<void> {
  const { data, error } = await supabase.from('handover_extra_fields')
    .delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('forbidden')
}

export async function reorderHandoverExtraFields(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, i) =>
    supabase.from('handover_extra_fields').update({ sort_order: (i + 1) * 10 }).eq('id', id)))
}

// ---------- header prefill ----------

/** Header values for a new form. `projects` has no customer column, so the project name is
 *  the best guess for both the customer and the scope — the form lets the user correct
 *  them, and typing over a wrong guess is still faster than typing into three blanks. */
export async function fetchProjectHeader(
  projectId: string,
): Promise<{ client_name: string; site_location: string; project_nature: string } | null> {
  const { data, error } = await supabase.from('projects')
    .select('name,location').eq('id', projectId).maybeSingle()
  if (error) throw error
  if (!data) return null
  const p = data as unknown as { name: string; location: string | null }
  return { client_name: p.name ?? '', site_location: p.location ?? '', project_nature: p.name ?? '' }
}
