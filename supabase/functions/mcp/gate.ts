// Who may use the Claude connector: a signed-in admin or manager who also has the 'claude' area.
//
// Every member holds a valid Supabase token, so the token alone proves nothing about eligibility.
// The checks run in the database (my_role, can_view) as the caller, so the answer is the same
// one the app's own RLS gives — there is no second copy of the rules here to drift.
import type { SupabaseLike } from './tools.ts'

export type GateResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'unauthenticated' | 'unavailable' | 'no_email_claim' | 'role' | 'not_enabled' }

/** SupabaseLike plus the one auth call the gate needs. The token is passed explicitly. */
export interface GateDb extends SupabaseLike {
  auth: {
    getUser(jwt?: string): PromiseLike<{
      data: { user: { id: string } | null }
      error: { message: string; status?: number; name?: string } | null
    }>
  }
}

const ELIGIBLE_ROLES = ['admin', 'manager']

async function rpcValue(db: SupabaseLike, name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await db.rpc(name, args)
  // A failed lookup is thrown, not read as "no": the caller turns it into an error the person
  // can see, instead of a refusal that sends them to an administrator for nothing.
  if (error) throw new Error(error.message)
  return data
}

/** Payload of a JWT, decoded without checking the signature (getUser has already validated it). */
function jwtPayload(jwt: string): Record<string, unknown> {
  try {
    const b64 = (jwt.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    const p = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))))
    return p && typeof p === 'object' ? p : {}
  } catch { return {} }
}

/** Only a rejected token means "log in again"; a network or 5xx failure is an outage. */
const isRejectedToken = (e: { status?: number }) => e.status === 401 || e.status === 403

export async function gate(db: GateDb, jwt: string): Promise<GateResult> {
  const { data, error } = await db.auth.getUser(jwt)
  if (error) return { ok: false, reason: isRejectedToken(error) ? 'unauthenticated' : 'unavailable' }
  if (!data.user) return { ok: false, reason: 'unauthenticated' }

  // is_member()/perm_level() read the e-mail claim of this very token; without it every
  // permission check answers "no" and the person is told they are not enabled for no reason.
  const email = jwtPayload(jwt).email
  if (typeof email !== 'string' || !email) return { ok: false, reason: 'no_email_claim' }

  const role = await rpcValue(db, 'my_role')
  if (typeof role !== 'string' || !ELIGIBLE_ROLES.includes(role)) return { ok: false, reason: 'role' }

  if ((await rpcValue(db, 'can_view', { p_area: 'claude' })) !== true) return { ok: false, reason: 'not_enabled' }

  return { ok: true, userId: data.user.id }
}
