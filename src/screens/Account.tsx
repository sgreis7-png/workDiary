import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button, Field } from '../components/ui'
import { useI18n } from '../i18n'
import { useAuth } from '../auth'
import { changeMyPassword } from '../api'

export default function Account() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(''); setOk(false)
    if (pw.length < 8) return setErr(t('err_pw_short'))
    if (pw !== pw2) return setErr(t('err_pw_match'))
    setBusy(true)
    try {
      await changeMyPassword(pw)
      setOk(true); setPw(''); setPw2('')
    } catch (e) {
      setErr(String((e as Error).message ?? e))
    } finally { setBusy(false) }
  }

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{t('account')}</div>
          <h1 className="page-title">{t('change_password')}</h1>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 460, padding: 24 }}>
        <p className="sub" style={{ color: 'var(--ink-3)', marginBottom: 18 }}>{user?.email}</p>
        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          <Field label={t('set_password')}>
            <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label={t('confirm_password')}>
            <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          </Field>
          {err && <motion.p role="alert" className="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>⚠ {err}</motion.p>}
          {ok && <motion.p className="tag tag--green" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '8px 12px' }}>{t('password_changed')}</motion.p>}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <><span className="spin" /> {t('saving')}</> : t('update_password')}
          </Button>
        </form>
      </div>
    </div>
  )
}
