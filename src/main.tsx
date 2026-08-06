import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles/global.css'
import './styles/components.css'
import { I18nProvider } from './i18n'
import { AuthProvider } from './auth'
import { PermsProvider } from './lib/usePerms'
import { DataProvider } from './store'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initTheme } from './lib/theme'
import App from './App'
import { registerSW } from 'virtual:pwa-register'
import { ensureFresh } from './lib/freshness'

// MSAL popup callback: Microsoft redirects the popup back here with the auth
// code in the URL fragment. Booting the SPA would let the router rewrite the
// URL before the opener window reads it (MSAL then fails with timed_out) —
// so leave the popup page inert; the opener polls the hash and closes it.
const authParams = window.location.hash + window.location.search
const isMsalPopup = !!window.opener && /[#?&]code=/.test(authParams) && authParams.includes('state=')

if (isMsalPopup) {
  // Popup page stays inert — no router, no SW; MSAL in the opener polls the
  // URL, extracts the code and closes this window within a tick.
  document.body.textContent = '…'
} else {
  initTheme()
  ensureFresh()

  // aggressive update pickup: check for a new build on launch + every 15 min,
  // reload as soon as the fresh service worker takes control (TWA/PWA lag fix)
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      setInterval(() => { reg?.update().catch(() => {}) }, 15 * 60 * 1000)
    },
  })

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <I18nProvider>
          <AuthProvider>
            <PermsProvider>
            <DataProvider>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </DataProvider>
            </PermsProvider>
          </AuthProvider>
        </I18nProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  )
}
