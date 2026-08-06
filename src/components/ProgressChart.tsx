import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'

/**
 * Progress-over-time line chart, one series per coop (לול), built from the
 * progress percentages workers already enter in the diary.
 *
 * Colors are a fixed-order categorical palette validated (light+dark surface,
 * CVD ΔE, chroma, contrast) with the dataviz validator — hues follow the coop
 * identity and are never cycled: with more than four coops the extra series
 * are not drawn with invented hues, the user picks which four to show.
 */
const SERIES = ['#277d23', '#1f6feb', '#c2541f', '#8250df'] as const
const MAX_SERIES = SERIES.length

export interface ProgressPoint { date: string; pct: number }
export interface ProgressSeries { name: string; points: ProgressPoint[] }

const W = 640, H = 260, PAD = { t: 16, r: 76, b: 28, l: 34 }

export function ProgressChart({ series }: { series: ProgressSeries[] }) {
  const { t } = useI18n()
  const [picked, setPicked] = useState<string[]>(() => series.slice(0, MAX_SERIES).map((s) => s.name))
  const [hoverX, setHoverX] = useState<number | null>(null)

  // stable identity → stable color: index in the FULL list, not the picked one,
  // so toggling a coop off does not repaint the survivors
  const colorOf = (name: string) => SERIES[series.findIndex((s) => s.name === name) % MAX_SERIES]

  const shown = series.filter((s) => picked.includes(s.name))
  const dates = useMemo(
    () => [...new Set(shown.flatMap((s) => s.points.map((p) => p.date)))].sort(),
    [shown],
  )

  if (!series.length || dates.length < 2) {
    return <div className="empty" style={{ padding: '28px 0' }}>{t('chart_need_data')}</div>
  }

  const x = (d: string) => PAD.l + (dates.indexOf(d) / (dates.length - 1)) * (W - PAD.l - PAD.r)
  const y = (pct: number) => PAD.t + (1 - pct / 100) * (H - PAD.t - PAD.b)

  const toggle = (name: string) => setPicked((p) => {
    if (p.includes(name)) return p.filter((n) => n !== name)
    if (p.length >= MAX_SERIES) return p // never draw a 5th hue
    return [...p, name]
  })

  const hoverDate = hoverX !== null
    ? dates[Math.round(((hoverX - PAD.l) / (W - PAD.l - PAD.r)) * (dates.length - 1))]
    : null
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })

  return (
    <div>
      {series.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {series.map((s) => {
            const on = picked.includes(s.name)
            return (
              <button
                key={s.name} type="button"
                className={`btn ${on ? '' : 'btn--ghost'}`}
                style={{
                  padding: '4px 10px', fontSize: 13,
                  background: on ? 'transparent' : undefined,
                  border: `1px solid ${on ? colorOf(s.name) : 'var(--panel-edge)'}`,
                  color: 'var(--ink)',
                }}
                onClick={() => toggle(s.name)}
              >
                <span style={{
                  display: 'inline-block', width: 10, height: 10, borderRadius: 3,
                  background: on ? colorOf(s.name) : 'var(--ink-faint)', marginInlineEnd: 6, verticalAlign: 'middle',
                }} />
                {s.name}
              </button>
            )
          })}
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', direction: 'ltr' }}
        role="img" aria-label={t('chart_aria')}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          setHoverX(((e.clientX - r.left) / r.width) * W)
        }}
        onMouseLeave={() => setHoverX(null)}
      >
        {/* recessive grid: 0/25/50/75/100 */}
        {[0, 25, 50, 75, 100].map((pct) => (
          <g key={pct}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(pct)} y2={y(pct)} stroke="var(--panel-edge)" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(pct) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)">{pct}</text>
          </g>
        ))}
        {/* x labels: first, middle, last */}
        {[0, Math.floor((dates.length - 1) / 2), dates.length - 1].map((i) => (
          <text key={i} x={x(dates[i])} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
            {fmtDate(dates[i])}
          </text>
        ))}

        {hoverDate && (
          <line x1={x(hoverDate)} x2={x(hoverDate)} y1={PAD.t} y2={H - PAD.b}
            stroke="var(--ink-faint)" strokeWidth={1} strokeDasharray="3 3" />
        )}

        {shown.map((s) => {
          const pts = [...s.points].sort((a, b) => a.date.localeCompare(b.date))
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date)},${y(p.pct)}`).join(' ')
          const last = pts[pts.length - 1]
          const c = colorOf(s.name)
          return (
            <g key={s.name}>
              <path d={d} fill="none" stroke={c} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {/* direct label at the line end — identity is never color-alone */}
              <text x={x(last.date) + 6} y={y(last.pct) + 4} fontSize={12} fontWeight={700} fill="var(--ink)">
                {s.name} · {last.pct}%
              </text>
              {hoverDate && (() => {
                const p = pts.find((q) => q.date === hoverDate)
                if (!p) return null
                return (
                  <g>
                    {/* 2px surface ring so overlapping markers stay separable */}
                    <circle cx={x(p.date)} cy={y(p.pct)} r={5} fill={c} stroke="var(--panel)" strokeWidth={2} />
                  </g>
                )
              })()}
            </g>
          )
        })}

        {hoverDate && (
          <g>
            <rect
              x={Math.min(x(hoverDate) + 8, W - PAD.r - 120)} y={PAD.t}
              width={118} height={16 + 15 * (shown.filter((s) => s.points.some((p) => p.date === hoverDate)).length)}
              rx={6} fill="var(--panel)" stroke="var(--panel-edge)"
            />
            <text x={Math.min(x(hoverDate) + 16, W - PAD.r - 112)} y={PAD.t + 13} fontSize={11} fill="var(--ink-2)">
              {fmtDate(hoverDate)}
            </text>
            {shown.filter((s) => s.points.some((p) => p.date === hoverDate)).map((s, i) => {
              const p = s.points.find((q) => q.date === hoverDate)!
              return (
                <text key={s.name} x={Math.min(x(hoverDate) + 16, W - PAD.r - 112)} y={PAD.t + 28 + i * 15}
                  fontSize={11} fill="var(--ink)">
                  <tspan fill={colorOf(s.name)}>●</tspan> {s.name}: {p.pct}%
                </text>
              )
            })}
          </g>
        )}
      </svg>
    </div>
  )
}
