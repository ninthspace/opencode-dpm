-- Requirements — where type stops being a spelling.
--
-- Four shell parsers die on this table. `class` is what
-- `coverage_environmental_class()` derived from whether a label read `ENVn` or `ENVXn`;
-- `parent_id` is what `coverage_base_label()` reduced `FR1a` to `FR1` by string surgery;
-- `moscow` is what `coverage_spec_requirements()` read from the markdown heading a bullet sat
-- under; `exclusion` is what `coverage_spec_scope_deferrals()` inferred from where a name was
-- mentioned. `label` survives as a display string only, and nothing reads it to determine
-- meaning — which is FR4 stated as a schema property rather than a rule to remember.

CREATE TABLE requirement (
  id            TEXT NOT NULL PRIMARY KEY,
  spec_id       TEXT    NOT NULL,
  spec_kind     TEXT    NOT NULL DEFAULT 'spec' CHECK (spec_kind = 'spec'),
  label         TEXT    NOT NULL,                  -- display only: 'FR1','NFR3','ENVX2'
  class         TEXT    NOT NULL CHECK (class IN (
                  'functional','non_functional',
                  'environmental_requirement','environmental_restriction')),
  moscow        TEXT    CHECK (moscow IN ('must','should','could','wont')),
  exclusion     TEXT    CHECK (exclusion IN ('deferred','out_of_scope')),
  parent_id     TEXT REFERENCES requirement(id),  -- FR1a's parent is FR1
  text          TEXT    NOT NULL,
  position      INTEGER NOT NULL,
  -- FR26. NULL = nobody has claimed the bindings account for this requirement.
  -- Set together, cleared together, by the Story 7 triggers.
  coverage_claimed_at TEXT,
  coverage_claim_hash TEXT,   -- hash of the bound fragment set at claim time
  FOREIGN KEY (spec_id, spec_kind) REFERENCES document(id, kind) ON DELETE CASCADE,
  UNIQUE (spec_id, label),
  CHECK ((coverage_claimed_at IS NULL) = (coverage_claim_hash IS NULL))
);
