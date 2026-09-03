// עבודות לביצוע — admin-created tasks with optional assignee + due date.
import { supabase } from './supabase'

export interface WorkTask {
  id: string
  title: string
  notes: string | null
  project_id: string | null
  assignee_email: string | null
  due_date: string | null
  status: 'open' | 'done'
  created_by: string
  created_at: string
  done_at: string | null
  source: 'manual' | 'traffic_light'
  axis: 'time' | 'supply' | 'client' | 'crew' | 'issues' | 'gray' | null
  closed_by: string | null
}

export async function fetchTasks(): Promise<WorkTask[]> {
  const { data, error } = await supabase.from('work_tasks')
    .select('*').order('status').order('due_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  // migrations 0064/0065 may not be applied yet on some databases — treat a missing source as 'manual'
  return (data as WorkTask[]).map((t) => ({ ...t, source: t.source ?? 'manual' }))
}

export async function createTask(t: Partial<WorkTask> & { title: string; created_by: string }): Promise<WorkTask> {
  const { data, error } = await supabase.from('work_tasks').insert({
    title: t.title, notes: t.notes ?? null, project_id: t.project_id ?? null,
    assignee_email: t.assignee_email?.toLowerCase() ?? null, due_date: t.due_date ?? null,
    created_by: t.created_by.toLowerCase(),
  }).select('*').single()
  if (error) throw error
  return data as WorkTask
}

export async function updateTask(id: string, patch: Partial<WorkTask>): Promise<void> {
  const { error } = await supabase.from('work_tasks').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('work_tasks').delete().eq('id', id)
  if (error) throw error
}

/** Calendar deadlines: defects + tasks + project end dates, filtered client-side. */
export interface Deadline {
  kind: 'defect' | 'task' | 'project'
  date: string
  title: string
  link: string
  assignee_email: string | null
  project_id: string | null
  overdue: boolean
  done: boolean
}

export async function fetchDeadlines(): Promise<Deadline[]> {
  const today = new Date().toISOString().slice(0, 10)
  const [defQ, taskQ, projQ] = await Promise.all([
    supabase.from('coop_defects').select('id,coop_id,description,seq,due_date,status,assignee_email, coops!inner(name, project_id)').not('due_date', 'is', null),
    supabase.from('work_tasks').select('*').not('due_date', 'is', null),
    supabase.from('projects').select('id,name,end_date').not('end_date', 'is', null),
  ])
  const out: Deadline[] = []
  for (const d of (defQ.data ?? []) as unknown as { id: string; coop_id: string; description: string | null; seq: number; due_date: string; status: string; assignee_email: string | null; coops: { name: string; project_id: string } }[]) {
    out.push({
      kind: 'defect', date: d.due_date,
      title: `ליקוי · לול ${d.coops.name} · ${d.description ?? '#' + d.seq}`,
      link: `/defects/coop/${d.coop_id}`,
      assignee_email: d.assignee_email, project_id: d.coops.project_id,
      overdue: d.status === 'open' && d.due_date < today, done: d.status === 'closed',
    })
  }
  for (const t of (taskQ.data ?? []) as WorkTask[]) {
    out.push({
      kind: 'task', date: t.due_date!, title: `משימה · ${t.title}`, link: '/tasks',
      assignee_email: t.assignee_email, project_id: t.project_id,
      overdue: t.status === 'open' && t.due_date! < today, done: t.status === 'done',
    })
  }
  for (const p of (projQ.data ?? []) as { id: string; name: string; end_date: string }[]) {
    out.push({
      kind: 'project', date: p.end_date, title: `סיום פרויקט · ${p.name}`, link: '/projects',
      assignee_email: null, project_id: p.id, overdue: p.end_date < today, done: false,
    })
  }
  return out
}
