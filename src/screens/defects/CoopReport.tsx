import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader } from '../../components/Loader'
import { useStore } from '../../store'
import { useAuth } from '../../auth'
import { fetchCoopBundle, sendCoopReport, type CoopBundle } from '../../defects/api'
import { buildCoopReportHtml, buildCoopReportText } from '../../defects/report'
import { loadGateDefs, type GateDefs } from '../../defects/defs'
import { GATES } from '../../defects/model'

export default function CoopReport() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { projectName } = useStore()
  const { user } = useAuth()
  const [bundle, setBundle] = useState<CoopBundle | null>(null)
  const [err, setErr] = useState('')
  const [mailOpen, setMailOpen] = useState(false)
  const [emails, setEmails] = useState('')
  const [subject, setSubject] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<number | null>(null)

  const [defs, setDefs] = useState<GateDefs>(GATES)

  useEffect(() => {
    fetchCoopBundle(id).then(setBundle).catch((e) => setErr(String(e.message ?? e)))
    loadGateDefs().then(setDefs)
  }, [id])

  const pName = bundle ? projectName(bundle.coop.project_id) : ''
  const html = useMemo(
    () => bundle ? buildCoopReportHtml(bundle, pName, { senderName: user?.name }, defs) : '',
    [bundle, pName, user?.name, defs],
  )

  async function onSend() {
    if (!bundle || busy) return
    const list = emails.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => s.includes('@'))
    if (!list.length) { setErr('נא להזין לפחות כתובת מייל אחת'); return }
    setBusy(true); setErr('')
    try {
      const mailHtml = buildCoopReportHtml(bundle, pName, { senderName: user?.name, note }, defs)
      await sendCoopReport(bundle.coop.id, list, subject, mailHtml, buildCoopReportText(bundle, pName))
      setSentTo(list.length); setMailOpen(false)
    } catch (e) {
      setErr(String((e as Error).message ?? e))
    } finally { setBusy(false) }
  }

  if (err && !bundle) return <div className="page"><div className="alert">{err}</div></div>
  if (!bundle) return <Loader label="מכין דוח…" />

  return (
    <div className="page coop-report">
      <div className="page__head report-toolbar">
        <div>
          <div className="kicker">{pName} · דוח תפיסת סיום שלב</div>
          <h1 className="page-title">לול {bundle.coop.name}</h1>
        </div>
        <div className="report-toolbar__btns">
          <button className="btn btn--ghost" onClick={() => nav(`/defects/coop/${id}`)}>→ חזרה ללול</button>
          <button className="btn btn--ghost" onClick={() => window.print()}>🖨 הדפסה / PDF</button>
          <button className="btn btn--primary" onClick={() => { setSubject(`תפיסת סיום שלב · ${pName} · לול ${bundle.coop.name}`); setMailOpen(true) }}>
            ✉ שליחה במייל
          </button>
        </div>
      </div>

      {err && <div className="alert">{err}</div>}
      {sentTo !== null && <div className="alert alert--ok">✔ הדוח נשלח ל-{sentTo} נמענים.</div>}

      <div className="report-frame" dangerouslySetInnerHTML={{ __html: html }} />

      {mailOpen && (
        <div className="modal-backdrop" onClick={() => setMailOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} dir="rtl">
            <h2>שליחת דוח במייל</h2>
            <div className="form" style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label className="field">
                <span className="field__label">נמענים (מופרדים בפסיק)</span>
                <input className="input" placeholder="name@agrotop.co.il, other@..." value={emails} onChange={(e) => setEmails(e.target.value)} />
              </label>
              <label className="field">
                <span className="field__label">נושא</span>
                <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </label>
              <label className="field">
                <span className="field__label">הודעה אישית (תופיע בראש הדוח)</span>
                <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="לא חובה…" />
              </label>
            </div>
            <div className="form-actions" style={{ marginTop: 16 }}>
              <button className="btn btn--ghost" onClick={() => setMailOpen(false)}>ביטול</button>
              <button className="btn btn--primary" disabled={busy} onClick={onSend}>{busy ? 'שולח…' : '✉ שליחה'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
