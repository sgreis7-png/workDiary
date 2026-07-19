import { useState } from 'react'
import {
  GATES, GATE_ORDER, SEVERITY_LABELS, DEFECT_STATUS_LABELS,
  DEFECT_LOG_TITLE, DEFECT_LOG_GOLDEN_RULE,
  type GateKey, type Severity, type DefectStatus,
} from '../../defects/model'
import { itemLabel, type GateDefs } from '../../defects/defs'
import { useDT, severityLabel, defectStatusLabel, gateShortName } from '../../defects/i18n'
import type { Defect } from '../../defects/api'

function TextCell({ value, onCommit, placeholder }: { value: string | null; onCommit: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value ?? '')
  return (
    <input
      className="input" value={v} placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (v !== (value ?? '')) onCommit(v) }}
    />
  )
}

export function DefectLogTab({ defects, defs = GATES, onAdd, onPatch, onRemove }: {
  defects: Defect[]
  defs?: GateDefs
  onAdd: (gate: GateKey) => void
  onPatch: (id: string, patch: Partial<Defect>) => void
  onRemove: (id: string) => void
}) {
  const { dt, lang } = useDT()
  const [newGate, setNewGate] = useState<GateKey>('gate1')
  return (
    <div className="gate-panel">
      <h2 className="gate-panel__title">{DEFECT_LOG_TITLE}</h2>

      <div className="coop-new" style={{ marginBottom: 16 }}>
        <select className="input" value={newGate} onChange={(e) => setNewGate(e.target.value as GateKey)}>
          {GATE_ORDER.map((g) => <option key={g} value={g}>{gateShortName(lang, g)}</option>)}
        </select>
        <button className="btn btn--primary" onClick={() => onAdd(newGate)}>{dt('dl_add')}</button>
      </div>

      {defects.length === 0 ? (
        <div className="empty">{dt('dl_empty')}</div>
      ) : (
        <div className="gate-table-wrap">
          <table className="gate-table defect-table">
            <thead>
              <tr>
                <th>{dt('dl_no')}</th><th>{dt('sum_gate')}</th><th>{dt('dl_item')}</th><th>{dt('dl_desc')}</th><th>{dt('dl_severity')}</th>
                <th>{dt('dl_assignee')}</th><th>{dt('dl_due')}</th><th>{dt('dl_status')}</th><th>{dt('dl_closed_on')}</th>
                <th>{dt('dl_closure')}</th><th></th>
              </tr>
            </thead>
            <tbody>
              {defects.map((d) => (
                <tr key={d.id} className={d.status === 'open' && (d.severity === 'critical' || d.severity === 'major') ? 'gate-row--bad' : ''}>
                  <td className="mono">{d.seq}</td>
                  <td>
                    <select
                      className="input" value={d.gate}
                      onChange={(e) => onPatch(d.id, { gate: e.target.value as GateKey, item_no: null })}
                    >
                      {GATE_ORDER.map((g) => <option key={g} value={g}>{gateShortName(lang, g)}</option>)}
                    </select>
                  </td>
                  <td>
                    <select
                      className="input" value={d.item_no ?? ''}
                      onChange={(e) => onPatch(d.id, { item_no: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">—</option>
                      {defs[d.gate].items.map((it) => (
                        <option key={it.no} value={it.no}>{itemLabel(defs, d.gate, it.no)}</option>
                      ))}
                    </select>
                  </td>
                  <td><TextCell value={d.description} onCommit={(v) => onPatch(d.id, { description: v || null })} /></td>
                  <td>
                    <select
                      className="input" value={d.severity ?? ''}
                      onChange={(e) => onPatch(d.id, { severity: (e.target.value || null) as Severity | null })}
                    >
                      <option value="">—</option>
                      {(Object.keys(SEVERITY_LABELS) as Severity[]).map((k) => (
                        <option key={k} value={k}>{severityLabel(lang, k)}</option>
                      ))}
                    </select>
                  </td>
                  <td><TextCell value={d.assignee} onCommit={(v) => onPatch(d.id, { assignee: v || null })} /></td>
                  <td>
                    <input
                      className="input" type="date" value={d.due_date ?? ''}
                      onChange={(e) => onPatch(d.id, { due_date: e.target.value || null })}
                    />
                  </td>
                  <td>
                    <select
                      className={`input status-select status--${d.status}`} value={d.status}
                      onChange={(e) => {
                        const status = e.target.value as DefectStatus
                        onPatch(d.id, {
                          status,
                          closed_on: status === 'closed' ? (d.closed_on ?? new Date().toISOString().slice(0, 10)) : null,
                        })
                      }}
                    >
                      {(Object.keys(DEFECT_STATUS_LABELS) as DefectStatus[]).map((k) => (
                        <option key={k} value={k}>{defectStatusLabel(lang, k)}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="input" type="date" value={d.closed_on ?? ''} disabled={d.status !== 'closed'}
                      onChange={(e) => onPatch(d.id, { closed_on: e.target.value || null })}
                    />
                  </td>
                  <td><TextCell value={d.closure_note} onCommit={(v) => onPatch(d.id, { closure_note: v || null })} /></td>
                  <td>
                    <button className="btn btn--quiet" title={dt('dl_delete')} onClick={() => onRemove(d.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="gate-footnote">{DEFECT_LOG_GOLDEN_RULE}</div>
    </div>
  )
}
