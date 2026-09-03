import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Loader } from '../../components/Loader'
import { TrafficDot } from '../../components/TrafficDot'
import { useI18n, type Lang } from '../../i18n'
import { useStore } from '../../store'
import { fetchTasks, type WorkTask } from '../../lib/tasks'
import { fetchSnapshot, fetchTrafficLight } from '../../traffic/api'
import type { AxisKey, Color, ProjectLight } from '../../traffic/model'
import { axisLabel, deliveryStatusLabel, ownerLabel, tl } from '../../traffic/i18n'
import { TaskDialog } from './TaskDialog'
import '../../styles/traffic.css'

// Every one of these shapes comes back as loosely-typed JSON from the traffic_light()
// aggregate. Every field is read defensively below — a project with no Gantt import, no
// deliveries logged and no contractors on file still has to render six blocks, not throw.
type Cat = { name_he: string; name_en: string; critical: boolean; matched: boolean; start: string | null; finish: string | null; base_start: string | null; gantt_pct: number | null; diary_pct: number | null; blocked_issue: number | null; color: ProjectLight['color'] }
type Item = { id: string; item: string; need_date: string; status: string; eta: string | null; gap_days: number | null; critical: boolean; color: ProjectLight['color'] }
type Crew = { name: string; critical: boolean; agreed: number; actual: number; ratio: number; days: number; absences: number; series: { date: string; workers: number }[]; color: ProjectLight['color'] }
type Iss = { id: string; seq: number; description: string; owner_kind: string; owner_email: string | null; due_date: string | null; days_open: number; blocking: boolean; systemic: boolean; color: ProjectLight['color'] }

const d = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—')

/** One axis (or the gray/reporting reason) as a colour-led card: dot + title + "make a task"
 *  button, one sentence of why, then the evidence table the caller passes as children.
 *  Hoisted to module scope — declaring this inside `TrafficProject`'s render body would hand
 *  React a new component type on every render, unmounting and remounting every block (and
 *  losing focus/state inside them) on each state change. */
function AxisBlock({ axis, color, reason, lang, onTask, empty, children }: {
  axis: AxisKey | 'gray'
  color: Color
  reason: string
  lang: Lang
  onTask: (axis: AxisKey | 'gray', title: string) => void
  empty?: boolean
  children?: ReactNode
}) {
  return (
    <section className={`tl-block tl-block--${color}`}>
      <div className="tl-block__head">
        <TrafficDot color={color} size="lg" />
        <div className="tl-block__title">{axisLabel(lang, axis)}</div>
        <button className="btn btn--ghost" onClick={() => onTask(axis, reason)}>
          ☑ {tl(lang, 'proj_task_btn')}
        </button>
      </div>
      <div className="tl-block__reason">{reason}</div>
      {empty ? <div className="tl-block__empty">{children}</div> : children}
    </section>
  )
}

/**
 * The 30-second view: what exactly is wrong with this one project, and who do I call.
 * Six blocks — one per axis plus open tasks — each leading with its colour and one sentence,
 * then the evidence behind that sentence. Reached from a board row (`TrafficBoard`); a snapshot
 * id in the query string reads that frozen payload instead of the live aggregate.
 */
export default function TrafficProject() {
  const { projectId = '' } = useParams()
  const [params] = useSearchParams()
  const snapId = params.get('snapshot')
  const { lang } = useI18n()
  const { projectName } = useStore()
  const [p, setP] = useState<ProjectLight | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [tasks, setTasks] = useState<WorkTask[]>([])
  const [err, setErr] = useState('')
  const [dialog, setDialog] = useState<{ axis: AxisKey | 'gray'; title: string } | null>(null)

  const reloadTasks = () =>
    fetchTasks().then((all) => setTasks(all.filter((x) => x.project_id === projectId && x.status === 'open'))).catch(() => {})

  useEffect(() => {
    let alive = true
    setP(null); setLoaded(false); setErr('')
    const load = snapId
      ? fetchSnapshot(snapId).then((s) => s.payload.find((x) => x.project_id === projectId) ?? null)
      : fetchTrafficLight(projectId).then((r) => r.find((x) => x.project_id === projectId) ?? null)
    load
      .then((r) => { if (alive) { setP(r); setLoaded(true) } })
      // Migrations 0064/0065 may not be live yet, or the RPC may otherwise refuse — fail
      // visibly rather than leaving the executive staring at a spinner forever.
      .catch((e) => { if (alive) { setErr(String((e as Error).message ?? e)); setLoaded(true) } })
    reloadTasks()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, snapId])

  if (err) return <div className="page"><div className="alert">⚠ {err}</div></div>
  if (!loaded) return <Loader full label={tl(lang, 'loading')} />
  // The RPC ran fine but this id isn't in it — an inactive project, a stale link, a typo.
  if (!p) return <div className="page"><div className="alert">⚠ {tl(lang, 'proj_not_found')}</div></div>

  const cats = (p.axes.time.evidence?.categories ?? []) as Cat[]
  const unmatched = (p.axes.time.evidence?.unmatched ?? []) as string[]
  const hasChart = Boolean(p.axes.time.evidence?.has_chart)
  const items = (p.axes.supply.evidence?.items ?? []) as Item[]
  const crew = (p.axes.crew.evidence?.contractors ?? []) as Crew[]
  const iss = (p.axes.issues.evidence?.items ?? []) as Iss[]

  const onTask = (axis: AxisKey | 'gray', title: string) => setDialog({ axis, title })

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker"><Link to={snapId ? `/traffic?snapshot=${snapId}` : '/traffic'}>‹ {tl(lang, 'proj_back')}</Link></div>
          <h1 className="page-title tl-project-head"><TrafficDot color={p.color} size="lg" /> {projectName(projectId)}</h1>
          <div className="tl-row__manager">
            {p.manager ?? ''} · {tl(lang, 'board_col_due')}: {d(p.due.contract)} / {d(p.due.forecast)}
            {p.due.delta_days != null && (
              <b className="mono"> ({p.due.delta_days > 0 ? '+' : ''}{p.due.delta_days})</b>
            )}
          </div>
        </div>
      </div>

      {p.color === 'gray' && p.gray_reason && (
        <AxisBlock axis="gray" color={p.color} reason={p.gray_reason} lang={lang} onTask={onTask} empty />
      )}

      <div className="tl-blocks">
        <AxisBlock axis="time" color={p.axes.time.color} reason={p.axes.time.reason} lang={lang} onTask={onTask} empty={cats.length === 0 && hasChart}>
          {!hasChart && <div className="hint">{tl(lang, 'proj_no_chart')}</div>}
          {cats.length === 0 ? (
            hasChart && tl(lang, 'proj_tasks_empty')
          ) : (
            <table className="tl-table m-cards">
              <thead>
                <tr>
                  <th>{tl(lang, 'cat_col_name')}</th><th>{tl(lang, 'cat_col_planned')}</th><th>{tl(lang, 'cat_col_baseline')}</th>
                  <th>{tl(lang, 'cat_col_gantt_pct')}</th><th>{tl(lang, 'cat_col_diary_pct')}</th><th>{tl(lang, 'cat_col_color')}</th>
                </tr>
              </thead>
              <tbody>
                {cats.map((c) => (
                  <tr key={c.name_he} className={c.critical ? 'is-critical' : ''}>
                    <td data-label={tl(lang, 'cat_col_name')}>
                      {lang === 'he' ? c.name_he : c.name_en}{c.critical ? ' ★' : ''}
                      {c.blocked_issue != null && (
                        <div className="hint">⚠ {tl(lang, 'cat_blocked_by')} #{c.blocked_issue}</div>
                      )}
                    </td>
                    <td className="mono" data-label={tl(lang, 'cat_col_planned')}>{c.matched ? `${d(c.start)}–${d(c.finish)}` : '—'}</td>
                    <td className="mono" data-label={tl(lang, 'cat_col_baseline')}>{d(c.base_start)}</td>
                    <td className="mono" data-label={tl(lang, 'cat_col_gantt_pct')}>{c.gantt_pct ?? '—'}</td>
                    <td className="mono" data-label={tl(lang, 'cat_col_diary_pct')}>{c.diary_pct ?? '—'}</td>
                    <td data-label={tl(lang, 'cat_col_color')}><TrafficDot color={c.matched ? c.color : 'na'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {unmatched.length > 0 && <div className="alert">⚠ {tl(lang, 'proj_unmatched')}: {unmatched.join(', ')}</div>}
        </AxisBlock>

        <AxisBlock axis="supply" color={p.axes.supply.color} reason={p.axes.supply.reason} lang={lang} onTask={onTask} empty={items.length === 0}>
          {items.length === 0 ? tl(lang, 'proj_tasks_empty') : (
            <table className="tl-table m-cards">
              <thead>
                <tr><th>{tl(lang, 'sup_col_item')}</th><th>{tl(lang, 'sup_col_need')}</th><th>{tl(lang, 'sup_col_status')}</th><th>{tl(lang, 'sup_col_eta')}</th><th>{tl(lang, 'sup_col_gap')}</th><th /></tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className={i.critical ? 'is-critical' : ''}>
                    <td data-label={tl(lang, 'sup_col_item')}>{i.item}</td>
                    <td className="mono" data-label={tl(lang, 'sup_col_need')}>{d(i.need_date)}</td>
                    <td data-label={tl(lang, 'sup_col_status')}>{deliveryStatusLabel(lang, i.status)}</td>
                    <td className="mono" data-label={tl(lang, 'sup_col_eta')}>{d(i.eta)}</td>
                    <td className="mono" data-label={tl(lang, 'sup_col_gap')}>{i.gap_days == null ? '—' : `${i.gap_days > 0 ? '+' : ''}${i.gap_days}`}</td>
                    <td data-label={tl(lang, 'cat_col_color')}><TrafficDot color={i.color} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Link className="btn btn--ghost" to={`/traffic/${projectId}/deliveries`}>{tl(lang, 'proj_deliveries_link')} ›</Link>
        </AxisBlock>

        <AxisBlock axis="client" color={p.axes.client.color} reason={p.axes.client.reason} lang={lang} onTask={onTask}>
          <div className="hint">{tl(lang, 'proj_phase2')}</div>
        </AxisBlock>

        <AxisBlock axis="crew" color={p.axes.crew.color} reason={p.axes.crew.reason} lang={lang} onTask={onTask} empty={crew.length === 0}>
          {crew.length === 0 ? tl(lang, 'proj_tasks_empty') : (
            <table className="tl-table m-cards">
              <thead>
                <tr><th>{tl(lang, 'crew_col_name')}</th><th>{tl(lang, 'crew_col_agreed')}</th><th>{tl(lang, 'crew_col_actual')}</th><th>{tl(lang, 'crew_col_ratio')}</th><th>{tl(lang, 'crew_col_absences')}</th><th>{tl(lang, 'crew_chart_title')}</th></tr>
              </thead>
              <tbody>
                {crew.map((c) => {
                  const series = c.series ?? []
                  // No reported days at all — a dashed baseline reads as "nothing on file",
                  // distinct from a red bar (a day that was reported with zero workers).
                  const noData = series.length === 0
                  return (
                    <tr key={c.name} className={c.critical ? 'is-critical' : ''}>
                      <td data-label={tl(lang, 'crew_col_name')}>{c.name}{c.critical ? ' ★' : ''}</td>
                      <td className="mono" data-label={tl(lang, 'crew_col_agreed')}>{c.agreed}</td>
                      <td className="mono" data-label={tl(lang, 'crew_col_actual')}>{c.actual}</td>
                      <td className="mono" data-label={tl(lang, 'crew_col_ratio')}>{Math.round((c.ratio ?? 0) * 100)}%</td>
                      <td className="mono" data-label={tl(lang, 'crew_col_absences')}>{c.absences}</td>
                      <td data-label={tl(lang, 'crew_chart_title')}>
                        {noData ? (
                          <div className="tl-bars tl-bars--empty" title={tl(lang, 'proj_tasks_empty')}>
                            <i /><i /><i /><i />
                          </div>
                        ) : (
                          <div className="tl-bars" title={series.map((s) => `${s.date}: ${s.workers}`).join('\n')}>
                            {series.map((s) => (
                              <i key={s.date} className={s.workers === 0 ? 'zero' : ''}
                                 style={{ height: `${Math.min(100, (s.workers / Math.max(1, c.agreed || 1)) * 100)}%` }} />
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </AxisBlock>

        <AxisBlock axis="issues" color={p.axes.issues.color} reason={p.axes.issues.reason} lang={lang} onTask={onTask} empty={iss.length === 0}>
          {iss.length === 0 ? tl(lang, 'proj_tasks_empty') : (
            <table className="tl-table m-cards">
              <thead>
                <tr><th>#</th><th>{tl(lang, 'iss_col_desc')}</th><th>{tl(lang, 'iss_col_owner')}</th><th>{tl(lang, 'iss_col_days')}</th><th>{tl(lang, 'iss_col_blocking')}</th><th /></tr>
              </thead>
              <tbody>
                {iss.map((i) => (
                  <tr key={i.id}>
                    <td className="mono" data-label="#">{i.seq}</td>
                    <td data-label={tl(lang, 'iss_col_desc')}>{i.description}{i.systemic ? ' · ⚠ ' + tl(lang, 'iss_col_systemic') : ''}</td>
                    <td data-label={tl(lang, 'iss_col_owner')}>{ownerLabel(lang, i.owner_kind)}{i.owner_email ? ` · ${i.owner_email}` : ''}</td>
                    <td className="mono" data-label={tl(lang, 'iss_col_days')}>{i.days_open}</td>
                    <td data-label={tl(lang, 'iss_col_blocking')}>{i.blocking ? '✓' : ''}</td>
                    <td data-label={tl(lang, 'cat_col_color')}><TrafficDot color={i.color} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Link className="btn btn--ghost" to={`/traffic/${projectId}/issues`}>{tl(lang, 'proj_issues_link')} ›</Link>
        </AxisBlock>

        <section className="tl-block">
          <div className="tl-block__head"><div className="tl-block__title">☑ {tl(lang, 'proj_tasks_title')}</div></div>
          {tasks.length === 0 ? <div className="tl-block__empty">{tl(lang, 'proj_tasks_empty')}</div> : (
            <table className="tl-table m-cards">
              <thead><tr><th>{tl(lang, 'proj_task_what')}</th><th>{tl(lang, 'proj_task_who')}</th><th>{tl(lang, 'proj_task_when')}</th></tr></thead>
              <tbody>
                {tasks.map((x) => (
                  <tr key={x.id}>
                    <td data-label={tl(lang, 'proj_task_what')}>{x.title}</td>
                    <td data-label={tl(lang, 'proj_task_who')}>{x.assignee_email ?? '—'}</td>
                    <td className="mono" data-label={tl(lang, 'proj_task_when')}>{d(x.due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Link className="btn btn--ghost" to="/tasks">☑ ›</Link>
        </section>
      </div>

      <div className="tl-footer">
        {/* Logbook reads only ?p= for a project filter (src/screens/Logbook.tsx) — it has no
            date-range URL param, so a `from=` here would silently do nothing. Filtering by
            project alone still lands on the right list, most-recent first. */}
        <Link className="btn btn--ghost" to={`/?p=${projectId}`}>📓 {tl(lang, 'proj_logbook_link')}</Link>
        <Link className="btn btn--ghost" to={`/gantt?project=${projectId}`}>▬ {tl(lang, 'proj_gantt_link')}</Link>
      </div>

      {dialog && (
        <TaskDialog
          projectId={projectId}
          axis={dialog.axis}
          defaultTitle={dialog.title}
          onClose={() => setDialog(null)}
          onCreated={reloadTasks}
        />
      )}
    </div>
  )
}
