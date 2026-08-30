PRAGMA foreign_keys=OFF;
CREATE TABLE schema_version (
  version     INTEGER NOT NULL,
  applied_at  TEXT    NOT NULL,
  UNIQUE (version)
);
CREATE TABLE document_kind (
  kind        TEXT NOT NULL PRIMARY KEY, -- 'spec','epic','retro','review','runbook',…
  dir         TEXT,                      -- projection dir under docs/; NULL = this kind
                                         -- produces no file and renders inside its parent
  numbering   TEXT NOT NULL DEFAULT 'root'
                CHECK (numbering IN ('root','child','none')),
  UNIQUE (kind, numbering)               -- parent key for document's composite FK
);
CREATE TABLE document_kind_parent (
  kind        TEXT NOT NULL REFERENCES document_kind(kind),
  parent_kind TEXT NOT NULL REFERENCES document_kind(kind),
  PRIMARY KEY (kind, parent_kind)
);
CREATE TABLE document_section (
  id           TEXT NOT NULL PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  heading      TEXT    NOT NULL,
  body         TEXT    NOT NULL,
  position     INTEGER NOT NULL, superseded_at TEXT,
  UNIQUE (document_id, position)
);
CREATE TABLE library_document (
  document_id   TEXT NOT NULL PRIMARY KEY,
  document_kind TEXT NOT NULL DEFAULT 'library' CHECK (document_kind = 'library'),
  doc_type      TEXT NOT NULL, source TEXT,     -- 'architecture','coding-standards','domain',…
  FOREIGN KEY (document_id, document_kind) REFERENCES document(id, kind) ON DELETE CASCADE
);
CREATE TABLE library_scope (
  document_id  TEXT NOT NULL REFERENCES library_document(document_id) ON DELETE CASCADE,
  scope        TEXT    NOT NULL,  -- a skill name, or 'all'
  PRIMARY KEY (document_id, scope)
);
CREATE TABLE adr (
  document_id     TEXT NOT NULL PRIMARY KEY,
  document_kind   TEXT NOT NULL DEFAULT 'adr' CHECK (document_kind = 'adr'),
  decision_status TEXT NOT NULL DEFAULT 'proposed'
                    CHECK (decision_status IN
                      ('proposed','accepted','rejected','superseded','deprecated')),
  decision        TEXT NOT NULL,
  FOREIGN KEY (document_id, document_kind) REFERENCES document(id, kind) ON DELETE CASCADE
);
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
CREATE TABLE review (
  document_id    TEXT NOT NULL PRIMARY KEY,
  document_kind  TEXT NOT NULL DEFAULT 'review' CHECK (document_kind = 'review'),
  scope          TEXT NOT NULL DEFAULT 'whole'
                   CHECK (scope IN ('whole','story')),
  scope_story_id TEXT REFERENCES story(id) ON DELETE CASCADE,
  CHECK ((scope = 'story') = (scope_story_id IS NOT NULL)),
  FOREIGN KEY (document_id, document_kind) REFERENCES document(id, kind) ON DELETE CASCADE
);
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
CREATE TABLE requirement (
  id            TEXT NOT NULL PRIMARY KEY,
  spec_id       TEXT    NOT NULL,
  spec_kind     TEXT    NOT NULL DEFAULT 'spec' CHECK (spec_kind = 'spec'),
  label         TEXT    NOT NULL,                  -- display only: 'FR1','NFR3','ENVX2'
  class         TEXT    NOT NULL CHECK (class IN (
                  'functional','non_functional',
                  'environmental_requirement','environmental_restriction')),
  moscow        TEXT    CHECK (moscow IN ('must','should','could','wont')),
  exclusion     TEXT    CHECK (exclusion IN ('deferred','out_of_scope')),
  parent_id     TEXT REFERENCES requirement(id),  -- FR1a's parent is FR1
  text          TEXT    NOT NULL,
  position      INTEGER NOT NULL,
  -- FR26. NULL = nobody has claimed the bindings account for this requirement.
  -- Set together, cleared together, by the Story 7 triggers.
  coverage_claimed_at TEXT,
  coverage_claim_hash TEXT,   -- hash of the bound fragment set at claim time
  FOREIGN KEY (spec_id, spec_kind) REFERENCES document(id, kind) ON DELETE CASCADE,
  UNIQUE (spec_id, label),
  CHECK ((coverage_claimed_at IS NULL) = (coverage_claim_hash IS NULL))
);
CREATE TABLE acceptance_criterion (
  id              TEXT NOT NULL PRIMARY KEY,
  requirement_id  TEXT NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
  text            TEXT    NOT NULL,
  polarity        TEXT    NOT NULL DEFAULT 'must'
                    CHECK (polarity IN ('must','must_not','control')),
  position        INTEGER NOT NULL,
  UNIQUE (requirement_id, position)
);
CREATE TABLE criterion_approach (
  criterion_id  TEXT NOT NULL REFERENCES acceptance_criterion(id) ON DELETE CASCADE,
  tag           TEXT    NOT NULL REFERENCES test_approach(tag),
  PRIMARY KEY (criterion_id, tag)
);
CREATE TABLE story_criterion (
  id          TEXT NOT NULL PRIMARY KEY,
  story_id    TEXT NOT NULL REFERENCES story(id) ON DELETE CASCADE,
  text        TEXT    NOT NULL,
  polarity    TEXT    NOT NULL DEFAULT 'must'
                CHECK (polarity IN ('must','must_not','control')),
  position    INTEGER NOT NULL, superseded_at TEXT, superseded_reason TEXT
  CHECK ((superseded_at IS NULL) = (superseded_reason IS NULL)), warrant_adr_id TEXT REFERENCES adr(document_id),
  UNIQUE (story_id, position)
);
CREATE TABLE story_criterion_approach (
  story_criterion_id TEXT NOT NULL REFERENCES story_criterion(id) ON DELETE CASCADE,
  tag                TEXT    NOT NULL REFERENCES test_approach(tag),
  PRIMARY KEY (story_criterion_id, tag)
);
CREATE TABLE coverage_story (
  coverage_id  TEXT NOT NULL REFERENCES coverage(id) ON DELETE CASCADE,
  story_id     TEXT NOT NULL REFERENCES story(id)    ON DELETE CASCADE,
  PRIMARY KEY (coverage_id, story_id)
);
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
CREATE TABLE document_milestone (
  document_id  TEXT NOT NULL REFERENCES document(id)  ON DELETE CASCADE,
  milestone_id TEXT NOT NULL REFERENCES milestone(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, milestone_id)
);
CREATE TABLE finding (
  id              TEXT NOT NULL PRIMARY KEY,
  review_id       TEXT NOT NULL,
  review_kind     TEXT NOT NULL DEFAULT 'review' CHECK (review_kind = 'review'),
  position        INTEGER NOT NULL,   -- projection order; without it a review's findings render unordered
  agent           TEXT REFERENCES agent(name),   -- nullable: not every finding is attributed
  category_id     TEXT NOT NULL,
  category_domain TEXT NOT NULL DEFAULT 'finding'
                    CHECK (category_domain = 'finding'),
  severity_id     TEXT NOT NULL,
  severity_domain TEXT NOT NULL DEFAULT 'severity'
                    CHECK (severity_domain = 'severity'),
  summary         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','accepted','rejected','remediated')),
  -- Closes a loop CPM leaves open: which findings were actually acted on becomes a query.
  remediation_task_id TEXT REFERENCES task(id),
  FOREIGN KEY (review_id, review_kind)      REFERENCES document(id, kind) ON DELETE CASCADE,
  FOREIGN KEY (category_id, category_domain) REFERENCES taxonomy(id, domain),
  FOREIGN KEY (severity_id, severity_domain) REFERENCES taxonomy(id, domain),
  UNIQUE (review_id, position)
);
CREATE TABLE observation_category (
  observation_id   TEXT NOT NULL REFERENCES observation(id) ON DELETE CASCADE,
  taxonomy_id      TEXT NOT NULL,
  taxonomy_domain  TEXT NOT NULL DEFAULT 'observation'
                     CHECK (taxonomy_domain = 'observation'),
  PRIMARY KEY (observation_id, taxonomy_id),
  FOREIGN KEY (taxonomy_id, taxonomy_domain) REFERENCES taxonomy(id, domain)
);
CREATE TABLE audit_finding (
  id               TEXT NOT NULL PRIMARY KEY,
  audit_id         TEXT NOT NULL,
  audit_kind       TEXT NOT NULL DEFAULT 'audit' CHECK (audit_kind = 'audit'),
  position         INTEGER NOT NULL,   -- projection order, as on `finding`
  dimension_id     TEXT NOT NULL,
  dimension_domain TEXT NOT NULL DEFAULT 'audit_dimension'
                     CHECK (dimension_domain = 'audit_dimension'),
  file             TEXT NOT NULL,
  line             INTEGER,
  symbol           TEXT,
  severity_id      TEXT NOT NULL,
  severity_domain  TEXT NOT NULL DEFAULT 'severity'
                     CHECK (severity_domain = 'severity'), summary TEXT NOT NULL DEFAULT '', recommendation TEXT,
  FOREIGN KEY (audit_id, audit_kind)           REFERENCES document(id, kind) ON DELETE CASCADE,
  FOREIGN KEY (dimension_id, dimension_domain) REFERENCES taxonomy(id, domain),
  FOREIGN KEY (severity_id,  severity_domain)  REFERENCES taxonomy(id, domain),
  UNIQUE (audit_id, position)
);
CREATE TABLE retro_application (
  id            TEXT NOT NULL PRIMARY KEY,
  retro_id      TEXT NOT NULL,
  retro_kind    TEXT NOT NULL DEFAULT 'retro' CHECK (retro_kind = 'retro'),
  -- `applied_to_id` is deliberately NOT kind-pinned: a retro's lesson may be
  -- applied to a document of any kind, so there is no single legal target kind.
  applied_to_id TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  theme         TEXT NOT NULL DEFAULT '',
  disposition   TEXT NOT NULL
                  CHECK (disposition IN ('applied','not_applicable','deferred')),
  note          TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (retro_id, retro_kind) REFERENCES document(id, kind) ON DELETE CASCADE,
  UNIQUE (retro_id, applied_to_id, theme, note)
);
CREATE TABLE artifact (
  id            TEXT NOT NULL PRIMARY KEY,
  url           TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  description   TEXT,
  published_at  TEXT NOT NULL
, retired_at TEXT, retired_reason TEXT
  CHECK ((retired_at IS NULL) = (retired_reason IS NULL)));
CREATE TABLE artifact_document (
  artifact_id   TEXT NOT NULL REFERENCES artifact(id)  ON DELETE CASCADE,
  document_id   TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  PRIMARY KEY (artifact_id, document_id)
);
CREATE TABLE session (
  id             TEXT NOT NULL PRIMARY KEY,       -- CPM_SESSION_ID
  skill          TEXT,
  phase          TEXT,
  state          TEXT,                   -- JSON blob, skill-defined
  superseded_by  TEXT REFERENCES session(id),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE TABLE taxonomy (
  id          TEXT NOT NULL PRIMARY KEY,
  domain      TEXT    NOT NULL,   -- 'observation','finding','audit_dimension','severity','disposition'
  name        TEXT    NOT NULL,   -- canonical form, e.g. 'Patterns Worth Reusing'
  singular    TEXT,               -- per-item display form, e.g. 'Pattern worth reusing'
  position    INTEGER NOT NULL,
  retired_at  TEXT,
  UNIQUE (domain, name),
  -- The parent key every domain-scoped reference resolves against. Without it a reference
  -- can only join to `id`, and a severity fits a category slot — which relocates the drift
  -- rather than removing it.
  UNIQUE (id, domain)
);
CREATE TABLE agent (
  name                TEXT NOT NULL PRIMARY KEY, -- 'pm', 'architect' — the id skills reference
  display_name        TEXT    NOT NULL,          -- 'Jordan'
  icon                TEXT    NOT NULL,          -- single emoji, the party-mode prefix
  role                TEXT    NOT NULL,          -- 'Product Manager'
  personality         TEXT    NOT NULL,
  communication_style TEXT    NOT NULL,
  position            INTEGER NOT NULL,
  retired_at          TEXT,
  UNIQUE (display_name)                          -- two Jordans make rendered output ambiguous
);
CREATE TABLE test_approach (
  tag         TEXT NOT NULL PRIMARY KEY,  -- unit, integration, feature, manual, target, tdd
  kind        TEXT NOT NULL CHECK (kind IN ('level','mode')),
  position    INTEGER NOT NULL,
  retired_at  TEXT
);
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
CREATE TABLE dependency_kind (
  kind         TEXT NOT NULL PRIMARY KEY,  -- 'blocks','builds_on','constrains','supersedes'
  gates_work   INTEGER NOT NULL DEFAULT 0,
  position     INTEGER NOT NULL,
  retired_at   TEXT                        -- FR24 applies here too
);
CREATE TABLE dependency (
  id                  TEXT NOT NULL PRIMARY KEY,
  kind                TEXT NOT NULL REFERENCES dependency_kind(kind),
  -- Both ends are deliberately not kind-pinned, and are named as such in the Data Model's
  -- enumeration: which kinds are legal at each end varies by edge kind, which is register
  -- entry #6 rather than a constraint.
  source_document_id  TEXT REFERENCES document(id) ON DELETE CASCADE,
  source_story_id     TEXT REFERENCES story(id)    ON DELETE CASCADE,
  target_document_id  TEXT REFERENCES document(id) ON DELETE CASCADE,
  target_story_id     TEXT REFERENCES story(id)    ON DELETE CASCADE,
  CHECK ((source_document_id IS NULL) <> (source_story_id IS NULL)),
  CHECK ((target_document_id IS NULL) <> (target_story_id IS NULL)),
  CHECK (source_document_id IS NULL OR target_document_id IS NULL
         OR source_document_id <> target_document_id),
  CHECK (source_story_id IS NULL OR target_story_id IS NULL
         OR source_story_id <> target_story_id)
);
CREATE UNIQUE INDEX dependency_edge ON dependency (
  kind,
  coalesce(source_document_id, -1), coalesce(source_story_id, -1),
  coalesce(target_document_id, -1), coalesce(target_story_id, -1)
);
CREATE VIRTUAL TABLE document_fts USING fts5(heading, body, section_id UNINDEXED);
CREATE TRIGGER document_fts_insert
AFTER INSERT ON document_section
BEGIN
  INSERT INTO document_fts (heading, body, section_id)
  VALUES (NEW.heading, NEW.body, NEW.id);
END;
CREATE TRIGGER document_fts_update
AFTER UPDATE OF heading, body ON document_section
BEGIN
  DELETE FROM document_fts WHERE section_id = OLD.id;
  INSERT INTO document_fts (heading, body, section_id)
  VALUES (NEW.heading, NEW.body, NEW.id);
END;
CREATE TRIGGER document_fts_delete
AFTER DELETE ON document_section
BEGIN
  DELETE FROM document_fts WHERE section_id = OLD.id;
END;
CREATE VIRTUAL TABLE entry_fts USING fts5(entity, text, entity_id UNINDEXED);
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
CREATE TABLE "observation" (
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
CREATE UNIQUE INDEX observation_retro_position
  ON observation (retro_id, position) WHERE retro_id IS NOT NULL;
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
CREATE TABLE "document" (
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
CREATE UNIQUE INDEX document_id_kind      ON document (id, kind);
CREATE UNIQUE INDEX document_root_number
  ON document (kind, number)              WHERE number IS NOT NULL;
CREATE UNIQUE INDEX document_child_number
  ON document (kind, parent_id, sequence)
  WHERE sequence IS NOT NULL AND parent_id IS NOT NULL;
CREATE TABLE "story" (
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
CREATE TABLE "task" (
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
CREATE TABLE document_agent (
  document_id   TEXT NOT NULL,
  document_kind TEXT NOT NULL CHECK (document_kind IN ('review','discussion')),
  agent         TEXT NOT NULL REFERENCES agent(name),
  PRIMARY KEY (document_id, agent),
  FOREIGN KEY (document_id, document_kind) REFERENCES document(id, kind) ON DELETE CASCADE
);
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
CREATE TABLE plugin_stamp (
  singleton  INTEGER NOT NULL DEFAULT 1 CHECK (singleton = 1),
  version    TEXT    NOT NULL,
  UNIQUE (singleton)
);
CREATE TABLE dependency_kind_endpoint (
  kind         TEXT NOT NULL REFERENCES dependency_kind(kind),
  source_kind  TEXT NOT NULL REFERENCES document_kind(kind),
  target_kind  TEXT NOT NULL REFERENCES document_kind(kind),
  PRIMARY KEY (kind, source_kind, target_kind)
);
CREATE TABLE "coverage" (
  id                 TEXT NOT NULL PRIMARY KEY,
  requirement_id     TEXT NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
  spec_fragment      TEXT    NOT NULL,
  story_criterion_id TEXT NOT NULL REFERENCES story_criterion(id) ON DELETE CASCADE,
  position           INTEGER NOT NULL,   -- display order only; NOT part of identity
  verified_at        TEXT,            -- NULL = unverified; the ✓ column
  binding_hash       TEXT,            -- hash of (spec_fragment ‖ criterion text) at verification
  retired_at         TEXT,            -- NULL = live; a retired binding stays readable by key
  retired_reason     TEXT,
  CHECK ((verified_at IS NULL) = (binding_hash IS NULL)),
  CHECK ((retired_at IS NULL) = (retired_reason IS NULL))
);
CREATE UNIQUE INDEX coverage_binding
  ON coverage (requirement_id, spec_fragment, story_criterion_id)
  WHERE retired_at IS NULL;
CREATE TRIGGER entry_fts_coverage_insert
AFTER INSERT ON coverage
WHEN NEW.retired_reason IS NOT NULL
BEGIN
  INSERT INTO entry_fts (entity, text, entity_id)
  VALUES ('coverage', NEW.retired_reason, NEW.id);
END;
CREATE TRIGGER entry_fts_coverage_update
AFTER UPDATE OF retired_reason ON coverage
BEGIN
  DELETE FROM entry_fts WHERE entity = 'coverage' AND entity_id = OLD.id;
  INSERT INTO entry_fts (entity, text, entity_id)
  SELECT 'coverage', NEW.retired_reason, NEW.id WHERE NEW.retired_reason IS NOT NULL;
END;
CREATE TRIGGER entry_fts_coverage_delete
AFTER DELETE ON coverage
BEGIN
  DELETE FROM entry_fts WHERE entity = 'coverage' AND entity_id = OLD.id;
END;
INSERT INTO "schema_version" ("version", "applied_at") VALUES (1, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (2, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (3, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (4, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (5, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (6, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (7, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (8, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (9, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (10, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (11, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (12, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (13, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (14, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (15, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (16, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (17, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (18, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (19, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (20, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (21, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (22, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (23, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (24, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (25, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (26, '1970-01-01T00:00:00Z');
INSERT INTO "schema_version" ("version", "applied_at") VALUES (27, '1970-01-01T00:00:00Z');
INSERT INTO "document_kind" ("kind", "dir", "numbering") VALUES ('adr', NULL, 'child');
INSERT INTO "document_kind" ("kind", "dir", "numbering") VALUES ('audit', 'audits', 'root');
INSERT INTO "document_kind" ("kind", "dir", "numbering") VALUES ('communication', 'communications', 'root');
INSERT INTO "document_kind" ("kind", "dir", "numbering") VALUES ('coverage_matrix', 'epics', 'child');
INSERT INTO "document_kind" ("kind", "dir", "numbering") VALUES ('discussion', 'discussions', 'root');
INSERT INTO "document_kind" ("kind", "dir", "numbering") VALUES ('epic', 'epics', 'child');
INSERT INTO "document_kind" ("kind", "dir", "numbering") VALUES ('library', 'library', 'root');
INSERT INTO "document_kind" ("kind", "dir", "numbering") VALUES ('problem_brief', 'plans', 'root');
INSERT INTO "document_kind" ("kind", "dir", "numbering") VALUES ('product_brief', 'briefs', 'root');
INSERT INTO "document_kind" ("kind", "dir", "numbering") VALUES ('quick', 'quick', 'root');
INSERT INTO "document_kind" ("kind", "dir", "numbering") VALUES ('retro', 'retros', 'root');
INSERT INTO "document_kind" ("kind", "dir", "numbering") VALUES ('review', 'reviews', 'root');
INSERT INTO "document_kind" ("kind", "dir", "numbering") VALUES ('runbook', 'runbooks', 'root');
INSERT INTO "document_kind" ("kind", "dir", "numbering") VALUES ('spec', 'specifications', 'root');
INSERT INTO "document_kind_parent" ("kind", "parent_kind") VALUES ('adr', 'discussion');
INSERT INTO "document_kind_parent" ("kind", "parent_kind") VALUES ('adr', 'problem_brief');
INSERT INTO "document_kind_parent" ("kind", "parent_kind") VALUES ('adr', 'product_brief');
INSERT INTO "document_kind_parent" ("kind", "parent_kind") VALUES ('adr', 'spec');
INSERT INTO "document_kind_parent" ("kind", "parent_kind") VALUES ('coverage_matrix', 'epic');
INSERT INTO "document_kind_parent" ("kind", "parent_kind") VALUES ('epic', 'spec');
INSERT INTO "document_kind_parent" ("kind", "parent_kind") VALUES ('product_brief', 'problem_brief');
INSERT INTO "document_kind_parent" ("kind", "parent_kind") VALUES ('retro', 'epic');
INSERT INTO "document_kind_parent" ("kind", "parent_kind") VALUES ('retro', 'quick');
INSERT INTO "document_kind_parent" ("kind", "parent_kind") VALUES ('retro', 'spec');
INSERT INTO "document_kind_parent" ("kind", "parent_kind") VALUES ('review', 'epic');
INSERT INTO "document_kind_parent" ("kind", "parent_kind") VALUES ('review', 'spec');
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M190SGQ8KM0XBJ0ZX3QCB61S', '01M190RZY3N512H26B7SMAPWKS', 'Summary', 'Clean fork of dpm v0.7.0 into a standalone OpenCode v2 repository; no Claude Code compatibility in this repo, no OpenCode v1 support, no shared core with the marketplace repo.

The MCP server stays the tool boundary — skills write exclusively through typed tools, no skill contains SQL, nothing parses prose. Native plugin tools (`ctx.tool.transform`) are deliberately not used this iteration.

Erasable-syntax TypeScript, run natively by Node ≥ 24. No build step, no runtime dependencies beyond `@opencode-ai/plugin`, no native modules. One `enum`, namespace with runtime meaning, or parameter property breaks native execution.

Skills are registered from the installed package via `ctx.skill.transform`, never copied into `.opencode/skills/`; skill IDs are prefixed `dpm-` because v2 IDs are a flat last-source-wins namespace. Invocation is skill-first — `/dpm:` does not exist in v2.

Schema, ULID identity, number sequences, the document supertype, coverage, the one-way projection, the dump and the guard are inherited unchanged and must stay byte-deterministic across the port.

No skill body may name a Claude Code mechanism (`mcp__plugin_`, `/dpm:`, `CLAUDE_PLUGIN_ROOT`, `.claude/`) — enforced as a CI grep, not a review convention.

The model-facing surface is a registration-time profile, not a fork: a `lite` profile registers a reduced skill set and trimmed tool advertisement against the same server and the same database.', 0, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M190SQNKKN1509CTS0MR5AS2', '01M190RZY3N512H26B7SMAPWKS', 'Problem Summary', '**Status:** Draft for review
**Repository:** `ninthspace/opencode-dpm` (new, standalone)
**Fork point:** Clean fork of `dpm` v0.7.0 from `ninthspace/claude-code-marketplace`

DPM exists today as a Claude Code plugin: an MCP server over `node:sqlite`, twenty-three skills that write through typed tools, a one-way markdown projection, a committed `.sql` dump, and a pre-commit guard. OpenCode v2 has a different extension model — TypeScript plugins loaded via `Plugin.define`, with the plugin context registering MCP servers, skills, commands, and tools programmatically — and its beta explicitly warns that plugin APIs may change.

The port is a separate repository so that neither codebase constrains the other. The Claude Code plugin continues to live in the marketplace; this repository targets OpenCode v2 only, diverges where v2 idiom differs, and accepts the maintenance cost of two codebases in exchange for each being native to its host.', 1, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M190SYP8C8AT51VY13WBF9M9', '01M190RZY3N512H26B7SMAPWKS', 'Functional Requirements — Must Have', '- **FR1 — Single-command install.** `opencode2 plugin add github:ninthspace/opencode-dpm` (and later the npm form) yields a working DPM: MCP server registered and connected, all skills advertised, nothing further to copy into the project.
- **FR2 — The MCP server is the tool surface.** The plugin registers the bundled server via `ctx.mcp.transform` (`draft.set("dpm", { type: "local", command: [...] })`). Skills continue to write exclusively through typed MCP tools; no skill contains SQL and nothing parses prose. Tool *behaviour* and schemas carry over from v0.7.0 unchanged.
- **FR3 — Skills registered from the package.** All skills port and are registered via `ctx.skill.transform`, with `location` pointing into the installed package so directory-based skills keep their supporting-file sample. Skill prose is revised wherever it names host mechanics: tool names take v2''s effective naming, and `/dpm:spec`-style triggers become the v2 invocation story (see AD6).
- **FR4 — Persistence parity.** Fresh-clone restore from `.dpm/dpm.sql`, deterministic dump on publish, the empty-database restore asymmetry (AD14 in the source spec), read-only server mode, and the Node-floor refusal all carry over.
- **FR5 — The five executables port.** `dpm-mcp`, `dpm-guard`, `dpm-publish`, `dpm-import`, `dpm-merge` — same responsibilities, TypeScript sources, still runnable directly with `node`.
- **FR6 — Pre-commit guard unchanged in kind.** It remains a git hook that regenerates and compares, fixes nothing, and refuses with the four-case explanation. The install instruction is updated for where OpenCode places plugin packages, and the missing-symlink warning on server start (hook-check) carries over.
- **FR7 — Test suite ports.** The `node --test` suite, including the corpus snapshot tests, runs against the TypeScript sources in CI.', 2, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M190T1F47CRCM0MGCRW4855V', '01M190RZY3N512H26B7SMAPWKS', 'Functional Requirements — Should Have', '- **FR8 — Permission-aware behaviour.** Skills behave correctly under `ask` and `deny` rules for the `skill` action; the README documents recommended permission entries.
- **FR9 — Session scratch via plugin storage.** Anything that was per-session scratch keyed by an environment variable in Claude Code uses `ctx.storage` where a DB session row is not already the answer. No transient files land in the project tree.
- **FR10 — README for a v2 audience.** Install, first run, guard symlink, and "when the guard refuses" rewritten for `opencode2`; the CPM MIGRATION.md does not carry over (see Won''t Have).', 3, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M190TE41THFXMD2AQD46PZJS', '01M190RZY3N512H26B7SMAPWKS', 'Functional Requirements — Could Have', '- **FR11 — Slash-catalog commands.** Register `ctx.command.transform` entries that prompt the session into a named skill, restoring something close to the `/dpm:spec` ergonomics if skill-as-slash proves insufficient.
- **FR12 — HTTP skill catalog.** Publish the skills as a v2 HTTP catalog for teams that want skills without the plugin. Low value while tools require the plugin anyway.
- **FR13 — Lite profile for local open-weight models.** A `profile: "lite"` plugin option registers a reduced model-facing surface for constrained local models (target: Qwen3.8-27B under MTPLX). The selection criterion is the daily loop, not simplicity, on the assumption the full profile stays one config edit away against the same database: **quick** (the flagship — right-sized single-record changes), **spec** (cut hardest: fewer gates, no Perspectives), **epics**, **do** (its verify-record rhythm is what keeps a small model honest), **status** (cheap re-orientation for short-context session restarts), **publish** (or lite cannot commit past the guard), and **consult** constrained to a single persona — panel mode stays full-profile, since multi-persona breadth is the capability gap itself. Excluded by category: judgment-breadth facilitation (party, review, brief, discover, architect), autonomy (ralph), and corpus maintenance (pivot, retro, library, audit, inspect, present, artifact, archive, templates, clean), all of which run under the full profile against the shared corpus. All skills rewritten as terse imperative checklists, tool descriptions and schemas hard-trimmed, conventions inlined instead of the read-at-startup file. The database, schema, projection, dump, and guard are byte-identical across profiles — a corpus planned under lite continues under full, and vice versa, with no migration.
- **FR14 — Lite-profile error messages a small model can act on.** Tool refusals in lite are single-sentence, name the field, and state the correction, on the working assumption that a 4-bit 27B retries from the error text rather than from re-read documentation.', 4, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M190TG9R7FYYF6EFGCHDGWYW', '01M190RZY3N512H26B7SMAPWKS', 'Won''t Have (this iteration)', '- Claude Code compatibility in this repository — the marketplace repo remains the home of the Claude Code plugin.
- OpenCode v1 support.
- CPM migration tooling — anyone on CPM migrates via the existing Claude Code dpm first.
- CLI/TUI plugin work (`cli.json` plugins, theme or keybinding integration).', 5, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M190TKAMZXXKSPDF9J3MAS2P', '01M190RZY3N512H26B7SMAPWKS', 'Non-Functional Requirements', '- **NFR1 — Zero runtime dependencies.** `node:sqlite` stays; no native modules, no install-time compilation. The only `dependencies` entry is `@opencode-ai/plugin`.
- **NFR2 — No build step.** TypeScript throughout, restricted to erasable syntax so Node runs the sources directly (see AD3). `tsc --noEmit` is a CI check, not a compile.
- **NFR3 — Beta churn tolerance.** The plugin pins `@opencode-ai/plugin@beta` and the README states plainly that v2 is beta and entrypoints may move under it. API breakage is expected maintenance, not a bug.
- **NFR4 — Determinism.** Dump output, projection output, and ULID/number allocation behaviour remain byte-stable across the port; the guard depends on it.', 6, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M190V4BSDZF50PGVB1AV3E5J', '01M190RZY3N512H26B7SMAPWKS', 'Architecture Decisions', '### AD1 — Clean fork, free to diverge

The repository vendors the dpm v0.7.0 sources as its starting commit and takes no dependency — package, git, or copy-script — on the marketplace repo. Fixes flow between the two by hand when worth it. The alternative (a shared `dpm-core`) was rejected: the extraction cost lands immediately, the benefit only materialises if both hosts stay API-compatible with the core, and v2''s beta churn makes that unlikely this year.

### AD2 — The MCP server remains the tool boundary

v2 offers native plugin tools (`ctx.tool.transform`), which would eliminate the child process. Rejected for this iteration: the MCP server is the most tested seam in dpm, the typed contract and its conformance tests carry over wholesale, and the server keeps working for any other MCP-speaking host. The plugin''s job is registration, not reimplementation. Native tools remain open as a future migration with the plugin as the obvious seam to do it behind.

### AD3 — Erasable-syntax TypeScript, run natively; Node ≥ 24 floor

The port is authored in TypeScript but ships sources, not artefacts. OpenCode loads the plugin''s `.ts` entry directly (its own manifest examples export `./src/index.ts`), and Node 24 type-strips erasable TypeScript natively — which covers the whole codebase as long as it avoids non-erasable constructs (`enum`, namespaces with runtime meaning, parameter properties). The Node floor rises from 22.5 to 24: it buys stable native TS execution and a stable `node:sqlite` in one move, and a new repo has no installed base to protect. The floor check in each executable ports with the new number and the same refuse-with-a-message behaviour.

### AD4 — SQLite remains the source of truth; the data model does not change

Schema, ULID identity, number sequences, the document supertype, coverage, and the one-way projection are inherited from the source spec''s AD1–AD11 without modification. This spec deliberately re-decides nothing below the host boundary.

### AD5 — Skills are registered, not copied

The plugin registers skills from its own package via `ctx.skill.transform` rather than asking users to copy directories into `.opencode/skills/`. One install, one version, and an upgrade replaces everything atomically. Skill IDs are prefixed `dpm-` (`dpm-spec`, `dpm-do`, …) because v2 skill IDs are a flat, last-source-wins namespace and unprefixed names like `review` and `status` invite silent collisions.

### AD6 — Invocation is skill-first

`/dpm:spec` does not exist in v2. Skills with a `description` are advertised to the model and appear in the slash catalog unless `slash: false`; that is the primary invocation path, and skill descriptions are rewritten so "trigger on /dpm:spec" becomes model-facing language plus the `dpm-` slash entry. FR11''s explicit commands exist as a fallback if the catalog ergonomics disappoint in practice.

### AD7 — Registration is idempotent and disposal-clean

`setup` returns a cleanup that disposes registrations; transforms are written to be replayed (v2 replays transforms on reload). No transform closes over mutable state that a replay would observe differently — server command, skill list, and command list are computed before the transform registers.

### AD8 — The model-facing surface is a profile, not a fork

Only two parts of dpm are model-facing: skill prose and the advertised tool surface. Everything below them — schema, identity, projection, dump, guard — is deterministic code no model touches. Supporting weaker models is therefore a registration-time choice, selected via v2 plugin options (`{ "options": { "profile": "lite" } }`), not a parallel repository: the plugin registers a different skill set and trimmed tool advertisement against the same server and the same database. A parallel repo was rejected because it would fork the invariant part to vary the variable part. The profile also bounds context cost deliberately: the target runtime''s decode rate roughly halves between 1K and 16K tokens of context, so the lite surface budget (schemas plus any one skill body) is a number, set and tested, not an aspiration.', 7, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M190VBWR4ETXZFHQF4MB05ZY', '01M190RZY3N512H26B7SMAPWKS', 'Repository Layout', '```
opencode-dpm/
├── src/
│   ├── index.ts              # Plugin.define entry: MCP + skills (+ commands)
│   ├── server/               # ported dpm MCP server
│   ├── tools/                # typed tool implementations
│   ├── projection/ …         # coverage, dump, guard, import, merge, …
├── bin/                      # dpm-mcp.ts, dpm-guard.ts, dpm-publish.ts, …
├── skills/
│   ├── dpm-spec/SKILL.md
│   ├── dpm-do/SKILL.md …
├── hooks/pre-commit
├── shared/                   # skill-conventions.md, status-model.md
├── tests/
├── package.json              # name: opencode-dpm, exports ./src/index.ts
└── opencode.jsonc            # dev: loads ./src/index.ts as a local plugin
```', 8, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M190VJ7G1F4F3QN62PQDYXXP', '01M190RZY3N512H26B7SMAPWKS', 'Risks and Verification Items', '1. **Effective MCP tool names in v2.** Skill prose names tools; the exact rendered name for MCP-provided tools (namespacing, `_` substitution) must be verified against a running beta before skills are rewritten. First implementation task.
2. **`ctx.skill.transform` and supporting files.** The docs say directory-based `SKILL.md` skills get the ten-file sample; confirm registered skills with a package `location` behave the same. If not, skills inline their critical references.
3. **Beta API drift.** Transforms, hook names, and `SkillInfo` shape may change before 2.0 stable. Mitigated by NFR3 and by keeping the plugin entry thin.
4. **Erasable-syntax discipline.** One `enum` breaks native execution. CI runs the test suite under plain `node` — no loader — so a violation fails immediately.
5. **Guard symlink target.** OpenCode''s package cache location for git-installed plugins needs confirming so the README''s absolute-symlink instruction is right.
6. **Local-model tool-call adherence.** The lite profile assumes a 4-bit 27B can drive typed MCP tools reliably enough for gated facilitation. Unproven; validate with one skill (`dpm-spec` lite) against MTPLX before building the rest, and compare the 8-bit Optimized Quality build, which is markedly closer to the bf16 distribution and the likelier fit for judgment-heavy planning sessions.', 9, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M190VP8JCJ0YNEXGKNF1SJ84', '01M190RZY3N512H26B7SMAPWKS', 'First Milestones', '1. Repo bootstrap: vendor v0.7.0, rename, TS conversion of `bin/` + `src/server/`, floor bump, suite green under Node 24.
2. Plugin entry: MCP registration working end-to-end in `opencode2` against a scratch project; verify risk items 1–2.
3. Skill port: pilot one skill end-to-end first (`dpm-spec` — it exercises gates, tool calls, and the shared conventions file) against a scratch project before the batch pass; then prefix IDs, rewrite tool names and invocation prose, register from package. **Acceptance criterion:** no skill body names a Claude Code mechanism (`mcp__plugin_`, `/dpm:`, `CLAUDE_PLUGIN_ROOT`, `.claude/`) — enforced as a CI grep, not a review convention.
4. Guard and docs: hook path, README, permission guidance.
5. Publish: npm `opencode-dpm@0.1.0`, install tested from the published artefact, not the working tree.
6. Lite profile (after 1–5 are stable): profile option plumbing, context budget set and measured, `dpm-spec` lite piloted against MTPLX per risk 6, then the remaining core skills.', 10, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M19162VAY0JBPVK9N2EJQQ4Y', '01M1915SM9WVHJY2SYBZ04M3CR', 'What was reviewed', 'The library document {{ref:01M190RZY3N512H26B7SMAPWKS}}, immediately after import — the design spec for porting dpm v0.7.0 from a Claude Code plugin to a standalone OpenCode v2 repository.

The room went at it as a plan to be executed rather than a document to be admired, so the findings are about what the plan does not survive contact with: a boundary drawn in one decision and crossed by a requirement, a language constraint stated at half its true width, and a Could Have carrying more work than every Must Have combined.

Four amendments were agreed and one question was settled by the user. Nothing was written to the document during the discussion.', 0, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M1916A4PF059D053M0BY1HMY', '01M1915SM9WVHJY2SYBZ04M3CR', 'AD8''s model-facing boundary is drawn one clause too narrow', 'AD8 states that only two parts of dpm are model-facing — skill prose and the advertised tool surface — and that everything beneath them is deterministic code no model touches. FR14 then specifies that lite-profile tool refusals are rewritten as single sentences that name the field and state the correction, on the assumption that a small model retries from the error text rather than from documentation. Those strings live in the server, below the boundary AD8 has just declared impassable.

Margot named the two honest resolutions: move the boundary down to include refusal text, or make FR14 a registration-time wrapper that rewrites refusals on the way out. The document as written claims the first is unnecessary while requiring it.

**Decision: keep AD8 and amend it.** The user kept the decision, and the room agreed the clause is worth adding even though FR14 itself is being deferred. The reasoning is inheritance: {{ref:01M190RZY3N512H26B7SMAPWKS}} is scoped to `architect` and `spec`, so the deferred lite spec will load it and take AD8 as given. Left as written, that spec re-derives this exact contradiction later with less context available to resolve it. The amendment is one clause — model-facing means skill prose, the advertised tool surface, and the text of tool refusals.

Margot also made the case for why AD8 must not simply be deleted along with the requirements it enables: it is the reason skill IDs and tool advertisement go through registration rather than being baked in. Remove the decision and the seam disappears in milestone 2, when someone hardcodes the skill list into the plugin entry and nothing in the plan objects.', 1, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M1916P44KAWDCM74ZVG71QC2', '01M1915SM9WVHJY2SYBZ04M3CR', 'FR13 is deferred, and the target spec is created first', 'Jordan''s objection was to the placement, not the ambition. FR13 re-scopes seven skills as terse imperative checklists, hard-trims every tool description and schema, inlines the shared conventions rather than reading them at startup, sets and measures a context budget against a named decode-rate curve, and takes on an unproven assumption about 4-bit tool-call adherence. That is a second project wearing a bullet point, and it sits in Could Have beneath Must Haves that are each a fraction of its size. It is also the only requirement in the document with a target user who is not the author.

**Decision: FR13 is explicitly deferred to a subsequent spec**, on the user''s reasoning that the lite profile is an iteration on what is being built now rather than part of it — so it earns its own document even if that document initially holds very little.

Ren supplied the condition that makes it a deferral rather than a deletion: the subsequent spec has to exist as a row before {{ref:01M190RZY3N512H26B7SMAPWKS}} can point at it. A redirect to nothing is scope that returns through the side door during milestone 4, when someone reasons that they may as well, while they are in there. What it costs is one spec run; what it buys is that the port has five milestones and a visible end.

Elli established the ordering, and it is not cosmetic. A document naming another writes `{{ref:<id>}}` and never the number, so the deferral sentence cannot be written until the target has an id to carry. Written the other way round, the amendment reads as a sentence about a future lite-profile spec and resolves to nothing. Create the stub, take its id, then amend. She also argued for naming it after the lite profile rather than a phase or an ordinal, which ages badly the moment there is a third.

FR14 leaves with FR13, being lite-only — but the AD8 clause it exposed stays, for the inheritance reason above.', 2, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M1916W5SQ3BBGDG7M2BSC3BP', '01M1915SM9WVHJY2SYBZ04M3CR', 'Import-extension discipline becomes its own requirement', 'AD3 constrains the codebase to erasable TypeScript so Node 24 can type-strip and run the sources directly, and names the constructs to avoid — `enum`, namespaces with runtime meaning, parameter properties. Bella''s point is that this is the easy half. Native type-stripping also requires import specifiers to resolve exactly as written, so every internal import must carry the `.ts` extension, and `tsc --noEmit` then only accepts that under `allowImportingTsExtensions`. That constraint touches every file in the repository, where the named constructs touch a handful.

Risk 4 says a violation fails immediately because CI runs the suite under plain `node` with no loader. That holds for `enum`. It does not obviously hold for a missing extension in a module that no test happens to import.

**Decision: a separate checkable requirement, per the user''s call for Bella''s position over Margot''s.** Margot argued it belongs inside AD3 as a consequence of a decision already taken; Bella argued it needs its own line because CI has to test for it separately, and separate enforcement is what carried the decision. The distinction is real — one is an architectural consequence, the other is a thing a machine has to check on every commit, and folding the second into the first leaves nobody accountable for writing the check.', 3, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M19175DCB0GE6XEFJ1SX74DZ', '01M1915SM9WVHJY2SYBZ04M3CR', 'Deferring FR13 strands risk 2', 'Tomas traced a consequence the deferral creates rather than removes. Risk 6 — whether a 4-bit 27B can drive typed MCP tools through gated facilitation — leaves cleanly with FR13, and the room was content to see it go, being the one item nobody could close without hardware present.

Risk 2 is the casualty. It asks whether `ctx.skill.transform` with a package `location` gives registered skills the supporting-file sample that directory-based skills get, and its stated fallback is that skills inline their critical references. FR13 was quietly the evidence base for that fallback working: *conventions inlined instead of the read-at-startup file* was going to be tried under lite first. With lite deferred, the fallback has no precedent anywhere in the plan, and if risk 2 lands badly the port inlines the shared conventions into twenty-three skills with nothing to say whether that is survivable — reintroducing precisely the duplication the conventions file exists to eliminate.

**Recommendation: promote risk 2 to a milestone-2 gate with a written go/no-go**, rather than leaving it as a bullet in a risk list. It gates FR3, which gates the entire skill port.', 4, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M1917D3ER48APB1SQESBBAVS', '01M1915SM9WVHJY2SYBZ04M3CR', 'Agreed amendment sequence', 'One pass over {{ref:01M190RZY3N512H26B7SMAPWKS}}, in this order — the ordering is load-bearing at step 1 only, for the reference reason Elli gave.

1. Create the lite-profile spec, so it has an id to be referenced by. It may hold very little; what it must hold is a title, the problem it will eventually solve, and enough of FR13''s substance that the material is not lost in transit.
2. Amend AD8 with the refusal-text clause.
3. Replace FR13 and FR14 with a redirect carrying `{{ref:<id>}}` to that spec, leaving the profile seam decision itself intact in AD8.
4. Add the import-extension requirement as its own checkable line, with the CI check named.
5. Drop risk 6; promote risk 2 to a milestone-2 go/no-go gate.
6. Drop milestone 6, which was the lite build.

Ren''s note on batching: steps 2 to 6 are one amendment pass, not five. Splitting them means the document is internally inconsistent between passes, and a Library Check running in that window loads a half-amended constraint.', 5, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M1917QXZTDGK6Y239KHNVBQ0', '01M1915SM9WVHJY2SYBZ04M3CR', 'Still open', '**Risk 1 was never discussed and remains the first implementation task.** The effective rendered name of MCP-provided tools under OpenCode v2 — namespacing, character substitution — has to be verified against a running beta before any skill prose is rewritten, because skill bodies name tools. Nothing the room decided changes that, and it is upstream of the whole skill port.

**Whether the lite-profile spec is written now or at deferral time.** The room assumed now, because step 1 of the amendment sequence requires an id. If it is written later, the amendment to {{ref:01M190RZY3N512H26B7SMAPWKS}} cannot carry a resolvable marker and the deferral is a promise in prose.

**How much of FR13''s substance the stub carries.** Ren wanted a pointer; Elli wanted the material preserved so the reasoning behind the skill selection — the daily loop rather than simplicity — is not reconstructed from memory later. Not resolved.

Three of the nine in the room did not speak: Priya on the invocation change from `/dpm:` to skill-first, which is a user-facing ergonomics shift nobody examined; Casey on what level of test proves the port correct beyond the ported suite; Sable on the guard symlink target and the npm publish path. Each has a live surface in this document.', 6, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M191BSPRBT66WKS1YD87PGA2', '01M191BE7MHM077FE9YM09B2ZK', 'Problem Recap', 'DPM exists as a Claude Code plugin: an MCP server over `node:sqlite`, twenty-three skills that write exclusively through typed tools, a one-way markdown projection, a committed `.sql` dump, and a pre-commit guard that regenerates and compares. Measured at v0.7.0 the subject of the port is roughly 14,600 lines across 100 source files, 133 test files, 23 skills, 5 executables, a Node floor of 22.5.0, and zero runtime dependencies.

OpenCode v2 has a different extension model — TypeScript plugins loaded via `Plugin.define`, with the plugin context registering MCP servers, skills, commands and tools programmatically — and is explicitly beta, with plugin APIs that may move before 2.0 stable.

The port is a new standalone repository, `ninthspace/opencode-dpm`, vendoring dpm v0.7.0 as its starting commit and taking no dependency — package, git, or copy-script — on the marketplace repo, which remains the home of the Claude Code plugin. Two codebases is the accepted maintenance cost; each being native to its host is what it buys.

**Scope of this specification:** the port itself — install, registration, persistence parity, the five executables, the guard, the test suite, and documentation for a v2 audience. Nothing below the host boundary changes.

**Explicitly not covered:** the lite profile for constrained local open-weight models, deferred to a specification of its own as an iteration on what this one builds. The architectural seam that makes a profile possible is decided here; the build behind that seam is not.

The specification also carries three positions established in review that the source document did not hold: the model-facing boundary includes the text of tool refusals, import-extension discipline is a separately checkable requirement rather than a clause inside the language decision, and the supporting-files behaviour of skill registration is a go/no-go gate rather than a risk bullet — because its fallback, inlining the shared conventions into twenty-three skills, has no precedent left in the plan.', 0, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M191YNBPM2CWE9S5TAVFZTHB', '01M191BE7MHM077FE9YM09B2ZK', 'Scope: In Scope', 'Five milestones, in order.

**1. Repo bootstrap.** Vendor v0.7.0, rename, convert `bin/` and `src/` to TypeScript, raise the Node floor to 24, and get the suite green under Node 24 with the module sweep in place.

**2. Plugin entry.** MCP registration working end-to-end in `opencode2` against a scratch project. **Two verification items gate this milestone.** The first is the effective rendered name of MCP-provided tools under v2 — namespacing and character substitution — which must be established before any skill prose is rewritten, because skill bodies name tools. The second is whether skills registered with a package `location` resolve their supporting files the way directory-based skills do, and it is **a written go/no-go**: if the answer is no, the fallback is inlining the shared conventions into twenty-three skills, which reintroduces exactly the duplication that file exists to eliminate and has no precedent left in the plan now that the lite profile is deferred. That decision is taken explicitly, at this milestone, and recorded.

**3. Skill port.** Pilot one skill end-to-end first — the spec skill, because it exercises gates, tool calls and the shared conventions file — against a scratch project before the batch pass. Then prefix the IDs, rewrite tool names and invocation prose, and register from the package. The CI grep enforcing that no skill body names a Claude Code mechanism lands here.

**4. Guard and docs.** Hook path, README, permission guidance. OpenCode''s package cache location for a git-installed plugin is confirmed here rather than left to the first user to discover, since it decides whether the README''s symlink instruction is correct.

**5. Publish.** npm at 0.1.0, with install tested from the published artefact rather than the working tree: a clean environment, install by version, register, and run one skill end to end.

**What the inherited suite evidences, and what it does not.** The 133 test files carry over from a codebase that already passed them, so a green suite in milestone 1 establishes that the TypeScript conversion broke nothing beneath the host boundary. It is a regression net over the part that is not changing. Everything genuinely new in this port — registration, skill advertisement, invocation, the guard''s new hook path — is verified in milestones 2 through 5 by checks nobody has written yet, and a green milestone 1 should not be read as coverage of any of it.', 1, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M191YW0G1JBEA2CVWKMGKY8J', '01M191BE7MHM077FE9YM09B2ZK', 'Scope: Deferred', 'The lite profile for constrained local open-weight models, carried here as FR13 with an exclusion rather than as silence, and deferred to a specification of its own.

What is deferred is the build: the reduced skill set, the terse rewriting, the trimmed schemas, the inlined conventions, the measured context budget, and the single-sentence refusals. What is **not** deferred is the seam that makes any of it selectable — the profile decision is accepted in this specification, and its model-facing boundary explicitly includes tool refusal text so the deferred work inherits a constraint it can actually satisfy.

The distinction matters for a reason that is easy to lose: if the profile decision were deferred along with the requirements, the natural implementation in milestone 2 hardcodes the skill list into the plugin entry, and the seam is gone before anyone notices it was load-bearing.', 2, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M191YXBC295E6ZCZ9H36E4KS', '01M191BE7MHM077FE9YM09B2ZK', 'Scope: Out of Scope', 'Four exclusions, each recorded as a requirement row carrying `out_of_scope` rather than living only in this prose.

- **Claude Code compatibility in this repository.** The marketplace repository remains the home of the Claude Code plugin, and the two are free to diverge — that freedom is the point of the fork.
- **OpenCode v1 support.**
- **CPM migration tooling.** Anyone on CPM migrates via the existing Claude Code dpm first.
- **CLI and TUI plugin work** — `cli.json` plugins, theme integration, keybinding integration.

None of these is a judgement that the work lacks value; each is a judgement that it does not belong in the release that establishes whether the port works at all.', 3, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M192C1G80FRJ13DG5ET5QF1M', '01M191BE7MHM077FE9YM09B2ZK', 'Integration Boundaries', 'Six seams, derived from the architecture decisions, and the places integration coverage belongs.

**1. Plugin to host registries.** The three transforms, and what appears in the host''s MCP, skill and command registries as a result. This is a beta API, it is replayed on reload, and it is the most volatile boundary in the system — which is why the idempotency decision constrains what a transform may close over.

**2. Plugin to MCP server.** The spawned command, the stdio transport, the connection lifecycle, and the failure modes when the server does not start. The child process exists because of the tool-boundary decision, and this seam is what that decision costs.

**3. MCP server to database.** The typed tool contract over `node:sqlite`. Unchanged by decision and covered by the inherited conformance suite, which is the reason the decision was safe to take.

**4. Skill prose to effective tool names.** Skill bodies name tools by whatever the host renders them as, so a change in that rendering silently breaks twenty-three documents at once. Establishing the rendering is the first implementation task and gates the skill port.

**5. Database to projection and dump.** One-way and deterministic, with the guard sitting across it comparing regenerated output against committed output. Determinism is not a quality goal here but a precondition: the guard has no other way to tell a real difference from an incidental one.

**6. Package to filesystem.** Skill `location`, supporting-file resolution, and the guard symlink target inside OpenCode''s package cache. Two open questions live on this seam — whether registered skills resolve their supporting files, and where a git-installed plugin actually lands — and the first is the milestone-2 go/no-go.', 4, NULL);
INSERT INTO "library_document" ("document_id", "document_kind", "doc_type", "source") VALUES ('01M190RZY3N512H26B7SMAPWKS', 'library', 'architecture', NULL);
INSERT INTO "library_scope" ("document_id", "scope") VALUES ('01M190RZY3N512H26B7SMAPWKS', 'architect');
INSERT INTO "library_scope" ("document_id", "scope") VALUES ('01M190RZY3N512H26B7SMAPWKS', 'do');
INSERT INTO "library_scope" ("document_id", "scope") VALUES ('01M190RZY3N512H26B7SMAPWKS', 'epics');
INSERT INTO "library_scope" ("document_id", "scope") VALUES ('01M190RZY3N512H26B7SMAPWKS', 'spec');
INSERT INTO "adr" ("document_id", "document_kind", "decision_status", "decision") VALUES ('01M191RM7VD3096N1HHQR33CGG', 'adr', 'accepted', 'The repository vendors dpm v0.7.0 as its starting commit and takes no dependency — package, git, or copy-script — on the marketplace repository, with fixes flowing between the two by hand when worth it.');
INSERT INTO "adr" ("document_id", "document_kind", "decision_status", "decision") VALUES ('01M191RNNDK285PEV27X5E1CNR', 'adr', 'accepted', 'The bundled MCP server stays the tool surface and the plugin''s job is registration rather than reimplementation, keeping the typed contract and its conformance tests intact.');
INSERT INTO "adr" ("document_id", "document_kind", "decision_status", "decision") VALUES ('01M191RQKT7NBX0VX40QSB72WC', 'adr', 'accepted', 'The port is authored in TypeScript restricted to erasable syntax and ships sources rather than artefacts, with the Node floor raised from 22.5 to 24 so native type-stripping and a stable `node:sqlite` arrive together.');
INSERT INTO "adr" ("document_id", "document_kind", "decision_status", "decision") VALUES ('01M191RRP9GTJY53WP9RCDNW9X', 'adr', 'accepted', 'Schema, ULID identity, number sequences, the document supertype, coverage and the one-way projection are inherited without modification, and this specification re-decides nothing below the host boundary.');
INSERT INTO "adr" ("document_id", "document_kind", "decision_status", "decision") VALUES ('01M191RY452PMYKB35R7NDD60M', 'adr', 'accepted', 'The plugin registers skills from its own package rather than asking users to copy directories into the project, and skill IDs are prefixed `dpm-` because v2 skill IDs are a flat last-source-wins namespace where names like `review` and `status` invite silent collisions.');
INSERT INTO "adr" ("document_id", "document_kind", "decision_status", "decision") VALUES ('01M191S0HPM9P3PXXJGRH3M34K', 'adr', 'accepted', 'Skill descriptions rewritten as model-facing language are the primary invocation path, with the prefixed slash entry alongside them, and FR11''s explicit commands stand as the named contingency if catalog ergonomics disappoint in practice.');
INSERT INTO "adr" ("document_id", "document_kind", "decision_status", "decision") VALUES ('01M191S1ZQYSAY12930K9A3HNC', 'adr', 'accepted', 'Setup returns a cleanup that disposes registrations, and no transform closes over mutable state a replay would observe differently — the server command, skill list and command list are computed before the transform registers.');
INSERT INTO "adr" ("document_id", "document_kind", "decision_status", "decision") VALUES ('01M191S3JWSJVCT8FC6YHPS3AR', 'adr', 'accepted', 'Support for weaker models is a registration-time choice selected by plugin option against the same server and the same database, and the model-facing surface it varies is skill prose, the advertised tool surface, and the text of tool refusals — everything below those three is deterministic code no model reads.');
INSERT INTO "adr_option" ("id", "adr_id", "name", "chosen", "rationale", "position") VALUES ('01M191SAM6Y0TNQFMCKVP5PYXG', '01M191RM7VD3096N1HHQR33CGG', 'Clean fork with hand-carried fixes', 1, 'Neither codebase constrains the other. Each is native to its host and free to take that host''s idiom, and the cost — two codebases, fixes moved by hand — is paid in maintenance rather than in design compromise.', 0);
INSERT INTO "adr_option" ("id", "adr_id", "name", "chosen", "rationale", "position") VALUES ('01M191SCJ3TVBYRQB9H6CQ10PD', '01M191RM7VD3096N1HHQR33CGG', 'Shared dpm-core package', 0, 'Rejected. The extraction cost lands immediately and in full, while the benefit only materialises if both hosts stay API-compatible with the core — which OpenCode v2''s beta churn makes unlikely within the year. It also forks the invariant part of the system in order to serve the variable part.', 1);
INSERT INTO "adr_option" ("id", "adr_id", "name", "chosen", "rationale", "position") VALUES ('01M191SFSCA29S5JW00CYRJPXY', '01M191RNNDK285PEV27X5E1CNR', 'Keep the bundled MCP server; the plugin registers it', 1, 'The MCP server is the most tested seam in dpm — 133 test files point at it — and the typed contract with its conformance tests carries over wholesale. The server also keeps working for any other MCP-speaking host. Shipping a proven child process beats shipping an unproven native surface.', 0);
INSERT INTO "adr_option" ("id", "adr_id", "name", "chosen", "rationale", "position") VALUES ('01M191SHAXKPYCG07XS2JN3HCJ', '01M191RNNDK285PEV27X5E1CNR', 'Native plugin tools via the host''s tool transform', 0, 'Rejected for this iteration, not on principle. It would eliminate the child process, but it discards the conformance suite and replaces a tested boundary with a beta API. It remains open as a future migration, and the plugin is the obvious seam to do it behind — which is why this decision is recorded as reversible rather than settled.', 1);
INSERT INTO "adr_option" ("id", "adr_id", "name", "chosen", "rationale", "position") VALUES ('01M191SR8NV7XB6DK4BYNT3VT6', '01M191RQKT7NBX0VX40QSB72WC', 'Erasable TypeScript on Node 24, sources shipped', 1, 'OpenCode loads a plugin''s TypeScript entry directly, and Node 24 type-strips erasable TypeScript natively — so types are available to authors with no artefact to build, publish or keep in sync. Raising the floor to 24 buys stable native execution and a stable `node:sqlite` in one move, and a new repository has no installed base to protect.', 0);
INSERT INTO "adr_option" ("id", "adr_id", "name", "chosen", "rationale", "position") VALUES ('01M191SV08QV6AHRD0BGKG8ZP8', '01M191RQKT7NBX0VX40QSB72WC', 'TypeScript with a build step', 0, 'Rejected. It lifts the syntax restrictions but introduces a compile between source and behaviour, an artefact that can drift from its source, and a publish step that can ship a stale build. It also breaks the property that each executable runs directly with `node`.', 1);
INSERT INTO "adr_option" ("id", "adr_id", "name", "chosen", "rationale", "position") VALUES ('01M191SXHNSHYDVR82V0MRQMKZ', '01M191RQKT7NBX0VX40QSB72WC', 'Stay on plain JavaScript', 0, 'Rejected. It is the smallest change and forgoes the type checking that a port of this size most benefits from, in a codebase whose typed tool contract is the thing being preserved. The host''s own examples are TypeScript, so this would also diverge from v2 idiom for no gain.', 2);
INSERT INTO "adr_option" ("id", "adr_id", "name", "chosen", "rationale", "position") VALUES ('01M191T12NJ3HZPJR96222A1MQ', '01M191RRP9GTJY53WP9RCDNW9X', 'Inherit the data model unchanged', 1, 'The port''s risk is concentrated entirely at the host boundary, and changing anything beneath it would mix two kinds of failure in one release — a registration bug and a schema bug looking identical from the outside. Holding the model constant also means the corpus, the dump and the guard''s byte-comparison all keep working as evidence that the port is correct.', 0);
INSERT INTO "adr_option" ("id", "adr_id", "name", "chosen", "rationale", "position") VALUES ('01M191T6Y7JS3YN2J7SFRW7FQ9', '01M191RRP9GTJY53WP9RCDNW9X', 'Revisit the model while porting', 0, 'Rejected. A port is the moment every accumulated reservation about a schema asks to be addressed, and taking any of them turns a mechanical change with a byte-comparable outcome into a redesign with none. Anything worth changing beneath the boundary is worth its own decision afterwards.', 1);
INSERT INTO "adr_option" ("id", "adr_id", "name", "chosen", "rationale", "position") VALUES ('01M191TAJW0QWP3AVAMRZ83PA9', '01M191RY452PMYKB35R7NDD60M', 'Register from the package with prefixed IDs', 1, 'One install, one version, and an upgrade that replaces everything atomically. The `dpm-` prefix is the cheap defence against a flat last-source-wins namespace, where a generic ID like `review` or `status` is silently overridden by whatever registers after it — a failure that presents as a skill behaving oddly rather than as a collision.', 0);
INSERT INTO "adr_option" ("id", "adr_id", "name", "chosen", "rationale", "position") VALUES ('01M191TCM2PBNEVGX0R64K96G1', '01M191RY452PMYKB35R7NDD60M', 'Users copy skill directories into the project', 0, 'Rejected. It puts twenty-three directories under the user''s control with no version attached, so an upgrade becomes a merge the user performs, partial upgrades are the normal state, and the question of which version of a skill is running has no answer.', 1);
INSERT INTO "adr_option" ("id", "adr_id", "name", "chosen", "rationale", "position") VALUES ('01M191TEBSPSTD9H29NYFPFGTX', '01M191RY452PMYKB35R7NDD60M', 'Register from the package with unprefixed IDs', 0, 'Rejected. It reads better in the catalog and loses to any other source that registers a skill of the same name. The cost of the prefix is cosmetic; the cost of the collision is a skill that silently is not the one that was installed.', 2);
INSERT INTO "adr_option" ("id", "adr_id", "name", "chosen", "rationale", "position") VALUES ('01M191TNBTD0FY7R1S92SQN7V4', '01M191S0HPM9P3PXXJGRH3M34K', 'Skill-first, with explicit commands as a named contingency', 1, 'The host advertises any skill carrying a description to the model and lists it in the slash catalog, so skill-first is the path the platform already provides and needs no machinery. Naming FR11 as the contingency inside this decision is what keeps the fallback attached to the risk rather than to somebody''s memory.', 0);
INSERT INTO "adr_option" ("id", "adr_id", "name", "chosen", "rationale", "position") VALUES ('01M191TTK0J0G7D8EXCBZ4BZBD', '01M191S0HPM9P3PXXJGRH3M34K', 'Reproduce slash ergonomics as the primary path', 0, 'Rejected as the primary path, and retained as FR11. It preserves the precision that existing users have muscle memory for, but it builds a parallel invocation surface that the host does not need and that has to be maintained against a beta command API. Building it first would also mean never learning whether the catalog was sufficient.', 1);
INSERT INTO "adr_option" ("id", "adr_id", "name", "chosen", "rationale", "position") VALUES ('01M191TVR928NZE24MF6CCYRYF', '01M191S1ZQYSAY12930K9A3HNC', 'Compute registrations before the transform, dispose on cleanup', 1, 'The host replays transforms on reload, so a transform that reads mutable state observes something different on the replay than it did on the first pass — a bug that appears only after an edit and looks like flakiness. Computing the server command, skill list and command list up front makes replay identical by construction rather than by care.', 0);
INSERT INTO "adr_option" ("id", "adr_id", "name", "chosen", "rationale", "position") VALUES ('01M191TXWQTKQN3Q377PQNEKH3', '01M191S1ZQYSAY12930K9A3HNC', 'Compute registrations lazily inside the transform', 0, 'Rejected. It is the natural way to write the code and the reason the failure is worth deciding against in advance: it works on first load, survives testing, and diverges only on reload — which is exactly the path a developer exercises most and a test suite exercises least.', 1);
INSERT INTO "adr_option" ("id", "adr_id", "name", "chosen", "rationale", "position") VALUES ('01M191V5K3EBQ7R2X4V20EV388', '01M191S3JWSJVCT8FC6YHPS3AR', 'A registration-time profile against one server and one database', 1, 'Only the model-facing surface needs to vary, so only it should. Selecting a different skill set and a trimmed tool advertisement at registration keeps the schema, projection, dump and guard byte-identical across profiles — which is what lets a corpus planned under one continue under the other with no migration. The boundary includes tool refusal text, because a refusal is read by the model and acted on, which is the whole test of being model-facing.', 0);
INSERT INTO "adr_option" ("id", "adr_id", "name", "chosen", "rationale", "position") VALUES ('01M191V7ZXTKA0TJJZQ168YFBP', '01M191S3JWSJVCT8FC6YHPS3AR', 'A parallel repository for constrained models', 0, 'Rejected. It would fork the invariant part of the system — schema, identity, projection, dump, guard — in order to vary the variable part, and the two copies would then have to be kept byte-identical by discipline rather than by construction. It also splits the corpus, so a project could not move between them.', 1);
INSERT INTO "adr_option" ("id", "adr_id", "name", "chosen", "rationale", "position") VALUES ('01M191VA43N30R0GA8EPY65CT8', '01M191S3JWSJVCT8FC6YHPS3AR', 'A profile whose boundary stops at skill prose and tool schemas', 0, 'Rejected, and this is the correction the review produced. Drawing the boundary above refusal text makes the decision internally inconsistent the moment a profile wants to rewrite an error message, and leaves the deferred lite specification inheriting a constraint it cannot satisfy without reopening this decision.', 2);
INSERT INTO "adr_option_tradeoff" ("option_id", "axis", "assessment") VALUES ('01M191SAM6Y0TNQFMCKVP5PYXG', 'cost', 'Ongoing rather than up-front: every fix worth having in both places is applied twice, indefinitely.');
INSERT INTO "adr_option_tradeoff" ("option_id", "axis", "assessment") VALUES ('01M191SAM6Y0TNQFMCKVP5PYXG', 'reversibility', 'Low. Once the two codebases diverge, extracting a shared core later means reconciling two histories rather than one. Accepted knowingly — divergence is the point.');
INSERT INTO "adr_option_tradeoff" ("option_id", "axis", "assessment") VALUES ('01M191SFSCA29S5JW00CYRJPXY', 'complexity', 'A child process per session that native tools would not need, plus its startup and connection failure modes.');
INSERT INTO "adr_option_tradeoff" ("option_id", "axis", "assessment") VALUES ('01M191SFSCA29S5JW00CYRJPXY', 'reversibility', 'High. The plugin is the seam, so migrating to native tools later changes registration and leaves skills and database untouched. This is why the decision is safe to take on incomplete information about v2.');
INSERT INTO "adr_option_tradeoff" ("option_id", "axis", "assessment") VALUES ('01M191SR8NV7XB6DK4BYNT3VT6', 'complexity', 'Shifted rather than removed: no build pipeline, but a permanent syntax restriction and an import-extension discipline that every file must observe and CI must police.');
INSERT INTO "adr_option_tradeoff" ("option_id", "axis", "assessment") VALUES ('01M191SR8NV7XB6DK4BYNT3VT6', 'reversibility', 'Moderate. Adding a build step later is mechanical; lowering the Node floor afterwards is not, because code written against 24 spreads.');
INSERT INTO "adr_option_tradeoff" ("option_id", "axis", "assessment") VALUES ('01M191T12NJ3HZPJR96222A1MQ', 'reversibility', 'High, and deliberately deferred rather than closed. Any change beneath the boundary can be made after the port, against a system whose behaviour is known good.');
INSERT INTO "adr_option_tradeoff" ("option_id", "axis", "assessment") VALUES ('01M191TAJW0QWP3AVAMRZ83PA9', 'reversibility', 'Low for the IDs specifically. Renaming a skill ID after release breaks anything that invokes it by name, so the prefix is effectively permanent from the first publish.');
INSERT INTO "adr_option_tradeoff" ("option_id", "axis", "assessment") VALUES ('01M191TNBTD0FY7R1S92SQN7V4', 'cost', 'Borne by existing users rather than by the build: muscle memory for the old triggers stops working, and the replacement is less precise until FR11 is funded.');
INSERT INTO "adr_option_tradeoff" ("option_id", "axis", "assessment") VALUES ('01M191TNBTD0FY7R1S92SQN7V4', 'reversibility', 'High. FR11 adds explicit commands alongside the catalog without withdrawing anything, so the contingency is additive rather than a reversal.');
INSERT INTO "adr_option_tradeoff" ("option_id", "axis", "assessment") VALUES ('01M191TVR928NZE24MF6CCYRYF', 'complexity', 'Negligible, and lower than the alternative: computing up front is fewer moving parts than reasoning about what a replay observes.');
INSERT INTO "adr_option_tradeoff" ("option_id", "axis", "assessment") VALUES ('01M191V5K3EBQ7R2X4V20EV388', 'cost', 'Near zero now — the skill and command lists are already computed before registration under the idempotency decision, so the seam is a parameter on work already being done.');
INSERT INTO "adr_option_tradeoff" ("option_id", "axis", "assessment") VALUES ('01M191V5K3EBQ7R2X4V20EV388', 'reversibility', 'High. Nothing behind the seam is built in this iteration, so the profile mechanism can be widened, narrowed or removed while the deferred specification is still unwritten.');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191H7HSQA83WM93W0J944HF', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR1', 'functional', 'must', NULL, NULL, 'Single-command install. `opencode2 plugin add github:ninthspace/opencode-dpm` — and later the npm form — yields a working DPM: the MCP server registered and connected, all skills advertised, and nothing further for the user to copy into the project.', 0, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191HA9AJ98W4FGB37DC3P1Y', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR2', 'functional', 'must', NULL, NULL, 'The MCP server is the tool surface. The plugin registers the bundled server via `ctx.mcp.transform`, setting a local server entry whose command runs the packaged executable. Skills continue to write exclusively through typed MCP tools: no skill contains SQL and nothing parses prose. Tool behaviour and schemas carry over from v0.7.0 unchanged.', 1, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191HD4T54B4H7JB9M9Z8DF9', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR3', 'functional', 'must', NULL, NULL, 'Skills registered from the package. All twenty-three skills port and are registered via `ctx.skill.transform`, with `location` pointing into the installed package so directory-based skills keep their supporting files. Skill prose is revised wherever it names host mechanics: tool names take v2''s effective naming, and the invocation story replaces Claude Code''s slash-command triggers.', 2, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191HEEXRNX7Z6Z46ATS49FW', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR4', 'functional', 'must', NULL, NULL, 'Persistence parity. Fresh-clone restore from `.dpm/dpm.sql`, deterministic dump on publish, the empty-database restore asymmetry, read-only server mode, and the Node-floor refusal all carry over with their existing behaviour.', 3, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191HM8EE473JDD426R9FQRE', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR5', 'functional', 'must', NULL, NULL, 'The five executables port. `dpm-mcp`, `dpm-guard`, `dpm-publish`, `dpm-import` and `dpm-merge` keep their responsibilities, become TypeScript sources, and remain runnable directly with `node` and no loader.', 4, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191HPCXWPEDVYD8ZCRGZNJQ', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR6', 'functional', 'must', NULL, NULL, 'Pre-commit guard unchanged in kind. It remains a git hook that regenerates and compares, fixes nothing, and refuses with the four-case explanation. The install instruction is updated for where OpenCode places plugin packages, and the missing-symlink warning on server start carries over.', 5, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191HRH294FESBRF5JK3CZGQ', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR7', 'functional', 'must', NULL, NULL, 'Test suite ports. The `node --test` suite — 133 test files at v0.7.0, including the corpus snapshot tests — runs against the TypeScript sources in CI, under plain `node` with no loader.', 6, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191HSY4Z56KCR1HWSDVA1VE', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR8', 'functional', 'should', NULL, NULL, 'Permission-aware behaviour. Skills behave correctly under `ask` and `deny` rules for the `skill` action, and the README documents the recommended permission entries.', 7, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191HZ1QER0TFPZ2DQQ4NYJX', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR9', 'functional', 'should', NULL, NULL, 'Session scratch via plugin storage. Anything that was per-session scratch keyed by an environment variable in Claude Code uses `ctx.storage` where a database session row is not already the answer. No transient files land in the project tree.', 8, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191J1W9E36VGT6DC7ZVKP94', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR10', 'functional', 'should', NULL, NULL, 'README for a v2 audience. Install, first run, guard symlink, and "when the guard refuses" are rewritten for `opencode2`. The CPM MIGRATION.md does not carry over.', 9, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191J2Z2EH3B2G3FVJ63EQ3N', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR11', 'functional', 'could', NULL, NULL, 'Slash-catalog commands. Register `ctx.command.transform` entries that prompt the session into a named skill, restoring something close to the previous slash-command ergonomics if skill-as-slash proves insufficient in practice.', 10, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191J4PJ7KEV66YH1B1QC4BM', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR12', 'functional', 'could', NULL, NULL, 'HTTP skill catalog. Publish the skills as a v2 HTTP catalog for teams that want the skills without the plugin. Low value while the tools require the plugin anyway.', 11, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191JCC04JEVXVWFMS1V9RMJ', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR13', 'functional', 'wont', 'deferred', NULL, 'Lite profile for constrained local open-weight models — a reduced model-facing surface selected by plugin option, with skills rewritten as terse imperative checklists, tool descriptions and schemas hard-trimmed, conventions inlined rather than read at startup, a measured context budget, and single-sentence tool refusals that name the field and state the correction. Deferred to a specification of its own: it is an iteration on what this specification builds rather than part of it. The architectural seam that makes it selectable at registration time is decided here and is not deferred.', 12, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191JEBN8VV1VNPNKYKFC5H9', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR14', 'functional', 'wont', 'out_of_scope', NULL, 'Claude Code compatibility in this repository. The marketplace repository remains the home of the Claude Code plugin.', 13, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191JFTXHMWR1WZGPAJACE1Q', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR15', 'functional', 'wont', 'out_of_scope', NULL, 'OpenCode v1 support.', 14, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191JHFA19EW0XW6SZK17WN1', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR16', 'functional', 'wont', 'out_of_scope', NULL, 'CPM migration tooling. Anyone on CPM migrates via the existing Claude Code dpm first.', 15, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191JJS4KT4HTH40S8YVHNPJ', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR17', 'functional', 'wont', 'out_of_scope', NULL, 'CLI and TUI plugin work — `cli.json` plugins, theme integration, keybinding integration.', 16, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191KQV386EDYK9Z9H12D2N5', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'NFR1', 'non_functional', 'must', NULL, NULL, 'Zero runtime dependencies. `node:sqlite` stays; no native modules and no install-time compilation. The only entry under `dependencies` is `@opencode-ai/plugin`.', 17, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191KSQTS6M41QHYTJX0WAM6', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'NFR2', 'non_functional', 'must', NULL, NULL, 'No build step. TypeScript throughout, restricted to erasable syntax so Node runs the sources directly. `tsc --noEmit` is a type check in CI, not a compile, and no build artefact is produced or published.', 18, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191KW1TEYZR0S56SCE5GZDC', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'NFR3', 'non_functional', 'must', NULL, NULL, 'Beta churn tolerance. The plugin pins `@opencode-ai/plugin@beta` and the README states plainly that OpenCode v2 is beta and that entrypoints may move under it. API breakage is expected maintenance rather than a defect.', 19, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191KY76N9B04YVJK69YMCGW', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'NFR4', 'non_functional', 'must', NULL, NULL, 'Determinism. Dump output, projection output, and ULID and number allocation behaviour remain byte-stable across the port. The guard''s regenerate-and-compare depends on it.', 20, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191M0X2D61B6XGBY2SPA0MA', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'NFR5', 'non_functional', 'must', NULL, NULL, 'Import-extension discipline. Every internal import specifier carries an explicit `.ts` extension, as native type-stripping requires specifiers to resolve exactly as written, and `tsconfig.json` sets `allowImportingTsExtensions` so the type check accepts them. Enforced by a dedicated CI sweep that imports every module under `src/` and `bin/` with plain `node`. The sweep exists separately from the test suite because the suite only exercises modules some test imports, and a bad specifier in a module nothing imports would otherwise reach a release unobserved.', 21, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191NVWV9CP15DT44439W9NZ', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR1', 'environmental_requirement', 'must', NULL, NULL, 'Development: Node 24 or later on the contributor''s machine. Checkable by `node --version` reporting 24.0.0 or above. This is the floor that buys native type-stripping and a stable `node:sqlite` in one move.', 22, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191NX38ANZRH042J1KQ91S0', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR2', 'environmental_requirement', 'must', NULL, NULL, 'Development: `node --test` is the test runner. Checkable by the test script being `node --test` and no third-party test runner appearing in `devDependencies`.', 23, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191NZRB4NJ2A07WES55GFTT', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR3', 'environmental_requirement', 'must', NULL, NULL, 'Development: TypeScript available for type checking. Checkable by `tsc --noEmit` running from `devDependencies` and exiting zero.', 24, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191P15MPZRFA7HH2Z91K8XP', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR4', 'environmental_requirement', 'must', NULL, NULL, 'Development: an OpenCode v2 beta CLI on the contributor''s machine. Checkable by `opencode2 --version` reporting a 2.x beta. Without it neither the effective tool naming nor the skill-registration behaviour can be verified, and both gate the skill port.', 25, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191P6ZQ9026CAE9NPHA7VXK', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR5', 'environmental_requirement', 'must', NULL, NULL, 'Development: a scratch OpenCode project to register into. Checkable by installing the plugin into a throwaway project and observing its MCP server reach connected state with the skills advertised.', 26, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191P8TH87TEYAPJ9V0F4P3S', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR6', 'environmental_requirement', 'must', NULL, NULL, 'Development: git with hook support. Checkable by `git --version` reporting 2.9 or above and a hook installed at `.git/hooks/pre-commit` firing on commit.', 27, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191PB5ZT101VW751N9HTCER', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR7', 'environmental_requirement', 'must', NULL, NULL, 'Development: CI that runs the suite. Checkable by a CI job running the full `node --test` suite on Node 24 under plain `node`, plus the type check and the module sweep, on every push.', 28, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191PDECZ9F46H7Q6J8XNSDP', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVX1', 'environmental_restriction', 'must', NULL, NULL, 'Development: native compilation must not be required. Checkable by a clean install completing with no node-gyp invocation, no C or C++ toolchain and no Python present.', 29, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191PJJS5APQC7DK4P73CR1G', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVX2', 'environmental_restriction', 'must', NULL, NULL, 'Development: a loader or transpiler must not be required. Checkable by the test command and each executable''s invocation passing no `--loader`, no `--import`, and no transpiler flag — the sources run on what Node 24 does by default.', 30, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191PMSEVEWV2QZPCTQB0KQ7', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVX3', 'environmental_restriction', 'must', NULL, NULL, 'Development: Claude Code must not be required. Checkable by the full suite passing on a machine with no Claude Code installed and no `CLAUDE_`-prefixed environment variables set.', 31, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191PQA3QF3YC847X5Y9CD4F', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR8', 'environmental_requirement', 'must', NULL, NULL, 'Production: Node 24 or later on the host running OpenCode. Checkable by the runtime the host invokes reporting 24.0.0 or above, and by each executable refusing with an explanatory message when it is below.', 32, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191PRJD860MEPCETCTG156D', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR9', 'environmental_requirement', 'must', NULL, NULL, 'Production: OpenCode v2 as the host application. Checkable by the plugin loading under a 2.x host and its MCP server, skills and any commands appearing in that host''s registries.', 33, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191Q160A0AWMXH0WTD2P0GF', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR10', 'environmental_requirement', 'must', NULL, NULL, 'Production: a git repository in the user''s project. Checkable by the guard hook installing at the repository''s hook path and refusing a commit whose projection is stale.', 34, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191Q35NNXEWQK0HNQGBD5PY', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR11', 'environmental_requirement', 'must', NULL, NULL, 'Production: filesystem write access to `.dpm/` inside the project. Checkable by the database and the dump being created and rewritten there on a first run in a fresh project.', 35, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191Q578097ZDAS8SA8MGHY1', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVX4', 'environmental_restriction', 'must', NULL, NULL, 'Production: network access must not be required at runtime. Checkable by a full plan-and-publish cycle completing with networking disabled.', 36, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191Q6FFNXB7AR19TRT6RCSE', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVX5', 'environmental_restriction', 'must', NULL, NULL, 'Production: a database service must not be required. Checkable by persistence needing only files under `.dpm/`, with no port bound and no external service contacted.', 37, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191Q82N7NWEGDG30HYFKX8S', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVX6', 'environmental_restriction', 'must', NULL, NULL, 'Production: Claude Code artefacts must not be required. Checkable by the plugin running correctly in a project containing no `.claude/` directory and no CPM or dpm marketplace installation.', 38, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M192BM6P7KCFK6EJBPF417RR', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR12', 'environmental_requirement', 'must', NULL, NULL, 'Development: a disposable isolated environment — a container or equivalent — that can be started with no language toolchain present and with networking disabled. Captured after the testing tags were assigned, because two integration criteria need it: the clean-install check under ENVX1 and the offline plan-and-publish cycle under ENVX4. Both are development tooling, so neither is a target claim; without this entry each would be satisfied by inspection rather than by running.', 39, NULL, NULL);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M192246A1T14WS7PA7AJCH0K', '01M191NVWV9CP15DT44439W9NZ', '`node --version` on the contributor''s machine reports 24.0.0 or above, and the repository''s `engines.node` field declares the same floor.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M19225J1JXVAP79MBMA0T183', '01M191NX38ANZRH042J1KQ91S0', 'The package''s test script is `node --test`, and no third-party test runner appears in `devDependencies`.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M19227AKDBP3C29P69X0TH0X', '01M191NZRB4NJ2A07WES55GFTT', '`tsc --noEmit` runs from `devDependencies` against the whole codebase and exits zero.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M19228MGB8PMGWHYTS6YPRMV', '01M191P15MPZRFA7HH2Z91K8XP', '`opencode2 --version` on the contributor''s machine reports a 2.x beta release.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1922A09E252N2CQMQ9SMD4T', '01M191P6ZQ9026CAE9NPHA7VXK', 'The plugin installs into a throwaway OpenCode project, its MCP server reaches connected state, and all skills appear as advertised.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1922ENG2PVVQ419YY86BN7D', '01M191P8TH87TEYAPJ9V0F4P3S', '`git --version` reports 2.9 or above, and a hook installed at `.git/hooks/pre-commit` in a temporary repository fires on commit.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1922GYEAKGMEN6EAQ3HVCA2', '01M191PB5ZT101VW751N9HTCER', 'A CI job runs the full `node --test` suite, the `tsc --noEmit` type check and the module sweep on Node 24 under plain `node`, on every push, and the run is observable in the repository''s CI history.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1922K8JC4CFFPG16FB9J6G1', '01M191PDECZ9F46H7Q6J8XNSDP', 'A clean install in an environment with no C or C++ toolchain and no Python completes successfully, with no node-gyp invocation in its output.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1922MT9794XEWTJMTDY5PF2', '01M191PJJS5APQC7DK4P73CR1G', 'The test script and every executable''s documented invocation pass no `--loader`, no `--import` and no transpiler flag.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1922PEEJNZVKJP0DPGSTB66', '01M191PMSEVEWV2QZPCTQB0KQ7', 'The full suite passes in an environment with no Claude Code installed and no `CLAUDE_`-prefixed environment variables set.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1922XCHTTN964ST62BAE1N4', '01M191PQA3QF3YC847X5Y9CD4F', 'Each of the five executables, run on a runtime below 24, refuses with a message naming the required version rather than failing on a syntax or module error.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1922Z0BKDKRC5W3SH12E3G5', '01M191PQA3QF3YC847X5Y9CD4F', 'The runtime the host invokes on the user''s machine reports 24.0.0 or above.', 'must', 1);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M19231DBSRE71FM1SD4361E2', '01M191PRJD860MEPCETCTG156D', 'Under an OpenCode 2.x host, the plugin loads and its MCP server, skills and any registered commands appear in that host''s registries.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M19232Q0V6TMAXY81QEG65KA', '01M191Q160A0AWMXH0WTD2P0GF', 'In a temporary git repository, the guard hook installs at the repository''s hook path and refuses a commit whose projection is stale, with the explanatory output intact.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M192342BFNFCTP48W8P12VDX', '01M191Q35NNXEWQK0HNQGBD5PY', 'On a first run in a fresh project, the database and the dump are created under `.dpm/` and rewritten on a subsequent publish.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M19238Y8VAAX3H7RCV2VD7VC', '01M191Q578097ZDAS8SA8MGHY1', 'A full plan-and-publish cycle completes with networking disabled, making no outbound connection attempt.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1923AYW2TW1SZS41SPC6DXT', '01M191Q6FFNXB7AR19TRT6RCSE', 'Persistence uses only files under `.dpm/`: no port is bound and no external service is contacted during a full plan-and-publish cycle.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1923C647H6H6P77TS87TA6T', '01M191Q82N7NWEGDG30HYFKX8S', 'The plugin runs correctly in a project containing no `.claude/` directory and no CPM or dpm marketplace installation.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1925DT3YT68WN4S3JQDDNJ4', '01M191H7HSQA83WM93W0J944HF', 'Installing into a fresh project by the documented command leaves the MCP server connected and all twenty-three skills advertised, with no further user action.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1925F1TPJ2C7N5KG77VA7KW', '01M191H7HSQA83WM93W0J944HF', 'The published package''s manifest declares the plugin entry, and the server command path resolves to an existing file inside the installed package tree.', 'must', 1);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1925GD8WSWBFTKDZ77RBNN9', '01M191H7HSQA83WM93W0J944HF', 'Installation requires the user to copy a file, hand-edit project configuration, or run a post-install step.', 'must_not', 2);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1925HKB321KH5GYKJ18GV66', '01M191HA9AJ98W4FGB37DC3P1Y', 'The advertised tool set and every tool schema match v0.7.0''s, compared against a stored snapshot of the tool surface.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1925JVD30WDE2BKC1R89PTW', '01M191HA9AJ98W4FGB37DC3P1Y', 'A skill body contains a SQL statement — a `SELECT`, `INSERT`, `UPDATE` or `DELETE` paired with `FROM`, `INTO` or `SET`.', 'must_not', 1);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1925T21XWNQKCQ5JQZGC1BQ', '01M191HD4T54B4H7JB9M9Z8DF9', 'All twenty-three skills appear in the host''s skill registry after install, every ID carrying the `dpm-` prefix.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1925VBZ6HVHW7YM10DXTYAB', '01M191HD4T54B4H7JB9M9Z8DF9', 'The registration list computed before the transform contains twenty-three entries and every ID is `dpm-` prefixed.', 'must', 1);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1925WPSKPEKZBZAVPG1NX8D', '01M191HD4T54B4H7JB9M9Z8DF9', 'A registered skill''s supporting files resolve from the package location, so a skill that reads the shared conventions file at startup finds it. This is the milestone-2 go/no-go: a negative answer forces inlining and is recorded as an explicit decision.', 'must', 2);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1925XZDNX00KC0PWVFJEGME', '01M191HD4T54B4H7JB9M9Z8DF9', 'A skill body names a Claude Code mechanism — `mcp__plugin_`, `/dpm:`, `CLAUDE_PLUGIN_ROOT`, or `.claude/`.', 'must_not', 3);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M19278XJ1ZWAT7QQNB8VD6JR', '01M191HEEXRNX7Z6Z46ATS49FW', 'A fresh-clone restore from `.dpm/dpm.sql` reproduces the database, and a subsequent dump is byte-identical to the committed one.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1927AEBCMMWTF79VZQFPXB5', '01M191HEEXRNX7Z6Z46ATS49FW', 'Restore into an empty database and restore into a populated one behave as v0.7.0 defines, with the asymmetry between them preserved.', 'must', 1);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1927C3832Y44PDDT8JQ8J9K', '01M191HEEXRNX7Z6Z46ATS49FW', 'Read-only server mode refuses every write tool and serves every read tool.', 'must', 2);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1927DC6H3PS5J5MATDRFN4J', '01M191HEEXRNX7Z6Z46ATS49FW', 'A restore silently discards rows that were present in the dump.', 'must_not', 3);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1927EV2XCDE12PA52XKRN7N', '01M191HM8EE473JDD426R9FQRE', 'Each of the five executables runs directly with `node` and no loader flag, and performs the responsibility it held at v0.7.0.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1927G9AQ5PAX0VQT9FK6MP3', '01M191HM8EE473JDD426R9FQRE', 'An executable requires a build artefact to exist before it will run.', 'must_not', 1);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1927NXWG758PB5ZNTB9Q17E', '01M191HPCXWPEDVYD8ZCRGZNJQ', 'The guard regenerates the projection, compares it against what is on disk, and exits non-zero on a mismatch.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1927Q557CC98VE5APC7APRC', '01M191HPCXWPEDVYD8ZCRGZNJQ', 'Each of the four refusal cases produces its own explanation, distinguishable from the other three.', 'must', 1);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1927RDCFNTMVQDZYPFEEYP3', '01M191HPCXWPEDVYD8ZCRGZNJQ', 'Starting the server in a repository with no hook symlink installed emits the missing-symlink warning.', 'must', 2);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1927T84YMHSHFV0DN9N3Q2Y', '01M191HPCXWPEDVYD8ZCRGZNJQ', 'The guard writes to the working tree or repairs any discrepancy it finds.', 'must_not', 3);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1927VYB8KATR3STWQWW8CVH', '01M191HRH294FESBRF5JK3CZGQ', 'The full suite runs under plain `node` on Node 24 and passes, corpus snapshot tests included.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1927XETSA96M06G0PH38Z2E', '01M191HRH294FESBRF5JK3CZGQ', 'A test requires a loader, a transpiler, or a network connection in order to pass.', 'must_not', 1);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M19297C1B7YAYKMV3F472SA2', '01M191KQV386EDYK9Z9H12D2N5', 'The package''s `dependencies` contains exactly one entry, `@opencode-ai/plugin`.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M19298WQ6K8ENQ4X07PQ02VQ', '01M191KQV386EDYK9Z9H12D2N5', 'A `.node` binary, or a compile step, appears anywhere in the production install tree.', 'must_not', 1);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1929A5N05WT13S002XG3XC6', '01M191KSQTS6M41QHYTJX0WAM6', '`tsc --noEmit` exits zero over the whole codebase, and the package declares no build script.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1929BMS4WBHN3EPSFSHHT0W', '01M191KSQTS6M41QHYTJX0WAM6', 'The published package contains a build output directory, or its `files` or `exports` fields point at one.', 'must_not', 1);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1929CVZSKJ4KZNVQNGK8SXE', '01M191KW1TEYZR0S56SCE5GZDC', 'The plugin dependency is pinned to the `beta` tag, and the README states that OpenCode v2 is beta and that entrypoints may move under it.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1929J0Z830C1F7QXNV485DM', '01M191KY76N9B04YVJK69YMCGW', 'Dumping the same database twice produces byte-identical output, and regenerating the projection twice produces byte-identical output.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1929KF472K1WF0P4CYJQAQV', '01M191KY76N9B04YVJK69YMCGW', 'The corpus snapshot tests pass against the ported sources without their fixtures being regenerated.', 'must', 1);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1929MPFZ4JFNJJMT5E6M2QW', '01M191KY76N9B04YVJK69YMCGW', 'Dump or projection output varies with wall-clock time, filesystem ordering, or hash-map iteration order.', 'must_not', 2);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1929PVBYPW0G5CR8FD4W9G0', '01M191M0X2D61B6XGBY2SPA0MA', 'The module sweep imports every file under `src/` and `bin/` with plain `node`, and every import resolves.', 'must', 0);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1929R8861QF6H07975FPBBE', '01M191M0X2D61B6XGBY2SPA0MA', '`tsconfig.json` sets `allowImportingTsExtensions`, and `tsc --noEmit` accepts the extensioned specifiers.', 'must', 1);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M1929SQZSYT7BZ4PV5947ZM9', '01M191M0X2D61B6XGBY2SPA0MA', 'Control: introducing a deliberately extension-less internal import makes the module sweep fail. Without this the sweep can pass because it is not looking, which is the blind spot NFR5 exists to close.', 'control', 2);
INSERT INTO "acceptance_criterion" ("id", "requirement_id", "text", "polarity", "position") VALUES ('01M192BT25GGS2K5ECP77AEQ1E', '01M192BM6P7KCFK6EJBPF417RR', 'A disposable isolated environment is available in CI, and both the clean-install check and the networking-disabled cycle run inside it rather than being asserted by inspection.', 'must', 0);
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M192246A1T14WS7PA7AJCH0K', 'unit');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M19225J1JXVAP79MBMA0T183', 'unit');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M19227AKDBP3C29P69X0TH0X', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M19228MGB8PMGWHYTS6YPRMV', 'manual');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1922A09E252N2CQMQ9SMD4T', 'manual');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1922ENG2PVVQ419YY86BN7D', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1922GYEAKGMEN6EAQ3HVCA2', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1922K8JC4CFFPG16FB9J6G1', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1922MT9794XEWTJMTDY5PF2', 'unit');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1922PEEJNZVKJP0DPGSTB66', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1922XCHTTN964ST62BAE1N4', 'unit');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1922Z0BKDKRC5W3SH12E3G5', 'target');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M19231DBSRE71FM1SD4361E2', 'target');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M19232Q0V6TMAXY81QEG65KA', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M192342BFNFCTP48W8P12VDX', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M19238Y8VAAX3H7RCV2VD7VC', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1923AYW2TW1SZS41SPC6DXT', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1923C647H6H6P77TS87TA6T', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1925DT3YT68WN4S3JQDDNJ4', 'manual');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1925F1TPJ2C7N5KG77VA7KW', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1925GD8WSWBFTKDZ77RBNN9', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1925HKB321KH5GYKJ18GV66', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1925JVD30WDE2BKC1R89PTW', 'unit');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1925T21XWNQKCQ5JQZGC1BQ', 'manual');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1925VBZ6HVHW7YM10DXTYAB', 'unit');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1925WPSKPEKZBZAVPG1NX8D', 'manual');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1925XZDNX00KC0PWVFJEGME', 'unit');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M19278XJ1ZWAT7QQNB8VD6JR', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1927AEBCMMWTF79VZQFPXB5', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1927C3832Y44PDDT8JQ8J9K', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1927DC6H3PS5J5MATDRFN4J', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1927EV2XCDE12PA52XKRN7N', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1927G9AQ5PAX0VQT9FK6MP3', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1927NXWG758PB5ZNTB9Q17E', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1927Q557CC98VE5APC7APRC', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1927RDCFNTMVQDZYPFEEYP3', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1927T84YMHSHFV0DN9N3Q2Y', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1927VYB8KATR3STWQWW8CVH', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1927XETSA96M06G0PH38Z2E', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M19297C1B7YAYKMV3F472SA2', 'unit');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M19298WQ6K8ENQ4X07PQ02VQ', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1929A5N05WT13S002XG3XC6', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1929BMS4WBHN3EPSFSHHT0W', 'unit');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1929CVZSKJ4KZNVQNGK8SXE', 'unit');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1929J0Z830C1F7QXNV485DM', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1929KF472K1WF0P4CYJQAQV', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1929MPFZ4JFNJJMT5E6M2QW', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1929PVBYPW0G5CR8FD4W9G0', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1929R8861QF6H07975FPBBE', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M1929SQZSYT7BZ4PV5947ZM9', 'integration');
INSERT INTO "criterion_approach" ("criterion_id", "tag") VALUES ('01M192BT25GGS2K5ECP77AEQ1E', 'integration');
INSERT INTO "session" ("id", "skill", "phase", "state", "superseded_by", "created_at", "updated_at") VALUES ('dc9eb537-b38b-42bf-a26b-da0426079fae', 'dpm:spec', 'complete', '{"action":"spec","spec_id":"01M191BE7MHM077FE9YM09B2ZK","status":"complete","totals":{"requirements":40,"criteria":51,"adrs":8,"sections":5},"open":["FR8-FR12 carry no criteria","''nothing parses prose'' dropped as unverifiable, lives only in library doc","4 manual criteria blocked on v2 beta having no headless mode","lite-profile spec not yet created; library doc 01 not yet amended"]}', NULL, '2026-08-30T09:41:44.586Z', '2026-08-30T10:11:40.555Z');
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('audit_dimension:architectural-decay', 'audit_dimension', 'Architectural decay', NULL, 1, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('audit_dimension:consistency-rot', 'audit_dimension', 'Consistency rot', NULL, 2, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('audit_dimension:dependency-debt', 'audit_dimension', 'Dependency & config debt', NULL, 5, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('audit_dimension:documentation-drift', 'audit_dimension', 'Documentation drift', NULL, 9, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('audit_dimension:error-observability', 'audit_dimension', 'Error handling & observability', NULL, 7, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('audit_dimension:performance', 'audit_dimension', 'Performance', NULL, 6, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('audit_dimension:security', 'audit_dimension', 'Security', NULL, 8, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('audit_dimension:test-debt', 'audit_dimension', 'Test debt', NULL, 4, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('audit_dimension:type-debt', 'audit_dimension', 'Type & contract debt', NULL, 3, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('disposition:fixed', 'disposition', 'Fixed', NULL, 1, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('disposition:left-alone', 'disposition', 'Left alone', NULL, 2, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('disposition:needs-you', 'disposition', 'Needs you', NULL, 4, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('disposition:unverified', 'disposition', 'Unverified', NULL, 3, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('finding:adr-compliance', 'finding', 'ADR Compliance', NULL, 9, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('finding:architectural-risks', 'finding', 'Architectural Risks', NULL, 4, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('finding:dependency-risks', 'finding', 'Dependency Risks', NULL, 7, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('finding:hidden-complexity', 'finding', 'Hidden Complexity', NULL, 3, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('finding:missing-acceptance-criteria', 'finding', 'Missing Acceptance Criteria', NULL, 2, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('finding:missing-test-coverage', 'finding', 'Missing Test Coverage', NULL, 10, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('finding:scope-creep', 'finding', 'Scope Creep', NULL, 6, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('finding:spec-compliance', 'finding', 'Spec Compliance', NULL, 8, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('finding:testability-concerns', 'finding', 'Testability Concerns', NULL, 5, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('finding:unclear-requirements', 'finding', 'Unclear Requirements', NULL, 1, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('observation:codebase-discoveries', 'observation', 'Codebase Discoveries', 'Codebase discovery', 5, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('observation:complexity-underestimates', 'observation', 'Complexity Underestimates', 'Complexity underestimate', 4, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('observation:criteria-gaps', 'observation', 'Criteria Gaps', 'Criteria gap', 3, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('observation:patterns-worth-reusing', 'observation', 'Patterns Worth Reusing', 'Pattern worth reusing', 7, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('observation:scope-surprises', 'observation', 'Scope Surprises', 'Scope surprise', 2, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('observation:smooth-deliveries', 'observation', 'Smooth Deliveries', 'Smooth delivery', 1, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('observation:testing-gaps', 'observation', 'Testing Gaps', 'Testing gap', 6, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('severity:critical', 'severity', 'Critical', NULL, 1, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('severity:suggestion', 'severity', 'Suggestion', NULL, 3, NULL);
INSERT INTO "taxonomy" ("id", "domain", "name", "singular", "position", "retired_at") VALUES ('severity:warning', 'severity', 'Warning', NULL, 2, NULL);
INSERT INTO "agent" ("name", "display_name", "icon", "role", "personality", "communication_style", "position", "retired_at") VALUES ('architect', 'Margot', '🏗️', 'Software Architect', 'Systems thinker who sees the big picture. Obsessed with how pieces fit together and what happens at scale. Wary of short-term hacks that create long-term debt. Respects simplicity but knows when complexity is genuinely warranted. Has strong opinions on boundaries and separation of concerns.', 'Structured and precise. Thinks in terms of trade-offs — rarely says something is simply "good" or "bad" without qualifying the context. Draws analogies to explain architectural concepts. Will sketch out alternatives before recommending one.', 2, NULL);
INSERT INTO "agent" ("name", "display_name", "icon", "role", "personality", "communication_style", "position", "retired_at") VALUES ('dev', 'Bella', '💻', 'Senior Developer', 'Practical and implementation-aware. Knows the difference between what sounds good in a design doc and what actually works in code. Flags hidden complexity that others miss. Values clean, readable code over clever abstractions. Has been burned by over-engineering and isn''t shy about saying so.', 'Candid and grounded. Speaks from implementation experience. Quick to point out "this is harder than it looks" or "this is simpler than we''re making it." Prefers concrete code examples over theoretical discussion.', 3, NULL);
INSERT INTO "agent" ("name", "display_name", "icon", "role", "personality", "communication_style", "position", "retired_at") VALUES ('devops', 'Sable', '🚀', 'DevOps Engineer', 'Thinks about what happens after the code is written — deployment, monitoring, scaling, and incident response. Allergic to "works on my machine" solutions. Values automation, reproducibility, and operational simplicity. Knows that the hardest problems often aren''t in the code but in the environment.', 'Pragmatic and systems-oriented. Asks about deployment pipelines, environment differences, and failure modes. Speaks in terms of reliability, observability, and operational cost. Brings up infrastructure concerns early rather than late.', 7, NULL);
INSERT INTO "agent" ("name", "display_name", "icon", "role", "personality", "communication_style", "position", "retired_at") VALUES ('pm', 'Jordan', '📋', 'Product Manager', 'Pragmatic and user-focused. Always asks "but does the user actually need this?" Pushes back on complexity that doesn''t serve a clear user outcome. Thinks in terms of value delivered, not technical elegance. Comfortable saying no to good ideas that don''t fit the current iteration.', 'Direct and outcome-oriented. Frames everything in terms of user value and business impact. Uses concrete examples and scenarios rather than abstract principles. Asks pointed questions that cut through ambiguity.', 1, NULL);
INSERT INTO "agent" ("name", "display_name", "icon", "role", "personality", "communication_style", "position", "retired_at") VALUES ('qa', 'Tomas', '🔍', 'QA Engineer', 'Sceptical by nature — assumes things will break until proven otherwise. Thinks in edge cases, error states, and "what if the user does something unexpected." Not a pessimist, but a realist who has seen too many confident launches turn into fire drills. Values testability and observability.', 'Methodical and questioning. Asks "what happens when..." and "how do we know if..." Raises scenarios others haven''t considered. Frames concerns as risks with likelihood and impact rather than just objections.', 5, NULL);
INSERT INTO "agent" ("name", "display_name", "icon", "role", "personality", "communication_style", "position", "retired_at") VALUES ('sm', 'Ren', '🔄', 'Scrum Master', 'Focused on process, delivery, and team dynamics. Watches for scope creep, blocked work, and unrealistic commitments. Pragmatic about methodology — uses what works, discards what doesn''t. Believes the best process is the one the team actually follows. Protective of sustainable pace.', 'Facilitative and action-oriented. Asks "what''s blocking this?" and "can we break this down smaller?" Steers discussions toward decisions and next steps. Flags when a conversation is going in circles and suggests concrete actions.', 9, NULL);
INSERT INTO "agent" ("name", "display_name", "icon", "role", "personality", "communication_style", "position", "retired_at") VALUES ('test', 'Casey', '🧪', 'Test Engineer', 'Strategic about testing — thinks in terms of test pyramids, coverage boundaries, and what the right test approach is for each situation. Advocates for testing early (shift-left) and choosing the right level of test rather than testing everything at every level. Knows that too many integration tests slow the pipeline and too few miss real bugs. Pragmatic about when manual verification is the right call.', 'Asks "what type of test proves this works?" and "where''s the integration boundary?" Frames testing as a design decision, not an afterthought. Speaks in concrete terms about what to test at which level. Challenges both over-testing and under-testing.', 6, NULL);
INSERT INTO "agent" ("name", "display_name", "icon", "role", "personality", "communication_style", "position", "retired_at") VALUES ('ux', 'Priya', '🎨', 'UX Designer', 'Empathetic advocate for the end user. Sees every feature through the lens of the person who has to use it. Questions assumptions about what users understand or will tolerate. Pushes for clarity, simplicity, and consistency in every interaction. Uncomfortable with "power user only" as a default answer.', 'Warm but firm on usability principles. Asks "how will the user feel when..." questions that reframe technical discussions. Uses journey mapping language — talks about flows, friction points, and moments of delight.', 4, NULL);
INSERT INTO "agent" ("name", "display_name", "icon", "role", "personality", "communication_style", "position", "retired_at") VALUES ('writer', 'Elli', '📝', 'Technical Writer', 'Believes that if you can''t explain it clearly, you don''t understand it well enough. Champions documentation, clear naming, and self-evident interfaces. Notices when jargon excludes people and when complexity could be simplified through better communication. Values consistency in terminology.', 'Clear and precise. Rephrases complex ideas in simpler terms. Points out naming inconsistencies and ambiguous language. Asks "what would a new team member understand from this?" Advocates for the reader, not the writer.', 8, NULL);
INSERT INTO "test_approach" ("tag", "kind", "position", "retired_at") VALUES ('feature', 'level', 3, NULL);
INSERT INTO "test_approach" ("tag", "kind", "position", "retired_at") VALUES ('integration', 'level', 2, NULL);
INSERT INTO "test_approach" ("tag", "kind", "position", "retired_at") VALUES ('manual', 'level', 4, NULL);
INSERT INTO "test_approach" ("tag", "kind", "position", "retired_at") VALUES ('target', 'level', 5, NULL);
INSERT INTO "test_approach" ("tag", "kind", "position", "retired_at") VALUES ('tdd', 'mode', 6, NULL);
INSERT INTO "test_approach" ("tag", "kind", "position", "retired_at") VALUES ('unit', 'level', 1, NULL);
INSERT INTO "number_sequence" ("kind", "parent_id", "next_value") VALUES ('adr', '01M191BE7MHM077FE9YM09B2ZK', 8);
INSERT INTO "number_sequence" ("kind", "parent_id", "next_value") VALUES ('discussion', NULL, 1);
INSERT INTO "number_sequence" ("kind", "parent_id", "next_value") VALUES ('library', NULL, 1);
INSERT INTO "number_sequence" ("kind", "parent_id", "next_value") VALUES ('spec', NULL, 1);
INSERT INTO "dependency_kind" ("kind", "gates_work", "position", "retired_at") VALUES ('blocks', 1, 1, NULL);
INSERT INTO "dependency_kind" ("kind", "gates_work", "position", "retired_at") VALUES ('builds_on', 0, 2, NULL);
INSERT INTO "dependency_kind" ("kind", "gates_work", "position", "retired_at") VALUES ('constrains', 0, 3, NULL);
INSERT INTO "dependency_kind" ("kind", "gates_work", "position", "retired_at") VALUES ('supersedes', 0, 4, NULL);
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M191CCB4641A87GRHJ7YBD4J', 'builds_on', '01M191BE7MHM077FE9YM09B2ZK', NULL, '01M1915SM9WVHJY2SYBZ04M3CR', NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M190RZY3N512H26B7SMAPWKS', 'library', 'root', 1, NULL, 'opencode-dpm-port-spec', 'opencode-dpm: DPM Ported to OpenCode v2', 'pending', NULL, NULL, NULL, NULL, NULL, '2026-08-30T09:42:25.987Z', '2026-08-30T09:42:25.987Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M1915SM9WVHJY2SYBZ04M3CR', 'discussion', 'root', 1, NULL, 'review-opencode-dpm-port-spec', 'Review of the opencode-dpm port spec', 'complete', NULL, NULL, NULL, NULL, NULL, '2026-08-30T09:49:25.512Z', '2026-08-30T09:49:25.512Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M191BE7MHM077FE9YM09B2ZK', 'spec', 'root', 1, NULL, 'opencode-dpm-port', 'opencode-dpm: port DPM to OpenCode v2', 'complete', NULL, NULL, NULL, NULL, NULL, '2026-08-30T09:52:30.452Z', '2026-08-30T10:11:37.542Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M191RM7VD3096N1HHQR33CGG', 'adr', 'child', NULL, 1, 'clean-fork-free-to-diverge', 'Clean fork, free to diverge', 'pending', NULL, '01M191BE7MHM077FE9YM09B2ZK', 'spec', NULL, NULL, '2026-08-30T09:59:42.587Z', '2026-08-30T10:01:56.938Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M191RNNDK285PEV27X5E1CNR', 'adr', 'child', NULL, 2, 'mcp-server-remains-tool-boundary', 'The MCP server remains the tool boundary', 'pending', NULL, '01M191BE7MHM077FE9YM09B2ZK', 'spec', NULL, NULL, '2026-08-30T09:59:44.045Z', '2026-08-30T10:01:58.185Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M191RQKT7NBX0VX40QSB72WC', 'adr', 'child', NULL, 3, 'erasable-typescript-node-24', 'Erasable-syntax TypeScript, run natively, on a Node 24 floor', 'pending', NULL, '01M191BE7MHM077FE9YM09B2ZK', 'spec', NULL, NULL, '2026-08-30T09:59:46.042Z', '2026-08-30T10:02:00.163Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M191RRP9GTJY53WP9RCDNW9X', 'adr', 'child', NULL, 4, 'sqlite-source-of-truth-unchanged', 'SQLite remains the source of truth and the data model does not change', 'pending', NULL, '01M191BE7MHM077FE9YM09B2ZK', 'spec', NULL, NULL, '2026-08-30T09:59:47.145Z', '2026-08-30T10:02:01.553Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M191RY452PMYKB35R7NDD60M', 'adr', 'child', NULL, 5, 'skills-registered-not-copied', 'Skills are registered, not copied', 'pending', NULL, '01M191BE7MHM077FE9YM09B2ZK', 'spec', NULL, NULL, '2026-08-30T09:59:52.709Z', '2026-08-30T10:02:04.531Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M191S0HPM9P3PXXJGRH3M34K', 'adr', 'child', NULL, 6, 'invocation-is-skill-first', 'Invocation is skill-first', 'pending', NULL, '01M191BE7MHM077FE9YM09B2ZK', 'spec', NULL, NULL, '2026-08-30T09:59:55.190Z', '2026-08-30T10:02:06.460Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M191S1ZQYSAY12930K9A3HNC', 'adr', 'child', NULL, 7, 'registration-idempotent-disposal-clean', 'Registration is idempotent and disposal-clean', 'pending', NULL, '01M191BE7MHM077FE9YM09B2ZK', 'spec', NULL, NULL, '2026-08-30T09:59:56.663Z', '2026-08-30T10:02:07.857Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M191S3JWSJVCT8FC6YHPS3AR', 'adr', 'child', NULL, 8, 'model-facing-surface-is-a-profile', 'The model-facing surface is a profile, not a fork', 'pending', NULL, '01M191BE7MHM077FE9YM09B2ZK', 'spec', NULL, NULL, '2026-08-30T09:59:58.300Z', '2026-08-30T10:02:09.234Z', NULL, NULL);
INSERT INTO "document_agent" ("document_id", "document_kind", "agent") VALUES ('01M1915SM9WVHJY2SYBZ04M3CR', 'discussion', 'architect');
INSERT INTO "document_agent" ("document_id", "document_kind", "agent") VALUES ('01M1915SM9WVHJY2SYBZ04M3CR', 'discussion', 'dev');
INSERT INTO "document_agent" ("document_id", "document_kind", "agent") VALUES ('01M1915SM9WVHJY2SYBZ04M3CR', 'discussion', 'pm');
INSERT INTO "document_agent" ("document_id", "document_kind", "agent") VALUES ('01M1915SM9WVHJY2SYBZ04M3CR', 'discussion', 'qa');
INSERT INTO "document_agent" ("document_id", "document_kind", "agent") VALUES ('01M1915SM9WVHJY2SYBZ04M3CR', 'discussion', 'sm');
INSERT INTO "document_agent" ("document_id", "document_kind", "agent") VALUES ('01M1915SM9WVHJY2SYBZ04M3CR', 'discussion', 'writer');
INSERT INTO "plugin_stamp" ("singleton", "version") VALUES (1, '0.7.0');
INSERT INTO "dependency_kind_endpoint" ("kind", "source_kind", "target_kind") VALUES ('builds_on', 'library', 'audit');
INSERT INTO "dependency_kind_endpoint" ("kind", "source_kind", "target_kind") VALUES ('builds_on', 'spec', 'discussion');
INSERT INTO "dependency_kind_endpoint" ("kind", "source_kind", "target_kind") VALUES ('builds_on', 'spec', 'problem_brief');
INSERT INTO "dependency_kind_endpoint" ("kind", "source_kind", "target_kind") VALUES ('builds_on', 'spec', 'product_brief');
INSERT INTO "dependency_kind_endpoint" ("kind", "source_kind", "target_kind") VALUES ('builds_on', 'spec', 'spec');
INSERT INTO "dependency_kind_endpoint" ("kind", "source_kind", "target_kind") VALUES ('constrains', 'adr', 'adr');
INSERT INTO "dependency_kind_endpoint" ("kind", "source_kind", "target_kind") VALUES ('supersedes', 'adr', 'adr');
CREATE TRIGGER requirement_unclaim_on_text_edit
AFTER UPDATE OF text ON requirement
WHEN OLD.text <> NEW.text
BEGIN
  UPDATE requirement SET coverage_claimed_at = NULL, coverage_claim_hash = NULL
   WHERE id = NEW.id;
END;
CREATE TRIGGER coverage_unverify_on_criterion_edit
AFTER UPDATE OF text ON story_criterion
WHEN OLD.text <> NEW.text
BEGIN
  UPDATE coverage SET verified_at = NULL, binding_hash = NULL
   WHERE story_criterion_id = NEW.id;
END;
CREATE TRIGGER coverage_unverify_on_requirement_edit
AFTER UPDATE OF text ON requirement
WHEN OLD.text <> NEW.text
BEGIN
  UPDATE coverage SET verified_at = NULL, binding_hash = NULL
   WHERE requirement_id = NEW.id;
END;
CREATE TRIGGER coverage_unverify_on_fragment_edit
AFTER UPDATE OF spec_fragment ON coverage
WHEN OLD.spec_fragment <> NEW.spec_fragment
BEGIN
  UPDATE coverage SET verified_at = NULL, binding_hash = NULL
   WHERE id = NEW.id;
END;
CREATE TRIGGER requirement_unclaim_on_coverage_insert
AFTER INSERT ON coverage
BEGIN
  UPDATE requirement SET coverage_claimed_at = NULL, coverage_claim_hash = NULL
   WHERE id = NEW.requirement_id;
END;
CREATE TRIGGER requirement_unclaim_on_coverage_delete
AFTER DELETE ON coverage
BEGIN
  UPDATE requirement SET coverage_claimed_at = NULL, coverage_claim_hash = NULL
   WHERE id = OLD.requirement_id;
END;
CREATE TRIGGER requirement_unclaim_on_fragment_edit
AFTER UPDATE OF spec_fragment ON coverage
WHEN OLD.spec_fragment <> NEW.spec_fragment
BEGIN
  UPDATE requirement SET coverage_claimed_at = NULL, coverage_claim_hash = NULL
   WHERE id = NEW.requirement_id;
END;
CREATE TRIGGER requirement_unclaim_on_coverage_retire
AFTER UPDATE OF retired_at ON coverage
WHEN OLD.retired_at IS NOT NEW.retired_at
BEGIN
  UPDATE requirement SET coverage_claimed_at = NULL, coverage_claim_hash = NULL
   WHERE id = NEW.requirement_id;
END;
CREATE TRIGGER coverage_retire_on_criterion_supersession
AFTER UPDATE OF superseded_at ON story_criterion
WHEN OLD.superseded_at IS NOT NEW.superseded_at AND NEW.superseded_at IS NOT NULL
BEGIN
  UPDATE coverage
     SET retired_at = NEW.superseded_at,
         retired_reason = 'The criterion this bound was superseded: ' || NEW.superseded_reason
   WHERE story_criterion_id = NEW.id AND retired_at IS NULL;
END;
CREATE TRIGGER criterion_approach_tag_not_retired_on_insert
    BEFORE INSERT ON criterion_approach FOR EACH ROW
    WHEN (SELECT retired_at FROM test_approach WHERE tag = NEW.tag) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: criterion_approach.tag references a retired test_approach row');
    END;
CREATE TRIGGER criterion_approach_tag_not_retired_on_update
    BEFORE UPDATE OF tag ON criterion_approach FOR EACH ROW
    WHEN (SELECT retired_at FROM test_approach WHERE tag = NEW.tag) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: criterion_approach.tag references a retired test_approach row');
    END;
CREATE TRIGGER story_criterion_approach_tag_not_retired_on_insert
    BEFORE INSERT ON story_criterion_approach FOR EACH ROW
    WHEN (SELECT retired_at FROM test_approach WHERE tag = NEW.tag) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: story_criterion_approach.tag references a retired test_approach row');
    END;
CREATE TRIGGER story_criterion_approach_tag_not_retired_on_update
    BEFORE UPDATE OF tag ON story_criterion_approach FOR EACH ROW
    WHEN (SELECT retired_at FROM test_approach WHERE tag = NEW.tag) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: story_criterion_approach.tag references a retired test_approach row');
    END;
CREATE TRIGGER coverage_story_coverage_id_not_retired_on_insert
    BEFORE INSERT ON coverage_story FOR EACH ROW
    WHEN (SELECT retired_at FROM coverage WHERE id = NEW.coverage_id) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: coverage_story.coverage_id references a retired coverage row');
    END;
CREATE TRIGGER coverage_story_coverage_id_not_retired_on_update
    BEFORE UPDATE OF coverage_id ON coverage_story FOR EACH ROW
    WHEN (SELECT retired_at FROM coverage WHERE id = NEW.coverage_id) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: coverage_story.coverage_id references a retired coverage row');
    END;
CREATE TRIGGER finding_severity_id_severity_domain_not_retired_on_insert
    BEFORE INSERT ON finding FOR EACH ROW
    WHEN (SELECT retired_at FROM taxonomy WHERE id = NEW.severity_id AND domain = NEW.severity_domain) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: finding.severity_id, finding.severity_domain references a retired taxonomy row');
    END;
CREATE TRIGGER finding_severity_id_severity_domain_not_retired_on_update
    BEFORE UPDATE OF severity_id, severity_domain ON finding FOR EACH ROW
    WHEN (SELECT retired_at FROM taxonomy WHERE id = NEW.severity_id AND domain = NEW.severity_domain) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: finding.severity_id, finding.severity_domain references a retired taxonomy row');
    END;
CREATE TRIGGER finding_category_id_category_domain_not_retired_on_insert
    BEFORE INSERT ON finding FOR EACH ROW
    WHEN (SELECT retired_at FROM taxonomy WHERE id = NEW.category_id AND domain = NEW.category_domain) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: finding.category_id, finding.category_domain references a retired taxonomy row');
    END;
CREATE TRIGGER finding_category_id_category_domain_not_retired_on_update
    BEFORE UPDATE OF category_id, category_domain ON finding FOR EACH ROW
    WHEN (SELECT retired_at FROM taxonomy WHERE id = NEW.category_id AND domain = NEW.category_domain) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: finding.category_id, finding.category_domain references a retired taxonomy row');
    END;
CREATE TRIGGER finding_agent_not_retired_on_insert
    BEFORE INSERT ON finding FOR EACH ROW
    WHEN (SELECT retired_at FROM agent WHERE name = NEW.agent) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: finding.agent references a retired agent row');
    END;
CREATE TRIGGER finding_agent_not_retired_on_update
    BEFORE UPDATE OF agent ON finding FOR EACH ROW
    WHEN (SELECT retired_at FROM agent WHERE name = NEW.agent) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: finding.agent references a retired agent row');
    END;
CREATE TRIGGER observation_category_taxonomy_id_taxonomy_domain_not_retired_on_insert
    BEFORE INSERT ON observation_category FOR EACH ROW
    WHEN (SELECT retired_at FROM taxonomy WHERE id = NEW.taxonomy_id AND domain = NEW.taxonomy_domain) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: observation_category.taxonomy_id, observation_category.taxonomy_domain references a retired taxonomy row');
    END;
CREATE TRIGGER observation_category_taxonomy_id_taxonomy_domain_not_retired_on_update
    BEFORE UPDATE OF taxonomy_id, taxonomy_domain ON observation_category FOR EACH ROW
    WHEN (SELECT retired_at FROM taxonomy WHERE id = NEW.taxonomy_id AND domain = NEW.taxonomy_domain) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: observation_category.taxonomy_id, observation_category.taxonomy_domain references a retired taxonomy row');
    END;
CREATE TRIGGER observation_category_observation_id_not_retired_on_insert
    BEFORE INSERT ON observation_category FOR EACH ROW
    WHEN (SELECT retired_at FROM observation WHERE id = NEW.observation_id) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: observation_category.observation_id references a retired observation row');
    END;
CREATE TRIGGER observation_category_observation_id_not_retired_on_update
    BEFORE UPDATE OF observation_id ON observation_category FOR EACH ROW
    WHEN (SELECT retired_at FROM observation WHERE id = NEW.observation_id) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: observation_category.observation_id references a retired observation row');
    END;
CREATE TRIGGER audit_finding_severity_id_severity_domain_not_retired_on_insert
    BEFORE INSERT ON audit_finding FOR EACH ROW
    WHEN (SELECT retired_at FROM taxonomy WHERE id = NEW.severity_id AND domain = NEW.severity_domain) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: audit_finding.severity_id, audit_finding.severity_domain references a retired taxonomy row');
    END;
CREATE TRIGGER audit_finding_severity_id_severity_domain_not_retired_on_update
    BEFORE UPDATE OF severity_id, severity_domain ON audit_finding FOR EACH ROW
    WHEN (SELECT retired_at FROM taxonomy WHERE id = NEW.severity_id AND domain = NEW.severity_domain) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: audit_finding.severity_id, audit_finding.severity_domain references a retired taxonomy row');
    END;
CREATE TRIGGER audit_finding_dimension_id_dimension_domain_not_retired_on_insert
    BEFORE INSERT ON audit_finding FOR EACH ROW
    WHEN (SELECT retired_at FROM taxonomy WHERE id = NEW.dimension_id AND domain = NEW.dimension_domain) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: audit_finding.dimension_id, audit_finding.dimension_domain references a retired taxonomy row');
    END;
CREATE TRIGGER audit_finding_dimension_id_dimension_domain_not_retired_on_update
    BEFORE UPDATE OF dimension_id, dimension_domain ON audit_finding FOR EACH ROW
    WHEN (SELECT retired_at FROM taxonomy WHERE id = NEW.dimension_id AND domain = NEW.dimension_domain) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: audit_finding.dimension_id, audit_finding.dimension_domain references a retired taxonomy row');
    END;
CREATE TRIGGER artifact_document_artifact_id_not_retired_on_insert
    BEFORE INSERT ON artifact_document FOR EACH ROW
    WHEN (SELECT retired_at FROM artifact WHERE id = NEW.artifact_id) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: artifact_document.artifact_id references a retired artifact row');
    END;
CREATE TRIGGER artifact_document_artifact_id_not_retired_on_update
    BEFORE UPDATE OF artifact_id ON artifact_document FOR EACH ROW
    WHEN (SELECT retired_at FROM artifact WHERE id = NEW.artifact_id) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: artifact_document.artifact_id references a retired artifact row');
    END;
CREATE TRIGGER dependency_kind_not_retired_on_insert
    BEFORE INSERT ON dependency FOR EACH ROW
    WHEN (SELECT retired_at FROM dependency_kind WHERE kind = NEW.kind) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: dependency.kind references a retired dependency_kind row');
    END;
CREATE TRIGGER dependency_kind_not_retired_on_update
    BEFORE UPDATE OF kind ON dependency FOR EACH ROW
    WHEN (SELECT retired_at FROM dependency_kind WHERE kind = NEW.kind) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: dependency.kind references a retired dependency_kind row');
    END;
CREATE TRIGGER document_agent_agent_not_retired_on_insert
    BEFORE INSERT ON document_agent FOR EACH ROW
    WHEN (SELECT retired_at FROM agent WHERE name = NEW.agent) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: document_agent.agent references a retired agent row');
    END;
CREATE TRIGGER document_agent_agent_not_retired_on_update
    BEFORE UPDATE OF agent ON document_agent FOR EACH ROW
    WHEN (SELECT retired_at FROM agent WHERE name = NEW.agent) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: document_agent.agent references a retired agent row');
    END;
CREATE TRIGGER dependency_kind_endpoint_kind_not_retired_on_insert
    BEFORE INSERT ON dependency_kind_endpoint FOR EACH ROW
    WHEN (SELECT retired_at FROM dependency_kind WHERE kind = NEW.kind) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: dependency_kind_endpoint.kind references a retired dependency_kind row');
    END;
CREATE TRIGGER dependency_kind_endpoint_kind_not_retired_on_update
    BEFORE UPDATE OF kind ON dependency_kind_endpoint FOR EACH ROW
    WHEN (SELECT retired_at FROM dependency_kind WHERE kind = NEW.kind) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: dependency_kind_endpoint.kind references a retired dependency_kind row');
    END;
