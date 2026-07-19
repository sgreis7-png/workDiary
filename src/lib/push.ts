// Web-push subscription: ask permission, subscribe via the PWA service worker,
// store the subscription keyed by user email.
import { supabase } from './supabase'

export const VAPID_PUBLIC_KEY = 'BLsMtel0M0UE64vC_DnyYS3u8a_g1QtOFy3Y5u6psZMJMZtq0xQz4uqOxHZufYOdZWzlufVCOvHfqGofR2z3W2A'

function urlBase64ToUint8Array(s: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(b.length))
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i)
  return out
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** Subscribe (asking permission if needed) and persist. Returns final permission. */
export async function enablePush(email: string): Promise<NotificationPermission> {
  if (!pushSupported()) return 'denied'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })
  const json = sub.toJSON()
  await supabase.from('push_subscriptions').upsert({
    email: email.toLowerCase(), endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '',
  }, { onConflict: 'email,endpoint' })
  return 'granted'
}

/** Silent re-subscribe when permission was already granted (e.g. new session). */
export async function ensurePush(email: string): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return
  try { await enablePush(email) } catch { /* best-effort */ }
}

/** Fire-and-forget push to recipients via the edge function. */
export function sendPush(emails: string[], title: string, body: string, link: string): void {
  if (!emails.length) return
  supabase.functions.invoke('send-push', { body: { emails, title, body, link } }).catch(() => {})
}
