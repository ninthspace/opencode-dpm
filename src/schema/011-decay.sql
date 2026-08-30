-- Decay: verification and completeness expire when the text they were bound to changes.
--
-- Verification is bound to text, and text changes silently. Every coverage matrix CPM has ever
-- written carries this rule in prose — "any change to a story criterion or its spec mapping
-- resets that row to unverified" — and prose is exactly what does not fire when someone edits
-- a sentence. These triggers are the schema-level statement of it.
--
-- **There are three edit paths, not two, and counting them wrong is how this stayed broken
-- across drafts.** FR21 names "the requirement fragment or the story criterion", and the
-- fragment is not `requirement.text` — it is `coverage.spec_fragment`, a stored verbatim slice,
-- which is also half of what `binding_hash` hashes. A draft carrying only the two triggers on
-- `requirement.text` and `story_criterion.text` left the fragment editable with the ✓ intact:
-- the row kept `verified_at` and a `binding_hash` computed over text that had been replaced.
-- The rule to hold on to is that **a trigger must watch every column the binding is computed
-- from**, and the binding is computed from two texts held in three places.
--
-- `WHEN OLD.text <> NEW.text` on every one of them is not an optimisation. A trigger that
-- cleared on any write satisfies every decay criterion below and makes the mark worthless —
-- false-pass register #18 — so the byte-identical control is a criterion rather than a nicety.

CREATE TRIGGER coverage_unverify_on_criterion_edit
AFTER UPDATE OF text ON story_criterion
WHEN OLD.text <> NEW.text
BEGIN
  UPDATE coverage SET verified_at = NULL, binding_hash = NULL
   WHERE story_criterion_id = NEW.id;
END;

CREATE TRIGGER coverage_unverify_on_requirement_edit
AFTER UPDATE OF text ON requirement
WHEN OLD.text <> NEW.text
BEGIN
  UPDATE coverage SET verified_at = NULL, binding_hash = NULL
   WHERE requirement_id = NEW.id;
END;

-- The third edit path, and the one an earlier draft missed: the fragment is a stored copy, so
-- rewriting it changes what was verified without touching either table the two triggers above
-- watch.
CREATE TRIGGER coverage_unverify_on_fragment_edit
AFTER UPDATE OF spec_fragment ON coverage
WHEN OLD.spec_fragment <> NEW.spec_fragment
BEGIN
  UPDATE coverage SET verified_at = NULL, binding_hash = NULL
   WHERE id = NEW.id;
END;

-- FR26. The three triggers above decay one row's ✓; these four decay the claim that the rows,
-- as a set, account for the requirement. That is false-pass #17 with the sign flipped from #1:
-- every coverage row can be current and correct while four of a requirement's five obligations
-- have no row at all, and the roll-up reports it covered. The set changes when a row arrives,
-- when one leaves, when a fragment is rewritten, and when the text being accounted for is
-- itself edited — four events, four triggers.
CREATE TRIGGER requirement_unclaim_on_coverage_insert
AFTER INSERT ON coverage
BEGIN
  UPDATE requirement SET coverage_claimed_at = NULL, coverage_claim_hash = NULL
   WHERE id = NEW.requirement_id;
END;

CREATE TRIGGER requirement_unclaim_on_coverage_delete
AFTER DELETE ON coverage
BEGIN
  UPDATE requirement SET coverage_claimed_at = NULL, coverage_claim_hash = NULL
   WHERE id = OLD.requirement_id;
END;

CREATE TRIGGER requirement_unclaim_on_fragment_edit
AFTER UPDATE OF spec_fragment ON coverage
WHEN OLD.spec_fragment <> NEW.spec_fragment
BEGIN
  UPDATE requirement SET coverage_claimed_at = NULL, coverage_claim_hash = NULL
   WHERE id = NEW.requirement_id;
END;

-- This one updates the table it fires on, which is safe and was verified with
-- `recursive_triggers` both off and on: it watches `text` and writes only the two claim
-- columns, so the inner statement matches no `UPDATE OF text` and cannot re-enter it. The
-- three `coverage` triggers are likewise disjoint from `coverage_unverify_*`, which write
-- `verified_at` and `binding_hash` and match no `UPDATE OF spec_fragment`.
CREATE TRIGGER requirement_unclaim_on_text_edit
AFTER UPDATE OF text ON requirement
WHEN OLD.text <> NEW.text
BEGIN
  UPDATE requirement SET coverage_claimed_at = NULL, coverage_claim_hash = NULL
   WHERE id = NEW.id;
END;
