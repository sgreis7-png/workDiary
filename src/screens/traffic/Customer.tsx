import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Loader } from '../../components/Loader'
import { Button } from '../../components/ui'
import { useAuth } from '../../auth'
import { useI18n } from '../../i18n'
import { useStore } from '../../store'
import { usePerms } from '../../lib/usePerms'
import {
  COMMITMENT_KINDS, COMMITMENT_STATUSES, deleteCommitment, fetchCommitments, upsertCommitment,
  type Commitment,
} from '../../traffic/api'
import { commitmentKindLabel, commitmentStatusLabel, tl } from '../../traffic/i18n'
import '../../styles/traffic.css'

/** A notice older than this no longer reads as timely protection for a *current* overdue
 *  item — a notice sent weeks ago, before this delay was even known, does not cover it. */
const NOTICE_STALE_DAYS = 7

/** True once the row is the one thing this screen exists to surface: not done, past its
 *  agreed date, blocking our own work, and without a written notice recent enough to count
 *  as the customer having been put on notice. */
function isCritical(c: Commitment, today: string): boolean {
  if (c.status === 'done' || !c.blocking || c.due_date >= today) return false
  if (!c.notice_sent_on) return true
  const ageDays = Math.round((Date.parse(today) - Date.parse(c.notice_sent_on)) / 86_400_000)
  return ageDays > NOTICE_STALE_DAYS
}

export default function Customer() {
  const { projectId = '' } = useParams()
  const { lang } = useI18n()
  const { user } = useAuth()
  const { canEdit } = usePerms()
  const { projectName, assignments } = useStore()
  // The RLS policy (0064/0066) is the real gate: traffic-light editors, or is_project_manager()
  // for this project — which the client can't evaluate directly, so it's approximated here
  // from the assignments map. `assignments` holds emails, not user ids (see fetchAssignments
  // in src/api.ts and how Projects.tsx reads the same array) — the `user_id[]` comment on the
  // store type is wrong. It also holds everyone assigned to the project, not only its manager,
  // so this over-grants slightly on purpose; the database policy is what actually decides
  // whether a write lands, and a rejected one still surfaces through `save`'s catch below.
  const editable = canEdit('traffic_light') || Boolean(user && assignments[projectId]?.includes(user.email.toLowerCase()))
  // The notice columns are the PMO's alone — a trigger pins them for anyone who isn't a
  // traffic-light editor, so a project manager's edit there would take on screen and then
  // vanish on reload. Don't offer that; show them read-only instead.
  const noticeEditable = canEdit('traffic_light')
  const [rows, setRows] = useState<Commitment[] | null>(null)
  const [err, setErr] = useState('')
  const today = new Date().toISOString().slice(0, 10)

  const reload = () => fetchCommitments(projectId).then(setRows).catch((e) => setErr(String((e as Error).message ?? e)))
  useEffect(() => { setRows(null); setErr(''); reload() }, [projectId])

  // The database is the authority — a write RLS silently narrows still throws (upsert/delete
  // both select the row back and error when nothing came back), so any rejection surfaces as
  // text instead of a field that quietly reverts.
  const save = (c: Partial<Commitment> & { project_id: string; item: string; due_date: string }) => {
    if (!user) return
    setErr('')
    upsertCommitment(c, user.email).then(reload).catch((e) => setErr(String((e as Error).message ?? e)))
  }
  const remove = (id: string) => {
    setErr('')
    deleteCommitment(id).then(reload).catch((e) => setErr(String((e as Error).message ?? e)))
  }
  const addRow = () => save({ project_id: projectId, item: '—', due_date: today })

  if (!rows) return err ? <div className="page"><div className="alert">⚠ {err}</div></div> : <Loader label={tl(lang, 'loading')} />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{canEdit('traffic_light')
            ? <Link to={`/traffic/${projectId}`}>‹ {projectName(projectId)}</Link>
            : `‹ ${projectName(projectId)}`}</div>
          <h1 className="page-title">📄 {tl(lang, 'cust_title')}</h1>
        </div>
      </div>
      {err && <div className="alert">⚠ {err}</div>}
      {/* A project manager sees two greyed date/text boxes below with no code comment to
          explain them — say it here instead. */}
      {editable && !noticeEditable && <div className="tl-hint">{tl(lang, 'cust_notice_pmo_only')}</div>}

      <table className="tl-table m-cards">
        <thead><tr>
          <th>{tl(lang, 'cust_col_item')}</th><th>{tl(lang, 'cust_col_kind')}</th><th>{tl(lang, 'cust_col_due')}</th>
          <th>{tl(lang, 'cust_col_status')}</th><th>{tl(lang, 'cust_col_ref')}</th><th>{tl(lang, 'cust_col_blocking')}</th>
          <th>{tl(lang, 'cust_col_notice')}</th><th>{tl(lang, 'cust_col_notice_ref')}</th><th />
        </tr></thead>
        <tbody>{rows.map((c) => {
          const critical = isCritical(c, today)
          return (
            <tr key={c.id} className={critical ? 'is-critical' : ''}>
              <td data-label={tl(lang, 'cust_col_item')}>
                {/* One wrapper so the phone card's flex cell sees a single child — the input
                    and the warning fighting for width as separate flex children is what
                    crushed this sentence on a narrow screen. */}
                <div className="tl-cell-wrap">
                  <input className="input" defaultValue={c.item} disabled={!editable}
                    onBlur={(e) => e.target.value !== c.item && save({ ...c, item: e.target.value })} />
                  {critical && <div className="tl-notice-warn">⚠ {tl(lang, 'cust_notice_missing')}</div>}
                </div>
              </td>
              <td data-label={tl(lang, 'cust_col_kind')}>
                <select className="input" value={c.kind} disabled={!editable}
                  onChange={(e) => e.target.value !== c.kind && save({ ...c, kind: e.target.value as Commitment['kind'] })}>
                  {COMMITMENT_KINDS.map((k) => <option key={k} value={k}>{commitmentKindLabel(lang, k)}</option>)}
                </select>
              </td>
              <td data-label={tl(lang, 'cust_col_due')}>
                {/* due_date is NOT NULL — clearing the picker yields '', which onChange must
                    not forward to save (Postgres would reject the empty-string date cast). */}
                <input className="input" type="date" value={c.due_date} disabled={!editable}
                  onChange={(e) => e.target.value && e.target.value !== c.due_date && save({ ...c, due_date: e.target.value })} />
              </td>
              <td data-label={tl(lang, 'cust_col_status')}>
                <select className="input" value={c.status} disabled={!editable}
                  onChange={(e) => e.target.value !== c.status && save({ ...c, status: e.target.value as Commitment['status'] })}>
                  {COMMITMENT_STATUSES.map((s) => <option key={s} value={s}>{commitmentStatusLabel(lang, s)}</option>)}
                </select>
              </td>
              <td data-label={tl(lang, 'cust_col_ref')}>
                <input className="input" defaultValue={c.confirmation_ref ?? ''} disabled={!editable}
                  onBlur={(e) => e.target.value !== (c.confirmation_ref ?? '') && save({ ...c, confirmation_ref: e.target.value || null })} />
              </td>
              <td data-label={tl(lang, 'cust_col_blocking')}>
                <input type="checkbox" checked={c.blocking} disabled={!editable}
                  onChange={(e) => save({ ...c, blocking: e.target.checked })} />
              </td>
              {/* Read-only for anyone but a traffic-light editor — the 0066 trigger pins these
                  two columns server-side, so disabling them here just spares a PM a write that
                  would look like it worked and then evaporate on reload. */}
              <td data-label={tl(lang, 'cust_col_notice')}>
                <input className="input" type="date" value={c.notice_sent_on ?? ''} disabled={!noticeEditable}
                  onChange={(e) => e.target.value !== (c.notice_sent_on ?? '') && save({ ...c, notice_sent_on: e.target.value || null })} />
              </td>
              <td data-label={tl(lang, 'cust_col_notice_ref')}>
                <input className="input" defaultValue={c.notice_ref ?? ''} disabled={!noticeEditable}
                  onBlur={(e) => e.target.value !== (c.notice_ref ?? '') && save({ ...c, notice_ref: e.target.value || null })} />
              </td>
              {/* Unlike Deliveries.tsx's bare `<td>`, this gets a data-label — a lone ✕ with
                  no caption reads fine in a dense desktop row but is easy to miss as the last
                  line of a phone card stacked under eight labelled fields. */}
              <td data-label={tl(lang, 'delete')}>{canEdit('traffic_light') && <button className="rtable__del" onClick={() => remove(c.id)} aria-label={tl(lang, 'delete')}>✕</button>}</td>
            </tr>
          )
        })}</tbody>
      </table>
      {rows.length === 0 && <div className="tl-block__empty">{tl(lang, 'cust_empty')}</div>}
      {editable && <Button variant="ghost" type="button" onClick={addRow} style={{ marginTop: 10 }}>{tl(lang, 'cust_add')}</Button>}
    </div>
  )
}
