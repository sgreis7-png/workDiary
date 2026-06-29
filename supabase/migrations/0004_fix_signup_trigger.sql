-- Fix "Database error saving new user": the security-definer trigger ran with a
-- restricted search_path and could not resolve unqualified table names, throwing
-- inside the auth.users insert. Pin search_path, schema-qualify everything, and
-- guard the body so a profile-write hiccup can never block account creation
-- (role/active are read from allowed_emails, so login still works regardless).
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.allowed_emails;
begin
  select * into a from public.allowed_emails where lower(email) = lower(new.email);
  begin
    insert into public.profiles(id, role, name, active)
    values (new.id,
            coalesce(a.role, 'member'),
            coalesce(a.display_name, split_part(new.email, '@', 1)),
            coalesce(a.active, true))
    on conflict (id) do update
      set role = excluded.role, name = excluded.name, active = excluded.active;
    update public.allowed_emails set registered = true where lower(email) = lower(new.email);
  exception when others then
    raise log 'handle_new_user failed for %: %', new.email, sqlerrm;
  end;
  return new;
end; $$;

-- same hardening for the helper functions that read by jwt email
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.allowed_emails ae
    where lower(ae.email) = lower(auth.jwt() ->> 'email')
      and ae.role = 'admin' and ae.active
  );
$$;

create or replace function me()
returns table(role text, active boolean, name text)
language sql stable security definer set search_path = public as $$
  select coalesce(ae.role, 'member'),
         coalesce(ae.active, true),
         coalesce(p.name, split_part(auth.jwt() ->> 'email', '@', 1))
  from (select 1) x
  left join public.allowed_emails ae on lower(ae.email) = lower(auth.jwt() ->> 'email')
  left join public.profiles p on p.id = auth.uid();
$$;
grant execute on function me() to authenticated;
