import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader } from '../../components/Loader'
import { useStore } from '../../store'
import { useI18n } from '../../i18n'
import { supabase } from '../../lib/supabase'
import { GATES, GATE_ORDER, SEVERITY_LABELS, type GateKey } from '../../defects/model'
import { gateSummary } from '../../defects/rules'
import { loadGateDefs, itemLabel, type GateDefs } from '../../defects/defs'
import { useDT, gateShortName } from '../../defects/i18n'
import { fetchAllCoops, fetchDefectsForSearch, type Coop, type DefectSearchRow } from '../../defects/api'

// exported so the i18n completeness test covers these strings too
export const T = {
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
  loading: { he: 'טוען נתונים…', en: 'Loading…' },
  none: { he: 'אין נתונים עדיין.', en: 'No data yet.' },
  col_desc: { he: 'תיאור', en: 'Description' },
  col_sev: { he: 'חומרה', en: 'Severity' },
  col_assignee: { he: 'באחריות', en: 'Assignee' },
  col_due: { he: 'תאריך יעד', en: 'Due' },
  days_late: { he: 'ימי איחור', en: 'Days late' },
  col_opened_by: { he: 'נפתח ע״י', en: 'Opened by' },
  col_opened: { he: 'נפתח בתאריך', en: 'Opened on' },
} as const

export default function QCDashboard() {
  const { lang } = useI18n()
  const t = (k: keyof typeof T) => T[k][lang]
  const { dt } = useDT()
  const { projectName } = useStore()
  const nav = useNavigate()
  const [coops, setCoops] = useState<Coop[] | null>(null)
  const [items, setItems] = useState<{ coop_id: string; gate: GateKey; item_no: number; status: 'done' | 'not_done' | 'na' | null }[]>([])
  const [defects, setDefects] = useState<DefectSearchRow[]>([])
  const [defs, setDefs] = useState<GateDefs>(GATES)
  const [openTile, setOpenTile] = useState<'houses' | 'open' | 'overdue' | 'critical' | null>(null)
  const toggleTile = (k: 'houses' | 'open' | 'overdue' | 'critical') => setOpenTile((v) => (v === k ? null : k))

  useEffect(() => {
    fetchAllCoops().then(setCoops).catch(() => setCoops([]))
    supabase.from('coop_checklist_items').select('coop_id,gate,item_no,status')
      .then(({ data }) => setItems((data ?? []) as typeof items))
    fetchDefectsForSearch().then(setDefects).catch(() => {})
    loadGateDefs().then(setDefs)
  }, [])  

  // grouped by project, coops in natural order — fetch order is created_at
  const sortedCoops = useMemo(
    () => [...(coops ?? [])].sort((a, b) =>
      projectName(a.project_id).localeCompare(projectName(b.project_id), 'he')
      || a.name.localeCompare(b.name, 'he', { numeric: true })),
    [coops, projectName],
  )

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
        <button type="button" className={`qc-stat qc-stat--btn ${openTile === 'houses' ? 'on' : ''}`}
          aria-expanded={openTile === 'houses'} onClick={() => toggleTile('houses')}>
          <b>{coops.length}</b><span>{t('houses')}</span>
        </button>
        <button type="button" className={`qc-stat qc-stat--btn ${openTile === 'open' ? 'on' : ''}`}
          aria-expanded={openTile === 'open'} onClick={() => toggleTile('open')}>
          <b>{open.length}</b><span>{t('open_defects')}</span>
        </button>
        <button type="button" className={`qc-stat qc-stat--btn ${overdue.length ? 'qc-stat--bad' : ''} ${openTile === 'overdue' ? 'on' : ''}`}
          aria-expanded={openTile === 'overdue'} onClick={() => toggleTile('overdue')}>
          <b>{overdue.length}</b><span>{t('overdue')}</span>
        </button>
        <button type="button" className={`qc-stat qc-stat--btn ${criticalOpen.length ? 'qc-stat--bad' : ''} ${openTile === 'critical' ? 'on' : ''}`}
          aria-expanded={openTile === 'critical'} onClick={() => toggleTile('critical')}>
          <b>{criticalOpen.length}</b><span>{t('critical_open')}</span>
        </button>
      </div>

      {openTile === 'houses' && (
        <div className="gate-panel" style={{ marginTop: 14 }}>
          {sortedCoops.length === 0 ? <div className="empty">{t('none')}</div> : (
            <div className="qc-recurring">
              {sortedCoops.map((c) => (
                <div key={c.id} className="qc-recurring__row">
                  <button className="summary-gate-link" onClick={() => nav(`/defects/coop/${c.id}`)}><b>{c.name}</b></button>
                  <span>{projectName(c.project_id)}</span>
                  <span className="mono">{open.filter((d) => d.coop_id === c.id).length} {t('open_defects')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {openTile && openTile !== 'houses' && (() => {
        const list = openTile === 'open' ? open : openTile === 'overdue' ? overdue : criticalOpen
        const daysLate = (d: DefectSearchRow) =>
          d.due_date && d.due_date < today
            ? Math.round((Date.parse(today) - Date.parse(d.due_date)) / 86_400_000)
            : null
        return (
          <div className="gate-panel" style={{ marginTop: 14, overflowX: 'auto' }}>
            {list.length === 0 ? <div className="empty">{t('none')}</div> : (
              <table className="gate-table">
                <thead>
                  <tr>
                    <th>{dt('rep_house')}</th><th>{dt('qc_project')}</th><th>#</th>
                    <th>{t('col_desc')}</th><th>{t('col_sev')}</th><th>{t('col_assignee')}</th>
                    <th>{t('col_due')}</th><th>{t('days_late')}</th>
                    <th>{t('col_opened_by')}</th><th>{t('col_opened')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...list]
                    .sort((a, b) => (daysLate(b) ?? -1) - (daysLate(a) ?? -1))
                    .map((d) => (
                      <tr key={d.id} className={daysLate(d) !== null ? 'gate-row--bad' : ''}>
                        <td><button className="summary-gate-link" onClick={() => nav(`/defects/coop/${d.coop_id}`)}>{d.coop_name}</button></td>
                        <td>{projectName(d.project_id)}</td>
                        <td className="mono">{d.seq}</td>
                        <td>{d.description?.trim() || (d.item_no ? `${gateShortName(lang, d.gate)} · ${itemLabel(defs, d.gate, d.item_no)}` : '') || '—'}</td>
                        <td>{d.severity ? SEVERITY_LABELS[d.severity] : '—'}</td>
                        <td>{d.assignee_email ?? d.assignee ?? '—'}</td>
                        <td className="mono">{d.due_date ?? '—'}</td>
                        <td className={`mono ${daysLate(d) !== null ? 'summary-bad' : ''}`}>{daysLate(d) ?? '—'}</td>
                        <td>{d.created_by_email ?? '—'}</td>
                        <td className="mono">{d.created_at.slice(0, 10)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })()}

      <div className="gate-panel" style={{ marginTop: 20 }}>
        <h2 className="gate-panel__title">{t('by_house')}</h2>
        {sortedCoops.length === 0 ? <div className="empty">{t('none')}</div> : (
          <div className="gate-table-wrap">
            <table className="gate-table">
              <thead>
                <tr>
                  <th>{dt('rep_house')}</th><th>{dt('qc_project')}</th>
                  <th>{t('gates_col')}</th><th>{t('open_defects')}</th><th>{t('overdue')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedCoops.map((c) => {
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
    </div>
  )
}
