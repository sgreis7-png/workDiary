import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button, Tag, Avatar, stagger, riseIn } from '../components/ui'
import { useI18n } from '../i18n'

interface Rec { email: string }
interface List { id: string; name: string; recipients: Rec[] }

const SEED: List[] = [
  { id: 'l1', name: 'הנהלת אגרוטופ', recipients: [{ email: 'pavel@agrotop.co.il' }, { email: 'office@agrotop.co.il' }] },
  { id: 'l2', name: 'צוות אתר — כפר יובל', recipients: [{ email: 'alon@agrotop.co.il' }, { email: 'sapir@agrotop.co.il' }] },
  { id: 'l3', name: 'לקוח — דצמן', recipients: [{ email: 'projects@dazman.com' }] },
]

export default function Lists() {
  const { t } = useI18n()
  const [lists, setLists] = useState<List[]>(SEED)
  const [name, setName] = useState('')

  const addList = () => { if (!name.trim()) return; setLists((l) => [...l, { id: Math.random().toString(36).slice(2), name: name.trim(), recipients: [] }]); setName('') }

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
        {lists.map((l) => (
          <motion.div key={l.id} className="panel" variants={riseIn} style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span style={{ color: 'var(--green)', fontSize: 18 }}>✉</span>
              <h3 style={{ fontSize: 20 }}>{l.name}</h3>
              <Tag tone="muted">{l.recipients.length} {t('send_to')}</Tag>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {l.recipients.map((r, i) => (
                <span key={i} className="tag tag--ink" style={{ gap: 8 }}><Avatar name={r.email} size={20} />{r.email}</span>
              ))}
              <AddRecipient onAdd={(email) => setLists((ls) => ls.map((x) => x.id === l.id ? { ...x, recipients: [...x.recipients, { email }] } : x))} />
            </div>
          </motion.div>
        ))}
      </motion.div>

      <div className="add-row panel" style={{ marginTop: 16, borderRadius: 'var(--r-lg)' }}>
        <input className="input" placeholder={t('nav_lists')} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addList()} />
        <Button variant="primary" onClick={addList}>＋ {t('add')}</Button>
      </div>
    </div>
  )
}

function AddRecipient({ onAdd }: { onAdd: (email: string) => void }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  if (!open) return <button className="tag tag--green" onClick={() => setOpen(true)} style={{ cursor: 'pointer' }}>＋</button>
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <input className="input" style={{ padding: '4px 8px', width: 180 }} autoFocus value={email} placeholder="email@…"
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && email.trim()) { onAdd(email.trim()); setEmail(''); setOpen(false) } }} />
    </span>
  )
}
