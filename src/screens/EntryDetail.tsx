import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Tag, WeatherChip, Avatar, stagger, riseIn } from '../components/ui'
import { useI18n } from '../i18n'
import { FIELD_DEFS, FieldDef, getEntry, projectName, userName } from '../data'

export default function EntryDetail() {
  const { id } = useParams()
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const entry = getEntry(id ?? '')
  const [sendOpen, setSendOpen] = useState(false)

  if (!entry) return <div className="empty"><div className="big">404</div></div>
  const label = (f: FieldDef) => (lang === 'he' ? f.label_he : f.label_en)
  const defs = FIELD_DEFS.filter((f) => f.active && f.type !== 'photo' && (entry.values[f.key] ?? '').trim())

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{entry.work_date} · {entry.values.weather}</div>
          <h1 className="page-title">{projectName(entry.project_id)}</h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="ghost" onClick={() => nav('/new')}>{t('edit')}</Button>
          <Button variant="primary" onClick={() => setSendOpen(true)}>✉ {t('send_email')}</Button>
        </div>
      </div>

      <div className="detail">
        <motion.div className="detail__main" variants={stagger} initial="hidden" animate="show">
          <dl className="dl">
            {defs.map((f) => (
              <motion.div key={f.id} className="dl__row" variants={riseIn}>
                <dt>{label(f)}</dt>
                <dd>{f.key === 'weather' ? <WeatherChip value={entry.values[f.key]} /> : entry.values[f.key]}</dd>
              </motion.div>
            ))}
          </dl>
        </motion.div>

        <div className="detail__aside">
          <motion.div className="aside-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <div className="kicker" style={{ marginBottom: 14 }}>{t('photos_n')}</div>
            <div className="photo-strip">
              {entry.photos.map((p, i) => <img key={i} src={p} alt="" />)}
            </div>
          </motion.div>

          <motion.div className="aside-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <Avatar name={userName(entry.created_by)} />
              <div>
                <div style={{ fontWeight: 700 }}>{userName(entry.created_by)}</div>
                <div className="count mono">{t('created_by')}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {entry.last_sent_at
                ? <Tag tone="green">✓ {t('last_sent')} {entry.last_sent_at.slice(0, 10)}</Tag>
                : <Tag tone="clay">לא נשלח</Tag>}
            </div>
          </motion.div>
        </div>
      </div>

      <AnimatePresence>{sendOpen && <SendDialog onClose={() => setSendOpen(false)} />}</AnimatePresence>
    </div>
  )
}

function SendDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const [sent, setSent] = useState(false)
  const lists = [
    { id: 'l1', name: 'הנהלת אגרוטופ', n: 4 },
    { id: 'l2', name: 'צוות אתר — כפר יובל', n: 6 },
    { id: 'l3', name: 'לקוח — דצמן', n: 2 },
  ]
  const [picked, setPicked] = useState<string[]>(['l1'])
  const [individuals, setIndividuals] = useState('')

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(20,24,27,.42)', display: 'grid', placeItems: 'center', zIndex: 60, padding: 20, backdropFilter: 'blur(3px)' }}>
      <motion.div onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 18 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="form" style={{ width: 'min(520px, 100%)', boxShadow: 'var(--shadow-2)' }}>
        <div className="form__section">{t('send_email')}</div>
        {sent ? (
          <div className="empty"><div className="big" style={{ color: 'var(--green-deep)' }}>{t('sent')}</div></div>
        ) : (
          <>
            <div className="row-list" style={{ border: '1px solid var(--line)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 18 }}>
              {lists.map((l) => (
                <label key={l.id} className="row-item" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={picked.includes(l.id)}
                    onChange={(e) => setPicked((p) => e.target.checked ? [...p, l.id] : p.filter((x) => x !== l.id))} />
                  <div className="grow"><b>{l.name}</b></div>
                  <Tag tone="muted">{l.n} {t('send_to')}</Tag>
                </label>
              ))}
            </div>
            <label className="field">
              <span className="field__label">{t('individuals')}</span>
              <input className="input" placeholder="a@x.com, b@y.com" value={individuals} onChange={(e) => setIndividuals(e.target.value)} />
            </label>
            <div className="form-actions">
              <Button variant="ghost" onClick={onClose}>{t('cancel')}</Button>
              <Button variant="primary" onClick={() => { setSent(true); setTimeout(onClose, 1100) }}>✉ {t('send_email')}</Button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}
