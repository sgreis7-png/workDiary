import { motion } from 'framer-motion'
import { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'ghost' | 'quiet' | 'danger'
export function Button({ variant = 'primary', children, ...rest }: { variant?: Variant; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <motion.button
      className={`btn btn--${variant}`}
      whileTap={{ scale: 0.96 }}
      whileHover={{ y: -1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      {...(rest as object)}
    >
      {children}
    </motion.button>
  )
}

export function Tag({ children, tone = 'ink' }: { children: ReactNode; tone?: 'ink' | 'green' | 'clay' | 'amber' | 'muted' }) {
  return <span className={`tag tag--${tone}`}>{children}</span>
}

const WEATHER: Record<string, { icon: string; tone: 'amber' | 'muted' | 'ink' | 'green' }> = {
  שמש: { icon: '☀', tone: 'amber' }, Sunny: { icon: '☀', tone: 'amber' },
  מעונן: { icon: '☁', tone: 'muted' }, Cloudy: { icon: '☁', tone: 'muted' },
  גשם: { icon: '☂', tone: 'ink' }, Rain: { icon: '☂', tone: 'ink' },
  רוח: { icon: '≋', tone: 'green' }, Wind: { icon: '≋', tone: 'green' },
}
export function WeatherChip({ value }: { value: string }) {
  const w = WEATHER[value] ?? { icon: '◔', tone: 'muted' as const }
  return <span className={`weather weather--${w.tone}`}><span aria-hidden>{w.icon}</span>{value}</span>
}

export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join('')
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>{initials}</span>
}

export function RoleBadge({ role, labels }: { role: 'admin' | 'member'; labels: { admin: string; member: string } }) {
  return <span className={`role role--${role}`}>{role === 'admin' ? labels.admin : labels.member}</span>
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}{hint && <span className="field__hint">{hint}</span>}</span>
      {children}
    </label>
  )
}

export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.05 } },
}
export const riseIn = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
}
