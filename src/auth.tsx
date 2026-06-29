import { createContext, useContext, useState, ReactNode } from 'react'
import { AppUser, USERS } from './data'

type Result = { error: string | null }

interface Auth {
  user: AppUser | null
  signIn: (email: string, password: string) => Promise<Result>
  register: (email: string, password: string) => Promise<Result>
  signOut: () => void
  isAdmin: boolean
}
const Ctx = createContext<Auth>(null as unknown as Auth)
export const useAuth = () => useContext(Ctx)

const find = (email: string) => USERS.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)

  // Returns error CODES (i18n keys); the UI maps them to localized text.
  const signIn: Auth['signIn'] = async (email, password) => {
    await new Promise((r) => setTimeout(r, 500))
    const u = find(email)
    if (!u) return { error: 'err_not_invited' }
    if (!u.active) return { error: 'err_disabled' }
    if (!u.registered) return { error: 'err_must_reg' }
    if (u.password !== password) return { error: 'err_bad_login' }
    setUser(u)
    return { error: null }
  }

  // First-time registration: only emails the admin pre-authorized (present in the
  // allowlist / USERS) may set a password. Unknown emails are rejected.
  const register: Auth['register'] = async (email, password) => {
    await new Promise((r) => setTimeout(r, 600))
    const u = find(email)
    if (!u) return { error: 'err_not_invited' }
    if (!u.active) return { error: 'err_disabled' }
    if (u.registered) return { error: 'err_already_reg' }
    u.registered = true
    u.password = password
    setUser(u)
    return { error: null }
  }

  const signOut = () => setUser(null)

  return (
    <Ctx.Provider value={{ user, signIn, register, signOut, isAdmin: user?.role === 'admin' }}>
      {children}
    </Ctx.Provider>
  )
}
