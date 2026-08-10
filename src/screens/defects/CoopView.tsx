import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Loader } from '../../components/Loader'
import { useStore } from '../../store'
import {
  fetchCoopBundle, updateCoop, saveResponsibility, upsertChecklistItem,
  createDefect, updateDefect, deleteDefect, deleteCoop, signGate, removeGateSignatures, createConcession,
  fetchDefectPhotos, addDefectPhoto, deleteDefectPhoto, logAudit, notifyUser,
  type CoopBundle, type ChecklistItem, type Coop, type CoopResponsibility, type Defect, type DefectPhoto,
} from '../../defects/api'
import { fetchMemberDirectory } from '../../api'
import { useTabStrip } from '../../lib/useTabStrip'
import { useAuth } from '../../auth'
import type { DirectoryMember } from '../../api'
import { GATES, GATE_ORDER, type GateKey, type ItemStatus } from '../../defects/model'
import { loadGateDefs, type GateDefs } from '../../defects/defs'
import { usePerms } from '../../lib/usePerms'
import { useDT, gateShortName } from '../../defects/i18n'
import { sendPush } from '../../lib/push'
import { autoNaItems, type CoopConfig } from '../../defects/rules'
import { ProjectOpenTab } from './ProjectOpenTab'
import { StatusSummaryTab } from './StatusSummaryTab'
import { GateTab } from './GateTab'
import { DefectLogTab } from './DefectLogTab'

type TabKey = 'project_open' | 'summary' | GateKey | 'defect_log'
const TAB_KEYS: TabKey[] = ['project_open', 'summary', ...GATE_ORDER, 'defect_log']

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
  const { dt, lang } = useDT()
  const { user } = useAuth()
  const tabs = useRef<HTMLDivElement>(null)
  const onTabKey = useTabStrip(tabs)
  const readOnly = !canEdit('defects')
  // עריכת פרטי לול ומחיקה — הרשאת coops_manage (אדמין, או עובד שהוענקה לו)
  const canManageCoops = canEdit('coops_manage')
  const [users, setUsers] = useState<DirectoryMember[]>([])
  const [photos, setPhotos] = useState<DefectPhoto[]>([])
  const [bundle, setBundle] = useState<CoopBundle | null>(null)
  const [defs, setDefs] = useState<GateDefs>(GATES)
  // ?gate=gate1 opens that gate directly. The "awaiting approval" notification carries it, so
  // pressing the notification lands on the gate that is waiting instead of the house and a
  // hunt through seven tabs. An unknown value is ignored rather than trusted.
  const [params] = useSearchParams()
  const askedGate = params.get('gate')
  const [tab, setTab] = useState<TabKey>(
    (TAB_KEYS as string[]).includes(askedGate ?? '') ? (askedGate as TabKey) : 'project_open')
  const [err, setErr] = useState('')

  useEffect(() => {
    fetchCoopBundle(id).then(setBundle).catch((e) => setErr(String(e.message ?? e)))
    loadGateDefs().then(setDefs)
    fetchDefectPhotos(id).then(setPhotos).catch(() => {})
    fetchMemberDirectory().then(setUsers).catch(() => setUsers([]))
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
    try {
      await updateDefect(id_, patch)
      if (user) {
        if (patch.status) logAudit(user.email, `defect_${patch.status}`, 'defect', id_, { coop: bundle?.coop.name })
        if (patch.assignee_email) {
          logAudit(user.email, 'defect_assigned', 'defect', id_, { to: patch.assignee_email })
          if (patch.assignee_email !== user.email.toLowerCase()) {
            const d = bundle?.defects.find((x) => x.id === id_)
            notifyUser(patch.assignee_email, 'הוקצה לך ליקוי', `לול ${bundle?.coop.name ?? ''} · ${d?.description ?? ''}`, `/defects/coop/${bundle?.coop.id}`)
            sendPush([patch.assignee_email], 'הוקצה לך ליקוי', `לול ${bundle?.coop.name ?? ''} · ${d?.description ?? ''}`, `/defects/coop/${bundle?.coop.id}`)
          }
        }
      }
    } catch (e) { fail(e) }
  }, [fail, user, bundle])

  const removeDefect = useCallback(async (id_: string) => {
    setBundle((b) => b && { ...b, defects: b.defects.filter((d) => d.id !== id_) })
    try { await deleteDefect(id_) } catch (e) { fail(e) }
  }, [fail])

  const doSign = useCallback(async (gate: GateKey, role: 'manager' | 'supervisor', name: string, png: Blob) => {
    if (!bundle) return
    try {
      await signGate(bundle.coop.id, gate, role, name, png)
      if (user) logAudit(user.email, 'gate_signed', 'gate', `${bundle.coop.id}/${gate}`, { role, name, coop: bundle.coop.name })
      const b2 = await fetchCoopBundle(id) // re-fetch for signed URL
      setBundle(b2)
    } catch (e) { fail(e) }
  }, [bundle, id]) // eslint-disable-line react-hooks/exhaustive-deps

  const doUnsign = useCallback(async (gate: GateKey) => {
    if (!bundle) return
    try {
      await removeGateSignatures(bundle.coop.id, gate)
      if (user) logAudit(user.email, 'gate_unsigned', 'gate', `${bundle.coop.id}/${gate}`, { coop: bundle.coop.name })
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
  if (!bundle || !cfg) return <Loader label={dt('coop_loading')} />

  return (
    <div className="page coop-view">
      <div className="page__head">
        <div>
          <div className="kicker">{projectName(bundle.coop.project_id)} · {dt('coop_kicker')}</div>
          <h1 className="page-title">{bundle.coop.name}</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn--primary" onClick={() => nav(`/defects/coop/${bundle.coop.id}/report`)}>{dt('coop_report_btn')}</button>
          <button className="btn btn--ghost" onClick={() => nav('/defects')}>{dt('coop_back_all')}</button>
          {canManageCoops && (
            <button
              className="btn btn--ghost" style={{ color: 'var(--clay)' }}
              onClick={async () => {
                if (!window.confirm(dt('coop_delete_confirm'))) return
                try { await deleteCoop(bundle.coop.id); nav('/defects') } catch (e) { fail(e) }
              }}
            >🗑 {dt('coop_delete')}</button>
          )}
        </div>
      </div>

      {err && <div className="alert">{err}</div>}
      {readOnly && <div className="alert" style={{ background: 'var(--paper-2)', color: 'var(--ink-2)' }}>{dt('coop_readonly')}</div>}

      <div className="coop-tabs" role="tablist" ref={tabs} onKeyDown={onTabKey}>
        {TAB_KEYS.map((k) => {
          const label = k === 'project_open' ? dt('tab_project_open')
            : k === 'summary' ? dt('tab_summary')
            : k === 'defect_log' ? dt('tab_defect_log')
            : gateShortName(lang, k as GateKey)
          return (
            <button
              key={k} role="tab" aria-selected={tab === k} tabIndex={tab === k ? 0 : -1}
              className={`coop-tab ${tab === k ? 'on' : ''}`}
              onClick={() => setTab(k)}
            >
              {label}
              {k === 'defect_log' && bundle.defects.filter((d) => d.status === 'open').length > 0 && (
                <span className="coop-tab__badge">{bundle.defects.filter((d) => d.status === 'open').length}</span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'project_open' && (
        <fieldset disabled={readOnly || !canManageCoops} className="perm-fieldset">
          <ProjectOpenTab
            coop={bundle.coop} responsibilities={bundle.responsibilities}
            projectName={projectName(bundle.coop.project_id)}
            onCoop={patchCoop} onResponsibility={patchResponsibility}
          />
        </fieldset>
      )}
      <fieldset disabled={readOnly} className="perm-fieldset">
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
          users={users}
          photos={photos}
          onAdd={addDefect} onPatch={patchDefect} onRemove={removeDefect}
          onAddPhoto={async (defectId, file) => {
            if (!user) return
            try {
              const p = await addDefectPhoto(defectId, file, user.email)
              setPhotos((prev) => [...prev, p])
            } catch (e) { fail(e) }
          }}
          onRemovePhoto={async (photoId) => {
            setPhotos((prev) => prev.filter((p) => p.id !== photoId))
            try { await deleteDefectPhoto(photoId) } catch (e) { fail(e) }
          }}
        />
      )}
      </fieldset>
    </div>
  )
}
