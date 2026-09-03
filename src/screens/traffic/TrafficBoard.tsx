import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Loader } from '../../components/Loader'
import { TrafficDot } from '../../components/TrafficDot'
import { useI18n } from '../../i18n'
import { fetchSnapshot, fetchSnapshots, fetchTrafficLight, type SnapshotMeta } from '../../traffic/api'
import { AXES, sortForBoard, type ProjectLight } from '../../traffic/model'
import { axisLabel, tl } from '../../traffic/i18n'
import '../../styles/traffic.css'

/**
 * The board: an executive's ten-second scan of every active project, worst color first.
 * Lives at /traffic behind the `traffic_light` permission (see App.tsx).
 */
export default function TrafficBoard() {
  const { lang } = useI18n()
  const [params, setParams] = useSearchParams()
  const snapId = params.get('snapshot')
  const [rows, setRows] = useState<ProjectLight[] | null>(null)
  const [snaps, setSnaps] = useState<SnapshotMeta[]>([])
  const [takenAt, setTakenAt] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [liveFailed, setLiveFailed] = useState(false)

  useEffect(() => { fetchSnapshots().then(setSnaps).catch(() => setSnaps([])) }, [])

  useEffect(() => {
    let alive = true
    setRows(null); setErr(''); setLiveFailed(false)
    const load = async () => {
      if (snapId) {
        const s = await fetchSnapshot(snapId)
        if (alive) { setRows(s.payload); setTakenAt(s.taken_at) }
        return
      }
      try {
        const live = await fetchTrafficLight()
        if (alive) { setRows(live); setTakenAt(null) }
      } catch (e) {
        // Live calculation refused or unavailable (e.g. the migration behind it isn't
        // deployed yet) — fall back to the most recent snapshot, flagged, rather than
        // leaving the executive with a spinner or a crash.
        const latest = (await fetchSnapshots(1).catch(() => []))[0]
        if (!latest) throw e
        const s = await fetchSnapshot(latest.id)
        if (alive) { setRows(s.payload); setTakenAt(s.taken_at); setLiveFailed(true) }
      }
    }
    load().catch((e) => alive && setErr(String((e as Error).message ?? e)))
    return () => { alive = false }
  }, [snapId])

  const sorted = useMemo(() => (rows ?? []).slice().sort(sortForBoard), [rows])
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }) : '—')
  // Captured once rather than read fresh on every render — a live Date.now() call in the
  // render body is an unstable value in the output (and the repo's lint rule for it).
  const [now] = useState(() => Date.now())
  const staleDays = (d: string | null) => (d ? Math.round((now - Date.parse(d)) / 86_400_000) : 99)

  if (err) {
    return (
      <div className="page">
        <div className="alert">⚠ {err.toLowerCase().includes('forbidden') || err.toLowerCase().includes('permission') ? tl(lang, 'error_forbidden') : err}</div>
      </div>
    )
  }
  if (!rows) return <Loader label={tl(lang, 'loading')} />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{tl(lang, 'board_kicker')}</div>
          <h1 className="page-title">🚦 {tl(lang, 'board_title')}</h1>
        </div>
        <div className="tl-mode">
          <button className={`btn ${snapId ? 'btn--ghost' : 'btn--primary'}`} onClick={() => setParams({})}>{tl(lang, 'board_live')}</button>
          <select
            className="input"
            value={snapId ?? ''}
            onChange={(e) => setParams(e.target.value ? { snapshot: e.target.value } : {})}
            disabled={snaps.length === 0}
            aria-label={tl(lang, 'board_snapshot')}
          >
            <option value="">{tl(lang, 'board_snapshot')}…</option>
            {snaps.map((s) => <option key={s.id} value={s.id}>{new Date(s.taken_at).toLocaleDateString('he-IL')}</option>)}
          </select>
        </div>
      </div>

      {liveFailed && <div className="alert">⚠ {tl(lang, 'board_live_failed')} {takenAt ? `(${new Date(takenAt).toLocaleDateString('he-IL')})` : ''}</div>}
      {takenAt && !liveFailed && <div className="tl-hint">{tl(lang, 'board_snapshot_of')}{new Date(takenAt).toLocaleString('he-IL')}</div>}

      {sorted.length === 0 ? <div className="empty">{tl(lang, 'board_empty')}</div> : (
        <div className="tl-board">
          <div className="tl-head" aria-hidden>
            <span /><span>{tl(lang, 'board_col_project')}</span><span>{AXES.map((a) => axisLabel(lang, a).slice(0, 4)).join(' · ')}</span>
            <span>{tl(lang, 'board_col_due')}</span><span>{tl(lang, 'board_col_action')}</span><span>{tl(lang, 'board_col_last')}</span>
          </div>
          {sorted.map((p) => {
            const delta = p.due.delta_days
            return (
              <Link
                key={p.project_id}
                to={`/traffic/${p.project_id}${snapId ? `?snapshot=${snapId}` : ''}`}
                className={`tl-row tl-row--${p.color}`}
              >
                <TrafficDot color={p.color} size="lg" title={tl(lang, `color_${p.color}` as never)} />
                <div>
                  <div className="tl-row__name">{p.name}</div>
                  <div className="tl-row__manager">{p.manager ?? '—'}</div>
                </div>
                <div className="tl-axes" role="group" aria-label={AXES.map((a) => axisLabel(lang, a)).join(', ')}>
                  {AXES.map((a) => (
                    <span key={a}>
                      <TrafficDot color={p.axes[a].color} title={`${axisLabel(lang, a)}: ${p.axes[a].reason}`} />
                      {axisLabel(lang, a).slice(0, 4)}
                    </span>
                  ))}
                </div>
                {p.due.contract == null
                  ? <div className="tl-delta tl-delta--none">{tl(lang, 'board_no_contract')}</div>
                  : <div className={`tl-delta ${delta != null && delta > 0 ? 'tl-delta--bad' : ''}`}>{delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta}`}</div>}
                <div className="tl-action">{p.action_line}</div>
                <div className={`tl-last ${p.color === 'gray' && staleDays(p.last_entry_on) > 2 ? 'tl-last--stale' : ''}`}>
                  {p.last_entry_on ? fmtDate(p.last_entry_on) : tl(lang, 'board_no_report')}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
