-- תיקון ברירת המחדל של ימי עבודה: ראשון-שישי (0-5), לא ראשון-חמישי.
--
-- כל הפרויקטים שעדיין נושאים את ברירת המחדל הישנה מעודכנים יחד איתה —
-- אף אחד עוד לא בחר ימים ידנית, אז ההשוואה המדויקת בטוחה.

alter table projects alter column work_days set default '{0,1,2,3,4,5}';

update projects set work_days = '{0,1,2,3,4,5}' where work_days = '{0,1,2,3,4}';

create or replace function is_work_day(p_project uuid)
returns boolean
language sql stable set search_path = public as $$
  select extract(dow from now() at time zone 'Asia/Jerusalem')::int = any (
    coalesce((select work_days from projects where id = p_project), '{0,1,2,3,4,5}'::int[]))
$$;
revoke all on function is_work_day(uuid) from public;
revoke execute on function is_work_day(uuid) from anon, authenticated;
