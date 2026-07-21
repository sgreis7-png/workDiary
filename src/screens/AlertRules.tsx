import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { useI18n } from '../i18n'
import { Loader } from '../components/Loader'
import { fetchMyRules, createRule, deleteRule, toggleRule, type AlertRule } from '../lib/alertRules'

const WEEKDAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function AlertRules() {
  const { t, lang } = useI18n()
  const { projects } = useStore()
  const [rules, setRules] = useState<AlertRule[] | null>(null)
  const [err, setErr] = useState('')
  // new-rule form
  const [projectId, setProjectId] = useState('')
  const [kind, setKind] = useState<'missing' | 'filled'>('missing')
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [hour, setHour] = useState(20)
  const [weekday, setWeekday] = useState(0)
  const [monthDay, setMonthDay] = useState(1)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchMyRules().then(setRules).catch((e) => setErr(String((e as Error).message ?? e)))
  }, [])

  const weekdays = lang === 'he' ? WEEKDAYS_HE : WEEKDAYS_EN

  async function onAdd() {
    if (busy) return
    setBusy(true); setErr('')
    try {
      const r = await createRule({
        project_id: projectId || null,
        kind,
        frequency: kind === 'filled' ? 'daily' : frequency,
        alert_hour: Math.min(23, Math.max(0, hour)),
        weekday: kind === 'missing' && frequency === 'weekly' ? weekday : null,
        month_day: kind === 'missing' && frequency === 'monthly' ? monthDay : null,
      })
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

  function ruleText(r: AlertRule): string {
    const proj = r.project_id ? (projects.find((p) => p.id === r.project_id)?.name ?? '—') : t('rule_all_projects')
    if (r.kind === 'filled') return `${t('rule_kind_filled')} · ${proj}`
    const freq = r.frequency === 'daily' ? t('rule_daily')
      : r.frequency === 'weekly' ? `${t('rule_weekly')} (${weekdays[r.weekday ?? 0]})`
      : `${t('rule_monthly')} (${r.month_day ?? 1})`
    return `${t('rule_kind_missing')} · ${proj} · ${freq} · ${t('rule_until_hour')} ${r.alert_hour}:00`
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

      <div className="coop-new" style={{ flexWrap: 'wrap' }}>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as 'missing' | 'filled')}>
          <option value="missing">{t('rule_kind_missing')}</option>
          <option value="filled">{t('rule_kind_filled')}</option>
        </select>
        <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
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

      {(rules ?? []).length === 0 ? (
        <div className="empty">{t('alert_rules_empty')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          {(rules ?? []).map((r) => (
            <div key={r.id} className="coop-card" style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'default', opacity: r.active ? 1 : 0.55 }}>
              <span style={{ flex: 1 }}>{ruleText(r)}</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={r.active} onChange={() => onToggle(r)} />
                {t('rule_active')}
              </label>
              <button className="btn btn--ghost" onClick={() => onDelete(r.id)}>🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
