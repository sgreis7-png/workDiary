-- Remove the temporary diagnostics added in 0032.
-- Outcome of that investigation: the policies were correct all along. The
-- refusal seen while testing came from `Prefer: return=representation`, which
-- makes Postgres apply the SELECT policy to the RETURNING row — and a
-- notification addressed to someone else is deliberately not readable.
drop function if exists diag_notifs();
drop function if exists diag_checks(text);
