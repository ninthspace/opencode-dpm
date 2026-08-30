-- The rest of the prose (FR9).
--
-- `013-entry-search.sql` stated the rule that decides which columns earn a place in the index — a
-- column holds prose a person wrote that no other column can find the row by — applied it to five
-- tables, and listed six columns it was leaving out. The rule was right and nothing checked it.
-- By 2026-08-11 the schema held 194 TEXT columns and eight were indexed, so `adr.decision`,
-- `audit_finding.summary` and `quick_criterion.text` were unfindable while `finding.summary`
-- beside them was findable.
--
-- **The failure has no error in it**, which is why it survived nine migrations: a search over a
-- column nothing indexes is accepted, ranked against what the index does hold, and returns
-- nothing. That is indistinguishable from the row not being there, and it is false-pass register
-- entry #26.
--
-- Which columns are indexed is now derived and reconciled rather than listed in prose —
-- `dpm/tests/support/prose-columns.js` holds the judgement, and it is checked against this schema
-- in both directions at test time. **This comment therefore names no set.** The list it would name
-- is exactly the thing that went stale last time.
--
-- **Three columns hold prose and are still out**, each for a reason a test can put to the live
-- state rather than take on trust:
--
--   * `document.status_note` and `document.retro_waived_reason` — NFR7 asks that every hit be
--     openable with `read_<entity>`, and there is no `read_document`: a document is read through
--     its kind. An entity named `document` would be a ranked result a caller cannot follow.
--   * `adr_option_tradeoff.assessment` — the key is `(option_id, axis)` and `entry_fts.entity_id`
--     holds one value. The row is reached by its option and its axis, which is FR9's second clause
--     read literally.
--
-- **Thirty triggers, three per table, and the triple is the unit.** An insert trigger without a
-- delete trigger leaves the index holding rows the table no longer has, and every search still
-- answers. `UPDATE OF` names exactly the indexed columns, so an edit to a status or a position
-- never rewrites an index entry.
--
-- **`entity_id` is the primary key as declared, which is not `id` everywhere** — `adr.document_id`
-- and `agent.name` are the two exceptions. That column is what `read_<entity>` takes, and it is
-- what makes a hit followable rather than merely ranked.
--
-- **Four tables carry two prose columns and get one entry each**, concatenated the way
-- `entry_fts_observation_insert` already does it. `coalesce` on every nullable side, because
-- `a || NULL` is NULL in SQLite: a concatenation without it indexes the empty string for the whole
-- row, which is the whole row unfindable, no error, and a search that reports success.
--
-- The insert is unconditional rather than guarded by a `WHEN`. Six of the fourteen columns are
-- nullable, so some rows arrive with nothing to index; an empty entry never matches any query, so
-- the cost is size, and one shape across ten tables is worth more than the rows saved.
--
-- As with the two indexes before it, the trigger names carry the index prefix and are read by
-- `dpm/src/dump/objects.js`, whose shadow-table filter is scoped to `type = 'table'` so these
-- survive a dump. See `docs/maintenance/README.md`.

-- adr.decision — the decision an ADR exists to record. Keyed by `document_id`.
CREATE TRIGGER entry_fts_adr_insert
AFTER INSERT ON adr
BEGIN
  INSERT INTO entry_fts (entity, text, entity_id) VALUES ('adr', NEW.decision, NEW.document_id);
END;

CREATE TRIGGER entry_fts_adr_update
AFTER UPDATE OF decision ON adr
BEGIN
  DELETE FROM entry_fts WHERE entity = 'adr' AND entity_id = OLD.document_id;
  INSERT INTO entry_fts (entity, text, entity_id) VALUES ('adr', NEW.decision, NEW.document_id);
END;

CREATE TRIGGER entry_fts_adr_delete
AFTER DELETE ON adr
BEGIN
  DELETE FROM entry_fts WHERE entity = 'adr' AND entity_id = OLD.document_id;
END;

-- adr_option.rationale — why an option was worth considering. `name` is a label and stays out.
CREATE TRIGGER entry_fts_adr_option_insert
AFTER INSERT ON adr_option
BEGIN
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('adr_option', coalesce(NEW.rationale, ''), NEW.id);
END;

CREATE TRIGGER entry_fts_adr_option_update
AFTER UPDATE OF rationale ON adr_option
BEGIN
  DELETE FROM entry_fts WHERE entity = 'adr_option' AND entity_id = OLD.id;
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('adr_option', coalesce(NEW.rationale, ''), NEW.id);
END;

CREATE TRIGGER entry_fts_adr_option_delete
AFTER DELETE ON adr_option
BEGIN
  DELETE FROM entry_fts WHERE entity = 'adr_option' AND entity_id = OLD.id;
END;

-- agent: `personality` and `communication_style`. Keyed by `name`, which is the agent's id.
--
-- These are the two columns 47-12 spent a story teaching every skill to *ask* for, which is an
-- argument that a reader reaches an agent by name rather than by searching. What settles it the
-- other way is that `name`, `display_name` and `role` are labels: nothing on the row says what an
-- agent is like, so "which of these is the sceptical one" returned nothing until now.
CREATE TRIGGER entry_fts_agent_insert
AFTER INSERT ON agent
BEGIN
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('agent', NEW.personality || ' ' || NEW.communication_style, NEW.name);
END;

CREATE TRIGGER entry_fts_agent_update
AFTER UPDATE OF personality, communication_style ON agent
BEGIN
  DELETE FROM entry_fts WHERE entity = 'agent' AND entity_id = OLD.name;
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('agent', NEW.personality || ' ' || NEW.communication_style, NEW.name);
END;

CREATE TRIGGER entry_fts_agent_delete
AFTER DELETE ON agent
BEGIN
  DELETE FROM entry_fts WHERE entity = 'agent' AND entity_id = OLD.name;
END;

-- artifact: `description` and `retired_reason`, both nullable. `title` and `url` are labels.
CREATE TRIGGER entry_fts_artifact_insert
AFTER INSERT ON artifact
BEGIN
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('artifact', coalesce(NEW.description, '') || ' ' || coalesce(NEW.retired_reason, ''), NEW.id);
END;

CREATE TRIGGER entry_fts_artifact_update
AFTER UPDATE OF description, retired_reason ON artifact
BEGIN
  DELETE FROM entry_fts WHERE entity = 'artifact' AND entity_id = OLD.id;
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('artifact', coalesce(NEW.description, '') || ' ' || coalesce(NEW.retired_reason, ''), NEW.id);
END;

CREATE TRIGGER entry_fts_artifact_delete
AFTER DELETE ON artifact
BEGIN
  DELETE FROM entry_fts WHERE entity = 'artifact' AND entity_id = OLD.id;
END;

-- audit_finding: `summary` and `recommendation`. `summary` is the inconsistency this migration was
-- raised for — the same content as `finding.summary`, which has been indexed since 013.
-- `file` and `symbol` are locators and stay out.
CREATE TRIGGER entry_fts_audit_finding_insert
AFTER INSERT ON audit_finding
BEGIN
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('audit_finding', NEW.summary || ' ' || coalesce(NEW.recommendation, ''), NEW.id);
END;

CREATE TRIGGER entry_fts_audit_finding_update
AFTER UPDATE OF summary, recommendation ON audit_finding
BEGIN
  DELETE FROM entry_fts WHERE entity = 'audit_finding' AND entity_id = OLD.id;
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('audit_finding', NEW.summary || ' ' || coalesce(NEW.recommendation, ''), NEW.id);
END;

CREATE TRIGGER entry_fts_audit_finding_delete
AFTER DELETE ON audit_finding
BEGIN
  DELETE FROM entry_fts WHERE entity = 'audit_finding' AND entity_id = OLD.id;
END;

-- milestone.summary — what a milestone delivers. `label` ('M1') and `title` ('Substrate') are the
-- labels a reader navigates by and stay out.
CREATE TRIGGER entry_fts_milestone_insert
AFTER INSERT ON milestone
BEGIN
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('milestone', coalesce(NEW.summary, ''), NEW.id);
END;

CREATE TRIGGER entry_fts_milestone_update
AFTER UPDATE OF summary ON milestone
BEGIN
  DELETE FROM entry_fts WHERE entity = 'milestone' AND entity_id = OLD.id;
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('milestone', coalesce(NEW.summary, ''), NEW.id);
END;

CREATE TRIGGER entry_fts_milestone_delete
AFTER DELETE ON milestone
BEGIN
  DELETE FROM entry_fts WHERE entity = 'milestone' AND entity_id = OLD.id;
END;

-- quick_criterion.text — the second inconsistency: a criterion written exactly as the other two
-- kinds are, and the only one of the three that was not indexed. `note` stays out because this
-- column finds the row.
CREATE TRIGGER entry_fts_quick_criterion_insert
AFTER INSERT ON quick_criterion
BEGIN
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('quick_criterion', NEW.text, NEW.id);
END;

CREATE TRIGGER entry_fts_quick_criterion_update
AFTER UPDATE OF text ON quick_criterion
BEGIN
  DELETE FROM entry_fts WHERE entity = 'quick_criterion' AND entity_id = OLD.id;
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('quick_criterion', NEW.text, NEW.id);
END;

CREATE TRIGGER entry_fts_quick_criterion_delete
AFTER DELETE ON quick_criterion
BEGIN
  DELETE FROM entry_fts WHERE entity = 'quick_criterion' AND entity_id = OLD.id;
END;

-- retro_application.note — how a lesson changed a run, which is the whole content of the record.
-- `theme` is a short label and `disposition` is an enum.
CREATE TRIGGER entry_fts_retro_application_insert
AFTER INSERT ON retro_application
BEGIN
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('retro_application', NEW.note, NEW.id);
END;

CREATE TRIGGER entry_fts_retro_application_update
AFTER UPDATE OF note ON retro_application
BEGIN
  DELETE FROM entry_fts WHERE entity = 'retro_application' AND entity_id = OLD.id;
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('retro_application', NEW.note, NEW.id);
END;

CREATE TRIGGER entry_fts_retro_application_delete
AFTER DELETE ON retro_application
BEGIN
  DELETE FROM entry_fts WHERE entity = 'retro_application' AND entity_id = OLD.id;
END;

-- story.status_note — the free-text qualifier a person appends to a status, and the only prose on
-- the row: `title` is a label and `status` is an enum, so "waiting on API keys" was unfindable.
CREATE TRIGGER entry_fts_story_insert
AFTER INSERT ON story
BEGIN
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('story', coalesce(NEW.status_note, ''), NEW.id);
END;

CREATE TRIGGER entry_fts_story_update
AFTER UPDATE OF status_note ON story
BEGIN
  DELETE FROM entry_fts WHERE entity = 'story' AND entity_id = OLD.id;
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('story', coalesce(NEW.status_note, ''), NEW.id);
END;

CREATE TRIGGER entry_fts_story_delete
AFTER DELETE ON story
BEGIN
  DELETE FROM entry_fts WHERE entity = 'story' AND entity_id = OLD.id;
END;

-- task: `description` and `status_note`, both nullable. `title` is a label.
CREATE TRIGGER entry_fts_task_insert
AFTER INSERT ON task
BEGIN
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('task', coalesce(NEW.description, '') || ' ' || coalesce(NEW.status_note, ''), NEW.id);
END;

CREATE TRIGGER entry_fts_task_update
AFTER UPDATE OF description, status_note ON task
BEGIN
  DELETE FROM entry_fts WHERE entity = 'task' AND entity_id = OLD.id;
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('task', coalesce(NEW.description, '') || ' ' || coalesce(NEW.status_note, ''), NEW.id);
END;

CREATE TRIGGER entry_fts_task_delete
AFTER DELETE ON task
BEGIN
  DELETE FROM entry_fts WHERE entity = 'task' AND entity_id = OLD.id;
END;

-- The backfill.
--
-- **A trigger fires only on writes after it.** Without this, every row written before this
-- migration stays unfindable while every row written after it is findable — an index that is
-- half right and reports success on both halves, which is the same false pass the migration was
-- raised to close, arriving out of the fix for it.
--
-- It writes to `entry_fts` directly, so none of the thirty triggers above fires and nothing is
-- indexed twice. The expression per table is the insert trigger's own, and the tests compare
-- `MATCH` against a `LIKE` scan written independently of both.
--
-- **Restore does not need this and must not be broken by it.** `dump/objects.js` keeps triggers
-- and drops FTS shadow tables, so a restored database rebuilds `entry_fts` from the rows as they
-- arrive; this statement runs on the live upgrade path, where the rows are already in place.

INSERT INTO entry_fts (entity, text, entity_id)
  SELECT 'adr', decision, document_id FROM adr;

INSERT INTO entry_fts (entity, text, entity_id)
  SELECT 'adr_option', coalesce(rationale, ''), id FROM adr_option;

INSERT INTO entry_fts (entity, text, entity_id)
  SELECT 'agent', personality || ' ' || communication_style, name FROM agent;

INSERT INTO entry_fts (entity, text, entity_id)
  SELECT 'artifact', coalesce(description, '') || ' ' || coalesce(retired_reason, ''), id
    FROM artifact;

INSERT INTO entry_fts (entity, text, entity_id)
  SELECT 'audit_finding', summary || ' ' || coalesce(recommendation, ''), id FROM audit_finding;

INSERT INTO entry_fts (entity, text, entity_id)
  SELECT 'milestone', coalesce(summary, ''), id FROM milestone;

INSERT INTO entry_fts (entity, text, entity_id)
  SELECT 'quick_criterion', text, id FROM quick_criterion;

INSERT INTO entry_fts (entity, text, entity_id)
  SELECT 'retro_application', note, id FROM retro_application;

INSERT INTO entry_fts (entity, text, entity_id)
  SELECT 'story', coalesce(status_note, ''), id FROM story;

INSERT INTO entry_fts (entity, text, entity_id)
  SELECT 'task', coalesce(description, '') || ' ' || coalesce(status_note, ''), id FROM task;
