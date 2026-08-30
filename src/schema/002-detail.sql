-- Per-kind detail (AD7).
--
-- Four of the thirteen document kinds carry structure that `document_section` would flatten
-- into prose. Each detail table's primary key **is** its document's, and is also a foreign
-- key to it — which is what makes the one-to-one structural rather than a rule to maintain:
-- a detail row cannot exist without its document, cannot outlive it, and cannot be
-- duplicated. The polymorphic alternative AD7 rejected has no such key to point at.
--
-- Primary keys are declared NOT NULL for the reason set out at the head of `001-identity.sql`.

-- The library's `scope` is machine-read: every skill's Library Check filters
-- documents by it before deciding what to load. Held as prose it is not
-- queryable, and being queryable is the entire feature.
CREATE TABLE library_document (
  document_id   TEXT NOT NULL PRIMARY KEY,
  document_kind TEXT NOT NULL DEFAULT 'library' CHECK (document_kind = 'library'),
  doc_type      TEXT NOT NULL,     -- 'architecture','coding-standards','domain',…
  FOREIGN KEY (document_id, document_kind) REFERENCES document(id, kind) ON DELETE CASCADE
);

CREATE TABLE library_scope (
  document_id  TEXT NOT NULL REFERENCES library_document(document_id) ON DELETE CASCADE,
  scope        TEXT    NOT NULL,  -- a skill name, or 'all'
  PRIMARY KEY (document_id, scope)
);

-- An ADR's lifecycle is not `document.status`. Supersession is the edge
-- (`dependency_kind = 'supersedes'`); what lives here is the state.
CREATE TABLE adr (
  document_id     TEXT NOT NULL PRIMARY KEY,
  document_kind   TEXT NOT NULL DEFAULT 'adr' CHECK (document_kind = 'adr'),
  decision_status TEXT NOT NULL DEFAULT 'proposed'
                    CHECK (decision_status IN
                      ('proposed','accepted','rejected','superseded','deprecated')),
  decision        TEXT NOT NULL,
  FOREIGN KEY (document_id, document_kind) REFERENCES document(id, kind) ON DELETE CASCADE
);

-- Options Considered repeats per option, against the same axes each time —
-- which is a table, and is unreadable as a paragraph per option.
CREATE TABLE adr_option (
  id           TEXT NOT NULL PRIMARY KEY,
  adr_id       TEXT NOT NULL REFERENCES adr(document_id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  chosen       INTEGER NOT NULL DEFAULT 0,
  rationale    TEXT,
  position     INTEGER NOT NULL,
  UNIQUE (adr_id, position)
);

CREATE TABLE adr_option_tradeoff (
  option_id    TEXT NOT NULL REFERENCES adr_option(id) ON DELETE CASCADE,
  axis         TEXT    NOT NULL,   -- 'cost','complexity','reversibility',…
  assessment   TEXT    NOT NULL,
  PRIMARY KEY (option_id, axis)
);

-- What was reviewed is `document.parent_id`; only the narrowing lives here. An earlier form
-- also carried `reviewed_id`, which is `parent_id` under another name — the same relationship
-- in two places with nothing keeping them equal, which is the defect this schema exists to
-- remove.
--
-- `scope_story_id` forward-references `story`, created in `004-delivery.sql`. SQLite resolves
-- a foreign key at write time, not at CREATE, so the order is legal and the table simply
-- cannot take a story-scoped row until that file has run.
CREATE TABLE review (
  document_id    TEXT NOT NULL PRIMARY KEY,
  document_kind  TEXT NOT NULL DEFAULT 'review' CHECK (document_kind = 'review'),
  scope          TEXT NOT NULL DEFAULT 'whole'
                   CHECK (scope IN ('whole','story')),
  scope_story_id TEXT REFERENCES story(id) ON DELETE CASCADE,
  CHECK ((scope = 'story') = (scope_story_id IS NOT NULL)),
  FOREIGN KEY (document_id, document_kind) REFERENCES document(id, kind) ON DELETE CASCADE
);

-- `agent` is seeded in Story 2; the forward reference is legal for the same reason.
CREATE TABLE review_agent (
  document_id  TEXT NOT NULL REFERENCES review(document_id) ON DELETE CASCADE,
  agent        TEXT NOT NULL REFERENCES agent(name),
  PRIMARY KEY (document_id, agent)
);

-- A quick record's criteria are decided met or not met at close, which is a
-- tri-state (NULL while open) and not a status word.
CREATE TABLE quick (
  document_id   TEXT NOT NULL PRIMARY KEY,
  document_kind TEXT NOT NULL DEFAULT 'quick' CHECK (document_kind = 'quick'),
  closed_at     TEXT,
  FOREIGN KEY (document_id, document_kind) REFERENCES document(id, kind) ON DELETE CASCADE
);

CREATE TABLE quick_criterion (
  id           TEXT NOT NULL PRIMARY KEY,
  quick_id     TEXT NOT NULL REFERENCES quick(document_id) ON DELETE CASCADE,
  text         TEXT    NOT NULL,
  met          INTEGER,           -- NULL until closed
  note         TEXT,
  position     INTEGER NOT NULL,
  UNIQUE (quick_id, position)
);
