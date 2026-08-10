import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { useAuth } from '../auth'
import { isPopupBlocked, parseRecipients, sendMailViaOutlook } from '../lib/outlookSend'
import { ReportSendError, sendReportByEmail } from '../lib/sendReport'
import { fetchLists, type DistList } from '../lib/distLists'
import { fetchDirectory } from '../api'
import { useDialog } from '../lib/useDialog'

/** Modal: send a report straight from the user's Outlook mailbox (Graph).
 *  Recipients come from three sources that merge: distribution-list chips,
 *  an Outlook-style directory autocomplete, and free-typed addresses. */
export function SendMailDialog({ subject: initialSubject, html, onClose, onSent }: {
  subject: string
  html: string
  onClose: () => void
  onSent?: () => void
}) {
  const { t } = useI18n()
  const { user } = useAuth()
  const panel = useRef<HTMLDivElement>(null)
  useDialog(panel, onClose)
  const [recipients, setRecipients] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState(initialSubject)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // mailing lists: own + shared, picked via chips and merged at send time
  const [lists, setLists] = useState<DistList[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  // directory of everyone registered in the system (Outlook-style suggestions)
  const [directory, setDirectory] = useState<{ name: string; email: string }[]>([])

  useEffect(() => {
    fetchLists().then(setLists).catch(() => {})
    fetchDirectory().then(setDirectory).catch(() => {})
  }, [])

  const toggleList = (id: string) => setPicked((p) => {
    const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n
  })

  const addRecipient = (email: string) => {
    const e = email.trim().toLowerCase()
    if (!e || !e.includes('@')) return
    setRecipients((r) => (r.includes(e) ? r : [...r, e]))
    setQuery('')
    inputRef.current?.focus()
  }
  const removeRecipient = (email: string) =>
    setRecipients((r) => r.filter((x) => x !== email))

  // suggestions: filter by name or email; typing nothing shows the whole
  // directory (scrollable) so a recipient can also be picked without typing
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    return directory
      .filter((d) => !recipients.includes(d.email))
      .filter((d) => !q || d.name.toLowerCase().includes(q) || d.email.includes(q))
  }, [directory, query, recipients])
  const [dirOpen, setDirOpen] = useState(false)

  const onQueryKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
      e.preventDefault()
      if (query.includes('@')) addRecipient(query)
      else if (suggestions.length === 1) addRecipient(suggestions[0].email)
    }
    if (e.key === 'Backspace' && !query && recipients.length) removeRecipient(recipients[recipients.length - 1])
  }

  const addressees = () => {
    const listEmails = lists.filter((l) => picked.has(l.id)).flatMap((l) => l.emails.map((e) => e.toLowerCase()))
    const typed = parseRecipients(query) // a typed-but-not-confirmed address still counts
    return [...new Set([...recipients, ...typed, ...listEmails])]
  }

  const finish = () => {
    setSent(true)
    onSent?.()
    setTimeout(onClose, 1800)
  }

  /** The plain send: the server does it. Nothing to sign in to. */
  async function onSend() {
    if (busy) return
    const all = addressees()
    if (!all.length) { setErr(t('send_no_recipients')); return }
    setBusy(true); setErr('')
    try {
      await sendReportByEmail({ to: all, subject: subject.trim(), html })
      finish()
    } catch (e) {
      // Say which thing went wrong. "failed" with a stack trace is what made the last problem
      // take a week to find.
      const kind = e instanceof ReportSendError ? e.kind : 'unknown'
      const msg =
        kind === 'domain_not_verified' ? t('send_no_domain')
        : kind === 'not_configured' ? t('send_not_configured')
        : kind === 'rate_limited' ? t('send_rate_limited')
        : kind === 'too_many' ? t('send_too_many')
        : kind === 'rejected' ? `${t('send_rejected')} ${(e as ReportSendError).detail ?? ''}`.trim()
        : `${t('send_failed')}: ${String((e as Error).message ?? e)}`
      setErr(msg)
      setBusy(false)
    }
  }

  /** Optional: send from the user's own Outlook so the copy lands in their Sent Items. Needs a
   *  Microsoft sign-in, which is why it is no longer what the main button does. */
  async function onSendViaOutlook() {
    if (busy) return
    const all = addressees()
    if (!all.length) { setErr(t('send_no_recipients')); return }
    setBusy(true); setErr('')
    try {
      await sendMailViaOutlook({ to: all, subject: subject.trim(), html, loginHint: user?.email })
      finish()
    } catch (e) {
      setErr(isPopupBlocked(e) ? t('send_popup_blocked') : `${t('send_failed')}: ${String((e as Error).message ?? e)}`)
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" ref={panel} role="dialog" aria-modal="true" aria-label="שליחת דוח במייל" tabIndex={-1} onClick={(e) => e.stopPropagation()} dir="rtl" style={{ maxWidth: 520 }}>
        <h2>{t('send_title')}</h2>
        {sent ? (
          <div className="empty" style={{ padding: '28px 0' }}>✓ {t('send_sent')}</div>
        ) : (
          <>
            <p style={{ color: 'var(--ink-2)', fontSize: 13.5, marginTop: 4 }}>
              {t('send_intro')}{user?.email ? ` (${user.email})` : ''}
            </p>
            {/* The directory is company-only on purpose; sending is not. Saying so beats leaving
                people to guess whether an outside address will be accepted. */}
            <p style={{ color: 'var(--ink-3)', fontSize: 12.5, margin: '2px 0 0' }}>
              {t('send_any_address')}
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

            <label className="field__label" style={{ display: 'block', marginBottom: 6 }}>{t('send_to')}</label>
            {recipients.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {recipients.map((r) => (
                  <span key={r} className="tag tag--green" dir="ltr" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {directory.find((d) => d.email === r)?.name ?? r}
                    <button type="button" onClick={() => removeRecipient(r)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, fontSize: 13 }}>✕</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <input
                ref={inputRef} className="input" dir="ltr" placeholder={t('send_search_ph')}
                // block the browser's own "recent emails" autofill — only the
                // in-app directory below may suggest addresses
                autoComplete="off" name="wd-recipient-search" type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onQueryKey}
                onFocus={() => setDirOpen(true)}
                onBlur={() => setTimeout(() => setDirOpen(false), 180)}
              />
              {dirOpen && suggestions.length > 0 && (
                <div style={{
                  position: 'absolute', insetInlineStart: 0, insetInlineEnd: 0, top: '100%', zIndex: 30,
                  background: 'var(--panel)', border: '1px solid var(--panel-edge)', borderRadius: 12,
                  marginTop: 4, maxHeight: 220, overflowY: 'auto', boxShadow: '0 12px 32px rgba(0,0,0,.25)',
                }}>
                  {suggestions.map((d) => (
                    <button
                      key={d.email} type="button"
                      onMouseDown={(e) => { e.preventDefault(); addRecipient(d.email) }}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                        width: '100%', padding: '8px 12px', background: 'none', border: 'none',
                        cursor: 'pointer', textAlign: 'start', color: 'var(--ink)',
                      }}
                    >
                      <b style={{ fontSize: 14 }}>{d.name}</b>
                      <small dir="ltr" style={{ color: 'var(--ink-3)' }}>{d.email}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <label className="field__label" style={{ marginTop: 12, display: 'block' }}>{t('send_subject')}</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <div className="form-actions">
              <button className="btn btn--ghost" onClick={onClose}>{t('cancel')}</button>
              {/* Outlook is the primary button again, because it is the path that actually
                  delivers today: the server-side send cannot reach anyone but the Resend account
                  owner until a domain is verified there. Swap them back the moment it is. */}
              <button className="btn btn--ghost" disabled={busy} onClick={onSend}
                title={t('send_server_hint')}>
                {t('send_via_server')}
              </button>
              <button className="btn btn--primary" disabled={busy} onClick={onSendViaOutlook}>
                {busy ? <span className="spin" /> : t('send_now')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
