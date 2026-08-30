-- Identity, numbering and lineage.
--
-- This file establishes the composite `(id, kind)` parent key that every other table in the
-- schema joins to. A plain `parent_id REFERENCES document(id)` guarantees the parent exists
-- but not that it is the right sort of thing — an epic could hang off a review and every
-- foreign key would still be satisfied. That is the `**Source spec**` string relocated into a
-- column, and closing it is what the rest of the schema depends on.

-- **Every primary key here is declared NOT NULL, and none of them is redundant.** SQLite
-- implies NOT NULL only for `INTEGER PRIMARY KEY`, the rowid alias; for every other type it
-- preserves a longstanding bug and accepts NULL. Verified by execution against an earlier
-- draft of this file: two `document` rows were inserted with `id` NULL and both were kept,
-- because a UNIQUE index treats NULLs as distinct. That makes an undeclared TEXT primary key
-- a unique index over a nullable column — the exact shape this schema forbids elsewhere, in
-- the one position where everything else joins to it.
CREATE TABLE document_kind (
  kind        TEXT NOT NULL PRIMARY KEY, -- 'spec','epic','retro','review','runbook',…
  dir         TEXT,                      -- projection dir under docs/; NULL = this kind
                                         -- produces no file and renders inside its parent
  numbering   TEXT NOT NULL DEFAULT 'root'
                CHECK (numbering IN ('root','child','none')),
  UNIQUE (kind, numbering)               -- parent key for document's composite FK
);

-- Which kinds may parent which. A kind may legally have more than one parent
-- kind — a review hangs off a spec or an epic — so this is a table and not a
-- column on `document_kind`.
CREATE TABLE document_kind_parent (
  kind        TEXT NOT NULL REFERENCES document_kind(kind),
  parent_kind TEXT NOT NULL REFERENCES document_kind(kind),
  PRIMARY KEY (kind, parent_kind)
);

CREATE TABLE document (
  id          TEXT NOT NULL PRIMARY KEY,
  kind        TEXT    NOT NULL,
  numbering   TEXT    NOT NULL,  -- denormalised from document_kind, pinned by FK
  number      INTEGER,           -- root-numbered kinds: spec 47
  sequence    INTEGER,           -- child-numbered kinds: epic 03 within spec 101
  slug        TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','complete')),
  status_note TEXT,             -- the free-text qualifier real epics append to a status
  parent_id   TEXT,             -- epic→spec; adr→spec, brief or discussion;
                                -- retro→epic, spec or quick; review→spec or epic
  parent_kind TEXT,             -- denormalised from the parent, pinned by FK
  archived_at TEXT,             -- orthogonal to status; NULL means live
  commit_sha  TEXT,             -- audit and inspect pin to a commit
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (kind, numbering)        REFERENCES document_kind(kind, numbering),
  FOREIGN KEY (kind, parent_kind)      REFERENCES document_kind_parent(kind, parent_kind),
  FOREIGN KEY (parent_id, parent_kind) REFERENCES document(id, kind),
  CHECK ((numbering = 'root'  AND number   IS NOT NULL AND sequence IS NULL)
      OR (numbering = 'child' AND sequence IS NOT NULL AND number   IS NULL)
      OR (numbering = 'none'  AND number   IS NULL     AND sequence IS NULL)),
  CHECK ((parent_kind IS NULL) = (parent_id IS NULL)),
  CHECK (numbering <> 'child' OR parent_id IS NOT NULL)
);

-- The parent key `(parent_id, parent_kind)` resolves against. Its uniqueness is what makes
-- the pairing checkable: a row cannot claim a `parent_kind` its parent's own row contradicts.
CREATE UNIQUE INDEX document_id_kind      ON document (id, kind);

-- Numbering is two-level because real projects number two ways: a spec is numbered globally,
-- an epic within its spec, and every spec restarts at 1. The two indexes are partial because
-- a kind numbered the other way — or not at all — stores NULL in the column this one keys on.
CREATE UNIQUE INDEX document_root_number
  ON document (kind, number)              WHERE number IS NOT NULL;
-- `parent_id IS NOT NULL` is implied — `sequence IS NOT NULL` forces `numbering = 'child'`,
-- which the third CHECK forces to have a parent — but it is stated anyway, because that
-- implication runs through two constraints and nothing reading the index can see it. A
-- nullable column inside a UNIQUE index is only safe when the index itself says so.
CREATE UNIQUE INDEX document_child_number
  ON document (kind, parent_id, sequence)
  WHERE sequence IS NOT NULL AND parent_id IS NOT NULL;

-- Undecomposed prose keeps a home rather than being over-modelled. `document_id` is one of
-- the references the Data Model names as legitimately kind-agnostic: any kind of document
-- has narrative sections.
CREATE TABLE document_section (
  id           TEXT NOT NULL PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  heading      TEXT    NOT NULL,
  body         TEXT    NOT NULL,
  position     INTEGER NOT NULL,
  UNIQUE (document_id, position)
);
