import { useState } from 'react'
import { useI18n } from '../i18n'
import { MicButton } from './MicButton'
import { submitFeedback } from '../lib/feedback'

/** "דווח" — modal for filing a bug report / feature request to the admins. */
export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const [kind, setKind] = useState<'bug' | 'request'>('bug')
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)

  async function onSend() {
    if (!message.trim() || busy) return
    setBusy(true); setErr('')
    try {
      await submitFeedback(kind, message.trim(), file)
      setSent(true)
      setTimeout(onClose, 1600)
    } catch (e) {
      setErr(String((e as Error).message ?? e)); setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} dir="rtl" style={{ maxWidth: 460 }}>
        <h2>{t('feedback_title')}</h2>
        {sent ? (
          <div className="empty" style={{ padding: '28px 0' }}>✓ {t('feedback_sent')}</div>
        ) : (
          <>
            <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginTop: 4 }}>{t('feedback_intro')}</p>
            {err && <div className="alert">{err}</div>}
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as 'bug' | 'request')} style={{ marginBottom: 10 }}>
              <option value="bug">{t('feedback_kind_bug')}</option>
              <option value="request">{t('feedback_kind_request')}</option>
            </select>
            <div className="input-affix">
              <textarea
                className="input" rows={5} placeholder={t('feedback_ph')}
                value={message} onChange={(e) => setMessage(e.target.value)}
              />
              <MicButton onText={(txt) => setMessage((m) => (m ? m + ' ' : '') + txt)} />
            </div>
            <label className="btn btn--ghost" style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              📷 {file ? file.name : t('feedback_attach')}
              <input type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <div className="form-actions">
              <button className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button>
              <button className="btn btn--primary" disabled={busy || !message.trim()} onClick={onSend}>
                {busy ? <span className="spin" /> : t('feedback_send')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
