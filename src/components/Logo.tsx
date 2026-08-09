import { motion } from 'framer-motion'
import { AGRO_D, CHECK_D, LOGO_VIEWBOX_FULL, LOGO_VIEWBOX_WORD, TOP_D } from './logoPaths'

/**
 * Official Agrotop logo as exact vectors (traced from the brand PNG — see
 * logoPaths.ts): italic "Agro" + green "top", green checkmark over the o|t
 * junction, serif-italic tagline. Vector so it stays crisp at any size and can
 * be re-toned white for the dark-green sidebar.
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
  /** 'light' = on a permanently dark panel (the login art). 'shell' = on the sidebar,
   *  which follows the theme, so its colours come from tokens rather than being fixed. */
  tone?: 'dark' | 'light' | 'shell'
}) {
  const ratio = withTag ? 285 / 164 : 285 / 140
  const light = tone === 'light'
  const shell = tone === 'shell'
  const word = shell ? 'var(--shell-ink)' : light ? '#ffffff' : 'var(--ink)'
  const tag = shell ? 'var(--shell-faint)' : light ? 'rgba(255,255,255,.85)' : 'var(--ink-2)'
  // brand green from the official file; the brighter theme green reads better on a dark ground
  const green = shell ? 'var(--shell-logo-green)' : light ? 'var(--green)' : '#008540'

  const Word = animated ? motion.g : 'g'
  const Check = animated ? motion.path : 'path'
  const wordAnim = animated
    ? { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: 'easeOut' } }
    : {}
  const checkAnim = animated
    ? {
        initial: { scale: 0, opacity: 0 },
        animate: { scale: 1, opacity: 1 },
        transition: { type: 'spring', stiffness: 260, damping: 16, delay: 0.35 },
        style: { transformBox: 'fill-box', transformOrigin: '50% 100%' } as React.CSSProperties,
      }
    : {}

  return (
    <svg
      width={height * ratio}
      height={height}
      viewBox={withTag ? LOGO_VIEWBOX_FULL : LOGO_VIEWBOX_WORD}
      fill="none"
      role="img"
      aria-label="Agrotop"
      style={{ direction: 'ltr' }}
    >
      <Word {...(wordAnim as object)}>
        <path d={AGRO_D} fill={word} fillRule="evenodd" />
        <path d={TOP_D} fill={green} fillRule="evenodd" />
        {withTag && (
          <text
            x="14" y="207" textAnchor="start"
            fontFamily="Georgia, 'Times New Roman', serif" fontStyle="italic" fontSize="15"
            fill={tag} textLength="235" lengthAdjust="spacingAndGlyphs"
            style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }}
          >
            Agriculture Turnkey <tspan fontWeight={700}>Projects</tspan>
          </text>
        )}
      </Word>
      <Check d={CHECK_D} fill={green} fillRule="evenodd" {...(checkAnim as object)} />
    </svg>
  )
}
