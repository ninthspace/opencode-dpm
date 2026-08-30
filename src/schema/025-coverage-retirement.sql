-- dpm:rebuild
--
-- FR1, FR3, FR4, NFR2, NFR4 — a coverage binding can be retired, and the natural key it held
-- goes back into circulation when it is.
--
-- `create_coverage` writes a row whose identity is `(requirement_id, spec_fragment,
-- story_criterion_id)`, and until now that key was held for the lifetime of the database. There is
-- no delete verb anywhere in the surface — 172 tools, every one create, read, update or list — so a
-- binding written against the wrong fragment could never be replaced by the right one: the correct
-- row is refused by the `UNIQUE` the incorrect row occupies. The workaround available without a
-- migration is to rewrite `spec_fragment` in place, which is worse than it looks. It edits the
-- record of what was bound rather than recording that the binding was withdrawn, and the register
-- afterwards cannot tell a correction from a fragment that was always that text.
--
-- **Retirement rather than deletion**, per AD 04-01, and the pair is `retired_at` /
-- `retired_reason` exactly as `artifact` and `observation` carry it (NFR4). A retired binding stays
-- readable by key and stops being offered; the reason is required rather than optional because
-- "bound to the wrong clause" and "the criterion it named was superseded" are the same column and
-- different facts, and only the second is a consequence of something else.
--
-- **Why a rebuild.** SQLite cannot alter a table-level constraint, and freeing the key means the
-- `UNIQUE (…)` has to become a partial unique index carrying `WHERE retired_at IS NULL` (AD 04-02).
-- `017-observation-quick.sql` is the precedent for the technique and `020-status-lifecycle.sql` for
-- the marker above, which moves `PRAGMA foreign_keys` outside this file's transaction — SQLite's own
-- twelve-step procedure — and runs `PRAGMA foreign_key_check` before the commit in place of the
-- enforcement that is off.
--
-- **The rebuilt DDL is `coverage` as it stands at version 24, not as `004-delivery.sql` first wrote
-- it.** That distinction is the trap in a rebuild and it is silent — a copy taken from the original
-- file drops whatever a later migration added, the copy succeeds, and the columns are simply gone.
-- Here nothing was added: no migration between 005 and 024 names `coverage` at all, so the text
-- below is `004`'s verbatim plus the retirement pair, and the `UNIQUE` line replaced by the index.
--
-- **Six triggers come down first, and two of them are not defined on `coverage`.** That is the
-- hazard rather than an inconvenience: `ALTER TABLE … RENAME TO` reparses every object in the
-- schema, and at the moment of the rename `coverage` does not exist — so a trigger whose *body*
-- names it fails the reparse and takes the whole migration with it. `coverage_unverify_on_criterion_
-- edit` fires on `story_criterion` and `coverage_unverify_on_requirement_edit` on `requirement`;
-- both write `coverage` and both must go. `requirement_unclaim_on_text_edit` names no `coverage`
-- and stays. All six are recreated below, verbatim from `011-decay.sql`.
--
-- **`coverage_story` is copied aside, cleared, and put back.** It cascades from `coverage`, and the
-- implicit delete a `DROP TABLE` performs is what would take it. The implicit delete fires no
-- triggers, and the same ids come back, so nothing downstream of it needs reindexing.
--
-- **The `DELETE` between the two halves is what makes the rescue correct rather than merely
-- careful, and it is the one thing here that a rebuild done by hand gets wrong.** `-- dpm:rebuild`
-- turns enforcement *off* for the duration, and a cascade is enforcement: with `foreign_keys = OFF`
-- the `DROP TABLE` takes the table and leaves every `coverage_story` row exactly where it was. So
-- the rescue's restore is not filling an empty table — it is inserting a second copy of rows that
-- never left, and `UNIQUE (coverage_id, story_id)` refuses it and rolls the whole migration back.
-- Clearing first makes the outcome the rescue's contents either way, which is the only version that
-- is right under both settings; a migration whose correctness depends on whether the cascade fired
-- is one nobody can reason about from the file.
--
-- **What this does to the claim hash, and what it does not do to any existing claim (NFR2).**
-- `claimHash` in `src/coverage/claim.js` hashes the bound fragment set of a requirement, and from
-- the release this migration ships in it hashes the **live** bindings only — a retired row is
-- excluded from the set a completeness claim is computed over, which is the whole point of retiring
-- it. That is a change to what a claim means, and it is stated here rather than discovered.
--
-- **No existing claim is invalidated by this migration.** It retires nothing: every row crosses with
-- `retired_at` NULL, so the live set and the whole set are the same set on the day it runs, and
-- every stored `coverage_claim_hash` still describes what it described before.
--
-- **The invalidation arrives with the claim work, and not from the triggers below.** Worth being
-- exact about, because the near-miss reads as true: the four `requirement_unclaim_*` triggers fire
-- on a coverage insert, a coverage delete, a fragment edit and a requirement text edit — none of
-- them on an update of `retired_at`. So retiring a binding changes the live set and, as this file
-- stands, leaves the claim over that set reading as current. Closing that is
-- `026-retired-claim.sql`, which adds the fifth trigger, alongside `claimHash` learning to qualify
-- to live rows.
--
-- **No project can observe the gap between the two, and it is worth saying why rather than leaving
-- the reassurance implicit.** Both files ship in the same release, so a database applies 025 and 026
-- inside one `start()`; there is no version at which a project's server has the retirement column
-- and not the trigger. The order still matters for anyone reading these files as history — the
-- rebuild has to precede the trigger that watches the rebuilt column — but it is not a window
-- anybody lives through.
--
-- **One refusal arrives here without being written here.** `retirement.js` derives its guards from
-- the schema — every foreign key into a table carrying a `retired_at` — so the moment `coverage` has
-- one, `coverage_story.coverage_id` acquires `coverage_story_coverage_id_not_retired_on_insert` and
-- `…_on_update`. A retired binding therefore cannot gain a new covering story. That is the right
-- reading of FR24's promise and it is emergent rather than declared, which is why it is named here:
-- the guards appear in a migrated and a freshly created schema alike, and `vocabulary.test.js`
-- derives the expected set from its own walk.

DROP TRIGGER IF EXISTS coverage_unverify_on_criterion_edit;
DROP TRIGGER IF EXISTS coverage_unverify_on_requirement_edit;
DROP TRIGGER IF EXISTS coverage_unverify_on_fragment_edit;
DROP TRIGGER IF EXISTS requirement_unclaim_on_coverage_insert;
DROP TRIGGER IF EXISTS requirement_unclaim_on_coverage_delete;
DROP TRIGGER IF EXISTS requirement_unclaim_on_fragment_edit;

CREATE TABLE coverage_story_rescue (
  coverage_id  TEXT NOT NULL,
  story_id     TEXT NOT NULL
);

INSERT INTO coverage_story_rescue (coverage_id, story_id)
  SELECT coverage_id, story_id FROM coverage_story;

-- Verbatim from `004-delivery.sql` but for the two new columns and the departed `UNIQUE`.
CREATE TABLE coverage_rebuilt (
  id                 TEXT NOT NULL PRIMARY KEY,
  requirement_id     TEXT NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
  spec_fragment      TEXT    NOT NULL,
  story_criterion_id TEXT NOT NULL REFERENCES story_criterion(id) ON DELETE CASCADE,
  position           INTEGER NOT NULL,   -- display order only; NOT part of identity
  verified_at        TEXT,            -- NULL = unverified; the ✓ column
  binding_hash       TEXT,            -- hash of (spec_fragment ‖ criterion text) at verification
  retired_at         TEXT,            -- NULL = live; a retired binding stays readable by key
  retired_reason     TEXT,
  CHECK ((verified_at IS NULL) = (binding_hash IS NULL)),
  CHECK ((retired_at IS NULL) = (retired_reason IS NULL))
);

INSERT INTO coverage_rebuilt (
  id, requirement_id, spec_fragment, story_criterion_id, position, verified_at, binding_hash,
  retired_at, retired_reason
)
  SELECT id, requirement_id, spec_fragment, story_criterion_id, position, verified_at, binding_hash,
         NULL, NULL
    FROM coverage;

DROP TABLE coverage;
ALTER TABLE coverage_rebuilt RENAME TO coverage;

DELETE FROM coverage_story;

INSERT INTO coverage_story (coverage_id, story_id)
  SELECT coverage_id, story_id FROM coverage_story_rescue;

DROP TABLE coverage_story_rescue;

-- The natural key, now constraining the live rows alone. A retired binding keeps its fragment and
-- its criterion — that is what makes it readable as a record of what was once bound — and stops
-- standing in the way of the row that replaces it. Two retired rows may repeat the key freely,
-- which is the case a plain `UNIQUE` cannot express and the reason this is an index at all.
CREATE UNIQUE INDEX coverage_binding
  ON coverage (requirement_id, spec_fragment, story_criterion_id)
  WHERE retired_at IS NULL;

-- Recreated verbatim from `011-decay.sql`, because the rebuild took the three defined on `coverage`
-- with the table and the three named above had to come down for the rename.
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

CREATE TRIGGER coverage_unverify_on_fragment_edit
AFTER UPDATE OF spec_fragment ON coverage
WHEN OLD.spec_fragment <> NEW.spec_fragment
BEGIN
  UPDATE coverage SET verified_at = NULL, binding_hash = NULL
   WHERE id = NEW.id;
END;

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

-- FR9's rule reaches the one prose column this change adds: `retired_reason` is prose a person
-- wrote, and nothing else on a coverage row can find the row by it — `spec_fragment` is a verbatim
-- copy indexed where it was written, and everything else is an id, an instant or a digest. So it is
-- indexed, on `artifact.retired_reason`'s precedent, and `read_coverage` is what makes a hit
-- openable (NFR7).
--
-- **Conditional, where `022-prose-index.sql`'s entities are not.** An artifact row nearly always
-- carries a description, so indexing every one costs nothing; a coverage row carries prose only once
-- it has been retired, and retiring one is rare. Unconditional triggers would put an entry holding
-- the empty string in the index for every binding in the project — 68 of them here — which is index
-- weight for rows that can never match. The `WHEN` is what keeps the index to the rows that have
-- something in them, and the update trigger clears the entry when a retirement is undone.
--
-- No backfill, and the reason rather than the omission: this migration retires nothing, so there is
-- no `retired_reason` anywhere to index. `022`'s backfill exists because its columns already held
-- text when it ran.
CREATE TRIGGER entry_fts_coverage_insert
AFTER INSERT ON coverage
WHEN NEW.retired_reason IS NOT NULL
BEGIN
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('coverage', NEW.retired_reason, NEW.id);
END;

CREATE TRIGGER entry_fts_coverage_update
AFTER UPDATE OF retired_reason ON coverage
BEGIN
  DELETE FROM entry_fts WHERE entity = 'coverage' AND entity_id = OLD.id;
  INSERT INTO entry_fts (entity, text, entity_id)
  SELECT 'coverage', NEW.retired_reason, NEW.id WHERE NEW.retired_reason IS NOT NULL;
END;

CREATE TRIGGER entry_fts_coverage_delete
AFTER DELETE ON coverage
BEGIN
  DELETE FROM entry_fts WHERE entity = 'coverage' AND entity_id = OLD.id;
END;

-- FR6, FR6a, FR7 — a story criterion an amendment has overtaken, and the decision that warrants one.
--
-- Additive, so no rebuild: `ALTER TABLE … ADD COLUMN` reaches all three, and a column constraint is
-- the one kind of `CHECK` SQLite will accept on one.
--
-- **`superseded_at` and not `retired_at`, per AD 04-04 and for `includeFlag`'s reason.** The word
-- has to be the one a caller would reach for, and `018-section-supersession.sql` already chose it
-- for the same situation one table over: a criterion is not spent and not out of the working set, it
-- has been overtaken by an amendment that now says it better. `include_superseded` is derived from
-- this column name rather than declared, and a third spelling of the same idea would earn a third
-- flag nobody asked for (NFR4).
--
-- **Paired, where `document_section.superseded_at` is not.** That column is unpaired because the
-- reconciled body *is* the reason and is a row someone can read. Nothing plays that part here — an
-- amendment that overtook a criterion leaves no artefact naming which criterion it overtook — so a
-- supersession with no reason would be a decision with no record of who made it or why, which is
-- what `019`'s pair exists to prevent. The `CHECK` rides on the second column because it needs both
-- to exist, for the reason `015-retro-waiver.sql` sets out at greater length.
--
-- **`warrant_adr_id` references `adr(document_id)` rather than `document(id, kind)`.** The kind is
-- already pinned one table away — `adr.document_kind` carries its own `CHECK` — so the pair that
-- every direct reference into `document` needs is not needed here, and `adr_option.adr_id` is the
-- precedent for the single-column form. It is nullable because most criteria are warranted by a
-- requirement and carry a coverage row instead; this column is for the ones that are warranted by a
-- decision and therefore have nothing to bind to, which the roll-up has until now been unable to
-- tell from a criterion nobody got round to binding.
ALTER TABLE story_criterion ADD COLUMN superseded_at TEXT;

ALTER TABLE story_criterion ADD COLUMN superseded_reason TEXT
  CHECK ((superseded_at IS NULL) = (superseded_reason IS NULL));

ALTER TABLE story_criterion ADD COLUMN warrant_adr_id TEXT REFERENCES adr(document_id);
