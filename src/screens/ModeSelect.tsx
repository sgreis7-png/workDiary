import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Logo } from '../components/Logo'
import { setMode } from '../defects/mode'
import { useDT } from '../defects/i18n'
import { useI18n } from '../i18n'

export default function ModeSelect() {
  const nav = useNavigate()
  const { dt } = useDT()
  const { dir } = useI18n()
  const CARDS = [
    { mode: 'work' as const, to: '/', icon: '▤', title: dt('mode_work'), desc: dt('mode_work_desc') },
    { mode: 'defects' as const, to: '/defects', icon: '🛡️', title: dt('mode_defects'), desc: dt('mode_defects_desc') },
  ]
  return (
    <div className="mode-select" dir={dir}>
      <div className="mode-select__brand"><Logo height={40} /></div>
      <h1>{dt('mode_q')}</h1>
      <div className="mode-select__cards">
        {CARDS.map((c, i) => (
          <motion.button
            key={c.mode}
            className="mode-card"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => { setMode(c.mode); nav(c.to) }}
          >
            <span className="mode-card__icon" aria-hidden>{c.icon}</span>
            <span className="mode-card__title">{c.title}</span>
            <span className="mode-card__desc">{c.desc}</span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
