import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { Loader } from '../../components/Loader'
import { fetchFeedback, setFeedbackStatus, deleteFeedback, feedbackPhotoUrl, type FeedbackReport } from '../../lib/feedback'

/** Admin view of user "דווח" reports (bugs / feature requests). */
export default function Feedback() {
  const { t, lang } = useI18n()
  const [rows, setRows] = useState<FeedbackReport[] | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')

  useEffect(() => {
    fetchFeedback().then(async (rs) => {
      setRows(rs)
      const withPhotos = rs.filter((r) => r.photo_path)
      const entries = await Promise.all(withPhotos.map(async (r) => [r.id, await feedbackPhotoUrl(r.photo_path!)] as const))
      setUrls(Object.fromEntries(entries.filter(([, u]) => u) as [string, string][]))
    }).catch((e) => setErr(String((e as Error).message ?? e)))
  }, [])

  async function onToggle(r: FeedbackReport) {
    const status = r.status === 'new' ? 'done' : 'new'
    setRows((rs) => (rs ?? []).map((x) => x.id === r.id ? { ...x, status } : x))
    try { await setFeedbackStatus(r.id, status) } catch (e) { setErr(String((e as Error).message ?? e)) }
  }

  async function onDelete(id: string) {
    if (!window.confirm(t('feedback_delete_confirm'))) return
    const prev = rows
    setRows((rs) => (rs ?? []).filter((x) => x.id !== id))
    try { await deleteFeedback(id) } catch (e) { setRows(prev); setErr(String((e as Error).message ?? e)) }
  }

  if (rows === null && !err) return <Loader label={t('loading')} />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">Agrotop · Admin</div>
          <h1 className="page-title">{t('feedback_admin_title')}</h1>
        </div>
        <span className="count mono">{rows?.length ?? 0}</span>
      </div>

      {err && <div className="alert">{err}</div>}

      {(rows ?? []).length === 0 ? (
        <div className="empty">{t('feedback_admin_empty')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(rows ?? []).map((r) => (
            <div key={r.id} className="coop-card" style={{ cursor: 'default', display: 'block', opacity: r.status === 'done' ? 0.6 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <b>{r.kind === 'bug' ? '🐞' : '💡'} {r.name ?? r.email}</b>
                <span style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>{r.email}</span>
                <span style={{ color: 'var(--ink-2)', fontSize: 12.5, marginInlineStart: 'auto' }}>
                  {new Date(r.created_at).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB')}
                </span>
              </div>
              <p style={{ margin: '8px 0', whiteSpace: 'pre-wrap' }}>{r.message}</p>
              {urls[r.id] && (
                <a href={urls[r.id]} target="_blank" rel="noreferrer">
                  <img src={urls[r.id]} alt="" style={{ maxWidth: 260, maxHeight: 180, borderRadius: 8, border: '1px solid var(--line)' }} />
                </a>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button className="btn btn--ghost" onClick={() => onToggle(r)}>
                  {r.status === 'new' ? `✓ ${t('feedback_mark_done')}` : t('feedback_mark_new')}
                </button>
                <button className="btn btn--ghost" style={{ color: 'var(--clay)' }} onClick={() => onDelete(r.id)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
