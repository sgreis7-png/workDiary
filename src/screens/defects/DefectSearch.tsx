import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../store'
import { Loader } from '../../components/Loader'
import { fetchAllCoops, fetchDefectsForSearch, type Coop, type DefectSearchRow } from '../../defects/api'
import { GATES, SEVERITY_LABELS, DEFECT_STATUS_LABELS } from '../../defects/model'
import { loadGateDefs, itemLabel, type GateDefs } from '../../defects/defs'

/** חיפוש בניהול ליקויים — חופשי / לפי פרויקט / לפי לול. */
export default function DefectSearch() {
  const { projects, ready } = useStore()
  const nav = useNavigate()
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

  const active = projects // כמו בניהול עבודה — כל הפרויקטים, לא רק פעילים

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

  if (!ready || coops === null || defects === null) return <Loader label="טוען…" />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">ניהול ליקויים</div>
          <h1 className="page-title">חיפוש</h1>
        </div>
        <span className="count mono">{results.length} תוצאות</span>
      </div>

      {err && <div className="alert">{err}</div>}

      <div className="coop-search">
        <input
          className="input" placeholder="🔍 חיפוש חופשי — ליקויים, סעיפים, אחראים, לולים…"
          value={q} onChange={(e) => setQ(e.target.value)} autoFocus
        />
        <select className="input" value={projectId} onChange={(e) => { setProjectId(e.target.value); setCoopId('') }}>
          <option value="">כל הפרויקטים</option>
          {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input" value={coopId} onChange={(e) => setCoopId(e.target.value)}>
          <option value="">כל הלולים</option>
          {coops.filter((c) => !projectId || c.project_id === projectId)
            .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {results.length === 0 ? (
        <div className="empty"><div className="big">לא נמצאו ליקויים תואמים</div>נסו לשנות את הסינון או את מילות החיפוש.</div>
      ) : (
        <div className="gate-table-wrap" style={{ background: 'var(--panel)', border: '1px solid var(--panel-edge)', borderRadius: 'var(--r-lg)', padding: 16 }}>
          <table className="gate-table defect-table">
            <thead>
              <tr><th>לול</th><th>שער</th><th>סעיף</th><th>תיאור</th><th>חומרה</th><th>אחראי</th><th>תאריך יעד</th><th>סטטוס</th><th></th></tr>
            </thead>
            <tbody>
              {results.map((d) => (
                <tr key={d.id} className={d.status === 'open' && (d.severity === 'critical' || d.severity === 'major') ? 'gate-row--bad' : ''}>
                  <td>{d.coop_name}</td>
                  <td>{GATES[d.gate].shortName}</td>
                  <td>{d.item_no ? itemLabel(defs, d.gate, d.item_no) : '—'}</td>
                  <td>{d.description ?? '—'}</td>
                  <td>{d.severity ? SEVERITY_LABELS[d.severity] : '—'}</td>
                  <td>{d.assignee ?? '—'}</td>
                  <td className="mono">{d.due_date ? new Date(d.due_date).toLocaleDateString('he-IL') : '—'}</td>
                  <td>{DEFECT_STATUS_LABELS[d.status]}</td>
                  <td><button className="btn btn--quiet" onClick={() => nav(`/defects/coop/${d.coop_id}`)}>פתיחה ←</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
