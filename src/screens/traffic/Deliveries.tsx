import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Loader } from '../../components/Loader'
import { Button } from '../../components/ui'
import { useAuth } from '../../auth'
import { useI18n } from '../../i18n'
import { useStore } from '../../store'
import { usePerms } from '../../lib/usePerms'
import { fetchMemberDirectory, type DirectoryMember } from '../../api'
import { DELIVERY_STATUSES, deleteDelivery, fetchDeliveries, upsertDelivery, type Delivery } from '../../traffic/api'
import { deliveryStatusLabel, tl } from '../../traffic/i18n'
import '../../styles/traffic.css'

/** How far ahead "needed soon" reaches for the danger highlight — tighter than the 6-week
 *  window filter below, so the row only lights up once it is genuinely close. */
const URGENT_DAYS = 10

/** Landing list for purchasing users who hold only the `deliveries` area — there is no
 *  traffic-light board for them to drill in from, so this is their front door. */
export function DeliveriesPick() {
  const { projects } = useStore()
  const { lang } = useI18n()
  return (
    <div className="page">
      <h1 className="page-title">📦 {tl(lang, 'sup_title')}</h1>
      <div className="tl-board">
        {projects.filter((p) => p.active).map((p) => (
          <Link key={p.id} className="tl-row" to={`/traffic/${p.id}/deliveries`}>
            <span /><div className="tl-row__name">{p.name}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function Deliveries() {
  const { projectId = '' } = useParams()
  const { lang } = useI18n()
  const { user } = useAuth()
  const { canEdit, can } = usePerms()
  const { projectName, projects, templateFor } = useStore()
  const editable = canEdit('traffic_light') || canEdit('deliveries')
  const [rows, setRows] = useState<Delivery[] | null>(null)
  const [users, setUsers] = useState<DirectoryMember[]>([])
  const [windowOnly, setWindowOnly] = useState(true)
  const [err, setErr] = useState('')
  const project = projects.find((p) => p.id === projectId)
  const template = templateFor(project?.project_type)

  const reload = () => fetchDeliveries(projectId).then(setRows).catch((e) => setErr(String((e as Error).message ?? e)))
  useEffect(() => { setRows(null); setErr(''); reload(); fetchMemberDirectory().then(setUsers).catch(() => {}) }, [projectId])

  // A write RLS silently filters out still throws (upsertDelivery/deleteDelivery), so any
  // failure here — permission or otherwise — surfaces as text instead of a row that
  // quietly reverts to what it was.
  const save = async (d: Partial<Delivery> & { project_id: string; item: string; need_date: string }) => {
    if (!user) return
    setErr('')
    try { await upsertDelivery(d, user.email); reload() } catch (e) { setErr(String((e as Error).message ?? e)) }
  }
  const remove = (id: string) => {
    setErr('')
    deleteDelivery(id).then(reload).catch((e) => setErr(String((e as Error).message ?? e)))
  }
  const addRow = () => save({ project_id: projectId, item: '—', need_date: new Date().toISOString().slice(0, 10) })

  if (!rows) return err ? <div className="page"><div className="alert">⚠ {err}</div></div> : <Loader label={tl(lang, 'loading')} />

  const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
  const horizon = inDays(42)
  const urgentBy = inDays(URGENT_DAYS)
  const shown = windowOnly ? rows.filter((r) => r.status !== 'on_site' && r.need_date <= horizon) : rows
  const isUrgent = (r: Delivery) => r.status === 'not_ordered' && r.need_date <= urgentBy

  return (
    <div className="page">
      <div className="page__head">
        <div>
          {/* a deliveries-only user (purchasing) has no traffic_light area — the breadcrumb
              would bounce them straight back to the home screen, so it's plain text for them */}
          <div className="kicker">{can('traffic_light')
            ? <Link to={`/traffic/${projectId}`}>‹ {projectName(projectId)}</Link>
            : `‹ ${projectName(projectId)}`}</div>
          <h1 className="page-title">📦 {tl(lang, 'sup_title')}</h1>
        </div>
        <label className="task-mine"><input type="checkbox" checked={windowOnly} onChange={(e) => setWindowOnly(e.target.checked)} /> {tl(lang, 'sup_window_only')}</label>
      </div>
      {err && <div className="alert">⚠ {err}</div>}
      <table className="tl-table m-cards">
        <thead><tr>
          <th>{tl(lang, 'sup_col_item')}</th><th>{tl(lang, 'sup_col_cat')}</th><th>{tl(lang, 'sup_col_need')}</th>
          <th>{tl(lang, 'sup_col_status')}</th><th>{tl(lang, 'sup_col_eta')}</th><th>{tl(lang, 'sup_col_owner')}</th><th />
        </tr></thead>
        <tbody>{shown.map((r) => (
          <tr key={r.id} className={isUrgent(r) ? 'is-critical' : ''}>
            <td data-label={tl(lang, 'sup_col_item')}>
              <input className="input" defaultValue={r.item} disabled={!editable}
                onBlur={(e) => e.target.value !== r.item && save({ ...r, item: e.target.value })} />
            </td>
            <td data-label={tl(lang, 'sup_col_cat')}>
              <select className="input" value={r.wbs_template_id ?? ''} disabled={!editable}
                onChange={(e) => e.target.value !== (r.wbs_template_id ?? '') && save({ ...r, wbs_template_id: e.target.value || null })}>
                <option value="">—</option>
                {/* fallback (offline/unreachable templates) rows carry id: '' — writing one into
                    this uuid column would surface as a raw Postgres cast error, so skip them */}
                {template.filter((t) => t.id).map((t) => <option key={t.id} value={t.id}>{lang === 'he' ? t.name_he : t.name_en}</option>)}
              </select>
            </td>
            <td data-label={tl(lang, 'sup_col_need')}>
              <input className="input" type="date" value={r.need_date} disabled={!editable}
                onChange={(e) => e.target.value !== r.need_date && save({ ...r, need_date: e.target.value })} />
            </td>
            <td data-label={tl(lang, 'sup_col_status')}>
              <select className="input" value={r.status} disabled={!editable}
                onChange={(e) => e.target.value !== r.status && save({ ...r, status: e.target.value as Delivery['status'] })}>
                {DELIVERY_STATUSES.map((s) => <option key={s} value={s}>{deliveryStatusLabel(lang, s)}</option>)}
              </select>
            </td>
            <td data-label={tl(lang, 'sup_col_eta')}>
              <input className="input" type="date" value={r.eta ?? ''} disabled={!editable}
                onChange={(e) => e.target.value !== (r.eta ?? '') && save({ ...r, eta: e.target.value || null })} />
            </td>
            <td data-label={tl(lang, 'sup_col_owner')}>
              <select className="input" value={r.owner_email ?? ''} disabled={!editable}
                onChange={(e) => e.target.value !== (r.owner_email ?? '') && save({ ...r, owner_email: e.target.value || null })}>
                <option value="">—</option>{users.map((u) => <option key={u.email} value={u.email.toLowerCase()}>{u.name}</option>)}
              </select>
            </td>
            <td>{editable && <button className="rtable__del" onClick={() => remove(r.id)} aria-label={tl(lang, 'delete')}>✕</button>}</td>
          </tr>))}</tbody>
      </table>
      {shown.length === 0 && <div className="tl-block__empty">{tl(lang, 'proj_tasks_empty')}</div>}
      {editable && <Button variant="ghost" type="button" onClick={addRow} style={{ marginTop: 10 }}>{tl(lang, 'sup_add')}</Button>}
    </div>
  )
}
