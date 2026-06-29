// Builds a self-contained, professional HTML report for an entry — used for the
// "Open in Outlook" copy-paste flow (no email provider needed; the user sends it
// from their own mail client).
import type { Entry, FieldDef } from './data'

const SUPA = import.meta.env.VITE_SUPABASE_URL as string
export const LOGO_URL = `${SUPA}/storage/v1/object/public/brand/logo.png`

const esc = (s: string) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export function buildReportHtml(o: {
  projectName: string; authorName: string; entry: Entry; defs: FieldDef[]
}): string {
  const I = '#14181b', MUT = '#6c747a', LINE = '#e4e8e1', GREEN = '#3aaa35'
  const v = o.entry.values
  const rows = o.defs
    .filter((f) => f.type !== 'photo' && String(v[f.key] ?? '').trim())
    .map((f, i) => `<tr style="background:${i % 2 ? '#fafbf9' : '#ffffff'}">
      <td style="padding:12px 16px;color:${MUT};font-weight:700;white-space:nowrap;vertical-align:top;width:38%;border-bottom:1px solid ${LINE}">${esc(f.label_he)}</td>
      <td style="padding:12px 16px;color:${I};vertical-align:top;border-bottom:1px solid ${LINE}">${esc(v[f.key]).replace(/\n/g, '<br>')}</td></tr>`).join('')
  const photos = o.entry.photos.length ? `<div style="margin-top:24px"><div style="font-weight:800;color:${I};margin-bottom:10px">תמונות מהשטח</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px"><tr>
    ${o.entry.photos.map((u) => `<td style="padding:0"><img src="${u}" width="180" style="display:block;width:180px;height:130px;object-fit:cover;border-radius:10px;border:1px solid ${LINE}" /></td>`).join('')}</tr></table></div>` : ''

  return `<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#fff;border:1px solid ${LINE};border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif" dir="rtl">
    <tr><td style="padding:24px 28px 16px;border-bottom:3px solid ${GREEN}"><img src="${LOGO_URL}" height="34" style="height:34px;display:block" alt="Agrotop" /></td></tr>
    <tr><td style="padding:22px 28px 6px"><div style="font-size:13px;color:${MUT}">יומן עבודה · ${esc(o.entry.work_date)}</div>
      <div style="font-size:24px;font-weight:800;color:${I};margin-top:4px">${esc(o.projectName)}</div>
      <div style="font-size:14px;color:${MUT};margin-top:4px">מנהל עבודה: ${esc(o.authorName)}</div></td></tr>
    <tr><td style="padding:12px 28px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${LINE};border-radius:10px;overflow:hidden">${rows}</table>${photos}</td></tr>
    <tr><td style="padding:20px 28px 24px"><div style="border-top:1px solid ${LINE};padding-top:14px;font-size:12px;color:#94a094">דוח יומן עבודה · <span style="color:${GREEN}">Agrotop Work Diary</span></div></td></tr>
  </table>`
}

/** Plain-text fallback (for clients that ignore HTML, and the mailto body). */
export function buildReportText(o: { projectName: string; authorName: string; entry: Entry; defs: FieldDef[] }): string {
  const v = o.entry.values
  const lines = [`יומן עבודה — ${o.projectName} — ${o.entry.work_date}`, `מנהל עבודה: ${o.authorName}`, '']
  for (const f of o.defs) {
    if (f.type === 'photo') continue
    const val = String(v[f.key] ?? '').trim()
    if (val) lines.push(`${f.label_he}: ${val}`)
  }
  lines.push('', 'Agrotop Work Diary')
  return lines.join('\n')
}
