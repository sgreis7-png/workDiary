import { useMemo, useState } from 'react'
import { STATUS_LABELS, SEVERITY_LABELS, SIGNATURE_ROLES, type GateDef, type ItemStatus, type Severity, type SignatureRole } from '../../defects/model'
import { useDT, statusLabel, severityLabel } from '../../defects/i18n'
import { canSignGate, isGate6Unlocked, severityRequired, type ChecklistItemState } from '../../defects/rules'
import type { GateDefs } from '../../defects/defs'
import type { CoopBundle, ChecklistItem } from '../../defects/api'
import { SignaturePad } from './SignaturePad'
import { ConcessionDialog } from './ConcessionDialog'
import { TextCell } from './TextCell'
import { MicButton } from '../../components/MicButton'

export function GateTab({ gate, defs, bundle, onItem, onSign, onUnsign, onConcession, onGoDefects }: {
  gate: GateDef
  defs: GateDefs
  bundle: CoopBundle
  onItem: (itemNo: number, patch: Partial<ChecklistItem>) => void
  onSign: (role: SignatureRole, name: string, png: Blob) => void
  onUnsign: () => void
  onConcession: (defectId: string, reason: string, manager: { name: string; png: Blob }, supervisor: { name: string; png: Blob }) => void
  onGoDefects: () => void
}) {
  const { dt, lang } = useDT()
  const itemOf = (no: number) => bundle.items.find((i) => i.gate === gate.key && i.item_no === no)
  const state: ChecklistItemState[] = bundle.items.map((i) => ({ gate: i.gate, itemNo: i.item_no, status: i.status }))
  const gateSigs = bundle.signatures.filter((s) => s.gate === gate.key)
  const fullySigned = (['manager', 'supervisor'] as const).every((r) => gateSigs.some((s) => s.role === r))

  const concessionIds = useMemo(() => bundle.concessions.map((c) => ({ defectId: c.defect_id })), [bundle.concessions])
  const defectState = bundle.defects.map((d) => ({ id: d.id, gate: d.gate, itemNo: d.item_no, severity: d.severity, status: d.status }))
  const signVerdict = canSignGate(gate.key, state, defectState, concessionIds, defs)
  const gate6Lock = gate.key === 'gate6'
    ? isGate6Unlocked(bundle.signatures.map((s) => ({ gate: s.gate, role: s.role })), defectState)
    : { ok: true, reasons: [] }

  const majorsNeedingWaiver = bundle.defects.filter((d) =>
    d.gate === gate.key && d.status === 'open' && d.severity === 'major'
    && !bundle.concessions.some((c) => c.defect_id === d.id))
  const [waiverFor, setWaiverFor] = useState<string | null>(null)

  const locked = !gate6Lock.ok
  const frozen = fullySigned || locked

  return (
    <div className="gate-panel">
      <h2 className="gate-panel__title">{gate.title}</h2>
      {gate.subtitle && <p className="gate-panel__sub">{gate.subtitle}</p>}

      {locked && (
        <div className="alert">
          {dt('gate6_locked')} {gate6Lock.reasons.map((r, i) => <div key={i}>{r}</div>)}
        </div>
      )}

      <div className="gate-table-wrap">
        <table className="gate-table">
          <thead>
            <tr><th>#</th><th>{dt('col_item')}</th><th>{dt('col_status')}</th><th>{dt('col_severity')}</th><th>{dt('col_note')}</th><th>{dt('col_external')}</th></tr>
          </thead>
          <tbody>
            {gate.items.map((it) => {
              const row = itemOf(it.no)
              const status = row?.status ?? null
              const needSeverity = severityRequired(status) && !row?.severity
              return (
                <tr key={it.no} className={status === 'not_done' ? 'gate-row--bad' : ''}>
                  <td className="mono">{it.no}</td>
                  <td className="gate-table__item">
                    {it.text}
                    {row?.auto_na_reason && <span className="auto-na-chip" title={row.auto_na_reason}>אוטומטי: {row.auto_na_reason}</span>}
                  </td>
                  <td>
                    <select
                      className={`input status-select status--${status ?? 'none'}`}
                      value={status ?? ''} disabled={frozen}
                      onChange={(e) => onItem(it.no, { status: (e.target.value || null) as ItemStatus | null })}
                    >
                      <option value="">{dt('status_pending')}</option>
                      {(Object.keys(STATUS_LABELS) as ItemStatus[]).map((k) => (
                        <option key={k} value={k}>{statusLabel(lang, k)}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className={`input ${needSeverity ? 'input--invalid' : ''}`}
                      value={row?.severity ?? ''}
                      disabled={frozen || status !== 'not_done'}
                      onChange={(e) => onItem(it.no, { severity: (e.target.value || null) as Severity | null })}
                    >
                      <option value="">{status === 'not_done' ? dt('pick_severity') : '—'}</option>
                      {(Object.keys(SEVERITY_LABELS) as Severity[]).map((k) => (
                        <option key={k} value={k}>{severityLabel(lang, k)}</option>
                      ))}
                    </select>
                    {needSeverity && <small className="cell-warn">{dt('severity_required')}</small>}
                    {status === 'not_done' && (
                      <button className="btn btn--quiet cell-link" onClick={onGoDefects}>{dt('defect_opened_link')}</button>
                    )}
                  </td>
                  <td><TextCell value={row?.note ?? null} onCommit={(v) => onItem(it.no, { note: v || null })} disabled={frozen} /></td>
                  <td><TextCell value={row?.external_by ?? null} onCommit={(v) => onItem(it.no, { external_by: v || null })} disabled={frozen} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {gate.footnotes.map((f, i) => <div key={i} className="gate-footnote">{f}</div>)}

      {majorsNeedingWaiver.length > 0 && !fullySigned && (
        <div className="alert" style={{ marginTop: 18 }}>
          {dt('waiver_needed')}
          {majorsNeedingWaiver.map((d) => (
            <button key={d.id} className="btn btn--ghost" style={{ marginInlineStart: 8 }} onClick={() => setWaiverFor(d.id)}>
              {dt('waiver_for')}{d.seq}
            </button>
          ))}
        </div>
      )}

      <div className="gate-signs">
        {SIGNATURE_ROLES.map(({ key: role }) => {
          const label = role === 'manager' ? dt('sig_manager') : dt('sig_supervisor')
          const sig = gateSigs.find((s) => s.role === role)
          return (
            <div key={role} className="gate-sign">
              <div className="gate-sign__label">{label}</div>
              {sig ? (
                <div className="gate-sign__done">
                  {sig.signature_url && <img src={sig.signature_url} alt="" />}
                  <div><b>{sig.signer_name}</b><small>{new Date(sig.signed_at).toLocaleDateString('he-IL')}</small></div>
                </div>
              ) : (
                <SignBox
                  disabled={!signVerdict.ok || locked}
                  reasons={locked ? [] : signVerdict.reasons}
                  onSign={(name, png) => onSign(role, name, png)}
                />
              )}
            </div>
          )
        })}
      </div>
      {fullySigned && (
        <div className="gate-signed-note">
          {dt('gate_signed')}
          <button className="btn btn--quiet" onClick={onUnsign}>{dt('unsign_btn')}</button>
        </div>
      )}

      {waiverFor && (
        <ConcessionDialog
          defect={bundle.defects.find((d) => d.id === waiverFor)!}
          onClose={() => setWaiverFor(null)}
          onSubmit={(reason, manager, supervisor) => {
            onConcession(waiverFor, reason, manager, supervisor)
            setWaiverFor(null)
          }}
        />
      )}
    </div>
  )
}

function SignBox({ disabled, reasons, onSign }: {
  disabled: boolean
  reasons: string[]
  onSign: (name: string, png: Blob) => void
}) {
  const { dt } = useDT()
  const [name, setName] = useState('')
  const [png, setPng] = useState<Blob | null>(null)
  if (disabled) {
    return (
      <div className="gate-sign__blocked">
        {dt('cant_sign')}
        <ul>{reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      </div>
    )
  }
  return (
    <div className="gate-sign__pad">
      <div className="input-affix">
        <input className="input" placeholder={dt('sign_name_ph')} value={name} onChange={(e) => setName(e.target.value)} />
        <MicButton onText={(txt) => setName((r) => (r ? r + ' ' : '') + txt)} />
      </div>
      <SignaturePad onChange={setPng} />
      <button
        className="btn btn--primary" disabled={!name.trim() || !png}
        onClick={() => png && onSign(name.trim(), png)}
      >
        {dt('sign_btn')}
      </button>
    </div>
  )
}
