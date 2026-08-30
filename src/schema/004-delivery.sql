-- Delivery and coverage.
--
-- **Two criterion sets, not one.** A spec states its criteria in `## Testing Strategy`; an
-- epic states different ones per story. The coverage matrix's job is joining them, which is
-- why `acceptance_criterion` and `story_criterion` are separate tables and `coverage` is the
-- join. Modelling only the spec side leaves that join with nothing on its right-hand side.
--
-- The FR21/FR26 decay triggers that keep `coverage.verified_at` and
-- `requirement.coverage_claimed_at` honest belong to Story 7 and are not created here. The
-- columns they write exist now; nothing sets them until then.
--
-- `test_approach` is a Story 2 vocabulary — the forward references from `criterion_approach`
-- and `story_criterion_approach` are legal at CREATE and unsatisfiable at write time until
-- that story lands.

CREATE TABLE story (
  id          TEXT NOT NULL PRIMARY KEY,
  epic_id     TEXT    NOT NULL,
  epic_kind   TEXT    NOT NULL DEFAULT 'epic' CHECK (epic_kind = 'epic'),
  number      INTEGER NOT NULL,
  title       TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','complete')),
  status_note TEXT,
  position    INTEGER NOT NULL,
  FOREIGN KEY (epic_id, epic_kind) REFERENCES document(id, kind) ON DELETE CASCADE,
  UNIQUE (epic_id, number)
);

CREATE TABLE task (
  id          TEXT NOT NULL PRIMARY KEY,
  story_id    TEXT NOT NULL REFERENCES story(id) ON DELETE CASCADE,
  number      INTEGER NOT NULL,
  title       TEXT    NOT NULL,
  description TEXT,
  status      TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','complete')),
  status_note TEXT,
  position    INTEGER NOT NULL,
  UNIQUE (story_id, number)
);

-- Spec-side criteria: the spec's own Testing Strategy table,
-- `| Requirement | Acceptance Criterion | Test Approach |`.
--
-- `polarity` is the sleeper. A negative criterion is written `must NOT — …` and recognised by
-- that prefix, a control case by the word `control`. Both are types carried in prose, in the
-- one artefact whose whole purpose is deciding whether the work is done.
CREATE TABLE acceptance_criterion (
  id              TEXT NOT NULL PRIMARY KEY,
  requirement_id  TEXT NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
  text            TEXT    NOT NULL,
  polarity        TEXT    NOT NULL DEFAULT 'must'
                    CHECK (polarity IN ('must','must_not','control')),
  position        INTEGER NOT NULL,
  UNIQUE (requirement_id, position)
);

CREATE TABLE criterion_approach (
  criterion_id  TEXT NOT NULL REFERENCES acceptance_criterion(id) ON DELETE CASCADE,
  tag           TEXT    NOT NULL REFERENCES test_approach(tag),
  PRIMARY KEY (criterion_id, tag)
);

-- Story-side criteria: the epic's `**Acceptance Criteria**:` bullets,
-- a DIFFERENT set from the spec's. The coverage matrix joins the two.
CREATE TABLE story_criterion (
  id          TEXT NOT NULL PRIMARY KEY,
  story_id    TEXT NOT NULL REFERENCES story(id) ON DELETE CASCADE,
  text        TEXT    NOT NULL,
  polarity    TEXT    NOT NULL DEFAULT 'must'
                CHECK (polarity IN ('must','must_not','control')),
  position    INTEGER NOT NULL,
  UNIQUE (story_id, position)
);

CREATE TABLE story_criterion_approach (
  story_criterion_id TEXT NOT NULL REFERENCES story_criterion(id) ON DELETE CASCADE,
  tag                TEXT    NOT NULL REFERENCES test_approach(tag),
  PRIMARY KEY (story_criterion_id, tag)
);

-- One row per matrix row: a VERBATIM FRAGMENT of a requirement bound to one
-- story criterion. A single requirement yields several rows — FR4 of spec 101
-- produces three, each independently verified.
--
-- **The natural key is `(requirement_id, spec_fragment, story_criterion_id)`, and `position`
-- is no part of it.** An earlier draft keyed on `position` instead of `spec_fragment` and was
-- wrong in both directions at once: it accepted the same fragment bound to the same criterion
-- twice at two positions — two identical rows, each independently verifiable, each counting
-- toward a roll-up — while rejecting two genuinely different fragments that happened to share
-- a position. Display order is not identity.
CREATE TABLE coverage (
  id                 TEXT NOT NULL PRIMARY KEY,
  requirement_id     TEXT NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
  spec_fragment      TEXT    NOT NULL,
  story_criterion_id TEXT NOT NULL REFERENCES story_criterion(id) ON DELETE CASCADE,
  position           INTEGER NOT NULL,   -- display order only; NOT part of identity
  verified_at        TEXT,            -- NULL = unverified; the ✓ column
  binding_hash       TEXT,            -- hash of (spec_fragment ‖ criterion text) at verification
  UNIQUE (requirement_id, spec_fragment, story_criterion_id),
  CHECK ((verified_at IS NULL) = (binding_hash IS NULL))
);

-- "Covered by: Story 2, Story 4" — a criterion may be delivered by more than
-- the story that declares it. Rare (3 rows in a 393-artefact corpus) but real.
CREATE TABLE coverage_story (
  coverage_id  TEXT NOT NULL REFERENCES coverage(id) ON DELETE CASCADE,
  story_id     TEXT NOT NULL REFERENCES story(id)    ON DELETE CASCADE,
  PRIMARY KEY (coverage_id, story_id)
);
