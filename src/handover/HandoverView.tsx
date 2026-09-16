import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { SendMailDialog } from '../components/SendMailDialog'
import { printPage } from '../lib/printPage'
import { deleteHandover, getHandover } from './api'
import { handoverFormHtml } from './report'
import { ht } from './i18n'
import type { HandoverRec } from './model'

// Same html builder feeds the on-screen paper, the print output and the mail body, so the
// three cannot drift. Mirrors SafetyView.tsx.
export function HandoverView() {
  const { id } = useParams()
  const { lang, t } = useI18n()
  const nav = useNavigate()
  const { projectName } = useStore()
  const { isAdmin } = useAuth()
  const [form, setForm] = useState<HandoverRec | null | undefined>(undefined)
  const [sendOpen, setSendOpen] = useState(false)
  const [copyMsg, setCopyMsg] = useState('')

  useEffect(() => {
    let alive = true
    getHandover(id ?? '').then((f) => { if (alive) setForm(f) }).catch(() => { if (alive) setForm(null) })
    return () => { alive = false }
  }, [id])

  if (form === undefined) return <Loader full />
  if (!form) return <div className="empty"><div className="big">404</div></div>

  const html = handoverFormHtml(form, projectName(form.project_id), lang)
  // A saved handover is always signed, and migration 0077 gives update/delete to admins
  // only — so the buttons exist for an admin and nobody else.
  const canManage = isAdmin

  const onDelete = async () => {
    if (!window.confirm(ht(lang, 'view_delete_confirm'))) return
    try { await deleteHandover(form.id); nav('/handover') }
    catch (e) {
      const msg = e instanceof Error && e.message === 'forbidden'
        ? ht(lang, 'err_forbidden_delete') : String((e as Error).message ?? e)
      window.alert('⚠ ' + msg)
    }
  }

  const print = () => {
    const outcome = printPage()
    if (outcome === 'opened') setCopyMsg(t('print_in_browser'))
    else if (outcome === 'blocked') setCopyMsg(t('print_blocked'))
  }

  return (
    <div className="report-wrap">
      <div className="report-bar no-print">
        <button className="btn btn--ghost" onClick={() => nav('/handover')}>→ {t('back')}</button>
        <div style={{ display: 'flex', gap: 10, marginInlineStart: 'auto', flexWrap: 'wrap' }}>
          {canManage && (
            <button className="btn btn--ghost" onClick={() => nav(`/handover/${form.id}/edit`)}>{ht(lang, 'view_edit')}</button>
          )}
          {canManage && (
            <button className="btn btn--ghost" onClick={onDelete}>{t('delete')}</button>
          )}
          <button className="btn btn--ghost" onClick={() => setSendOpen(true)}>{ht(lang, 'view_send')}</button>
          <button className="btn btn--primary" onClick={print}>📄 {t('print_pdf')}</button>
        </div>
      </div>
      {!canManage && <div className="muted no-print" style={{ textAlign: 'center', marginBottom: 12 }}>{ht(lang, 'form_locked_hint')}</div>}
      {copyMsg && <div className="tag tag--green no-print" style={{ display: 'block', padding: '12px 16px', margin: '0 auto 16px', maxWidth: 680 }}>{copyMsg}</div>}
      {sendOpen && (
        <SendMailDialog
          subject={`מסירת פרויקט · ${projectName(form.project_id)} · ${form.handover_date}`}
          html={`<!doctype html><html dir="rtl" lang="he"><body dir="rtl">${html}</body></html>`}
          onClose={() => setSendOpen(false)}
          onSent={() => {}}
        />
      )}
      <div className="report-paper" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
