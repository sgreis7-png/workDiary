-- Lightweight rate limiting for edge functions. Only the service role touches
-- this (RLS on, no policies). rl_check records an event and returns false when the
-- actor exceeded p_max events for p_action within the window.
create table if not exists rate_events (
  actor  text not null,
  action text not null,
  at     timestamptz not null default now()
);
create index if not exists rate_events_lookup on rate_events (actor, action, at);
alter table rate_events enable row level security;

create or replace function rl_check(p_actor text, p_action text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  delete from rate_events where at < now() - interval '1 day';
  select count(*) into cnt from rate_events
    where actor = p_actor and action = p_action and at > now() - make_interval(secs => p_window_seconds);
  if cnt >= p_max then return false; end if;
  insert into rate_events(actor, action) values (p_actor, p_action);
  return true;
end; $$;
