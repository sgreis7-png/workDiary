// WBS categories: the shared language of the diary, the Gantt and the traffic light.
// The live list is wbs_templates (DB, admin-editable); COOP_TEMPLATE is the seed and the
// offline fallback. The names are the ones the real Gantt files use, so a summary row and
// a diary row are the same category (migration 0076); older task names are mapped through
// LEGACY_TASK_MAP so entries filed under the previous names keep counting. Seeded by
// migration 0076 — wbs.test.ts holds the lists in agreement.

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
  { project_type: 'coop', sort_order: 1, name_he: 'עבודות בטון',        name_en: 'Concrete works',      critical: false },
  { project_type: 'coop', sort_order: 2, name_he: 'עבודות מסגרות',      name_en: 'Metalwork',           critical: false },
  { project_type: 'coop', sort_order: 3, name_he: 'עבודות קונסטרוקציה', name_en: 'Structure works',     critical: false },
  { project_type: 'coop', sort_order: 4, name_he: 'כיסויים וחיפויים',   name_en: 'Cladding & covering', critical: false },
  { project_type: 'coop', sort_order: 5, name_he: 'מערכת חשמל',         name_en: 'Electrical system',   critical: true },
  { project_type: 'coop', sort_order: 6, name_he: 'מערכות אקלים',       name_en: 'Climate systems',     critical: true },
  { project_type: 'coop', sort_order: 7, name_he: 'ציוד BD',            name_en: 'BD equipment',        critical: true },
  { project_type: 'coop', sort_order: 8, name_he: 'מערכת מים',          name_en: 'Water system',        critical: true },
  { project_type: 'coop', sort_order: 9, name_he: 'עבודות גמר',         name_en: 'Finishing works',     critical: true },
]

/** Summary-row names seen in the real Gantt files, per category — the planners are not
 *  consistent with each other, so tl_time() matches through wbs_gantt_aliases (0076) as
 *  well as by name. Mirrored here so the seed and this list stay in agreement. */
export const GANTT_ALIASES: { sort: number; alias: string }[] = [
  { sort: 1, alias: 'בטון' },
  { sort: 3, alias: 'קונסטרוקציה' },
  { sort: 3, alias: 'לול 1 עבודות קונסטרוקציה' },
  { sort: 3, alias: 'לול 2 עבודות קונסטרוקציה' },
  { sort: 4, alias: 'פנלים' },
  { sort: 4, alias: 'גג' },
  { sort: 4, alias: 'כיסוי גג' },
  { sort: 5, alias: 'חשמל' },
  { sort: 6, alias: 'מערכת אקלים' },
  { sort: 7, alias: 'ציוד אוכל מים' },
]

/** Task names stored in older diary entries → the category they now belong to. Covers both
 *  the fixed 9-row list that shipped before 2026-09 and the category names used between then
 *  and the rename to the Gantt vocabulary (0076). */
export const LEGACY_TASK_MAP: { legacy: string; project_type: 'coop'; sort: number }[] = [
  { legacy: 'עבודות עפר ובטון',                 project_type: 'coop', sort: 1 },
  { legacy: 'Earthworks & concrete',             project_type: 'coop', sort: 1 },
  { legacy: 'קורות בטון',                       project_type: 'coop', sort: 1 },
  { legacy: 'Concrete beams',                    project_type: 'coop', sort: 1 },
  { legacy: 'גמר קורות בטון',                   project_type: 'coop', sort: 1 },
  { legacy: 'Concrete beams finish',             project_type: 'coop', sort: 1 },
  { legacy: 'הקמת קונסטרוקציה (שלד)',           project_type: 'coop', sort: 3 },
  { legacy: 'Structure erection (frame)',        project_type: 'coop', sort: 3 },
  { legacy: 'הקמת קונס׳ (שלד)',                 project_type: 'coop', sort: 3 },
  { legacy: 'כיסוי תקרה וחיפוי קירות',          project_type: 'coop', sort: 4 },
  { legacy: 'Ceiling & wall cladding',           project_type: 'coop', sort: 4 },
  { legacy: 'כיסוי תקרה',                       project_type: 'coop', sort: 4 },
  { legacy: 'Ceiling covering',                  project_type: 'coop', sort: 4 },
  { legacy: 'חיפוי קירות',                      project_type: 'coop', sort: 4 },
  { legacy: 'Wall cladding',                     project_type: 'coop', sort: 4 },
  { legacy: 'כיסוי גג',                         project_type: 'coop', sort: 4 },
  { legacy: 'Roof covering',                     project_type: 'coop', sort: 4 },
  { legacy: 'חשמל ובקרה',                       project_type: 'coop', sort: 5 },
  { legacy: 'Electrical & controls',             project_type: 'coop', sort: 5 },
  { legacy: 'ציוד אקלים',                       project_type: 'coop', sort: 6 },
  { legacy: 'Climate equipment',                 project_type: 'coop', sort: 6 },
  { legacy: 'ציוד פנים',                        project_type: 'coop', sort: 7 },
  { legacy: 'Interior equipment',                project_type: 'coop', sort: 7 },
  { legacy: 'ציוד פנים (אוכל, מים)',             project_type: 'coop', sort: 7 },
  { legacy: 'Interior equipment (feed, water)',  project_type: 'coop', sort: 7 },
  { legacy: 'מערכת זבל / ספק חוץ',              project_type: 'coop', sort: 7 },
  { legacy: 'Manure system / external supplier', project_type: 'coop', sort: 7 },
  { legacy: 'הרצה, גמרים ומסירה',               project_type: 'coop', sort: 9 },
  { legacy: 'Commissioning, finishes & handover', project_type: 'coop', sort: 9 },
  { legacy: 'גמרים ומסירה',                     project_type: 'coop', sort: 9 },
  { legacy: 'Finishes & handover',               project_type: 'coop', sort: 9 },
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
