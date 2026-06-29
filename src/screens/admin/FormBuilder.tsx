import { useState } from 'react'
import { motion, Reorder } from 'framer-motion'
import { Button, Tag } from '../../components/ui'
import { useI18n } from '../../i18n'
import { FIELD_DEFS, FieldDef, FieldType } from '../../data'

const TYPES: FieldType[] = ['text', 'long_text', 'number', 'date', 'phone', 'select', 'photo']

export default function FormBuilder() {
  const { t, lang } = useI18n()
  const [fields, setFields] = useState<FieldDef[]>([...FIELD_DEFS].sort((a, b) => a.sort_order - b.sort_order))
  const [draft, setDraft] = useState({ label_he: '', label_en: '', type: 'text' as FieldType, required: false })

  const label = (f: FieldDef) => (lang === 'he' ? f.label_he : f.label_en)
  const add = () => {
    if (!draft.label_he.trim() && !draft.label_en.trim()) return
    const f: FieldDef = {
      id: Math.random().toString(36).slice(2),
      key: (draft.label_en || draft.label_he).toLowerCase().replace(/\s+/g, '_').slice(0, 24),
      label_he: draft.label_he || draft.label_en, label_en: draft.label_en || draft.label_he,
      type: draft.type, required: draft.required, options: [], sort_order: (fields.length + 1) * 10, active: true,
    }
    FIELD_DEFS.push(f); setFields([...fields, f]); setDraft({ label_he: '', label_en: '', type: 'text', required: false })
  }
  const removeField = (id: string) => setFields((fs) => fs.filter((f) => f.id !== id))

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
        <Reorder.Group axis="y" values={fields} onReorder={setFields} className="row-list">
          {fields.map((f) => (
            <Reorder.Item key={f.id} value={f} className="row-item" whileDrag={{ scale: 1.01, boxShadow: 'var(--shadow-2)', backgroundColor: '#fff' }}>
              <span style={{ cursor: 'grab', color: 'var(--ink-faint)' }} aria-hidden>⠿</span>
              <div className="grow">
                <b>{label(f)}</b> {f.required && <span style={{ color: 'var(--clay)' }}>*</span>}
                <div><small className="mono">{f.key}</small></div>
              </div>
              <span className="field-type">{f.type}</span>
              {f.required ? <Tag tone="clay">{t('required_field')}</Tag> : <Tag tone="muted">{t('optional')}</Tag>}
              <Button variant="danger" onClick={() => removeField(f.id)}>✕</Button>
            </Reorder.Item>
          ))}
        </Reorder.Group>

        <div className="add-row" style={{ flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: '1 1 140px' }} placeholder="תווית (עברית)" value={draft.label_he} onChange={(e) => setDraft({ ...draft, label_he: e.target.value })} />
          <input className="input" style={{ flex: '1 1 140px' }} placeholder="Label (English)" value={draft.label_en} onChange={(e) => setDraft({ ...draft, label_en: e.target.value })} />
          <select className="input" style={{ flex: '0 0 130px' }} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as FieldType })}>
            {TYPES.map((ty) => <option key={ty} value={ty}>{ty}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink-3)' }}>
            <input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} /> {t('required_field')}
          </label>
          <Button variant="primary" onClick={add}>＋ {t('add')}</Button>
        </div>
      </div>
      <p className="count mono">↕ {lang === 'he' ? 'גרור לשינוי סדר השדות' : 'Drag to reorder fields'}</p>
    </div>
  )
}
