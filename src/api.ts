// All Supabase data access. Function names mirror the old mock helpers so screens
// read the same — only now they're async and hit the real database.
import { supabase } from './lib/supabase'
import { entryMatchesText } from './data'
import type { AppUser, DistList, Entry, FieldDef, Project, ProjectInput, SearchFilters } from './data'

// ---------- reference data ----------

const PROJECT_COLS = 'id,name,active,location,budget,pmo,start_date,end_date,staff,notes,priority'
export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects').select(PROJECT_COLS).order('created_at')
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

export async function listEntries(projectId?: string, opts?: { limit?: number; offset?: number; from?: string; to?: string }): Promise<Entry[]> {
  let q = supabase.from('entries').select(ENTRY_SELECT).order('work_date', { ascending: false })
  if (projectId) q = q.eq('project_id', projectId)
  if (opts?.from) q = q.gte('work_date', opts.from)
  if (opts?.to) q = q.lte('work_date', opts.to)
  if (opts?.limit != null) q = q.range(opts.offset ?? 0, (opts.offset ?? 0) + opts.limit - 1)
  const { data, error } = await q
  if (error) throw error
  return hydrate((data ?? []) as unknown as EntryRow[])
}

/** Most recent entry for a project — used by "copy last entry". */
export async function lastEntryForProject(projectId: string): Promise<Entry | null> {
  const { data, error } = await supabase.from('entries').select(ENTRY_SELECT)
    .eq('project_id', projectId).order('work_date', { ascending: false }).limit(1)
  if (error) throw error
  const rows = (data ?? []) as unknown as EntryRow[]
  if (!rows.length) return null
  return (await hydrate(rows))[0]
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

/** Existing photos of an entry as {path, signed url} — for the edit screen. */
export async function getEntryPhotos(id: string): Promise<{ path: string; url: string }[]> {
  const { data, error } = await supabase.from('entry_photos').select('storage_path').eq('entry_id', id)
  if (error) throw error
  const paths = (data ?? []).map((r: { storage_path: string }) => r.storage_path)
  const signed = await signPaths(paths)
  return paths.map((p) => ({ path: p, url: signed[p] })).filter((x) => x.url)
}

export async function updateEntry(
  id: string, project_id: string, values: Record<string, string>,
  newFiles: File[], removedPaths: string[],
): Promise<void> {
  const { error } = await supabase.from('entries')
    .update({ project_id, work_date: values.work_date || null, values }).eq('id', id)
  if (error) throw error

  for (const path of removedPaths) {
    await supabase.from('entry_photos').delete().eq('storage_path', path)
    await supabase.storage.from('photos').remove([path])
  }
  for (const f of newFiles) {
    const safe = f.name.replace(/[^\w.\-]+/g, '_')
    const path = `${id}/${crypto.randomUUID()}-${safe}`
    const { error: upErr } = await supabase.storage.from('photos').upload(path, f)
    if (upErr) throw upErr
    const { error: pErr } = await supabase.from('entry_photos').insert({ entry_id: id, storage_path: path })
    if (pErr) throw pErr
  }
}

export async function deleteEntry(id: string): Promise<void> {
  const { data } = await supabase.from('entry_photos').select('storage_path').eq('entry_id', id)
  const paths = (data ?? []).map((r: { storage_path: string }) => r.storage_path)
  if (paths.length) await supabase.storage.from('photos').remove(paths)
  const { error } = await supabase.from('entries').delete().eq('id', id)
  if (error) throw error
}

export interface DashboardStats {
  total: number; this_week: number
  this_month?: number; total_photos?: number; unsent?: number
  by_project: Record<string, number>
  latest_by_project: Record<string, string>
  by_worker: Record<string, number>
  by_weather: Record<string, number>
}
export async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('dashboard_stats')
  if (error) throw error
  return data as DashboardStats
}

export async function searchEntries(f: SearchFilters): Promise<Entry[]> {
  let q = supabase.from('entries').select(ENTRY_SELECT).order('work_date', { ascending: false })
  if (f.projectId) q = q.eq('project_id', f.projectId)
  if (f.userId) q = q.eq('created_by', f.userId)
  if (f.from) q = q.gte('work_date', f.from)
  if (f.to) q = q.lte('work_date', f.to)
  const { data, error } = await q
  if (error) throw error
  let entries = await hydrate((data ?? []) as unknown as EntryRow[])
  if (f.text) entries = entries.filter((e) => entryMatchesText(e.values, f.text!))
  return entries
}

// ---------- admin: projects ----------

function cleanProject(p: ProjectInput) {
  return {
    name: p.name, active: p.active,
    location: p.location || null, pmo: p.pmo || null, staff: p.staff || null, notes: p.notes || null,
    budget: p.budget === undefined || p.budget === null || (p.budget as unknown) === '' ? null : Number(p.budget),
    start_date: p.start_date || null, end_date: p.end_date || null,
    priority: Number(p.priority) || 0,
  }
}

/** current user's per-project priority map */
export async function fetchMyPriorities(): Promise<Record<string, number>> {
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) return {}
  const { data, error } = await supabase
    .from('project_priorities').select('project_id,priority').eq('user_id', u.user.id)
  if (error) throw error
  const m: Record<string, number> = {}
  for (const r of data as { project_id: string; priority: number }[]) m[r.project_id] = r.priority
  return m
}
export async function setMyPriority(project_id: string, priority: number): Promise<void> {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.from('project_priorities')
    .upsert({ user_id: u.user!.id, project_id, priority }, { onConflict: 'user_id,project_id' })
  if (error) throw error
}
export async function createProject(p: ProjectInput): Promise<string> {
  const { data, error } = await supabase.from('projects').insert(cleanProject(p)).select('id').single()
  if (error) throw error
  return data.id as string
}

// project ↔ worker assignments (by email, optional, admin-managed)
export async function fetchAssignments(): Promise<Record<string, string[]>> {
  const { data, error } = await supabase.from('project_assignments').select('project_id,email')
  if (error) throw error
  const m: Record<string, string[]> = {}
  for (const r of data as { project_id: string; email: string }[]) (m[r.project_id] ||= []).push(r.email)
  return m
}
export async function setProjectStaff(projectId: string, emails: string[]): Promise<void> {
  await supabase.from('project_assignments').delete().eq('project_id', projectId)
  if (emails.length) {
    const { error } = await supabase.from('project_assignments')
      .insert(emails.map((email) => ({ project_id: projectId, email })))
    if (error) throw error
  }
}

// in-app notifications
export interface AppNotification { id: string; title: string; body: string | null; link: string | null; read: boolean; created_at: string }
export async function notifyAssigned(emails: string[], projectName: string, projectId?: string): Promise<void> {
  if (!emails.length) return
  const link = projectId ? `/projects?p=${projectId}` : '/projects'
  const rows = emails.map((email) => ({ recipient_email: email, title: 'שויכת לפרויקט', body: projectName, link }))
  await supabase.from('notifications').insert(rows) // admin-only via RLS
}
export async function fetchMyNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase.from('notifications')
    .select('id,title,body,link,read,created_at').order('created_at', { ascending: false }).limit(30)
  if (error) throw error
  return data as AppNotification[]
}
export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from('notifications').update({ read: true }).eq('id', id)
}
export async function markAllNotificationsRead(): Promise<void> {
  await supabase.from('notifications').update({ read: true }).eq('read', false)
}
export async function updateProject(id: string, p: ProjectInput): Promise<void> {
  const { error } = await supabase.from('projects').update(cleanProject(p)).eq('id', id)
  if (error) throw error
}
export async function setProjectActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('projects').update({ active }).eq('id', id)
  if (error) throw error
}
/** Hard-delete a project. Refuses if it still has diary entries (those would be
 *  orphaned / FK-blocked) — deactivate such projects instead. Assignments and
 *  per-user priorities cascade away automatically. Admin-only via RLS. */
export async function deleteProject(id: string): Promise<void> {
  const { count, error: cErr } = await supabase
    .from('entries').select('id', { count: 'exact', head: true }).eq('project_id', id)
  if (cErr) throw cErr
  if ((count ?? 0) > 0) throw new Error('project_has_entries')
  const { error } = await supabase.from('projects').delete().eq('id', id)
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
  if (error) {
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
    const body = await ctx?.json?.().catch(() => null)
    throw new Error(body?.error ?? error.message)
  }
  const d = data as { error?: string } | null
  if (d?.error) throw new Error(d.error)
}
