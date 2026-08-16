import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Field, stagger, riseIn } from '../components/ui'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { createSafetyForm, fetchSafetyTopics, fetchWorkerSuggestions, getSafetyForm, updateSafetyForm } from './api'
import type { SafetyFormInput, SafetyTopic, SafetyWorker } from './model'
import { sigIsEmpty, sigSvg, type Sig } from './signature'
import { SignaturePad } from './SignaturePad'
import { st } from './i18n'

const DRAFT_KEY = 'safety_draft'
const today = () => new Date().toISOString().slice(0, 10)
const blankWorker = (): SafetyWorker => ({ name: '', id_number: '', signature: null, signed_at: null })

interface Draft {
  project_id: string
  training_date: string
  topicChecks: Record<string, boolean>
  workers: SafetyWorker[]
  instructor_name: string
  instructor_qualification: string
  instructor_signature: Sig | null
}

// which signature the pad currently open is capturing for
type Signing = { kind: 'worker'; index: number } | { kind: 'instructor' } | null

export function SafetyFormScreen() {
  const { lang } = useI18n()
  const nav = useNavigate()
  const { id } = useParams()
  const editing = Boolean(id)
  const { projects, userMap } = useStore()
  const { user } = useAuth()

  const [loading, setLoading] = useState(editing)
  const [topics, setTopics] = useState<SafetyTopic[]>([])
  const [savedTopics, setSavedTopics] = useState<string[]>([]) // as loaded from the record, for edit mode
  const [projectId, setProjectId] = useState('')
  const [trainingDate, setTrainingDate] = useState(today())
  const [topicChecks, setTopicChecks] = useState<Record<string, boolean>>({})
  const [workers, setWorkers] = useState<SafetyWorker[]>([blankWorker()])
  const [instructorName, setInstructorName] = useState('')
  const [instructorQual, setInstructorQual] = useState('')
  const [instructorSig, setInstructorSig] = useState<Sig | null>(null)
  const [suggestions, setSuggestions] = useState<{ name: string; id_number: string }[]>([])
  const [signing, setSigning] = useState<Signing>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [saveErr, setSaveErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [restored, setRestored] = useState(false)
  const [draftNotice, setDraftNotice] = useState(false)
  // true once we know: brand-new form, nothing restored from a draft — the only
  // case where "every active topic checked" applies as the initial state
  const [freshNew, setFreshNew] = useState(false)

  // topics: fetched once; only active ones render, but an edited-form's saved
  // labels are kept visible even if since deactivated (see savedTopics below)
  useEffect(() => { fetchSafetyTopics().then(setTopics).catch(() => {}) }, [])

  // load the record (edit) or restore a pending draft (new)
  useEffect(() => {
    let alive = true
    ;(async () => {
      if (editing && id) {
        const f = await getSafetyForm(id)
        if (!alive) return
        if (!f) { nav('/'); return }
        setProjectId(f.project_id)
        setTrainingDate(f.training_date)
        const checks: Record<string, boolean> = {}
        for (const label of f.topics) checks[label] = true
        setTopicChecks(checks)
        setSavedTopics(f.topics)
        setWorkers(f.workers.length ? f.workers : [blankWorker()])
        setInstructorName(f.instructor_name)
        setInstructorQual(f.instructor_qualification)
        setInstructorSig(f.instructor_signature)
        setLoading(false)
        setRestored(true)
      } else {
        try {
          const raw = localStorage.getItem(DRAFT_KEY)
          if (raw) {
            const d = JSON.parse(raw) as Draft
            setProjectId(d.project_id ?? '')
            setTrainingDate(d.training_date ?? today())
            setTopicChecks(d.topicChecks ?? {})
            setWorkers(d.workers?.length ? d.workers : [blankWorker()])
            setInstructorName(d.instructor_name ?? '')
            setInstructorQual(d.instructor_qualification ?? '')
            setInstructorSig(d.instructor_signature ?? null)
            setDraftNotice(true)
          } else {
            setInstructorName(user ? (userMap[user.id] ?? '') : '')
            setFreshNew(true)
          }
        } catch { /* corrupt draft — start clean */ }
        setRestored(true)
      }
    })().catch(() => { if (alive) { setSaveErr('load failed'); setLoading(false); setRestored(true) } })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, id, nav])

  // brand-new form: default every active topic to checked once both are known
  useEffect(() => {
    if (!freshNew || topics.length === 0) return
    setTopicChecks((prev) => {
      const next = { ...prev }
      for (const t of topics) if (t.active && !(t.label in next)) next[t.label] = true
      return next
    })
  }, [freshNew, topics])

  // worker-name autocomplete, refetched per project
  useEffect(() => {
    if (!projectId) { setSuggestions([]); return }
    let alive = true
    fetchWorkerSuggestions(projectId).then((s) => { if (alive) setSuggestions(s) }).catch(() => {})
    return () => { alive = false }
  }, [projectId])

  // draft persistence — new forms only; signatures ride along on purpose
  useEffect(() => {
    if (editing || !restored || busy) return
    const t = setTimeout(() => {
      const d: Draft = {
        project_id: projectId, training_date: trainingDate, topicChecks, workers,
        instructor_name: instructorName, instructor_qualification: instructorQual, instructor_signature: instructorSig,
      }
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch { /* storage full / private mode */ }
    }, 400)
    return () => clearTimeout(t)
  }, [editing, restored, busy, projectId, trainingDate, topicChecks, workers, instructorName, instructorQual, instructorSig])

  const activeTopics = topics.filter((t) => t.active)
  const activeLabels = new Set(activeTopics.map((t) => t.label))
  // saved topics no longer active/present — still shown (checked) so history isn't lost
  const extraLabels = editing ? savedTopics.filter((l) => !activeLabels.has(l)) : []
  const renderTopicLabels = [...activeTopics.map((t) => t.label), ...extraLabels]

  const toggleTopic = (label: string) => setTopicChecks((c) => ({ ...c, [label]: !c[label] }))

  const updWorker = (i: number, patch: Partial<SafetyWorker>) => {
    setWorkers((ws) => ws.map((w, k) => {
      if (k !== i) return w
      const next = { ...w, ...patch }
      if (patch.name !== undefined) {
        const match = suggestions.find((s) => s.name === patch.name && s.id_number)
        if (match) next.id_number = match.id_number
      }
      return next
    }))
  }
  const removeWorker = (i: number) => setWorkers((ws) => ws.filter((_, k) => k !== i))
  const addWorker = () => setWorkers((ws) => [...ws, blankWorker()])

  const finishSign = (sig: Sig) => {
    if (!signing) return
    if (signing.kind === 'worker') {
      setWorkers((ws) => ws.map((w, k) => (k === signing.index ? { ...w, signature: sig, signed_at: new Date().toISOString() } : w)))
    } else {
      setInstructorSig(sig)
    }
    setSigning(null)
  }

  const save = async () => {
    const errs: string[] = []
    if (!projectId) errs.push('__project__')
    const validWorkers = workers.filter((w) => w.name.trim())
    if (validWorkers.length === 0) errs.push('__worker__')
    setErrors(errs)
    if (errs.length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    setBusy(true); setSaveErr('')
    const topicsOut = renderTopicLabels.filter((label) => topicChecks[label])
    const input: SafetyFormInput = {
      project_id: projectId,
      training_date: trainingDate,
      topics: topicsOut,
      workers: validWorkers,
      instructor_name: instructorName,
      instructor_qualification: instructorQual,
      instructor_signature: instructorSig,
    }
    try {
      if (editing && id) {
        await updateSafetyForm(id, input)
        nav(`/safety/${id}`)
      } else {
        const newId = await createSafetyForm(input)
        try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
        nav(`/safety/${newId}`)
      }
    } catch (e) {
      setSaveErr(String((e as Error).message ?? e))
      setBusy(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  if (loading) return <Loader full />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">Agrotop · {projects.find((p) => p.id === projectId)?.name ?? '—'}</div>
          <h1 className="page-title">{editing ? st(lang, 'form_title_edit') : st(lang, 'form_title_new')}</h1>
        </div>
      </div>

      <AnimatePresence>
        {draftNotice && (
          <motion.div className="alert alert--ok" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            ↺ {st(lang, 'form_draft_restored')}
          </motion.div>
        )}
        {errors.includes('__project__') && (
          <motion.div className="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            ⚠ {st(lang, 'form_need_project')}
          </motion.div>
        )}
        {errors.includes('__worker__') && (
          <motion.div className="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            ⚠ {st(lang, 'form_need_worker')}
          </motion.div>
        )}
        {saveErr && (
          <motion.div className="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            ⚠ {saveErr}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div className="form" variants={stagger} initial="hidden" animate="show">
        <motion.div variants={riseIn} className="form-grid">
          <div>
            <Field label={st(lang, 'form_project')} hint={<span className="req">{st(lang, 'form_need_project')}</span>}>
              <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}
                style={errors.includes('__project__') ? { borderColor: 'var(--clay)' } : undefined}>
                <option value="">— {lang === 'he' ? 'בחירה' : 'Choose'} —</option>
                {[...projects].sort((a, b) => Number(b.active) - Number(a.active))
                  .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </div>
          <div>
            <Field label={st(lang, 'form_date')}>
              <input className="input" type="date" value={trainingDate} onChange={(e) => setTrainingDate(e.target.value)} />
            </Field>
          </div>
        </motion.div>

        <motion.div variants={riseIn} className="form__section" style={{ marginTop: 30 }}>{st(lang, 'form_topics')}</motion.div>
        <motion.div variants={riseIn} className="topic-list">
          {renderTopicLabels.map((label) => (
            <label key={label} className="topic-chip">
              <input type="checkbox" checked={!!topicChecks[label]} onChange={() => toggleTopic(label)} />
              {label}
            </label>
          ))}
        </motion.div>

        <motion.div variants={riseIn} className="form__section" style={{ marginTop: 30 }}>{st(lang, 'form_workers')}</motion.div>
        <motion.div variants={riseIn}>
          <div className="rtable">
            <div className="rtable__head rtable__row--workers">
              <span>{st(lang, 'form_name')}</span><span>{st(lang, 'form_id')}</span><span>{st(lang, 'form_sign')}</span><span />
            </div>
            {workers.map((w, i) => (
              <div key={i} className="rtable__row rtable__row--workers">
                <input className="input" list="safety-worker-suggestions" value={w.name} placeholder={st(lang, 'form_name')}
                  onChange={(e) => updWorker(i, { name: e.target.value })} />
                <input className="input" value={w.id_number} placeholder={st(lang, 'form_id')}
                  onChange={(e) => updWorker(i, { id_number: e.target.value })} />
                {sigIsEmpty(w.signature) ? (
                  <Button variant="ghost" type="button" onClick={() => setSigning({ kind: 'worker', index: i })}>
                    ✍ {st(lang, 'form_sign')}
                  </Button>
                ) : (
                  <button type="button" className="sig-thumb" title={st(lang, 'form_sign')}
                    onClick={() => setSigning({ kind: 'worker', index: i })}
                    dangerouslySetInnerHTML={{ __html: sigSvg(w.signature) }} />
                )}
                <button type="button" className="rtable__del" title={st(lang, 'form_remove')} onClick={() => removeWorker(i)}>✕</button>
              </div>
            ))}
            <div className="rtable__foot">
              <Button variant="ghost" type="button" onClick={addWorker}>{st(lang, 'form_add_worker')}</Button>
            </div>
          </div>
          <datalist id="safety-worker-suggestions">
            {suggestions.map((s, i) => <option key={i} value={s.name} />)}
          </datalist>
        </motion.div>

        <motion.div variants={riseIn} className="form__section" style={{ marginTop: 30 }}>{st(lang, 'form_instructor')}</motion.div>
        <motion.div variants={riseIn} className="form-grid">
          <div>
            <Field label={st(lang, 'form_instr_name')}>
              <input className="input" value={instructorName} onChange={(e) => setInstructorName(e.target.value)} />
            </Field>
          </div>
          <div>
            <Field label={st(lang, 'form_instr_qual')}>
              <input className="input" value={instructorQual} onChange={(e) => setInstructorQual(e.target.value)} />
            </Field>
          </div>
          <div className="span-2">
            {sigIsEmpty(instructorSig) ? (
              <Button variant="ghost" type="button" onClick={() => setSigning({ kind: 'instructor' })}>
                ✍ {st(lang, 'form_sign')}
              </Button>
            ) : (
              <button type="button" className="sig-thumb" title={st(lang, 'form_sign')}
                onClick={() => setSigning({ kind: 'instructor' })}
                dangerouslySetInnerHTML={{ __html: sigSvg(instructorSig) }} />
            )}
          </div>
        </motion.div>

        <div className="form-actions">
          <Button variant="ghost" onClick={() => nav('/')}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? <><span className="spin" />{lang === 'he' ? 'שומר…' : 'Saving…'}</> : (lang === 'he' ? 'שמירה' : 'Save')}
          </Button>
        </div>
      </motion.div>

      {signing && (
        <SignaturePad
          title={signing.kind === 'worker' ? (workers[signing.index]?.name || st(lang, 'form_name')) : (instructorName || st(lang, 'form_instr_name'))}
          onDone={finishSign}
          onClose={() => setSigning(null)}
        />
      )}
    </div>
  )
}
