import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Logo } from './Logo'
import { Avatar } from './ui'
import { useI18n } from '../i18n'
import { useAuth } from '../auth'

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
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const nav = useNavigate()

  const sidebar = (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar__brand">
        <Logo height={34} />
        <div className="sub">{t('app_title')} · {t('app_sub')}</div>
      </div>

      <nav className="nav" onClick={() => setOpen(false)}>
        <NavItem to="/" end icon="▤" label={t('nav_log')} />
        <NavItem to="/dashboard" icon="◷" label={t('nav_dashboard')} />
        <NavItem to="/calendar" icon="▦" label={t('nav_calendar')} />
        <NavItem to="/new" icon="✛" label={t('nav_new')} />
        <NavItem to="/search" icon="⌕" label={t('nav_search')} />
        <NavItem to="/lists" icon="✉" label={t('nav_lists')} />
        <NavItem to="/projects" icon="◆" label={t('nav_projects')} />
        <NavItem to="/export" icon="⭳" label={t('nav_export')} />
        {isAdmin && (
          <>
            <div className="nav__heading">{t('nav_admin')}</div>
            <NavItem to="/admin/fields" icon="⚙" label={t('nav_fields')} />
            <NavItem to="/admin/users" icon="◎" label={t('nav_users')} />
          </>
        )}
      </nav>

      <div className="sidebar__foot">
        <LangToggle />
        <div className="user-chip">
          <Avatar name={user?.name ?? '?'} />
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
    </div>
  )
}
