import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { getEntry } from '../api'
import { buildReportHtml, buildReportText } from '../report'
import { useStore } from '../store'
import type { Entry } from '../data'

// Standalone, print-optimized report. Same layout on every device. Save as PDF
// (works on phones) or copy (desktop) — then attach/paste into any email.
export default function ReportView() {
  const { id } = useParams()
  const { t } = useI18n()
  const nav = useNavigate()
  const { fieldDefs, projectName, userName } = useStore()
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined)
  const [copyMsg, setCopyMsg] = useState('')

  useEffect(() => {
    let alive = true
    getEntry(id ?? '').then((e) => { if (alive) setEntry(e) }).catch(() => { if (alive) setEntry(null) })
    return () => { alive = false }
  }, [id])

  if (entry === undefined) return <Loader full />
  if (!entry) return <div className="empty"><div className="big">404</div></div>

  const defs = fieldDefs.filter((f) => f.active)
  const html = buildReportHtml({ projectName: projectName(entry.project_id), authorName: userName(entry.created_by), entry, defs })

  const copy = async () => {
    const text = buildReportText({ projectName: projectName(entry.project_id), authorName: userName(entry.created_by), entry, defs })
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })])
      setCopyMsg(t('report_copied'))
    } catch { setCopyMsg(t('copy_failed')) }
  }

  return (
    <div className="report-wrap">
      <div className="report-bar no-print">
        <button className="btn btn--ghost" onClick={() => nav(`/entry/${entry.id}`)}>→ {t('back')}</button>
        <div style={{ display: 'flex', gap: 10, marginInlineStart: 'auto', flexWrap: 'wrap' }}>
          <button className="btn btn--ghost" onClick={copy}>📋 {t('copy_report')}</button>
          <button className="btn btn--primary" onClick={() => window.print()}>📄 {t('print_pdf')}</button>
        </div>
      </div>
      {copyMsg && <div className="tag tag--green no-print" style={{ display: 'block', padding: '12px 16px', margin: '0 auto 16px', maxWidth: 680 }}>{copyMsg}</div>}
      <div className="report-paper" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
