import { useEffect, useState } from 'react'
import { Button, Field } from '../components/ui'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { useAuth } from '../auth'
import { parseRecipients } from '../lib/outlookSend'
import { fetchLists, createList, updateList, deleteList, type DistList } from '../lib/distLists'

/** רשימות תפוצה — personal mailing lists; admins can also share lists with everyone. */
export default function DistLists() {
  const { t } = useI18n()
  const { isAdmin } = useAuth()
  const [lists, setLists] = useState<DistList[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // editor state — id '' means "new list"
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [emails, setEmails] = useState('')
  const [shared, setShared] = useState(false)

  const reload = () => fetchLists().then(setLists).catch((e) => setErr(String((e as Error).message ?? e)))
  useEffect(() => { void reload() }, [])

  const openNew = () => { setEditId(''); setName(''); setEmails(''); setShared(false) }
  const openEdit = (l: DistList) => { setEditId(l.id); setName(l.name); setEmails(l.emails.join(', ')); setShared(l.shared) }

  const save = async () => {
    const parsed = parseRecipients(emails)
    if (!name.trim() || !parsed.length) { setErr(t('list_need_name_emails')); return }
    setBusy(true); setErr('')
    try {
      if (editId) await updateList(editId, name.trim(), parsed, shared)
      else await createList(name.trim(), parsed, shared)
      setEditId(null)
      await reload()
    } catch (e) { setErr(String((e as Error).message ?? e)) }
    finally { setBusy(false) }
  }

  const remove = async (l: DistList) => {
    if (!window.confirm(t('list_delete_confirm'))) return
    setErr('')
    try { await deleteList(l.id); await reload() }
    catch (e) { setErr(String((e as Error).message ?? e)) }
  }

  if (!lists) return <Loader full />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">Agrotop</div>
          <h1 className="page-title">{t('nav_lists')}</h1>
        </div>
        <Button variant="primary" onClick={openNew}>✛ {t('list_add')}</Button>
      </div>

      {err && <div className="alert">{err}</div>}

      {editId !== null && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <Field label={t('list_name')}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div style={{ marginTop: 10 }}>
            <Field label={t('send_to')}>
              <textarea className="input" rows={3} dir="ltr" placeholder="name@agrotop.co.il, name2@..." value={emails} onChange={(e) => setEmails(e.target.value)} />
            </Field>
          </div>
          {isAdmin && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
              {t('list_shared')}
            </label>
          )}
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setEditId(null)} disabled={busy}>{t('cancel')}</Button>
            <Button variant="primary" onClick={save} disabled={busy}>{busy ? <span className="spin" /> : t('save')}</Button>
          </div>
        </div>
      )}

      {lists.length === 0 && editId === null && (
        <div className="empty">{t('lists_empty')}</div>
      )}

      {lists.map((l) => (
        <div key={l.id} className="panel" style={{ marginBottom: 12, display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center' }}>
              {l.name}
              {l.shared && <span className="tag tag--green">{t('list_shared_tag')}</span>}
            </div>
            <div style={{ color: 'var(--ink-3)', fontSize: 13.5, marginTop: 4, direction: 'ltr', textAlign: 'end' }}>
              {l.emails.join(', ')}
            </div>
          </div>
          {(l.mine || isAdmin) && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" onClick={() => openEdit(l)}>✎ {t('edit')}</Button>
              <Button variant="danger" onClick={() => remove(l)}>🗑</Button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
