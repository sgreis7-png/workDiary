// Control centre: one project, every layer of it, on one screen.
//
// Six tabs over a single fetched snapshot rather than six screens: the point is that a
// manager can answer "how is this project doing" without navigating, so the headline
// numbers stay visible and the tabs only change the detail beneath them.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useI18n } from '../i18n'
import { useStore } from '../store'
import { usePerms } from '../lib/usePerms'
import { Loader } from '../components/Loader'
import { Tag, riseIn, stagger } from '../components/ui'
import { ProgressChart } from '../components/ProgressChart'
import { GanttChart, type TaskChange } from '../components/GanttChart'
import { gt } from '../gantt/i18n'
import { GATE_ORDER, SEVERITY_LABELS } from '../defects/model'
import { gateShortName } from '../defects/i18n'
import { deptLabel } from '../data'
import { fetchBundle, fetchCharts } from '../gantt/api'
import { summarize } from '../gantt/model'
import type { GanttBundle } from '../gantt/model'
import { fetchProjectSnapshot, reportedProgress, type ProjectSnapshot } from '../control/api'
import '../styles/control.css'

type Tab = 'summary' | 'schedule' | 'coops' | 'defects' | 'people' | 'diary'

export default function ControlCenter() {
  const { lang, t } = useI18n()
  const g = useCallback((k: string) => gt(lang, k), [lang])
  const { projects, userName } = useStore()
  const { can } = usePerms()
  const maySeeSchedule = can('gantt')

  const [pickedProject, setPickedProject] = useState('')
  const [tab, setTab] = useState<Tab>('summary')
  const [snap, setSnap] = useState<ProjectSnapshot | null>(null)
  const [schedule, setSchedule] = useState<{ project: string; bundle: GanttBundle | null } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const active = useMemo(() => projects.filter((p) => p.active), [projects])
  const projectId = pickedProject || active[0]?.id || ''
  const project = active.find((p) => p.id === projectId)
  // tagged, so a stale snapshot is never read against the newly picked project
  const data = snap?.project.id === projectId ? snap : null
  const bundle = schedule?.project === projectId ? schedule.bundle : null
  // tagged with the project it belongs to, so switching projects clears it without an
  // effect that resets state on every render pass
  const problem = failure === projectId ? g('o_load_failed') : null

  useEffect(() => {
    if (!project) return
    let alive = true
    fetchProjectSnapshot(project)
      .then((s) => { if (alive) setSnap(s) })
      .catch(() => { if (alive) setFailure(project.id) })
    return () => { alive = false }
  }, [project])

  useEffect(() => {
    if (!projectId || !maySeeSchedule) return
    let alive = true
    fetchCharts(projectId)
      .then((charts) => (charts.length ? fetchBundle(charts[0].id) : null))
      .then((b) => { if (alive) setSchedule({ project: projectId, bundle: b }) })
      .catch(() => { if (alive) setSchedule({ project: projectId, bundle: null }) })
    return () => { alive = false }
  }, [projectId, maySeeSchedule])

  const openDefects = data?.defects.filter((d) => d.status === 'open') ?? []
  const overdue = openDefects.filter((d) => d.overdue)
  const critical = openDefects.filter((d) => d.severity === 'critical')
  const openTasks = data?.tasks.filter((t) => t.status === 'open') ?? []
  const scheduleStats = bundle ? summarize(bundle.tasks, new Date().toISOString()) : null
  const reported = data ? reportedProgress(data.progress) : null

  const fmt = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB') : '—'

  const daysTo = (iso: string | null | undefined) => {
    if (!iso) return null
    const ms = new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime() - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)
    return Math.round(ms / 86_400_000)
  }
  const left = daysTo(project?.end_date)

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'summary', label: g('o_tab_summary') },
    ...(maySeeSchedule ? [{ key: 'schedule' as Tab, label: g('o_tab_schedule'), count: bundle?.tasks.length }] : []),
    { key: 'coops', label: g('o_tab_coops'), count: data?.coops.length },
    { key: 'defects', label: g('o_tab_defects'), count: openDefects.length },
    { key: 'people', label: g('o_tab_people'), count: data?.people.length },
    { key: 'diary', label: g('o_tab_diary'), count: data?.entries.length },
  ]

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{g('o_kicker')}</div>
          <h1 className="page-title">{g('o_title')}</h1>
        </div>
        <select
          className="input"
          style={{ maxWidth: 260 }}
          value={projectId}
          onChange={(e) => setPickedProject(e.target.value)}
          aria-label={g('o_pick')}
        >
          {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {!project && <div className="empty">{g('o_pick')}</div>}
      {problem && <div className="tag tag--clay">{problem}</div>}
      {project && !data && !problem && <Loader label={t('loading')} />}

      {project && data && (
        <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          {/* headline: the numbers a manager needs before choosing where to look */}
          <motion.div variants={riseIn} className="stat-grid gantt__stats">
            <Kpi
              label={g('o_schedule_prog')}
              value={scheduleStats ? `${scheduleStats.overallPct}%` : reported !== null ? `${reported}%` : '—'}
              note={scheduleStats ? undefined : reported !== null ? g('o_reported_prog') : undefined}
            />
            <Kpi label={g('o_open_defects')} value={String(openDefects.length)} bad={openDefects.length > 0} />
            <Kpi label={g('o_overdue')} value={String(overdue.length)} bad={overdue.length > 0} />
            <Kpi label={g('o_critical')} value={String(critical.length)} bad={critical.length > 0} />
            <Kpi label={g('o_houses')} value={String(data.coops.length)} />
            <Kpi label={g('o_open_tasks')} value={String(openTasks.length)} />
            <Kpi label={g('o_entries')} value={String(data.entries.length)} />
            <Kpi
              label={left !== null && left < 0 ? g('o_days_over') : g('o_days_left')}
              value={left === null ? '—' : String(Math.abs(left))}
              bad={left !== null && left < 0}
            />
          </motion.div>

          <motion.div variants={riseIn} className="cc-tabs" role="tablist">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                type="button"
                role="tab"
                aria-selected={tab === tb.key}
                className={`coop-tab ${tab === tb.key ? 'on' : ''}`}
                onClick={() => setTab(tb.key)}
              >
                {tb.label}
                {tb.count !== undefined && <span className="cc-tab__n">{tb.count}</span>}
              </button>
            ))}
          </motion.div>

          <motion.div variants={riseIn} style={{ minWidth: 0 }}>
            {tab === 'summary' && (
              <div className="cc-split">
                <div className="panel cc-block">
                  <h3 className="cc-block__title">{g('o_details')}</h3>
                  <dl className="dl">
                    <Row label={g('o_location')} value={project.location} />
                    <Row label={g('o_pmo')} value={project.pmo} />
                    <Row
                      label={g('o_budget')}
                      value={project.budget != null ? project.budget.toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB') : null}
                    />
                    <Row label={g('o_dates')} value={`${fmt(project.start_date)} — ${fmt(project.end_date)}`} />
                    <Row label={g('o_photos')} value={String(data.photoCount)} />
                    {project.notes && <Row label={g('o_notes')} value={project.notes} />}
                  </dl>
                  {Object.keys(data.malfunctionsByDept).length > 0 && (
                    <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {Object.entries(data.malfunctionsByDept).map(([dept, n]) => (
                        <Tag key={dept} tone="clay">{deptLabel(dept, lang)} · {n}</Tag>
                      ))}
                    </div>
                  )}
                </div>

                <div className="panel cc-block" style={{ minWidth: 0 }}>
                  <h3 className="cc-block__title">{g('o_reported_prog')}</h3>
                  {data.progress.filter((s) => s.points.length >= 2).length
                    ? <ProgressChart series={data.progress} />
                    : <div className="empty">{g('o_no_entries')}</div>}
                </div>
              </div>
            )}

            {tab === 'schedule' && (
              bundle
                ? <ScheduleTab bundle={bundle} />
                : (
                  <div className="panel cc-block">
                    <div className="empty">{g('o_no_schedule')}</div>
                    <Link className="btn btn--ghost" to="/gantt" style={{ marginTop: 10 }}>{g('g_import')}</Link>
                  </div>
                )
            )}

            {tab === 'coops' && (
              data.coops.length ? (
                <div className="cc-cards">
                  {data.coops.map((c) => (
                    <Link key={c.id} to={`/defects/coop/${c.id}`} className="panel cc-card">
                      <div className="cc-card__head">
                        <b>{c.name}</b>
                        {c.overdueDefects > 0 && <Tag tone="clay">{c.overdueDefects} {g('o_overdue')}</Tag>}
                        {c.overdueDefects === 0 && c.openDefects > 0 && <Tag tone="amber">{c.openDefects} {g('o_open_defects')}</Tag>}
                        {c.openDefects === 0 && <Tag tone="green">✓</Tag>}
                      </div>
                      <div className="qc-gates">
                        {GATE_ORDER.map((gate) => {
                          const pct = c.gates[gate]
                          return (
                            <span
                              key={gate}
                              className={`qc-gate ${pct === 100 ? 'qc-gate--done' : pct !== null ? 'qc-gate--part' : ''}`}
                              title={`${gateShortName(lang, gate)} · ${pct ?? '—'}%`}
                            >
                              {gateShortName(lang, gate).replace(/[^0-9]/g, '') || '⚒'}
                              <small>{pct === null ? '—' : `${pct}%`}</small>
                            </span>
                          )
                        })}
                      </div>
                      <div className="cc-card__meta">
                        {c.execution_manager && <span>{c.execution_manager}</span>}
                        {c.opened_on && <span>{fmt(c.opened_on)}</span>}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : <div className="panel cc-block"><div className="empty">{g('o_no_coops')}</div></div>
            )}

            {tab === 'defects' && (
              openDefects.length ? (
                <div className="panel cc-block" style={{ overflowX: 'auto' }}>
                  <table className="defect-table">
                    <thead>
                      <tr>
                        <th>{g('o_tab_coops')}</th>
                        <th>#</th>
                        <th>{g('o_tab_defects')}</th>
                        <th>{g('o_severity')}</th>
                        <th>{g('o_assignee')}</th>
                        <th>{g('o_due')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...openDefects]
                        .sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
                        .map((d) => (
                          <tr key={d.id} className={d.overdue ? 'gate-row--bad' : undefined}>
                            <td><Link to={`/defects/coop/${d.coop_id}`}>{d.coopName}</Link></td>
                            <td className="mono">{d.seq}</td>
                            <td>{d.description ?? '—'}</td>
                            <td>{d.severity ? SEVERITY_LABELS[d.severity] : '—'}</td>
                            <td>{d.assignee_email ?? '—'}</td>
                            <td className={d.overdue ? 'cell-warn mono' : 'mono'}>{fmt(d.due_date)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="panel cc-block"><div className="empty">{g('o_no_defects')}</div></div>
            )}

            {tab === 'people' && (
              data.people.length ? (
                <div className="cc-cards">
                  {data.people.map((p) => (
                    <div key={p.email} className="panel cc-card">
                      <div className="cc-card__head"><b>{p.name}</b></div>
                      <div className="cc-card__meta" style={{ fontFamily: 'var(--font-mono)' }}>{p.email}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        <Tag tone="muted">{g('o_entries')} · {p.entries}</Tag>
                        {p.openDefects > 0 && <Tag tone="clay">{g('o_open_defects')} · {p.openDefects}</Tag>}
                        {p.openTasks > 0 && <Tag tone="amber">{g('o_open_tasks')} · {p.openTasks}</Tag>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="panel cc-block"><div className="empty">{g('o_no_people')}</div></div>
            )}

            {tab === 'diary' && (
              data.entries.length ? (
                <div className="panel cc-block">
                  <div className="row-list">
                    {data.entries.slice(0, 40).map((e) => (
                      <Link key={e.id} to={`/entry/${e.id}`} className="row-item">
                        <span className="mono">{fmt(e.work_date)}</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.values.daily_content || e.values.site_location || '—'}
                        </span>
                        <span className="meta">{userName(e.created_by)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : <div className="panel cc-block"><div className="empty">{g('o_no_entries')}</div></div>
            )}
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}

const ignoreEdits = (_changes: TaskChange[]) => {}

/** Read-only here: editing a schedule belongs on the schedule screen, with its own gate. */
function ScheduleTab({ bundle }: { bundle: GanttBundle }) {
  const { lang } = useI18n()
  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <b>{bundle.chart.name}</b>
        <Link className="btn btn--quiet" to="/gantt">{gt(lang, 'o_open_full')}</Link>
      </div>
      <GanttChart tasks={bundle.tasks} links={bundle.links} canEdit={false} onEdit={ignoreEdits} />
    </div>
  )
}

function Kpi({ label, value, note, bad }: { label: string; value: string; note?: string; bad?: boolean }) {
  return (
    <div className="panel stat" style={bad ? { borderColor: 'var(--clay)' } : undefined}>
      <div className="stat__value" style={bad ? { color: 'var(--clay)' } : undefined}>{value}</div>
      <div className="stat__label">{label}</div>
      {note && <div className="cc-kpi__note">{note}</div>}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="dl__row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
