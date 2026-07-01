import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Tag, Field, stagger, riseIn } from '../components/ui'
import { useI18n } from '../i18n'
import { searchEntries } from '../api'
import { useStore } from '../store'
import {
  MALFUNCTION_DEPTS, MALFUNCTION_DEPT_KEY, MALFUNCTION_TEXT_KEY,
  deptIdOf, deptLabel,
} from '../data'
import type { Entry } from '../data'

export default function Malfunctions() {
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const { projects, projectName, projectColor } = useStore()
  const [projectId, setProjectId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setBusy(true)
    let alive = true
    const h = setTimeout(() => {
      searchEntries({ projectId: projectId || undefined, from: from || undefined, to: to || undefined, malfunction: 'any' })
        .then((r) => { if (alive) setEntries(r) })
        .catch(() => { if (alive) setEntries([]) })
        .finally(() => { if (alive) setBusy(false) })
    }, 300)
    return () => { alive = false; clearTimeout(h) }
  }, [projectId, from, to])

  const stats = useMemo(() => {
    const list = entries ?? []
    const byDept: Record<string, number> = {}
    const byProject: Record<string, number> = {}
    const byDate: Record<string, number> = {}
    for (const e of list) {
      byDept[deptIdOf(e.values[MALFUNCTION_DEPT_KEY])] = (byDept[deptIdOf(e.values[MALFUNCTION_DEPT_KEY])] ?? 0) + 1
      byProject[e.project_id] = (byProject[e.project_id] ?? 0) + 1
      const day = e.work_date || '—'
      byDate[day] = (byDate[day] ?? 0) + 1
    }
    const depts = MALFUNCTION_DEPTS.filter((d) => d.id !== 'none')
      .map((d) => [d.id, byDept[d.id] ?? 0] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
    const projs = Object.entries(byProject).sort((a, b) => b[1] - a[1])
    const dates = Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0]))
    return {
      total: list.length, depts, projs, dates,
      maxDept: Math.max(1, ...depts.map(([, n]) => n)),
      maxProj: Math.max(1, ...projs.map(([, n]) => n)),
      maxDate: Math.max(1, ...dates.map(([, n]) => n)),
    }
  }, [entries])

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{t('app_sub')}</div>
          <h1 className="page-title">{t('nav_malfunctions')}</h1>
        </div>
        {busy ? <span className="count mono"><span className="spin" /></span>
          : <span className="count mono">{stats.total} {t('malf_count')}</span>}
      </div>

      <div className="search-bar">
        <Field label={t('project')}>
          <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{t('all_projects')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label={t('from_date')}><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t('to_date')}><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>

      <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'grid', gap: 16, marginTop: 16 }}>
        <motion.div variants={riseIn} className="stat-grid">
          <div className="panel stat"><div className="stat__value">{stats.total}</div><div className="stat__label">{t('malf_total')}</div></div>
        </motion.div>

        {/* by department */}
        <motion.div variants={riseIn} className="panel" style={{ padding: 22 }}>
          <h3 style={{ marginBottom: 14 }}>{t('malf_by_dept')}</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {stats.depts.length === 0 && <span className="count mono">—</span>}
            {stats.depts.map(([id, n]) => (
              <div key={id} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 40px', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 14 }}>{deptLabel(id, lang)}</span>
                <div style={{ background: 'var(--paper-2)', borderRadius: 6, height: 14 }}>
                  <div style={{ width: `${(n / stats.maxDept) * 100}%`, background: 'var(--clay)', height: '100%', borderRadius: 6 }} />
                </div>
                <span className="count mono" style={{ textAlign: 'end' }}>{n}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* by project */}
        <motion.div variants={riseIn} className="panel" style={{ padding: 22 }}>
          <h3 style={{ marginBottom: 14 }}>{t('malf_by_project')}</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {stats.projs.length === 0 && <span className="count mono">—</span>}
            {stats.projs.map(([pid, n]) => (
              <div key={pid} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 40px', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectName(pid)}</span>
                <div style={{ background: 'var(--paper-2)', borderRadius: 6, height: 14 }}>
                  <div style={{ width: `${(n / stats.maxProj) * 100}%`, background: projectColor(pid), height: '100%', borderRadius: 6 }} />
                </div>
                <span className="count mono" style={{ textAlign: 'end' }}>{n}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* over time */}
        <motion.div variants={riseIn} className="panel" style={{ padding: 22 }}>
          <h3 style={{ marginBottom: 14 }}>{t('malf_over_time')}</h3>
          {stats.dates.length === 0 ? <span className="count mono">—</span> : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, overflowX: 'auto' }}>
              {stats.dates.map(([day, n]) => (
                <div key={day} title={`${day} · ${n}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 26 }}>
                  <div style={{ width: 18, height: `${(n / stats.maxDate) * 90}px`, background: 'var(--clay)', borderRadius: 4 }} />
                  <span className="mono" style={{ fontSize: 9, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{day.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* list */}
        <motion.div variants={riseIn} className="panel">
          <div className="row-list">
            {(entries ?? []).length === 0 && <div className="empty"><div className="big">{t('no_entries')}</div></div>}
            {(entries ?? []).map((e) => (
              <div key={e.id} className="row-item" style={{ cursor: 'pointer' }} onClick={() => nav(`/entry/${e.id}`)}>
                <span className="mono" style={{ color: 'var(--ink-3)' }}>{e.work_date}</span>
                <div className="grow">
                  <b>{projectName(e.project_id)}</b>{' '}
                  <Tag tone="clay">{deptLabel(deptIdOf(e.values[MALFUNCTION_DEPT_KEY]), lang)}</Tag>
                  <div style={{ color: 'var(--ink-2)', fontSize: 14, marginTop: 2 }}>{e.values[MALFUNCTION_TEXT_KEY]}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
