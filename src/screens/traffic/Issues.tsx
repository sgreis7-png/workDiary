import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Loader } from '../../components/Loader'
import { Button } from '../../components/ui'
import { useAuth } from '../../auth'
import { useI18n } from '../../i18n'
import { useStore } from '../../store'
import { usePerms } from '../../lib/usePerms'
import { fetchMemberDirectory, type DirectoryMember } from '../../api'
import { OWNER_KINDS, createIssue, fetchIssues, updateIssue, type Issue, type OwnerKind } from '../../traffic/api'
import { ownerLabel, tl } from '../../traffic/i18n'
import '../../styles/traffic.css'

export default function Issues() {
  const { projectId = '' } = useParams()
  const { lang } = useI18n()
  const { user } = useAuth()
  const { canEdit } = usePerms()
  const { projectName, projects, templateFor } = useStore()
  const editable = canEdit('traffic_light')
  const [open, setOpen] = useState(true)
  const [rows, setRows] = useState<Issue[] | null>(null)
  const [users, setUsers] = useState<DirectoryMember[]>([])
  const [err, setErr] = useState('')
  const [draft, setDraft] = useState({ description: '', owner_kind: 'other' as OwnerKind, blocking: false })
  // Row-level closing UI replaces window.prompt — a blocking dialog the app avoids
  // elsewhere and that automated checks can't drive.
  const [closingId, setClosingId] = useState<string | null>(null)
  const [closeNote, setCloseNote] = useState('')
  const template = templateFor(projects.find((p) => p.id === projectId)?.project_type)
  const today = new Date().toISOString().slice(0, 10)

  const reload = () => fetchIssues(projectId, open).then(setRows).catch((e) => setErr(String((e as Error).message ?? e)))
  useEffect(() => { setRows(null); setErr(''); reload(); fetchMemberDirectory().then(setUsers).catch(() => {}) }, [projectId, open])

  // updateIssue throws when RLS filters the write out — surface it rather than let the
  // cell silently revert to its old value.
  const patch = (id: string, p: Partial<Issue>) => { setErr(''); updateIssue(id, p).then(reload).catch((e) => setErr(String((e as Error).message ?? e))) }

  if (!rows) return err ? <div className="page"><div className="alert">⚠ {err}</div></div> : <Loader label={tl(lang, 'loading')} />
  const daysOpen = (i: Issue) => Math.round((Date.parse(i.closed_on ?? today) - Date.parse(i.opened_on)) / 86_400_000)

  const startClose = (id: string) => { setClosingId(id); setCloseNote('') }
  const confirmClose = (id: string) => { patch(id, { closed_on: today, closure_note: closeNote.trim() || null }); setClosingId(null) }

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker"><Link to={`/traffic/${projectId}`}>‹ {projectName(projectId)}</Link></div>
          <h1 className="page-title">⚠ {tl(lang, 'iss_title')}</h1>
        </div>
        <div className="tl-mode">
          <button className={`btn ${open ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setOpen(true)}>{tl(lang, 'iss_open')}</button>
          <button className={`btn ${!open ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setOpen(false)}>{tl(lang, 'iss_closed')}</button>
        </div>
      </div>
      {err && <div className="alert">⚠ {err}</div>}

      <table className="tl-table m-cards">
        <thead><tr>
          <th>#</th><th>{tl(lang, 'iss_col_desc')}</th><th>{tl(lang, 'iss_col_owner')}</th><th>{tl(lang, 'iss_col_owner_email')}</th>
          <th>{tl(lang, 'iss_col_due')}</th><th>{tl(lang, 'iss_col_days')}</th><th>{tl(lang, 'iss_col_blocking')}</th>
          <th>{tl(lang, 'iss_col_category')}</th><th>{tl(lang, 'iss_col_systemic')}</th><th />
        </tr></thead>
        <tbody>{rows.map((i) => (
          <tr key={i.id} className={i.blocking || i.systemic ? 'is-critical' : ''}>
            <td className="mono" data-label="#">
              {i.seq}
              {/* Distinguishes an issue born from a diary entry ("הגיע דיווח חוסם") from one
                  typed by hand here — it links straight back to the entry that raised it. */}
              {i.entry_id && <Link to={`/entry/${i.entry_id}`} title={tl(lang, 'iss_from_entry')}> 📓</Link>}
            </td>
            <td data-label={tl(lang, 'iss_col_desc')}>
              <textarea className="input" rows={2} defaultValue={i.description} disabled={!editable}
                onBlur={(e) => e.target.value !== i.description && patch(i.id, { description: e.target.value })} />
            </td>
            <td data-label={tl(lang, 'iss_col_owner')}>
              <select className="input" value={i.owner_kind} disabled={!editable}
                onChange={(e) => e.target.value !== i.owner_kind && patch(i.id, { owner_kind: e.target.value as OwnerKind })}>
                {OWNER_KINDS.map((k) => <option key={k} value={k}>{ownerLabel(lang, k)}</option>)}
              </select>
            </td>
            <td data-label={tl(lang, 'iss_col_owner_email')}>
              <select className="input" value={i.owner_email ?? ''} disabled={!editable}
                onChange={(e) => e.target.value !== (i.owner_email ?? '') && patch(i.id, { owner_email: e.target.value || null })}>
                <option value="">—</option>{users.map((u) => <option key={u.email} value={u.email.toLowerCase()}>{u.name}</option>)}
              </select>
            </td>
            <td data-label={tl(lang, 'iss_col_due')}>
              <input className="input" type="date" value={i.due_date ?? ''} disabled={!editable}
                onChange={(e) => e.target.value !== (i.due_date ?? '') && patch(i.id, { due_date: e.target.value || null })} />
            </td>
            <td className="mono" data-label={tl(lang, 'iss_col_days')}>{daysOpen(i)}</td>
            <td data-label={tl(lang, 'iss_col_blocking')}>
              <input type="checkbox" checked={i.blocking} disabled={!editable} onChange={(e) => patch(i.id, { blocking: e.target.checked })} />
            </td>
            <td data-label={tl(lang, 'iss_col_category')}>
              <select className="input" value={i.wbs_template_id ?? ''} disabled={!editable}
                onChange={(e) => e.target.value !== (i.wbs_template_id ?? '') && patch(i.id, { wbs_template_id: e.target.value || null })}>
                <option value="">—</option>{template.filter((t) => t.id).map((t) => <option key={t.id} value={t.id}>{lang === 'he' ? t.name_he : t.name_en}</option>)}
              </select>
            </td>
            <td data-label={tl(lang, 'iss_col_systemic')}>
              <input type="checkbox" checked={i.systemic} disabled={!editable} onChange={(e) => patch(i.id, { systemic: e.target.checked })} />
            </td>
            <td>{editable && (open
              ? (closingId === i.id ? (
                  <div className="tl-close-form">
                    <input className="input" placeholder={tl(lang, 'iss_close_note')} value={closeNote}
                      onChange={(e) => setCloseNote(e.target.value)} autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') confirmClose(i.id); if (e.key === 'Escape') setClosingId(null) }} />
                    <Button variant="primary" type="button" onClick={() => confirmClose(i.id)}>{tl(lang, 'save')}</Button>
                    <Button variant="ghost" type="button" onClick={() => setClosingId(null)}>{tl(lang, 'cancel')}</Button>
                  </div>
                ) : (
                  <button className="btn btn--ghost" onClick={() => startClose(i.id)}>{tl(lang, 'iss_close')}</button>
                ))
              : <button className="btn btn--ghost" onClick={() => patch(i.id, { closed_on: null, closure_note: null })}>{tl(lang, 'iss_reopen')}</button>)}
            </td>
          </tr>))}</tbody>
      </table>
      {rows.length === 0 && <div className="tl-block__empty">{tl(lang, 'proj_tasks_empty')}</div>}

      {editable && open && (
        <div className="task-new" style={{ marginTop: 14 }}>
          <input className="input" placeholder={tl(lang, 'iss_col_desc')} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <select className="input" value={draft.owner_kind} onChange={(e) => setDraft({ ...draft, owner_kind: e.target.value as OwnerKind })}>
            {OWNER_KINDS.map((k) => <option key={k} value={k}>{ownerLabel(lang, k)}</option>)}
          </select>
          <label className="task-mine"><input type="checkbox" checked={draft.blocking} onChange={(e) => setDraft({ ...draft, blocking: e.target.checked })} /> {tl(lang, 'iss_col_blocking')}</label>
          <Button variant="primary" type="button" disabled={!draft.description.trim() || !user}
            onClick={() => {
              if (!user) return
              setErr('')
              createIssue({ project_id: projectId, description: draft.description.trim(), owner_kind: draft.owner_kind, blocking: draft.blocking }, user.id)
                .then(() => { setDraft({ description: '', owner_kind: 'other', blocking: false }); reload() })
                .catch((e) => setErr(String((e as Error).message ?? e)))
            }}>
            {tl(lang, 'iss_add')}
          </Button>
        </div>
      )}
    </div>
  )
}
