// Send reports directly from the user's own @agrotop.co.il mailbox via
// Microsoft Graph (delegated Mail.Send). MSAL popup flow only — a redirect
// callback would be swallowed by the PWA service worker's navigateFallback.
// The mail lands in the user's Sent Items like any Outlook-composed message.
// MSAL is dynamic-imported so the ~170KB library loads only on first send.
import type { PublicClientApplication, AccountInfo } from '@azure/msal-browser'

// Azure AD app registration (public identifiers, not secrets).
const CLIENT_ID = '86c8bcfa-6525-4048-8b9b-b02bf210979d'
const TENANT_ID = '8f3958d6-6c2d-4e80-b767-169d72a033c4'
const SCOPES = ['Mail.Send']

let msalPromise: Promise<PublicClientApplication> | null = null
function getMsal(): Promise<PublicClientApplication> {
  msalPromise ??= (async () => {
    const { PublicClientApplication } = await import('@azure/msal-browser')
    const app = new PublicClientApplication({
      auth: {
        clientId: CLIENT_ID,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        redirectUri: window.location.origin,
      },
      // localStorage so the Microsoft session survives app restarts —
      // workers should authenticate once, not per report
      cache: { cacheLocation: 'localStorage' },
      // default popup timeout is 60s — a human typing credentials + MFA takes
      // longer, and MSAL then fails with timed_out while the user is mid-login
      system: { windowHashTimeout: 300000 },
    })
    await app.initialize()
    return app
  })()
  return msalPromise
}

async function getToken(loginHint?: string): Promise<string> {
  const app = await getMsal()
  const account: AccountInfo | undefined = app.getActiveAccount() ?? app.getAllAccounts()[0]
  if (account) {
    try {
      const res = await app.acquireTokenSilent({ scopes: SCOPES, account })
      return res.accessToken
    } catch {
      // expired session, revoked consent, missing cache — fall through to popup
    }
  }
  const res = await app.acquireTokenPopup({ scopes: SCOPES, account, loginHint })
  app.setActiveAccount(res.account)
  return res.accessToken
}

/** True when the failure is the browser blocking the Microsoft login popup. */
export function isPopupBlocked(e: unknown): boolean {
  return (e as { errorCode?: string })?.errorCode === 'popup_window_error'
}

/** "a@x.com, b@x.com; c@x.com" → deduped list of addresses. */
export function parseRecipients(raw: string): string[] {
  const seen = new Set<string>()
  for (const part of raw.split(/[\s,;]+/)) {
    const s = part.trim().toLowerCase()
    if (s.includes('@') && s.includes('.')) seen.add(s)
  }
  return [...seen]
}

export async function sendMailViaOutlook(opts: {
  to: string[]
  subject: string
  html: string
  loginHint?: string
}): Promise<void> {
  const token = await getToken(opts.loginHint)
  const r = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: opts.subject,
        body: { contentType: 'HTML', content: opts.html },
        toRecipients: opts.to.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    }),
  })
  if (!r.ok) {
    const body = await r.json().catch(() => null) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message ?? `Graph sendMail failed (HTTP ${r.status})`)
  }
}
