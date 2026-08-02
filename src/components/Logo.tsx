import { motion } from 'framer-motion'

/**
 * Agrotop wordmark, recreated as vector so it stays crisp at any size and can be
 * re-toned (white on the green header). Matches the official logo: italic
 * "Agro**top**", angular green checkmark over the o|t junction, serif-italic
 * "Agriculture Turnkey Projects" tagline. Official raster: /agrotop-logo.png.
 *
 * NOTE: the SVG is forced to LTR — otherwise an `dir="rtl"` ancestor (Hebrew UI)
 * reorders the Latin glyphs and pushes the wordmark off-canvas.
 */
export function Logo({
  height = 40,
  withTag = true,
  animated = false,
  tone = 'dark',
}: {
  height?: number
  withTag?: boolean
  animated?: boolean
  tone?: 'dark' | 'light'
}) {
  const w = height * (withTag ? 5.1 : 4.2)
  const h = height
  const light = tone === 'light'
  const wordA = light ? '#ffffff' : 'var(--ink)'
  const tagMain = light ? 'rgba(255,255,255,.7)' : 'var(--ink-3)'
  const tagBold = light ? '#ffffff' : 'var(--ink-2)'

  const Check = animated ? motion.path : 'path'
  const checkAnim = animated
    ? { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { duration: 0.7, ease: 'easeOut', delay: 0.15 } }
    : {}

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 255 50"
      fill="none"
      role="img"
      aria-label="Agrotop"
      style={{ direction: 'ltr' }}
    >
      {/* checkmark — drawn first so the letters overlap its dip, like the official mark */}
      <Check
        d="M82 15 L103 32 L172 3"
        stroke="var(--green)"
        strokeWidth={9}
        strokeLinecap="butt"
        strokeLinejoin="miter"
        {...(checkAnim as object)}
      />
      <text
        x="2" y="40" textAnchor="start"
        fontFamily="'Assistant', system-ui, sans-serif" fontWeight={800} fontSize="40" fontStyle="italic"
        fill={wordA} letterSpacing="-1"
        style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }}
      >
        Agro<tspan fill="var(--green)">top</tspan>
      </text>
      {withTag && (
        <text
          x="4" y="49" textAnchor="start"
          fontFamily="Georgia, 'Times New Roman', serif" fontWeight={500} fontSize="9" fontStyle="italic"
          fill={tagMain} letterSpacing="0.2"
          style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }}
        >
          Agriculture Turnkey <tspan fontWeight={800} fill={tagBold}>Projects</tspan>
        </text>
      )}
    </svg>
  )
}
