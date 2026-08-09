import { describe, expect, it } from 'vitest'
import {
  buildTree, cascade, dayOf, paymentMilestones, rollUp, shiftTs, spanDays,
  summarize, toRows, visibleRows, withDay,
  type ConvertedProject, type GanttLink, type GanttTask, type Span,
} from './model'

function task(over: Partial<GanttTask> & { ext_uid: number; start_ts: string; finish_ts: string }): GanttTask {
  return {
    id: `t${over.ext_uid}`,
    chart_id: 'c1',
    parent_ext_uid: null,
    sort_order: over.ext_uid,
    depth: 0,
    wbs: null,
    name: `task ${over.ext_uid}`,
    base_start_ts: null,
    base_finish_ts: null,
    duration_days: null,
    pct: 0,
    milestone: false,
    is_summary: false,
    critical: false,
    notes: null,
    resources: [],
    ...over,
  }
}

function link(pred: number, succ: number, over: Partial<GanttLink> = {}): GanttLink {
  return {
    id: `l${pred}-${succ}`,
    chart_id: 'c1',
    pred_ext_uid: pred,
    succ_ext_uid: succ,
    kind: 'FS',
    lag_days: 0,
    ...over,
  }
}

describe('day arithmetic', () => {
  it('reads the date part without shifting across timezones', () => {
    expect(dayOf('2026-05-10T08:00:00')).toBe(dayOf('2026-05-10T23:59:00'))
    expect(dayOf('2026-05-11T00:00:00') - dayOf('2026-05-10T08:00:00')).toBe(1)
  })

  it('keeps the clock time when moving a task', () => {
    expect(shiftTs('2026-05-10T08:00:00', 5)).toBe('2026-05-15T08:00:00')
    expect(withDay('2026-05-10T17:00:00', dayOf('2026-06-01T00:00:00'))).toBe('2026-06-01T17:00:00')
  })

  it('normalizes a bare HH:mm', () => {
    expect(shiftTs('2026-05-10T08:00', 1)).toBe('2026-05-11T08:00:00')
  })

  it('counts an inclusive span', () => {
    expect(spanDays({ start_ts: '2026-05-10T08:00:00', finish_ts: '2026-05-10T17:00:00' })).toBe(1)
    expect(spanDays({ start_ts: '2026-05-10T08:00:00', finish_ts: '2026-05-12T17:00:00' })).toBe(3)
  })
})

describe('buildTree', () => {
  const tasks = [
    task({ ext_uid: 1, start_ts: '2026-05-10T08:00:00', finish_ts: '2026-05-20T17:00:00', is_summary: true }),
    task({ ext_uid: 2, parent_ext_uid: 1, start_ts: '2026-05-10T08:00:00', finish_ts: '2026-05-12T17:00:00' }),
    task({ ext_uid: 3, parent_ext_uid: 1, start_ts: '2026-05-13T08:00:00', finish_ts: '2026-05-20T17:00:00', is_summary: true }),
    task({ ext_uid: 4, parent_ext_uid: 3, start_ts: '2026-05-13T08:00:00', finish_ts: '2026-05-20T17:00:00' }),
  ]

  it('derives depth from the parent chain, not the stored outline level', () => {
    const tree = buildTree(tasks.map((t) => ({ ...t, depth: 9 })))
    expect(tree.roots).toEqual([1])
    expect(tree.depthOf.get(4)).toBe(2)
  })

  it('treats a parent that is not in the set as a root', () => {
    const tree = buildTree([task({ ext_uid: 7, parent_ext_uid: 999, start_ts: '2026-05-10T08:00:00', finish_ts: '2026-05-10T17:00:00' })])
    expect(tree.roots).toEqual([7])
  })

  it('hides the subtree of a collapsed parent', () => {
    const tree = buildTree(tasks)
    expect(visibleRows(tree, new Set()).map((t) => t.ext_uid)).toEqual([1, 2, 3, 4])
    expect(visibleRows(tree, new Set([3])).map((t) => t.ext_uid)).toEqual([1, 2, 3])
    expect(visibleRows(tree, new Set([1])).map((t) => t.ext_uid)).toEqual([1])
  })

  it('keeps an ancestor whose descendant matches the filter', () => {
    const tree = buildTree(tasks)
    const rows = visibleRows(tree, new Set(), (t) => t.ext_uid === 4)
    expect(rows.map((t) => t.ext_uid)).toEqual([1, 3, 4])
  })
})

describe('cascade', () => {
  const base = [
    task({ ext_uid: 1, start_ts: '2026-05-10T08:00:00', finish_ts: '2026-05-12T17:00:00' }),
    task({ ext_uid: 2, start_ts: '2026-05-13T08:00:00', finish_ts: '2026-05-15T17:00:00' }),
    task({ ext_uid: 3, start_ts: '2026-05-16T08:00:00', finish_ts: '2026-05-16T17:00:00' }),
  ]
  const chain = [link(1, 2), link(2, 3)]
  const edit = (uid: number, span: Span) => new Map([[uid, span]])

  it('pushes a finish-to-start chain forward and preserves durations', () => {
    const moved = cascade(base, chain, edit(1, { start_ts: '2026-05-14T08:00:00', finish_ts: '2026-05-16T17:00:00' }))
    expect(moved.get(2)).toEqual({ start_ts: '2026-05-17T08:00:00', finish_ts: '2026-05-19T17:00:00' })
    expect(moved.get(3)).toEqual({ start_ts: '2026-05-20T08:00:00', finish_ts: '2026-05-20T17:00:00' })
  })

  it('leaves successors alone when slack opens up', () => {
    const moved = cascade(base, chain, edit(1, { start_ts: '2026-05-04T08:00:00', finish_ts: '2026-05-06T17:00:00' }))
    expect(moved.has(2)).toBe(false)
    expect(moved.has(3)).toBe(false)
  })

  it('honours lag', () => {
    const moved = cascade(base, [link(1, 2, { lag_days: 3 })], edit(1, { start_ts: '2026-05-10T08:00:00', finish_ts: '2026-05-12T17:00:00' }))
    expect(moved.get(2)?.start_ts).toBe('2026-05-16T08:00:00')
  })

  it('applies start-to-start and finish-to-finish', () => {
    const ss = cascade(base, [link(1, 2, { kind: 'SS' })], edit(1, { start_ts: '2026-05-20T08:00:00', finish_ts: '2026-05-22T17:00:00' }))
    expect(ss.get(2)).toEqual({ start_ts: '2026-05-20T08:00:00', finish_ts: '2026-05-22T17:00:00' })

    const ff = cascade(base, [link(1, 2, { kind: 'FF' })], edit(1, { start_ts: '2026-05-20T08:00:00', finish_ts: '2026-05-22T17:00:00' }))
    expect(ff.get(2)?.finish_ts).toBe('2026-05-22T17:00:00')
    expect(ff.get(2)?.start_ts).toBe('2026-05-20T08:00:00')
  })

  it('does not move a summary row', () => {
    const tasks = [base[0], { ...base[1], is_summary: true }]
    const moved = cascade(tasks, [link(1, 2)], edit(1, { start_ts: '2026-05-20T08:00:00', finish_ts: '2026-05-22T17:00:00' }))
    expect(moved.has(2)).toBe(false)
  })

  it('terminates on a cyclic link set', () => {
    const moved = cascade(base, [link(1, 2), link(2, 3), link(3, 1)], edit(1, { start_ts: '2026-05-14T08:00:00', finish_ts: '2026-05-16T17:00:00' }))
    expect(moved.size).toBeGreaterThan(0)
  })
})

describe('rollUp', () => {
  const parentAndKids = [
    task({ ext_uid: 1, start_ts: '2026-05-10T08:00:00', finish_ts: '2026-05-10T17:00:00', is_summary: true, pct: 0 }),
    task({ ext_uid: 2, parent_ext_uid: 1, start_ts: '2026-05-11T08:00:00', finish_ts: '2026-05-11T17:00:00', pct: 100 }),
    task({ ext_uid: 3, parent_ext_uid: 1, start_ts: '2026-05-12T08:00:00', finish_ts: '2026-05-14T17:00:00', pct: 0 }),
  ]

  it('spans the children', () => {
    expect(rollUp(parentAndKids).get(1)).toEqual({
      start_ts: '2026-05-11T08:00:00',
      finish_ts: '2026-05-14T17:00:00',
    })
  })

  it('leaves percent complete alone unless asked', () => {
    expect(rollUp(parentAndKids).get(1)?.pct).toBeUndefined()
  })

  it('weights percent complete by duration when asked', () => {
    // 1 day at 100% + 3 days at 0%
    expect(rollUp(parentAndKids, new Map(), { pct: true }).get(1)?.pct).toBe(25)
  })

  it('rolls percent complete through two levels', () => {
    const tasks = [
      task({ ext_uid: 1, start_ts: '2026-05-10T08:00:00', finish_ts: '2026-05-14T17:00:00', is_summary: true, pct: 0 }),
      task({ ext_uid: 2, parent_ext_uid: 1, start_ts: '2026-05-10T08:00:00', finish_ts: '2026-05-14T17:00:00', is_summary: true, pct: 0 }),
      task({ ext_uid: 3, parent_ext_uid: 2, start_ts: '2026-05-10T08:00:00', finish_ts: '2026-05-14T17:00:00', pct: 60 }),
    ]
    const rolled = rollUp(tasks, new Map(), { pct: true })
    expect(rolled.get(2)?.pct).toBe(60)
    expect(rolled.get(1)?.pct).toBe(60)
  })

  it('rolls a grandchild move all the way up', () => {
    const tasks = [
      task({ ext_uid: 1, start_ts: '2026-05-10T08:00:00', finish_ts: '2026-05-20T17:00:00', is_summary: true }),
      task({ ext_uid: 2, parent_ext_uid: 1, start_ts: '2026-05-10T08:00:00', finish_ts: '2026-05-20T17:00:00', is_summary: true }),
      task({ ext_uid: 3, parent_ext_uid: 2, start_ts: '2026-05-10T08:00:00', finish_ts: '2026-05-20T17:00:00' }),
    ]
    const rolled = rollUp(tasks, new Map([[3, { start_ts: '2026-06-01T08:00:00', finish_ts: '2026-06-05T17:00:00' }]]))
    expect(rolled.get(2)?.finish_ts).toBe('2026-06-05T17:00:00')
    expect(rolled.get(1)?.start_ts).toBe('2026-06-01T08:00:00')
  })

  it('returns nothing when the parent already spans its children', () => {
    const tasks = [
      task({ ext_uid: 1, start_ts: '2026-05-10T08:00:00', finish_ts: '2026-05-12T17:00:00', is_summary: true, pct: 50 }),
      task({ ext_uid: 2, parent_ext_uid: 1, start_ts: '2026-05-10T08:00:00', finish_ts: '2026-05-12T17:00:00', pct: 50 }),
    ]
    expect(rollUp(tasks).size).toBe(0)
    expect(rollUp(tasks, new Map(), { pct: true }).size).toBe(0)
  })
})

describe('summarize', () => {
  const tasks = [
    task({ ext_uid: 1, start_ts: '2026-05-10T08:00:00', finish_ts: '2026-06-20T17:00:00', is_summary: true }),
    task({ ext_uid: 2, parent_ext_uid: 1, start_ts: '2026-05-10T08:00:00', finish_ts: '2026-05-10T17:00:00', pct: 100 }),
    task({ ext_uid: 3, parent_ext_uid: 1, start_ts: '2026-05-11T08:00:00', finish_ts: '2026-05-11T17:00:00', pct: 40 }),
    task({ ext_uid: 4, parent_ext_uid: 1, start_ts: '2026-06-18T08:00:00', finish_ts: '2026-06-20T17:00:00', pct: 0 }),
    task({ ext_uid: 5, parent_ext_uid: 1, start_ts: '2026-05-12T08:00:00', finish_ts: '2026-05-12T08:00:00', milestone: true }),
  ]

  it('counts leaves by state and flags work whose finish has passed', () => {
    const s = summarize(tasks, '2026-06-01T00:00:00')
    expect(s.leafCount).toBe(3)
    expect({ done: s.doneCount, wip: s.wipCount, todo: s.todoCount }).toEqual({ done: 1, wip: 1, todo: 1 })
    expect(s.overdueCount).toBe(1) // task 3, at 40% with a finish in May
    expect(s.milestoneCount).toBe(1)
    expect(s.spanStart).toBe('2026-05-10T08:00:00')
    expect(s.spanFinish).toBe('2026-06-20T17:00:00')
  })

  it('reports zero progress for an empty schedule', () => {
    expect(summarize([], '2026-06-01T00:00:00').overallPct).toBe(0)
  })
})

describe('paymentMilestones', () => {
  it('reads the percentage out of the milestone name', () => {
    const tasks = [
      task({ ext_uid: 1, start_ts: '2026-05-10T08:00:00', finish_ts: '2026-05-10T08:00:00', milestone: true, pct: 100, name: '30% מקדמה עם אישור הפרויקט', sort_order: 1 }),
      task({ ext_uid: 2, start_ts: '2026-07-10T08:00:00', finish_ts: '2026-07-10T08:00:00', milestone: true, pct: 0, name: '10% בסיום הנפת שלד מבנה', sort_order: 2 }),
      task({ ext_uid: 3, start_ts: '2026-05-11T08:00:00', finish_ts: '2026-05-11T17:00:00', name: 'not a milestone', sort_order: 3 }),
      task({ ext_uid: 4, start_ts: '2026-05-11T08:00:00', finish_ts: '2026-05-11T08:00:00', milestone: true, name: 'סיום פרויקט', sort_order: 4 }),
    ]
    const pays = paymentMilestones(tasks)
    expect(pays).toHaveLength(2)
    expect(pays[0]).toMatchObject({ pct: 30, label: 'מקדמה עם אישור הפרויקט', paid: true })
    expect(pays[1]).toMatchObject({ pct: 10, paid: false })
  })
})

describe('toRows', () => {
  const payload: ConvertedProject = {
    schema: 1,
    file: 'plan.mpp',
    properties: { name: null, title: null, startDate: '2026-05-10T08:00', finishDate: '2026-12-30T17:00', statusDate: null },
    resources: [{ uniqueId: 1, name: 'ניסים' }],
    tasks: [
      {
        id: 0, uniqueId: 0, wbs: '0', name: 'whole project', outlineLevel: 0, parentUniqueId: null,
        start: '2026-05-10T08:00', finish: '2026-12-30T17:00', duration: { amount: 196, units: 'd' },
        percentComplete: 29, milestone: false, summary: true, critical: true, notes: null,
        predecessors: [], resources: [],
      },
      {
        id: 1, uniqueId: 45, wbs: '1.1', name: 'מקדמה', outlineLevel: 1, parentUniqueId: 0,
        start: '2026-05-10T08:00', finish: '2026-05-10T08:00', duration: { amount: 0, units: 'd' },
        percentComplete: 100, milestone: true, summary: false, critical: false, notes: null,
        predecessors: [], resources: [{ name: 'ניסים' }, { name: null }],
      },
      {
        id: 2, uniqueId: 47, wbs: '1.2', name: 'הגעת קונסטרוקציה', outlineLevel: 1, parentUniqueId: 0,
        start: '2026-05-11T08:00', finish: '2026-05-11T17:00', duration: { amount: 1, units: 'd' },
        percentComplete: 120, milestone: false, summary: false, critical: false, notes: 'note',
        predecessors: [{ taskUniqueId: 45, type: 'FS', lag: { amount: 16, units: 'h' } }],
        resources: [],
      },
      {
        id: 3, uniqueId: 48, wbs: '1.3', name: 'no dates', outlineLevel: 1, parentUniqueId: 0,
        start: null, finish: null, duration: null, percentComplete: null,
        milestone: false, summary: false, critical: false, notes: null,
        predecessors: [{ taskUniqueId: 47, type: 'FS', lag: null }], resources: [],
      },
    ],
  }

  it('drops the level-0 project row and rows without dates', () => {
    const { tasks } = toRows(payload)
    expect(tasks.map((t) => t.ext_uid)).toEqual([45, 47])
  })

  it('reparents to a root when the parent was dropped', () => {
    const { tasks } = toRows(payload)
    expect(tasks.every((t) => t.parent_ext_uid === null)).toBe(true)
  })

  it('normalizes times, clamps percent complete, and records a baseline', () => {
    const { tasks } = toRows(payload)
    const construction = tasks.find((t) => t.ext_uid === 47)
    expect(construction?.start_ts).toBe('2026-05-11T08:00:00')
    expect(construction?.finish_ts).toBe('2026-05-11T17:00:00')
    expect(construction?.base_start_ts).toBe('2026-05-11T08:00:00')
    expect(construction?.pct).toBe(100)
    expect(tasks.find((t) => t.ext_uid === 45)?.resources).toEqual(['ניסים'])
  })

  it('keeps only links whose endpoints both survived, and converts lag to days', () => {
    const { links } = toRows(payload)
    expect(links).toEqual([{ pred_ext_uid: 45, succ_ext_uid: 47, kind: 'FS', lag_days: 2 }])
  })

  it('falls back to FS for an unrecognized relation type', () => {
    const odd: ConvertedProject = {
      ...payload,
      tasks: payload.tasks.map((t) =>
        t.uniqueId === 47 ? { ...t, predecessors: [{ taskUniqueId: 45, type: 'weird', lag: null }] } : t,
      ),
    }
    expect(toRows(odd).links[0].kind).toBe('FS')
  })
})
