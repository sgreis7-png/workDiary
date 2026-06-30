import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Loader } from '../components/Loader'
import { useI18n, MONTHS, WEEKDAYS } from '../i18n'
import { listEntries } from '../api'
import { useStore } from '../store'
import { groupByDate } from '../data'
import type { Entry } from '../data'

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

export default function Calendar() {
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const { projects, projectColor, projectName, userName } = useStore()
  const [projectId, setProjectId] = useState('')
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const now = new Date()
  const [y, setY] = useState(now.getFullYear())
  const [m, setM] = useState(now.getMonth())

  // fetch only the visible month (scales — no full-table read)
  useEffect(() => {
    let alive = true
    setEntries(null)
    const from = ymd(y, m, 1)
    const to = ymd(y, m, new Date(y, m + 1, 0).getDate())
    listEntries(undefined, { from, to, limit: 1000 })
      .then((e) => { if (alive) setEntries(e) })
      .catch(() => { if (alive) setEntries([]) })
    return () => { alive = false }
  }, [y, m])

  const byDate = useMemo(() => groupByDate(entries ?? []), [entries])

  const todayStr = new Date().toISOString().slice(0, 10)
  const first = new Date(y, m, 1).getDay()
  const days = new Date(y, m + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const step = (delta: number) => {
    const nm = m + delta
    setY((yy) => yy + Math.floor(nm / 12))
    setM(((nm % 12) + 12) % 12)
  }

  const usedProjects = projects.filter((p) => (entries ?? []).some((e) => e.project_id === p.id))

  if (!entries) return <Loader full label={t('app_sub')} />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{t('app_sub')}</div>
          <h1 className="page-title">{MONTHS[lang][m]} {y}</h1>
        </div>
        <div className="cal-nav">
          <select className="input" style={{ width: 'auto', minWidth: 170 }} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{t('all_projects')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="btn btn--ghost" onClick={() => step(-1)}>‹</button>
          <button className="btn btn--quiet" onClick={() => { setY(Number(todayStr.slice(0, 4))); setM(Number(todayStr.slice(5, 7)) - 1) }}>{t('today')}</button>
          <button className="btn btn--ghost" onClick={() => step(1)}>›</button>
        </div>
      </div>

      <div className="cal-legend">
        {usedProjects.map((p) => (
          <span key={p.id} className="cal-legend__item"><i style={{ background: projectColor(p.id) }} />{p.name}</span>
        ))}
      </div>

      <div className="calendar">
        {WEEKDAYS[lang].map((w) => <div key={w} className="cal-dow">{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="cal-cell cal-cell--empty" />
          const date = ymd(y, m, d)
          const items = (byDate[date] ?? []).filter((e) => !projectId || e.project_id === projectId)
          const isToday = date === todayStr
          return (
            <motion.div key={i} className={`cal-cell ${isToday ? 'is-today' : ''}`}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: Math.min(i * 0.005, 0.2) }}>
              <div className="cal-cell__num">{d}{items.length > 1 && <span className="cal-cell__count">{items.length} {t('entries_on_day')}</span>}</div>
              <div className="cal-cell__chips">
                {items.map((e) => (
                  <button key={e.id} className="cal-chip" style={{ ['--c' as string]: projectColor(e.project_id) }}
                    onClick={() => nav(`/entry/${e.id}`)} title={`${projectName(e.project_id)} · ${userName(e.created_by)}`}>
                    <i />{projectName(e.project_id)}
                    <small>{e.values.site_location} · {userName(e.created_by)}</small>
                  </button>
                ))}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
