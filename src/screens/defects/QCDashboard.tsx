import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader } from '../../components/Loader'
import { useStore } from '../../store'
import { useAuth } from '../../auth'
import { useI18n } from '../../i18n'
import { supabase } from '../../lib/supabase'
import { GATES, GATE_ORDER, type GateKey } from '../../defects/model'
import { gateSummary } from '../../defects/rules'
import { loadGateDefs, itemLabel, type GateDefs } from '../../defects/defs'
import { useDT, gateShortName } from '../../defects/i18n'
import { fetchAllCoops, fetchDefectsForSearch, fetchAuditLog, type Coop, type DefectSearchRow, type AuditRow } from '../../defects/api'

const T = {
  kicker: { he: 'תמונת מצב רוחבית · Go / No-Go', en: 'Cross-project overview · Go / No-Go' },
  title: { he: 'דשבורד בקרת איכות', en: 'QC dashboard' },
  open_defects: { he: 'ליקויים פתוחים', en: 'Open defects' },
  overdue: { he: 'באיחור', en: 'Overdue' },
  critical_open: { he: '🔴 קריטיים פתוחים', en: '🔴 Critical open' },
  houses: { he: 'לולים פעילים', en: 'Active houses' },
  by_house: { he: 'התקדמות לפי לול', en: 'Progress by house' },
  gates_col: { he: 'שערים (% הושלם)', en: 'Gates (% complete)' },
  recurring: { he: 'ליקויים חוזרים — הסעיפים שנכשלים הכי הרבה', en: 'Recurring defects — most-failing items' },
  recurring_hint: { he: 'ריכוז בין כל הפרויקטים. סעיף שחוזר שוב ושוב = בעיה תהליכית או ספק.', en: 'Across all projects. A repeating item = process or supplier issue.' },
  times: { he: 'פעמים', en: 'times' },
  audit: { he: 'יומן שינויים (אדמין)', en: 'Audit log (admin)' },
  loading: { he: 'טוען נתונים…', en: 'Loading…' },
  none: { he: 'אין נתונים עדיין.', en: 'No data yet.' },
} as const

const AUDIT_LABELS: Record<string, { he: string; en: string }> = {
  gate_signed: { he: 'חתם על שער', en: 'signed gate' },
  gate_unsigned: { he: 'הסיר חתימות משער', en: 'removed gate signatures' },
  defect_open: { he: 'פתח ליקוי', en: 'opened defect' },
  defect_closed: { he: 'סגר ליקוי', en: 'closed defect' },
  defect_assigned: { he: 'הקצה ליקוי', en: 'assigned defect' },
}

export default function QCDashboard() {
  const { lang } = useI18n()
  const t = (k: keyof typeof T) => T[k][lang]
  const { dt } = useDT()
  const { projectName } = useStore()
  const { isAdmin } = useAuth()
  const nav = useNavigate()
  const [coops, setCoops] = useState<Coop[] | null>(null)
  const [items, setItems] = useState<{ coop_id: string; gate: GateKey; item_no: number; status: 'done' | 'not_done' | 'na' | null }[]>([])
  const [defects, setDefects] = useState<DefectSearchRow[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [defs, setDefs] = useState<GateDefs>(GATES)

  useEffect(() => {
    fetchAllCoops().then(setCoops).catch(() => setCoops([]))
    supabase.from('coop_checklist_items').select('coop_id,gate,item_no,status')
      .then(({ data }) => setItems((data ?? []) as typeof items))
    fetchDefectsForSearch().then(setDefects).catch(() => {})
    loadGateDefs().then(setDefs)
    if (isAdmin) fetchAuditLog(60).then(setAudit).catch(() => {})
  }, [isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  const today = new Date().toISOString().slice(0, 10)
  const open = defects.filter((d) => d.status === 'open')
  const overdue = open.filter((d) => d.due_date && d.due_date < today)
  const criticalOpen = open.filter((d) => d.severity === 'critical')

  const recurring = useMemo(() => {
    const counts = new Map<string, { gate: GateKey; itemNo: number; n: number }>()
    for (const d of defects) {
      if (!d.item_no) continue
      const k = `${d.gate}#${d.item_no}`
      const cur = counts.get(k) ?? { gate: d.gate, itemNo: d.item_no, n: 0 }
      cur.n++; counts.set(k, cur)
    }
    return [...counts.values()].filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 10)
  }, [defects])

  if (!coops) return <Loader label={t('loading')} />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{t('kicker')}</div>
          <h1 className="page-title">{t('title')}</h1>
        </div>
      </div>

      <div className="qc-stats">
        <div className="qc-stat"><b>{coops.length}</b><span>{t('houses')}</span></div>
        <div className="qc-stat"><b>{open.length}</b><span>{t('open_defects')}</span></div>
        <div className={`qc-stat ${overdue.length ? 'qc-stat--bad' : ''}`}><b>{overdue.length}</b><span>{t('overdue')}</span></div>
        <div className={`qc-stat ${criticalOpen.length ? 'qc-stat--bad' : ''}`}><b>{criticalOpen.length}</b><span>{t('critical_open')}</span></div>
      </div>

      <div className="gate-panel" style={{ marginTop: 20 }}>
        <h2 className="gate-panel__title">{t('by_house')}</h2>
        {coops.length === 0 ? <div className="empty">{t('none')}</div> : (
          <div className="gate-table-wrap">
            <table className="gate-table">
              <thead>
                <tr>
                  <th>{dt('rep_house')}</th><th>{dt('qc_project')}</th>
                  <th>{t('gates_col')}</th><th>{t('open_defects')}</th><th>{t('overdue')}</th>
                </tr>
              </thead>
              <tbody>
                {coops.map((c) => {
                  const mine = items.filter((i) => i.coop_id === c.id).map((i) => ({ gate: i.gate, itemNo: i.item_no, status: i.status }))
                  const openN = open.filter((d) => d.coop_id === c.id).length
                  const overdueN = overdue.filter((d) => d.coop_id === c.id).length
                  return (
                    <tr key={c.id} className={overdueN ? 'gate-row--bad' : ''}>
                      <td><button className="summary-gate-link" onClick={() => nav(`/defects/coop/${c.id}`)}>{c.name}</button></td>
                      <td>{projectName(c.project_id)}</td>
                      <td>
                        <div className="qc-gates">
                          {GATE_ORDER.map((g) => {
                            const s = gateSummary(g, mine, defs)
                            const pct = Math.round(s.pct * 100)
                            const started = s.done + s.notDone + s.na > 0
                            return (
                              <span key={g} className={`qc-gate ${pct === 100 && started ? 'qc-gate--done' : started ? 'qc-gate--part' : ''}`}
                                title={`${gateShortName(lang, g)} · ${pct}%`}>
                                {gateShortName(lang, g).replace(/[^0-9]/g, '') || '⚒'}<small>{started ? `${pct}%` : '—'}</small>
                              </span>
                            )
                          })}
                        </div>
                      </td>
                      <td className="mono">{openN}</td>
                      <td className={`mono ${overdueN ? 'summary-bad' : ''}`}>{overdueN}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="gate-panel" style={{ marginTop: 20 }}>
        <h2 className="gate-panel__title">{t('recurring')}</h2>
        <p className="coop-intro" style={{ margin: '6px 0 10px' }}>{t('recurring_hint')}</p>
        {recurring.length === 0 ? <div className="empty">{t('none')}</div> : (
          <div className="qc-recurring">
            {recurring.map((r) => (
              <div key={`${r.gate}#${r.itemNo}`} className="qc-recurring__row">
                <span className="tag tag--clay mono">{r.n}× {t('times')}</span>
                <b>{gateShortName(lang, r.gate)}</b>
                <span>{itemLabel(defs, r.gate, r.itemNo)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="gate-panel" style={{ marginTop: 20 }}>
          <h2 className="gate-panel__title">{t('audit')}</h2>
          {audit.length === 0 ? <div className="empty">{t('none')}</div> : (
            <div className="qc-audit">
              {audit.map((a) => (
                <div key={a.id} className="qc-audit__row">
                  <small className="mono">{new Date(a.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</small>
                  <b>{a.actor_email.split('@')[0]}</b>
                  <span>{AUDIT_LABELS[a.action]?.[lang] ?? a.action}</span>
                  {a.details?.coop != null && <span className="tag tag--muted">{String(a.details.coop)}</span>}
                  {a.details?.to != null && <span className="tag tag--green">→ {String(a.details.to).split('@')[0]}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
