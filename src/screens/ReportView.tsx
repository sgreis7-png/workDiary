import { useEffect, useState, type MouseEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Loader } from '../components/Loader'
import { Lightbox } from '../components/Lightbox'
import { useI18n } from '../i18n'
import { getEntry } from '../api'
import { MAIL_PHOTO_TTL } from '../lib/storagePaths'
import { buildReportHtml, buildReportText } from '../report'
import { useStore } from '../store'
import { supabase } from '../lib/supabase'
import { printPage } from '../lib/printPage'
import { SendMailDialog } from '../components/SendMailDialog'
import type { Entry } from '../data'

// Standalone, print-optimized report. Same layout on every device. Printing goes through
// printPage(), because window.print() does nothing in an installed app — see there.
export default function ReportView() {
  const { id } = useParams()
  const { t } = useI18n()
  const nav = useNavigate()
  const { fieldDefs, projectName, userName } = useStore()
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined)
  const [copyMsg, setCopyMsg] = useState('')
  const [sendOpen, setSendOpen] = useState(false)
  const [lightbox, setLightbox] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    // Long-lived photo URLs: this screen's HTML is what gets copied and emailed, and
    // the recipient opens the mail long after the default 1h signature has expired.
    getEntry(id ?? '', { photoTtl: MAIL_PHOTO_TTL }).then((e) => { if (alive) setEntry(e) }).catch(() => { if (alive) setEntry(null) })
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

  // The installed app cannot print; printPage hands the report to the browser instead, and
  // says so, rather than leaving a button that looks broken.
  const print = () => {
    const outcome = printPage()
    if (outcome === 'opened') setCopyMsg(t('print_in_browser'))
    else if (outcome === 'blocked') setCopyMsg(t('print_blocked'))
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
          <button className="btn btn--ghost" onClick={() => setSendOpen(true)}>{t('send_outlook')}</button>
          <button className="btn btn--primary" onClick={print}>📄 {t('print_pdf')}</button>
        </div>
      </div>
      {sendOpen && (
        <SendMailDialog
          subject={`יומן עבודה · ${projectName(entry.project_id)} · ${entry.work_date}`}
          html={`<!doctype html><html dir="rtl" lang="he"><body dir="rtl">${html}</body></html>`}
          onClose={() => setSendOpen(false)}
          onSent={() => {
            // keep the "last sent" badge in EntryDetail meaningful; RLS may
            // reject non-author updates — the send itself already succeeded
            supabase.from('entries').update({ last_sent_at: new Date().toISOString() })
              .eq('id', entry.id).then(() => {}, () => {})
          }}
        />
      )}
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
