import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button, Tag, stagger, riseIn } from '../../components/ui'
import { useI18n } from '../../i18n'
import { createProject, setProjectActive } from '../../api'
import { useStore } from '../../store'

export default function Projects() {
  const { t } = useI18n()
  const { projects, reloadProjects } = useStore()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try { await createProject(name.trim()); await reloadProjects(); setName('') }
    finally { setBusy(false) }
  }
  const toggle = async (id: string, active: boolean) => {
    await setProjectActive(id, !active)
    await reloadProjects()
  }

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{t('nav_admin')} · {t('admin_only')}</div>
          <h1 className="page-title">{t('nav_projects')}</h1>
        </div>
        <span className="count mono">{projects.filter((p) => p.active).length} / {projects.length} {t('active')}</span>
      </div>

      <div className="panel">
        <motion.div className="row-list" variants={stagger} initial="hidden" animate="show">
          {projects.map((p) => (
            <motion.div key={p.id} className="row-item" variants={riseIn}>
              <span style={{ color: p.active ? 'var(--green)' : 'var(--ink-faint)', fontSize: 18 }}>◆</span>
              <div className="grow"><b>{p.name}</b></div>
              {p.active ? <Tag tone="green">{t('active')}</Tag> : <Tag tone="muted">{t('inactive')}</Tag>}
              <Button variant="ghost" onClick={() => toggle(p.id, p.active)}>{p.active ? t('inactive') : t('active')}</Button>
            </motion.div>
          ))}
        </motion.div>
        <div className="add-row">
          <input className="input" placeholder={t('nav_projects')} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <Button variant="primary" onClick={add} disabled={busy}>＋ {t('add')}</Button>
        </div>
      </div>
    </div>
  )
}
