// Builds a self-contained, professional HTML report for an entry — used for the
// "Open in Outlook" copy-paste flow (no email provider needed; the user sends it
// from their own mail client).
import type { Entry, FieldDef } from './data'
import { deptIdOf, MALFUNCTION_DEPT_KEY, MALFUNCTION_TEXT_KEY, SAFETY_INCIDENT_KEY, SAFETY_TRAINING_KEY } from './data'
import { MISSING_KEY, bdActive, coopLabel, filledMissing, parseCoops, parseMissing, reasonLabel, taskLabel } from './lib/reportTables'

// Official brand artwork served from the app's own domain — the copy that used
// to live in Supabase storage (brand/logo.png) is an outdated crude version.
export const LOGO_URL = 'https://work-diary-phi.vercel.app/agrotop-logo.png'

const esc = (s: string) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ))

// NOTE: the email edge function (supabase/functions/send-entry) renders a near-
// identical template; keep them in sync. They can't share code across the
// browser/Deno boundary. logoUrl is a param so this stays pure/testable.
export function buildReportHtml(o: {
  projectName: string; authorName: string; entry: Entry; defs: FieldDef[]
}, logoUrl: string = LOGO_URL): string {
  const I = '#14181b', MUT = '#5a655d', LINE = '#d9ded4', GREEN = '#3aaa35'
  const v = o.entry.values
  const skipMalf = (key: string) =>
    deptIdOf(v[MALFUNCTION_DEPT_KEY]) === 'none' && (key === MALFUNCTION_DEPT_KEY || key === MALFUNCTION_TEXT_KEY)
  const rows = o.defs
    .filter((f) => f.type !== 'photo' && String(v[f.key] ?? '').trim() && !skipMalf(f.key))
    .map((f, i) => `<tr style="background:${i % 2 ? '#f6f8f4' : '#ffffff'}">
      <td style="padding:14px 18px;color:${MUT};font-weight:700;font-size:16px;vertical-align:top;width:32%;border-bottom:1px solid ${LINE}">${esc(f.label_he)}</td>
      <td style="padding:14px 18px;color:${I};font-size:16px;line-height:1.5;vertical-align:top;border-bottom:1px solid ${LINE}">${esc(v[f.key]).replace(/\n/g, '<br>')}</td></tr>`).join('')

  // The email report is Hebrew — normalize standard task/coop names that were
  // stored in English (entry created with the EN UI).
  const heRows = (rows: { task: string; pct: number; remarks: string }[]) =>
    rows.filter((r) => r.task.trim()).map((r) => ({ ...r, task: taskLabel(r.task, 'he') }))
  const coops = parseCoops(v, 'he')
    .map((c) => ({
      ...c,
      name: coopLabel(c.name, 'he'),
      rows: heRows(c.rows),
      bd: bdActive(c.bd) ? heRows(c.bd) : [],
    }))
    .filter((c) => c.rows.length > 0 || c.pct > 0 || c.bd.length > 0)
  const th = (s: string, w = '') =>
    `<td style="padding:10px 14px;background:#f0f4ee;color:${I};font-weight:800;font-size:14px;border-bottom:1px solid ${LINE};${w}">${s}</td>`
  const td = (s: string, extra = '') =>
    `<td style="padding:10px 14px;color:${I};font-size:15px;vertical-align:middle;border-bottom:1px solid ${LINE};${extra}">${s}</td>`
  const bar = (pct: number) =>
    `<div style="display:flex;align-items:center;gap:8px"><div style="flex:1;background:${LINE};border-radius:6px;height:10px;min-width:80px"><div style="width:${pct}%;background:${GREEN};height:10px;border-radius:6px"></div></div><b style="font-size:13px">${pct}%</b></div>`
  const progressRowsHtml = (rows: { task: string; pct: number; remarks: string }[]) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${LINE};border-radius:12px;overflow:hidden">
      <tr>${th('משימה', 'width:30%')}${th('אחוז ביצוע', 'width:32%')}${th('הערות')}</tr>
      ${rows.map((r, i) => `<tr style="background:${i % 2 ? '#f6f8f4' : '#ffffff'}">${td(esc(r.task))}${td(bar(r.pct))}${td(esc(r.remarks))}</tr>`).join('')}
    </table>`
  const progressHtml = coops.map((c) => `
    <div style="font-size:18px;font-weight:800;color:${I};margin:26px 0 6px">דו״ח התקדמות — ${esc(c.name)} · <span style="color:${GREEN}">${c.pct}%</span></div>
    ${progressRowsHtml(c.rows)}
    ${c.bd.length ? `<div style="font-size:16px;font-weight:800;color:${I};margin:16px 0 6px">ציוד BD — ${esc(c.name)}</div>${progressRowsHtml(c.bd)}` : ''}`).join('')
  // Safety block: training answer only when answered; incident row only when an
  // incident was recorded (empty = nothing happened → stays out of the report).
  const training = String(v[SAFETY_TRAINING_KEY] ?? '').trim()
  const incident = String(v[SAFETY_INCIDENT_KEY] ?? '').trim()
  const safetyHtml = (training || incident) ? `
    <div style="font-size:18px;font-weight:800;color:${I};margin:26px 0 6px">בטיחות</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${LINE};border-radius:12px;overflow:hidden">
      ${training ? `<tr style="background:#ffffff">
        <td style="padding:14px 18px;color:${MUT};font-weight:700;font-size:16px;vertical-align:top;width:32%;border-bottom:1px solid ${LINE}">הדרכת בטיחות לכל העובדים באתר</td>
        <td style="padding:14px 18px;color:${I};font-size:16px;line-height:1.5;vertical-align:top;border-bottom:1px solid ${LINE}">${esc(training)}</td></tr>` : ''}
      ${incident ? `<tr style="background:#fdf1ea">
        <td style="padding:14px 18px;color:#c14a15;font-weight:700;font-size:16px;vertical-align:top;width:32%;border-bottom:1px solid ${LINE}">⚠ תקרית בטיחות</td>
        <td style="padding:14px 18px;color:${I};font-size:16px;line-height:1.5;vertical-align:top;border-bottom:1px solid ${LINE}">${esc(incident).replace(/\n/g, '<br>')}</td></tr>` : ''}
    </table>` : ''
  const missing = filledMissing(parseMissing(v[MISSING_KEY]))
  const missingHtml = missing.length ? `
    <div style="font-size:18px;font-weight:800;color:${I};margin:26px 0 6px">חומר חסר</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${LINE};border-radius:12px;overflow:hidden">
      <tr>${th('מק״ט')}${th('תיאור')}${th('כמות')}${th('סיבה')}</tr>
      ${missing.map((r, i) => `<tr style="background:${i % 2 ? '#f6f8f4' : '#ffffff'}">${td(esc(r.code))}${td(esc(r.desc))}${td(esc(r.amount))}${td(esc(reasonLabel(r.reason, 'he')))}</tr>`).join('')}
    </table>` : ''

  // Photos rendered as separate, large, full-resolution images so recipients can
  // open / zoom each one (not tiny thumbnails).
  const photos = o.entry.photos.length ? `
    <div style="font-size:18px;font-weight:800;color:${I};margin:28px 0 4px">תמונות מהשטח (${o.entry.photos.length})</div>
    ${o.entry.photos.map((u, i) => `<div style="margin:14px 0"><a href="${u}" target="_blank" style="text-decoration:none"><img src="${u}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border-radius:12px;border:1px solid ${LINE}" alt="תמונה ${i + 1}" /></a></div>`).join('')}` : ''

  return `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:680px">
    <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="width:680px;max-width:100%;background:#fff;border:1px solid ${LINE};border-radius:16px;overflow:hidden">
      <tr><td style="padding:28px 32px 18px;border-bottom:4px solid ${GREEN}"><img src="${logoUrl}" height="64" style="height:64px;display:block" alt="Agrotop" /></td></tr>
      <tr><td style="padding:26px 32px 8px">
        <div style="font-size:15px;color:${MUT}">יומן עבודה · ${esc(o.entry.work_date)}</div>
        <div style="font-size:30px;font-weight:800;color:${I};margin-top:6px">${esc(o.projectName)}</div>
        <div style="font-size:16px;color:${MUT};margin-top:6px">מנהל עבודה: ${esc(o.authorName)}</div></td></tr>
      <tr><td style="padding:14px 32px 8px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${LINE};border-radius:12px;overflow:hidden">${rows}</table>
        ${safetyHtml}${progressHtml}${missingHtml}${photos}</td></tr>
      <tr><td style="padding:22px 32px 28px"><div style="border-top:1px solid ${LINE};padding-top:16px;font-size:13px;color:#94a094">דוח יומן עבודה · <span style="color:${GREEN};font-weight:700">Agrotop Work Diary</span></div></td></tr>
    </table>
  </div>`
}

/** Plain-text fallback (for clients that ignore HTML, and the mailto body). */
export function buildReportText(o: { projectName: string; authorName: string; entry: Entry; defs: FieldDef[] }): string {
  const v = o.entry.values
  const skipMalf = (key: string) =>
    deptIdOf(v[MALFUNCTION_DEPT_KEY]) === 'none' && (key === MALFUNCTION_DEPT_KEY || key === MALFUNCTION_TEXT_KEY)
  const lines = [`יומן עבודה — ${o.projectName} — ${o.entry.work_date}`, `מנהל עבודה: ${o.authorName}`, '']
  for (const f of o.defs) {
    if (f.type === 'photo') continue
    if (skipMalf(f.key)) continue
    const val = String(v[f.key] ?? '').trim()
    if (val) lines.push(`${f.label_he}: ${val}`)
  }
  const heRows = (rows: { task: string; pct: number; remarks: string }[]) =>
    rows.filter((r) => r.task.trim()).map((r) => ({ ...r, task: taskLabel(r.task, 'he') }))
  const coops = parseCoops(v, 'he')
    .map((c) => ({
      ...c,
      name: coopLabel(c.name, 'he'),
      rows: heRows(c.rows),
      bd: bdActive(c.bd) ? heRows(c.bd) : [],
    }))
    .filter((c) => c.rows.length > 0 || c.pct > 0 || c.bd.length > 0)
  for (const c of coops) {
    lines.push('', `דו״ח התקדמות — ${c.name} — ${c.pct}%`)
    for (const r of c.rows) lines.push(`  ${r.task}: ${r.pct}%${r.remarks ? ` — ${r.remarks}` : ''}`)
    if (c.bd.length) {
      lines.push(`  ציוד BD:`)
      for (const r of c.bd) lines.push(`    ${r.task}: ${r.pct}%${r.remarks ? ` — ${r.remarks}` : ''}`)
    }
  }
  const training = String(v[SAFETY_TRAINING_KEY] ?? '').trim()
  const incident = String(v[SAFETY_INCIDENT_KEY] ?? '').trim()
  if (training || incident) {
    lines.push('', 'בטיחות')
    if (training) lines.push(`  הדרכת בטיחות לכל העובדים באתר: ${training}`)
    if (incident) lines.push(`  ⚠ תקרית בטיחות: ${incident}`)
  }
  const missing = filledMissing(parseMissing(v[MISSING_KEY]))
  if (missing.length) {
    lines.push('', 'חומר חסר')
    for (const r of missing) lines.push(`  ${[r.code, r.desc, r.amount, reasonLabel(r.reason, 'he')].filter(Boolean).join(' · ')}`)
  }
  lines.push('', 'Agrotop Work Diary')
  return lines.join('\n')
}
