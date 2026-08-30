-- Milestones — the build order as rows (FR27).

-- A specification's build order. Scoped to the spec, ordered within it, and
-- joined to the artefacts that deliver it — an epic may span more than one.
--
-- Scoped to a spec rather than global, and not a `taxonomy` row: milestones are one
-- specification's build order, so two specs may both have an `M1` meaning different things.
-- `UNIQUE (spec_id, label)` permits that and `UNIQUE (spec_id, position)` keeps the order
-- total within each.
CREATE TABLE milestone (
  id          TEXT    NOT NULL PRIMARY KEY,
  spec_id     TEXT    NOT NULL,
  spec_kind   TEXT    NOT NULL DEFAULT 'spec' CHECK (spec_kind = 'spec'),
  label       TEXT    NOT NULL,      -- 'M1'
  title       TEXT    NOT NULL,      -- 'Substrate'
  summary     TEXT,
  position    INTEGER NOT NULL,
  FOREIGN KEY (spec_id, spec_kind) REFERENCES document(id, kind) ON DELETE CASCADE,
  UNIQUE (spec_id, label),
  UNIQUE (spec_id, position)
);

-- A join table and not a column on `document`, because an epic really does span two: this
-- spec's own breakdown has one delivering part of M2 and part of M4. A `milestone_id` column
-- forces that epic into one of them and the choice is unrecoverable — nothing afterwards can
-- tell "delivers M2" from "delivers M2 and M4 but was filed under M2".
--
-- `document_id` is one of the references the Data Model names as legitimately kind-agnostic:
-- any kind of document may deliver a milestone. What the schema cannot hold is the pairing's
-- coherence — an epic under spec A joined to a milestone of spec B satisfies both foreign
-- keys, and establishing that they share a spec means walking `parent_id` to the root, which
-- is not row-local. That is register entry #12 rather than a constraint.
CREATE TABLE document_milestone (
  document_id  TEXT NOT NULL REFERENCES document(id)  ON DELETE CASCADE,
  milestone_id TEXT NOT NULL REFERENCES milestone(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, milestone_id)
);
