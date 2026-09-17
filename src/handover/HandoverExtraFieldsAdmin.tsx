import { useEffect, useState } from 'react'
import { Button } from '../components/ui'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import { useAuth } from '../auth'
import {
  createHandoverExtraField, deleteHandoverExtraField, DUPLICATE_LABEL, fetchHandoverExtraFields,
  reorderHandoverExtraFields, updateHandoverExtraField,
} from './api'
import { canManageCatalogueRow, type HandoverExtraFieldDef } from './model'
import { ht } from './i18n'

// Admin-editable catalogue behind the handover form's extra header fields. Labels are copied
// into each saved handover, so renaming a field here never rewrites a document a customer signed.
export function HandoverExtraFieldsAdmin() {
  const { lang } = useI18n()
  const { user, isAdmin } = useAuth()
  const [rows, setRows] = useState<HandoverExtraFieldDef[] | null>(null)
  const [label, setLabel] = useState('')
  const [err, setErr] = useState('')

  const errMessage = (e: unknown) => {
    const msg = (e as Error).message
    if (msg === DUPLICATE_LABEL) return ht(lang, 'form_dup_label')
    if (msg === 'forbidden') return ht(lang, 'form_no_delete')
    return String(msg ?? e)
  }

  const load = () => fetchHandoverExtraFields().then(setRows).catch((e) => setErr(String((e as Error).message ?? e)))
  useEffect(() => { load() }, [])

  if (rows === null) return <Loader full />

  const add = async () => {
    const l = label.trim()
    if (!l) return
    try {
      await createHandoverExtraField(l, (rows.length + 1) * 10)
      setLabel(''); setErr(''); await load()
    } catch (e) { setErr(errMessage(e)); await load() }
  }
  const rename = async (id: string, next: string) => {
    try { await updateHandoverExtraField(id, { label: next }); await load() }
    catch (e) { setErr(errMessage(e)); await load() }
  }
  const toggle = async (f: HandoverExtraFieldDef) => {
    try { await updateHandoverExtraField(f.id, { active: !f.active }); await load() }
    catch (e) { setErr(errMessage(e)); await load() }
  }
  const move = async (i: number, dir: -1 | 1) => {
    const next = [...rows]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    setRows(next)
    try { await reorderHandoverExtraFields(next.map((f) => f.id)); await load() }
    catch (e) { setErr(errMessage(e)); await load() }
  }
  const remove = async (f: HandoverExtraFieldDef) => {
    if (!window.confirm(`${ht(lang, 'form_remove')}: ${f.label}?`)) return
    try { await deleteHandoverExtraField(f.id); await load() }
    catch (e) { setErr(errMessage(e)); await load() }
  }

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">Agrotop</div>
          <h1 className="page-title">{ht(lang, 'fields_title')}</h1>
        </div>
      </div>
      {err && <div className="alert">⚠ {err}</div>}
      <div className="rtable">
        {rows.map((f, i) => (
          <div key={f.id} className="rtable__row rtable__row--attendees">
            <input className="input" defaultValue={f.label} onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== f.label) rename(f.id, v)
            }} />
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={f.active} onChange={() => toggle(f)} />
              {ht(lang, 'systems_active')}
            </label>
            <span style={{ display: 'flex', gap: 4 }}>
              <button type="button" className="rtable__del" title="↑" onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="rtable__del" title="↓" onClick={() => move(i, 1)}>↓</button>
              {canManageCatalogueRow(f, user?.id, isAdmin) ? (
                <button type="button" className="rtable__del" title={ht(lang, 'form_remove')} onClick={() => remove(f)}>✕</button>
              ) : (
                <span className="rtable__del" title={ht(lang, 'form_builtin_lock')} aria-hidden="true">🔒</span>
              )}
            </span>
          </div>
        ))}
        <div className="rtable__foot" style={{ display: 'flex', gap: 10 }}>
          <input className="input" value={label} placeholder={ht(lang, 'form_extra_label')}
            onChange={(e) => setLabel(e.target.value)} />
          <Button variant="ghost" type="button" onClick={add}>{ht(lang, 'fields_add')}</Button>
        </div>
      </div>
    </div>
  )
}
