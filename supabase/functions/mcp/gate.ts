// Who may use the Claude connector: a signed-in admin or manager who also has the 'claude' area.
//
// Every member holds a valid Supabase token, so the token alone proves nothing about eligibility.
// The checks run in the database (my_role, can_view) as the caller, so the answer is the same
// one the app's own RLS gives — there is no second copy of the rules here to drift.
import type { SupabaseLike } from './tools.ts'

export type GateResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'unauthenticated' | 'role' | 'not_enabled' }

/** SupabaseLike plus the one auth call the gate needs. */
export interface GateDb extends SupabaseLike {
  auth: {
    getUser(): PromiseLike<{ data: { user: { id: string } | null }; error: { message: string } | null }>
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

export async function gate(db: GateDb): Promise<GateResult> {
  const { data, error } = await db.auth.getUser()
  if (error || !data.user) return { ok: false, reason: 'unauthenticated' }

  const role = await rpcValue(db, 'my_role')
  if (typeof role !== 'string' || !ELIGIBLE_ROLES.includes(role)) return { ok: false, reason: 'role' }

  if ((await rpcValue(db, 'can_view', { p_area: 'claude' })) !== true) return { ok: false, reason: 'not_enabled' }

  return { ok: true, userId: data.user.id }
}
