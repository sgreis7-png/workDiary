-- מסירה — נעילת המערכות המובנות בבסיס הנתונים, לא רק במסך.
--
-- 0079 סימן 14 השורות של טופס 70 כ-builtin ומנע מהן delete, אבל ה-update policy שלה
-- בדקה is_admin() גולמי ב-with check: אדמין יכול update handover_systems set builtin = false
-- where label = 'אוורור' ואז למחוק את השורה, או סתם לשנות את השם. ה-input readOnly שהתווסף
-- למסך לאחרונה הוא שער בממשק מעל כלל שחסר בבסיס הנתונים — מי שיודע SQL עוקף אותו בלי
-- לגעת בקוד. כאן זה נחסם בטריגר: אם השורה builtin, אסור לגעת ב-builtin או ב-label שלה,
-- אדמין כולל. הסתרה נשארת דרך active, כמתועד ב-0079.
--
-- 0079 גם השאירה את שתי המדיניות update/delete של יוצר בלי is_member() ובלי
-- can_edit('handover') — מי שאיבד את ההרשאה, או הוצא מהארגון בזמן שה-JWT שלו עוד חי,
-- ממשיך למחוק ולשנות שם לשורות שמופיעות בטופס של כל אחד. כל טבלה אחרת במאגר דורשת
-- is_member(); כאן זה מתוקן לשתי המדיניות של שני הקטלוגים.
--
-- מקביל ל-src/handover/builtin.sql.test.ts, שמוודא שהטריגר קיים על שתי הטבלאות ושתנאי
-- ה-author policy כולל is_member() ו-can_edit('handover').

-- ---- 1. טריגר: שורה builtin לא זזה ולא מתחלפת שם ----
create or replace function handover_catalogue_builtin_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.builtin and (new.builtin is distinct from old.builtin or new.label is distinct from old.label) then
    raise exception 'handover_catalogue_builtin_guard: a built-in row cannot be renamed or unmarked';
  end if;
  return new;
end $$;

drop trigger if exists handover_systems_builtin_guard_trg on handover_systems;
create trigger handover_systems_builtin_guard_trg before update on handover_systems
  for each row execute function handover_catalogue_builtin_guard();

drop trigger if exists handover_extra_fields_builtin_guard_trg on handover_extra_fields;
create trigger handover_extra_fields_builtin_guard_trg before update on handover_extra_fields
  for each row execute function handover_catalogue_builtin_guard();

-- ---- 2. author branch של update/delete דורש חברות בארגון והרשאת עריכה ----
drop policy if exists update_handover_systems on handover_systems;
create policy update_handover_systems on handover_systems for update
  using (is_admin() or (is_member() and can_edit('handover') and created_by = auth.uid() and builtin = false))
  with check (is_admin() or (is_member() and can_edit('handover') and created_by = auth.uid() and builtin = false));

drop policy if exists delete_handover_systems on handover_systems;
create policy delete_handover_systems on handover_systems for delete
  using (builtin = false and (is_admin() or (is_member() and can_edit('handover') and created_by = auth.uid())));

drop policy if exists update_handover_extra_fields on handover_extra_fields;
create policy update_handover_extra_fields on handover_extra_fields for update
  using (is_admin() or (is_member() and can_edit('handover') and created_by = auth.uid() and builtin = false))
  with check (is_admin() or (is_member() and can_edit('handover') and created_by = auth.uid() and builtin = false));

drop policy if exists delete_handover_extra_fields on handover_extra_fields;
create policy delete_handover_extra_fields on handover_extra_fields for delete
  using (builtin = false and (is_admin() or (is_member() and can_edit('handover') and created_by = auth.uid())));
