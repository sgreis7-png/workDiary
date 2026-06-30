// Admin-only: authorize an email on the allowlist AND send a Supabase invite email.
// The worker clicks the link, lands on /set-password, and sets their own password.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors, json } from '../_shared/cors.ts'

const URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const APP_URL = Deno.env.get('APP_URL') ?? 'https://work-diary-phi.vercel.app'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    // caller must be a signed-in admin
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user?.email) return json({ error: 'unauthorized' }, 401)

    const db = createClient(URL, SERVICE)
    const { data: caller } = await db
      .from('allowed_emails').select('role,active').ilike('email', user.email).maybeSingle()
    if (caller?.role !== 'admin' || !caller.active) return json({ error: 'forbidden' }, 403)

    const { data: allowed } = await db.rpc('rl_check', { p_actor: user.email, p_action: 'invite', p_max: 100, p_window_seconds: 3600 })
    if (allowed === false) return json({ error: 'rate_limited' }, 429)

    const { email, display_name, role = 'member' } = await req.json()
    if (!email || !String(email).includes('@')) return json({ error: 'err_bad_login' }, 400)

    // authorize on the allowlist (idempotent)
    const { error: upErr } = await db
      .from('allowed_emails').upsert({ email, display_name, role }, { onConflict: 'email' })
    if (upErr) return json({ error: upErr.message }, 500)

    // send the invite email
    const { error } = await db.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${APP_URL}/set-password`,
    })
    if (error) {
      const msg = error.message ?? ''
      if (msg.toLowerCase().includes('already')) return json({ error: 'err_already_reg' }, 409)
      return json({ error: msg }, 400)
    }
    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
