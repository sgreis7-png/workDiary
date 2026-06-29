import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Logo } from '../components/Logo'
import { Button, Field } from '../components/ui'
import { useI18n } from '../i18n'
import { useAuth } from '../auth'
import { ENTRIES, PROJECTS } from '../data'

export default function Login() {
  const { t } = useI18n()
  const { signIn } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('pavel@agrotop.co.il')
  const [pw, setPw] = useState('demo')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    await signIn(email, pw)
    nav('/')
  }

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
          <div><b>{PROJECTS.filter((p) => p.active).length}</b> פרויקטים פעילים</div>
          <div><b>{ENTRIES.length}</b> רשומות יומן</div>
          <div><b>100%</b> מאובטח</div>
        </motion.div>
      </div>

      <div className="login__form">
        <div className="login__topbar">
          <span className="kicker">Agrotop · Secure</span>
          <div className="lang-toggle">
            <LangButtons />
          </div>
        </div>
        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          {t('login_title')}
        </motion.h1>
        <p className="sub">{t('login_sub')}</p>

        <form className="login__fields" onSubmit={submit}>
          <Field label={t('email')}>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </Field>
          <Field label={t('password')}>
            <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
          </Field>
          <Button type="submit" disabled={busy} variant="primary">
            {busy ? <><span className="spin" /> {t('signing_in')}</> : t('sign_in')}
          </Button>
        </form>

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
