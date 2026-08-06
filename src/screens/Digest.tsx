import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Tag, stagger, riseIn } from '../components/ui'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { listEntries } from '../api'
import { fetchDefectsForSearch, type DefectSearchRow } from '../defects/api'
import { useStore } from '../store'
import { parseCoops } from '../lib/reportTables'
import { SAFETY_INCIDENT_KEY } from '../data'
import type { Entry } from '../data'

/**
 * Weekly digest — one card per active project answering "what happened here
 * this week": entries and who wrote them, per-coop progress delta, defect
 * movement, safety incidents, and silence (no reports at all).
 * Computed client-side from data RLS already scopes; nothing new is stored.
 */
const WEEK_MS = 7 * 864e5
const dayKey = (d: Date) => d.toISOString().slice(0, 10)

interface ProjectDigest {
  projectId: string
  entries: Entry[]
  authors: string[]
  progress: { coop: string; from: number | null; to: number }[]
  incidents: { date: string; text: string }[]
  openDefects: number
  overdue: number
  closedThisWeek: number
}

export default function Digest() {
  const { t } = useI18n()
  const nav = useNavigate()
  const { projects, projectName, userName } = useStore()
  const [data, setData] = useState<{ digests: ProjectDigest[]; silent: string[] } | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    const now = Date.now()
    const weekAgo = dayKey(new Date(now - WEEK_MS))
    const twoWeeksAgo = dayKey(new Date(now - 2 * WEEK_MS))
    const today = dayKey(new Date())
    Promise.all([
      // two weeks: this week's activity + last week's progress baseline
      listEntries(undefined, { from: twoWeeksAgo }),
      fetchDefectsForSearch().catch(() => [] as DefectSearchRow[]),
    ]).then(([entries, defects]) => {
      if (!alive) return
      const active = projects.filter((p) => p.active)
      const digests: ProjectDigest[] = []
      const silent: string[] = []
      for (const p of active) {
        const mine = entries.filter((e) => e.project_id === p.id)
        const thisWeek = mine.filter((e) => e.work_date >= weekAgo)
        if (!thisWeek.length) { silent.push(p.name); continue }

        // per coop: latest pct this week vs latest pct before the week started
        const latest = new Map<string, number>()
        const baseline = new Map<string, number>()
        for (const e of [...mine].sort((a, b) => a.work_date.localeCompare(b.work_date))) {
          for (const c of parseCoops(e.values, 'he')) {
            if (e.work_date < weekAgo) baseline.set(c.name, c.pct)
            else latest.set(c.name, c.pct)
          }
        }
        const progress = [...latest.entries()]
          .map(([coop, to]) => ({ coop, to, from: baseline.get(coop) ?? null }))
          .sort((a, b) => a.coop.localeCompare(b.coop, 'he', { numeric: true }))

        const incidents = thisWeek
          .filter((e) => (e.values[SAFETY_INCIDENT_KEY] ?? '').trim())
          .map((e) => ({ date: e.work_date, text: e.values[SAFETY_INCIDENT_KEY] }))

        const pd = defects.filter((d) => d.project_id === p.id)
        digests.push({
          projectId: p.id,
          entries: thisWeek,
          authors: [...new Set(thisWeek.map((e) => e.created_by))],
          progress, incidents,
          openDefects: pd.filter((d) => d.status === 'open').length,
          overdue: pd.filter((d) => d.status === 'open' && d.due_date && d.due_date < today).length,
          closedThisWeek: pd.filter((d) => d.status === 'closed' && (d.closed_on ?? '') >= weekAgo).length,
        })
      }
      setData({ digests, silent })
    }).catch((e) => { if (alive) setErr(String((e as Error).message ?? e)) })
    return () => { alive = false }
  }, [projects])

  if (err) return <div className="page"><div className="alert">{err}</div></div>
  if (!data) return <Loader full />

  const range = `${new Date(Date.now() - WEEK_MS).toLocaleDateString('he-IL')} – ${new Date().toLocaleDateString('he-IL')}`

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{range}</div>
          <h1 className="page-title">📊 {t('digest_title')}</h1>
        </div>
      </div>

      {data.silent.length > 0 && (
        <div className="panel" style={{ padding: 18, marginBottom: 16 }}>
          <b style={{ color: 'var(--clay)' }}>⚠ {t('digest_silent')}:</b>{' '}
          {data.silent.join(' · ')}
        </div>
      )}

      {data.digests.length === 0 && <div className="empty"><div className="big">{t('digest_empty')}</div></div>}

      <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'grid', gap: 14 }}>
        {data.digests.map((d) => (
          <motion.div key={d.projectId} variants={riseIn} className="panel" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ margin: 0 }}>{projectName(d.projectId)}</h3>
              <small style={{ color: 'var(--ink-3)' }}>
                {d.entries.length} {t('digest_entries')} · {d.authors.map(userName).join(', ')}
              </small>
            </div>

            {d.progress.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {d.progress.map((pr) => {
                  const delta = pr.from !== null ? pr.to - pr.from : null
                  return (
                    <span key={pr.coop} className="tag tag--muted" style={{ fontSize: 13 }}>
                      {pr.coop}: <b style={{ marginInline: 4 }}>{pr.to}%</b>
                      {delta !== null && delta !== 0 && (
                        <span style={{ color: delta > 0 ? 'var(--green)' : 'var(--clay)' }}>
                          {delta > 0 ? `▲${delta}` : `▼${-delta}`}
                        </span>
                      )}
                      {delta === 0 && <span style={{ color: 'var(--ink-faint)' }}>{t('digest_flat')}</span>}
                    </span>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {d.openDefects > 0 && (
                <Tag tone={d.overdue ? 'clay' : 'amber'}>
                  🛠 {d.openDefects} {t('digest_open_defects')}{d.overdue ? ` · ${d.overdue} ${t('digest_overdue')}` : ''}
                </Tag>
              )}
              {d.closedThisWeek > 0 && <Tag tone="green">✓ {d.closedThisWeek} {t('digest_closed')}</Tag>}
              {d.incidents.length > 0 && (
                <Tag tone="clay">⚠ {d.incidents.length} {t('digest_incidents')}</Tag>
              )}
            </div>

            {d.incidents.map((inc, i) => (
              <div key={i} className="alert" style={{ marginTop: 10 }}>
                ⚠ {new Date(inc.date).toLocaleDateString('he-IL')} — {inc.text}
              </div>
            ))}

            <div style={{ marginTop: 12 }}>
              <button className="btn btn--quiet" onClick={() => nav(`/?p=${d.projectId}`)}>{t('digest_open_log')} ←</button>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
