-- דוח רמזור שלב ב׳ — סגירת שני ממצאים מסקירת 0071 (customer_commitments).
--
-- 0071 כבר הוחלה על הפרויקט החי ואסור לערוך אותה; שני התיקונים נעשים כאן.

-- ---------- 1. the notice fields are the PMO's record ----------
-- ההודעה הכתובה ללקוח היא ההגנה החוזית על הארכת זמן. מנהל הפרויקט מתחזק את
-- ההתחייבות עצמה, אבל לא את הרישום שההודעה נשלחה — זה בדיוק הצד שההודעה מגנה מפניו.
create or replace function customer_commitments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := lower(coalesce(auth.jwt() ->> 'email', 'system'));
  if is_admin() or can_edit('traffic_light') then return new; end if;
  if tg_op = 'UPDATE' then
    new.project_id     := old.project_id;
    new.notice_sent_on := old.notice_sent_on;
    new.notice_ref     := old.notice_ref;
  else
    new.notice_sent_on := null;
    new.notice_ref     := null;
  end if;
  return new;
end $$;
drop trigger if exists customer_commitments_guard_trg on customer_commitments;
create trigger customer_commitments_guard_trg before insert or update on customer_commitments
  for each row execute function customer_commitments_guard();

-- ---------- 2. narrow the read policy to the traffic-light area ----------
-- 0067 נתנה ל-issues את אותה צורה: זה לא טופס היומן, זה מסך הרמזור, ואבני דרך
-- לתשלום והפניות הודעה משפטיות אינן מיועדות לכל חבר.
drop policy if exists read_customer_commitments on customer_commitments;
create policy read_customer_commitments on customer_commitments for select
  using (can_view('traffic_light') or is_project_manager(project_id));
