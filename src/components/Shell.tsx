import { useEffect, useRef, useState } from 'react'
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
import { chatUnackedStatus, fetchProfileMetas, type UserMessage } from '../lib/messages'
import { getMode } from '../defects/mode'

/** Top user menu: avatar button → account, theme, about, sign-out. */
function UserMenu({ avatarUrl, onAbout, compact }: { avatarUrl: string | null; onAbout: () => void; compact?: boolean }) {
  const { user, signOut } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const flipTheme = () => { const t = theme === 'dark' ? 'light' : 'dark'; setTheme(t); setThemeState(t) }
  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) return
    const onDoc = () => setOpen(false)
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [open])

  return (
    <div className="user-menu" onClick={(e) => e.stopPropagation()}>
      <button className={`user-menu__btn ${compact ? 'user-menu__btn--compact' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {avatarUrl
          ? <img className="chat-avatar" style={{ width: 36, height: 36 }} src={avatarUrl} alt="" />
          : <Avatar name={user?.name ?? '?'} size={36} />}
        {!compact && (
          <span className="user-menu__meta">
            <b>{user?.name}</b>
            <small>{user?.email}</small>
          </span>
        )}
        <span className="user-menu__chev" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="user-menu__panel" role="menu">
          <button role="menuitem" onClick={() => { close(); nav('/account') }}>👤 החשבון שלי — פרופיל וסיסמה</button>
          <button role="menuitem" onClick={() => { flipTheme() }}>{theme === 'dark' ? '☀ מעבר למצב בהיר' : '☾ מעבר למצב כהה'}</button>
          <button role="menuitem" onClick={() => { close(); onAbout() }}>ⓘ על התוכנה</button>
          <div className="user-menu__sep" />
          <button role="menuitem" className="user-menu__danger" onClick={() => { close(); signOut(); nav('/login') }}>⇥ התנתקות</button>
        </div>
      )}
    </div>
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
  const { user, isAdmin } = useAuth()
  const { online, pending } = useOfflineSync()
  const [open, setOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [unacked, setUnacked] = useState(0)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [msgToast, setMsgToast] = useState<UserMessage | null>(null)
  const prevUnacked = useRef(-1)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loc = useLocation()
  const nav = useNavigate()
  // Mode-neutral routes (messages, account) keep the stored mode's nav instead of
  // snapping back to work mode.
  const path = loc.pathname
  const neutral = path.startsWith('/messages') || path.startsWith('/account')
  const defectsMode = path.startsWith('/defects') || path.startsWith('/admin/defect-items')
    || (neutral && getMode() === 'defects')
  const { can, canEdit } = usePerms()

  useEffect(() => {
    if (!user?.email) return
    const poll = () => chatUnackedStatus(user.email).then(({ count, latest }) => {
      setUnacked(count)
      // toast on a NEW incoming message (count rose; skip the very first poll)
      if (prevUnacked.current >= 0 && count > prevUnacked.current && latest) {
        setMsgToast(latest)
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setMsgToast(null), 7000)
      }
      prevUnacked.current = count
    })
    poll()
    const t = setInterval(poll, 30_000)
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

      <div className="sidebar__top">
        <UserMenu avatarUrl={avatarUrl} onAbout={() => setAboutOpen(true)} />
        <NotificationsBell />
      </div>

      <nav className="nav" onClick={() => setOpen(false)}>
        {defectsMode ? (
          <>
            {can('defects') && <NavItem to="/defects" end icon="🛡" label="לולים — תפיסת סיום שלב" />}
            {can('defects') && <NavItem to="/defects/search" icon="⌕" label="חיפוש" />}
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
        {syncBadge}
        <LangToggle />
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
          <UserMenu avatarUrl={avatarUrl} onAbout={() => setAboutOpen(true)} compact />
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
      <AnimatePresence>
        {msgToast && (
          <motion.button
            className="msg-toast"
            initial={{ opacity: 0, y: -16, scale: .96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            onClick={() => { setMsgToast(null); nav('/messages') }}
          >
            <span className="msg-toast__icon" aria-hidden>✉</span>
            <span className="msg-toast__body">
              <b>הודעה חדשה מ{msgToast.from_name ?? msgToast.from_email}</b>
              <small>{msgToast.body.slice(0, 60)}</small>
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
