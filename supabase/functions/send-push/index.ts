// Send Web Push notifications to users' subscribed devices. Called by the app
// (authed users) on chat messages / assignments; recipients are looked up in
// push_subscriptions. Dead subscriptions are pruned on 404/410.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { cors, json } from '../_shared/cors.ts'

const URL_ = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:haim036688893@gmail.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(URL_, ANON, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user?.email) return json({ error: 'unauthorized' }, 401)
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ error: 'push_not_configured' }, 500)

    const { emails = [], title = '', body = '', link = '/' } = await req.json()
    const asked = [...new Set((emails as string[]).filter((e) => typeof e === 'string' && e.includes('@')).map((e) => e.toLowerCase()))]
    if (!asked.length || !title) return json({ error: 'missing_fields' }, 400)

    const db = createClient(URL_, SERVICE)

    // A valid session alone is not enough: without this, any account — including
    // one that never passed `register` — could push arbitrary text and deep links
    // to every real user's phone. Sender must be an active member, and only
    // active members can be targeted.
    const { data: members } = await db.from('allowed_emails').select('email').eq('active', true)
    const active = new Set((members ?? []).map((m: { email: string }) => m.email.toLowerCase()))
    if (!active.has(user.email.toLowerCase())) return json({ error: 'forbidden' }, 403)
    const clean = asked.filter((e) => active.has(e))
    if (!clean.length) return json({ ok: true, sent: 0 })

    const { data: allowed } = await db.rpc('rl_check', { p_actor: user.id, p_action: 'push', p_max: 120, p_window_seconds: 3600 })
    if (allowed === false) return json({ error: 'rate_limited' }, 429)

    const { data: subs } = await db.from('push_subscriptions').select('*').in('email', clean)
    if (!subs?.length) return json({ ok: true, sent: 0 })

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
    const payload = JSON.stringify({ title, body, link })
    let sent = 0
    await Promise.all(subs.map(async (s: { email: string; endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) {
          await db.from('push_subscriptions').delete().eq('email', s.email).eq('endpoint', s.endpoint)
        }
      }
    }))
    return json({ ok: true, sent })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
