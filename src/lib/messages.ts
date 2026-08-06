// User-to-user messages ("סיימת את העבודה?") — persistent until the recipient acks.
import { supabase } from './supabase'

export interface UserMessage {
  id: string
  from_email: string
  from_name: string | null
  to_email: string
  body: string
  created_at: string
  ack_at: string | null
}

export async function fetchMyMessages(myEmail: string): Promise<{ inbox: UserMessage[]; sent: UserMessage[] }> {
  const { data, error } = await supabase.from('user_messages')
    .select('*').order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  const all = data as UserMessage[]
  const me = myEmail.toLowerCase()
  return {
    inbox: all.filter((m) => m.to_email.toLowerCase() === me),
    sent: all.filter((m) => m.from_email.toLowerCase() === me),
  }
}

export async function countUnacked(myEmail: string): Promise<number> {
  const { count, error } = await supabase.from('user_messages')
    .select('id', { count: 'exact', head: true })
    .ilike('to_email', myEmail).is('ack_at', null)
  if (error) return 0
  return count ?? 0
}

export async function sendUserMessage(from: { email: string; name: string }, toEmail: string, body: string): Promise<void> {
  const { error } = await supabase.from('user_messages')
    .insert({ from_email: from.email.toLowerCase(), from_name: from.name, to_email: toEmail.toLowerCase(), body })
  if (error) throw error
}

export async function ackMessage(id: string): Promise<void> {
  const { error } = await supabase.from('user_messages')
    .update({ ack_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// ---------- profiles (avatars for chat) ----------

export interface ProfileMeta { id: string; name: string; email: string | null; avatar_path: string | null; avatar_url?: string }

/** All profiles with signed avatar URLs, keyed by lowercase email. */
export async function fetchProfileMetas(): Promise<Record<string, ProfileMeta>> {
  const { data, error } = await supabase.from('profiles').select('id,name,email,avatar_path')
  if (error) throw error
  const rows = data as ProfileMeta[]
  const paths = rows.map((r) => r.avatar_path).filter(Boolean) as string[]
  const urls: Record<string, string> = {}
  if (paths.length) {
    const { data: signed } = await supabase.storage.from('photos').createSignedUrls(paths, 3600)
    for (const s of signed ?? []) if (s.signedUrl && s.path) urls[s.path] = s.signedUrl
  }
  const m: Record<string, ProfileMeta> = {}
  for (const r of rows) if (r.email) m[r.email.toLowerCase()] = { ...r, avatar_url: r.avatar_path ? urls[r.avatar_path] : undefined }
  return m
}

/** Upload (resized) avatar PNG and store its path on my profile. Returns signed URL. */
export async function uploadMyAvatar(userId: string, png: Blob): Promise<string> {
  const path = `avatars/${userId}-${Date.now()}.png`
  const { error: upErr } = await supabase.storage.from('photos').upload(path, png, { contentType: 'image/png', upsert: true })
  if (upErr) throw upErr
  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId)
  if (error) throw error
  const { data } = await supabase.storage.from('photos').createSignedUrls([path], 3600)
  return data?.[0]?.signedUrl ?? ''
}

// ---------- group chats ----------

export interface ChatGroup { id: string; name: string; created_by: string; members: string[] }
export interface MessageAck { message_id: string; email: string; ack_at: string }

export async function fetchMyGroups(): Promise<ChatGroup[]> {
  const { data: groups, error } = await supabase.from('chat_groups').select('id,name,created_by')
  if (error) throw error
  if (!groups?.length) return []
  const { data: members, error: mErr } = await supabase.from('chat_group_members')
    .select('group_id,email').in('group_id', groups.map((g) => g.id))
  if (mErr) throw mErr
  return (groups as { id: string; name: string; created_by: string }[]).map((g) => ({
    ...g, members: (members as { group_id: string; email: string }[]).filter((m) => m.group_id === g.id).map((m) => m.email.toLowerCase()),
  }))
}

export async function createGroup(name: string, creatorEmail: string, memberEmails: string[]): Promise<string> {
  const { data, error } = await supabase.from('chat_groups')
    .insert({ name, created_by: creatorEmail.toLowerCase() }).select('id').single()
  if (error) throw error
  const id = (data as { id: string }).id
  const rows = [...new Set([creatorEmail, ...memberEmails].map((e) => e.toLowerCase()))]
    .map((email) => ({ group_id: id, email }))
  const { error: mErr } = await supabase.from('chat_group_members').insert(rows)
  if (mErr) throw mErr
  return id
}

export async function sendGroupMessage(from: { email: string; name: string }, groupId: string, body: string): Promise<void> {
  const { error } = await supabase.from('user_messages')
    .insert({ from_email: from.email.toLowerCase(), from_name: from.name, to_email: null, group_id: groupId, body })
  if (error) throw error
}

export async function fetchAcks(): Promise<MessageAck[]> {
  const { data, error } = await supabase.from('message_acks').select('*')
  if (error) throw error
  return data as MessageAck[]
}

export async function ackGroupMessage(messageId: string, myEmail: string): Promise<void> {
  const { error } = await supabase.from('message_acks')
    .upsert({ message_id: messageId, email: myEmail.toLowerCase() }, { onConflict: 'message_id,email' })
  if (error) throw error
}

/** All messages visible to me (DMs + my groups), split. RLS does the filtering. */
export async function fetchAllChat(): Promise<{ dms: UserMessage[]; groupMsgs: (UserMessage & { group_id: string })[] }> {
  const { data, error } = await supabase.from('user_messages')
    .select('*').order('created_at', { ascending: false }).limit(500)
  if (error) throw error
  const all = data as (UserMessage & { group_id: string | null })[]
  return {
    dms: all.filter((m) => !m.group_id),
    groupMsgs: all.filter((m) => m.group_id) as (UserMessage & { group_id: string })[],
  }
}

/** Unacked badge: DMs awaiting my ack + group messages I haven't acked. */
export async function countUnackedAll(myEmail: string): Promise<number> {
  const me = myEmail.toLowerCase()
  try {
    const [{ dms, groupMsgs }, acks] = await Promise.all([fetchAllChat(), fetchAcks()])
    const myAcks = new Set(acks.filter((a) => a.email.toLowerCase() === me).map((a) => a.message_id))
    const dmCount = dms.filter((m) => m.to_email?.toLowerCase() === me && !m.ack_at).length
    const gCount = groupMsgs.filter((m) => m.from_email.toLowerCase() !== me && !myAcks.has(m.id)).length
    return dmCount + gCount
  } catch { return 0 }
}

/** Unacked count + newest unacked incoming message (for the toast). */
export async function chatUnackedStatus(myEmail: string): Promise<{ count: number; latest: UserMessage | null }> {
  const me = myEmail.toLowerCase()
  try {
    const [{ dms, groupMsgs }, acks] = await Promise.all([fetchAllChat(), fetchAcks()])
    const myAcks = new Set(acks.filter((a) => a.email.toLowerCase() === me).map((a) => a.message_id))
    const unacked = [
      ...dms.filter((m) => m.to_email?.toLowerCase() === me && !m.ack_at),
      ...groupMsgs.filter((m) => m.from_email.toLowerCase() !== me && !myAcks.has(m.id)),
    ].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    return { count: unacked.length, latest: unacked[0] ?? null }
  } catch { return { count: 0, latest: null } }
}
