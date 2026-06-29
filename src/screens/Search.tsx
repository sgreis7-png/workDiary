import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button, Tag, WeatherChip, Field, stagger, riseIn } from '../components/ui'
import { useI18n } from '../i18n'
import { searchEntries } from '../api'
import { useStore } from '../store'
import type { Entry } from '../data'

export default function Search() {
  const { t } = useI18n()
  const nav = useNavigate()
  const { projects, projectName } = useStore()
  const [projectId, setProjectId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [text, setText] = useState('')
  const [results, setResults] = useState<Entry[] | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    try {
      setResults(await searchEntries({ projectId: projectId || undefined, from: from || undefined, to: to || undefined, text: text || undefined }))
    } finally { setBusy(false) }
  }

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">Query</div>
          <h1 className="page-title">{t('nav_search')}</h1>
        </div>
        {results && <span className="count mono">{results.length} {t('results_n')}</span>}
      </div>

      <div className="search-bar">
        <Field label={t('free_text')}>
          <input className="input" placeholder="…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} />
        </Field>
        <Field label={t('project')}>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{t('all_projects')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label={t('from_date')}><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Button variant="primary" onClick={run} disabled={busy}>{busy ? <><span className="spin" /> {t('search')}</> : <>⌕ {t('search')}</>}</Button>
      </div>

      {results && (
        <motion.div className="panel" variants={stagger} initial="hidden" animate="show">
          <div className="row-list">
            {results.length === 0 && <div className="empty"><div className="big">{t('no_entries')}</div></div>}
            {results.map((e) => (
              <motion.div key={e.id} variants={riseIn} className="row-item" style={{ cursor: 'pointer' }} onClick={() => nav(`/entry/${e.id}`)}>
                <span className="mono" style={{ color: 'var(--ink-3)' }}>{e.work_date}</span>
                <div className="grow">
                  <b>{projectName(e.project_id)}</b> <small>· {e.values.site_location}</small>
                  <div style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 2 }}>{e.values.daily_content}</div>
                </div>
                <WeatherChip value={e.values.weather} />
                {e.last_sent_at && <Tag tone="green">✓</Tag>}
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}
