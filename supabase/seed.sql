-- Production-safe deterministic seed. User-owned rows are created only by the
-- auth.users trigger or explicit tests; no account, role, credential, or secret
-- is seeded into production data.
select 1;
