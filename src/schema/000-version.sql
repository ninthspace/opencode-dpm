-- Where the schema records how far it has been migrated (FR12).
--
-- Numbered `000` because it is the one file the runner cannot version: reading the current
-- version requires the table that holds it. So it is applied unconditionally on every start,
-- `IF NOT EXISTS` makes that idempotent, and version 0 is never recorded — it is the state a
-- database is in before any migration has run, not a migration.
--
-- One row per migration applied, rather than one row overwritten. `max(version)` is the
-- current version either way; what the row-per-migration form additionally holds is *when*
-- each step ran, which is the first thing anyone asks of a database that upgraded badly.
--
-- **`UNIQUE (version)` is not in the spec's DDL and is load-bearing.** The runner's contract
-- is that a migration is applied exactly once; without the constraint, applying one twice
-- records it twice and `max(version)` still reads correctly, so the failure is invisible in
-- the only column anyone would check. It is also this table's identity — nothing else here
-- distinguishes two rows.
CREATE TABLE IF NOT EXISTS schema_version (
  version     INTEGER NOT NULL,
  applied_at  TEXT    NOT NULL,
  UNIQUE (version)
);
