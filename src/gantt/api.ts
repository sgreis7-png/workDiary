// Supabase data access for project schedules (Gantt).
// Mirrors src/api.ts conventions: thin async wrappers, throw on error.
import { supabase } from '../lib/supabase'
import { toRows, type ConvertedProject, type GanttBundle, type GanttChart, type GanttLink, type GanttTask, type Span } from './model'

const CHART_COLS =
  'id,project_id,name,source_file,source_path,status_date,span_start,span_finish,imported_by,imported_at,updated_at,active'
const TASK_COLS =
  'id,chart_id,ext_uid,parent_ext_uid,sort_order,depth,wbs,name,start_ts,finish_ts,base_start_ts,base_finish_ts,duration_days,pct,milestone,is_summary,critical,notes,resources'
const LINK_COLS = 'id,chart_id,pred_ext_uid,succ_ext_uid,kind,lag_days'

/** Formats accepted for import; anything MPXJ can read. */
export const IMPORT_ACCEPT = '.mpp,.mpt,.mpx,.xml,.xer'
const MAX_IMPORT_BYTES = 50 * 1024 * 1024

export class GanttError extends Error {}

// ---------- charts ----------

export async function fetchCharts(projectId?: string): Promise<GanttChart[]> {
  let q = supabase.from('gantt_charts').select(CHART_COLS).eq('active', true)
  if (projectId) q = q.eq('project_id', projectId)
  const { data, error } = await q.order('imported_at', { ascending: false })
  if (error) throw error
  return data as GanttChart[]
}

export async function fetchBundle(chartId: string): Promise<GanttBundle> {
  const [chartRes, taskRes, linkRes] = await Promise.all([
    supabase.from('gantt_charts').select(CHART_COLS).eq('id', chartId).single(),
    supabase.from('gantt_tasks').select(TASK_COLS).eq('chart_id', chartId).order('sort_order'),
    supabase.from('gantt_links').select(LINK_COLS).eq('chart_id', chartId),
  ])
  if (chartRes.error) throw chartRes.error
  if (taskRes.error) throw taskRes.error
  if (linkRes.error) throw linkRes.error
  return {
    chart: chartRes.data as GanttChart,
    tasks: taskRes.data as GanttTask[],
    links: linkRes.data as GanttLink[],
  }
}

export async function renameChart(chartId: string, name: string): Promise<void> {
  const { error } = await supabase.from('gantt_charts')
    .update({ name, updated_at: new Date().toISOString() }).eq('id', chartId)
  if (error) throw error
}

/** Soft delete: the rows stay for audit, the chart drops out of every listing. */
export async function archiveChart(chartId: string): Promise<void> {
  const { error } = await supabase.from('gantt_charts')
    .update({ active: false, updated_at: new Date().toISOString() }).eq('id', chartId)
  if (error) throw error
}

// ---------- import ----------

/**
 * The deployed converter (services/mpp-converter on Render).
 *
 * Committed rather than configured because it is not a secret: the endpoint verifies the
 * caller's own Supabase token before doing any work, holds no service-role key, and its
 * CORS allowlist only admits this app's origin. Baking it in means a fresh deploy works
 * with no dashboard step. `VITE_MPP_CONVERTER_URL` still overrides it — set it to a
 * localhost address to develop against a converter running on your own machine.
 */
const DEFAULT_CONVERTER_URL = 'https://mpp-converter-dhm3.onrender.com/convert'

/**
 * An override is only honoured if it is actually a reachable-looking http(s) URL.
 *
 * A typo'd or half-pasted value would otherwise beat the working default and fail at
 * upload time with a network error, which reads as "the converter is down" rather than
 * "this setting is wrong". Ignoring it keeps the app working; the console line is for
 * whoever set it.
 */
export function resolveConverterUrl(raw: string | undefined): string {
  const value = raw?.trim()
  if (!value) return DEFAULT_CONVERTER_URL
  try {
    const url = new URL(value)
    const host = url.hostname
    const usable = (url.protocol === 'https:' || url.protocol === 'http:')
      // a placeholder such as 'https://<render host>/convert' can still parse
      && /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(host)
      // a dotless host means a truncated paste ('https:///convert' parses as host
      // 'convert'), with localhost the one legitimate exception
      && (host === 'localhost' || host.includes('.'))
    if (usable) return url.toString()
  } catch {
    // falls through to the default
  }
  console.warn(`[gantt] ignoring unusable VITE_MPP_CONVERTER_URL (${value}); using ${DEFAULT_CONVERTER_URL}`)
  return DEFAULT_CONVERTER_URL
}

const converterEndpoint = (): string =>
  resolveConverterUrl(import.meta.env.VITE_MPP_CONVERTER_URL as string | undefined)

/**
 * Nudge the converter awake, and report whether it answered.
 *
 * On a scale-to-zero host the first request after an idle spell waits for a container
 * and a JVM to boot. Calling this when the schedule screen opens means that happens
 * while the user is still choosing a file rather than after they picked one.
 */
export async function pingConverter(): Promise<boolean> {
  const endpoint = converterEndpoint()
  try {
    const res = await fetch(endpoint.replace(/\/convert\/?$/, '/health'), { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Convert a Microsoft Project file with the MPXJ service.
 *
 * The .mpp container is undocumented binary and there is no browser-side reader for it,
 * so the bytes go to services/mpp-converter, which verifies the caller's own Supabase
 * token before doing any work. Set VITE_MPP_CONVERTER_URL to its /convert endpoint.
 */
export async function convertFile(file: File): Promise<ConvertedProject> {
  const endpoint = converterEndpoint()
  if (file.size > MAX_IMPORT_BYTES) throw new GanttError('err_file_too_big')

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new GanttError('err_forbidden')

  const send = () => fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      // the raw name would break in a header; the converter only uses the extension
      'X-Filename': `schedule${file.name.slice(file.name.lastIndexOf('.')) || '.mpp'}`,
    },
    body: file,
  })

  // A sleeping container answers the first request with a gateway error rather than a
  // conversion, so one retry stands between "the host was cold" and "this file is bad".
  let res: Response
  try {
    res = await send()
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      await new Promise((r) => setTimeout(r, 3000))
      res = await send()
    }
  } catch {
    try {
      await new Promise((r) => setTimeout(r, 3000))
      res = await send()
    } catch {
      throw new GanttError('err_converter_unreachable')
    }
  }

  const body = (await res.json().catch(() => null)) as ConvertedProject | { error?: string } | null
  if (!res.ok || !body) throw new GanttError((body as { error?: string })?.error || 'err_convert_failed')
  const payload = body as ConvertedProject
  if (!Array.isArray(payload.tasks) || !payload.tasks.length) throw new GanttError('err_schedule_empty')
  return payload
}

export interface ImportResult { chart: GanttChart; taskCount: number; linkCount: number }

/**
 * Store a converted schedule as a new chart. The original file is kept alongside it so
 * the import can always be traced back to what the customer sent; a storage failure is
 * not fatal, because the schedule itself is already safe in the rows.
 */
export async function importSchedule(
  projectId: string,
  payload: ConvertedProject,
  file: File | null,
  name?: string,
): Promise<ImportResult> {
  const { tasks, links } = toRows(payload)
  if (!tasks.length) throw new GanttError('err_schedule_empty')

  const { data: userData } = await supabase.auth.getUser()
  const span = tasks.reduce(
    (acc, t) => ({
      start: !acc.start || t.start_ts < acc.start ? t.start_ts : acc.start,
      finish: !acc.finish || t.finish_ts > acc.finish ? t.finish_ts : acc.finish,
    }),
    { start: '', finish: '' } as { start: string; finish: string },
  )

  // the converter only ever sees an ASCII stand-in filename, so the real one comes from
  // the File the user picked
  const originalName = file?.name ?? payload.file
  const { data: chartRow, error: chartErr } = await supabase.from('gantt_charts').insert({
    project_id: projectId,
    name: name?.trim() || payload.properties.name || payload.properties.title || originalName,
    source_file: originalName,
    status_date: payload.properties.statusDate,
    span_start: span.start || null,
    span_finish: span.finish || null,
    imported_by: userData.user?.id ?? null,
  }).select(CHART_COLS).single()
  if (chartErr) throw chartErr
  const chart = chartRow as GanttChart

  try {
    await insertRows('gantt_tasks', tasks.map((t) => ({ ...t, chart_id: chart.id })))
    if (links.length) await insertRows('gantt_links', links.map((l) => ({ ...l, chart_id: chart.id })))
  } catch (e) {
    // a chart with no tasks is worse than no chart
    await supabase.from('gantt_charts').delete().eq('id', chart.id)
    throw e
  }

  if (file) {
    const safe = file.name.replace(/[^\w.-]+/g, '_')
    const path = `imports/${chart.id}/${safe}`
    const { error: upErr } = await supabase.storage.from('photos').upload(path, file)
    if (!upErr) {
      await supabase.from('gantt_charts').update({ source_path: path }).eq('id', chart.id)
      chart.source_path = path
    }
  }

  return { chart, taskCount: tasks.length, linkCount: links.length }
}

/** PostgREST rejects very large payloads; 400 rows at a time keeps well under it. */
async function insertRows(table: 'gantt_tasks' | 'gantt_links', rows: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 400) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + 400))
    if (error) throw error
  }
}

// ---------- editing ----------

export interface TaskPatch extends Partial<Span> { pct?: number; name?: string; notes?: string | null }

export async function patchTask(taskId: string, patch: TaskPatch): Promise<void> {
  const { error } = await supabase.from('gantt_tasks')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', taskId)
  if (error) throw error
}

/**
 * Write a batch of moved tasks. Each row is its own update because they carry different
 * values; PostgREST has no multi-row update, and upsert would need every column.
 */
export async function patchTasks(patches: { id: string; patch: TaskPatch }[]): Promise<void> {
  const stamp = new Date().toISOString()
  for (const { id, patch } of patches) {
    const { error } = await supabase.from('gantt_tasks')
      .update({ ...patch, updated_at: stamp }).eq('id', id)
    if (error) throw error
  }
}

export async function touchChart(chartId: string, span: { start: string; finish: string }): Promise<void> {
  const { error } = await supabase.from('gantt_charts').update({
    span_start: span.start,
    span_finish: span.finish,
    updated_at: new Date().toISOString(),
  }).eq('id', chartId)
  if (error) throw error
}

/** One audit row per editing session, so a schedule change is traceable like a defect. */
export async function logScheduleEdit(chart: GanttChart, details: Record<string, unknown>): Promise<void> {
  const { data: userData } = await supabase.auth.getUser()
  const actor = userData.user?.email
  if (!actor) return // audit_log.actor_email is NOT NULL, and the insert policy keys on it
  await supabase.from('audit_log').insert({
    actor_email: actor,
    action: 'gantt_edit',
    entity: 'gantt_charts',
    entity_id: chart.id,
    details: { project_id: chart.project_id, ...details },
  })
}
