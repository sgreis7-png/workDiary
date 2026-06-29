// Admin-only: fully remove a user — delete their auth account (frees the email)
// and remove them from the allowlist.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors, json } from '../_shared/cors.ts'

const URL = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user?.email) return json({ error: 'unauthorized' }, 401)

    const db = createClient(URL, SERVICE)
    const { data: caller } = await db
      .from('allowed_emails').select('role,active').ilike('email', user.email).maybeSingle()
    if (caller?.role !== 'admin' || !caller.active) return json({ error: 'forbidden' }, 403)

    const { email } = await req.json()
    if (!email) return json({ error: 'missing_email' }, 400)
    if (email.toLowerCase() === user.email.toLowerCase()) return json({ error: 'cannot_delete_self' }, 400)

    // delete the auth account if it exists
    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 200 })
    const target = list?.users.find((u) => (u.email ?? '').toLowerCase() === String(email).toLowerCase())
    if (target) await db.auth.admin.deleteUser(target.id)

    // remove from the allowlist
    await db.from('allowed_emails').delete().eq('email', email)
    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
