import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader } from '../components/Loader'
import { Avatar } from '../components/ui'
import { EmojiPicker } from '../components/EmojiPicker'
import { useAuth } from '../auth'
import { fetchUsers } from '../api'
import {
  fetchMyMessages, sendUserMessage, ackMessage, fetchProfileMetas,
  type UserMessage, type ProfileMeta,
} from '../lib/messages'
import type { AppUser } from '../data'

const fmtTime = (d: string) => new Date(d).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
const fmtDay = (d: string) => new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
const dayKey = (d: string) => new Date(d).toDateString()

function ChatAvatar({ meta, name, size = 38 }: { meta?: ProfileMeta; name: string; size?: number }) {
  return meta?.avatar_url
    ? <img className="chat-avatar" style={{ width: size, height: size }} src={meta.avatar_url} alt="" />
    : <Avatar name={name} size={size} />
}

export default function Messages() {
  const { user } = useAuth()
  const [inbox, setInbox] = useState<UserMessage[] | null>(null)
  const [sent, setSent] = useState<UserMessage[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [metas, setMetas] = useState<Record<string, ProfileMeta>>({})
  const [active, setActive] = useState('') // contact email
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reload = () => {
    if (!user?.email) return
    fetchMyMessages(user.email)
      .then(({ inbox, sent }) => { setInbox(inbox); setSent(sent) })
      .catch((e) => setErr(String(e.message ?? e)))
  }

  useEffect(() => {
    reload()
    const t = setInterval(reload, 30_000)
    fetchUsers()
      .then((us) => setUsers(us.filter((u) => u.active && u.registered && u.email.toLowerCase() !== user?.email?.toLowerCase())))
      .catch(() => setUsers([]))
    fetchProfileMetas().then(setMetas).catch(() => {})
    return () => clearInterval(t)
  }, [user?.email]) // eslint-disable-line react-hooks/exhaustive-deps

  // conversations: latest message + unacked count per contact
  const contacts = useMemo(() => {
    const all = [...(inbox ?? []), ...sent]
    const byContact = new Map<string, { last: UserMessage; unacked: number }>()
    for (const m of all) {
      const other = (m.to_email.toLowerCase() === user?.email?.toLowerCase() ? m.from_email : m.to_email).toLowerCase()
      const cur = byContact.get(other)
      const isIncomingUnacked = m.to_email.toLowerCase() === user?.email?.toLowerCase() && !m.ack_at
      if (!cur) byContact.set(other, { last: m, unacked: isIncomingUnacked ? 1 : 0 })
      else {
        if (new Date(m.created_at) > new Date(cur.last.created_at)) cur.last = m
        if (isIncomingUnacked) cur.unacked++
      }
    }
    // include users with no history so a chat can be started
    const rows = users.map((u) => {
      const c = byContact.get(u.email.toLowerCase())
      return { user: u, last: c?.last ?? null, unacked: c?.unacked ?? 0 }
    })
    return rows.sort((a, b) => {
      if (a.unacked !== b.unacked) return b.unacked - a.unacked
      const at = a.last ? +new Date(a.last.created_at) : 0
      const bt = b.last ? +new Date(b.last.created_at) : 0
      return bt - at
    })
  }, [inbox, sent, users, user?.email])

  const thread = useMemo(() => {
    if (!active) return []
    const me = user?.email?.toLowerCase()
    return [...(inbox ?? []), ...sent]
      .filter((m) =>
        (m.from_email.toLowerCase() === active && m.to_email.toLowerCase() === me)
        || (m.to_email.toLowerCase() === active && m.from_email.toLowerCase() === me))
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
  }, [inbox, sent, active, user?.email])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [thread.length, active])

  async function onSend() {
    if (!user || !active || !body.trim() || busy) return
    setBusy(true); setErr('')
    try {
      await sendUserMessage({ email: user.email, name: user.name }, active, body.trim())
      setBody(''); reload()
    } catch (e) { setErr(String((e as Error).message ?? e)) }
    finally { setBusy(false); inputRef.current?.focus() }
  }

  async function onAck(m: UserMessage) {
    try {
      await ackMessage(m.id)
      setInbox((prev) => (prev ?? []).map((x) => x.id === m.id ? { ...x, ack_at: new Date().toISOString() } : x))
      window.dispatchEvent(new Event('messages-changed'))
    } catch (e) { setErr(String((e as Error).message ?? e)) }
  }

  if (!inbox) return <Loader label="טוען הודעות…" />

  const activeUser = users.find((u) => u.email.toLowerCase() === active)
  const totalUnacked = contacts.reduce((n, c) => n + c.unacked, 0)

  return (
    <div className="page chat-page">
      <div className="page__head" style={{ marginBottom: 16 }}>
        <div>
          <div className="kicker">תקשורת פנימית</div>
          <h1 className="page-title">הודעות</h1>
        </div>
        {totalUnacked > 0 && <span className="count mono">{totalUnacked} ממתינות לאישור</span>}
      </div>

      {err && <div className="alert">{err}</div>}

      <div className="chat">
        {/* contacts */}
        <aside className={`chat__contacts ${active ? 'chat__contacts--collapsed' : ''}`}>
          {contacts.length === 0 && <div className="empty">אין משתמשים זמינים.</div>}
          {contacts.map(({ user: u, last, unacked }) => (
            <button
              key={u.email}
              className={`chat-contact ${active === u.email.toLowerCase() ? 'on' : ''}`}
              onClick={() => setActive(u.email.toLowerCase())}
            >
              <ChatAvatar meta={metas[u.email.toLowerCase()]} name={u.name} size={44} />
              <span className="chat-contact__meta">
                <b>{u.name}</b>
                <small>{last ? last.body.slice(0, 42) : 'התחלת שיחה…'}</small>
              </span>
              {unacked > 0 && <span className="coop-tab__badge">{unacked}</span>}
            </button>
          ))}
        </aside>

        {/* thread */}
        <section className="chat__pane">
          {!active ? (
            <div className="chat__empty">בחרו איש קשר כדי להתחיל שיחה 💬</div>
          ) : (
            <>
              <header className="chat__head">
                <button className="btn btn--quiet chat__back" onClick={() => setActive('')}>→</button>
                <ChatAvatar meta={metas[active]} name={activeUser?.name ?? active} size={40} />
                <b>{activeUser?.name ?? active}</b>
              </header>

              <div className="chat__scroll" ref={scrollRef}>
                {thread.map((m, i) => {
                  const mine = m.from_email.toLowerCase() === user?.email?.toLowerCase()
                  const newDay = i === 0 || dayKey(thread[i - 1].created_at) !== dayKey(m.created_at)
                  const meta = metas[m.from_email.toLowerCase()]
                  return (
                    <div key={m.id}>
                      {newDay && <div className="chat__day"><span>{fmtDay(m.created_at)}</span></div>}
                      <div className={`bubble-row ${mine ? 'bubble-row--mine' : ''}`}>
                        <ChatAvatar meta={meta} name={mine ? (user?.name ?? '') : (m.from_name ?? m.from_email)} size={32} />
                        <div className={`bubble ${mine ? 'bubble--mine' : ''} ${!mine && !m.ack_at ? 'bubble--unacked' : ''}`}>
                          <p>{m.body}</p>
                          <span className="bubble__time mono">
                            {fmtTime(m.created_at)}
                            {mine && (m.ack_at ? <span className="bubble__tick bubble__tick--ok" title={`אושר ${fmtTime(m.ack_at)}`}> ✔✔</span> : <span className="bubble__tick"> ✔</span>)}
                          </span>
                          {!mine && !m.ack_at && (
                            <button className="btn btn--primary bubble__ack" onClick={() => onAck(m)}>✔ ראיתי</button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {thread.length === 0 && <div className="chat__empty">אין עדיין הודעות — כתבו את הראשונה 👇</div>}
              </div>

              <footer className="chat__composer">
                <div style={{ position: 'relative' }}>
                  <button className="msg-emoji" title="אימוג'ים" onClick={() => setEmojiOpen((o) => !o)}>😀</button>
                  {emojiOpen && (
                    <EmojiPicker
                      onPick={(e) => { setBody((b) => b + e); inputRef.current?.focus() }}
                      onClose={() => setEmojiOpen(false)}
                    />
                  )}
                </div>
                <input
                  ref={inputRef} className="input" placeholder="הודעה…"
                  value={body} onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onSend()}
                />
                <button className="btn btn--primary" disabled={!body.trim() || busy} onClick={onSend}>
                  {busy ? '…' : '➤'}
                </button>
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
