import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * Collapsible dashboard section. The header stays informative when closed —
 * a summary chip (count, status) rides next to the title — and each section
 * remembers its open state per user in localStorage.
 */
export function Section({ id, icon, title, summary, tone, defaultOpen = true, children }: {
  id: string
  icon: string
  title: string
  /** short value shown in the header (e.g. a count) — visible open or closed */
  summary?: ReactNode
  /** paints the summary chip; 'clay' marks needs-attention */
  tone?: 'clay' | 'green'
  defaultOpen?: boolean
  children: ReactNode
}) {
  const key = `dash_sec_${id}`
  const [open, setOpen] = useState(() => {
    const saved = localStorage.getItem(key)
    return saved === null ? defaultOpen : saved === '1'
  })
  const toggle = () => setOpen((o) => { localStorage.setItem(key, o ? '0' : '1'); return !o })

  return (
    <section className="panel dash-sec">
      <button type="button" className="dash-sec__head" onClick={toggle} aria-expanded={open}>
        <span className="dash-sec__icon" aria-hidden>{icon}</span>
        <span className="dash-sec__title">{title}</span>
        {summary !== undefined && summary !== null && (
          <span className={`tag ${tone === 'clay' ? 'tag--clay' : tone === 'green' ? 'tag--green' : 'tag--muted'}`}>{summary}</span>
        )}
        <motion.span className="dash-sec__chev" animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.18 }} aria-hidden>
          ▾
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="dash-sec__body">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
