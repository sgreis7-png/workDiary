import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react'

export type Lang = 'he' | 'en'

const STRINGS = {
  brand_tag:      { he: 'פרויקטים חקלאיים בשיטת עד מפתח', en: 'Agriculture Turnkey Projects' },
  app_title:      { he: 'יומן עבודה', en: 'Work Diary' },
  app_sub:        { he: 'תיעוד יומי מהשטח', en: 'Daily field log' },

  nav_log:        { he: 'יומן', en: 'Logbook' },
  nav_new:        { he: 'רשומה חדשה', en: 'New entry' },
  nav_search:     { he: 'חיפוש', en: 'Search' },
  nav_lists:      { he: 'רשימות תפוצה', en: 'Distribution' },
  nav_projects:   { he: 'פרויקטים', en: 'Projects' },
  nav_fields:     { he: 'בונה הטופס', en: 'Form builder' },
  nav_users:      { he: 'משתמשים והרשאות', en: 'Users & permissions' },
  nav_admin:      { he: 'ניהול', en: 'Admin' },

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
  last_sent:      { he: 'נשלח לאחרונה', en: 'Last sent' },
  created_by:     { he: 'נרשם ע״י', en: 'Logged by' },
  view:           { he: 'צפייה', en: 'View' },

  from_date:      { he: 'מתאריך', en: 'From' },
  to_date:        { he: 'עד תאריך', en: 'To' },
  free_text:      { he: 'טקסט חופשי', en: 'Free text' },
  results_n:      { he: 'תוצאות', en: 'results' },

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
} as const

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
