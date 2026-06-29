-- Public bucket for brand assets (the logo used in report emails).
insert into storage.buckets (id, name, public) values ('brand', 'brand', true)
  on conflict (id) do update set public = true;

create policy "public read brand"
  on storage.objects for select using (bucket_id = 'brand');
create policy "auth write brand"
  on storage.objects for insert with check (bucket_id = 'brand' and auth.role() = 'authenticated');
