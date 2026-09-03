import { useState } from 'react'
import { Button, Tag } from '../../components/ui'
import { useI18n } from '../../i18n'
import { useStore } from '../../store'
import { deleteTemplate, upsertTemplate } from '../../traffic/api'
import { tl } from '../../traffic/i18n'
import type { WbsTemplate } from '../../traffic/wbs'

/**
 * Admin screen for the WBS category templates that drive the traffic-light board's
 * per-category rows. Rarely visited, high consequence: a name here that doesn't match
 * the Gantt's summary task word-for-word silently breaks the schedule/diary rollup for
 * every project of that type — so the constraint is a permanent banner, not a tooltip.
 */
export default function WbsTemplates() {
  const { lang } = useI18n()
  const { wbsTemplates, reloadTemplates } = useStore()
  const types = [...new Set(['coop', ...wbsTemplates.map((t) => t.project_type)])]
  const [type, setType] = useState('coop')
  const [newType, setNewType] = useState('')
  const [err, setErr] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const rows = wbsTemplates.filter((t) => t.project_type === type).sort((a, b) => a.sort_order - b.sort_order)

  const save = (t: Partial<WbsTemplate> & { project_type: string; name_he: string; name_en: string; sort_order: number }) => {
    setErr('')
    return upsertTemplate(t).then(reloadTemplates).catch((e) => setErr(String((e as Error).message ?? e)))
  }
  // Diary entries and delivery rows may already point at this category by id — deleting it
  // out from under them is destructive in a way the active toggle isn't, so this confirms
  // first, the same way Users.tsx / DistLists.tsx / admin/Feedback.tsx confirm before their
  // own destructive deletes.
  const remove = (id: string) => {
    const msg = lang === 'he'
      ? 'למחוק את הקטגוריה? ייתכן שיומני עבודה ופריטי אספקה כבר משויכים אליה. אם רק רוצים להסתיר אותה מרשימות חדשות — בטלו את הסימון "פעיל" במקום למחוק.'
      : 'Delete this category? Diary entries and delivery rows may already reference it. To just hide it from new lists without breaking those links, clear "active" instead of deleting.'
    if (!window.confirm(msg)) return
    setErr('')
    deleteTemplate(id).then(reloadTemplates).catch((e) => setErr(String((e as Error).message ?? e)))
  }

  // A swap is two sequential writes; the unique constraint is on (project_type, name_he),
  // never on sort_order, so it cannot deadlock there — but the second write can still fail
  // (RLS, network) after the first succeeds. Either way, reload from the DB so the screen
  // never keeps showing an order the database doesn't have, and surface the failure.
  const move = (t: WbsTemplate, dir: -1 | 1) => {
    const other = rows.find((r) => r.sort_order === t.sort_order + dir)
    if (!other || busyId) return
    setErr('')
    setBusyId(t.id)
    Promise.all([
      upsertTemplate({ ...t, sort_order: other.sort_order }),
      upsertTemplate({ ...other, sort_order: t.sort_order }),
    ])
      .catch((e) => setErr(String((e as Error).message ?? e)))
      .finally(() => reloadTemplates().finally(() => setBusyId(null)))
  }

  const activeLabel = lang === 'he' ? 'פעיל' : 'active'

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">Admin</div>
          <h1 className="page-title">🧱 {tl(lang, 'wbs_title')}</h1>
        </div>
      </div>
      <div className="tl-hint tl-hint--strong">⚑ {tl(lang, 'wbs_hint')}</div>
      {err && <div className="alert">⚠ {err}</div>}

      <div className="tl-mode" style={{ margin: '12px 0' }}>
        {types.map((ty) => (
          <button key={ty} className={`btn ${ty === type ? 'btn--primary' : 'btn--ghost'}`} onClick={() => setType(ty)}>{ty}</button>
        ))}
        <input className="input" placeholder={tl(lang, 'wbs_type')} value={newType} onChange={(e) => setNewType(e.target.value)} style={{ maxWidth: 160 }} />
        <Button variant="ghost" type="button" disabled={!newType.trim()} onClick={() => { setType(newType.trim()); setNewType('') }}>+</Button>
      </div>

      <div className="rtable">
        <div className="rtable__head rtable__row--wbs">
          <span>#</span><span>{tl(lang, 'wbs_name_he')}</span><span>{tl(lang, 'wbs_name_en')}</span>
          <span>{tl(lang, 'cat_critical')}</span><span>{activeLabel}</span><span />
        </div>
        {rows.map((t, i) => (
          <div key={t.id} className={`rtable__row rtable__row--wbs ${t.critical ? 'is-critical' : ''}`}>
            <span className="wbs-order">
              <span className="mono">{t.sort_order}</span>
              <span className="wbs-order__btns">
                <button className="btn btn--quiet" disabled={i === 0 || !!busyId} aria-label={lang === 'he' ? 'הזז למעלה' : 'move up'}
                  onClick={() => move(t, -1)}>▲</button>
                <button className="btn btn--quiet" disabled={i === rows.length - 1 || !!busyId} aria-label={lang === 'he' ? 'הזז למטה' : 'move down'}
                  onClick={() => move(t, 1)}>▼</button>
              </span>
            </span>
            <input className="input" defaultValue={t.name_he} onBlur={(e) => e.target.value !== t.name_he && save({ ...t, name_he: e.target.value })} />
            <input className="input" defaultValue={t.name_en} onBlur={(e) => e.target.value !== t.name_en && save({ ...t, name_en: e.target.value })} />
            <span className="wbs-critical">
              <input type="checkbox" checked={t.critical} onChange={(e) => save({ ...t, critical: e.target.checked })} />
              {t.critical && <Tag tone="clay">{tl(lang, 'cat_critical')}</Tag>}
            </span>
            <input type="checkbox" checked={t.active} title={activeLabel} onChange={(e) => save({ ...t, active: e.target.checked })} />
            <button className="rtable__del" onClick={() => remove(t.id)} aria-label={tl(lang, 'delete')}>✕</button>
          </div>
        ))}
        {rows.length === 0 && <div className="tl-block__empty">{lang === 'he' ? 'אין קטגוריות עדיין' : 'No categories yet'}</div>}
      </div>

      <Button variant="ghost" type="button" style={{ marginTop: 10 }}
        onClick={() => save({ project_type: type, sort_order: (rows[rows.length - 1]?.sort_order ?? 0) + 1, name_he: 'קטגוריה חדשה', name_en: 'New category', critical: false })}>
        {tl(lang, 'wbs_add')}
      </Button>
    </div>
  )
}
