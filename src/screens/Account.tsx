import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Button, Field, Avatar } from '../components/ui'
import { useI18n } from '../i18n'
import { useAuth } from '../auth'
import { changeMyPassword } from '../api'
import { fetchProfileMetas, uploadMyAvatar } from '../lib/messages'

/** Interactive crop: drag to position, slider to zoom, circular preview. */
function AvatarCropDialog({ file, onCancel, onSave }: {
  file: File
  onCancel: () => void
  onSave: (png: Blob) => void
}) {
  const VIEW = 280
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<ImageBitmap | null>(null)
  const [zoom, setZoom] = useState(1)          // 1 = cover
  const [off, setOff] = useState({ x: 0, y: 0 }) // pan in view px
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    createImageBitmap(file).then((b) => { if (alive) { imgRef.current = b; setReady(true) } })
    return () => { alive = false }
  }, [file])

  // draw: cover-scale * zoom, centered + offset, circle mask hint drawn on top
  function draw(ctx: CanvasRenderingContext2D, size: number, forExport = false) {
    const img = imgRef.current!
    const cover = Math.max(size / img.width, size / img.height)
    const s = cover * zoom
    const w = img.width * s, h = img.height * s
    const k = size / VIEW // export scale for offsets
    const x = (size - w) / 2 + off.x * k
    const y = (size - h) / 2 + off.y * k
    ctx.clearRect(0, 0, size, size)
    ctx.drawImage(img, x, y, w, h)
    if (!forExport) {
      ctx.save()
      ctx.fillStyle = 'rgba(10,15,12,.55)'
      ctx.beginPath()
      ctx.rect(0, 0, size, size)
      ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2, true)
      ctx.fill('evenodd')
      ctx.strokeStyle = '#3aaa35'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }
  }

  useEffect(() => {
    if (!ready || !canvasRef.current) return
    const c = canvasRef.current
    const scale = window.devicePixelRatio || 1
    c.width = VIEW * scale; c.height = VIEW * scale
    const ctx = c.getContext('2d')!
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    draw(ctx, VIEW)
  }, [ready, zoom, off]) // eslint-disable-line react-hooks/exhaustive-deps

  function clampOff(o: { x: number; y: number }) {
    const img = imgRef.current!
    const cover = Math.max(VIEW / img.width, VIEW / img.height)
    const w = img.width * cover * zoom, h = img.height * cover * zoom
    const maxX = Math.max(0, (w - VIEW) / 2), maxY = Math.max(0, (h - VIEW) / 2)
    return { x: Math.max(-maxX, Math.min(maxX, o.x)), y: Math.max(-maxY, Math.min(maxY, o.y)) }
  }

  async function save() {
    const size = 256
    const c = document.createElement('canvas')
    c.width = size; c.height = size
    draw(c.getContext('2d')!, size, true)
    c.toBlob((b) => b && onSave(b), 'image/png')
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} dir="rtl" style={{ maxWidth: 360 }}>
        <h2>התאמת תמונת פרופיל</h2>
        <p className="coop-intro" style={{ margin: '6px 0 12px' }}>גררו למיקום, והשתמשו בסליידר להגדלה — מה שבתוך העיגול יישמר.</p>
        <canvas
          ref={canvasRef}
          style={{ width: VIEW, height: VIEW, borderRadius: 14, cursor: 'grab', touchAction: 'none', display: 'block', margin: '0 auto' }}
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX - off.x, y: e.clientY - off.y } }}
          onPointerMove={(e) => { if (drag.current) setOff(clampOff({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })) }}
          onPointerUp={() => { drag.current = null }}
        />
        <input
          type="range" min={1} max={3} step={0.01} value={zoom}
          style={{ width: '100%', marginTop: 14, accentColor: 'var(--green)' }}
          onChange={(e) => { setZoom(Number(e.target.value)); setOff((o) => clampOff(o)) }}
        />
        <div className="form-actions" style={{ marginTop: 14 }}>
          <button className="btn btn--ghost" onClick={onCancel}>ביטול</button>
          <button className="btn btn--primary" disabled={!ready} onClick={save}>✔ שמירה</button>
        </div>
      </div>
    </div>
  )
}

export default function Account() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user?.email) return
    fetchProfileMetas().then((m) => setAvatarUrl(m[user.email.toLowerCase()]?.avatar_url ?? null)).catch(() => {})
  }, [user?.email])

  async function onCropped(png: Blob) {
    if (!user || avatarBusy) return
    setCropFile(null); setAvatarBusy(true); setErr('')
    try {
      const url = await uploadMyAvatar(user.id, png)
      setAvatarUrl(url)
    } catch (e) { setErr(String((e as Error).message ?? e)) }
    finally { setAvatarBusy(false) }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(''); setOk(false)
    if (pw.length < 8) return setErr(t('err_pw_short'))
    if (pw !== pw2) return setErr(t('err_pw_match'))
    setBusy(true)
    try {
      await changeMyPassword(pw)
      setOk(true); setPw(''); setPw2('')
    } catch (e) {
      setErr(String((e as Error).message ?? e))
    } finally { setBusy(false) }
  }

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{t('account')}</div>
          <h1 className="page-title">{t('change_password')}</h1>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 460, padding: 24, marginBottom: 20 }}>
        <div className="avatar-edit">
          {avatarUrl
            ? <img className="avatar-edit__img" src={avatarUrl} alt="תמונת פרופיל" />
            : <Avatar name={user?.name ?? '?'} size={72} />}
          <div>
            <b>{user?.name}</b>
            <div><small className="mono">{user?.email}</small></div>
            <button className="btn btn--ghost" style={{ marginTop: 10 }} disabled={avatarBusy} onClick={() => fileRef.current?.click()}>
              {avatarBusy ? 'מעלה…' : avatarUrl ? '📷 החלפת תמונת פרופיל' : '📷 הוספת תמונת פרופיל'}
            </button>
            <input
              ref={fileRef} type="file" accept="image/*" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setCropFile(f); e.target.value = '' }}
            />
          </div>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 460, padding: 24 }}>
        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          <Field label={t('set_password')}>
            <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label={t('confirm_password')}>
            <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
          </Field>
          {err && <motion.p role="alert" className="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>⚠ {err}</motion.p>}
          {ok && <motion.p className="tag tag--green" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '8px 12px' }}>{t('password_changed')}</motion.p>}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <><span className="spin" /> {t('saving')}</> : t('update_password')}
          </Button>
        </form>
      </div>
      {cropFile && <AvatarCropDialog file={cropFile} onCancel={() => setCropFile(null)} onSave={onCropped} />}
    </div>
  )
}
