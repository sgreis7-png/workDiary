import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader } from '../components/Loader'
import { Lightbox } from '../components/Lightbox'
import { Avatar } from '../components/ui'
import { EmojiPicker } from '../components/EmojiPicker'
import { useAuth } from '../auth'
import { fetchMemberDirectory, type DirectoryMember } from '../api'
import {
  fetchAllChat, fetchMyGroups, fetchAcks, fetchProfileMetas,
  sendUserMessage, sendGroupMessage, ackMessage, ackGroupMessage, createGroup,
  uploadChatAttachment,
  type UserMessage, type ProfileMeta, type ChatGroup, type MessageAck,
} from '../lib/messages'
import { supabase } from '../lib/supabase'
import { useDT } from '../defects/i18n'
import { sendPush } from '../lib/push'
import { useDialog } from '../lib/useDialog'

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
  const { dt } = useDT()
  const me = user?.email?.toLowerCase() ?? ''
  const [dms, setDms] = useState<UserMessage[] | null>(null)
  const [groupMsgs, setGroupMsgs] = useState<GroupMsg[]>([])
  const [groups, setGroups] = useState<ChatGroup[]>([])
  const [acks, setAcks] = useState<MessageAck[]>([])
  const [users, setUsers] = useState<DirectoryMember[]>([])
  const [metas, setMetas] = useState<Record<string, ProfileMeta>>({})
  const [active, setActive] = useState('') // 'u:<email>' | 'g:<id>'
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [groupOpen, setGroupOpen] = useState(false)
  const [contactQ, setContactQ] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reload = () => {
    if (!me) return
    Promise.all([fetchAllChat(), fetchMyGroups(), fetchAcks()])
      .then(([{ dms, groupMsgs }, gs, as]) => { setDms(dms); setGroupMsgs(groupMsgs); setGroups(gs); setAcks(as) })
      .catch((e) => setErr(String(e.message ?? e)))
  }

  useEffect(() => {
    reload()
    // realtime INSERTs (RLS-filtered server-side) + a slow fallback poll in
    // case the socket drops silently
    const chan = supabase.channel('chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_messages' }, reload)
      .subscribe()
    const t = setInterval(reload, 120_000)
    // the directory is already limited to active, registered members
    fetchMemberDirectory()
      .then((us) => setUsers(us.filter((u) => u.email.toLowerCase() !== me)))
      .catch(() => setUsers([]))
    fetchProfileMetas().then(setMetas).catch(() => {})
    return () => { clearInterval(t); void supabase.removeChannel(chan) }
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

  const threadImages = useMemo(
    () => thread.filter((m) => m.attachment_url && (m.attachment_type ?? '').startsWith('image/')).map((m) => m.attachment_url!),
    [thread],
  )

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }) }, [thread.length, active])
  // images finish loading after that effect ran and add height below the
  // viewport; if the user was at the bottom, keep them there
  const onImgLoad = () => {
    const el = scrollRef.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 320) el.scrollTo({ top: el.scrollHeight })
  }

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
  }, [activeConv, thread, me, myAcks])  

  async function onSend() {
    if (!user || !activeConv || busy) return
    if (!body.trim() && !pendingFile) return
    setBusy(true); setErr('')
    try {
      const text = body.trim()
      const att = pendingFile ? await uploadChatAttachment(pendingFile) : undefined
      const pushText = text || (att ? `📎 ${att.name}` : '')
      if (activeConv.isGroup) {
        await sendGroupMessage({ email: user.email, name: user.name }, activeConv.group!.id, text, att)
        sendPush(activeConv.group!.members.filter((em) => em !== me), `${user.name} · ${activeConv.title}`, pushText, '/messages')
      } else {
        await sendUserMessage({ email: user.email, name: user.name }, activeConv.email!, text, att)
        sendPush([activeConv.email!], user.name, pushText, '/messages')
      }
      setBody(''); setPendingFile(null); reload()
    } catch (e) { setErr(String((e as Error).message ?? e)) }
    finally { setBusy(false); inputRef.current?.focus() }
  }

  if (dms === null) return <Loader label={dt('loading_msgs')} />
  const totalUnacked = convs.reduce((n, c) => n + c.unacked, 0)

  return (
    <div className="page chat-page">
      <div className="page__head" style={{ marginBottom: 16 }}>
        <div>
          <div className="kicker">{dt('chat_kicker')}</div>
          <h1 className="page-title">{dt('chat_title')}</h1>
        </div>
        {totalUnacked > 0 && <span className="count mono">{totalUnacked} {dt('chat_pending')}</span>}
      </div>

      {err && <div className="alert">{err}</div>}

      <div className="chat">
        <aside className={`chat__contacts ${active ? 'chat__contacts--collapsed' : ''}`}>
          <div className="chat__tools">
            <input
              className="input chat__search" placeholder={dt('chat_search')}
              value={contactQ} onChange={(e) => setContactQ(e.target.value)}
            />
            <button className="btn btn--ghost chat__new-group" onClick={() => setGroupOpen(true)}>{dt('chat_new_group')}</button>
          </div>
          {shownConvs.length === 0 && <div className="empty" style={{ padding: 24 }}>{dt('chat_no_results')}</div>}
          {shownConvs.map((c) => (
            <button key={c.key} className={`chat-contact ${active === c.key ? 'on' : ''}`} onClick={() => setActive(c.key)}>
              {c.isGroup
                ? <span className="chat-avatar chat-avatar--group" style={{ width: 44, height: 44 }}>👥</span>
                : <ChatAvatar meta={metas[c.email!]} name={c.title} size={44} />}
              <span className="chat-contact__meta">
                <b>{c.title}{c.isGroup && <small className="chat-contact__count"> · {c.group!.members.length} {dt('chat_members')}</small>}</b>
                <small>{c.last ? `${c.last.from_email.toLowerCase() === me ? dt('chat_me') : c.isGroup ? nameOf(c.last.from_email) + ': ' : ''}${(c.last.body || (c.last.attachment_path ? `📎 ${c.last.attachment_name ?? ''}` : '')).slice(0, 36)}` : c.isGroup ? dt('chat_new_group_hint') : dt('chat_start')}</small>
              </span>
              {c.unacked > 0 && <span className="coop-tab__badge">{c.unacked}</span>}
            </button>
          ))}
        </aside>

        <section className="chat__pane">
          {!activeConv ? (
            <div className="chat__empty">{dt('chat_pick')}</div>
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
                          {m.attachment_url && (m.attachment_type ?? '').startsWith('image/') && (
                            <img
                              src={m.attachment_url} alt={m.attachment_name ?? ''} onLoad={onImgLoad}
                              onClick={() => setLightbox(threadImages.indexOf(m.attachment_url!))}
                              style={{ maxWidth: 240, maxHeight: 240, borderRadius: 10, display: 'block', marginBottom: m.body ? 6 : 0, cursor: 'zoom-in' }}
                            />
                          )}
                          {m.attachment_url && !(m.attachment_type ?? '').startsWith('image/') && (
                            <a href={m.attachment_url} target="_blank" rel="noreferrer" download={m.attachment_name ?? undefined}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: m.body ? 6 : 0, color: 'inherit', fontWeight: 600 }}>
                              📎 {m.attachment_name ?? dt('chat_file')}
                            </a>
                          )}
                          {m.body && <p>{m.body}</p>}
                          <span className="bubble__time mono">
                            {fmtTime(m.created_at)}
                            {mine && !isGroup && (m.ack_at
                              ? <span className="bubble__tick bubble__tick--ok" title={`${dt('chat_seen_at')}${fmtTime(m.ack_at)}`}> ✔✔ {dt('chat_seen')}</span>
                              : <span className="bubble__tick"> ✔</span>)}
                            {mine && isGroup && (
                              readers.length >= others
                                ? <span className="bubble__tick bubble__tick--ok" title={dt('chat_seen_all')}> ✔✔ {dt('chat_seen')}</span>
                                : <span className="bubble__tick" title={`${dt('chat_seen_by')} ${readers.length} ${dt('chat_of')} ${others}`}> ✔ {readers.length}/{others}</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {thread.length === 0 && <div className="chat__empty">{dt('chat_empty_thread')}</div>}
              </div>

              <footer className="chat__composer">
                <label className="msg-emoji" title={dt('chat_attach')} style={{ cursor: 'pointer' }}>
                  📎
                  <input type="file" hidden onChange={(e) => { setPendingFile(e.target.files?.[0] ?? null); e.currentTarget.value = '' }} />
                </label>
                <div style={{ position: 'relative' }}>
                  <button className="msg-emoji" title="אימוג'ים" onClick={() => setEmojiOpen((o) => !o)}>😀</button>
                  {emojiOpen && (
                    <EmojiPicker onPick={(e) => { setBody((b) => b + e); inputRef.current?.focus() }} onClose={() => setEmojiOpen(false)} />
                  )}
                </div>
                {pendingFile && (
                  <span className="tag tag--green" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 180, overflow: 'hidden' }}>
                    📎 <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingFile.name}</span>
                    <button type="button" onClick={() => setPendingFile(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}>✕</button>
                  </span>
                )}
                <input
                  ref={inputRef} className="input" placeholder={dt('chat_placeholder')}
                  value={body} onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && onSend()}
                />
                <button className="btn btn--primary" disabled={(!body.trim() && !pendingFile) || busy} onClick={onSend}>
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
      {lightbox !== null && threadImages.length > 0 && (
        <Lightbox
          photos={threadImages}
          index={Math.max(0, Math.min(lightbox, threadImages.length - 1))}
          onClose={() => setLightbox(null)}
          onIndex={setLightbox}
        />
      )}
    </div>
  )
}

function NewGroupDialog({ users, metas, onClose, onCreate }: {
  users: DirectoryMember[]
  metas: Record<string, ProfileMeta>
  onClose: () => void
  onCreate: (name: string, emails: string[]) => void
}) {
  const { dt } = useDT()
  const panel = useRef<HTMLDivElement>(null)
  useDialog(panel, onClose)
  const [name, setName] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const toggle = (em: string) => setSel((p) => { const n = new Set(p); if (n.has(em)) n.delete(em); else n.add(em); return n })
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" ref={panel} role="dialog" aria-modal="true" aria-label="קבוצה חדשה" tabIndex={-1} onClick={(e) => e.stopPropagation()} dir="rtl" style={{ maxWidth: 460 }}>
        <h2>{dt('grp_title')}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
          <input className="input" placeholder={dt('grp_name_ph')} value={name} onChange={(e) => setName(e.target.value)} />
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
          <button className="btn btn--ghost" onClick={onClose}>{dt('grp_cancel')}</button>
          <button className="btn btn--primary" disabled={!name.trim() || sel.size === 0} onClick={() => onCreate(name.trim(), [...sel])}>
            {dt('grp_create')} ({sel.size})
          </button>
        </div>
      </div>
    </div>
  )
}
