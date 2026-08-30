-- FR10, FR24 — a library document's provenance, and participants on two kinds rather than one.
--
-- Both changes have the same shape: a fact that a run had nowhere to put and therefore wrote into
-- prose, given the column it belongs in. That is the defect FR1 opens the spec with, and neither
-- half of it is visible from inside the artefact — a `**Source**:` line under a heading and a
-- sentence naming who was in the room both read as ordinary text to everything downstream.
--
-- **`library_document.source` is nullable, and the NULL is the answer rather than the absence of
-- one.** A document imported from a standards site, a vendor guide or another project has a
-- provenance its readers need; one written here has none. The rest of CPM's library front-matter
-- genuinely is prose and stays prose: a summary is a `document_section` at position 0, and `added`
-- and `last-reviewed` are `created_at` and `updated_at`.
--
-- **`document_agent` is `review_agent` widened, not a new join.** `party` and `consult` both
-- convene personas and both write a `discussion`, so the fact stopped belonging to one kind. The
-- widening keeps every guarantee the narrower table had: `document_id` and `document_kind` still
-- travel together into `document(id, kind)` on a composite foreign key, and the `CHECK` still
-- fixes the target — a set of two is as fixed as a set of one, and a participant still cannot
-- attach to a spec.
--
-- **No `dpm:rebuild` marker, because nothing references `review_agent`.** With foreign keys
-- enforced, `DROP TABLE` runs an implicit `DELETE FROM`, and the cascades that reach are the ones
-- from a table's *children*. `review_agent` is a leaf: it points at `review` and at `agent` and
-- nothing points back. The drop takes its own rows and stops there, which is what makes this an
-- ordinary in-transaction migration where `020-status-lifecycle.sql` could not be one.

ALTER TABLE library_document ADD COLUMN source TEXT;   -- where it came from; NULL when written here

CREATE TABLE document_agent (
  document_id   TEXT NOT NULL,
  document_kind TEXT NOT NULL CHECK (document_kind IN ('review','discussion')),
  agent         TEXT NOT NULL REFERENCES agent(name),
  PRIMARY KEY (document_id, agent),
  FOREIGN KEY (document_id, document_kind) REFERENCES document(id, kind) ON DELETE CASCADE
);

-- Every existing row is a review's, pinned there by the foreign key the old table declared.
INSERT INTO document_agent (document_id, document_kind, agent)
  SELECT document_id, 'review', agent FROM review_agent;

DROP TABLE review_agent;
