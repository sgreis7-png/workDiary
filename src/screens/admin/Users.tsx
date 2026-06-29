import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button, Avatar, Tag, RoleBadge, stagger, riseIn } from '../../components/ui'
import { Loader } from '../../components/Loader'
import { useI18n } from '../../i18n'
import { deleteUser, fetchUsers, inviteUser, setUserActive, setUserRole } from '../../api'
import { useAuth } from '../../auth'
import type { AppUser, Role } from '../../data'

export default function Users() {
  const { t } = useI18n()
  const { user: me } = useAuth()
  const [users, setUsers] = useState<AppUser[] | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const roleLabels = { admin: t('role_admin'), member: t('role_member') }
  const reload = () => fetchUsers().then(setUsers).catch(() => setUsers([]))
  useEffect(() => { reload() }, [])

  const setRole = async (email: string, role: Role) => { await setUserRole(email, role); reload() }
  const toggleActive = async (u: AppUser) => { await setUserActive(u.email, !u.active); reload() }
  const remove = async (u: AppUser) => {
    if (!window.confirm(`${t('confirm_delete_user')}\n\n${u.name} · ${u.email}`)) return
    setErr('')
    try { await deleteUser(u.email); reload() }
    catch (e) { setErr(String((e as Error).message ?? e)) }
  }
  const invite = async () => {
    if (!email.trim() || busy) return
    setBusy(true); setErr('')
    try {
      await inviteUser(email.trim(), name.trim() || email.split('@')[0])
      setName(''); setEmail(''); reload()
    } catch (e) {
      setErr(String((e as Error).message ?? e))
    } finally { setBusy(false) }
  }

  if (!users) return <Loader full />

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
            <motion.div key={u.email} className="row-item" variants={riseIn} style={{ opacity: u.active ? 1 : 0.55 }}>
              <Avatar name={u.name} />
              <div className="grow">
                <b>{u.name}</b> <RoleBadge role={u.role} labels={roleLabels} />
                <div><small className="mono">{u.email}</small></div>
              </div>

              <div className="lang-toggle" title={t('permissions')}>
                <button className={u.role === 'member' ? 'on' : ''} onClick={() => setRole(u.email, 'member')}>{t('role_member')}</button>
                <button className={u.role === 'admin' ? 'on' : ''} onClick={() => setRole(u.email, 'admin')}>{t('role_admin')}</button>
              </div>

              {!u.registered ? <Tag tone="amber">⧖ {t('pending_reg')}</Tag>
                : u.active ? <Tag tone="green">✓ {t('registered_on')}</Tag> : <Tag tone="muted">{t('inactive')}</Tag>}
              <Button variant="ghost" onClick={() => toggleActive(u)}>{u.active ? t('inactive') : t('active')}</Button>
              {me?.email?.toLowerCase() !== u.email.toLowerCase() && (
                <Button variant="danger" onClick={() => remove(u)} title={t('delete_user')}>🗑</Button>
              )}
            </motion.div>
          ))}
        </motion.div>

        <div className="add-row" style={{ flexWrap: 'wrap', flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <span className="field__label">{t('authorize_email')} <span className="field__hint">{t('authorize_hint')}</span></span>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: '1 1 160px' }} placeholder={t('nav_users')} value={name} onChange={(e) => setName(e.target.value)} />
            <input className="input" style={{ flex: '1 1 200px' }} type="email" placeholder={t('email')} value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && invite()} />
            <Button variant="primary" onClick={invite} disabled={busy}>✦ {t('invite_user')}</Button>
          </div>
          {err && <p className="alert">⚠ {err}</p>}
        </div>
      </div>

      <p className="secure-note">🔒 {t('authorize_hint')}</p>
    </div>
  )
}
