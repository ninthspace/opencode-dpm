-- FR3 — the fifth unclaim trigger: a retirement withdraws the claim standing over the set it changed.
--
-- `011-decay.sql` built four, and `025-coverage-retirement.sql` recreated them verbatim through its
-- rebuild of `coverage`. They fire on a coverage insert, a coverage delete, a fragment edit and a
-- requirement text edit — **none of them on an update of `retired_at`**, because that column did not
-- exist when they were written. So between 025 and this file a retirement changes what
-- `claimHash` covers and leaves the claim over the old set reading as current, which is precisely the
-- false pass the decay triggers exist to remove.
--
-- **This trigger and `FRAGMENTS` in `src/coverage/claim.js` are two halves of one contract**, and the
-- file says so at greater length. The hash covers live rows; this fires when a row stops being one.
-- Either half alone is worse than neither: qualify the hash and omit the trigger, and a standing
-- claim silently changes what it was about; add the trigger and leave the hash unqualified, and the
-- withdrawn claim cannot be re-made because the digest still includes the row somebody just retired.
--
-- **Scoped to `NEW.requirement_id`, and the scoping is a criterion rather than a tidiness.** An
-- unscoped `UPDATE requirement SET coverage_claimed_at = NULL` satisfies every positive criterion in
-- the story that asks for this trigger, and quietly withdraws every other requirement's claim in the
-- project on any retirement anywhere. The control that catches it is a second requirement with a
-- standing claim and no retired binding.
--
-- **`IS NOT` and not `<>`, and that is not a style choice.** Every other decay trigger guards with
-- `WHEN OLD.text <> NEW.text` because a write that changed no bytes is not an edit. Here the old
-- value is `NULL` on every real retirement, and `NULL <> anything` evaluates to `NULL` rather than
-- true — so `<>` would build a trigger that never fires, passing registration and every DDL check
-- and failing silently at the only moment it matters. `IS NOT` is SQLite's null-safe inequality.
--
-- **Additive, so no `-- dpm:rebuild`.** A `CREATE TRIGGER` alters no table, so nothing here needs
-- foreign keys out of the way. Stated because the marker's cost is invisible: it moves
-- `PRAGMA foreign_keys = OFF` outside the per-migration transaction, and a migration that borrowed
-- it without needing it would suspend enforcement for no reason — which is how 025's `coverage_story`
-- rescue came to restore duplicate rows.

CREATE TRIGGER requirement_unclaim_on_coverage_retire
AFTER UPDATE OF retired_at ON coverage
WHEN OLD.retired_at IS NOT NEW.retired_at
BEGIN
  UPDATE requirement SET coverage_claimed_at = NULL, coverage_claim_hash = NULL
   WHERE id = NEW.requirement_id;
END;
