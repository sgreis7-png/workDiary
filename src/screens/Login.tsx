import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Logo } from '../components/Logo'
import { Button, Field } from '../components/ui'
import { useI18n } from '../i18n'
import { useAuth } from '../auth'

type Mode = 'signin' | 'register'

export default function Login() {
  const { t } = useI18n()
  const { signIn, register } = useAuth()
  const nav = useNavigate()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    if (mode === 'register') {
      if (pw.length < 8) return setErr(t('err_pw_short'))
      if (pw !== pw2) return setErr(t('err_pw_match'))
    }
    setBusy(true)
    const { error } = mode === 'register' ? await register(email, pw) : await signIn(email, pw)
    setBusy(false)
    if (error) return setErr(t(error as never))
    nav('/')
  }

  const swap = (m: Mode) => { setMode(m); setErr(''); setPw(''); setPw2(''); if (m === 'register') setEmail('') }

  return (
    <div className="login">
      <div className="login__art">
        <Logo height={40} animated tone="light" />
        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          className="big"
        >
          {t('app_title')}.<br />תיעוד שטח <em>מדויק</em>,<br />בכל פרויקט.
        </motion.div>
        <motion.div className="meta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
          <div><b>תיעוד</b> מהשטח</div>
          <div><b>דו״ח</b> במייל</div>
          <div><b>100%</b> מאובטח</div>
        </motion.div>
      </div>

      <div className="login__form">
        <div className="login__topbar">
          <span className="kicker">Agrotop · Secure</span>
          <div className="lang-toggle"><LangButtons /></div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={mode} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.28 }}>
            <h1>{mode === 'register' ? t('set_password') : t('login_title')}</h1>
            <p className="sub">{mode === 'register' ? t('authorize_hint') : t('login_sub')}</p>

            <form className="login__fields" onSubmit={submit}>
              <Field label={t('email')}>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="name@agrotop.co.il" />
              </Field>
              <Field label={mode === 'register' ? t('set_password') : t('password')}>
                <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
              </Field>
              {mode === 'register' && (
                <Field label={t('confirm_password')}>
                  <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
                </Field>
              )}

              <AnimatePresence>
                {err && (
                  <motion.p role="alert" className="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    ⚠ {err}
                  </motion.p>
                )}
              </AnimatePresence>

              <Button type="submit" disabled={busy} variant="primary">
                {busy
                  ? <><span className="spin" /> {mode === 'register' ? t('registering') : t('signing_in')}</>
                  : (mode === 'register' ? t('register_cta') : t('sign_in'))}
              </Button>
            </form>

            <button type="button" className="btn btn--quiet" style={{ marginTop: 16, paddingInline: 0 }}
              onClick={() => swap(mode === 'register' ? 'signin' : 'register')}>
              {mode === 'register' ? '← ' + t('have_account_q') : t('first_time_q') + ' →'}
            </button>
          </motion.div>
        </AnimatePresence>

        <div className="secure-note">🔒 {t('login_sub')}</div>
      </div>
    </div>
  )
}

function LangButtons() {
  const { lang, setLang } = useI18n()
  return (
    <>
      <button className={lang === 'he' ? 'on' : ''} onClick={() => setLang('he')}>עב</button>
      <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
    </>
  )
}
