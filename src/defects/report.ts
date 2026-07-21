// Coop (לול) stage-gate report — self-contained RTL HTML for print / email.
// Inline styles only: email clients ignore stylesheets.
import type { CoopBundle } from './api'
import {
  GATES, GATE_ORDER, STATUS_LABELS, SEVERITY_LABELS, DEFECT_STATUS_LABELS,
  COOP_TYPE_LABELS, YES_NO_LABELS, RESPONSIBLE_LABELS, RESP_DOMAINS, SIGNATURE_ROLES,
} from './model'
import { itemLabel, type GateDefs } from './defs'
import { gateSummary } from './rules'

const I = '#14181b', MUT = '#6c747a', LINE = '#e0e5e2', GREEN = '#3aaa35', DEEP = '#1f7a1b', BG = '#f2f5f3', CLAY = '#c14a15'

function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
}
const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('he-IL') : '—')

// Every cell carries its own color: email clients (esp. Gmail dark mode / paste
// into compose) drop the <body> styles, so inherited colors turn light-on-light.
function th(label: string): string {
  return `<th style="text-align:right;padding:8px 10px;border-bottom:2px solid ${LINE};color:${MUT};font-size:13.5px;white-space:nowrap;background:#fff">${label}</th>`
}
function td(v: string, extra = ''): string {
  return `<td dir="rtl" style="text-align:right;padding:8px 10px;border-bottom:1px solid ${LINE};font-size:15.5px;vertical-align:top;color:${I};background:#fff;${extra}">${v}</td>`
}
function section(title: string, inner: string): string {
  return `<div dir="rtl" style="margin-top:26px;color:${I};text-align:right">
    <h2 style="margin:0 0 10px;font-size:19px;color:${I};text-align:right">${esc(title)}</h2>${inner}</div>`
}
function table(headers: string[], rows: string): string {
  return `<table dir="rtl" bgcolor="#ffffff" style="width:100%;border-collapse:collapse;background:#fff;color:${I};border:1px solid ${LINE};border-radius:8px">
    <tr>${headers.map(th).join('')}</tr>${rows}</table>`
}

export function buildCoopReportHtml(b: CoopBundle, projectName: string, opts?: { note?: string; senderName?: string }, defs: GateDefs = GATES): string {
  const c = b.coop
  const yesNo = (v: boolean) => YES_NO_LABELS[v ? 'yes' : 'no']

  // רק מה שמלא נכנס לדו"ח: שורות מטא ריקות מסוננות (בוליאנים נשארים — "לא" זה מידע)
  const metaRows: [string, string][] = ([
    ['פרויקט / אתר', projectName],
    ['לול', c.name],
    ['מספר לולים בחווה', c.farm_coop_count != null ? String(c.farm_coop_count) : ''],
    ['סוג לול', c.coop_type ? COOP_TYPE_LABELS[c.coop_type] : ''],
    ['ספק ציוד גידול', c.equipment_supplier ?? ''],
    ['חימום', yesNo(c.has_heating)],
    ['מזרוני צינון', yesNo(c.has_cooling_pads)],
    ['תריס מאוורר מנהרה', yesNo(c.has_tunnel_shutter)],
    ['מנהל ביצוע', c.execution_manager ?? ''],
    ['מפקח שטח', c.field_supervisor ?? ''],
    ['תאריך פתיחה', c.opened_on ? fmtDate(c.opened_on) : ''],
  ] as [string, string][]).filter(([, v]) => v.trim() !== '')
  const meta = `<table dir="rtl" bgcolor="#ffffff" style="width:100%;border-collapse:collapse;background:#fff;color:${I}">${metaRows.map(([k, v], i) =>
    `<tr style="background:${i % 2 ? '#fafcfa' : '#fff'}">
      <td dir="rtl" style="text-align:right;padding:7px 10px;color:${MUT};font-size:14px;width:200px;border-bottom:1px solid ${LINE};background:${i % 2 ? '#fafcfa' : '#fff'}">${esc(k)}</td>
      <td dir="rtl" style="text-align:right;padding:7px 10px;font-weight:600;font-size:15.5px;border-bottom:1px solid ${LINE};color:${I};background:${i % 2 ? '#fafcfa' : '#fff'}">${esc(v)}</td></tr>`).join('')}</table>`

  const filledResp = RESP_DOMAINS.filter((d) => {
    const r = b.responsibilities.find((x) => x.domain_key === d.key)
    return r && (r.responsible || r.external_who || r.notes)
  })
  const respRows = filledResp.map((d) => {
    const r = b.responsibilities.find((x) => x.domain_key === d.key)
    return `<tr>${td(esc(d.label))}${td(r?.responsible ? esc(RESPONSIBLE_LABELS[r.responsible]) : '')}${td(esc(r?.external_who ?? ''))}${td(esc(r?.notes ?? ''))}</tr>`
  }).join('')

  const itemsState = b.items.map((i) => ({ gate: i.gate, itemNo: i.item_no, status: i.status }))
  const answeredGates = GATE_ORDER.filter((g) => b.items.some((i) => i.gate === g && i.status))
  const summaryRows = answeredGates.map((g) => {
    const s = gateSummary(g, itemsState, defs)
    return `<tr>${td(`<b>${esc(GATES[g].shortName)}</b>`)}${td(String(s.done))}${td(s.notDone ? `<b style="color:${CLAY}">${s.notDone}</b>` : '0')}${td(String(s.na))}${td(String(s.pending))}${td(`${Math.round(s.pct * 100)}%`)}${td(s.notDoneNos.length ? s.notDoneNos.join(', ') : '—')}</tr>`
  }).join('')

  const statusCell = (st: string | null) => {
    if (st === 'done') return `<span style="color:${DEEP};font-weight:700">${STATUS_LABELS.done}</span>`
    if (st === 'not_done') return `<span style="color:${CLAY};font-weight:700">${STATUS_LABELS.not_done}</span>`
    if (st === 'na') return `<span style="color:${MUT}">${STATUS_LABELS.na}</span>`
    return `<span style="color:${MUT}">— טרם —</span>`
  }

  const gatesHtml = GATE_ORDER.map((g) => {
    const def = defs[g]
    // רק סעיפים שמולאו (סטטוס/הערה/חומרה/גורם חיצוני); שער בלי תוכן וללא חתימות מושמט
    const filledItems = def.items.filter((it) => {
      const row = b.items.find((i) => i.gate === g && i.item_no === it.no)
      return row && (row.status || row.note || row.severity || row.external_by)
    })
    const gateSigs = SIGNATURE_ROLES
      .map(({ key, label }) => ({ label, s: b.signatures.find((x) => x.gate === g && x.role === key) }))
      .filter((x) => x.s)
    if (filledItems.length === 0 && gateSigs.length === 0) return ''
    const rows = filledItems.map((it) => {
      const row = b.items.find((i) => i.gate === g && i.item_no === it.no)
      return `<tr>${td(String(it.no))}${td(esc(it.text), 'min-width:220px')}${td(statusCell(row?.status ?? null))}${td(row?.severity ? esc(SEVERITY_LABELS[row.severity]) : '')}${td(esc(row?.note ?? ''))}${td(esc(row?.external_by ?? ''))}</tr>`
    }).join('')
    const sigs = gateSigs.map(({ label, s }) => {
      const img = s!.signature_url ? `<img src="${esc(s!.signature_url)}" alt="" style="height:44px;vertical-align:middle;background:#fff;border:1px solid ${LINE};border-radius:6px;margin-inline-start:10px"/>` : ''
      return `<div style="margin-top:6px;font-size:14.5px;color:${I}">${esc(label)} <b>${esc(s!.signer_name)}</b> · ${fmtDate(s!.signed_at)} ${img}</div>`
    }).join('')
    return section(def.title,
      (filledItems.length ? table(['#', 'הסעיף', 'סטטוס', 'חומרה (אם לא בוצע)', 'הערה', 'בוצע עם גורם חיצוני'], rows) : '')
      + (sigs ? `<div style="margin-top:10px">${sigs}</div>` : '')
      + def.footnotes.map((f) => `<div style="margin-top:8px;background:#fdf3d7;border:1px solid #e5cf8e;border-radius:6px;padding:8px 12px;font-size:13.5px;color:${I}">${esc(f)}</div>`).join(''))
  }).join('')

  const defectRows = b.defects.map((d) => `<tr>
    ${td(String(d.seq))}${td(esc(GATES[d.gate].shortName))}${td(d.item_no ? esc(itemLabel(defs, d.gate, d.item_no)) : '—')}
    ${td(esc(d.description ?? ''))}${td(d.severity ? esc(SEVERITY_LABELS[d.severity]) : '—')}${td(esc(d.assignee ?? ''))}
    ${td(fmtDate(d.due_date))}${td(d.status === 'open' ? `<b style="color:${CLAY}">${DEFECT_STATUS_LABELS.open}</b>` : `<span style="color:${DEEP}">${DEFECT_STATUS_LABELS.closed}</span>`)}
    ${td(fmtDate(d.closed_on))}${td(esc(d.closure_note ?? ''))}</tr>`).join('')

  const note = opts?.note?.trim()
    ? `<div style="background:#fff;color:${I};border-inline-start:4px solid ${GREEN};border:1px solid ${LINE};border-radius:8px;padding:12px 16px;margin-top:18px;font-size:15.5px;white-space:pre-wrap">${esc(opts.note)}</div>`
    : ''

  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"/>
  <meta name="color-scheme" content="light only"/><meta name="supported-color-schemes" content="light"/>
  <style>:root{color-scheme:light only}</style></head>
  <body bgcolor="#f2f5f3" style="margin:0;background:${BG};font-family:'Assistant','Heebo',Arial,sans-serif;color:${I}">
  <div style="max-width:860px;margin:0 auto;padding:28px 20px;background:${BG};color:${I}">
    <div style="border-bottom:3px solid ${GREEN};padding-bottom:14px;margin-bottom:6px">
      <div style="font-size:13px;letter-spacing:.14em;color:${MUT}">AGROTOP · תפיסת סיום שלב</div>
      <h1 style="margin:6px 0 0;font-size:26px;color:${I}">${esc(projectName)} — לול ${esc(c.name)}</h1>
      <div style="color:${MUT};font-size:14.5px;margin-top:4px">דוח בקרת איכות${opts?.senderName ? ` · הופק ע"י ${esc(opts.senderName)}` : ''} · ${new Date().toLocaleDateString('he-IL')}</div>
    </div>
    ${note}
    ${section('פתיחת פרויקט', meta)}
    ${filledResp.length ? section('מטריצת אחריות', table(['תחום', 'אחריות', 'גורם חיצוני (מי?)', 'הערות'], respRows)) : ''}
    ${answeredGates.length ? section('ריכוז סטטוס', table(['שער', 'בוצע', 'לא בוצע', 'לא רלוונטי', 'טרם', '% הושלם', 'סעיפים "לא בוצע"'], summaryRows)) : ''}
    ${gatesHtml}
    ${section('יומן ליקויים', b.defects.length
      ? table(['מס\'', 'שער', 'סעיף', 'תיאור הליקוי', 'חומרה', 'אחראי לתיקון', 'תאריך יעד', 'סטטוס', 'נסגר בתאריך', 'הערות / אסמכתא'], defectRows)
      : `<div style="color:${MUT};font-size:14.5px">אין ליקויים רשומים.</div>`)}
    <div style="margin-top:28px;padding-top:14px;border-top:1px solid ${LINE};color:${MUT};font-size:11px">
      Agrotop · Agriculture Turnkey Projects — הופק אוטומטית ממערכת יומן עבודה</div>
  </div></body></html>`
}

export function buildCoopReportText(b: CoopBundle, projectName: string): string {
  const itemsState = b.items.map((i) => ({ gate: i.gate, itemNo: i.item_no, status: i.status }))
  const answered = GATE_ORDER.filter((g) => b.items.some((i) => i.gate === g && i.status))
  const lines: string[] = [
    `תפיסת סיום שלב — ${projectName} — לול ${b.coop.name}`,
    '',
    ...(answered.length ? [
      'ריכוז סטטוס:',
      ...answered.map((g) => {
        const s = gateSummary(g, itemsState)
        return `  ${GATES[g].shortName}: בוצע ${s.done} · לא בוצע ${s.notDone} · לא רלוונטי ${s.na} · טרם ${s.pending} · ${Math.round(s.pct * 100)}%`
      }),
      '',
    ] : []),
    `ליקויים פתוחים: ${b.defects.filter((d) => d.status === 'open').length} מתוך ${b.defects.length}`,
  ]
  return lines.join('\n')
}
