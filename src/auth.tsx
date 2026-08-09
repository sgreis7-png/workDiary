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
// Never let a slow/cold request hang sign-in: fall back to a basic profile after 6s
// (the session is already valid; role refreshes on the next load).
async function loadProfile(id: string, email: string): Promise<SessionUser | null> {
  const basic: SessionUser = { id, email, name: email.split('@')[0], role: 'member', active: true }
  try {
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))
    const { data, error } = await Promise.race([supabase.rpc('me'), timeout]) as { data: unknown; error: unknown }
    const row = (Array.isArray(data) ? data[0] : data) as { role?: string; active?: boolean; name?: string } | null
    if (error || !row) return basic
    return { id, email, name: row.name ?? email.split('@')[0], role: (row.role as Role) ?? 'member', active: row.active ?? true }
  } catch {
    return basic
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
        setUser(await loadProfile(s.user.id, s.user.email ?? ''))
      }
      if (alive) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      if (!alive) return
      setOwner(s?.user?.email ?? null)
      if (s?.user) setUser(await loadProfile(s.user.id, s.user.email ?? ''))
      else setUser(null)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const signIn: Auth['signIn'] = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) return { error: 'err_bad_login' }
    setOwner(data.user.email)
    const prof = await loadProfile(data.user.id, data.user.email ?? '')
    if (prof && !prof.active) { await supabase.auth.signOut(); setOwner(null); return { error: 'err_disabled' } }
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
