import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader } from '../../components/Loader'
import { useStore } from '../../store'
import { useAuth } from '../../auth'
import { fetchCoopBundle, type CoopBundle } from '../../defects/api'
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
  const [copyMsg, setCopyMsg] = useState('')

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

  // בדיוק כמו בניהול עבודה: העתקה ללוח (HTML עשיר + טקסט) → הדבקה במייל
  async function onCopy() {
    if (!bundle) return
    setErr(''); setCopyMsg('')
    try {
      const text = buildCoopReportText(bundle, pName)
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })])
      setCopyMsg('✔ הדוח הועתק — פתחו מייל חדש והדביקו (Ctrl+V)')
    } catch {
      setCopyMsg('ההעתקה נכשלה — נסו שוב או השתמשו בהדפסה/PDF')
    }
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
          <button className="btn btn--ghost" onClick={onCopy}>📋 העתקת דוח למייל</button>
          <button className="btn btn--primary" onClick={() => window.print()}>📄 הדפסה / PDF</button>
        </div>
      </div>

      {err && <div className="alert">{err}</div>}
      {copyMsg && <div className="alert alert--ok">{copyMsg}</div>}

      <div className="report-frame" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
