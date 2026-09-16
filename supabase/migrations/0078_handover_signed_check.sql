-- 0077 מגביל update/delete על handover_forms לאדמין בלבד, בהנחה שכל שורה קיימת היא כבר
-- מסמך חתום. ההנחה הזו נאכפת רק בצד הלקוח (validateHandover ב-src/handover/model.ts):
-- מדיניות ה-insert של 0077 בודקת can_edit('handover') and created_by = auth.uid() בלבד,
-- כך שכל חבר עם הרשאת עריכה יכול לפנות ישירות ל-PostgREST ולשמור מסירה בלי חתימה, בלי
-- נוכחים ובלי מערכות מסומנות — ואז רק אדמין יכול למחוק אותה.
--
-- ה-constraint כאן מראה בדיוק אחרי validateHandover: כל שדה שהוולידציה דורשת חייב להיות
-- מלא/לא ריק גם בבסיס הנתונים, כדי שהנחת "כל שורה חתומה" תהיה אמת גם כשמדלגים על המסך.
alter table handover_forms drop constraint if exists handover_forms_signed_check;
alter table handover_forms add constraint handover_forms_signed_check check (
  receiver_signature is not null
  and signed_at is not null
  and jsonb_array_length(attendees) > 0
  and jsonb_array_length(systems) > 0
  and btrim(receiver_name) <> ''
  and btrim(receiver_role) <> ''
  and btrim(client_name) <> ''
  and btrim(site_location) <> ''
  and btrim(project_nature) <> ''
);
