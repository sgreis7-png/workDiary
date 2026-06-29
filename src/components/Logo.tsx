import { motion } from 'framer-motion'

/**
 * Agrotop wordmark, recreated as vector so it stays crisp at any size and in the
 * email/header. Replace with the official PNG at /agrotop-logo.png when supplied.
 */
export function Logo({ height = 40, withTag = true, animated = false }: { height?: number; withTag?: boolean; animated?: boolean }) {
  const w = height * (withTag ? 5.1 : 4.2)
  const h = height
  const Check = animated ? motion.path : 'path'
  const checkAnim = animated
    ? { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { duration: 0.7, ease: 'easeOut', delay: 0.15 } }
    : {}
  return (
    <svg width={w} height={h} viewBox="0 0 255 50" fill="none" role="img" aria-label="Agrotop">
      {/* check swoosh */}
      <Check
        d="M150 9 C162 9 173 12 181 19 C170 14 159 14 150 19 C144 22 139 27 135 31 L128 24 L132 20 L135 25 C140 18 144 12 150 9 Z"
        fill="var(--green)"
        {...(checkAnim as object)}
      />
      <text x="2" y="40" fontFamily="'Assistant', system-ui, sans-serif" fontWeight={800} fontSize="40" fontStyle="italic" fill="var(--ink)" letterSpacing="-1">
        Agro<tspan fill="var(--green)">top</tspan>
      </text>
      {withTag && (
        <text x="4" y="49" fontFamily="'Assistant', system-ui, sans-serif" fontWeight={500} fontSize="9.5" fill="var(--ink-3)" letterSpacing="0.5">
          Agriculture Turnkey <tspan fontWeight={800} fill="var(--ink-2)">Projects</tspan>
        </text>
      )}
    </svg>
  )
}
