import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from './lib/supabase'
import { unwrapFnError } from './lib/storagePaths'
import { setOwner } from './lib/owner'
import { purgeLocalData } from './lib/localData'
import type { Role } from './data'

export interface SessionUser { id: string; email: string; name: string; role: Role; active: boolean }
type Result = { error: string | null }

interface Auth {
  user: SessionUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<Result>
  register: (email: string, password: string, code: string) => Promise<Result>
  signOut: () => Promise<void>
  isAdmin: boolean
}
const Ctx = createContext<Auth>(null as unknown as Auth)
export const useAuth = () => useContext(Ctx)

// Pull role/name/active for the signed-in user via the me() RPC (security definer).
//
// Two failures that look alike and must not be treated alike:
//
//   the server answered, and said this account is not an active member
//     -> fail closed. Return null; the caller signs them out.
//
//   the request timed out or errored
//     -> do NOT fail closed. This app is used by people with no reception, and the
//        fallback profile is what lets a foreman still file his report. It grants the
//        least-privileged role, so it cannot escalate anyone, and since 0045 the database
//        enforces the areas itself — the client is no longer the thing standing between a
//        member and data they should not see.
async function loadProfile(id: string, email: string): Promise<SessionUser | null> {
  const offlineFallback: SessionUser = { id, email, name: email.split('@')[0], role: 'member', active: true }
  try {
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))
    const { data, error } = await Promise.race([supabase.rpc('me'), timeout]) as { data: unknown; error: unknown }
    if (error) return offlineFallback
    const row = (Array.isArray(data) ? data[0] : data) as { role?: string; active?: boolean; name?: string } | null
    // A definer function that returns no row for a valid session is an answer, not a
    // failure: this account is not on the allowlist.
    if (!row) return null
    if (row.active === false) return null
    return { id, email, name: row.name ?? email.split('@')[0], role: (row.role as Role) ?? 'member', active: true }
  } catch {
    return offlineFallback
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      const s = data.session
      if (s?.user && alive) {
        setOwner(s.user.email)
        const prof = await loadProfile(s.user.id, s.user.email ?? '')
        if (!prof) { await supabase.auth.signOut(); setOwner(null) }
        setUser(prof)
      }
      if (alive) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      if (!alive) return
      setOwner(s?.user?.email ?? null)
      if (s?.user) {
        const prof = await loadProfile(s.user.id, s.user.email ?? '')
        if (!prof) { await supabase.auth.signOut(); setOwner(null) }
        setUser(prof)
      } else setUser(null)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const signIn: Auth['signIn'] = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) return { error: 'err_bad_login' }
    setOwner(data.user.email)
    const prof = await loadProfile(data.user.id, data.user.email ?? '')
    // null means the server said no, not that the network failed
    if (!prof) { await supabase.auth.signOut(); setOwner(null); return { error: 'err_disabled' } }
    setUser(prof)
    return { error: null }
  }

  // First-time registration goes through the edge function (allowlist gate), then signs in.
  const register: Auth['register'] = async (email, password, code) => {
    const { data, error } = await supabase.functions.invoke('register', {
      body: { email: email.trim(), password, code },
    })
    // edge function returns a non-2xx with { error: <i18n key> }
    try {
      await unwrapFnError(error, data as { error?: string } | null)
    } catch (e) {
      return { error: String((e as Error).message) || 'err_bad_login' }
    }
    return signIn(email, password)
  }

  // Order matters: purge while the owner is still known, so the queues can tell whose
  // unsent work they are holding, and only then forget who was signed in.
  const signOut = async () => {
    try { await purgeLocalData() } catch { /* never block sign-out on local cleanup */ }
    await supabase.auth.signOut()
    setOwner(null)
    setUser(null)
  }

  return (
    <Ctx.Provider value={{ user, loading, signIn, register, signOut, isAdmin: user?.role === 'admin' }}>
      {children}
    </Ctx.Provider>
  )
}
