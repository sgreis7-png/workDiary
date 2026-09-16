import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Field, stagger, riseIn } from '../components/ui'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { useStore } from '../store'
import { useAuth } from '../auth'
import { SignaturePad } from '../safety/SignaturePad'
import { sigIsEmpty, sigSvg, type Sig } from '../safety/signature'
import {
  createHandover, fetchHandoverSystems, fetchProjectHeader, getHandover, updateHandover,
} from './api'
import {
  blankAttendee, systemChecksFor, validateHandover,
  type HandoverAttendee, type HandoverError, type HandoverInput, type HandoverSystem,
  type HandoverSystemCheck, type SystemStatus,
} from './model'
import { ht } from './i18n'

const DRAFT_KEY = 'handover_draft'
const today = () => new Date().toISOString().slice(0, 10)

interface Draft {
  project_id: string
  handover_date: string
  client_name: string
  site_location: string
  project_nature: string
  attendees: HandoverAttendee[]
  systems: HandoverSystemCheck[]
  notes: string
  receiver_name: string
  receiver_role: string
  receiver_signature: Sig | null
}

export function HandoverFormScreen() {
  const { lang } = useI18n()
  const nav = useNavigate()
  const { id } = useParams()
  const editing = Boolean(id)
  const { projects } = useStore()
  const { isAdmin } = useAuth()

  const [loading, setLoading] = useState(editing)
  const [catalogue, setCatalogue] = useState<HandoverSystem[]>([])
  const [savedSystems, setSavedSystems] = useState<HandoverSystemCheck[]>([])
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState(today())
  const [client, setClient] = useState('')
  const [site, setSite] = useState('')
  const [nature, setNature] = useState('')
  const [attendees, setAttendees] = useState<HandoverAttendee[]>([blankAttendee()])
  const [systems, setSystems] = useState<HandoverSystemCheck[]>([])
  const [notes, setNotes] = useState('')
  const [recName, setRecName] = useState('')
  const [recRole, setRecRole] = useState('')
  const [recSig, setRecSig] = useState<Sig | null>(null)
  const [signing, setSigning] = useState(false)
  const [errors, setErrors] = useState<HandoverError[]>([])
  const [saveErr, setSaveErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [restored, setRestored] = useState(false)
  const [draftNotice, setDraftNotice] = useState(false)

  useEffect(() => { fetchHandoverSystems().then(setCatalogue).catch(() => {}) }, [])

  // load the record (edit) or restore a pending draft (new)
  useEffect(() => {
    let alive = true
    ;(async () => {
      if (editing && id) {
        const f = await getHandover(id)
        if (!alive) return
        if (!f) { nav('/handover'); return }
        // A signed handover is admin-only to update (migration 0077). Anyone else who lands
        // here goes to the read-only view instead of an editor that would fail on save.
        if (!isAdmin) { nav(`/handover/${id}`); return }
        setProjectId(f.project_id); setDate(f.handover_date)
        setClient(f.client_name); setSite(f.site_location); setNature(f.project_nature)
        setAttendees(f.attendees.length ? f.attendees : [blankAttendee()])
        setSavedSystems(f.systems)
        setNotes(f.notes)
        setRecName(f.receiver_name); setRecRole(f.receiver_role); setRecSig(f.receiver_signature)
        setLoading(false); setRestored(true)
      } else {
        try {
          const raw = localStorage.getItem(DRAFT_KEY)
          if (raw) {
            const d = JSON.parse(raw) as Draft
            setProjectId(d.project_id ?? ''); setDate(d.handover_date ?? today())
            setClient(d.client_name ?? ''); setSite(d.site_location ?? ''); setNature(d.project_nature ?? '')
            setAttendees(d.attendees?.length ? d.attendees : [blankAttendee()])
            setSavedSystems(d.systems ?? [])
            setNotes(d.notes ?? '')
            setRecName(d.receiver_name ?? ''); setRecRole(d.receiver_role ?? '')
            setRecSig(d.receiver_signature ?? null)
            setDraftNotice(true)
          }
        } catch { /* corrupt draft — start clean */ }
        setRestored(true)
      }
    })().catch(() => { if (alive) { setSaveErr('load failed'); setLoading(false); setRestored(true) } })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, id, nav])

  // the rows to show: active catalogue + anything the record already carries
  useEffect(() => {
    if (!restored || catalogue.length === 0) return
    // derives the visible rows from two independent async sources (catalogue fetch,
    // record/draft restore); no single event handler owns this transition, so there is
    // no other place to synchronize it from.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSystems((cur) => systemChecksFor(catalogue, cur.length ? cur : savedSystems))
  }, [restored, catalogue, savedSystems])

  // header prefill from the project — only empty fields, never over a typed value
  useEffect(() => {
    if (editing || !restored || !projectId) return
    let alive = true
    fetchProjectHeader(projectId).then((h) => {
      if (!alive || !h) return
      setClient((c) => (c.trim() ? c : h.client_name))
      setSite((s) => (s.trim() ? s : h.site_location))
      setNature((n) => (n.trim() ? n : h.project_nature))
    }).catch(() => {})
    return () => { alive = false }
  }, [editing, restored, projectId])

  // draft persistence — new forms only; the signature rides along on purpose, because the
  // customer signs on site and the phone may not see the network until the drive home
  useEffect(() => {
    if (editing || !restored || busy) return
    const t = setTimeout(() => {
      const d: Draft = {
        project_id: projectId, handover_date: date, client_name: client, site_location: site,
        project_nature: nature, attendees, systems, notes,
        receiver_name: recName, receiver_role: recRole, receiver_signature: recSig,
      }
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch { /* storage full / private mode */ }
    }, 400)
    return () => clearTimeout(t)
  }, [editing, restored, busy, projectId, date, client, site, nature, attendees, systems, notes, recName, recRole, recSig])

  const updAttendee = (i: number, patch: Partial<HandoverAttendee>) =>
    setAttendees((as) => as.map((a, k) => (k === i ? { ...a, ...patch } : a)))
  const removeAttendee = (i: number) => setAttendees((as) => as.filter((_, k) => k !== i))
  const addAttendee = () => setAttendees((as) => [...as, blankAttendee()])

  const setStatus = (i: number, status: SystemStatus) =>
    setSystems((ss) => ss.map((s, k) => (k === i ? { ...s, status } : s)))
  const setNote = (i: number, note: string) =>
    setSystems((ss) => ss.map((s, k) => (k === i ? { ...s, note } : s)))

  const save = async () => {
    const draft = {
      project_id: projectId, handover_date: date, client_name: client, site_location: site,
      project_nature: nature, attendees, systems, receiver_name: recName,
      receiver_role: recRole, receiver_signature: recSig,
    }
    const errs = validateHandover(draft)
    setErrors(errs)
    if (errs.length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    setBusy(true); setSaveErr('')
    const input: HandoverInput = {
      ...draft,
      attendees: attendees.filter((a) => a.name.trim() || a.role.trim()),
      notes,
      signed_at: new Date().toISOString(),
    }
    try {
      if (editing && id) {
        await updateHandover(id, input)
        nav(`/handover/${id}`)
      } else {
        const newId = await createHandover(input)
        try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
        nav(`/handover/${newId}`)
      }
    } catch (e) {
      setSaveErr(String((e as Error).message ?? e))
      setBusy(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  if (loading) return <Loader full />

  const errKey = { project: 'err_project', header: 'err_header', attendee: 'err_attendee', systems: 'err_systems', receiver: 'err_receiver' } as const

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">Agrotop · {projects.find((p) => p.id === projectId)?.name ?? '—'}</div>
          <h1 className="page-title">{editing ? ht(lang, 'form_title_edit') : ht(lang, 'form_title_new')}</h1>
        </div>
      </div>

      <AnimatePresence>
        {draftNotice && (
          <motion.div className="alert alert--ok" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            ↺ {ht(lang, 'form_draft_restored')}
          </motion.div>
        )}
        {errors.map((e) => (
          <motion.div key={e} className="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            ⚠ {ht(lang, errKey[e])}
          </motion.div>
        ))}
        {saveErr && (
          <motion.div className="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            ⚠ {saveErr}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div className="form" variants={stagger} initial="hidden" animate="show">
        <motion.div variants={riseIn} className="form-grid">
          <div>
            <Field label={ht(lang, 'form_project')}>
              <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}
                style={errors.includes('project') ? { borderColor: 'var(--clay)' } : undefined}>
                <option value="">— {lang === 'he' ? 'בחירה' : 'Choose'} —</option>
                {[...projects].sort((a, b) => Number(b.active) - Number(a.active))
                  .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          </div>
          <div>
            <Field label={ht(lang, 'form_date')}>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <div>
            <Field label={ht(lang, 'form_client')}>
              <input className="input" value={client} onChange={(e) => setClient(e.target.value)} />
            </Field>
          </div>
          <div>
            <Field label={ht(lang, 'form_site')}>
              <input className="input" value={site} onChange={(e) => setSite(e.target.value)} />
            </Field>
          </div>
          <div className="span-2">
            <Field label={ht(lang, 'form_nature')}>
              <input className="input" value={nature} onChange={(e) => setNature(e.target.value)} />
            </Field>
          </div>
        </motion.div>

        <motion.div variants={riseIn} className="form__section" style={{ marginTop: 30 }}>{ht(lang, 'form_attendees')}</motion.div>
        <motion.div variants={riseIn}>
          <div className="rtable">
            <div className="rtable__head rtable__row--attendees">
              <span>{ht(lang, 'form_att_name')}</span><span>{ht(lang, 'form_att_role')}</span><span />
            </div>
            {attendees.map((a, i) => (
              <div key={i} className="rtable__row rtable__row--attendees">
                <input className="input" value={a.name} placeholder={ht(lang, 'form_att_name')}
                  onChange={(e) => updAttendee(i, { name: e.target.value })} />
                <input className="input" value={a.role} placeholder={ht(lang, 'form_att_role')}
                  onChange={(e) => updAttendee(i, { role: e.target.value })} />
                <button type="button" className="rtable__del" title={ht(lang, 'form_remove')} onClick={() => removeAttendee(i)}>✕</button>
              </div>
            ))}
            <div className="rtable__foot">
              <Button variant="ghost" type="button" onClick={addAttendee}>{ht(lang, 'form_add_att')}</Button>
            </div>
          </div>
        </motion.div>

        <motion.div variants={riseIn} className="form__section" style={{ marginTop: 30 }}>{ht(lang, 'form_systems')}</motion.div>
        <motion.div variants={riseIn}>
          <div className="rtable">
            <div className="rtable__head rtable__row--handover">
              <span>{ht(lang, 'form_system')}</span><span>{ht(lang, 'form_status')}</span><span>{ht(lang, 'form_note')}</span>
            </div>
            {systems.map((s, i) => (
              <div key={s.label} className="rtable__row rtable__row--handover"
                style={s.status == null && errors.includes('systems') ? { borderInlineStart: '3px solid var(--clay)' } : undefined}>
                <strong>{s.label}</strong>
                <div className="handover-status">
                  <label>
                    <input type="radio" name={`st-${i}`} checked={s.status === 'ok'} onChange={() => setStatus(i, 'ok')} />
                    {ht(lang, 'form_ok')}
                  </label>
                  <label>
                    <input type="radio" name={`st-${i}`} checked={s.status === 'bad'} onChange={() => setStatus(i, 'bad')} />
                    {ht(lang, 'form_bad')}
                  </label>
                </div>
                <input className="input" value={s.note} placeholder={ht(lang, 'form_note')}
                  onChange={(e) => setNote(i, e.target.value)} />
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div variants={riseIn} style={{ marginTop: 24 }}>
          <Field label={ht(lang, 'form_notes')}>
            <textarea className="input" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </motion.div>

        <motion.div variants={riseIn} className="form__section" style={{ marginTop: 30 }}>{ht(lang, 'form_receiver')}</motion.div>
        <motion.div variants={riseIn} className="form-grid">
          <div>
            <Field label={ht(lang, 'form_rec_name')}>
              <input className="input" value={recName} onChange={(e) => setRecName(e.target.value)} />
            </Field>
          </div>
          <div>
            <Field label={ht(lang, 'form_rec_role')}>
              <input className="input" value={recRole} onChange={(e) => setRecRole(e.target.value)} />
            </Field>
          </div>
          <div className="span-2">
            {sigIsEmpty(recSig) ? (
              <Button variant="ghost" type="button" onClick={() => setSigning(true)}>✍ {ht(lang, 'form_sign')}</Button>
            ) : (
              <button type="button" className="sig-thumb" title={ht(lang, 'form_sign')}
                onClick={() => setSigning(true)} dangerouslySetInnerHTML={{ __html: sigSvg(recSig) }} />
            )}
          </div>
        </motion.div>

        <div className="form-actions">
          <Button variant="ghost" onClick={() => nav('/handover')}>{lang === 'he' ? 'ביטול' : 'Cancel'}</Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? <><span className="spin" />{lang === 'he' ? 'שומר…' : 'Saving…'}</> : (lang === 'he' ? 'שמירה' : 'Save')}
          </Button>
        </div>
      </motion.div>

      {signing && (
        <SignaturePad
          title={recName || ht(lang, 'sign_title')}
          onDone={(sig) => { setRecSig(sig); setSigning(false) }}
          onClose={() => setSigning(false)}
        />
      )}
    </div>
  )
}
