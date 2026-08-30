-- Artifacts and session state.

CREATE TABLE artifact (
  id            TEXT NOT NULL PRIMARY KEY,
  url           TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  description   TEXT,
  published_at  TEXT NOT NULL
);

-- `cpm:artifact` today maintains an index file *and* backlinks written into each source
-- document — the same relationship recorded twice, by hand, with no diagnostic when one side
-- is updated and the other is not. One join table cannot hold a disagreement, because there
-- is only one place for the fact to live; both the index and the backlinks become projections
-- of these rows.
--
-- `document_id` is one of the references the Data Model names as legitimately kind-agnostic:
-- an artifact may be published from a document of any kind.
CREATE TABLE artifact_document (
  artifact_id   TEXT NOT NULL REFERENCES artifact(id)  ON DELETE CASCADE,
  document_id   TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  PRIMARY KEY (artifact_id, document_id)
);

-- Session state is a row, not a file. That removes a whole category of problem: the
-- `/docs/plans/.cpm-*` leak, swept into commits by `git add -A` and untrackable after the
-- fact, has nowhere to happen.
--
-- `superseded_by` is not named `*_id` and is a self-reference: adoption on `--resume` is
-- `UPDATE session SET superseded_by = ?`.
CREATE TABLE session (
  id             TEXT NOT NULL PRIMARY KEY,       -- CPM_SESSION_ID
  skill          TEXT,
  phase          TEXT,
  state          TEXT,                   -- JSON blob, skill-defined
  superseded_by  TEXT REFERENCES session(id),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
