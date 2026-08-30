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
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M19MHG9TM8V5B78E0VGYWQH9', '01M19367X8Q1XF3043C63VQ4ZR', 'The effective MCP tool naming under OpenCode v2', '**Observed against a running host, not read from documentation.** `opencode2 v0.0.0-beta-18684`, a scratch project, and a throwaway probe plugin that called `ctx.tool.transform` and wrote the draft''s ids to a file. Everything below is what that file contained.

## The rule

A tool provided by an MCP server is rendered to the model as:

```
<server key>_<tool name>
```

One underscore, and nothing else. dpm registers its server under the key `dpm`, so `create_spec` is advertised as **`dpm_create_spec`**, `list_epic` as `dpm_list_epic`, and so on for all 183.

**Character substitution:** every character in the server key outside `A-Za-z0-9_-` becomes `_`. The hyphen survives. Established by registering a second server under the key `dpm-odd.name x` and reading back what its tools were called: `dpm-odd_name_x_adopt_session`. So the dot and the space were replaced and the hyphen was not.

This is the same substitution rule Claude Code documents. What differs is the namespace around it.

## What this replaces

Under Claude Code a plugin-bundled server''s tools were dispatched as `mcp__plugin_<plugin>_<server>__<tool>`, so dpm''s skills were written to call `mcp__plugin_dpm_dpm__create_spec` — the two `dpm` parts being the plugin name and the server key, not one name said twice. v2 has no `mcp__` prefix and no plugin segment: the server key alone is the namespace.

| | Claude Code v0.7.0 | OpenCode v2 |
| --- | --- | --- |
| `create_spec` | `mcp__plugin_dpm_dpm__create_spec` | `dpm_create_spec` |
| prefix source | plugin name **and** server key | server key alone |
| separator | `__` on both sides | a single `_` |

Every one of the twenty-three skill bodies names tools in the old form. Rewriting them is the skill-port epic''s work, and **this section is the reference it is rewritten against** — which is why it is recorded before any prose is touched.

## What is registered alongside

The host''s own built-in tools share the flat namespace and carry no prefix at all: `patch`, `edit`, `glob`, `grep`, `question`, `read`, `shell`, `skill`, `subagent`, `webfetch`, `websearch`, `write`. A dpm tool named `read` or `write` would therefore have collided had the prefix not been there; it is, so none do.

## The surface itself is unchanged

The port advertises 183 tools and the released v0.7.0 advertises 183 tools, and the two lists — every name, every description, every input schema — are byte-identical when both are sorted by name. The oracle is `tests/fixtures/v070-tool-surface.json`, captured by running the released `bin/dpm-mcp.js` out of the installed marketplace package rather than by writing down what this repository produces.

So the port changes how a tool is *addressed* and changes nothing about what the tools are.', 0, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M19N083Z1ZQKN3T91GVAG15S', '01M19367X8Q1XF3043C63VQ4ZR', 'Skill supporting files: the go/no-go', '**The answer is no for native resolution, and yes for the skills — because the plugin resolves the path itself at registration.** That is neither of the two outcomes the story anticipated, and it is cheaper than both.

## What was asked

All twenty-three skills open with the same sentence:

> Follow the shared conventions in `dpm/shared/skill-conventions.md` — read that file at startup.

One of them also names `dpm/shared/status-model.md`. Those are the only supporting files any skill reads; every other `dpm/…` path in the prose is an illustrative example, not a file to open.

Under Claude Code that path resolved because the host laid the plugin out beneath a directory called `dpm`. The question for v2 was whether a skill registered with a package `location` gets the same courtesy.

## What was observed

Against `opencode2 v0.0.0-beta-18684`, with a sample skill registered from a directory holding a `SKILL.md` and a sibling supporting file:

- `Skill.Info.location` **is preserved by the registry**, verbatim, as the absolute path of the skill''s directory inside the package.
- `content` is likewise stored verbatim. The registry does no rewriting of the body, so a relative path in the prose stays a relative path.
- The host''s built-in `skill` tool describes itself as loading "a specialized skill''s instructions and resources", but nothing in `Skill.Info` declares a base directory for the model''s *file* tools, and those work from the project directory.

A user''s project has no `dpm/shared/` in it. So the reference as written resolves against nothing, and left alone every one of the twenty-three skills would begin by failing to read its own conventions.

**What was not observed:** whether the host, on invoking a skill, hands the model the skill''s location in a form it can read siblings from. Establishing that needs a model turn, and no model provider was reachable in this environment. It is left open deliberately, because the decision below does not depend on the answer — if the host does help, the substitution is harmless; if it does not, the substitution is what makes the skills work.

## The decision

`src/plugin/skills.ts` rewrites `dpm/shared/<name>.md` to an absolute path under the package root as each skill is read, before it is registered. The reference the maintainer edits still says `dpm/shared/skill-conventions.md`; the reference the model receives is a path that exists on the machine it is running on.

The substitution **refuses rather than guesses**: a target that is not in the package throws at registration. A confident absolute path to nothing is worse than the original relative path, because the original fails visibly at the first read while the rewritten one fails the same way while looking correct.

## Why not the fallback the specification named

The story''s negative case named inlining the shared conventions into all twenty-three skill bodies, and its cost is why it was not taken:

| | Inline into 23 bodies | Resolve the path at registration |
| --- | --- | --- |
| copies of the conventions | 23, which drift | 1 |
| added to each skill | ~15KB of identical prose | one absolute path |
| model context per invocation | the whole conventions file, needed or not | unchanged |
| what a maintainer edits | twenty-three copies | one file |
| cost to build | a rewrite of every skill | one function, one regex |

Inlining also breaks the mechanism the conventions system is built on: `tests/support/skills.js` resolves a skill''s tool references *per named procedure*, so that dropping a `Follow the shared **Library Check** procedure` sentence drops its tools with it. A body with everything inlined names every tool any procedure uses, and that check stops being able to see its subject.

The fallback remains available and is not withdrawn — if a future host makes registration-time substitution impossible, inlining is what it falls back to.', 1, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M19NHD0NJXBM2TE0EMYRNKJ7', '01M19367X8Q1XF3043C63VQ4ZR', 'Two amendments to story 4''s dependency criteria', 'Both were written before the SDK was opened, and both are amended with the same citation rather than worked around.

## `dependencies` is empty, not "exactly one entry"

**Was**: *The package''s `dependencies` contains exactly one entry, `@opencode-ai/plugin`.*
**Now**: *The package''s `dependencies` is empty. `@opencode-ai/plugin` is needed for its types alone, so it sits under `devDependencies` and nothing is fetched at install.*

**Citation.** `node_modules/@opencode-ai/plugin/dist/promise/plugin.js` is, in full:

```js
export function define(plugin) {
    return plugin;
}
```

The entry is an object literal checked with `satisfies Plugin.Plugin`, which gives the identical compile-time check with nothing left at run time. Importing the package for real would fetch its eight dependencies — `@ai-sdk/provider`, `@opencode-ai/ai`, `@opencode-ai/client`, `@opencode-ai/protocol`, `@opencode-ai/schema`, `@standard-schema/spec`, `effect`, `zod` — into every user''s install in order to call a function that returns its argument.

`import type` is erased by both Node''s type-stripper and `tsc` before evaluation, so the type surface is available while the runtime graph stays empty. This is the same amendment story 1 made to NFR1; these two criteria were the copies of the old assumption that had not been reached yet.

**The requirement''s headline is strengthened, not relaxed.** Zero runtime dependencies is now literally zero, and the nine `deepEqual(dependencies, {})` assertions across the suite went on passing untouched.

## Pinned to the version, not to the tag

**Was**: *The plugin dependency is pinned to the `beta` tag.*
**Now**: *…pinned to the exact version the `beta` dist-tag resolves to, rather than to the floating tag itself.*

**Citation.** `npm view @opencode-ai/plugin dist-tags.beta` → `0.0.0-beta-18684`, which is what the manifest carries and what the installed `opencode2` reports for itself. A manifest naming `beta` is not a pin: two installs a day apart compile against different type surfaces, and the failure surfaces as a type error in a file nobody touched. The tag is how the version is *chosen* and re-checked; the version is what is written down.
', 2, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M19PDXAXYSNSQZG01DKETA8T', '01M19367X8Q1XF3043C63VQ4ZR', 'Milestone 2, run end to end in a scratch project', 'One install, one host, everything the epic promised, observed from inside the running registry rather than inferred from the code. Host: `opencode2 v0.0.0-beta-18684`, Node 24.20.0, a throwaway project outside the checkout holding nothing but an `opencode.json`.

## The configuration that works

```json
{
  "plugins": [
    {
      "package": "/absolute/path/to/opencode-dpm/src/plugin/index.ts",
      "options": { "profile": "full" }
    }
  ]
}
```

**`plugins` is an array of `string | { package, options }`, not a map.** The map form was tried first and was silently discarded — the host emitted `configuration normalization diagnostic … path=$.plugins kind=invalid action="skipped malformed recognized value"` to the log and started with no plugin, and every CLI listing then correctly reported nothing. The schema is `@opencode-ai/schema/dist/config/plugin.js`: `Entry` is `{ package: string, options?: Record<string, unknown> }` and `Plugins` is an array of `string | Entry`. `package` names the entry **file**; a directory does not resolve, because the host `import()`s the string verbatim with `?mtime=<n>` appended.

## What the registry held

Read by a second plugin in the same project that dumps `skill.transform(draft => draft.list())`, `mcp.transform(draft => draft.list())` and `tool.transform(draft => draft.list())` to a file — the technique that has now unblocked four separate questions in this epic.

| | |
| --- | --- |
| MCP servers | `dpm`, reported `✓ dpm connected` on three consecutive checks |
| tools advertised | 195 total: **183 prefixed `dpm_`**, 12 host built-ins with no prefix |
| old-form names | **0** — nothing carries `mcp__` |
| skills registered | 55 total, **23 of them dpm''s**, every one prefixed `dpm-` |
| duplicate skill ids | **0** |
| `location` | the package''s own directory, e.g. `…/opencode-dpm/skills/architect` |
| conventions reference | an absolute path that **exists and opens** — first line read back as `# dpm Shared Skill Conventions` |
| skills whose conventions path opens | **23 of 23** |
| skills still naming the relative form | **0** |

The tool count is the story-2 oracle''s number: 183 is exactly what the released v0.7.0 advertises, so the surface crossed the host boundary without losing or gaining a tool.

## The reload

The host was restarted and the log showed `loading plugin id=…/src/plugin/index.ts` **twice** in the new lifetime. That count is the control: without it, "nothing duplicated" is equally satisfied by a reload that never happened. Afterwards the registry held 55 skills, 23 of them dpm''s, 0 duplicate ids, one server, and 23 of 23 conventions paths still opening — identical to before.

`tests/plugin-reload.test.js` encodes why that is the plugin''s doing rather than the host''s kindness. The two registrations differ: `mcp.set(name, config)` is keyed and cannot duplicate, while `skill.add(skill)` appends and would double on a second load. The entry returns a cleanup disposing both in reverse, and the test drives it against a registry that *persists* across transforms — with a control that runs `setup` twice **without** the cleanup and requires the duplication to appear, since a registry that silently deduped would pass the real test for the wrong reason.

## One rough edge worth writing down

The CLI''s `mcp list` and `plugin list` report nothing for the first second or two after `service start`, then report correctly and stably. It is a cold-start race in the listing commands, not a registration failure — the log shows the plugin loading throughout, and the probe written from inside the host sees the full registry while the CLI still says "No MCP servers configured". Anyone verifying by CLI should run the command twice before believing the first answer.
', 3, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M19RW2DPBGC0EMTFE2E8GBGS', '01M193697Y6ZF3Q1KGVYPW5G15', 'The skill rewrite pattern, established on `spec`', 'Story 1 rewrote one skill body end to end and ran it against the beta host. This is what it
established, so the remaining twenty-two are a repetition rather than twenty-two decisions.

## The four edit classes

| Class | On `spec` | Left across the other 22 |
|---|---|---|
| 1. `mcp__plugin_dpm_dpm__<tool>` → `dpm_<tool>` | 32 references, 24 distinct tools | **424** references in `skills/` and `shared/` |
| 2. Front-matter `Triggers on "/dpm:X".` → the id form | 1 | **22** |
| 3. `/dpm:<skill>` cross-references in prose | 2 | **101** across 22 skills and `shared/status-model.md` |
| 4. `dpm/shared/skill-conventions.md` | **not touched** | not touched |

**Class 1 is the whole of the tool rename and it is uniform.** The prefix is not a per-tool
decision: under v2 an MCP server''s tools render as `<server key>_<tool>`, the key is `SERVER_NAME`
in `src/plugin/index.ts`, and the substitution rule epic 01-02 established by experiment turns
anything outside `A-Za-z0-9_-` into `_`. So the edit is one replacement of the prefix, applied with
the Edit tool per file, and the exported name after it is untouched.

**Class 4 is a deliberate non-edit, and rewriting it would break the plugin.** Epic 01-02 resolves
that line at registration time by substituting the package''s own absolute path into the body before
it is handed to the host. A body that already carried an absolute path would defeat the
substitution; a body that carried a different relative path would not be found. It stays exactly as
v0.7.0 wrote it.

## The invocation form, as established rather than as assumed

The planning for this story recorded a premise that turned out to be wrong, and it is written down
here so nobody re-derives it. `Skill.Info` carries `slash?: boolean`, and the host''s own built-in
`report` skill registers with `slash: true`, from which the plan concluded that v2 has slash
commands for skills and that story 3''s criterion was written against a v2 that does not exist.

**It does not.** `slash` controls whether a skill appears in an interactive command catalogue —
`false` hides it, unset is visible — and mints no `/name` trigger. The documented invocation is the
model calling the built-in `skill` tool with the registration''s **exact, case-sensitive id**, per
`https://opencode.ai/v2/docs/skills`. dpm''s ids are `dpm-<directory>`, so `spec` is `dpm-spec`.

So story 3''s criterion needs no amendment, the entry needs no `slash` change, and the description
sentence becomes:

> `Invoke with the skill tool, id "dpm-spec".`

replacing `Triggers on "/dpm:spec".`, with the skill''s own id substituted. Prose cross-references
become **the `dpm-epics` skill** rather than `` `/dpm:epics` ``. Both forms avoid a colon followed by
a space, which a YAML plain scalar cannot carry.

## What the pilot actually proved, in the running host

In a throwaway project outside the checkout, with `opencode2 v0.0.0-beta-18684`:

- 55 skills registered, 23 of them dpm''s; `dpm-spec` present with `name: spec` and its directory as
  `location`.
- Its registered content carries **zero** legacy tool references and **zero** `/dpm:` references,
  and the conventions line resolved to the absolute
  `/Users/chris/Work/git/opencode-dpm/shared/skill-conventions.md`, which opens.
- The host''s tool registry holds 195 tools, 183 of them `dpm_`-prefixed, and **all 24 tools the
  ported body names are among them** — nothing missing. That is the check that the rename produced
  real names rather than plausible strings.
- `dpm_create_spec`, taken from the host''s registry by its dispatched id and executed, wrote a
  persisted row into the scratch project''s database.
- An `opencode2 run` told to load id `dpm-spec` did load it, and then reached for exactly the
  substituted absolute path.

**Not proved: a model driving the facilitation to its first gate.** The local provider refuses
connections and the free hosted models available here wandered — one shelled into the real checkout
— so that route was stopped rather than retried. The gate wording is unchanged from v0.7.0 and is
covered by the source-reading tests; what is outstanding is a live facilitation, and it is
outstanding rather than done.

## A finding the batch pass has to carry: the substituted path is outside the project

opencode2 auto-rejected the conventions read in a non-interactive run:

> `permission requested: external_directory (/Users/chris/Work/git/opencode-dpm/shared/*); auto-rejecting`

Registration-time substitution points every one of the 23 bodies at a file **outside the project the
session is running in**, because the package lives wherever it was installed. In an interactive
session the user is prompted; non-interactively the read fails unless the project''s config allows it
(`permission.external_directory`, which takes `ask`/`allow`/`deny` or a glob record).

This is a consequence of epic 01-02''s chosen approach that its own story never met, and it is not a
skill-body problem — no rewrite of class 1–4 changes it. It belongs in the installation guidance
epic 01-04 writes, and it is worth re-reading epic 01-02''s fallback pricing against, since inlining
the conventions into each body would not have had it.

## The one skill that will not fit the pattern

`ralph` names `.claude/ralph-loop.local.md` five times. That is a **Claude Code stop hook** — a file
the harness reads to decide whether to re-enter the loop — and v2 has no equivalent mechanism. It is
not a rename and it is not a path substitution; it is a missing capability, and the batch pass
should meet it as a known decision rather than as a surprise. Leave those five references alone in
story 2 and resolve them where the epic decides what `ralph` does under v2.

## The test-side transition, and why it is visible

`tests/support/skills.js` reads skill bodies for 40 test files, and its `CALLABLE` constant used to
be derived from the Claude Code manifest. It is now derived from `SERVER_NAME` in the plugin entry
and yields `dpm_`; `LEGACY_CALLABLE` holds the old prefix, and `EITHER_CALLABLE` is the exported
alternation that `toolNames`, `ungated` and `support/body-reads.js`''s `sites` match on, so an
unported body goes on reporting the tools it names instead of reporting none.

**A matcher that accepts both forms and says nothing would accept a body that was never ported,
silently and for ever.** So `bodiesOnLegacyForm()` returns the bodies still on the old prefix and
`skill-pilot.test.js` asserts that list is exactly the skills not yet done — 22 after this story.
Story 2 empties it, story 4 forbids the old form outright, and the constant, the alternation and the
assertion come out together on the day the list is empty.', 0, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M19W5ZMFB4EQC2YVZ84JPN0Z', '01M193697Y6ZF3Q1KGVYPW5G15', '`$ARGUMENTS` has no v2 equivalent, and what replaced it', '**All twenty-three bodies named `$ARGUMENTS`, thirty times, and story 2''s must-NOT did not catch
it.** That prohibition lists `mcp__plugin_`, `/dpm:`, `CLAUDE_PLUGIN_ROOT` and `.claude/` — the
mechanisms anyone thinks of. `$ARGUMENTS` is the *argument half* of the same slash-command
mechanism: under Claude Code the harness substituted whatever the user typed after `/dpm:spec` into
the body before the model ever saw it, so the token was a hole the host filled.

**Under v2 nothing fills it**, and that is established rather than assumed, from two independent
places:

- The v2 skill documentation: *"When the model calls the `skill` tool with an exact ID, OpenCode
  resolves the current winning definition for that ID, checks the `skill` permission for the
  selected agent, adds the Markdown body, without frontmatter, to the conversation, and provides
  the skill''s base directory and a sample of up to ten supporting file paths."* The tool takes the
  ID and nothing else; no parameter, no substitution.
- `Skill.Info` in `@opencode-ai/schema` carries `id`, `name`, `description`, `slash`, `autoinvoke`,
  `location` and `content`. There is no argument field for a substitution to write into, and
  `$ARGUMENTS` appears nowhere in the installed host.

So left alone, a v2 model reading `` `$ARGUMENTS` is the change description `` sees a literal string
that binds to nothing — and the failure is the bad kind, because the sentence still reads as an
instruction. It would not error; it would quietly make something up.

**What stands where it stood is the request.** The body is added to a conversation that a request
started, so what the user asked for is the argument, and it arrives as prose rather than as a
substituted token. The rewrite is therefore `$ARGUMENTS` → **the request**, reworded per site so
each sentence reads as English rather than as a variable with a new name:

| Old | New |
|---|---|
| `` If `$ARGUMENTS` names a document `` | `If the request names a document` |
| `` `$ARGUMENTS` selects the action: `` | `The request selects the action:` |
| `` `$ARGUMENTS` is optional. `` | `What the request names is optional.` |
| `` `$ARGUMENTS` is an optional scope hint `` | `The request may carry a scope hint` |
| `No arguments produces the whole-project report` | `A request naming no focus produces the whole-project report` |

**No gloss is repeated in the twenty-three bodies.** "The request" needs no definition in a document
that was added to a conversation, and a definition repeated twenty-three times is twenty-three
places to drift. The mechanism itself is named once per body where a reader actually needs it — the
front-matter `description`, which every body ends with `Invoke with the skill tool, id "dpm-<name>"`.

**Three further sites said "argument" meaning the invocation and not a tool parameter**, and moved
with them: `clean`''s "an argument is a convenience, never a licence", `ralph`''s "the mode comes from
the argument", and `shared/skill-conventions.md`''s "type as an argument". Every other use of the
word in the corpus means a tool''s own parameter and was left alone — `dpm_publish` really is called
with no arguments.

**What the oracle diff now shows, counted rather than asserted.** Reverse-substituting only the tool
prefix and diffing all twenty-three bodies plus `shared/skill-conventions.md` against released
v0.7.0 gives **123 differing lines**, and every one is invocation prose:

| Source | Lines |
|---|---|
| The twenty-three front-matter descriptions (story 2) | 23 |
| Lines naming a skill as `dpm-<name>` where they said `/dpm:<name>` (story 2) | 65 |
| Lines carrying "the request" where they said `$ARGUMENTS` (story 3) | 33 |
| `clean`''s reworded "a named selection is a convenience" (story 3) | 2 |

Story 3 accounts for 35 of the 123; the other 88 are story 2''s. **None of it is the first
divergence** — the descriptions and the `/dpm:` references were intentional prose changes too. What
the count establishes is the thing worth establishing: no line differs that neither story meant to
change, so the procedure prose, the gate wording and the tables came through both passes untouched.', 1, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M19Z9XYDCZDVCEFKVZR0RCHX', '01M1936AGMZ3DD6GJZM5ATYYS7', 'Where OpenCode puts a git-installed plugin', 'Observed against a real install rather than read from documentation, in an isolated XDG root so the machine''s own OpenCode configuration was untouched:

```
XDG_CONFIG_HOME=… XDG_DATA_HOME=… XDG_CACHE_HOME=… opencode2 plugin add github:ninthspace/opencode-dpm
```

**The package lands at `$XDG_CACHE_HOME/opencode/packages/git-<hash>/node_modules/<package name>/`** — by default `~/.cache/opencode/packages/git-<hash>/node_modules/opencode-dpm/`. The configuration entry goes to `$XDG_CONFIG_HOME/opencode/opencode.json` as `plugins: ["github:ninthspace/opencode-dpm"]`, an array of specifier strings.

**`<hash>` is sha256 of the literal specifier string**, and that is derived rather than assumed: `sha256("github:ninthspace/opencode-dpm")` is `fb2f92df39b7c4694b7ec16c3d37931dcf7714f676af4abaade9056b7b090f8c`, which is the directory name after the `git-` prefix, byte for byte. Confirmed a second time from the other direction — installing `github:ninthspace/opencode-dpm#main`, the same repository under a different specifier string, produced a *second* directory named for that string''s hash. So the hash is over the text somebody typed, not over the repository or the commit it resolved to.

Each `git-<hash>` directory is an ordinary npm install root: a two-line `package.json`, a `package-lock.json`, and `node_modules/`. The lock pins the resolution to a commit — `git+ssh://…/opencode-dpm.git#1120b7a34d3c4790b8fe0166a1469cdcf8b116a1` — so the specifier is what names the directory and the lockfile is what records which commit is in it.

## What this changes about the guard''s symlink

**There is no version in the path, and that is the difference from Claude Code.** A Claude Code plugin lived at `…/plugins/cache/<marketplace>/dpm/<version>/`, so an upgrade installed *beside* the old release and left a `.git/hooks/pre-commit` symlink pointing into the previous one — the stale-guard case `src/guard/main.ts` refuses on, and the reason the README says to re-run the link with `-f` after every upgrade.

Under OpenCode the directory name is a function of the specifier alone, so re-resolving the same specifier can only write into the same directory. A symlink made against it survives an upgrade of that specifier. **This is a derivation from an observed fact and not itself observed**: showing an upgrade in place needs a new commit upstream to pull, which this run could not produce. What was observed is that the name is `sha256(specifier)`, twice, and that two different specifier strings for the same repository get two directories.

Two consequences, both worth carrying into the README:

- **`sort -V | tail -1` is meaningless here.** The old instruction sorted a version out of the path; there is no version, and sorting hex hashes orders nothing. The replacement sorts by modification time and takes the newest install: `ls -dt "${XDG_CACHE_HOME:-$HOME/.cache}"/opencode/packages/*/node_modules/opencode-dpm/hooks/pre-commit | head -1`.
- **The stale-guard refusal stays reachable and its explanation does not.** A user who pins two specifiers — a tag and a branch, say — has two installs of different ages and can link against the older, so the refusal in `src/guard/main.ts` still earns its place. The sentence explaining *why* it happens describes Claude Code''s mechanism, and under OpenCode the ordinary upgrade is not it.

## Two things that did not work, recorded rather than chased

- **`opencode2 plugin list` reported "No plugins found"**, run twice, against a configuration file declaring two plugins. The control is uninformative — the machine''s real configuration declares none, so the same answer there is correct — which means nothing here establishes what that command reads.
- **The host log records only CLI starts, and no plugin load.** So this section is evidence about *where a git install lands* and about nothing else. Whether a plugin registers from that location is epic 01-02''s ground, established there against a local path rather than a git specifier.', 0, NULL);
INSERT INTO "document_section" ("id", "document_id", "heading", "body", "position", "superseded_at") VALUES ('01M1A2WHE10CWRGSHT4S3BXZEA', '01M1936AGMZ3DD6GJZM5ATYYS7', 'What the five stories had in common', 'Synthesis across the epic''s five story observations, written because signals fired during the loop: the test command returned failures on two separate stories, and a README draft was killed at review.

**The same defect four times: a check whose scope was set by where somebody expected to find the thing.** Story 1 found `/dpm:publish` in `src/guard/index.ts` — a Claude Code slash command surviving three epics of the port, including the epic that built a CI check for exactly that string, because the check walks `skills/` and `shared/` and the guard is the one module in `src/` that writes prose a user acts on. Story 3 found a criterion whose antecedent was empty, which passes identically whether the sweep found nothing, read nothing, or stopped matching. Story 4''s README test would have run the blocks it recognised and reported clean on the one added last week. Story 5''s first README draft named both permission axes and would have left a reader confident they had covered publishing.

Four different surfaces, one shape: **the reading was bounded by an assumption nobody had written down**. What fixed each was the same move — enumerate the population, hold it against a written classification, and fail in both directions. `session-scratch.test.js` fails when a new `process.env` read is unclassified; `readme-v2.test.js` fails on an unmatched block *and* on a rule that matches nothing; `permission-entries.test.js` fails when a documented rule names a skill or tool that does not exist. None of them assert an absence directly, because an absence asserted is an absence nobody looked for.

**Two findings about matching on strings, from opposite ends of the epic.** Story 1: `dpm-publish` is a substring of `bin/dpm-publish.ts`, so three assertions asking "does this refusal offer the publish skill" were answerable by a path, and one passed for that reason — fixed by exporting the phrase rather than the id. Story 4: the beta callout could not be found by searching for its own opening sentence, because the TL;DR says the same thing more briefly and the anchored match found that one — fixed by extracting the blockquote as a blockquote. Both are the same lesson at different scales: **a string that appears in prose is not an identifier, and matching on one gives an answer that is confidently about the wrong occurrence.** Retro 02 recorded this from a third angle. Three sightings is a pattern rather than a coincidence.

**Where the epic declined to automate, and why that is not a gap.** Story 5''s two behavioural criteria and story 2''s location criterion are `manual`, and stay so. A test asserting the host''s permission semantics would assert this run''s transcription of them and pass exactly as well when the transcription is wrong; what the test files check instead is the half a person cannot recheck every commit — that every documented rule names something that exists, that the documented instruction resolves to a file. The transcribed glob matcher in `permission-entries.test.js` is the one thing taken on trust and is named as such in the file.

**State left by an earlier story is state the next one inherits.** Story 2''s XDG-rooted scratch install was the right fixture and it made story 5''s probe return nothing at all, three times, with no symptom pointing at the cause — two git specifiers left in the scratch global config plus the project''s local path is three plugins claiming `id: dpm`, and OpenCode kills the *entire* plugin load rather than the duplicate. A working probe presents as a hung one. The host log named it; nothing else would have.

**Left open, and belonging to no story here.** `/dpm:templates`, `/dpm:do` and `/dpm:epics` remain in JSDoc in `src/tools/cross/template.ts`, `src/coverage/warrant.ts` and `src/preview/example.ts` — the same staleness story 1 fixed, in comments rather than output. And `DATABASE` is a relative path, so which directory OpenCode hands a spawned local MCP server decides which repository `.dpm/` lands in; every test here runs the server against an explicit root, so nothing in this epic reaches that question.', 1, NULL);
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
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191HM8EE473JDD426R9FQRE', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR5', 'functional', 'must', NULL, NULL, 'The five executables port. `dpm-mcp`, `dpm-guard`, `dpm-publish`, `dpm-import` and `dpm-merge` keep their responsibilities, become TypeScript sources, and remain runnable directly with `node` and no loader.', 4, '2026-08-30T14:25:00Z', '136f3186995022ec49eb5e3f996bd7012f5782dacfadffbb8d906395453429c9');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191HPCXWPEDVYD8ZCRGZNJQ', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR6', 'functional', 'must', NULL, NULL, 'Pre-commit guard unchanged in kind. It remains a git hook that regenerates and compares, fixes nothing, and refuses with the four-case explanation. The install instruction is updated for where OpenCode places plugin packages, and the missing-symlink warning on server start carries over.', 5, '2026-08-30T20:00:00Z', '916996b326e14efdc3266c7cb7e18d60f9d1e622ca5ca6d3d3994964805ef193');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191HRH294FESBRF5JK3CZGQ', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR7', 'functional', 'must', NULL, NULL, 'Test suite ports. The `node --test` suite — 133 test files at v0.7.0, including the corpus snapshot tests — runs against the TypeScript sources in CI, under plain `node` with no loader.', 6, '2026-08-30T14:25:00Z', '6dc2f2e7ec96dd4330e92a10c50071cdbc72026417d08badc045099c11b66b2f');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191HSY4Z56KCR1HWSDVA1VE', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR8', 'functional', 'should', NULL, NULL, 'Permission-aware behaviour. Skills behave correctly under `ask` and `deny` rules for the `skill` action, and the README documents the recommended permission entries.', 7, '2026-08-30T20:00:00Z', 'ae450272d806f7f3b1fc27350052451b1f8c4664e487efb771ca560401337137');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191HZ1QER0TFPZ2DQQ4NYJX', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR9', 'functional', 'should', NULL, NULL, 'Session scratch via plugin storage. Anything that was per-session scratch keyed by an environment variable in Claude Code uses `ctx.storage` where a database session row is not already the answer. No transient files land in the project tree.', 8, '2026-08-30T20:00:00Z', '84a9dbcf1cdda7a9265315499566f21debdc11c76b1810dbb205464106fa272f');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191J1W9E36VGT6DC7ZVKP94', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR10', 'functional', 'should', NULL, NULL, 'README for a v2 audience. Install, first run, guard symlink, and "when the guard refuses" are rewritten for `opencode2`. The CPM MIGRATION.md does not carry over.', 9, '2026-08-30T20:00:00Z', '542fd90ad02adde3121df5d740d982e7b741f13ebb9fc9ebb10084651c9237b7');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191J2Z2EH3B2G3FVJ63EQ3N', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR11', 'functional', 'could', NULL, NULL, 'Slash-catalog commands. Register `ctx.command.transform` entries that prompt the session into a named skill, restoring something close to the previous slash-command ergonomics if skill-as-slash proves insufficient in practice.', 10, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191J4PJ7KEV66YH1B1QC4BM', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR12', 'functional', 'could', NULL, NULL, 'HTTP skill catalog. Publish the skills as a v2 HTTP catalog for teams that want the skills without the plugin. Low value while the tools require the plugin anyway.', 11, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191JCC04JEVXVWFMS1V9RMJ', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR13', 'functional', 'wont', 'deferred', NULL, 'Lite profile for constrained local open-weight models — a reduced model-facing surface selected by plugin option, with skills rewritten as terse imperative checklists, tool descriptions and schemas hard-trimmed, conventions inlined rather than read at startup, a measured context budget, and single-sentence tool refusals that name the field and state the correction. Deferred to a specification of its own: it is an iteration on what this specification builds rather than part of it. The architectural seam that makes it selectable at registration time is decided here and is not deferred.', 12, '2026-08-30T16:05:00Z', 'f908b5b8fb2edb81e8b8c1a4ac232225628c510cf28fb27335722c45c7f16ea8');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191JEBN8VV1VNPNKYKFC5H9', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR14', 'functional', 'wont', 'out_of_scope', NULL, 'Claude Code compatibility in this repository. The marketplace repository remains the home of the Claude Code plugin.', 13, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191JFTXHMWR1WZGPAJACE1Q', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR15', 'functional', 'wont', 'out_of_scope', NULL, 'OpenCode v1 support.', 14, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191JHFA19EW0XW6SZK17WN1', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR16', 'functional', 'wont', 'out_of_scope', NULL, 'CPM migration tooling. Anyone on CPM migrates via the existing Claude Code dpm first.', 15, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191JJS4KT4HTH40S8YVHNPJ', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'FR17', 'functional', 'wont', 'out_of_scope', NULL, 'CLI and TUI plugin work — `cli.json` plugins, theme integration, keybinding integration.', 16, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191KQV386EDYK9Z9H12D2N5', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'NFR1', 'non_functional', 'must', NULL, NULL, 'Zero runtime dependencies. `node:sqlite` stays; no native modules and no install-time compilation. The only package the plugin needs is `@opencode-ai/plugin`, and it is needed for its types alone — `Plugin.define` is the identity function `define(plugin) { return plugin }`, so importing it at runtime would pull eight transitive packages in to call a function that returns its argument. The SDK is therefore taken as a type-only import, sits under `devDependencies`, and `dependencies` stays empty.', 17, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191KSQTS6M41QHYTJX0WAM6', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'NFR2', 'non_functional', 'must', NULL, NULL, 'No build step. TypeScript throughout, restricted to erasable syntax so Node runs the sources directly. `tsc --noEmit` is a type check in CI, not a compile, and no build artefact is produced or published.', 18, '2026-08-30T14:25:00Z', 'ce3ddd69dac05402cf115fe75a6390195f8400d73fc64ea3d2aebe2ffe83a569');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191KW1TEYZR0S56SCE5GZDC', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'NFR3', 'non_functional', 'must', NULL, NULL, 'Beta churn tolerance. The plugin pins `@opencode-ai/plugin@beta` and the README states plainly that OpenCode v2 is beta and that entrypoints may move under it. API breakage is expected maintenance rather than a defect.', 19, '2026-08-30T20:00:00Z', '683b3df150438e8f11a588d46f71ca1bae9ccf95aece44156de56aa5d7bb4575');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191KY76N9B04YVJK69YMCGW', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'NFR4', 'non_functional', 'must', NULL, NULL, 'Determinism. Dump output, projection output, and ULID and number allocation behaviour remain byte-stable across the port. The guard''s regenerate-and-compare depends on it.', 20, '2026-08-30T14:25:00Z', 'c8c2578bdfc428fa6a7247208fb7e26bdb55d6237c012503c0aa889d9b1b88dd');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191M0X2D61B6XGBY2SPA0MA', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'NFR5', 'non_functional', 'must', NULL, NULL, 'Import-extension discipline. Every internal import specifier carries an explicit `.ts` extension, as native type-stripping requires specifiers to resolve exactly as written, and `tsconfig.json` sets `allowImportingTsExtensions` so the type check accepts them. Enforced by a dedicated CI sweep that imports every module under `src/` and `bin/` with plain `node`. The sweep exists separately from the test suite because the suite only exercises modules some test imports, and a bad specifier in a module nothing imports would otherwise reach a release unobserved.', 21, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191NVWV9CP15DT44439W9NZ', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR1', 'environmental_requirement', 'must', NULL, NULL, 'Development: Node 24 or later on the contributor''s machine. Checkable by `node --version` reporting 24.0.0 or above. This is the floor that buys native type-stripping and a stable `node:sqlite` in one move.', 22, '2026-08-30T14:25:00Z', 'c67b5c733dfed337c343c1de6beb4185b3066a93886eed67b78f667396ac23bb');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191NX38ANZRH042J1KQ91S0', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR2', 'environmental_requirement', 'must', NULL, NULL, 'Development: `node --test` is the test runner. Checkable by the test script being `node --test` and no third-party test runner appearing in `devDependencies`.', 23, '2026-08-30T14:25:00Z', 'afcd109c687684e89175e5ac81ae5ca48318882aa56170d0dee3636bbefc38a6');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191NZRB4NJ2A07WES55GFTT', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR3', 'environmental_requirement', 'must', NULL, NULL, 'Development: TypeScript available for type checking. Checkable by `tsc --noEmit` running from `devDependencies` and exiting zero.', 24, '2026-08-30T14:25:00Z', '984802fea2c0e65c98c40e85f6f99163030228199e9f81be19e03074e4cab795');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191P15MPZRFA7HH2Z91K8XP', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR4', 'environmental_requirement', 'must', NULL, NULL, 'Development: an OpenCode v2 beta CLI on the contributor''s machine. Checkable by `opencode2 --version` reporting a `0.0.0-beta-*` build matching the `beta` dist-tag of `@opencode-ai/plugin`, so the CLI and the SDK the plugin is typed against are the same build. Without it neither the effective tool naming nor the skill-registration behaviour can be verified, and both gate the skill port.', 25, '2026-08-30T16:05:00Z', '391410948c8da36eb0637c2f191884434ea2dfc23b5b196c0d0d628b76dfee2f');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191P6ZQ9026CAE9NPHA7VXK', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR5', 'environmental_requirement', 'must', NULL, NULL, 'Development: a scratch OpenCode project to register into. Checkable by installing the plugin into a throwaway project and observing its MCP server reach connected state with the skills advertised.', 26, '2026-08-30T16:05:00Z', 'ae329e06fe9eaf4ab8ea46bca643373d94d68fac3770378f9f2fbb6acca2059a');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191P8TH87TEYAPJ9V0F4P3S', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR6', 'environmental_requirement', 'must', NULL, NULL, 'Development: git with hook support. Checkable by `git --version` reporting 2.9 or above and a hook installed at `.git/hooks/pre-commit` firing on commit.', 27, '2026-08-30T20:00:00Z', '43722ab406fe1e5a65cdc43dce3f61a20504ea44137991b068b9e829430aa0e2');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191PB5ZT101VW751N9HTCER', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR7', 'environmental_requirement', 'must', NULL, NULL, 'Development: CI that runs the suite. Checkable by a CI job running the full `node --test` suite on Node 24 under plain `node`, plus the type check and the module sweep, on every push.', 28, '2026-08-30T14:25:00Z', 'fab4cb19a95696463d234604bc754a7a8343babc8722a1989b757d5a422a71c5');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191PDECZ9F46H7Q6J8XNSDP', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVX1', 'environmental_restriction', 'must', NULL, NULL, 'Development: native compilation must not be required. Checkable by a clean install completing with no node-gyp invocation, no C or C++ toolchain and no Python present.', 29, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191PJJS5APQC7DK4P73CR1G', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVX2', 'environmental_restriction', 'must', NULL, NULL, 'Development: a loader or transpiler must not be required. Checkable by the test command and each executable''s invocation passing no `--loader`, no `--import`, and no transpiler flag — the sources run on what Node 24 does by default.', 30, '2026-08-30T14:25:00Z', 'b129020857834dd62d559f4231d9e7780b9fbeb16931e73909f876d706b42d17');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191PMSEVEWV2QZPCTQB0KQ7', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVX3', 'environmental_restriction', 'must', NULL, NULL, 'Development: Claude Code must not be required. Checkable by the full suite passing on a machine with no Claude Code installed and no `CLAUDE_`-prefixed environment variables set.', 31, '2026-08-30T14:25:00Z', 'eb45cf6525a725e53b56e47c9c5e62ae44d4b9887b9ab3a6d9748d4659586b33');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191PQA3QF3YC847X5Y9CD4F', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR8', 'environmental_requirement', 'must', NULL, NULL, 'Production: Node 24 or later on the host running OpenCode. Checkable by the runtime the host invokes reporting 24.0.0 or above, and by each executable refusing with an explanatory message when it is below.', 32, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191PRJD860MEPCETCTG156D', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR9', 'environmental_requirement', 'must', NULL, NULL, 'Production: OpenCode v2 as the host application. Checkable by the plugin loading under a 2.x host and its MCP server, skills and any commands appearing in that host''s registries.', 33, '2026-08-30T16:05:00Z', '3adb8783618e0837c17b333f6b8ef472f7ce240fe49eb10a6492599f352a8eec');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191Q160A0AWMXH0WTD2P0GF', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR10', 'environmental_requirement', 'must', NULL, NULL, 'Production: a git repository in the user''s project. Checkable by the guard hook installing at the repository''s hook path and refusing a commit whose projection is stale.', 34, '2026-08-30T20:00:00Z', '9495255be0f86d80fec6422457de2d5f6a4a8309d8167d485dbc66a05e90f412');
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191Q35NNXEWQK0HNQGBD5PY', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR11', 'environmental_requirement', 'must', NULL, NULL, 'Production: filesystem write access to `.dpm/` inside the project. Checkable by the database and the dump being created and rewritten there on a first run in a fresh project.', 35, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191Q578097ZDAS8SA8MGHY1', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVX4', 'environmental_restriction', 'must', NULL, NULL, 'Production: network access must not be required at runtime. Checkable by a full plan-and-publish cycle completing with networking disabled.', 36, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191Q6FFNXB7AR19TRT6RCSE', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVX5', 'environmental_restriction', 'must', NULL, NULL, 'Production: a database service must not be required. Checkable by persistence needing only files under `.dpm/`, with no port bound and no external service contacted.', 37, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M191Q82N7NWEGDG30HYFKX8S', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVX6', 'environmental_restriction', 'must', NULL, NULL, 'Production: Claude Code artefacts must not be required. Checkable by the plugin running correctly in a project containing no `.claude/` directory and no CPM or dpm marketplace installation.', 38, NULL, NULL);
INSERT INTO "requirement" ("id", "spec_id", "spec_kind", "label", "class", "moscow", "exclusion", "parent_id", "text", "position", "coverage_claimed_at", "coverage_claim_hash") VALUES ('01M192BM6P7KCFK6EJBPF417RR', '01M191BE7MHM077FE9YM09B2ZK', 'spec', 'ENVR12', 'environmental_requirement', 'must', NULL, NULL, 'Development: a disposable isolated environment — a container or equivalent — that can be started with no language toolchain present and with networking disabled. Captured after the testing tags were assigned, because two integration criteria need it: the clean-install check under ENVX1 and the offline plan-and-publish cycle under ENVX4. Both are development tooling, so neither is a target claim; without this entry each would be satisfied by inspection rather than by running.', 39, '2026-08-30T14:25:00Z', '79663adcaa4c3da1e08bfb106060dbb58e2c3cffea89fa46ea66b88a6b35e9a4');
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
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193D76TSTFC2K4HBRG1KHQW', '01M193CRHRQC3Z4E42TM3XKPGT', 'The repository contains the v0.7.0 tree at its starting commit — 100 modules under `src/`, five executables under `bin/`, 133 test files under `tests/`, 23 skill directories under `skills/`, and `shared/skill-conventions.md` and `shared/status-model.md`.', 'must', 0, NULL, NULL, '01M191RM7VD3096N1HHQR33CGG');
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193D8FDXKAV9EN1ZJ9A7Z1D', '01M193CRHRQC3Z4E42TM3XKPGT', 'The repository''s `package.json` declares the name `opencode-dpm` and an `engines.node` field of `>=24.0.0`.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193D9T7S4F5FQVWFKP5VSNE', '01M193CRHRQC3Z4E42TM3XKPGT', '`node --version` on the contributor''s machine reports 24.0.0 or above.', 'must', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193DB47YHMBWCT7A716NYSC', '01M193CRHRQC3Z4E42TM3XKPGT', 'Each of the five executables, run on a runtime below 24, refuses with a message naming the required version rather than failing on a syntax or module error.', 'must', 3, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193DCM1K8BQ3WDJW5D71JEC', '01M193CRHRQC3Z4E42TM3XKPGT', 'The runtime the host invokes on the user''s machine reports 24.0.0 or above.', 'must', 4, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193DDWRVNYGV95411BYZ2JM', '01M193CRHRQC3Z4E42TM3XKPGT', 'The repository takes a package, git or copy-script dependency on the marketplace repository.', 'must_not', 5, NULL, NULL, '01M191RM7VD3096N1HHQR33CGG');
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193DX4V2DM8BE44DGT6WX1Z', '01M193CSTFYJ1RQWVK6AX2QYP0', 'Every module under `src/` is a `.ts` file and the tree runs under plain `node` with no loader.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193DYE04PACNNT4K28E2ZH5', '01M193CSTFYJ1RQWVK6AX2QYP0', '`tsc --noEmit` exits zero over the whole codebase, and the package declares no build script.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193E01EFGYAC7DQNE00V8SP', '01M193CSTFYJ1RQWVK6AX2QYP0', 'The published package contains a build output directory, or its `files` or `exports` fields point at one.', 'must_not', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193E1AAYA4JR37J9VCPKPBQ', '01M193CSTFYJ1RQWVK6AX2QYP0', 'Every internal import specifier under `src/` carries an explicit `.ts` extension.', 'must', 3, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193E2TA66F7ETYVMNGFR1PZ', '01M193CSTFYJ1RQWVK6AX2QYP0', '`tsconfig.json` sets `allowImportingTsExtensions`, and `tsc --noEmit` accepts the extensioned specifiers.', 'must', 4, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193E43WVAGWSWYXH8RPZ5QW', '01M193CSTFYJ1RQWVK6AX2QYP0', '`tsc --noEmit` runs from `devDependencies` against the whole codebase and exits zero.', 'must', 5, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193E5G28976MBHQB7RG100V', '01M193CSTFYJ1RQWVK6AX2QYP0', 'A module under `src/` uses a TypeScript construct native type-stripping cannot erase — an `enum`, a parameter property, a `namespace`, or a legacy decorator.', 'must_not', 6, NULL, NULL, '01M191RQKT7NBX0VX40QSB72WC');
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193EQ3NX07VKK43JY05862K', '01M193CV7AYZP0X6SV38W5FT4J', 'Each of `dpm-mcp`, `dpm-guard`, `dpm-publish`, `dpm-import` and `dpm-merge` runs directly with `node` and no loader flag, and performs the responsibility it held at v0.7.0.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193ERD7MFZHTTVE5V5C87S4', '01M193CV7AYZP0X6SV38W5FT4J', 'An executable requires a build artefact to exist before it will run.', 'must_not', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193ESMVJWNYV6M414M6YPK4', '01M193CV7AYZP0X6SV38W5FT4J', 'The test script and every executable''s documented invocation pass no `--loader`, no `--import` and no transpiler flag.', 'must', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193ETX989XQBWP3Q42YARG2', '01M193CV7AYZP0X6SV38W5FT4J', 'Every internal import specifier under `bin/` carries an explicit `.ts` extension.', 'must', 3, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193F4ARJXN6FTVEHGWR5ZPH', '01M193CWMBV0R2TR8M9NEDNBKV', 'The full suite runs under plain `node` on Node 24 and passes, corpus snapshot tests included.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193F5NW1AFT46MCZNJ96YQX', '01M193CWMBV0R2TR8M9NEDNBKV', 'A test requires a loader, a transpiler, or a network connection in order to pass.', 'must_not', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193F6Z5TXMDCD3RFYSEGF28', '01M193CWMBV0R2TR8M9NEDNBKV', 'The package''s test script is `node --test`, and no third-party test runner appears in `devDependencies`.', 'must', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193F87VVRVZWAP1SM30F069', '01M193CWMBV0R2TR8M9NEDNBKV', 'The full suite passes in an environment with no Claude Code installed and no `CLAUDE_`-prefixed environment variables set.', 'must', 3, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193F9KNFCDGK2QSDSPVS94B', '01M193CWMBV0R2TR8M9NEDNBKV', 'A test file is deleted, skipped or quarantined in order to reach a green suite.', 'must_not', 4, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193FQGGJ67KRCZFPN3MXRBC', '01M193CY1QWF6PRDPHJTR1P95S', 'A fresh-clone restore from `.dpm/dpm.sql` reproduces the database, and a subsequent dump is byte-identical to the committed one.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193FRT59R36EMJVSAAJV06F', '01M193CY1QWF6PRDPHJTR1P95S', 'Restore into an empty database and restore into a populated one behave as v0.7.0 defines, with the asymmetry between them preserved.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193FT7VMVH6KCQRCH2VWWHV', '01M193CY1QWF6PRDPHJTR1P95S', 'Read-only server mode refuses every write tool and serves every read tool.', 'must', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193FVGVRG8G9YJN3WRK4YH0', '01M193CY1QWF6PRDPHJTR1P95S', 'A restore silently discards rows that were present in the dump.', 'must_not', 3, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193FX1BZKNJ7JAHF8RX06VP', '01M193CY1QWF6PRDPHJTR1P95S', 'Dumping the same database twice produces byte-identical output, and regenerating the projection twice produces byte-identical output.', 'must', 4, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193FYCMV2DP2EKB26R5MZK2', '01M193CY1QWF6PRDPHJTR1P95S', 'The corpus snapshot tests pass against the ported sources without their fixtures being regenerated.', 'must', 5, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193FZNQC4QV3DAW0N7DKFAH', '01M193CY1QWF6PRDPHJTR1P95S', 'Number allocation over a fixed sequence of creates produces the same numbers as v0.7.0 for the same inputs.', 'must', 6, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193G0YDX509GJFF9ZCNZQ11', '01M193CY1QWF6PRDPHJTR1P95S', 'Dump or projection output varies with wall-clock time, filesystem ordering, or hash-map iteration order.', 'must_not', 7, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193GKDT2XCYZX2BTVK28EFG', '01M193CZBACY1KZJ264E2ZH76G', 'The module sweep reaches every file under `src/` and `bin/` with plain `node` — importing those under `src/` and resolving every specifier named in both — and every import resolves.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193GMS1262AS0G1WJJRN5C4', '01M193CZBACY1KZJ264E2ZH76G', 'The sweep runs as a step separate from the test suite.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193GP3FBRTFPHKQWB3FQT3A', '01M193CZBACY1KZJ264E2ZH76G', 'Introducing a deliberately extension-less internal import makes the module sweep fail.', 'control', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193GQM0AB6H2KSCW4MRT30V', '01M193D0TS9VBQKYHW2PWPFMXX', 'A CI job runs the full `node --test` suite, the `tsc --noEmit` type check and the module sweep on Node 24 under plain `node`, on every push, and the run is observable in the repository''s CI history.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193GRYP8P048ZT249ZAEKNT', '01M193D0TS9VBQKYHW2PWPFMXX', 'A disposable isolated environment is available in CI, and both the clean-install check and the networking-disabled cycle run inside it rather than being asserted by inspection.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194EG89790D48T5NHTDT06V', '01M194E5SEXMD6W90PSM0ATR4J', 'The plugin''s entry object registers the bundled MCP server via `ctx.mcp.transform`, setting a local server entry whose command runs the packaged executable.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194EHHR2D4FSSCXZD7JP62Q', '01M194E5SEXMD6W90PSM0ATR4J', 'In a scratch OpenCode v2 project, the plugin loads and its MCP server reaches connected state.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194EJSQK9PE8Z752TXFK7H4', '01M194E5SEXMD6W90PSM0ATR4J', 'The published package''s manifest declares the plugin entry, and the server command path resolves to an existing file inside the installed package tree.', 'must', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194EM8CWAZRDTC334V3C5DR', '01M194E5SEXMD6W90PSM0ATR4J', 'Installation requires the user to copy a file, hand-edit project configuration, or run a post-install step.', 'must_not', 3, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194ENM43AE2X5FJSC5PMGMW', '01M194E5SEXMD6W90PSM0ATR4J', 'The set of skills registered is computed from a profile selection resolved at registration time.', 'must', 4, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194EPXXEJA3Z3KDNQP2ET4E', '01M194E5SEXMD6W90PSM0ATR4J', 'The plugin entry hardcodes the skill list.', 'must_not', 5, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194ERA2PWF4GNEGZWB900K8', '01M194E5SEXMD6W90PSM0ATR4J', 'The registration transforms close over no session-specific state, so replaying them on reload produces the same registrations.', 'must', 6, NULL, NULL, '01M191S1ZQYSAY12930K9A3HNC');
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194ET0EBF8G8R82VPGT65KH', '01M194E5SEXMD6W90PSM0ATR4J', 'A registration transform writes to the user''s project configuration on disk.', 'must_not', 7, NULL, NULL, '01M191S1ZQYSAY12930K9A3HNC');
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194EV8C53PC9JWDSZC1RM11', '01M194E5SEXMD6W90PSM0ATR4J', '`opencode2 --version` on the contributor''s machine reports a `0.0.0-beta-*` build matching the `beta` dist-tag of `@opencode-ai/plugin`.', 'must', 8, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194FFY5KNSQPR1VFWYC2M3B', '01M194E73NGKXF2ZJYSE0S5GZ3', 'The effective rendered name of MCP-provided tools under v2 — namespacing and character substitution — is established against a running beta host.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194FHDH8GNXYDSVQED2F712', '01M194E73NGKXF2ZJYSE0S5GZ3', 'The established naming is recorded as a written section on this epic before any skill prose is rewritten.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194FJT0H0A3Q3WH8BRQVYRD', '01M194E73NGKXF2ZJYSE0S5GZ3', 'The advertised tool set and every tool schema match v0.7.0''s, compared against a stored snapshot of the tool surface.', 'must', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194FM7Q119W43CC75HS3KB6', '01M194E8W7MJQ0WMEANHJ3YRZQ', 'A registered skill''s supporting files resolve from the package location, so a skill that reads the shared conventions file at startup finds it.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194FNF7HKETPX0Q7PVBG7EE', '01M194E8W7MJQ0WMEANHJ3YRZQ', 'The go/no-go outcome is recorded as a written decision on this epic before any skill prose is rewritten, and where the answer is negative the decision names inlining as the fallback and its cost.', 'must', 1, NULL, NULL, '01M191RY452PMYKB35R7NDD60M');
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194FQMGZ9RX4Y88CD1J97H1', '01M194EA95B25V3M2MCBC35A1J', 'The package''s `dependencies` is empty. `@opencode-ai/plugin` is needed for its types alone, so it sits under `devDependencies` and nothing is fetched at install.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194FRYSWQ0N4AQATAT1G359', '01M194EA95B25V3M2MCBC35A1J', 'A `.node` binary, or a compile step, appears anywhere in the production install tree.', 'must_not', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194FTA9GZZ9N79DT3HDT8TG', '01M194EA95B25V3M2MCBC35A1J', 'A clean install in an environment with no C or C++ toolchain and no Python completes successfully, with no node-gyp invocation in its output.', 'must', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194FVM5MFEJDZWENTZ490Y5', '01M194EA95B25V3M2MCBC35A1J', 'The plugin dependency is pinned to the exact version the `beta` dist-tag resolves to, rather than to the floating tag itself.', 'must', 3, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194FX20305CQQT6QS7CJGPR', '01M194EBJHMAV5E7KCK0PA0GKF', 'In a scratch project, one install produces a connected MCP server whose advertised tool names match the naming recorded in story 2, and a registered sample skill resolves its supporting files from the package location.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194FYDZ24FX4YBSDA97N9SP', '01M194EBJHMAV5E7KCK0PA0GKF', 'The plugin''s registrations survive a host reload without duplication.', 'must', 1, NULL, NULL, '01M191S1ZQYSAY12930K9A3HNC');
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194VE43GK7C7BH8H4MDQ63H', '01M194V4CBNMW9KRVBHS83R3DM', 'The `dpm-spec` skill is registered from the package and runs end-to-end in a scratch project, exercising its gates, its tool calls and the shared conventions file.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194VFCP1G64RJ8WRQS89M1Y', '01M194V4CBNMW9KRVBHS83R3DM', 'The rewrite pattern — ID prefix, tool naming, invocation prose — is recorded as a section on this epic before the batch pass begins.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194VGZ74ESZAEJCEMG2H16T', '01M194V5Q15F8TQR44DPVPJBRY', 'The registration list computed before the transform contains twenty-three entries and every ID is `dpm-` prefixed.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194VJVB8R3KTX3P4454B0Z2', '01M194V5Q15F8TQR44DPVPJBRY', 'All twenty-three skills appear in the host''s skill registry after install, every ID carrying the `dpm-` prefix.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194VM5FRSF9VZ1TWTKP5RSJ', '01M194V5Q15F8TQR44DPVPJBRY', 'Each registered skill''s `location` points into the installed package.', 'must', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194VNQ50TGA8264V5PHA1E0', '01M194V5Q15F8TQR44DPVPJBRY', 'The plugin installs into a throwaway OpenCode project, its MCP server reaches connected state, and all skills appear as advertised.', 'must', 3, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194VQ2QCJ4020HR42JXK3Y7', '01M194V5Q15F8TQR44DPVPJBRY', 'A skill body names a Claude Code mechanism — `mcp__plugin_`, `/dpm:`, `CLAUDE_PLUGIN_ROOT`, or `.claude/`.', 'must_not', 4, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194VRDNAEP9SCDBAH4C0J21', '01M194V5Q15F8TQR44DPVPJBRY', 'A skill body contains a SQL statement — a `SELECT`, `INSERT`, `UPDATE` or `DELETE` paired with `FROM`, `INTO` or `SET`.', 'must_not', 5, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194VSR5JZZR958JRYYF2KDW', '01M194V710KP0J5V188YR3EBDX', 'Every skill body''s invocation prose names the v2 skill-first mechanism rather than a slash-command trigger.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194VV9XC04F7SQ8MKEPWCRG', '01M194V710KP0J5V188YR3EBDX', 'In a scratch project, a user can start each of the twenty-three skills by the documented v2 invocation.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194VWMM11SJTB3Q9SMBGN57', '01M194V89DXC10121AWAN7KZ5N', 'A CI check fails the build when a skill body names `mcp__plugin_`, `/dpm:`, `CLAUDE_PLUGIN_ROOT` or `.claude/`.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194VY2FQEV5RSK2GPFNH5H3', '01M194V89DXC10121AWAN7KZ5N', 'A CI check fails the build when a skill body contains a SQL statement.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194VZDMC55A44927FT1B92W', '01M194V89DXC10121AWAN7KZ5N', 'Introducing a Claude Code mechanism into a skill body makes the CI check fail.', 'control', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194W0TC6HRDEVD355Q2DJAZ', '01M194V9HR3KH3XB66JEG6651N', 'After one install in a scratch project, all twenty-three skills are registered, each resolves its supporting files from the package, each is startable by the documented invocation, and the CI checks pass over every body.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M1951PTC1VWJZVSP9FVCZ4GK', '01M1951C1R30C8CQABYF7YZJ82', 'The guard regenerates the projection, compares it against what is on disk, and exits non-zero on a mismatch.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M1951RD86DGGT8DA7SN9D4ZS', '01M1951C1R30C8CQABYF7YZJ82', 'Each of the four refusal cases produces its own explanation, distinguishable from the other three.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M1951T9CJFNTE8MRR6DQABEP', '01M1951C1R30C8CQABYF7YZJ82', 'Starting the server in a repository with no hook symlink installed emits the missing-symlink warning.', 'must', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M1951VHMJXCBTW9T1QQHJ4ZD', '01M1951C1R30C8CQABYF7YZJ82', 'In a temporary git repository, the guard hook installs at the repository''s hook path and refuses a commit whose projection is stale, with the explanatory output intact.', 'must', 3, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M1951WVTFY7ZSXMQC13N50XD', '01M1951C1R30C8CQABYF7YZJ82', '`git --version` reports 2.9 or above, and a hook installed at `.git/hooks/pre-commit` in a temporary repository fires on commit.', 'must', 4, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M1951Y69R03FNXVQEMMZQ7DB', '01M1951C1R30C8CQABYF7YZJ82', 'The guard writes to the working tree or repairs any discrepancy it finds.', 'must_not', 5, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M1951ZDWW46AVDM0W2HYWW9K', '01M1951DJH04XXS5ZN0Z3GBDSB', 'The filesystem location where OpenCode places a git-installed plugin package is confirmed against a real install and recorded as a section on this epic.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M19520QN2C18CNA5H7Y4V9F0', '01M1951DJH04XXS5ZN0Z3GBDSB', 'The documented symlink instruction, followed in a fresh project, resolves to an existing file.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M195222V3F5N030BXG5G96Z5', '01M1951FE5F4G1PTK9BF5WNW7Q', 'Anything that was per-session scratch keyed by an environment variable uses `ctx.storage` where a database session row is not already the answer.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M19523F9VFN8WFH9F47189DE', '01M1951FE5F4G1PTK9BF5WNW7Q', 'On a first run in a fresh project, the database and the dump are created under `.dpm/` and rewritten on a subsequent publish.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M19524XRETPQRAV06SN1DYN1', '01M1951FE5F4G1PTK9BF5WNW7Q', 'A transient file lands in the project tree.', 'must_not', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M19526A8XJ1WYP8ZFANDN47R', '01M1951GSMQ3JY8MJAX204ZEY0', 'Install, first run, guard symlink, and "when the guard refuses" are rewritten for `opencode2`.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M19527MPE5AZ88PQKQDDBRZY', '01M1951GSMQ3JY8MJAX204ZEY0', 'Every command the README gives runs as written in a fresh project.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M1952916VPEHNVF62ZRPZJT9', '01M1951GSMQ3JY8MJAX204ZEY0', 'The README states that OpenCode v2 is beta and that entrypoints may move under it.', 'must', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M1952AA2WKSFC1BYDMBX56B9', '01M1951GSMQ3JY8MJAX204ZEY0', 'The repository contains a CPM `MIGRATION.md`.', 'must_not', 3, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M1952BP02Z605Y9J2DDTJN2A', '01M1951J6PTV1WPNCCCF58J3TD', 'Skills behave correctly under `ask` and `deny` rules for the `skill` action.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M1952D3979C6V01MTJ0QQAVA', '01M1951J6PTV1WPNCCCF58J3TD', 'The README documents the recommended permission entries.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M1952EHHSB6MCM5HC6WVF27C', '01M1951J6PTV1WPNCCCF58J3TD', 'A skill denied by a `deny` rule for the `skill` action performs its work anyway through another route.', 'must_not', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M1957YVRSJYH47D6Q7T8P9D4', '01M1957QGCTGTTW0VJP7JHDG74', 'The package publishes to npm at version 0.1.0.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M19580542A1BB87XVK0Z4PAN', '01M1957QGCTGTTW0VJP7JHDG74', 'The published tarball contains the plugin entry, all twenty-three skill directories, `shared/`, and the five executables.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M19581F5PNNE5NRYM3WB9AP0', '01M1957QGCTGTTW0VJP7JHDG74', 'The published tarball omits a file a registered skill needs at runtime.', 'must_not', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M19582S6ABCHQ857XN2YRTYV', '01M1957RXJ674PDNMB53CEGBT1', 'Installing the published version into a fresh project by the documented command leaves the MCP server connected and all twenty-three skills advertised, with no further user action.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M1958422X7G47SMQ39TMXG8P', '01M1957RXJ674PDNMB53CEGBT1', 'One skill runs end to end from the published install, in a clean environment, installed by version.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M19585MT85VK08FVW7BECR4C', '01M1957RXJ674PDNMB53CEGBT1', 'The release is verified from the working tree rather than from the downloaded artefact.', 'must_not', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M19586ZSAR67SXCYCPMJ809T', '01M1957TECZSEEFTKG9DNVT7S7', 'A full plan-and-publish cycle completes with networking disabled, making no outbound connection attempt.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M19588P1E29S4HC9CCKXZBW0', '01M1957TECZSEEFTKG9DNVT7S7', 'Persistence uses only files under `.dpm/`: no port is bound and no external service is contacted during a full plan-and-publish cycle.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M1958A0KK1F5NKHD6FV933JV', '01M1957TECZSEEFTKG9DNVT7S7', 'The plugin runs correctly in a project containing no `.claude/` directory and no CPM or dpm marketplace installation.', 'must', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193D76TSTFC2K4HBRG1KHQW', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193D8FDXKAV9EN1ZJ9A7Z1D', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193D9T7S4F5FQVWFKP5VSNE', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193DB47YHMBWCT7A716NYSC', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193DCM1K8BQ3WDJW5D71JEC', 'target');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193DDWRVNYGV95411BYZ2JM', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193DX4V2DM8BE44DGT6WX1Z', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193DYE04PACNNT4K28E2ZH5', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193E01EFGYAC7DQNE00V8SP', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193E1AAYA4JR37J9VCPKPBQ', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193E2TA66F7ETYVMNGFR1PZ', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193E43WVAGWSWYXH8RPZ5QW', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193E5G28976MBHQB7RG100V', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193EQ3NX07VKK43JY05862K', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193ERD7MFZHTTVE5V5C87S4', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193ESMVJWNYV6M414M6YPK4', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193ETX989XQBWP3Q42YARG2', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193F4ARJXN6FTVEHGWR5ZPH', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193F5NW1AFT46MCZNJ96YQX', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193F6Z5TXMDCD3RFYSEGF28', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193F87VVRVZWAP1SM30F069', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193F9KNFCDGK2QSDSPVS94B', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193FQGGJ67KRCZFPN3MXRBC', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193FRT59R36EMJVSAAJV06F', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193FT7VMVH6KCQRCH2VWWHV', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193FVGVRG8G9YJN3WRK4YH0', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193FX1BZKNJ7JAHF8RX06VP', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193FYCMV2DP2EKB26R5MZK2', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193FZNQC4QV3DAW0N7DKFAH', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193G0YDX509GJFF9ZCNZQ11', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193GKDT2XCYZX2BTVK28EFG', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193GMS1262AS0G1WJJRN5C4', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193GP3FBRTFPHKQWB3FQT3A', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193GQM0AB6H2KSCW4MRT30V', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M193GRYP8P048ZT249ZAEKNT', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194EG89790D48T5NHTDT06V', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194EHHR2D4FSSCXZD7JP62Q', 'manual');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194EJSQK9PE8Z752TXFK7H4', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194EM8CWAZRDTC334V3C5DR', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194ENM43AE2X5FJSC5PMGMW', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194EPXXEJA3Z3KDNQP2ET4E', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194ERA2PWF4GNEGZWB900K8', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194ET0EBF8G8R82VPGT65KH', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194EV8C53PC9JWDSZC1RM11', 'manual');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194FFY5KNSQPR1VFWYC2M3B', 'manual');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194FHDH8GNXYDSVQED2F712', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194FJT0H0A3Q3WH8BRQVYRD', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194FM7Q119W43CC75HS3KB6', 'manual');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194FNF7HKETPX0Q7PVBG7EE', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194FQMGZ9RX4Y88CD1J97H1', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194FRYSWQ0N4AQATAT1G359', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194FTA9GZZ9N79DT3HDT8TG', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194FVM5MFEJDZWENTZ490Y5', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194FX20305CQQT6QS7CJGPR', 'manual');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194FYDZ24FX4YBSDA97N9SP', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194VE43GK7C7BH8H4MDQ63H', 'manual');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194VFCP1G64RJ8WRQS89M1Y', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194VGZ74ESZAEJCEMG2H16T', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194VJVB8R3KTX3P4454B0Z2', 'manual');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194VM5FRSF9VZ1TWTKP5RSJ', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194VNQ50TGA8264V5PHA1E0', 'manual');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194VQ2QCJ4020HR42JXK3Y7', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194VRDNAEP9SCDBAH4C0J21', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194VSR5JZZR958JRYYF2KDW', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194VV9XC04F7SQ8MKEPWCRG', 'manual');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194VWMM11SJTB3Q9SMBGN57', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194VY2FQEV5RSK2GPFNH5H3', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194VZDMC55A44927FT1B92W', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M194W0TC6HRDEVD355Q2DJAZ', 'manual');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M1951PTC1VWJZVSP9FVCZ4GK', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M1951RD86DGGT8DA7SN9D4ZS', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M1951T9CJFNTE8MRR6DQABEP', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M1951VHMJXCBTW9T1QQHJ4ZD', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M1951WVTFY7ZSXMQC13N50XD', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M1951Y69R03FNXVQEMMZQ7DB', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M1951ZDWW46AVDM0W2HYWW9K', 'manual');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M19520QN2C18CNA5H7Y4V9F0', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M195222V3F5N030BXG5G96Z5', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M19523F9VFN8WFH9F47189DE', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M19524XRETPQRAV06SN1DYN1', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M19526A8XJ1WYP8ZFANDN47R', 'manual');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M19527MPE5AZ88PQKQDDBRZY', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M1952916VPEHNVF62ZRPZJT9', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M1952AA2WKSFC1BYDMBX56B9', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M1952BP02Z605Y9J2DDTJN2A', 'manual');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M1952D3979C6V01MTJ0QQAVA', 'unit');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M1952EHHSB6MCM5HC6WVF27C', 'manual');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M1957YVRSJYH47D6Q7T8P9D4', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M19580542A1BB87XVK0Z4PAN', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M19581F5PNNE5NRYM3WB9AP0', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M19582S6ABCHQ857XN2YRTYV', 'manual');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M1958422X7G47SMQ39TMXG8P', 'manual');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M19585MT85VK08FVW7BECR4C', 'manual');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M19586ZSAR67SXCYCPMJ809T', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M19588P1E29S4HC9CCKXZBW0', 'integration');
INSERT INTO "story_criterion_approach" ("story_criterion_id", "tag") VALUES ('01M1958A0KK1F5NKHD6FV933JV', 'integration');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M196EKMCSBATV86ZBRERN9R7', 'observation:codebase-discoveries', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M196EQZC9ZD32E6VJAS2TRRZ', 'observation:complexity-underestimates', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19BJFTXHC9PTSCD2THNXY3F', 'observation:complexity-underestimates', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19BJFTXHC9PTSCD2THNXY3F', 'observation:patterns-worth-reusing', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19BK4937ESM8E8TQ6T88EZS', 'observation:codebase-discoveries', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19BK4937ESM8E8TQ6T88EZS', 'observation:testing-gaps', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19CFH1YN3E20748372GN2TN', 'observation:patterns-worth-reusing', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19CFH1YN3E20748372GN2TN', 'observation:testing-gaps', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19ENVMGEB1EEVRZ3FGNA32Y', 'observation:criteria-gaps', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19EZQKD9RBKZ3PDHAJZM357', 'observation:testing-gaps', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19FJ1V28GRJ2KH1M6MVMY5R', 'observation:patterns-worth-reusing', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19GV7Q1P63DBMFP71K1SC5G', 'observation:patterns-worth-reusing', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19GV7Q1P63DBMFP71K1SC5G', 'observation:testing-gaps', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19M93YZTA8XT2H3GRZ92FQ9', 'observation:codebase-discoveries', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19M93YZTA8XT2H3GRZ92FQ9', 'observation:testing-gaps', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19M9RBM22VKHVVN0WH3551N', 'observation:codebase-discoveries', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19M9RBM22VKHVVN0WH3551N', 'observation:patterns-worth-reusing', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19MRYF83D901P55M6BE2WCT', 'observation:patterns-worth-reusing', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19MRYF83D901P55M6BE2WCT', 'observation:testing-gaps', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19NF6TMZWAQGFK9KC1FBACQ', 'observation:scope-surprises', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19NF6TMZWAQGFK9KC1FBACQ', 'observation:testing-gaps', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19NX65EB4CAT11ZM65WMVJA', 'observation:codebase-discoveries', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19NX65EB4CAT11ZM65WMVJA', 'observation:criteria-gaps', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19PG05589PR72WGVY9CC2RY', 'observation:codebase-discoveries', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19PG05589PR72WGVY9CC2RY', 'observation:testing-gaps', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19SFYZD8WN9WFTCF8BKK1K8', 'observation:complexity-underestimates', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19SGCN380AZP3N5VK1AVYTE', 'observation:codebase-discoveries', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19VSVSXYWDGGVXPD4SWP9YX', 'observation:scope-surprises', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19VT4A23CHQTSBACRXG8KQZ', 'observation:patterns-worth-reusing', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19WXKMW56XWN8EWFEV2JXRT', 'observation:criteria-gaps', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19X968MX1P6AVTK4J73YQEC', 'observation:patterns-worth-reusing', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19XN46BYP1KJSWEK5EE20B5', 'observation:complexity-underestimates', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19Z0XXBFFZA4S7MECMTXQTC', 'observation:codebase-discoveries', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M19Z0XXBFFZA4S7MECMTXQTC', 'observation:testing-gaps', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M1A01FWXJF076P74V5JK4E7C', 'observation:criteria-gaps', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M1A1GF43BMAS62WJAZK2PZ26', 'observation:codebase-discoveries', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M1A2N7F530TKPZ7593WDND5B', 'observation:patterns-worth-reusing', 'observation');
INSERT INTO "observation_category" ("observation_id", "taxonomy_id", "taxonomy_domain") VALUES ('01M1A2N7F530TKPZ7593WDND5B', 'observation:testing-gaps', 'observation');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19HFSJC3XVKSDPAB80QHQTB', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M19367X8Q1XF3043C63VQ4ZR', 'codebase-discoveries', 'applied', 'tests/support/skills.js dies at load because it reads .claude-plugin/plugin.json in a module-level constant. Stories 1 and 3 both work near the manifest it was reaching for, so exploration starts by finding every module that reads a manifest at load rather than in a function — those decide whether a suite can start at all, and one of them hides however many assertions it holds.');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19HFZH6P023CFWRXGACC4ZW', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M19367X8Q1XF3043C63VQ4ZR', 'testing-gaps', 'applied', 'Every textual sweep over import statements asserts something subtly different after a change to what an import means. This epic adds the project''s first runtime dependency, @opencode-ai/plugin, and unsanctionedDependencies, auditImports and the module sweep''s bare-specifier rule all currently forbid exactly that. Story 4''s work is deciding which narrow and which stay; the lesson says fix the reading rather than the source, and make each caller assert the new exclusion against literal strings so the walk''s silence is never the only evidence.');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19HG4YZQC6M4EMCWYRTJZSP', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M19367X8Q1XF3043C63VQ4ZR', 'testing-gaps', 'applied', 'A path resolving out of the checkout produces checks that pass while asserting about a directory that is nobody''s. ENVR5 asks for a scratch OpenCode project to register into, which is outside the checkout by construction, so any check about it anchors on evidence that project produces — a server reaching connected, skills appearing in the host''s registry — rather than on a path this repository computes.');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19HGAGQV0MDJ7H9PFAY60C0', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M19367X8Q1XF3043C63VQ4ZR', 'patterns-worth-reusing', 'applied', 'Every claimed absence is paired with something that would catch its presence. Story 4''s ENVX1 clause — no node-gyp, no C toolchain, no Python during a clean install — is an absence, and the disposable isolated environment epic 01-01 story 7 built is exactly its intended consumer. This story runs the check inside that job rather than asserting it by inspection, which is what ENVR12 was captured for.');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19HGGPM9C2JQAHB9ES9YH5J', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M19367X8Q1XF3043C63VQ4ZR', 'complexity-underestimates', 'not_applicable', 'The nvm-versus-.nvmrc lesson and the SQLite row-typing lesson both belong to a bulk conversion of a hundred modules. This epic writes one small plugin entry against a typed SDK, so neither the version-manager trap nor the untyped-row decision arises. Re-judged next run rather than dismissed.');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19PSY00HX53ETHY2HJV6XD4', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M193697Y6ZF3Q1KGVYPW5G15', 'codebase-discoveries', 'applied', 'tests/support/skills.js dies at import because CALLABLE reads .claude-plugin/plugin.json. That manifest is what this epic makes unnecessary, and 44 test files depend on the prefix it builds. Cut the load-time coupling and rebuild CALLABLE from the tool names the plugin actually registers, before any skill body is edited — otherwise the batch pass lands against a suite that cannot report on it.');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19PT0V78GPQXSDSG85A7RE1', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M193697Y6ZF3Q1KGVYPW5G15', 'patterns-worth-reusing', 'applied', 'A rename''s blast radius is every predicate that filters, not the literal string. mcp__plugin_dpm_dpm__X to dpm_X across 23 bodies is that rename. Grep for the pattern-derived corpora — anything matching on the old prefix shape — separately from the name itself, and keep the deepEqual-against-the-expected-set assertions, which have twice been the only thing between a rename and a sweep reporting clean on nothing.');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19PT3TM28QGX7QWZR6WSYPA', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M193697Y6ZF3Q1KGVYPW5G15', 'criteria-gaps', 'applied', 'A criterion naming a mechanism rather than a property can be unsatisfiable or too narrow without being wrong about what matters. Story 2 and story 4 enumerate four literal strings — mcp__plugin_, /dpm:, CLAUDE_PLUGIN_ROOT, .claude/ — so a Claude Code mechanism outside that list passes. Check each is a property before building against it, and amend with a citation where it is not.');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19PT5NVBQJ9JXJR746TR37C', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M193697Y6ZF3Q1KGVYPW5G15', 'testing-gaps', 'applied', 'Every claimed absence is paired with something that would catch its presence. Story 4''s third criterion is already written as a control — a planted Claude Code mechanism must make the build fail — so it is driven rather than asserted, and the same shape is applied to the SQL rejection and to the invocation-prose sweep.');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19PTD5FYCRMWW6VME4VP7G2', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M193697Y6ZF3Q1KGVYPW5G15', 'smooth-deliveries', 'applied', 'Find the oracle before writing a test that compares the port to itself. The released v0.7.0 is installed at ~/.claude/plugins/cache/ninthspace-marketplace/dpm/0.7.0/skills/, so its 23 skill bodies are on disk. The rewrite is diffed against them rather than asserted, which makes "only host mechanics changed" a measurement instead of a claim.');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19PTGYCKVFPAZQEBRQGPC8Z', '01M19PKK0012R8QQZ86813ATB5', 'retro', '01M193697Y6ZF3Q1KGVYPW5G15', 'testing-gaps', 'applied', 'A duplicated reading fails silently toward a false report. tests/support/skills.js is the shared reader for skill bodies and 44 files rest on it, so every new check this epic adds goes through it rather than beside it, and any private regex over a skill body found along the way is migrated in the same change.');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19PTKG9PQW3W3DN3GB5SQSV', '01M19PKK0012R8QQZ86813ATB5', 'retro', '01M193697Y6ZF3Q1KGVYPW5G15', 'codebase-discoveries', 'applied', 'Ask the host what it holds, and do not believe its CLI on the first answer. Stories 1, 2, 3 and 5 each end in a scratch-project run; the probe plugin that dumps skill.transform(draft => draft.list()) goes in first, CLI listings are run twice before being believed, and a disagreement sends me to the host log before the code.');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19PTNHS7NQYWDYQ3P4YCT9M', '01M19PKK0012R8QQZ86813ATB5', 'retro', '01M193697Y6ZF3Q1KGVYPW5G15', 'criteria-gaps', 'applied', 'After changing something, ask what else quotes it. tool-naming.test.js deliberately asserts the skill prose still names mcp__plugin_dpm_dpm__, as the marker that this epic had not yet run. The batch pass makes that assertion fail on purpose, so it is moved with its reasoning intact rather than deleted, and the same question is asked of every coverage binding this epic touches.');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19PTYYMXA4BY6MK5CQ9D505', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M193697Y6ZF3Q1KGVYPW5G15', 'complexity-underestimates', 'not_applicable', 'Five of retro 01''s observations bear on the TypeScript conversion and the environment rather than on skill prose, and are set aside as a group so the non-selection is a decision rather than an omission: .nvmrc and environmental criteria discharged by a repository artefact; the Record<string, any> row-type decision; import type being loud to a regex and invisible at runtime; paths resolving out of the checkout, which is subsumed here by the skills.js coupling already dispositioned applied; and the container CI environment, whose lessons are carried by the absence-plus-control entry above. None routes to a step this epic performs.');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19PV1K4TXX28YY06654QTZ8', '01M19PKK0012R8QQZ86813ATB5', 'retro', '01M193697Y6ZF3Q1KGVYPW5G15', 'patterns-worth-reusing', 'applied', 'An absence is only an observation when something was watching. Every manual scratch run in this epic states the evidence that the event happened — a count of loading-plugin lines in the log, a planted breach, a control write — beside its result, after a reload check in the last epic passed by measuring a registry nothing had disturbed.');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19Y4HJE8DDT0862XQZH0TQ7', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M1936AGMZ3DD6GJZM5ATYYS7', 'Testing Gaps', 'applied', 'Stories 1 and 2 are entirely about paths that resolve outside the checkout — OpenCode''s hook path, the package cache directory, the symlink target. Each check anchors on evidence read at the target rather than on a constructed path, and an absent hook or absent cache is reported as a diagnostic rather than skipped.');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19Y4KRG6DWCXD53G4KHBMVJ', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M1936AGMZ3DD6GJZM5ATYYS7', 'Patterns Worth Reusing', 'applied', 'Path containment is relative(a, b).startsWith(''..'') and never a substring test — the exact bug this observation caught, and story 2''s symlink target is the same question in the same shape. Every claimed absence in this epic gets a control that would catch its presence.');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19Y4PFZNWTRM1XNPBWT3BWH', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M1936AGMZ3DD6GJZM5ATYYS7', 'Criteria Gaps', 'applied', 'This epic''s criteria name v2 mechanisms written before the host was opened — a hook path, a plugin storage API, a permission model. Each mechanism is checked to exist before anything is built against it; where one does not, the criterion is amended to the checkable and equally strong property with the citation, not written around.');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19Y4S0GTEXMWTDS0DZY8SN4', '01M19PKK0012R8QQZ86813ATB5', 'retro', '01M1936AGMZ3DD6GJZM5ATYYS7', '', 'applied', 'Stories 3 and 5 are questions about a running host, so a probe leads rather than a reading of the SDK types. Bounded: the invocation walk cost seven attempts last epic, so this run stops and reports what the attempts established rather than repeating them.');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19Y4TR1N9GWBH54P0EWJZD8', '01M19PKK0012R8QQZ86813ATB5', 'retro', '01M1936AGMZ3DD6GJZM5ATYYS7', '', 'applied', 'v0.7.0 is installed on this machine and is the oracle for what the guard did and for what the README may claim. Every manual check in this epic states the evidence that the event under test actually occurred, beside the result.');
INSERT INTO "retro_application" ("id", "retro_id", "retro_kind", "applied_to_id", "theme", "disposition", "note") VALUES ('01M19Y4WMZKT7KDGP5VTH3SKJH', '01M19PKK0012R8QQZ86813ATB5', 'retro', '01M1936AGMZ3DD6GJZM5ATYYS7', '', 'applied', 'Story 4''s lens. A README restating a version, a path or a tool count that the code already computes is a second reading that goes stale silently — point at the source, and before asserting over an artefact grep for who else reads it.');
INSERT INTO "session" ("id", "skill", "phase", "state", "superseded_by", "created_at", "updated_at") VALUES ('8afd89dc-8e1d-4c30-959b-48255fc1b4f9', 'dpm:do', '01-04 complete — all five stories done, coverage rolled up, synthesis recorded; awaiting the next epic', '{"loop":"One continuous run of every story in epic 01-04. Stops only at the gates dpm:do names; a finished task, story, verification or commit is not one of them.","epic":"01M1936AGMZ3DD6GJZM5ATYYS7 (01-04) — complete","test_command":"npm test (node --test), plus npx tsc --noEmit, npm run modules, npm run skills","framework":"none (plain node, no Laravel)","refactoring":{"story1":"ran — PUBLISH_INVOCATION extracted so the refusal phrase is matched rather than the id","story2":"skipped — no implementation code touched beyond the README instruction","story3":"ran — the environment classification table extracted alongside the sweep","story4":"ran — tests/support/package-cache.js extracted from package-cache.test.js when readme-v2.test.js needed the same fixture; follow() gained a shell parameter","story5":"skipped — the story''s code change was documentation plus one new test file"},"suite":"1080 tests, 1079 pass. The one failure is plugin.test.js reporting the unstaged MIGRATION.md deletion, by the assertion story 4 task 2 added for exactly that; verified against a copied GIT_INDEX_FILE that it clears on the next git add -A.","open":["a retro is due on epic 01-03 (7 ungrouped observations)","four unverified 01-03 coverage rows: 01M194YPV1N00588YDCT47GW1Q, 01M194Z3N2KEG60Z6PGTF85C4S, 01M194ZAEN8K3FXHNJDHTVQ526, 01M194ZHEXK4DE85A52DTJS9J8","FR2 and FR3 unclaimed","/dpm:templates, /dpm:do, /dpm:epics still in JSDoc in src/tools/cross/template.ts, src/coverage/warrant.ts, src/preview/example.ts","DATABASE is a relative path — the cwd OpenCode gives a spawned MCP server decides which repository .dpm/ lands in","upstream dpm 0.7.2 narration changes (0c1d501, 265ec67) deferred"]}', NULL, '2026-08-30T11:09:12.357Z', '2026-08-30T19:38:53.288Z');
INSERT INTO "session" ("id", "skill", "phase", "state", "superseded_by", "created_at", "updated_at") VALUES ('ca9aa49b-4915-4d0f-b169-382455f210c6', 'dpm:epics', 'complete', '{"spec_id":"01M191BE7MHM077FE9YM09B2ZK","epics_written":["1","2","3","4","5"],"epics_total":5,"gap_check":"clean","approved":true,"known_uncovered_by_decision":["FR11","FR12","FR14","FR15","FR16","FR17"],"board_tool":"dropped-by-user-no-record"}', NULL, '2026-08-30T10:17:19.373Z', '2026-08-30T11:05:51.290Z');
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
INSERT INTO "number_sequence" ("kind", "parent_id", "next_value") VALUES ('coverage_matrix', '01M19366AF5ZVHTYQEY3DVS515', 1);
INSERT INTO "number_sequence" ("kind", "parent_id", "next_value") VALUES ('coverage_matrix', '01M19367X8Q1XF3043C63VQ4ZR', 1);
INSERT INTO "number_sequence" ("kind", "parent_id", "next_value") VALUES ('coverage_matrix', '01M193697Y6ZF3Q1KGVYPW5G15', 1);
INSERT INTO "number_sequence" ("kind", "parent_id", "next_value") VALUES ('coverage_matrix', '01M1936AGMZ3DD6GJZM5ATYYS7', 1);
INSERT INTO "number_sequence" ("kind", "parent_id", "next_value") VALUES ('coverage_matrix', '01M1936BS9145G8158CBKDD07S', 1);
INSERT INTO "number_sequence" ("kind", "parent_id", "next_value") VALUES ('discussion', NULL, 1);
INSERT INTO "number_sequence" ("kind", "parent_id", "next_value") VALUES ('epic', '01M191BE7MHM077FE9YM09B2ZK', 5);
INSERT INTO "number_sequence" ("kind", "parent_id", "next_value") VALUES ('library', NULL, 1);
INSERT INTO "number_sequence" ("kind", "parent_id", "next_value") VALUES ('retro', NULL, 2);
INSERT INTO "number_sequence" ("kind", "parent_id", "next_value") VALUES ('spec', NULL, 1);
INSERT INTO "dependency_kind" ("kind", "gates_work", "position", "retired_at") VALUES ('blocks', 1, 1, NULL);
INSERT INTO "dependency_kind" ("kind", "gates_work", "position", "retired_at") VALUES ('builds_on', 0, 2, NULL);
INSERT INTO "dependency_kind" ("kind", "gates_work", "position", "retired_at") VALUES ('constrains', 0, 3, NULL);
INSERT INTO "dependency_kind" ("kind", "gates_work", "position", "retired_at") VALUES ('supersedes', 0, 4, NULL);
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M191CCB4641A87GRHJ7YBD4J', 'builds_on', '01M191BE7MHM077FE9YM09B2ZK', NULL, '01M1915SM9WVHJY2SYBZ04M3CR', NULL);
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M1936T66SRNWV3VVWTEQ2E5E', 'blocks', '01M19366AF5ZVHTYQEY3DVS515', NULL, '01M19367X8Q1XF3043C63VQ4ZR', NULL);
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M1936VHQCJP3D4S075X70FZJ', 'blocks', '01M19367X8Q1XF3043C63VQ4ZR', NULL, '01M193697Y6ZF3Q1KGVYPW5G15', NULL);
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M1936X08XJARZYZT0P6RGFDN', 'blocks', '01M19367X8Q1XF3043C63VQ4ZR', NULL, '01M1936AGMZ3DD6GJZM5ATYYS7', NULL);
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M1936YG9BTVBDX0W04E82KW9', 'blocks', '01M193697Y6ZF3Q1KGVYPW5G15', NULL, '01M1936BS9145G8158CBKDD07S', NULL);
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M1936ZV3E2Y5JAW051F18RD8', 'blocks', '01M1936AGMZ3DD6GJZM5ATYYS7', NULL, '01M1936BS9145G8158CBKDD07S', NULL);
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M193H3FZVMCPHFH6XPEY16EC', 'blocks', NULL, '01M193CRHRQC3Z4E42TM3XKPGT', NULL, '01M193CSTFYJ1RQWVK6AX2QYP0');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M193H4X3A5JJ7TWEJ7060XWG', 'blocks', NULL, '01M193CRHRQC3Z4E42TM3XKPGT', NULL, '01M193CV7AYZP0X6SV38W5FT4J');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M193H648SKKBZH7G87E75MWH', 'blocks', NULL, '01M193CSTFYJ1RQWVK6AX2QYP0', NULL, '01M193CWMBV0R2TR8M9NEDNBKV');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M193H7FQSQZZK0689A55M0AW', 'blocks', NULL, '01M193CV7AYZP0X6SV38W5FT4J', NULL, '01M193CWMBV0R2TR8M9NEDNBKV');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M193H8RKYV5M069NJK3R206G', 'blocks', NULL, '01M193CSTFYJ1RQWVK6AX2QYP0', NULL, '01M193CZBACY1KZJ264E2ZH76G');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M193HA0WVYAT2KPJBT12YDCA', 'blocks', NULL, '01M193CV7AYZP0X6SV38W5FT4J', NULL, '01M193CZBACY1KZJ264E2ZH76G');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M193HBBF6M00A14GTDTR8VAX', 'blocks', NULL, '01M193CWMBV0R2TR8M9NEDNBKV', NULL, '01M193CY1QWF6PRDPHJTR1P95S');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M193HCPQ2DTA4VVAQVHVKKGF', 'blocks', NULL, '01M193CWMBV0R2TR8M9NEDNBKV', NULL, '01M193D0TS9VBQKYHW2PWPFMXX');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M193HE0DZBRAJZW9WYWA3SFY', 'blocks', NULL, '01M193CZBACY1KZJ264E2ZH76G', NULL, '01M193D0TS9VBQKYHW2PWPFMXX');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M194GPEW0XXG6EKZSNS2520F', 'blocks', NULL, '01M194E5SEXMD6W90PSM0ATR4J', NULL, '01M194E73NGKXF2ZJYSE0S5GZ3');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M194GQWNJ5GG3BMCJSF3R3RC', 'blocks', NULL, '01M194E5SEXMD6W90PSM0ATR4J', NULL, '01M194E8W7MJQ0WMEANHJ3YRZQ');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M194GT2GR5DG7FDQHNM3YQ5S', 'blocks', NULL, '01M194E5SEXMD6W90PSM0ATR4J', NULL, '01M194EA95B25V3M2MCBC35A1J');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M194GVEQ33S81JJ7SREMSGN8', 'blocks', NULL, '01M194E5SEXMD6W90PSM0ATR4J', NULL, '01M194EBJHMAV5E7KCK0PA0GKF');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M194GWSFJ406D9PA3Z0XSH5C', 'blocks', NULL, '01M194E73NGKXF2ZJYSE0S5GZ3', NULL, '01M194EBJHMAV5E7KCK0PA0GKF');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M194GY6AQMMQ7FN7MDYF4F9A', 'blocks', NULL, '01M194E8W7MJQ0WMEANHJ3YRZQ', NULL, '01M194EBJHMAV5E7KCK0PA0GKF');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M194GZP6KXC1RPAE57ZGTMEW', 'blocks', NULL, '01M194EA95B25V3M2MCBC35A1J', NULL, '01M194EBJHMAV5E7KCK0PA0GKF');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M194WW0EHAWH5AA5AKZ088X0', 'blocks', NULL, '01M194V4CBNMW9KRVBHS83R3DM', NULL, '01M194V5Q15F8TQR44DPVPJBRY');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M194WX99A8RPZ8KR9RC50E13', 'blocks', NULL, '01M194V5Q15F8TQR44DPVPJBRY', NULL, '01M194V710KP0J5V188YR3EBDX');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M194WZ0A6R0VNPS9TW2QWCFY', 'blocks', NULL, '01M194V5Q15F8TQR44DPVPJBRY', NULL, '01M194V89DXC10121AWAN7KZ5N');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M194X0K687ZTA77FXZWM9CEG', 'blocks', NULL, '01M194V4CBNMW9KRVBHS83R3DM', NULL, '01M194V9HR3KH3XB66JEG6651N');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M194X20711KKD9D6SA13NDZD', 'blocks', NULL, '01M194V5Q15F8TQR44DPVPJBRY', NULL, '01M194V9HR3KH3XB66JEG6651N');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M194X3AG7NZDQ36TESB9RQW1', 'blocks', NULL, '01M194V710KP0J5V188YR3EBDX', NULL, '01M194V9HR3KH3XB66JEG6651N');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M194X4N479B0QR2A9DMPTEEK', 'blocks', NULL, '01M194V89DXC10121AWAN7KZ5N', NULL, '01M194V9HR3KH3XB66JEG6651N');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M1953FN2W5KC13BX5PJWYXFW', 'blocks', NULL, '01M1951C1R30C8CQABYF7YZJ82', NULL, '01M1951GSMQ3JY8MJAX204ZEY0');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M1953HJPCFS80EQ5A02A9VPA', 'blocks', NULL, '01M1951DJH04XXS5ZN0Z3GBDSB', NULL, '01M1951GSMQ3JY8MJAX204ZEY0');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M1953K58T2MWE4M65REF43G7', 'blocks', NULL, '01M1951J6PTV1WPNCCCF58J3TD', NULL, '01M1951GSMQ3JY8MJAX204ZEY0');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M1958V8Q7M4K72FCZVPRA42X', 'blocks', NULL, '01M1957QGCTGTTW0VJP7JHDG74', NULL, '01M1957RXJ674PDNMB53CEGBT1');
INSERT INTO "dependency" ("id", "kind", "source_document_id", "source_story_id", "target_document_id", "target_story_id") VALUES ('01M1958WSAW18D93MFSCDNRTTE', 'blocks', NULL, '01M1957QGCTGTTW0VJP7JHDG74', NULL, '01M1957TECZSEEFTKG9DNVT7S7');
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M196EKMCSBATV86ZBRERN9R7', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M193CRHRQC3Z4E42TM3XKPGT', NULL, NULL, 0, '`tests/support/skills.js` cannot be imported in this fork at all: its module-level `CALLABLE` constant reads `.claude-plugin/plugin.json`, which the vendoring step deliberately dropped. Every suite importing it therefore dies at load with an ENOENT before running a single assertion, rather than failing an assertion that names the cause. The refactoring pass found this by trying to reuse `skillNames()` and had to revert.

This shapes Story 4. "Restore the inherited test suite green" has two classes of failure in it, not one: assertions that are wrong about the fork, and modules that will not load in the fork. The second class hides the first — a suite that dies at import contributes one opaque failure standing in for however many real assertions it holds, so the 50 remaining failures are a lower bound on the work rather than a count of it. Cutting the load-time couplings first is what makes the rest of the count mean anything.', 'A module that dies at import contributes one opaque failure standing in for every assertion it holds, so a failure count taken before the load-time couplings are cut is a lower bound rather than a measurement. Sequence the work accordingly next time: cut what will not load, then count.', NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M196EQZC9ZD32E6VJAS2TRRZ', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M193CRHRQC3Z4E42TM3XKPGT', NULL, NULL, 1, 'Raising the floor to 24 was one constant; getting the machine to 24 was not. `nvm install 24` and `nvm alias default 24` both succeeded and `node --version` went on reporting 22.18.0, because nvm''s auto-activation re-selects whatever Node is already on `PATH` rather than the default alias — so every shell descending from an already-pinned session keeps the old version, and the alias is only consulted where nothing was pinned. What actually satisfied the criterion was committing `.nvmrc`, which the contributor''s shell already acts on when entering the directory.

Worth carrying forward because the criterion is written as "`node --version` on the contributor''s machine reports 24.0.0 or above", and the obvious reading of that — install the version — leaves it false. The repository artefact is the mechanism, not the install.', 'An environmental criterion written as an observation about the contributor''s machine is discharged by the repository artefact that makes it true on every machine, not by an install performed once on one. Reach for the committed mechanism — `.nvmrc`, an engines field — before the version manager.', NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19BJFTXHC9PTSCD2THNXY3F', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M193CSTFYJ1RQWVK6AX2QYP0', NULL, NULL, 2, 'The conversion''s hard part was not the syntax but the *type* for an untyped SQLite row, and getting it wrong once cost a full pass over the projection. TypeScript''s rule — an index signature does not supply a target type''s *required* named properties — was established empirically in a scratch file rather than guessed at, and it invalidated the first approach (small named row shapes like `{id, number}` passed between modules), because `Record<string, any>` is not assignable to them. The settled answer is one honest type, `Record<string, any>`, declared once per layer with a written rationale: `Row` in `projection/naming.ts`, `Args`/`Row` in `tools/convention.ts`, `ViolationRow` in `integrity/register.ts`. The alternative, `unknown`, was rejected in writing because it puts several hundred identical casts at call sites, none of which check anything. Two consequences worth carrying forward: object spread **drops** an index signature, so `.map((r): Row => ({...r, x}))` needs the return annotation or the nested shape silently loses every column it came in with; and shared types were pushed *downwards* into the module with no imports and re-exported, rather than sideways, so no type-only import points back up a dependency edge.', 'The expensive decision in a JS-to-TS port is the type given to an untyped row, and it is worth settling empirically in a scratch file before the first module is converted rather than discovering it a hundred files in. One honest `Record<string, any>` per layer with a written rationale beat both small named shapes and `unknown`; the two traps — spread dropping an index signature, and type-only imports pointing back up a dependency edge — are worth a coding-standards entry.', NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19BK4937ESM8E8TQ6T88EZS', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M193CSTFYJ1RQWVK6AX2QYP0', NULL, NULL, 3, 'A type-only import is invisible at runtime and highly visible to a textual sweep, and that mismatch broke a real invariant test two suites deep. `server.test.js` and `publish-cli.test.js` each walk the static import graph to prove no executable reaches `node:sqlite` before the Node-floor check runs — a genuine NFR2 guarantee, since ES imports evaluate before any statement in the file. Adding `import type { DatabaseSync } from ''node:sqlite''` to `src/db/capability.ts` is erased by both Node''s type-stripper and `tsc` under `verbatimModuleSyntax`, so the guarantee held; the regex did not know that, and reported a crash that cannot happen. The right fix was the sweep, not the source. Two things made it safe: the exclusion lookahead is narrow in both directions (`import { type Row, insert }` still loads the module for `insert`; `import type from ''./x''` is a value default import bound to the name `type`), and each suite now asserts the exclusion directly against three literal strings rather than trusting the walk''s silence. The generalisable lesson: after a TypeScript port, every textual sweep over import statements is asserting something subtly different from what it was written to assert.', 'After a TypeScript port every textual sweep over import statements is asserting something subtly different from what it was written to assert, because `import type` is loud to a regex and invisible at runtime. Audit the sweeps as part of the conversion, fix the reading rather than the source, and have each caller assert the exclusion against literal strings so the walk''s silence is never the only evidence.', NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19CFH1YN3E20748372GN2TN', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M193CV7AYZP0X6SV38W5FT4J', NULL, NULL, 4, 'A rename''s blast radius is not the string that names the file — it is every predicate that *filters* by extension, and only one of those is caught by rewriting the string. The narrow rewrite moved 54 occurrences of `dpm-X.js` across 26 files cleanly, and the suite then went from 50 to 55 failures. Four were escaped regexes (`/dpm-import\.js$/`) the pattern could not see, and the fifth was the dangerous one: `readdirSync(bin).filter((name) => name.endsWith(''.js''))` in two suites, which silently became an empty enumeration. Both were saved by an assertion their authors had written for exactly this — `deepEqual(binaries, [the five])` with the message "the set of binaries moved — the sweep below is enumerating something else now". Without that line the two suites would have swept nothing and reported clean, which is the false pass this project keeps rediscovering. The generalisable rule: when renaming by extension, grep for `endsWith`, `filter` and escaped `\.js` separately from the literal name, and treat any sweep whose corpus is derived from an extension as part of the rename.', 'A rename by extension has a blast radius the literal string does not describe: every predicate that filters on that extension is part of the rename, and the ones that go quiet are more dangerous than the ones that break. Grep for `endsWith`, `filter` and escaped `\.js` separately from the name, and keep writing the assertion that names the corpus — twice now, a `deepEqual` against the expected set is the only thing standing between a rename and a sweep that reports clean on nothing.', NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19ENVMGEB1EEVRZ3FGNA32Y', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M193CZBACY1KZJ264E2ZH76G', NULL, NULL, 7, 'The criterion said the sweep "imports every file under `src/` and `bin/`", and `bin/` cannot be imported: `dpm-guard.ts` ends in `process.exit(run(...))` and `dpm-mcp.ts` in `await main()`, both at module top level, so importing them runs the guard against the repository and starts a server waiting on stdin. The criterion was amended to say what is actually checkable and equally strong — resolve every specifier in both roots, import the modules under `src/` — rather than the sweep being written to match wording it could not satisfy. The distinction matters because resolution is what a wrong extension breaks, so nothing was given up: the planted controls catch an extension-less import, a stale `.js` pointing at a `.ts`, and a bare specifier, all three in `bin/` as readily as in `src/`.', 'A criterion that names a mechanism rather than a property can be unsatisfiable without being wrong about what matters — "imports every file" was unachievable for `bin/`, while "resolves every specifier" gives up nothing a wrong extension could hide. Amend the criterion to the checkable and equally strong form, with the citation, rather than writing the implementation to match wording it cannot meet; and prefer stating criteria as properties so the question does not arise.', NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19EZQKD9RBKZ3PDHAJZM357', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M193CWMBV0R2TR8M9NEDNBKV', NULL, NULL, 5, 'Every one of the 50 inherited failures traced to a path that resolved out of the checkout. At v0.7.0 the plugin sat inside the marketplace repository, so `join(dirname, ''..'', ''..'')` reached a sibling; in a standalone fork it reaches the developer''s home directory. The damaging cases were not the ones that crashed but the ones that passed: `reference-environment.test.js` checked that CI did not exist in a directory that was never this project''s, and `corpus.test.js` compared dpm''s skills against an unrelated `~/Work/git/cpm` and reported a missing conversion. The fix in each case was to anchor on evidence rather than on a path — a plugin manifest naming itself and its version, a recorded list of what the source release shipped — and to report an absent neighbour by diagnostic rather than skipping. Twice during this story a control I wrote fired and was right: the CPM drift detector found that the sibling was a genuine but abandoned 1.0.0, and the `CLAUDE_` scrub control fired in exactly the environment its criterion describes, where there is nothing to scrub. The second was a bug in the control, not the code — a control that demands the hazard be present fails on the machine where the hazard is absent.', 'Extracting a component from a monorepo relocates every relative path that pointed outward, and the tests that go on passing are the ones to hunt: they now assert about a directory that is nobody''s. Anchor a check on evidence — a manifest naming itself and its version, a recorded list of what the source shipped — rather than on a path, report an absent neighbour by diagnostic rather than by skipping, and write controls that tolerate the hazard being absent, since a control demanding the hazard fails on the clean machine.', NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19FJ1V28GRJ2KH1M6MVMY5R', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M193CY1QWF6PRDPHJTR1P95S', NULL, NULL, 6, 'The inherited suite already covered four of this story''s eight criteria properly, and every one of those tests compares the port against itself — they would all keep passing if the conversion had changed the dump format, the sort order or the allocator, provided it changed them consistently, which is the shape a 100-module rename actually takes. What was missing was an oracle written by v0.7.0, and the repository turned out to hold one: `.dpm/dpm.sql` at commit 1123bc7 was produced by v0.7.0''s dumper and allocator before a line of the port existed. Frozen as `tests/fixtures/v070-dump.sql`, it gave the strongest result of the epic — the ported restorer reads 296,061 bytes of v0.7.0 output and the ported dumper writes them back unchanged, and replaying v0.7.0''s 21 creates in v0.7.0''s order allocates v0.7.0''s numbers. The lesson worth carrying: when porting, look for an artefact the old code left behind before writing a test that can only compare the new code to itself. Also worth noting for the next story that touches this area: `start()` does not restore — the restore is a step in the server''s bring-up — and a test that calls `start()` on a clone gets a seeded database whose empty content tables look exactly like a broken restore.', 'A port verified only against itself passes any change made consistently, which is the shape a large rename actually takes — so before writing a parity test, look for an artefact the old code left behind. Here the repository''s own history held one, and it turned a self-consistency claim into byte-identical evidence; make "find the oracle first" the opening move of any future parity story.', NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19GV7Q1P63DBMFP71K1SC5G', '01M19H43RS516A49PH5JSMQKQD', 'retro', '01M193D0TS9VBQKYHW2PWPFMXX', NULL, NULL, 8, 'The first CI run was the first time this suite had ever run on a machine other than the one that wrote it, and it failed two tests out of 1015 — both for reasons no amount of local running could have surfaced.

The sharper of the two is a genuine latent bug that had been passing for the wrong reason since v0.7.0. `coverage-retirement-environment.test.js` asserted that a fixture database is outside the repository by writing `file.path.includes(DPM)` — a substring test standing in for a path test. It asks whether the repository''s path appears anywhere inside the fixture''s, which is a different and much weaker question. On a checkout at `/Users/chris/Work/git/opencode-dpm` it is indistinguishable from the right check; in the container, where the checkout is `/dpm` and `mkdtempSync` produces `/tmp/dpm-XXXXXX`, it fired on a scratch file that was exactly where it belonged. Containment between two paths is `relative(a, b).startsWith(''..'')`, and nothing else.

The second was not a bug but a missing environment: ENVR6 asks for a hook installed at `.git/hooks/pre-commit`, a fresh checkout has none, and the choice was between narrowing the assertion to accommodate CI or installing the hook so the assertion stays true. Installing it is right — it is what a contributor does on their first clone, so a CI run without it is a run against an environment the specification does not describe. The same problem arrived a second way in the container: `COPY` brings a symlink across as a symlink, so the host''s hook link pointed at a path that exists on one machine and nowhere in the image, and a dangling link reads as no hook at all.

The design decision worth carrying is that every absence in the isolated job is paired with something that would catch its presence. The Docker build fails if the base image already has Node or a compiler, so "installed into a bare environment" is a state the build passes through rather than a claim about it. And `.github/network-probe.js` is run twice — once with networking and once with `--network none` — because a step that runs the suite offline and passes is indistinguishable from a step whose `--network none` was silently ignored. The probe takes its target as an argument, so the suite drives it against a `data:` URL and a closed loopback port and exercises all four combinations without a packet leaving the machine, which keeps the suite offline-clean while still proving the control works.', 'A suite that has only ever run where it was written carries bugs that pass for the wrong reason, and a second machine is the cheapest way to find them — the substring-for-path check had been green since v0.7.0 and took one containerised run to expose. Stand CI up earlier in a port than last, and keep the discipline the isolated job established: every claimed absence is paired with a control that would catch its presence, and a flag whose effect is invisible when honoured is probed both ways.', NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19M93YZTA8XT2H3GRZ92FQ9', NULL, NULL, '01M194E5SEXMD6W90PSM0ATR4J', NULL, NULL, 0, 'Adding one devDependency turned eleven tests red, then six more, and every one was a duplicate reading rather than a broken property. `@opencode-ai/plugin` is taken `import type` only, so `dependencies` stayed `{}` and the nine assertions about it were untouched — exactly as planned. What broke instead was the *other* claim: "nothing under src imports a package". Four separate readings of that existed — `sources.js:staticImports`, `sweeps.js:importSpecifiers`, and inline regexes in `server.test.js` and `projection.test.js` — and only the first had been taught, during the TypeScript port, that `import type` is erased before evaluation. The three that had not went on reporting a runtime dependency that does not exist. Consolidating them onto the one reading fixed all six at their source, and the same shape recurred twice more: the `.node` sweep in `plugin.test.js` walked `node_modules` and read a transitive dev package''s prebuilt binary as something dpm ships, and CI''s clean-install grep matched the *name* `node-gyp-build-optional-packages` — a script that selects a prebuilt and compiles nothing — rather than the act of compiling. Both were replaced by artefact checks with controls. The lesson is narrower than "avoid duplication": a helper written to end a duplication only ends it for the callers that were migrated, and the copies left behind fail silently in the direction of a false report.', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19M9RBM22VKHVVN0WH3551N', NULL, NULL, '01M194E5SEXMD6W90PSM0ATR4J', NULL, NULL, 1, 'The scratch-project run was worth three tasks of reading, and every finding contradicted an assumption the plan had written down. The config key is `plugins`, not `plugin` — the wrong key is accepted and normalised away with a diagnostic in the log and no error at the CLI, so the first attempt looked like a plugin that would not load. `package` is `import()`ed as a literal path with `?mtime=` appended, so a *directory* does not resolve and `exports` is never consulted for the filesystem-path form; the entry *file* is what a local config must name. And the host runs the TypeScript source directly, since it is Bun-compiled. The connection failure that followed was dpm''s own ENVR8 floor check refusing under Node 22 — correct behaviour, indistinguishable at the CLI from a broken registration ("MCP error -32000: Connection closed"), and resolved by restarting the background service from a shell with Node 24 first on PATH. Reading the registry took a throwaway probe plugin that wrote `ctx.skill.list()` to a file, after three CLI and HTTP routes returned nothing useful; that probe is the technique to reach for again, because it asks the host what it holds rather than asking a test what it thinks the host holds.', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19MRYF83D901P55M6BE2WCT', NULL, NULL, '01M194E73NGKXF2ZJYSE0S5GZ3', NULL, NULL, 0, 'A real oracle for the tool surface was already on this machine and nearly went unused. Criterion 3 asks the advertised set and every schema to match v0.7.0 "against a stored snapshot", and the obvious move — generate the snapshot from the port and commit it — produces a self-portrait: it would pass on the day it was written and go on passing through any consistent drift, which is precisely the failure `parity-v070.test.js` was written to name. What made it a genuine comparison is that the released v0.7.0 is installed at `~/.claude/plugins/cache/ninthspace-marketplace/dpm/0.7.0/`, so `bin/dpm-mcp.js` from the *release* could be run and its `tools/list` reply captured. The two surfaces came back byte-identical at 168,465 bytes — 183 tools, every description, every schema — which is a far stronger result than a self-generated snapshot could ever have reported, and it cost one command. The oracle then joined `v070-dump.sql` under the existing must-NOT against rewriting a fixture, and tripped `fixtures.test.js`''s rule that no fixture is a parseable document; that rule was narrowed by naming the two oracles individually rather than exempting an extension, because an extension-shaped hole would let a corpus arrive as JSON. The lesson: before generating an expected value, look for a copy of the thing being ported.', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19NF6TMZWAQGFK9KC1FBACQ', NULL, NULL, '01M194E8W7MJQ0WMEANHJ3YRZQ', NULL, NULL, 0, 'The story was framed as a yes/no question about the host — does a registered skill''s `location` let it reach a sibling file — with a fallback prepared for "no". Neither branch was taken, because the question turned out to be answerable on our own side: substituting the absolute path at registration means the host''s behaviour stops mattering. The half-hour spent trying to make the host answer it was the part that was wasted, and it was spent first: executing the built-in `skill` tool from a probe failed schema validation on a hand-built `Tool.Context` with branded ids, several HTTP and CLI routes returned HTML or nothing, and the local model provider was unreachable. Three dead ends before asking whether the question needed answering at all.

The prepared fallback was what made the wrong branch attractive. Inlining 15KB into twenty-three bodies was written into the story as the negative case, so it read as the sanctioned answer rather than as the expensive one — and its worst cost was not the duplication but that it would have broken `tests/support/skills.js`''s per-procedure tool resolution, which nobody would have noticed until a skill''s tool sweep started passing for the wrong reason. A specification that names a fallback is naming what was thinkable when it was written, not what is best once the ground is known.

One reading error worth keeping. The first check that the substitution had worked reported twenty-three bodies still carrying an unresolved `dpm/shared/` reference, against a set that had none: the resolved absolute path ends `.../opencode-dpm/shared/skill-conventions.md`, which contains the literal the search was for. A sweep looking for the thing it replaced has to be run against text the replacement has been taken out of — the same false-report shape as the `import type` readings in story 1, arriving from the opposite direction.', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19NX65EB4CAT11ZM65WMVJA', NULL, NULL, '01M194EA95B25V3M2MCBC35A1J', NULL, NULL, 0, 'The story''s four criteria were written against a package that would hold one runtime dependency. It holds none — story 1 established that `Plugin.define` is the identity function and took the SDK `import type` — so two of the four had to be amended before anything could be built against them, and the amendments were bigger than a rewording: "exactly one entry under `dependencies`" became "empty", and with it the whole story got easier. There is no production install tree to sweep for a native binary, because `npm ci --omit=dev` creates no `node_modules` at all.

That is the second time this epic that a criterion arrived carrying an assumption from before the SDK was opened, and both times the copy was found by reaching the story rather than by looking for it. NFR1 was amended in story 1; its two copies in story 4 sat unamended for three stories, and one coverage row was still quoting the sentence that had been amended away — a binding to text that no longer exists in the requirement, which reads as covered and is not. Amending a requirement should be followed by asking what else quotes it, and the tools make that a one-call question.

The verification split cleanly into what this machine can show and what it cannot, and saying so was more useful than a verdict. The clean install was run with `PATH` cut down to Node''s own `bin` — no `cc`, `gcc`, `g++`, `make`, `python`, `python3`, `node-gyp` or `clang` reachable — and it completed, compiled nothing, and left no `build/Release`. What it is not is the container: this machine has no runtime for one, and the image''s claim is stronger, because there the toolchain is absent from the system rather than hidden from the process. The container run is genuinely outstanding, and recording it as outstanding costs nothing next to a green tick that would have to be walked back.

`msgpackr-extract` earned its second mention. It is the one package in the lockfile declaring an install script, and the tempting assertion — "no install script anywhere" — would have been false the day the SDK arrived and would have read as a regression rather than as a discovery. The true and narrower claim is that it is `dev` and its prebuilts are `optional`, so it never runs for a user and never compiles for a contributor whose platform has a prebuilt.', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19PG05589PR72WGVY9CC2RY', NULL, NULL, '01M194EBJHMAV5E7KCK0PA0GKF', NULL, NULL, 0, 'The integration story found one real defect, and it was in my own recorded knowledge rather than in the code. Story 1''s finding was written down as "the project config key is `plugins`", which is true and incomplete: the value is an array of `string | { package, options }`, and the map form I wrote from that note was discarded by the host with a normalisation diagnostic and no error. Twenty minutes went into "the plugin will not load" before reading `@opencode-ai/schema/dist/config/plugin.js`, where the shape is four lines. A note that records a key without its type is a note that will be misread, and the schema was two directories from where I was already working.

The host''s own CLI is not a trustworthy first answer. `mcp list` and `plugin list` report "No MCP servers configured" and "No plugins found" for a second or two after `service start`, then report correctly and stably — while the log shows the plugin loading the whole time and a probe running inside the host sees the full registry. Both of my false "it is not loading" conclusions today came from believing a first CLI answer. The probe plugin has now been the reliable instrument four times in this epic, and the CLI has been misleading twice; the ordering should have been obvious sooner.

The reload check needed a control and the control changed the result''s meaning. Touching the watched entry file left the registry unchanged, which looked like a pass and was not evidence of anything — the log showed no reload had occurred, so I had measured a registry that had not been disturbed. Restarting the service and counting `loading plugin` lines for the entry gave 2, and only then does "55 skills, 23 dpm, 0 duplicates, unchanged" mean the registrations survived something. This is the same false-pass shape the suite is built around, arriving in a manual check where there is no test file to remind you.

What the run confirmed is worth stating plainly because three stories were building toward it without ever seeing it together: 183 tools, the exact count of the v0.7.0 oracle, all prefixed `dpm_` and none carrying the old form; 23 skills whose conventions path is absolute and opens; one connected server. Every piece had been verified separately and the composition had not been, and the composition is the thing a user actually installs.', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19PKYHHE62Q1Y3Z8C5NTSDW', '01M19PKK0012R8QQZ86813ATB5', 'retro', NULL, NULL, NULL, 0, '**A duplicated reading fails silently in the direction of a false report, and this epic hit that shape six times.** Four separate readings of the import graph existed and only one knew `import type` is erased; the `.node` sweep walked `node_modules` and read a dev package''s prebuilt as something dpm ships; CI''s grep matched the *name* `node-gyp-build-optional-packages` rather than the act of compiling; `plugin.test.js` carried a private copy of the `package.json` read that `sources.js` exists to be. None of these was a broken property — every one was a second reading that had not been taught what the first had learned, and each failed by reporting a problem that did not exist or missing one that did.

**Why it matters more here than in ordinary code**: a test''s job is to be the thing that notices, so a reading that has silently stopped noticing is the one defect the suite cannot catch. Consolidating onto one reader fixed six failures at their source in a single edit, and the two remaining copies were only found because a story happened to touch them.

**How to apply**: when a helper is written to end a duplication, migrate every caller in the same change, and when a shared reader already exists, treat a private copy of the same read as a defect on sight rather than as style. Before writing an assertion over an artefact, grep for who else reads that artefact.', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19PMJBXJHP9G40P8RGB1HB3', '01M19PKK0012R8QQZ86813ATB5', 'retro', NULL, NULL, NULL, 1, '**Ask the host what it holds; do not ask a test what it thinks the host holds — and do not believe the host''s CLI on the first answer.** A throwaway probe plugin that writes `ctx.skill.transform(draft => draft.list())`, `ctx.mcp.transform(draft => draft.list())` and `ctx.tool.transform(draft => draft.list())` to a file was the instrument that answered four separate questions this epic could not otherwise settle: the rendered tool-name form and its character substitution, whether `location` and `content` are stored verbatim, the full registered set, and whether a reload duplicates.

Against that, `opencode2 mcp list` and `plugin list` produced two false "it is not loading" conclusions, because both report nothing for a second or two after `service start` while the log shows the plugin loading throughout. Three CLI and HTTP routes to the same information returned HTML, nothing, or a schema-validation failure on a hand-built `Tool.Context`.

**How to apply**: for any question about a running host''s registry, write the probe first rather than after exhausting the CLI. Run any CLI listing twice before believing it. And when the answer disagrees with expectation, read the host''s log before concluding the code is wrong — every genuine misconfiguration in this epic announced itself there as a normalisation diagnostic while the CLI stayed silent.', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19PMSVAG7DT2RR68AFSTVS6', '01M19PKK0012R8QQZ86813ATB5', 'retro', NULL, NULL, NULL, 2, '**A specification written before the dependency was opened carries assumptions into every story that quotes it, and amending one copy does not amend the others.** Four criteria and one requirement across three stories were amended in this epic, all from the same discovery — `Plugin.define` is `define(plugin) { return plugin }`, so the SDK is a type-only import and `dependencies` stays empty. NFR1 was amended in story 1; its two copies in story 4''s criteria sat unamended for three stories, and a coverage row was still quoting the sentence that had been amended away, which renders in the matrix as a verified binding to text the requirement no longer contains.

The second family was the same shape from a different source: story 4''s "pinned to the `beta` tag" (a tag is not a pin), and story 2''s naming criteria written against Claude Code''s `mcp__plugin_<plugin>_<server>__` form. Every amendment had a citation and none was a relaxation — NFR1''s headline got *stronger*, from one runtime dependency to none.

**How to apply**: after amending a requirement, immediately ask what else quotes it — `list_coverage` on the requirement names every binding, and a bound fragment that is no longer a substring of the requirement is a broken binding whatever its verified date says. Before building against a criterion that names a mechanism rather than a property, check the mechanism still exists; retro 01 flagged that pattern and it recurred here three times.', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19PN4YEPAP09S02P0SDYNMZ', '01M19PKK0012R8QQZ86813ATB5', 'retro', NULL, NULL, NULL, 3, '**Before generating an expected value, look for a copy of the thing being ported — and before recording a manual check as passed, look for what would have shown it failing.** Two halves of one discipline, and both changed a result in this epic.

The oracle: criterion "match v0.7.0 against a stored snapshot" invited generating the snapshot from the port, which is a self-portrait that passes on the day it is written and through any consistent drift afterwards. The released v0.7.0 was installed on the machine, so its `bin/dpm-mcp.js` was run and its real `tools/list` reply captured — 183 tools, byte-identical at 168,465 bytes. One command, and a far stronger claim.

The control: the reload check first "passed" by touching the watched entry file, which left the registry unchanged — but the log showed no reload had happened, so nothing had been measured. Restarting the service and counting `loading plugin` lines gave 2, and only then did "55 skills, 23 dpm, 0 duplicates" mean anything. The same shape appeared in the substitution check, where a search for the replaced string matched inside the absolute path that replaced it and reported 23 failures against a set with none.

**How to apply**: for a port, the previous version is an oracle and is usually still installed. For any manual check, name the evidence that the event under test actually occurred, and state it beside the result — a count in a log, a control write, a planted breach. An absence is only an observation when something was watching.', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19SFYZD8WN9WFTCF8BKK1K8', NULL, NULL, '01M194V4CBNMW9KRVBHS83R3DM', NULL, NULL, 0, 'The pilot''s biggest cost was not the rename — it was that `tests/support/skills.js` derived its callable prefix from the Claude Code manifest and 40 test files read bodies through it. Rewriting one skill made five other test files fail in shapes that had nothing to do with the skill: bodies reporting no tools at all, a classification registry reporting every site stale, a manifest test pairing a derived prefix with a literal that had quietly become the wrong one. The fix was to make the transition a first-class object — `CALLABLE` derived from the plugin entry, `LEGACY_CALLABLE` beside it, `EITHER_CALLABLE` as the exported alternation every reader matches on, and `bodiesOnLegacyForm()` asserted against the exact list of skills not yet done — so the dual-form matcher cannot silently accept an unported body. Story 2 should expect the same shape: the batch pass is 424 substitutions and roughly zero decisions, and what will take the time is the assertions written against the old form in files nobody thinks of as skill-port files.', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19SGCN380AZP3N5VK1AVYTE', NULL, NULL, '01M194V4CBNMW9KRVBHS83R3DM', NULL, NULL, 1, 'Epic 01-02 chose registration-time path substitution over inlining the conventions into 23 bodies, and priced the fallback. What neither option was priced against turned up the first time a real session tried to follow the substituted path: opencode2 refused the read — `permission requested: external_directory (/Users/chris/Work/git/opencode-dpm/shared/*); auto-rejecting` — because the package lives outside the project the session runs in, so every one of the 23 bodies points at a file the host treats as external. Interactively the user is prompted; non-interactively the read simply fails unless the project sets `permission.external_directory`. The decision still looks right, but it now carries an installation obligation that belongs in epic 01-04''s guidance, and it is a reminder that a design verified against the registry is not the same as one verified against a session actually doing what the registration told it to.', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19VSVSXYWDGGVXPD4SWP9YX', NULL, NULL, '01M194V5Q15F8TQR44DPVPJBRY', NULL, NULL, 0, 'The rewrite was mechanical in twenty-two bodies and not a rewrite at all in the twenty-third. `ralph` does not name a Claude Code path that needed substituting — it is built end to end on a stop-hook contract it describes fourteen times, and that hook was never shipped even by released v0.7.0, whose `hooks/` holds a `pre-commit` and nothing else. So the port met a missing capability wearing the costume of a find-and-replace. The story''s own planning had flagged it (story 1 task 3 wrote it into the epic section precisely so story 2 would meet it as a decision), and that flag is the only reason it cost a question rather than a silent path substitution that would have left a skill reading as ported and unable to work.', NULL, 'Resolved by keeping ralph registered and recording the must-NOT unmet for it alone — the smallest amendment surface, since excluding it would have forced amending three criteria that say "twenty-three". The v2 loop mechanism is unbuilt and unowned.', NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19VT4A23CHQTSBACRXG8KQZ', NULL, NULL, '01M194V5Q15F8TQR44DPVPJBRY', NULL, NULL, 1, 'A 549-edit mechanical rewrite across twenty-three files was made auditable by inverting it: reverse-substituting `dpm_` back to `mcp__plugin_dpm_dpm__` and diffing each body against the released v0.7.0 copy gave 0 differing lines for all twenty-two batch bodies and for `shared/skill-conventions.md`, and 6 for the pilot — the three intentional line pairs. That is a far stronger claim than "the tests still pass", because it says what was *not* touched: no procedure prose, no gate wording, no table. The technique needs a byte-identical oracle to invert against, which this port has and which most refactors do not.', NULL, 'Stays a manual check: `vendoring.test.js` forbids any source from naming the marketplace checkout, so it cannot become a test without a test that silently passes when the released copy is absent.', NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19WXKMW56XWN8EWFEV2JXRT', NULL, NULL, '01M194V710KP0J5V188YR3EBDX', NULL, NULL, 0, 'Story 2''s must-NOT listed four Claude Code mechanisms — `mcp__plugin_`, `/dpm:`, `CLAUDE_PLUGIN_ROOT`, `.claude/` — and a fifth was in all twenty-three bodies the whole time. `$ARGUMENTS` is the *argument half* of the same slash-command mechanism: the harness substituted the user''s typed text into the body before the model saw it, so the token was a hole the host filled and v2 fills with nothing. It survived a pass that was looking for exactly this class of thing because a prohibition written as a list of strings can only catch the strings someone thought of. The failure it would have caused is the quiet kind — a literal `$ARGUMENTS` sits in a sentence that still reads as an instruction, so a model does not error on it, it invents a value.', NULL, 'Found by asking what "invocation prose" meant beyond the descriptions rather than accepting that story 2 had already satisfied the criterion. The lesson generalises past this port: an enumerated must-NOT is a checklist, not a sweep, and the next epic''s prohibitions are worth re-deriving from the mechanism rather than copied from the last list.', NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19X968MX1P6AVTK4J73YQEC', NULL, NULL, '01M194V89DXC10121AWAN7KZ5N', NULL, NULL, 0, 'The story asked for a CI check, and the suite already read both rules — so the temptation was to call it done and add a workflow line pointing at `npm test`. What makes the separate check worth its cost is not enforcement in the abstract but *where the failure lands*: this is the rule a contributor breaks while doing something else entirely, writing a skill body, in a file whose nature says nothing about being under a prohibition. A named step puts the rule''s name in the output instead of a test''s. The same reasoning is already on the record for the module sweep, which is separate from the suite for the mirror-image reason — a suite reaches a module by importing it, so it cannot speak for one nothing imports.', NULL, 'The consolidation that fell out is the part worth keeping: HOST_MECHANISM is defined in the script CI runs and imported by the test that sweeps with it, so the reading and the enforcement of that reading cannot disagree. Restating the list in both would have put the copy CI ran in the file nobody reads.', NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19XN46BYP1KJSWEK5EE20B5', NULL, NULL, '01M194V9HR3KH3XB66JEG6651N', NULL, NULL, 0, 'Seven attempts to execute the invocation walk failed, and six of them failed silently — the probe wrote no report at all, which reads identically to a probe that never ran. Two host facts came out of it that are worth more than the walk would have been. Plugins load **lazily**: a freshly started server has registered nothing until a request asks it to, so a probe that starts and reads immediately sees an empty world. And `ctx.skill.transform(cb)` returns a `Registration` carrying only `dispose` — **not** the callback''s value — so a probe that reads the return value gets an empty registry, which is indistinguishable from a host that registered nothing. Both failure modes present as "there is nothing here", which is the shape that costs the most time: the probe was reporting a broken host when it was reporting a broken probe.', NULL, 'The instrumentation lesson is the transferable one: everything was written at the end of the run, so a hang anywhere produced no evidence about where. Writing the report incrementally — after the registry read, after the session, after each row — was added on the seventh attempt and would have identified the hang on the second.', NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19Z0XXBFFZA4S7MECMTXQTC', NULL, NULL, '01M1951C1R30C8CQABYF7YZJ82', NULL, NULL, 0, '**The port swept `skills/` for host mechanisms and never swept `src/`, and the guard is the one module in `src/` that writes prose a user acts on.** `describe()`''s divergence branch ended `or run /dpm:publish if you are already in a session` — a Claude Code slash command v2 does not mint — and it survived three epics of the port, including the epic that built a CI check for exactly this class of string. The check walks `skills/` and `shared/` because that is where the criterion pointed; nothing asked whether the prohibition had a second home. It is printed at the moment a reader is most likely to type what they are told, since the commit they just made was refused.

**Two smaller findings came out of fixing it, and the second is the reusable one.** First, the comment references that remain (`/dpm:templates`, `/dpm:do`, `/dpm:epics` in `src/tools/cross/template.ts`, `src/coverage/warrant.ts`, `src/preview/example.ts`) are stale in the same way but are JSDoc rather than output, and no story in this epic covers them.

Second: matching the message against the bare skill id `dpm-publish` reported the skill as offered in the one refusal that must not offer it, because `dpm-publish` is a substring of `bin/dpm-publish.ts`. Three assertions were written that way and one passed for that reason. Retro 02 recorded the same shape from the other side — a search for a replaced string matching inside the absolute path that replaced it. The fix was to export the *phrase* rather than the id and match on that, so a caller asking "does this message offer the publish skill" cannot be answered by a path.

**How to apply**: when a prohibition is enforced over one directory, ask what else in the tree produces the same kind of artefact before recording the rule as enforced. And when a new identifier is a substring of an existing path, the identifier is not a safe thing to match on — export the phrase that contains it.', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M19ZHE2YSQB357FDEPCS9355', NULL, NULL, '01M1951DJH04XXS5ZN0Z3GBDSB', NULL, NULL, 0, '**The install could be done for real without touching the machine, and that changed what the story was allowed to conclude.** `opencode2 plugin add` writes to the global configuration, which is the user''s live setup — so pointing `XDG_CONFIG_HOME`, `XDG_DATA_HOME` and `XDG_CACHE_HOME` at a scratch directory bought a genuine `plugin add` against the real GitHub remote with no side effect to undo afterwards. The criterion asked for a real install and got one; nothing had to be inferred from documentation.

**The location turned out to be derivable, and checking that was worth more than reading it.** The package lands at `$XDG_CACHE_HOME/opencode/packages/git-<hash>/node_modules/opencode-dpm/`, and `<hash>` is sha256 of the literal specifier string — `sha256("github:ninthspace/opencode-dpm")` matches the directory name byte for byte. Confirmed from the other direction by installing `github:ninthspace/opencode-dpm#main`, the same repository under a different string, which produced a *second* directory. So the hash is over the text somebody typed, not over the repository or the resolved commit.

**That killed the old instruction rather than relocating it.** The Claude Code form ended `sort -V | tail -1`, which sorted a version out of the path. There is no version in an OpenCode package path, and sorting hex digests orders nothing — so the replacement sorts by modification time. The same fact reaches the guard: `src/guard/main.ts` refuses a database from a newer release and explains it as "an upgrade installs beside the previous release rather than over it", which is Claude Code''s mechanism. The refusal stays reachable — two specifiers for one repository give two installs of different ages — but the sentence explaining why no longer describes the ordinary case.

**Two probes returned nothing and were recorded rather than chased**, per the bound this run put on host probing: `opencode2 plugin list` said "No plugins found" twice against a configuration declaring two, and the host log shows only CLI starts and no plugin load. The control is uninformative — the machine''s real configuration declares no plugins, so the same answer there is correct — so the section says what it establishes (where a git install lands) and explicitly not what it does not (that a plugin registers from there).

**How to apply**: an XDG-rooted scratch turns "install it for real" from a change to the user''s machine into an ordinary test fixture, and it should be the first thing reached for when a criterion asks for a real install. And when a path stops carrying a version, every instruction that *ordered* by that path is broken rather than merely relocated — grep for the sort, not only for the prefix.', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M1A01FWXJF076P74V5JK4E7C', NULL, NULL, '01M1951FE5F4G1PTK9BF5WNW7Q', NULL, NULL, 0, 'The story''s first criterion has an empty antecedent — "anything that was per-session scratch keyed by an environment variable uses ctx.storage" — and the audit found the antecedent empty. That shape passes by doing nothing, and it passes identically whether the sweep found nothing, the sweep read nothing, or the regex quietly stopped matching. Three different facts, one empty array. What made the difference was refusing to assert the negative: `session-scratch.test.js` enumerates the environment reads, holds the set equal to a written classification table, and drives the reading against three planted sources including a commented-out one. A new `process.env.X` now fails until somebody classifies it, so the empty antecedent stays checked rather than merely being true today.

Two things fell out of doing it that way. The exemption the conclusion leans on — "where a database session row is not already the answer" — is only a defence if the row exists and carries state, so that became its own test rather than an assumption in a comment; the sweep alone would be equally empty in a release that had lost sessions altogether. And the classification is written down rather than derived, because a variable''s name says nothing about whether it holds state between calls; what is mechanical is only that the two sets match.

Left open and not claimed: `DATABASE` is a relative path, so which directory OpenCode gives a spawned local MCP server as its cwd decides which repository `.dpm/` lands in. Every test here runs the server against an explicit root, so nothing here reaches that question — it is a fact about the running host, of the same class as the ones epic 01-04 story 4 and the `target` criteria elsewhere leave to the deployment.', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M1A1GF43BMAS62WJAZK2PZ26', NULL, NULL, '01M1951J6PTV1WPNCCCF58J3TD', NULL, NULL, 0, 'The story''s first README draft recommended putting `ask` on `skill`/`dpm-publish`, and the review that killed it asked one question: why would anyone deny a skill in this repository? They are all meant to be used. That is right, and the draft had drifted into demonstrating a mechanism rather than advising a reader — the criterion says "documents the recommended permission entries", and I had answered "documents the permission entries I had just learned how to exercise". Not the same thing. What survived is an allow-list for the one case that needs configuration, plus the confirmation moved onto `dpm_publish`, the tool that actually unlinks. The `deny` prose stays but is now framed as something met — inherited config, restricted agent — rather than something chosen.

The finding underneath it is worth keeping whatever the wording: loading a skill is the action `skill` with the skill''s **id** as the resource, while running a dpm tool is the tool''s own name as the *action*. Two axes, no overlap. A rule on one is invisible to the other, so the intuitive "gate the skill and its work is gated" is precisely wrong — the skill rule governs whether a procedure is read, and the writes happen under 183 separate tool actions. That is the section''s whole reason to exist, and it is also why the first draft was dangerous rather than merely unnecessary: it named both halves and would have left a reader confident they had covered publishing.

Three probe runs produced nothing at all before the host log gave the cause: `Duplicate plugin ID: dpm`. Story 2''s install had left two git specifiers in the scratch global config, and with the project config''s local path that is three plugins claiming one id — which kills the *entire* plugin load rather than the duplicate, so a working probe presents as a hung one. Worth carrying: a scratch fixture built by an earlier story is state the next story inherits, and this one had no symptom pointing at it.

Where the story declined to automate: the two behavioural criteria are `manual`, and this project has always been tested by hand. A test asserting the host''s permission semantics would assert my transcription of them and pass just as well when the transcription is wrong. So the test file checks the thing a person cannot recheck every commit — that every documented rule names a skill or tool that exists — and leaves the behaviour to the probe. The transcribed glob matcher is the one thing there taken on trust, and it is named as such in the file.', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "observation" ("id", "retro_id", "retro_kind", "story_id", "quick_id", "quick_kind", "position", "text", "synthesis", "note", "library_doc_id", "library_doc_kind", "retired_at", "retired_reason") VALUES ('01M1A2N7F530TKPZ7593WDND5B', NULL, NULL, '01M1951GSMQ3JY8MJAX204ZEY0', NULL, NULL, 0, '**Running the README found three defects that reading it could not.** The commands were not transcribed into the test and asserted; every fenced block was enumerated, classified by a rule, and executed. What that turned up: `git config core.hooksPath` exits 1 when the key is unset, which is the outcome the documented check is *looking for*; `sh` rejects `dpm-link()` as a syntax error because POSIX forbids a hyphen in a function name, so a block correct for the `.zshrc` it was written for is invalid in the shell a test runner reaches for by default; and the beta callout could not be located by searching for its own opening sentence, because the TL;DR says the same thing in a shorter form and the anchored match found that one — reporting the entrypoints warning missing from a paragraph that was never supposed to carry it.

The third is the one worth keeping. **The test was right that its match failed and wrong about what it had matched**, and nothing in the failure said so — it named two sections and neither of them by name. A search anchored on prose finds the first instance of that prose, and a document that deliberately says a thing twice at different lengths has more than one. The fix was to stop searching: the callout is a blockquote, so it is extracted as one, with an assertion that there is exactly one blockquote in the file. Structure the document actually has, rather than a phrase it happens to contain.

**Two of the three would have passed as documentation defects if the rule had bent instead.** Accepting any non-zero exit would have hidden every genuinely broken command; switching the block to `bash` without saying so in the README would have left a reader pasting non-POSIX syntax into a POSIX shell with a syntax error and no explanation. So both are declared at the rule with a reason the test asserts is present, and the shell case additionally requires the README itself to name the shell — the rule cannot quietly absorb a gap in the prose it is checking.

**The enumeration is what makes the file worth having**, and it fails in both directions: an unmatched block fails, and a rule matching nothing fails too. Without the second, a rewrite that removed a command leaves a rule guarding an empty set and the sweep reporting clean.', NULL, NULL, NULL, NULL, NULL, NULL);
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
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M19366AF5ZVHTYQEY3DVS515', 'epic', 'child', NULL, 1, 'repo-bootstrap', 'Repository bootstrap and TypeScript conversion', 'complete', NULL, '01M191BE7MHM077FE9YM09B2ZK', 'spec', NULL, '6de9736', '2026-08-30T10:24:35.663Z', '2026-08-30T14:23:40.728Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M19367X8Q1XF3043C63VQ4ZR', 'epic', 'child', NULL, 2, 'plugin-entry', 'Plugin entry and MCP registration', 'complete', NULL, '01M191BE7MHM077FE9YM09B2ZK', 'spec', NULL, NULL, '2026-08-30T10:24:37.288Z', '2026-08-30T16:02:13.507Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M193697Y6ZF3Q1KGVYPW5G15', 'epic', 'child', NULL, 3, 'skill-port', 'Skill port and registration', 'complete', 'All five stories complete. Two coverage rows unverified by design, each naming what would close it.', '01M191BE7MHM077FE9YM09B2ZK', 'spec', NULL, NULL, '2026-08-30T10:24:38.654Z', '2026-08-30T18:07:14.059Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M1936AGMZ3DD6GJZM5ATYYS7', 'epic', 'child', NULL, 4, 'guard-and-docs', 'Guard, documentation and host behaviour', 'complete', NULL, '01M191BE7MHM077FE9YM09B2ZK', 'spec', NULL, NULL, '2026-08-30T10:24:39.956Z', '2026-08-30T19:34:58.800Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M1936BS9145G8158CBKDD07S', 'epic', 'child', NULL, 5, 'publish', 'Publish and release verification', 'pending', NULL, '01M191BE7MHM077FE9YM09B2ZK', 'spec', NULL, NULL, '2026-08-30T10:24:41.257Z', '2026-08-30T10:24:41.257Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M1936GD6626BZ59PA4N3XZ8T', 'coverage_matrix', 'child', NULL, 1, 'repo-bootstrap-coverage', 'Coverage: Repository bootstrap and TypeScript conversion', 'pending', NULL, '01M19366AF5ZVHTYQEY3DVS515', 'epic', NULL, NULL, '2026-08-30T10:24:45.990Z', '2026-08-30T10:24:45.990Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M1936HSVCTR7DHNSQEZJ6GJD', 'coverage_matrix', 'child', NULL, 1, 'plugin-entry-coverage', 'Coverage: Plugin entry and MCP registration', 'pending', NULL, '01M19367X8Q1XF3043C63VQ4ZR', 'epic', NULL, NULL, '2026-08-30T10:24:47.419Z', '2026-08-30T10:24:47.419Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M1936K3F12HXWR910J7M6ZXB', 'coverage_matrix', 'child', NULL, 1, 'skill-port-coverage', 'Coverage: Skill port and registration', 'pending', NULL, '01M193697Y6ZF3Q1KGVYPW5G15', 'epic', NULL, NULL, '2026-08-30T10:24:48.751Z', '2026-08-30T10:24:48.751Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M1936MHHRTWCFA3XKSG3FY6C', 'coverage_matrix', 'child', NULL, 1, 'guard-and-docs-coverage', 'Coverage: Guard, documentation and host behaviour', 'pending', NULL, '01M1936AGMZ3DD6GJZM5ATYYS7', 'epic', NULL, NULL, '2026-08-30T10:24:50.225Z', '2026-08-30T10:24:50.225Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M1936NX4THG6HR4SFVA23MSD', 'coverage_matrix', 'child', NULL, 1, 'publish-coverage', 'Coverage: Publish and release verification', 'pending', NULL, '01M1936BS9145G8158CBKDD07S', 'epic', NULL, NULL, '2026-08-30T10:24:51.620Z', '2026-08-30T10:24:51.620Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M19H43RS516A49PH5JSMQKQD', 'retro', 'root', 1, NULL, 'repo-bootstrap', 'Repository bootstrap and TypeScript conversion', 'complete', NULL, '01M19366AF5ZVHTYQEY3DVS515', 'epic', NULL, NULL, '2026-08-30T14:28:07.577Z', '2026-08-30T14:28:07.577Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M19PKK0012R8QQZ86813ATB5', 'retro', 'root', 2, NULL, 'plugin-entry', 'Plugin entry and MCP registration', 'complete', NULL, '01M19367X8Q1XF3043C63VQ4ZR', 'epic', NULL, NULL, '2026-08-30T16:03:57.568Z', '2026-08-30T16:03:57.568Z', NULL, NULL);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M193CRHRQC3Z4E42TM3XKPGT', '01M19366AF5ZVHTYQEY3DVS515', 'epic', 1, 'Vendor v0.7.0 and raise the Node floor to 24', 'complete', NULL, 0, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M193CSTFYJ1RQWVK6AX2QYP0', '01M19366AF5ZVHTYQEY3DVS515', 'epic', 2, 'Convert src/ to erasable-syntax TypeScript', 'complete', NULL, 1, 1);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M193CV7AYZP0X6SV38W5FT4J', '01M19366AF5ZVHTYQEY3DVS515', 'epic', 3, 'Convert the five executables to TypeScript', 'complete', NULL, 2, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M193CWMBV0R2TR8M9NEDNBKV', '01M19366AF5ZVHTYQEY3DVS515', 'epic', 4, 'Restore the inherited test suite green under Node 24', 'complete', NULL, 3, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M193CY1QWF6PRDPHJTR1P95S', '01M19366AF5ZVHTYQEY3DVS515', 'epic', 5, 'Verify persistence parity and determinism', 'complete', NULL, 4, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M193CZBACY1KZJ264E2ZH76G', '01M19366AF5ZVHTYQEY3DVS515', 'epic', 6, 'Enforce import-extension discipline with a module sweep', 'complete', NULL, 5, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M193D0TS9VBQKYHW2PWPFMXX', '01M19366AF5ZVHTYQEY3DVS515', 'epic', 7, 'Stand up CI on Node 24', 'complete', NULL, 6, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M194E5SEXMD6W90PSM0ATR4J', '01M19367X8Q1XF3043C63VQ4ZR', 'epic', 1, 'Plugin entry, MCP registration and the profile seam', 'complete', NULL, 0, 1);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M194E73NGKXF2ZJYSE0S5GZ3', '01M19367X8Q1XF3043C63VQ4ZR', 'epic', 2, 'Establish the effective MCP tool naming under v2', 'complete', NULL, 1, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M194E8W7MJQ0WMEANHJ3YRZQ', '01M19367X8Q1XF3043C63VQ4ZR', 'epic', 3, 'Resolve the skill supporting-files go/no-go', 'complete', 'Both criteria met: 23 of 23 skill bodies carry an absolute conventions path that opens, and the go/no-go is recorded on the epic ahead of any prose rewrite.', 2, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M194EA95B25V3M2MCBC35A1J', '01M19367X8Q1XF3043C63VQ4ZR', 'epic', 4, 'Zero runtime dependencies and no native compilation', 'complete', 'All four criteria met, two of them amended first. The production install tree is empty by construction: every locked package is dev. The clean install ran with the toolchain off PATH; the container run is outstanding on the next CI push.', 3, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M194EBJHMAV5E7KCK0PA0GKF', '01M19367X8Q1XF3043C63VQ4ZR', 'epic', 5, 'Verify cross-story integration for Plugin entry and MCP registration', 'complete', 'Both criteria met against the running beta host: connected server, 183 `dpm_` tools, 23 skills resolving their conventions, and a reload that left the registry identical.', 4, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M194V4CBNMW9KRVBHS83R3DM', '01M193697Y6ZF3Q1KGVYPW5G15', 'epic', 1, 'Pilot the spec skill end-to-end', 'complete', 'Gates limb of criterion 1 unmet; completed on the user''s call.', 0, 1);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M194V5Q15F8TQR44DPVPJBRY', '01M193697Y6ZF3Q1KGVYPW5G15', 'epic', 2, 'Port and register all twenty-three skills', 'complete', 'Five criteria met; the must-NOT on host mechanisms is unmet for ralph alone, recorded as a gap by decision.', 1, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M194V710KP0J5V188YR3EBDX', '01M193697Y6ZF3Q1KGVYPW5G15', 'epic', 3, 'Invocation without slash commands', 'complete', 'Prose criterion verified; the walk is assumed working by decision, not observed, and stays unverified.', 2, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M194V89DXC10121AWAN7KZ5N', '01M193697Y6ZF3Q1KGVYPW5G15', 'epic', 4, 'Enforce the skill-body prohibitions in CI', 'complete', 'All three criteria met, the control among them: the check fails on every planted breach.', 3, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M194V9HR3KH3XB66JEG6651N', '01M193697Y6ZF3Q1KGVYPW5G15', 'epic', 5, 'Verify cross-story integration for Skill port and registration', 'complete', 'Three limbs observed, the fourth not; the coverage row stays unverified and names what would close it.', 4, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M1951C1R30C8CQABYF7YZJ82', '01M1936AGMZ3DD6GJZM5ATYYS7', 'epic', 1, 'Guard at OpenCode''s hook path', 'complete', 'All six criteria met; six of six coverage rows verified.', 0, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M1951DJH04XXS5ZN0Z3GBDSB', '01M1936AGMZ3DD6GJZM5ATYYS7', 'epic', 2, 'Confirm the package cache location and the symlink target', 'complete', 'Both criteria met; two of two coverage rows verified.', 1, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M1951FE5F4G1PTK9BF5WNW7Q', '01M1936AGMZ3DD6GJZM5ATYYS7', 'epic', 3, 'Session scratch via plugin storage', 'complete', 'Three criteria met; three of three coverage rows verified. Nothing moved to storage — see task 1.', 2, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M1951GSMQ3JY8MJAX204ZEY0', '01M1936AGMZ3DD6GJZM5ATYYS7', 'epic', 4, 'README for a v2 audience', 'complete', 'Four criteria met; four of four coverage rows verified. Two things were removed that the task list did not ask for and the README could not keep: `MIGRATION.md`, whose migration happens under Claude Code while CPM is still installed, and the board section, which documented a `tools/board/` this fork has never tracked.', 3, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M1951J6PTV1WPNCCCF58J3TD', '01M1936AGMZ3DD6GJZM5ATYYS7', 'epic', 5, 'Permission-aware behaviour', 'complete', 'Three criteria met; three of three coverage rows verified. The two manual ones rest on the task 1 probe.', 4, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M1957QGCTGTTW0VJP7JHDG74', '01M1936BS9145G8158CBKDD07S', 'epic', 1, 'Publish opencode-dpm at 0.1.0 to npm', 'pending', NULL, 0, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M1957RXJ674PDNMB53CEGBT1', '01M1936BS9145G8158CBKDD07S', 'epic', 2, 'Verify the install from the published artefact', 'pending', NULL, 1, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M1957TECZSEEFTKG9DNVT7S7', '01M1936BS9145G8158CBKDD07S', 'epic', 3, 'Verify the production restrictions', 'pending', NULL, 2, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193K65CAXT0NDTSER8XM1V6', '01M193CRHRQC3Z4E42TM3XKPGT', 1, 'Vendor the v0.7.0 tree as the starting commit', 'Copy `src/`, `bin/`, `tests/`, `skills/`, `shared/` and `hooks/` verbatim from dpm v0.7.0; drop `.claude-plugin/plugin.json` and `MIGRATION.md`. Addresses the tree only, not any conversion of it.', 'complete', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193K87DGFNXN5CT6QAXX8DX', '01M193CRHRQC3Z4E42TM3XKPGT', 2, 'Rename the package and raise the engine floor', '`name` becomes `opencode-dpm` and `engines.node` becomes `>=24.0.0`. Addresses the manifest; the runtime refusal is task 3.', 'complete', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193K9N7KK9Q0GB2HWMZTQFN', '01M193CRHRQC3Z4E42TM3XKPGT', 3, 'Raise the node-floor refusal from 22.5.0 to 24', 'Addresses the version the refusal checks and the message it prints, not the detection mechanism, which already exists in `src/server/node-floor`.', 'complete', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193KBPP7VCPNZEYNG5K59TB', '01M193CRHRQC3Z4E42TM3XKPGT', 4, 'Write tests for "Vendor v0.7.0 and raise the Node floor to 24"', 'Covers the criteria tagged `unit` and `integration`. The host-runtime criterion is tagged `target` and is not automatable here.', 'complete', NULL, 3);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193KDSC76PNGK7P2A7KWEXE', '01M193CSTFYJ1RQWVK6AX2QYP0', 1, 'Establish the TypeScript configuration', '`tsconfig.json` with `allowImportingTsExtensions` and no emit, plus TypeScript as a devDependency. Addresses configuration, not module contents.', 'complete', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193KFT8T7RKT506PS41K7ZN', '01M193CSTFYJ1RQWVK6AX2QYP0', 2, 'Convert the modules under src/ to .ts, erasable syntax only', 'All 100 modules across the 24 subdirectories. Addresses file extension and syntax; import specifiers are task 3.', 'complete', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193KHFREKM5B576PW3WFD11', '01M193CSTFYJ1RQWVK6AX2QYP0', 3, 'Add explicit .ts extensions to every internal import specifier under src/', 'Addresses the specifier text. The sweep that enforces it across modules nothing imports is story 6.', 'complete', 'Widened during planning beyond `src/`: the 393 specifiers pointing into `src/` from `tests/`, `bin/` and two `.mjs` fixtures were rewritten in the same pass, because Node does not map a `.js` specifier onto a `.ts` file and the story''s own tests import `src/`.', 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193KKDYVZ4V49BDTDJPRBV0', '01M193CSTFYJ1RQWVK6AX2QYP0', 4, 'Write tests for "Convert src/ to erasable-syntax TypeScript"', 'Covers the criteria tagged `unit` and `integration`, including the rejection of non-erasable constructs.', 'complete', NULL, 3);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193KND5PXBC6W8MDF95JJQT', '01M193CV7AYZP0X6SV38W5FT4J', 1, 'Convert the five executables to .ts', '`dpm-mcp`, `dpm-guard`, `dpm-publish`, `dpm-import` and `dpm-merge`. Addresses the executables'' own sources and their import specifiers.', 'complete', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193KPX7P1WMQR9C9ZNVWKNM', '01M193CV7AYZP0X6SV38W5FT4J', 2, 'Update every documented invocation to plain node', 'Addresses `package.json` scripts and the pre-commit hook. The README rewrite belongs to the guard-and-docs epic.', 'complete', '`hooks/pre-commit` now execs `node .../bin/dpm-guard.ts` with no flag; `package.json`''s only invocation is `"test": "node --test"`, which already passed none. The README is the third documented surface and this fork vendors none — `first-run.test.js` asserts it when it lands, and its `dpm-publish` reference was moved to `.ts` here so it is correct on arrival.', 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193KR7XTC0QNJ1V8XTANGNN', '01M193CV7AYZP0X6SV38W5FT4J', 3, 'Write tests for "Convert the five executables to TypeScript"', 'Covers the criteria tagged `unit` and `integration`, including the rejection of a build-artefact prerequisite.', 'complete', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193KZN6BFWFH2F1P8GZQYFG', '01M193CWMBV0R2TR8M9NEDNBKV', 1, 'Run the inherited suite under Node 24 and fix what the conversion broke', 'Addresses failures the port introduced, not pre-existing behaviour. A failure that reveals a real defect in v0.7.0 is recorded, not silently repaired here.', 'complete', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193M12NRZRJT8RNGYEBS6F2', '01M193CWMBV0R2TR8M9NEDNBKV', 2, 'Confirm the suite''s independence from loaders, network and Claude Code', 'Addresses the environment the suite runs in, not the assertions it makes.', 'complete', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193M2MKB122V365885GYDAW', '01M193CWMBV0R2TR8M9NEDNBKV', 3, 'Write tests for "Restore the inherited test suite green under Node 24"', 'Covers the shape criteria: the test script, the absence of a third-party runner, and the file count holding at 133 with nothing skipped or quarantined.', 'complete', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193M4VFGS3EWKQJ4BF9ADTF', '01M193CY1QWF6PRDPHJTR1P95S', 1, 'Confirm the inherited persistence tests still cover restore asymmetry, read-only mode and row preservation', 'Addresses sufficiency of existing coverage, not new behaviour. Names any criterion the inherited suite does not reach.', 'complete', 'The inherited suite reaches criteria 2, 3, 4 and 5 in full: restore.test.js and restore-on-create.test.js cover the empty/populated asymmetry and first-open behaviour; read-only.test.js asserts every tool declaring `mutates` refuses and that no read is refused, with a remove-the-condition control and a refusal at the connection rather than in a handler; round-trip.test.js covers "loses no row, no index and no trigger" and dump-twice byte-identity; projection.test.js:161 and projection-integration.test.js:109 cover projection byte-identity. Not reached, and left to tasks 2 and 3: parity against v0.7.0 itself (criteria 1 and 7 — nothing compared the ported output to a v0.7.0-produced artefact), evidence that the corpus-snapshot fixtures were not regenerated (criterion 6), and the must-NOT on wall-clock, filesystem and iteration order (criterion 8).', 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193M61PK6JSTMZH2VHDETVN', '01M193CY1QWF6PRDPHJTR1P95S', 2, 'Add byte-stability checks for dump, projection and number allocation', 'Addresses determinism against v0.7.0 output, which the guard''s regenerate-and-compare depends on.', 'complete', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193M85THVYVCMY9379C0ETA', '01M193CY1QWF6PRDPHJTR1P95S', 3, 'Write tests for "Verify persistence parity and determinism"', 'Covers whatever tasks 1 and 2 found uncovered, including the rejection of time-, filesystem- or iteration-order-dependent output.', 'complete', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193MA6W1FT1K795SGD2F040', '01M193CZBACY1KZJ264E2ZH76G', 1, 'Write the module sweep', 'Imports every file under `src/` and `bin/` with plain `node` and reports any specifier that does not resolve.', 'complete', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193MC9R2G5MBSG57NZ6H05R', '01M193CZBACY1KZJ264E2ZH76G', 2, 'Wire the sweep as a step separate from the test suite', 'Addresses the separation NFR5 requires, and is the reason a bad specifier in a module nothing imports is still caught.', 'complete', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193MDV390QBCWZZGVMYCEXJ', '01M193CZBACY1KZJ264E2ZH76G', 3, 'Write tests for "Enforce import-extension discipline with a module sweep"', 'Includes the control check: a deliberately extension-less internal import must make the sweep fail.', 'complete', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193MFSMKYDZR20T4DRT2NN8', '01M193D0TS9VBQKYHW2PWPFMXX', 1, 'Add the CI workflow running suite, type check and sweep on Node 24', 'On every push, under plain `node`, with the run observable in the repository''s CI history.', 'complete', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193MHAAK0602883ANX12NWJ', '01M193D0TS9VBQKYHW2PWPFMXX', 2, 'Provide the disposable isolated environment job', 'No language toolchain present, networking controllable. Consumed by the clean-install check in the plugin-entry epic and the offline cycle in the publish epic.', 'complete', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193MJNJQMCGC6TDXMYPQQPH', '01M193D0TS9VBQKYHW2PWPFMXX', 3, 'Write tests for "Stand up CI on Node 24"', 'Covers the criteria tagged `integration`: the workflow declares Node 24, runs all three checks, and the isolated environment job exists.', 'complete', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194N6Y45FV8MSVTV5W6VF47', '01M194E5SEXMD6W90PSM0ATR4J', 1, 'Add @opencode-ai/plugin at the beta tag and scaffold the Plugin.define entry', '`src/index.ts` only. The transforms are tasks 2 and 3.', 'complete', 'The SDK is a devDependency taken import-type-only, so `dependencies` stays `{}`; the entry is a plain object with `satisfies Plugin.Plugin` rather than a `Plugin.define` call, per the amendment to criterion 1.', 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194N8XEDQJ6H0MW4789PD4Z', '01M194E5SEXMD6W90PSM0ATR4J', 2, 'Register the MCP server via ctx.mcp.transform', 'A local server entry whose command runs the packaged `dpm-mcp`. Addresses the server, not skills or commands.', 'complete', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NA95NB4HBSSD76FM96N1', '01M194E5SEXMD6W90PSM0ATR4J', 3, 'Compute the registration set from a profile selection', 'The seam the profile decision requires. Addresses how the list is derived, not what the deferred lite profile eventually contains.', 'complete', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NCD15EEG1KKCBY99AWB1', '01M194E5SEXMD6W90PSM0ATR4J', 4, 'Verify registration in a scratch OpenCode v2 project', 'Manual observation of connected state, recording what the host actually did rather than what the API documents.', 'complete', 'Observed in a throwaway project: `dpm (active)`, `✓ dpm connected`, and all 23 skills registered under `dpm-` ids with directory locations. Three findings the spec did not have: the config key is `plugins` not `plugin`; `package` is import()ed as a path so a directory does not resolve and the entry file does; and the host runs the TypeScript source directly. Nothing was written to the project or to the user''s global config.', 3);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NDRPWWV4TTFYGV8SMARN', '01M194E5SEXMD6W90PSM0ATR4J', 5, 'Write tests for "Plugin entry, MCP registration and the profile seam"', 'Covers the criteria tagged `unit` and `integration`, including both rejections: no hardcoded skill list, and no transform writing to project configuration.', 'complete', NULL, 4);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NFV9RW9K2KM044BFEN1M', '01M194E73NGKXF2ZJYSE0S5GZ3', 1, 'Observe the rendered tool names against a running beta host', 'Namespacing and character substitution. The first implementation task of this milestone, because skill bodies name tools.', 'complete', 'Observed against opencode2 v0.0.0-beta-18684: `<server key>_<tool>`, a single underscore, no `mcp__` prefix and no plugin segment. Substitution established by registering a second server as `dpm-odd.name x` and reading back `dpm-odd_name_x_adopt_session` — hyphen survives, everything outside `A-Za-z0-9_-` becomes `_`.', 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NHW9JTNDPN3FZE27A3ZE', '01M194E73NGKXF2ZJYSE0S5GZ3', 2, 'Record the naming as a section on this epic', 'The reference the twenty-three skill bodies are rewritten against in the skill-port epic.', 'complete', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NKA5SVE9W69XA4S3ZZYZ', '01M194E73NGKXF2ZJYSE0S5GZ3', 3, 'Snapshot the tool surface and compare against v0.7.0', 'Addresses the advertised set and every schema, not the rendered naming.', 'complete', 'The snapshot is a real oracle rather than a self-portrait: `tests/fixtures/v070-tool-surface.json` was captured by running `bin/dpm-mcp.js` from the installed marketplace package at v0.7.0. The port''s 183 tools are byte-identical to it — every name, description and input schema. `parity-v070.test.js` now refuses to let the file be modified or deleted.', 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NMQ6CDD48BWXEE7YPAH0', '01M194E73NGKXF2ZJYSE0S5GZ3', 4, 'Write tests for "Establish the effective MCP tool naming under v2"', 'Covers the snapshot comparison and the recorded section. The observation itself is tagged `manual`.', 'complete', NULL, 3);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NQGMF3D1Z1MZA5MD0CP4', '01M194E8W7MJQ0WMEANHJ3YRZQ', 1, 'Register one sample skill with a package location and test whether it resolves the shared conventions file', 'Addresses supporting-file resolution only. A full skill port is the next epic.', 'complete', 'Answered by probe against opencode2 0.0.0-beta-18684: `location` and `content` are stored verbatim, the registry rewrites nothing, and a relative `dpm/shared/` path resolves against the project directory where it does not exist. Whether the host hands the model a base directory for sibling reads could not be established — it needs a model turn and no provider was reachable — and the decision taken makes the question moot.', 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NRT5VBJSFFBKFYJVWK3Q', '01M194E8W7MJQ0WMEANHJ3YRZQ', 2, 'Record the go/no-go as a written decision on this epic', 'On a negative answer the decision names inlining the shared conventions into twenty-three skills as the fallback, and states its cost.', 'complete', 'Recorded as section "Skill supporting files: the go/no-go" on epic 01-02, before any skill prose was rewritten. It names the inlining fallback and prices it in a table — 23 drifting copies, ~15KB per body, model context on every invocation — and adds the reason the specification could not have known: inlining defeats the per-procedure tool resolution `tests/support/skills.js` performs.', 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NTCCAQQ20PGQ8V26806K', '01M194E8W7MJQ0WMEANHJ3YRZQ', 3, 'Write tests for "Resolve the skill supporting-files go/no-go"', 'Covers the recorded-decision criterion. The resolution itself is tagged `manual`.', 'complete', '`tests/skill-supporting-files.test.js`, six tests. Four cover the resolution — every registered body names a shared path that opens, the relative form is gone from what the host is handed, the substitution refuses a missing target, and a planted package resolves against itself while the project directory holds nothing. Two cover the recorded decision, read from the projection rather than the database. The refactoring pass extracted `tests/support/package-tree.js` from the builder this file and `plugin-entry.test.js` had both grown.', 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NW80HGRERHNRN43MG6TS', '01M194EA95B25V3M2MCBC35A1J', 1, 'Pin the dependency set to @opencode-ai/plugin@beta and nothing else', 'Addresses `dependencies`; devDependencies are unaffected.', 'complete', '`dependencies` is `{}` and `devDependencies` is exactly `@opencode-ai/plugin@0.0.0-beta-18684`, `@types/node@24.13.3`, `typescript@5.9.3` — all three pinned to exact versions with no range operator. The SDK entry landed in story 1; what this task added is the amendment of criteria 1 and 4, recorded on the epic with the `define`-is-identity citation and the eight transitive dependencies it would otherwise pull in.', 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NYCVYCFG8EVBGW0EHX4W', '01M194EA95B25V3M2MCBC35A1J', 2, 'Run the clean install in the disposable environment', 'No C or C++ toolchain and no Python present. Consumes the isolated environment job from the bootstrap epic rather than asserting by inspection.', 'complete', 'Run, with a qualification stated rather than glossed. There is no container runtime on this machine — no docker, podman, colima, nerdctl or finch — so the isolated job could not be executed here, and pushing to make CI run it is the user''s call. What was run instead is the clean install with `PATH` cut to Node''s own `bin`, so `cc`, `gcc`, `g++`, `make`, `python`, `python3`, `node-gyp` and `clang` were all unreachable: `npm ci --foreground-scripts` exited 0, added 98 packages, and left no `gyp info`, no `node-gyp rebuild`, no `prebuild-install`, no `build/Release` and no `.node` anywhere. `msgpackr-extract`''s install script ran and selected a prebuilt rather than compiling, which is the behaviour story 1 rewrote the CI grep for. `npm ci --omit=dev` created no `node_modules` at all. The container run is outstanding on the next CI push.', 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NZVDP7B3CA5XWNDQA46R', '01M194EA95B25V3M2MCBC35A1J', 3, 'Write tests for "Zero runtime dependencies and no native compilation"', 'Covers the dependency count, the beta pin, and the rejection of a `.node` binary or compile step in the install tree.', 'complete', '`tests/dependency-isolation.test.js`, five tests, all passing. The reading is the lockfile, which no other test file had opened: all 107 non-root entries carry `dev: true`, so the production install tree is empty by construction rather than by a sweep that found nothing. The must-NOT names `msgpackr-extract` as the one package declaring an install script and asserts it is dev-only with optional prebuilts, instead of the stronger-sounding and false claim that no install script exists anywhere. Suite is 1039 passing, typecheck clean, module sweep clean.', 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194P1KHV8B3FZMY5NP60PGZ', '01M194EBJHMAV5E7KCK0PA0GKF', 1, 'Run the end-to-end milestone-2 check in a scratch project', 'One install: connected server, tool names matching the recorded naming, sample skill resolving its supporting files, and registrations surviving a host reload without duplication.', 'complete', 'Run in a throwaway project against opencode2 0.0.0-beta-18684. `✓ dpm connected` on three consecutive checks; 195 tools advertised, 183 of them `dpm_`-prefixed and 12 host built-ins, none carrying the old `mcp__` form; 55 skills registered of which 23 are dpm''s, all `dpm-` prefixed, no duplicate id; `location` is the package directory and 23 of 23 conventions references are absolute paths that open. A host restart loaded the entry twice — that count is the control that a reload happened — and left the registry identical. The scratch project was deleted; nothing was written outside it. Recorded on the epic as "Milestone 2, run end to end in a scratch project", including the correction that `plugins` is an array rather than a map.', 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194XRSHJ9N4GZAVN4FVHE4G', '01M194V4CBNMW9KRVBHS83R3DM', 1, 'Port the dpm-spec skill body', 'ID prefix, tool names taken from the naming recorded in the plugin-entry epic, and invocation prose. One skill only — the batch pass is the next story.', 'complete', '32 tool references rewritten to the dpm_ form, the front-matter trigger sentence replaced with the id-based invocation, and the two cross-references moved off /dpm:. Reverse-transforming the ported file and diffing it against the v0.7.0 oracle leaves exactly three differing lines — the description and the two cross-references — so no procedure prose was disturbed. The dpm/shared/skill-conventions.md line is untouched, as epic 01-02 resolves it at registration. Five test files moved onto the transition''s either-form matcher first (support/skills.js, support/body-reads.js, skill-do, skill-retrofit, reachability); skill-spec''s description assertion now checks both directions. Suite 1042/1042.', 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194XT403548NA806GX413X3', '01M194V4CBNMW9KRVBHS83R3DM', 2, 'Register it and run it end-to-end in a scratch project', 'Exercises gates, tool calls and the shared conventions file, which is why this skill is the pilot.', 'complete', 'Run in a throwaway project outside the checkout, deleted afterwards. Registered: 55 skills of which 23 are dpm''s; dpm-spec present with id dpm-spec, name spec, location the skills/spec directory. Its registered content carries the conventions reference as the absolute /Users/chris/Work/git/opencode-dpm/shared/skill-conventions.md, zero legacy tool references and zero /dpm: references. Host tool registry: 195 tools, 183 dpm_-prefixed; all 24 tools the ported body names are present, none missing. dpm_create_spec was taken from the host''s registry by its dispatched id and executed, and returned a persisted row in the scratch project''s database — the real project''s database still holds one spec and was not touched. An `opencode2 run` told to load id dpm-spec did load it (the transcript shows Skill "spec") and then reached for exactly the substituted absolute path. NOT reached: a competent model driving the facilitation to its first gate — the local provider refuses connections and the free hosted models wandered, one of them shelling into the real checkout, so that route was stopped rather than retried. FINDING: opencode2 auto-rejects the conventions read in a non-interactive run — external_directory (/Users/chris/Work/git/opencode-dpm/shared/*) — because registration-time substitution points outside the project directory. It needs permission.external_directory to allow it, or an interactive approval.', 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194XVEV2D5G0QPJV059DCHY', '01M194V4CBNMW9KRVBHS83R3DM', 3, 'Record the rewrite pattern as a section on this epic', 'What the batch pass applies twenty-two more times. Addresses the pattern, not any individual skill.', 'complete', 'Section "The skill rewrite pattern, established on `spec`" recorded on the epic: the four edit classes with their remaining counts (424 tool references, 22 descriptions, 101 cross-references, and the conventions line as a deliberate non-edit), the invocation form as established rather than as assumed with the wrong premise written down beside it, what the pilot proved in the running host, the external_directory finding, ralph''s stop-hook exception, and the test-side transition with its tripwire.', 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194XXEYCW9GMEYG3S93HTJV', '01M194V4CBNMW9KRVBHS83R3DM', 4, 'Write tests for "Pilot the spec skill end-to-end"', 'Covers the recorded-pattern criterion. The facilitated run itself is tagged `manual`.', 'complete', 'tests/skill-pilot.test.js — 5 tests: the pattern is in the projection carrying the prefix rule, the invocation form and the slash correction; the pattern is ahead of the batch pass; every tool the pilot names resolves against spineTools with a control on the old-prefix reading; the pilot names no Claude Code mechanism, driven against three planted breaches; and the tripwire — bodiesOnLegacyForm() is exactly the 22 unported skills, checked in both directions. Registered in suite-integrity''s ADDED list. Suite 1047/1047, tsc clean, module sweep clean. The oracle diff stays a manual check: vendoring.test.js forbids any source from naming the marketplace checkout, and a test that passed silently when the released copy was absent would be worse than none.', 3);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194XZEVM6ZBBJQ6RAHJEKCA', '01M194V5Q15F8TQR44DPVPJBRY', 1, 'Apply the rewrite pattern to the remaining twenty-two skill bodies', 'Addresses prose — IDs, tool names, host mechanics. Registration is task 2.', 'complete', 'All 22 remaining bodies plus shared/skill-conventions.md and shared/status-model.md rewritten with the Edit tool, file by file: 424 tool references to the dpm_ form, 22 descriptions to `Invoke with the skill tool, id "dpm-<name>".`, 101 `/dpm:X` references to `dpm-X`. Proved surgical by reverse-substituting the prefix and diffing every body against released v0.7.0 — 0 differing lines for all 22 and for shared/skill-conventions.md. `grep -rn "/dpm:" skills shared` and `grep -rn "mcp__plugin_" skills shared` both return nothing. The one exception is skills/ralph/SKILL.md, whose 5 references to `.claude/ralph-loop.local.md` and 14 to the stop hook name a mechanism that was never shipped even in v0.7.0 and has no v2 equivalent; Chris decided ralph stays registered and criterion 5 is recorded unmet for it alone.', 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194Y0SG5F09MSMQK4SM878N', '01M194V5Q15F8TQR44DPVPJBRY', 2, 'Register all twenty-three via ctx.skill.transform with a package location', 'Addresses the transform and the `dpm-` prefix, through the profile seam rather than a hardcoded list.', 'complete', 'Delivered by epic 01-02''s entry: src/plugin/skills.ts discoverSkills() reads the tree rather than a list, mints `dpm-` IDs from ID_PREFIX, takes `name` from the front matter and sets `location` to the package directory; src/plugin/index.ts:58 computes the list through the profile seam (profileFrom(context.options).skills(...)) before either transform runs, then draft.add()s each inside context.skill.transform. Nothing to build in this story; verified by task 3''s scratch run and covered by plugin-entry.test.js.', 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194Y2VA7BHW4QV9H1DT2094', '01M194V5Q15F8TQR44DPVPJBRY', 3, 'Verify the registry and supporting-file resolution in a scratch project', 'Manual observation of what the host registered and what each skill can read.', 'complete', 'Ran against opencode2 v0.0.0-beta-18684 in a throwaway project outside the checkout, with a probe plugin reading the host''s own skill, tool and mcp registries (the HTTP /api/skill route returns [] for plugin-registered skills, so the probe is the only reader). Observed: 55 skills registered, 23 of them dpm''s, every one `dpm-` prefixed; each location inside the installed package directory; the MCP server reached connected; 195 tools registered of which 183 carry the `dpm_` prefix. Every tool name appearing across all 23 bodies resolved against that registry — zero unresolved. Zero legacy `mcp__plugin_` prefixes, zero `/dpm:` references, 23 descriptions naming the skill tool. All 24 `dpm/shared/...` references had been substituted to absolute paths that exist and open. Scratch project deleted; nothing written outside it.', 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194Y4AZD2TWHEPAT0VWDHY2', '01M194V5Q15F8TQR44DPVPJBRY', 4, 'Write tests for "Port and register all twenty-three skills"', 'Covers the computed registration list, the package `location`, and both rejections — no Claude Code mechanism and no SQL in a skill body.', 'complete', 'Added tests/skill-port.test.js (3 tests) for criterion 5: the four host mechanisms swept over the whole tree-walked corpus plus both shared/ files; the recorded ralph gap asserted to be exactly ralph and exactly 5 occurrences of the stop-hook path, with ralph held to the full standard on everything else; and the sweep driven against 5 planted breaches (one per pattern plus .claude-plugin) with 4 ported forms proving it is a reading rather than an allow-list. Registered in suite-integrity.test.js''s ADDED. The other five criteria are read elsewhere and not restated: criteria 1 and 3 in plugin-entry.test.js (the computed list, the dpm- prefix, location inside the package), criterion 6 in skills-corpus.test.js with its own controls, criteria 2 and 4 are manual and the scratch run is their evidence. Suite 1048 passing, tsc clean, module sweep clean.', 3);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194Y6F5VEE8EXK6A7AV3VS3', '01M194V710KP0J5V188YR3EBDX', 1, 'Rewrite every skill''s invocation prose for skill-first invocation', 'Addresses how a skill is started, not what it does once started.', 'complete', 'The invocation prose that story 2 left behind was `$ARGUMENTS` — Claude Code''s slash-command argument substitution, present in all 23 bodies at 30 sites, and outside story 2''s must-NOT because that list named the four mechanisms anyone thinks of. Established from two independent sources that v2 fills it with nothing (the skill tool takes the ID alone and adds the body verbatim; Skill.Info carries no argument field, and the token appears nowhere in the installed host), so left alone a model would read a literal string that binds to nothing and invent a value rather than error. Rewrote all 30 sites to "the request", reworded per site, plus 3 sites saying "argument" meaning the invocation (clean, ralph, shared/skill-conventions.md); every other use of the word means a tool parameter and was left. Recorded the decision and its evidence as a section on epic 01-03. The oracle diff now stands at 123 differing lines across the 23 bodies and shared/skill-conventions.md, all of it invocation prose: 23 descriptions + 65 dpm- lines (story 2) + 33 request lines + 2 reworded (story 3). One test moved with the prose: skill-status.test.js:389. Suite 1047 passing.', 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194Y89TA9XQE9926WSMA02N', '01M194V710KP0J5V188YR3EBDX', 2, 'Walk each of the twenty-three invocations in a scratch project', 'The affordance check: every skill is reachable by its documented invocation, not merely present in a registry.', 'complete', 'ASSUMED, NOT OBSERVED — Chris''s decision, to be settled once the epic is complete. The walk was built as a probe plugin that takes the host''s own built-in `skill` tool from its registry and calls execute({ id }) once per dpm skill with a real sessionID, asserting on what comes back: the body is that skill''s, its dpm/shared reference resolved to an absolute path, and no $ARGUMENTS survived. That is the documented v2 invocation executed directly rather than driven through a model. It did not produce a report: the first run wrote one but read zero dpm skills from the registry at 3s, and every run after wrote nothing because `opencode2 service start` kept attaching to the already-running server instead of cold-starting with the revised probe, and the host''s hot-reload path died once with "failed to reload plugins: TypeError: v is not a function". Four attempts, no usable output. What IS observed, from story 2''s scratch run: all 23 register with exactly these ids, dpm- prefixed, locations inside the package, MCP connected. What is unobserved is the last hop — that calling `skill` with one of those ids returns that body — which is host behaviour the docs specify and nothing in dpm affects. The probe survives at scratchpad/walk/probe.js.', 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194Y9WGT9XSKRPJKRCW11B9', '01M194V710KP0J5V188YR3EBDX', 3, 'Write tests for "Invocation without slash commands"', 'Covers the prose criterion across all twenty-three bodies. The walk itself is tagged `manual`.', 'complete', 'Added tests/skill-invocation.test.js (3 tests) for criterion 1: every one of the 23 descriptions ends with the invocation sentence carrying ITS OWN registered id, built from ID_PREFIX in src/plugin/skills.ts rather than written down, with a three-way control that the reading tells a wrong id from a right one and a missing sentence from a present one; no body and no shared file names $ARGUMENTS, driven against three planted breaches in the shapes the port actually removed, with the replacement form shown not to trip it; and the pairing that stops deletion passing as a fix — every body still names "the request", so a body that lost its argument contract entirely fails rather than passing the absence check. The /dpm: half of the criterion is skill-port.test.js''s corpus sweep and is not repeated. Registered in suite-integrity.test.js''s ADDED. Criterion 2 is manual and its evidence is the walk, not a test. Suite 1050 passing, tsc clean.', 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194YB5TG8EXGVY14WQTHRZK', '01M194V89DXC10121AWAN7KZ5N', 1, 'Write the skill-body check', 'Claude Code mechanisms and SQL statements, over every body under `skills/`.', 'complete', 'Added scripts/skill-body-check.ts, following scripts/module-sweep.ts''s shape: walks skills/ by directory listing plus every .md in shared/, sweeps each for host mechanisms and SQL, reports the file and the sentence for each problem, exits 1. Takes an optional root argument so it can be driven against a tree that is wrong on purpose, and guards its own entry point so importing it does not exit. Two things it does beyond the criterion: it checks a fifth pattern, $ARGUMENTS (story 3''s finding — the argument half of the same slash-command mechanism), and it carries a floor refusing a tree of fewer than 20 files, because an empty corpus trips no pattern and would otherwise print the clean message. The SQL patterns are imported from tests/support/skills.js rather than restated, and HOST_MECHANISM is exported from here and imported by skill-port.test.js, so the sweep and the enforcement of the sweep cannot disagree. Ralph''s recorded gap is a named constant, subtracted for that one file only and printed on every successful run rather than hidden.', 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194YDN9M17H79N8AMQ8W2RC', '01M194V89DXC10121AWAN7KZ5N', 2, 'Wire it into the CI workflow', 'Alongside the suite, the type check and the module sweep. The spec requires enforcement, not a review convention.', 'complete', 'Declared as `npm run skills` in package.json and added to the `checks` job in .github/workflows/ci.yml as a named step beside the suite, the type check and the module sweep — the same four commands a contributor runs, rather than an inlined node invocation that would drift from the script silently. Not folded into `npm test`: the specification asks for a check that fails the build, and a named step puts the rule''s name in the failure output.', 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194YEZ7VG8GJ064JRCGAWVF', '01M194V89DXC10121AWAN7KZ5N', 3, 'Write tests for "Enforce the skill-body prohibitions in CI"', 'Includes the control: a planted Claude Code mechanism must make the check fail.', 'complete', 'Added tests/ci-skill-body.test.js (6 tests), which spawns the script as a process and reads the exit status CI reads — not the return value, because the two ways a check goes useless (every pattern silently stopping matching, and a non-zero result never reaching the exit code) are both invisible to an in-process assertion. Each breach is planted in its own generated 23-body tree via packageTree, so nothing is planted in the real corpus. Covers: the clean-corpus control first, so a failure below is the breach and not the harness; the floor, shown by a two-file tree being refused; all five host mechanisms one case each, asserting the exit status, the reason and the file named; a mechanism in shared/skill-conventions.md alone, which every body reads and a per-body sweep would pass; five SQL statements; and the wiring, that CI runs it as the package.json script rather than inlined, in the checks job beside the other three. Registered in suite-integrity.test.js''s ADDED. One existing test moved: ci.test.js:113 hard-coded the three script names and now reads the property it was written for — nothing is declared and not run.', 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194YGE31R8XCZNJ8M9B3KKY', '01M194V9HR3KH3XB66JEG6651N', 1, 'Run the end-to-end milestone-3 check in a scratch project', 'Twenty-three skills registered, supporting files resolving from the package, each startable by its documented invocation, and the CI checks green over every body.', 'complete', 'Three of the criterion''s four limbs are observed; the fourth is not, and is the same open item story 3 task 2 carries. OBSERVED, from story 2''s scratch run against opencode2 v0.0.0-beta-18684: 23 skills registered, every id dpm- prefixed, every location inside the installed package; all 24 dpm/shared references substituted to absolute paths that exist and open; MCP connected, 195 tools of which 183 dpm_-prefixed, every tool name across all 23 bodies resolving. OBSERVED locally, and CI will repeat it on push: npm test 1056 passing, npm run typecheck clean, npm run modules clean, npm run skills clean over all 25 files. NOT OBSERVED: that each skill is startable by the documented invocation. Seven attempts. What they established, which is worth having: plugins load lazily, so a freshly started server registers nothing until something asks it to (this is why attempts 2-5 wrote no report at all); and `ctx.skill.transform(cb)` returns a Registration carrying only `dispose`, NOT the callback''s value — a probe reading the return value sees an empty registry, which looks exactly like a host that registered nothing. The closure form that story 2 used is correct, but under it the transform never resolves in this probe, so the walk hangs before its first write. That is host behaviour in a beta build; the last hop it would prove is that calling `skill` with a registered id returns that body, which the v2 documentation specifies and which nothing in dpm affects. Probe kept at scratchpad/walk/.', 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955951KMQT3RRNZMCM4VXG', '01M1951C1R30C8CQABYF7YZJ82', 1, 'Port the guard to the v2 hook path', 'Regenerate-and-compare is unchanged in kind. Addresses where the hook lives and what it invokes, not what it decides.', 'complete', 'The hook path and the executable were already v2 — epic 01-01 converted `hooks/pre-commit` to invoke `node .../bin/dpm-guard.ts` and the hook resolves its own symlink chain before doing so. What was not ported was what the guard tells the reader to invoke: `describe()`''s divergence branch ended `or run /dpm:publish if you are already in a session`, a Claude Code slash command that v2 does not mint. Replaced with the v2 invocation — the built-in skill tool and the registered id — as a new `PUBLISH_SKILL` export composed from `ID_PREFIX`, imported from `src/plugin/skills.ts` so the prefix has one definition. The skill name stays written rather than derived from `COMMANDS.publish`, because tying a skill id to a binary filename would point it at a skill nobody registered the day the binary is renamed; `guard-fix.test.js` asks the filesystem for the skill body instead, the same way it already asks for the binary.', 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955BB3VDPFNHDS177H20FF', '01M1951C1R30C8CQABYF7YZJ82', 2, 'Carry over the missing-symlink warning on server start', 'Addresses the warning path in the server, not the guard''s own refusals.', 'complete', 'No code change was needed and the check is what says so rather than a reading. `open()` still asks `unguardedMessage` about the database directory and puts the answer on stderr, and the v2 registration does not disturb it: `localServer()` registers `node <root>/bin/dpm-mcp.ts` as a local MCP server, which is the same stdio subprocess Claude Code spawned, so stderr still reaches the host''s log. What was missing was evidence — `hook-check.test.js` drives `open` with the check injected, which establishes that whatever the check says reaches stderr and not that the real check says anything. The new file drives the real composition both ways. One v2 question is left with story 3, where its criterion already sits: the default location is relative (`.dpm/dpm.db`), so which directory OpenCode gives a spawned MCP server as cwd decides which repository this warning is about.', 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955CQWNRED1QPQAC1EN5TG', '01M1951C1R30C8CQABYF7YZJ82', 3, 'Write tests for "Guard at OpenCode''s hook path"', 'Covers the four distinguishable refusal cases, the stale-commit refusal in a temporary repository, and the rejection of any working-tree write.', 'complete', '`tests/guard-hook-path.test.js`, five tests. The two the story lacked entirely: `git --version` at or above 2.9 with the comparison driven against 2.8.6 and 1.9.0, and the real `unguardedMessage` reaching stderr through the real `open()` — paired with a guarded repository that stays silent. The four refusals are compared to each other rather than each to a string, since four assertions that each pass against one constant is what "distinguishable from the other three" rules out. The last test sweeps all four refusals and the clean line with `HOST_MECHANISM` imported from the CI check, and its control is the sentence this story replaced. That control earned its place: matching the bare id `dpm-publish` reported the skill as offered in the unknown case, because it is a substring of `bin/dpm-publish.ts` — the same shape retro 02 recorded from the other side. Fixed by exporting the phrase `PUBLISH_INVOCATION` and matching on it, in this file and in the two existing assertions that had the same latent bug.', 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955ESB47XQRZF5JWSWAC0X', '01M1951DJH04XXS5ZN0Z3GBDSB', 1, 'Install the plugin from git and observe where the package lands', 'A real install rather than a reading of the documentation, since this decides whether the symlink instruction is correct.', 'complete', 'Installed for real, into an isolated XDG root so the user''s own OpenCode config was not touched: XDG_CONFIG_HOME/XDG_DATA_HOME/XDG_CACHE_HOME pointed at a scratch directory, then `opencode2 plugin add github:ninthspace/opencode-dpm`. The package landed at $XDG_CACHE_HOME/opencode/packages/git-fb2f92df…/node_modules/opencode-dpm/, and the directory name is not opaque — sha256 of the literal specifier string is fb2f92df39b7c4694b7ec16c3d37931dcf7714f676af4abaade9056b7b090f8c, matching byte for byte. Confirmed a second time by installing `github:ninthspace/opencode-dpm#main`, which produced a second directory whose name is sha256 of that string. `hooks/pre-commit` ships in the tree at mode 100755, and `src/plugin/` arrives whole. Two things did not go as expected and are recorded rather than chased: `opencode2 plugin list` reported "No plugins found" twice against a config declaring two, and the host log shows only CLI starts — no plugin load — so nothing here establishes that a git-installed plugin registers, only where it lands.', 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955G83NDQ0PV74XC3KPHN4', '01M1951DJH04XXS5ZN0Z3GBDSB', 2, 'Record the location as a section on this epic', 'What the README''s symlink instruction is written against.', 'complete', 'Recorded as the section "Where OpenCode puts a git-installed plugin" on epic 01-04. It carries the path, the hash derivation with both confirmations, what the absence of a version in the path changes about the guard''s stale-link story — marked as a derivation rather than something observed, since showing an upgrade in place needs a commit upstream this run could not produce — and the two probes that returned nothing.', 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955J411EER1YJ4SQ4HZYF6', '01M1951DJH04XXS5ZN0Z3GBDSB', 3, 'Write tests for "Confirm the package cache location and the symlink target"', 'Covers the documented instruction resolving to an existing file. The observation itself is tagged `manual`.', 'complete', '`tests/package-cache.test.js`, four tests, plus the README rewritten in all five places the old `~/.claude/plugins/cache/*/dpm/*/hooks/pre-commit | sort -V | tail -1` appeared. The instruction is extracted from the README and executed rather than transcribed, so a command that ships and a command that is tested cannot differ. The cache is built under a scratch XDG_CACHE_HOME rather than found: the real one exists only on a machine that has installed the plugin, and reaching for it would pass here and skip in CI, which is the false pass this project keeps rediscovering. Three controls — an empty cache leaves no working hook (since `ln -s` succeeds against a target that does not exist), two installs of different ages resolve to the newer, and the clone-form instruction the reading deliberately excludes is named rather than counted out. The last test reads the package name from `package.json` and asserts the cache root is `${XDG_CACHE_HOME:-$HOME/.cache}` rather than a hard-coded `~/.cache`.', 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955M860YXX9K7J3QY1GE58', '01M1951FE5F4G1PTK9BF5WNW7Q', 1, 'Audit what was per-session scratch keyed by an environment variable', 'Names each site and whether a database session row already answers it. Addresses the inventory, not the migration.', 'complete', 'The audit found nothing that was per-session scratch keyed by an environment variable. The plugin reads exactly two variables, both inherited unchanged from v0.7.0: `DPM_READ_ONLY` in `src/server/read-only.ts` — a launch mode resolved once at bring-up and passed down — and `DPM_DATABASE` in `src/db/location.ts` — a path override read at module load because it is a process-level setting. `src/server/warnings.ts` names `NODE_NO_WARNINGS` only in prose explaining why it cannot be set from inside the process, so it is not a read. No `CLAUDE_`-prefixed variable is read anywhere in the plugin; `suite-integrity.test.js` already holds that, established in epic 01-01. The per-session state dpm does keep is the `session` table, which the criterion explicitly exempts. Checked before concluding, per the retro lesson about criteria naming mechanisms: `ctx.storage` does exist — the SDK''s `StorageDomain` carries get, set, remove and scan — so the criterion names something real and simply has no candidate to move into it.', 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955NMTW0K5TDDQF5DCBGGS', '01M1951FE5F4G1PTK9BF5WNW7Q', 2, 'Move the remainder to ctx.storage', 'Only what the audit found unanswered by a session row. A row that already holds the fact is left alone.', 'complete', 'Nothing to move, so nothing was moved — and the task''s own description says so: "only what the audit found unanswered by a session row". Adding a `ctx.storage` call with no state to put in it would be a mechanism with no caller, which is worse than none: the next reader would take its existence as evidence that something needs it. What the story delivers instead is the enumeration that makes "nothing to move" checkable, and a tripwire — a new environment read fails `session-scratch.test.js` until somebody classifies it as scratch or not.', 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955QR6MG9EQMTMCBR9Y73Q', '01M1951FE5F4G1PTK9BF5WNW7Q', 3, 'Write tests for "Session scratch via plugin storage"', 'Covers the storage criterion, the `.dpm/` first-run behaviour, and the rejection of any transient file landing in the project tree.', 'complete', '`tests/session-scratch.test.js`, four tests. The first enumerates rather than asserts a negative — a criterion with an empty antecedent is satisfied by doing nothing, and an empty sweep, a regex that stopped matching and a genuine absence are three facts wearing one empty array — so it names the set, holds it equal to the classification table, and drives the reading against three planted sources including one where the variable appears only in a comment. The second asserts the exemption the conclusion rests on: the session tools exist and a row carries a state blob, so "a database session row is already the answer" is a fact rather than an assumption. The third takes a fresh repository from first run to two publishes and asserts the dump was rewritten, not merely written. The fourth walks everything on disk after a full run and requires each file to be a committed artefact or ignored, with a planted `dpm-loop.local.md` proving the reading reports one when there is one. One thing this does NOT establish, and it is left with the story rather than claimed: `DATABASE` is relative, so which directory OpenCode gives a spawned local MCP server as cwd decides which repository `.dpm/` appears in. That is a fact about the running host and no `integration` criterion here reaches it.', 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955SV6A5BG6YRVCAFHHGJW', '01M1951GSMQ3JY8MJAX204ZEY0', 1, 'Rewrite install, first run, guard symlink and "when the guard refuses"', 'For an `opencode2` audience, against the cache location story 2 confirmed and the refusal behaviour story 1 delivers.', 'complete', '**Requirements** now names OpenCode v2 as the host and Node **24**, not 22.5.0 — the floor moved when the port went to native type-stripping and `src/server/node-floor.ts` has said 24 since epic 01-01, so the README had been a release behind the thing it documents. Both reasons are given, because either alone would set the floor.

**Installation** is `opencode2 plugin add github:ninthspace/opencode-dpm`, replacing the two `/plugin marketplace` lines. The paragraph after it is the fact story 2 established and nothing else documents: the specifier string *is* the identity of the install, because OpenCode names the package directory for a digest of it, so a tag and a branch are two installs of the same repository cached and upgraded separately. That matters for exactly one thing — which install the pre-commit symlink points into — and it says so and sends the reader to First run. The develop-on-DPM route became a `plugins` entry naming the entry *file*, since `{ "package": … }` wants a file and a directory silently fails to load.

**First run** step 2 no longer says `/dpm:publish`; it asks for the `dpm-publish` skill. The paragraph on the guard''s refusal now says `node <package path>/bin/dpm-publish.ts` and explains that the path in the message is the absolute one the guard was loaded from, which is what `fileURLToPath` actually produces. Every remaining `<plugin path>/dpm/` became `<package path>/`, in "when something else owns the hook" as well, and that section gained the `ls -dt` one-liner that resolves it — it told a reader to paste a path into a `pre-commit` framework entry and a wrapper script without saying how to find one.

**When the guard refuses** keeps its three commands, which `findable.test.js` binds to `COMMANDS`, and its publish case now names the skill in the wording the refusal itself uses — story 1''s `PUBLISH_INVOCATION`.

Two things found while doing it, neither of them in the task title.

The **TL;DR** carried "Re-make that symlink after every DPM upgrade", which is Claude Code''s mechanism and is wrong here: an upgrade of the specifier you linked against rewrites that directory in place and the link survives. It is replaced by the specifier-digest rule. A stale paragraph in First run said the glob "picks the highest version number", also Claude Code''s, and directly contradicted the `ls -dt` two paragraphs above it — story 2 rewrote the commands and missed this prose.

**The board section documented a directory this package does not contain.** `tools/board/` is in the v0.7.0 oracle and was never tracked in this fork — `git log --all -- tools/` is empty — so the README gave two `uv run` commands against files that are not there and linked a `tools/board/README.md` that does not exist. Its headline feature is a keypress that launches the right `/dpm:*` session, which is a Claude Code mechanism with no v2 equivalent, so it does not port as written either. Removed, with the Status table''s row changed to say the board is not carried. Re-porting it is a decision for a later spec, not a README edit.', 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955VY7EQ3K787H8ZGE5V7V', '01M1951GSMQ3JY8MJAX204ZEY0', 2, 'Remove the CPM MIGRATION.md', 'It does not carry over. Anyone on CPM migrates via the existing Claude Code dpm first.', 'complete', '`MIGRATION.md` is gone from the working tree, and the two documents that pointed at it now say where the guide lives instead. The deletion is unstaged: version control is the user''s.

**"Coming from CPM" survives, and that is deliberate.** The migration guide does not port — the move it describes happens while CPM is still installed, under Claude Code, which is not this host — but the one paragraph a reader cannot afford to skip does: the `git mv` that puts a CPM corpus out of the projection''s reach before the first publish offers to delete it. That instruction is about *DPM''s* reclaim rule, so it belongs with DPM wherever DPM runs. The section now opens by saying to migrate under Claude Code first and come here afterwards, and closes by sending the rest of the conversation there rather than to a file this package does not carry.

**`tests/cpm-corpus.test.js` read that file, and had to change with it.** Its `audit` held two documents to the same outcome *and to each other*, and the second document was `MIGRATION.md`. Rather than deleting the agreement check, `audit` now takes the documents as a **map** and reports each by name: the live call passes one, the invented control below passes a pair and still exercises the disagreement branch. The shape being checked is "the instructions a reader is given", which is a set whether it holds one or two, and the check starts constraining again the day a second document gives the same command. A new floor complaint — "no documents were audited" — covers the map being empty, which every check under it would otherwise pass on.

**And it broke `plugin.test.js`, which was worth fixing rather than waiting out.** That test reads the working-tree copy of every file the *index* tracks, so a deletion that is not yet staged threw `ENOENT: no such file or directory, open ''…/MIGRATION.md''` — an error naming a path and nothing about why it was being read, from a test about file modes. It now names the mismatch itself ("the index tracks a file the working tree no longer has — stage the deletion and this reads the rest") and excludes those files from the mode comparison, whose question is moot for a file that is going away. The file''s own JSDoc already separated "a mode drifted" from "the tree was never committed"; this is the third state of the same kind.

Verified without touching the index: `git add -A` into a copied `GIT_INDEX_FILE`, then `plugin.test.js` against that copy — 7 of 7 pass, so both this and the pre-existing shebang-mode failure clear on the next real `git add -A`. `git status` after it still shows ` D MIGRATION.md` and ` M scripts/skill-body-check.ts`, so nothing was staged.', 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955XAHCK6R57VP7PJ8CQYX', '01M1951GSMQ3JY8MJAX204ZEY0', 3, 'Write tests for "README for a v2 audience"', 'Every documented command runs as written; the beta statement is present and `MIGRATION.md` is absent. The editorial judgement is tagged `manual`.', 'complete', '`tests/readme-v2.test.js` — six tests, all passing. It does not assert the README''s commands; it **enumerates** them, which is the difference between a test that reads a document and one that reads the parts of it somebody remembered to list.

Every fenced block is matched against a rule, and both directions fail: a block no rule matches is a failure, and a rule matching no block is a failure too — the second because a rewrite that removed a command would otherwise leave a rule guarding an empty set and the file reporting clean. Four rules decline to run and each carries a `why` the test asserts is present: the install command reaches the network and rewrites the reader''s config, JSON and YAML blocks are files rather than commands, and the three `bin/` invocations are already driven against real trees by `first-run`, `import` and `merge`. That set is asserted by name, so a command quietly joining the not-run list fails rather than passing.

Three things the runner found that a transcription would not have.

**`git config core.hooksPath` exits 1 when the key is unset, and unset is the answer the reader wants.** Absorbing that would have made every non-zero exit invisible; the rule declares `exits: [0, 1]` with the reason, and the test requires a reason wherever a rule accepts one.

**`sh` rejects `dpm-link()` before running a line of it.** POSIX allows only alphanumerics and underscore in a function name, so a hyphen is a syntax error in `sh` and `dash` and legal in `bash` and `zsh` — and `follow()` ran everything under `sh`. The block is not wrong: it is addressed to a reader''s `.bashrc` or `.zshrc`. So the README now says which shells it is for and why, `follow` takes the shell as a parameter defaulting to `sh`, and the rule names `bash` with its reason. A rule that switched shells silently would have hidden a real gap in the prose, so the test also asserts the README itself names any shell a block needs.

**The beta paragraph could not be found by searching for the beta sentence.** The TL;DR says it too, deliberately and in a shorter form, so an anchored match found that one, reported the entrypoints warning missing from it, and was right about the wrong paragraph. The blockquote is now extracted as a blockquote, with an assertion that there is exactly one — the ambiguity is removed rather than worked around.

`tests/support/package-cache.js` came out of `package-cache.test.js` when this file needed the same fixture: two transcriptions of the cache layout is two places to edit and only one of them would be edited.

Full suite: 1080 tests, 1079 pass. The one failure is `plugin.test.js` reporting the unstaged `MIGRATION.md` deletion, by the assertion task 2 added for exactly that, and it clears on the next `git add -A`.', 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955ZAS712K5R70CNN7CWCR', '01M1951J6PTV1WPNCCCF58J3TD', 1, 'Exercise skills under ask and deny rules for the skill action', 'Includes checking that a denied skill does not reach its work by another route.', 'complete', 'Exercised against a running host, not described. A probe plugin drove the host''s own `skill` tool — the tool whose `execute` performs the `permission.assert` — under a project config carrying all three effects for the `skill` action, in the isolated XDG root story 2 built.

What the engine actually does, established before the run so the run had something to confirm: invoking a skill is the action `skill` with the skill''s **id** as the resource; a rule set resolves by `findLast`, so the last matching rule wins and an unmatched request defaults to `ask`; config `permissions` are appended to every agent''s ruleset, which is why an entry there beats the default agent''s `{action:"*",resource:"*",effect:"allow"}`. Calling a dpm tool is a different action entirely — dpm registers an MCP server, and v2 names an MCP tool''s action `<server>_<tool>`, so `dpm_publish`.

Four rows, all from one session:

- allow, `dpm-spec` — loaded, 19,176 characters, names itself.
- deny, `dpm-publish` — `Unable to load skill dpm-publish`, 0 ms, no body. The host asserts before it reads the file, so a denied skill''s instructions never enter the conversation.
- ask, `dpm-retro`, replied `reject` — a pending request appeared carrying `action: "skill"`, `resources: ["dpm-retro"]`; the reply produced `Permission.DeclinedError` and no body.
- ask, `dpm-retro`, replied `once` — the same rule, a second pending request, 14,632 characters. Exercised in both directions, so `ask` is shown to be a question rather than a disguised deny.

The control is on the record: `present` lists all three ids as registered before any of it, because "Unable to load skill X" is also what a *missing* skill produces and a refusal means nothing without that.

The second-route check, which is the must-NOT''s half: 23 ids, one per skill directory, each derived from its own front matter, so nothing is registered twice under a second name; no dpm tool returns skill content; `package.json` declares no `bin`, so the five executables are not on anyone''s PATH. A cross-reference from a permitted skill to a denied one is the same tool call and refuses identically — that is row 2. What a `skill` deny does *not* stop is `dpm_publish` and the other 182 tools, which are separate actions under the host''s own model; that is the README''s to say, not a leak.

Three runs before these produced nothing at all, and the host log named the cause: `Duplicate plugin ID: dpm`. Story 2''s install had left two git specifiers in the scratch global config, and with the project config''s local path that is three plugins claiming the same id — which kills the entire plugin load, silently, so the probe read as a hung host. Set aside as `opencode.json.story2` and it ran clean.', 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M19561EX454HET4ACCBMDKKD', '01M1951J6PTV1WPNCCCF58J3TD', 2, 'Document the recommended permission entries in the README', 'Addresses the entries themselves; the surrounding README rewrite is story 4.', 'complete', 'A new `## Permissions` section in `README.md`, between "First run" and "When something else owns the hook". Self-contained, so story 4''s rewrite of the surrounding sections has nothing to unpick here.

**Revised after review, and the revision is the substance.** The first draft offered a second recipe that put `ask` on `skill`/`dpm-publish`, which is advice nobody should take: the twenty-three skills are the product, they are how the method is followed at all, and a repository that denies one has a hole in the method rather than a tightened setup. The section now says that in as many words and recommends no skill restriction at all. What it recommends is an allow-list, for the one case where configuration is genuinely needed — a restrictive baseline DPM has to be let back through:

```json
{ "action": "skill", "resource": "dpm-*", "effect": "allow" },
{ "action": "dpm_*", "resource": "*", "effect": "allow" }
```

The confirmation recipe survives, moved to where the thing being confirmed actually happens: `{ "action": "dpm_publish", "resource": "*", "effect": "ask" }`, one line, on the tool. The paragraph beside it says why the skill rule is the wrong half — it governs whether the procedure is *loaded*, so gating it buys a confirmation for reading instructions and none for the deletion, and reads like the right one while doing it.

The rest is the two facts a reader needs and cannot get from the host''s docs: loading a skill is the action `skill` with the skill''s **id** as the resource, while running a tool is the tool''s own name as the *action* with `*` as the resource; and rules resolve last-match-wins, unmatched defaults to `ask`, config entries append to the agent''s own and therefore beat them. The closing paragraph covers `deny` as something met rather than chosen — inherited config, restricted agent — and is honest in both directions: the instructions never enter the conversation and there is no second route to them (one id per skill, no tool returning skill text, no executables on `PATH`, a cross-reference routed back through the same refusal), but DPM''s tools are separate actions, so a denied skill is a method nobody can follow rather than a repository nothing can write to. Every claim there is a run from task 1 or a check made against the source.', 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M19562V871CD9PMYE2RP1S8J', '01M1951J6PTV1WPNCCCF58J3TD', 3, 'Write tests for "Permission-aware behaviour"', 'Covers the documented entries. Behaviour under the host''s permission engine is tagged `manual`, since the `ask` path needs a human answering the prompt.', 'complete', '`tests/permission-entries.test.js`, five tests, plus the row in `suite-integrity.test.js`''s `ADDED`.

**What this file deliberately does not do is re-enact task 1.** The two behavioural criteria are `manual` because the host''s permission engine is a fact about a running OpenCode; the evidence is the probe. A test asserting those semantics would be asserting my transcription of them, and it would pass exactly as well if the transcription were wrong. This project has never had a machine drive its own host, and inventing one here to make a `manual` criterion look automated would be the false pass with the check that is supposed to prevent it.

What a test does better than a person is the part the person cannot recheck on every commit: whether the documented rules name things that exist. A README rule is a string a reader pastes into their config, and every way it can be wrong is silent — a renamed skill, a split tool, a prefix changed by an ADR. A wrong rule does not error; it never matches, and the effect it was written to have stops happening with nothing reporting it.

The five: the section exists and its fenced blocks parse as well-formed rules, with the reader driven over a planted block carrying an effect the host would refuse, so an extractor that found nothing cannot pass as a section that was fine. Every `skill` resource matches at least one id `discoverSkills` returns, under the host''s own glob rule transcribed from its matcher — with both directions of the matcher exercised, since a matcher that always says yes makes the loop vacuous. Every non-`skill` action is `dpm_`-prefixed and matches a registered tool, against the tools the server actually builds rather than a list. Then the claim the section rests on: `dpm_publish` is registered, declares `mutates`, and `unlinkSync` appears in exactly one source file — because if something else started removing files, "publish is the only DPM operation that deletes a file" would be false while every name in the section still resolved. And the must-NOT: no two skills share an id, `package.json` declares no `bin`, and the only reader of `SKILL.md` is the registrar — three absences, each with the control that the sweep read the package and found the one reader that must be there.

Suite: 1074 tests, 1073 pass. The single failure is the known `plugin.test.js` index-mode one carried in from commit 1120b7a and is not this epic''s.', 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1959CZSF7K55QHAM7QCJJD8', '01M1957QGCTGTTW0VJP7JHDG74', 1, 'Set the version to 0.1.0 and settle the files and exports fields', 'Addresses what the tarball will contain. Neither field may point at a build output directory.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1959MQFZJBMYB6WW9BDZ7BK', '01M1957QGCTGTTW0VJP7JHDG74', 2, 'Publish to npm', 'The release itself. Verification from the published artefact is story 2.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1959P81SBGD72MHY1X0EQ3F', '01M1957QGCTGTTW0VJP7JHDG74', 3, 'Write tests for "Publish opencode-dpm at 0.1.0 to npm"', 'Covers tarball contents — plugin entry, twenty-three skill directories, `shared/`, five executables — including the rejection of a file a registered skill would need at runtime.', 'pending', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1959QN0G2XP371MYWJV90DC', '01M1957RXJ674PDNMB53CEGBT1', 1, 'Install by version in a clean environment and register', 'From the downloaded artefact, never the working tree. Addresses install and registration; running a skill is task 2.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1959S1Q72QPD5HG6DKPGSH0', '01M1957RXJ674PDNMB53CEGBT1', 2, 'Run one skill end to end from that install', 'The last check before the release stands: a real skill doing real work from what a user would actually download.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1959TPC52Y06S29VE99607Y', '01M1957TECZSEEFTKG9DNVT7S7', 1, 'Run a full plan-and-publish cycle with networking disabled', 'Inside the disposable environment from the bootstrap epic, so the claim is run rather than asserted.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1959W3DT1TKKE8WN5Z0W2RH', '01M1957TECZSEEFTKG9DNVT7S7', 2, 'Run the same cycle in a project with no .claude/ directory and no marketplace installation', 'Addresses independence from Claude Code artefacts at runtime, which the development-side check in the bootstrap epic does not cover.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1959XHXNB2VC3TNP1TB6SFB', '01M1957TECZSEEFTKG9DNVT7S7', 3, 'Write tests for "Verify the production restrictions"', 'Covers the criteria tagged `integration`: no port bound, no external service contacted, and persistence confined to files under `.dpm/`.', 'pending', NULL, 2);
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
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193PWXRAYS2AB8VTTVK1WYV', '01M191NVWV9CP15DT44439W9NZ', 'Node 24 or later on the contributor''s machine', '01M193D8FDXKAV9EN1ZJ9A7Z1D', 0, '2026-08-30T11:19:33Z', '1cb31bd76d6f637b0d74fdb090b23142fcd97e3b8c5b50a82a64fa12bc289f47', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193PYWRMWQ85PM23AM0D818', '01M191NVWV9CP15DT44439W9NZ', '`node --version` reporting 24.0.0 or above', '01M193D9T7S4F5FQVWFKP5VSNE', 1, '2026-08-30T11:19:33Z', 'd78590e913d28cb6328bff7fcd5cbbcf0c65977e28cd0fbc553897c27fe1bcd0', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193Q06QK28CWKEPXB8EYXC4', '01M191PQA3QF3YC847X5Y9CD4F', 'each executable refusing with an explanatory message when it is below', '01M193DB47YHMBWCT7A716NYSC', 0, '2026-08-30T11:19:33Z', '5af0488831626c26984c3336bb4cca723c93d8a6e9162e0465be23dbfadc9076', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193Q28MQHYSHQX1QZSG1VM4', '01M191HEEXRNX7Z6Z46ATS49FW', 'the Node-floor refusal', '01M193DB47YHMBWCT7A716NYSC', 0, '2026-08-30T11:19:33Z', '3c16c093b70b3c141c8cb18913e8dbcdd32b763074774a18fb80cbdd983af047', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193Q4AZMYXCW5RMA0E9711T', '01M191PQA3QF3YC847X5Y9CD4F', 'Node 24 or later on the host running OpenCode', '01M193DCM1K8BQ3WDJW5D71JEC', 1, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193Q6BEGP4X6Y7VFC6B41E4', '01M191KSQTS6M41QHYTJX0WAM6', 'TypeScript throughout, restricted to erasable syntax so Node runs the sources directly', '01M193DX4V2DM8BE44DGT6WX1Z', 0, '2026-08-30T12:55:00.000Z', 'c6a815b217a6e2eae92a49afb25cfa7584e0d2b9806f516ba47835dd091655b0', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193Q8H82GC80GJ7F5EHQKQ6', '01M191KSQTS6M41QHYTJX0WAM6', '`tsc --noEmit` is a type check in CI, not a compile, and no build artefact is produced or published', '01M193DYE04PACNNT4K28E2ZH5', 1, '2026-08-30T12:55:00.000Z', 'c97822b74623ca8e07663daf1ca0712d22882734aa4d5e1be9febfa073197592', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193Q9ZW12SS7CTECJ5J1A90', '01M191KSQTS6M41QHYTJX0WAM6', 'no build artefact is produced or published', '01M193E01EFGYAC7DQNE00V8SP', 2, '2026-08-30T12:55:00.000Z', '1d7e28b57497f8531b3046a067564b071c694f183726e051b45766f56458c442', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193QB9BFP85CN7RZKCM8JBY', '01M191KSQTS6M41QHYTJX0WAM6', 'restricted to erasable syntax so Node runs the sources directly', '01M193E5G28976MBHQB7RG100V', 3, '2026-08-30T12:55:00.000Z', '2e6fcd74d967910b199143d9d00ab5bb36c5f443d51a98e1c6476beafee68b33', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193QD9V3Y5SKCWCHR73VQFW', '01M191M0X2D61B6XGBY2SPA0MA', 'Every internal import specifier carries an explicit `.ts` extension', '01M193E1AAYA4JR37J9VCPKPBQ', 0, '2026-08-30T12:55:00.000Z', '040939fac5b06cf1abcf483312ad0d339a15b3d870391585673ed906dfbc39a3', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193QFF034ND6ZVX5XZHFG6Q', '01M191M0X2D61B6XGBY2SPA0MA', '`tsconfig.json` sets `allowImportingTsExtensions` so the type check accepts them', '01M193E2TA66F7ETYVMNGFR1PZ', 1, '2026-08-30T12:55:00.000Z', '3ee0ede7bad86f58e047c5f0c8f495fcd950aa76c6979dfc8b056d01b30fcbd8', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193QH1WV8658BA1RD7QB3SX', '01M191NZRB4NJ2A07WES55GFTT', 'TypeScript available for type checking', '01M193E43WVAGWSWYXH8RPZ5QW', 0, '2026-08-30T12:55:00.000Z', 'f1f7127cb760bb2d42bd9c9957a98e4cae99f74991e64be8095c38635968f0a7', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193QPFSZAW981X77HQT82JZ', '01M191HM8EE473JDD426R9FQRE', 'keep their responsibilities, become TypeScript sources, and remain runnable directly with `node` and no loader', '01M193EQ3NX07VKK43JY05862K', 0, '2026-08-30T13:20:00.000Z', 'b1a724d10e03a13835890acfff8f877dca6b6f55706324e2afef6fa2f5132508', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193QRD8J9WR7H1DA6Y3NERQ', '01M191HM8EE473JDD426R9FQRE', 'remain runnable directly with `node` and no loader', '01M193ERD7MFZHTTVE5V5C87S4', 1, '2026-08-30T13:20:00.000Z', '4c26afdbc6e3ca6f8472a6bb75869f9a016c86e515fcfeb87aac6e382382cc4e', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193QTFXXT730E3TM9C51EKC', '01M191PJJS5APQC7DK4P73CR1G', 'the test command and each executable''s invocation passing no `--loader`, no `--import`, and no transpiler flag', '01M193ESMVJWNYV6M414M6YPK4', 0, '2026-08-30T13:20:00.000Z', '6be7874368a7f9e26ad3f4e423b5cb9510f0f75948cac7361c291a14020dc03c', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193QVW3SG7QQAQT6J4EPRQM', '01M191M0X2D61B6XGBY2SPA0MA', 'Every internal import specifier carries an explicit `.ts` extension', '01M193ETX989XQBWP3Q42YARG2', 2, '2026-08-30T13:20:00.000Z', 'ee39d00c0a5bb5d4c89f2c2045fc0aaeae96c56f2d2ab0de5026c99d8d0c2b20', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193QYN1KEM0KEF6HZ2HXTJQ', '01M191HRH294FESBRF5JK3CZGQ', 'The `node --test` suite — 133 test files at v0.7.0, including the corpus snapshot tests — runs against the TypeScript sources in CI, under plain `node` with no loader', '01M193F4ARJXN6FTVEHGWR5ZPH', 0, '2026-08-30T00:00:00.000Z', 'ca92a958c0a6e3dbe9c03a022a7a53502f9c553945c565a662b0a1de74da5d50', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193R0V14ASSRCP32MJHVJCX', '01M191HRH294FESBRF5JK3CZGQ', 'under plain `node` with no loader', '01M193F5NW1AFT46MCZNJ96YQX', 1, '2026-08-30T00:00:00.000Z', '8bdab1cd62c05146407ddd6cc0a25fb5d54ed125fa0a18647ea2f1c97d9d2abe', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193R2YV50AQE2ZT2XMJ1K8H', '01M191NX38ANZRH042J1KQ91S0', '`node --test` is the test runner', '01M193F6Z5TXMDCD3RFYSEGF28', 0, '2026-08-30T00:00:00.000Z', '2038cef2838b222dc5d540f1d934f885fbadc98788c552487ef25357bddb7215', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193R4WPYDA9DZQF74XDQ9A0', '01M191PMSEVEWV2QZPCTQB0KQ7', 'Claude Code must not be required', '01M193F87VVRVZWAP1SM30F069', 0, '2026-08-30T00:00:00.000Z', 'c4151c6d87b458e8d6a06b0f6768de6d98567cab19742dbe3a61808ca2a5c60c', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193R691KVTF492DFP1S3KPF', '01M191HRH294FESBRF5JK3CZGQ', '133 test files at v0.7.0', '01M193F9KNFCDGK2QSDSPVS94B', 2, '2026-08-30T00:00:00.000Z', 'a61b40f7a9255857ee5761482b59a356621cf4053ef8b1585f62dd2afa2dd61a', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193R93HMEYCN54BD6GYNX15', '01M191HEEXRNX7Z6Z46ATS49FW', 'Fresh-clone restore from `.dpm/dpm.sql`, deterministic dump on publish', '01M193FQGGJ67KRCZFPN3MXRBC', 1, '2026-08-30T00:00:00.000Z', '42fb53b1e6d3b81882db73172f650d0fdc8c3b6ff06550e9d4fcad7bece46c3f', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193RAGVX6H2N3PEMNH8WZJT', '01M191HEEXRNX7Z6Z46ATS49FW', 'the empty-database restore asymmetry', '01M193FRT59R36EMJVSAAJV06F', 2, '2026-08-30T00:00:00.000Z', 'bbbf131d27ca5fba56eb52ae8bfbbcd7af7f8bf78e6f44ba5e688a93b750e4c8', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193RCGCMA9NVHAPMB99HYQC', '01M191HEEXRNX7Z6Z46ATS49FW', 'read-only server mode', '01M193FT7VMVH6KCQRCH2VWWHV', 3, '2026-08-30T00:00:00.000Z', '37adfabc7de500756a6c0e9d5a7825e1b3698c0b1c5651b3022f2fc82cf51a4a', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193RE0GYRV2R9J4YR33CMT8', '01M191HEEXRNX7Z6Z46ATS49FW', 'all carry over with their existing behaviour', '01M193FVGVRG8G9YJN3WRK4YH0', 4, '2026-08-30T00:00:00.000Z', 'cc1aef2fec0c2e23eab1be46bc008fa62ca6e6bce5dcc25670bed3deb215a65d', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193RKS539HXYKK4P83MYTNG', '01M191KY76N9B04YVJK69YMCGW', 'Dump output, projection output, and ULID and number allocation behaviour remain byte-stable across the port', '01M193FX1BZKNJ7JAHF8RX06VP', 0, '2026-08-30T00:00:00.000Z', 'fdb5964531012c882c312b5aced2a08aeb1732a73a2fcdb4af1c6cbc378d47db', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193RN5EMVXXHG7FHYR9MV37', '01M191KY76N9B04YVJK69YMCGW', 'remain byte-stable across the port', '01M193FYCMV2DP2EKB26R5MZK2', 1, '2026-08-30T00:00:00.000Z', '665e40f82ea861c87ff21cdd58c103438780b126b86f3cb932a604b3583687c1', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193RQ9DFEQDC5TBTJ90AFPJ', '01M191KY76N9B04YVJK69YMCGW', 'ULID and number allocation behaviour remain byte-stable', '01M193FZNQC4QV3DAW0N7DKFAH', 2, '2026-08-30T00:00:00.000Z', '94043a512bd8993e77a4a07d4c9c9f3a42228fabb54175d7600be1ee9845500e', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193RRQR01V5PR6EQTVRKM3Q', '01M191KY76N9B04YVJK69YMCGW', 'The guard''s regenerate-and-compare depends on it', '01M193G0YDX509GJFF9ZCNZQ11', 3, NULL, NULL, '2026-08-30T10:35:11.435Z', 'The fragment quoted NFR4''s rationale clause rather than its obligation. Rebound to "remain byte-stable across the port", which is the half the criterion is measured against and the half that survives an amendment.');
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193RW3E197RBCB0XNF50KTZ', '01M191M0X2D61B6XGBY2SPA0MA', 'a dedicated CI sweep that imports every module under `src/` and `bin/` with plain `node`', '01M193GKDT2XCYZX2BTVK28EFG', 3, '2026-08-30T00:00:00.000Z', '998dddf398729f2beeefe1d5a03c1cd3704e844d974d6cdc0f11dcd2a984c92b', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193RXK1CVZ0PD3THDYM2TNH', '01M191M0X2D61B6XGBY2SPA0MA', 'The sweep exists separately from the test suite', '01M193GMS1262AS0G1WJJRN5C4', 4, '2026-08-30T00:00:00.000Z', 'ab9695346c41d97dc7a2e9be0409da9085fc20ce9be53aff2e296e26d9819a11', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193RZK26Q0SRYC63YS87JRZ', '01M191M0X2D61B6XGBY2SPA0MA', 'a bad specifier in a module nothing imports would otherwise reach a release unobserved', '01M193GP3FBRTFPHKQWB3FQT3A', 5, '2026-08-30T00:00:00.000Z', '3a518b259289ad55a1f94916412c5081c2e2256d91af732492fc129286164246', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193S1PKZZ91EB03K6W3P5R1', '01M191PB5ZT101VW751N9HTCER', 'a CI job running the full `node --test` suite on Node 24 under plain `node`, plus the type check and the module sweep, on every push', '01M193GQM0AB6H2KSCW4MRT30V', 0, '2026-08-30T14:22:00Z', 'eab7b5a426c076a986ff147961e52669de014beb54d365d59b960fa219ee2817', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193S3P5P95893MT5WAK8QC8', '01M192BM6P7KCFK6EJBPF417RR', 'a disposable isolated environment — a container or equivalent — that can be started with no language toolchain present and with networking disabled', '01M193GRYP8P048ZT249ZAEKNT', 0, '2026-08-30T14:22:00Z', '584fd79dcb8355e3432c5b97c65cca223747d56807c8b82578cf113e074813a1', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193T226VA0APZ12AB06B8TE', '01M191KY76N9B04YVJK69YMCGW', 'remain byte-stable across the port', '01M193G0YDX509GJFF9ZCNZQ11', 3, '2026-08-30T00:00:00.000Z', '6d73a7b023d31a0e61470930fb9c11798ce54d416bd910b62c55bd827ef7779d', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194P7NG4C5832D7XT4EPPTY', '01M191HA9AJ98W4FGB37DC3P1Y', 'The plugin registers the bundled server via `ctx.mcp.transform`, setting a local server entry whose command runs the packaged executable.', '01M194EG89790D48T5NHTDT06V', 0, '2026-08-30T15:30:00Z', '040c388aaab9b3f1fea930617f90c1c73a80db15c6f88ec8c41493376bcc3981', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PAFXQR6Q1ZQV1J0CZ6HW', '01M191H7HSQA83WM93W0J944HF', 'the MCP server registered and connected', '01M194EHHR2D4FSSCXZD7JP62Q', 0, '2026-08-30T15:30:00Z', 'ebc5e7cf4942543f784d8335fb31d32990c63cf7484578a8eec3fa2882c3697d', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PCKZ80KD60E1HCQJ7EZ6', '01M191PRJD860MEPCETCTG156D', 'the plugin loading under a 2.x host and its MCP server, skills and any commands appearing in that host''s registries', '01M194EHHR2D4FSSCXZD7JP62Q', 0, '2026-08-30T15:30:00Z', '4131fe805d4268132024186d74ab2bbad4e1b54015773b95974476b0258891cf', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PEPJEW871DPJT71DG1A3', '01M191H7HSQA83WM93W0J944HF', '`opencode2 plugin add github:ninthspace/opencode-dpm` — and later the npm form — yields a working DPM', '01M194EJSQK9PE8Z752TXFK7H4', 1, '2026-08-30T15:30:00Z', '15aad266c72ab78c5a39700239b67c18119f3be1061e319a75b16b3d8c9ef857', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PG33PH2SCJR7XTAM1Z4P', '01M191H7HSQA83WM93W0J944HF', 'nothing further for the user to copy into the project', '01M194EM8CWAZRDTC334V3C5DR', 2, '2026-08-30T15:30:00Z', '7f6d48ede8b90677cf1867bff97d4034dc5068529b02e5f904ac40a8f107f1de', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PK4C6NTNFVS34JQ1X6ZT', '01M191JCC04JEVXVWFMS1V9RMJ', 'The architectural seam that makes it selectable at registration time is decided here and is not deferred.', '01M194ENM43AE2X5FJSC5PMGMW', 0, '2026-08-30T15:30:00Z', '2c44e68611d1f988bc671692908f70423666715514a72601d6c6c32fa40f37d9', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PMSE9QB8Y0V9P1KMXGDT', '01M191JCC04JEVXVWFMS1V9RMJ', 'a reduced model-facing surface selected by plugin option', '01M194EPXXEJA3Z3KDNQP2ET4E', 1, '2026-08-30T15:30:00Z', 'd293f1a31dbf2d7de52d1e4f882d777c5c77fd3b917eaf9c2b8096a6d7d6ec7d', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PQ43CZJGTJ0SFBYTWSRE', '01M191P15MPZRFA7HH2Z91K8XP', 'an OpenCode v2 beta CLI on the contributor''s machine', '01M194EV8C53PC9JWDSZC1RM11', 0, '2026-08-30T15:30:00Z', '8d5e1fa2f0ef41d45f6914a738f410625b9cf5a0afa368ec415e949e29c26c62', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PSR90WB4AMRQ5JN9HK19', '01M191HD4T54B4H7JB9M9Z8DF9', 'tool names take v2''s effective naming', '01M194FFY5KNSQPR1VFWYC2M3B', 0, '2026-08-30T15:45:00Z', 'df12a29a634c76bc87c05dfee1d4d992144ce09a2302bd4c2dcb2e85e4ee93ae', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PVTF3HG0P0ZB7CNV6QJA', '01M191HD4T54B4H7JB9M9Z8DF9', 'Skill prose is revised wherever it names host mechanics', '01M194FHDH8GNXYDSVQED2F712', 1, '2026-08-30T15:45:00Z', 'c4341b53929d4bab8edc6a69216fbb7651682791e3aaeb21e35f8e65e99ab0e3', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PXF6JKHM3JAS03CA6PWQ', '01M191HA9AJ98W4FGB37DC3P1Y', 'Tool behaviour and schemas carry over from v0.7.0 unchanged.', '01M194FJT0H0A3Q3WH8BRQVYRD', 1, '2026-08-30T15:45:00Z', '94dfed1a25f3d2be2b4bf06e9a1ef6612286ab55d34d1ef4c526d7ba5e0a04b2', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PZATQKK3GSD16379W2JK', '01M191HD4T54B4H7JB9M9Z8DF9', 'with `location` pointing into the installed package so directory-based skills keep their supporting files', '01M194FM7Q119W43CC75HS3KB6', 2, '2026-08-30T00:00:00Z', 'b6993036e3018106104532d379e17ccdff7f09c583efb94d061a4867b6aa128a', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194Q2425G6HXSKG9PV8JYF1', '01M191KQV386EDYK9Z9H12D2N5', 'The only entry under `dependencies` is `@opencode-ai/plugin`.', '01M194FQMGZ9RX4Y88CD1J97H1', 0, '2026-08-30T00:00:00Z', '704c7e9d776a1fdc76bb51a8233d3930141664d3758b136c46206784ac546db3', '2026-08-30T15:51:18.724Z', 'The fragment quotes "The only entry under `dependencies` is `@opencode-ai/plugin`.", which story 1 amended out of NFR1 with the `define`-is-identity citation. The sentence is no longer in the requirement, so the binding quotes text that does not exist. Rebound to the sentence that replaced it.');
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194Q3TCDK3CFC4BYAH62HN8', '01M191KQV386EDYK9Z9H12D2N5', 'no native modules and no install-time compilation', '01M194FRYSWQ0N4AQATAT1G359', 1, '2026-08-30T00:00:00Z', '4eaa96788964ab2ad5136402f305a690a96299fda4155e0522b4c3e5b84efb0f', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194Q5Q3MZK4N57865F9VKKM', '01M191PDECZ9F46H7Q6J8XNSDP', 'native compilation must not be required', '01M194FTA9GZZ9N79DT3HDT8TG', 0, '2026-08-30T00:00:00Z', '03870811f2c48856d6d2b2acf27733f5b299a9b55f6a0c4504643e356d35e2b3', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194Q8G934WCKX0F2PS10YBX', '01M191KW1TEYZR0S56SCE5GZDC', 'The plugin pins `@opencode-ai/plugin@beta`', '01M194FVM5MFEJDZWENTZ490Y5', 0, '2026-08-30T00:00:00Z', '251cc39f74bb94d2e1093cb0f87efdfda1c2ffb710853577c3ca1604d2a9008b', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194QA9AXAA84WEYZY3VMGXQ', '01M191P6ZQ9026CAE9NPHA7VXK', 'installing the plugin into a throwaway project and observing its MCP server reach connected state with the skills advertised', '01M194FX20305CQQT6QS7CJGPR', 0, '2026-08-30T00:00:00Z', '74f5b8002285f0018d5940a209ab1a45a656ef1ccfa1fe744fadc82d057ec138', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194YPV1N00588YDCT47GW1Q', '01M191HD4T54B4H7JB9M9Z8DF9', 'All twenty-three skills port and are registered via `ctx.skill.transform`', '01M194VE43GK7C7BH8H4MDQ63H', 3, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194YRXJ2T0WZT4EPWDWQ2YT', '01M191HD4T54B4H7JB9M9Z8DF9', 'Skill prose is revised wherever it names host mechanics', '01M194VFCP1G64RJ8WRQS89M1Y', 4, '2026-08-30T16:55:00.000Z', '9a2ae829ffcb3aca86d9b3de6afafe41044ad0004e8257728bc54cf53fc66907', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194YV0T9TZVJTM9KXT684Q2', '01M191HD4T54B4H7JB9M9Z8DF9', 'All twenty-three skills port and are registered via `ctx.skill.transform`', '01M194VGZ74ESZAEJCEMG2H16T', 5, '2026-08-30T17:32:34Z', 'af827f89c4ea594bb6e2de9d5f4b703182e8e0791859a727fda2683c3518eb7c', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194YX8C0XQ72FDCQKXF0EMK', '01M191HD4T54B4H7JB9M9Z8DF9', 'All twenty-three skills port and are registered via `ctx.skill.transform`', '01M194VJVB8R3KTX3P4454B0Z2', 6, '2026-08-30T17:32:34Z', 'd073e74cddd6c724ad9888bc9303cbcf5a6083d918bc920e9330c21cf1d8498b', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194YZ5M8EJB33ZMCHK6QFVB', '01M191HD4T54B4H7JB9M9Z8DF9', 'with `location` pointing into the installed package so directory-based skills keep their supporting files', '01M194VM5FRSF9VZ1TWTKP5RSJ', 7, '2026-08-30T17:32:34Z', '93af5e50dc13ac9b6e5fffcabe16536f305a3d214d6116985492dde8424e3460', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194Z1PJSEY02808TX6P6S58', '01M191P6ZQ9026CAE9NPHA7VXK', 'a scratch OpenCode project to register into', '01M194VNQ50TGA8264V5PHA1E0', 1, '2026-08-30T17:32:34Z', '6d61e596c3b09f3635f0e3a76f63d0174550b3de03d98968fb0a55599c12f74f', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194Z3N2KEG60Z6PGTF85C4S', '01M191HD4T54B4H7JB9M9Z8DF9', 'Skill prose is revised wherever it names host mechanics', '01M194VQ2QCJ4020HR42JXK3Y7', 8, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194Z6AK3NV3CSFEF5TQC3PM', '01M191HA9AJ98W4FGB37DC3P1Y', 'no skill contains SQL and nothing parses prose', '01M194VRDNAEP9SCDBAH4C0J21', 2, '2026-08-30T17:32:34Z', '3590156f456f5013e8319cbef2d0ddef23fac227a9ff70a2cf1a6cd7ff238f93', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194Z84ANPGF8V42ZB1F8Z0E', '01M191HD4T54B4H7JB9M9Z8DF9', 'the invocation story replaces Claude Code''s slash-command triggers', '01M194VSR5JZZR958JRYYF2KDW', 9, '2026-08-30T18:05:00Z', '9ede5c98d7e77e8805c6c15e1755fa0e922c60d62d6ac8a1316305701bc50290', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194ZAEN8K3FXHNJDHTVQ526', '01M191HD4T54B4H7JB9M9Z8DF9', 'the invocation story replaces Claude Code''s slash-command triggers', '01M194VV9XC04F7SQ8MKEPWCRG', 10, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194ZBVSB870DH5R5W5X4V43', '01M191HD4T54B4H7JB9M9Z8DF9', 'Skill prose is revised wherever it names host mechanics', '01M194VWMM11SJTB3Q9SMBGN57', 11, '2026-08-30T18:20:00Z', '057ed4ac40d312ca83bd721ec4535e16b7bdbfc4f113a1c7f912ac524ce05c48', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194ZDS2MFKBM6MX2D5V5TEM', '01M191HA9AJ98W4FGB37DC3P1Y', 'no skill contains SQL and nothing parses prose', '01M194VY2FQEV5RSK2GPFNH5H3', 3, '2026-08-30T18:20:00Z', '72e3d29b200bfdfa050597bfef0d598f30ee467ac71a559df50045ca34def56a', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194ZG5720VY0M1VQMFYKTS7', '01M191HD4T54B4H7JB9M9Z8DF9', 'Skill prose is revised wherever it names host mechanics', '01M194VZDMC55A44927FT1B92W', 12, '2026-08-30T18:20:00Z', '232409c28e65c35777c9a9a80d209da87fdbf5f3535dbb3b90eda3c36cf52bef', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194ZHEXK4DE85A52DTJS9J8', '01M191HD4T54B4H7JB9M9Z8DF9', 'All twenty-three skills port and are registered via `ctx.skill.transform`', '01M194W0TC6HRDEVD355Q2DJAZ', 13, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1953NYEDFK21CRSKKFYCJP5', '01M191HPCXWPEDVYD8ZCRGZNJQ', 'It remains a git hook that regenerates and compares, fixes nothing, and refuses with the four-case explanation.', '01M1951PTC1VWJZVSP9FVCZ4GK', 0, '2026-08-30T18:30:37Z', 'a819c23ab271684a0592330d4b4ca0738320a5eddd61f132adaaef272032ce29', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1953R36ZMWTGDJN6N315SJ6', '01M191HPCXWPEDVYD8ZCRGZNJQ', 'refuses with the four-case explanation', '01M1951RD86DGGT8DA7SN9D4ZS', 1, '2026-08-30T18:30:37Z', '679390d950d438919a81bdf1a12e0457357a4abaf0d3092209409289c1369d2b', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1953T2RHGG7DY0VXNDJ6JV4', '01M191HPCXWPEDVYD8ZCRGZNJQ', 'the missing-symlink warning on server start carries over', '01M1951T9CJFNTE8MRR6DQABEP', 2, '2026-08-30T18:30:37Z', '2c99eb5804fc7a3f4a49d6eb24449ce2050ff17c0b8aa20bd76b3cfa76c7f433', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1953W5V4CE54RA7SRZ6STB7', '01M191Q160A0AWMXH0WTD2P0GF', 'a git repository in the user''s project', '01M1951VHMJXCBTW9T1QQHJ4ZD', 0, '2026-08-30T18:30:37Z', '3271b88ca5c00705dc0ef93b8a3e58eb13e4ea696989b1dfaf7e072948037bbc', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1953YCV7QKNZYBSRCABHXPA', '01M191P8TH87TEYAPJ9V0F4P3S', 'git with hook support', '01M1951WVTFY7ZSXMQC13N50XD', 0, '2026-08-30T18:30:37Z', 'd57214b4ab448726578e2be827310a298be2a7ffab00ba740524cd4d2ab657d4', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195408D47AN983SCHE752S3', '01M191HPCXWPEDVYD8ZCRGZNJQ', 'fixes nothing', '01M1951Y69R03FNXVQEMMZQ7DB', 3, '2026-08-30T18:30:37Z', 'db90c0ffa676c5911acbbe5f619e228733a240e84a2830a49d14f24001d679a6', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M19542NV34ABF79X4WWHDB8D', '01M191HPCXWPEDVYD8ZCRGZNJQ', 'The install instruction is updated for where OpenCode places plugin packages', '01M1951ZDWW46AVDM0W2HYWW9K', 4, '2026-08-30T18:45:00Z', '5cddb7fb73726a7f36ce4e00794c3fb1d42f36bf128c4295b21714e124b5579f', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195444SBSDP453H5EQ9VEMH', '01M191HPCXWPEDVYD8ZCRGZNJQ', 'The install instruction is updated for where OpenCode places plugin packages', '01M19520QN2C18CNA5H7Y4V9F0', 5, '2026-08-30T18:45:00Z', '00f3cf15061bd1a47404ef3b36a4723e06ecdce6bc48e7f48fd053c1bf2bf9c9', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M19545QWPDQB4EKTREGCWYNK', '01M191HZ1QER0TFPZ2DQQ4NYJX', 'Anything that was per-session scratch keyed by an environment variable in Claude Code uses `ctx.storage` where a database session row is not already the answer.', '01M195222V3F5N030BXG5G96Z5', 0, '2026-08-30T18:45:19Z', 'd57da9a127fed8f99c898502453c6dc13ca893cc64a8348f6dc481a3f34f6bba', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195472H50WSSVQM5X4EFRZJ', '01M191Q35NNXEWQK0HNQGBD5PY', 'filesystem write access to `.dpm/` inside the project', '01M19523F9VFN8WFH9F47189DE', 0, '2026-08-30T18:45:19Z', '4c9ced315235b2a29609d2fc73697d0b85b6cc324f84a52196a6435a1e23d3b9', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1954986K9TD3Z0SFB317NGB', '01M191HZ1QER0TFPZ2DQQ4NYJX', 'No transient files land in the project tree.', '01M19524XRETPQRAV06SN1DYN1', 1, '2026-08-30T18:45:19Z', '1de0196d30f9e0cc9b02348f382a1295124844a9dc0804a1e12f3de2564925d1', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1954AMP0DCPW1MR1Z3CN88Z', '01M191J1W9E36VGT6DC7ZVKP94', 'Install, first run, guard symlink, and "when the guard refuses" are rewritten for `opencode2`.', '01M19526A8XJ1WYP8ZFANDN47R', 0, '2026-08-30T00:00:00Z', 'de27a925f80fa043cc3b74d6d6ea5bcb215abe0909b21eb0e6ddcbdad80c16eb', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1954C0A0QNDFEVH9RPNTQME', '01M191J1W9E36VGT6DC7ZVKP94', 'README for a v2 audience', '01M19527MPE5AZ88PQKQDDBRZY', 1, '2026-08-30T00:00:00Z', '22332b8f5958954b56a3041e32f7d3406b5b4296d5a11538dbec0be41e0c03cf', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1954E2V62CY5GA1RB8Y5QP7', '01M191KW1TEYZR0S56SCE5GZDC', 'the README states plainly that OpenCode v2 is beta and that entrypoints may move under it', '01M1952916VPEHNVF62ZRPZJT9', 1, '2026-08-30T00:00:00Z', 'd7be0c6b523873b50a0d41343fbca556a2f74a43dbad9c3083dba630b941a89e', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1954FC3GWFWP45MNSE4A0QT', '01M191J1W9E36VGT6DC7ZVKP94', 'The CPM MIGRATION.md does not carry over.', '01M1952AA2WKSFC1BYDMBX56B9', 2, '2026-08-30T00:00:00Z', 'fe5a47b1342a11ad068d0e5f0293cae40add9c13d4246d1aca7d8cc1ca7929a4', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1954HJVCTHXCFQ5YRG8BFZ7', '01M191HSY4Z56KCR1HWSDVA1VE', 'Skills behave correctly under `ask` and `deny` rules for the `skill` action', '01M1952BP02Z605Y9J2DDTJN2A', 0, '2026-08-30T19:13:39Z', '7297d160b05ed24bdb530838f4dd693a099ec333d5211c4b6ca45f39669ba5dd', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1954K4J0NBF15NN3GZ49553', '01M191HSY4Z56KCR1HWSDVA1VE', 'the README documents the recommended permission entries', '01M1952D3979C6V01MTJ0QQAVA', 1, '2026-08-30T19:13:39Z', 'aa64bb1433c4a5be1b4447fe5d12cb1634d01627e6e69a645433f94db2548b6c', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1954MHHPWFVZPYWHQAABNTG', '01M191HSY4Z56KCR1HWSDVA1VE', 'Skills behave correctly under `ask` and `deny` rules for the `skill` action', '01M1952EHHSB6MCM5HC6WVF27C', 2, '2026-08-30T19:13:39Z', 'b237105ff186d7667a55450bb72d99454ef7849cd758545ca72d685f18077a42', NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1959Z5SA2K0SQS8SHKW8SSM', '01M191H7HSQA83WM93W0J944HF', 'and later the npm form', '01M1957YVRSJYH47D6Q7T8P9D4', 3, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195A0SJH0P1AZ6AX545FR7X', '01M191HD4T54B4H7JB9M9Z8DF9', 'with `location` pointing into the installed package so directory-based skills keep their supporting files', '01M19580542A1BB87XVK0Z4PAN', 14, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195A23A83Z2QQJJ3899KH01', '01M191HD4T54B4H7JB9M9Z8DF9', 'so directory-based skills keep their supporting files', '01M19581F5PNNE5NRYM3WB9AP0', 15, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195A3FPRPF0T8Y3K373DRRY', '01M191H7HSQA83WM93W0J944HF', 'yields a working DPM: the MCP server registered and connected, all skills advertised, and nothing further for the user to copy into the project', '01M19582S6ABCHQ857XN2YRTYV', 4, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195A4V1RG5EX92M2D67J01Z', '01M191H7HSQA83WM93W0J944HF', 'yields a working DPM', '01M1958422X7G47SMQ39TMXG8P', 5, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195A6SKBM6K956182YJMPZJ', '01M191H7HSQA83WM93W0J944HF', 'and later the npm form', '01M19585MT85VK08FVW7BECR4C', 6, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195A84BND1631RWDYS41ETG', '01M191Q578097ZDAS8SA8MGHY1', 'network access must not be required at runtime', '01M19586ZSAR67SXCYCPMJ809T', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195AA79Q6TWZ1K5XFEGJ8W9', '01M191Q6FFNXB7AR19TRT6RCSE', 'a database service must not be required', '01M19588P1E29S4HC9CCKXZBW0', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195ABNSAPG47JEWMCVPJ76S', '01M191Q82N7NWEGDG30HYFKX8S', 'Claude Code artefacts must not be required', '01M1958A0KK1F5NKHD6FV933JV', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M19NWJBBR5YQWTJPFYSHH1NZ', '01M191KQV386EDYK9Z9H12D2N5', 'The SDK is therefore taken as a type-only import, sits under `devDependencies`, and `dependencies` stays empty.', '01M194FQMGZ9RX4Y88CD1J97H1', 0, '2026-08-30T00:00:00Z', '1d538bdfc2922e08012277770950018d8ea01cd9a3983181faaf183b644bec92', NULL, NULL);
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
