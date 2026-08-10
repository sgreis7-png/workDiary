// Send a report by email, server-side.
//
// This restores the behaviour that commit aefc274 replaced and 2f00435 deleted. Sending used to
// be one button press; it became a Microsoft sign-in with a consent prompt, because the report
// was switched to Microsoft Graph from the user's own mailbox. That path needs the tenant to
// consent to Mail.Send and the app's redirect URI registered in Azure — until both are true it
// cannot succeed no matter what the user clicks, and the popup fails on an installed PWA in any
// case.
//
// So the default is a plain server-side send again. The Outlook path stays in the client for
// anyone who specifically wants the copy in their own Sent Items.
//
// The caller passes the finished HTML, which is the same HTML the report screen already renders
// and already lets the user copy — so there is no second implementation of the report layout to
// keep in step with the first.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors, json } from '../_shared/cors.ts'

const URL_ = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
// Used when the sender's own address is not on a Resend-verified domain.
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Agrotop Work Diary <onboarding@resend.dev>'
// Set to the domain verified in Resend (e.g. "agrotop.co.il") to send as each user.
const VERIFIED_DOMAIN = (Deno.env.get('VERIFIED_FROM_DOMAIN') ?? '').toLowerCase()

const MAX_RECIPIENTS = 50

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    // The sender is whoever holds the token — never taken from the body, or anyone could send
    // as anyone.
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user?.email) return json({ error: 'unauthorized' }, 401)
    if (!RESEND_KEY) return json({ error: 'email_not_configured' }, 500)

    const body = await req.json().catch(() => null) as {
      subject?: string; html?: string; to?: unknown; list_ids?: unknown
    } | null
    const subject = (body?.subject ?? '').trim()
    const html = body?.html ?? ''
    if (!subject || !html) return json({ error: 'missing_subject_or_body' }, 400)

    const db = createClient(URL_, SERVICE)

    // Only an active member may send, and only 30 sends an hour. Both checks already exist for
    // the other functions; reusing them keeps one definition of "may act".
    const { data: member } = await db
      .from('allowed_emails').select('active')
      .eq('email', user.email.toLowerCase()).maybeSingle()
    if (!member?.active) return json({ error: 'not_a_member' }, 403)

    const { data: allowed } = await db.rpc('rl_check', {
      p_actor: user.id, p_action: 'send', p_max: 30, p_window_seconds: 3600,
    })
    if (allowed === false) return json({ error: 'rate_limited' }, 429)

    const recipients = new Set<string>()
    for (const e of Array.isArray(body?.to) ? body!.to : []) {
      if (typeof e === 'string' && e.includes('@')) recipients.add(e.trim().toLowerCase())
    }
    const listIds = Array.isArray(body?.list_ids) ? body!.list_ids.filter((x) => typeof x === 'string') : []
    if (listIds.length) {
      const { data: recs } = await db.from('list_recipients').select('email').in('list_id', listIds)
      for (const r of (recs ?? []) as { email: string }[]) if (r.email) recipients.add(r.email.toLowerCase())
    }
    if (recipients.size === 0) return json({ error: 'no_recipients' }, 400)
    if (recipients.size > MAX_RECIPIENTS) return json({ error: 'too_many_recipients' }, 400)

    // Send as the user when their domain is verified, so the report arrives from the person who
    // sent it. Otherwise from the system address with reply-to set to them, which is the most
    // an unverified domain allows without the mail being rejected as a forgery.
    const senderDomain = user.email.split('@')[1]?.toLowerCase() ?? ''
    const asUser = Boolean(VERIFIED_DOMAIN) && senderDomain === VERIFIED_DOMAIN
    const { data: profile } = await db.from('profiles').select('name').eq('id', user.id).maybeSingle()
    const senderName = (profile as { name?: string } | null)?.name ?? user.email.split('@')[0]

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: asUser ? `${senderName} <${user.email}>` : RESEND_FROM,
        reply_to: user.email,
        to: [...recipients],
        subject,
        html,
      }),
    })
    if (!r.ok) {
      // Hand the provider's reason back: "your domain is not verified" is something the admin
      // can act on, and swallowing it is how this became a mystery in the first place.
      const detail = await r.text().catch(() => '')
      return json({ error: 'send_failed', status: r.status, detail: detail.slice(0, 400) }, 502)
    }

    return json({ ok: true, sent: recipients.size, from: asUser ? user.email : 'system' })
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500)
  }
})
