// "שמור נתונים" — server-saved name/phone prefill for the entry form.
import { supabase } from './supabase'

export interface Prefill { name: string | null; phone: string | null }

export function applyPrefill(values: Record<string, string>, p: Prefill | null): Record<string, string> {
  if (!p) return values
  const out = { ...values }
  if (!out.manager_name?.trim() && p.name) out.manager_name = p.name
  if (!out.phone?.trim() && p.phone) out.phone = p.phone
  return out
}

export async function fetchPrefill(email: string): Promise<Prefill | null> {
  const { data } = await supabase.from('user_prefill').select('name,phone')
    .eq('email', email.toLowerCase()).maybeSingle()
  return (data as Prefill | null) ?? null
}

export async function savePrefill(email: string, name: string, phone: string): Promise<void> {
  await supabase.from('user_prefill')
    .upsert({ email: email.toLowerCase(), name: name || null, phone: phone || null, updated_at: new Date().toISOString() })
}

// site_location is remembered per user PER PROJECT — never leaks between projects or users
export async function fetchProjectLocation(email: string, projectId: string): Promise<string | null> {
  const { data } = await supabase.from('user_prefill_locations').select('site_location')
    .eq('email', email.toLowerCase()).eq('project_id', projectId).maybeSingle()
  return (data as { site_location: string | null } | null)?.site_location ?? null
}

export async function saveProjectLocation(email: string, projectId: string, siteLocation: string): Promise<void> {
  if (!siteLocation.trim()) return
  await supabase.from('user_prefill_locations')
    .upsert({ email: email.toLowerCase(), project_id: projectId, site_location: siteLocation.trim(), updated_at: new Date().toISOString() })
}
