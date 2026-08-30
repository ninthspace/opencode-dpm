-- FR25 — whether a completed epic needs a retro is a column, not a marker.
--
-- CPM's `/cpm:retro triage` writes `**Retro waived**: {date} — {reason}` into the epic's header
-- block, immediately after `**Status**:`, and `/cpm:status` and the board grep for it to stop
-- nagging that epic as "retro pending". That is three consumers of one prose line: the writer, the
-- reader, and the idempotency guard that scans for it before writing a second.
--
-- The pair is nullable and CHECK-paired, exactly as `observation.retired_at` /
-- `retired_reason` are, so the same reading applies: a waiver without a reason is a decision with
-- no record of who made it or why, and a reason without a date is a note. Waiving stays reversible
-- by clearing both, which is what CPM achieves by deleting the marker line.
--
-- **On `document` rather than on an epic detail table.** Only epics are waived today, but there is
-- no `epic` detail table to put it in, and one whose every column is nullable would be an empty row
-- for each of the epics nobody waived — the opposite of the rule `DETAIL` states, where a detail row
-- exists because it carries something `NOT NULL`. `retro_application.applied_to_id` is deliberately
-- un-kind-pinned for the same reason; a retro's relationship to another document is not a property
-- of one kind.
--
-- **A new file rather than an edit to `001-identity.sql`**, per the forward-only rule migrate.js
-- states and `014-story-plan.sql` follows.
--
-- The CHECK rides on the second column because it needs both to exist. SQLite applies a CHECK
-- added this way to the whole row, not only to the column it is written against, so the pairing is
-- enforced by the schema here as it is on `observation` — a waiver written with one half is
-- refused rather than stored. Adding it to the first column would be a constraint on a column the
-- table does not have yet.
ALTER TABLE document ADD COLUMN retro_waived_at TEXT;
ALTER TABLE document ADD COLUMN retro_waived_reason TEXT
  CHECK ((retro_waived_at IS NULL) = (retro_waived_reason IS NULL));
