import { useEffect, useRef, useState } from 'react'
import { Button, Field } from '../../components/ui'
import { useAuth } from '../../auth'
import { useI18n } from '../../i18n'
import { fetchMemberDirectory, type DirectoryMember } from '../../api'
import { notifyUser } from '../../defects/api'
import { sendPush } from '../../lib/push'
import { useDialog } from '../../lib/useDialog'
import { createTrafficTask } from '../../traffic/api'
import type { AxisKey } from '../../traffic/model'
import { axisLabel, tl } from '../../traffic/i18n'

/**
 * Turns one axis's reason into an assignable task. Opened from a `TrafficProject` block with
 * the axis's `reason` text prefilled — the exec doesn't retype "why", only "who" and "by when".
 */
export function TaskDialog({ projectId, axis, defaultTitle, onClose, onCreated }: {
  projectId: string; axis: AxisKey | 'gray'; defaultTitle: string; onClose: () => void; onCreated: () => void
}) {
  const { lang } = useI18n()
  const { user } = useAuth()
  const [title, setTitle] = useState(defaultTitle)
  const [assignee, setAssignee] = useState('')
  const [due, setDue] = useState('')
  const [users, setUsers] = useState<DirectoryMember[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const panel = useRef<HTMLDivElement>(null)
  useDialog(panel, onClose, true)
  useEffect(() => { fetchMemberDirectory().then(setUsers).catch(() => setUsers([])) }, [])

  const save = async () => {
    if (!user || !title.trim() || busy) return
    setBusy(true); setErr('')
    try {
      await createTrafficTask(projectId, axis, title.trim(), user.email, assignee || null, due || null)
      if (assignee) {
        notifyUser(assignee, tl(lang, 'proj_task_title'), title.trim(), '/tasks')
        sendPush([assignee], tl(lang, 'proj_task_title'), title.trim(), '/tasks')
      }
      onCreated(); onClose()
    } catch (e) {
      setErr(String((e as Error).message ?? e))
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal" ref={panel} role="dialog" aria-modal="true"
        aria-label={`${tl(lang, 'proj_task_title')} · ${axisLabel(lang, axis)}`}
        tabIndex={-1} onClick={(e) => e.stopPropagation()} dir={lang === 'he' ? 'rtl' : 'ltr'}
      >
        <h3>{tl(lang, 'proj_task_title')} · {axisLabel(lang, axis)}</h3>
        {err && <div className="alert">⚠ {err}</div>}
        <Field label={tl(lang, 'proj_task_what')}>
          <textarea className="input" rows={3} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label={tl(lang, 'proj_task_who')}>
          <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">—</option>
            {users.map((u) => <option key={u.email} value={u.email.toLowerCase()}>{u.name}</option>)}
          </select>
        </Field>
        <Field label={tl(lang, 'proj_task_when')}>
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <div className="form-actions">
          <Button variant="ghost" type="button" onClick={onClose}>{tl(lang, 'cancel')}</Button>
          <Button variant="primary" type="button" disabled={busy || !title.trim()} onClick={save}>
            {busy ? <span className="spin" /> : tl(lang, 'proj_task_save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
