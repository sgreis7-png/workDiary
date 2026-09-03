import { Button } from './ui'
import { useI18n } from '../i18n'
import { tl } from '../traffic/i18n'
import type { CrewRow } from '../lib/crewRows'

const OTHER = '__other__'

export function CrewTable({ rows, onChange, contractors }: {
  rows: CrewRow[]; onChange: (r: CrewRow[]) => void; contractors: string[]
}) {
  const { lang } = useI18n()
  const upd = (i: number, patch: Partial<CrewRow>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  return (
    <div className="rtable">
      <div className="rtable__head rtable__row--crew">
        <span>{tl(lang, 'form_crew_contractor')}</span><span>{tl(lang, 'form_crew_workers')}</span><span>{tl(lang, 'form_crew_hours')}</span><span />
      </div>
      {rows.map((r, i) => {
        const known = contractors.includes(r.contractor)
        const free = !known && r.contractor !== ''
        return (
          <div key={i} className="rtable__row rtable__row--crew">
            {contractors.length > 0 && !free ? (
              <select className="input" value={known ? r.contractor : ''}
                onChange={(e) => upd(i, { contractor: e.target.value === OTHER ? ' ' : e.target.value })}>
                <option value="">—</option>
                {contractors.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value={OTHER}>{tl(lang, 'form_crew_free')}</option>
              </select>
            ) : (
              <input className="input" value={r.contractor.trim()} placeholder={tl(lang, 'form_crew_contractor')}
                onChange={(e) => upd(i, { contractor: e.target.value })} />
            )}
            <input className="input" type="number" inputMode="numeric" min={0} value={r.workers}
              onChange={(e) => upd(i, { workers: Math.max(0, Number(e.target.value) || 0) })} />
            <input className="input" type="number" inputMode="numeric" min={0} max={24} value={r.hours}
              onChange={(e) => upd(i, { hours: Math.max(0, Number(e.target.value) || 0) })} />
            <button type="button" className="rtable__del" onClick={() => onChange(rows.filter((_, k) => k !== i))}>✕</button>
          </div>
        )
      })}
      <div className="rtable__foot">
        <Button variant="ghost" type="button" onClick={() => onChange([...rows, { contractor: '', workers: 0, hours: 8 }])}>
          {tl(lang, 'form_crew_add')}
        </Button>
      </div>
    </div>
  )
}
