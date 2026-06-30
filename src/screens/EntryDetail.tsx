import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Tag, WeatherChip, Avatar, stagger, riseIn } from '../components/ui'
import { Loader } from '../components/Loader'
import { Lightbox } from '../components/Lightbox'
import { useI18n } from '../i18n'
import { getEntry, deleteEntry } from '../api'
import { useStore } from '../store'
import { useAuth } from '../auth'
import type { Entry, FieldDef } from '../data'

export default function EntryDetail() {
  const { id } = useParams()
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const { fieldDefs, projectName, userName } = useStore()
  const { user, isAdmin } = useAuth()
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined)
  const [lightbox, setLightbox] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    getEntry(id ?? '').then((e) => { if (alive) setEntry(e) }).catch(() => { if (alive) setEntry(null) })
    return () => { alive = false }
  }, [id])

  const removeEntry = async () => {
    if (!entry) return
    if (!window.confirm(`${t('confirm_delete_entry')}\n\n${projectName(entry.project_id)} · ${entry.work_date}`)) return
    try { await deleteEntry(entry.id); nav('/') }
    catch (e) { window.alert('⚠ ' + String((e as Error).message ?? e)) }
  }

  if (entry === undefined) return <Loader full />
  if (!entry) return <div className="empty"><div className="big">404</div></div>
  const label = (f: FieldDef) => (lang === 'he' ? f.label_he : f.label_en)
  const defs = fieldDefs.filter((f) => f.active && f.type !== 'photo' && (entry.values[f.key] ?? '').trim())
  const canManage = entry.created_by === user?.id || isAdmin

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{entry.work_date} · {entry.values.weather}</div>
          <h1 className="page-title">{projectName(entry.project_id)}</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {canManage && <Button variant="ghost" onClick={() => nav(`/edit/${entry.id}`)}>✎ {t('edit')}</Button>}
          {canManage && <Button variant="danger" onClick={removeEntry}>🗑 {t('delete_entry')}</Button>}
          <Button variant="primary" onClick={() => nav(`/report/${entry.id}`)}>📄 {t('open_report')}</Button>
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
              {entry.photos.map((p, i) => <img key={i} src={p} alt="" style={{ cursor: 'zoom-in' }} onClick={() => setLightbox(i)} />)}
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

      <AnimatePresence>
        {lightbox !== null && (
          <Lightbox photos={entry.photos} index={lightbox} onClose={() => setLightbox(null)} onIndex={setLightbox} />
        )}
      </AnimatePresence>
    </div>
  )
}
