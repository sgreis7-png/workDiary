// Control centre: one project, every layer of it, on one screen.
//
// Two ways to read it, because the two jobs are different. Tabs are for going straight to
// the thing you already have a question about; one-page is for going through the project
// end to end without deciding what to look at next. Same blocks either way — the mode only
// changes whether the others are mounted, and the strip doubles as jump links.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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
import { summarize, type GanttBundle } from '../gantt/model'
import {
  fetchProjectSnapshot, reportedProgress,
  type ProjectSnapshot, type SnapshotCoop, type SnapshotDefect, type SnapshotPerson, type LeanEntry,
} from '../control/api'
import type { Project } from '../data'
import '../styles/control.css'
import { useTabStrip } from '../lib/useTabStrip'

type SectionKey = 'summary' | 'schedule' | 'coops' | 'defects' | 'people' | 'diary'
type View = 'tabs' | 'all'
const VIEW_KEY = 'cc_view'

function readView(): View {
  return localStorage.getItem(VIEW_KEY) === 'all' ? 'all' : 'tabs'
}

export default function ControlCenter() {
  const { lang, t } = useI18n()
  const g = useCallback((k: string) => gt(lang, k), [lang])
  const { projects, userName } = useStore()
  const { can } = usePerms()
  const tabs = useRef<HTMLDivElement>(null)
  const onTabKey = useTabStrip(tabs)
  const maySeeSchedule = can('gantt')

  const [pickedProject, setPickedProject] = useState('')
  const [section, setSection] = useState<SectionKey>('summary')
  const [view, setView] = useState<View>(readView)
  const [snap, setSnap] = useState<ProjectSnapshot | null>(null)
  const [schedule, setSchedule] = useState<{ project: string; bundle: GanttBundle | null } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  // ?project=<id> so other screens can link straight at a project — the weekly digest
  // does, and landing on whichever project happens to be first would defeat the point
  const [params] = useSearchParams()
  const linkedProject = params.get('project') ?? ''

  const active = useMemo(() => projects.filter((p) => p.active), [projects])
  const projectId = pickedProject
    || (active.some((p) => p.id === linkedProject) ? linkedProject : '')
    || active[0]?.id
    || ''
  const project = active.find((p) => p.id === projectId)
  // tagged, so a stale snapshot is never read against the newly picked project
  const data = snap?.project.id === projectId ? snap : null
  const bundle = schedule?.project === projectId ? schedule.bundle : null
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

  const switchView = (next: View) => {
    setView(next)
    try { localStorage.setItem(VIEW_KEY, next) } catch { /* private browsing */ }
  }

  const openDefects = data?.defects.filter((d) => d.status === 'open') ?? []
  const overdue = openDefects.filter((d) => d.overdue)
  const critical = openDefects.filter((d) => d.severity === 'critical')
  const openTasks = data?.tasks.filter((tk) => tk.status === 'open') ?? []
  const scheduleStats = bundle ? summarize(bundle.tasks, new Date().toISOString()) : null
  const reported = data ? reportedProgress(data.progress) : null

  const fmt = useCallback(
    (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB') : '—'),
    [lang],
  )

  const daysTo = (iso: string | null | undefined) => {
    if (!iso) return null
    const target = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
    const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)
    return Math.round((target - today) / 86_400_000)
  }
  const left = daysTo(project?.end_date)

  const sections: { key: SectionKey; label: string; count?: number; node: ReactNode }[] = data && project ? [
    {
      key: 'summary',
      label: g('o_tab_summary'),
      node: <SummaryBlock project={project} data={data} fmt={fmt} />,
    },
    ...(maySeeSchedule ? [{
      key: 'schedule' as SectionKey,
      label: g('o_tab_schedule'),
      count: bundle?.tasks.length,
      node: bundle ? <ScheduleBlock bundle={bundle} /> : (
        <div className="panel cc-block">
          <div className="empty">{g('o_no_schedule')}</div>
          <Link className="btn btn--ghost" to="/gantt" style={{ marginTop: 10 }}>{g('g_import')}</Link>
        </div>
      ),
    }] : []),
    {
      key: 'coops',
      label: g('o_tab_coops'),
      count: data.coops.length,
      node: <CoopsBlock coops={data.coops} fmt={fmt} />,
    },
    {
      key: 'defects',
      label: g('o_tab_defects'),
      count: openDefects.length,
      node: <DefectsBlock defects={openDefects} fmt={fmt} />,
    },
    {
      key: 'people',
      label: g('o_tab_people'),
      count: data.people.length,
      node: <PeopleBlock people={data.people} />,
    },
    {
      key: 'diary',
      label: g('o_tab_diary'),
      count: data.entries.length,
      node: <DiaryBlock entries={data.entries} fmt={fmt} userName={userName} />,
    },
  ] : []

  const goTo = (key: SectionKey) => {
    if (view === 'tabs') { setSection(key); return }
    document.getElementById(`cc-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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
          <motion.div variants={riseIn} className="stat-grid gantt__stats">
            <Kpi
              label={g('o_schedule_prog')}
              value={scheduleStats ? `${scheduleStats.overallPct}%` : reported !== null ? `${reported}%` : '—'}
              note={!scheduleStats && reported !== null ? g('o_reported_prog') : undefined}
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

          <motion.div variants={riseIn} className="cc-bar">
            <div className="cc-tabs" role={view === 'tabs' ? 'tablist' : 'group'} aria-label={view === 'tabs' ? undefined : g('o_jump')}
              ref={tabs} onKeyDown={onTabKey}>
              {sections.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role={view === 'tabs' ? 'tab' : undefined}
                  aria-selected={view === 'tabs' ? section === s.key : undefined}
                  // one tab stop for the strip when it is a tablist; in one-page mode these are
                  // ordinary jump buttons and each keeps its own
                  tabIndex={view === 'tabs' ? (section === s.key ? 0 : -1) : undefined}
                  className={`coop-tab ${view === 'tabs' && section === s.key ? 'on' : ''}`}
                  onClick={() => goTo(s.key)}
                >
                  {s.label}
                  {s.count !== undefined && <span className="cc-tab__n">{s.count}</span>}
                </button>
              ))}
            </div>

            <div className="cc-view">
              <span className="gantt__label">{g('o_view')}</span>
              <div className="gantt__seg" role="group" aria-label={g('o_view')}>
                <button type="button" aria-pressed={view === 'tabs'} onClick={() => switchView('tabs')}>{g('o_view_tabs')}</button>
                <button type="button" aria-pressed={view === 'all'} onClick={() => switchView('all')}>{g('o_view_all')}</button>
              </div>
            </div>
          </motion.div>

          {view === 'tabs'
            ? <motion.div variants={riseIn} style={{ minWidth: 0 }}>{sections.find((s) => s.key === section)?.node}</motion.div>
            : sections.map((s) => (
              <motion.section variants={riseIn} key={s.key} id={`cc-${s.key}`} className="cc-section">
                <h2 className="cc-section__title">
                  {s.label}
                  {s.count !== undefined && <span className="cc-tab__n">{s.count}</span>}
                </h2>
                {s.node}
              </motion.section>
            ))}
        </motion.div>
      )}
    </div>
  )
}

type Fmt = (iso: string | null | undefined) => string

function SummaryBlock({ project, data, fmt }: { project: Project; data: ProjectSnapshot; fmt: Fmt }) {
  const { lang } = useI18n()
  const g = (k: string) => gt(lang, k)
  return (
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

      <div className="panel cc-block">
        <h3 className="cc-block__title">{g('o_reported_prog')}</h3>
        {data.progress.filter((s) => s.points.length >= 2).length
          ? <ProgressChart series={data.progress} />
          : <div className="empty">{g('o_no_entries')}</div>}
      </div>
    </div>
  )
}

const ignoreEdits = (_changes: TaskChange[]) => {}

/** Read-only here: editing a schedule belongs on the schedule screen, with its own gate. */
function ScheduleBlock({ bundle }: { bundle: GanttBundle }) {
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

function CoopsBlock({ coops, fmt }: { coops: SnapshotCoop[]; fmt: Fmt }) {
  const { lang } = useI18n()
  const g = (k: string) => gt(lang, k)
  if (!coops.length) return <div className="panel cc-block"><div className="empty">{g('o_no_coops')}</div></div>
  return (
    <div className="cc-cards">
      {coops.map((c) => c.diaryOnly ? (
        // reported from the field, but no quality-control record to open yet
        <div key={c.id} className="panel cc-card">
          <div className="cc-card__head">
            <b>{c.name}</b>
            <Tag tone="muted">{g('o_diary_only')}</Tag>
          </div>
          <div className="cc-card__meta">
            <span>{g('o_reported_short')}: {c.reportedPct !== null ? `${c.reportedPct}%` : '—'}</span>
          </div>
        </div>
      ) : (
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
            {c.reportedPct !== null && <span>{g('o_reported_short')}: {c.reportedPct}%</span>}
          </div>
        </Link>
      ))}
    </div>
  )
}

function DefectsBlock({ defects, fmt }: { defects: SnapshotDefect[]; fmt: Fmt }) {
  const { lang } = useI18n()
  const g = (k: string) => gt(lang, k)
  if (!defects.length) return <div className="panel cc-block"><div className="empty">{g('o_no_defects')}</div></div>
  return (
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
          {[...defects]
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
  )
}

function PeopleBlock({ people }: { people: SnapshotPerson[] }) {
  const { lang } = useI18n()
  const g = (k: string) => gt(lang, k)
  if (!people.length) return <div className="panel cc-block"><div className="empty">{g('o_no_people')}</div></div>
  return (
    <div className="cc-cards">
      {people.map((p) => (
        <div key={p.email} className="panel cc-card">
          <div className="cc-card__head"><b>{p.name}</b></div>
          <div className="cc-card__meta mono">{p.email}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            <Tag tone="muted">{g('o_entries')} · {p.entries}</Tag>
            {p.openDefects > 0 && <Tag tone="clay">{g('o_open_defects')} · {p.openDefects}</Tag>}
            {p.openTasks > 0 && <Tag tone="amber">{g('o_open_tasks')} · {p.openTasks}</Tag>}
          </div>
        </div>
      ))}
    </div>
  )
}

function DiaryBlock({ entries, fmt, userName }: { entries: LeanEntry[]; fmt: Fmt; userName: (id: string) => string }) {
  const { lang } = useI18n()
  const g = (k: string) => gt(lang, k)
  if (!entries.length) return <div className="panel cc-block"><div className="empty">{g('o_no_entries')}</div></div>
  return (
    <div className="panel cc-block">
      <div className="row-list">
        {entries.slice(0, 40).map((e) => (
          <Link key={e.id} to={`/entry/${e.id}`} className="row-item">
            <span className="mono">{fmt(e.work_date)}</span>
            <span className="cc-row__text">{e.values.daily_content || e.values.site_location || '—'}</span>
            <span className="meta">{userName(e.created_by)}</span>
          </Link>
        ))}
      </div>
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
