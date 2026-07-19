import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button, Avatar, Tag, RoleBadge, stagger, riseIn } from '../../components/ui'
import { Loader } from '../../components/Loader'
import { useI18n } from '../../i18n'
import { deleteUser, fetchUsers, inviteUser, setUserActive, setUserRole } from '../../api'
import { useAuth } from '../../auth'
import type { AppUser, Role } from '../../data'
import {
  PERM_AREAS, fetchPermOverridesFor, setPermOverride, clearPermOverride,
  type PermArea, type PermLevel,
} from '../../lib/perms'

const LEVEL_LABELS: { value: PermLevel | 'default'; label: string }[] = [
  { value: 'default', label: 'ברירת מחדל' },
  { value: 'none', label: 'אין גישה' },
  { value: 'view', label: 'צפייה בלבד' },
  { value: 'edit', label: 'צפייה ועריכה' },
]

/** הרשאות פר-משתמש: שורה לכל אזור, בחירה גוברת על ברירת המחדל של התפקיד. */
function PermissionsDialog({ user, onClose }: { user: AppUser; onClose: () => void }) {
  const [overrides, setOverrides] = useState<Record<string, PermLevel> | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetchPermOverridesFor(user.email).then(setOverrides).catch((e) => setErr(String(e.message ?? e)))
  }, [user.email])

  async function change(area: PermArea, value: PermLevel | 'default') {
    setErr('')
    try {
      if (value === 'default') {
        await clearPermOverride(user.email, area)
        setOverrides((p) => { const n = { ...(p ?? {}) }; delete n[area]; return n })
      } else {
        await setPermOverride(user.email, area, value)
        setOverrides((p) => ({ ...(p ?? {}), [area]: value }))
      }
    } catch (e) { setErr(String((e as Error).message ?? e)) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} dir="rtl">
        <h2>הרשאות גישה — {user.name}</h2>
        <p className="coop-intro" style={{ margin: '8px 0 14px' }}>
          {user.role === 'admin'
            ? 'משתמש זה אדמין — יש לו גישה מלאה לכל האזורים; ההגדרות כאן ישפיעו רק אם יורד לתפקיד עובד.'
            : 'בחירה כאן גוברת על ברירת המחדל של תפקיד "עובד". "ברירת מחדל" מחזירה למצב הרגיל.'}
        </p>
        {err && <div className="alert">{err}</div>}
        {!overrides ? <Loader label="טוען…" /> : (
          <div className="perm-grid">
            {PERM_AREAS.map((a) => (
              <div key={a.key} className="perm-row">
                <span className="perm-row__label">{a.label}</span>
                <select
                  className="input" value={overrides[a.key] ?? 'default'}
                  onChange={(e) => change(a.key, e.target.value as PermLevel | 'default')}
                >
                  {LEVEL_LABELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
        <div className="form-actions" style={{ marginTop: 18 }}>
          <button className="btn btn--primary" onClick={onClose}>סגירה</button>
        </div>
      </div>
    </div>
  )
}

export default function Users() {
  const { t } = useI18n()
  const { user: me } = useAuth()
  const [users, setUsers] = useState<AppUser[] | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [permsFor, setPermsFor] = useState<AppUser | null>(null)

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

              <Button variant="ghost" onClick={() => setPermsFor(u)}>🔑 הרשאות</Button>
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
      {permsFor && <PermissionsDialog user={permsFor} onClose={() => setPermsFor(null)} />}
    </div>
  )
}
