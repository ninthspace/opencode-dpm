-- dpm:rebuild
--
-- FR4, FR22 — `superseded` and `withdrawn` are statuses, not notes.
--
-- A two-value enum makes abandoned work indistinguishable from work not yet started. CPM's own
-- epics already carry both terminal states, and with `pending` and `complete` the only values
-- available they land in `status_note` — a fact held in prose that every reader has to parse back
-- out, which is the defect FR1 opens the spec with. `superseded` means replaced by other work;
-- `withdrawn` means dropped. Both are terminal and user-set, and neither is completion.
--
-- **The pair matters more than either value.** Widening the enum on its own moves the defect rather
-- than closing it: anything reading "not `pending`" as "done" now reads two abandoned states as
-- satisfaction, which is how retired work clears the way for what was waiting on it. `readiness.js`
-- is where that reading lives and is changed in the same commit — see its `readyClause`.
--
-- **Why a rebuild.** SQLite cannot alter a table-level `CHECK`, and this one is a column constraint
-- on three tables. `017-observation-quick.sql` is the precedent for the technique; what it could not
-- do is the reason `migrate.js` now understands the `dpm:rebuild` marker above. With foreign keys
-- enforced, `DROP TABLE document` runs an implicit `DELETE FROM` and its cascades reach nearly every
-- table here, so the rescue-aside approach would have to cover the whole schema. The marker moves
-- `PRAGMA foreign_keys` outside this file's transaction — SQLite's own twelve-step procedure — and
-- `PRAGMA foreign_key_check` runs before the commit in place of the enforcement that is off.
--
-- **The rebuilt DDL is the table as it stands at version 19, not as `001` and `004` first wrote
-- it.** That distinction is the trap in a rebuild and it is silent: `014-story-plan.sql` added
-- `story.plan` and `015-retro-waiver.sql` added `document.retro_waived_at` and
-- `retro_waived_reason` with the `CHECK` that pairs them, and a rebuild copied from the original
-- files drops all three — the copy succeeds, the migration commits, and the columns are simply gone.
-- Each is folded in below, in the position `ALTER TABLE … ADD COLUMN` put it: last.
--
-- Beyond that the text is verbatim from the released files and changed in one place each. It has to
-- be: `integration.test.js` compares a migrated schema against a fresh one object for object, and
-- both paths run this file, so drift between this text and what version 19 holds shows up as a
-- rebuilt table that has quietly lost a constraint rather than as a failure here.
--
-- No trigger is defined on any of the three tables and no trigger body names them, so nothing has to
-- come down before the renames. `story` and `task` carry only the implicit indexes of their `UNIQUE`
-- constraints, which the rebuilt definitions recreate; `document`'s three explicit indexes are
-- recreated below, verbatim from `001-identity.sql`.

CREATE TABLE document_rebuilt (
  id          TEXT NOT NULL PRIMARY KEY,
  kind        TEXT    NOT NULL,
  numbering   TEXT    NOT NULL,  -- denormalised from document_kind, pinned by FK
  number      INTEGER,           -- root-numbered kinds: spec 47
  sequence    INTEGER,           -- child-numbered kinds: epic 03 within spec 101
  slug        TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','complete','superseded','withdrawn')),
  status_note TEXT,             -- the free-text qualifier real epics append to a status
  parent_id   TEXT,             -- epic→spec; adr→spec, brief or discussion;
                                -- retro→epic, spec or quick; review→spec or epic
  parent_kind TEXT,             -- denormalised from the parent, pinned by FK
  archived_at TEXT,             -- orthogonal to status; NULL means live
  commit_sha  TEXT,             -- audit and inspect pin to a commit
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  retro_waived_at     TEXT,     -- from `015-retro-waiver.sql`; both or neither, as its CHECK says
  retro_waived_reason TEXT,
  FOREIGN KEY (kind, numbering)        REFERENCES document_kind(kind, numbering),
  FOREIGN KEY (kind, parent_kind)      REFERENCES document_kind_parent(kind, parent_kind),
  FOREIGN KEY (parent_id, parent_kind) REFERENCES document(id, kind),
  CHECK ((numbering = 'root'  AND number   IS NOT NULL AND sequence IS NULL)
      OR (numbering = 'child' AND sequence IS NOT NULL AND number   IS NULL)
      OR (numbering = 'none'  AND number   IS NULL     AND sequence IS NULL)),
  CHECK ((parent_kind IS NULL) = (parent_id IS NULL)),
  CHECK (numbering <> 'child' OR parent_id IS NOT NULL),
  CHECK ((retro_waived_at IS NULL) = (retro_waived_reason IS NULL))
);

INSERT INTO document_rebuilt (
  id, kind, numbering, number, sequence, slug, title, status, status_note, parent_id, parent_kind,
  archived_at, commit_sha, created_at, updated_at, retro_waived_at, retro_waived_reason
)
  SELECT id, kind, numbering, number, sequence, slug, title, status, status_note, parent_id,
         parent_kind, archived_at, commit_sha, created_at, updated_at, retro_waived_at,
         retro_waived_reason
    FROM document;

DROP TABLE document;
ALTER TABLE document_rebuilt RENAME TO document;

-- Verbatim from `001-identity.sql`, because the rebuild dropped them with the table.
CREATE UNIQUE INDEX document_id_kind      ON document (id, kind);

CREATE UNIQUE INDEX document_root_number
  ON document (kind, number)              WHERE number IS NOT NULL;

CREATE UNIQUE INDEX document_child_number
  ON document (kind, parent_id, sequence)
  WHERE sequence IS NOT NULL AND parent_id IS NOT NULL;

CREATE TABLE story_rebuilt (
  id          TEXT NOT NULL PRIMARY KEY,
  epic_id     TEXT    NOT NULL,
  epic_kind   TEXT    NOT NULL DEFAULT 'epic' CHECK (epic_kind = 'epic'),
  number      INTEGER NOT NULL,
  title       TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','complete','superseded','withdrawn')),
  status_note TEXT,
  position    INTEGER NOT NULL,
  plan        INTEGER NOT NULL DEFAULT 0 CHECK (plan IN (0, 1)),  -- from `014-story-plan.sql`
  FOREIGN KEY (epic_id, epic_kind) REFERENCES document(id, kind) ON DELETE CASCADE,
  UNIQUE (epic_id, number)
);

INSERT INTO story_rebuilt (
  id, epic_id, epic_kind, number, title, status, status_note, position, plan
)
  SELECT id, epic_id, epic_kind, number, title, status, status_note, position, plan FROM story;

DROP TABLE story;
ALTER TABLE story_rebuilt RENAME TO story;

CREATE TABLE task_rebuilt (
  id          TEXT NOT NULL PRIMARY KEY,
  story_id    TEXT NOT NULL REFERENCES story(id) ON DELETE CASCADE,
  number      INTEGER NOT NULL,
  title       TEXT    NOT NULL,
  description TEXT,
  status      TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','complete','superseded','withdrawn')),
  status_note TEXT,
  position    INTEGER NOT NULL,
  UNIQUE (story_id, number)
);

INSERT INTO task_rebuilt (
  id, story_id, number, title, description, status, status_note, position
)
  SELECT id, story_id, number, title, description, status, status_note, position FROM task;

DROP TABLE task;
ALTER TABLE task_rebuilt RENAME TO task;
