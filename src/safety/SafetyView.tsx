import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { useStore } from '../store'
import { usePerms } from '../lib/usePerms'
import { SendMailDialog } from '../components/SendMailDialog'
import { getSafetyForm, deleteSafetyForm } from './api'
import { safetyFormHtml } from './report'
import { st } from './i18n'
import type { SafetyFormRec } from './model'

// Official-layout form view: same html builder feeds the on-screen paper, the
// print output and the mail body, so all three are always in sync. Mirrors
// ReportView.tsx's screen structure.
export function SafetyView() {
  const { id } = useParams()
  const { lang, t } = useI18n()
  const nav = useNavigate()
  const { projectName } = useStore()
  const { canEdit } = usePerms()
  const [form, setForm] = useState<SafetyFormRec | null | undefined>(undefined)
  const [sendOpen, setSendOpen] = useState(false)

  useEffect(() => {
    let alive = true
    getSafetyForm(id ?? '').then((f) => { if (alive) setForm(f) }).catch(() => { if (alive) setForm(null) })
    return () => { alive = false }
  }, [id])

  if (form === undefined) return <Loader full />
  if (!form) return <div className="empty"><div className="big">404</div></div>

  const html = safetyFormHtml(form, projectName(form.project_id), lang)

  const onDelete = async () => {
    if (!window.confirm(st(lang, 'view_delete_confirm'))) return
    await deleteSafetyForm(form.id)
    nav('/safety')
  }

  return (
    <div className="report-wrap">
      <div className="report-bar no-print">
        <button className="btn btn--ghost" onClick={() => nav('/safety')}>→ {t('back')}</button>
        <div style={{ display: 'flex', gap: 10, marginInlineStart: 'auto', flexWrap: 'wrap' }}>
          {canEdit('safety') && (
            <button className="btn btn--ghost" onClick={() => nav(`/safety/${form.id}/edit`)}>{st(lang, 'view_edit')}</button>
          )}
          {canEdit('safety') && (
            <button className="btn btn--ghost" onClick={onDelete}>{t('delete')}</button>
          )}
          <button className="btn btn--ghost" onClick={() => setSendOpen(true)}>{st(lang, 'view_send')}</button>
          <button className="btn btn--primary" onClick={() => window.print()}>📄 {t('print_pdf')}</button>
        </div>
      </div>
      {sendOpen && (
        <SendMailDialog
          subject={`הדרכת בטיחות · ${projectName(form.project_id)} · ${form.training_date}`}
          html={`<!doctype html><html dir="rtl" lang="he"><body dir="rtl">${html}</body></html>`}
          onClose={() => setSendOpen(false)}
          onSent={() => {}}
        />
      )}
      <div className="report-paper" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
