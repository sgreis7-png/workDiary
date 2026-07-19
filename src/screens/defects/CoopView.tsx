import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader } from '../../components/Loader'
import { useStore } from '../../store'
import {
  fetchCoopBundle, updateCoop, saveResponsibility, upsertChecklistItem,
  createDefect, updateDefect, deleteDefect, signGate, removeGateSignatures, createConcession,
  type CoopBundle, type ChecklistItem, type Coop, type CoopResponsibility, type Defect,
} from '../../defects/api'
import { GATES, GATE_ORDER, type GateKey, type ItemStatus } from '../../defects/model'
import { loadGateDefs, type GateDefs } from '../../defects/defs'
import { usePerms } from '../../lib/usePerms'
import { autoNaItems, type CoopConfig } from '../../defects/rules'
import { ProjectOpenTab } from './ProjectOpenTab'
import { StatusSummaryTab } from './StatusSummaryTab'
import { GateTab } from './GateTab'
import { DefectLogTab } from './DefectLogTab'

type TabKey = 'project_open' | 'summary' | GateKey | 'defect_log'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'project_open', label: 'פתיחת פרויקט' },
  { key: 'summary', label: 'ריכוז סטטוס' },
  ...GATE_ORDER.map((g) => ({ key: g as TabKey, label: GATES[g].shortName })),
  { key: 'defect_log', label: 'יומן ליקויים' },
]

export function coopConfig(coop: Coop, resp: CoopResponsibility[]): CoopConfig {
  return {
    coopType: coop.coop_type,
    hasHeating: coop.has_heating,
    hasCoolingPads: coop.has_cooling_pads,
    hasTunnelShutter: coop.has_tunnel_shutter,
    responsibilities: Object.fromEntries(resp.map((r) => [r.domain_key, r.responsible ?? undefined])),
  }
}

export default function CoopView() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { projectName } = useStore()
  const { canEdit } = usePerms()
  const readOnly = !canEdit('defects')
  const [bundle, setBundle] = useState<CoopBundle | null>(null)
  const [defs, setDefs] = useState<GateDefs>(GATES)
  const [tab, setTab] = useState<TabKey>('project_open')
  const [err, setErr] = useState('')

  useEffect(() => {
    fetchCoopBundle(id).then(setBundle).catch((e) => setErr(String(e.message ?? e)))
    loadGateDefs().then(setDefs)
  }, [id])

  const fail = useCallback((e: unknown) => setErr(String((e as Error).message ?? e)), [])

  // ---------- mutators (optimistic local state + fire-and-await api) ----------

  const patchCoop = useCallback(async (patch: Partial<Coop>) => {
    if (!bundle) return
    const next = { ...bundle.coop, ...patch }
    setBundle((b) => b && { ...b, coop: next })
    try {
      await updateCoop(bundle.coop.id, patch)
      await applyAutoNa(next, bundle.responsibilities)
    } catch (e) { fail(e) }
  }, [bundle]) // eslint-disable-line react-hooks/exhaustive-deps

  const patchResponsibility = useCallback(async (row: CoopResponsibility) => {
    if (!bundle) return
    setBundle((b) => {
      if (!b) return b
      const rest = b.responsibilities.filter((r) => r.domain_key !== row.domain_key)
      return { ...b, responsibilities: [...rest, row] }
    })
    try {
      await saveResponsibility(row)
      const rest = bundle.responsibilities.filter((r) => r.domain_key !== row.domain_key)
      await applyAutoNa(bundle.coop, [...rest, row])
    } catch (e) { fail(e) }
  }, [bundle]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Config-driven "לא רלוונטי": auto-set on items the user hasn't touched (or that were auto-set before). */
  async function applyAutoNa(coop: Coop, resp: CoopResponsibility[]) {
    setBundle((prev) => {
      if (!prev) return prev
      const autos = autoNaItems(coopConfig(coop, resp))
      const autoKey = (g: string, n: number) => `${g}#${n}`
      const autoMap = new Map(autos.map((a) => [autoKey(a.gate, a.itemNo), a.reason]))
      const items = [...prev.items]
      const writes: ChecklistItem[] = []
      // set NA on newly-auto items that are untouched
      for (const a of autos) {
        const existing = items.find((i) => i.gate === a.gate && i.item_no === a.itemNo)
        if (!existing) {
          const row: ChecklistItem = { coop_id: coop.id, gate: a.gate, item_no: a.itemNo, status: 'na', severity: null, note: null, external_by: null, auto_na_reason: a.reason }
          items.push(row); writes.push(row)
        } else if (existing.status === null || existing.auto_na_reason) {
          const row = { ...existing, status: 'na' as ItemStatus, auto_na_reason: a.reason }
          items[items.indexOf(existing)] = row; writes.push(row)
        }
      }
      // clear NA from items that were auto-set but no longer apply
      for (const i of items) {
        if (i.auto_na_reason && !autoMap.has(autoKey(i.gate, i.item_no))) {
          const row = { ...i, status: null, auto_na_reason: null }
          items[items.indexOf(i)] = row; writes.push(row)
        }
      }
      Promise.all(writes.map((w) => upsertChecklistItem(w))).catch(fail)
      return { ...prev, items }
    })
  }

  const patchItem = useCallback(async (gate: GateKey, itemNo: number, patch: Partial<ChecklistItem>) => {
    if (!bundle) return
    const existing = bundle.items.find((i) => i.gate === gate && i.item_no === itemNo)
    const row: ChecklistItem = {
      coop_id: bundle.coop.id, gate, item_no: itemNo,
      status: null, severity: null, note: null, external_by: null, auto_na_reason: null,
      ...existing, ...patch,
    }
    // user touched it — no longer auto
    if ('status' in patch) row.auto_na_reason = null
    setBundle((b) => {
      if (!b) return b
      const rest = b.items.filter((i) => !(i.gate === gate && i.item_no === itemNo))
      return { ...b, items: [...rest, row] }
    })
    try {
      await upsertChecklistItem(row)
      // auto-open a defect when marked "לא בוצע" (the workbook instruction)
      if (patch.status === 'not_done') {
        const open = bundle.defects.find((d) => d.gate === gate && d.item_no === itemNo && d.status === 'open')
        if (!open) {
          const d = await createDefect(bundle.coop.id, { gate, item_no: itemNo, severity: row.severity })
          setBundle((b) => b && { ...b, defects: [...b.defects, d] })
        }
      }
      // keep defect severity in sync while the item is not_done
      if (patch.severity !== undefined && row.status === 'not_done') {
        const open = bundle.defects.find((d) => d.gate === gate && d.item_no === itemNo && d.status === 'open')
        if (open) {
          await updateDefect(open.id, { severity: patch.severity })
          setBundle((b) => b && { ...b, defects: b.defects.map((d) => d.id === open.id ? { ...d, severity: patch.severity ?? null } : d) })
        }
      }
    } catch (e) { fail(e) }
  }, [bundle]) // eslint-disable-line react-hooks/exhaustive-deps

  const addDefect = useCallback(async (gate: GateKey) => {
    if (!bundle) return
    try {
      const d = await createDefect(bundle.coop.id, { gate })
      setBundle((b) => b && { ...b, defects: [...b.defects, d] })
    } catch (e) { fail(e) }
  }, [bundle]) // eslint-disable-line react-hooks/exhaustive-deps

  const patchDefect = useCallback(async (id_: string, patch: Partial<Defect>) => {
    setBundle((b) => b && { ...b, defects: b.defects.map((d) => d.id === id_ ? { ...d, ...patch } : d) })
    try { await updateDefect(id_, patch) } catch (e) { fail(e) }
  }, [fail])

  const removeDefect = useCallback(async (id_: string) => {
    setBundle((b) => b && { ...b, defects: b.defects.filter((d) => d.id !== id_) })
    try { await deleteDefect(id_) } catch (e) { fail(e) }
  }, [fail])

  const doSign = useCallback(async (gate: GateKey, role: 'manager' | 'supervisor', name: string, png: Blob) => {
    if (!bundle) return
    try {
      await signGate(bundle.coop.id, gate, role, name, png)
      const b2 = await fetchCoopBundle(id) // re-fetch for signed URL
      setBundle(b2)
    } catch (e) { fail(e) }
  }, [bundle, id]) // eslint-disable-line react-hooks/exhaustive-deps

  const doUnsign = useCallback(async (gate: GateKey) => {
    if (!bundle) return
    try {
      await removeGateSignatures(bundle.coop.id, gate)
      setBundle((b) => b && { ...b, signatures: b.signatures.filter((s) => s.gate !== gate) })
    } catch (e) { fail(e) }
  }, [bundle]) // eslint-disable-line react-hooks/exhaustive-deps

  const doConcession = useCallback(async (
    gate: GateKey, defectId: string, reason: string,
    manager: { name: string; png: Blob }, supervisor: { name: string; png: Blob },
  ) => {
    if (!bundle) return
    try {
      await createConcession(bundle.coop.id, gate, defectId, reason, manager, supervisor)
      const b2 = await fetchCoopBundle(id)
      setBundle(b2)
    } catch (e) { fail(e) }
  }, [bundle, id]) // eslint-disable-line react-hooks/exhaustive-deps

  const cfg = useMemo(
    () => bundle && coopConfig(bundle.coop, bundle.responsibilities),
    [bundle],
  )

  if (err && !bundle) return <div className="page"><div className="alert">{err}</div></div>
  if (!bundle || !cfg) return <Loader label="טוען לול…" />

  return (
    <div className="page coop-view">
      <div className="page__head">
        <div>
          <div className="kicker">{projectName(bundle.coop.project_id)} · תפיסת סיום שלב</div>
          <h1 className="page-title">{bundle.coop.name}</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn--primary" onClick={() => nav(`/defects/coop/${bundle.coop.id}/report`)}>⭳ דוח / ייצוא</button>
          <button className="btn btn--ghost" onClick={() => nav('/defects')}>→ כל הלולים</button>
        </div>
      </div>

      {err && <div className="alert">{err}</div>}
      {readOnly && <div className="alert" style={{ background: 'var(--paper-2)', color: 'var(--ink-2)' }}>👁 מצב צפייה בלבד — אין לך הרשאת עריכה בניהול ליקויים.</div>}

      <div className="coop-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key} role="tab" aria-selected={tab === t.key}
            className={`coop-tab ${tab === t.key ? 'on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.key === 'defect_log' && bundle.defects.filter((d) => d.status === 'open').length > 0 && (
              <span className="coop-tab__badge">{bundle.defects.filter((d) => d.status === 'open').length}</span>
            )}
          </button>
        ))}
      </div>

      <fieldset disabled={readOnly} className="perm-fieldset">
      {tab === 'project_open' && (
        <ProjectOpenTab
          coop={bundle.coop} responsibilities={bundle.responsibilities}
          projectName={projectName(bundle.coop.project_id)}
          onCoop={patchCoop} onResponsibility={patchResponsibility}
        />
      )}
      {tab === 'summary' && (
        <StatusSummaryTab items={bundle.items} defs={defs} onGoGate={(g) => setTab(g)} />
      )}
      {GATE_ORDER.includes(tab as GateKey) && (
        <GateTab
          gate={defs[tab as GateKey]}
          defs={defs}
          bundle={bundle}
          onItem={(no, patch) => patchItem(tab as GateKey, no, patch)}
          onSign={(role, name, png) => doSign(tab as GateKey, role, name, png)}
          onUnsign={() => doUnsign(tab as GateKey)}
          onConcession={(defectId, reason, m, s) => doConcession(tab as GateKey, defectId, reason, m, s)}
          onGoDefects={() => setTab('defect_log')}
        />
      )}
      {tab === 'defect_log' && (
        <DefectLogTab
          defects={bundle.defects}
          defs={defs}
          onAdd={addDefect} onPatch={patchDefect} onRemove={removeDefect}
        />
      )}
      </fieldset>
    </div>
  )
}
