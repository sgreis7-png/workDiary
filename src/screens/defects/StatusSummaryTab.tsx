import { GATES, GATE_ORDER, type GateKey, STATUS_SUMMARY_TITLE, STATUS_SUMMARY_FOOTNOTE } from '../../defects/model'
import { gateSummary, type ChecklistItemState } from '../../defects/rules'
import type { GateDefs } from '../../defects/defs'
import type { ChecklistItem } from '../../defects/api'
import { useDT, gateShortName } from '../../defects/i18n'

export function StatusSummaryTab({ items, defs = GATES, onGoGate }: {
  items: ChecklistItem[]
  defs?: GateDefs
  onGoGate: (gate: GateKey) => void
}) {
  const { dt, lang } = useDT()
  const state: ChecklistItemState[] = items.map((i) => ({ gate: i.gate, itemNo: i.item_no, status: i.status }))
  return (
    <div className="gate-panel">
      <h2 className="gate-panel__title">{STATUS_SUMMARY_TITLE}</h2>
      <div className="gate-table-wrap">
        <table className="gate-table summary-table m-cards m-cards--stats">
          <thead>
            <tr>
              <th>{dt('sum_gate')}</th><th>{dt('sum_done')}</th><th>{dt('sum_not_done')}</th><th>{dt('sum_na')}</th><th>{dt('sum_pending')}</th>
              <th>{dt('sum_pct')}</th><th>{dt('sum_not_done_nos')}</th>
            </tr>
          </thead>
          <tbody>
            {GATE_ORDER.map((g) => {
              const s = gateSummary(g, state, defs)
              return (
                <tr key={g}>
                  <td>
                    <button className="summary-gate-link" onClick={() => onGoGate(g)}>{gateShortName(lang, g)}</button>
                  </td>
                  <td className="mono" data-label={dt('sum_done')}>{s.done}</td>
                  <td className={`mono ${s.notDone ? 'summary-bad' : ''}`} data-label={dt('sum_not_done')}>{s.notDone}</td>
                  <td className="mono" data-label={dt('sum_na')}>{s.na}</td>
                  <td className="mono" data-label={dt('sum_pending')}>{s.pending}</td>
                  <td className="mono" data-label={dt('sum_pct')}>{Math.round(s.pct * 100)}%</td>
                  <td data-label={dt('sum_not_done_nos')}>{s.notDoneNos.length ? s.notDoneNos.join(', ') : '—'}</td>
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
