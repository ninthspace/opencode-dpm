-- The second index: the prose held on child rows (FR9).
--
-- `document_fts` covers section bodies, and a search that stopped there would miss most of what
-- anyone actually looks for. The spec's own example is the measurement: "which requirement
-- mentioned the coverage helpers" returns nothing from a section sweep while the answer sits in
-- `requirement.text`. Requirements, criteria, observations and findings are where the corpus
-- keeps its shortest and most-cited prose, and none of it is a document body.
--
-- **One index for five tables, tagged, rather than five indexes.** `entity` is an indexed column
-- holding the table name, which is what makes FTS5's own column syntax do the scoping:
-- `entity:requirement AND helpers` narrows, and a query with no `entity:` term spans everything.
-- Five indexes would need the search tool to union five queries and rank across them, which is
-- work for Story 5 that this shape removes.
--
-- **Which columns are indexed, and the rule that decides it.** A column earns its place by
-- holding prose a person wrote that no other column can find the row by. Labels, statuses,
-- positions and enum values stay out: they are `WHERE` clauses, and indexing them makes every
-- search for the word "open" return every open finding.
--
-- **`story_criterion` is here and Task 4.2 did not name it.** The task list named
-- `acceptance_criterion`; FR9's own enumeration reads "requirements, story criteria, retro
-- observations, review findings". The schema has both kinds of criterion and both hold
-- hand-written prose, so both are indexed — which satisfies the requirement under either reading
-- rather than picking one and hoping. The epic's Notes record it.
--
-- Deliberately **not** indexed, and each for the same reason rather than by oversight:
-- `document.title` and `story.title` are short labels a reader navigates by and the projection
-- already prints; `task.description` is prose but is scoped inside a story a reader has already
-- found; `adr.decision`, `quick_criterion.text` and `retro_application.note` are prose that FR9's
-- enumeration does not name, and adding them is a decision for whoever needs them, not a default.

CREATE VIRTUAL TABLE entry_fts USING fts5(entity, text, entity_id UNINDEXED);

-- Fifteen triggers, three per indexed table. **The triple is the unit**: an insert trigger
-- without a delete trigger leaves the index holding rows the table no longer has, and every
-- search still answers — which is why Story 4's first criterion enumerates the tables out of
-- `sqlite_schema` and asserts three each rather than counting them here.
--
-- `UPDATE OF` names exactly the indexed columns on each table, so an edit to a position, a
-- status or a category never rewrites an index entry.
--
-- As with `document_fts`, the names carry the index prefix and are read by
-- `dpm/src/dump/objects.js`, whose shadow-table filter is scoped to `type = 'table'` so these
-- survive a dump. See `docs/maintenance/README.md`.

-- requirement.text — the case FR9 names first, and the one the spec's example turns on.
CREATE TRIGGER entry_fts_requirement_insert
AFTER INSERT ON requirement
BEGIN
  INSERT INTO entry_fts (entity, text, entity_id) VALUES ('requirement', NEW.text, NEW.id);
END;

CREATE TRIGGER entry_fts_requirement_update
AFTER UPDATE OF text ON requirement
BEGIN
  DELETE FROM entry_fts WHERE entity = 'requirement' AND entity_id = OLD.id;
  INSERT INTO entry_fts (entity, text, entity_id) VALUES ('requirement', NEW.text, NEW.id);
END;

CREATE TRIGGER entry_fts_requirement_delete
AFTER DELETE ON requirement
BEGIN
  DELETE FROM entry_fts WHERE entity = 'requirement' AND entity_id = OLD.id;
END;

-- acceptance_criterion.text — a spec-side criterion.
CREATE TRIGGER entry_fts_acceptance_criterion_insert
AFTER INSERT ON acceptance_criterion
BEGIN
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('acceptance_criterion', NEW.text, NEW.id);
END;

CREATE TRIGGER entry_fts_acceptance_criterion_update
AFTER UPDATE OF text ON acceptance_criterion
BEGIN
  DELETE FROM entry_fts WHERE entity = 'acceptance_criterion' AND entity_id = OLD.id;
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('acceptance_criterion', NEW.text, NEW.id);
END;

CREATE TRIGGER entry_fts_acceptance_criterion_delete
AFTER DELETE ON acceptance_criterion
BEGIN
  DELETE FROM entry_fts WHERE entity = 'acceptance_criterion' AND entity_id = OLD.id;
END;

-- story_criterion.text — the story-side criterion FR9's wording names and Task 4.2 did not.
CREATE TRIGGER entry_fts_story_criterion_insert
AFTER INSERT ON story_criterion
BEGIN
  INSERT INTO entry_fts (entity, text, entity_id) VALUES ('story_criterion', NEW.text, NEW.id);
END;


CREATE TRIGGER entry_fts_story_criterion_update
AFTER UPDATE OF text ON story_criterion
BEGIN
  DELETE FROM entry_fts WHERE entity = 'story_criterion' AND entity_id = OLD.id;
  INSERT INTO entry_fts (entity, text, entity_id) VALUES ('story_criterion', NEW.text, NEW.id);
END;

CREATE TRIGGER entry_fts_story_criterion_delete
AFTER DELETE ON story_criterion
BEGIN
  DELETE FROM entry_fts WHERE entity = 'story_criterion' AND entity_id = OLD.id;
END;

-- observation: `text` and `synthesis`, joined into one indexed value.
--
-- Two columns and one entry, because they are two halves of one thought — the observation as
-- written against a story, and the synthesis written when it was gathered into a retro — and a
-- reader searching for either wants the same row back. `coalesce` because `synthesis` is nullable
-- and `a || NULL` is NULL, which would silently index nothing at all for every ungathered
-- observation. `note` is deliberately out: it is the escape hatch for caveats and scope, not
-- something a reader searches for.
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

-- finding.summary — the whole of a finding's prose; `category_id`, `severity_id` and `status`
-- are references and enums, which is exactly what the column rule excludes.
CREATE TRIGGER entry_fts_finding_insert
AFTER INSERT ON finding
BEGIN
  INSERT INTO entry_fts (entity, text, entity_id) VALUES ('finding', NEW.summary, NEW.id);
END;

CREATE TRIGGER entry_fts_finding_update
AFTER UPDATE OF summary ON finding
BEGIN
  DELETE FROM entry_fts WHERE entity = 'finding' AND entity_id = OLD.id;
  INSERT INTO entry_fts (entity, text, entity_id) VALUES ('finding', NEW.summary, NEW.id);
END;

CREATE TRIGGER entry_fts_finding_delete
AFTER DELETE ON finding
BEGIN
  DELETE FROM entry_fts WHERE entity = 'finding' AND entity_id = OLD.id;
END;
