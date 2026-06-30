import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Tag, WeatherChip, stagger, riseIn } from '../components/ui'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { fetchDashboardStats, type DashboardStats } from '../api'
import { useStore } from '../store'

const STALE_DAYS = 7
const dayKey = (d: Date) => d.toISOString().slice(0, 10)

export default function Dashboard() {
  const { t } = useI18n()
  const nav = useNavigate()
  const { projects, projectName, projectColor, userName } = useStore()
  const [raw, setRaw] = useState<DashboardStats | null>(null)

  useEffect(() => {
    let alive = true
    fetchDashboardStats().then((s) => { if (alive) setRaw(s) }).catch(() => { if (alive) setRaw(null) })
    return () => { alive = false }
  }, [])

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
      activeProjects: projects.filter((p) => p.active).length, stale, topProjects, maxProj, byWeather: raw.by_weather, workers,
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

      <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'grid', gap: 16 }}>
        {/* stat cards */}
        <motion.div variants={riseIn} className="stat-grid">
          <Stat label={t('dash_total')} value={stats.total} />
          <Stat label={t('dash_month')} value={stats.thisMonth} />
          <Stat label={t('dash_week')} value={stats.thisWeek} />
          <Stat label={t('dash_active_projects')} value={stats.activeProjects} />
          <Stat label={t('dash_photos')} value={stats.totalPhotos} />
          <Stat label={t('dash_unsent')} value={stats.unsent} tone={stats.unsent ? 'clay' : 'green'} clickable onClick={() => nav('/export')} />
          <Stat label={t('dash_needs_update')} value={stats.stale.length} tone={stats.stale.length ? 'clay' : 'green'} />
        </motion.div>

        {/* stale projects */}
        <motion.div variants={riseIn} className="panel" style={{ padding: 22 }}>
          <h3 style={{ marginBottom: 12 }}>⚠ {t('dash_stale')} ({STALE_DAYS}+ {t('days')})</h3>
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
        </motion.div>

        {/* entries per project */}
        <motion.div variants={riseIn} className="panel" style={{ padding: 22 }}>
          <h3 style={{ marginBottom: 14 }}>{t('dash_by_project')}</h3>
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
        </motion.div>

        <div className="stat-grid">
          {/* weather */}
          <motion.div variants={riseIn} className="panel" style={{ padding: 22 }}>
            <h3 style={{ marginBottom: 12 }}>{t('dash_weather')}</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(stats.byWeather).map(([w, n]) => (
                <span key={w} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <WeatherChip value={w} /> <b className="mono">{n}</b>
                </span>
              ))}
              {Object.keys(stats.byWeather).length === 0 && <span className="count mono">—</span>}
            </div>
          </motion.div>
          {/* workers */}
          <motion.div variants={riseIn} className="panel" style={{ padding: 22 }}>
            <h3 style={{ marginBottom: 12 }}>{t('dash_by_worker')}</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {stats.workers.map(([uid, n]) => (
                <div key={uid} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span>{userName(uid)}</span><b className="mono">{n}</b>
                </div>
              ))}
              {stats.workers.length === 0 && <span className="count mono">—</span>}
            </div>
          </motion.div>
        </div>
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
