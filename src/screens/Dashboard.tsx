import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Tag, stagger, riseIn } from '../components/ui'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { fetchDashboardStats, listEntries, type DashboardStats } from '../api'
import { useStore } from '../store'
import { parseCoops } from '../lib/reportTables'
import { ProgressChart, type ProgressSeries } from '../components/ProgressChart'
import { Section } from '../components/Section'
import MalfunctionsSection from './Malfunctions'

const STALE_DAYS = 7
const dayKey = (d: Date) => d.toISOString().slice(0, 10)

export default function Dashboard() {
  const { t } = useI18n()
  const nav = useNavigate()
  const { projects, projectName, projectColor, userName } = useStore()
  const [raw, setRaw] = useState<DashboardStats | null>(null)
  // progress-over-time: pick a project, series are its coops. The loaded data
  // carries the project it belongs to, so "loading" is derived by comparison
  // instead of resetting state synchronously inside the effect.
  const [chartProject, setChartProject] = useState('')
  const [chart, setChart] = useState<{ project: string; series: ProgressSeries[] } | null>(null)

  useEffect(() => {
    let alive = true
    fetchDashboardStats().then((s) => { if (alive) setRaw(s) }).catch(() => { if (alive) setRaw(null) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!chartProject) return
    let alive = true
    listEntries(chartProject).then((entries) => {
      if (!alive) return
      // per coop: the pct recorded on each work date (last entry of a day wins,
      // list arrives newest-first so the first value seen per date is kept)
      const byCoop = new Map<string, Map<string, number>>()
      for (const e of entries) {
        if (!e.work_date) continue
        for (const c of parseCoops(e.values, 'he')) {
          const m = byCoop.get(c.name) ?? new Map<string, number>()
          if (!m.has(e.work_date)) m.set(e.work_date, c.pct)
          byCoop.set(c.name, m)
        }
      }
      const series: ProgressSeries[] = [...byCoop.entries()]
        .map(([name, m]) => ({
          name,
          points: [...m.entries()].map(([date, pct]) => ({ date, pct })).sort((a, b) => a.date.localeCompare(b.date)),
        }))
        .filter((s) => s.points.length >= 2)
        .sort((a, b) => a.name.localeCompare(b.name, 'he', { numeric: true }))
      setChart({ project: chartProject, series })
    }).catch(() => { if (alive) setChart({ project: chartProject, series: [] }) })
    return () => { alive = false }
  }, [chartProject])

  const stats = useMemo(() => {
    if (!raw) return null
    const today = new Date()
    const staleCut = dayKey(new Date(today.getTime() - STALE_DAYS * 864e5))
    const latest = raw.latest_by_project
    const stale = projects.filter((p) => p.active && (!latest[p.id] || latest[p.id] < staleCut))
      .map((p) => ({ p, last: latest[p.id] }))
    const topProjects = Object.entries(raw.by_project).sort((a, b) => b[1] - a[1]).slice(0, 8)
    const maxProj = Math.max(1, ...topProjects.map(([, n]) => n))
    const workers = Object.entries(raw.by_worker).sort((a, b) => b[1] - a[1]).slice(0, 6)
    return {
      total: raw.total, thisWeek: raw.this_week, thisMonth: raw.this_month ?? 0,
      totalPhotos: raw.total_photos ?? 0, unsent: raw.unsent ?? 0,
      malfunctionsMonth: raw.malfunctions_this_month ?? 0,
      activeProjects: projects.filter((p) => p.active).length, stale, topProjects, maxProj, workers,
    }
  }, [raw, projects])

  if (!raw || !stats) return <Loader full label={t('nav_dashboard')} />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{t('app_sub')}</div>
          <h1 className="page-title">{t('nav_dashboard')}</h1>
        </div>
      </div>

      <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'grid', gap: 14 }}>
        {/* headline numbers — always visible, not collapsible */}
        <motion.div variants={riseIn} className="stat-grid">
          <Stat label={t('dash_total')} value={stats.total} />
          <Stat label={t('dash_month')} value={stats.thisMonth} />
          <Stat label={t('dash_week')} value={stats.thisWeek} />
          <Stat label={t('dash_active_projects')} value={stats.activeProjects} />
          <Stat label={t('dash_photos')} value={stats.totalPhotos} />
          <Stat label={t('dash_malfunctions')} value={stats.malfunctionsMonth} tone={stats.malfunctionsMonth ? 'clay' : 'green'} clickable onClick={() => document.getElementById('malfunctions')?.scrollIntoView({ behavior: 'smooth' })} />
          <Stat label={t('dash_unsent')} value={stats.unsent} tone={stats.unsent ? 'clay' : 'green'} clickable onClick={() => nav('/export')} />
          <Stat label={t('dash_needs_update')} value={stats.stale.length} tone={stats.stale.length ? 'clay' : 'green'} />
        </motion.div>

        <motion.div variants={riseIn}>
        <Section id="stale" icon="⚠" title={`${t('dash_stale')} (${STALE_DAYS}+ ${t('days')})`}
          summary={stats.stale.length || `✓`} tone={stats.stale.length ? 'clay' : 'green'} defaultOpen={stats.stale.length > 0}>
          {stats.stale.length === 0 ? (
            <Tag tone="green">✓ {t('dash_no_stale')}</Tag>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {stats.stale.map(({ p, last }) => (
                <button key={p.id} className="tag tag--clay" style={{ cursor: 'pointer' }} onClick={() => nav('/calendar')}>
                  {p.name} · {last ? `${t('dash_last')} ${last}` : t('no_entries')}
                </button>
              ))}
            </div>
          )}
        </Section>
        </motion.div>

        <motion.div variants={riseIn}>
        <Section id="progress" icon="📈" title={t('dash_progress_chart')} summary={chartProject ? projectName(chartProject) : undefined}>
          <div style={{ marginBottom: 12 }}>
            <select className="input" style={{ maxWidth: 260 }} value={chartProject} onChange={(e) => setChartProject(e.target.value)}>
              <option value="">— {t('choose')} —</option>
              {/* only projects that actually have entries — an empty project has no line to draw */}
              {projects.filter((p) => p.active && (raw.by_project[p.id] ?? 0) > 0)
                .map((p) => <option key={p.id} value={p.id}>{p.name} ({raw.by_project[p.id]})</option>)}
            </select>
          </div>
          {chartProject && chart?.project !== chartProject && <Loader label={t('loading')} />}
          {chartProject && chart?.project === chartProject && <ProgressChart key={chartProject} series={chart.series} />}
          {!chartProject && <div className="empty" style={{ padding: '18px 0' }}>{t('dash_progress_pick')}</div>}
        </Section>
        </motion.div>

        <motion.div variants={riseIn}>
        <Section id="by-project" icon="▤" title={t('dash_by_project')} summary={stats.topProjects.length}>
          <div style={{ display: 'grid', gap: 10 }}>
            {stats.topProjects.map(([pid, n]) => (
              <div key={pid} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 40px', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{projectName(pid)}</span>
                <div style={{ background: 'var(--paper-2)', borderRadius: 6, height: 14 }}>
                  <div style={{ width: `${(n / stats.maxProj) * 100}%`, background: projectColor(pid), height: '100%', borderRadius: 6 }} />
                </div>
                <span className="count mono" style={{ textAlign: 'end' }}>{n}</span>
              </div>
            ))}
          </div>
        </Section>
        </motion.div>

        <motion.div variants={riseIn}>
        <Section id="people" icon="👥" title={t('dash_by_worker')} summary={stats.workers.length} defaultOpen={false}>
          <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
            {stats.workers.map(([uid, n]) => (
              <div key={uid} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span>{userName(uid)}</span><b className="mono">{n}</b>
              </div>
            ))}
            {stats.workers.length === 0 && <span className="count mono">—</span>}
          </div>
        </Section>
        </motion.div>

        {/* malfunctions (בלת"מ) analytics */}
        <MalfunctionsSection />
      </motion.div>
    </div>
  )
}

function Stat({ label, value, tone, clickable, onClick }: { label: string; value: number; tone?: 'clay' | 'green'; clickable?: boolean; onClick?: () => void }) {
  const color = tone === 'clay' && value > 0 ? 'var(--clay)' : tone === 'green' ? 'var(--green-deep)' : undefined
  return (
    <div className="panel stat" onClick={clickable ? onClick : undefined}
      style={{ ...(tone === 'clay' && value > 0 ? { borderColor: 'var(--clay)' } : {}), ...(clickable ? { cursor: 'pointer' } : {}) }}>
      <div className="stat__value" style={{ color }}>{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  )
}
