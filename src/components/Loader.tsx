import { motion } from 'framer-motion'

/**
 * Branded loading animation: the Agrotop checkmark draws itself on a loop inside
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
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-label="loading" role="img">
        <motion.path
          d="M10 26 L21 36 L39 11"
          stroke="var(--green)"
          strokeWidth={7}
          strokeLinecap="butt"
          strokeLinejoin="miter"
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
