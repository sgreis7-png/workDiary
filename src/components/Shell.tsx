import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Logo } from './Logo'
import { Avatar } from './ui'
import { useI18n } from '../i18n'
import { useAuth } from '../auth'
import { useOfflineSync } from '../lib/useOfflineSync'
import { NotificationsBell } from './Notifications'
import { AboutDialog } from './AboutDialog'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { usePerms } from '../lib/usePerms'
import { countUnackedAll, fetchProfileMetas } from '../lib/messages'

function ThemeToggle() {
  const [theme, set] = useState<Theme>(getTheme())
  const flip = () => { const t = theme === 'dark' ? 'light' : 'dark'; setTheme(t); set(t) }
  return (
    <button className="btn btn--quiet" onClick={flip} title={theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'} aria-label="theme">
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  )
}

function LangToggle() {
  const { lang, setLang } = useI18n()
  return (
    <div className="lang-toggle" role="group" aria-label="language">
      <button className={lang === 'he' ? 'on' : ''} onClick={() => setLang('he')}>עב</button>
      <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
    </div>
  )
}

function NavItem({ to, icon, label, end }: { to: string; icon: string; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `nav__item ${isActive ? 'active' : ''}`} onClick={() => window.scrollTo(0, 0)}>
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="nav-marker" className="nav__marker" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
          <span className="ic" aria-hidden>{icon}</span>
          {label}
        </>
      )}
    </NavLink>
  )
}

export function Shell() {
  const { t } = useI18n()
  const { user, signOut, isAdmin } = useAuth()
  const { online, pending } = useOfflineSync()
  const [open, setOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [unacked, setUnacked] = useState(0)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const loc = useLocation()
  const nav = useNavigate()
  const defectsMode = loc.pathname.startsWith('/defects') || loc.pathname.startsWith('/admin/defect-items')
  const { can, canEdit } = usePerms()

  useEffect(() => {
    if (!user?.email) return
    const poll = () => countUnackedAll(user.email).then(setUnacked)
    poll()
    const t = setInterval(poll, 60_000)
    window.addEventListener('messages-changed', poll)
    fetchProfileMetas().then((m) => setAvatarUrl(m[user.email.toLowerCase()]?.avatar_url ?? null)).catch(() => {})
    return () => { clearInterval(t); window.removeEventListener('messages-changed', poll) }
  }, [user?.email])

  const syncBadge = (!online || pending > 0) ? (
    <div className={`sync-badge ${!online ? 'sync-badge--off' : 'sync-badge--pending'}`}>
      {!online ? `● ${t('offline')}` : `⟳ ${pending} ${t('pending_sync')}`}
    </div>
  ) : null

  const sidebar = (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar__brand">
        <Logo height={34} tone="light" />
        <div className="sub">{t('app_title')} · {t('app_sub')}</div>
      </div>

      <nav className="nav" onClick={() => setOpen(false)}>
        {defectsMode ? (
          <>
            {can('defects') && <NavItem to="/defects" icon="🛡" label="לולים — תפיסת סיום שלב" />}
            {canEdit('form_builder') && <NavItem to="/admin/defect-items" icon="⚙" label="בונה טופס ליקויים" />}
          </>
        ) : (
          <>
            {can('logbook') && <NavItem to="/" end icon="▤" label={t('nav_log')} />}
            {can('dashboard') && <NavItem to="/dashboard" icon="◷" label={t('nav_dashboard')} />}
            {can('calendar') && <NavItem to="/calendar" icon="▦" label={t('nav_calendar')} />}
            {canEdit('logbook') && <NavItem to="/new" icon="✛" label={t('nav_new')} />}
            {can('search') && <NavItem to="/search" icon="⌕" label={t('nav_search')} />}
            {can('projects') && <NavItem to="/projects" icon="◆" label={t('nav_projects')} />}
            {can('export') && <NavItem to="/export" icon="⭳" label={t('nav_export')} />}
          </>
        )}
        <NavLink to="/messages" className={({ isActive }) => `nav__item ${isActive ? 'active' : ''}`} onClick={() => window.scrollTo(0, 0)}>
          <span className="ic" aria-hidden>✉</span>
          הודעות
          {unacked > 0 && <span className="coop-tab__badge" style={{ marginInlineStart: 'auto' }}>{unacked}</span>}
        </NavLink>
        {!defectsMode && (isAdmin || canEdit('form_builder')) && (
          <>
            <div className="nav__heading">{t('nav_admin')}</div>
            {canEdit('form_builder') && <NavItem to="/admin/fields" icon="⚙" label={t('nav_fields')} />}
            {isAdmin && <NavItem to="/admin/users" icon="◎" label={t('nav_users')} />}
          </>
        )}
        <button className="nav__item nav__switch" onClick={() => nav('/mode')}>
          <span className="ic" aria-hidden>⇄</span>
          {defectsMode ? 'מעבר לניהול עבודה' : 'מעבר לניהול ליקויים'}
        </button>
      </nav>

      <div className="sidebar__foot">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <NotificationsBell />
          <ThemeToggle />
          <button className="btn btn--quiet" onClick={() => setAboutOpen(true)} title="על התוכנה" aria-label="about">ⓘ</button>
          {syncBadge}
        </div>
        <LangToggle />
        <div className="user-chip">
          {avatarUrl
            ? <img className="chat-avatar" style={{ width: 34, height: 34 }} src={avatarUrl} alt="" />
            : <Avatar name={user?.name ?? '?'} />}
          <div className="meta">
            <b>{user?.name}</b>
            <small>{user?.email}</small>
          </div>
          <button className="btn btn--quiet" style={{ marginInlineStart: 'auto' }} onClick={() => nav('/account')} title={t('change_password')}>🔑</button>
          <button className="btn btn--quiet" onClick={() => { signOut(); nav('/login') }} title={t('sign_out')}>⇥</button>
        </div>
      </div>
    </aside>
  )

  return (
    <div className="shell">
      {sidebar}
      {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 45, background: 'rgba(20,24,27,.25)' }} />}
      <div>
        <div className="mobile-bar">
          <button className="btn btn--ghost" onClick={() => setOpen(true)}>☰</button>
          <Logo height={26} withTag={false} />
          {syncBadge}
          <NotificationsBell />
          <ThemeToggle />
          <LangToggle />
        </div>
        <main className="main">
          <AnimatePresence mode="wait">
            <motion.div
              key={loc.pathname}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
    </div>
  )
}
