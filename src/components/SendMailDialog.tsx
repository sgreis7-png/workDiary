import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { useAuth } from '../auth'
import { isPopupBlocked, parseRecipients, sendMailViaOutlook } from '../lib/outlookSend'
import { fetchLists, type DistList } from '../lib/distLists'

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
  // mailing lists: own + shared, picked via chips and merged with the manual field
  const [lists, setLists] = useState<DistList[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())

  useEffect(() => { fetchLists().then(setLists).catch(() => {}) }, [])
  const toggleList = (id: string) => setPicked((p) => {
    const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n
  })

  async function onSend() {
    if (busy) return
    const listEmails = lists.filter((l) => picked.has(l.id)).flatMap((l) => l.emails)
    const recipients = [...new Set([...parseRecipients(to), ...listEmails.map((e) => e.toLowerCase())])]
    if (!recipients.length) { setErr(t('send_no_recipients')); return }
    setBusy(true); setErr('')
    try {
      await sendMailViaOutlook({ to: recipients, subject: subject.trim(), html, loginHint: user?.email })
      if (parseRecipients(to).length) localStorage.setItem(LS_RECIPIENTS, parseRecipients(to).join(', '))
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
            {lists.length > 0 && (
              <>
                <label className="field__label" style={{ display: 'block', marginBottom: 6 }}>{t('send_pick_lists')}</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {lists.map((l) => (
                    <button
                      key={l.id} type="button"
                      className={`btn ${picked.has(l.id) ? 'btn--primary' : 'btn--ghost'}`}
                      style={{ padding: '6px 12px', fontSize: 13.5 }}
                      title={l.emails.join(', ')}
                      onClick={() => toggleList(l.id)}
                    >
                      {picked.has(l.id) ? '✓ ' : ''}{l.name} ({l.emails.length})
                    </button>
                  ))}
                </div>
              </>
            )}
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
