// Send a report by email through the server.
//
// This is the default path and needs nothing from the user: no Microsoft sign-in, no consent
// prompt, no popup — which is what made the Outlook route unusable on a phone and unusable at
// all until an Azure admin acted. The Outlook route is still there for anyone who specifically
// wants the copy in their own Sent Items.
import { supabase } from './supabase'

/** Distinguishable failures, so the dialog can say something true rather than "failed". */
export type SendError =
  | 'not_configured'   // no Resend key on the server
  | 'domain_not_verified' // Resend is in sandbox: only the account owner may receive
  | 'not_a_member'
  | 'rate_limited'
  | 'no_recipients'
  | 'too_many'
  | 'rejected'         // the mail provider refused — detail carries its reason
  | 'unknown'

export class ReportSendError extends Error {
  constructor(public kind: SendError, message: string, public detail?: string) {
    super(message)
  }
}

export async function sendReportByEmail(opts: {
  to: string[]
  subject: string
  html: string
}): Promise<{ from: 'me' | 'system'; sent: number }> {
  const { data, error } = await supabase.functions.invoke('send-report', {
    body: { to: opts.to, subject: opts.subject, html: opts.html },
  })

  // functions.invoke reports a non-2xx as an error and puts the body out of easy reach, so read
  // the response when there is one: the server's reason is the useful part.
  const payload = (data ?? null) as
    | { ok?: boolean; from?: string; sent?: number; error?: string; detail?: string }
    | null

  if (error && !payload?.error) {
    const body = await readErrorBody(error)
    if (body?.error) return fail(body.error, body.detail)
    throw new ReportSendError('unknown', error.message)
  }
  if (payload?.error) return fail(payload.error, payload.detail)

  return { from: payload?.from && payload.from !== 'system' ? 'me' : 'system', sent: payload?.sent ?? opts.to.length }
}

function fail(code: string, detail?: string): never {
  const kind: SendError =
    code === 'email_not_configured' ? 'not_configured'
    : code === 'domain_not_verified' ? 'domain_not_verified'
    : code === 'not_a_member' ? 'not_a_member'
    : code === 'rate_limited' ? 'rate_limited'
    : code === 'no_recipients' ? 'no_recipients'
    : code === 'too_many_recipients' ? 'too_many'
    : code === 'send_failed' ? 'rejected'
    : 'unknown'
  throw new ReportSendError(kind, code, detail)
}

/** supabase-js wraps a non-2xx in a FunctionsHttpError whose body is on `context`. */
async function readErrorBody(error: unknown): Promise<{ error?: string; detail?: string } | null> {
  const res = (error as { context?: Response })?.context
  if (!res || typeof res.json !== 'function') return null
  return await res.json().catch(() => null)
}
