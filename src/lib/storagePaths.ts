// Shared Supabase helpers: signed-URL hydration and edge-function error
// unwrapping. Both were copy-pasted across api.ts, defects/api.ts, lib/* and
// auth.tsx; keeping one copy stops them drifting.
import { supabase } from './supabase'

/** Signed URLs (1h) for private `photos` objects, keyed by storage path. */
export async function signPaths(paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const uniq = [...new Set(paths)].filter(Boolean) as string[]
  if (!uniq.length) return {}
  const { data } = await supabase.storage.from('photos').createSignedUrls(uniq, 3600)
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
