import { createContext, useContext, useState, ReactNode } from 'react'
import { AppUser, USERS } from './data'

interface Auth {
  user: AppUser | null
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => void
  isAdmin: boolean
}
const Ctx = createContext<Auth>(null as unknown as Auth)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)

  const signIn: Auth['signIn'] = async (email) => {
    await new Promise((r) => setTimeout(r, 650)) // simulate network
    const found = USERS.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.active)
    // demo: any password accepted; unknown email logs in as the admin so the demo is explorable
    setUser(found ?? USERS[0])
    return { error: null }
  }
  const signOut = () => setUser(null)

  return <Ctx.Provider value={{ user, signIn, signOut, isAdmin: user?.role === 'admin' }}>{children}</Ctx.Provider>
}
