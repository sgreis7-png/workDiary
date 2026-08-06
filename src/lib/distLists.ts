// Distribution lists ("רשימות תפוצה") — personal lists (owner rows via RLS)
// plus admin-created shared lists readable by everyone.
import { supabase } from './supabase'

export interface DistList {
  id: string
  name: string
  shared: boolean
  owner: string
  emails: string[]
  /** current user owns this list (can edit unless RLS says otherwise) */
  mine: boolean
}

export async function fetchLists(): Promise<DistList[]> {
  const [{ data: u }, { data: lists, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('distribution_lists').select('id,name,shared,owner,created_at').order('created_at'),
  ])
  if (error) throw error
  const ids = (lists ?? []).map((l) => l.id)
  let emailsByList: Record<string, string[]> = {}
  if (ids.length) {
    const { data: recs, error: e2 } = await supabase
      .from('list_recipients').select('list_id,email').in('list_id', ids)
    if (e2) throw e2
    emailsByList = {}
    for (const r of recs ?? []) (emailsByList[r.list_id] ||= []).push(r.email)
  }
  const uid = u.user?.id
  return (lists ?? []).map((l) => ({
    id: l.id, name: l.name, shared: l.shared, owner: l.owner,
    emails: emailsByList[l.id] ?? [], mine: l.owner === uid,
  }))
}

export async function createList(name: string, emails: string[], shared: boolean): Promise<void> {
  const { data: u } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('distribution_lists')
    .insert({ name, shared, owner: u.user?.id }).select('id').single()
  if (error) throw error
  if (emails.length) {
    const { error: e2 } = await supabase.from('list_recipients')
      .insert(emails.map((email) => ({ list_id: data.id, email })))
    if (e2) throw e2
  }
}

export async function updateList(id: string, name: string, emails: string[], shared: boolean): Promise<void> {
  const { error } = await supabase.from('distribution_lists').update({ name, shared }).eq('id', id)
  if (error) throw error
  const { error: e2 } = await supabase.from('list_recipients').delete().eq('list_id', id)
  if (e2) throw e2
  if (emails.length) {
    const { error: e3 } = await supabase.from('list_recipients')
      .insert(emails.map((email) => ({ list_id: id, email })))
    if (e3) throw e3
  }
}

export async function deleteList(id: string): Promise<void> {
  const { error } = await supabase.from('distribution_lists').delete().eq('id', id)
  if (error) throw error
}
