import { useEffect, useState, type MouseEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Loader } from '../components/Loader'
import { Lightbox } from '../components/Lightbox'
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
  const [lightbox, setLightbox] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    getEntry(id ?? '').then((e) => { if (alive) setEntry(e) }).catch(() => { if (alive) setEntry(null) })
    return () => { alive = false }
  }, [id])

  if (entry === undefined) return <Loader full />
  if (!entry) return <div className="empty"><div className="big">404</div></div>

  const defs = fieldDefs.filter((f) => f.active)
  const html = buildReportHtml({ projectName: projectName(entry.project_id), authorName: userName(entry.created_by), entry, defs })

  // Photos in the report HTML are <a><img>; intercept clicks to open the
  // in-app Lightbox (centered, zoomable) instead of navigating to a new tab.
  const onPaperClick = (e: MouseEvent) => {
    const img = (e.target as HTMLElement).closest('img')
    if (!img) return
    const idx = entry.photos.indexOf(img.getAttribute('src') ?? '')
    if (idx >= 0) { e.preventDefault(); setLightbox(idx) }
  }

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
      <div className="report-paper" onClickCapture={onPaperClick} dangerouslySetInnerHTML={{ __html: html }} />
      <AnimatePresence>
        {lightbox !== null && (
          <Lightbox photos={entry.photos} index={lightbox} onClose={() => setLightbox(null)} onIndex={setLightbox} />
        )}
      </AnimatePresence>
    </div>
  )
}
