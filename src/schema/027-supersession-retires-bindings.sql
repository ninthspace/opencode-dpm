-- FR6a — a superseded criterion and the bindings hanging off it go quiet together.
--
-- `025-coverage-retirement.sql` gave `story_criterion` its supersession pair, and epic 04-01 gave
-- `update_story_criterion` the arm that writes it. Neither touched `coverage`, so as things stand a
-- criterion nobody is claiming any more goes on carrying bindings that count toward its
-- requirement's completeness. That is the false pass FR6a names: a binding to a criterion the story
-- has stopped standing behind accounts for nothing, and a roll-up that counts it says the
-- requirement is covered by a rule the epic no longer claims to have delivered.
--
-- **A trigger rather than an arm of the tool, because the supersession is the event.** The retiring
-- is not something a caller does next and might not — it is what superseding a criterion *means*
-- for the rows underneath it. Put in the tool it would be one code path a caller can reach the
-- column without: a direct write, a restore replaying a dump, a later tool that sets the same
-- column. Here there is one answer and the schema gives it.
--
-- **The reason is composed, and this is the only retirement path where nobody supplies one.**
-- `coverage.retired_reason` is paired with `retired_at` by a `CHECK`, and `retire_coverage` refuses
-- a caller who omits it — that refusal being how a withdrawal stays a decision on the record rather
-- than a tidy-up (FR4). A trigger has no caller to refuse, so the reason it writes has to satisfy
-- exactly the constraint a caller's would. It can: `story_criterion.superseded_reason` is itself
-- paired by a `CHECK` on that table, so it is never null when `superseded_at` is set, and the
-- concatenation below is never null either. **That pairing one table over is what makes this
-- trigger legal**, and a future migration that unpaired it would break this one at a distance —
-- `document_section.superseded_at` is unpaired for reasons its own file gives, and is not this.
--
-- **`NEW.superseded_at IS NOT NULL` is a guard and not a formality.** `AFTER UPDATE OF` fires in
-- both directions, and `update_story_criterion` accepts an explicit null to clear a column — so
-- without it, un-superseding a criterion would retire the bindings that had survived the
-- supersession rather than the ones it withdrew. The `IS NOT` on the other side is `026`'s reason:
-- one side is null on every real supersession, and `<>` against null is null, so a trigger written
-- with it would never fire at all.
--
-- **`WHERE … retired_at IS NULL` keeps the pass idempotent and keeps the record.** A binding already
-- retired carries the reason whoever retired it wrote, and re-stamping it with this one would
-- replace the record of why with the record of a later, unrelated event. It is the same reason
-- `retire_coverage` refuses a second retirement instead of overwriting the first.
--
-- **What this does not do is unclaim, and it does not need to.** `026-retired-claim.sql` fires on
-- `coverage.retired_at`, and SQLite runs a trigger reached from inside another trigger's body — with
-- `recursive_triggers` both off and on, measured rather than assumed, as `011-decay.sql` measured
-- the same question for the claim triggers. So a requirement claimed before the supersession is
-- unclaimed by it, through the trigger that already owns that job. Duplicating the unclaim here
-- would be a second answer to it, and the two would drift.
--
-- Additive: a `CREATE TRIGGER` rebuilds no table, so no `-- dpm:rebuild`.

CREATE TRIGGER coverage_retire_on_criterion_supersession
AFTER UPDATE OF superseded_at ON story_criterion
WHEN OLD.superseded_at IS NOT NEW.superseded_at AND NEW.superseded_at IS NOT NULL
BEGIN
  UPDATE coverage
     SET retired_at = NEW.superseded_at,
         retired_reason = 'The criterion this bound was superseded: ' || NEW.superseded_reason
   WHERE story_criterion_id = NEW.id AND retired_at IS NULL;
END;
