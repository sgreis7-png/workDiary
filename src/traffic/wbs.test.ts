import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COOP_TEMPLATE, LEGACY_TASK_MAP, normName, templateSortFor, type WbsTemplate } from './wbs'

const SQL = readFileSync('supabase/migrations/0064_traffic_light_schema.sql', 'utf8')

const tpl: WbsTemplate[] = COOP_TEMPLATE.map((r, i) => ({ ...r, id: `t${i}`, active: true }))

describe('normName', () => {
  it('trims, collapses spaces, strips hebrew punctuation and quotes', () => {
    expect(normName('  הקמת   קונס׳ (שלד) ')).toBe('הקמת קונס (שלד)')
    expect(normName('בלת"מ')).toBe('בלתמ')
    expect(normName('Roof Covering')).toBe('roof covering')
  })
})

describe('COOP_TEMPLATE', () => {
  it('has the 10 spec categories in order with rows 6-10 critical', () => {
    expect(COOP_TEMPLATE.map((r) => r.sort_order)).toEqual([1,2,3,4,5,6,7,8,9,10])
    expect(COOP_TEMPLATE.filter((r) => r.critical).map((r) => r.sort_order)).toEqual([6,7,8,9,10])
    expect(COOP_TEMPLATE[8].name_he).toBe('מערכת זבל / ספק חוץ')
  })
  it('is seeded identically in 0064', () => {
    for (const r of COOP_TEMPLATE) {
      expect(SQL, r.name_he).toContain(`('coop', ${r.sort_order}, '${r.name_he}', '${r.name_en.replace(/'/g, "''")}', ${r.critical})`)
    }
  })
})

describe('legacy task map', () => {
  it('maps every old diary task (he + en) to a template row', () => {
    const olds = ['הקמת קונס׳ (שלד)', 'גמר קורות בטון', 'כיסוי תקרה', 'חיפוי קירות', 'כיסוי גג',
      'ציוד פנים (אוכל, מים)', 'ציוד אקלים', 'חשמל ובקרה', 'גמרים ומסירה',
      'Structure erection (frame)', 'Concrete beams finish', 'Ceiling covering', 'Wall cladding', 'Roof covering',
      'Interior equipment (feed, water)', 'Climate equipment', 'Electrical & controls', 'Finishes & handover']
    for (const o of olds) expect(templateSortFor(o, 'coop', tpl), o).not.toBeNull()
    expect(templateSortFor('כיסוי תקרה', 'coop', tpl)).toBe(4)
    expect(templateSortFor('חיפוי קירות', 'coop', tpl)).toBe(4)
    expect(templateSortFor('Finishes & handover', 'coop', tpl)).toBe(10)
  })
  it('matches a current template name directly and returns null for unknown', () => {
    expect(templateSortFor(' ציוד פנים ', 'coop', tpl)).toBe(6)
    expect(templateSortFor('Interior equipment', 'coop', tpl)).toBe(6)
    expect(templateSortFor('משהו אחר', 'coop', tpl)).toBeNull()
  })
  it('is seeded identically in 0064 (wbs_legacy_names)', () => {
    for (const m of LEGACY_TASK_MAP) {
      expect(SQL, m.legacy).toContain(`('${m.legacy.replace(/'/g, "''")}', 'coop', ${m.sort})`)
    }
  })
})
