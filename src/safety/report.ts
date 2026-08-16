import type { Lang } from '../i18n'
import { S } from './i18n'
import type { SafetyFormRec } from './model'
import { sigSvg } from './signature'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

export function safetyFormHtml(f: SafetyFormRec, projectName: string, lang: Lang): string {
  const rows = f.workers.map((w, i) => `
    <tr>
      <td style="border:1px solid #444;padding:6px;text-align:center">${i + 1}</td>
      <td style="border:1px solid #444;padding:6px">${esc(w.name)}</td>
      <td style="border:1px solid #444;padding:6px">${esc(w.id_number)}</td>
      <td style="border:1px solid #444;padding:4px;text-align:center">${sigSvg(w.signature, 120)}</td>
    </tr>`).join('')
  const topics = f.topics.map((t, i) => `<li>${i + 1}. ${esc(t)}</li>`).join('')
  return `
  <div dir="rtl" style="direction:rtl;font-family:Arial,'Segoe UI',sans-serif;color:#111;max-width:760px;margin:0 auto">
    <h2 style="text-align:center;margin:8px 0">טופס הדרכה יומי (Toolbox)</h2>
    <p><b>פרויקט:</b> ${esc(projectName)} &nbsp;&nbsp; <b>תאריך ההדרכה:</b> ${esc(f.training_date)}</p>
    <p style="margin-bottom:4px"><b>נושאי ההדרכה:</b></p>
    <ul style="list-style:none;padding:0;margin:0 0 14px;columns:2">${topics}</ul>
    <table style="border-collapse:collapse;width:100%">
      <tr>
        <th style="border:1px solid #444;padding:6px;width:36px">מס'</th>
        <th style="border:1px solid #444;padding:6px">שם העובד</th>
        <th style="border:1px solid #444;padding:6px">תעודת זהות</th>
        <th style="border:1px solid #444;padding:6px;width:140px">חתימה</th>
      </tr>${rows}
    </table>
    <p style="margin:14px 0">${esc(S.view_declares[lang])}</p>
    <p>
      <b>שם המדריך:</b> ${esc(f.instructor_name)}<br/>
      <b>כשירות המדריך:</b> ${esc(f.instructor_qualification)}<br/>
      <b>חתימת המדריך:</b><br/>${sigSvg(f.instructor_signature, 160)}
    </p>
  </div>`
}
