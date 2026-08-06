import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../store'
import { Loader } from '../../components/Loader'
import { fetchAllCoops, fetchDefectsForSearch, type Coop, type DefectSearchRow } from '../../defects/api'
import { GATES, SEVERITY_LABELS, DEFECT_STATUS_LABELS } from '../../defects/model'
import { loadGateDefs, itemLabel, type GateDefs } from '../../defects/defs'
import { useDT, severityLabel, defectStatusLabel, gateShortName } from '../../defects/i18n'
import { MicButton } from '../../components/MicButton'
import { downloadCsv } from '../../lib/exportCsv'

/** חיפוש בניהול ליקויים — חופשי / לפי פרויקט / לפי לול. */
export default function DefectSearch() {
  const { projects, ready, projectName } = useStore()
  const nav = useNavigate()
  const { dt, lang } = useDT()
  const [coops, setCoops] = useState<Coop[] | null>(null)
  const [defects, setDefects] = useState<DefectSearchRow[] | null>(null)
  const [defs, setDefs] = useState<GateDefs>(GATES)
  const [q, setQ] = useState('')
  const [projectId, setProjectId] = useState('')
  const [coopId, setCoopId] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    fetchAllCoops().then(setCoops).catch((e) => setErr(String(e.message ?? e)))
    fetchDefectsForSearch().then(setDefects).catch((e) => setErr(String(e.message ?? e)))
    loadGateDefs().then(setDefs)
  }, [])

  const active = useMemo(() => projects.filter((p) => p.active), [projects])

  const results = useMemo(() => {
    if (!defects) return []
    const text = q.trim().toLowerCase()
    return defects.filter((d) => {
      if (projectId && d.project_id !== projectId) return false
      if (coopId && d.coop_id !== coopId) return false
      if (!text) return true
      const hay = [
        d.description, d.assignee, d.closure_note, d.coop_name,
        GATES[d.gate].shortName,
        d.item_no ? itemLabel(defs, d.gate, d.item_no) : '',
        d.severity ? SEVERITY_LABELS[d.severity] : '',
        DEFECT_STATUS_LABELS[d.status],
      ].join(' ').toLowerCase()
      return hay.includes(text)
    })
  }, [defects, projectId, coopId, q, defs])

  if (!ready || coops === null || defects === null) return <Loader label="…" />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{dt('coops_title')}</div>
          <h1 className="page-title">{dt('search_title')}</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="count mono">{results.length} {dt('search_results')}</span>
          {results.length > 0 && (
            <button className="btn btn--ghost" onClick={() => downloadCsv('defects', [
              dt('sum_gate'), dt('dl_item'), dt('dl_desc'), dt('dl_severity'), dt('dl_assignee'),
              dt('dl_due'), dt('dl_status'), dt('dl_closed_on'), dt('rep_house'), dt('coops_which_project'),
            ], results.map((d) => [
              gateShortName(lang, d.gate),
              d.item_no ? itemLabel(defs, d.gate, d.item_no) : '',
              d.description ?? '', d.severity ? severityLabel(lang, d.severity) : '',
              d.assignee ?? '', d.due_date ?? '', defectStatusLabel(lang, d.status),
              d.closed_on ?? '', d.coop_name, projectName(d.project_id),
            ]))}>⭳ {dt('export_csv')}</button>
          )}
        </div>
      </div>

      {err && <div className="alert">{err}</div>}

      <div className="coop-search">
        <div className="input-affix">
          <input
            className="input" placeholder={dt('search_ph')}
            value={q} onChange={(e) => setQ(e.target.value)} autoFocus
          />
          <MicButton onText={(txt) => setQ((r) => (r ? r + ' ' : '') + txt)} />
        </div>
        <select className="input" value={projectId} onChange={(e) => { setProjectId(e.target.value); setCoopId('') }}>
          <option value="">{dt('coops_all_projects')}</option>
          {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input" value={coopId} onChange={(e) => setCoopId(e.target.value)}>
          <option value="">{dt('search_all_coops')}</option>
          {coops.filter((c) => !projectId || c.project_id === projectId)
            .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {results.length === 0 ? (
        <div className="empty"><div className="big">{dt('search_none_title')}</div>{dt('search_none_sub')}</div>
      ) : (
        <div className="gate-table-wrap" style={{ background: 'var(--panel)', border: '1px solid var(--panel-edge)', borderRadius: 'var(--r-lg)', padding: 16 }}>
          <table className="gate-table defect-table m-cards m-cards--stats">
            <thead>
              <tr><th>{dt('rep_house')}</th><th>{dt('sum_gate')}</th><th>{dt('dl_item')}</th><th>{dt('dl_desc')}</th><th>{dt('dl_severity')}</th><th>{dt('dl_assignee')}</th><th>{dt('dl_due_short')}</th><th>{dt('dl_status')}</th><th></th></tr>
            </thead>
            <tbody>
              {results.map((d) => (
                <tr key={d.id} className={d.status === 'open' && (d.severity === 'critical' || d.severity === 'major') ? 'gate-row--bad' : ''}>
                  <td className="gate-table__item">{d.coop_name}</td>
                  <td data-label={dt('sum_gate')}>{gateShortName(lang, d.gate)}</td>
                  <td data-label={dt('dl_item')}>{d.item_no ? itemLabel(defs, d.gate, d.item_no) : '—'}</td>
                  <td data-label={dt('dl_desc')}>{d.description ?? '—'}</td>
                  <td data-label={dt('dl_severity')}>{d.severity ? severityLabel(lang, d.severity) : '—'}</td>
                  <td data-label={dt('dl_assignee')}>{d.assignee ?? '—'}</td>
                  <td className="mono" data-label={dt('dl_due_short')}>{d.due_date ? new Date(d.due_date).toLocaleDateString('he-IL') : '—'}</td>
                  <td data-label={dt('dl_status')}>{defectStatusLabel(lang, d.status)}</td>
                  <td><button className="btn btn--quiet" onClick={() => nav(`/defects/coop/${d.coop_id}`)}>{dt('search_open')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
