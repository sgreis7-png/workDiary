// Email a coop (לול) stage-gate QC report via Resend. The report HTML is built by
// the app (checklist texts live in app code, not the DB) and passed in; this
// function authenticates, rate-limits, validates the coop, and sends.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors, json } from '../_shared/cors.ts'

const URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Agrotop Work Diary <onboarding@resend.dev>'
const VERIFIED_DOMAIN = (Deno.env.get('VERIFIED_FROM_DOMAIN') ?? '').toLowerCase()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user?.email) return json({ error: 'unauthorized' }, 401)

    const { coop_id, emails = [], subject = '', html = '', text = '' } = await req.json()
    if (!coop_id || !html) return json({ error: 'missing_fields' }, 400)
    if (!RESEND_KEY) return json({ error: 'email_not_configured' }, 500)

    const db = createClient(URL, SERVICE)

    const { data: allowed } = await db.rpc('rl_check', { p_actor: user.id, p_action: 'send', p_max: 30, p_window_seconds: 3600 })
    if (allowed === false) return json({ error: 'rate_limited' }, 429)

    const { data: coop } = await db.from('coops').select('id,name,project_id').eq('id', coop_id).single()
    if (!coop) return json({ error: 'coop_not_found' }, 404)
    const { data: project } = await db.from('projects').select('name').eq('id', coop.project_id).single()

    const recipients = new Set<string>()
    for (const e of emails) if (typeof e === 'string' && e.includes('@')) recipients.add(e.trim())
    if (recipients.size === 0) return json({ error: 'no_recipients' }, 400)

    const { data: sender } = await db.from('profiles').select('name').eq('id', user.id).single()
    const senderName = sender?.name ?? user.email.split('@')[0]

    const finalSubject = String(subject).trim()
      || `תפיסת סיום שלב · ${project?.name ?? ''} · לול ${coop.name}`

    const onVerified = VERIFIED_DOMAIN && user.email.toLowerCase().endsWith('@' + VERIFIED_DOMAIN)
    const from = onVerified ? `${senderName} <${user.email}>` : RESEND_FROM

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [...recipients], reply_to: user.email, subject: finalSubject, html, text: text || undefined }),
    })
    if (!res.ok) return json({ error: `resend_failed: ${await res.text()}` }, 502)

    return json({ ok: true, sent_to: recipients.size, from })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
