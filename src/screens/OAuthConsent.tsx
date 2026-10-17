import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth'
import { usePerms } from '../lib/usePerms'
import { canConnectClaude } from '../lib/claudeAccess'
import { useI18n } from '../i18n'
import { Button, Tag } from '../components/ui'
import { Loader } from '../components/Loader'
import { Logo } from '../components/Logo'

type State =
  | { kind: 'loading' }
  | { kind: 'error'; msg: 'oauth_missing_id' | 'oauth_load_failed' }
  | { kind: 'redirecting' }
  | { kind: 'ready'; details: OAuthAuthorizationDetails }

/**
 * The page Supabase Auth's OAuth server sends a person to when claude.ai asks to connect.
 * Sits inside RequireAuth but outside the Shell: no navigation to wander off to mid-consent.
 */
export default function OAuthConsent() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { perm, permsReady } = usePerms()
  const [params] = useSearchParams()
  const id = params.get('authorization_id') ?? ''
  const [state, setState] = useState<State>(id ? { kind: 'loading' } : { kind: 'error', msg: 'oauth_missing_id' })
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!id) return
    let alive = true
    supabase.auth.oauth.getAuthorizationDetails(id).then(({ data, error }) => {
      if (!alive) return
      if (error || !data) return setState({ kind: 'error', msg: 'oauth_load_failed' })
      // Already consented earlier: Supabase hands back the redirect directly.
      if ('redirect_url' in data) { setState({ kind: 'redirecting' }); window.location.assign(data.redirect_url); return }
      setState({ kind: 'ready', details: data })
    })
    return () => { alive = false }
  }, [id])

  const decide = async (approve: boolean) => {
    setBusy(true); setFailed(false)
    const opts = { skipBrowserRedirect: true }
    const { data, error } = approve
      ? await supabase.auth.oauth.approveAuthorization(id, opts)
      : await supabase.auth.oauth.denyAuthorization(id, opts)
    if (error || !data?.redirect_url) { setBusy(false); setFailed(true); return }
    setState({ kind: 'redirecting' })
    window.location.assign(data.redirect_url)
  }

  if (state.kind === 'loading' || state.kind === 'redirecting' || !permsReady) {
    return <Loader full label={state.kind === 'redirecting' ? t('oauth_redirecting') : undefined} />
  }

  const eligible = canConnectClaude(user?.role, perm('claude'))

  return (
    <div className="consent">
      <div className="panel consent__card">
        <Logo height={48} />
        <h1>{t('oauth_title')}</h1>
        {state.kind === 'error' ? (
          <p role="alert" className="alert">⚠ {t(state.msg)}</p>
        ) : (
          <>
            <div className="consent__row">
              <b>{t('oauth_client')}</b>
              <span dir="auto">{state.details.client.name}</span>
            </div>
            <div className="consent__row">
              <b>{t('oauth_signed_as')}</b>
              <span dir="ltr" style={{ textAlign: 'start' }}>{state.details.user.email}</span>
            </div>
            {eligible ? (
              <>
                <p>{t('oauth_explain')}</p>
                <div className="consent__row">
                  <b>{t('oauth_scopes')}</b>
                  <div className="consent__scopes">
                    {state.details.scope.split(' ').filter(Boolean).map((s) => (
                      <span key={s} dir="ltr"><Tag tone="muted">{s}</Tag></span>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p role="alert" className="alert">⚠ {t('oauth_not_enabled')}</p>
            )}
            {failed && <p role="alert" className="alert">⚠ {t('oauth_action_failed')}</p>}
            <div className="consent__actions">
              {eligible && <Button variant="primary" disabled={busy} onClick={() => decide(true)}>{t('oauth_approve')}</Button>}
              <Button variant="ghost" disabled={busy} onClick={() => decide(false)}>{t('oauth_deny')}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
