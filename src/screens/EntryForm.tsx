import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Field, stagger, riseIn } from '../components/ui'
import { useI18n } from '../i18n'
import { FIELD_DEFS, FieldDef, PROJECTS, createEntry } from '../data'

export default function EntryForm() {
  const { t, lang } = useI18n()
  const nav = useNavigate()
  const defs = FIELD_DEFS.filter((f) => f.active).sort((a, b) => a.sort_order - b.sort_order)
  const [project, setProject] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [photos, setPhotos] = useState<string[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const label = (f: FieldDef) => (lang === 'he' ? f.label_he : f.label_en)
  const set = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }))

  const addPhotos = (files: FileList | null) => {
    Array.from(files ?? []).forEach((f) => {
      const reader = new FileReader()
      reader.onload = () => setPhotos((p) => [...p, reader.result as string])
      reader.readAsDataURL(f)
    })
  }

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
    setBusy(true)
    createEntry(project, values, photos)
    await new Promise((r) => setTimeout(r, 500))
    nav('/')
  }

  const textDefs = defs.filter((f) => f.type !== 'photo')

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">Agrotop · {PROJECTS.find((p) => p.id === project)?.name ?? '—'}</div>
          <h1 className="page-title">{t('new_entry')}</h1>
        </div>
      </div>

      <AnimatePresence>
        {errors.length > 0 && (
          <motion.div className="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            ⚠ {t('missing')}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div className="form" variants={stagger} initial="hidden" animate="show">
        <motion.div variants={riseIn} className="form__section">{t('project')}</motion.div>
        <motion.div variants={riseIn} style={{ marginBottom: 26 }}>
          <Field label={t('project')} hint={<span className="req">{t('required_field')}</span>}>
            <select className="input" value={project} onChange={(e) => setProject(e.target.value)} style={errors.includes('__project__') ? { borderColor: 'var(--clay)' } : undefined}>
              <option value="">— {t('choose')} —</option>
              {PROJECTS.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                <img src={p} alt="" />
                <button onClick={() => setPhotos((ps) => ps.filter((_, k) => k !== i))}>✕</button>
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
