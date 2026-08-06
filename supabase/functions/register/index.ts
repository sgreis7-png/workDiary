// First-time registration for allowlisted workers.
// Validates the email against allowed_emails (service role), then creates the auth
// user. The DB trigger handle_new_user() copies role/name and flips registered=true.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors, json } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const { email, password, code } = await req.json()
    if (!email || !password) return json({ error: 'err_bad_login' }, 400)
    if (String(password).length < 8) return json({ error: 'err_pw_short' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: allowed } = await admin.rpc('rl_check', { p_actor: String(email).toLowerCase(), p_action: 'register', p_max: 5, p_window_seconds: 3600 })
    if (allowed === false) return json({ error: 'rate_limited' }, 429)

    const { data: rows, error: selErr } = await admin
      .from('allowed_emails').select('*').ilike('email', email).limit(1)
    if (selErr) return json({ error: selErr.message }, 500)

    const a = rows?.[0]

    // Knowing an address must not be enough to claim the account: addresses are
    // guessable (firstname@agrotop.co.il) and the admin authorizes them without
    // sending mail, so every not-yet-registered row was claimable by whoever
    // submitted it first. The admin hands the code to the worker out of band.
    const supplied = String(code ?? '').trim().toUpperCase()
    const expected = String(a?.registration_code ?? '').trim().toUpperCase()
    const ok = !!a && a.active && !a.registered && !!expected && supplied === expected

    // One answer for "not invited" / "disabled" / "already registered" / "wrong
    // code" — distinct codes turned this endpoint into an allowlist oracle,
    // which is exactly what reset-password goes to trouble to avoid.
    if (!ok) return json({ error: 'err_register_denied' }, 403)

    const { error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (error) {
      const msg = error.message ?? ''
      if (msg.toLowerCase().includes('already')) return json({ error: 'err_register_denied' }, 403)
      return json({ error: msg }, 400)
    }
    // burn the code so the row cannot be claimed twice
    await admin.from('allowed_emails')
      .update({ registration_code: null }).ilike('email', email)
    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
