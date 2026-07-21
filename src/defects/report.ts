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

// Font scale: 1 for the in-app preview/print, 2 for copy-to-email (Outlook paste
// renders small, so the clipboard variant ships doubled pt sizes).
let SCALE = 1
const pt = (n: number) => `${n * SCALE}pt`

// Every cell carries its own color: email clients (esp. Gmail dark mode / paste
// into compose) drop the <body> styles, so inherited colors turn light-on-light.
// Outlook (Word engine) ignores dir/text-align on <div> — RTL must ride on
// <table>/<td>/<p> with the legacy align attribute, so all blocks are tables.
function th(label: string): string {
  return `<th align="right" style="direction:rtl;unicode-bidi:embed;text-align:right;padding:8px 10px;border-bottom:2px solid ${LINE};color:${MUT};font-size:${pt(9.5)};white-space:nowrap;background:#fff">${label}</th>`
}
function td(v: string, extra = ''): string {
  return `<td dir="rtl" align="right" style="direction:rtl;unicode-bidi:embed;text-align:right;padding:8px 10px;border-bottom:1px solid ${LINE};font-size:${pt(10)};vertical-align:top;color:${I};background:#fff;${extra}">${v}</td>`
}
/** Block wrapper that stays RTL in Outlook: single-cell table with dir+align. */
function rtlBlock(inner: string, extra = ''): string {
  return `<table dir="rtl" align="center" width="100%" cellpadding="0" cellspacing="0" style="direction:rtl;width:100%;border-collapse:collapse;${extra}">
    <tr><td dir="rtl" align="right" style="direction:rtl;unicode-bidi:embed;text-align:right;color:${I}">${inner}</td></tr></table>`
}
function section(title: string, inner: string): string {
  return rtlBlock(
    `<h2 dir="rtl" align="right" style="direction:rtl;unicode-bidi:embed;margin:0 0 10px;font-size:${pt(13)};color:${I};text-align:right">${esc(title)}</h2>${inner}`,
    'margin-top:26px',
  )
}
function table(headers: string[], rows: string): string {
  return `<table dir="rtl" bgcolor="#ffffff" cellpadding="0" cellspacing="0" style="direction:rtl;width:100%;border-collapse:collapse;background:#fff;color:${I};border:1px solid ${LINE};border-radius:8px">
    <tr>${headers.map(th).join('')}</tr>${rows}</table>`
}

export function buildCoopReportHtml(b: CoopBundle, projectName: string, opts?: { note?: string; senderName?: string; large?: boolean }, defs: GateDefs = GATES): string {
  SCALE = opts?.large ? 2 : 1
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
  const meta = `<table dir="rtl" bgcolor="#ffffff" style="direction:rtl;width:100%;border-collapse:collapse;background:#fff;color:${I}">${metaRows.map(([k, v], i) =>
    `<tr style="background:${i % 2 ? '#fafcfa' : '#fff'}">
      <td dir="rtl" style="direction:rtl;unicode-bidi:embed;text-align:right;padding:7px 10px;color:${MUT};font-size:${pt(9.5)};width:200px;border-bottom:1px solid ${LINE};background:${i % 2 ? '#fafcfa' : '#fff'}">${esc(k)}</td>
      <td dir="rtl" style="direction:rtl;unicode-bidi:embed;text-align:right;padding:7px 10px;font-weight:600;font-size:${pt(10)};border-bottom:1px solid ${LINE};color:${I};background:${i % 2 ? '#fafcfa' : '#fff'}">${esc(v)}</td></tr>`).join('')}</table>`

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
      return `<p dir="rtl" align="right" style="direction:rtl;unicode-bidi:embed;margin:6px 0 0;font-size:${pt(10)};color:${I};text-align:right">${esc(label)} <b>${esc(s!.signer_name)}</b> · ${fmtDate(s!.signed_at)} ${img}</p>`
    }).join('')
    return section(def.title,
      (filledItems.length ? table(['#', 'הסעיף', 'סטטוס', 'חומרה (אם לא בוצע)', 'הערה', 'בוצע עם גורם חיצוני'], rows) : '')
      + (sigs ? rtlBlock(sigs, 'margin-top:10px') : '')
      + def.footnotes.map((f) => `<table dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="direction:rtl;width:100%;border-collapse:collapse;margin-top:8px"><tr>
          <td dir="rtl" align="right" style="direction:rtl;unicode-bidi:embed;text-align:right;background:#fdf3d7;border:1px solid #e5cf8e;border-radius:6px;padding:8px 12px;font-size:${pt(9.5)};color:${I}">${esc(f)}</td></tr></table>`).join(''))
  }).join('')

  const defectRows = b.defects.map((d) => `<tr>
    ${td(String(d.seq))}${td(esc(GATES[d.gate].shortName))}${td(d.item_no ? esc(itemLabel(defs, d.gate, d.item_no)) : '—')}
    ${td(esc(d.description ?? ''))}${td(d.severity ? esc(SEVERITY_LABELS[d.severity]) : '—')}${td(esc(d.assignee ?? ''))}
    ${td(fmtDate(d.due_date))}${td(d.status === 'open' ? `<b style="color:${CLAY}">${DEFECT_STATUS_LABELS.open}</b>` : `<span style="color:${DEEP}">${DEFECT_STATUS_LABELS.closed}</span>`)}
    ${td(fmtDate(d.closed_on))}${td(esc(d.closure_note ?? ''))}</tr>`).join('')

  const note = opts?.note?.trim()
    ? `<table dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="direction:rtl;width:100%;border-collapse:collapse;margin-top:18px"><tr>
        <td dir="rtl" align="right" style="direction:rtl;unicode-bidi:embed;text-align:right;background:#fff;color:${I};border-right:4px solid ${GREEN};border:1px solid ${LINE};border-radius:8px;padding:12px 16px;font-size:${pt(10)};white-space:pre-wrap">${esc(opts.note)}</td></tr></table>`
    : ''

  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"/>
  <meta name="color-scheme" content="light only"/><meta name="supported-color-schemes" content="light"/>
  <style>:root{color-scheme:light only}</style></head>
  <body bgcolor="#f2f5f3" style="margin:0;background:${BG};font-family:'Assistant','Heebo',Arial,sans-serif;color:${I}">
  <table dir="rtl" align="center" width="860" cellpadding="0" cellspacing="0" style="direction:rtl;max-width:860px;width:100%;border-collapse:collapse;background:${BG}">
    <tr><td dir="rtl" align="right" style="direction:rtl;unicode-bidi:embed;text-align:right;padding:28px 20px;background:${BG};color:${I}">
    <table dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="direction:rtl;width:100%;border-collapse:collapse;border-bottom:3px solid ${GREEN};margin-bottom:6px">
      <tr><td dir="rtl" align="right" style="direction:rtl;unicode-bidi:embed;text-align:right;padding-bottom:14px">
        <p dir="rtl" align="right" style="direction:rtl;unicode-bidi:embed;margin:0;font-size:${pt(9)};letter-spacing:.14em;color:${MUT};text-align:right">AGROTOP · תפיסת סיום שלב</p>
        <h1 dir="rtl" align="right" style="direction:rtl;unicode-bidi:embed;margin:6px 0 0;font-size:${pt(18)};color:${I};text-align:right">${esc(projectName)} — לול ${esc(c.name)}</h1>
        <p dir="rtl" align="right" style="direction:rtl;unicode-bidi:embed;margin:4px 0 0;color:${MUT};font-size:${pt(10)};text-align:right">דוח בקרת איכות${opts?.senderName ? ` · הופק ע"י ${esc(opts.senderName)}` : ''} · ${new Date().toLocaleDateString('he-IL')}</p>
      </td></tr>
    </table>
    ${note}
    ${section('פתיחת פרויקט', meta)}
    ${filledResp.length ? section('מטריצת אחריות', table(['תחום', 'אחריות', 'גורם חיצוני (מי?)', 'הערות'], respRows)) : ''}
    ${answeredGates.length ? section('ריכוז סטטוס', table(['שער', 'בוצע', 'לא בוצע', 'לא רלוונטי', 'טרם', '% הושלם', 'סעיפים "לא בוצע"'], summaryRows)) : ''}
    ${gatesHtml}
    ${section('יומן ליקויים', b.defects.length
      ? table(['מס\'', 'שער', 'סעיף', 'תיאור הליקוי', 'חומרה', 'אחראי לתיקון', 'תאריך יעד', 'סטטוס', 'נסגר בתאריך', 'הערות / אסמכתא'], defectRows)
      : `<p dir="rtl" align="right" style="direction:rtl;unicode-bidi:embed;margin:0;color:${MUT};font-size:${pt(10)};text-align:right">אין ליקויים רשומים.</p>`)}
    ${rtlBlock(`<p dir="rtl" align="right" style="direction:rtl;unicode-bidi:embed;margin:0;padding-top:14px;border-top:1px solid ${LINE};color:${MUT};font-size:${pt(8.5)};text-align:right">
      Agrotop · Agriculture Turnkey Projects — הופק אוטומטית ממערכת יומן עבודה</p>`, 'margin-top:28px')}
  </td></tr></table></body></html>`
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
