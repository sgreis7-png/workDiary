import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../store'
import { Loader } from '../../components/Loader'
import { fetchAllCoops, createCoop, deleteCoop, type Coop } from '../../defects/api'
import { usePerms } from '../../lib/usePerms'
import { useDT, coopTypeLabel } from '../../defects/i18n'
import { MicButton } from '../../components/MicButton'
import { readFavs, toggleFav } from '../../lib/favorites'
import { FavChips, FavStar } from '../../components/FavProjects'

export default function Coops() {
  const { projects, projectColor, projectName, ready } = useStore()
  const { canEdit } = usePerms()
  const { dt, lang } = useDT()
  const nav = useNavigate()
  const [coops, setCoops] = useState<Coop[] | null>(null)
  const [projectId, setProjectId] = useState('')
  const [favs, setFavs] = useState<string[]>(readFavs)
  const [newName, setNewName] = useState('')
  const [newProjectId, setNewProjectId] = useState('')
  const [newCount, setNewCount] = useState(1)
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetchAllCoops().then(setCoops).catch((e) => setErr(String(e.message ?? e)))
  }, [])

  const active = useMemo(() => projects.filter((p) => p.active), [projects])
  // grouped by project, coops in natural order ("לול 2" before "לול 10") — the
  // fetch order is created_at, which reads as random once a farm has many coops
  const shown = useMemo(
    () => (coops ?? [])
      .filter((c) => !projectId || c.project_id === projectId)
      .sort((a, b) =>
        projectName(a.project_id).localeCompare(projectName(b.project_id), 'he')
        || a.name.localeCompare(b.name, 'he', { numeric: true })),
    [coops, projectId, projectName],
  )
  // one block per project — `shown` is already project-sorted, so grouping is a fold
  const groups = useMemo(() => {
    const out: { id: string; coops: Coop[] }[] = []
    for (const c of shown) {
      const last = out[out.length - 1]
      if (last && last.id === c.project_id) last.coops.push(c)
      else out.push({ id: c.project_id, coops: [c] })
    }
    return out
  }, [shown])

  async function onCreate() {
    const pid = newProjectId || projectId
    if (!pid || !newName.trim() || creating) return
    setCreating(true); setErr('')
    try {
      // תבנית חווה: N לולים בבת אחת — "שם 1..N"; לול בודד שומר את השם כמו שהוא
      const n = Math.max(1, Math.min(24, newCount))
      let first = null
      for (let i = 1; i <= n; i++) {
        const coop = await createCoop(pid, n === 1 ? newName.trim() : `${newName.trim()} ${i}`)
        if (!first) first = coop
      }
      nav(n === 1 ? `/defects/coop/${first!.id}` : '/defects')
      if (n > 1) { setCreating(false); setNewName(''); fetchAllCoops().then(setCoops) }
    } catch (e) {
      setErr(String((e as Error).message ?? e)); setCreating(false)
    }
  }

  // מחיקת לול — הרשאת coops_manage בלבד; אופטימי עם שחזור בכישלון
  async function onDelete(c: Coop) {
    if (!window.confirm(dt('coop_delete_confirm'))) return
    const prev = coops
    setCoops((cs) => (cs ?? []).filter((x) => x.id !== c.id))
    try { await deleteCoop(c.id) } catch (e) { setCoops(prev); setErr(String((e as Error).message ?? e)) }
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
          {projectId && (
            <FavStar on={favs.includes(projectId)} onToggle={() => setFavs((f) => toggleFav(f, projectId))} />
          )}
          <span className="count mono">{shown.length} {dt('coops_count')}</span>
        </div>
      </div>

      <FavChips projects={active} favs={favs} activeId={projectId} onPick={setProjectId} />

      <p className="coop-intro">{dt('coops_intro')}</p>

      {err && <div className="alert">{err}</div>}

      {canEdit('defects') && (
        <div className="coop-new">
          <select className="input" value={newProjectId || projectId} onChange={(e) => setNewProjectId(e.target.value)}>
            <option value="">{dt('coops_which_project')}</option>
            {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="input-affix">
            <input
              className="input" placeholder={dt('coops_new_ph')} value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onCreate()}
            />
            <MicButton onText={(txt) => setNewName((r) => (r ? r + ' ' : '') + txt)} />
          </div>
          <input
            className="input coop-new__count" type="number" min={1} max={24} value={newCount}
            title={dt('coops_count_ph')}
            onChange={(e) => setNewCount(Number(e.target.value) || 1)}
          />
          <button className="btn btn--primary" disabled={!(newProjectId || projectId) || !newName.trim() || creating} onClick={onCreate}>
            {creating ? dt('coops_creating') : dt('coops_new')}
          </button>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty">{dt('coops_empty')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {groups.map(({ id, coops: cs }) => (
            <div key={id} className="panel" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="coop-group__head">
                <span className="coop-card__dot" style={{ background: projectColor(id) }} />
                <b>{projectName(id) || '—'}</b>
                <span className="count mono">{cs.length} {dt('coops_count')}</span>
              </div>
              <div className="row-list">
                {cs.map((c) => (
                  <div key={c.id} className="row-item" style={{ cursor: 'pointer' }}
                    role="button" tabIndex={0}
                    onClick={() => nav(`/defects/coop/${c.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter') nav(`/defects/coop/${c.id}`) }}>
                    <div className="grow">
                      <b>{c.name}</b>
                      {c.coop_type && <small style={{ marginInlineStart: 10 }}>{coopTypeLabel(lang, c.coop_type)}</small>}
                    </div>
                    {canEdit('coops_manage') && (
                      <span
                        role="button" tabIndex={0} title={dt('coop_delete')}
                        style={{ cursor: 'pointer', fontSize: 15, opacity: 0.75 }}
                        onClick={(e) => { e.stopPropagation(); void onDelete(c) }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); void onDelete(c) } }}
                      >🗑</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
