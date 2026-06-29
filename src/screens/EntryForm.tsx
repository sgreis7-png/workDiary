import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Field, stagger, riseIn } from '../components/ui'
import { useI18n } from '../i18n'
import { createEntry } from '../api'
import { useStore } from '../store'
import type { FieldDef } from '../data'

interface Photo { file: File; url: string }

export default function EntryForm() {
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const { fieldDefs, projects } = useStore()
  const defs = fieldDefs.filter((f) => f.active).sort((a, b) => a.sort_order - b.sort_order)
  const [project, setProject] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [photos, setPhotos] = useState<Photo[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  const label = (f: FieldDef) => (lang === 'he' ? f.label_he : f.label_en)
  const set = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }))

  const addPhotos = (files: FileList | null) => {
    const next = Array.from(files ?? []).map((f) => ({ file: f, url: URL.createObjectURL(f) }))
    setPhotos((p) => [...p, ...next])
  }
  const removePhoto = (i: number) => setPhotos((ps) => {
    URL.revokeObjectURL(ps[i].url)
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
    setErrors(errs)
    if (errs.length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    setBusy(true); setSaveErr('')
    try {
      await createEntry(project, values, photos.map((p) => p.file))
      nav('/')
    } catch (e) {
      setSaveErr(String((e as Error).message ?? e))
      setBusy(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const textDefs = defs.filter((f) => f.type !== 'photo')

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">Agrotop · {projects.find((p) => p.id === project)?.name ?? '—'}</div>
          <h1 className="page-title">{t('new_entry')}</h1>
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
              {projects.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </motion.div>

        <motion.div variants={riseIn} className="form__section">{t('nav_log')}</motion.div>
        <motion.div variants={riseIn} className="form-grid">
          {textDefs.map((f) => {
            const invalid = errors.includes(f.key)
            const common = { className: 'input', value: values[f.key] ?? '', style: invalid ? { borderColor: 'var(--clay)' } : undefined }
            const wrap = f.type === 'long_text' ? 'span-2' : ''
            return (
              <div key={f.id} className={wrap}>
                <Field label={label(f)} hint={f.required ? <span className="req">{t('required_field')}</span> : t('optional')}>
                  {f.type === 'long_text' ? (
                    <textarea {...common} onChange={(e) => set(f.key, e.target.value)} />
                  ) : f.type === 'select' ? (
                    <select {...common} onChange={(e) => set(f.key, e.target.value)}>
                      <option value="">—</option>
                      {f.options.map((o, i) => <option key={i} value={lang === 'he' ? o.he : o.en}>{lang === 'he' ? o.he : o.en}</option>)}
                    </select>
                  ) : (
                    <input {...common} type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : f.type === 'phone' ? 'tel' : 'text'}
                      onChange={(e) => set(f.key, e.target.value)} />
                  )}
                </Field>
              </div>
            )
          })}
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
            <span className="plus">＋</span>
            <small>{t('add_photo')}</small>
            <input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => addPhotos(e.target.files)} />
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
