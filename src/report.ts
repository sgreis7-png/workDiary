// Builds a self-contained, professional HTML report for an entry — used for the
// "Open in Outlook" copy-paste flow (no email provider needed; the user sends it
// from their own mail client).
import type { Entry, FieldDef } from './data'
import { deptIdOf, MALFUNCTION_DEPT_KEY, MALFUNCTION_TEXT_KEY } from './data'

const SUPA = import.meta.env.VITE_SUPABASE_URL as string
export const LOGO_URL = `${SUPA}/storage/v1/object/public/brand/logo.png`

const esc = (s: string) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

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

  // Photos rendered as separate, large, full-resolution images so recipients can
  // open / zoom each one (not tiny thumbnails).
  const photos = o.entry.photos.length ? `
    <div style="font-size:18px;font-weight:800;color:${I};margin:28px 0 4px">תמונות מהשטח (${o.entry.photos.length})</div>
    ${o.entry.photos.map((u, i) => `<div style="margin:14px 0"><a href="${u}" target="_blank" style="text-decoration:none"><img src="${u}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border-radius:12px;border:1px solid ${LINE}" alt="תמונה ${i + 1}" /></a></div>`).join('')}` : ''

  return `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;max-width:680px">
    <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="width:680px;max-width:100%;background:#fff;border:1px solid ${LINE};border-radius:16px;overflow:hidden">
      <tr><td style="padding:28px 32px 18px;border-bottom:4px solid ${GREEN}"><img src="${logoUrl}" height="44" style="height:44px;display:block" alt="Agrotop" /></td></tr>
      <tr><td style="padding:26px 32px 8px">
        <div style="font-size:15px;color:${MUT}">יומן עבודה · ${esc(o.entry.work_date)}</div>
        <div style="font-size:30px;font-weight:800;color:${I};margin-top:6px">${esc(o.projectName)}</div>
        <div style="font-size:16px;color:${MUT};margin-top:6px">מנהל עבודה: ${esc(o.authorName)}</div></td></tr>
      <tr><td style="padding:14px 32px 8px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${LINE};border-radius:12px;overflow:hidden">${rows}</table>
        ${photos}</td></tr>
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
  lines.push('', 'Agrotop Work Diary')
  return lines.join('\n')
}
