import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { useAuth } from '../auth'
import { fetchPermOverrides, resolvePerm, type PermArea, type PermLevel } from './perms'

interface Perms {
  perm: (area: PermArea) => PermLevel
  can: (area: PermArea) => boolean       // view or edit
  canEdit: (area: PermArea) => boolean
  reloadPerms: () => Promise<void>
  permsReady: boolean
}

const Ctx = createContext<Perms>({
  perm: () => 'none', can: () => false, canEdit: () => false,
  reloadPerms: async () => {}, permsReady: false,
})
export const usePerms = () => useContext(Ctx)

export function PermsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [overrides, setOverrides] = useState<Record<string, PermLevel>>({})
  const [ready, setReady] = useState(false)

  const load = useCallback(async () => {
    if (!user?.email) { setOverrides({}); setReady(false); return }
    try { setOverrides(await fetchPermOverrides(user.email)) }
    catch { setOverrides({}) }
    setReady(true)
  }, [user?.email])

  useEffect(() => { load() }, [load])

  const perm = useCallback(
    (area: PermArea) => user ? resolvePerm(user.role, overrides, area) : 'none',
    [user, overrides],
  )

  return (
    <Ctx.Provider value={{
      perm,
      can: (a) => perm(a) !== 'none',
      canEdit: (a) => perm(a) === 'edit',
      reloadPerms: load,
      permsReady: ready,
    }}>
      {children}
    </Ctx.Provider>
  )
}
