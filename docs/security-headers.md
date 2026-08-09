# Browser security headers

Set in `vercel.json` for every response. Notes on the choices that are not obvious, and on
what would break if they were tightened further.

## Content-Security-Policy

Each origin in the policy is there because the app talks to it:

| Directive | Why |
|---|---|
| `script-src 'self'` | The built `index.html` contains no inline script, so no nonce or hash is needed. Adding one would be the first sign something regressed. |
| `style-src … 'unsafe-inline'` | React writes `style` attributes throughout, and `style-src-attr` falls back to `style-src`. Removing it means removing every inline style in the app — a large refactor for a small gain, since the styles come from our own bundle. |
| `style-src … fonts.googleapis.com` | The Heebo / Assistant / JetBrains Mono stylesheet is linked from `index.html`. |
| `font-src … fonts.gstatic.com data:` | Where those faces are actually served from. `data:` covers any inlined face. |
| `img-src … data: blob: *.supabase.co` | `data:`/`blob:` for photos compressed in the browser and for signature canvases; Supabase for the signed URLs the private bucket returns. |
| `connect-src … *.supabase.co wss://*.supabase.co` | REST, auth, storage and the realtime socket the chat uses. |
| `connect-src … graph.microsoft.com login.microsoftonline.com` | Sending a report through the user's own Outlook (`src/lib/outlookSend.ts`). |
| `connect-src … nominatim.openstreetmap.org` | Reverse-geocoding the site location. |
| `connect-src … mpp-converter-dhm3.onrender.com` | The MPXJ converter that reads uploaded `.mpp` schedules. |
| `frame-src … login.microsoftonline.com` | MSAL renews a token silently in a hidden iframe. Without this, sending mail works until the token expires and then fails in a way that looks unrelated. |
| `worker-src 'self' blob:` | The service worker, and Workbox's generated worker. |
| `frame-ancestors 'none'` | Nothing may embed the app. `X-Frame-Options: DENY` says the same for older browsers. |

**If you add a third-party service, its origin has to be added here or the request is
blocked with no visible error beyond a console message.** That is the intended behaviour,
but it is also the most likely way this file causes a mystery bug.

## Permissions-Policy

`camera`, `microphone` and `geolocation` are allowed for `self` on purpose — the entry form
uses the camera to capture site photos, voice input for dictation, and GPS for the site
location. Denying them would remove features that field staff rely on. Everything else the
app never asks for is denied outright.

## Cross-Origin-Opener-Policy

`same-origin-allow-popups`, not `same-origin`: the Outlook sign-in is a popup, and MSAL
needs a handle on the window it opened. `same-origin` severs that and the popup hangs.

## Verifying after a change

```bash
curl -sI https://work-diary-phi.vercel.app/ | grep -iE 'content-security|x-frame|referrer|permissions|nosniff'
```

Then open the app signed in, with the console visible, and exercise the parts that touch
another origin: load the diary (Supabase), open a photo (signed URL), send a report
(Outlook), import a schedule (the converter). A CSP violation reports itself in the console
and nowhere else, so a policy mistake is invisible on the server side.
