import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Tag, Avatar, stagger, riseIn } from '../components/ui'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { addRecipient, createList, deleteList, fetchLists, removeRecipient } from '../api'
import type { DistList } from '../data'

export default function Lists() {
  const { t } = useI18n()
  const [lists, setLists] = useState<DistList[] | null>(null)
  const [name, setName] = useState('')

  const reload = () => fetchLists().then(setLists).catch(() => setLists([]))
  useEffect(() => { reload() }, [])

  const addList = async () => { if (!name.trim()) return; await createList(name.trim()); setName(''); reload() }
  const removeList = async (id: string) => { await deleteList(id); reload() }
  const addRec = async (listId: string, email: string) => { await addRecipient(listId, email); reload() }
  const removeRec = async (recId: string) => { await removeRecipient(recId); reload() }

  if (!lists) return <Loader full />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">Email</div>
          <h1 className="page-title">{t('nav_lists')}</h1>
        </div>
        <span className="count mono">{lists.length}</span>
      </div>

      <motion.div variants={stagger} initial="hidden" animate="show" style={{ display: 'grid', gap: 16 }}>
        <AnimatePresence>
          {lists.map((l) => (
            <motion.div key={l.id} className="panel" variants={riseIn} layout exit={{ opacity: 0, scale: 0.97 }} style={{ padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <span style={{ color: 'var(--green)', fontSize: 18 }}>✉</span>
                <h3 style={{ fontSize: 20 }}>{l.name}</h3>
                <Tag tone="muted">{l.recipients.length} {t('send_to')}</Tag>
                <Button variant="danger" style={{ marginInlineStart: 'auto' }} onClick={() => removeList(l.id)}>🗑 {t('delete_list')}</Button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {l.recipients.length === 0 && <span className="count mono">{t('no_recipients')}</span>}
                <AnimatePresence>
                  {l.recipients.map((r) => (
                    <motion.span key={r.id} className="recipient" layout
                      initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                      <Avatar name={r.email} size={20} />
                      {r.email}
                      <button className="recipient__x" title={t('remove')} onClick={() => removeRec(r.id)}>✕</button>
                    </motion.span>
                  ))}
                </AnimatePresence>
                <AddRecipient onAdd={(email) => addRec(l.id, email)} placeholder={t('add_recipient')} />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      <div className="add-row panel" style={{ marginTop: 16, borderRadius: 'var(--r-lg)' }}>
        <input className="input" placeholder={t('nav_lists')} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addList()} />
        <Button variant="primary" onClick={addList}>＋ {t('add')}</Button>
      </div>
    </div>
  )
}

function AddRecipient({ onAdd, placeholder }: { onAdd: (email: string) => void; placeholder: string }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const commit = () => { if (email.trim()) { onAdd(email.trim()); setEmail(''); setOpen(false) } }
  if (!open) return <button className="tag tag--green" onClick={() => setOpen(true)} style={{ cursor: 'pointer' }}>＋ {placeholder}</button>
  return (
    <input className="input" style={{ padding: '5px 10px', width: 200 }} autoFocus value={email} placeholder="email@…"
      onChange={(e) => setEmail(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setOpen(false) }} />
  )
}
