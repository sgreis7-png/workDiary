import { useEffect, useState } from 'react'
import { Loader } from '../components/Loader'
import { useAuth } from '../auth'
import { fetchUsers } from '../api'
import { fetchMyMessages, sendUserMessage, ackMessage, type UserMessage } from '../lib/messages'
import type { AppUser } from '../data'

const fmt = (d: string) => new Date(d).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })

const QUICK_EMOJIS = ['👍', '✅', '❌', '❓', '⏰', '🔧', '🧱', '📷', '🚜', '⚠️', '💪', '🙏']

export default function Messages() {
  const { user } = useAuth()
  const [inbox, setInbox] = useState<UserMessage[] | null>(null)
  const [sent, setSent] = useState<UserMessage[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [to, setTo] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox')

  const reload = () => {
    if (!user?.email) return
    fetchMyMessages(user.email)
      .then(({ inbox, sent }) => { setInbox(inbox); setSent(sent) })
      .catch((e) => setErr(String(e.message ?? e)))
  }

  useEffect(() => {
    reload()
    fetchUsers()
      .then((us) => setUsers(us.filter((u) => u.active && u.registered && u.email.toLowerCase() !== user?.email?.toLowerCase())))
      .catch(() => setUsers([]))
  }, [user?.email]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onSend() {
    if (!user || !to || !body.trim() || busy) return
    setBusy(true); setErr('')
    try {
      await sendUserMessage({ email: user.email, name: user.name }, to, body.trim())
      setBody(''); reload(); setTab('sent')
    } catch (e) { setErr(String((e as Error).message ?? e)) }
    finally { setBusy(false) }
  }

  async function onAck(m: UserMessage) {
    try {
      await ackMessage(m.id)
      setInbox((prev) => (prev ?? []).map((x) => x.id === m.id ? { ...x, ack_at: new Date().toISOString() } : x))
      window.dispatchEvent(new Event('messages-changed'))
    } catch (e) { setErr(String((e as Error).message ?? e)) }
  }

  if (!inbox) return <Loader label="טוען הודעות…" />
  const unacked = inbox.filter((m) => !m.ack_at)

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">תקשורת פנימית</div>
          <h1 className="page-title">הודעות</h1>
        </div>
        {unacked.length > 0 && <span className="count mono">{unacked.length} ממתינות לאישור</span>}
      </div>

      {err && <div className="alert">{err}</div>}

      <div className="msg-compose">
        <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">אל מי לשלוח?</option>
          {users.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}
        </select>
        <input
          className="input" placeholder="ההודעה… (למשל: סיימת את העבודה בלול 3?)"
          value={body} onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSend()}
        />
        <button className="btn btn--primary" disabled={!to || !body.trim() || busy} onClick={onSend}>
          {busy ? 'שולח…' : '✉ שליחה'}
        </button>
      </div>
      <div className="msg-emojis">
        {QUICK_EMOJIS.map((e) => (
          <button key={e} type="button" className="msg-emoji" title="הוספה להודעה" onClick={() => setBody((b) => b + (b && !b.endsWith(' ') ? ' ' : '') + e)}>
            {e}
          </button>
        ))}
      </div>

      <div className="coop-tabs" role="tablist" style={{ marginTop: 20 }}>
        <button role="tab" aria-selected={tab === 'inbox'} className={`coop-tab ${tab === 'inbox' ? 'on' : ''}`} onClick={() => setTab('inbox')}>
          נכנסות {unacked.length > 0 && <span className="coop-tab__badge">{unacked.length}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'sent'} className={`coop-tab ${tab === 'sent' ? 'on' : ''}`} onClick={() => setTab('sent')}>יוצאות</button>
      </div>

      {tab === 'inbox' ? (
        inbox.length === 0 ? <div className="empty">אין הודעות נכנסות.</div> : (
          <div className="msg-list">
            {inbox.map((m) => (
              <div key={m.id} className={`msg ${!m.ack_at ? 'msg--new' : ''}`}>
                <div className="msg__head">
                  <b>{m.from_name ?? m.from_email}</b>
                  <small className="mono">{fmt(m.created_at)}</small>
                </div>
                <p className="msg__body">{m.body}</p>
                <div className="msg__foot">
                  {m.ack_at
                    ? <small className="msg__acked">✔ אושר ב-{fmt(m.ack_at)}</small>
                    : <button className="btn btn--primary" onClick={() => onAck(m)}>✔ ראיתי — אישור קריאה</button>}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        sent.length === 0 ? <div className="empty">לא נשלחו הודעות.</div> : (
          <div className="msg-list">
            {sent.map((m) => {
              const rec = users.find((u) => u.email.toLowerCase() === m.to_email.toLowerCase())
              return (
                <div key={m.id} className="msg">
                  <div className="msg__head">
                    <b>אל: {rec?.name ?? m.to_email}</b>
                    <small className="mono">{fmt(m.created_at)}</small>
                  </div>
                  <p className="msg__body">{m.body}</p>
                  <div className="msg__foot">
                    {m.ack_at
                      ? <small className="msg__acked">✔ נקרא ואושר ב-{fmt(m.ack_at)}</small>
                      : <small className="msg__pending">⧖ טרם אושרה קריאה</small>}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
