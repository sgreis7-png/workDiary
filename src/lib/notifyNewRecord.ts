// New-record fan-out: admins + project staff + 'filled'-rule subscribers get
// an in-app notification + web push the moment a record is created.
// Fire-and-forget — never blocks or fails a save.
import { supabase } from './supabase'
import { sendPush } from './push'

async function recipients(projectId: string): Promise<string[]> {
  const { data: u } = await supabase.auth.getUser()
  const me = u.user?.email?.toLowerCase()
  const [admins, assigned, subscribed] = await Promise.all([
    supabase.rpc('admin_emails').then((r) => (r.data as string[] | null) ?? []),
    supabase.from('project_assignments').select('email').eq('project_id', projectId)
      .then((r) => ((r.data as { email: string }[] | null) ?? []).map((x) => x.email)),
    supabase.rpc('filled_rule_emails', { pid: projectId }).then((r) => (r.data as string[] | null) ?? []),
  ])
  return [...new Set([...admins, ...assigned, ...subscribed].map((e) => e.toLowerCase()))]
    .filter((e) => e && e !== me)
}

async function fanOut(emails: string[], title: string, body: string, link: string): Promise<void> {
  if (!emails.length) return
  await supabase.from('notifications').insert(
    emails.map((recipient_email) => ({ recipient_email, title, body, link })),
  )
  sendPush(emails, title, body, link)
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
