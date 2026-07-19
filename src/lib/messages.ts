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
