// "Forgot password" — emails a recovery link through Resend.
// Supabase auth SMTP is not configured (hosted sender is capped at ~2/hour),
// so we mint the recovery link with the service role and send it ourselves.
// Always answers { ok: true } for unknown emails to avoid leaking who exists.
// pinned: floating @2 resolved to 2.112.2 whose esm.sh build is broken (postgrest submodule 404)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { cors, json } from '../_shared/cors.ts'

const URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Agrotop Work Diary <onboarding@resend.dev>'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://work-diary-phi.vercel.app'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const { email } = await req.json()
    const clean = String(email ?? '').trim().toLowerCase()
    if (!clean || !clean.includes('@')) return json({ error: 'err_bad_login' }, 400)
    if (!RESEND_KEY) return json({ error: 'email_not_configured' }, 500)

    const db = createClient(URL, SERVICE)

    // unauthenticated endpoint — rate limit per target address
    const { data: allowed } = await db.rpc('rl_check', { p_actor: clean, p_action: 'pwreset', p_max: 3, p_window_seconds: 3600 })
    if (allowed === false) return json({ error: 'rate_limited' }, 429)

    const { data: rows } = await db.from('allowed_emails')
      .select('email,active,registered').eq('email', clean).limit(1)
    const a = rows?.[0]
    // Unknown / disabled / never-registered → same success answer, no mail.
    if (!a || !a.active || !a.registered) return json({ ok: true })

    const { data: link, error: lErr } = await db.auth.admin.generateLink({
      type: 'recovery',
      email: a.email,
      options: { redirectTo: `${APP_URL}/set-password` },
    })
    const action = link?.properties?.action_link
    if (lErr || !action) return json({ ok: true })

    const html = `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#14181b">איפוס סיסמה — יומן עבודה Agrotop</h2>
      <p style="color:#26312c;font-size:15px;line-height:1.6">
        התקבלה בקשה לאיפוס הסיסמה לחשבון ${a.email}.<br>
        לחצו על הכפתור לקביעת סיסמה חדשה. הקישור תקף לזמן מוגבל.</p>
      <p style="margin:26px 0">
        <a href="${action}" style="background:#3aaa35;color:#fff;text-decoration:none;padding:12px 26px;border-radius:10px;font-weight:700;display:inline-block">קביעת סיסמה חדשה</a></p>
      <p style="color:#68766f;font-size:13px">לא ביקשתם איפוס? אפשר להתעלם מההודעה — הסיסמה הנוכחית נשארת בתוקף.</p>
    </div>`

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: RESEND_FROM, to: [a.email], subject: 'איפוס סיסמה · יומן עבודה Agrotop', html }),
    })
    if (!r.ok) {
      const body = await r.text().catch(() => '')
      console.error('resend failed', r.status, body)
      // Resend refuses arbitrary recipients until a domain is verified — fall
      // back to Supabase's built-in auth mailer (low hosted cap, but works).
      const anonClient = createClient(URL, ANON)
      const { error: fbErr } = await anonClient.auth.resetPasswordForEmail(a.email, {
        redirectTo: `${APP_URL}/set-password`,
      })
      // Answer identically whether or not the address exists: a distinguishable
      // failure here would turn the endpoint into an account-enumeration oracle.
      if (fbErr) console.error('reset fallback failed', fbErr.message, body.slice(0, 200))
      return json({ ok: true })
    }
    return json({ ok: true })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})
