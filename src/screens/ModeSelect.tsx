import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Logo } from '../components/Logo'
import { setMode } from '../defects/mode'

const CARDS = [
  {
    mode: 'work' as const, to: '/', icon: '▤',
    title: 'ניהול עבודה',
    desc: 'יומן עבודה יומי — רשומות, לוח שנה, דוחות וייצוא',
  },
  {
    mode: 'defects' as const, to: '/defects', icon: '🛡️',
    title: 'ניהול ליקויים',
    desc: 'תפיסת סיום שלב — צ׳קליסט שערים, יומן ליקויים וחתימות per־לול',
  },
]

export default function ModeSelect() {
  const nav = useNavigate()
  return (
    <div className="mode-select" dir="rtl">
      <div className="mode-select__brand"><Logo height={40} /></div>
      <h1>מה מנהלים היום?</h1>
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
