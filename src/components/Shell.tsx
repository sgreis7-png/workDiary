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
import { FeedbackDialog } from './FeedbackDialog'
import { getTheme, setTheme, type Theme } from '../lib/theme'
import { usePerms } from '../lib/usePerms'
import { chatUnackedStatus, fetchProfileMetas, type UserMessage } from '../lib/messages'
import { ensurePush, enablePush, pushSupported } from '../lib/push'
import { useDT } from '../defects/i18n'
import { st } from '../safety/i18n'
import { tl } from '../traffic/i18n'
import { GlobalDictation } from './GlobalDictation'

/** Top user menu: avatar button → account, theme, about, sign-out. */
function UserMenu({ avatarUrl, onAbout, compact }: { avatarUrl: string | null; onAbout: () => void; compact?: boolean }) {
  const { user, signOut } = useAuth()
  const { dt } = useDT()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const flipTheme = () => { const t = theme === 'dark' ? 'light' : 'dark'; setTheme(t); setThemeState(t) }
  const close = () => setOpen(false)

  const [pushState, setPushState] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied')

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
          <button role="menuitem" onClick={() => { close(); nav('/account') }}>{dt('menu_account')}</button>
          <button role="menuitem" onClick={() => { flipTheme() }}>{theme === 'dark' ? dt('menu_light') : dt('menu_dark')}</button>
          {pushSupported() && pushState !== 'granted' && (
            <button role="menuitem" onClick={async () => { if (user) setPushState(await enablePush(user.email)) }}>
              🔔 {dt('menu_push')}
            </button>
          )}
          <button role="menuitem" onClick={() => { close(); onAbout() }}>{dt('menu_about')}</button>
          <div className="user-menu__sep" />
          <button role="menuitem" className="user-menu__danger" onClick={() => { close(); signOut(); nav('/login') }}>{dt('menu_signout')}</button>
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

function NavItem({ to, icon, label, end, badge }: { to: string; icon: string; label: string; end?: boolean; badge?: number }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `nav__item ${isActive ? 'active' : ''}`} onClick={() => window.scrollTo(0, 0)}>
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="nav-marker" className="nav__marker" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
          <span className="ic" aria-hidden>{icon}</span>
          {label}
          {badge ? <span className="nav__badge">{badge}</span> : null}
        </>
      )}
    </NavLink>
  )
}

interface NavLeaf { to: string; icon: string; label: string; end?: boolean; badge?: number }
interface NavGroup { key: string; label: string; items: NavLeaf[] }

const OPEN_GROUPS_KEY = 'nav_open_groups'

/** Explicit open/closed choices only; a group the user has never touched has no entry. */
function readGroupPrefs(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(OPEN_GROUPS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && !Array.isArray(parsed) ? (parsed as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

/**
 * Topic groups, collapsed unless you are inside them.
 *
 * The nav had grown to fourteen flat entries under three headings, which is more than
 * anyone scans — so the sections fold, and the one holding the current page opens itself.
 * That keeps five or six things on screen instead of fourteen, without hiding anything
 * behind an extra decision.
 */
function NavGroups({ groups }: { groups: NavGroup[] }) {
  const loc = useLocation()

  const groupOf = (path: string) => groups.find((g) => g.items.some(
    (i) => (i.end ? path === i.to : path === i.to || path.startsWith(`${i.to}/`)),
  ))?.key

  const activeGroup = groupOf(loc.pathname)
  const [prefs, setPrefs] = useState<Record<string, boolean>>(readGroupPrefs)

  // Derived, not stored: the group holding the current page is open unless the user has
  // said otherwise. Nothing to synchronise on navigation, and a deliberate collapse
  // still sticks.
  const isOpen = (key: string) => prefs[key] ?? key === activeGroup

  const toggle = (key: string) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !isOpen(key) }
      try { localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next)) } catch { /* private browsing */ }
      return next
    })
  }

  return (
    <>
      {groups.filter((g) => g.items.length > 0).map((group) => {
        const expanded = isOpen(group.key)
        const hidden = group.items.reduce((n, i) => n + (i.badge ?? 0), 0)
        return (
          <div className="nav__group" key={group.key}>
            <button
              type="button"
              className={`nav__toggle ${expanded ? 'is-open' : ''}`}
              aria-expanded={expanded}
              onClick={(e) => { e.stopPropagation(); toggle(group.key) }}
            >
              <span className="nav__toggle-label">{group.label}</span>
              {!expanded && hidden > 0 && <span className="nav__badge">{hidden}</span>}
              <span className="nav__chev" aria-hidden>{expanded ? '▾' : '‹'}</span>
            </button>
            {expanded && (
              <div className="nav__items">
                {group.items.map((item) => <NavItem key={item.to} {...item} />)}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

export function Shell() {
  const { t } = useI18n()
  const { dt, lang } = useDT()
  const { user, isAdmin } = useAuth()
  const { online, pending } = useOfflineSync()
  const [open, setOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [unacked, setUnacked] = useState(0)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [msgToast, setMsgToast] = useState<UserMessage | null>(null)
  const prevUnacked = useRef(-1)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loc = useLocation()
  const nav = useNavigate()
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
    ensurePush(user.email)
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
        <Logo height={52} tone="shell" />
        <div className="sub">{t('app_title')} · {t('app_sub')}</div>
      </div>

      <div className="sidebar__top">
        <UserMenu avatarUrl={avatarUrl} onAbout={() => setAboutOpen(true)} />
        <NotificationsBell />
      </div>

      <nav className="nav" onClick={() => setOpen(false)}>
        {/* The one thing people come here to do, out of the list and above it. */}
        {canEdit('logbook') && (
          <NavLink to="/new" className="nav__primary" onClick={() => window.scrollTo(0, 0)}>
            <span aria-hidden>✛</span>
            {t('nav_new')}
          </NavLink>
        )}

        <NavGroups
          groups={[
            {
              key: 'projects',
              label: t('nav_section_projects'),
              items: [
                ...(can('traffic_light') ? [{ to: '/traffic', icon: '🚦', label: tl(lang, 'nav_traffic') }] : []),
                ...(can('control_center') ? [{ to: '/control', icon: '◈', label: t('nav_control_center') }] : []),
                ...(can('projects') ? [{ to: '/projects', icon: '◆', label: t('nav_projects') }] : []),
                ...(can('gantt') ? [{ to: '/gantt', icon: '▬', label: t('nav_gantt') }] : []),
              ],
            },
            {
              key: 'diary',
              label: t('nav_section_work'),
              items: [
                ...(can('logbook') ? [{ to: '/', icon: '▤', label: t('nav_log'), end: true }] : []),
                ...(can('calendar') ? [{ to: '/calendar', icon: '▦', label: t('nav_calendar') }] : []),
              ],
            },
            {
              key: 'safety',
              label: st(lang, 'nav_section_safety'),
              items: [
                ...(can('safety') ? [{ to: '/safety', icon: '⛑', label: st(lang, 'nav_safety') }] : []),
              ],
            },
            {
              key: 'quality',
              label: t('nav_section_defects'),
              items: [
                ...(can('defects') ? [{ to: '/defects', icon: '🛡', label: dt('nav_coops'), end: true }] : []),
                ...(can('defects') ? [{ to: '/defects/search', icon: '⌕', label: dt('nav_defect_search') }] : []),
                ...(can('dashboard') ? [{ to: '/defects/dashboard', icon: '◷', label: t('nav_qc_dashboard') }] : []),
              ],
            },
            {
              key: 'tracking',
              label: t('nav_section_tracking'),
              items: [
                { to: '/tasks', icon: '☑', label: dt('nav_tasks') },
                ...(can('dashboard') ? [{ to: '/dashboard', icon: '◷', label: t('nav_stats') }] : []),
                ...(can('dashboard') ? [{ to: '/digest', icon: '📊', label: t('nav_digest') }] : []),
                ...(can('export') ? [{ to: '/export', icon: '⭳', label: t('nav_export') }] : []),
              ],
            },
            {
              key: 'comms',
              label: t('nav_section_general'),
              items: [
                { to: '/messages', icon: '✉', label: dt('nav_messages'), badge: unacked },
                { to: '/lists', icon: '⛁', label: t('nav_lists') },
                ...(can('alert_rules') ? [{ to: '/alert-rules', icon: '⚑', label: t('nav_alert_rules') }] : []),
              ],
            },
            {
              key: 'admin',
              label: t('nav_admin'),
              items: [
                ...(canEdit('form_builder') ? [{ to: '/admin/fields', icon: '⚙', label: t('nav_fields') }] : []),
                ...(canEdit('form_builder') ? [{ to: '/admin/defect-items', icon: '⚙', label: dt('nav_form_builder') }] : []),
                ...(isAdmin ? [{ to: '/admin/users', icon: '◎', label: t('nav_users') }] : []),
                ...(isAdmin ? [{ to: '/admin/feedback', icon: '📢', label: t('nav_feedback_admin') }] : []),
                ...(isAdmin ? [{ to: '/admin/audit', icon: '⧉', label: t('nav_audit') }] : []),
                ...(isAdmin ? [{ to: '/admin/safety-topics', icon: '⛑', label: st(lang, 'nav_safety_topics') }] : []),
              ],
            },
          ]}
        />

        <div className="nav__minor">
          <button className="nav__item nav__switch" onClick={() => setFeedbackOpen(true)}>
            <span className="ic" aria-hidden>🛈</span>
            {t('nav_feedback')}
          </button>
        </div>
      </nav>

      <div className="sidebar__foot">
        {syncBadge}
        <LangToggle />
        <div style={{ fontSize: 9.5, color: 'var(--shell-faint)', fontFamily: 'var(--font-mono)', marginTop: 6 }}>v{__BUILD_TS__}</div>
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
          <Logo height={34} withTag={false} />
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
      <GlobalDictation />
      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
      {feedbackOpen && <FeedbackDialog onClose={() => setFeedbackOpen(false)} />}
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
              <b>{dt('toast_new_msg')}{msgToast.from_name ?? msgToast.from_email}</b>
              <small>{msgToast.body.slice(0, 60)}</small>
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
