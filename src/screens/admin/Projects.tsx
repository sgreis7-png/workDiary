import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button, Tag, stagger, riseIn } from '../../components/ui'
import { useI18n } from '../../i18n'
import { PROJECTS, Project } from '../../data'

export default function Projects() {
  const { t } = useI18n()
  const [items, setItems] = useState<Project[]>([...PROJECTS])
  const [name, setName] = useState('')

  const add = () => {
    if (!name.trim()) return
    const p: Project = { id: Math.random().toString(36).slice(2), name: name.trim(), active: true }
    PROJECTS.push(p); setItems([...PROJECTS]); setName('')
  }
  const toggle = (id: string) => {
    const p = PROJECTS.find((x) => x.id === id); if (p) p.active = !p.active
    setItems([...PROJECTS])
  }

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{t('nav_admin')} · {t('admin_only')}</div>
          <h1 className="page-title">{t('nav_projects')}</h1>
        </div>
        <span className="count mono">{items.filter((p) => p.active).length} / {items.length} {t('active')}</span>
      </div>

      <div className="panel">
        <motion.div className="row-list" variants={stagger} initial="hidden" animate="show">
          {items.map((p) => (
            <motion.div key={p.id} className="row-item" variants={riseIn}>
              <span style={{ color: p.active ? 'var(--green)' : 'var(--ink-faint)', fontSize: 18 }}>◆</span>
              <div className="grow"><b>{p.name}</b></div>
              {p.active ? <Tag tone="green">{t('active')}</Tag> : <Tag tone="muted">{t('inactive')}</Tag>}
              <Button variant="ghost" onClick={() => toggle(p.id)}>{p.active ? t('inactive') : t('active')}</Button>
            </motion.div>
          ))}
        </motion.div>
        <div className="add-row">
          <input className="input" placeholder={t('nav_projects')} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <Button variant="primary" onClick={add}>＋ {t('add')}</Button>
        </div>
      </div>
    </div>
  )
}
