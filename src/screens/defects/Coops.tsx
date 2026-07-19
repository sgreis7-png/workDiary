import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../store'
import { Loader } from '../../components/Loader'
import { fetchAllCoops, createCoop, type Coop } from '../../defects/api'
import { COOP_TYPE_LABELS } from '../../defects/model'

export default function Coops() {
  const { projects, projectColor, ready } = useStore()
  const nav = useNavigate()
  const [coops, setCoops] = useState<Coop[] | null>(null)
  const [projectId, setProjectId] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetchAllCoops().then(setCoops).catch((e) => setErr(String(e.message ?? e)))
  }, [])

  const active = useMemo(() => projects.filter((p) => p.active), [projects])
  const shown = useMemo(
    () => (coops ?? []).filter((c) => !projectId || c.project_id === projectId),
    [coops, projectId],
  )

  async function onCreate() {
    if (!projectId || !newName.trim() || creating) return
    setCreating(true); setErr('')
    try {
      const coop = await createCoop(projectId, newName.trim())
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

      <div className="coop-new">
        <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">כל הפרויקטים</option>
          {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input
          className="input" placeholder="שם / מספר לול חדש…" value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onCreate()}
        />
        <button className="btn btn--primary" disabled={!projectId || !newName.trim() || creating} onClick={onCreate}>
          ✛ לול חדש
        </button>
      </div>
      {!projectId && <p className="coop-hint">ליצירת לול חדש — בחרו קודם פרויקט.</p>}

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
