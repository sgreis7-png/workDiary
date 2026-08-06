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

    // exact match, not ilike: '%' and '_' are LIKE wildcards and the address is
    // attacker-supplied, so a pattern could match a row the caller never named
    const clean = String(email).trim().toLowerCase()

    // rate-limit on the normalized address — keying on the raw input let
    // ' pavel@… ' variants each open a fresh 5/hr budget for the same target
    const { data: allowed } = await admin.rpc('rl_check', { p_actor: clean, p_action: 'register', p_max: 5, p_window_seconds: 3600 })
    if (allowed === false) return json({ error: 'rate_limited' }, 429)
    const { data: rows, error: selErr } = await admin
      .from('allowed_emails').select('*').eq('email', clean).limit(1)
    if (selErr) return json({ error: selErr.message }, 500)
    const { data: codeRow } = await admin
      .from('registration_codes').select('code').eq('email', clean).maybeSingle()

    const a = rows?.[0]

    // Knowing an address must not be enough to claim the account: addresses are
    // guessable (firstname@agrotop.co.il) and the admin authorizes them without
    // sending mail, so every not-yet-registered row was claimable by whoever
    // submitted it first. The admin hands the code to the worker out of band.
    const supplied = String(code ?? '').trim().toUpperCase()
    const expected = String(codeRow?.code ?? '').trim().toUpperCase()
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
    await admin.from('registration_codes').delete().eq('email', clean)
    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
