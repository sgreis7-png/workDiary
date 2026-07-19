import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../store'
import { Loader } from '../../components/Loader'
import { fetchAllCoops, createCoop, fetchDefectsForSearch, type Coop, type DefectSearchRow } from '../../defects/api'
import { COOP_TYPE_LABELS, GATES, SEVERITY_LABELS, DEFECT_STATUS_LABELS } from '../../defects/model'
import { loadGateDefs, itemLabel, type GateDefs } from '../../defects/defs'
import { usePerms } from '../../lib/usePerms'

export default function Coops() {
  const { projects, projectColor, ready } = useStore()
  const { canEdit } = usePerms()
  const nav = useNavigate()
  const [coops, setCoops] = useState<Coop[] | null>(null)
  const [projectId, setProjectId] = useState('')
  const [newName, setNewName] = useState('')
  const [newProjectId, setNewProjectId] = useState('')
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState('')
  // חיפוש ליקויים: חופשי + פרויקט + לול
  const [q, setQ] = useState('')
  const [qCoop, setQCoop] = useState('')
  const [defects, setDefects] = useState<DefectSearchRow[] | null>(null)
  const [defs, setDefs] = useState<GateDefs>(GATES)

  useEffect(() => {
    fetchAllCoops().then(setCoops).catch((e) => setErr(String(e.message ?? e)))
    fetchDefectsForSearch().then(setDefects).catch((e) => setErr(String(e.message ?? e)))
    loadGateDefs().then(setDefs)
  }, [])

  const active = useMemo(() => projects.filter((p) => p.active), [projects])
  const shown = useMemo(
    () => (coops ?? []).filter((c) =>
      (!projectId || c.project_id === projectId)
      && (!q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()))),
    [coops, projectId, q],
  )

  const defectResults = useMemo(() => {
    if (!defects) return []
    const text = q.trim().toLowerCase()
    return defects.filter((d) => {
      if (projectId && d.project_id !== projectId) return false
      if (qCoop && d.coop_id !== qCoop) return false
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
  }, [defects, projectId, qCoop, q])

  const searching = q.trim().length > 0 || qCoop !== ''

  async function onCreate() {
    const pid = newProjectId || projectId
    if (!pid || !newName.trim() || creating) return
    setCreating(true); setErr('')
    try {
      const coop = await createCoop(pid, newName.trim())
      nav(`/defects/coop/${coop.id}`)
    } catch (e) {
      setErr(String((e as Error).message ?? e)); setCreating(false)
    }
  }

  if (!ready || coops === null) return <Loader label="טוען לולים…" />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">תפיסת סיום שלב · Hold Points</div>
          <h1 className="page-title">ניהול ליקויים</h1>
        </div>
        <span className="count mono">{shown.length} לולים</span>
      </div>
      <p className="coop-intro">כל לול בחווה נתפס בנפרד. בוחרים פרויקט, פותחים לול, וממלאים את השערים.</p>

      {err && <div className="alert">{err}</div>}

      <div className="coop-search">
        <input
          className="input" placeholder="🔍 חיפוש חופשי — ליקויים, סעיפים, אחראים, לולים…"
          value={q} onChange={(e) => setQ(e.target.value)}
        />
        <select className="input" value={projectId} onChange={(e) => { setProjectId(e.target.value); setQCoop('') }}>
          <option value="">כל הפרויקטים</option>
          {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input" value={qCoop} onChange={(e) => setQCoop(e.target.value)}>
          <option value="">כל הלולים</option>
          {(coops ?? []).filter((c) => !projectId || c.project_id === projectId)
            .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {searching && (
        <div className="search-results">
          <h2 className="search-results__title">תוצאות בליקויים ({defectResults.length})</h2>
          {defectResults.length === 0 ? (
            <div className="empty">לא נמצאו ליקויים תואמים.</div>
          ) : (
            <div className="gate-table-wrap">
              <table className="gate-table defect-table">
                <thead>
                  <tr><th>לול</th><th>שער</th><th>סעיף</th><th>תיאור</th><th>חומרה</th><th>אחראי</th><th>סטטוס</th><th></th></tr>
                </thead>
                <tbody>
                  {defectResults.map((d) => (
                    <tr key={d.id} className={d.status === 'open' && (d.severity === 'critical' || d.severity === 'major') ? 'gate-row--bad' : ''}>
                      <td>{d.coop_name}</td>
                      <td>{GATES[d.gate].shortName}</td>
                      <td>{d.item_no ? itemLabel(defs, d.gate, d.item_no) : '—'}</td>
                      <td>{d.description ?? '—'}</td>
                      <td>{d.severity ? SEVERITY_LABELS[d.severity] : '—'}</td>
                      <td>{d.assignee ?? '—'}</td>
                      <td>{DEFECT_STATUS_LABELS[d.status]}</td>
                      <td><button className="btn btn--quiet" onClick={() => nav(`/defects/coop/${d.coop_id}`)}>פתיחה ←</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {canEdit('defects') && (
        <div className="coop-new">
          <select className="input" value={newProjectId || projectId} onChange={(e) => setNewProjectId(e.target.value)}>
            <option value="">לאיזה פרויקט?</option>
            {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input
            className="input" placeholder="שם / מספר לול חדש…" value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onCreate()}
          />
          <button className="btn btn--primary" disabled={!(newProjectId || projectId) || !newName.trim() || creating} onClick={onCreate}>
            {creating ? 'יוצר…' : '✛ לול חדש'}
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty">אין עדיין לולים{projectId ? ' בפרויקט הזה' : ''}. פתחו לול חדש למעלה.</div>
      ) : (
        <div className="coop-grid">
          {shown.map((c) => {
            const proj = projects.find((p) => p.id === c.project_id)
            return (
              <button key={c.id} className="coop-card" onClick={() => nav(`/defects/coop/${c.id}`)}>
                <span className="coop-card__dot" style={{ background: projectColor(c.project_id) }} />
                <span className="coop-card__name">{c.name}</span>
                <span className="coop-card__meta">
                  {proj?.name ?? '—'}
                  {c.coop_type ? ` · ${COOP_TYPE_LABELS[c.coop_type]}` : ''}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
