-- דוח רמזור — שלב א׳: תשתית נתונים.
--
-- הצבע נגזר מספים מספריים בלבד (traffic_light_settings), ומחושב בפונקציה אחת
-- (0065). כאן: העמודות והטבלאות שהפונקציה קוראת, ההרשאות, והטריגרים שהופכים
-- רשומת יומן לפריט במרשם הבלת"מ ולסימון "הגיע לאתר".

-- ---------- 1. perm areas ----------
insert into perm_defaults (role, area, level) values
  ('member',  'traffic_light', 'none'),
  ('manager', 'traffic_light', 'edit'),
  ('member',  'deliveries',    'none'),
  ('manager', 'deliveries',    'none')
on conflict (role, area) do update set level = excluded.level;
