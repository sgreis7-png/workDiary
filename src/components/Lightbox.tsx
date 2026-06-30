import { motion } from 'framer-motion'

// Full-screen photo viewer. Click backdrop or ✕ to close; pinch/scroll to zoom.
export function Lightbox({ photos, index, onClose, onIndex }: {
  photos: string[]; index: number; onClose: () => void; onIndex: (i: number) => void
}) {
  const multi = photos.length > 1
  const go = (d: number) => onIndex((index + d + photos.length) % photos.length)
  return (
    <motion.div className="lightbox" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <button className="lightbox__close" onClick={onClose} aria-label="close">✕</button>
      {multi && <button className="lightbox__nav lightbox__prev" onClick={(e) => { e.stopPropagation(); go(-1) }} aria-label="prev">‹</button>}
      <img src={photos[index]} alt="" onClick={(e) => e.stopPropagation()} />
      {multi && <button className="lightbox__nav lightbox__next" onClick={(e) => { e.stopPropagation(); go(1) }} aria-label="next">›</button>}
      {multi && <div className="lightbox__count" onClick={(e) => e.stopPropagation()}>{index + 1} / {photos.length}</div>}
    </motion.div>
  )
}
