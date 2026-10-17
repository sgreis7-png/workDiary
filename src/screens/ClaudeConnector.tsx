import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { usePerms } from '../lib/usePerms'
import { canConnectClaude, connectorUrl } from '../lib/claudeAccess'
import { useI18n } from '../i18n'
import { Button } from '../components/ui'
import { Loader } from '../components/Loader'

const URL_TEXT = connectorUrl(import.meta.env.VITE_SUPABASE_URL as string)

const STEPS = ['claude_step1', 'claude_step2', 'claude_step3', 'claude_step4', 'claude_step5', 'claude_step6'] as const
const PROMPTS = ['claude_prompt1', 'claude_prompt2', 'claude_prompt3'] as const
const CAN = ['claude_can1', 'claude_can2', 'claude_can3', 'claude_can4', 'claude_can5', 'claude_can6', 'claude_can7', 'claude_can8', 'claude_can9', 'claude_can10'] as const
const CANNOT = ['claude_cannot1', 'claude_cannot2', 'claude_cannot3', 'claude_cannot4', 'claude_cannot5', 'claude_cannot6', 'claude_cannot7'] as const

type CopyState = 'idle' | 'copied' | 'manual'

/** How to add the app's read-only connector in claude.ai. Reached by admins and managers only (route guard). */
export default function ClaudeConnector() {
  const { t } = useI18n()
  const { user, isAdmin } = useAuth()
  const { perm, permsReady } = usePerms()
  const [copy, setCopy] = useState<CopyState>('idle')
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  if (!permsReady) return <Loader full />

  const enabled = canConnectClaude(user?.role, perm('claude'))

  const onCopy = async () => {
    if (timer.current) clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(URL_TEXT)
      setCopy('copied')
    } catch {
      // Clipboard API missing or refused (insecure context, permissions policy): leave the text selected for Ctrl+C.
      inputRef.current?.focus()
      inputRef.current?.select()
      setCopy('manual')
    }
    timer.current = setTimeout(() => setCopy('idle'), 4000)
  }

  return (
    <div className="page claude">
      <div className="page__head">
        <h1 className="page-title">{t('claude_title')}</h1>
      </div>

      <p className="claude__lead">{t('claude_intro')}</p>

      {isAdmin && (
        <div className="panel claude__panel">
          <p>{t('claude_admin_note')}</p>
          <Link className="btn btn--ghost" to="/admin/users">{t('claude_admin_link')}</Link>
        </div>
      )}

      {!enabled ? (
        <p role="alert" className="alert claude__alert">{t('claude_not_enabled')}</p>
      ) : (
        <>
          <section className="panel claude__panel">
            <label className="claude__label" htmlFor="claude-url">{t('claude_url_label')}</label>
            <div className="claude__url">
              <input id="claude-url" ref={inputRef} className="input" dir="ltr" readOnly value={URL_TEXT} onFocus={(e) => e.currentTarget.select()} />
              <Button variant="primary" onClick={onCopy}>{copy === 'copied' ? t('claude_copied') : t('claude_copy')}</Button>
            </div>
            <p className="claude__status" role="status">
              {copy === 'copied' ? t('claude_copied') : copy === 'manual' ? t('claude_copy_manual') : ''}
            </p>
          </section>

          <section className="panel claude__panel">
            <h2>{t('claude_steps_h')}</h2>
            <ol className="claude__list">
              {STEPS.map((k) => <li key={k}>{t(k)}</li>)}
            </ol>
          </section>

          <section className="panel claude__panel">
            <h2>{t('claude_prompts_h')}</h2>
            <ul className="claude__prompts">
              {PROMPTS.map((k) => <li key={k} dir="auto">{t(k)}</li>)}
            </ul>
          </section>
        </>
      )}

      <div className="claude__cols">
        <section className="panel claude__panel">
          <h2>{t('claude_can_h')}</h2>
          <ul className="claude__list">
            {CAN.map((k) => <li key={k}>{t(k)}</li>)}
          </ul>
          <p className="claude__note">{t('claude_can_note')}</p>
        </section>
        <section className="panel claude__panel">
          <h2>{t('claude_cannot_h')}</h2>
          <ul className="claude__list">
            {CANNOT.map((k) => <li key={k}>{t(k)}</li>)}
          </ul>
        </section>
      </div>
    </div>
  )
}
