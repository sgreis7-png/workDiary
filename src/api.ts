// All Supabase data access. Function names mirror the old mock helpers so screens
// read the same — only now they're async and hit the real database.
import { supabase } from './lib/supabase'
import { entryMatchesText } from './data'
import type { AppUser, DistList, Entry, FieldDef, Project, SearchFilters } from './data'

// ---------- reference data ----------

export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects').select('id,name,active').order('created_at')
  if (error) throw error
  return data as Project[]
}

export async function fetchFieldDefs(): Promise<FieldDef[]> {
  const { data, error } = await supabase
    .from('field_definitions').select('*').order('sort_order')
  if (error) throw error
  return (data as FieldDef[]).map((f) => ({ ...f, options: Array.isArray(f.options) ? f.options : [] }))
}

/** id -> display name, for entry author chips. */
export async function fetchUserMap(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('profiles').select('id,name')
  if (error) throw error
  const m: Record<string, string> = {}
  for (const r of data as { id: string; name: string | null }[]) m[r.id] = r.name ?? '—'
  return m
}

// ---------- photos ----------

async function signPaths(paths: string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(paths)].filter(Boolean)
  if (!uniq.length) return {}
  const { data } = await supabase.storage.from('photos').createSignedUrls(uniq, 3600)
  const m: Record<string, string> = {}
  for (const s of data ?? []) if (s.signedUrl && s.path) m[s.path] = s.signedUrl
  return m
}

type EntryRow = Omit<Entry, 'photos'> & { entry_photos: { storage_path: string }[] | null }
const ENTRY_SELECT = 'id,project_id,created_by,work_date,created_at,last_sent_at,values,entry_photos(storage_path)'

async function hydrate(rows: EntryRow[]): Promise<Entry[]> {
  const paths = rows.flatMap((r) => (r.entry_photos ?? []).map((p) => p.storage_path))
  const signed = await signPaths(paths)
  return rows.map((r) => ({
    id: r.id, project_id: r.project_id, created_by: r.created_by,
    work_date: r.work_date ?? '', created_at: r.created_at, last_sent_at: r.last_sent_at,
    values: r.values ?? {},
    photos: (r.entry_photos ?? []).map((p) => signed[p.storage_path]).filter(Boolean),
  }))
}

// ---------- entries ----------

export async function listEntries(projectId?: string): Promise<Entry[]> {
  let q = supabase.from('entries').select(ENTRY_SELECT).order('work_date', { ascending: false })
  if (projectId) q = q.eq('project_id', projectId)
  const { data, error } = await q
  if (error) throw error
  return hydrate((data ?? []) as unknown as EntryRow[])
}

export async function getEntry(id: string): Promise<Entry | null> {
  const { data, error } = await supabase.from('entries').select(ENTRY_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  return (await hydrate([data as unknown as EntryRow]))[0]
}

export async function createEntry(
  project_id: string, values: Record<string, string>, files: File[],
): Promise<string> {
  const { data: u } = await supabase.auth.getUser()
  const uid = u.user?.id
  if (!uid) throw new Error('not authenticated')

  const { data: ins, error } = await supabase.from('entries')
    .insert({ project_id, created_by: uid, work_date: values.work_date || null, values })
    .select('id').single()
  if (error) throw error
  const entryId = ins.id as string

  for (const f of files) {
    const safe = f.name.replace(/[^\w.\-]+/g, '_')
    const path = `${entryId}/${crypto.randomUUID()}-${safe}`
    const { error: upErr } = await supabase.storage.from('photos').upload(path, f)
    if (upErr) throw upErr
    const { error: pErr } = await supabase.from('entry_photos').insert({ entry_id: entryId, storage_path: path })
    if (pErr) throw pErr
  }
  return entryId
}

export async function searchEntries(f: SearchFilters): Promise<Entry[]> {
  let q = supabase.from('entries').select(ENTRY_SELECT).order('work_date', { ascending: false })
  if (f.projectId) q = q.eq('project_id', f.projectId)
  if (f.from) q = q.gte('work_date', f.from)
  if (f.to) q = q.lte('work_date', f.to)
  const { data, error } = await q
  if (error) throw error
  let entries = await hydrate((data ?? []) as unknown as EntryRow[])
  if (f.text) entries = entries.filter((e) => entryMatchesText(e.values, f.text!))
  return entries
}

// ---------- admin: projects ----------

export async function createProject(name: string): Promise<void> {
  const { error } = await supabase.from('projects').insert({ name })
  if (error) throw error
}
export async function setProjectActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('projects').update({ active }).eq('id', id)
  if (error) throw error
}

// ---------- admin: field definitions ----------

export async function createField(f: {
  key: string; label_he: string; label_en: string
  type: FieldDef['type']; required: boolean; sort_order: number
}): Promise<void> {
  const { error } = await supabase.from('field_definitions').insert({ ...f, options: [], active: true })
  if (error) throw error
}
export async function deleteField(id: string): Promise<void> {
  const { error } = await supabase.from('field_definitions').delete().eq('id', id)
  if (error) throw error
}
export async function reorderFields(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, i) =>
    supabase.from('field_definitions').update({ sort_order: (i + 1) * 10 }).eq('id', id)))
}

// ---------- admin: users (allowlist) ----------

export async function fetchUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from('allowed_emails').select('email,display_name,role,active,registered').order('created_at')
  if (error) throw error
  return (data as {
    email: string; display_name: string | null; role: AppUser['role']; active: boolean; registered: boolean
  }[]).map((r) => ({
    id: r.email, email: r.email, name: r.display_name || r.email.split('@')[0],
    role: r.role, active: r.active, registered: r.registered,
  }))
}
export async function inviteUser(email: string, display_name: string, role: AppUser['role'] = 'member'): Promise<void> {
  // No email: just authorize the email on the allowlist. The worker then self-registers
  // a password in the app (instant, no mail, no rate limit).
  const { error } = await supabase
    .from('allowed_emails')
    .upsert({ email: email.trim(), display_name, role }, { onConflict: 'email' })
  if (error) throw error
}
export async function setUserRole(email: string, role: AppUser['role']): Promise<void> {
  const { error } = await supabase.from('allowed_emails').update({ role }).eq('email', email)
  if (error) throw error
}
export async function setUserActive(email: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('allowed_emails').update({ active }).eq('email', email)
  if (error) throw error
}
export async function deleteUser(email: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-user', { body: { email } })
  if (error) {
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
    const body = await ctx?.json?.().catch(() => null)
    throw new Error(body?.error ?? error.message)
  }
  const d = data as { error?: string } | null
  if (d?.error) throw new Error(d.error)
}

/** Current user changes their own password. */
export async function changeMyPassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

// ---------- distribution lists ----------

export async function fetchLists(): Promise<DistList[]> {
  const { data, error } = await supabase
    .from('distribution_lists')
    .select('id,name,list_recipients(id,email,display_name)')
    .order('created_at')
  if (error) throw error
  return (data as { id: string; name: string; list_recipients: { id: string; email: string; display_name: string | null }[] | null }[])
    .map((l) => ({ id: l.id, name: l.name, recipients: l.list_recipients ?? [] }))
}
export async function createList(name: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.from('distribution_lists').insert({ name, owner: u.user!.id })
  if (error) throw error
}
export async function deleteList(id: string): Promise<void> {
  const { error } = await supabase.from('distribution_lists').delete().eq('id', id)
  if (error) throw error
}
export async function addRecipient(list_id: string, email: string): Promise<void> {
  const { error } = await supabase.from('list_recipients').insert({ list_id, email })
  if (error) throw error
}
export async function removeRecipient(id: string): Promise<void> {
  const { error } = await supabase.from('list_recipients').delete().eq('id', id)
  if (error) throw error
}

// ---------- send ----------

export async function sendEntry(entry_id: string, list_ids: string[], emails: string[]): Promise<void> {
  const { data, error } = await supabase.functions.invoke('send-entry', {
    body: { entry_id, list_ids, emails },
  })
  if (error) throw error
  const d = data as { error?: string } | null
  if (d?.error) throw new Error(d.error)
}
