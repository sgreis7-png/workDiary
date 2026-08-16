import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { st } from './i18n'
import { captureToSig, sigIsEmpty, type Sig } from './signature'

/** Fullscreen finger-signature pad. Collects pointer strokes on a canvas and
 *  returns them as a normalized vector Sig. Touch-action is disabled so the
 *  page does not scroll mid-signature. */
export function SignaturePad({ title, onDone, onClose }: {
  title: string
  onDone: (sig: Sig) => void
  onClose: () => void
}) {
  const { lang } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<number[][][]>([])
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  // size the canvas to its CSS box × devicePixelRatio once mounted
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const r = c.getBoundingClientRect()
    c.width = Math.round(r.width * dpr)
    c.height = Math.round(r.height * dpr)
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1b2733'
  }, [])

  const pt = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const down = (e: React.PointerEvent) => {
    e.preventDefault()
    canvasRef.current!.setPointerCapture(e.pointerId)
    drawing.current = true
    strokes.current.push([pt(e)])
  }
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const p = pt(e)
    const s = strokes.current[strokes.current.length - 1]
    const prev = s[s.length - 1]
    s.push(p)
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); ctx.stroke()
    if (!hasInk) setHasInk(true)
  }
  const up = () => { drawing.current = false }

  const clear = () => {
    strokes.current = []
    setHasInk(false)
    const c = canvasRef.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
  }
  const confirm = () => {
    const r = canvasRef.current!.getBoundingClientRect()
    const sig = captureToSig(strokes.current, r.width, r.height)
    if (!sigIsEmpty(sig)) onDone(sig)
  }

  return (
    <div className="sigpad" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sigpad__head">
        <strong>{title}</strong>
        <span className="sigpad__hint">{st(lang, 'sign_hint')}</span>
      </div>
      <canvas
        ref={canvasRef} className="sigpad__canvas"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      />
      <div className="sigpad__bar">
        <button className="btn btn--ghost" onClick={onClose}>✕</button>
        <button className="btn btn--ghost" onClick={clear}>{st(lang, 'sign_clear')}</button>
        <button className="btn btn--primary" disabled={!hasInk} onClick={confirm}>
          {st(lang, 'sign_confirm')}
        </button>
      </div>
    </div>
  )
}
