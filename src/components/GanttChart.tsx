// The schedule board: task tree on one side, draggable bars on a day grid on the other.
//
// The component owns view state (zoom, collapse, filter, selection) and the live drag
// preview. It owns no persistence: when a drag settles it hands the parent every task
// whose dates moved — the dragged one plus whatever the dependency links pushed out —
// and the parent decides what to write.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { useMediaQuery } from '../lib/useMediaQuery'
import { gt } from '../gantt/i18n'
import {
  DAY_MS, DEFAULT_FINISH_TIME, DEFAULT_START_TIME,
  buildTree, cascade, dayOf, hasChildren, paymentMilestones, rollUp,
  spanDays, summarize, visibleRows, withDay,
  type GanttLink, type GanttTask, type PaymentMilestone, type Span,
} from '../gantt/model'
import '../styles/gantt.css'

// Kept in step with --gantt-row in styles/gantt.css: the dependency overlay and the
// canvas are absolutely positioned, so they need the row pitch as a number.
const ROW_H = 30
const ZOOMS = [
  { px: 3, key: 'g_scale_all' },
  { px: 6, key: 'g_scale_mid' },
  { px: 14, key: 'g_scale_week' },
] as const

export interface TaskChange {
  task: GanttTask
  span?: Span
  pct?: number
  /** Toggling the per-task overrun alert. Carried on the same channel as a date change so the
   *  screen has one save path rather than two. */
  alertOnOverrun?: boolean
}

interface Props {
  tasks: GanttTask[]
  links: GanttLink[]
  canEdit: boolean
  /** Wall-clock date the "today" marker sits on; defaults to the browser's date. */
  today?: string
  busy?: boolean
  onEdit: (changes: TaskChange[]) => void
}

type DragMode = 'move' | 'start' | 'end'
interface Drag {
  uid: number
  mode: DragMode
  originX: number
  /** Whole days the pointer has travelled, snapped to the grid. */
  offsetDays: number
}

function localDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A phone has no pointer to hover with, and a narrow window cannot show four months. */
const coarsePointer = () => typeof matchMedia === 'function' && !matchMedia('(hover: hover)').matches
const narrowScreen = () => typeof innerWidth === 'number' && innerWidth < 760

/** Matches the breakpoint the stylesheet treats as a phone. */
const PHONE = '(max-width: 760px)'

export function GanttChart({ tasks, links, canEdit, today, busy, onEdit }: Props) {
  const { lang } = useI18n()
  const g = (k: string) => gt(lang, k)

  // Read-only on a phone whatever the permission says: the bars are a few pixels wide at
  // this zoom, so a drag is as likely to reschedule the wrong task as the right one, and
  // an accidental one writes to the live plan for everybody.
  const phone = useMediaQuery(PHONE)
  const mayEdit = canEdit && !phone

  // a phone starts zoomed out: at 6px/day only six weeks fit beside the task column
  const [px, setPx] = useState(() => (narrowScreen() ? 3 : 6))
  const [canHover] = useState(() => !coarsePointer())
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(new Set())
  const [showDeps, setShowDeps] = useState(false)
  const [openOnly, setOpenOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [hover, setHover] = useState<{ uid: number; x: number; y: number } | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const hot = hover?.uid ?? null

  const todayISO = `${today ?? localDate()}T00:00:00`

  // ---------- timeline window, padded out to whole weeks ----------
  const window_ = useMemo(() => {
    if (!tasks.length) return { from: dayOf(todayISO), days: 30 }
    let first = Infinity
    let last = -Infinity
    for (const t of tasks) {
      first = Math.min(first, dayOf(t.start_ts))
      last = Math.max(last, dayOf(t.finish_ts))
    }
    const from = first - (new Date(first * DAY_MS).getUTCDay() + 7)
    const to = last + (13 - new Date(last * DAY_MS).getUTCDay())
    return { from, days: to - from + 1 }
  }, [tasks, todayISO])

  const x = (day: number) => (day - window_.from) * px
  const width = window_.days * px
  const todayX = x(dayOf(todayISO)) + px / 2
  const todayVisible = dayOf(todayISO) >= window_.from && dayOf(todayISO) < window_.from + window_.days

  const tree = useMemo(() => buildTree(tasks), [tasks])
  const byUid = tree.byUid

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtering = !!needle || openOnly
    return visibleRows(tree, collapsed, !filtering ? undefined : (t) => {
      if (openOnly && t.pct >= 100) return false
      if (!needle) return true
      return `${t.name} ${t.resources.join(' ')}`.toLowerCase().includes(needle)
    })
  }, [tree, collapsed, query, openOnly])

  const pays = useMemo(() => paymentMilestones(tasks), [tasks])
  const paidPct = pays.filter((p) => p.paid).reduce((a, p) => a + p.pct, 0)
  const stats = useMemo(() => summarize(tasks, todayISO), [tasks, todayISO])

  // ---------- drag ----------
  // Pointer capture would be lost the moment React re-renders the bar, so the move and
  // release handlers live on window for the duration of the gesture.
  useEffect(() => {
    if (!drag) return

    const dayDelta = (ev: PointerEvent) => Math.round((ev.clientX - drag.originX) / px)

    const onMove = (ev: PointerEvent) => {
      const delta = dayDelta(ev)
      setDrag((d) => (d && d.offsetDays !== delta ? { ...d, offsetDays: delta } : d))
    }

    const onUp = (ev: PointerEvent) => {
      const delta = dayDelta(ev)
      setDrag(null)
      if (!delta) return

      const task = byUid.get(drag.uid)
      if (!task) return
      const moved = spanFor(task, drag.mode, delta)
      if (moved.start_ts === task.start_ts && moved.finish_ts === task.finish_ts) return

      const edits = new Map<number, Span>([[drag.uid, moved]])
      const pushed = cascade(tasks, links, edits)
      const rolled = rollUp(tasks, pushed)

      const changes: TaskChange[] = []
      for (const [uid, span] of pushed) {
        const t = byUid.get(uid)
        if (t) changes.push({ task: t, span })
      }
      for (const [uid, span] of rolled) {
        const t = byUid.get(uid)
        if (!t || pushed.has(uid)) continue
        changes.push({ task: t, span: { start_ts: span.start_ts, finish_ts: span.finish_ts } })
      }
      onEdit(changes)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [drag, px, tasks, links, byUid, onEdit])

  /** Where a task lands for a given gesture. A bar never shrinks past a single day. */
  function spanFor(task: GanttTask, mode: DragMode, delta: number): Span {
    const s = dayOf(task.start_ts)
    const f = dayOf(task.finish_ts)
    if (mode === 'move') {
      return {
        start_ts: withDay(task.start_ts, s + delta, DEFAULT_START_TIME),
        finish_ts: withDay(task.finish_ts, f + delta, DEFAULT_FINISH_TIME),
      }
    }
    if (mode === 'start') {
      const next = Math.min(s + delta, f)
      return { start_ts: withDay(task.start_ts, next, DEFAULT_START_TIME), finish_ts: task.finish_ts }
    }
    const next = Math.max(f + delta, s)
    return { start_ts: task.start_ts, finish_ts: withDay(task.finish_ts, next, DEFAULT_FINISH_TIME) }
  }

  /** Live preview: the dragged bar follows the pointer, everything else stays put. */
  const preview = (task: GanttTask): { startDay: number; finishDay: number } => {
    if (drag && drag.uid === task.ext_uid && drag.offsetDays) {
      const span = spanFor(task, drag.mode, drag.offsetDays)
      return { startDay: dayOf(span.start_ts), finishDay: dayOf(span.finish_ts) }
    }
    return { startDay: dayOf(task.start_ts), finishDay: dayOf(task.finish_ts) }
  }

  function beginDrag(ev: React.PointerEvent, task: GanttTask, mode: DragMode) {
    if (!mayEdit || busy || task.is_summary) return
    ev.preventDefault()
    ev.stopPropagation()
    setSelected(task.ext_uid)
    setDrag({ uid: task.ext_uid, mode, originX: ev.clientX, offsetDays: 0 })
  }

  // ---------- header scaffolding ----------
  const months = useMemo(() => {
    const out: { label: string; year: number; from: number; to: number }[] = []
    const first = new Date(window_.from * DAY_MS)
    let cursor = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1)
    const lastDay = window_.from + window_.days - 1
    while (Math.round(cursor / DAY_MS) <= lastDay) {
      const d = new Date(cursor)
      const monthStart = Math.round(cursor / DAY_MS)
      const monthEnd = Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0) / DAY_MS)
      const from = Math.max(window_.from, monthStart)
      const to = Math.min(lastDay, monthEnd)
      if (to >= from) {
        out.push({
          label: new Date(cursor).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { month: 'long', timeZone: 'UTC' }),
          year: d.getUTCFullYear(),
          from,
          to,
        })
      }
      cursor = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
    }
    return out
  }, [window_, lang])

  const ticks = useMemo(() => {
    const step = px >= 12 ? 7 : px >= 5 ? 14 : 28
    const out: { day: number; label: string }[] = []
    for (let i = 0; i < window_.days; i += step) {
      const d = new Date((window_.from + i) * DAY_MS)
      out.push({ day: window_.from + i, label: `${d.getUTCDate()}.${d.getUTCMonth() + 1}` })
    }
    return { step, out }
  }, [window_, px])

  const weekends = useMemo(() => {
    const out: number[] = []
    for (let i = 0; i < window_.days; i++) {
      const dow = new Date((window_.from + i) * DAY_MS).getUTCDay()
      if (dow === 5 || dow === 6) out.push(window_.from + i) // Fri–Sat
    }
    return out
  }, [window_])

  function scrollToToday() {
    const board = boardRef.current
    if (!board || !todayVisible) return
    const tasksW = board.querySelector('.gantt__pane-tasks')?.clientWidth ?? 0
    board.scrollLeft = Math.max(0, todayX - (board.clientWidth - tasksW) * 0.42)
  }

  function toggle(uid: number) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  const fmtDay = (day: number) =>
    new Date(day * DAY_MS).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', {
      day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC',
    })

  const selectedTask = selected !== null ? byUid.get(selected) ?? null : null
  const rowIndex = new Map(rows.map((t, i) => [t.ext_uid, i]))

  return (
    <div className={`gantt ${mayEdit ? 'is-editing' : ''}`}>
      <div className="stat-grid gantt__stats">
        <Stat label={g('g_progress')} value={`${stats.overallPct}%`} />
        <Stat label={g('g_start')} value={stats.spanStart ? fmtDay(dayOf(stats.spanStart)) : '—'} />
        <Stat label={g('g_finish')} value={stats.spanFinish ? fmtDay(dayOf(stats.spanFinish)) : '—'} />
        <Stat label={g('g_done')} value={`${stats.doneCount}/${stats.leafCount}`} />
        <Stat label={g('g_wip')} value={String(stats.wipCount)} />
        <Stat label={g('g_overdue')} value={String(stats.overdueCount)} tone={stats.overdueCount ? 'warn' : undefined} />
      </div>

      {pays.length > 0 && (
        <div className="panel gantt__pay" style={{ padding: '12px 14px', display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span className="gantt__label">{g('g_pay_title')}</span>
            <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
              <b style={{ fontFamily: 'var(--font-mono)' }}>{paidPct}%</b> {g('g_pay_released')} ·{' '}
              <b style={{ fontFamily: 'var(--font-mono)' }}>{100 - paidPct}%</b> {g('g_pay_open')}
            </span>
          </div>
          <div style={{ display: 'flex', height: 26, border: '1px solid var(--panel-edge)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
            {pays.map((p) => (
              <div
                key={p.ext_uid}
                title={`${p.pct}% — ${p.label}`}
                style={{
                  flex: `${p.pct} 0 0`,
                  display: 'grid',
                  placeItems: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: p.paid ? '#fff' : 'var(--ink-faint)',
                  background: p.paid ? 'var(--gantt-pay, #7a3e86)' : 'var(--field)',
                  borderInlineStart: '1px solid var(--panel)',
                }}
              >
                {p.pct}%
              </div>
            ))}
          </div>
          <ul className="gantt__pay-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 18px', margin: 0, padding: 0, fontSize: 12.5, color: 'var(--ink-3)' }}>
            {pays.map((p) => (
              <li key={p.ext_uid} style={{ listStyle: 'none', display: 'flex', gap: 7, alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ink)', minWidth: 29 }}>{p.pct}%</span>
                <span>{p.label}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: p.paid ? 'var(--gantt-pay, #7a3e86)' : 'var(--ink-faint)' }}>
                  {p.paid ? g('g_pay_paid') : fmtDay(dayOf(p.date))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="gantt__bar">
        <span className="gantt__label">{g('g_scale')}</span>
        <div className="gantt__seg" role="group" aria-label={g('g_scale')}>
          {ZOOMS.map((z) => (
            <button
              key={z.px}
              type="button"
              aria-pressed={px === z.px}
              onClick={() => setPx(z.px)}
            >
              {g(z.key)}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--quiet" onClick={() => setCollapsed(new Set(tree.children.keys()))}>{g('g_collapse')}</button>
        <button type="button" className="btn btn--quiet" onClick={() => setCollapsed(new Set())}>{g('g_expand')}</button>
        <button type="button" className="btn btn--quiet" onClick={scrollToToday} disabled={!todayVisible}>{g('g_goto_today')}</button>
        <label className="gantt__check">
          <input type="checkbox" checked={showDeps} onChange={(e) => setShowDeps(e.target.checked)} />
          {g('g_deps')}
        </label>
        <label className="gantt__check">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          {g('g_open_only')}
        </label>
        <input
          className="input"
          type="search"
          value={query}
          placeholder={g('g_search_ph')}
          aria-label={g('g_search')}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 190 }}
        />
        <div className="gantt__legend" style={{ marginInlineStart: 'auto' }}>
          <span><i className="gantt__swatch gantt__swatch--done" />{g('g_done')}</span>
          <span><i className="gantt__swatch gantt__swatch--wip" />{g('g_wip')}</span>
          <span><i className="gantt__swatch gantt__swatch--todo" />{g('g_todo')}</span>
          <span><i className="gantt__swatch gantt__swatch--sum" />{g('g_summary')}</span>
          <span><i className="gantt__swatch gantt__swatch--ms" />{g('g_milestone')}</span>
          <span><i className="gantt__swatch gantt__swatch--pay" />{g('g_payment')}</span>
        </div>
      </div>

      <div
        className={`gantt__board${drag ? ' gantt__board--dragging' : ''}`}
        ref={boardRef}
        onMouseMove={(ev) => {
          // Touch devices synthesize a mousemove on tap, which would flash a card that
          // then has nothing to dismiss it; they read the selected-task panel instead,
          // which sits above the board on a narrow screen.
          if (!canHover) return
          // one handler for the whole board rather than two per row: 63 rows of
          // enter/leave listeners re-render the dependency overlay on every crossing
          const host = (ev.target as HTMLElement).closest<HTMLElement>('[data-uid]')
          const uid = host ? Number(host.dataset.uid) : null
          if (uid === null || Number.isNaN(uid)) { setHover(null); return }
          setHover({ uid, x: ev.clientX, y: ev.clientY })
        }}
        onMouseLeave={() => setHover(null)}
      >
        <div className="gantt__inner">
          <div className="gantt__pane-tasks">
            <div className="gantt__head">
              <span className="gantt__col">{g('g_col_task')}</span>
              <span className="gantt__col gantt__col--end">{g('g_col_meta')}</span>
            </div>
            {rows.map((t) => {
              const parent = hasChildren(tree, t.ext_uid)
              const open = !collapsed.has(t.ext_uid)
              return (
                <div
                  key={t.id}
                  className={
                    'gantt__row'
                    + (parent ? ' gantt__row--sum' : '')
                    + (t.pct >= 100 ? ' gantt__row--done' : '')
                    + (hot === t.ext_uid ? ' is-hot' : '')
                    + (selected === t.ext_uid ? ' is-sel' : '')
                  }
                  data-uid={t.ext_uid}
                  onClick={() => setSelected(t.ext_uid)}
                >
                  {/* step comes from CSS so a phone can indent less and leave room for the name */}
                  <span style={{ flex: 'none', width: `calc(var(--gantt-indent) * ${Math.min(tree.depthOf.get(t.ext_uid) ?? 0, 6)})` }} />
                  {parent ? (
                    <button
                      type="button"
                      className="gantt__twist"
                      aria-expanded={open}
                      aria-label={`${open ? g('g_collapse') : g('g_expand')} — ${t.name}`}
                      onClick={(e) => { e.stopPropagation(); toggle(t.ext_uid) }}
                    >
                      {open ? '▾' : lang === 'he' ? '◂' : '▸'}
                    </button>
                  ) : (
                    <span className="gantt__twig">·</span>
                  )}
                  <span className="gantt__name" title={t.name}>{t.name}</span>
                  <span className="gantt__date">{fmtDay(dayOf(t.start_ts))}</span>
                  <span className={'gantt__pct' + (t.pct >= 100 ? ' gantt__pct--full' : t.pct === 0 ? ' gantt__pct--none' : '')}>
                    {t.milestone && t.pct === 0 ? '—' : `${t.pct}%`}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="gantt__pane-time" style={{ width }}>
            <div className="gantt__head">
              <div className="gantt__months" style={{ width }}>
                {months.map((m) => {
                  const w = (m.to - m.from + 1) * px
                  return (
                    <div key={`${m.year}-${m.from}`} className="gantt__month" style={{ left: x(m.from), width: w }}>
                      {w > 50 ? m.label : w > 26 ? m.label.slice(0, 3) : ''}
                      {w > 86 && <i>{String(m.year).slice(2)}&rsquo;</i>}
                    </div>
                  )
                })}
              </div>
              <div className="gantt__days" style={{ width }}>
                {ticks.out.map((tk) => (
                  <div key={tk.day} className="gantt__tick" style={{ left: x(tk.day), width: ticks.step * px }}>{tk.label}</div>
                ))}
              </div>
            </div>

            <div className="gantt__canvas" style={{ width, height: rows.length * ROW_H }}>
              {weekends.map((day) => (
                <div key={day} className="gantt__we" style={{ left: x(day), width: px }} />
              ))}
              {months.slice(1).map((m) => (
                <div key={`l${m.from}`} className="gantt__mline" style={{ left: x(m.from) }} />
              ))}
            </div>

            <svg className="gantt__deps" width={width} height={rows.length * ROW_H} aria-hidden="true">
              {showDeps && links.map((link) => {
                const from = rowIndex.get(link.pred_ext_uid)
                const to = rowIndex.get(link.succ_ext_uid)
                if (from === undefined || to === undefined) return null
                const pred = byUid.get(link.pred_ext_uid)
                const succ = byUid.get(link.succ_ext_uid)
                if (!pred || !succ) return null
                const x1 = x(preview(pred).finishDay + 1)
                const y1 = from * ROW_H + ROW_H / 2
                const x2 = x(preview(succ).startDay)
                const y2 = to * ROW_H + ROW_H / 2
                const knee = x2 > x1 + 12 ? x2 - 7 : x1 + 7
                return (
                  <g key={link.id}>
                    <path d={`M${x1} ${y1} H${knee} V${y2} H${x2 - 4}`} />
                    <polygon points={`${x2 - 4},${y2 - 3.2} ${x2 - 4},${y2 + 3.2} ${x2 + 1},${y2}`} />
                  </g>
                )
              })}
            </svg>

            {todayVisible && (
              <>
                <div className="gantt__today" style={{ left: todayX }} />
                <div className="gantt__today-tag" style={{ left: todayX }}>
                  {g('g_today')} {fmtDay(dayOf(todayISO))}
                </div>
              </>
            )}

            {rows.map((t) => {
              const { startDay, finishDay } = preview(t)
              const left = x(startDay)
              const parent = hasChildren(tree, t.ext_uid)
              const editable = mayEdit && !busy && !t.is_summary
              const dragging = drag?.uid === t.ext_uid
              const isSel = selected === t.ext_uid
              const pay = pays.find((p) => p.ext_uid === t.ext_uid)
              const chipLeft = t.milestone ? left + px / 2 + 11 : left + Math.max(px, (finishDay - startDay + 1) * px) + 7

              return (
                <div
                  key={t.id}
                  className={'gantt__lane' + (hot === t.ext_uid ? ' is-hot' : '') + (isSel ? ' is-sel' : '')}
                  data-uid={t.ext_uid}
                  onClick={() => setSelected(t.ext_uid)}
                >
                  {t.milestone ? (
                    <div
                      className={
                        'gantt__ms'
                        + (pay ? (pay.paid ? ' gantt__ms--paid' : ' gantt__ms--due') : '')
                        + (editable ? ' is-editable' : '')
                        + (isSel ? ' is-sel' : '')
                      }
                      style={{ left: left + px / 2 }}
                      onPointerDown={(e) => beginDrag(e, t, 'move')}
                    />
                  ) : (
                    <div
                      className={
                        'gantt__bar-shape'
                        + (parent ? ' gantt__bar-shape--sum' : t.pct >= 100 ? ' gantt__bar-shape--done' : t.pct > 0 ? ' gantt__bar-shape--wip' : '')
                        + (editable ? ' is-editable' : '')
                        + (dragging ? ' is-moving' : '')
                        + (isSel ? ' is-sel' : '')
                      }
                      style={{ left, width: Math.max(px, (finishDay - startDay + 1) * px) }}
                      onPointerDown={(e) => beginDrag(e, t, 'move')}
                    >
                      {!parent && t.pct > 0 && t.pct < 100 && <span className="gantt__fill" style={{ width: `${t.pct}%` }} />}
                      {editable && (
                        <>
                          <span className="gantt__grip gantt__grip--start" onPointerDown={(e) => beginDrag(e, t, 'start')} />
                          <span className="gantt__grip gantt__grip--end" onPointerDown={(e) => beginDrag(e, t, 'end')} />
                        </>
                      )}
                    </div>
                  )}
                  {!parent && t.resources.length > 0 && px >= 6 && (
                    <span className="gantt__chip" style={{ left: chipLeft }}>{t.resources.join(', ')}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {hover && !drag && (
        <HoverCard
          task={byUid.get(hover.uid) ?? null}
          x={hover.x}
          y={hover.y}
          isSummary={hasChildren(tree, hover.uid)}
          deps={links.filter((l) => l.succ_ext_uid === hover.uid)}
          nameOf={(uid) => byUid.get(uid)?.name ?? String(uid)}
          payment={pays.find((p) => p.ext_uid === hover.uid)}
          fmtDay={fmtDay}
        />
      )}

      <TaskEditor
        task={selectedTask}
        isSummary={selectedTask ? hasChildren(tree, selectedTask.ext_uid) : false}
        canEdit={mayEdit && !busy}
        phone={phone}
        deps={selectedTask ? links.filter((l) => l.succ_ext_uid === selectedTask.ext_uid) : []}
        nameOf={(uid) => byUid.get(uid)?.name ?? String(uid)}
        onEdit={onEdit}
        allTasks={tasks}
        allLinks={links}
      />
    </div>
  )
}

/**
 * Everything about a task, on hover — the whole point of a Gantt is reading it, and
 * clicking a row to fill a panel below the fold is not reading it.
 *
 * Positioned against the viewport and flipped near the edges, so it never runs off
 * screen and never covers the bar it describes.
 */
function HoverCard({
  task, x, y, isSummary, deps, nameOf, payment, fmtDay,
}: {
  task: GanttTask | null
  x: number
  y: number
  isSummary: boolean
  deps: GanttLink[]
  nameOf: (uid: number) => string
  payment: PaymentMilestone | undefined
  fmtDay: (day: number) => string
}) {
  const { lang } = useI18n()
  const g = (k: string) => gt(lang, k)
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 300, h: 150 })

  useEffect(() => {
    const r = ref.current?.getBoundingClientRect()
    if (r && (Math.round(r.width) !== size.w || Math.round(r.height) !== size.h)) {
      setSize({ w: Math.round(r.width), h: Math.round(r.height) })
    }
  }, [task?.ext_uid, size.w, size.h])

  if (!task) return null

  const GAP = 16
  const left = x - size.w - GAP < 8 ? Math.min(x + GAP, innerWidth - size.w - 8) : x - size.w - GAP
  const top = y + GAP + size.h > innerHeight - 8 ? Math.max(8, y - size.h - GAP) : y + GAP

  const slip = task.base_start_ts ? dayOf(task.start_ts) - dayOf(task.base_start_ts) : 0
  const duration = task.duration_days !== null
    ? `${task.duration_days} ${g('g_edit_days')}`
    : `${spanDays(task)} ${g('g_edit_days')}`

  const rows: [string, React.ReactNode, boolean][] = [
    [g('g_edit_start'), fmtDay(dayOf(task.start_ts)), false],
  ]
  if (!task.milestone) {
    rows.push([g('g_edit_finish'), fmtDay(dayOf(task.finish_ts)), false])
    rows.push([g('g_duration'), duration, false])
  }
  rows.push([g('g_edit_pct'), `${task.pct}%`, false])
  if (slip !== 0) {
    rows.push([g('g_edit_slip'), <b>{slip > 0 ? `+${slip}` : slip} {g('g_edit_days')}</b>, false])
  }
  if (payment) {
    rows.push([g('g_payment'), `${payment.pct}% — ${payment.paid ? g('g_pay_paid') : g('g_pay_open')}`, true])
  }
  if (task.resources.length) rows.push([g('g_resources'), task.resources.join(', '), true])
  if (deps.length) {
    rows.push([g('g_deps_of'), deps.map((d) => nameOf(d.pred_ext_uid)).join(' · '), true])
  }
  if (task.critical) rows.push([g('g_path'), g('g_critical'), true])
  if (isSummary) rows.push([g('g_kind'), g('g_summary'), true])

  return (
    <div className="gantt__tip" ref={ref} style={{ left, top }} role="tooltip">
      <h5>
        {task.wbs && <span>{task.wbs} </span>}
        {task.name}
      </h5>
      <dl>
        {rows.map(([label, value, isText], i) => (
          <div key={i} style={{ display: 'contents' }}>
            <dt>{label}</dt>
            <dd className={isText ? 'gantt__tip-text' : undefined}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="panel stat" style={tone === 'warn' ? { borderColor: 'var(--clay)' } : undefined}>
      <div className="stat__value" style={tone === 'warn' ? { color: 'var(--clay)' } : undefined}>{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  )
}

/** Keyboard-and-touch path to the same edits the drag gesture makes. */
function TaskEditor({
  task, isSummary, canEdit, phone, deps, nameOf, onEdit, allTasks, allLinks,
}: {
  task: GanttTask | null
  isSummary: boolean
  canEdit: boolean
  /** view-only because of the screen, not because of a permission */
  phone: boolean
  deps: GanttLink[]
  nameOf: (uid: number) => string
  onEdit: (changes: TaskChange[]) => void
  allTasks: GanttTask[]
  allLinks: GanttLink[]
}) {
  const { lang } = useI18n()
  const g = (k: string) => gt(lang, k)

  if (!task) return <p className="gantt__hint">{g('g_selected_none')}</p>

  const slip = task.base_start_ts ? dayOf(task.start_ts) - dayOf(task.base_start_ts) : 0

  const commitSpan = (next: Span) => {
    const pushed = cascade(allTasks, allLinks, new Map([[task.ext_uid, next]]))
    const rolled = rollUp(allTasks, pushed)
    const byUid = new Map(allTasks.map((t) => [t.ext_uid, t]))
    const changes: TaskChange[] = []
    for (const [uid, span] of pushed) {
      const t = byUid.get(uid)
      if (t) changes.push({ task: t, span })
    }
    for (const [uid, span] of rolled) {
      const t = byUid.get(uid)
      if (!t || pushed.has(uid)) continue
      changes.push({ task: t, span: { start_ts: span.start_ts, finish_ts: span.finish_ts } })
    }
    if (changes.length) onEdit(changes)
  }

  const setStart = (date: string) => {
    if (!date) return
    const day = dayOf(`${date}T00:00:00`)
    const length = spanDays(task) - 1
    commitSpan({
      start_ts: withDay(task.start_ts, day, DEFAULT_START_TIME),
      finish_ts: withDay(task.finish_ts, task.milestone ? day : day + length, DEFAULT_FINISH_TIME),
    })
  }

  const setFinish = (date: string) => {
    if (!date) return
    const day = Math.max(dayOf(`${date}T00:00:00`), dayOf(task.start_ts))
    commitSpan({ start_ts: task.start_ts, finish_ts: withDay(task.finish_ts, day, DEFAULT_FINISH_TIME) })
  }

  const setPct = (value: string) => {
    const pct = Math.min(100, Math.max(0, Math.round(Number(value) || 0)))
    if (pct === task.pct) return
    // this is the one edit that should re-derive the summary percentages above it
    const rolled = rollUp(
      allTasks.map((t) => (t.ext_uid === task.ext_uid ? { ...t, pct } : t)),
      new Map(),
      { pct: true },
    )
    const byUid = new Map(allTasks.map((t) => [t.ext_uid, t]))
    const changes: TaskChange[] = [{ task, pct }]
    for (const [uid, rolledRow] of rolled) {
      const t = byUid.get(uid)
      if (t && t.ext_uid !== task.ext_uid && rolledRow.pct !== undefined) {
        changes.push({ task: t, pct: rolledRow.pct })
      }
    }
    onEdit(changes)
  }

  const locked = !canEdit || isSummary

  return (
    <div className="gantt__editor">
      <h4>
        {task.name}
        <small>
          {task.wbs ? `${task.wbs} · ` : ''}
          {task.resources.length ? `${g('g_resources')}: ${task.resources.join(', ')}` : ''}
          {deps.length ? ` · ${g('g_deps_of')}: ${deps.map((d) => nameOf(d.pred_ext_uid)).join(' · ')}` : ''}
        </small>
      </h4>

      <label>
        {g('g_edit_start')}
        <input type="date" value={task.start_ts.slice(0, 10)} disabled={locked} onChange={(e) => setStart(e.target.value)} />
      </label>

      {!task.milestone && (
        <label>
          {g('g_edit_finish')}
          <input type="date" value={task.finish_ts.slice(0, 10)} min={task.start_ts.slice(0, 10)} disabled={locked} onChange={(e) => setFinish(e.target.value)} />
        </label>
      )}

      <label>
        {g('g_edit_pct')}
        <input type="number" min={0} max={100} step={5} value={task.pct} disabled={locked} onChange={(e) => setPct(e.target.value)} />
      </label>

      {slip !== 0 && (
        <span className="gantt__slip" title={g('g_edit_slip')}>
          {slip > 0 ? '+' : ''}{slip} {g('g_edit_days')}
        </span>
      )}

      {/* Per row, not per chart: a schedule has a handful of dates worth chasing and a hundred
          that are not, and alerting on all of them is the same as alerting on none. Summary rows
          are excluded because their dates are rolled up from their children. */}
      {!isSummary && (
        <label className="gantt__alertopt" title={g('g_alert_hint')}>
          <input
            type="checkbox"
            checked={task.alert_on_overrun ?? false}
            disabled={locked}
            onChange={(e) => onEdit([{ task, alertOnOverrun: e.target.checked }])}
          />
          {g('g_alert_overrun')}
        </label>
      )}

      <p className="gantt__hint" style={{ flex: '1 1 100%', margin: 0 }}>
        {phone ? g('g_edit_phone') : !canEdit ? g('g_edit_readonly') : isSummary ? g('g_edit_summary') : g('g_edit_hint')}
      </p>
    </div>
  )
}
