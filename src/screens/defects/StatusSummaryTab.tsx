import { GATES, GATE_ORDER, type GateKey, STATUS_SUMMARY_TITLE, STATUS_SUMMARY_FOOTNOTE } from '../../defects/model'
import { gateSummary, type ChecklistItemState } from '../../defects/rules'
import type { GateDefs } from '../../defects/defs'
import type { ChecklistItem } from '../../defects/api'

export function StatusSummaryTab({ items, defs = GATES, onGoGate }: {
  items: ChecklistItem[]
  defs?: GateDefs
  onGoGate: (gate: GateKey) => void
}) {
  const state: ChecklistItemState[] = items.map((i) => ({ gate: i.gate, itemNo: i.item_no, status: i.status }))
  return (
    <div className="gate-panel">
      <h2 className="gate-panel__title">{STATUS_SUMMARY_TITLE}</h2>
      <div className="gate-table-wrap">
        <table className="gate-table summary-table">
          <thead>
            <tr>
              <th>שער</th><th>בוצע</th><th>לא בוצע</th><th>לא רלוונטי</th><th>טרם</th>
              <th>% הושלם</th><th>סעיפים שסומנו "לא בוצע" (מספרי סעיף)</th>
            </tr>
          </thead>
          <tbody>
            {GATE_ORDER.map((g) => {
              const s = gateSummary(g, state, defs)
              return (
                <tr key={g}>
                  <td>
                    <button className="summary-gate-link" onClick={() => onGoGate(g)}>{GATES[g].shortName}</button>
                  </td>
                  <td className="mono">{s.done}</td>
                  <td className={`mono ${s.notDone ? 'summary-bad' : ''}`}>{s.notDone}</td>
                  <td className="mono">{s.na}</td>
                  <td className="mono">{s.pending}</td>
                  <td className="mono">{Math.round(s.pct * 100)}%</td>
                  <td>{s.notDoneNos.length ? s.notDoneNos.join(', ') : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="gate-footnote">{STATUS_SUMMARY_FOOTNOTE}</div>
    </div>
  )
}
