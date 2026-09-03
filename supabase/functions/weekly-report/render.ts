// Renders the Sunday traffic-light snapshot as the HTML a VP reads over coffee.
//
// This module is deliberately pure — no Deno APIs, no network, no imports beyond
// types — so the repo's vitest can exercise it even though it ships inside a
// Supabase edge function (Deno). `index.ts` (Task 7) is the only thing that talks
// to the database and to Resend; this file only turns already-fetched rows into a
// string. Mail clients strip <style> blocks, so every bit of layout below is
// inline styles on tables, matching the idiom in src/report.ts.

export type Color = 'gray' | 'red' | 'amber' | 'green' | 'na'
export type AxisKey = 'time' | 'supply' | 'client' | 'crew' | 'issues'

const AXES: AxisKey[] = ['time', 'supply', 'client', 'crew', 'issues']
const AXIS_LABEL: Record<AxisKey, string> = {
  time: 'זמן', supply: 'אספקה', client: 'לקוח', crew: 'כוח אדם', issues: 'בלת"מ',
}
const COLOR_LABEL: Record<Color, string> = {
  red: 'אדום', gray: 'אפור', amber: 'כתום', green: 'ירוק', na: 'לא זמין',
}
/** Board order: red, gray, amber, green, then na (mirrors src/traffic/model.ts sortForBoard). */
const BOARD_ORDER: Record<Color, number> = { red: 0, gray: 1, amber: 2, green: 3, na: 4 }

export interface AxisResultLike {
  color: Color
  reason: string
}

export interface ProjectLightLike {
  project_id: string
  name: string
  manager: string | null
  color: Color
  gray_reason: string | null
  action_line: string
  // Optional/nullable despite mirroring ProjectLight's required fields: this renders
  // stored snapshots, and a snapshot written before a schema change can carry a shape
  // older than the current type — the renderer must not throw on that row.
  due?: { contract: string | null; forecast: string | null; delta_days: number | null } | null
  axes?: Partial<Record<AxisKey, AxisResultLike>> | null
}

export interface TaskLike {
  title: string
  assignee_email: string | null
  due_date: string | null
  project_id: string | null
  axis: string | null
  /** Joined in by index.ts. Null when the task's project was deleted (the FK is ON DELETE
   *  SET NULL), which is the only case the row can carry no name. */
  project_name?: string | null
}

export interface RenderWeeklyReportInput {
  payload: ProjectLightLike[]
  tasks: TaskLike[]
  takenAt: string
  appUrl: string
}

export interface RenderWeeklyReportResult {
  subject: string
  html: string
}

/** In the spirit of src/lib/html.ts's escapeHtml, but this file must not import across
 * the browser/Deno boundary, so it keeps its own copy. For a *text node* only `&`, `<`, `>`
 * matter, and leaving `"` alone is deliberate: Hebrew abbreviations like בלת"מ must read as
 * themselves in the mail, not as `&quot;`. Anything that lands inside a quoted attribute
 * needs `escAttr` instead — `title=` and `href=` below both interpolate. */
function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!
  ))
}

/** `esc` plus the quote characters, for a value interpolated inside an HTML attribute. A
 * project name carrying a `"` would otherwise close the attribute early and let the rest of
 * the name become markup — the same hole the `<script>` test guards in text. */
function escAttr(s: string | null | undefined): string {
  return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const I = '#14181b'
const MUT = '#5a655d'
const LINE = '#d9ded4'
const COLOR_HEX: Record<Color, string> = {
  green: '#3aaa35', amber: '#d8a01a', red: '#c14a15', gray: '#68766f', na: '#c7cec4',
}

/** A small filled (or, for na, outlined) dot standing in for the traffic-light colour. */
function dot(color: Color): string {
  const hex = COLOR_HEX[color]
  const style = color === 'na'
    ? `display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid ${hex};background:#fff;vertical-align:middle`
    : `display:inline-block;width:12px;height:12px;border-radius:50%;background:${hex};vertical-align:middle`
  return `<span style="${style}" title="${escAttr(COLOR_LABEL[color])}"></span>`
}

function chip(color: Color): string {
  return `<span style="white-space:nowrap">${dot(color)} <span style="font-size:13px;color:${MUT}">${esc(COLOR_LABEL[color])}</span></span>`
}

function fmtDelta(delta: number | null): string {
  if (delta === null) return '—'
  if (delta === 0) return '0 ימים'
  const sign = delta > 0 ? '+' : ''
  return `<span dir="ltr">${sign}${delta}</span> ימים`
}

function sortForBoard(a: ProjectLightLike, b: ProjectLightLike): number {
  return BOARD_ORDER[a.color] - BOARD_ORDER[b.color] || a.name.localeCompare(b.name)
}

function axisResult(p: ProjectLightLike, axis: AxisKey): AxisResultLike {
  return p.axes?.[axis] ?? { color: 'na', reason: '' }
}

function boardRowHtml(p: ProjectLightLike, appUrl: string): string {
  const url = `${appUrl}/traffic/${encodeURIComponent(p.project_id)}`
  const axesHtml = AXES.map((a) => `<td style="padding:8px 6px;text-align:center;border-bottom:1px solid ${LINE}">${chip(axisResult(p, a).color)}</td>`).join('')
  return `<tr>
    <td style="padding:10px 12px;border-bottom:1px solid ${LINE};white-space:nowrap">${chip(p.color)}</td>
    <td style="padding:10px 12px;border-bottom:1px solid ${LINE};font-weight:700;color:${I}">
      <a href="${escAttr(url)}" style="color:${I};text-decoration:none">${esc(p.name)}</a>
    </td>
    ${axesHtml}
    <td style="padding:10px 12px;border-bottom:1px solid ${LINE};color:${MUT};font-size:13px;white-space:nowrap">${fmtDelta(p.due?.delta_days ?? null)}</td>
    <td style="padding:10px 12px;border-bottom:1px solid ${LINE};color:${I};font-size:14px">${esc(p.action_line)}</td>
  </tr>`
}

function boardTableHtml(projects: ProjectLightLike[], appUrl: string): string {
  const th = (s: string) => `<td style="padding:8px 12px;background:#f0f4ee;color:${I};font-weight:800;font-size:13px;border-bottom:1px solid ${LINE}">${s}</td>`
  const axisHeaders = AXES.map((a) => th(esc(AXIS_LABEL[a]))).join('')
  const rows = [...projects].sort(sortForBoard).map((p) => boardRowHtml(p, appUrl)).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${LINE};border-radius:12px;overflow:hidden">
    <tr>${th('סטטוס')}${th('פרויקט')}${axisHeaders}${th('סטייה בלו״ז')}${th('פעולה נדרשת')}</tr>
    ${rows}
  </table>`
}

function projectDetailHtml(p: ProjectLightLike, appUrl: string): string {
  const url = `${appUrl}/traffic/${encodeURIComponent(p.project_id)}`
  const axisRows = AXES.map((a) => {
    const r = axisResult(p, a)
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid ${LINE};font-weight:700;color:${I};width:20%">${esc(AXIS_LABEL[a])}</td>
      <td style="padding:8px 12px;border-bottom:1px solid ${LINE};white-space:nowrap">${chip(r.color)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid ${LINE};color:${I};font-size:14px">${esc(r.reason)}</td>
    </tr>`
  }).join('')
  return `<div style="margin:22px 0 6px">
    <div style="font-size:16px;font-weight:800;color:${I}">
      ${chip(p.color)} <a href="${escAttr(url)}" style="color:${I};text-decoration:none">${esc(p.name)}</a>
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border-collapse:collapse;border:1px solid ${LINE};border-radius:12px;overflow:hidden">
      ${axisRows}
    </table>
  </div>`
}

function taskSectionHtml(tasks: TaskLike[]): string {
  if (tasks.length === 0) return ''
  const groups = new Map<string, TaskLike[]>()
  for (const t of tasks) {
    const key = t.assignee_email ?? ''
    const list = groups.get(key)
    if (list) list.push(t)
    else groups.set(key, [t])
  }
  const groupKeys = [...groups.keys()].sort((a, b) => {
    if (a === '' && b === '') return 0
    if (a === '') return 1
    if (b === '') return -1
    return a.localeCompare(b)
  })
  const groupsHtml = groupKeys.map((key) => {
    const label = key === '' ? 'ללא אחראי' : key
    // The project name is the first column: a manager covering three sites otherwise reads
    // three rows that differ only in their wording, with nothing saying which site each is for.
    const rows = groups.get(key)!.map((t) => `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid ${LINE};color:${I};font-size:14px;font-weight:700;white-space:nowrap">${esc(t.project_name ?? '—')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid ${LINE};color:${I};font-size:14px">${esc(t.title)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid ${LINE};color:${MUT};font-size:13px;white-space:nowrap">${t.due_date ? esc(t.due_date) : '—'}</td>
    </tr>`).join('')
    return `<div style="margin:14px 0 4px">
      <div style="font-weight:700;color:${I};font-size:14px">${esc(label)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;border-collapse:collapse;border:1px solid ${LINE};border-radius:12px;overflow:hidden">
        ${rows}
      </table>
    </div>`
  }).join('')
  return `<div style="margin:28px 0 0">
    <div style="font-size:18px;font-weight:800;color:${I};margin-bottom:6px">משימות פתוחות</div>
    ${groupsHtml}
  </div>`
}

export function renderWeeklyReport(input: RenderWeeklyReportInput): RenderWeeklyReportResult {
  const { payload, tasks, takenAt, appUrl } = input
  const counts: Record<Color, number> = { red: 0, gray: 0, amber: 0, green: 0, na: 0 }
  for (const p of payload) counts[p.color] = (counts[p.color] ?? 0) + 1
  const subject = `🚦 דוח רמזור שבועי — ${counts.red} אדום · ${counts.gray} אפור · ${counts.amber} כתום`

  const nonGreen = [...payload].filter((p) => p.color !== 'green').sort(sortForBoard)
  const detailHtml = nonGreen.length ? `<div style="margin-top:32px">
      <div style="font-size:20px;font-weight:800;color:${I};margin-bottom:6px">פירוט פרויקטים שאינם ירוקים</div>
      ${nonGreen.map((p) => projectDetailHtml(p, appUrl)).join('')}
    </div>` : ''

  const html = `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:900px">
    <table role="presentation" width="900" cellpadding="0" cellspacing="0" style="width:900px;max-width:100%;background:#fff;border:1px solid ${LINE};border-radius:16px;overflow:hidden">
      <tr><td style="padding:26px 32px 8px">
        <div style="font-size:15px;color:${MUT}">דוח רמזור שבועי · <span dir="ltr">${esc(takenAt.slice(0, 10))}</span></div>
        <div style="font-size:26px;font-weight:800;color:${I};margin-top:6px">מצב הפרויקטים</div>
      </td></tr>
      <tr><td style="padding:14px 32px 8px">
        ${boardTableHtml(payload, appUrl)}
        ${detailHtml}
        ${taskSectionHtml(tasks)}
      </td></tr>
      <tr><td style="padding:22px 32px 28px"><div style="border-top:1px solid ${LINE};padding-top:16px;font-size:13px;color:#94a094">דוח רמזור שבועי · <span style="color:${COLOR_HEX.green};font-weight:700">Agrotop Work Diary</span></div></td></tr>
    </table>
  </div>`

  return { subject, html }
}
