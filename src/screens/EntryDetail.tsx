import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Tag, WeatherChip, Avatar, stagger, riseIn } from '../components/ui'
import { Loader } from '../components/Loader'
import { Lightbox } from '../components/Lightbox'
import { useI18n } from '../i18n'
import { getEntry, deleteEntry, updateEntry } from '../api'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { SAFETY_INCIDENT_KEY, SAFETY_TRAINING_KEY } from '../data'
import type { Entry, FieldDef } from '../data'
import { COOPS_KEY, MISSING_KEY, bdActive, coopLabel, defaultCoop, filledMissing, parseCoops, parseMissing, reasonLabel, taskLabel } from '../lib/reportTables'
import type { CoopReport } from '../lib/reportTables'
import { CoopReports } from '../components/ReportTables'
import { Section } from '../components/Section'
import { CREW_KEY, filledCrew, parseCrew } from '../lib/crewRows'
import { tl } from '../traffic/i18n'

export default function EntryDetail() {
  const { id } = useParams()
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const { fieldDefs, projectName, userName } = useStore()
  const { user, isAdmin } = useAuth()
  const [entry, setEntry] = useState<Entry | null | undefined>(undefined)
  const [lightbox, setLightbox] = useState<number | null>(null)
  // Inline progress-report editing straight from the diary (no full edit form)
  const [progEdit, setProgEdit] = useState(false)
  const [progDraft, setProgDraft] = useState<CoopReport[]>([])
  const [progBusy, setProgBusy] = useState(false)

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
  // An inactive definition (e.g. the retired free-text contractor field) still shows
  // here if this entry actually carries a value for it — history must stay readable.
  const defs = fieldDefs.filter((f) => f.type !== 'photo' && (entry.values[f.key] ?? '').trim())
  const canManage = entry.created_by === user?.id || isAdmin
  const startProgEdit = () => {
    const cur = parseCoops(entry.values, lang)
    setProgDraft(cur.length ? cur : [defaultCoop(lang)])
    setProgEdit(true)
  }
  const saveProg = async () => {
    setProgBusy(true)
    try {
      const values = { ...entry.values, [COOPS_KEY]: JSON.stringify(progDraft) }
      await updateEntry(entry.id, entry.project_id, values, [], [])
      setEntry({ ...entry, values })
      setProgEdit(false)
    } catch (e) { window.alert('⚠ ' + String((e as Error).message ?? e)) }
    finally { setProgBusy(false) }
  }

  const coops = parseCoops(entry.values, lang)
    .map((c) => ({
      ...c,
      rows: c.rows.filter((r) => r.task.trim()),
      bd: bdActive(c.bd) ? c.bd.filter((r) => r.task.trim()) : [],
    }))
    .filter((c) => c.rows.length > 0 || c.pct > 0 || c.bd.length > 0)
  const missing = filledMissing(parseMissing(entry.values[MISSING_KEY]))
  const crew = filledCrew(parseCrew(entry.values[CREW_KEY]))

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
            {(entry.values[SAFETY_TRAINING_KEY] ?? '').trim() && (
              <motion.div className="dl__row" variants={riseIn}>
                <dt>{t('safety_training_q')}</dt>
                <dd>{entry.values[SAFETY_TRAINING_KEY]}</dd>
              </motion.div>
            )}
            {(entry.values[SAFETY_INCIDENT_KEY] ?? '').trim() && (
              <motion.div className="dl__row" variants={riseIn}>
                <dt style={{ color: 'var(--clay)' }}>⚠ {t('safety_incident_q')}</dt>
                <dd>{entry.values[SAFETY_INCIDENT_KEY]}</dd>
              </motion.div>
            )}
          </dl>

          {canManage && (
            <motion.div variants={riseIn} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
              {progEdit ? (
                <>
                  <Button variant="primary" onClick={saveProg} disabled={progBusy}>{progBusy ? t('saving') : t('save')}</Button>
                  <Button variant="ghost" onClick={() => setProgEdit(false)} disabled={progBusy}>{t('cancel')}</Button>
                </>
              ) : (
                <Button variant="ghost" onClick={startProgEdit}>
                  {coops.length ? <>✎ {t('edit_progress')}</> : <>＋ {t('add_coop')}</>}
                </Button>
              )}
            </motion.div>
          )}

          {progEdit && (
            <motion.div variants={riseIn}>
              <CoopReports coops={progDraft} onChange={setProgDraft} />
            </motion.div>
          )}

          {!progEdit && coops.map((c, ci) => (
            <motion.div variants={riseIn} key={ci}>
              <div className="detail__subhead">
                {t('progress_report')} — {coopLabel(c.name, lang)}
                <span className="detail__subhead-val">{t('house_pct')}: {c.pct}%</span>
              </div>
              <div className="vtable">
                <div className="vtable__row vtable__row--head vtable__row--progress">
                  <span>{t('col_task')}</span><span>{t('col_pct')}</span><span>{t('col_remarks')}</span>
                </div>
                {c.rows.map((r, i) => (
                  <div key={i} className="vtable__row vtable__row--progress">
                    <span>{taskLabel(r.task, lang)}</span>
                    <span className="vbar"><span className="vbar__track"><span className="vbar__fill" style={{ width: `${r.pct}%` }} /></span><b>{r.pct}%</b></span>
                    <span>{r.remarks}</span>
                  </div>
                ))}
              </div>
              {c.bd.length > 0 && (
                <>
                  <div className="detail__subhead" style={{ marginTop: 14 }}>{t('bd_field')} — {coopLabel(c.name, lang)}</div>
                  <div className="vtable">
                    <div className="vtable__row vtable__row--head vtable__row--progress">
                      <span>{t('col_task')}</span><span>{t('col_pct')}</span><span>{t('col_remarks')}</span>
                    </div>
                    {c.bd.map((r, i) => (
                      <div key={i} className="vtable__row vtable__row--progress">
                        <span>{taskLabel(r.task, lang)}</span>
                        <span className="vbar"><span className="vbar__track"><span className="vbar__fill" style={{ width: `${r.pct}%` }} /></span><b>{r.pct}%</b></span>
                        <span>{r.remarks}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          ))}

          {crew.length > 0 && (
            <Section id="crew" icon="👷" title={tl(lang, 'form_crew_section')}>
              <table className="table m-cards"><thead><tr><th>{tl(lang, 'form_crew_contractor')}</th><th>{tl(lang, 'form_crew_workers')}</th><th>{tl(lang, 'form_crew_hours')}</th></tr></thead>
                <tbody>{crew.map((r, i) => (
                  <tr key={i}>
                    <td data-label={tl(lang, 'form_crew_contractor')}>{r.contractor}</td>
                    <td data-label={tl(lang, 'form_crew_workers')}>{r.workers}</td>
                    <td data-label={tl(lang, 'form_crew_hours')}>{r.hours}</td>
                  </tr>
                ))}</tbody></table>
            </Section>
          )}

          {missing.length > 0 && (
            <motion.div variants={riseIn}>
              <div className="detail__subhead">{t('missing_material')}</div>
              <div className="vtable">
                <div className="vtable__row vtable__row--head vtable__row--missing">
                  <span>{t('col_code')}</span><span>{t('col_desc')}</span><span>{t('col_amount')}</span><span>{t('col_reason')}</span>
                </div>
                {missing.map((r, i) => (
                  <div key={i} className="vtable__row vtable__row--missing">
                    <span>{r.code}</span><span>{r.desc}</span><span>{r.amount}</span><span>{reasonLabel(r.reason, lang)}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
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
                : <Tag tone="clay">{t('not_sent')}</Tag>}
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
