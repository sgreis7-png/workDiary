import { useState } from 'react'
import { useI18n } from '../i18n'
import { useAuth } from '../auth'
import { isPopupBlocked, parseRecipients, sendMailViaOutlook } from '../lib/outlookSend'

const LS_RECIPIENTS = 'outlook_last_recipients'

/** Modal: send a report straight from the user's Outlook mailbox (Graph). */
export function SendMailDialog({ subject: initialSubject, html, onClose, onSent }: {
  subject: string
  html: string
  onClose: () => void
  onSent?: () => void
}) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [to, setTo] = useState(() => localStorage.getItem(LS_RECIPIENTS) ?? '')
  const [subject, setSubject] = useState(initialSubject)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)

  async function onSend() {
    if (busy) return
    const recipients = parseRecipients(to)
    if (!recipients.length) { setErr(t('send_no_recipients')); return }
    setBusy(true); setErr('')
    try {
      await sendMailViaOutlook({ to: recipients, subject: subject.trim(), html, loginHint: user?.email })
      localStorage.setItem(LS_RECIPIENTS, recipients.join(', '))
      setSent(true)
      onSent?.()
      setTimeout(onClose, 1800)
    } catch (e) {
      setErr(isPopupBlocked(e) ? t('send_popup_blocked') : `${t('send_failed')}: ${String((e as Error).message ?? e)}`)
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} dir="rtl" style={{ maxWidth: 480 }}>
        <h2>{t('send_title')}</h2>
        {sent ? (
          <div className="empty" style={{ padding: '28px 0' }}>✓ {t('send_sent')}</div>
        ) : (
          <>
            <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginTop: 4 }}>
              {t('send_intro')}{user?.email ? ` (${user.email})` : ''}
            </p>
            {err && <div className="alert">{err}</div>}
            <label className="field__label">{t('send_to')}</label>
            <textarea
              className="input" rows={2} dir="ltr" placeholder="name@agrotop.co.il, name2@..."
              value={to} onChange={(e) => setTo(e.target.value)}
            />
            <label className="field__label" style={{ marginTop: 10, display: 'block' }}>{t('send_subject')}</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <div className="form-actions">
              <button className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button>
              <button className="btn btn--primary" disabled={busy} onClick={onSend}>
                {busy ? <span className="spin" /> : t('send_now')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
