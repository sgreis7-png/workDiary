import { motion } from 'framer-motion'
import { CHECK_D } from './logoPaths'

/**
 * Branded loading animation: the official Agrotop checkmark wipes itself in
 * (left→right) on a loop inside a rotating ring. Use <Loader full /> for a
 * page/screen-filling spinner, or <Loader /> inline.
 */
export function Loader({ full = false, label }: { full?: boolean; label?: string }) {
  const mark = (
    <div className="loader__mark">
      <motion.span
        className="loader__ring"
        animate={{ rotate: 360 }}
        transition={{ duration: 1.1, ease: 'linear', repeat: Infinity }}
      />
      <svg width="52" height="38" viewBox="146 46 110 80" fill="none" aria-label="loading" role="img">
        <defs>
          <clipPath id="loader-check-wipe">
            <motion.rect
              x="146" y="46" height="80"
              initial={{ width: 0 }}
              animate={{ width: [0, 110, 110] }}
              transition={{ duration: 1.6, times: [0, 0.55, 1], ease: 'easeInOut', repeat: Infinity }}
            />
          </clipPath>
        </defs>
        <motion.path
          d={CHECK_D} fill="var(--green)" fillRule="evenodd"
          clipPath="url(#loader-check-wipe)"
          animate={{ opacity: [1, 1, 0.25] }}
          transition={{ duration: 1.6, times: [0, 0.7, 1], ease: 'easeInOut', repeat: Infinity }}
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
