import { CSSProperties, Fragment, ReactNode, useState } from 'react'
import { Button } from './ui'
import { useI18n } from '../i18n'
import { CoopReport, MISSING_REASONS, MissingRow, ProgressRow, defaultBdRows, defaultCoop } from '../lib/reportTables'

/** 0–100 slider rendered as a filled bar; big thumb on touch, slim bar on desktop. */
export function PctSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="pct">
      <input
        type="range" className="pct__range" min={0} max={100} step={5} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--p': `${value}%` } as CSSProperties}
        aria-valuetext={`${value}%`}
      />
      <span className="pct__num">{value}%</span>
    </div>
  )
}

export function ProgressTable({ rows, onChange, injectAfter, injected }: {
  rows: ProgressRow[]; onChange: (r: ProgressRow[]) => void
  /** Extra fixed row (e.g. the ציוד BD launcher) rendered after this row index. */
  injectAfter?: number; injected?: ReactNode
}) {
  const { t } = useI18n()
  const upd = (i: number, patch: Partial<ProgressRow>) =>
    onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  return (
    <div className="rtable">
      <div className="rtable__head rtable__row--progress">
        <span>{t('col_task')}</span><span>{t('col_pct')}</span><span>{t('col_remarks')}</span><span />
      </div>
      {rows.length === 0 && injected}
      {rows.map((r, i) => (
        <Fragment key={i}>
        <div className="rtable__row rtable__row--progress">
          <input className="input" value={r.task} placeholder={t('col_task')}
            onChange={(e) => upd(i, { task: e.target.value })} />
          <PctSlider value={r.pct} onChange={(v) => upd(i, { pct: v })} />
          <input className="input" value={r.remarks} placeholder={t('col_remarks')}
            onChange={(e) => upd(i, { remarks: e.target.value })} />
          <button type="button" className="rtable__del" title={t('remove')}
            onClick={() => onChange(rows.filter((_, k) => k !== i))}>✕</button>
        </div>
        {i === (injectAfter ?? -2) && injected}
        </Fragment>
      ))}
      <div className="rtable__foot">
        <Button variant="ghost" type="button" onClick={() => onChange([...rows, { task: '', pct: 0, remarks: '' }])}>
          ＋ {t('add_row')}
        </Button>
      </div>
    </div>
  )
}

/** Per-coop progress reports: named blocks, each with an overall slider + task
    table + the ציוד BD sub-form. The foreman adds one block per coop (לול). */
export function CoopReports({ coops, onChange }: { coops: CoopReport[]; onChange: (c: CoopReport[]) => void }) {
  const { t, lang } = useI18n()
  const [bdOpen, setBdOpen] = useState<number | null>(null)
  const upd = (i: number, patch: Partial<CoopReport>) =>
    onChange(coops.map((c, k) => (k === i ? { ...c, ...patch } : c)))
  const remove = (i: number) => {
    if (!window.confirm(`${t('confirm_remove_coop')}\n\n${coops[i].name}`)) return
    onChange(coops.filter((_, k) => k !== i))
  }
  const openBd = (i: number) => {
    // older drafts stored coops without a bd table — seed it on first open
    if (coops[i].bd.length === 0) upd(i, { bd: defaultBdRows(lang) })
    setBdOpen(i)
  }
  // The BD launcher sits between "חשמל ובקרה" and "גמרים ומסירה"; if the user
  // renamed/removed those rows it falls back to the end of the table.
  const bdSlot = (rows: ProgressRow[]) => {
    const at = rows.findIndex((r) => r.task.includes('חשמל') || r.task.includes('Electrical'))
    return at >= 0 ? at : rows.length - 1
  }
  const bdAvg = (c: CoopReport) =>
    c.bd.length ? Math.round(c.bd.reduce((s, r) => s + r.pct, 0) / c.bd.length) : 0

  return (
    <div className="coops">
      {coops.map((c, i) => (
        <div key={i} className="coop-card">
          <div className="coop-card__head">
            <input className="input coop-card__name" value={c.name}
              onChange={(e) => upd(i, { name: e.target.value })} />
            <Button variant="danger" type="button" onClick={() => remove(i)}>{t('remove')}</Button>
          </div>
          <div className="house-pct">
            <span className="house-pct__label">{t('house_pct')}</span>
            <PctSlider value={c.pct} onChange={(v) => upd(i, { pct: v })} />
          </div>
          <ProgressTable rows={c.rows} onChange={(rows) => upd(i, { rows })}
            injectAfter={bdSlot(c.rows)}
            injected={
              <div className="rtable__row rtable__row--progress rtable__row--bd">
                <span className="rtable__bdlabel">{t('bd_field')}</span>
                <span className="vbar"><span className="vbar__track"><span className="vbar__fill" style={{ width: `${bdAvg(c)}%` }} /></span><b>{bdAvg(c)}%</b></span>
                <Button variant="ghost" type="button" onClick={() => openBd(i)}>📋 {t('bd_open')}</Button>
                <span />
              </div>
            }
          />
        </div>
      ))}
      <Button variant="ghost" type="button"
        onClick={() => onChange([...coops, defaultCoop(lang, coops.length + 1)])}>
        ＋ {t('add_coop')}
      </Button>

      {bdOpen !== null && coops[bdOpen] && (
        <div className="modal-backdrop" onClick={() => setBdOpen(null)}>
          <div className="modal bd-modal" onClick={(e) => e.stopPropagation()} dir={lang === 'he' ? 'rtl' : 'ltr'}>
            <h3 className="bd-modal__title">{t('bd_field')} — {coops[bdOpen].name}</h3>
            <ProgressTable rows={coops[bdOpen].bd} onChange={(bd) => upd(bdOpen, { bd })} />
            <div className="bd-modal__foot">
              <Button variant="primary" type="button" onClick={() => setBdOpen(null)}>{t('done')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function MissingTable({ rows, onChange }: { rows: MissingRow[]; onChange: (r: MissingRow[]) => void }) {
  const { t, lang } = useI18n()
  const upd = (i: number, patch: Partial<MissingRow>) =>
    onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  return (
    <div className="rtable">
      {rows.length > 0 && (
        <div className="rtable__head rtable__row--missing">
          <span>{t('col_code')}</span><span>{t('col_desc')}</span><span>{t('col_amount')}</span><span>{t('col_reason')}</span><span />
        </div>
      )}
      {rows.map((r, i) => (
        <div key={i} className="rtable__row rtable__row--missing">
          <input className="input" value={r.code} placeholder={t('col_code')}
            onChange={(e) => upd(i, { code: e.target.value })} />
          <input className="input" value={r.desc} placeholder={t('col_desc')}
            onChange={(e) => upd(i, { desc: e.target.value })} />
          <input className="input" type="number" inputMode="numeric" value={r.amount} placeholder={t('col_amount')}
            onChange={(e) => upd(i, { amount: e.target.value })} />
          <select className="input" value={r.reason}
            onChange={(e) => upd(i, { reason: e.target.value })}>
            <option value="">—</option>
            {MISSING_REASONS.map((o) => <option key={o.id} value={o.id}>{o.id} — {o[lang]}</option>)}
          </select>
          <button type="button" className="rtable__del" title={t('remove')}
            onClick={() => onChange(rows.filter((_, k) => k !== i))}>✕</button>
        </div>
      ))}
      <div className="rtable__foot">
        <Button variant="ghost" type="button" onClick={() => onChange([...rows, { code: '', desc: '', amount: '', reason: '' }])}>
          ＋ {t('add_row')}
        </Button>
      </div>
    </div>
  )
}
