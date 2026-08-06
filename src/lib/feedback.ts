// "דווח" — user feedback (bug / feature request) filed to admins with reporter identity.
import { supabase } from './supabase'
import { sendPush } from './push'
import { signPaths } from './storagePaths'
import { notifyMany } from './notify'

export interface FeedbackReport {
  id: string
  email: string
  name: string | null
  kind: 'bug' | 'request'
  message: string
  photo_path: string | null
  status: 'new' | 'done'
  created_at: string
}

export async function submitFeedback(kind: 'bug' | 'request', message: string, file?: File | null): Promise<void> {
  const { data: u } = await supabase.auth.getUser()
  const email = u.user?.email?.toLowerCase()
  if (!email) throw new Error('not authenticated')

  // reporter display name from their profile (falls back to email)
  const { data: prof } = await supabase.from('profiles').select('name').eq('id', u.user!.id).maybeSingle()
  const name = (prof as { name: string | null } | null)?.name ?? null

  let photo_path: string | null = null
  if (file) {
    const safe = file.name.replace(/[^\w.-]+/g, '_')
    photo_path = `feedback/${crypto.randomUUID()}-${safe}`
    const { error: upErr } = await supabase.storage.from('photos').upload(photo_path, file)
    if (upErr) throw upErr
  }

  const { error } = await supabase.from('feedback_reports')
    .insert({ email, name, kind, message, photo_path })
  if (error) throw error

  // fan-out to admins (never throws — report already saved)
  try {
    const admins = ((await supabase.rpc('admin_emails')).data as string[] | null) ?? []
    const targets = admins.map((e) => e.toLowerCase()).filter((e) => e !== email)
    if (targets.length) {
      const title = `📢 דיווח חדש — ${name ?? email}`
      const body = message.length > 140 ? message.slice(0, 140) + '…' : message
      await notifyMany(targets, { title, body, link: '/admin/feedback' })
      sendPush(targets, title, body, '/admin/feedback')
    }
  } catch { /* best-effort */ }
}

export async function fetchFeedback(): Promise<FeedbackReport[]> {
  const { data, error } = await supabase.from('feedback_reports').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data as FeedbackReport[]
}

export async function setFeedbackStatus(id: string, status: 'new' | 'done'): Promise<void> {
  const { error } = await supabase.from('feedback_reports').update({ status }).eq('id', id)
  if (error) throw error
}

export async function deleteFeedback(id: string): Promise<void> {
  const { error } = await supabase.from('feedback_reports').delete().eq('id', id)
  if (error) throw error
}

export async function feedbackPhotoUrl(path: string): Promise<string | null> {
  return (await signPaths([path]))[path] ?? null
}
