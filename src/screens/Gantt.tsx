// Project schedule: pick a project, import a Microsoft Project file, work the board.
//
// Importing is one action from the user's side — choose a file. Behind it the bytes go
// to the MPXJ converter, come back as JSON, and land as rows; the board that follows is
// the live schedule, so a bar moved here is a bar moved for everyone.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useI18n } from '../i18n'
import { useStore } from '../store'
import { usePerms } from '../lib/usePerms'
import { Loader } from '../components/Loader'
import { stagger, riseIn } from '../components/ui'
import { GanttChart, type TaskChange } from '../components/GanttChart'
import { gt } from '../gantt/i18n'
import {
  GanttError, IMPORT_ACCEPT, archiveChart, convertFile, fetchBundle, fetchCharts,
  importSchedule, logScheduleEdit, patchTasks, pingConverter, touchChart, type TaskPatch,
} from '../gantt/api'
import type { GanttBundle, GanttChart as Chart, GanttTask } from '../gantt/model'
import { notifyScheduleChanged } from '../lib/notifyNewRecord'
import { useMediaQuery } from '../lib/useMediaQuery'

type Phase = 'idle' | 'converting' | 'saving'

export default function GanttScreen() {
  const { lang } = useI18n()
  const g = useCallback((k: string) => gt(lang, k), [lang])
  const { projects } = useStore()
  const { canEdit } = usePerms()
  // May edit at all, versus editing right now. The schedule is the one screen where a stray
  // drag silently moves a date somebody else is working to, so editing is a mode you enter.
  const mayEdit = canEdit('gantt')
  const [editing, setEditing] = useState(false)
  // Same breakpoint the board uses, so the toolbar and the board never disagree about
  // whether editing is possible.
  const phone = useMediaQuery('(max-width: 760px)')

  // Loaded data is tagged with what it was loaded for, and read back only when the tag
  // still matches. Nothing has to be cleared when the selection changes, so switching
  // projects never flashes the previous project's schedule.
  const [pickedProject, setPickedProject] = useState('')
  const [pickedChart, setPickedChart] = useState('')
  const [chartList, setChartList] = useState<{ project: string; rows: Chart[] } | null>(null)
  const [loaded, setLoaded] = useState<GanttBundle | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [note, setNote] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const active = useMemo(() => projects.filter((p) => p.active), [projects])
  const projectId = pickedProject || active[0]?.id || ''
  const charts = chartList?.project === projectId ? chartList.rows : null
  const chartId = charts?.some((c) => c.id === pickedChart) ? pickedChart : charts?.[0]?.id ?? ''
  const bundle = loaded?.chart.id === chartId ? loaded : null

  useEffect(() => {
    if (!projectId) return
    let alive = true
    fetchCharts(projectId)
      .then((rows) => { if (alive) setChartList({ project: projectId, rows }) })
      .catch(() => {
        if (!alive) return
        setChartList({ project: projectId, rows: [] })
        setProblem(g('err_convert_failed'))
      })
    return () => { alive = false }
  }, [projectId, g])

  // Wake the converter while the user is still picking a project, so a scale-to-zero
  // host has booted by the time they choose a file.
  useEffect(() => {
    if (mayEdit) void pingConverter()
  }, [mayEdit])

  useEffect(() => {
    if (!chartId) return
    let alive = true
    fetchBundle(chartId)
      .then((b) => { if (alive) setLoaded(b) })
      .catch(() => { if (alive) setProblem(g('err_convert_failed')) })
    return () => { alive = false }
  }, [chartId, g])

  async function onPick(file: File | undefined) {
    if (!file || !projectId) return
    setProblem(null)
    setNote(null)
    setPhase('converting')
    try {
      const payload = await convertFile(file)
      setPhase('saving')
      const { chart, taskCount, linkCount } = await importSchedule(projectId, payload, file)
      setChartList({ project: projectId, rows: [chart, ...(charts ?? [])] })
      setPickedChart(chart.id)
      setNote(`${g('g_imported')} — ${taskCount} ${g('g_tasks_word')}, ${linkCount} ${g('g_links_word')}`)
    } catch (e) {
      setProblem(e instanceof GanttError ? g(e.message) : g('err_convert_failed'))
    } finally {
      setPhase('idle')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  /**
   * Apply an edit locally first so the board answers the drag immediately, then write.
   * A failed write puts the previous rows back rather than leaving the screen showing a
   * schedule the database does not have.
   */
  const onEdit = useCallback((changes: TaskChange[]) => {
    if (!bundle || !changes.length) return
    const before = bundle
    const patchByTask = new Map<string, TaskPatch>()
    for (const c of changes) {
      const patch: TaskPatch = {}
      if (c.span) { patch.start_ts = c.span.start_ts; patch.finish_ts = c.span.finish_ts }
      if (c.pct !== undefined) patch.pct = c.pct
      if (Object.keys(patch).length) patchByTask.set(c.task.id, patch)
    }
    if (!patchByTask.size) return

    const nextTasks: GanttTask[] = bundle.tasks.map((t) => {
      const patch = patchByTask.get(t.id)
      return patch ? { ...t, ...patch } : t
    })
    const span = nextTasks.reduce(
      (acc, t) => ({
        start: !acc.start || t.start_ts < acc.start ? t.start_ts : acc.start,
        finish: !acc.finish || t.finish_ts > acc.finish ? t.finish_ts : acc.finish,
      }),
      { start: '', finish: '' },
    )
    setLoaded({ ...bundle, tasks: nextTasks })
    setProblem(null)

    void (async () => {
      try {
        await patchTasks([...patchByTask].map(([id, patch]) => ({ id, patch })))
        await touchChart(before.chart.id, span)
        await logScheduleEdit(before.chart, {
          tasks: changes.map((c) => ({ ext_uid: c.task.ext_uid, name: c.task.name, ...patchByTask.get(c.task.id) })),
        })
        // After the write, not before: nobody should be told the schedule moved if it did not.
        // One notice per save, however many bars were dragged.
        notifyScheduleChanged(before.chart.project_id, patchByTask.size)
      } catch {
        setLoaded(before)
        setProblem(g('err_save_failed'))
      }
    })()
  }, [bundle, g])

  async function onArchive() {
    if (!bundle || !window.confirm(g('g_archive_ask'))) return
    const id = bundle.chart.id
    try {
      await archiveChart(id)
      setChartList({ project: projectId, rows: (charts ?? []).filter((c) => c.id !== id) })
      setPickedChart('')
      setLoaded(null)
    } catch {
      setProblem(g('err_save_failed'))
    }
  }

  const busy = phase !== 'idle'
  const chart = bundle?.chart

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{g('g_kicker')}</div>
          <h1 className="page-title">{g('g_nav')}</h1>
        </div>
      </div>

      {/* minWidth 0 all the way down: grid and flex items otherwise refuse to shrink
          below the width of the schedule board, which then overflows the page */}
      <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'grid', gap: 14, minWidth: 0 }}>
        <motion.div variants={riseIn} className="panel" style={{ padding: '12px 14px', display: 'flex', flexWrap: 'wrap', gap: '10px 14px', alignItems: 'flex-end' }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span className="gantt__label">{g('g_pick_project')}</span>
            <select className="input" style={{ minWidth: 200 }} value={projectId} onChange={(e) => setPickedProject(e.target.value)}>
              {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>

          {(charts?.length ?? 0) > 0 && (
            <label style={{ display: 'grid', gap: 4 }}>
              <span className="gantt__label">{g('g_pick_chart')}</span>
              <select className="input" style={{ minWidth: 220 }} value={chartId} onChange={(e) => setPickedChart(e.target.value)}>
                {(charts ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {new Date(c.imported_at).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB')}
                  </option>
                ))}
              </select>
            </label>
          )}

          <span style={{ flex: '1 1 20px' }} />

          {mayEdit && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept={IMPORT_ACCEPT}
                hidden
                onChange={(e) => void onPick(e.target.files?.[0])}
              />
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy || !projectId}
                onClick={() => fileRef.current?.click()}
              >
                {phase === 'converting' ? g('g_converting') : phase === 'saving' ? g('g_saving_rows') : charts?.length ? g('g_replace') : g('g_import')}
              </button>
              {chart && (
                <button type="button" className="btn btn--danger" disabled={busy} onClick={() => void onArchive()}>
                  {g('g_archive')}
                </button>
              )}
            </>
          )}
        </motion.div>

        {note && <motion.div variants={riseIn}><div className="tag tag--green">{note}</div></motion.div>}
        {problem && <motion.div variants={riseIn}><div className="tag tag--clay">{problem}</div></motion.div>}

        {busy && <Loader label={phase === 'converting' ? g('g_converting') : g('g_saving_rows')} />}

        {!busy && charts !== null && charts.length === 0 && (
          <motion.div variants={riseIn} className="panel" style={{ padding: 22, display: 'grid', gap: 6 }}>
            <b>{g('g_none')}</b>
            <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>{g('g_none_hint')}</span>
          </motion.div>
        )}

        {!busy && chartId && !bundle && <Loader label={g('g_nav')} />}

        {bundle && chart && (
          <motion.div variants={riseIn} style={{ display: 'grid', gap: 10, minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px', fontSize: 12, color: 'var(--ink-faint)' }}>
              {chart.source_file && <span>{g('g_source')}: <code className="mono">{chart.source_file}</code></span>}
              <span>{g('g_imported_on')}: {new Date(chart.imported_at).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB')}</span>
            </div>
            <div className="gantt__editbar">
              {/* The board is view-only on a phone by design — the bars are a few pixels wide and
                  a stray drag moves a date somebody is working to. Offering an edit button there
                  would promise something the board then refuses, so say why instead. */}
              {phone ? (
                <span className="gantt__editnote">{g('g_edit_phone')}</span>
              ) : mayEdit ? (
                <>
                  <button
                    type="button"
                    className={`btn ${editing ? 'btn--primary' : 'btn--ghost'}`}
                    aria-pressed={editing}
                    onClick={() => setEditing((v) => !v)}
                  >{editing ? g('g_edit_done') : g('g_edit_off')}</button>
                  {editing && <span className="gantt__editnote">{g('g_edit_on')}</span>}
                </>
              ) : (
                <span className="gantt__editnote">{g('g_edit_locked')}</span>
              )}
            </div>
            <GanttChart
              key={chart.id}
              tasks={bundle.tasks}
              links={bundle.links}
              canEdit={mayEdit && editing}
              onEdit={onEdit}
            />
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
