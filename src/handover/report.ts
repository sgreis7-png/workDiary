import type { Lang } from '../i18n'
import { sigSvg } from '../safety/signature'
import { S } from './i18n'
import type { HandoverRec } from './model'

const esc = (s: string) => (s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

const TD = 'border:1px solid #444;padding:6px'

/** The paper form 70 layout, used for the on-screen view, print and the mail body alike —
 *  one builder so the three cannot drift. RTL rides on the wrapper's inline direction,
 *  never on `align`/`dir` attributes: Chromium's clipboard sanitizer drops those on copy. */
export function handoverFormHtml(f: HandoverRec, projectName: string, lang: Lang): string {
  const attendees = (f.attendees ?? []).map((a) => `
    <tr>
      <td style="${TD}">${esc(a.name)}</td>
      <td style="${TD}">${esc(a.role)}</td>
    </tr>`).join('')
  const systems = (f.systems ?? []).map((s) => `
    <tr>
      <td style="${TD}">${esc(s.label)}</td>
      <td style="${TD};text-align:center;white-space:nowrap">${
        s.status === 'ok' ? `✔ ${S.form_ok[lang]}` : s.status === 'bad' ? `✘ ${S.form_bad[lang]}` : ''}</td>
      <td style="${TD}">${esc(s.note)}</td>
    </tr>`).join('')
  return `
  <div dir="rtl" style="direction:rtl;font-family:Arial,'Segoe UI',sans-serif;color:#111;max-width:760px;margin:0 auto">
    <h2 style="text-align:center;margin:8px 0">${S.view_title[lang]} — ${esc(projectName)}</h2>
    <table style="border-collapse:collapse;width:100%;margin-bottom:14px">
      <tr>
        <th style="${TD}">${S.form_client[lang]}</th>
        <th style="${TD}">${S.form_site[lang]}</th>
        <th style="${TD}">${S.form_nature[lang]}</th>
        <th style="${TD}">${S.form_date[lang]}</th>
      </tr>
      <tr>
        <td style="${TD}">${esc(f.client_name)}</td>
        <td style="${TD}">${esc(f.site_location)}</td>
        <td style="${TD}">${esc(f.project_nature)}</td>
        <td style="${TD}"><span dir="ltr">${esc(f.handover_date)}</span></td>
      </tr>
    </table>
    <table style="border-collapse:collapse;width:100%;margin-bottom:14px">
      <tr>
        <th style="${TD}">${S.form_attendees[lang]}</th>
        <th style="${TD};width:38%">${S.form_att_role[lang]}</th>
      </tr>${attendees}
    </table>
    <table style="border-collapse:collapse;width:100%">
      <tr>
        <th style="${TD};width:28%">${S.form_system[lang]}</th>
        <th style="${TD};width:18%">${S.form_status[lang]}</th>
        <th style="${TD}">${S.form_note[lang]}</th>
      </tr>${systems}
    </table>
    ${f.notes?.trim() ? `<p style="margin:14px 0"><b>${S.form_notes[lang]}:</b><br/>${esc(f.notes).replace(/\n/g, '<br/>')}</p>` : ''}
    <p style="margin:18px 0;font-weight:700;text-decoration:underline">${S.view_warranty[lang]}</p>
    <table style="border-collapse:collapse;width:100%;margin-top:10px">
      <tr>
        <th style="${TD}">${S.form_rec_name[lang]}</th>
        <th style="${TD}">${S.form_rec_role[lang]}</th>
        <th style="${TD};width:200px">${S.form_sign[lang]}</th>
      </tr>
      <tr>
        <td style="${TD}">${esc(f.receiver_name)}</td>
        <td style="${TD}">${esc(f.receiver_role)}</td>
        <td style="${TD};text-align:center">${sigSvg(f.receiver_signature, 160)}</td>
      </tr>
    </table>
  </div>`
}
