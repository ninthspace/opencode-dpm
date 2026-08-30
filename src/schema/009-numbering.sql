-- Number allocation.
--
-- One row per root kind, one row per (child kind, parent). Between them these two shapes
-- replace CPM's Numbering procedure entirely: glob the active directory, glob the archive
-- mirror, union the two, parse each filename as an integer rather than a string, and mind the
-- standing `99 → 100` warning. None of that has anywhere to live here, and `cpm:archive`'s
-- obligation to keep `docs/archive/{type}/` as a mirrored tree stops being a contract at all,
-- because archival sets `archived_at` on a row that never moves.
--
-- **This table has no PRIMARY KEY, and that is not an omission.** Its natural key is
-- `(kind, parent_id)`, and `parent_id` is NULL for every root-numbered kind — so a primary key
-- over the pair would constrain nothing at all on exactly the rows it most needs to, since
-- SQLite treats NULLs in a unique index as distinct from one another. Two partial indexes say
-- what one key cannot: they partition the table on `parent_id IS NULL`, and every row falls in
-- one side or the other, so identity is enforced everywhere without a surrogate id that
-- nothing would ever reference.
CREATE TABLE number_sequence (
  kind        TEXT    NOT NULL REFERENCES document_kind(kind),
  -- Deliberately not kind-pinned, and named as such in the Data Model's enumeration: the
  -- parent a child-numbered kind counts within varies by kind — an epic counts under a spec,
  -- an ADR under a spec, a brief or a discussion.
  parent_id   TEXT REFERENCES document(id) ON DELETE CASCADE,
  next_value  INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX number_sequence_root
  ON number_sequence (kind)            WHERE parent_id IS NULL;
CREATE UNIQUE INDEX number_sequence_child
  ON number_sequence (kind, parent_id) WHERE parent_id IS NOT NULL;
