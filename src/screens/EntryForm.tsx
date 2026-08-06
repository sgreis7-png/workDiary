import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Field, stagger, riseIn } from '../components/ui'
import { Loader } from '../components/Loader'
import { MicButton } from '../components/MicButton'
import { useI18n } from '../i18n'
import { createEntry, getEntry, getEntryPhotos, lastEntryForProject, updateEntry } from '../api'
import { queueEntry } from '../lib/offline'
import { clearDraft, loadDraft, saveDraft } from '../lib/draft'
import { applyPrefill, fetchPrefill, savePrefill, fetchProjectLocation, saveProjectLocation } from '../lib/prefill'
import { getLocationName } from '../lib/geo'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { MALFUNCTION_DEPT_KEY, MALFUNCTION_TEXT_KEY, SAFETY_INCIDENT_KEY, SAFETY_TRAINING_KEY, deptIdOf, deptLabel } from '../data'
import type { FieldDef } from '../data'
import { COOPS_KEY, MISSING_KEY, defaultCoop, parseCoops, parseMissing } from '../lib/reportTables'
import type { CoopReport, MissingRow } from '../lib/reportTables'
import { CoopReports, MissingTable } from '../components/ReportTables'

// new photo (file) or an existing one (storage path)
interface Photo { url: string; file?: File; path?: string }

export default function EntryForm() {
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const { id } = useParams()           // present => edit mode
  const editing = Boolean(id)
  const { fieldDefs, projects } = useStore()
  const { user, isAdmin } = useAuth()
  const defs = fieldDefs.filter((f) => f.active).sort((a, b) => a.sort_order - b.sort_order)
  const [project, setProject] = useState('')
  const [values, setValues] = useState<Record<string, string>>(
    editing ? {} : {
      [MALFUNCTION_DEPT_KEY]: deptLabel('none', lang),
      // seed one coop with the standard task list so it is stored even if untouched
      [COOPS_KEY]: JSON.stringify([defaultCoop(lang)]),
    },
  )
  const [photos, setPhotos] = useState<Photo[]>([])
  const [removedPaths, setRemovedPaths] = useState<string[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const [loading, setLoading] = useState(editing)
  // Draft persistence: phones kill the page while the camera app is open, wiping
  // React state. The draft lives in IndexedDB until the entry is saved.
  const draftKey = id ?? 'new'
  const [restored, setRestored] = useState(false)
  // "שמור נתונים" — server-saved name/phone; on by default once the user saved once
  const [savePrefs, setSavePrefs] = useState(false)
  // safety incident: checkbox opens the description field; unchecking clears it
  const [incidentOpen, setIncidentOpen] = useState(false)

  // sync the checkbox with loaded/restored/copied values (edit mode, drafts)
  useEffect(() => {
    if ((values[SAFETY_INCIDENT_KEY] ?? '').trim()) setIncidentOpen(true)
  }, [values[SAFETY_INCIDENT_KEY]])

  // restore a pending draft (new entry); no draft → apply server prefill
  useEffect(() => {
    if (editing) return
    let alive = true
    ;(async () => {
      const d = await loadDraft('new')
      if (!alive) return
      if (d) {
        setProject(d.project_id)
        setValues((v) => ({ ...v, ...d.values }))
        setPhotos(d.files.map((f) => ({ file: f, url: URL.createObjectURL(f) })))
      } else if (user?.email) {
        const p = await fetchPrefill(user.email).catch(() => null)
        if (!alive) return
        if (p) { setValues((v) => applyPrefill(v, p)); setSavePrefs(true) }
      }
    })().catch(() => {}).finally(() => { if (alive) setRestored(true) })
    return () => { alive = false }
  }, [editing])

  // prefill the site location from MY saved location for the chosen project.
  // Tracks what was auto-filled so switching projects replaces a stale auto value
  // but never overwrites text the user typed themselves.
  const autoLocRef = useRef<string | null>(null)
  useEffect(() => {
    if (editing || !restored || !project || !user?.email) return
    let alive = true
    fetchProjectLocation(user.email, project).then((loc) => {
      if (!alive) return
      setValues((v) => {
        const cur = (v.site_location ?? '').trim()
        const untouched = !cur || cur === autoLocRef.current
        if (!untouched) return v
        autoLocRef.current = loc
        return { ...v, site_location: loc ?? '' }
      })
    }).catch(() => {})
    return () => { alive = false }
  }, [project, editing, restored, user?.email])

  // load the entry when editing (draft, if any, wins — it's newer user work)
  useEffect(() => {
    if (!id) return
    let alive = true
    ;(async () => {
      const e = await getEntry(id)
      if (!alive) return
      if (!e) { nav('/'); return }
      if (e.created_by !== user?.id && !isAdmin) { nav(`/entry/${id}`); return } // not owner/admin
      const d = await loadDraft(id).catch(() => null)
      if (!alive) return
      setProject(d?.project_id || e.project_id)
      setValues({ [MALFUNCTION_DEPT_KEY]: deptLabel('none', lang), ...e.values, ...d?.values })
      setRemovedPaths(d?.removed_paths ?? [])
      const ph = await getEntryPhotos(id)
      if (alive) {
        const kept = ph.filter((p) => !(d?.removed_paths ?? []).includes(p.path))
        setPhotos([
          ...kept.map((p) => ({ url: p.url, path: p.path })),
          ...(d?.files ?? []).map((f) => ({ file: f, url: URL.createObjectURL(f) })),
        ])
        setLoading(false); setRestored(true)
      }
    })().catch(() => { if (alive) { setSaveErr('load failed'); setLoading(false); setRestored(true) } })
    return () => { alive = false }
  }, [id, user, isAdmin, nav])

  // persist the draft on every change (debounced) once the initial restore is done
  useEffect(() => {
    if (!restored || busy) return
    const t = setTimeout(() => {
      void saveDraft(draftKey, {
        project_id: project,
        values,
        files: photos.filter((p) => p.file).map((p) => p.file!),
        removed_paths: removedPaths,
      }).catch(() => {})
    }, 400)
    return () => clearTimeout(t)
  }, [restored, busy, draftKey, project, values, photos, removedPaths])

  const label = (f: FieldDef) => (lang === 'he' ? f.label_he : f.label_en)
  const set = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }))

  // report tables live inside `values` as JSON strings (draft + save for free)
  const coops = parseCoops(values, lang)
  const missingRows = parseMissing(values[MISSING_KEY])
  const setCoops = (c: CoopReport[]) => set(COOPS_KEY, JSON.stringify(c))
  const setMissing = (rows: MissingRow[]) => set(MISSING_KEY, JSON.stringify(rows))

  const addPhotos = (files: FileList | null) => {
    const next = Array.from(files ?? []).map((f) => ({ file: f, url: URL.createObjectURL(f) }))
    setPhotos((p) => [...p, ...next])
  }
  const removePhoto = (i: number) => setPhotos((ps) => {
    const p = ps[i]
    if (p.file) URL.revokeObjectURL(p.url)
    if (p.path) setRemovedPaths((r) => [...r, p.path!])
    return ps.filter((_, k) => k !== i)
  })

  const save = async () => {
    const errs: string[] = []
    if (!project) errs.push('__project__')
    for (const f of defs) {
      if (!f.required) continue
      if (f.type === 'photo') { if (photos.length < 1) errs.push('__photos__'); continue }
      if (!(values[f.key] ?? '').trim()) errs.push(f.key)
    }
    // Malfunction description is required only when a real department is selected.
    if (deptIdOf(values[MALFUNCTION_DEPT_KEY]) !== 'none' && !(values[MALFUNCTION_TEXT_KEY] ?? '').trim()) {
      errs.push(MALFUNCTION_TEXT_KEY)
    }
    // Incident description is required once the incident checkbox is ticked.
    if (incidentOpen && !(values[SAFETY_INCIDENT_KEY] ?? '').trim()) {
      errs.push(SAFETY_INCIDENT_KEY)
    }
    setErrors(errs)
    if (errs.length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    setBusy(true); setSaveErr('')
    const newFiles = photos.filter((p) => p.file).map((p) => p.file!)
    const keepPrefs = () => {
      if (!editing && savePrefs && user?.email) {
        void savePrefill(user.email, values.manager_name ?? '', values.phone ?? '').catch(() => {})
        void saveProjectLocation(user.email, project, values.site_location ?? '').catch(() => {})
      }
    }
    try {
      if (editing && id) {
        await updateEntry(id, project, values, newFiles, removedPaths)
        await clearDraft(draftKey).catch(() => {})
        nav(`/entry/${id}`)
      } else if (!navigator.onLine) {
        // offline: queue locally, sync when back online
        await queueEntry({ project_id: project, values, files: newFiles })
        await clearDraft(draftKey).catch(() => {})
        keepPrefs()
        nav('/')
      } else {
        await createEntry(project, values, newFiles)
        await clearDraft(draftKey).catch(() => {})
        keepPrefs()
        nav('/')
      }
    } catch (e) {
      // network failure while creating → queue it instead of losing the work
      if (!editing && !navigator.onLine) {
        try {
          await queueEntry({ project_id: project, values, files: newFiles })
          await clearDraft(draftKey).catch(() => {})
          keepPrefs()
          nav('/'); return
        } catch { /* fall through */ }
      }
      setSaveErr(String((e as Error).message ?? e))
      setBusy(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  // copy values from the project's most recent entry (recurring sites)
  const [copyBusy, setCopyBusy] = useState(false)
  const copyLast = async () => {
    if (!project) { setErrors(['__project__']); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    setCopyBusy(true)
    try {
      const e = await lastEntryForProject(project)
      if (e) { const v = { ...e.values }; delete v.work_date; setValues(v) }
    } finally { setCopyBusy(false) }
  }
  // autofill location from GPS
  const [locBusy, setLocBusy] = useState(false)
  const fillLocation = async (key: string) => {
    setLocBusy(true)
    try { const r = await getLocationName(); if (r) set(key, r.name) }
    catch { /* permission denied / unavailable */ }
    finally { setLocBusy(false) }
  }
  const appendText = (key: string, txt: string) => set(key, (values[key] ? values[key] + ' ' : '') + txt)

  if (loading) return <Loader full />

  const textDefs = defs.filter((f) => f.type !== 'photo')

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">Agrotop · {projects.find((p) => p.id === project)?.name ?? '—'}</div>
          <h1 className="page-title">{editing ? t('edit_entry') : t('new_entry')}</h1>
        </div>
      </div>

      <AnimatePresence>
        {errors.length > 0 && (
          <motion.div className="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            ⚠ {t('missing')}
          </motion.div>
        )}
        {saveErr && (
          <motion.div className="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            ⚠ {saveErr}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div className="form" variants={stagger} initial="hidden" animate="show">
        <motion.div variants={riseIn} className="form__section">{t('project')}</motion.div>
        <motion.div variants={riseIn} style={{ marginBottom: 26 }}>
          <Field label={t('project')} hint={<span className="req">{t('required_field')}</span>}>
            <select className="input" value={project} onChange={(e) => setProject(e.target.value)} style={errors.includes('__project__') ? { borderColor: 'var(--clay)' } : undefined}>
              <option value="">— {t('choose')} —</option>
              {[...projects].sort((a, b) => Number(b.active) - Number(a.active))
                .map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? '' : ` (${t('inactive')})`}</option>)}
            </select>
          </Field>
          {projects.length === 0 && (
            <Button variant="ghost" onClick={() => nav('/projects')} style={{ marginTop: 10 }}>＋ {t('add_project')}</Button>
          )}
          {!editing && (
            <Button variant="ghost" onClick={copyLast} disabled={copyBusy || !project} style={{ marginTop: 10 }}>
              {copyBusy ? <><span className="spin" /> {t('copy_last')}</> : <>⧉ {t('copy_last')}</>}
            </Button>
          )}
        </motion.div>

        <motion.div variants={riseIn} className="form__section">{t('nav_log')}</motion.div>
        <motion.div variants={riseIn} className="form-grid">
          {textDefs.map((f) => {
            const invalid = errors.includes(f.key)
            const common = { className: 'input', value: values[f.key] ?? '', style: invalid ? { borderColor: 'var(--clay)' } : undefined }
            const wrap = f.type === 'long_text' ? 'span-2' : ''
            // malfunction description becomes required once a real department (≠ none) is chosen
            const condReq = f.key === MALFUNCTION_TEXT_KEY && deptIdOf(values[MALFUNCTION_DEPT_KEY]) !== 'none'
            return (
              <div key={f.id} className={wrap}>
                <Field label={label(f)} hint={(f.required || condReq) ? <span className="req">{t('required_field')}</span> : t('optional')}>
                  {f.type === 'long_text' ? (
                    <div className="input-affix">
                      <textarea {...common} onChange={(e) => set(f.key, e.target.value)} />
                      <MicButton onText={(txt) => appendText(f.key, txt)} />
                    </div>
                  ) : f.type === 'select' ? (
                    <select {...common} onChange={(e) => set(f.key, e.target.value)}>
                      <option value="">—</option>
                      {f.options.map((o, i) => <option key={i} value={lang === 'he' ? o.he : o.en}>{lang === 'he' ? o.he : o.en}</option>)}
                    </select>
                  ) : f.key === 'site_location' ? (
                    <div className="input-affix">
                      <input {...common} type="text" onChange={(e) => set(f.key, e.target.value)} />
                      <MicButton onText={(txt) => appendText(f.key, txt)} />
                      <button type="button" className="mic" title={t('use_gps')} onClick={() => fillLocation(f.key)} disabled={locBusy}>
                        {locBusy ? <span className="spin" /> : '📍'}
                      </button>
                    </div>
                  ) : f.type === 'date' || f.type === 'number' ? (
                    <input {...common} type={f.type === 'date' ? 'date' : 'number'}
                      onChange={(e) => set(f.key, e.target.value)} />
                  ) : (
                    // כל שדה טקסט חופשי (כולל טלפון, שם מנהל, קבלן, ציוד) — עם הקלדה קולית
                    <div className="input-affix">
                      <input {...common} type={f.type === 'phone' ? 'tel' : 'text'}
                        onChange={(e) => set(f.key, e.target.value)} />
                      <MicButton onText={(txt) => appendText(f.key, txt)} />
                    </div>
                  )}
                </Field>
              </div>
            )
          })}
        </motion.div>

        <motion.div variants={riseIn} className="form__section" style={{ marginTop: 30 }}>{t('safety_section')}</motion.div>
        <motion.div variants={riseIn} className="form-grid">
          <div>
            <Field label={t('safety_training_q')} hint={t('optional')}>
              <select className="input" value={values[SAFETY_TRAINING_KEY] ?? ''} onChange={(e) => set(SAFETY_TRAINING_KEY, e.target.value)}>
                <option value="">—</option>
                <option value={lang === 'he' ? 'כן' : 'Yes'}>{lang === 'he' ? 'כן' : 'Yes'}</option>
                <option value={lang === 'he' ? 'לא' : 'No'}>{lang === 'he' ? 'לא' : 'No'}</option>
              </select>
            </Field>
          </div>
          <div className="span-2">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginBottom: incidentOpen ? 10 : 0 }}>
              <input
                type="checkbox" checked={incidentOpen}
                onChange={(e) => { setIncidentOpen(e.target.checked); if (!e.target.checked) set(SAFETY_INCIDENT_KEY, '') }}
              />
              {t('safety_incident_q')}
            </label>
            <AnimatePresence>
              {incidentOpen && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <Field label={t('safety_incident_detail')} hint={<span className="req">{t('required_field')}</span>}>
                    <div className="input-affix">
                      <textarea
                        className="input" rows={3} value={values[SAFETY_INCIDENT_KEY] ?? ''}
                        style={errors.includes(SAFETY_INCIDENT_KEY) ? { borderColor: 'var(--clay)' } : undefined}
                        onChange={(e) => set(SAFETY_INCIDENT_KEY, e.target.value)}
                      />
                      <MicButton onText={(txt) => appendText(SAFETY_INCIDENT_KEY, txt)} />
                    </div>
                  </Field>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <motion.div variants={riseIn} className="form__section" style={{ marginTop: 30 }}>{t('progress_report')}</motion.div>
        <motion.div variants={riseIn}>
          <CoopReports coops={coops} onChange={setCoops} />
        </motion.div>

        <motion.div variants={riseIn} className="form__section" style={{ marginTop: 30 }}>{t('missing_material')}</motion.div>
        <motion.div variants={riseIn}>
          <MissingTable rows={missingRows} onChange={setMissing} />
        </motion.div>

        <motion.div variants={riseIn} className="form__section" style={{ marginTop: 30 }}>
          {lang === 'he' ? 'תמונות מהשטח' : 'Site photos'}
          <span style={{ color: errors.includes('__photos__') ? 'var(--clay)' : 'var(--ink-faint)', fontSize: 10 }}>
            {photos.length} · {t('at_least_one')}
          </span>
        </motion.div>
        <motion.div variants={riseIn} className="photo-grid">
          <AnimatePresence>
            {photos.map((p, i) => (
              <motion.div key={i} className="photo-thumb" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} layout>
                <img src={p.url} alt="" />
                <button onClick={() => removePhoto(i)}>✕</button>
              </motion.div>
            ))}
          </AnimatePresence>
          <label className="photo-drop">
            <span className="plus">📷</span>
            <small>{t('take_photo')}</small>
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addPhotos(e.target.files); e.currentTarget.value = '' }} />
          </label>
          <label className="photo-drop">
            <span className="plus">＋</span>
            <small>{t('add_photo')}</small>
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.currentTarget.value = '' }} />
          </label>
        </motion.div>

        {!editing && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={savePrefs} onChange={(e) => setSavePrefs(e.target.checked)} />
            {t('save_my_details')}
          </label>
        )}
        <div className="form-actions">
          <Button variant="ghost" onClick={() => nav('/')}>{t('cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={busy}>{busy ? <><span className="spin" />{t('saving')}</> : t('save')}</Button>
        </div>
      </motion.div>
    </div>
  )
}
