// Bilingual strings for the safety-log module. Topic labels are NOT here —
// they are admin-editable workbook content living in safety_topics.
import type { Lang } from '../i18n'

export const S = {
  nav_section_safety: { he: 'בטיחות', en: 'Safety' },
  nav_safety:         { he: 'יומן בטיחות', en: 'Safety log' },
  nav_safety_topics:  { he: 'נושאי הדרכת בטיחות', en: 'Safety topics' },

  list_title:     { he: 'יומן בטיחות — טופסי הדרכה יומית', en: 'Safety log — daily briefings' },
  list_new:       { he: 'טופס הדרכה חדש', en: 'New briefing form' },
  list_empty:     { he: 'אין עדיין טפסי הדרכה', en: 'No briefing forms yet' },
  list_all_projects: { he: 'כל הפרויקטים', en: 'All projects' },
  list_from:      { he: 'מתאריך', en: 'From' },
  list_to:        { he: 'עד תאריך', en: 'To' },
  list_worker:    { he: 'חיפוש עובד (שם או ת״ז)', en: 'Worker search (name or ID)' },
  list_signed:    { he: 'חתומים', en: 'signed' },

  form_title_new:  { he: 'טופס הדרכה יומי (Toolbox)', en: 'Daily briefing form (Toolbox)' },
  form_title_edit: { he: 'עריכת טופס הדרכה', en: 'Edit briefing form' },
  form_project:    { he: 'פרויקט', en: 'Project' },
  form_date:       { he: 'תאריך ההדרכה', en: 'Training date' },
  form_topics:     { he: 'נושאי ההדרכה שהועברו', en: 'Topics covered' },
  form_workers:    { he: 'עובדים', en: 'Workers' },
  form_add_worker: { he: '+ הוספת עובד', en: '+ Add worker' },
  form_name:       { he: 'שם העובד', en: 'Worker name' },
  form_id:         { he: 'תעודת זהות', en: 'ID number' },
  form_sign:       { he: 'חתימה', en: 'Sign' },
  form_signed:     { he: '✓ חתום', en: '✓ Signed' },
  form_remove:     { he: 'הסרה', en: 'Remove' },
  form_instructor: { he: 'המדריך', en: 'Instructor' },
  form_instr_name: { he: 'שם המדריך', en: 'Instructor name' },
  form_instr_qual: { he: 'כשירות המדריך', en: 'Instructor qualification' },
  form_need_project: { he: 'יש לבחור פרויקט', en: 'Pick a project' },
  form_need_worker:  { he: 'יש להוסיף לפחות עובד אחד', en: 'Add at least one worker' },
  form_draft_restored: { he: 'שוחזרה טיוטה שלא נשמרה', en: 'Unsaved draft restored' },

  sign_title:   { he: 'חתימת העובד', en: 'Worker signature' },
  sign_hint:    { he: 'נא לחתום באצבע בתוך המסגרת', en: 'Sign with your finger inside the frame' },
  sign_clear:   { he: 'ניקוי', en: 'Clear' },
  sign_confirm: { he: 'אישור חתימה', en: 'Confirm signature' },

  view_declares: {
    he: 'הנני מצהיר בזאת שנושאי ההדרכה היו ברורים ומובנים לי. הנני מתחייב לעבוד על פי הנחיות הבטיחות שהודרכתי עליהן. הנני מתחייב להשתמש בציוד המגן שסופק לי.',
    en: 'I hereby declare the briefing topics were clear to me. I commit to work by the safety instructions given and to use the protective equipment supplied.',
  },
  view_send:    { he: 'שליחה במייל', en: 'Send by mail' },
  view_edit:    { he: 'עריכה', en: 'Edit' },
  view_delete_confirm: { he: 'למחוק את טופס ההדרכה?', en: 'Delete this briefing form?' },

  topics_title: { he: 'ניהול נושאי הדרכה', en: 'Manage briefing topics' },
  topics_add:   { he: '+ נושא חדש', en: '+ New topic' },
  topics_active: { he: 'פעיל', en: 'Active' },
} as const

export type SKey = keyof typeof S
export const st = (lang: Lang, k: SKey): string => S[k]?.[lang] ?? String(k)
