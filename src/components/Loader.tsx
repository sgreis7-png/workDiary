import { motion } from 'framer-motion'

/**
 * Branded loading animation: the Agrotop check-swoosh draws itself on a loop inside
 * a rotating ring. Use <Loader full /> for a page/screen-filling spinner, or
 * <Loader /> inline.
 */
export function Loader({ full = false, label }: { full?: boolean; label?: string }) {
  const mark = (
    <div className="loader__mark">
      <motion.span
        className="loader__ring"
        animate={{ rotate: 360 }}
        transition={{ duration: 1.1, ease: 'linear', repeat: Infinity }}
      />
      <svg width="48" height="48" viewBox="0 0 60 50" fill="none" aria-label="loading" role="img">
        <motion.path
          d="M150 9 C162 9 173 12 181 19 C170 14 159 14 150 19 C144 22 139 27 135 31 L128 24 L132 20 L135 25 C140 18 144 12 150 9 Z"
          transform="translate(-118 -4) scale(1.0)"
          fill="var(--green)"
          initial={{ pathLength: 0, opacity: 0.2 }}
          animate={{ pathLength: [0, 1, 1], opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.6, ease: 'easeInOut', repeat: Infinity }}
        />
      </svg>
    </div>
  )
  return (
    <div className={full ? 'loader loader--full' : 'loader'}>
      {mark}
      {label && <div className="loader__label">{label}</div>}
    </div>
  )
}
