// First-time registration for allowlisted workers.
// Validates the email against allowed_emails (service role), then creates the auth
// user. The DB trigger handle_new_user() copies role/name and flips registered=true.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors, json } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const { email, password } = await req.json()
    if (!email || !password) return json({ error: 'err_bad_login' }, 400)
    if (String(password).length < 6) return json({ error: 'err_pw_short' }, 400)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: rows, error: selErr } = await admin
      .from('allowed_emails').select('*').ilike('email', email).limit(1)
    if (selErr) return json({ error: selErr.message }, 500)

    const a = rows?.[0]
    if (!a) return json({ error: 'err_not_invited' }, 403)
    if (!a.active) return json({ error: 'err_disabled' }, 403)
    if (a.registered) return json({ error: 'err_already_reg' }, 409)

    const { error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
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
