// Schedule types and the pure date/dependency maths behind the Gantt.
//
// Timestamps are wall-clock strings ('2026-05-10T08:00:00') and are never turned into
// instants: a schedule day is the same calendar day for everyone looking at it. All
// arithmetic happens on whole day numbers, and each task keeps its own clock times, so
// dragging a bar never drifts a task's start from 08:00 to 07:00.

export type LinkKind = 'FS' | 'SS' | 'FF' | 'SF'

export interface GanttChart {
  id: string
  project_id: string
  name: string
  source_file: string | null
  source_path: string | null
  status_date: string | null
  span_start: string | null
  span_finish: string | null
  imported_by: string | null
  imported_at: string
  updated_at: string
  active: boolean
}

export interface GanttTask {
  id: string
  chart_id: string
  ext_uid: number
  parent_ext_uid: number | null
  sort_order: number
  depth: number
  wbs: string | null
  name: string
  start_ts: string
  finish_ts: string
  base_start_ts: string | null
  base_finish_ts: string | null
  duration_days: number | null
  pct: number
  milestone: boolean
  is_summary: boolean
  critical: boolean
  notes: string | null
  resources: string[]
}

export interface GanttLink {
  id: string
  chart_id: string
  pred_ext_uid: number
  succ_ext_uid: number
  kind: LinkKind
  lag_days: number
}

export interface GanttBundle {
  chart: GanttChart
  tasks: GanttTask[]
  links: GanttLink[]
}

/** A task's start/finish after an edit, in wall-clock strings. */
export interface Span { start_ts: string; finish_ts: string }

export const DAY_MS = 86_400_000
export const DEFAULT_START_TIME = '08:00:00'
export const DEFAULT_FINISH_TIME = '17:00:00'

// ---------- day arithmetic on wall-clock strings ----------

/** Day number (days since 1970-01-01) of a wall-clock timestamp's date part. */
export function dayOf(ts: string): number {
  const [y, m, d] = ts.slice(0, 10).split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}

/** The 'HH:mm:ss' part, defaulted when the string carries no time. */
export function timeOf(ts: string, fallback = DEFAULT_START_TIME): string {
  const t = ts.slice(11)
  if (!t) return fallback
  return t.length === 5 ? `${t}:00` : t.slice(0, 8)
}

export function dayToDate(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

/** Same clock time, moved to `day`. */
export function withDay(ts: string, day: number, fallbackTime = DEFAULT_START_TIME): string {
  return `${dayToDate(day)}T${timeOf(ts, fallbackTime)}`
}

export function shiftTs(ts: string, days: number, fallbackTime = DEFAULT_START_TIME): string {
  return withDay(ts, dayOf(ts) + days, fallbackTime)
}

/** Inclusive length in days: a task starting and finishing the same day spans 1. */
export function spanDays(task: Pick<GanttTask, 'start_ts' | 'finish_ts'>): number {
  return dayOf(task.finish_ts) - dayOf(task.start_ts) + 1
}

// ---------- tree ----------

export interface TaskTree {
  byUid: Map<number, GanttTask>
  children: Map<number, number[]>
  roots: number[]
  depthOf: Map<number, number>
}

export function buildTree(tasks: GanttTask[]): TaskTree {
  const ordered = [...tasks].sort((a, b) => a.sort_order - b.sort_order)
  const byUid = new Map(ordered.map((t) => [t.ext_uid, t]))
  const children = new Map<number, number[]>()
  const roots: number[] = []

  for (const t of ordered) {
    const parent = t.parent_ext_uid
    if (parent !== null && parent !== t.ext_uid && byUid.has(parent)) {
      const list = children.get(parent)
      if (list) list.push(t.ext_uid)
      else children.set(parent, [t.ext_uid])
    } else {
      roots.push(t.ext_uid)
    }
  }

  // Depth from the parent chain rather than the file's outline level, which some
  // schedules leave inconsistent after rows are moved around in MS Project.
  const depthOf = new Map<number, number>()
  const walk = (uids: number[], depth: number) => {
    for (const uid of uids) {
      depthOf.set(uid, depth)
      walk(children.get(uid) ?? [], depth + 1)
    }
  }
  walk(roots, 0)

  return { byUid, children, roots, depthOf }
}

export const hasChildren = (tree: TaskTree, uid: number): boolean =>
  (tree.children.get(uid) ?? []).length > 0

/** Depth-first row order, skipping the subtrees of collapsed parents. */
export function visibleRows(
  tree: TaskTree,
  collapsed: ReadonlySet<number>,
  keep?: (task: GanttTask) => boolean,
): GanttTask[] {
  const out: GanttTask[] = []

  const subtreeKeeps = (uid: number): boolean => {
    if (!keep) return true
    const task = tree.byUid.get(uid)
    if (task && keep(task)) return true
    return (tree.children.get(uid) ?? []).some(subtreeKeeps)
  }

  const walk = (uids: number[]) => {
    for (const uid of uids) {
      const task = tree.byUid.get(uid)
      if (!task || !subtreeKeeps(uid)) continue
      out.push(task)
      if (hasChildren(tree, uid) && !collapsed.has(uid)) walk(tree.children.get(uid) ?? [])
    }
  }
  walk(tree.roots)
  return out
}

// ---------- dependency maths ----------

/** Earliest day the successor may start/finish, given the predecessor's placement. */
function earliest(kind: LinkKind, pred: Span, lag: number): { startAtLeast?: number; finishAtLeast?: number } {
  const ps = dayOf(pred.start_ts)
  const pf = dayOf(pred.finish_ts)
  const l = Math.round(lag)
  switch (kind) {
    case 'FS': return { startAtLeast: pf + 1 + l }
    case 'SS': return { startAtLeast: ps + l }
    case 'FF': return { finishAtLeast: pf + l }
    case 'SF': return { finishAtLeast: ps + l }
  }
}

/**
 * Move a task, then push any successor that the move would have overrun.
 *
 * Successors only ever move later. Pulling them earlier whenever slack appears is
 * what MS Project does on a full recalculation, and it makes a single drag rewrite
 * half the schedule — surprising when someone is nudging one bar.
 *
 * Summary rows are not moved directly; they are re-derived from their children by
 * `rollUp`. Returns one entry per task whose dates actually changed.
 */
export function cascade(
  tasks: GanttTask[],
  links: GanttLink[],
  edits: ReadonlyMap<number, Span>,
): Map<number, Span> {
  const current = new Map<number, Span>()
  for (const t of tasks) current.set(t.ext_uid, { start_ts: t.start_ts, finish_ts: t.finish_ts })

  const changed = new Map<number, Span>()
  const queue: number[] = []
  for (const [uid, span] of edits) {
    if (!current.has(uid)) continue
    current.set(uid, span)
    changed.set(uid, span)
    queue.push(uid)
  }

  const outgoing = new Map<number, GanttLink[]>()
  for (const link of links) {
    const list = outgoing.get(link.pred_ext_uid)
    if (list) list.push(link)
    else outgoing.set(link.pred_ext_uid, [link])
  }

  const isSummary = new Map(tasks.map((t) => [t.ext_uid, t.is_summary]))
  // A cycle in the links would otherwise spin here; MS Project rejects them, but an
  // imported file can still surprise us.
  let guard = tasks.length * 8

  while (queue.length && guard-- > 0) {
    const uid = queue.shift() as number
    const pred = current.get(uid)
    if (!pred) continue

    for (const link of outgoing.get(uid) ?? []) {
      const succUid = link.succ_ext_uid
      const succ = current.get(succUid)
      if (!succ || isSummary.get(succUid)) continue

      const need = earliest(link.kind, pred, link.lag_days)
      const length = dayOf(succ.finish_ts) - dayOf(succ.start_ts)
      let startDay = dayOf(succ.start_ts)

      if (need.startAtLeast !== undefined && startDay < need.startAtLeast) startDay = need.startAtLeast
      if (need.finishAtLeast !== undefined && startDay + length < need.finishAtLeast) {
        startDay = need.finishAtLeast - length
      }
      if (startDay === dayOf(succ.start_ts)) continue

      const moved: Span = {
        start_ts: withDay(succ.start_ts, startDay, DEFAULT_START_TIME),
        finish_ts: withDay(succ.finish_ts, startDay + length, DEFAULT_FINISH_TIME),
      }
      current.set(succUid, moved)
      changed.set(succUid, moved)
      queue.push(succUid)
    }
  }

  return changed
}

/**
 * Re-derive every summary row from its children and return only the rows that moved.
 *
 * Dates always roll up. Percent complete does not, unless `opts.pct` asks for it: our
 * weighting is by calendar duration while MS Project weights by work, so the two
 * disagree, and a plain date drag has no business rewriting the figure the customer's
 * file reported. Roll it up when a leaf's own percentage is what changed.
 */
export function rollUp(
  tasks: GanttTask[],
  overrides: ReadonlyMap<number, Span> = new Map(),
  opts: { pct?: boolean } = {},
): Map<number, Span & { pct?: number }> {
  const tree = buildTree(tasks)
  const result = new Map<number, Span & { pct?: number }>()

  const spanOf = (uid: number): Span => overrides.get(uid) ?? {
    start_ts: tree.byUid.get(uid)!.start_ts,
    finish_ts: tree.byUid.get(uid)!.finish_ts,
  }

  // Deepest first, so a parent sees its children already rolled up.
  const order: number[] = []
  const collect = (uids: number[]) => {
    for (const uid of uids) { collect(tree.children.get(uid) ?? []); order.push(uid) }
  }
  collect(tree.roots)

  const effective = (uid: number): Span & { pct: number } => {
    const stored = tree.byUid.get(uid)
    const rolled = result.get(uid)
    return {
      ...(rolled ?? spanOf(uid)),
      pct: rolled?.pct ?? stored?.pct ?? 0,
    }
  }

  for (const uid of order) {
    const kids = tree.children.get(uid) ?? []
    if (!kids.length) continue
    const task = tree.byUid.get(uid)
    if (!task) continue

    let startDay = Infinity
    let finishDay = -Infinity
    let weighted = 0
    let weight = 0

    for (const kid of kids) {
      const k = effective(kid)
      const ks = dayOf(k.start_ts)
      const kf = dayOf(k.finish_ts)
      if (ks < startDay) startDay = ks
      if (kf > finishDay) finishDay = kf
      const days = Math.max(1, kf - ks + 1)
      weighted += k.pct * days
      weight += days
    }
    if (!Number.isFinite(startDay) || finishDay < startDay) continue

    const own = spanOf(uid)
    const next: Span & { pct?: number } = {
      start_ts: withDay(own.start_ts, startDay, DEFAULT_START_TIME),
      finish_ts: withDay(own.finish_ts, finishDay, DEFAULT_FINISH_TIME),
    }
    if (opts.pct) next.pct = weight ? Math.round(weighted / weight) : task.pct

    const moved = next.start_ts !== task.start_ts || next.finish_ts !== task.finish_ts
    const repct = next.pct !== undefined && next.pct !== task.pct
    if (moved || repct) result.set(uid, next)
  }

  return result
}

// ---------- derived numbers for the header ----------

export interface ScheduleSummary {
  spanStart: string | null
  spanFinish: string | null
  overallPct: number
  leafCount: number
  doneCount: number
  wipCount: number
  todoCount: number
  overdueCount: number
  milestoneCount: number
}

export function summarize(tasks: GanttTask[], todayISO: string): ScheduleSummary {
  const tree = buildTree(tasks)
  const leaves = tasks.filter((t) => !hasChildren(tree, t.ext_uid) && !t.milestone)
  const today = dayOf(todayISO)

  let spanStart: string | null = null
  let spanFinish: string | null = null
  for (const t of tasks) {
    if (!spanStart || dayOf(t.start_ts) < dayOf(spanStart)) spanStart = t.start_ts
    if (!spanFinish || dayOf(t.finish_ts) > dayOf(spanFinish)) spanFinish = t.finish_ts
  }

  let weighted = 0
  let weight = 0
  let done = 0
  let wip = 0
  let todo = 0
  let overdue = 0
  for (const t of leaves) {
    const days = Math.max(1, spanDays(t))
    weighted += t.pct * days
    weight += days
    if (t.pct >= 100) done++
    else if (t.pct > 0) wip++
    else todo++
    if (t.pct < 100 && dayOf(t.finish_ts) < today) overdue++
  }

  return {
    spanStart,
    spanFinish,
    overallPct: weight ? Math.round(weighted / weight) : 0,
    leafCount: leaves.length,
    doneCount: done,
    wipCount: wip,
    todoCount: todo,
    overdueCount: overdue,
    milestoneCount: tasks.filter((t) => t.milestone).length,
  }
}

export interface OverdueTask { task: GanttTask; daysLate: number }

/** The tasks behind overdueCount: unfinished leaves past their finish date, most late first. */
export function overdueTasks(tasks: GanttTask[], todayISO: string): OverdueTask[] {
  const tree = buildTree(tasks)
  const today = dayOf(todayISO)
  return tasks
    .filter((t) => !hasChildren(tree, t.ext_uid) && !t.milestone && t.pct < 100 && dayOf(t.finish_ts) < today)
    .map((t) => ({ task: t, daysLate: today - dayOf(t.finish_ts) }))
    .sort((a, b) => b.daysLate - a.daysLate)
}

/** Payment milestones are encoded in the task name, e.g. "30% מקדמה עם אישור הפרויקט". */
export interface PaymentMilestone { ext_uid: number; pct: number; label: string; date: string; paid: boolean }

export function paymentMilestones(tasks: GanttTask[]): PaymentMilestone[] {
  return tasks
    .filter((t) => t.milestone && /^\s*\d{1,3}%/.test(t.name))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((t) => {
      const name = t.name.trim()
      return {
        ext_uid: t.ext_uid,
        pct: Number(/^(\d{1,3})%/.exec(name)![1]),
        label: name.replace(/^\d{1,3}%\s*/, ''),
        date: t.start_ts,
        paid: t.pct >= 100,
      }
    })
}

// ---------- converter payload -> rows ----------

interface ConvertedDuration { amount: number; units: string }
interface ConvertedTask {
  id: number | null
  uniqueId: number
  wbs: string | null
  name: string | null
  outlineLevel: number | null
  parentUniqueId: number | null
  start: string | null
  finish: string | null
  duration: ConvertedDuration | null
  percentComplete: number | null
  milestone: boolean
  summary: boolean
  critical: boolean
  notes: string | null
  predecessors: { taskUniqueId: number; type: string; lag: ConvertedDuration | null }[]
  resources: { name: string | null }[]
}
export interface ConvertedProject {
  schema: number
  file: string
  properties: { name: string | null; title: string | null; startDate: string | null; finishDate: string | null; statusDate: string | null }
  resources: { uniqueId: number; name: string | null }[]
  tasks: ConvertedTask[]
}

export type NewTaskRow = Omit<GanttTask, 'id' | 'chart_id'>
export type NewLinkRow = Omit<GanttLink, 'id' | 'chart_id'>

const LINK_KINDS = new Set<LinkKind>(['FS', 'SS', 'FF', 'SF'])

function normalizeTs(value: string | null, fallbackTime: string): string | null {
  if (!value) return null
  const [date, time] = value.split('T')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return null
  const t = !time ? fallbackTime : time.length === 5 ? `${time}:00` : time.slice(0, 8)
  return `${date}T${t}`
}

/** Lag comes back in whatever unit the file used; only day-ish units are meaningful here. */
function lagInDays(lag: ConvertedDuration | null): number {
  if (!lag || !lag.amount) return 0
  const unit = lag.units.toLowerCase()
  if (unit.startsWith('h')) return Math.round(lag.amount / 8)
  if (unit.startsWith('w')) return Math.round(lag.amount * 5)
  if (unit.startsWith('m')) return Math.round(lag.amount * 20)
  return Math.round(lag.amount)
}

/**
 * Turn a converter payload into rows. The project-level root that MS Project keeps at
 * outline level 0 is dropped: the app already knows which project this belongs to, and
 * carrying it would render a bar spanning everything.
 */
export function toRows(payload: ConvertedProject): { tasks: NewTaskRow[]; links: NewLinkRow[] } {
  const usable = payload.tasks.filter(
    (t) => t.name && (t.outlineLevel ?? 0) > 0 && normalizeTs(t.start, DEFAULT_START_TIME),
  )
  const known = new Set(usable.map((t) => t.uniqueId))

  const tasks: NewTaskRow[] = usable.map((t, i) => {
    const start = normalizeTs(t.start, DEFAULT_START_TIME) as string
    const finish = normalizeTs(t.finish, DEFAULT_FINISH_TIME) ?? start
    const parent = t.parentUniqueId !== null && known.has(t.parentUniqueId) ? t.parentUniqueId : null
    return {
      ext_uid: t.uniqueId,
      parent_ext_uid: parent,
      sort_order: i,
      depth: Math.max(0, (t.outlineLevel ?? 1) - 1),
      wbs: t.wbs,
      name: t.name as string,
      start_ts: start,
      finish_ts: finish,
      base_start_ts: start,
      base_finish_ts: finish,
      duration_days: t.duration ? t.duration.amount : null,
      pct: Math.min(100, Math.max(0, Math.round(t.percentComplete ?? 0))),
      milestone: t.milestone,
      is_summary: t.summary,
      critical: t.critical,
      notes: t.notes,
      resources: t.resources.map((r) => r.name).filter((n): n is string => !!n),
    }
  })

  const seen = new Set<string>()
  const links: NewLinkRow[] = []
  for (const t of usable) {
    for (const p of t.predecessors) {
      if (!known.has(p.taskUniqueId) || p.taskUniqueId === t.uniqueId) continue
      const key = `${p.taskUniqueId}>${t.uniqueId}`
      if (seen.has(key)) continue
      seen.add(key)
      const kind = p.type.toUpperCase() as LinkKind
      links.push({
        pred_ext_uid: p.taskUniqueId,
        succ_ext_uid: t.uniqueId,
        kind: LINK_KINDS.has(kind) ? kind : 'FS',
        lag_days: lagInDays(p.lag),
      })
    }
  }

  return { tasks, links }
}
