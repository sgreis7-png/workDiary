// One project, everything about it, in one snapshot.
//
// Deliberately assembled client-side from the tables the caller may already read rather
// than through a new `security definer` aggregate: the schedule is gated by
// can_read_gantt() while the rest is gated by is_member(), so a single definer function
// guarded by one of them would either leak the schedule or hide the project. Letting RLS
// answer each question keeps those rules where they were written.
//
// Queries are lean on purpose. listEntries() mints a signed URL for every photo of every
// entry, which is wasted work when only `values` is wanted.
import { supabase } from '../lib/supabase'
import { deptIdOf, hasMalfunction, type Project } from '../data'
import { parseCoops } from '../lib/reportTables'
import { gateSummary } from '../defects/rules'
import { GATE_ORDER, type GateKey, type ItemStatus, type Severity } from '../defects/model'
import type { ProgressSeries } from '../components/ProgressChart'
import type { WorkTask } from '../lib/tasks'

export interface LeanEntry {
  id: string
  work_date: string | null
  created_by: string
  created_at: string
  values: Record<string, string>
}

export interface SnapshotCoop {
  id: string
  name: string
  coop_type: string | null
  opened_on: string | null
  execution_manager: string | null
  /** gate → percent 0-100, or null when nothing in that gate has been touched yet */
  gates: Record<GateKey, number | null>
  openDefects: number
  overdueDefects: number
}

export interface SnapshotDefect {
  id: string
  coop_id: string
  coopName: string
  seq: number
  gate: GateKey
  description: string | null
  severity: Severity | null
  assignee_email: string | null
  due_date: string | null
  status: 'open' | 'closed'
  overdue: boolean
}

export interface SnapshotPerson {
  email: string
  name: string
  avatarUrl?: string
  /** diary entries this person filed on this project */
  entries: number
  openDefects: number
  openTasks: number
}

export interface ProjectSnapshot {
  project: Project
  entries: LeanEntry[]
  photoCount: number
  coops: SnapshotCoop[]
  defects: SnapshotDefect[]
  tasks: WorkTask[]
  people: SnapshotPerson[]
  /** per-coop reported progress over time, ready for <ProgressChart> */
  progress: ProgressSeries[]
  malfunctionsByDept: Record<string, number>
  safetyIncidents: number
}

const today = () => new Date().toISOString().slice(0, 10)

/** Reported progress per coop over time — the same derivation the dashboard chart uses. */
export function progressSeries(entries: LeanEntry[]): ProgressSeries[] {
  const byCoop = new Map<string, Map<string, number>>()
  // entries arrive newest-first, so the first value seen for a date is that day's last
  for (const e of entries) {
    if (!e.work_date) continue
    for (const c of parseCoops(e.values, 'he')) {
      const m = byCoop.get(c.name) ?? new Map<string, number>()
      if (!m.has(e.work_date)) m.set(e.work_date, c.pct)
      byCoop.set(c.name, m)
    }
  }
  return [...byCoop.entries()]
    .map(([name, m]) => ({
      name,
      points: [...m.entries()]
        .map(([date, pct]) => ({ date, pct }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .filter((s) => s.points.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'he', { numeric: true }))
}

/** Latest reported percentage per coop, for a project that has no schedule to weigh. */
export function reportedProgress(series: ProgressSeries[]): number | null {
  const last = series.map((s) => s.points[s.points.length - 1]?.pct).filter((n): n is number => n !== undefined)
  if (!last.length) return null
  return Math.round(last.reduce((a, b) => a + b, 0) / last.length)
}

export async function fetchProjectSnapshot(project: Project): Promise<ProjectSnapshot> {
  const pid = project.id
  const day = today()

  const [entryQ, photoQ, coopQ, taskQ, assignQ] = await Promise.all([
    supabase.from('entries')
      .select('id,work_date,created_by,created_at,values')
      .eq('project_id', pid)
      .order('work_date', { ascending: false, nullsFirst: false }),
    supabase.from('entry_photos')
      .select('id, entries!inner(project_id)', { count: 'exact', head: true })
      .eq('entries.project_id', pid),
    supabase.from('coops')
      .select('id,name,coop_type,opened_on,execution_manager')
      .eq('project_id', pid)
      .order('name'),
    supabase.from('work_tasks').select('*').eq('project_id', pid),
    supabase.from('project_assignments').select('email').eq('project_id', pid),
  ])

  for (const q of [entryQ, photoQ, coopQ, taskQ, assignQ]) if (q.error) throw q.error

  const entries = (entryQ.data ?? []) as LeanEntry[]
  const coopRows = (coopQ.data ?? []) as {
    id: string; name: string; coop_type: string | null; opened_on: string | null; execution_manager: string | null
  }[]
  const tasks = (taskQ.data ?? []) as WorkTask[]
  const coopIds = coopRows.map((c) => c.id)

  // checklist items and defects only exist once there are coops
  const [itemQ, defectQ] = coopIds.length
    ? await Promise.all([
      supabase.from('coop_checklist_items').select('coop_id,gate,item_no,status').in('coop_id', coopIds),
      supabase.from('coop_defects')
        .select('id,coop_id,seq,gate,description,severity,assignee_email,due_date,status')
        .in('coop_id', coopIds),
    ])
    : [{ data: [], error: null }, { data: [], error: null }]
  if (itemQ.error) throw itemQ.error
  if (defectQ.error) throw defectQ.error

  const items = (itemQ.data ?? []) as { coop_id: string; gate: GateKey; item_no: number; status: ItemStatus | null }[]
  const coopName = new Map(coopRows.map((c) => [c.id, c.name]))

  const defects: SnapshotDefect[] = ((defectQ.data ?? []) as {
    id: string; coop_id: string; seq: number; gate: GateKey; description: string | null
    severity: Severity | null; assignee_email: string | null; due_date: string | null; status: 'open' | 'closed'
  }[]).map((d) => ({
    ...d,
    coopName: coopName.get(d.coop_id) ?? '',
    overdue: d.status === 'open' && !!d.due_date && d.due_date < day,
  }))

  const coops: SnapshotCoop[] = coopRows.map((c) => {
    const mine = items
      .filter((i) => i.coop_id === c.id)
      .map((i) => ({ gate: i.gate, itemNo: i.item_no, status: i.status }))
    const gates = {} as Record<GateKey, number | null>
    for (const gate of GATE_ORDER) {
      const s = gateSummary(gate, mine)
      // an untouched gate reads 0% or 100% depending on na counts; report it as unknown
      gates[gate] = s.done + s.notDone + s.na > 0 ? Math.round(s.pct * 100) : null
    }
    return {
      ...c,
      gates,
      openDefects: defects.filter((d) => d.coop_id === c.id && d.status === 'open').length,
      overdueDefects: defects.filter((d) => d.coop_id === c.id && d.overdue).length,
    }
  })

  // ---- people: assigned workers, plus anyone who filed an entry ----
  const assigned = ((assignQ.data ?? []) as { email: string }[]).map((r) => r.email.toLowerCase())
  const authorIds = [...new Set(entries.map((e) => e.created_by))]
  const profileQ = await supabase.from('profiles').select('id,name,email,avatar_path')
  if (profileQ.error) throw profileQ.error
  const profiles = (profileQ.data ?? []) as { id: string; name: string | null; email: string | null; avatar_path: string | null }[]

  const emailOfId = new Map(profiles.map((p) => [p.id, (p.email ?? '').toLowerCase()]))
  const byEmail = new Map(profiles.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p]))

  const entriesPerEmail = new Map<string, number>()
  for (const id of authorIds) {
    const email = emailOfId.get(id)
    if (!email) continue
    entriesPerEmail.set(email, entries.filter((e) => e.created_by === id).length)
  }

  const people: SnapshotPerson[] = [...new Set([...assigned, ...entriesPerEmail.keys()])]
    .map((email) => {
      const profile = byEmail.get(email)
      return {
        email,
        name: profile?.name?.trim() || email.split('@')[0],
        entries: entriesPerEmail.get(email) ?? 0,
        openDefects: defects.filter((d) => d.status === 'open' && d.assignee_email?.toLowerCase() === email).length,
        openTasks: tasks.filter((t) => t.status === 'open' && t.assignee_email?.toLowerCase() === email).length,
      }
    })
    .sort((a, b) => b.entries - a.entries || a.name.localeCompare(b.name, 'he'))

  // ---- diary-derived counts ----
  const malfunctionsByDept: Record<string, number> = {}
  let safetyIncidents = 0
  for (const e of entries) {
    if (hasMalfunction(e.values)) {
      const dept = deptIdOf(e.values.malfunction_dept)
      malfunctionsByDept[dept] = (malfunctionsByDept[dept] ?? 0) + 1
    }
    if ((e.values.safety_incident ?? '').trim()) safetyIncidents++
  }

  const progress = progressSeries(entries)

  return {
    project,
    entries,
    photoCount: photoQ.count ?? 0,
    coops,
    defects,
    tasks,
    people,
    progress,
    malfunctionsByDept,
    safetyIncidents,
  }
}
