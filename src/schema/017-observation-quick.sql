-- FR10, FR25 — a quick record's observation is an observation, written where the work happened.
--
-- `observation` admitted two parents: `retro_id`, the grouping, and `story_id`, the origin a `do`
-- run writes before any retro exists. A quick record is neither, so the mandatory single-category
-- observation `cpm:quick` writes into its completion record had nowhere to go — and the workaround
-- that needs no migration, creating a retro per quick, defeats the point: an observation that
-- arrives already grouped is one `retro` can never gather, and gathering is what keeps the origin
-- queryable. `quick_id` is `story_id`'s counterpart on the other execution path, and the two behave
-- identically: written at the point of work, gathered later by setting `retro_id`, never cleared.
--
-- **This is the first migration that is not additive, and the reason is that SQLite cannot alter a
-- table-level CHECK.** `CHECK (retro_id IS NOT NULL OR story_id IS NOT NULL)` has to become a
-- three-way test, and no `ALTER TABLE` reaches it, so the table is rebuilt. The rule the forward-
-- only design actually enforces is untouched: this is a new numbered file, and no released one is
-- edited. `integration.test.js` compares a migrated schema against a fresh one object for object,
-- which is what catches a rebuild that loses an index or a trigger.
--
-- **The order below is dictated by foreign keys being on and pragmas being ignored inside a
-- transaction.** Each migration runs in one, so `PRAGMA foreign_keys = OFF` is unavailable here.
-- With enforcement on, `DROP TABLE observation` performs an implicit delete first, and
-- `observation_category` cascades from it — so the categories are copied aside and put back rather
-- than dropped with the parent they hang off. The implicit delete fires no triggers, which is why
-- `entry_fts` keeps its rows across the rebuild and needs no reindex: the same ids come back.

-- **The generated guards come down first, and they are the reason a rebuild is not just a copy.**
-- `ALTER TABLE … RENAME TO` reparses every object in the schema, and at the moment of the rename
-- `observation` does not exist — so a trigger mentioning it fails the reparse and takes the whole
-- migration with it. These two are `createRetirementGuards`'s output for `observation_category`'s
-- reference into `observation`, named by its rule: `<table>_<columns>_not_retired_on_<event>`. They
-- are safe to drop here because `migrate` regenerates the whole guard set from the finished schema
-- after the last migration, which is what its docblock means by removing a guard whose reference a
-- migration dropped. A fresh database has no guards yet and drops nothing; an upgraded one has both.
--
-- The FTS triggers need no such handling: they are defined *on* `observation` and go with it, and
-- this file recreates them below.
DROP TRIGGER IF EXISTS observation_category_observation_id_not_retired_on_insert;
DROP TRIGGER IF EXISTS observation_category_observation_id_not_retired_on_update;

CREATE TABLE observation_category_rescue (
  observation_id   TEXT NOT NULL,
  taxonomy_id      TEXT NOT NULL,
  taxonomy_domain  TEXT NOT NULL
);

INSERT INTO observation_category_rescue (observation_id, taxonomy_id, taxonomy_domain)
  SELECT observation_id, taxonomy_id, taxonomy_domain FROM observation_category;

CREATE TABLE observation_rebuilt (
  id              TEXT NOT NULL PRIMARY KEY,
  retro_id        TEXT,
  retro_kind      TEXT CHECK (retro_kind = 'retro'),
  story_id        TEXT REFERENCES story(id)    ON DELETE CASCADE,
  quick_id        TEXT,
  quick_kind      TEXT CHECK (quick_kind = 'quick'),
  position        INTEGER NOT NULL DEFAULT 0,  -- projection order within a retro
  text            TEXT NOT NULL,
  synthesis       TEXT,            -- written when grouped into a retro
  note            TEXT,            -- escape hatch: qualifiers, caveats, scope
  library_doc_id  TEXT,            -- set on promotion
  library_doc_kind TEXT CHECK (library_doc_kind = 'library'),
  retired_at      TEXT,
  retired_reason  TEXT,
  FOREIGN KEY (library_doc_id, library_doc_kind) REFERENCES document(id, kind),
  FOREIGN KEY (retro_id, retro_kind) REFERENCES document(id, kind) ON DELETE CASCADE,
  FOREIGN KEY (quick_id, quick_kind) REFERENCES document(id, kind) ON DELETE CASCADE,
  CHECK ((library_doc_id IS NULL) = (library_doc_kind IS NULL)),
  CHECK ((retro_id IS NULL) = (retro_kind IS NULL)),
  CHECK ((quick_id IS NULL) = (quick_kind IS NULL)),
  CHECK (retro_id IS NOT NULL OR story_id IS NOT NULL OR quick_id IS NOT NULL),
  CHECK ((retired_at IS NULL) = (retired_reason IS NULL))
);

INSERT INTO observation_rebuilt (
  id, retro_id, retro_kind, story_id, quick_id, quick_kind, position, text, synthesis, note,
  library_doc_id, library_doc_kind, retired_at, retired_reason
)
  SELECT id, retro_id, retro_kind, story_id, NULL, NULL, position, text, synthesis, note,
         library_doc_id, library_doc_kind, retired_at, retired_reason
    FROM observation;

DROP TABLE observation;
ALTER TABLE observation_rebuilt RENAME TO observation;

INSERT INTO observation_category (observation_id, taxonomy_id, taxonomy_domain)
  SELECT observation_id, taxonomy_id, taxonomy_domain FROM observation_category_rescue;

DROP TABLE observation_category_rescue;

-- Recreated verbatim from `006-review-retro.sql`, because the rebuild dropped them with the table.
-- Nullable `retro_id` makes a plain UNIQUE useless here, for the reason already
-- documented against `coverage`. The partial index constrains only rows that
-- have a retro to order within.
CREATE UNIQUE INDEX observation_retro_position
  ON observation (retro_id, position) WHERE retro_id IS NOT NULL;

-- And from `013-entry-search.sql`. `text` and `synthesis` joined into one indexed value, `note`
-- deliberately out; `coalesce` because `a || NULL` is NULL and would index nothing at all for
-- every ungathered observation.
CREATE TRIGGER entry_fts_observation_insert
AFTER INSERT ON observation
BEGIN
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('observation', NEW.text || ' ' || coalesce(NEW.synthesis, ''), NEW.id);
END;

CREATE TRIGGER entry_fts_observation_update
AFTER UPDATE OF text, synthesis ON observation
BEGIN
  DELETE FROM entry_fts WHERE entity = 'observation' AND entity_id = OLD.id;
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('observation', NEW.text || ' ' || coalesce(NEW.synthesis, ''), NEW.id);
END;

CREATE TRIGGER entry_fts_observation_delete
AFTER DELETE ON observation
BEGIN
  DELETE FROM entry_fts WHERE entity = 'observation' AND entity_id = OLD.id;
END;
