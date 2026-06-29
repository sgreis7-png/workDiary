import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from './lib/supabase'
import type { Role } from './data'

export interface SessionUser { id: string; email: string; name: string; role: Role; active: boolean }
type Result = { error: string | null }

interface Auth {
  user: SessionUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<Result>
  register: (email: string, password: string) => Promise<Result>
  signOut: () => Promise<void>
  isAdmin: boolean
}
const Ctx = createContext<Auth>(null as unknown as Auth)
export const useAuth = () => useContext(Ctx)

// Pull role/name/active for the signed-in user via the me() RPC (security definer).
async function loadProfile(id: string, email: string): Promise<SessionUser | null> {
  const { data, error } = await supabase.rpc('me')
  const row = Array.isArray(data) ? data[0] : data
  if (error || !row) return { id, email, name: email.split('@')[0], role: 'member', active: true }
  return { id, email, name: row.name ?? email.split('@')[0], role: row.role as Role, active: row.active }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      const s = data.session
      if (s?.user && alive) setUser(await loadProfile(s.user.id, s.user.email ?? ''))
      if (alive) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      if (!alive) return
      if (s?.user) setUser(await loadProfile(s.user.id, s.user.email ?? ''))
      else setUser(null)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const signIn: Auth['signIn'] = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) return { error: 'err_bad_login' }
    const prof = await loadProfile(data.user.id, data.user.email ?? '')
    if (prof && !prof.active) { await supabase.auth.signOut(); return { error: 'err_disabled' } }
    setUser(prof)
    return { error: null }
  }

  // First-time registration goes through the edge function (allowlist gate), then signs in.
  const register: Auth['register'] = async (email, password) => {
    const { data, error } = await supabase.functions.invoke('register', {
      body: { email: email.trim(), password },
    })
    if (error) {
      // edge function returns a non-2xx with { error: <i18n key> }
      const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
      const body = await ctx?.json?.().catch(() => null)
      return { error: body?.error ?? 'err_bad_login' }
    }
    const d = data as { error?: string } | null
    if (d?.error) return { error: d.error }
    return signIn(email, password)
  }

  const signOut = async () => { await supabase.auth.signOut(); setUser(null) }

  return (
    <Ctx.Provider value={{ user, loading, signIn, register, signOut, isAdmin: user?.role === 'admin' }}>
      {children}
    </Ctx.Provider>
  )
}
