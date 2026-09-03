import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader } from '../components/Loader'
import { useAuth } from '../auth'
import { useStore } from '../store'
import { useI18n } from '../i18n'
import { usePerms } from '../lib/usePerms'
import { fetchMemberDirectory, type DirectoryMember } from '../api'
import { fetchTasks, createTask, updateTask, deleteTask, type WorkTask } from '../lib/tasks'
import { axisLabel } from '../traffic/i18n'
import { notifyUser } from '../defects/api'
import { sendPush } from '../lib/push'

// exported so the i18n completeness test covers these strings too
export const T = {
  kicker: { he: 'עבודות לביצוע', en: 'Work to do' },
  title: { he: 'משימות', en: 'Tasks' },
  open_n: { he: 'פתוחות', en: 'open' },
  new_ph: { he: 'משימה חדשה… (למשל: להזמין בטון ללול 3)', en: 'New task… (e.g. order concrete for house 3)' },
  no_project: { he: 'ללא פרויקט', en: 'No project' },
  no_assignee: { he: 'ללא אחראי', en: 'No assignee' },
  add: { he: '✛ הוספה', en: '✛ Add' },
  empty: { he: 'אין משימות. הוסיפו למעלה.', en: 'No tasks. Add one above.' },
  due: { he: 'יעד', en: 'Due' },
  overdue: { he: 'באיחור', en: 'Overdue' },
  done: { he: 'בוצע', en: 'Done' },
  reopen: { he: 'החזרה לפתוח', en: 'Reopen' },
  del: { he: 'מחיקה', en: 'Delete' },
  edit_task: { he: 'עריכה', en: 'Edit' },
  assigned_notif: { he: 'הוקצתה לך משימה', en: 'A task was assigned to you' },
  loading: { he: 'טוען משימות…', en: 'Loading tasks…' },
  mine_only: { he: 'רק שלי', en: 'Mine only' },
  only_tl: { he: 'רק רמזור', en: 'Traffic light only' },
  by_assignee: { he: 'לפי אחראי', en: 'By assignee' },
  pmo_only: { he: 'סגירה על ידי PMO בלבד', en: 'PMO closes this' },
} as const

export default function Tasks() {
  const { user, isAdmin } = useAuth()
  const { lang } = useI18n()
  const t = (k: keyof typeof T) => T[k][lang]
  const { canEdit, can } = usePerms()
  const { projects, projectName } = useStore()
  const [tasks, setTasks] = useState<WorkTask[] | null>(null)
  const [users, setUsers] = useState<DirectoryMember[]>([])
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState('')
  const [assignee, setAssignee] = useState('')
  const [due, setDue] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [tlOnly, setTlOnly] = useState(false)
  const [err, setErr] = useState('')
  // inline edit: id of the task being edited + its draft values
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ title: '', project_id: '', assignee_email: '', due_date: '' })

  const reload = () => fetchTasks().then(setTasks).catch((e) => setErr(String(e.message ?? e)))
  useEffect(() => {
    reload()
    // the directory is already limited to active, registered members
    fetchMemberDirectory().then(setUsers).catch(() => setUsers([]))
  }, [])

  const me = user?.email?.toLowerCase()
  const shown = useMemo(() => {
    let list = tasks ?? []
    if (mineOnly) list = list.filter((x) => x.assignee_email?.toLowerCase() === me || x.created_by.toLowerCase() === me)
    if (tlOnly) {
      list = list.filter((x) => x.source === 'traffic_light')
      list = [...list].sort((a, b) => (a.assignee_email ?? '~').localeCompare(b.assignee_email ?? '~') || (a.due_date ?? '9').localeCompare(b.due_date ?? '9'))
    }
    return list
  }, [tasks, mineOnly, tlOnly, me])

  const nameOf = (email: string | null) =>
    email ? (users.find((u) => u.email.toLowerCase() === email.toLowerCase())?.name ?? email) : '—'

  // the DB trigger enforces the same rule server-side; this is the courteous UI half of it
  const canClose = (x: WorkTask) => x.source !== 'traffic_light' || canEdit('traffic_light')

  async function onAdd() {
    if (!user || !title.trim()) return
    setErr('')
    try {
      const task = await createTask({
        title: title.trim(), created_by: user.email,
        project_id: projectId || null, assignee_email: assignee || null, due_date: due || null,
      })
      if (task.assignee_email && task.assignee_email !== me) {
        notifyUser(task.assignee_email, t('assigned_notif'), task.title + (task.due_date ? ` · ${t('due')} ${new Date(task.due_date).toLocaleDateString('he-IL')}` : ''), '/tasks')
        sendPush([task.assignee_email], t('assigned_notif'), task.title, '/tasks')
      }
      setTitle(''); setDue(''); setAssignee(''); reload()
    } catch (e) { setErr(String((e as Error).message ?? e)) }
  }

  async function toggle(x: WorkTask) {
    if (!canClose(x)) return
    const status = x.status === 'open' ? 'done' : 'open'
    await updateTask(x.id, { status, done_at: status === 'done' ? new Date().toISOString() : null, closed_by: status === 'done' ? (me ?? null) : null })
    reload()
  }

  const startEdit = (x: WorkTask) => {
    setEditId(x.id)
    setDraft({
      title: x.title, project_id: x.project_id ?? '',
      assignee_email: x.assignee_email ?? '', due_date: x.due_date ?? '',
    })
  }

  async function saveEdit(x: WorkTask) {
    if (!draft.title.trim()) return
    setErr('')
    try {
      await updateTask(x.id, {
        title: draft.title.trim(),
        project_id: draft.project_id || null,
        assignee_email: draft.assignee_email || null,
        due_date: draft.due_date || null,
      })
      // reassignment notifies the new assignee, same as creation does
      if (draft.assignee_email && draft.assignee_email !== (x.assignee_email ?? '') && draft.assignee_email !== me) {
        notifyUser(draft.assignee_email, t('assigned_notif'), draft.title, '/tasks')
        sendPush([draft.assignee_email], t('assigned_notif'), draft.title, '/tasks')
      }
      setEditId(null)
      reload()
    } catch (e) { setErr(String((e as Error).message ?? e)) }
  }

  if (!tasks) return <Loader label={t('loading')} />
  const openCount = tasks.filter((x) => x.status === 'open').length
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{t('kicker')}</div>
          <h1 className="page-title">{t('title')}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label className="task-mine"><input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> {t('mine_only')}</label>
          <label className="task-mine"><input type="checkbox" checked={tlOnly} onChange={(e) => setTlOnly(e.target.checked)} /> {t('only_tl')}{tlOnly ? ` · ${t('by_assignee')}` : ''}</label>
          <span className="count mono">{openCount} {t('open_n')}</span>
        </div>
      </div>

      {err && <div className="alert">{err}</div>}

      <div className="task-new">
        <input className="input" placeholder={t('new_ph')} value={title}
          onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onAdd()} />
        <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">{t('no_project')}</option>
          {projects.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">{t('no_assignee')}</option>
          {users.map((u) => <option key={u.email} value={u.email.toLowerCase()}>{u.name}</option>)}
        </select>
        <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        <button className="btn btn--primary" disabled={!title.trim()} onClick={onAdd}>{t('add')}</button>
      </div>

      {shown.length === 0 ? <div className="empty">{t('empty')}</div> : (
        <div className="task-list">
          {shown.map((x) => {
            const overdue = x.status === 'open' && x.due_date && x.due_date < today
            return (
              <div key={x.id} className={`task ${x.status === 'done' ? 'task--done' : ''} ${overdue ? 'task--overdue' : ''}`}>
                <input type="checkbox" className="task__check" checked={x.status === 'done'}
                  disabled={!canClose(x)} title={!canClose(x) ? t('pmo_only') : undefined}
                  onChange={() => toggle(x)} />
                {editId === x.id ? (
                  <div className="task__body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input className="input" style={{ flex: '2 1 180px' }} value={draft.title}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && saveEdit(x)} />
                    <select className="input" style={{ flex: '1 1 120px' }} value={draft.project_id}
                      onChange={(e) => setDraft((d) => ({ ...d, project_id: e.target.value }))}>
                      <option value="">{t('no_project')}</option>
                      {projects.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <select className="input" style={{ flex: '1 1 120px' }} value={draft.assignee_email}
                      onChange={(e) => setDraft((d) => ({ ...d, assignee_email: e.target.value }))}>
                      <option value="">{t('no_assignee')}</option>
                      {users.map((u) => <option key={u.email} value={u.email.toLowerCase()}>{u.name}</option>)}
                    </select>
                    <input className="input" type="date" style={{ flex: '0 1 150px' }} value={draft.due_date}
                      onChange={(e) => setDraft((d) => ({ ...d, due_date: e.target.value }))} />
                    <button className="btn btn--primary" disabled={!draft.title.trim()} onClick={() => saveEdit(x)}>✓</button>
                    <button className="btn btn--ghost" onClick={() => setEditId(null)}>✕</button>
                  </div>
                ) : (
                  <div className="task__body">
                    <b>{x.title}</b>
                    <small>
                      {x.project_id && (
                        x.source === 'traffic_light' && can('traffic_light')
                          ? <Link to={`/traffic/${x.project_id}`} className="tag tag--muted">{projectName(x.project_id)}</Link>
                          : <span className="tag tag--muted">{projectName(x.project_id)}</span>
                      )}
                      {x.source === 'traffic_light' && <span className="tag tag--amber">🚦 {axisLabel(lang, x.axis ?? 'gray')}</span>}
                      {x.assignee_email && <span className="tag tag--green">👤 {nameOf(x.assignee_email)}</span>}
                      {x.due_date && (
                        <span className={`tag ${overdue ? 'tag--clay' : 'tag--ink'}`}>
                          📅 {t('due')} {new Date(x.due_date).toLocaleDateString('he-IL')}{overdue ? ` · ${t('overdue')}` : ''}
                        </span>
                      )}
                    </small>
                  </div>
                )}
                {editId !== x.id && (isAdmin || x.created_by.toLowerCase() === me) && (
                  <>
                    <button className="btn btn--quiet" title={t('edit_task')} onClick={() => startEdit(x)}>✎</button>
                    <button className="btn btn--quiet" title={t('del')} onClick={() => deleteTask(x.id).then(reload)}>✕</button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
