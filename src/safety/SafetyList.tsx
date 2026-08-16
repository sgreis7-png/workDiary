import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button, Tag, Field, stagger } from '../components/ui'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { useStore } from '../store'
import { usePerms } from '../lib/usePerms'
import { listSafetyForms } from './api'
import { formMatchesWorker, type SafetyFormRec } from './model'
import { st } from './i18n'

export function SafetyList() {
  const { lang } = useI18n()
  const nav = useNavigate()
  const { projects, projectName, projectColor } = useStore()
  const { canEdit } = usePerms()

  const [projectId, setProjectId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [worker, setWorker] = useState('')
  const [forms, setForms] = useState<SafetyFormRec[] | null>(null)

  // server-side filters — refetched whenever project/date range changes
  useEffect(() => {
    let alive = true
    setForms(null)
    listSafetyForms({ projectId: projectId || undefined, from: from || undefined, to: to || undefined })
      .then((r) => { if (alive) setForms(r) })
      .catch(() => { if (alive) setForms([]) })
    return () => { alive = false }
  }, [projectId, from, to])

  // worker name/id — client-side, on top of the already-fetched page
  const shown = useMemo(
    () => (forms ?? []).filter((f) => formMatchesWorker(f, worker)),
    [forms, worker],
  )

  // grouped by project when browsing all of them; a single selected project needs no header
  const groups = useMemo(() => {
    if (projectId) return null
    const sorted = [...shown].sort((a, b) => projectName(a.project_id).localeCompare(projectName(b.project_id), 'he'))
    const out: { id: string; forms: SafetyFormRec[] }[] = []
    for (const f of sorted) {
      const last = out[out.length - 1]
      if (last && last.id === f.project_id) last.forms.push(f)
      else out.push({ id: f.project_id, forms: [f] })
    }
    return out
  }, [shown, projectId, projectName])

  const card = (f: SafetyFormRec) => {
    const total = f.workers?.length ?? 0
    const signed = (f.workers ?? []).filter((w) => w.signed_at != null).length
    return (
      <div
        key={f.id} className="row-item" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
        onClick={() => nav(`/safety/${f.id}`)}
        onKeyDown={(e) => { if (e.key === 'Enter') nav(`/safety/${f.id}`) }}
      >
        <span className="mono" style={{ color: 'var(--ink-3)', minWidth: 90 }}>{f.training_date}</span>
        <span className="coop-card__dot" style={{ background: projectColor(f.project_id) }} />
        <div className="grow">
          <b>{projectName(f.project_id)}</b>
          {f.instructor_name && <small style={{ marginInlineStart: 10 }}>{f.instructor_name}</small>}
        </div>
        <Tag tone="muted">{signed}/{total} {st(lang, 'list_signed')}</Tag>
      </div>
    )
  }

  if (forms === null) return <Loader full />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">Agrotop</div>
          <h1 className="page-title">{st(lang, 'list_title')}</h1>
        </div>
        {canEdit('safety') && (
          <Button variant="primary" onClick={() => nav('/safety/new')}>{st(lang, 'list_new')}</Button>
        )}
      </div>

      <div className="search-bar">
        <Field label={lang === 'he' ? 'פרויקט' : 'Project'}>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{st(lang, 'list_all_projects')}</option>
            {projects.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label={st(lang, 'list_from')}><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={st(lang, 'list_to')}><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label={st(lang, 'list_worker')}>
          <input className="input" value={worker} onChange={(e) => setWorker(e.target.value)} />
        </Field>
      </div>

      {shown.length === 0 ? (
        <div className="empty"><div className="big">{st(lang, 'list_empty')}</div></div>
      ) : groups ? (
        <div style={{ display: 'grid', gap: 14 }}>
          {groups.map(({ id, forms: fs }) => (
            <div key={id} className="panel" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="coop-group__head">
                <span className="coop-card__dot" style={{ background: projectColor(id) }} />
                <b>{projectName(id) || '—'}</b>
                <span className="count mono">{fs.length}</span>
              </div>
              <div className="row-list">{fs.map(card)}</div>
            </div>
          ))}
        </div>
      ) : (
        <motion.div className="panel" variants={stagger} initial="hidden" animate="show">
          <div className="row-list">{shown.map(card)}</div>
        </motion.div>
      )}
    </div>
  )
}
