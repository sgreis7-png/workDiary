import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Logo } from '../components/Logo'
import { Loader } from '../components/Loader'
import { Button, Field } from '../components/ui'
import { useI18n } from '../i18n'
import { supabase } from '../lib/supabase'

// Landing page for the invite / reset link. supabase-js consumes the token from the
// URL and establishes a session; the user then chooses a password.
export default function SetPassword() {
  const { t } = useI18n()
  const nav = useNavigate()
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    // give supabase a tick to parse the token from the URL hash, then read the session
    const check = async () => {
      const { data } = await supabase.auth.getSession()
      if (!alive) return
      if (data.session?.user) { setEmail(data.session.user.email ?? ''); setReady(true) }
    }
    check()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.user) { setEmail(s.user.email ?? ''); setReady(true) }
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    if (pw.length < 6) return setErr(t('err_pw_short'))
    if (pw !== pw2) return setErr(t('err_pw_match'))
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setErr(error.message)
    nav('/')
  }

  if (!ready) return <Loader full label={t('set_password')} />

  return (
    <div className="login">
      <div className="login__art">
        <Logo height={40} animated tone="light" />
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }} className="big">
          {t('app_title')}.<br />ברוך הבא,<br /><em>קבע סיסמה</em>.
        </motion.div>
      </div>
      <div className="login__form">
        <div className="login__topbar"><span className="kicker">Agrotop · Secure</span></div>
        <h1>{t('set_password')}</h1>
        <p className="sub">{email}</p>
        <form className="login__fields" onSubmit={submit}>
          <Field label={t('set_password')}>
            <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus />
          </Field>
          <Field label={t('confirm_password')}>
            <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          </Field>
          {err && <p role="alert" className="alert">⚠ {err}</p>}
          <Button type="submit" disabled={busy} variant="primary">
            {busy ? <><span className="spin" /> {t('saving')}</> : t('register_cta')}
          </Button>
        </form>
      </div>
    </div>
  )
}
