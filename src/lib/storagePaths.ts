// Shared Supabase helpers: signed-URL hydration and edge-function error
// unwrapping. Both were copy-pasted across api.ts, defects/api.ts, lib/* and
// auth.tsx; keeping one copy stops them drifting.
import { supabase } from './supabase'

/** TTL for photo URLs that leave the app inside sent mail. The recipient opens the
 *  message on their own schedule — an hour-long URL (the in-app default) turns every
 *  photo into a broken image for anyone reading the report the next day. Two years. */
export const MAIL_PHOTO_TTL = 2 * 365 * 24 * 3600

/** Signed URLs for private `photos` objects, keyed by storage path. 1h by default. */
export async function signPaths(
  paths: (string | null | undefined)[], expiresIn = 3600,
): Promise<Record<string, string>> {
  const uniq = [...new Set(paths)].filter(Boolean) as string[]
  if (!uniq.length) return {}
  const { data } = await supabase.storage.from('photos').createSignedUrls(uniq, expiresIn)
  const m: Record<string, string> = {}
  for (const s of data ?? []) if (s.signedUrl && s.path) m[s.path] = s.signedUrl
  return m
}

type FnError = { context?: { json?: () => Promise<{ error?: string }> } }

/**
 * Turn a `supabase.functions.invoke` result into a thrown Error carrying the
 * function's own error code (e.g. `rate_limited`), which the UI maps to i18n.
 */
export async function unwrapFnError(
  error: unknown | null,
  data: { error?: string } | null,
): Promise<void> {
  if (error) {
    const body = await (error as FnError).context?.json?.().catch(() => null)
    throw new Error(body?.error ?? (error as Error).message)
  }
  if (data?.error) throw new Error(data.error)
}
