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
  // allowed_emails is admin-only; this asks the server to filter the list we already
  // have rather than handing the whole roster back to be filtered here
  const { data, error } = await supabase.rpc('active_recipients', { p_emails: wanted })
  // Fail loudly rather than silently dropping every notification: an empty
  // result from a transient error is indistinguishable from "nobody is active".
  if (error) throw error
  return ((data ?? []) as { email: string }[]).map((r) => r.email.toLowerCase())
}

/**
 * Notify every given address that is still an active member. Never throws.
 * Returns the addresses actually written, so callers that also need the
 * filtered list (push fan-out) do not have to filter a second time.
 */
export async function notifyMany(
  emails: string[],
  n: { title: string; body?: string; link?: string },
): Promise<string[]> {
  const to = await activeRecipients(emails).catch(() => [] as string[])
  if (!to.length) return []
  const rows = to.map((recipient_email) => ({
    recipient_email, title: n.title, body: n.body ?? '', link: n.link ?? '/',
  }))
  const { error } = await supabase.from('notifications').insert(rows)
  if (error) {
    // A recipient may have been deactivated between the filter and the insert;
    // fall back to per-row so one bad address cannot mute everyone else.
    await Promise.all(rows.map((r) =>
      supabase.from('notifications').insert(r).then(() => {}, () => {})))
  }
  return to
}
