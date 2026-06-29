import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button, Avatar, Tag, RoleBadge, Field, stagger, riseIn } from '../../components/ui'
import { useI18n } from '../../i18n'
import { USERS, AppUser, Role } from '../../data'

export default function Users() {
  const { t } = useI18n()
  const [users, setUsers] = useState<AppUser[]>([...USERS])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  const roleLabels = { admin: t('role_admin'), member: t('role_member') }
  const sync = () => setUsers([...USERS])

  const setRole = (id: string, role: Role) => { const u = USERS.find((x) => x.id === id); if (u) u.role = role; sync() }
  const toggleActive = (id: string) => { const u = USERS.find((x) => x.id === id); if (u) u.active = !u.active; sync() }
  const invite = () => {
    if (!email.trim()) return
    // authorize the email — account stays "pending" until the worker registers a password
    USERS.push({ id: Math.random().toString(36).slice(2), name: name.trim() || email.split('@')[0], email: email.trim(), role: 'member', active: true, registered: false })
    setName(''); setEmail(''); sync()
  }

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{t('nav_admin')} · {t('admin_only')}</div>
          <h1 className="page-title">{t('nav_users')}</h1>
        </div>
        <span className="count mono">{users.filter((u) => u.active).length} {t('active')}</span>
      </div>

      <div className="panel">
        <motion.div className="row-list" variants={stagger} initial="hidden" animate="show">
          {users.map((u) => (
            <motion.div key={u.id} className="row-item" variants={riseIn} style={{ opacity: u.active ? 1 : 0.55 }}>
              <Avatar name={u.name} />
              <div className="grow">
                <b>{u.name}</b> <RoleBadge role={u.role} labels={roleLabels} />
                <div><small className="mono">{u.email}</small></div>
              </div>

              <div className="lang-toggle" title={t('permissions')}>
                <button className={u.role === 'member' ? 'on' : ''} onClick={() => setRole(u.id, 'member')}>{t('role_member')}</button>
                <button className={u.role === 'admin' ? 'on' : ''} onClick={() => setRole(u.id, 'admin')}>{t('role_admin')}</button>
              </div>

              {!u.registered ? <Tag tone="amber">⧖ {t('pending_reg')}</Tag>
                : u.active ? <Tag tone="green">✓ {t('registered_on')}</Tag> : <Tag tone="muted">{t('inactive')}</Tag>}
              <Button variant="ghost" onClick={() => toggleActive(u.id)}>{u.active ? t('inactive') : t('active')}</Button>
            </motion.div>
          ))}
        </motion.div>

        <div className="add-row" style={{ flexWrap: 'wrap', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <span className="field__label">{t('authorize_email')} <span className="field__hint">{t('authorize_hint')}</span></span>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: '1 1 160px' }} placeholder={t('nav_users')} value={name} onChange={(e) => setName(e.target.value)} />
            <input className="input" style={{ flex: '1 1 200px' }} type="email" placeholder={t('email')} value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && invite()} />
            <Button variant="primary" onClick={invite}>✦ {t('invite_user')}</Button>
          </div>
        </div>
      </div>

      <p className="secure-note">🔒 {t('authorize_hint')}</p>
    </div>
  )
}
