import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useI18n } from '../i18n'
import { fetchMyNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from '../api'

export function NotificationsBell() {
  const { t } = useI18n()
  const nav = useNavigate()
  const [items, setItems] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)

  const load = useCallback(() => { fetchMyNotifications().then(setItems).catch(() => {}) }, [])
  useEffect(() => {
    load()
    window.addEventListener('focus', load)
    const id = setInterval(load, 60000) // light poll
    return () => { window.removeEventListener('focus', load); clearInterval(id) }
  }, [load])

  const unread = items.filter((i) => !i.read).length
  const openItem = async (n: AppNotification) => {
    if (!n.read) { await markNotificationRead(n.id); load() }
    if (n.link) { nav(n.link); setOpen(false) }
  }
  const allRead = async () => { await markAllNotificationsRead(); load() }

  return (
    <div className="notif">
      <button className="notif__bell" onClick={() => setOpen((o) => !o)} aria-label="notifications">
        🔔{unread > 0 && <span className="notif__dot">{unread}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="notif__backdrop" onClick={() => setOpen(false)} />
            <motion.div className="notif__panel" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <div className="notif__head">
                <b>{t('notifications')}</b>
                {unread > 0 && <button className="btn btn--quiet" onClick={allRead}>{t('mark_all_read')}</button>}
              </div>
              {items.length === 0 && <div className="notif__empty">{t('no_notifications')}</div>}
              {items.map((n) => (
                <button key={n.id} className={`notif__item ${n.read ? '' : 'unread'}`} onClick={() => openItem(n)}>
                  <b>{n.title}</b>
                  {n.body && <span>{n.body}</span>}
                  <small>{n.created_at.slice(0, 10)}</small>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
