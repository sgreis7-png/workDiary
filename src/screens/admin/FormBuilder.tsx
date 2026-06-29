import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button, Tag, stagger, riseIn } from '../../components/ui'
import { useI18n } from '../../i18n'
import { createField, deleteField, reorderFields } from '../../api'
import { useStore } from '../../store'
import type { FieldDef, FieldType } from '../../data'

const TYPES: FieldType[] = ['text', 'long_text', 'number', 'date', 'phone', 'select', 'photo']

export default function FormBuilder() {
  const { t, lang } = useI18n()
  const { fieldDefs, reloadFields } = useStore()
  const [fields, setFields] = useState<FieldDef[]>(fieldDefs)
  const [draft, setDraft] = useState({ label_he: '', label_en: '', type: 'text' as FieldType, required: false })
  const [busy, setBusy] = useState(false)

  useEffect(() => { setFields([...fieldDefs].sort((a, b) => a.sort_order - b.sort_order)) }, [fieldDefs])

  const label = (f: FieldDef) => (lang === 'he' ? f.label_he : f.label_en)

  const add = async () => {
    if ((!draft.label_he.trim() && !draft.label_en.trim()) || busy) return
    setBusy(true)
    try {
      await createField({
        key: (draft.label_en || draft.label_he).toLowerCase().replace(/\s+/g, '_').slice(0, 24),
        label_he: draft.label_he || draft.label_en,
        label_en: draft.label_en || draft.label_he,
        type: draft.type, required: draft.required, sort_order: (fields.length + 1) * 10,
      })
      await reloadFields()
      setDraft({ label_he: '', label_en: '', type: 'text', required: false })
    } finally { setBusy(false) }
  }

  const removeField = async (id: string) => { await deleteField(id); await reloadFields() }

  // move a field up/down, then persist the new order
  const move = async (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= fields.length || busy) return
    const next = [...fields]
    ;[next[index], next[j]] = [next[j], next[index]]
    setFields(next)
    setBusy(true)
    try { await reorderFields(next.map((f) => f.id)); await reloadFields() }
    finally { setBusy(false) }
  }

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">{t('nav_admin')} · {t('admin_only')}</div>
          <h1 className="page-title">{t('nav_fields')}</h1>
        </div>
        <span className="count mono">{fields.length} {lang === 'he' ? 'שדות' : 'fields'}</span>
      </div>

      <div className="panel" style={{ marginBottom: 22 }}>
        <motion.div className="row-list" variants={stagger} initial="hidden" animate="show">
          {fields.map((f, i) => (
            <motion.div key={f.id} className="row-item" variants={riseIn}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button className="btn btn--quiet" style={{ padding: '0 6px', lineHeight: 1.1 }}
                  disabled={i === 0 || busy} onClick={() => move(i, -1)} title="up" aria-label="move up">▲</button>
                <button className="btn btn--quiet" style={{ padding: '0 6px', lineHeight: 1.1 }}
                  disabled={i === fields.length - 1 || busy} onClick={() => move(i, 1)} title="down" aria-label="move down">▼</button>
              </div>
              <div className="grow">
                <b>{label(f)}</b> {f.required && <span style={{ color: 'var(--clay)' }}>*</span>}
                <div><small className="mono">{f.key}</small></div>
              </div>
              <span className="field-type">{f.type}</span>
              {f.required ? <Tag tone="clay">{t('required_field')}</Tag> : <Tag tone="muted">{t('optional')}</Tag>}
              <Button variant="danger" onClick={() => removeField(f.id)}>✕</Button>
            </motion.div>
          ))}
        </motion.div>

        <div className="add-row" style={{ flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: '1 1 140px' }} placeholder="תווית (עברית)" value={draft.label_he} onChange={(e) => setDraft({ ...draft, label_he: e.target.value })} />
          <input className="input" style={{ flex: '1 1 140px' }} placeholder="Label (English)" value={draft.label_en} onChange={(e) => setDraft({ ...draft, label_en: e.target.value })} />
          <select className="input" style={{ flex: '0 0 130px' }} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as FieldType })}>
            {TYPES.map((ty) => <option key={ty} value={ty}>{ty}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink-3)' }}>
            <input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} /> {t('required_field')}
          </label>
          <Button variant="primary" onClick={add} disabled={busy}>＋ {t('add')}</Button>
        </div>
      </div>
      <p className="count mono">{lang === 'he' ? 'השתמש בחיצים לשינוי סדר השדות' : 'Use the arrows to reorder fields'}</p>
    </div>
  )
}
