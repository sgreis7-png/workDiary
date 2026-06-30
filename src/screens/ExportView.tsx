import { useState } from 'react'
import { Button, Field } from '../components/ui'
import { useI18n } from '../i18n'
import { searchEntries } from '../api'
import { buildReportHtml } from '../report'
import { useStore } from '../store'
import type { Entry } from '../data'

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
  const [busy, setBusy] = useState(false)

  const defs = fieldDefs.filter((f) => f.active)
  const users = Object.entries(userMap).sort((a, b) => a[1].localeCompare(b[1]))

  const generate = async () => {
    setBusy(true)
    try {
      const r = await searchEntries({ projectId: projectId || undefined, userId: userId || undefined, from: from || undefined, to: to || undefined })
      setEntries(r)
    } finally { setBusy(false) }
  }

  return (
    <div className="report-wrap">
      <div className="report-bar no-print" style={{ flexWrap: 'wrap' }}>
        <Field label={t('project')}>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{t('all_projects')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
        {entries && entries.length > 0 && <Button variant="primary" onClick={() => window.print()}>📄 {t('print_pdf')}</Button>}
      </div>

      {entries && (
        <div className="report-paper">
          <div className="no-print" style={{ marginBottom: 16 }}><span className="count mono">{entries.length} {t('results_n')}</span></div>
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
