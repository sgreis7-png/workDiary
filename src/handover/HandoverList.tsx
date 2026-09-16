import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button, Tag, Field, stagger } from '../components/ui'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { useStore } from '../store'
import { usePerms } from '../lib/usePerms'
import { listHandovers } from './api'
import { handoverMatchesText, type HandoverRec } from './model'
import { ht } from './i18n'

export function HandoverList() {
  const { lang } = useI18n()
  const nav = useNavigate()
  const { projects, projectName } = useStore()
  const { canEdit } = usePerms()

  const [projectId, setProjectId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [text, setText] = useState('')
  const [forms, setForms] = useState<HandoverRec[] | null>(null)

  useEffect(() => {
    let alive = true
    // server-side filters — refetched whenever project/date range changes
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForms(null)
    listHandovers({ projectId: projectId || undefined, from: from || undefined, to: to || undefined })
      .then((r) => { if (alive) setForms(r) })
      .catch(() => { if (alive) setForms([]) })
    return () => { alive = false }
  }, [projectId, from, to])

  const shown = useMemo(
    () => (forms ?? []).filter((f) => handoverMatchesText(f, text)),
    [forms, text],
  )

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">Agrotop</div>
          <h1 className="page-title">{ht(lang, 'list_title')}</h1>
        </div>
        {canEdit('handover') && (
          <Button variant="primary" onClick={() => nav('/handover/new')}>{ht(lang, 'list_new')}</Button>
        )}
      </div>

      <div className="form-grid" style={{ marginBottom: 18 }}>
        <Field label={ht(lang, 'form_project')}>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{ht(lang, 'list_all_projects')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label={ht(lang, 'list_from')}>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={ht(lang, 'list_to')}>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label={ht(lang, 'list_search')}>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      </div>

      {forms === null ? <Loader /> : shown.length === 0 ? (
        <div className="empty"><div className="big">{ht(lang, 'list_empty')}</div></div>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show">
          {shown.map((f) => {
            const bad = (f.systems ?? []).filter((s) => s.status === 'bad').length
            return (
              <div key={f.id} className="row-item" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
                onClick={() => nav(`/handover/${f.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter') nav(`/handover/${f.id}`) }}>
                <div>
                  <strong>{projectName(f.project_id)}</strong>
                  <div className="muted">{f.client_name} · {f.site_location}</div>
                </div>
                <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  {bad > 0 && <Tag tone="clay">{bad} {ht(lang, 'list_bad')}</Tag>}
                  <span dir="ltr" className="muted">{f.handover_date}</span>
                </div>
              </div>
            )
          })}
        </motion.div>
      )}
    </div>
  )
}
