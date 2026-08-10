import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { useI18n } from '../i18n'
import { Loader } from '../components/Loader'
import {
  fetchMyRules, createRule, deleteRule, toggleRule, fetchSchedulableTasks, setRuleTasks,
  fetchRuleTaskCounts, countLateTasks, type AlertRule, type OverdueTaskChoice,
} from '../lib/alertRules'

const WEEKDAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function AlertRules() {
  const { t, lang } = useI18n()
  const { projects } = useStore()
  const [rules, setRules] = useState<AlertRule[] | null>(null)
  const [err, setErr] = useState('')
  // new-rule form
  const [projectId, setProjectId] = useState('')
  const [kind, setKind] = useState<'missing' | 'filled' | 'overdue'>('missing')
  // Overdue rules: watch the whole project, or name the few tasks that matter.
  const [tasks, setTasks] = useState<OverdueTaskChoice[] | null>(null)
  const [pickedTasks, setPickedTasks] = useState<Set<string>>(new Set())
  const [lateNow, setLateNow] = useState<number | null>(null)
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({})
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [hour, setHour] = useState(20)
  const [weekday, setWeekday] = useState(0)
  const [monthDay, setMonthDay] = useState(1)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchMyRules().then(setRules).catch((e) => setErr(String((e as Error).message ?? e)))
    fetchRuleTaskCounts().then(setTaskCounts).catch(() => setTaskCounts({}))
  }, [])

  // A task list only exists for an overdue rule on one named project — "all projects" has no
  // single schedule to pick from. Derived rather than stored, so there is no state to reset.
  const picking = kind === 'overdue' && Boolean(projectId)

  // Both effects only ever write what they fetched. Clearing happens in the change handlers
  // below, because that is where the change happens — resetting state inside an effect makes
  // React render twice for one user action.
  useEffect(() => {
    if (!picking) return
    let alive = true
    fetchSchedulableTasks(projectId)
      .then((ts) => { if (alive) setTasks(ts) })
      .catch(() => { if (alive) setTasks([]) })
    return () => { alive = false }
  }, [picking, projectId])

  // How much noise saving this rule would make right now.
  useEffect(() => {
    if (kind !== 'overdue') return
    let alive = true
    countLateTasks(projectId || null)
      .then((n) => { if (alive) setLateNow(n) })
      .catch(() => { if (alive) setLateNow(0) })
    return () => { alive = false }
  }, [kind, projectId])

  /** Changing either of these invalidates the picked tasks and the fetched list. */
  const changeScope = (next: { kind?: typeof kind; project?: string }) => {
    if (next.kind !== undefined) setKind(next.kind)
    if (next.project !== undefined) setProjectId(next.project)
    setTasks(null)
    setPickedTasks(new Set())
    setLateNow(null)
  }

  const weekdays = lang === 'he' ? WEEKDAYS_HE : WEEKDAYS_EN

  async function onAdd() {
    if (busy) return
    setBusy(true); setErr('')
    try {
      const r = await createRule({
        project_id: projectId || null,
        kind,
        // Overdue rules are event-driven — the hourly job notices a date that has passed — so the
        // schedule fields carry defaults rather than meaning anything.
        frequency: kind === 'missing' ? frequency : 'daily',
        alert_hour: kind === 'missing' ? Math.min(23, Math.max(0, hour)) : 0,
        weekday: kind === 'missing' && frequency === 'weekly' ? weekday : null,
        month_day: kind === 'missing' && frequency === 'monthly' ? monthDay : null,
      })
      if (kind === 'overdue' && pickedTasks.size) {
        await setRuleTasks(r.id, [...pickedTasks])
        setTaskCounts((m) => ({ ...m, [r.id]: pickedTasks.size }))
      }
      setPickedTasks(new Set())
      setRules((rs) => [...(rs ?? []), r])
    } catch (e) { setErr(String((e as Error).message ?? e)) } finally { setBusy(false) }
  }

  async function onDelete(id: string) {
    const prev = rules
    setRules((rs) => (rs ?? []).filter((r) => r.id !== id))
    try { await deleteRule(id) } catch (e) { setRules(prev); setErr(String((e as Error).message ?? e)) }
  }

  async function onToggle(r: AlertRule) {
    setRules((rs) => (rs ?? []).map((x) => x.id === r.id ? { ...x, active: !r.active } : x))
    try { await toggleRule(r.id, !r.active) } catch (e) { setErr(String((e as Error).message ?? e)) }
  }

  /** A rule broken into its parts, so the row can lay them out and style each one for what it
   *  is — a name, a schedule, a scope — instead of joining everything with a middot. */
  function ruleParts(r: AlertRule) {
    const project = r.project_id
      ? (projects.find((p) => p.id === r.project_id)?.name ?? '—')
      : t('rule_all_projects')

    if (r.kind === 'filled') {
      return { icon: '✓', kind: t('rule_kind_filled'), project, when: '', scope: null as string | null, scopeAll: false }
    }
    if (r.kind === 'overdue') {
      const n = taskCounts[r.id] ?? 0
      return {
        icon: '⚑', kind: t('rule_kind_overdue'), project,
        when: t('rule_hourly'),
        scope: n ? `${n} ${t('rule_tasks_n')}` : t('rule_all_tasks'),
        scopeAll: n === 0,
      }
    }
    const freq = r.frequency === 'daily' ? t('rule_daily')
      : r.frequency === 'weekly' ? `${t('rule_weekly')} · ${weekdays[r.weekday ?? 0]}`
      : `${t('rule_monthly')} · ${r.month_day ?? 1}`
    return {
      icon: '☐', kind: t('rule_kind_missing'), project,
      when: `${freq} · ${String(r.alert_hour).padStart(2, '0')}:00`,
      scope: null, scopeAll: false,
    }
  }

  if (rules === null && !err) return <Loader label={t('loading')} />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">Agrotop</div>
          <h1 className="page-title">{t('alert_rules_title')}</h1>
        </div>
        <span className="count mono">{rules?.length ?? 0}</span>
      </div>
      <p className="coop-intro">{t('alert_rules_intro')}</p>

      {err && <div className="alert">{err}</div>}

      <div className="rule-new">
        <p className="rule-new__title">{t('rule_new_title')}</p>
        <p className="rule-new__hint">{t('rule_new_hint')}</p>
        <div className="rule-new__fields">
        <select className="input" value={kind} onChange={(e) => changeScope({ kind: e.target.value as typeof kind })}>
          <option value="missing">{t('rule_kind_missing')}</option>
          <option value="filled">{t('rule_kind_filled')}</option>
          <option value="overdue">{t('rule_kind_overdue')}</option>
        </select>
        <select className="input" value={projectId} onChange={(e) => changeScope({ project: e.target.value })}>
          <option value="">{t('rule_all_projects')}</option>
          {projects.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {kind === 'missing' && (
          <>
            <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekly' | 'monthly')}>
              <option value="daily">{t('rule_daily')}</option>
              <option value="weekly">{t('rule_weekly')}</option>
              <option value="monthly">{t('rule_monthly')}</option>
            </select>
            {frequency === 'weekly' && (
              <select className="input" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                {weekdays.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
            )}
            {frequency === 'monthly' && (
              <input className="input" type="number" min={1} max={31} value={monthDay}
                onChange={(e) => setMonthDay(Number(e.target.value) || 1)} style={{ width: 90 }} />
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {t('rule_until_hour')}
              <input className="input" type="number" min={0} max={23} value={hour}
                onChange={(e) => setHour(Number(e.target.value) || 0)} style={{ width: 90 }} />
            </label>
          </>
        )}
        <button className="btn btn--primary" disabled={busy} onClick={onAdd}>{t('rule_add')}</button>
        </div>

        {kind === 'overdue' && (
          <div className="rule-new__tasks">
            <p className="rule-new__hint" style={{ marginTop: 0 }}>{t('rule_overdue_hint')}</p>
            {/* Nobody should think a rule is required: the roles already cover it. Said here
                rather than left to be discovered by not needing it. */}
            <div className="alert" style={{ background: 'var(--green-tint)', color: 'var(--green-dark)' }}>
              {t('rule_overdue_auto')}
            </div>

            {/* Already-late tasks all announce themselves on the first run. Better said now than
              discovered as thirty-six notifications. */}
          {lateNow !== null && lateNow > 0 && (
            <div className="alert">{t('rule_late_now')} {lateNow}</div>
          )}

          {!picking ? (
            <p className="coop-intro">{t('rule_pick_project_for_tasks')}</p>
          ) : tasks === null ? (
            <span className="count mono"><span className="spin" /></span>
          ) : tasks.length === 0 ? (
            <p className="coop-intro">{t('rule_no_schedule')}</p>
          ) : (
            <>
              <span className="field__label">
                {t('rule_pick_tasks')} <span className="field__hint">{t('rule_pick_tasks_hint')}</span>
              </span>
              <div className="staff-pick" style={{ maxHeight: 260, overflowY: 'auto', marginTop: 8 }}>
                {tasks.map((tk) => (
                  <label key={tk.id} className={`staff-chip ${pickedTasks.has(tk.id) ? 'on' : ''}`}>
                    <input
                      type="checkbox" hidden
                      checked={pickedTasks.has(tk.id)}
                      onChange={() => setPickedTasks((p) => {
                        const n = new Set(p)
                        if (n.has(tk.id)) n.delete(tk.id); else n.add(tk.id)
                        return n
                      })}
                    />
                    {tk.name} <span className="mono" style={{ opacity: .6, fontSize: 11 }}>
                      {tk.finish_ts.slice(0, 10)}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}
          </div>
        )}
      </div>

      {(rules ?? []).length === 0 ? (
        <div className="empty">{t('alert_rules_empty')}</div>
      ) : (
        <div className="rules">
          {(rules ?? []).map((r) => {
            const parts = ruleParts(r)
            return (
              <div key={r.id} className={`rule-row ${r.active ? '' : 'is-off'}`}>
                <span className="rule-row__icon" aria-hidden="true">{parts.icon}</span>
                <div className="rule-row__main">
                  <span className="rule-row__kind">{parts.kind}</span>
                  <span className="rule-row__project">{parts.project}</span>
                  {parts.when && <span className="rule-row__when">{parts.when}</span>}
                  {parts.scope && (
                    <span className={`rule-row__scope ${parts.scopeAll ? 'rule-row__scope--all' : ''}`}>
                      {parts.scope}
                    </span>
                  )}
                </div>
                <div className="rule-row__actions">
                  <label className="rule-toggle">
                    <input type="checkbox" checked={r.active} onChange={() => onToggle(r)} />
                    {t('rule_active')}
                  </label>
                  <button className="btn btn--ghost" onClick={() => onDelete(r.id)}
                    aria-label={t('delete')}>🗑</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
