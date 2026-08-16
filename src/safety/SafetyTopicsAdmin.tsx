import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button, stagger, riseIn } from '../components/ui'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { createSafetyTopic, fetchSafetyTopics, reorderSafetyTopics, updateSafetyTopic } from './api'
import type { SafetyTopic } from './model'
import { st } from './i18n'

/**
 * Admin screen for the briefing topics catalogue. No delete — a topic is
 * deactivated instead, since old forms keep their labels regardless (topics
 * are copied into `safety_forms.topics` at save time, not referenced live).
 */
export function SafetyTopicsAdmin() {
  const { lang } = useI18n()
  const [topics, setTopics] = useState<SafetyTopic[] | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = () => fetchSafetyTopics().then(setTopics)

  useEffect(() => { reload() }, [])

  const editLabel = (id: string, label: string) => {
    setTopics((prev) => (prev ?? []).map((t) => (t.id === id ? { ...t, label } : t)))
  }

  const saveLabel = async (id: string, label: string) => {
    await updateSafetyTopic(id, { label })
  }

  const toggleActive = async (t: SafetyTopic) => {
    if (busy) return
    setTopics((prev) => (prev ?? []).map((x) => (x.id === t.id ? { ...x, active: !x.active } : x)))
    setBusy(true)
    try { await updateSafetyTopic(t.id, { active: !t.active }) }
    finally { setBusy(false) }
  }

  const move = async (index: number, dir: -1 | 1) => {
    const list = topics ?? []
    const j = index + dir
    if (j < 0 || j >= list.length || busy) return
    const next = [...list]
    ;[next[index], next[j]] = [next[j], next[index]]
    setTopics(next)
    setBusy(true)
    try { await reorderSafetyTopics(next.map((t) => t.id)); await reload() }
    finally { setBusy(false) }
  }

  const add = async () => {
    if (!newLabel.trim() || busy) return
    setBusy(true)
    try {
      const maxSort = (topics ?? []).reduce((m, t) => Math.max(m, t.sort_order), 0)
      await createSafetyTopic(newLabel.trim(), maxSort + 10)
      await reload()
      setNewLabel('')
    } finally { setBusy(false) }
  }

  if (topics === null) return <Loader full />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{lang === 'he' ? 'ניהול' : 'Admin'}</div>
          <h1 className="page-title">{st(lang, 'topics_title')}</h1>
        </div>
        <span className="count mono">{topics.length}</span>
      </div>

      <div className="panel" style={{ marginBottom: 22 }}>
        <motion.div className="row-list" variants={stagger} initial="hidden" animate="show">
          {topics.map((t, i) => (
            <motion.div key={t.id} className="row-item" variants={riseIn}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button className="btn btn--quiet" style={{ padding: '0 6px', lineHeight: 1.1 }}
                  disabled={i === 0 || busy} onClick={() => move(i, -1)} title="up" aria-label="move up">▲</button>
                <button className="btn btn--quiet" style={{ padding: '0 6px', lineHeight: 1.1 }}
                  disabled={i === topics.length - 1 || busy} onClick={() => move(i, 1)} title="down" aria-label="move down">▼</button>
              </div>
              <input
                className="input grow"
                value={t.label}
                onChange={(e) => editLabel(t.id, e.target.value)}
                onBlur={(e) => saveLabel(t.id, e.target.value)}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink-3)' }}>
                <input type="checkbox" checked={t.active} disabled={busy} onChange={() => toggleActive(t)} />
                {st(lang, 'topics_active')}
              </label>
            </motion.div>
          ))}
        </motion.div>

        <div className="add-row" style={{ flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: '1 1 240px' }}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          />
          <Button variant="primary" onClick={add} disabled={busy}>{st(lang, 'topics_add')}</Button>
        </div>
      </div>
    </div>
  )
}
