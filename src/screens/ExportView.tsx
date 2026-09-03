import { useState } from 'react'
import { Button, Field } from '../components/ui'
import { useI18n } from '../i18n'
import { searchEntries } from '../api'
import { buildReportHtml } from '../report'
import { downloadCsv } from '../lib/exportCsv'
import { useStore } from '../store'
import { SAFETY_INCIDENT_KEY, SAFETY_TRAINING_KEY } from '../data'
import { parseCoops } from '../lib/reportTables'
import type { Entry } from '../data'
import { printPage } from '../lib/printPage'

// Date-range / per-project bulk export. Renders every matching entry as a report
// and prints to PDF (one entry per page) — for client billing / handover.
export default function ExportView() {
  const { t } = useI18n()
  const { projects, fieldDefs, userMap, projectName, userName } = useStore()
  const [projectId, setProjectId] = useState('')
  const [userId, setUserId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [printMsg, setPrintMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const activeDefs = fieldDefs.filter((f) => f.active)
  // An inactive definition (e.g. the retired free-text contractor field) still gets a
  // column/section when at least one entry in the current selection has a value for it —
  // an export of only new entries must not carry a permanently empty column.
  const defs = entries
    ? [...activeDefs, ...fieldDefs.filter((f) => !f.active && entries.some((e) => (e.values[f.key] ?? '').trim()))]
    : activeDefs
  const users = Object.entries(userMap).sort((a, b) => a[1].localeCompare(b[1]))

  const generate = async () => {
    setBusy(true)
    try {
      const r = await searchEntries(
        { projectId: projectId || undefined, userId: userId || undefined, from: from || undefined, to: to || undefined },
        { photos: false }, // the CSV carries a count, not the images
      )
      setEntries(r.rows)
      setTruncated(r.truncated)
    } finally { setBusy(false) }
  }

  // One row per entry: fixed columns, every active field, then the derived
  // progress/safety values the office actually filters on in Excel.
  // window.print() is inert in the installed app; printPage hands it to the browser
  const doPrint = () => {
    const outcome = printPage()
    setPrintMsg(outcome === 'opened' ? t('print_in_browser') : outcome === 'blocked' ? t('print_blocked') : '')
  }

  const exportCsv = (rows: Entry[]) => {
    const headers = [
      t('work_date_col'), t('project'), t('created_by'),
      ...defs.filter((f) => f.type !== 'photo').map((f) => f.label_he),
      t('house_pct'), t('safety_training_q'), t('safety_incident_q'), t('photos_col'),
    ]
    const data = rows.map((e) => {
      const coops = parseCoops(e.values, 'he')
      const pct = coops.length
        ? coops.map((c) => `${c.name}: ${c.pct}%`).join(' · ')
        : ''
      return [
        e.work_date, projectName(e.project_id), userName(e.created_by),
        ...defs.filter((f) => f.type !== 'photo').map((f) => e.values[f.key] ?? ''),
        pct, e.values[SAFETY_TRAINING_KEY] ?? '', e.values[SAFETY_INCIDENT_KEY] ?? '', e.photo_count,
      ]
    })
    downloadCsv(`work-diary-${from || 'all'}-${to || 'all'}`, headers, data)
  }

  return (
    <div className="report-wrap">
      <div className="report-bar no-print" style={{ flexWrap: 'wrap' }}>
        <Field label={t('project')}>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{t('all_projects')}</option>
            {projects.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label={t('user')}>
          <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">{t('all_users')}</option>
            {users.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </Field>
        <Field label={t('from_date')}><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t('to_date')}><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Button variant="ghost" onClick={generate} disabled={busy}>{busy ? <><span className="spin" /> {t('search')}</> : <>⌕ {t('search')}</>}</Button>
        {entries && entries.length > 0 && <Button variant="primary" onClick={doPrint}>📄 {t('print_pdf')}</Button>}
        {entries && entries.length > 0 && (
          <Button variant="ghost" onClick={() => exportCsv(entries)}>⭳ {t('export_csv')}</Button>
        )}
      </div>

      {entries && (
        <div className="report-paper">
          <div className="no-print" style={{ marginBottom: 16 }}><span className="count mono">{entries.length} {t('results_n')}</span></div>
          {/* an export that silently stopped at the cap would look like a complete record */}
          {truncated && <div className="alert no-print">{t('search_truncated')}</div>}
          {printMsg && <div className="alert no-print">{printMsg}</div>}
          {entries.length === 0 && <div className="empty no-print"><div className="big">{t('no_entries')}</div></div>}
          {entries.map((e) => (
            <div key={e.id} className="export-entry"
              dangerouslySetInnerHTML={{ __html: buildReportHtml({ projectName: projectName(e.project_id), authorName: userName(e.created_by), entry: e, defs }) }} />
          ))}
        </div>
      )}
    </div>
  )
}
