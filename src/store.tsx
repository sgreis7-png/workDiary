// Reference-data cache (projects, field defs, author names) loaded once after login
// and refreshed by admin screens. Keeps the synchronous projectName/color/userName
// helpers the screens rely on, backed by live data.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react'
import { fetchFieldDefs, fetchMyPriorities, fetchProjects, fetchUserMap, setMyPriority } from './api'
import { colorForIndex, FieldDef, Project } from './data'
import { useAuth } from './auth'

interface Store {
  projects: Project[] // sorted by effective priority (user's own, else company)
  fieldDefs: FieldDef[]
  userMap: Record<string, string>
  myPriorities: Record<string, number>
  ready: boolean
  projectName: (id: string) => string
  projectColor: (id: string) => string
  userName: (id: string) => string
  effectivePriority: (p: Project) => number
  setUserPriority: (projectId: string, priority: number) => Promise<void>
  reloadProjects: () => Promise<void>
  reloadFields: () => Promise<void>
}

const Ctx = createContext<Store>(null as unknown as Store)
export const useStore = () => useContext(Ctx)

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [rawProjects, setRawProjects] = useState<Project[]>([])
  const [fieldDefs, setFieldDefs] = useState<FieldDef[]>([])
  const [userMap, setUserMap] = useState<Record<string, string>>({})
  const [myPriorities, setMyPriorities] = useState<Record<string, number>>({})
  const [ready, setReady] = useState(false)

  const reloadProjects = useCallback(async () => setRawProjects(await fetchProjects()), [])
  const reloadFields = useCallback(async () => setFieldDefs(await fetchFieldDefs()), [])

  useEffect(() => {
    if (!user) { setReady(false); return }
    let alive = true
    ;(async () => {
      const [p, f, u, pri] = await Promise.all([fetchProjects(), fetchFieldDefs(), fetchUserMap(), fetchMyPriorities()])
      if (!alive) return
      setRawProjects(p); setFieldDefs(f); setUserMap(u); setMyPriorities(pri); setReady(true)
    })().catch((e) => console.error('store load failed', e))
    return () => { alive = false }
  }, [user])

  const effectivePriority = useCallback(
    (p: Project) => (p.id in myPriorities ? myPriorities[p.id] : (p.priority ?? 0)),
    [myPriorities],
  )

  // higher priority first; ties broken by name
  const projects = useMemo(
    () => [...rawProjects].sort((a, b) => effectivePriority(b) - effectivePriority(a) || a.name.localeCompare(b.name)),
    [rawProjects, effectivePriority],
  )

  const setUserPriority = useCallback(async (projectId: string, priority: number) => {
    await setMyPriority(projectId, priority)
    setMyPriorities((m) => ({ ...m, [projectId]: priority }))
  }, [])

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? '—'
  const projectColor = (id: string) => colorForIndex(projects.findIndex((p) => p.id === id))
  const userName = (id: string) => userMap[id] ?? '—'

  return (
    <Ctx.Provider value={{
      projects, fieldDefs, userMap, myPriorities, ready,
      projectName, projectColor, userName, effectivePriority, setUserPriority, reloadProjects, reloadFields,
    }}>
      {children}
    </Ctx.Provider>
  )
}
