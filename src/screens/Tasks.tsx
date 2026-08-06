import { useEffect, useMemo, useState } from 'react'
import { Loader } from '../components/Loader'
import { useAuth } from '../auth'
import { useStore } from '../store'
import { useI18n } from '../i18n'
import { fetchUsers } from '../api'
import { fetchTasks, createTask, updateTask, deleteTask, type WorkTask } from '../lib/tasks'
import { notifyUser } from '../defects/api'
import { sendPush } from '../lib/push'
import type { AppUser } from '../data'

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
  assigned_notif: { he: 'הוקצתה לך משימה', en: 'A task was assigned to you' },
  loading: { he: 'טוען משימות…', en: 'Loading tasks…' },
  mine_only: { he: 'רק שלי', en: 'Mine only' },
} as const

export default function Tasks() {
  const { user, isAdmin } = useAuth()
  const { lang } = useI18n()
  const t = (k: keyof typeof T) => T[k][lang]
  const { projects, projectName } = useStore()
  const [tasks, setTasks] = useState<WorkTask[] | null>(null)
  const [users, setUsers] = useState<AppUser[]>([])
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState('')
  const [assignee, setAssignee] = useState('')
  const [due, setDue] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [err, setErr] = useState('')

  const reload = () => fetchTasks().then(setTasks).catch((e) => setErr(String(e.message ?? e)))
  useEffect(() => {
    reload()
    fetchUsers().then((us) => setUsers(us.filter((u) => u.active && u.registered))).catch(() => setUsers([]))
  }, [])

  const me = user?.email?.toLowerCase()
  const shown = useMemo(() => {
    let list = tasks ?? []
    if (mineOnly) list = list.filter((x) => x.assignee_email?.toLowerCase() === me || x.created_by.toLowerCase() === me)
    return list
  }, [tasks, mineOnly, me])

  const nameOf = (email: string | null) =>
    email ? (users.find((u) => u.email.toLowerCase() === email.toLowerCase())?.name ?? email) : '—'

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
    const status = x.status === 'open' ? 'done' : 'open'
    await updateTask(x.id, { status, done_at: status === 'done' ? new Date().toISOString() : null })
    reload()
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
                <input type="checkbox" className="task__check" checked={x.status === 'done'} onChange={() => toggle(x)} />
                <div className="task__body">
                  <b>{x.title}</b>
                  <small>
                    {x.project_id && <span className="tag tag--muted">{projectName(x.project_id)}</span>}
                    {x.assignee_email && <span className="tag tag--green">👤 {nameOf(x.assignee_email)}</span>}
                    {x.due_date && (
                      <span className={`tag ${overdue ? 'tag--clay' : 'tag--ink'}`}>
                        📅 {t('due')} {new Date(x.due_date).toLocaleDateString('he-IL')}{overdue ? ` · ${t('overdue')}` : ''}
                      </span>
                    )}
                  </small>
                </div>
                {(isAdmin || x.created_by.toLowerCase() === me) && (
                  <button className="btn btn--quiet" title={t('del')} onClick={() => deleteTask(x.id).then(reload)}>✕</button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
