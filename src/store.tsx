// Reference-data cache (projects, field defs, author names) loaded once after login
// and refreshed by admin screens. Keeps the synchronous projectName/color/userName
// helpers the screens rely on, backed by live data.
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import { fetchFieldDefs, fetchProjects, fetchUserMap } from './api'
import { colorForIndex, FieldDef, Project } from './data'
import { useAuth } from './auth'

interface Store {
  projects: Project[]
  fieldDefs: FieldDef[]
  userMap: Record<string, string>
  ready: boolean
  projectName: (id: string) => string
  projectColor: (id: string) => string
  userName: (id: string) => string
  reloadProjects: () => Promise<void>
  reloadFields: () => Promise<void>
}

const Ctx = createContext<Store>(null as unknown as Store)
export const useStore = () => useContext(Ctx)

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [fieldDefs, setFieldDefs] = useState<FieldDef[]>([])
  const [userMap, setUserMap] = useState<Record<string, string>>({})
  const [ready, setReady] = useState(false)

  const reloadProjects = useCallback(async () => setProjects(await fetchProjects()), [])
  const reloadFields = useCallback(async () => setFieldDefs(await fetchFieldDefs()), [])

  useEffect(() => {
    if (!user) { setReady(false); return }
    let alive = true
    ;(async () => {
      const [p, f, u] = await Promise.all([fetchProjects(), fetchFieldDefs(), fetchUserMap()])
      if (!alive) return
      setProjects(p); setFieldDefs(f); setUserMap(u); setReady(true)
    })().catch((e) => console.error('store load failed', e))
    return () => { alive = false }
  }, [user])

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? '—'
  const projectColor = (id: string) => colorForIndex(projects.findIndex((p) => p.id === id))
  const userName = (id: string) => userMap[id] ?? '—'

  return (
    <Ctx.Provider value={{
      projects, fieldDefs, userMap, ready,
      projectName, projectColor, userName, reloadProjects, reloadFields,
    }}>
      {children}
    </Ctx.Provider>
  )
}
