-- Chat attachments + realtime delivery.

-- attachment riding on the message row; the object lives in the photos bucket
-- under chat/<uuid>-<name>, unguessable and served via short signed URLs
alter table user_messages add column if not exists attachment_path text;
alter table user_messages add column if not exists attachment_name text;
alter table user_messages add column if not exists attachment_type text;

-- realtime: the messages screen subscribes to INSERTs instead of polling every
-- 30s. postgres_changes respects RLS, so a client only receives rows its
-- select policies (read_own_messages / read_group_messages) let it see.
do $$ begin
  alter publication supabase_realtime add table user_messages;
exception when duplicate_object then null;
end $$;
