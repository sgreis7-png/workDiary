import { useEffect, useState } from 'react'
import { Button } from '../components/ui'
import { Loader } from '../components/Loader'
import { useI18n } from '../i18n'
import {
  createHandoverSystem, fetchHandoverSystems, reorderHandoverSystems, updateHandoverSystem,
} from './api'
import type { HandoverSystem } from './model'
import { ht } from './i18n'

// Admin-editable catalogue behind the handover form. Labels are copied into each saved
// handover, so renaming a system here never rewrites a document a customer signed.
export function HandoverSystemsAdmin() {
  const { lang } = useI18n()
  const [rows, setRows] = useState<HandoverSystem[] | null>(null)
  const [label, setLabel] = useState('')
  const [err, setErr] = useState('')

  const load = () => fetchHandoverSystems().then(setRows).catch((e) => setErr(String((e as Error).message ?? e)))
  useEffect(() => { load() }, [])

  if (rows === null) return <Loader full />

  const add = async () => {
    const l = label.trim()
    if (!l) return
    try {
      await createHandoverSystem(l, (rows.length + 1) * 10)
      setLabel(''); setErr(''); await load()
    } catch (e) { setErr(String((e as Error).message ?? e)) }
  }
  const rename = async (id: string, next: string) => {
    try { await updateHandoverSystem(id, { label: next }); await load() }
    catch (e) { setErr(String((e as Error).message ?? e)) }
  }
  const toggle = async (s: HandoverSystem) => {
    try { await updateHandoverSystem(s.id, { active: !s.active }); await load() }
    catch (e) { setErr(String((e as Error).message ?? e)) }
  }
  const move = async (i: number, dir: -1 | 1) => {
    const next = [...rows]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    setRows(next)
    try { await reorderHandoverSystems(next.map((s) => s.id)); await load() }
    catch (e) { setErr(String((e as Error).message ?? e)); await load() }
  }

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">Agrotop</div>
          <h1 className="page-title">{ht(lang, 'systems_title')}</h1>
        </div>
      </div>
      {err && <div className="alert">⚠ {err}</div>}
      <div className="rtable">
        {rows.map((s, i) => (
          <div key={s.id} className="rtable__row rtable__row--attendees">
            <input className="input" defaultValue={s.label} onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== s.label) rename(s.id, v)
            }} />
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={s.active} onChange={() => toggle(s)} />
              {ht(lang, 'systems_active')}
            </label>
            <span style={{ display: 'flex', gap: 4 }}>
              <button type="button" className="rtable__del" title="↑" onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="rtable__del" title="↓" onClick={() => move(i, 1)}>↓</button>
            </span>
          </div>
        ))}
        <div className="rtable__foot" style={{ display: 'flex', gap: 10 }}>
          <input className="input" value={label} placeholder={ht(lang, 'form_system')}
            onChange={(e) => setLabel(e.target.value)} />
          <Button variant="ghost" type="button" onClick={add}>{ht(lang, 'systems_add')}</Button>
        </div>
      </div>
    </div>
  )
}
