// Pure rule logic for the stage-gate workbook. No IO — everything takes plain state
// and returns verdicts with human-readable (Hebrew) reasons, so the UI just renders them.
import { GATES, GATE_ORDER, type GateKey, type ItemStatus, type Severity, type Responsible, type CoopType, type SignatureRole } from './model'

export interface CoopConfig {
  coopType: CoopType | null
  hasHeating: boolean
  hasCoolingPads: boolean
  hasTunnelShutter: boolean
  responsibilities: Record<string, Responsible | undefined>
}
export interface ChecklistItemState { gate: GateKey; itemNo: number; status: ItemStatus | null }
export interface DefectState {
  id: string; gate: GateKey; itemNo: number | null
  severity: Severity | null; status: 'open' | 'closed'
}
export interface SignatureState { gate: GateKey; role: SignatureRole }
export interface ConcessionState { defectId: string }

export function severityRequired(status: ItemStatus | null): boolean {
  return status === 'not_done'
}

/** Configuration-driven "לא רלוונטי" items (auto-set, user may override). */
export function autoNaItems(cfg: CoopConfig): { gate: GateKey; itemNo: number; reason: string }[] {
  const out: { gate: GateKey; itemNo: number; reason: string }[] = []
  if (!cfg.hasTunnelShutter) out.push({ gate: 'gate4', itemNo: 5, reason: 'אין תריס מאוורר מנהרה (פתיחת פרויקט)' })
  if (!cfg.hasCoolingPads) {
    out.push({ gate: 'gate4', itemNo: 6, reason: 'אין מזרוני צינון (פתיחת פרויקט)' })
    out.push({ gate: 'gate5', itemNo: 13, reason: 'אין מזרוני צינון (פתיחת פרויקט)' })
  }
  if (!cfg.hasHeating) out.push({ gate: 'gate5', itemNo: 11, reason: 'אין חימום (פתיחת פרויקט)' })
  if (cfg.coopType === 'broiler') out.push({ gate: 'gate5', itemNo: 6, reason: 'סוג לול פטם — אין מערכת הטלה' })
  const notOurs = (k: string) => cfg.responsibilities[k] === 'customer' || cfg.responsibilities[k] === 'external'
  if (notOurs('generator')) out.push({ gate: 'gate6', itemNo: 9, reason: 'גנרטור באחריות לקוח/גורם חיצוני — ר\' מטריצת אחריות' })
  if (notOurs('electrician')) out.push({ gate: 'gate6', itemNo: 15, reason: 'בודק חשמל באחריות לקוח/גורם חיצוני — ר\' מטריצת אחריות' })
  return out
}

export interface GateSummary {
  done: number; notDone: number; na: number; pending: number
  pct: number // Excel: done / (total - na); 1 when denominator is 0
  notDoneNos: number[]
}

type GateDefsLike = Record<GateKey, { items: { no: number }[] }>

/** ריכוז סטטוס row — same arithmetic as the sheet's COUNTIF formulas. */
export function gateSummary(gate: GateKey, items: ChecklistItemState[], defs: GateDefsLike = GATES): GateSummary {
  const total = defs[gate].items.length
  const mine = items.filter((i) => i.gate === gate)
  const count = (s: ItemStatus) => mine.filter((i) => i.status === s).length
  const done = count('done'), notDone = count('not_done'), na = count('na')
  const denom = total - na
  return {
    done, notDone, na,
    pending: total - done - notDone - na,
    pct: denom === 0 ? 1 : done / denom,
    notDoneNos: mine.filter((i) => i.status === 'not_done').map((i) => i.itemNo).sort((a, b) => a - b),
  }
}

export interface Verdict { ok: boolean; reasons: string[] }

/** Whether a gate may be signed right now. */
export function canSignGate(
  gate: GateKey,
  items: ChecklistItemState[],
  defects: DefectState[],
  concessions: ConcessionState[],
  gateDefs: GateDefsLike = GATES,
): Verdict {
  const reasons: string[] = []
  const byNo = new Map(items.filter((i) => i.gate === gate).map((i) => [i.itemNo, i.status]))
  const defs = gateDefs[gate].items

  if (gate === 'pre_pour') {
    // עצירת חובה — כל הסעיפים "בוצע", אין ויתורים ואין "לא רלוונטי" שעוקף
    const notDone = defs.filter((d) => byNo.get(d.no) !== 'done').map((d) => d.no)
    if (notDone.length)
      reasons.push(`עצירת חובה: אין להזמין בטון לפני שכל הסעיפים "בוצע" (חסרים: ${notDone.join(', ')}) — אין ויתורים ואין חתימה שעוקפת.`)
  } else {
    const unresolved = defs.filter((d) => !byNo.get(d.no)).map((d) => d.no)
    if (unresolved.length) reasons.push(`סעיפים שטרם מולאו: ${unresolved.join(', ')}`)
  }

  const open = defects.filter((d) => d.gate === gate && d.status === 'open')
  const criticals = open.filter((d) => d.severity === 'critical')
  if (criticals.length) reasons.push('אין חתימה על שער עם ליקוי 🔴 קריטי פתוח — עצירה מוחלטת.')
  if (gate !== 'pre_pour') {
    const withConcession = new Set(concessions.map((c) => c.defectId))
    const majorsNoWaiver = open.filter((d) => d.severity === 'major' && !withConcession.has(d.id))
    if (majorsNoWaiver.length)
      reasons.push("ליקוי 🟠 מז'ורי פתוח — נדרש טופס ויתור (Concession) בחתימה כפולה של מנהל הביצוע והמפקח.")
  }
  return { ok: reasons.length === 0, reasons }
}

/** שער 6 opens only after gates 1-5 are double-signed and no material defect is open. */
export function isGate6Unlocked(signatures: SignatureState[], defects: DefectState[]): Verdict {
  const reasons: string[] = []
  const prior = GATE_ORDER.filter((g) => g !== 'pre_pour' && g !== 'gate6')
  const missing = prior.filter((g) =>
    !(['manager', 'supervisor'] as const).every((r) => signatures.some((s) => s.gate === g && s.role === r)))
  if (missing.length)
    reasons.push(`שערים ללא חתימה כפולה: ${missing.map((g) => GATES[g].shortName).join(', ')}`)
  const material = defects.filter((d) => d.status === 'open' && (d.severity === 'critical' || d.severity === 'major'))
  if (material.length)
    reasons.push('יש ליקוי מהותי (🔴/🟠) פתוח ביומן הליקויים — שער 6 לא נחתם עם ליקוי מהותי פתוח כלשהו.')
  return { ok: reasons.length === 0, reasons }
}
