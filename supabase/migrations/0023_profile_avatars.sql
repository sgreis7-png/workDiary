-- Profile avatars + email on profiles (needed to map chat messages → avatar).
alter table profiles add column if not exists email text;
alter table profiles add column if not exists avatar_path text;

-- backfill emails for existing users
update profiles p set email = lower(u.email)
from auth.users u where u.id = p.id and p.email is null;

-- keep email in sync on signup
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare a public.allowed_emails;
begin
  select * into a from public.allowed_emails where lower(email) = lower(new.email);
  begin
    insert into public.profiles(id, role, name, active, email)
    values (new.id,
            coalesce(a.role, 'member'),
            coalesce(a.display_name, split_part(new.email, '@', 1)),
            coalesce(a.active, true),
            lower(new.email))
    on conflict (id) do update
      set role = excluded.role, name = excluded.name, active = excluded.active, email = excluded.email;
    update public.allowed_emails set registered = true where lower(email) = lower(new.email);
  exception when others then
    raise log 'handle_new_user failed for %: %', new.email, sqlerrm;
  end;
  return new;
end; $$;

-- users update their own profile (avatar, display name)
drop policy if exists update_own_profile on profiles;
create policy update_own_profile on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
