// WBS categories: the shared language of the diary, the Gantt and the traffic light.
// The live list is wbs_templates (DB, admin-editable); COOP_TEMPLATE is the seed and the
// offline fallback. Legacy diary task names (the fixed 9-row list that shipped before
// 2026-09) are mapped here so old entries keep counting. The same two lists are seeded
// by migration 0064 — wbs.test.ts holds them in agreement.

export interface WbsTemplate {
  id: string
  project_type: string
  sort_order: number
  name_he: string
  name_en: string
  critical: boolean
  active: boolean
}

export const COOP_TEMPLATE: Omit<WbsTemplate, 'id' | 'active'>[] = [
  { project_type: 'coop', sort_order: 1,  name_he: 'עבודות עפר ובטון',           name_en: 'Earthworks & concrete',                 critical: false },
  { project_type: 'coop', sort_order: 2,  name_he: 'הקמת קונסטרוקציה (שלד)',     name_en: 'Structure erection (frame)',            critical: false },
  { project_type: 'coop', sort_order: 3,  name_he: 'קורות בטון',                 name_en: 'Concrete beams',                        critical: false },
  { project_type: 'coop', sort_order: 4,  name_he: 'כיסוי תקרה וחיפוי קירות',    name_en: 'Ceiling & wall cladding',               critical: false },
  { project_type: 'coop', sort_order: 5,  name_he: 'כיסוי גג',                   name_en: 'Roof covering',                         critical: false },
  { project_type: 'coop', sort_order: 6,  name_he: 'ציוד פנים',                  name_en: 'Interior equipment',                    critical: true },
  { project_type: 'coop', sort_order: 7,  name_he: 'מערכות אקלים',               name_en: 'Climate systems',                       critical: true },
  { project_type: 'coop', sort_order: 8,  name_he: 'חשמל ובקרה',                 name_en: 'Electrical & controls',                 critical: true },
  { project_type: 'coop', sort_order: 9,  name_he: 'מערכת זבל / ספק חוץ',        name_en: 'Manure system / external supplier',     critical: true },
  { project_type: 'coop', sort_order: 10, name_he: 'הרצה, גמרים ומסירה',         name_en: 'Commissioning, finishes & handover',    critical: true },
]

/** Old fixed diary rows → template sort_order. Two old rows fold into category 4. */
export const LEGACY_TASK_MAP: { legacy: string; project_type: 'coop'; sort: number }[] = [
  { legacy: 'הקמת קונס׳ (שלד)',             project_type: 'coop', sort: 2 },
  { legacy: 'Structure erection (frame)',    project_type: 'coop', sort: 2 },
  { legacy: 'גמר קורות בטון',               project_type: 'coop', sort: 3 },
  { legacy: 'Concrete beams finish',         project_type: 'coop', sort: 3 },
  { legacy: 'כיסוי תקרה',                   project_type: 'coop', sort: 4 },
  { legacy: 'Ceiling covering',              project_type: 'coop', sort: 4 },
  { legacy: 'חיפוי קירות',                  project_type: 'coop', sort: 4 },
  { legacy: 'Wall cladding',                 project_type: 'coop', sort: 4 },
  { legacy: 'כיסוי גג',                     project_type: 'coop', sort: 5 },
  { legacy: 'Roof covering',                 project_type: 'coop', sort: 5 },
  { legacy: 'ציוד פנים (אוכל, מים)',         project_type: 'coop', sort: 6 },
  { legacy: 'Interior equipment (feed, water)', project_type: 'coop', sort: 6 },
  { legacy: 'ציוד אקלים',                   project_type: 'coop', sort: 7 },
  { legacy: 'Climate equipment',             project_type: 'coop', sort: 7 },
  { legacy: 'חשמל ובקרה',                   project_type: 'coop', sort: 8 },
  { legacy: 'Electrical & controls',         project_type: 'coop', sort: 8 },
  { legacy: 'גמרים ומסירה',                 project_type: 'coop', sort: 10 },
  { legacy: 'Finishes & handover',           project_type: 'coop', sort: 10 },
]

/** Same normalization as tl_norm() in 0065: lower, trim, collapse spaces, drop ׳ ״ ' ". */
export function normName(s: string): string {
  return String(s ?? '').toLowerCase().replace(/[׳״'"]/g, '').replace(/\s+/g, ' ').trim()
}

/** sort_order of the template row a diary task name belongs to, or null. */
export function templateSortFor(task: string, projectType: string, templates: WbsTemplate[]): number | null {
  const n = normName(task)
  if (!n) return null
  const direct = templates.find((t) => t.project_type === projectType && t.active !== false
    && (normName(t.name_he) === n || normName(t.name_en) === n))
  if (direct) return direct.sort_order
  const legacy = LEGACY_TASK_MAP.find((m) => m.project_type === projectType && normName(m.legacy) === n)
  return legacy ? legacy.sort : null
}
