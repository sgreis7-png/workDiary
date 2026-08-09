import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

// Full-screen photo viewer. Click backdrop or ✕ to close; pinch/scroll to zoom.
export function Lightbox({ photos, index, onClose, onIndex }: {
  photos: string[]; index: number; onClose: () => void; onIndex: (i: number) => void
}) {
  const multi = photos.length > 1
  const go = (d: number) => onIndex((index + d + photos.length) % photos.length)

  // Read the handlers through a ref: they are inline arrows at the call sites, so binding the
  // listener to them directly would tear it down and rebuild it on every render.
  const act = useRef({ onClose, go })
  useEffect(() => { act.current = { onClose, go } })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The nav buttons are placed with physical `left`/`right`, so the arrows match what the
      // viewer sees whichever direction the page runs in.
      if (e.key === 'Escape') act.current.onClose()
      else if (e.key === 'ArrowLeft') act.current.go(-1)
      else if (e.key === 'ArrowRight') act.current.go(1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <motion.div className="lightbox" role="dialog" aria-modal="true" aria-label="תצוגת תמונה"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <button className="lightbox__close" onClick={onClose} aria-label="close">✕</button>
      {multi && <button className="lightbox__nav lightbox__prev" onClick={(e) => { e.stopPropagation(); go(-1) }} aria-label="prev">‹</button>}
      <img src={photos[index]} alt="" onClick={(e) => e.stopPropagation()} />
      {multi && <button className="lightbox__nav lightbox__next" onClick={(e) => { e.stopPropagation(); go(1) }} aria-label="next">›</button>}
      {multi && <div className="lightbox__count" onClick={(e) => e.stopPropagation()}>{index + 1} / {photos.length}</div>}
    </motion.div>
  )
}
