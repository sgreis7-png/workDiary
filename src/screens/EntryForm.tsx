import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Field, stagger, riseIn } from '../components/ui'
import { Loader } from '../components/Loader'
import { MicButton } from '../components/MicButton'
import { useI18n } from '../i18n'
import { createEntry, getEntry, getEntryPhotos, lastEntryForProject, updateEntry } from '../api'
import { queueEntry } from '../lib/offline'
import { clearDraft, loadDraft, saveDraft } from '../lib/draft'
import { getLocationName } from '../lib/geo'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { MALFUNCTION_DEPT_KEY, MALFUNCTION_TEXT_KEY, deptIdOf, deptLabel } from '../data'
import type { FieldDef } from '../data'
import { HOUSE_PCT_KEY, MISSING_KEY, PROGRESS_KEY, defaultProgressRows, parseMissing, parseProgress } from '../lib/reportTables'
import type { MissingRow, ProgressRow } from '../lib/reportTables'
import { MissingTable, PctSlider, ProgressTable } from '../components/ReportTables'

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
      // seed the standard task list so it is stored even if untouched
      [PROGRESS_KEY]: JSON.stringify(defaultProgressRows(lang)),
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

  // restore a pending draft (new entry)
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
      }
    })().catch(() => {}).finally(() => { if (alive) setRestored(true) })
    return () => { alive = false }
  }, [editing])

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
  const progressRows = parseProgress(values[PROGRESS_KEY], lang)
  const missingRows = parseMissing(values[MISSING_KEY])
  const setProgress = (rows: ProgressRow[]) => set(PROGRESS_KEY, JSON.stringify(rows))
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
    setErrors(errs)
    if (errs.length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    setBusy(true); setSaveErr('')
    const newFiles = photos.filter((p) => p.file).map((p) => p.file!)
    try {
      if (editing && id) {
        await updateEntry(id, project, values, newFiles, removedPaths)
        await clearDraft(draftKey).catch(() => {})
        nav(`/entry/${id}`)
      } else if (!navigator.onLine) {
        // offline: queue locally, sync when back online
        await queueEntry({ project_id: project, values, files: newFiles })
        await clearDraft(draftKey).catch(() => {})
        nav('/')
      } else {
        await createEntry(project, values, newFiles)
        await clearDraft(draftKey).catch(() => {})
        nav('/')
      }
    } catch (e) {
      // network failure while creating → queue it instead of losing the work
      if (!editing && !navigator.onLine) {
        try {
          await queueEntry({ project_id: project, values, files: newFiles })
          await clearDraft(draftKey).catch(() => {})
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
                      <button type="button" className="mic" title={t('use_gps')} onClick={() => fillLocation(f.key)} disabled={locBusy}>
                        {locBusy ? <span className="spin" /> : '📍'}
                      </button>
                    </div>
                  ) : (
                    <input {...common} type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : f.type === 'phone' ? 'tel' : 'text'}
                      onChange={(e) => set(f.key, e.target.value)} />
                  )}
                </Field>
              </div>
            )
          })}
        </motion.div>

        <motion.div variants={riseIn} className="form__section" style={{ marginTop: 30 }}>{t('progress_report')}</motion.div>
        <motion.div variants={riseIn}>
          <div className="house-pct">
            <span className="house-pct__label">{t('house_pct')}</span>
            <PctSlider value={Number(values[HOUSE_PCT_KEY]) || 0} onChange={(v) => set(HOUSE_PCT_KEY, String(v))} />
          </div>
          <ProgressTable rows={progressRows} onChange={setProgress} />
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

        <div className="form-actions">
          <Button variant="ghost" onClick={() => nav('/')}>{t('cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={busy}>{busy ? <><span className="spin" />{t('saving')}</> : t('save')}</Button>
        </div>
      </motion.div>
    </div>
  )
}
