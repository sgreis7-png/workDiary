// All Supabase data access. Function names mirror the old mock helpers so screens
// read the same — only now they're async and hit the real database.
import { supabase } from './lib/supabase'
import { signPaths, unwrapFnError } from './lib/storagePaths'
import { notifyMany } from './lib/notify'
import { notifyNewEntry } from './lib/notifyNewRecord'
import { entryMatchesText, hasMalfunction, deptIdOf, MALFUNCTION_DEPT_KEY } from './data'
import type { AppUser, Entry, FieldDef, Project, ProjectInput, SearchFilters } from './data'

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

type EntryRow = Omit<Entry, 'photos'> & { entry_photos: { storage_path: string }[] | null }
const ENTRY_SELECT = 'id,project_id,created_by,work_date,created_at,last_sent_at,values,entry_photos(storage_path)'

/** Rows to entries.
 *
 *  `sign` is off for callers that only want the numbers: signing mints a URL for every photo of
 *  every row, and a chart, a digest or a CSV export never displays one. `photo_count` stays
 *  right either way, so a caller that just wants "how many" does not pay for the URLs. */
async function hydrate(rows: EntryRow[], sign = true): Promise<Entry[]> {
  const signed = sign
    ? await signPaths(rows.flatMap((r) => (r.entry_photos ?? []).map((p) => p.storage_path)))
    : {}
  return rows.map((r) => ({
    id: r.id, project_id: r.project_id, created_by: r.created_by,
    work_date: r.work_date ?? '', created_at: r.created_at, last_sent_at: r.last_sent_at,
    values: r.values ?? {},
    photos: sign ? (r.entry_photos ?? []).map((p) => signed[p.storage_path]).filter(Boolean) : [],
    photo_count: (r.entry_photos ?? []).length,
  }))
}

// ---------- entries ----------

/** Entries, newest first. Pass `photos: false` when the caller only needs the numbers. */
export async function listEntries(
  projectId?: string,
  opts?: { limit?: number; offset?: number; from?: string; to?: string; photos?: boolean },
): Promise<Entry[]> {
  let q = supabase.from('entries').select(ENTRY_SELECT).order('work_date', { ascending: false })
  if (projectId) q = q.eq('project_id', projectId)
  if (opts?.from) q = q.gte('work_date', opts.from)
  if (opts?.to) q = q.lte('work_date', opts.to)
  if (opts?.limit != null) q = q.range(opts.offset ?? 0, (opts.offset ?? 0) + opts.limit - 1)
  const { data, error } = await q
  if (error) throw error
  return hydrate((data ?? []) as unknown as EntryRow[], opts?.photos !== false)
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

/** Save a new entry.
 *
 *  `entryId` makes this idempotent, and every automatic caller passes one. Without it a save
 *  that got the row in but failed partway through its photos would be retried — by the offline
 *  queue, or by the user pressing save again — and produce a *second* entry rather than
 *  finishing the first. With it the row upserts and the photos land on the paths they were
 *  always going to have, so a retry converges instead of duplicating.
 *
 *  Left optional because the id has to survive the same trip as the work it belongs to: the
 *  queue row carries it, the draft carries it, and a caller with neither still works. */
export async function createEntry(
  project_id: string, values: Record<string, string>, files: File[], entryId?: string,
): Promise<string> {
  const { data: u } = await supabase.auth.getUser()
  const uid = u.user?.id
  if (!uid) throw new Error('not authenticated')

  const id = entryId ?? crypto.randomUUID()
  const { error } = await supabase.from('entries')
    .upsert({ id, project_id, created_by: uid, work_date: values.work_date || null, values },
      { onConflict: 'id' })
  if (error) throw error

  await savePhotos(id, files)
  notifyNewEntry(project_id, id)
  return id
}

/** Upload an entry's photos and record them.
 *
 *  In parallel: a field report carries ten photos over a phone connection, and one after
 *  another made the save take ten round trips it did not need. Each photo's own name comes from
 *  a UUID, so nothing depends on the order they finish in.
 *
 *  allSettled rather than all: if one photo fails we still want the others recorded, and we
 *  want them finished rather than abandoned mid-flight before the error surfaces. The failure
 *  is then raised, exactly as before — an entry saved with some of its photos is the documented
 *  outcome, and the user is told. */
async function savePhotos(entryId: string, files: File[]): Promise<void> {
  if (!files.length) return
  const results = await Promise.allSettled(files.map(async (f, i) => {
    const safe = f.name.replace(/[^\w.-]+/g, '_')
    // Position, not a fresh uuid: the path a photo gets must be the same on a retry, or the
    // retry uploads the file again under a new name and the entry ends up with doubles. The
    // index keeps two files of the same name apart.
    const path = `${entryId}/${i}-${safe}`
    const { error: upErr } = await supabase.storage.from('photos').upload(path, f, { upsert: true })
    if (upErr) throw upErr
    const { error: pErr } = await supabase.from('entry_photos')
      .upsert({ entry_id: entryId, storage_path: path }, { onConflict: 'storage_path' })
    if (pErr) throw pErr
  }))
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed) throw failed.reason
}

/** Add photos to an entry that already has some. Unlike savePhotos this cannot key the path
 *  on position — position 0 is already taken — so it keeps a uuid and is not idempotent. That is
 *  the right trade here: editing is a deliberate act with no automatic retry behind it. */
async function addPhotos(entryId: string, files: File[]): Promise<void> {
  if (!files.length) return
  const results = await Promise.allSettled(files.map(async (f) => {
    const safe = f.name.replace(/[^\w.-]+/g, '_')
    const path = `${entryId}/${crypto.randomUUID()}-${safe}`
    const { error: upErr } = await supabase.storage.from('photos').upload(path, f)
    if (upErr) throw upErr
    const { error: pErr } = await supabase.from('entry_photos').insert({ entry_id: entryId, storage_path: path })
    if (pErr) throw pErr
  }))
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed) throw failed.reason
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

  if (removedPaths.length) {
    // The row is the source of truth for what the report shows, so a failure here must
    // surface: silently keeping a photo the user deleted is worse than failing the save. A
    // leftover storage object is only wasted bytes. Both calls take the whole list — one
    // round trip instead of two per deleted photo.
    const { error: rowErr } = await supabase.from('entry_photos').delete().in('storage_path', removedPaths)
    if (rowErr) throw rowErr
    await supabase.storage.from('photos').remove(removedPaths)
  }
  await addPhotos(id, newFiles)
}

export async function deleteEntry(id: string): Promise<void> {
  const { data } = await supabase.from('entry_photos').select('storage_path').eq('entry_id', id)
  const paths = (data ?? []).map((r: { storage_path: string }) => r.storage_path)

  // The row goes first. This used to run the other way round, so a row delete that failed —
  // an RLS refusal is enough — left the diary showing an entry whose images were already gone.
  // In this order a failure after the row is deleted only leaks bytes, which is recoverable.
  const { error } = await supabase.from('entries').delete().eq('id', id)
  if (error) throw error
  if (paths.length) await supabase.storage.from('photos').remove(paths)
}

export interface DashboardStats {
  total: number; this_week: number
  this_month?: number; total_photos?: number; unsent?: number
  malfunctions_this_month?: number
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

/** Cap on rows fetched for one search. The server-side filter below has already thrown out
 *  almost everything irrelevant, so this is a guard against a single-letter search pulling the
 *  whole diary — not the page size of a browsable list. */
const SEARCH_LIMIT = 400

export interface SearchResult {
  rows: Entry[]
  /** The cap was reached, so older matches beyond it were not considered. Worth saying out
   *  loud: the rows that come back look like a complete answer and are not one. */
  truncated: boolean
}

export async function searchEntries(f: SearchFilters, opts?: { photos?: boolean }): Promise<SearchResult> {
  let q = supabase.from('entries').select(ENTRY_SELECT).order('work_date', { ascending: false })
  if (f.projectId) q = q.eq('project_id', f.projectId)
  if (f.userId) q = q.eq('created_by', f.userId)
  if (f.from) q = q.gte('work_date', f.from)
  if (f.to) q = q.lte('work_date', f.to)

  // Narrow in Postgres before anything crosses the wire. `values_text` (migration 0047) is the
  // entry's searchable text, trigram-indexed; one ilike per whitespace-separated token.
  //
  // This is deliberately looser than the real rules — it matches JSON keys and syntax too, and
  // any % or _ the user typed acts as a wildcard. That is the safe direction: every entry
  // entryMatchesText would accept is in here, because a token has no spaces and so cannot
  // straddle two table cells. The exact predicate below then decides.
  for (const token of (f.text ?? '').trim().split(/\s+/).filter(Boolean)) {
    q = q.ilike('values_text', `%${token}%`)
  }
  // one more than the cap, purely to find out whether there would have been more
  q = q.limit(SEARCH_LIMIT + 1)

  const { data, error } = await q
  if (error) throw error
  const raw = (data ?? []) as unknown as EntryRow[]
  const truncated = raw.length > SEARCH_LIMIT
  let entries = await hydrate(raw.slice(0, SEARCH_LIMIT), opts?.photos !== false)
  if (f.text) entries = entries.filter((e) => entryMatchesText(e.values, f.text!))
  if (f.malfunction) {
    if (f.malfunction === 'any') entries = entries.filter((e) => hasMalfunction(e.values))
    else if (f.malfunction === 'none') entries = entries.filter((e) => !hasMalfunction(e.values))
    else entries = entries.filter((e) => deptIdOf(e.values[MALFUNCTION_DEPT_KEY]) === f.malfunction)
  }
  return { rows: entries, truncated }
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

/** Who manages each project, keyed by project id. Separate from fetchAssignments because most
 *  screens only care who is on a project, not who runs it. */
export async function fetchProjectManagers(): Promise<Record<string, string[]>> {
  const { data, error } = await supabase.from('project_assignments')
    .select('project_id,email').eq('is_manager', true)
  if (error) throw error
  const m: Record<string, string[]> = {}
  for (const r of data as { project_id: string; email: string }[]) (m[r.project_id] ||= []).push(r.email)
  return m
}
/** Replace a project's assignments in one transaction.
 *
 *  This used to delete every row and then insert the replacements as two separate
 *  requests. A failure in between — a dropped connection on a phone is enough — left the
 *  project with nobody assigned while the UI had already moved on. */
export async function setProjectStaff(
  projectId: string, emails: string[], managers: string[] = [],
): Promise<void> {
  const { error } = await supabase.rpc('set_project_staff', {
    p_project: projectId,
    p_emails: emails,
    // a manager must also be assigned, or nothing would reach them
    p_managers: managers.filter((m) => emails.includes(m)),
  })
  if (error) throw error
}

// in-app notifications
export interface AppNotification { id: string; title: string; body: string | null; link: string | null; read: boolean; created_at: string }
export async function notifyAssigned(emails: string[], projectName: string, projectId?: string): Promise<void> {
  await notifyMany(emails, {
    title: 'שויכת לפרויקט',
    body: projectName,
    link: projectId ? `/projects?p=${projectId}` : '/projects',
  })
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
/** Hard-delete a project AND all its diary entries (entry photos cascade in the DB;
 *  assignments + per-user priorities cascade too). Irreversible. Admin-only via RLS.
 *  Returns how many entries were removed so the UI can report it. */
export async function deleteProject(id: string): Promise<number> {
  const { data: rows } = await supabase
    .from('entries').select('id,entry_photos(storage_path)').eq('project_id', id)
  const entries = (rows ?? []) as { id: string; entry_photos: { storage_path: string }[] | null }[]
  // Collected before the rows go, because afterwards there is nothing left to ask. This step
  // did not exist: the photo rows cascaded in the database and the files themselves stayed in
  // the bucket for good — readable by anyone the bucket lets in, long after the project was
  // "hard deleted".
  const paths = entries.flatMap((e) => (e.entry_photos ?? []).map((p) => p.storage_path))

  const { error: eErr } = await supabase.from('entries').delete().eq('project_id', id)
  if (eErr) throw eErr
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
  // Last, and unguarded: the rows are already gone, so a storage failure here leaves bytes
  // behind rather than a half-deleted project. Storage takes at most 1000 keys per call.
  for (let i = 0; i < paths.length; i += 1000) {
    await supabase.storage.from('photos').remove(paths.slice(i, i + 1000))
  }
  return entries.length
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

// ---------- roster ----------

/** Name and address of every active, registered member.
 *
 *  Screens that only need to put people in a picker use this. It comes from a function
 *  rather than from allowed_emails, which is admin-only: a member has no business reading
 *  colleagues' roles or account state to fill a dropdown. */
export interface DirectoryMember { email: string; name: string }

export async function fetchMemberDirectory(): Promise<DirectoryMember[]> {
  const { data, error } = await supabase.rpc('member_directory')
  if (error) throw error
  return (data ?? []) as DirectoryMember[]
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

/** Pending registration codes, keyed by lowercase email. Admin-only by RLS —
 *  members get an empty map rather than an error. */
export async function fetchRegistrationCodes(): Promise<Record<string, string>> {
  const { data } = await supabase.from('registration_codes').select('email,code')
  const m: Record<string, string> = {}
  for (const r of (data ?? []) as { email: string; code: string }[]) m[r.email.toLowerCase()] = r.code
  return m
}
export async function inviteUser(email: string, display_name: string, role: AppUser['role'] = 'member'): Promise<string> {
  // No email is sent: the row authorizes the address, and the DB default mints a
  // one-time registration code. The admin passes that code to the worker out of
  // band — without it, knowing an allowlisted address is not enough to claim the
  // account. Returns the code so the admin screen can show it.
  const { error } = await supabase
    .from('allowed_emails')
    .upsert({ email: email.trim(), display_name, role }, { onConflict: 'email' })
  if (error) throw error
  const { data, error: cErr } = await supabase.rpc('issue_registration_code', { p_email: email.trim() })
  if (cErr) throw cErr
  return (data as string) ?? ''
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
  await unwrapFnError(error, data as { error?: string } | null)
}

/** Company addresses for the recipient picker. The company-domain + active-member
 *  filter lives in the `mail_directory()` definer function, so it is enforced by
 *  the database rather than by this client. */
export async function fetchDirectory(): Promise<{ name: string; email: string }[]> {
  const { data, error } = await supabase.rpc('mail_directory')
  if (error) throw error
  return (data ?? []) as { name: string; email: string }[]
}

/** "Forgot password" — asks the reset-password edge fn to email a recovery link. */
export async function requestPasswordReset(email: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('reset-password', { body: { email } })
  await unwrapFnError(error, data as { error?: string } | null)
}

/** Current user changes their own password. */
export async function changeMyPassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

// Reports are emailed from the browser through the user's own Outlook mailbox
// (src/lib/outlookSend.ts). The former Resend path (`sendEntry` + the send-entry
// edge function) carried a second, drifted copy of the report template and was
// removed — see docs in README.
