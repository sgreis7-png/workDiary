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
