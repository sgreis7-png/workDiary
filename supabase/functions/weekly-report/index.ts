// Turns the Sunday traffic-light snapshot into the weekly email a VP reads over coffee.
//
// Called by `traffic_light_weekly()` (pg_net, Task 8) with the snapshot's id and a shared
// secret in `x-report-secret`. Never invoked by a browser: this is server-to-server, so the
// recipient list never has to survive RLS or reach the client. `render.ts` (Task 6) is pure
// and already tested; this file only fetches rows, calls it once, and records what happened.
// pinned: floating @2 resolved to 2.112.2 whose esm.sh build is broken (postgrest submodule 404)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { cors, json } from '../_shared/cors.ts'
import { renderWeeklyReport, type ProjectLightLike, type TaskLike } from './render.ts'

const URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Agrotop Work Diary <onboarding@resend.dev>'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://work-diary-phi.vercel.app'
const REPORT_SECRET = Deno.env.get('REPORT_SECRET')

/** Constant-time string compare — a naive `===` short-circuits on the first mismatched byte,
 * which leaks the secret's length and prefix through response timing. Both inputs are hashed
 * to a fixed-length digest first so even a length difference does not vary the comparison time. */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const va = new Uint8Array(da)
  const vb = new Uint8Array(db)
  let diff = 0
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i]
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // A function that accepts anything while unconfigured is worse than one switched off —
  // refuse every request until the deployer sets REPORT_SECRET, and say so distinctly from
  // "wrong secret" so a misconfiguration doesn't look like an attack (or vice versa).
  if (!REPORT_SECRET) return json({ error: 'not_configured' }, 500)

  const supplied = req.headers.get('x-report-secret') ?? ''
  if (!(await timingSafeEqual(supplied, REPORT_SECRET))) return json({ error: 'unauthorized' }, 401)

  const db = createClient(URL, SERVICE)

  try {
    const { snapshot_id } = await req.json().catch(() => ({}))
    const snapshotId = String(snapshot_id ?? '')
    if (!snapshotId) return json({ error: 'missing_snapshot_id' }, 400)

    const { data: snapshot, error: snapErr } = await db
      .from('traffic_light_snapshots')
      .select('id,taken_at,payload')
      .eq('id', snapshotId)
      .maybeSingle()
    if (snapErr || !snapshot) {
      if (snapErr) console.error('snapshot lookup failed', snapErr.message)
      return json({ error: 'snapshot_not_found', snapshot_id: snapshotId }, 404)
    }

    const { data: taskRows, error: taskErr } = await db
      .from('work_tasks')
      .select('title,assignee_email,due_date,project_id,axis')
      .eq('source', 'traffic_light')
      .eq('status', 'open')
    if (taskErr) console.error('task lookup failed', taskErr.message)
    const tasks: TaskLike[] = taskRows ?? []

    const recipients = await collectRecipients(db)

    // Nobody to mail is a real outcome, not an error — but it is never "sent", so answer 0
    // and skip Resend entirely rather than burning a send on an empty bcc.
    if (recipients.length === 0) return json({ ok: true, recipients: 0 })

    // A snapshot written by an older schema could carry something other than an array; the
    // renderer iterates it, so coerce here instead of throwing a 500 at the cron job.
    const payload: ProjectLightLike[] = Array.isArray(snapshot.payload) ? snapshot.payload : []
    const { subject, html } = renderWeeklyReport({
      payload,
      tasks,
      takenAt: String(snapshot.taken_at ?? ''),
      appUrl: APP_URL,
    })

    let httpStatus: number
    let errorText: string | null = null
    if (!RESEND_KEY) {
      httpStatus = 500
      errorText = 'email_not_configured'
      console.error('resend key missing')
    } else {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        // Recipients ride in bcc so no manager sees the distribution list; `to` is the sending
        // identity itself, which Resend requires to be present.
        body: JSON.stringify({ from: RESEND_FROM, to: [RESEND_FROM], bcc: recipients, subject, html }),
      })
      httpStatus = r.status
      if (!r.ok) {
        errorText = (await r.text().catch(() => '')).slice(0, 500)
        console.error('resend failed', r.status, errorText)
      }
    }

    // Record the outcome even on failure — a silently swallowed Resend error is exactly the
    // kind of thing that only surfaces when someone asks why the Sunday mail never arrived.
    // The table itself arrives with Task 8's migration, so a failing insert must not turn a
    // sent mail into a 500: log it and keep the send's own status as the answer.
    const { error: logErr } = await db.from('report_mail_log').insert({
      snapshot_id: snapshotId,
      recipient_count: recipients.length,
      http_status: httpStatus,
      error: errorText,
    })
    if (logErr) console.error('report_mail_log insert failed', logErr.message)

    return json({ ok: httpStatus >= 200 && httpStatus < 300, recipients: recipients.length }, httpStatus)
  } catch (e) {
    console.error('weekly-report failed', (e as Error)?.message ?? e)
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})

/** Admins/managers plus whatever extra addresses the settings row carries. Lowercased and
 * de-duplicated because the same person can sit in both lists under different casing, and a
 * duplicate bcc means the same manager gets the report twice. */
async function collectRecipients(db: ReturnType<typeof createClient>): Promise<string[]> {
  const [{ data: adminRows, error: aErr }, extra] = await Promise.all([
    db.from('allowed_emails').select('email').eq('active', true).in('role', ['admin', 'manager']),
    fetchExtraEmails(db),
  ])
  if (aErr) console.error('allowed_emails lookup failed', aErr.message)
  const all = [...(adminRows ?? []).map((r: { email: string }) => r.email), ...extra]
  const seen = new Set<string>()
  for (const raw of all) {
    const e = String(raw ?? '').trim().toLowerCase()
    if (e.includes('@')) seen.add(e)
  }
  return [...seen]
}

/** `extra_report_emails` is added by Task 8's migration. Until that lands PostgREST answers
 * this select with a "column does not exist" error rather than a row, so treat every failure
 * — missing column, missing row, null value — as "no extras", and let the column start
 * working on its own the moment it exists, with no redeploy. */
async function fetchExtraEmails(db: ReturnType<typeof createClient>): Promise<string[]> {
  try {
    const { data, error } = await db
      .from('traffic_light_settings')
      .select('extra_report_emails')
      .eq('id', 1)
      .maybeSingle()
    if (error) return []
    const list = (data as { extra_report_emails?: string[] | null } | null)?.extra_report_emails
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
