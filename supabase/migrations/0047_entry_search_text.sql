-- Text search was running in the browser: the client fetched every entry in the date range,
-- signed a URL for every photo of every one of them, and only then filtered by the search term
-- in JavaScript. On a year of entries that is the whole diary over the wire per keystroke.
--
-- The exact matching rules stay in the client (src/data.ts entryMatchesText — it looks inside
-- the report tables, which are stored as JSON strings, and matches cell contents rather than
-- JSON syntax). What moves here is the narrowing: a column Postgres can index, holding the
-- entry's searchable text.
--
-- The client sends one `values_text ilike '%token%'` per whitespace-separated token. That is a
-- guaranteed superset of what entryMatchesText accepts — a token has no spaces, so it cannot
-- straddle two table cells, and every character the client searches is present in this text —
-- and the client then applies the exact predicate to what comes back. A superset is the whole
-- safety argument: the server may return too much, never too little.

alter table entries
  add column if not exists values_text text
  generated always as (values::text) stored;

comment on column entries.values_text is
  'Searchable text of `values`, maintained by Postgres. Filter on it; never display it — it is '
  'raw JSON, and the client owns the exact match rules. Costs a second copy of `values` per row, '
  'which is the price of having an index at all.';

-- Trigram index, because the search is a substring match (`%term%`), which btree cannot serve.
create extension if not exists pg_trgm with schema extensions;

create index if not exists entries_values_text_trgm
  on entries using gin (values_text extensions.gin_trgm_ops);

-- work_date drives every listing and every date filter, and it is what the diary orders by.
create index if not exists entries_work_date_desc on entries (work_date desc);
create index if not exists entries_project_work_date on entries (project_id, work_date desc);
