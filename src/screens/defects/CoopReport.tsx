import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader } from '../../components/Loader'
import { useStore } from '../../store'
import { useAuth } from '../../auth'
import { fetchCoopBundle, type CoopBundle } from '../../defects/api'
import { buildCoopReportHtml, buildCoopReportText } from '../../defects/report'
import { loadGateDefs, type GateDefs } from '../../defects/defs'
import { GATES } from '../../defects/model'
import { useDT } from '../../defects/i18n'
import { useI18n } from '../../i18n'
import { SendMailDialog } from '../../components/SendMailDialog'

export default function CoopReport() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { projectName } = useStore()
  const { user } = useAuth()
  const { dt } = useDT()
  const { t } = useI18n()
  const [bundle, setBundle] = useState<CoopBundle | null>(null)
  const [err, setErr] = useState('')
  const [copyMsg, setCopyMsg] = useState('')
  const [sendOpen, setSendOpen] = useState(false)

  const [defs, setDefs] = useState<GateDefs>(GATES)

  useEffect(() => {
    fetchCoopBundle(id).then(setBundle).catch((e) => setErr(String(e.message ?? e)))
    loadGateDefs().then(setDefs)
  }, [id])

  // phone: scale the 860px document to the container width (PDF-viewer style),
  // so nothing is cut and no horizontal scrolling is needed
  const frameRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const fit = () => {
      const w = el.clientWidth
      setZoom(w > 0 && w < 900 ? Math.max(0.3, w / 905) : 1)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [bundle])

  const pName = bundle ? projectName(bundle.coop.project_id) : ''
  const html = useMemo(
    () => bundle ? buildCoopReportHtml(bundle, pName, { senderName: user?.name }, defs) : '',
    [bundle, pName, user?.name, defs],
  )

  // העתקה ללוח דרך בחירת DOM נסתרת (execCommand) ולא clipboard.write —
  // ה-sanitizer של כרום מוחק dir/align מה-HTML, ואז Outlook מדביק LTR.
  function copyViaSelection(htmlBody: string): boolean {
    const host = document.createElement('div')
    host.setAttribute('contenteditable', 'true')
    host.setAttribute('dir', 'rtl')
    host.style.position = 'fixed'
    host.style.insetInlineStart = '-99999px'
    host.style.top = '0'
    // wide host: Chromium inlines computed widths on copy — a narrow container
    // would bake a squeezed table width into the pasted HTML
    host.style.width = '900px'
    host.innerHTML = htmlBody
    document.body.appendChild(host)
    const range = document.createRange()
    range.selectNodeContents(host)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    let ok: boolean
    try { ok = document.execCommand('copy') } catch { ok = false }
    sel?.removeAllRanges()
    host.remove()
    return ok
  }

  async function onCopy() {
    if (!bundle) return
    setErr(''); setCopyMsg('')
    const text = buildCoopReportText(bundle, pName)
    // clipboard variant is doubled — Outlook renders pasted HTML small
    const htmlLarge = buildCoopReportHtml(bundle, pName, { senderName: user?.name, large: true }, defs)
    if (copyViaSelection(htmlLarge)) { setCopyMsg(dt('rep_copied')); return }
    try {
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
          <button className="btn btn--ghost" onClick={() => setSendOpen(true)}>{t('send_outlook')}</button>
          <button className="btn btn--primary" onClick={() => window.print()}>{dt('rep_print')}</button>
        </div>
      </div>
      {sendOpen && (
        <SendMailDialog
          subject={`תפיסת סיום שלב · ${pName} · לול ${bundle.coop.name}`}
          html={html}
          onClose={() => setSendOpen(false)}
        />
      )}

      {err && <div className="alert">{err}</div>}
      {copyMsg && <div className="alert alert--ok">{copyMsg}</div>}

      <div className="report-frame" ref={frameRef}>
        <div style={{ zoom }} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  )
}
