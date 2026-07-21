import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader } from '../../components/Loader'
import { useStore } from '../../store'
import { useAuth } from '../../auth'
import { fetchCoopBundle, type CoopBundle } from '../../defects/api'
import { buildCoopReportHtml, buildCoopReportText } from '../../defects/report'
import { loadGateDefs, type GateDefs } from '../../defects/defs'
import { GATES } from '../../defects/model'
import { useDT } from '../../defects/i18n'

export default function CoopReport() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { projectName } = useStore()
  const { user } = useAuth()
  const { dt } = useDT()
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
      // clipboard variant is doubled — Outlook renders pasted HTML small
      const htmlLarge = buildCoopReportHtml(bundle, pName, { senderName: user?.name, large: true }, defs)
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([htmlLarge], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })])
      setCopyMsg(dt('rep_copied'))
    } catch {
      setCopyMsg(dt('rep_copy_failed'))
    }
  }

  if (err && !bundle) return <div className="page"><div className="alert">{err}</div></div>
  if (!bundle) return <Loader label={dt('rep_preparing')} />

  return (
    <div className="page coop-report">
      <div className="page__head report-toolbar">
        <div>
          <div className="kicker">{pName} · {dt('rep_kicker')}</div>
          <h1 className="page-title">{dt('rep_house')} {bundle.coop.name}</h1>
        </div>
        <div className="report-toolbar__btns">
          <button className="btn btn--ghost" onClick={() => nav(`/defects/coop/${id}`)}>{dt('rep_back')}</button>
          <button className="btn btn--ghost" onClick={onCopy}>{dt('rep_copy')}</button>
          <button className="btn btn--primary" onClick={() => window.print()}>{dt('rep_print')}</button>
        </div>
      </div>

      {err && <div className="alert">{err}</div>}
      {copyMsg && <div className="alert alert--ok">{copyMsg}</div>}

      <div className="report-frame" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
