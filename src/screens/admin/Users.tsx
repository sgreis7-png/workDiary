import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Button, Avatar, Tag, RoleBadge, stagger, riseIn } from '../../components/ui'
import { Loader } from '../../components/Loader'
import { useI18n } from '../../i18n'
import { deleteUser, fetchUsers, fetchRegistrationCodes, inviteUser, setUserActive, setUserRole } from '../../api'
import { useAuth } from '../../auth'
import { ReportSendError, sendTestEmail } from '../../lib/sendReport'
import { useDialog } from '../../lib/useDialog'
import type { AppUser, Role } from '../../data'
import {
  PERM_AREAS, fetchPermOverrides, setPermOverride, clearPermOverride,
  type PermArea, type PermLevel,
} from '../../lib/perms'

const LEVELS: (PermLevel | 'default')[] = ['default', 'none', 'view', 'edit']

/** הרשאות פר-משתמש: שורה לכל אזור, בחירה גוברת על ברירת המחדל של התפקיד. */
function PermissionsDialog({ user, onClose }: { user: AppUser; onClose: () => void }) {
  const { t, lang } = useI18n()
  const panel = useRef<HTMLDivElement>(null)
  useDialog(panel, onClose)
  const [overrides, setOverrides] = useState<Record<string, PermLevel> | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetchPermOverrides(user.email).then(setOverrides).catch((e) => setErr(String(e.message ?? e)))
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
      <div className="modal" ref={panel} role="dialog" aria-modal="true" aria-label={t('perm_title')} tabIndex={-1} onClick={(e) => e.stopPropagation()} dir="rtl">
        <h2>{t('perm_title')} — {user.name}</h2>
        <p className="coop-intro" style={{ margin: '8px 0 14px' }}>
          {user.role === 'admin' ? t('perm_admin_note') : t('perm_member_note')}
        </p>
        {err && <div className="alert">{err}</div>}
        {!overrides ? <Loader label={t('loading')} /> : (
          <div className="perm-grid">
            {PERM_AREAS.map((a) => (
              <div key={a.key} className="perm-row">
                <span className="perm-row__label">{lang === 'he' ? a.label : a.label_en}</span>
                <select
                  className="input" value={overrides[a.key] ?? 'default'}
                  onChange={(e) => change(a.key, e.target.value as PermLevel | 'default')}
                >
                  {LEVELS.map((l) => <option key={l} value={l}>{t(`perm_${l === 'default' ? 'default' : l}` as never)}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
        <div className="form-actions" style={{ marginTop: 18 }}>
          <button className="btn btn--primary" onClick={onClose}>{t('close')}</button>
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
  const [copied, setCopied] = useState('')
  const [codes, setCodes] = useState<Record<string, string>>({})
  // Mail diagnostics. The failure that took longest to find was invisible from inside the
  // app — key fine, function fine, sending address wrong — so this exercises the real path
  // and shows exactly what came back.
  const [testTo, setTestTo] = useState('')
  const [testMsg, setTestMsg] = useState('')
  const [testing, setTesting] = useState(false)

  const roleLabels = { admin: t('role_admin'), manager: t('role_manager'), member: t('role_member') }
  const reload = () => Promise.all([
    fetchUsers().then(setUsers).catch(() => setUsers([])),
    fetchRegistrationCodes().then(setCodes).catch(() => setCodes({})),
  ])
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

  const runMailTest = async () => {
    const to = testTo.trim()
    if (!to || testing) return
    setTesting(true); setTestMsg('')
    try {
      const res = await sendTestEmail(to)
      setTestMsg(res.from === 'me' ? t('mailtest_ok_me') : t('mailtest_ok_sys'))
    } catch (e) {
      const kind = e instanceof ReportSendError ? e.kind : 'unknown'
      setTestMsg(
        kind === 'domain_not_verified' ? t('send_no_domain')
        : kind === 'not_configured' ? t('send_not_configured')
        : kind === 'rate_limited' ? t('send_rate_limited')
        // the provider's own words, which is the part worth reading when it is none of the above
        : `${t('send_rejected')} ${(e as ReportSendError).detail ?? (e as Error).message}`,
      )
    } finally { setTesting(false) }
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
                <button className={u.role === 'manager' ? 'on' : ''} onClick={() => setRole(u.email, 'manager')}>{t('role_manager')}</button>
                <button className={u.role === 'admin' ? 'on' : ''} onClick={() => setRole(u.email, 'admin')}>{t('role_admin')}</button>
              </div>

              <Button variant="ghost" onClick={() => setPermsFor(u)}>🔑 {t('perm_btn')}</Button>
              {!u.registered ? <Tag tone="amber">⧖ {t('pending_reg')}</Tag>
                : u.active ? <Tag tone="green">✓ {t('registered_on')}</Tag> : <Tag tone="muted">{t('inactive')}</Tag>}
              {/* the worker cannot register without this — hand it over directly */}
              {!u.registered && codes[u.email.toLowerCase()] && (
                <button
                  className="tag" dir="ltr" title={t('reg_code_col')}
                  style={{ fontFamily: 'var(--font-mono)', letterSpacing: '.14em', cursor: 'pointer' }}
                  onClick={() => { void navigator.clipboard.writeText(codes[u.email.toLowerCase()]); setCopied(u.email) }}
                >
                  {copied === u.email ? `✓ ${t('reg_code_copied')}` : codes[u.email.toLowerCase()]}
                </button>
              )}
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

      {/* Mail diagnostics. Any address, company or not — the recipient list is company-only by
          design, but sending is not restricted to it. */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="add-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <span className="field__label">
            {t('mailtest_title')} <span className="field__hint">{t('mailtest_hint')}</span>
          </span>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <input
              className="input" style={{ flex: '1 1 240px' }} type="email" dir="ltr"
              placeholder={t('mailtest_to')} value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runMailTest()}
            />
            <Button variant="ghost" onClick={runMailTest} disabled={testing || !testTo.trim()}>
              {testing ? <span className="spin" /> : t('mailtest_send')}
            </Button>
          </div>
          {testMsg && <p className="alert">{testMsg}</p>}
        </div>
      </div>

      <p className="secure-note">🔒 {t('authorize_hint')}</p>
      {permsFor && <PermissionsDialog user={permsFor} onClose={() => setPermsFor(null)} />}
    </div>
  )
}
