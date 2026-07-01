import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react'

export type Lang = 'he' | 'en'

const STRINGS = {
  brand_tag:      { he: 'פרויקטים חקלאיים בשיטת עד מפתח', en: 'Agriculture Turnkey Projects' },
  app_title:      { he: 'יומן עבודה', en: 'Work Diary' },
  app_sub:        { he: 'תיעוד יומי מהשטח', en: 'Daily field log' },

  nav_dashboard:  { he: 'סקירה', en: 'Dashboard' },
  dash_total:     { he: 'סה״כ רשומות', en: 'Total entries' },
  dash_week:      { he: 'השבוע', en: 'This week' },
  dash_month:     { he: 'החודש', en: 'This month' },
  dash_photos:    { he: 'תמונות שטח', en: 'Field photos' },
  dash_malfunctions: { he: 'בלת"מ החודש', en: 'Malfunctions this month' },
  dash_unsent:    { he: 'דוחות שלא נשלחו', en: 'Unsent reports' },
  dash_active_projects: { he: 'פרויקטים פעילים', en: 'Active projects' },
  dash_needs_update: { he: 'דורשים עדכון', en: 'Need update' },
  dash_stale:     { he: 'פרויקטים ללא דיווח', en: 'Projects without a report' },
  dash_no_stale:  { he: 'כל הפרויקטים מעודכנים', en: 'All projects up to date' },
  dash_last:      { he: 'אחרון', en: 'last' },
  dash_by_project: { he: 'רשומות לפי פרויקט', en: 'Entries by project' },
  dash_weather:   { he: 'מזג אוויר', en: 'Weather' },
  dash_by_worker: { he: 'רשומות לפי עובד', en: 'Entries by worker' },
  days:           { he: 'ימים', en: 'days' },

  nav_log:        { he: 'יומן', en: 'Logbook' },
  nav_calendar:   { he: 'לוח שנה', en: 'Calendar' },
  nav_new:        { he: 'רשומה חדשה', en: 'New entry' },
  nav_search:     { he: 'חיפוש', en: 'Search' },
  nav_lists:      { he: 'רשימות תפוצה', en: 'Distribution' },
  nav_projects:   { he: 'פרויקטים', en: 'Projects' },
  nav_fields:     { he: 'בונה הטופס', en: 'Form builder' },
  nav_users:      { he: 'משתמשים והרשאות', en: 'Users & permissions' },
  nav_admin:      { he: 'ניהול', en: 'Admin' },
  nav_export:     { he: 'ייצוא דוחות', en: 'Export' },
  nav_malfunctions: { he: 'בלת"מ', en: 'Malfunctions' },
  malf_count:       { he: 'בלת"מ', en: 'malfunctions' },
  malf_total:       { he: 'סה״כ בלת"מ בטווח', en: 'Total in range' },
  malf_by_dept:     { he: 'בלת"מ לפי מחלקה', en: 'By department' },
  malf_by_project:  { he: 'בלת"מ לפי פרויקט', en: 'By project' },
  malf_over_time:   { he: 'בלת"מ לאורך זמן', en: 'Over time' },

  login_title:    { he: 'כניסה למערכת', en: 'Sign in' },
  login_sub:      { he: 'מידע עסקי מאובטח — לעובדי אגרוטופ בלבד', en: 'Secured business data — Agrotop staff only' },
  email:          { he: 'דוא״ל', en: 'Email' },
  password:       { he: 'סיסמה', en: 'Password' },
  sign_in:        { he: 'כניסה', en: 'Sign in' },
  signing_in:     { he: 'מתחבר…', en: 'Signing in…' },

  save:           { he: 'שמירה', en: 'Save' },
  saving:         { he: 'שומר…', en: 'Saving…' },
  cancel:         { he: 'ביטול', en: 'Cancel' },
  edit:           { he: 'עריכה', en: 'Edit' },
  send_email:     { he: 'שליחת מייל', en: 'Send email' },
  search:         { he: 'חיפוש', en: 'Search' },
  add:            { he: 'הוספה', en: 'Add' },
  remove:         { he: 'הסרה', en: 'Remove' },

  project:        { he: 'פרויקט', en: 'Project' },
  all_projects:   { he: 'כל הפרויקטים', en: 'All projects' },
  user:           { he: 'עובד', en: 'Worker' },
  more_n:         { he: 'נוספים', en: 'more' },
  show_weekend:   { he: 'הצג שישי/שבת', en: 'Show Fri/Sat' },
  all_users:      { he: 'כל העובדים', en: 'All workers' },
  choose:         { he: 'בחירה', en: 'Choose' },
  required_field: { he: 'שדה חובה', en: 'Required' },
  optional:       { he: 'רשות', en: 'Optional' },
  add_photo:      { he: 'הוספת תמונה', en: 'Add photo' },
  photos_n:       { he: 'תמונות', en: 'photos' },
  at_least_one:   { he: 'נדרשת לפחות תמונה אחת', en: 'At least one photo required' },
  missing:        { he: 'חסרים שדות חובה', en: 'Missing required fields' },

  new_entry:      { he: 'רשומת יומן חדשה', en: 'New diary entry' },
  edit_entry:     { he: 'עריכת רשומה', en: 'Edit entry' },
  entries:        { he: 'רשומות', en: 'entries' },
  no_entries:     { he: 'אין רשומות עדיין', en: 'No entries yet' },
  load_more:      { he: 'טען עוד', en: 'Load more' },
  notifications:  { he: 'התראות', en: 'Notifications' },
  mark_all_read:  { he: 'סמן הכל כנקרא', en: 'Mark all read' },
  no_notifications: { he: 'אין התראות', en: 'No notifications' },
  offline:        { he: 'לא מקוון', en: 'Offline' },
  pending_sync:   { he: 'ממתינים לסנכרון', en: 'pending sync' },
  last_sent:      { he: 'נשלח לאחרונה', en: 'Last sent' },
  created_by:     { he: 'נרשם ע״י', en: 'Logged by' },
  view:           { he: 'צפייה', en: 'View' },

  from_date:      { he: 'מתאריך', en: 'From' },
  to_date:        { he: 'עד תאריך', en: 'To' },
  free_text:      { he: 'טקסט חופשי', en: 'Free text' },
  results_n:      { he: 'תוצאות', en: 'results' },
  malf_filter:    { he: 'בלת"מ', en: 'Malfunction' },
  malf_all:       { he: 'הכל', en: 'All' },
  malf_any:       { he: 'עם בלת"מ בלבד', en: 'Only malfunctions' },
  malf_none:      { he: 'ללא בלת"מ', en: 'No malfunction' },

  date:           { he: 'תאריך', en: 'Date' },
  role:           { he: 'תפקיד', en: 'Role' },
  role_admin:     { he: 'מנהל מערכת', en: 'Admin' },
  role_member:    { he: 'עובד', en: 'Member' },
  status:         { he: 'סטטוס', en: 'Status' },
  active:         { he: 'פעיל', en: 'Active' },
  inactive:       { he: 'לא פעיל', en: 'Inactive' },
  invite_user:    { he: 'הזמנת משתמש', en: 'Invite user' },
  permissions:    { he: 'הרשאות', en: 'Permissions' },
  send_to:        { he: 'נמענים', en: 'Recipients' },
  individuals:    { he: 'כתובות בודדות', en: 'Individual addresses' },
  sent:           { he: 'נשלח ✓', en: 'Sent ✓' },
  sign_out:       { he: 'יציאה', en: 'Sign out' },
  admin_only:     { he: 'מנהלי מערכת בלבד', en: 'Admins only' },

  register:        { he: 'הרשמה', en: 'Register' },
  first_time_q:    { he: 'פעם ראשונה? הרשמה וקביעת סיסמה', en: 'First time? Register & set password' },
  have_account_q:  { he: 'כבר רשום? כניסה', en: 'Already registered? Sign in' },
  set_password:    { he: 'קביעת סיסמה', en: 'Set password' },
  confirm_password:{ he: 'אימות סיסמה', en: 'Confirm password' },
  register_cta:    { he: 'הרשמה וכניסה', en: 'Register & enter' },
  registering:     { he: 'נרשם…', en: 'Registering…' },
  err_not_invited: { he: 'הדוא״ל לא מורשה. פנה למנהל המערכת.', en: 'Email not authorized. Contact your admin.' },
  err_already_reg: { he: 'הדוא״ל כבר רשום — היכנס עם הסיסמה.', en: 'Email already registered — sign in instead.' },
  err_pw_match:    { he: 'הסיסמאות אינן תואמות', en: 'Passwords do not match' },
  err_pw_short:    { he: 'סיסמה קצרה מדי (8 תווים לפחות)', en: 'Password too short (min 8 chars)' },
  err_must_reg:    { he: 'משתמש לא רשום — בצע הרשמה בפעם הראשונה.', en: 'Not registered yet — register first.' },
  err_bad_login:   { he: 'דוא״ל או סיסמה שגויים', en: 'Wrong email or password' },
  err_disabled:    { he: 'החשבון מושבת. פנה למנהל המערכת.', en: 'Account disabled. Contact your admin.' },
  rate_limited:    { he: 'יותר מדי ניסיונות. נסה שוב בעוד שעה.', en: 'Too many attempts. Try again in an hour.' },
  pending_reg:     { he: 'ממתין להרשמה', en: 'Pending registration' },
  registered_on:   { he: 'רשום', en: 'Registered' },
  authorize_email: { he: 'הרשאה לפי דוא״ל', en: 'Authorize by email' },
  authorize_hint:  { he: 'הוסף דוא״ל מורשה — העובד יקבע סיסמה בכניסה הראשונה', en: 'Add an authorized email — the worker sets a password on first login' },

  project_name:     { he: 'שם הפרויקט', en: 'Project name' },
  add_project:      { he: 'פרויקט חדש', en: 'New project' },
  edit_project:     { he: 'עריכת פרויקט', en: 'Edit project' },
  proj_location:    { he: 'מיקום', en: 'Location' },
  proj_budget:      { he: 'תקציב (₪)', en: 'Budget (₪)' },
  proj_pmo:         { he: 'מנהל פרויקט (PMO)', en: 'Project manager (PMO)' },
  proj_start:       { he: 'תאריך התחלה', en: 'Start date' },
  proj_end:         { he: 'תאריך סיום', en: 'End date' },
  proj_staff:       { he: 'צוות', en: 'Staff' },
  proj_notes:       { he: 'הערות', en: 'Notes' },
  assign_staff:     { he: 'שיוך עובדים', en: 'Assign staff' },
  my_priority:      { he: 'העדפה שלי', en: 'My priority' },
  company_priority: { he: 'עדיפות חברה', en: 'Company priority' },
  prio_none:        { he: 'ללא', en: 'None' },
  prio_low:         { he: 'נמוכה', en: 'Low' },
  prio_medium:      { he: 'בינונית', en: 'Medium' },
  prio_high:        { he: 'גבוהה', en: 'High' },
  prio_critical:    { he: 'קריטית', en: 'Critical' },
  copy_last:        { he: 'העתק מרשומה אחרונה', en: 'Copy last entry' },
  use_gps:          { he: 'מיקום GPS', en: 'Use GPS location' },
  delete_entry:     { he: 'מחיקה', en: 'Delete' },
  confirm_delete_entry: { he: 'למחוק רשומה זו לצמיתות? פעולה זו אינה הפיכה.', en: 'Delete this entry permanently? This cannot be undone.' },
  delete:           { he: 'מחיקה', en: 'Delete' },
  confirm_delete_project: { he: 'למחוק פרויקט זה ואת כל הדוחות שלו לצמיתות? פעולה זו אינה הפיכה.', en: 'Delete this project and ALL its reports permanently? This cannot be undone.' },
  copy_report:      { he: 'צור דוח למייל', en: 'Create email report' },
  open_report:      { he: 'דוח', en: 'Report' },
  print_pdf:        { he: 'הדפס / שמור PDF', en: 'Print / Save PDF' },
  back:             { he: 'חזרה', en: 'Back' },
  report_copied:    { he: 'הדוח הועתק ✓ — פתח מייל חדש (Outlook/Gmail), הדבק (Ctrl+V), הוסף נמענים ושלח', en: 'Report copied ✓ — open a new email, paste (Ctrl+V), add recipients, send' },
  copy_failed:      { he: 'ההעתקה נכשלה — נפתח דוח בכרטיסייה, בחר הכל והעתק', en: 'Copy failed — opened the report in a tab; select all and copy' },

  change_password:  { he: 'שינוי סיסמה', en: 'Change password' },
  update_password:  { he: 'עדכון סיסמה', en: 'Update password' },
  password_changed: { he: 'הסיסמה עודכנה ✓', en: 'Password updated ✓' },
  delete_user:      { he: 'מחיקה', en: 'Delete' },
  confirm_delete_user: { he: 'למחוק משתמש זה לצמיתות? פעולה זו אינה הפיכה.', en: 'Delete this user permanently? This cannot be undone.' },
  account:          { he: 'החשבון שלי', en: 'My account' },

  today:          { he: 'היום', en: 'Today' },
  entries_on_day: { he: 'רשומות ביום זה', en: 'entries this day' },
  delete_list:    { he: 'מחיקת רשימה', en: 'Delete list' },
  add_recipient:  { he: 'הוספת נמען', en: 'Add recipient' },
  no_recipients:  { he: 'אין נמענים', en: 'No recipients yet' },
} as const

export const MONTHS: Record<Lang, string[]> = {
  he: ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'],
  en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
}
export const WEEKDAYS: Record<Lang, string[]> = {
  he: ['א','ב','ג','ד','ה','ו','ש'],
  en: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
}

type Key = keyof typeof STRINGS

interface I18n { lang: Lang; dir: 'rtl' | 'ltr'; t: (k: Key) => string; setLang: (l: Lang) => void; toggle: () => void }
const Ctx = createContext<I18n>(null as unknown as I18n)
export const useI18n = () => useContext(Ctx)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('he')
  const dir = lang === 'he' ? 'rtl' : 'ltr'

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [lang, dir])

  const value = useMemo<I18n>(() => ({
    lang, dir,
    t: (k) => STRINGS[k][lang],
    setLang,
    toggle: () => setLang((l) => (l === 'he' ? 'en' : 'he')),
  }), [lang, dir])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
