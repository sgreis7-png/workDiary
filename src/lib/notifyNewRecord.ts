// New-record fan-out: admins + project staff + 'filled'-rule subscribers get
// an in-app notification + web push the moment a record is created.
// Fire-and-forget — never blocks or fails a save.
import { supabase } from './supabase'
import { sendPush } from './push'
import { notifyMany } from './notify'

/**
 * Who hears about this project: admins, company managers, and the people assigned to it —
 * workers and its project managers alike. Nobody else, so a member with no connection to a
 * project is never told about it.
 *
 * The rule lives in project_notify_emails() rather than here. It was assembled client-side from
 * three separate reads, which meant every future caller had to remember the same three, and one
 * of them read the whole assignment table to filter it locally.
 */
async function recipients(projectId: string, opts?: { managersOnly?: boolean }): Promise<string[]> {
  const { data: u } = await supabase.auth.getUser()
  const me = u.user?.email?.toLowerCase() ?? null
  const [{ data: audience }, subscribed] = await Promise.all([
    supabase.rpc('project_notify_emails', { p_project: projectId, p_exclude: me }),
    // people who explicitly asked to hear about this project, whatever their role
    supabase.rpc('filled_rule_emails', { pid: projectId }).then((r) => (r.data as string[] | null) ?? []),
  ])
  const rows = (audience ?? []) as { email: string; is_manager: boolean }[]
  const chosen = opts?.managersOnly ? rows.filter((r) => r.is_manager) : rows
  const extra = opts?.managersOnly ? [] : subscribed
  return [...new Set([...chosen.map((r) => r.email), ...extra].map((e) => e.toLowerCase()))]
    .filter((e) => e && e !== me)
}

async function fanOut(emails: string[], title: string, body: string, link: string): Promise<void> {
  // notifyMany reports who it actually wrote to, so push reuses that list
  // instead of resolving the active allowlist a second time
  const notified = await notifyMany(emails, { title, body, link })
  if (notified.length) sendPush(notified, title, body, link)
}

/** רשומת יומן עבודה חדשה */
export function notifyNewEntry(projectId: string, entryId: string): void {
  ;(async () => {
    const [{ data: p }, emails] = await Promise.all([
      supabase.from('projects').select('name').eq('id', projectId).maybeSingle(),
      recipients(projectId),
    ])
    const name = (p as { name: string } | null)?.name ?? ''
    await fanOut(emails, `רשומה חדשה ביומן עבודה — ${name}`, '', `/entry/${entryId}`)
  })().catch(() => {})
}

/** ליקוי חדש */
export function notifyNewDefect(coopId: string, description?: string | null): void {
  ;(async () => {
    const { data: c } = await supabase.from('coops').select('name,project_id').eq('id', coopId).maybeSingle()
    const coop = c as { name: string; project_id: string } | null
    if (!coop) return
    const [{ data: p }, emails] = await Promise.all([
      supabase.from('projects').select('name').eq('id', coop.project_id).maybeSingle(),
      recipients(coop.project_id),
    ])
    const pname = (p as { name: string } | null)?.name ?? ''
    await fanOut(emails, `ליקוי חדש — ${pname} · ${coop.name}`, description ?? '', `/defects/coop/${coopId}`)
  })().catch(() => {})
}

/** רשומת יומן עודכנה — the diary is the project record, so an edit matters as much as a create. */
export function notifyEntryEdited(projectId: string, entryId: string): void {
  ;(async () => {
    const [{ data: p }, emails] = await Promise.all([
      supabase.from('projects').select('name').eq('id', projectId).maybeSingle(),
      // only the people answerable for the project: an edit is quieter news than a new record,
      // and everyone assigned would be told twice about the same day's work
      recipients(projectId, { managersOnly: true }),
    ])
    const name = (p as { name: string } | null)?.name ?? ''
    await fanOut(emails, `רשומה עודכנה — ${name}`, '', `/entry/${entryId}`)
  })().catch(() => {})
}

/** ליקוי נסגר */
export function notifyDefectClosed(coopId: string, description?: string | null): void {
  ;(async () => {
    const { data: c } = await supabase.from('coops').select('name,project_id').eq('id', coopId).maybeSingle()
    const coop = c as { name: string; project_id: string } | null
    if (!coop) return
    const [{ data: p }, emails] = await Promise.all([
      supabase.from('projects').select('name').eq('id', coop.project_id).maybeSingle(),
      recipients(coop.project_id, { managersOnly: true }),
    ])
    const pname = (p as { name: string } | null)?.name ?? ''
    await fanOut(emails, `ליקוי נסגר — ${pname} · ${coop.name}`, description ?? '', `/defects/coop/${coopId}`)
  })().catch(() => {})
}

/** שער נחתם — the approval itself, which the people answerable asked to be told about. */
export function notifyGateSigned(coopId: string, gateLabel: string, signerName: string): void {
  ;(async () => {
    const { data: c } = await supabase.from('coops').select('name,project_id').eq('id', coopId).maybeSingle()
    const coop = c as { name: string; project_id: string } | null
    if (!coop) return
    const [{ data: p }, emails] = await Promise.all([
      supabase.from('projects').select('name').eq('id', coop.project_id).maybeSingle(),
      recipients(coop.project_id, { managersOnly: true }),
    ])
    const pname = (p as { name: string } | null)?.name ?? ''
    await fanOut(emails, `שער נחתם — ${pname} · ${coop.name}`,
      `${gateLabel} · ${signerName}`, `/defects/coop/${coopId}`)
  })().catch(() => {})
}

/** לוח הזמנים שונה. Batched by the caller: one notice per save, not per dragged bar. */
export function notifyScheduleChanged(projectId: string, changed: number): void {
  ;(async () => {
    const [{ data: p }, emails] = await Promise.all([
      supabase.from('projects').select('name').eq('id', projectId).maybeSingle(),
      recipients(projectId, { managersOnly: true }),
    ])
    const name = (p as { name: string } | null)?.name ?? ''
    await fanOut(emails, `לוח הזמנים עודכן — ${name}`,
      changed === 1 ? 'משימה אחת שונתה' : `${changed} משימות שונו`, `/gantt?project=${projectId}`)
  })().catch(() => {})
}
