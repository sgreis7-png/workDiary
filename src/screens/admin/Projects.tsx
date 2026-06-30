import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Tag, Field, stagger, riseIn } from '../../components/ui'
import { useI18n } from '../../i18n'
import { createProject, setProjectActive, updateProject } from '../../api'
import { useStore } from '../../store'
import { useAuth } from '../../auth'
import type { Project, ProjectInput } from '../../data'

const empty: ProjectInput = {
  name: '', active: true, location: '', budget: null, pmo: '',
  start_date: '', end_date: '', staff: '', notes: '', priority: 0,
}

export default function Projects() {
  const { t } = useI18n()
  const { isAdmin } = useAuth()
  const { projects, myPriorities, setUserPriority, reloadProjects } = useStore()
  const [editing, setEditing] = useState<Project | 'new' | null>(null)

  const toggle = async (id: string, active: boolean) => { await setProjectActive(id, !active); await reloadProjects() }
  const bump = (id: string, delta: number) => setUserPriority(id, (myPriorities[id] ?? 0) + delta)

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
          <motion.div key={p.id} variants={riseIn} className="panel" style={{ padding: 20, opacity: p.active ? 1 : 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              {/* personal priority — every user */}
              <div className="prio" title={t('my_priority')}>
                <button onClick={() => bump(p.id, 1)} aria-label="up">▲</button>
                <span className="prio__n">{myPriorities[p.id] ?? 0}</span>
                <button onClick={() => bump(p.id, -1)} aria-label="down">▼</button>
              </div>
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
              {(p.priority ?? 0) > 0 && <Tag tone="amber">★ {t('company_priority')}: {p.priority}</Tag>}
              {p.location && <Tag tone="muted">📍 {p.location}</Tag>}
              {p.pmo && <Tag tone="muted">👤 {p.pmo}</Tag>}
              {p.budget != null && <Tag tone="muted">₪ {Number(p.budget).toLocaleString()}</Tag>}
              {(p.start_date || p.end_date) && <Tag tone="muted">🗓 {p.start_date || '…'} → {p.end_date || '…'}</Tag>}
              {p.staff && <Tag tone="muted">👥 {p.staff}</Tag>}
            </div>
            {p.notes && <p style={{ marginTop: 10, color: 'var(--ink-2)', fontSize: 14 }}>{p.notes}</p>}
          </motion.div>
        ))}
      </motion.div>

      <AnimatePresence>
        {editing && isAdmin && (
          <ProjectForm
            initial={editing === 'new' ? empty : editing}
            isNew={editing === 'new'}
            onClose={() => setEditing(null)}
            onSaved={async () => { await reloadProjects(); setEditing(null) }}
          />
        )}
      </AnimatePresence>
    </div>
  )

  function ProjectForm({ initial, isNew, onClose, onSaved }: {
    initial: ProjectInput; isNew: boolean; onClose: () => void; onSaved: () => void
  }) {
    const [form, setForm] = useState<ProjectInput>({ ...initial })
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState('')
    const set = (k: keyof ProjectInput, v: string | boolean | number | null) => setForm((f) => ({ ...f, [k]: v }))

    const save = async () => {
      if (!form.name.trim()) { setErr(t('project_name')); return }
      setBusy(true); setErr('')
      try {
        if (isNew) await createProject(form)
        else await updateProject((initial as Project).id, form)
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
              <Field label={t('proj_staff')}><input className="input" value={form.staff ?? ''} onChange={(e) => set('staff', e.target.value)} /></Field>
              <Field label={t('proj_start')}><input className="input" type="date" value={form.start_date ?? ''} onChange={(e) => set('start_date', e.target.value)} /></Field>
              <Field label={t('proj_end')}><input className="input" type="date" value={form.end_date ?? ''} onChange={(e) => set('end_date', e.target.value)} /></Field>
              <Field label={t('company_priority')}><input className="input" type="number" inputMode="numeric" value={form.priority ?? 0} onChange={(e) => set('priority', e.target.value === '' ? 0 : Number(e.target.value))} /></Field>
            </div>
            <Field label={t('proj_notes')}>
              <textarea className="input" value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
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
