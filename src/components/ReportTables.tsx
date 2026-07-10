import { CSSProperties } from 'react'
import { Button } from './ui'
import { useI18n } from '../i18n'
import { MISSING_REASONS, MissingRow, ProgressRow } from '../lib/reportTables'

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

export function ProgressTable({ rows, onChange }: { rows: ProgressRow[]; onChange: (r: ProgressRow[]) => void }) {
  const { t } = useI18n()
  const upd = (i: number, patch: Partial<ProgressRow>) =>
    onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  return (
    <div className="rtable">
      <div className="rtable__head rtable__row--progress">
        <span>{t('col_task')}</span><span>{t('col_pct')}</span><span>{t('col_remarks')}</span><span />
      </div>
      {rows.map((r, i) => (
        <div key={i} className="rtable__row rtable__row--progress">
          <input className="input" value={r.task} placeholder={t('col_task')}
            onChange={(e) => upd(i, { task: e.target.value })} />
          <PctSlider value={r.pct} onChange={(v) => upd(i, { pct: v })} />
          <input className="input" value={r.remarks} placeholder={t('col_remarks')}
            onChange={(e) => upd(i, { remarks: e.target.value })} />
          <button type="button" className="rtable__del" title={t('remove')}
            onClick={() => onChange(rows.filter((_, k) => k !== i))}>✕</button>
        </div>
      ))}
      <div className="rtable__foot">
        <Button variant="ghost" type="button" onClick={() => onChange([...rows, { task: '', pct: 0, remarks: '' }])}>
          ＋ {t('add_row')}
        </Button>
      </div>
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
