import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../store'
import { Loader } from '../../components/Loader'
import { fetchAllCoops, createCoop, type Coop } from '../../defects/api'
import { COOP_TYPE_LABELS } from '../../defects/model'
import { usePerms } from '../../lib/usePerms'
import { useDT, coopTypeLabel } from '../../defects/i18n'

export default function Coops() {
  const { projects, projectColor, ready } = useStore()
  const { canEdit } = usePerms()
  const { dt, lang } = useDT()
  const nav = useNavigate()
  const [coops, setCoops] = useState<Coop[] | null>(null)
  const [projectId, setProjectId] = useState('')
  const [newName, setNewName] = useState('')
  const [newProjectId, setNewProjectId] = useState('')
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

  if (!ready || coops === null) return <Loader label={dt('coops_loading')} />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{dt('coops_kicker')}</div>
          <h1 className="page-title">{dt('coops_title')}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <select className="input" style={{ width: 'auto', minWidth: 200 }} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">{dt('coops_all_projects')}</option>
            {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="count mono">{shown.length} {dt('coops_count')}</span>
        </div>
      </div>
      <p className="coop-intro">{dt('coops_intro')}</p>

      {err && <div className="alert">{err}</div>}

      {canEdit('defects') && (
        <div className="coop-new">
          <select className="input" value={newProjectId || projectId} onChange={(e) => setNewProjectId(e.target.value)}>
            <option value="">{dt('coops_which_project')}</option>
            {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input
            className="input" placeholder={dt('coops_new_ph')} value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onCreate()}
          />
          <button className="btn btn--primary" disabled={!(newProjectId || projectId) || !newName.trim() || creating} onClick={onCreate}>
            {creating ? dt('coops_creating') : dt('coops_new')}
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty">{dt('coops_empty')}</div>
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
                  {c.coop_type ? ` · ${coopTypeLabel(lang, c.coop_type)}` : ''}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
