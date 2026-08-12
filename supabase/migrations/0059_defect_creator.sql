-- מי פתח את הליקוי. נלכד אוטומטית בעת ההכנסה מהאימייל שב-JWT של המשתמש —
-- ברירת מחדל של עמודה, לא טריגר, כך שאין פונקציה חדשה שדורשת ניהול הרשאות.
-- ליקויים היסטוריים נשארים ריקים: אין מקור אמין לשחזור (audit_log תיעד רק שיוך וסגירה).
alter table public.coop_defects
  add column if not exists created_by_email text default lower(auth.jwt()->>'email');
