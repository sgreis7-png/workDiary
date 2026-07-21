import { useState } from 'react'
import { Field } from '../../components/ui'
import {
  COOP_TYPE_LABELS, YES_NO_LABELS, RESPONSIBLE_LABELS, RESP_DOMAINS,
  PROJECT_OPEN_TITLE, RESP_MATRIX_TITLE, PROJECT_OPEN_FOOTNOTES,
  type CoopType, type Responsible,
} from '../../defects/model'
import type { Coop, CoopResponsibility } from '../../defects/api'
import { useDT, coopTypeLabel, responsibleLabel, yesNoLabel } from '../../defects/i18n'
import { TextCell } from './TextCell'

export function ProjectOpenTab({ coop, responsibilities, projectName, onCoop, onResponsibility }: {
  coop: Coop
  responsibilities: CoopResponsibility[]
  projectName: string
  onCoop: (patch: Partial<Coop>) => void
  onResponsibility: (row: CoopResponsibility) => void
}) {
  const { dt, lang } = useDT()
  const resp = (key: string): CoopResponsibility =>
    responsibilities.find((r) => r.domain_key === key)
    ?? { coop_id: coop.id, domain_key: key, responsible: null, external_who: null, notes: null }

  const yesNo = (field: 'has_heating' | 'has_cooling_pads' | 'has_tunnel_shutter', label: string) => (
    <Field label={label}>
      <select
        className="input" value={coop[field] ? 'yes' : 'no'}
        onChange={(e) => onCoop({ [field]: e.target.value === 'yes' } as Partial<Coop>)}
      >
        <option value="yes">{yesNoLabel(lang, true)}</option>
        <option value="no">{yesNoLabel(lang, false)}</option>
      </select>
    </Field>
  )

  return (
    <div className="gate-panel">
      <h2 className="gate-panel__title">{dt('po_title')}</h2>

      <div className="form-grid">
        <Field label={dt('po_project')}><input className="input" value={projectName} disabled /></Field>
        <Field label={dt('po_farm_count')}>
          <input
            className="input" type="number" min={1} value={coop.farm_coop_count ?? ''}
            onChange={(e) => onCoop({ farm_coop_count: e.target.value ? Number(e.target.value) : null })}
          />
        </Field>
        <Field label={dt('po_house_no')}>
          <TextCell value={coop.name} onCommit={(v) => v.trim() && onCoop({ name: v.trim() })} />
        </Field>
        <Field label={dt('po_type')}>
          <select
            className="input" value={coop.coop_type ?? ''}
            onChange={(e) => onCoop({ coop_type: (e.target.value || null) as CoopType | null })}
          >
            <option value="">—</option>
            {(Object.keys(COOP_TYPE_LABELS) as CoopType[]).map((k) => (
              <option key={k} value={k}>{coopTypeLabel(lang, k)}</option>
            ))}
          </select>
        </Field>
        <Field label={dt('po_supplier')}>
          <TextCell value={coop.equipment_supplier} onCommit={(v) => onCoop({ equipment_supplier: v || null })} />
        </Field>
        {yesNo('has_heating', dt('po_heating'))}
        {yesNo('has_cooling_pads', dt('po_pads'))}
        {yesNo('has_tunnel_shutter', dt('po_shutter'))}
        <Field label={dt('po_manager')}>
          <TextCell value={coop.execution_manager} onCommit={(v) => onCoop({ execution_manager: v || null })} />
        </Field>
        <Field label={dt('po_supervisor')}>
          <TextCell value={coop.field_supervisor} onCommit={(v) => onCoop({ field_supervisor: v || null })} />
        </Field>
        <Field label={dt('po_open_date')}>
          <input
            className="input" type="date" value={coop.opened_on ?? ''}
            onChange={(e) => onCoop({ opened_on: e.target.value || null })}
          />
        </Field>
      </div>

      <h2 className="gate-panel__title" style={{ marginTop: 34 }}>{dt('po_matrix_title')}</h2>
      <div className="gate-table-wrap">
        <table className="gate-table resp-table">
          <thead>
            <tr><th>{dt('po_domain')}</th><th>{dt('po_resp')}</th><th>{dt('po_external_who')}</th><th>{dt('po_notes')}</th></tr>
          </thead>
          <tbody>
            {RESP_DOMAINS.map((d) => {
              const r = resp(d.key)
              return (
                <tr key={d.key}>
                  <td className="gate-table__item">{d.label}</td>
                  <td>
                    <select
                      className="input" value={r.responsible ?? ''}
                      onChange={(e) => onResponsibility({ ...r, responsible: (e.target.value || null) as Responsible | null })}
                    >
                      <option value="">—</option>
                      {(Object.keys(RESPONSIBLE_LABELS) as Responsible[]).map((k) => (
                        <option key={k} value={k}>{responsibleLabel(lang, k)}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <TextCell value={r.external_who} onCommit={(v) => onResponsibility({ ...r, external_who: v || null })} />
                  </td>
                  <td>
                    <TextCell value={r.notes} onCommit={(v) => onResponsibility({ ...r, notes: v || null })} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {PROJECT_OPEN_FOOTNOTES.map((f, i) => <div key={i} className="gate-footnote">{f}</div>)}
    </div>
  )
}
