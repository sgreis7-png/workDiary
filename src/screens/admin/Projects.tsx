import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Tag, Field, stagger, riseIn } from '../../components/ui'
import { useI18n } from '../../i18n'
import { createProject, fetchUsers, notifyAssigned, setProjectActive, setProjectStaff, updateProject } from '../../api'
import { useStore } from '../../store'
import { useAuth } from '../../auth'
import type { AppUser, Project, ProjectInput } from '../../data'

const empty: ProjectInput = {
  name: '', active: true, location: '', budget: null, pmo: '',
  start_date: '', end_date: '', staff: '', notes: '', priority: 0,
}

export default function Projects() {
  const { t } = useI18n()
  const { isAdmin } = useAuth()
  const { projects, myPriorities, setUserPriority, reloadProjects, assignments, reloadAssignments } = useStore()
  const [editing, setEditing] = useState<Project | 'new' | null>(null)
  const [allStaff, setAllStaff] = useState<AppUser[]>([])
  const [params] = useSearchParams()
  const focusId = params.get('p')
  const [flash, setFlash] = useState<string | null>(null)

  // deep-link from an assignment notification: scroll to + briefly highlight the project
  useEffect(() => {
    if (!focusId || !projects.length) return
    const el = document.getElementById(`project-${focusId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFlash(focusId)
    const id = setTimeout(() => setFlash(null), 2400)
    return () => clearTimeout(id)
  }, [focusId, projects])

  // admins load the full authorized-worker list for the assignment picker
  useEffect(() => { if (isAdmin) fetchUsers().then(setAllStaff).catch(() => setAllStaff([])) }, [isAdmin])
  const staffLabel = (email: string) => allStaff.find((u) => u.email === email)?.name ?? email.split('@')[0]

  const toggle = async (id: string, active: boolean) => { await setProjectActive(id, !active); await reloadProjects() }

  // priority levels: 0 none .. 4 critical
  const LEVELS = [0, 1, 2, 3, 4]
  const levelKey = (v: number) => (['prio_none', 'prio_low', 'prio_medium', 'prio_high', 'prio_critical'] as const)[v] ?? 'prio_none'
  const levelTone = (v: number): 'muted' | 'green' | 'amber' | 'clay' => (v >= 4 ? 'clay' : v === 3 ? 'amber' : v === 2 ? 'green' : 'muted')

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{isAdmin ? `${t('nav_admin')} · ${t('admin_only')}` : t('app_sub')}</div>
          <h1 className="page-title">{t('nav_projects')}</h1>
        </div>
        {isAdmin && <Button variant="primary" onClick={() => setEditing('new')}>＋ {t('add_project')}</Button>}
      </div>

      <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'grid', gap: 14 }}>
        {projects.map((p) => (
          <motion.div key={p.id} id={`project-${p.id}`} variants={riseIn}
            className={`panel ${flash === p.id ? 'panel--flash' : ''}`} style={{ padding: 20, opacity: p.active ? 1 : 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              <h3 style={{ fontSize: 20 }}>{p.name}</h3>
              {p.active ? <Tag tone="green">{t('active')}</Tag> : <Tag tone="muted">{t('inactive')}</Tag>}
              {isAdmin && (
                <div style={{ display: 'flex', gap: 8, marginInlineStart: 'auto', flexWrap: 'wrap' }}>
                  <Button variant="ghost" onClick={() => setEditing(p)}>✎ {t('edit')}</Button>
                  <Button variant="ghost" onClick={() => toggle(p.id, p.active)}>{p.active ? t('inactive') : t('active')}</Button>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 8px' }}>
              {(p.priority ?? 0) > 0 && <Tag tone={levelTone(p.priority!)}>★ {t('company_priority')}: {t(levelKey(p.priority!))}</Tag>}
              {p.location && <Tag tone="muted">📍 {p.location}</Tag>}
              {p.pmo && <Tag tone="muted">👤 {p.pmo}</Tag>}
              {p.budget != null && <Tag tone="muted">₪ {Number(p.budget).toLocaleString()}</Tag>}
              {(p.start_date || p.end_date) && <Tag tone="muted">🗓 {p.start_date || '…'} → {p.end_date || '…'}</Tag>}
              {p.staff && <Tag tone="muted">👥 {p.staff}</Tag>}
            </div>
            {(assignments[p.id]?.length ?? 0) > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {assignments[p.id].map((email) => <Tag key={email} tone="green">👤 {staffLabel(email)}</Tag>)}
              </div>
            )}
            {p.notes && <p style={{ marginTop: 10, color: 'var(--ink-2)', fontSize: 14 }}>{p.notes}</p>}

            {/* personal priority — every user sets their own here */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
              <span className="field__label" style={{ margin: 0 }}>{t('my_priority')}</span>
              <select className="input" style={{ width: 'auto', minWidth: 130 }}
                value={myPriorities[p.id] ?? 0}
                onChange={(e) => setUserPriority(p.id, Number(e.target.value))}>
                {LEVELS.map((v) => <option key={v} value={v}>{t(levelKey(v))}</option>)}
              </select>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <AnimatePresence>
        {editing && isAdmin && (
          <ProjectForm
            initial={editing === 'new' ? empty : editing}
            isNew={editing === 'new'}
            onClose={() => setEditing(null)}
            onSaved={async () => { await Promise.all([reloadProjects(), reloadAssignments()]); setEditing(null) }}
          />
        )}
      </AnimatePresence>
    </div>
  )

  function ProjectForm({ initial, isNew, onClose, onSaved }: {
    initial: ProjectInput; isNew: boolean; onClose: () => void; onSaved: () => void
  }) {
    const [form, setForm] = useState<ProjectInput>({ ...initial })
    const prevStaff = isNew ? [] : (assignments[(initial as Project).id] ?? [])
    const [staffEmails, setStaffEmails] = useState<string[]>(prevStaff)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState('')
    const set = (k: keyof ProjectInput, v: string | boolean | number | null) => setForm((f) => ({ ...f, [k]: v }))
    const toggleStaff = (email: string) => setStaffEmails((s) => s.includes(email) ? s.filter((x) => x !== email) : [...s, email])

    const save = async () => {
      if (!form.name.trim()) { setErr(t('project_name')); return }
      setBusy(true); setErr('')
      try {
        const id = isNew ? await createProject(form) : ((await updateProject((initial as Project).id, form)), (initial as Project).id)
        await setProjectStaff(id, staffEmails)
        // notify only the newly-added workers
        const added = staffEmails.filter((e) => !prevStaff.includes(e))
        await notifyAssigned(added, form.name.trim(), id)
        onSaved()
      } catch (e) { setErr(String((e as Error).message ?? e)); setBusy(false) }
    }

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,27,.42)', display: 'grid', placeItems: 'center', zIndex: 60, padding: 16, backdropFilter: 'blur(3px)', overflow: 'auto' }}>
        <motion.div onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
          className="form" style={{ width: 'min(560px, 100%)', boxShadow: 'var(--shadow-2)', maxHeight: '92vh', overflow: 'auto' }}>
          <div className="form__section">{isNew ? t('add_project') : t('edit_project')}</div>
          <div style={{ display: 'grid', gap: 14 }}>
            <Field label={t('project_name')} hint={<span className="req">{t('required_field')}</span>}>
              <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
            </Field>
            <div className="form-grid">
              <Field label={t('proj_location')}><input className="input" value={form.location ?? ''} onChange={(e) => set('location', e.target.value)} /></Field>
              <Field label={t('proj_pmo')}><input className="input" value={form.pmo ?? ''} onChange={(e) => set('pmo', e.target.value)} /></Field>
              <Field label={t('proj_budget')}><input className="input" type="number" inputMode="numeric" value={form.budget ?? ''} onChange={(e) => set('budget', e.target.value === '' ? null : Number(e.target.value))} /></Field>
              <Field label={t('proj_start')}><input className="input" type="date" value={form.start_date ?? ''} onChange={(e) => set('start_date', e.target.value)} /></Field>
              <Field label={t('proj_end')}><input className="input" type="date" value={form.end_date ?? ''} onChange={(e) => set('end_date', e.target.value)} /></Field>
              <Field label={t('company_priority')}>
                <select className="input" value={form.priority ?? 0} onChange={(e) => set('priority', Number(e.target.value))}>
                  {LEVELS.map((v) => <option key={v} value={v}>{t(levelKey(v))}</option>)}
                </select>
              </Field>
            </div>
            <Field label={t('proj_notes')}>
              <textarea className="input" value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
            </Field>
            <Field label={`${t('assign_staff')} (${t('optional')})`}>
              <div className="staff-pick">
                {allStaff.length === 0 && <span className="count mono">—</span>}
                {allStaff.map((u) => (
                  <label key={u.email} className={`staff-chip ${staffEmails.includes(u.email) ? 'on' : ''}`}>
                    <input type="checkbox" checked={staffEmails.includes(u.email)} onChange={() => toggleStaff(u.email)} hidden />
                    {u.name} {!u.registered && <span style={{ opacity: .6, fontSize: 11 }}>⧖</span>}
                  </label>
                ))}
              </div>
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: 'var(--ink-3)' }}>
              <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} /> {t('active')}
            </label>
            {err && <p className="alert">⚠ {err}</p>}
          </div>
          <div className="form-actions">
            <Button variant="ghost" onClick={onClose} disabled={busy}>{t('cancel')}</Button>
            <Button variant="primary" onClick={save} disabled={busy}>{busy ? <><span className="spin" /> {t('saving')}</> : t('save')}</Button>
          </div>
        </motion.div>
      </motion.div>
    )
  }
}
