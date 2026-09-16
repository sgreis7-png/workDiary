// Bilingual strings for the handover (מסירה) module. System labels are NOT here —
// they are admin-editable content living in handover_systems.
import type { Lang } from '../i18n'

export const S = {
  nav_section_handover: { he: 'מסירה', en: 'Handover' },
  nav_handover:        { he: 'טופסי מסירה', en: 'Handover forms' },
  nav_handover_systems: { he: 'ניהול מערכות מסירה', en: 'Handover systems' },

  list_title:        { he: 'מסירת פרויקטים', en: 'Project handovers' },
  list_new:          { he: 'מסירה חדשה', en: 'New handover' },
  list_empty:        { he: 'אין עדיין טופסי מסירה', en: 'No handover forms yet' },
  list_all_projects: { he: 'כל הפרויקטים', en: 'All projects' },
  list_from:         { he: 'מתאריך', en: 'From' },
  list_to:           { he: 'עד תאריך', en: 'To' },
  list_search:       { he: 'חיפוש לקוח / מקבל / אתר', en: 'Search customer / receiver / site' },
  list_bad:          { he: 'לא תקין', en: 'faults' },

  form_title_new:  { he: 'טופס מסירת פרויקט', en: 'Project handover form' },
  form_title_edit: { he: 'עריכת טופס מסירה', en: 'Edit handover form' },
  form_project:    { he: 'פרויקט', en: 'Project' },
  form_date:       { he: 'תאריך המסירה', en: 'Handover date' },
  form_client:     { he: 'שם הלקוח', en: 'Customer name' },
  form_site:       { he: 'מיקום האתר', en: 'Site location' },
  form_nature:     { he: 'מהות הפרויקט', en: 'Project scope' },
  form_attendees:  { he: 'נוכחים במעמד המסירה', en: 'Present at the handover' },
  form_att_name:   { he: 'שם', en: 'Name' },
  form_att_role:   { he: 'תפקיד', en: 'Role' },
  form_add_att:    { he: '+ הוספת נוכח', en: '+ Add attendee' },
  form_systems:    { he: 'מערכות', en: 'Systems' },
  form_system:     { he: 'מערכת', en: 'System' },
  form_status:     { he: 'תקין / לא תקין', en: 'OK / faulty' },
  form_ok:         { he: 'תקין', en: 'OK' },
  form_bad:        { he: 'לא תקין', en: 'Faulty' },
  form_note:       { he: 'הערות', en: 'Notes' },
  form_notes:      { he: 'הערות כלליות', en: 'General notes' },
  form_receiver:   { he: 'מקבל הפרויקט', en: 'Project receiver' },
  form_rec_name:   { he: 'שם מקבל הפרויקט', en: 'Receiver name' },
  form_rec_role:   { he: 'תפקיד', en: 'Role' },
  form_sign:       { he: 'חתימה', en: 'Sign' },
  form_remove:     { he: 'הסרה', en: 'Remove' },
  form_draft_restored: { he: 'שוחזרה טיוטה שלא נשמרה', en: 'Unsaved draft restored' },
  form_locked_hint: { he: 'טופס מסירה חתום ניתן לעריכה על ידי מנהל מערכת בלבד', en: 'A signed handover can only be edited by an administrator' },

  err_project:  { he: 'יש לבחור פרויקט', en: 'Pick a project' },
  err_header:   { he: 'יש למלא שם לקוח, מיקום אתר, מהות הפרויקט ותאריך', en: 'Customer, site, project scope and date are required' },
  err_attendee: { he: 'נדרש לפחות נוכח אחד עם שם ותפקיד', en: 'At least one attendee with a name and a role is required' },
  err_systems:  { he: 'יש לסמן תקין או לא תקין לכל המערכות', en: 'Every system must be marked OK or faulty' },
  err_receiver: { he: 'יש למלא שם מקבל הפרויקט, תפקיד וחתימה', en: 'Receiver name, role and signature are required' },

  sign_title:   { he: 'חתימת מקבל הפרויקט', en: 'Receiver signature' },

  view_warranty: {
    he: '* הפרויקט תחת שנת אחריות אחת מיום המסירה',
    en: '* The project carries one year of warranty from the handover date',
  },
  view_title:   { he: 'מסירת פרויקט', en: 'Project handover' },
  view_send:    { he: 'שליחה במייל', en: 'Send by mail' },
  view_edit:    { he: 'עריכה', en: 'Edit' },
  view_delete_confirm: { he: 'למחוק את טופס המסירה?', en: 'Delete this handover form?' },

  systems_title:  { he: 'ניהול מערכות מסירה', en: 'Manage handover systems' },
  systems_add:    { he: '+ מערכת חדשה', en: '+ New system' },
  systems_active: { he: 'פעיל', en: 'Active' },
} as const

export type HKey = keyof typeof S
export const ht = (lang: Lang, k: HKey): string => S[k]?.[lang] ?? String(k)
