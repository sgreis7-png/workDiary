import { describe, it, expect } from 'vitest'
import {
  GATE_ORDER, GATES, STATUS_LABELS, SEVERITY_LABELS, DEFECT_STATUS_LABELS,
  COOP_TYPE_LABELS, YES_NO_LABELS, RESPONSIBLE_LABELS, RESP_DOMAINS, GUIDELINES,
} from './model'

describe('defects model constants', () => {
  it('has 7 gates in workbook order with exact item counts', () => {
    expect(GATE_ORDER).toEqual(['pre_pour', 'gate1', 'gate2', 'gate3', 'gate4', 'gate5', 'gate6'])
    const counts = GATE_ORDER.map((g) => GATES[g].items.length)
    expect(counts).toEqual([7, 10, 10, 9, 10, 19, 18])
  })

  it('items are numbered 1..n in order', () => {
    for (const g of GATE_ORDER)
      expect(GATES[g].items.map((i) => i.no)).toEqual(GATES[g].items.map((_, idx) => idx + 1))
  })

  it('keeps exact Excel titles', () => {
    expect(GATES.pre_pour.title).toBe('🔴 בדיקת טרום־יציקה (Pre-Pour) — באחריות מפקח השטח')
    expect(GATES.gate1.title).toBe('🔴 שער 1 — יסודות, בטונים ורצפה')
    expect(GATES.gate6.title).toBe('✍️ שער 6 — מסירה פנימית')
  })

  it('keeps exact item texts (spot checks incl. emoji)', () => {
    expect(GATES.pre_pour.items[0].text).toBe(
      'המצעים הודקו בשכבות מבוקרות לדרגת הידוק מינימלית 98% לפי Modified AASHTO — דוח בדיקות צפיפות מהלקוח התקבל ותקין',
    )
    expect(GATES.gate5.items[10].text).toContain('חימום — התנורים מותקנים ותקינים')
    expect(GATES.gate6.items[16].text).toBe('✍️ אישור סמנכ"ל תפעול — Go / No-Go למסירה חיצונית ללקוח')
    expect(GATES.gate2.items[9].text).toBe('📝 הערות כלליות / סטיות מהתכנון')
  })

  it('keeps exact Excel dropdown strings', () => {
    expect(Object.values(STATUS_LABELS)).toEqual(['בוצע', 'לא בוצע', 'לא רלוונטי'])
    expect(Object.values(SEVERITY_LABELS)).toEqual(['🔴 קריטי', "🟠 מז'ורי", '🟡 מינורי'])
    expect(Object.values(DEFECT_STATUS_LABELS)).toEqual(['פתוח', 'נסגר'])
    expect(Object.values(COOP_TYPE_LABELS)).toEqual(['פטם', 'מטילות', 'רבייה'])
    expect(Object.values(YES_NO_LABELS)).toEqual(['יש', 'אין'])
    expect(Object.values(RESPONSIBLE_LABELS)).toEqual(['Agrotop', 'לקוח', 'גורם חיצוני'])
  })

  it('has the 7 responsibility-matrix domains', () => {
    expect(RESP_DOMAINS.map((d) => d.label)).toEqual([
      'גז — חיבור, הרצה ואישור',
      'גנרטור חירום ו-ATS',
      'קו מים ראשי עד ראש המערכת',
      'חשמל — הזנה עד הלוח הראשי',
      'בודק חשמל מוסמך',
      'ציוד גידול — הרצה ואישור ספק',
      'אחר: ______',
    ])
  })

  it('carries the guidelines sheet and gate footnotes', () => {
    expect(GUIDELINES.title).toBe('תפיסת סיום שלב — כלי בקרת איכות | Agrotop')
    expect(GUIDELINES.blocks.length).toBeGreaterThanOrEqual(6)
    expect(GATES.pre_pour.footnotes[0]).toContain('עצירת חובה')
    expect(GATES.gate5.footnotes.some((f) => f.includes('SC-02A'))).toBe(true)
  })
})
