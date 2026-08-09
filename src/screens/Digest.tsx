import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePerms } from '../lib/usePerms'
import { motion } from 'framer-motion'
import { Tag, stagger, riseIn } from '../components/ui'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { listEntries } from '../api'
import { fetchDefectsForSearch, type DefectSearchRow } from '../defects/api'
import { fetchTasks, type WorkTask } from '../lib/tasks'
import { useStore } from '../store'
import { parseCoops } from '../lib/reportTables'
import { SAFETY_INCIDENT_KEY, SAFETY_TRAINING_KEY, hasMalfunction } from '../data'
import type { Entry } from '../data'

/**
 * Weekly digest — a manager's Sunday read. Headline totals for the company,
 * then one card per active project: work done, per-coop progress with deltas,
 * defect movement, tasks, safety — and rule-based insights that call out what
 * needs attention (stuck coops, aging defects, silent projects, malfunction
 * spikes). Computed client-side from RLS-scoped data; nothing new is stored.
 */
const WEEK_MS = 7 * 864e5
const dayKey = (d: Date) => d.toISOString().slice(0, 10)

interface CoopProgress { coop: string; from: number | null; to: number }
interface Insight { tone: 'clay' | 'amber' | 'green'; text: string }

interface ProjectDigest {
  projectId: string
  entries: Entry[]
  authors: Map<string, number>
  photos: number
  malfThisWeek: number
  progress: CoopProgress[]
  incidents: { date: string; text: string }[]
  trainingNo: number
  openDefects: number
  overdue: number
  oldestOverdueDays: number
  openedThisWeek: number
  closedThisWeek: number
  openTasks: number
  overdueTasks: number
  insights: Insight[]
}

interface Totals {
  entries: number; workers: number; photos: number
  incidents: number; defectsOpened: number; defectsClosed: number; overdue: number
}

export default function Digest() {
  const { t } = useI18n()
  const { can } = usePerms()
  const nav = useNavigate()
  const { projects, projectName, userName } = useStore()
  const [data, setData] = useState<{ digests: ProjectDigest[]; silent: { name: string; days: number | null }[]; totals: Totals } | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    const now = Date.now()
    const weekAgo = dayKey(new Date(now - WEEK_MS))
    const twoWeeksAgo = dayKey(new Date(now - 2 * WEEK_MS))
    const today = dayKey(new Date())
    Promise.all([
      listEntries(undefined, { from: twoWeeksAgo }),
      fetchDefectsForSearch().catch(() => [] as DefectSearchRow[]),
      fetchTasks().catch(() => [] as WorkTask[]),
    ]).then(([entries, defects, tasks]) => {
      if (!alive) return
      const active = projects.filter((p) => p.active)
      const digests: ProjectDigest[] = []
      const silent: { name: string; days: number | null }[] = []

      for (const p of active) {
        const mine = entries.filter((e) => e.project_id === p.id)
        const thisWeek = mine.filter((e) => e.work_date >= weekAgo)
        if (!thisWeek.length) {
          const last = mine.map((e) => e.work_date).sort().pop()
          silent.push({ name: p.name, days: last ? Math.round((now - +new Date(last)) / 864e5) : null })
          continue
        }

        // progress: latest pct this week vs latest before the week
        const latest = new Map<string, number>()
        const baseline = new Map<string, number>()
        for (const e of [...mine].sort((a, b) => a.work_date.localeCompare(b.work_date))) {
          for (const c of parseCoops(e.values, 'he')) {
            if (e.work_date < weekAgo) baseline.set(c.name, c.pct)
            else latest.set(c.name, c.pct)
          }
        }
        const progress: CoopProgress[] = [...latest.entries()]
          .map(([coop, to]) => ({ coop, to, from: baseline.get(coop) ?? null }))
          .sort((a, b) => a.coop.localeCompare(b.coop, 'he', { numeric: true }))

        const authors = new Map<string, number>()
        for (const e of thisWeek) authors.set(e.created_by, (authors.get(e.created_by) ?? 0) + 1)

        const incidents = thisWeek
          .filter((e) => (e.values[SAFETY_INCIDENT_KEY] ?? '').trim())
          .map((e) => ({ date: e.work_date, text: e.values[SAFETY_INCIDENT_KEY] }))
        const trainingNo = thisWeek.filter((e) => (e.values[SAFETY_TRAINING_KEY] ?? '').trim() === 'לא').length

        const pd = defects.filter((d) => d.project_id === p.id)
        const overdueList = pd.filter((d) => d.status === 'open' && d.due_date && d.due_date < today)
        const oldestOverdueDays = overdueList.length
          ? Math.max(...overdueList.map((d) => Math.round((now - +new Date(d.due_date!)) / 864e5)))
          : 0

        const pt = tasks.filter((x) => x.project_id === p.id)

        const d: ProjectDigest = {
          projectId: p.id,
          entries: thisWeek,
          authors,
          photos: thisWeek.reduce((n, e) => n + e.photos.length, 0),
          malfThisWeek: thisWeek.filter((e) => hasMalfunction(e.values)).length,
          progress, incidents, trainingNo,
          openDefects: pd.filter((d) => d.status === 'open').length,
          overdue: overdueList.length,
          oldestOverdueDays,
          openedThisWeek: pd.filter((d) => (d.created_at ?? '').slice(0, 10) >= weekAgo).length,
          closedThisWeek: pd.filter((d) => d.status === 'closed' && (d.closed_on ?? '') >= weekAgo).length,
          openTasks: pt.filter((x) => x.status === 'open').length,
          overdueTasks: pt.filter((x) => x.status === 'open' && x.due_date && x.due_date < today).length,
          insights: [],
        }

        // ---- rule-based insights, most severe first ----
        const ins: Insight[] = []
        for (const inc of incidents) ins.push({ tone: 'clay', text: `${t('ins_incident')} (${new Date(inc.date).toLocaleDateString('he-IL')}): ${inc.text}` })
        if (trainingNo > 0) ins.push({ tone: 'clay', text: `${t('ins_training_no')} ×${trainingNo}` })
        if (d.oldestOverdueDays > 3) ins.push({ tone: 'clay', text: `${t('ins_oldest_overdue')} ${d.oldestOverdueDays} ${t('days')}` })
        const stuck = progress.filter((pr) => pr.from !== null && pr.to - pr.from! === 0 && pr.to < 100)
        if (stuck.length) ins.push({ tone: 'amber', text: `${t('ins_stuck')}: ${stuck.map((s) => `${s.coop} (${s.to}%)`).join(', ')}` })
        if (d.malfThisWeek >= 2) ins.push({ tone: 'amber', text: `${d.malfThisWeek} ${t('ins_malfs')}` })
        if (d.openedThisWeek > d.closedThisWeek && d.openedThisWeek >= 2) {
          ins.push({ tone: 'amber', text: `${t('ins_defect_growth')}: +${d.openedThisWeek} / −${d.closedThisWeek}` })
        }
        const mover = progress.filter((pr) => pr.from !== null).sort((a, b) => (b.to - b.from!) - (a.to - a.from!))[0]
        if (mover && mover.to - mover.from! >= 10) ins.push({ tone: 'green', text: `${t('ins_mover')}: ${mover.coop} ▲${mover.to - mover.from!}%` })
        if (d.closedThisWeek >= 3) ins.push({ tone: 'green', text: `${d.closedThisWeek} ${t('ins_closed_many')}` })
        d.insights = ins

        digests.push(d)
      }

      const totals: Totals = {
        entries: digests.reduce((n, d) => n + d.entries.length, 0),
        workers: new Set(digests.flatMap((d) => [...d.authors.keys()])).size,
        photos: digests.reduce((n, d) => n + d.photos, 0),
        incidents: digests.reduce((n, d) => n + d.incidents.length, 0),
        defectsOpened: digests.reduce((n, d) => n + d.openedThisWeek, 0),
        defectsClosed: digests.reduce((n, d) => n + d.closedThisWeek, 0),
        overdue: digests.reduce((n, d) => n + d.overdue, 0),
      }

      // most activity first
      digests.sort((a, b) => b.entries.length - a.entries.length)
      setData({ digests, silent, totals })
    }).catch((e) => { if (alive) setErr(String((e as Error).message ?? e)) })
    return () => { alive = false }
  }, [projects])

  if (err) return <div className="page"><div className="alert">{err}</div></div>
  if (!data) return <Loader full />

  const { totals } = data
  const range = `${new Date(Date.now() - WEEK_MS).toLocaleDateString('he-IL')} – ${new Date().toLocaleDateString('he-IL')}`
  const delta = (pr: CoopProgress) => (pr.from !== null ? pr.to - pr.from : null)

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{range}</div>
          <h1 className="page-title">📊 {t('digest_title')}</h1>
        </div>
      </div>

      {/* headline totals */}
      <motion.div className="stat-grid" variants={stagger} initial="hidden" animate="show" style={{ marginBottom: 18 }}>
        <motion.div variants={riseIn} className="panel stat"><div className="stat__value">{totals.entries}</div><div className="stat__label">{t('digest_entries')}</div></motion.div>
        <motion.div variants={riseIn} className="panel stat"><div className="stat__value">{totals.workers}</div><div className="stat__label">{t('digest_workers')}</div></motion.div>
        <motion.div variants={riseIn} className="panel stat"><div className="stat__value">{totals.photos}</div><div className="stat__label">{t('dash_photos')}</div></motion.div>
        <motion.div variants={riseIn} className="panel stat"><div className="stat__value" style={{ color: totals.incidents ? 'var(--clay)' : undefined }}>{totals.incidents}</div><div className="stat__label">{t('digest_incidents')}</div></motion.div>
        <motion.div variants={riseIn} className="panel stat"><div className="stat__value">+{totals.defectsOpened} / −{totals.defectsClosed}</div><div className="stat__label">{t('digest_defect_moves')}</div></motion.div>
        <motion.div variants={riseIn} className="panel stat"><div className="stat__value" style={{ color: totals.overdue ? 'var(--clay)' : undefined }}>{totals.overdue}</div><div className="stat__label">{t('digest_overdue_defects')}</div></motion.div>
      </motion.div>

      {data.silent.length > 0 && (
        <div className="panel" style={{ padding: 18, marginBottom: 16 }}>
          <b style={{ color: 'var(--clay)' }}>⚠ {t('digest_silent')}:</b>{' '}
          {data.silent.map((s, i) => (
            <span key={s.name}>
              {i > 0 && ' · '}
              {s.name}{s.days !== null && <small style={{ color: 'var(--ink-3)' }}> ({s.days} {t('days')})</small>}
            </span>
          ))}
        </div>
      )}

      {data.digests.length === 0 && <div className="empty"><div className="big">{t('digest_empty')}</div></div>}

      <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'grid', gap: 14 }}>
        {data.digests.map((d) => (
          <motion.div key={d.projectId} variants={riseIn} className="panel" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
              <h3 style={{ margin: 0 }}>{projectName(d.projectId)}</h3>
              <small style={{ color: 'var(--ink-3)' }}>
                {d.entries.length} {t('digest_entries')} · {d.photos} {t('photos_n')}
                {d.malfThisWeek > 0 && <> · {d.malfThisWeek} {t('malf_count')}</>}
              </small>
            </div>

            {/* who worked */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {[...d.authors.entries()].sort((a, b) => b[1] - a[1]).map(([uid, n]) => (
                <span key={uid} className="tag tag--ink" style={{ fontSize: 12.5 }}>👤 {userName(uid)} · {n}</span>
              ))}
            </div>

            {/* progress with deltas */}
            {d.progress.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {d.progress.map((pr) => {
                  const dl = delta(pr)
                  return (
                    <span key={pr.coop} className="tag tag--muted" style={{ fontSize: 13 }}>
                      {pr.coop}: <b style={{ marginInline: 4 }}>{pr.to}%</b>
                      {dl !== null && dl !== 0 && (
                        <span style={{ color: dl > 0 ? 'var(--green)' : 'var(--clay)' }}>{dl > 0 ? `▲${dl}` : `▼${-dl}`}</span>
                      )}
                      {dl === 0 && <span style={{ color: 'var(--ink-faint)' }}>{t('digest_flat')}</span>}
                    </span>
                  )
                })}
              </div>
            )}

            {/* defect + task movement */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {(d.openedThisWeek > 0 || d.closedThisWeek > 0) && (
                <Tag tone="muted">🛠 {t('digest_defects')}: +{d.openedThisWeek} / −{d.closedThisWeek}</Tag>
              )}
              {d.openDefects > 0 && (
                <Tag tone={d.overdue ? 'clay' : 'amber'}>
                  {d.openDefects} {t('digest_open_defects')}{d.overdue ? ` · ${d.overdue} ${t('digest_overdue')}` : ''}
                </Tag>
              )}
              {d.openTasks > 0 && (
                <Tag tone={d.overdueTasks ? 'clay' : 'muted'}>
                  ☑ {d.openTasks} {t('digest_tasks')}{d.overdueTasks ? ` · ${d.overdueTasks} ${t('digest_overdue')}` : ''}
                </Tag>
              )}
            </div>

            {/* insights */}
            {d.insights.length > 0 && (
              <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
                <span className="field__label">{t('digest_insights')}</span>
                {d.insights.map((ins, i) => (
                  <div key={i} style={{
                    padding: '8px 12px', borderRadius: 10, fontSize: 13.5,
                    background: ins.tone === 'clay' ? 'color-mix(in srgb, var(--clay) 12%, transparent)'
                      : ins.tone === 'amber' ? 'color-mix(in srgb, #d8a01a 12%, transparent)'
                      : 'var(--green-tint)',
                    borderInlineStart: `3px solid ${ins.tone === 'clay' ? 'var(--clay)' : ins.tone === 'amber' ? '#d8a01a' : 'var(--green)'}`,
                  }}>
                    {ins.tone === 'clay' ? '⚠ ' : ins.tone === 'amber' ? '◐ ' : '✓ '}{ins.text}
                  </div>
                ))}
              </div>
            )}

            {/* The control centre is the answer to "so what is going on with this
                project", which is the question the digest just raised. The diary stays
                available for the narrower question of what was written. */}
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {can('control_center') && (
                <button className="btn btn--ghost" onClick={() => nav(`/control?project=${d.projectId}`)}>
                  {t('digest_open_control')} ←
                </button>
              )}
              <button className="btn btn--quiet" onClick={() => nav(`/?p=${d.projectId}`)}>{t('digest_open_log')} ←</button>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
