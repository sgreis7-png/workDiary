import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader } from '../components/Loader'
import { Avatar } from '../components/ui'
import { EmojiPicker } from '../components/EmojiPicker'
import { useAuth } from '../auth'
import { fetchUsers } from '../api'
import {
  fetchAllChat, fetchMyGroups, fetchAcks, fetchProfileMetas,
  sendUserMessage, sendGroupMessage, ackMessage, ackGroupMessage, createGroup,
  type UserMessage, type ProfileMeta, type ChatGroup, type MessageAck,
} from '../lib/messages'
import type { AppUser } from '../data'

type GroupMsg = UserMessage & { group_id: string }

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
  const me = user?.email?.toLowerCase() ?? ''
  const [dms, setDms] = useState<UserMessage[] | null>(null)
  const [groupMsgs, setGroupMsgs] = useState<GroupMsg[]>([])
  const [groups, setGroups] = useState<ChatGroup[]>([])
  const [acks, setAcks] = useState<MessageAck[]>([])
  const [users, setUsers] = useState<AppUser[]>([])
  const [metas, setMetas] = useState<Record<string, ProfileMeta>>({})
  const [active, setActive] = useState('') // 'u:<email>' | 'g:<id>'
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [contactQ, setContactQ] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reload = () => {
    if (!me) return
    Promise.all([fetchAllChat(me), fetchMyGroups(), fetchAcks()])
      .then(([{ dms, groupMsgs }, gs, as]) => { setDms(dms); setGroupMsgs(groupMsgs); setGroups(gs); setAcks(as) })
      .catch((e) => setErr(String(e.message ?? e)))
  }

  useEffect(() => {
    reload()
    const t = setInterval(reload, 30_000)
    fetchUsers()
      .then((us) => setUsers(us.filter((u) => u.active && u.registered && u.email.toLowerCase() !== me)))
      .catch(() => setUsers([]))
    fetchProfileMetas().then(setMetas).catch(() => {})
    return () => clearInterval(t)
  }, [me]) // eslint-disable-line react-hooks/exhaustive-deps

  const myAcks = useMemo(() => new Set(acks.filter((a) => a.email.toLowerCase() === me).map((a) => a.message_id)), [acks, me])
  const nameOf = (email: string) => metas[email.toLowerCase()]?.name
    ?? users.find((u) => u.email.toLowerCase() === email.toLowerCase())?.name ?? email

  // ---- conversation list: groups + users ----
  const convs = useMemo(() => {
    const rows: { key: string; title: string; isGroup: boolean; email?: string; group?: ChatGroup; last: UserMessage | null; unacked: number }[] = []
    for (const g of groups) {
      const msgs = groupMsgs.filter((m) => m.group_id === g.id)
      const last = msgs[0] ?? null // fetch is newest-first
      const unacked = msgs.filter((m) => m.from_email.toLowerCase() !== me && !myAcks.has(m.id)).length
      rows.push({ key: `g:${g.id}`, title: g.name, isGroup: true, group: g, last, unacked })
    }
    for (const u of users) {
      const em = u.email.toLowerCase()
      const msgs = (dms ?? []).filter((m) =>
        m.from_email.toLowerCase() === em && m.to_email?.toLowerCase() === me
        || m.to_email?.toLowerCase() === em && m.from_email.toLowerCase() === me)
      const last = msgs[0] ?? null
      const unacked = msgs.filter((m) => m.to_email?.toLowerCase() === me && !m.ack_at).length
      rows.push({ key: `u:${em}`, title: u.name, isGroup: false, email: em, last, unacked })
    }
    return rows.sort((a, b) => {
      if (a.unacked !== b.unacked) return b.unacked - a.unacked
      return (b.last ? +new Date(b.last.created_at) : 0) - (a.last ? +new Date(a.last.created_at) : 0)
    })
  }, [groups, groupMsgs, users, dms, me, myAcks])

  const shownConvs = useMemo(() => {
    const q = contactQ.trim().toLowerCase()
    if (!q) return convs
    return convs.filter((c) =>
      c.title.toLowerCase().includes(q)
      || (c.email ?? '').includes(q)
      || (c.group?.members.some((em) => em.includes(q) || nameOf(em).toLowerCase().includes(q)) ?? false))
  }, [convs, contactQ]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeConv = convs.find((c) => c.key === active)

  const thread = useMemo(() => {
    if (!activeConv) return []
    const msgs = activeConv.isGroup
      ? groupMsgs.filter((m) => m.group_id === activeConv.group!.id)
      : (dms ?? []).filter((m) =>
        m.from_email.toLowerCase() === activeConv.email && m.to_email?.toLowerCase() === me
        || m.to_email?.toLowerCase() === activeConv.email && m.from_email.toLowerCase() === me)
    return [...msgs].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
  }, [activeConv, groupMsgs, dms, me])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }) }, [thread.length, active])

  // כמו וואטסאפ: פתיחת השיחה מסמנת "נראה" אוטומטית על כל ההודעות הנכנסות
  useEffect(() => {
    if (!activeConv || !me) return
    const pending = thread.filter((m) => {
      if (m.from_email.toLowerCase() === me) return false
      return activeConv.isGroup ? !myAcks.has(m.id) : !m.ack_at
    })
    if (!pending.length) return
    Promise.all(pending.map((m) =>
      activeConv.isGroup ? ackGroupMessage(m.id, me) : ackMessage(m.id),
    )).then(() => {
      const now = new Date().toISOString()
      if (activeConv.isGroup) {
        setAcks((prev) => [...prev, ...pending.map((m) => ({ message_id: m.id, email: me, ack_at: now }))])
      } else {
        setDms((prev) => (prev ?? []).map((x) => pending.some((p) => p.id === x.id) ? { ...x, ack_at: now } : x))
      }
      window.dispatchEvent(new Event('messages-changed'))
    }).catch(() => {})
  }, [activeConv, thread, me, myAcks]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onSend() {
    if (!user || !activeConv || !body.trim() || busy) return
    setBusy(true); setErr('')
    try {
      if (activeConv.isGroup) await sendGroupMessage({ email: user.email, name: user.name }, activeConv.group!.id, body.trim())
      else await sendUserMessage({ email: user.email, name: user.name }, activeConv.email!, body.trim())
      setBody(''); reload()
    } catch (e) { setErr(String((e as Error).message ?? e)) }
    finally { setBusy(false); inputRef.current?.focus() }
  }

  if (dms === null) return <Loader label="טוען הודעות…" />
  const totalUnacked = convs.reduce((n, c) => n + c.unacked, 0)

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
        <aside className={`chat__contacts ${active ? 'chat__contacts--collapsed' : ''}`}>
          <div className="chat__tools">
            <input
              className="input chat__search" placeholder="🔍 חיפוש משתמש או קבוצה…"
              value={contactQ} onChange={(e) => setContactQ(e.target.value)}
            />
            <button className="btn btn--ghost chat__new-group" onClick={() => setGroupOpen(true)}>👥 קבוצה חדשה</button>
          </div>
          {shownConvs.length === 0 && <div className="empty" style={{ padding: 24 }}>לא נמצאו תוצאות.</div>}
          {shownConvs.map((c) => (
            <button key={c.key} className={`chat-contact ${active === c.key ? 'on' : ''}`} onClick={() => setActive(c.key)}>
              {c.isGroup
                ? <span className="chat-avatar chat-avatar--group" style={{ width: 44, height: 44 }}>👥</span>
                : <ChatAvatar meta={metas[c.email!]} name={c.title} size={44} />}
              <span className="chat-contact__meta">
                <b>{c.title}{c.isGroup && <small className="chat-contact__count"> · {c.group!.members.length} חברים</small>}</b>
                <small>{c.last ? `${c.last.from_email.toLowerCase() === me ? 'אני: ' : c.isGroup ? nameOf(c.last.from_email) + ': ' : ''}${c.last.body.slice(0, 36)}` : c.isGroup ? 'קבוצה חדשה' : 'התחלת שיחה…'}</small>
              </span>
              {c.unacked > 0 && <span className="coop-tab__badge">{c.unacked}</span>}
            </button>
          ))}
        </aside>

        <section className="chat__pane">
          {!activeConv ? (
            <div className="chat__empty">בחרו שיחה או צרו קבוצה 💬</div>
          ) : (
            <>
              <header className="chat__head">
                <button className="btn btn--quiet chat__back" onClick={() => setActive('')}>→</button>
                {activeConv.isGroup
                  ? <span className="chat-avatar chat-avatar--group" style={{ width: 40, height: 40 }}>👥</span>
                  : <ChatAvatar meta={metas[activeConv.email!]} name={activeConv.title} size={40} />}
                <div>
                  <b>{activeConv.title}</b>
                  {activeConv.isGroup && (
                    <div className="chat__members">{activeConv.group!.members.map(nameOf).join(', ')}</div>
                  )}
                </div>
              </header>

              <div className="chat__scroll" ref={scrollRef}>
                {thread.map((m, i) => {
                  const mine = m.from_email.toLowerCase() === me
                  const newDay = i === 0 || dayKey(thread[i - 1].created_at) !== dayKey(m.created_at)
                  const meta = metas[m.from_email.toLowerCase()]
                  const isGroup = activeConv.isGroup
                  const readers = isGroup ? acks.filter((a) => a.message_id === m.id && a.email.toLowerCase() !== m.from_email.toLowerCase()) : []
                  const others = isGroup ? activeConv.group!.members.filter((e) => e !== m.from_email.toLowerCase()).length : 1
                  return (
                    <div key={m.id}>
                      {newDay && <div className="chat__day"><span>{fmtDay(m.created_at)}</span></div>}
                      <div className={`bubble-row ${mine ? 'bubble-row--mine' : ''}`}>
                        <ChatAvatar meta={meta} name={mine ? (user?.name ?? '') : (m.from_name ?? m.from_email)} size={42} />
                        <div className={`bubble ${mine ? 'bubble--mine' : ''}`}>
                          {isGroup && !mine && <div className="bubble__sender">{m.from_name ?? nameOf(m.from_email)}</div>}
                          <p>{m.body}</p>
                          <span className="bubble__time mono">
                            {fmtTime(m.created_at)}
                            {mine && !isGroup && (m.ack_at
                              ? <span className="bubble__tick bubble__tick--ok" title={`נראה ב-${fmtTime(m.ack_at)}`}> ✔✔ נראה</span>
                              : <span className="bubble__tick"> ✔</span>)}
                            {mine && isGroup && (
                              readers.length >= others
                                ? <span className="bubble__tick bubble__tick--ok" title="נראה על ידי כולם"> ✔✔ נראה</span>
                                : <span className="bubble__tick" title={`נראה ע"י ${readers.length} מתוך ${others}`}> ✔ {readers.length}/{others}</span>
                            )}
                          </span>
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
                    <EmojiPicker onPick={(e) => { setBody((b) => b + e); inputRef.current?.focus() }} onClose={() => setEmojiOpen(false)} />
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

      {groupOpen && (
        <NewGroupDialog
          users={users} metas={metas}
          onClose={() => setGroupOpen(false)}
          onCreate={async (name, emails) => {
            try {
              const id = await createGroup(name, user!.email, emails)
              setGroupOpen(false); reload(); setActive(`g:${id}`)
            } catch (e) { setErr(String((e as Error).message ?? e)) }
          }}
        />
      )}
    </div>
  )
}

function NewGroupDialog({ users, metas, onClose, onCreate }: {
  users: AppUser[]
  metas: Record<string, ProfileMeta>
  onClose: () => void
  onCreate: (name: string, emails: string[]) => void
}) {
  const [name, setName] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const toggle = (em: string) => setSel((p) => { const n = new Set(p); if (n.has(em)) n.delete(em); else n.add(em); return n })
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} dir="rtl" style={{ maxWidth: 460 }}>
        <h2>👥 קבוצה חדשה</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
          <input className="input" placeholder="שם הקבוצה… (למשל: צוות מעלה גמלא)" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="group-pick">
            {users.map((u) => {
              const em = u.email.toLowerCase()
              return (
                <label key={em} className={`group-pick__row ${sel.has(em) ? 'on' : ''}`}>
                  <input type="checkbox" checked={sel.has(em)} onChange={() => toggle(em)} />
                  {metas[em]?.avatar_url
                    ? <img className="chat-avatar" style={{ width: 30, height: 30 }} src={metas[em].avatar_url} alt="" />
                    : <Avatar name={u.name} size={30} />}
                  {u.name}
                </label>
              )
            })}
          </div>
        </div>
        <div className="form-actions" style={{ marginTop: 16 }}>
          <button className="btn btn--ghost" onClick={onClose}>ביטול</button>
          <button className="btn btn--primary" disabled={!name.trim() || sel.size === 0} onClick={() => onCreate(name.trim(), [...sel])}>
            יצירת קבוצה ({sel.size})
          </button>
        </div>
      </div>
    </div>
  )
}
