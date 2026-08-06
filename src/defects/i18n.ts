// Bilingual strings for the defect-management module, messages, and shell chrome
// added after the original i18n table. Checklist item texts / guidelines stay in
// Hebrew — they are workbook content (and admin-editable), not UI chrome.
import { useI18n, type Lang } from '../i18n'
import type { ItemStatus, Severity, DefectStatus, CoopType, Responsible, GateKey } from './model'

const D = {
  // mode select
  mode_q:            { he: 'מה מנהלים היום?', en: 'What are we managing today?' },
  mode_work:         { he: 'ניהול עבודה', en: 'Work management' },
  mode_work_desc:    { he: 'יומן עבודה יומי — רשומות, לוח שנה, דוחות וייצוא', en: 'Daily work diary — entries, calendar, reports and export' },
  mode_defects:      { he: 'ניהול ליקויים', en: 'Defect management' },
  mode_defects_desc: { he: 'תפיסת סיום שלב — צ׳קליסט שערים, יומן ליקויים וחתימות per־לול', en: 'Stage-gate QC — gate checklists, defect log and signatures per house' },

  // shell
  nav_coops:         { he: 'לולים — תפיסת סיום שלב', en: 'Houses — stage gates' },
  nav_defect_search: { he: 'חיפוש', en: 'Search' },
  nav_form_builder:  { he: 'בונה טופס ליקויים', en: 'Defect form builder' },
  nav_messages:      { he: 'הודעות', en: 'Messages' },
  switch_to_work:    { he: 'מעבר לניהול עבודה', en: 'Switch to work management' },
  switch_to_defects: { he: 'מעבר לניהול ליקויים', en: 'Switch to defect management' },
  menu_account:      { he: '👤 החשבון שלי — פרופיל וסיסמה', en: '👤 My account — profile & password' },
  menu_light:        { he: '☀ מעבר למצב בהיר', en: '☀ Switch to light mode' },
  menu_dark:         { he: '☾ מעבר למצב כהה', en: '☾ Switch to dark mode' },
  menu_push:         { he: 'הפעלת התראות בנייד', en: 'Enable push notifications' },
  menu_about:        { he: 'ⓘ על התוכנה', en: 'ⓘ About' },
  menu_signout:      { he: '⇥ התנתקות', en: '⇥ Sign out' },
  toast_new_msg:     { he: 'הודעה חדשה מ', en: 'New message from ' },

  // messages / chat
  chat_kicker:       { he: 'תקשורת פנימית', en: 'Internal communication' },
  chat_title:        { he: 'הודעות', en: 'Messages' },
  chat_pending:      { he: 'ממתינות לאישור', en: 'awaiting read' },
  chat_search:       { he: '🔍 חיפוש משתמש או קבוצה…', en: '🔍 Search user or group…' },
  chat_new_group:    { he: '👥 קבוצה חדשה', en: '👥 New group' },
  chat_no_results:   { he: 'לא נמצאו תוצאות.', en: 'No results.' },
  chat_members:      { he: 'חברים', en: 'members' },
  chat_me:           { he: 'אני: ', en: 'Me: ' },
  chat_new_group_hint: { he: 'קבוצה חדשה', en: 'New group' },
  chat_start:        { he: 'התחלת שיחה…', en: 'Start a chat…' },
  chat_pick:         { he: 'בחרו שיחה או צרו קבוצה 💬', en: 'Pick a conversation or create a group 💬' },
  chat_empty_thread: { he: 'אין עדיין הודעות — כתבו את הראשונה 👇', en: 'No messages yet — write the first one 👇' },
  chat_placeholder:  { he: 'הודעה…', en: 'Message…' },
  chat_seen:         { he: 'נראה', en: 'Seen' },
  chat_seen_at:      { he: 'נראה ב-', en: 'Seen at ' },
  chat_seen_all:     { he: 'נראה על ידי כולם', en: 'Seen by everyone' },
  chat_seen_by:      { he: 'נראה ע"י', en: 'Seen by' },
  chat_of:           { he: 'מתוך', en: 'of' },
  chat_no_users:     { he: 'אין משתמשים זמינים.', en: 'No users available.' },
  grp_title:         { he: '👥 קבוצה חדשה', en: '👥 New group' },
  grp_name_ph:       { he: 'שם הקבוצה… (למשל: צוות מעלה גמלא)', en: 'Group name… (e.g. Site A team)' },
  grp_cancel:        { he: 'ביטול', en: 'Cancel' },
  grp_create:        { he: 'יצירת קבוצה', en: 'Create group' },
  loading_msgs:      { he: 'טוען הודעות…', en: 'Loading messages…' },

  // coops list
  coops_kicker:      { he: 'תפיסת סיום שלב · Hold Points', en: 'Stage-gate QC · Hold Points' },
  coops_title:       { he: 'ניהול ליקויים', en: 'Defect management' },
  coops_all_projects:{ he: 'כל הפרויקטים', en: 'All projects' },
  coops_count:       { he: 'לולים', en: 'houses' },
  coops_intro:       { he: 'כל לול בחווה נתפס בנפרד. בוחרים פרויקט, פותחים לול, וממלאים את השערים.', en: 'Each house is inspected separately. Pick a project, open a house, fill the gates.' },
  coops_which_project:{ he: 'לאיזה פרויקט?', en: 'Which project?' },
  coops_new_ph:      { he: 'שם / מספר לול חדש…', en: 'New house name / number…' },
  coops_creating:    { he: 'יוצר…', en: 'Creating…' },
  coops_new:         { he: '✛ לול חדש', en: '✛ New house' },
  coops_empty:       { he: 'אין עדיין לולים. פתחו לול חדש למעלה.', en: 'No houses yet. Create one above.' },
  coops_loading:     { he: 'טוען לולים…', en: 'Loading houses…' },

  // defect search
  search_title:      { he: 'חיפוש', en: 'Search' },
  search_results:    { he: 'תוצאות', en: 'results' },
  search_ph:         { he: '🔍 חיפוש חופשי — ליקויים, סעיפים, אחראים, לולים…', en: '🔍 Free search — defects, items, assignees, houses…' },
  search_all_coops:  { he: 'כל הלולים', en: 'All houses' },
  search_none_title: { he: 'לא נמצאו ליקויים תואמים', en: 'No matching defects' },
  search_none_sub:   { he: 'נסו לשנות את הסינון או את מילות החיפוש.', en: 'Try different filters or search terms.' },
  search_open:       { he: 'פתיחה ←', en: 'Open →' },

  // coop view
  coop_loading:      { he: 'טוען לול…', en: 'Loading house…' },
  coop_report_btn:   { he: '⭳ דוח / ייצוא', en: '⭳ Report / export' },
  coop_back_all:     { he: '→ כל הלולים', en: '→ All houses' },
  coop_readonly:     { he: '👁 מצב צפייה בלבד — אין לך הרשאת עריכה בניהול ליקויים.', en: '👁 View-only — you have no edit permission in defect management.' },
  coop_delete:         { he: 'מחיקת לול', en: 'Delete coop' },
  coop_kicker:         { he: 'תפיסת סיום שלב', en: 'Stage-gate close-out' },
  auto_na:             { he: 'אוטומטי', en: 'Auto' },
  coop_delete_confirm: { he: 'למחוק את הלול? כל הליקויים, הצ\'קליסטים והחתימות שלו יימחקו.', en: 'Delete this coop? All its defects, checklists and signatures will be deleted.' },
  tab_project_open:  { he: 'פתיחת פרויקט', en: 'Project setup' },
  tab_summary:       { he: 'ריכוז סטטוס', en: 'Status summary' },
  tab_defect_log:    { he: 'יומן ליקויים', en: 'Defect log' },

  // gate tab chrome
  col_item:          { he: 'הסעיף', en: 'Item' },
  col_status:        { he: 'סטטוס', en: 'Status' },
  col_severity:      { he: 'חומרה (אם לא בוצע)', en: 'Severity (if not done)' },
  col_note:          { he: 'הערה', en: 'Note' },
  col_external:      { he: 'בוצע עם גורם חיצוני', en: 'Done with external party' },
  status_pending:    { he: '— טרם —', en: '— Pending —' },
  pick_severity:     { he: 'בחרו חומרה…', en: 'Pick severity…' },
  severity_required: { he: 'חובה לבחור חומרה', en: 'Severity is required' },
  defect_opened_link:{ he: '↩ נפתחה שורה ביומן הליקויים', en: '↩ A defect-log row was opened' },
  gate6_locked:      { he: '🔒 שער 6 נעול:', en: '🔒 Gate 6 is locked:' },
  waiver_needed:     { he: "🟠 ליקוי מז'ורי פתוח דורש טופס ויתור (Concession) בחתימה כפולה לפני חתימת השער:", en: '🟠 An open major defect requires a double-signed concession before signing this gate:' },
  waiver_for:        { he: 'טופס ויתור לליקוי #', en: 'Concession for defect #' },
  cant_sign:         { he: '🔒 לא ניתן לחתום:', en: '🔒 Cannot sign yet:' },
  sign_name_ph:      { he: 'שם מלא…', en: 'Full name…' },
  sign_btn:          { he: '✍️ חתימה', en: '✍️ Sign' },
  gate_signed:       { he: '✔ השער חתום ונעול לעריכה.', en: '✔ Gate signed and locked for editing.' },
  unsign_btn:        { he: 'הסר חתימות לעריכה מחודשת', en: 'Remove signatures to re-edit' },
  sig_manager:       { he: 'מנהל ביצוע — שם, חתימה ותאריך:', en: 'Execution manager — name, signature, date:' },
  sig_supervisor:    { he: 'מפקח — שם, חתימה ותאריך:', en: 'Supervisor — name, signature, date:' },
  sig_signed:        { he: 'חתימה', en: 'Signature' },
  sig_not_signed:    { he: '— טרם נחתם —', en: '— Not signed yet —' },
  pad_hint:          { he: 'חתמו כאן באצבע / בעכבר', en: 'Sign here with finger / mouse' },
  pad_done:          { he: 'חתימה נקלטה', en: 'Signature captured' },
  pad_clear:         { he: 'נקה', en: 'Clear' },

  // summary
  sum_gate:          { he: 'שער', en: 'Gate' },
  sum_done:          { he: 'בוצע', en: 'Done' },
  sum_not_done:      { he: 'לא בוצע', en: 'Not done' },
  sum_na:            { he: 'לא רלוונטי', en: 'N/A' },
  sum_pending:       { he: 'טרם', en: 'Pending' },
  sum_pct:           { he: '% הושלם', en: '% complete' },
  sum_not_done_nos:  { he: 'סעיפים שסומנו "לא בוצע" (מספרי סעיף)', en: 'Items marked "Not done" (item numbers)' },

  // defect log
  dl_no:             { he: "מס'", en: '#' },
  dl_item:           { he: 'סעיף', en: 'Item' },
  dl_desc:           { he: 'תיאור הליקוי', en: 'Defect description' },
  dl_severity:       { he: 'חומרה', en: 'Severity' },
  dl_assignee:       { he: 'אחראי לתיקון', en: 'Assignee' },
  dl_due:            { he: 'תאריך יעד לתיקון', en: 'Due date' },
  dl_due_short:      { he: 'תאריך יעד', en: 'Due date' },
  dl_status:         { he: 'סטטוס', en: 'Status' },
  dl_closed_on:      { he: 'נסגר בתאריך', en: 'Closed on' },
  dl_closure:        { he: 'הערות / אסמכתא לסגירה', en: 'Notes / closure evidence' },
  dl_add:            { he: '✛ שורת ליקוי', en: '✛ Defect row' },
  dl_empty:          { he: 'אין ליקויים — כל סעיף שיסומן "לא בוצע" ייפתח כאן אוטומטית.', en: 'No defects — items marked "Not done" open here automatically.' },
  dl_delete:         { he: 'מחיקה', en: 'Delete' },

  // report
  rep_kicker:        { he: 'דוח תפיסת סיום שלב', en: 'Stage-gate report' },
  rep_house:         { he: 'לול', en: 'House' },
  rep_back:          { he: '→ חזרה ללול', en: '→ Back to house' },
  rep_copy:          { he: '📋 העתקת דוח למייל', en: '📋 Copy report for email' },
  rep_print:         { he: '📄 הדפסה / PDF', en: '📄 Print / PDF' },
  rep_copied:        { he: '✔ הדוח הועתק — פתחו מייל חדש והדביקו (Ctrl+V)', en: '✔ Report copied — open a new email and paste (Ctrl+V)' },
  rep_copy_failed:   { he: 'ההעתקה נכשלה — נסו שוב או השתמשו בהדפסה/PDF', en: 'Copy failed — try again or use Print/PDF' },
  rep_preparing:     { he: 'מכין דוח…', en: 'Preparing report…' },

  // concession dialog
  con_title:         { he: 'טופס ויתור (Concession)', en: 'Concession form' },
  con_defect:        { he: 'ליקוי #', en: 'Defect #' },
  con_note:          { he: "מז'ורי — רק עם טופס ויתור (Concession) בחתימה כפולה של מנהל הביצוע והמפקח.", en: 'Major — only with a concession double-signed by the execution manager and supervisor.' },
  con_reason:        { he: 'נימוק הוויתור', en: 'Concession rationale' },
  con_manager:       { he: 'מנהל ביצוע', en: 'Execution manager' },
  con_supervisor:    { he: 'מפקח', en: 'Supervisor' },
  con_submit:        { he: '✍️ אישור בחתימה כפולה', en: '✍️ Approve with double signature' },
  nav_tasks:         { he: 'משימות', en: 'Tasks' },
  qc_project:        { he: 'פרויקט', en: 'Project' },
  coops_count_ph:    { he: 'כמה לולים? (1)', en: 'How many? (1)' },

  // project-open tab
  po_title:          { he: 'פתיחת פרויקט — ממלאים פעם אחת', en: 'Project setup — filled once' },
  po_matrix_title:   { he: 'מטריצת אחריות — מי אחראי על מה בפרויקט הזה', en: 'Responsibility matrix — who owns what in this project' },
  po_project:        { he: 'פרויקט / אתר', en: 'Project / site' },
  po_farm_count:     { he: 'מספר לולים בחווה', en: 'Houses on the farm' },
  po_house_no:       { he: 'לול מספר (הקובץ הזה)', en: 'House number (this record)' },
  po_type:           { he: 'סוג לול', en: 'House type' },
  po_supplier:       { he: 'ספק ציוד גידול', en: 'Growing-equipment supplier' },
  po_heating:        { he: 'חימום (יש / אין)', en: 'Heating (yes / no)' },
  po_pads:           { he: 'מזרוני צינון (יש / אין)', en: 'Cooling pads (yes / no)' },
  po_shutter:        { he: 'תריס מאוורר מנהרה (יש / אין)', en: 'Tunnel-fan shutter (yes / no)' },
  po_manager:        { he: 'מנהל ביצוע', en: 'Execution manager' },
  po_supervisor:     { he: 'מפקח שטח', en: 'Field supervisor' },
  po_open_date:      { he: 'תאריך פתיחה', en: 'Opening date' },
  po_domain:         { he: 'תחום', en: 'Domain' },
  po_resp:           { he: 'אחריות', en: 'Responsibility' },
  po_external_who:   { he: 'גורם חיצוני (מי?)', en: 'External party (who?)' },
  po_notes:          { he: 'הערות', en: 'Notes' },
} as const

export type DKey = keyof typeof D
export const dt = (lang: Lang, k: DKey): string => D[k][lang]
export function useDT() {
  const { lang } = useI18n()
  return { lang, dt: (k: DKey) => D[k][lang] }
}

// ---------- localized option labels (stored ids stay canonical) ----------

const STATUS_EN: Record<ItemStatus, string> = { done: 'Done', not_done: 'Not done', na: 'N/A' }
const SEVERITY_EN: Record<Severity, string> = { critical: '🔴 Critical', major: '🟠 Major', minor: '🟡 Minor' }
const DSTATUS_EN: Record<DefectStatus, string> = { open: 'Open', closed: 'Closed' }
const COOP_EN: Record<CoopType, string> = { broiler: 'Broiler', layer: 'Layers', breeder: 'Breeders' }
const RESP_EN: Record<Responsible, string> = { agrotop: 'Agrotop', customer: 'Client', external: 'External party' }
const GATE_SHORT_EN: Record<GateKey, string> = {
  pre_pour: 'Pre-pour', gate1: 'Gate 1', gate2: 'Gate 2', gate3: 'Gate 3', gate4: 'Gate 4', gate5: 'Gate 5', gate6: 'Gate 6',
}

import {
  STATUS_LABELS, SEVERITY_LABELS, DEFECT_STATUS_LABELS, COOP_TYPE_LABELS,
  RESPONSIBLE_LABELS, YES_NO_LABELS, GATES,
} from './model'

export const statusLabel = (lang: Lang, s: ItemStatus) => lang === 'he' ? STATUS_LABELS[s] : STATUS_EN[s]
export const severityLabel = (lang: Lang, s: Severity) => lang === 'he' ? SEVERITY_LABELS[s] : SEVERITY_EN[s]
export const defectStatusLabel = (lang: Lang, s: DefectStatus) => lang === 'he' ? DEFECT_STATUS_LABELS[s] : DSTATUS_EN[s]
export const coopTypeLabel = (lang: Lang, s: CoopType) => lang === 'he' ? COOP_TYPE_LABELS[s] : COOP_EN[s]
export const responsibleLabel = (lang: Lang, s: Responsible) => lang === 'he' ? RESPONSIBLE_LABELS[s] : RESP_EN[s]
export const yesNoLabel = (lang: Lang, v: boolean) => lang === 'he' ? YES_NO_LABELS[v ? 'yes' : 'no'] : (v ? 'Yes' : 'No')
export const gateShortName = (lang: Lang, g: GateKey) => lang === 'he' ? GATES[g].shortName : GATE_SHORT_EN[g]

// Section titles / footnotes that live as Hebrew constants in model.ts (workbook
// chrome, not checklist content) — EN variants for the English UI.
import {
  STATUS_SUMMARY_TITLE, STATUS_SUMMARY_FOOTNOTE, DEFECT_LOG_TITLE,
  DEFECT_LOG_GOLDEN_RULE, PROJECT_OPEN_FOOTNOTES, RESP_DOMAINS, SIGNATURE_ROLES,
} from './model'

const RESP_DOMAIN_EN: Record<string, string> = {
  gas: 'Gas — connection, commissioning & approval',
  generator: 'Emergency generator & ATS',
  water_main: 'Main water line up to the system head',
  power_feed: 'Electricity — feed up to the main panel',
  electrician: 'Certified electrical inspector',
  grow_equipment: 'Growing equipment — commissioning & supplier approval',
  other: 'Other: ______',
}
const SIG_ROLE_EN: Record<string, string> = {
  manager: 'Execution manager — name, signature and date:',
  supervisor: 'Supervisor — name, signature and date:',
}

export const respDomainLabel = (lang: Lang, key: string): string =>
  lang === 'he'
    ? (RESP_DOMAINS.find((d) => d.key === key)?.label ?? key)
    : (RESP_DOMAIN_EN[key] ?? key)
export const signatureRoleLabel = (lang: Lang, key: string): string =>
  lang === 'he'
    ? (SIGNATURE_ROLES.find((r) => r.key === key)?.label ?? key)
    : (SIG_ROLE_EN[key] ?? key)

export const statusSummaryTitle = (lang: Lang) =>
  lang === 'he' ? STATUS_SUMMARY_TITLE : 'Status summary — house snapshot'
export const statusSummaryFootnote = (lang: Lang) =>
  lang === 'he' ? STATUS_SUMMARY_FOOTNOTE : '⚠ The summary updates automatically from the gate sheets. An item marked "Not done" opens a row in the defect log (pick a gate ← the item list adjusts to it).'
export const defectLogTitle = (lang: Lang) =>
  lang === 'he' ? DEFECT_LOG_TITLE : 'Defect log — every item marked "Not done" is recorded here'
export const defectLogGoldenRule = (lang: Lang) =>
  lang === 'he' ? DEFECT_LOG_GOLDEN_RULE : '⚠ Golden rule: no gate is signed with an open 🔴 defect. A 🟠 defect — only with a double-signed concession form. Gate 6 is not signed with any material defect open.'
export const projectOpenFootnotes = (lang: Lang): string[] =>
  lang === 'he' ? PROJECT_OPEN_FOOTNOTES : [
    '⚠ A domain marked "Client" or "External party" — the matching gate items are set "N/A" with a reference here.',
    '⚠ Per the configuration above: no heating → the heating item in Gate 5 = N/A. No shutter → the shutter item in Gate 4 = N/A. And so on.',
  ]
