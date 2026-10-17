-- חיבור Claude לקריאה בלבד — שרת MCP שמאפשר למנהלים לשאול את claude.ai על נתוני היומן.
-- הגישה היא אזור הרשאות חדש, 'claude': ברירת המחדל 'none' לכולם, והאדמין (שתמיד 'edit')
-- מפעיל אותו לכל אדם בנפרד במסך ההרשאות. אין כאן טבלאות חדשות — הכלים קוראים רק את מה
-- שהאדם רואה באפליקציה, דרך אותן מדיניות RLS.
--
-- perm_defaults נזרע ב-(role, area, level) כמו ב-0077; perms.sql.test.ts שומר על ההתאמה
-- ל-MEMBER_DEFAULTS / MANAGER_DEFAULTS ב-src/lib/perms.ts.

insert into perm_defaults (role, area, level) values
  ('member',  'claude', 'none'),
  ('manager', 'claude', 'none')
on conflict (role, area) do update set level = excluded.level;
