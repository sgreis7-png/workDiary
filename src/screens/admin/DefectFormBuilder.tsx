import { useEffect, useMemo, useState } from 'react'
import { Loader } from '../../components/Loader'
import { GATES, GATE_ORDER, type GateKey } from '../../defects/model'
import {
  fetchItemOverrides, saveItemOverride, deleteItemOverride,
  type ItemOverride,
} from '../../defects/defs'

/** בונה טופס — עריכת סעיפי הצ'קליסט של תפיסת סיום שלב (אדמין).
 *  שינוי נוסח, השבתה/החזרה של סעיפים קיימים, והוספת סעיפים חדשים לכל שער. */
export default function DefectFormBuilder() {
  const [overrides, setOverrides] = useState<ItemOverride[] | null>(null)
  const [gate, setGate] = useState<GateKey>('pre_pour')
  const [err, setErr] = useState('')
  const [newText, setNewText] = useState('')

  useEffect(() => {
    fetchItemOverrides().then(setOverrides).catch((e) => setErr(String(e.message ?? e)))
  }, [])

  const ovFor = (g: GateKey, no: number) => overrides?.find((o) => o.gate === g && o.item_no === no)

  const customs = useMemo(
    () => (overrides ?? []).filter((o) => o.gate === gate && o.is_custom).sort((a, b) => a.item_no - b.item_no),
    [overrides, gate],
  )

  async function upsert(o: ItemOverride) {
    setErr('')
    try {
      await saveItemOverride(o)
      setOverrides((prev) => {
        const rest = (prev ?? []).filter((x) => !(x.gate === o.gate && x.item_no === o.item_no))
        return [...rest, o]
      })
    } catch (e) { setErr(String((e as Error).message ?? e)) }
  }

  async function removeOverride(g: GateKey, no: number) {
    setErr('')
    try {
      await deleteItemOverride(g, no)
      setOverrides((prev) => (prev ?? []).filter((x) => !(x.gate === g && x.item_no === no)))
    } catch (e) { setErr(String((e as Error).message ?? e)) }
  }

  async function addCustom() {
    if (!newText.trim()) return
    const baseMax = Math.max(...GATES[gate].items.map((i) => i.no))
    const customMax = customs.length ? Math.max(...customs.map((c) => c.item_no)) : baseMax
    await upsert({ gate, item_no: Math.max(baseMax, customMax) + 1, text: newText.trim(), active: true, is_custom: true })
    setNewText('')
  }

  if (!overrides) return err ? <div className="page"><div className="alert">{err}</div></div> : <Loader label="טוען…" />

  return (
    <div className="page">
      <div className="page__head">
        <div>
          <div className="kicker">ניהול · תפיסת סיום שלב</div>
          <h1 className="page-title">בונה טופס ליקויים</h1>
        </div>
      </div>
      <p className="coop-intro">
        עריכת סעיפי הצ'קליסט לכל השערים: שינוי נוסח, השבתת סעיף או הוספת סעיף חדש.
        השינויים חלים על כל הלולים (חדשים וקיימים).
      </p>

      {err && <div className="alert">{err}</div>}

      <div className="coop-tabs" role="tablist">
        {GATE_ORDER.map((g) => (
          <button key={g} role="tab" aria-selected={gate === g}
            className={`coop-tab ${gate === g ? 'on' : ''}`} onClick={() => setGate(g)}>
            {GATES[g].shortName}
          </button>
        ))}
      </div>

      <div className="gate-panel">
        <h2 className="gate-panel__title">{GATES[gate].title}</h2>
        <div className="fb-list">
          {GATES[gate].items.map((it) => {
            const o = ovFor(gate, it.no)
            const disabled = o?.active === false
            const text = o?.text ?? it.text
            const changed = !!o?.text?.trim() && o.text !== it.text
            return (
              <div key={it.no} className={`fb-row ${disabled ? 'fb-row--off' : ''}`}>
                <span className="fb-row__no mono">{it.no}</span>
                <textarea
                  className="input fb-row__text" rows={2} defaultValue={text} disabled={disabled}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (v === it.text && !disabled) { if (o) removeOverride(gate, it.no); return }
                    if (v && v !== text) upsert({ gate, item_no: it.no, text: v, active: o?.active ?? true, is_custom: false })
                  }}
                />
                <div className="fb-row__ops">
                  {changed && <button className="btn btn--quiet" title="חזרה לנוסח המקורי" onClick={() => removeOverride(gate, it.no)}>↺ מקורי</button>}
                  <button
                    className={`btn ${disabled ? 'btn--primary' : 'btn--danger'}`}
                    onClick={() => upsert({ gate, item_no: it.no, text: o?.text ?? null, active: disabled, is_custom: false })}
                  >
                    {disabled ? 'הפעלה' : 'השבתה'}
                  </button>
                </div>
              </div>
            )
          })}

          {customs.map((o) => (
            <div key={o.item_no} className={`fb-row fb-row--custom ${!o.active ? 'fb-row--off' : ''}`}>
              <span className="fb-row__no mono">{o.item_no}</span>
              <textarea
                className="input fb-row__text" rows={2} defaultValue={o.text ?? ''} disabled={!o.active}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== o.text) upsert({ ...o, text: v }) }}
              />
              <div className="fb-row__ops">
                <span className="tag tag--green">נוסף</span>
                <button className="btn btn--danger" onClick={() => removeOverride(gate, o.item_no)}>מחיקה</button>
              </div>
            </div>
          ))}
        </div>

        <div className="fb-add">
          <input
            className="input" placeholder="נוסח סעיף חדש לשער הזה…" value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustom()}
          />
          <button className="btn btn--primary" disabled={!newText.trim()} onClick={addCustom}>✛ הוספת סעיף</button>
        </div>
      </div>
    </div>
  )
}
