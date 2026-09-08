import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COOP_TEMPLATE, GANTT_ALIASES, LEGACY_TASK_MAP, normName, templateSortFor, type WbsTemplate } from './wbs'

// 0064 seeded the original ten categories; 0076 renamed them to the vocabulary the real
// Gantt files use and rebuilt both lookup tables. The later file is the live seed.
const SQL = readFileSync('supabase/migrations/0076_wbs_gantt_names.sql', 'utf8')

const tpl: WbsTemplate[] = COOP_TEMPLATE.map((r, i) => ({ ...r, id: `t${i}`, active: true }))

describe('normName', () => {
  it('trims, collapses spaces, strips hebrew punctuation and quotes', () => {
    expect(normName('  הקמת   קונס׳ (שלד) ')).toBe('הקמת קונס (שלד)')
    expect(normName('בלת"מ')).toBe('בלתמ')
    expect(normName('Roof Covering')).toBe('roof covering')
  })
})

describe('COOP_TEMPLATE', () => {
  it('has the nine gantt categories in work order, systems critical', () => {
    expect(COOP_TEMPLATE.map((r) => r.sort_order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(COOP_TEMPLATE.filter((r) => r.critical).map((r) => r.sort_order)).toEqual([5, 6, 7, 8, 9])
    expect(COOP_TEMPLATE[0].name_he).toBe('עבודות בטון')
    expect(COOP_TEMPLATE[6].name_he).toBe('ציוד BD')
  })
  it('carries the names the live gantt charts actually use', () => {
    const names = COOP_TEMPLATE.map((r) => r.name_he)
    for (const seen of ['עבודות בטון', 'עבודות מסגרות', 'עבודות קונסטרוקציה', 'כיסויים וחיפויים',
      'מערכת חשמל', 'מערכות אקלים', 'ציוד BD']) {
      expect(names, seen).toContain(seen)
    }
  })
  it('is applied identically in 0076', () => {
    for (const r of COOP_TEMPLATE) {
      // renamed in place, or inserted as a new row — either way the migration must carry it
      expect(SQL, r.name_he).toContain(`'${r.name_he}'`)
      expect(SQL, r.name_en).toContain(`'${r.name_en}'`)
    }
    expect(SQL).toContain("('coop', 2, 'עבודות מסגרות', 'Metalwork',    false)")
    expect(SQL).toContain("('coop', 8, 'מערכת מים',     'Water system', true)")
  })
})

describe('gantt aliases', () => {
  it('covers every summary name the active charts use that is not a category name', () => {
    const bySort = new Map(COOP_TEMPLATE.map((r) => [r.sort_order, r.name_he]))
    for (const a of GANTT_ALIASES) expect(bySort.has(a.sort), a.alias).toBe(true)
    const aliases = GANTT_ALIASES.map((a) => a.alias)
    for (const seen of ['בטון', 'קונסטרוקציה', 'לול 1 עבודות קונסטרוקציה', 'פנלים', 'גג', 'חשמל',
      'מערכת אקלים', 'ציוד אוכל מים']) {
      expect(aliases, seen).toContain(seen)
    }
  })
  it('is seeded identically in 0076, against the category it belongs to', () => {
    const bySort = new Map(COOP_TEMPLATE.map((r) => [r.sort_order, r.name_he]))
    for (const a of GANTT_ALIASES) {
      expect(SQL, a.alias).toContain(`('${bySort.get(a.sort)}',`)
      expect(SQL, a.alias).toContain(`'${a.alias}')`)
    }
  })
})

describe('legacy task map', () => {
  it('maps every task name older entries can hold (he + en) to a category', () => {
    const olds = ['הקמת קונס׳ (שלד)', 'גמר קורות בטון', 'כיסוי תקרה', 'חיפוי קירות', 'כיסוי גג',
      'ציוד פנים (אוכל, מים)', 'ציוד אקלים', 'חשמל ובקרה', 'גמרים ומסירה',
      'עבודות עפר ובטון', 'קורות בטון', 'כיסוי תקרה וחיפוי קירות', 'ציוד פנים', 'מערכת זבל / ספק חוץ',
      'הרצה, גמרים ומסירה',
      'Structure erection (frame)', 'Concrete beams finish', 'Ceiling covering', 'Wall cladding', 'Roof covering',
      'Interior equipment (feed, water)', 'Climate equipment', 'Electrical & controls', 'Finishes & handover']
    for (const o of olds) expect(templateSortFor(o, 'coop', tpl), o).not.toBeNull()
  })
  it('folds the categories that no longer stand alone into the ones that replaced them', () => {
    expect(templateSortFor('קורות בטון', 'coop', tpl)).toBe(1)          // → עבודות בטון
    expect(templateSortFor('כיסוי גג', 'coop', tpl)).toBe(4)            // → כיסויים וחיפויים
    expect(templateSortFor('מערכת זבל / ספק חוץ', 'coop', tpl)).toBe(7) // → ציוד BD
    expect(templateSortFor('הרצה, גמרים ומסירה', 'coop', tpl)).toBe(9)  // → עבודות גמר
  })
  it('matches a current category name directly and returns null for unknown', () => {
    expect(templateSortFor(' ציוד BD ', 'coop', tpl)).toBe(7)
    expect(templateSortFor('Climate systems', 'coop', tpl)).toBe(6)
    expect(templateSortFor('משהו אחר', 'coop', tpl)).toBeNull()
  })
  it('is applied identically in 0076 (wbs_legacy_names)', () => {
    for (const m of LEGACY_TASK_MAP) {
      expect(SQL, m.legacy).toContain(`('${m.legacy.replace(/'/g, "''")}', 'coop', ${m.sort})`)
    }
  })
})
