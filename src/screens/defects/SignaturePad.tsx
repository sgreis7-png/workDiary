import { useEffect, useRef, useState } from 'react'

/** Finger/mouse signature canvas. Calls onChange with a PNG blob after each stroke,
 *  null when cleared. */
export function SignaturePad({ onChange, height = 120 }: { onChange: (png: Blob | null) => void; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const c = canvasRef.current!
    const scale = window.devicePixelRatio || 1
    const w = c.offsetWidth
    c.width = w * scale
    c.height = height * scale
    const ctx = c.getContext('2d')!
    ctx.scale(scale, scale)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#14181b'
  }, [height])

  function pos(e: PointerEvent | React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  function down(e: React.PointerEvent) {
    e.preventDefault()
    canvasRef.current!.setPointerCapture(e.pointerId)
    drawing.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }
  function up() {
    if (!drawing.current) return
    drawing.current = false
    setDirty(true)
    canvasRef.current!.toBlob((b) => onChange(b), 'image/png')
  }
  function clear() {
    const c = canvasRef.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    setDirty(false)
    onChange(null)
  }

  return (
    <div className="sigpad">
      <canvas
        ref={canvasRef}
        className="sigpad__canvas"
        style={{ height, touchAction: 'none' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
      />
      <div className="sigpad__bar">
        <small>{dirty ? 'חתימה נקלטה' : 'חתמו כאן באצבע / בעכבר'}</small>
        <button type="button" className="btn btn--quiet" onClick={clear}>נקה</button>
      </div>
    </div>
  )
}
