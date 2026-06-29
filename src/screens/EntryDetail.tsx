import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Tag, WeatherChip, Avatar, stagger, riseIn } from '../components/ui'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { getEntry, fetchLists, sendEntry } from '../api'
import { buildReportHtml, buildReportText } from '../report'
import { useStore } from '../store'
import type { DistList, Entry, FieldDef } from '../data'

export default function EntryDetail() {
  const { id } = useParams()
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const { fieldDefs, projectName, userName } = useStore()
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined)
  const [sendOpen, setSendOpen] = useState(false)
  const [copyMsg, setCopyMsg] = useState('')

  useEffect(() => {
    let alive = true
    getEntry(id ?? '').then((e) => { if (alive) setEntry(e) }).catch(() => { if (alive) setEntry(null) })
    return () => { alive = false }
  }, [id])

  // Build the formatted report and put it on the clipboard so the user can paste it
  // into their own email (Outlook/Gmail) and send it to anyone. No email provider.
  const copyReport = async () => {
    if (!entry) return
    const allDefs = fieldDefs.filter((f) => f.active)
    const html = buildReportHtml({ projectName: projectName(entry.project_id), authorName: userName(entry.created_by), entry, defs: allDefs })
    const text = buildReportText({ projectName: projectName(entry.project_id), authorName: userName(entry.created_by), entry, defs: allDefs })
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) }),
      ])
      setCopyMsg(t('report_copied'))
    } catch {
      const w = window.open('', '_blank')
      if (w) { w.document.write(`<!doctype html><meta charset="utf-8"><body dir="rtl" style="font-family:Arial;padding:16px">${html}</body>`); w.document.close() }
      setCopyMsg(t('copy_failed'))
    }
  }

  if (entry === undefined) return <Loader full />
  if (!entry) return <div className="empty"><div className="big">404</div></div>
  const label = (f: FieldDef) => (lang === 'he' ? f.label_he : f.label_en)
  const defs = fieldDefs.filter((f) => f.active && f.type !== 'photo' && (entry.values[f.key] ?? '').trim())

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{entry.work_date} · {entry.values.weather}</div>
          <h1 className="page-title">{projectName(entry.project_id)}</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => nav('/new')}>{t('edit')}</Button>
          <Button variant="ghost" onClick={() => setSendOpen(true)}>✉ {t('send_email')}</Button>
          <Button variant="primary" onClick={copyReport}>📋 {t('copy_report')}</Button>
        </div>
      </div>

      <AnimatePresence>
        {copyMsg && (
          <motion.div className="tag tag--green" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ display: 'block', padding: '12px 16px', marginBottom: 18, fontSize: 14 }}>
            {copyMsg}
          </motion.div>
        )}
      </AnimatePresence>

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

      <AnimatePresence>
        {sendOpen && (
          <SendDialog
            entryId={entry.id}
            onClose={() => setSendOpen(false)}
            onSent={() => setEntry((e) => e ? { ...e, last_sent_at: new Date().toISOString() } : e)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function SendDialog({ entryId, onClose, onSent }: { entryId: string; onClose: () => void; onSent: () => void }) {
  const { t } = useI18n()
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [lists, setLists] = useState<DistList[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [individuals, setIndividuals] = useState('')

  useEffect(() => {
    fetchLists().then((l) => { setLists(l); setPicked(l[0] ? [l[0].id] : []) }).catch(() => setLists([]))
  }, [])

  const submit = async () => {
    const emails = individuals.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => s.includes('@'))
    if (!picked.length && !emails.length) { setErr(t('no_recipients')); return }
    setBusy(true); setErr('')
    try {
      await sendEntry(entryId, picked, emails)
      onSent(); setSent(true); setTimeout(onClose, 1200)
    } catch (e) {
      setErr(String((e as Error).message ?? e)); setBusy(false)
    }
  }

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
              {lists.length === 0 && <div className="row-item"><span className="count mono">{t('no_recipients')}</span></div>}
              {lists.map((l) => (
                <label key={l.id} className="row-item" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={picked.includes(l.id)}
                    onChange={(e) => setPicked((p) => e.target.checked ? [...p, l.id] : p.filter((x) => x !== l.id))} />
                  <div className="grow"><b>{l.name}</b></div>
                  <Tag tone="muted">{l.recipients.length} {t('send_to')}</Tag>
                </label>
              ))}
            </div>
            <label className="field">
              <span className="field__label">{t('individuals')}</span>
              <input className="input" placeholder="a@x.com, b@y.com" value={individuals} onChange={(e) => setIndividuals(e.target.value)} />
            </label>
            {err && <p className="alert" style={{ marginTop: 12 }}>⚠ {err}</p>}
            <div className="form-actions">
              <Button variant="ghost" onClick={onClose} disabled={busy}>{t('cancel')}</Button>
              <Button variant="primary" onClick={submit} disabled={busy}>{busy ? <><span className="spin" /> {t('sent')}</> : <>✉ {t('send_email')}</>}</Button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}
