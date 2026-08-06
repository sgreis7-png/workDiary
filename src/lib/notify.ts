// Single entry point for creating in-app notifications.
//
// Two rules the RLS policy enforces and every caller kept getting wrong:
//   * only an active member may be a recipient, so recipient lists built from
//     project_assignments / alert_rules — which still list people an admin has
//     since deactivated — must be filtered first;
//   * a multi-row insert is rejected as a whole, so one stale address would
//     silently mute the entire fan-out.
// Filtering at the source fixes both, and keeps the common case to one insert.
import { supabase } from './supabase'

/** Keep only addresses that are still active members. */
export async function activeRecipients(emails: string[]): Promise<string[]> {
  const wanted = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))]
  if (!wanted.length) return []
  const { data } = await supabase.from('allowed_emails').select('email').eq('active', true)
  const active = new Set(((data ?? []) as { email: string }[]).map((r) => r.email.toLowerCase()))
  return wanted.filter((e) => active.has(e))
}

/** Notify every given address that is still an active member. Never throws. */
export async function notifyMany(
  emails: string[],
  n: { title: string; body?: string; link?: string },
): Promise<void> {
  const to = await activeRecipients(emails)
  if (!to.length) return
  const rows = to.map((recipient_email) => ({
    recipient_email, title: n.title, body: n.body ?? '', link: n.link ?? '/',
  }))
  const { error } = await supabase.from('notifications').insert(rows)
  if (!error) return
  // A recipient may have been deactivated between the filter and the insert;
  // fall back to per-row so one bad address cannot mute everyone else.
  await Promise.all(rows.map((r) =>
    supabase.from('notifications').insert(r).then(() => {}, () => {})))
}
