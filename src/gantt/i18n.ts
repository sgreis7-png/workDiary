// Strings for the schedule module. Registered in src/i18n.test.ts so the HE/EN parity
// check covers them like every other dictionary in the app.

export const G = {
  // navigation & page
  g_nav:            { he: 'לוח זמנים',                    en: 'Schedule' },
  g_kicker:         { he: 'גאנט פרויקט',                  en: 'Project Gantt' },
  g_pick_project:   { he: 'פרויקט',                       en: 'Project' },
  g_pick_chart:     { he: 'לוח זמנים',                    en: 'Schedule' },
  g_none:           { he: 'עדיין לא הועלה לוח זמנים לפרויקט הזה.', en: 'No schedule has been imported for this project yet.' },
  g_none_hint:      { he: 'העלה קובץ Microsoft Project (mpp.) והוא יומר ויוצג כאן.', en: 'Import a Microsoft Project (.mpp) file and it will be converted and shown here.' },
  g_source:         { he: 'מקור',                         en: 'Source' },
  g_imported_on:    { he: 'יובא',                         en: 'Imported' },

  // import
  g_import:         { he: 'העלאת גנט',                    en: 'Import schedule' },
  g_replace:        { he: 'העלאת גרסה חדשה',              en: 'Import a new version' },
  g_converting:     { he: 'ממיר את הקובץ…',                en: 'Converting the file…' },
  g_saving_rows:    { he: 'שומר את המשימות…',              en: 'Saving tasks…' },
  g_imported:       { he: 'הלוח יובא',                     en: 'Schedule imported' },
  g_tasks_word:     { he: 'משימות',                        en: 'tasks' },
  g_links_word:     { he: 'תלויות',                        en: 'links' },
  g_archive:        { he: 'הסרת הלוח',                     en: 'Remove schedule' },
  g_archive_ask:    { he: 'להסיר את לוח הזמנים הזה מהפרויקט?', en: 'Remove this schedule from the project?' },

  // toolbar
  g_scale:          { he: 'קנה מידה',                      en: 'Scale' },
  g_scale_all:      { he: 'כל הפרויקט',                    en: 'Whole project' },
  g_scale_mid:      { he: 'בינוני',                        en: 'Medium' },
  g_scale_week:     { he: 'שבועות',                        en: 'Weeks' },
  g_collapse:       { he: 'כווץ הכל',                      en: 'Collapse all' },
  g_expand:         { he: 'פתח הכל',                       en: 'Expand all' },
  g_goto_today:     { he: 'קפוץ להיום',                    en: 'Jump to today' },
  g_deps:           { he: 'תלויות',                        en: 'Dependencies' },
  g_open_only:      { he: 'רק פתוח',                       en: 'Open only' },
  g_search:         { he: 'חיפוש',                         en: 'Search' },
  g_search_ph:      { he: 'משימה או משאב',                 en: 'Task or resource' },
  g_col_task:       { he: 'משימה',                         en: 'Task' },
  g_col_meta:       { he: 'התחלה · ביצוע',                 en: 'Start · done' },
  g_today:          { he: 'היום',                          en: 'Today' },

  // legend
  g_done:           { he: 'הושלם',                         en: 'Complete' },
  g_wip:            { he: 'בביצוע',                        en: 'In progress' },
  g_todo:           { he: 'טרם התחיל',                     en: 'Not started' },
  g_summary:        { he: 'סיכום',                         en: 'Summary' },
  g_milestone:      { he: 'אבן דרך',                       en: 'Milestone' },
  g_payment:        { he: 'תשלום',                         en: 'Payment' },

  // headline numbers
  g_progress:       { he: 'התקדמות',                       en: 'Progress' },
  g_start:          { he: 'התחלה',                         en: 'Start' },
  g_finish:         { he: 'סיום',                          en: 'Finish' },
  g_overdue:        { he: 'חורג מיעד',                     en: 'Past due' },
  g_milestones:     { he: 'אבני דרך',                      en: 'Milestones' },

  // payment strip
  g_pay_title:      { he: 'אבני דרך לתשלום',               en: 'Payment milestones' },
  g_pay_released:   { he: 'מהתמורה שוחררה',                en: 'of the contract released' },
  g_pay_open:       { he: 'פתוח',                          en: 'outstanding' },
  g_pay_paid:       { he: 'שולם',                          en: 'Paid' },

  // editing
  g_edit_start:     { he: 'התחלה',                         en: 'Start' },
  g_edit_finish:    { he: 'סיום',                          en: 'Finish' },
  g_edit_pct:       { he: 'ביצוע %',                       en: 'Done %' },
  g_edit_slip:      { he: 'סטייה מהתכנון המקורי',           en: 'Drift from the imported plan' },
  g_edit_days:      { he: 'ימים',                          en: 'days' },
  g_edit_readonly:  { he: 'אין לך הרשאת עריכה ללוח הזמנים.', en: 'You do not have permission to edit the schedule.' },
  g_edit_hint:      { he: 'גרור בר כדי להזיז, גרור קצה כדי לשנות משך. משימות עוקבות נדחות בהתאם.', en: 'Drag a bar to move it, drag an edge to change its length. Successors are pushed out to match.' },
  g_edit_summary:   { he: 'שורת סיכום מחושבת מהמשימות שתחתיה.', en: 'A summary row is derived from the tasks beneath it.' },
  g_saving:         { he: 'שומר…',                         en: 'Saving…' },
  g_saved:          { he: 'נשמר',                          en: 'Saved' },
  g_selected_none:  { he: 'בחר משימה כדי לערוך אותה.',      en: 'Select a task to edit it.' },
  g_deps_of:        { he: 'תלוי ב',                         en: 'Depends on' },
  g_resources:      { he: 'באחריות',                        en: 'Owner' },

  // failures
  err_converter_unreachable:{ he: 'לא הצלחנו להגיע לשירות ההמרה.',       en: 'Could not reach the conversion service.' },
  err_converter_config:     { he: 'שירות ההמרה מוגדר חלקית.',            en: 'The conversion service is misconfigured.' },
  err_convert_failed:       { he: 'ההמרה נכשלה. ייתכן שהקובץ פגום.',      en: 'Conversion failed — the file may be damaged.' },
  err_forbidden:            { he: 'אין לך הרשאה לפעולה הזאת.',            en: 'You are not allowed to do that.' },
  err_unsupported_format:   { he: 'סוג הקובץ אינו נתמך.',                en: 'That file type is not supported.' },
  err_empty_file:           { he: 'הקובץ ריק.',                          en: 'The file is empty.' },
  err_file_too_big:         { he: 'הקובץ גדול מ-50MB.',                   en: 'The file is larger than 50MB.' },
  err_schedule_empty:       { he: 'לא נמצאו משימות עם תאריכים בקובץ.',     en: 'No dated tasks were found in the file.' },
  err_not_a_project_file:   { he: 'זה לא קובץ לוח זמנים.',                en: 'That is not a schedule file.' },
  err_save_failed:          { he: 'השמירה נכשלה. הלוח הוחזר למצב הקודם.', en: 'Saving failed — the schedule was rolled back.' },
} as const

export type GKey = keyof typeof G

export function gt(lang: 'he' | 'en', key: GKey | string): string {
  const row = (G as Record<string, { he: string; en: string }>)[key]
  return row ? row[lang] : key
}
