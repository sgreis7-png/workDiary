import { describe, it, expect } from 'vitest'
import {
  autoNaItems, gateSummary, canSignGate, isGate6Unlocked, severityRequired,
  type CoopConfig, type ChecklistItemState, type DefectState, type SignatureState, type ConcessionState,
} from './rules'

const baseCfg: CoopConfig = {
  coopType: 'layer', hasHeating: true, hasCoolingPads: true, hasTunnelShutter: true,
  responsibilities: {},
}
const item = (gate: string, no: number, status: 'done' | 'not_done' | 'na' | null): ChecklistItemState =>
  ({ gate: gate as ChecklistItemState['gate'], itemNo: no, status })
const defect = (p: Partial<DefectState>): DefectState =>
  ({ id: 'd1', gate: 'gate1', itemNo: 1, severity: 'minor', status: 'open', ...p })

describe('autoNaItems', () => {
  it('empty for fully-equipped layer coop with agrotop responsibilities', () => {
    expect(autoNaItems(baseCfg)).toEqual([])
  })
  it('maps configuration gaps to the exact gate items', () => {
    const out = autoNaItems({
      ...baseCfg, coopType: 'broiler', hasHeating: false, hasCoolingPads: false, hasTunnelShutter: false,
      responsibilities: { generator: 'customer', electrician: 'external' },
    })
    const keys = out.map((x) => `${x.gate}#${x.itemNo}`).sort()
    expect(keys).toEqual(['gate4#5', 'gate4#6', 'gate5#11', 'gate5#13', 'gate5#6', 'gate6#15', 'gate6#9'].sort())
  })
  it('agrotop responsibility does not trigger NA', () => {
    expect(autoNaItems({ ...baseCfg, responsibilities: { generator: 'agrotop' } })).toEqual([])
  })
})

describe('gateSummary (Excel formulas)', () => {
  it('counts and pct like the sheet', () => {
    const items = [
      item('gate3', 1, 'done'), item('gate3', 2, 'done'), item('gate3', 3, 'not_done'),
      item('gate3', 4, 'na'), item('gate3', 5, null),
    ]
    const s = gateSummary('gate3', items)
    expect(s).toMatchObject({ done: 2, notDone: 1, na: 1, pending: 5, notDoneNos: [3] }) // gate3 has 9 items; 4 untouched + 1 null = 5 טרם
    expect(s.pct).toBeCloseTo(2 / (9 - 1))
  })
  it('pct is 1 when all items are NA (denominator 0)', () => {
    const items = Array.from({ length: 7 }, (_, i) => item('pre_pour', i + 1, 'na'))
    expect(gateSummary('pre_pour', items).pct).toBe(1)
  })
})

describe('canSignGate', () => {
  it('pre_pour requires every item done — na does not count, no concession path', () => {
    const done6 = Array.from({ length: 6 }, (_, i) => item('pre_pour', i + 1, 'done'))
    expect(canSignGate('pre_pour', [...done6, item('pre_pour', 7, 'na')], [], []).ok).toBe(false)
    expect(canSignGate('pre_pour', [...done6, item('pre_pour', 7, 'done')], [], []).ok).toBe(true)
  })
  it('other gates need every item resolved (done or na)', () => {
    const items = Array.from({ length: 9 }, (_, i) => item('gate3', i + 1, i === 0 ? null : 'done'))
    expect(canSignGate('gate3', items, [], []).ok).toBe(false)
  })
  it('open critical defect blocks; closed does not', () => {
    const items = Array.from({ length: 9 }, (_, i) => item('gate3', i + 1, 'done'))
    expect(canSignGate('gate3', items, [defect({ gate: 'gate3', severity: 'critical' })], []).ok).toBe(false)
    expect(canSignGate('gate3', items, [defect({ gate: 'gate3', severity: 'critical', status: 'closed' })], []).ok).toBe(true)
  })
  it('open major defect needs a concession for that defect', () => {
    const items = Array.from({ length: 9 }, (_, i) => item('gate3', i + 1, i === 0 ? 'not_done' : 'done'))
    const d = defect({ id: 'dx', gate: 'gate3', severity: 'major' })
    expect(canSignGate('gate3', items, [d], []).ok).toBe(false)
    const c: ConcessionState = { defectId: 'dx' }
    expect(canSignGate('gate3', items, [d], [c]).ok).toBe(true)
  })
  it('open minor defect passes', () => {
    const items = Array.from({ length: 9 }, (_, i) => item('gate3', i + 1, i === 0 ? 'not_done' : 'done'))
    expect(canSignGate('gate3', items, [defect({ gate: 'gate3', severity: 'minor' })], []).ok).toBe(true)
  })
  it('defects of other gates do not block this gate', () => {
    const items = Array.from({ length: 9 }, (_, i) => item('gate3', i + 1, 'done'))
    expect(canSignGate('gate3', items, [defect({ gate: 'gate1', severity: 'critical' })], []).ok).toBe(true)
  })
})

describe('isGate6Unlocked', () => {
  const sig = (gate: string, role: 'manager' | 'supervisor'): SignatureState =>
    ({ gate: gate as SignatureState['gate'], role })
  const allSigs = (['gate1', 'gate2', 'gate3', 'gate4', 'gate5'] as const)
    .flatMap((g) => [sig(g, 'manager'), sig(g, 'supervisor')])

  it('unlocked when gates 1-5 double-signed and no material open defect', () => {
    expect(isGate6Unlocked(allSigs, [defect({ severity: 'minor' })]).ok).toBe(true)
  })
  it('locked when a gate misses a signature', () => {
    expect(isGate6Unlocked(allSigs.slice(0, 9), []).ok).toBe(false)
  })
  it('locked with any open critical or major defect anywhere', () => {
    expect(isGate6Unlocked(allSigs, [defect({ gate: 'gate2', severity: 'major' })]).ok).toBe(false)
    expect(isGate6Unlocked(allSigs, [defect({ gate: 'pre_pour', severity: 'critical' })]).ok).toBe(false)
    expect(isGate6Unlocked(allSigs, [defect({ severity: 'critical', status: 'closed' })]).ok).toBe(true)
  })
})

describe('severityRequired', () => {
  it('only for not_done', () => {
    expect(severityRequired('not_done')).toBe(true)
    expect(severityRequired('done')).toBe(false)
    expect(severityRequired('na')).toBe(false)
    expect(severityRequired(null)).toBe(false)
  })
})
