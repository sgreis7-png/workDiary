import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Button, Field, Avatar } from '../components/ui'
import { useI18n } from '../i18n'
import { useAuth } from '../auth'
import { changeMyPassword } from '../api'
import { fetchProfileMetas, uploadMyAvatar } from '../lib/messages'

/** Downscale any picked image to a square 256px PNG blob. */
async function toAvatarPng(file: File): Promise<Blob> {
  const img = await createImageBitmap(file)
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const ctx = canvas.getContext('2d')!
  const s = Math.min(img.width, img.height)
  ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size)
  return new Promise((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error('canvas')), 'image/png'))
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
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user?.email) return
    fetchProfileMetas().then((m) => setAvatarUrl(m[user.email.toLowerCase()]?.avatar_url ?? null)).catch(() => {})
  }, [user?.email])

  async function onPickAvatar(f: File | undefined) {
    if (!f || !user || avatarBusy) return
    setAvatarBusy(true); setErr('')
    try {
      const png = await toAvatarPng(f)
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
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onPickAvatar(e.target.files?.[0])} />
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
    </div>
  )
}
