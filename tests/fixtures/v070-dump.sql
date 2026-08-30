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
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193GKDT2XCYZX2BTVK28EFG', '01M193CZBACY1KZJ264E2ZH76G', 'The module sweep imports every file under `src/` and `bin/` with plain `node`, and every import resolves.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193GMS1262AS0G1WJJRN5C4', '01M193CZBACY1KZJ264E2ZH76G', 'The sweep runs as a step separate from the test suite.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193GP3FBRTFPHKQWB3FQT3A', '01M193CZBACY1KZJ264E2ZH76G', 'Introducing a deliberately extension-less internal import makes the module sweep fail.', 'control', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193GQM0AB6H2KSCW4MRT30V', '01M193D0TS9VBQKYHW2PWPFMXX', 'A CI job runs the full `node --test` suite, the `tsc --noEmit` type check and the module sweep on Node 24 under plain `node`, on every push, and the run is observable in the repository''s CI history.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M193GRYP8P048ZT249ZAEKNT', '01M193D0TS9VBQKYHW2PWPFMXX', 'A disposable isolated environment is available in CI, and both the clean-install check and the networking-disabled cycle run inside it rather than being asserted by inspection.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194EG89790D48T5NHTDT06V', '01M194E5SEXMD6W90PSM0ATR4J', 'The plugin''s `Plugin.define` entry registers the bundled MCP server via `ctx.mcp.transform`, setting a local server entry whose command runs the packaged executable.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194EHHR2D4FSSCXZD7JP62Q', '01M194E5SEXMD6W90PSM0ATR4J', 'In a scratch OpenCode v2 project, the plugin loads and its MCP server reaches connected state.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194EJSQK9PE8Z752TXFK7H4', '01M194E5SEXMD6W90PSM0ATR4J', 'The published package''s manifest declares the plugin entry, and the server command path resolves to an existing file inside the installed package tree.', 'must', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194EM8CWAZRDTC334V3C5DR', '01M194E5SEXMD6W90PSM0ATR4J', 'Installation requires the user to copy a file, hand-edit project configuration, or run a post-install step.', 'must_not', 3, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194ENM43AE2X5FJSC5PMGMW', '01M194E5SEXMD6W90PSM0ATR4J', 'The set of skills registered is computed from a profile selection resolved at registration time.', 'must', 4, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194EPXXEJA3Z3KDNQP2ET4E', '01M194E5SEXMD6W90PSM0ATR4J', 'The plugin entry hardcodes the skill list.', 'must_not', 5, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194ERA2PWF4GNEGZWB900K8', '01M194E5SEXMD6W90PSM0ATR4J', 'The registration transforms close over no session-specific state, so replaying them on reload produces the same registrations.', 'must', 6, NULL, NULL, '01M191S1ZQYSAY12930K9A3HNC');
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194ET0EBF8G8R82VPGT65KH', '01M194E5SEXMD6W90PSM0ATR4J', 'A registration transform writes to the user''s project configuration on disk.', 'must_not', 7, NULL, NULL, '01M191S1ZQYSAY12930K9A3HNC');
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194EV8C53PC9JWDSZC1RM11', '01M194E5SEXMD6W90PSM0ATR4J', '`opencode2 --version` on the contributor''s machine reports a 2.x beta release.', 'must', 8, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194FFY5KNSQPR1VFWYC2M3B', '01M194E73NGKXF2ZJYSE0S5GZ3', 'The effective rendered name of MCP-provided tools under v2 — namespacing and character substitution — is established against a running beta host.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194FHDH8GNXYDSVQED2F712', '01M194E73NGKXF2ZJYSE0S5GZ3', 'The established naming is recorded as a written section on this epic before any skill prose is rewritten.', 'must', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194FJT0H0A3Q3WH8BRQVYRD', '01M194E73NGKXF2ZJYSE0S5GZ3', 'The advertised tool set and every tool schema match v0.7.0''s, compared against a stored snapshot of the tool surface.', 'must', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194FM7Q119W43CC75HS3KB6', '01M194E8W7MJQ0WMEANHJ3YRZQ', 'A registered skill''s supporting files resolve from the package location, so a skill that reads the shared conventions file at startup finds it.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194FNF7HKETPX0Q7PVBG7EE', '01M194E8W7MJQ0WMEANHJ3YRZQ', 'The go/no-go outcome is recorded as a written decision on this epic before any skill prose is rewritten, and where the answer is negative the decision names inlining as the fallback and its cost.', 'must', 1, NULL, NULL, '01M191RY452PMYKB35R7NDD60M');
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194FQMGZ9RX4Y88CD1J97H1', '01M194EA95B25V3M2MCBC35A1J', 'The package''s `dependencies` contains exactly one entry, `@opencode-ai/plugin`.', 'must', 0, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194FRYSWQ0N4AQATAT1G359', '01M194EA95B25V3M2MCBC35A1J', 'A `.node` binary, or a compile step, appears anywhere in the production install tree.', 'must_not', 1, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194FTA9GZZ9N79DT3HDT8TG', '01M194EA95B25V3M2MCBC35A1J', 'A clean install in an environment with no C or C++ toolchain and no Python completes successfully, with no node-gyp invocation in its output.', 'must', 2, NULL, NULL, NULL);
INSERT INTO "story_criterion" ("id", "story_id", "text", "polarity", "position", "superseded_at", "superseded_reason", "warrant_adr_id") VALUES ('01M194FVM5MFEJDZWENTZ490Y5', '01M194EA95B25V3M2MCBC35A1J', 'The plugin dependency is pinned to the `beta` tag.', 'must', 3, NULL, NULL, NULL);
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
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M19366AF5ZVHTYQEY3DVS515', 'epic', 'child', NULL, 1, 'repo-bootstrap', 'Repository bootstrap and TypeScript conversion', 'pending', NULL, '01M191BE7MHM077FE9YM09B2ZK', 'spec', NULL, NULL, '2026-08-30T10:24:35.663Z', '2026-08-30T10:24:35.663Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M19367X8Q1XF3043C63VQ4ZR', 'epic', 'child', NULL, 2, 'plugin-entry', 'Plugin entry and MCP registration', 'pending', NULL, '01M191BE7MHM077FE9YM09B2ZK', 'spec', NULL, NULL, '2026-08-30T10:24:37.288Z', '2026-08-30T10:24:37.288Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M193697Y6ZF3Q1KGVYPW5G15', 'epic', 'child', NULL, 3, 'skill-port', 'Skill port and registration', 'pending', NULL, '01M191BE7MHM077FE9YM09B2ZK', 'spec', NULL, NULL, '2026-08-30T10:24:38.654Z', '2026-08-30T10:24:38.654Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M1936AGMZ3DD6GJZM5ATYYS7', 'epic', 'child', NULL, 4, 'guard-and-docs', 'Guard, documentation and host behaviour', 'pending', NULL, '01M191BE7MHM077FE9YM09B2ZK', 'spec', NULL, NULL, '2026-08-30T10:24:39.956Z', '2026-08-30T10:24:39.956Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M1936BS9145G8158CBKDD07S', 'epic', 'child', NULL, 5, 'publish', 'Publish and release verification', 'pending', NULL, '01M191BE7MHM077FE9YM09B2ZK', 'spec', NULL, NULL, '2026-08-30T10:24:41.257Z', '2026-08-30T10:24:41.257Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M1936GD6626BZ59PA4N3XZ8T', 'coverage_matrix', 'child', NULL, 1, 'repo-bootstrap-coverage', 'Coverage: Repository bootstrap and TypeScript conversion', 'pending', NULL, '01M19366AF5ZVHTYQEY3DVS515', 'epic', NULL, NULL, '2026-08-30T10:24:45.990Z', '2026-08-30T10:24:45.990Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M1936HSVCTR7DHNSQEZJ6GJD', 'coverage_matrix', 'child', NULL, 1, 'plugin-entry-coverage', 'Coverage: Plugin entry and MCP registration', 'pending', NULL, '01M19367X8Q1XF3043C63VQ4ZR', 'epic', NULL, NULL, '2026-08-30T10:24:47.419Z', '2026-08-30T10:24:47.419Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M1936K3F12HXWR910J7M6ZXB', 'coverage_matrix', 'child', NULL, 1, 'skill-port-coverage', 'Coverage: Skill port and registration', 'pending', NULL, '01M193697Y6ZF3Q1KGVYPW5G15', 'epic', NULL, NULL, '2026-08-30T10:24:48.751Z', '2026-08-30T10:24:48.751Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M1936MHHRTWCFA3XKSG3FY6C', 'coverage_matrix', 'child', NULL, 1, 'guard-and-docs-coverage', 'Coverage: Guard, documentation and host behaviour', 'pending', NULL, '01M1936AGMZ3DD6GJZM5ATYYS7', 'epic', NULL, NULL, '2026-08-30T10:24:50.225Z', '2026-08-30T10:24:50.225Z', NULL, NULL);
INSERT INTO "document" ("id", "kind", "numbering", "number", "sequence", "slug", "title", "status", "status_note", "parent_id", "parent_kind", "archived_at", "commit_sha", "created_at", "updated_at", "retro_waived_at", "retro_waived_reason") VALUES ('01M1936NX4THG6HR4SFVA23MSD', 'coverage_matrix', 'child', NULL, 1, 'publish-coverage', 'Coverage: Publish and release verification', 'pending', NULL, '01M1936BS9145G8158CBKDD07S', 'epic', NULL, NULL, '2026-08-30T10:24:51.620Z', '2026-08-30T10:24:51.620Z', NULL, NULL);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M193CRHRQC3Z4E42TM3XKPGT', '01M19366AF5ZVHTYQEY3DVS515', 'epic', 1, 'Vendor v0.7.0 and raise the Node floor to 24', 'pending', NULL, 0, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M193CSTFYJ1RQWVK6AX2QYP0', '01M19366AF5ZVHTYQEY3DVS515', 'epic', 2, 'Convert src/ to erasable-syntax TypeScript', 'pending', NULL, 1, 1);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M193CV7AYZP0X6SV38W5FT4J', '01M19366AF5ZVHTYQEY3DVS515', 'epic', 3, 'Convert the five executables to TypeScript', 'pending', NULL, 2, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M193CWMBV0R2TR8M9NEDNBKV', '01M19366AF5ZVHTYQEY3DVS515', 'epic', 4, 'Restore the inherited test suite green under Node 24', 'pending', NULL, 3, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M193CY1QWF6PRDPHJTR1P95S', '01M19366AF5ZVHTYQEY3DVS515', 'epic', 5, 'Verify persistence parity and determinism', 'pending', NULL, 4, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M193CZBACY1KZJ264E2ZH76G', '01M19366AF5ZVHTYQEY3DVS515', 'epic', 6, 'Enforce import-extension discipline with a module sweep', 'pending', NULL, 5, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M193D0TS9VBQKYHW2PWPFMXX', '01M19366AF5ZVHTYQEY3DVS515', 'epic', 7, 'Stand up CI on Node 24', 'pending', NULL, 6, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M194E5SEXMD6W90PSM0ATR4J', '01M19367X8Q1XF3043C63VQ4ZR', 'epic', 1, 'Plugin entry, MCP registration and the profile seam', 'pending', NULL, 0, 1);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M194E73NGKXF2ZJYSE0S5GZ3', '01M19367X8Q1XF3043C63VQ4ZR', 'epic', 2, 'Establish the effective MCP tool naming under v2', 'pending', NULL, 1, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M194E8W7MJQ0WMEANHJ3YRZQ', '01M19367X8Q1XF3043C63VQ4ZR', 'epic', 3, 'Resolve the skill supporting-files go/no-go', 'pending', NULL, 2, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M194EA95B25V3M2MCBC35A1J', '01M19367X8Q1XF3043C63VQ4ZR', 'epic', 4, 'Zero runtime dependencies and no native compilation', 'pending', NULL, 3, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M194EBJHMAV5E7KCK0PA0GKF', '01M19367X8Q1XF3043C63VQ4ZR', 'epic', 5, 'Verify cross-story integration for Plugin entry and MCP registration', 'pending', NULL, 4, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M194V4CBNMW9KRVBHS83R3DM', '01M193697Y6ZF3Q1KGVYPW5G15', 'epic', 1, 'Pilot the spec skill end-to-end', 'pending', NULL, 0, 1);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M194V5Q15F8TQR44DPVPJBRY', '01M193697Y6ZF3Q1KGVYPW5G15', 'epic', 2, 'Port and register all twenty-three skills', 'pending', NULL, 1, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M194V710KP0J5V188YR3EBDX', '01M193697Y6ZF3Q1KGVYPW5G15', 'epic', 3, 'Invocation without slash commands', 'pending', NULL, 2, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M194V89DXC10121AWAN7KZ5N', '01M193697Y6ZF3Q1KGVYPW5G15', 'epic', 4, 'Enforce the skill-body prohibitions in CI', 'pending', NULL, 3, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M194V9HR3KH3XB66JEG6651N', '01M193697Y6ZF3Q1KGVYPW5G15', 'epic', 5, 'Verify cross-story integration for Skill port and registration', 'pending', NULL, 4, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M1951C1R30C8CQABYF7YZJ82', '01M1936AGMZ3DD6GJZM5ATYYS7', 'epic', 1, 'Guard at OpenCode''s hook path', 'pending', NULL, 0, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M1951DJH04XXS5ZN0Z3GBDSB', '01M1936AGMZ3DD6GJZM5ATYYS7', 'epic', 2, 'Confirm the package cache location and the symlink target', 'pending', NULL, 1, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M1951FE5F4G1PTK9BF5WNW7Q', '01M1936AGMZ3DD6GJZM5ATYYS7', 'epic', 3, 'Session scratch via plugin storage', 'pending', NULL, 2, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M1951GSMQ3JY8MJAX204ZEY0', '01M1936AGMZ3DD6GJZM5ATYYS7', 'epic', 4, 'README for a v2 audience', 'pending', NULL, 3, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M1951J6PTV1WPNCCCF58J3TD', '01M1936AGMZ3DD6GJZM5ATYYS7', 'epic', 5, 'Permission-aware behaviour', 'pending', NULL, 4, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M1957QGCTGTTW0VJP7JHDG74', '01M1936BS9145G8158CBKDD07S', 'epic', 1, 'Publish opencode-dpm at 0.1.0 to npm', 'pending', NULL, 0, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M1957RXJ674PDNMB53CEGBT1', '01M1936BS9145G8158CBKDD07S', 'epic', 2, 'Verify the install from the published artefact', 'pending', NULL, 1, 0);
INSERT INTO "story" ("id", "epic_id", "epic_kind", "number", "title", "status", "status_note", "position", "plan") VALUES ('01M1957TECZSEEFTKG9DNVT7S7', '01M1936BS9145G8158CBKDD07S', 'epic', 3, 'Verify the production restrictions', 'pending', NULL, 2, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193K65CAXT0NDTSER8XM1V6', '01M193CRHRQC3Z4E42TM3XKPGT', 1, 'Vendor the v0.7.0 tree as the starting commit', 'Copy `src/`, `bin/`, `tests/`, `skills/`, `shared/` and `hooks/` verbatim from dpm v0.7.0; drop `.claude-plugin/plugin.json` and `MIGRATION.md`. Addresses the tree only, not any conversion of it.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193K87DGFNXN5CT6QAXX8DX', '01M193CRHRQC3Z4E42TM3XKPGT', 2, 'Rename the package and raise the engine floor', '`name` becomes `opencode-dpm` and `engines.node` becomes `>=24.0.0`. Addresses the manifest; the runtime refusal is task 3.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193K9N7KK9Q0GB2HWMZTQFN', '01M193CRHRQC3Z4E42TM3XKPGT', 3, 'Raise the node-floor refusal from 22.5.0 to 24', 'Addresses the version the refusal checks and the message it prints, not the detection mechanism, which already exists in `src/server/node-floor`.', 'pending', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193KBPP7VCPNZEYNG5K59TB', '01M193CRHRQC3Z4E42TM3XKPGT', 4, 'Write tests for "Vendor v0.7.0 and raise the Node floor to 24"', 'Covers the criteria tagged `unit` and `integration`. The host-runtime criterion is tagged `target` and is not automatable here.', 'pending', NULL, 3);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193KDSC76PNGK7P2A7KWEXE', '01M193CSTFYJ1RQWVK6AX2QYP0', 1, 'Establish the TypeScript configuration', '`tsconfig.json` with `allowImportingTsExtensions` and no emit, plus TypeScript as a devDependency. Addresses configuration, not module contents.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193KFT8T7RKT506PS41K7ZN', '01M193CSTFYJ1RQWVK6AX2QYP0', 2, 'Convert the modules under src/ to .ts, erasable syntax only', 'All 100 modules across the 24 subdirectories. Addresses file extension and syntax; import specifiers are task 3.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193KHFREKM5B576PW3WFD11', '01M193CSTFYJ1RQWVK6AX2QYP0', 3, 'Add explicit .ts extensions to every internal import specifier under src/', 'Addresses the specifier text. The sweep that enforces it across modules nothing imports is story 6.', 'pending', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193KKDYVZ4V49BDTDJPRBV0', '01M193CSTFYJ1RQWVK6AX2QYP0', 4, 'Write tests for "Convert src/ to erasable-syntax TypeScript"', 'Covers the criteria tagged `unit` and `integration`, including the rejection of non-erasable constructs.', 'pending', NULL, 3);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193KND5PXBC6W8MDF95JJQT', '01M193CV7AYZP0X6SV38W5FT4J', 1, 'Convert the five executables to .ts', '`dpm-mcp`, `dpm-guard`, `dpm-publish`, `dpm-import` and `dpm-merge`. Addresses the executables'' own sources and their import specifiers.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193KPX7P1WMQR9C9ZNVWKNM', '01M193CV7AYZP0X6SV38W5FT4J', 2, 'Update every documented invocation to plain node', 'Addresses `package.json` scripts and the pre-commit hook. The README rewrite belongs to the guard-and-docs epic.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193KR7XTC0QNJ1V8XTANGNN', '01M193CV7AYZP0X6SV38W5FT4J', 3, 'Write tests for "Convert the five executables to TypeScript"', 'Covers the criteria tagged `unit` and `integration`, including the rejection of a build-artefact prerequisite.', 'pending', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193KZN6BFWFH2F1P8GZQYFG', '01M193CWMBV0R2TR8M9NEDNBKV', 1, 'Run the inherited suite under Node 24 and fix what the conversion broke', 'Addresses failures the port introduced, not pre-existing behaviour. A failure that reveals a real defect in v0.7.0 is recorded, not silently repaired here.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193M12NRZRJT8RNGYEBS6F2', '01M193CWMBV0R2TR8M9NEDNBKV', 2, 'Confirm the suite''s independence from loaders, network and Claude Code', 'Addresses the environment the suite runs in, not the assertions it makes.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193M2MKB122V365885GYDAW', '01M193CWMBV0R2TR8M9NEDNBKV', 3, 'Write tests for "Restore the inherited test suite green under Node 24"', 'Covers the shape criteria: the test script, the absence of a third-party runner, and the file count holding at 133 with nothing skipped or quarantined.', 'pending', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193M4VFGS3EWKQJ4BF9ADTF', '01M193CY1QWF6PRDPHJTR1P95S', 1, 'Confirm the inherited persistence tests still cover restore asymmetry, read-only mode and row preservation', 'Addresses sufficiency of existing coverage, not new behaviour. Names any criterion the inherited suite does not reach.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193M61PK6JSTMZH2VHDETVN', '01M193CY1QWF6PRDPHJTR1P95S', 2, 'Add byte-stability checks for dump, projection and number allocation', 'Addresses determinism against v0.7.0 output, which the guard''s regenerate-and-compare depends on.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193M85THVYVCMY9379C0ETA', '01M193CY1QWF6PRDPHJTR1P95S', 3, 'Write tests for "Verify persistence parity and determinism"', 'Covers whatever tasks 1 and 2 found uncovered, including the rejection of time-, filesystem- or iteration-order-dependent output.', 'pending', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193MA6W1FT1K795SGD2F040', '01M193CZBACY1KZJ264E2ZH76G', 1, 'Write the module sweep', 'Imports every file under `src/` and `bin/` with plain `node` and reports any specifier that does not resolve.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193MC9R2G5MBSG57NZ6H05R', '01M193CZBACY1KZJ264E2ZH76G', 2, 'Wire the sweep as a step separate from the test suite', 'Addresses the separation NFR5 requires, and is the reason a bad specifier in a module nothing imports is still caught.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193MDV390QBCWZZGVMYCEXJ', '01M193CZBACY1KZJ264E2ZH76G', 3, 'Write tests for "Enforce import-extension discipline with a module sweep"', 'Includes the control check: a deliberately extension-less internal import must make the sweep fail.', 'pending', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193MFSMKYDZR20T4DRT2NN8', '01M193D0TS9VBQKYHW2PWPFMXX', 1, 'Add the CI workflow running suite, type check and sweep on Node 24', 'On every push, under plain `node`, with the run observable in the repository''s CI history.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193MHAAK0602883ANX12NWJ', '01M193D0TS9VBQKYHW2PWPFMXX', 2, 'Provide the disposable isolated environment job', 'No language toolchain present, networking controllable. Consumed by the clean-install check in the plugin-entry epic and the offline cycle in the publish epic.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M193MJNJQMCGC6TDXMYPQQPH', '01M193D0TS9VBQKYHW2PWPFMXX', 3, 'Write tests for "Stand up CI on Node 24"', 'Covers the criteria tagged `integration`: the workflow declares Node 24, runs all three checks, and the isolated environment job exists.', 'pending', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194N6Y45FV8MSVTV5W6VF47', '01M194E5SEXMD6W90PSM0ATR4J', 1, 'Add @opencode-ai/plugin at the beta tag and scaffold the Plugin.define entry', '`src/index.ts` only. The transforms are tasks 2 and 3.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194N8XEDQJ6H0MW4789PD4Z', '01M194E5SEXMD6W90PSM0ATR4J', 2, 'Register the MCP server via ctx.mcp.transform', 'A local server entry whose command runs the packaged `dpm-mcp`. Addresses the server, not skills or commands.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NA95NB4HBSSD76FM96N1', '01M194E5SEXMD6W90PSM0ATR4J', 3, 'Compute the registration set from a profile selection', 'The seam the profile decision requires. Addresses how the list is derived, not what the deferred lite profile eventually contains.', 'pending', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NCD15EEG1KKCBY99AWB1', '01M194E5SEXMD6W90PSM0ATR4J', 4, 'Verify registration in a scratch OpenCode v2 project', 'Manual observation of connected state, recording what the host actually did rather than what the API documents.', 'pending', NULL, 3);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NDRPWWV4TTFYGV8SMARN', '01M194E5SEXMD6W90PSM0ATR4J', 5, 'Write tests for "Plugin entry, MCP registration and the profile seam"', 'Covers the criteria tagged `unit` and `integration`, including both rejections: no hardcoded skill list, and no transform writing to project configuration.', 'pending', NULL, 4);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NFV9RW9K2KM044BFEN1M', '01M194E73NGKXF2ZJYSE0S5GZ3', 1, 'Observe the rendered tool names against a running beta host', 'Namespacing and character substitution. The first implementation task of this milestone, because skill bodies name tools.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NHW9JTNDPN3FZE27A3ZE', '01M194E73NGKXF2ZJYSE0S5GZ3', 2, 'Record the naming as a section on this epic', 'The reference the twenty-three skill bodies are rewritten against in the skill-port epic.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NKA5SVE9W69XA4S3ZZYZ', '01M194E73NGKXF2ZJYSE0S5GZ3', 3, 'Snapshot the tool surface and compare against v0.7.0', 'Addresses the advertised set and every schema, not the rendered naming.', 'pending', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NMQ6CDD48BWXEE7YPAH0', '01M194E73NGKXF2ZJYSE0S5GZ3', 4, 'Write tests for "Establish the effective MCP tool naming under v2"', 'Covers the snapshot comparison and the recorded section. The observation itself is tagged `manual`.', 'pending', NULL, 3);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NQGMF3D1Z1MZA5MD0CP4', '01M194E8W7MJQ0WMEANHJ3YRZQ', 1, 'Register one sample skill with a package location and test whether it resolves the shared conventions file', 'Addresses supporting-file resolution only. A full skill port is the next epic.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NRT5VBJSFFBKFYJVWK3Q', '01M194E8W7MJQ0WMEANHJ3YRZQ', 2, 'Record the go/no-go as a written decision on this epic', 'On a negative answer the decision names inlining the shared conventions into twenty-three skills as the fallback, and states its cost.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NTCCAQQ20PGQ8V26806K', '01M194E8W7MJQ0WMEANHJ3YRZQ', 3, 'Write tests for "Resolve the skill supporting-files go/no-go"', 'Covers the recorded-decision criterion. The resolution itself is tagged `manual`.', 'pending', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NW80HGRERHNRN43MG6TS', '01M194EA95B25V3M2MCBC35A1J', 1, 'Pin the dependency set to @opencode-ai/plugin@beta and nothing else', 'Addresses `dependencies`; devDependencies are unaffected.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NYCVYCFG8EVBGW0EHX4W', '01M194EA95B25V3M2MCBC35A1J', 2, 'Run the clean install in the disposable environment', 'No C or C++ toolchain and no Python present. Consumes the isolated environment job from the bootstrap epic rather than asserting by inspection.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194NZVDP7B3CA5XWNDQA46R', '01M194EA95B25V3M2MCBC35A1J', 3, 'Write tests for "Zero runtime dependencies and no native compilation"', 'Covers the dependency count, the beta pin, and the rejection of a `.node` binary or compile step in the install tree.', 'pending', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194P1KHV8B3FZMY5NP60PGZ', '01M194EBJHMAV5E7KCK0PA0GKF', 1, 'Run the end-to-end milestone-2 check in a scratch project', 'One install: connected server, tool names matching the recorded naming, sample skill resolving its supporting files, and registrations surviving a host reload without duplication.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194XRSHJ9N4GZAVN4FVHE4G', '01M194V4CBNMW9KRVBHS83R3DM', 1, 'Port the dpm-spec skill body', 'ID prefix, tool names taken from the naming recorded in the plugin-entry epic, and invocation prose. One skill only — the batch pass is the next story.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194XT403548NA806GX413X3', '01M194V4CBNMW9KRVBHS83R3DM', 2, 'Register it and run it end-to-end in a scratch project', 'Exercises gates, tool calls and the shared conventions file, which is why this skill is the pilot.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194XVEV2D5G0QPJV059DCHY', '01M194V4CBNMW9KRVBHS83R3DM', 3, 'Record the rewrite pattern as a section on this epic', 'What the batch pass applies twenty-two more times. Addresses the pattern, not any individual skill.', 'pending', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194XXEYCW9GMEYG3S93HTJV', '01M194V4CBNMW9KRVBHS83R3DM', 4, 'Write tests for "Pilot the spec skill end-to-end"', 'Covers the recorded-pattern criterion. The facilitated run itself is tagged `manual`.', 'pending', NULL, 3);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194XZEVM6ZBBJQ6RAHJEKCA', '01M194V5Q15F8TQR44DPVPJBRY', 1, 'Apply the rewrite pattern to the remaining twenty-two skill bodies', 'Addresses prose — IDs, tool names, host mechanics. Registration is task 2.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194Y0SG5F09MSMQK4SM878N', '01M194V5Q15F8TQR44DPVPJBRY', 2, 'Register all twenty-three via ctx.skill.transform with a package location', 'Addresses the transform and the `dpm-` prefix, through the profile seam rather than a hardcoded list.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194Y2VA7BHW4QV9H1DT2094', '01M194V5Q15F8TQR44DPVPJBRY', 3, 'Verify the registry and supporting-file resolution in a scratch project', 'Manual observation of what the host registered and what each skill can read.', 'pending', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194Y4AZD2TWHEPAT0VWDHY2', '01M194V5Q15F8TQR44DPVPJBRY', 4, 'Write tests for "Port and register all twenty-three skills"', 'Covers the computed registration list, the package `location`, and both rejections — no Claude Code mechanism and no SQL in a skill body.', 'pending', NULL, 3);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194Y6F5VEE8EXK6A7AV3VS3', '01M194V710KP0J5V188YR3EBDX', 1, 'Rewrite every skill''s invocation prose for skill-first invocation', 'Addresses how a skill is started, not what it does once started.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194Y89TA9XQE9926WSMA02N', '01M194V710KP0J5V188YR3EBDX', 2, 'Walk each of the twenty-three invocations in a scratch project', 'The affordance check: every skill is reachable by its documented invocation, not merely present in a registry.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194Y9WGT9XSKRPJKRCW11B9', '01M194V710KP0J5V188YR3EBDX', 3, 'Write tests for "Invocation without slash commands"', 'Covers the prose criterion across all twenty-three bodies. The walk itself is tagged `manual`.', 'pending', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194YB5TG8EXGVY14WQTHRZK', '01M194V89DXC10121AWAN7KZ5N', 1, 'Write the skill-body check', 'Claude Code mechanisms and SQL statements, over every body under `skills/`.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194YDN9M17H79N8AMQ8W2RC', '01M194V89DXC10121AWAN7KZ5N', 2, 'Wire it into the CI workflow', 'Alongside the suite, the type check and the module sweep. The spec requires enforcement, not a review convention.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194YEZ7VG8GJ064JRCGAWVF', '01M194V89DXC10121AWAN7KZ5N', 3, 'Write tests for "Enforce the skill-body prohibitions in CI"', 'Includes the control: a planted Claude Code mechanism must make the check fail.', 'pending', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M194YGE31R8XCZNJ8M9B3KKY', '01M194V9HR3KH3XB66JEG6651N', 1, 'Run the end-to-end milestone-3 check in a scratch project', 'Twenty-three skills registered, supporting files resolving from the package, each startable by its documented invocation, and the CI checks green over every body.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955951KMQT3RRNZMCM4VXG', '01M1951C1R30C8CQABYF7YZJ82', 1, 'Port the guard to the v2 hook path', 'Regenerate-and-compare is unchanged in kind. Addresses where the hook lives and what it invokes, not what it decides.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955BB3VDPFNHDS177H20FF', '01M1951C1R30C8CQABYF7YZJ82', 2, 'Carry over the missing-symlink warning on server start', 'Addresses the warning path in the server, not the guard''s own refusals.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955CQWNRED1QPQAC1EN5TG', '01M1951C1R30C8CQABYF7YZJ82', 3, 'Write tests for "Guard at OpenCode''s hook path"', 'Covers the four distinguishable refusal cases, the stale-commit refusal in a temporary repository, and the rejection of any working-tree write.', 'pending', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955ESB47XQRZF5JWSWAC0X', '01M1951DJH04XXS5ZN0Z3GBDSB', 1, 'Install the plugin from git and observe where the package lands', 'A real install rather than a reading of the documentation, since this decides whether the symlink instruction is correct.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955G83NDQ0PV74XC3KPHN4', '01M1951DJH04XXS5ZN0Z3GBDSB', 2, 'Record the location as a section on this epic', 'What the README''s symlink instruction is written against.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955J411EER1YJ4SQ4HZYF6', '01M1951DJH04XXS5ZN0Z3GBDSB', 3, 'Write tests for "Confirm the package cache location and the symlink target"', 'Covers the documented instruction resolving to an existing file. The observation itself is tagged `manual`.', 'pending', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955M860YXX9K7J3QY1GE58', '01M1951FE5F4G1PTK9BF5WNW7Q', 1, 'Audit what was per-session scratch keyed by an environment variable', 'Names each site and whether a database session row already answers it. Addresses the inventory, not the migration.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955NMTW0K5TDDQF5DCBGGS', '01M1951FE5F4G1PTK9BF5WNW7Q', 2, 'Move the remainder to ctx.storage', 'Only what the audit found unanswered by a session row. A row that already holds the fact is left alone.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955QR6MG9EQMTMCBR9Y73Q', '01M1951FE5F4G1PTK9BF5WNW7Q', 3, 'Write tests for "Session scratch via plugin storage"', 'Covers the storage criterion, the `.dpm/` first-run behaviour, and the rejection of any transient file landing in the project tree.', 'pending', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955SV6A5BG6YRVCAFHHGJW', '01M1951GSMQ3JY8MJAX204ZEY0', 1, 'Rewrite install, first run, guard symlink and "when the guard refuses"', 'For an `opencode2` audience, against the cache location story 2 confirmed and the refusal behaviour story 1 delivers.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955VY7EQ3K787H8ZGE5V7V', '01M1951GSMQ3JY8MJAX204ZEY0', 2, 'Remove the CPM MIGRATION.md', 'It does not carry over. Anyone on CPM migrates via the existing Claude Code dpm first.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955XAHCK6R57VP7PJ8CQYX', '01M1951GSMQ3JY8MJAX204ZEY0', 3, 'Write tests for "README for a v2 audience"', 'Every documented command runs as written; the beta statement is present and `MIGRATION.md` is absent. The editorial judgement is tagged `manual`.', 'pending', NULL, 2);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M1955ZAS712K5R70CNN7CWCR', '01M1951J6PTV1WPNCCCF58J3TD', 1, 'Exercise skills under ask and deny rules for the skill action', 'Includes checking that a denied skill does not reach its work by another route.', 'pending', NULL, 0);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M19561EX454HET4ACCBMDKKD', '01M1951J6PTV1WPNCCCF58J3TD', 2, 'Document the recommended permission entries in the README', 'Addresses the entries themselves; the surrounding README rewrite is story 4.', 'pending', NULL, 1);
INSERT INTO "task" ("id", "story_id", "number", "title", "description", "status", "status_note", "position") VALUES ('01M19562V871CD9PMYE2RP1S8J', '01M1951J6PTV1WPNCCCF58J3TD', 3, 'Write tests for "Permission-aware behaviour"', 'Covers the documented entries. Behaviour under the host''s permission engine is tagged `manual`, since the `ask` path needs a human answering the prompt.', 'pending', NULL, 2);
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
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193PWXRAYS2AB8VTTVK1WYV', '01M191NVWV9CP15DT44439W9NZ', 'Node 24 or later on the contributor''s machine', '01M193D8FDXKAV9EN1ZJ9A7Z1D', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193PYWRMWQ85PM23AM0D818', '01M191NVWV9CP15DT44439W9NZ', '`node --version` reporting 24.0.0 or above', '01M193D9T7S4F5FQVWFKP5VSNE', 1, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193Q06QK28CWKEPXB8EYXC4', '01M191PQA3QF3YC847X5Y9CD4F', 'each executable refusing with an explanatory message when it is below', '01M193DB47YHMBWCT7A716NYSC', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193Q28MQHYSHQX1QZSG1VM4', '01M191HEEXRNX7Z6Z46ATS49FW', 'the Node-floor refusal', '01M193DB47YHMBWCT7A716NYSC', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193Q4AZMYXCW5RMA0E9711T', '01M191PQA3QF3YC847X5Y9CD4F', 'Node 24 or later on the host running OpenCode', '01M193DCM1K8BQ3WDJW5D71JEC', 1, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193Q6BEGP4X6Y7VFC6B41E4', '01M191KSQTS6M41QHYTJX0WAM6', 'TypeScript throughout, restricted to erasable syntax so Node runs the sources directly', '01M193DX4V2DM8BE44DGT6WX1Z', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193Q8H82GC80GJ7F5EHQKQ6', '01M191KSQTS6M41QHYTJX0WAM6', '`tsc --noEmit` is a type check in CI, not a compile, and no build artefact is produced or published', '01M193DYE04PACNNT4K28E2ZH5', 1, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193Q9ZW12SS7CTECJ5J1A90', '01M191KSQTS6M41QHYTJX0WAM6', 'no build artefact is produced or published', '01M193E01EFGYAC7DQNE00V8SP', 2, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193QB9BFP85CN7RZKCM8JBY', '01M191KSQTS6M41QHYTJX0WAM6', 'restricted to erasable syntax so Node runs the sources directly', '01M193E5G28976MBHQB7RG100V', 3, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193QD9V3Y5SKCWCHR73VQFW', '01M191M0X2D61B6XGBY2SPA0MA', 'Every internal import specifier carries an explicit `.ts` extension', '01M193E1AAYA4JR37J9VCPKPBQ', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193QFF034ND6ZVX5XZHFG6Q', '01M191M0X2D61B6XGBY2SPA0MA', '`tsconfig.json` sets `allowImportingTsExtensions` so the type check accepts them', '01M193E2TA66F7ETYVMNGFR1PZ', 1, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193QH1WV8658BA1RD7QB3SX', '01M191NZRB4NJ2A07WES55GFTT', 'TypeScript available for type checking', '01M193E43WVAGWSWYXH8RPZ5QW', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193QPFSZAW981X77HQT82JZ', '01M191HM8EE473JDD426R9FQRE', 'keep their responsibilities, become TypeScript sources, and remain runnable directly with `node` and no loader', '01M193EQ3NX07VKK43JY05862K', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193QRD8J9WR7H1DA6Y3NERQ', '01M191HM8EE473JDD426R9FQRE', 'remain runnable directly with `node` and no loader', '01M193ERD7MFZHTTVE5V5C87S4', 1, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193QTFXXT730E3TM9C51EKC', '01M191PJJS5APQC7DK4P73CR1G', 'the test command and each executable''s invocation passing no `--loader`, no `--import`, and no transpiler flag', '01M193ESMVJWNYV6M414M6YPK4', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193QVW3SG7QQAQT6J4EPRQM', '01M191M0X2D61B6XGBY2SPA0MA', 'Every internal import specifier carries an explicit `.ts` extension', '01M193ETX989XQBWP3Q42YARG2', 2, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193QYN1KEM0KEF6HZ2HXTJQ', '01M191HRH294FESBRF5JK3CZGQ', 'The `node --test` suite — 133 test files at v0.7.0, including the corpus snapshot tests — runs against the TypeScript sources in CI, under plain `node` with no loader', '01M193F4ARJXN6FTVEHGWR5ZPH', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193R0V14ASSRCP32MJHVJCX', '01M191HRH294FESBRF5JK3CZGQ', 'under plain `node` with no loader', '01M193F5NW1AFT46MCZNJ96YQX', 1, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193R2YV50AQE2ZT2XMJ1K8H', '01M191NX38ANZRH042J1KQ91S0', '`node --test` is the test runner', '01M193F6Z5TXMDCD3RFYSEGF28', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193R4WPYDA9DZQF74XDQ9A0', '01M191PMSEVEWV2QZPCTQB0KQ7', 'Claude Code must not be required', '01M193F87VVRVZWAP1SM30F069', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193R691KVTF492DFP1S3KPF', '01M191HRH294FESBRF5JK3CZGQ', '133 test files at v0.7.0', '01M193F9KNFCDGK2QSDSPVS94B', 2, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193R93HMEYCN54BD6GYNX15', '01M191HEEXRNX7Z6Z46ATS49FW', 'Fresh-clone restore from `.dpm/dpm.sql`, deterministic dump on publish', '01M193FQGGJ67KRCZFPN3MXRBC', 1, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193RAGVX6H2N3PEMNH8WZJT', '01M191HEEXRNX7Z6Z46ATS49FW', 'the empty-database restore asymmetry', '01M193FRT59R36EMJVSAAJV06F', 2, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193RCGCMA9NVHAPMB99HYQC', '01M191HEEXRNX7Z6Z46ATS49FW', 'read-only server mode', '01M193FT7VMVH6KCQRCH2VWWHV', 3, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193RE0GYRV2R9J4YR33CMT8', '01M191HEEXRNX7Z6Z46ATS49FW', 'all carry over with their existing behaviour', '01M193FVGVRG8G9YJN3WRK4YH0', 4, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193RKS539HXYKK4P83MYTNG', '01M191KY76N9B04YVJK69YMCGW', 'Dump output, projection output, and ULID and number allocation behaviour remain byte-stable across the port', '01M193FX1BZKNJ7JAHF8RX06VP', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193RN5EMVXXHG7FHYR9MV37', '01M191KY76N9B04YVJK69YMCGW', 'remain byte-stable across the port', '01M193FYCMV2DP2EKB26R5MZK2', 1, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193RQ9DFEQDC5TBTJ90AFPJ', '01M191KY76N9B04YVJK69YMCGW', 'ULID and number allocation behaviour remain byte-stable', '01M193FZNQC4QV3DAW0N7DKFAH', 2, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193RRQR01V5PR6EQTVRKM3Q', '01M191KY76N9B04YVJK69YMCGW', 'The guard''s regenerate-and-compare depends on it', '01M193G0YDX509GJFF9ZCNZQ11', 3, NULL, NULL, '2026-08-30T10:35:11.435Z', 'The fragment quoted NFR4''s rationale clause rather than its obligation. Rebound to "remain byte-stable across the port", which is the half the criterion is measured against and the half that survives an amendment.');
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193RW3E197RBCB0XNF50KTZ', '01M191M0X2D61B6XGBY2SPA0MA', 'a dedicated CI sweep that imports every module under `src/` and `bin/` with plain `node`', '01M193GKDT2XCYZX2BTVK28EFG', 3, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193RXK1CVZ0PD3THDYM2TNH', '01M191M0X2D61B6XGBY2SPA0MA', 'The sweep exists separately from the test suite', '01M193GMS1262AS0G1WJJRN5C4', 4, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193RZK26Q0SRYC63YS87JRZ', '01M191M0X2D61B6XGBY2SPA0MA', 'a bad specifier in a module nothing imports would otherwise reach a release unobserved', '01M193GP3FBRTFPHKQWB3FQT3A', 5, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193S1PKZZ91EB03K6W3P5R1', '01M191PB5ZT101VW751N9HTCER', 'a CI job running the full `node --test` suite on Node 24 under plain `node`, plus the type check and the module sweep, on every push', '01M193GQM0AB6H2KSCW4MRT30V', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193S3P5P95893MT5WAK8QC8', '01M192BM6P7KCFK6EJBPF417RR', 'a disposable isolated environment — a container or equivalent — that can be started with no language toolchain present and with networking disabled', '01M193GRYP8P048ZT249ZAEKNT', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M193T226VA0APZ12AB06B8TE', '01M191KY76N9B04YVJK69YMCGW', 'remain byte-stable across the port', '01M193G0YDX509GJFF9ZCNZQ11', 3, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194P7NG4C5832D7XT4EPPTY', '01M191HA9AJ98W4FGB37DC3P1Y', 'The plugin registers the bundled server via `ctx.mcp.transform`, setting a local server entry whose command runs the packaged executable.', '01M194EG89790D48T5NHTDT06V', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PAFXQR6Q1ZQV1J0CZ6HW', '01M191H7HSQA83WM93W0J944HF', 'the MCP server registered and connected', '01M194EHHR2D4FSSCXZD7JP62Q', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PCKZ80KD60E1HCQJ7EZ6', '01M191PRJD860MEPCETCTG156D', 'the plugin loading under a 2.x host and its MCP server, skills and any commands appearing in that host''s registries', '01M194EHHR2D4FSSCXZD7JP62Q', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PEPJEW871DPJT71DG1A3', '01M191H7HSQA83WM93W0J944HF', '`opencode2 plugin add github:ninthspace/opencode-dpm` — and later the npm form — yields a working DPM', '01M194EJSQK9PE8Z752TXFK7H4', 1, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PG33PH2SCJR7XTAM1Z4P', '01M191H7HSQA83WM93W0J944HF', 'nothing further for the user to copy into the project', '01M194EM8CWAZRDTC334V3C5DR', 2, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PK4C6NTNFVS34JQ1X6ZT', '01M191JCC04JEVXVWFMS1V9RMJ', 'The architectural seam that makes it selectable at registration time is decided here and is not deferred.', '01M194ENM43AE2X5FJSC5PMGMW', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PMSE9QB8Y0V9P1KMXGDT', '01M191JCC04JEVXVWFMS1V9RMJ', 'a reduced model-facing surface selected by plugin option', '01M194EPXXEJA3Z3KDNQP2ET4E', 1, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PQ43CZJGTJ0SFBYTWSRE', '01M191P15MPZRFA7HH2Z91K8XP', 'an OpenCode v2 beta CLI on the contributor''s machine', '01M194EV8C53PC9JWDSZC1RM11', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PSR90WB4AMRQ5JN9HK19', '01M191HD4T54B4H7JB9M9Z8DF9', 'tool names take v2''s effective naming', '01M194FFY5KNSQPR1VFWYC2M3B', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PVTF3HG0P0ZB7CNV6QJA', '01M191HD4T54B4H7JB9M9Z8DF9', 'Skill prose is revised wherever it names host mechanics', '01M194FHDH8GNXYDSVQED2F712', 1, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PXF6JKHM3JAS03CA6PWQ', '01M191HA9AJ98W4FGB37DC3P1Y', 'Tool behaviour and schemas carry over from v0.7.0 unchanged.', '01M194FJT0H0A3Q3WH8BRQVYRD', 1, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194PZATQKK3GSD16379W2JK', '01M191HD4T54B4H7JB9M9Z8DF9', 'with `location` pointing into the installed package so directory-based skills keep their supporting files', '01M194FM7Q119W43CC75HS3KB6', 2, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194Q2425G6HXSKG9PV8JYF1', '01M191KQV386EDYK9Z9H12D2N5', 'The only entry under `dependencies` is `@opencode-ai/plugin`.', '01M194FQMGZ9RX4Y88CD1J97H1', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194Q3TCDK3CFC4BYAH62HN8', '01M191KQV386EDYK9Z9H12D2N5', 'no native modules and no install-time compilation', '01M194FRYSWQ0N4AQATAT1G359', 1, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194Q5Q3MZK4N57865F9VKKM', '01M191PDECZ9F46H7Q6J8XNSDP', 'native compilation must not be required', '01M194FTA9GZZ9N79DT3HDT8TG', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194Q8G934WCKX0F2PS10YBX', '01M191KW1TEYZR0S56SCE5GZDC', 'The plugin pins `@opencode-ai/plugin@beta`', '01M194FVM5MFEJDZWENTZ490Y5', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194QA9AXAA84WEYZY3VMGXQ', '01M191P6ZQ9026CAE9NPHA7VXK', 'installing the plugin into a throwaway project and observing its MCP server reach connected state with the skills advertised', '01M194FX20305CQQT6QS7CJGPR', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194YPV1N00588YDCT47GW1Q', '01M191HD4T54B4H7JB9M9Z8DF9', 'All twenty-three skills port and are registered via `ctx.skill.transform`', '01M194VE43GK7C7BH8H4MDQ63H', 3, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194YRXJ2T0WZT4EPWDWQ2YT', '01M191HD4T54B4H7JB9M9Z8DF9', 'Skill prose is revised wherever it names host mechanics', '01M194VFCP1G64RJ8WRQS89M1Y', 4, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194YV0T9TZVJTM9KXT684Q2', '01M191HD4T54B4H7JB9M9Z8DF9', 'All twenty-three skills port and are registered via `ctx.skill.transform`', '01M194VGZ74ESZAEJCEMG2H16T', 5, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194YX8C0XQ72FDCQKXF0EMK', '01M191HD4T54B4H7JB9M9Z8DF9', 'All twenty-three skills port and are registered via `ctx.skill.transform`', '01M194VJVB8R3KTX3P4454B0Z2', 6, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194YZ5M8EJB33ZMCHK6QFVB', '01M191HD4T54B4H7JB9M9Z8DF9', 'with `location` pointing into the installed package so directory-based skills keep their supporting files', '01M194VM5FRSF9VZ1TWTKP5RSJ', 7, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194Z1PJSEY02808TX6P6S58', '01M191P6ZQ9026CAE9NPHA7VXK', 'a scratch OpenCode project to register into', '01M194VNQ50TGA8264V5PHA1E0', 1, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194Z3N2KEG60Z6PGTF85C4S', '01M191HD4T54B4H7JB9M9Z8DF9', 'Skill prose is revised wherever it names host mechanics', '01M194VQ2QCJ4020HR42JXK3Y7', 8, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194Z6AK3NV3CSFEF5TQC3PM', '01M191HA9AJ98W4FGB37DC3P1Y', 'no skill contains SQL and nothing parses prose', '01M194VRDNAEP9SCDBAH4C0J21', 2, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194Z84ANPGF8V42ZB1F8Z0E', '01M191HD4T54B4H7JB9M9Z8DF9', 'the invocation story replaces Claude Code''s slash-command triggers', '01M194VSR5JZZR958JRYYF2KDW', 9, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194ZAEN8K3FXHNJDHTVQ526', '01M191HD4T54B4H7JB9M9Z8DF9', 'the invocation story replaces Claude Code''s slash-command triggers', '01M194VV9XC04F7SQ8MKEPWCRG', 10, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194ZBVSB870DH5R5W5X4V43', '01M191HD4T54B4H7JB9M9Z8DF9', 'Skill prose is revised wherever it names host mechanics', '01M194VWMM11SJTB3Q9SMBGN57', 11, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194ZDS2MFKBM6MX2D5V5TEM', '01M191HA9AJ98W4FGB37DC3P1Y', 'no skill contains SQL and nothing parses prose', '01M194VY2FQEV5RSK2GPFNH5H3', 3, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194ZG5720VY0M1VQMFYKTS7', '01M191HD4T54B4H7JB9M9Z8DF9', 'Skill prose is revised wherever it names host mechanics', '01M194VZDMC55A44927FT1B92W', 12, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M194ZHEXK4DE85A52DTJS9J8', '01M191HD4T54B4H7JB9M9Z8DF9', 'All twenty-three skills port and are registered via `ctx.skill.transform`', '01M194W0TC6HRDEVD355Q2DJAZ', 13, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1953NYEDFK21CRSKKFYCJP5', '01M191HPCXWPEDVYD8ZCRGZNJQ', 'It remains a git hook that regenerates and compares, fixes nothing, and refuses with the four-case explanation.', '01M1951PTC1VWJZVSP9FVCZ4GK', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1953R36ZMWTGDJN6N315SJ6', '01M191HPCXWPEDVYD8ZCRGZNJQ', 'refuses with the four-case explanation', '01M1951RD86DGGT8DA7SN9D4ZS', 1, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1953T2RHGG7DY0VXNDJ6JV4', '01M191HPCXWPEDVYD8ZCRGZNJQ', 'the missing-symlink warning on server start carries over', '01M1951T9CJFNTE8MRR6DQABEP', 2, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1953W5V4CE54RA7SRZ6STB7', '01M191Q160A0AWMXH0WTD2P0GF', 'a git repository in the user''s project', '01M1951VHMJXCBTW9T1QQHJ4ZD', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1953YCV7QKNZYBSRCABHXPA', '01M191P8TH87TEYAPJ9V0F4P3S', 'git with hook support', '01M1951WVTFY7ZSXMQC13N50XD', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195408D47AN983SCHE752S3', '01M191HPCXWPEDVYD8ZCRGZNJQ', 'fixes nothing', '01M1951Y69R03FNXVQEMMZQ7DB', 3, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M19542NV34ABF79X4WWHDB8D', '01M191HPCXWPEDVYD8ZCRGZNJQ', 'The install instruction is updated for where OpenCode places plugin packages', '01M1951ZDWW46AVDM0W2HYWW9K', 4, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195444SBSDP453H5EQ9VEMH', '01M191HPCXWPEDVYD8ZCRGZNJQ', 'The install instruction is updated for where OpenCode places plugin packages', '01M19520QN2C18CNA5H7Y4V9F0', 5, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M19545QWPDQB4EKTREGCWYNK', '01M191HZ1QER0TFPZ2DQQ4NYJX', 'Anything that was per-session scratch keyed by an environment variable in Claude Code uses `ctx.storage` where a database session row is not already the answer.', '01M195222V3F5N030BXG5G96Z5', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195472H50WSSVQM5X4EFRZJ', '01M191Q35NNXEWQK0HNQGBD5PY', 'filesystem write access to `.dpm/` inside the project', '01M19523F9VFN8WFH9F47189DE', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1954986K9TD3Z0SFB317NGB', '01M191HZ1QER0TFPZ2DQQ4NYJX', 'No transient files land in the project tree.', '01M19524XRETPQRAV06SN1DYN1', 1, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1954AMP0DCPW1MR1Z3CN88Z', '01M191J1W9E36VGT6DC7ZVKP94', 'Install, first run, guard symlink, and "when the guard refuses" are rewritten for `opencode2`.', '01M19526A8XJ1WYP8ZFANDN47R', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1954C0A0QNDFEVH9RPNTQME', '01M191J1W9E36VGT6DC7ZVKP94', 'README for a v2 audience', '01M19527MPE5AZ88PQKQDDBRZY', 1, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1954E2V62CY5GA1RB8Y5QP7', '01M191KW1TEYZR0S56SCE5GZDC', 'the README states plainly that OpenCode v2 is beta and that entrypoints may move under it', '01M1952916VPEHNVF62ZRPZJT9', 1, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1954FC3GWFWP45MNSE4A0QT', '01M191J1W9E36VGT6DC7ZVKP94', 'The CPM MIGRATION.md does not carry over.', '01M1952AA2WKSFC1BYDMBX56B9', 2, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1954HJVCTHXCFQ5YRG8BFZ7', '01M191HSY4Z56KCR1HWSDVA1VE', 'Skills behave correctly under `ask` and `deny` rules for the `skill` action', '01M1952BP02Z605Y9J2DDTJN2A', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1954K4J0NBF15NN3GZ49553', '01M191HSY4Z56KCR1HWSDVA1VE', 'the README documents the recommended permission entries', '01M1952D3979C6V01MTJ0QQAVA', 1, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1954MHHPWFVZPYWHQAABNTG', '01M191HSY4Z56KCR1HWSDVA1VE', 'Skills behave correctly under `ask` and `deny` rules for the `skill` action', '01M1952EHHSB6MCM5HC6WVF27C', 2, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M1959Z5SA2K0SQS8SHKW8SSM', '01M191H7HSQA83WM93W0J944HF', 'and later the npm form', '01M1957YVRSJYH47D6Q7T8P9D4', 3, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195A0SJH0P1AZ6AX545FR7X', '01M191HD4T54B4H7JB9M9Z8DF9', 'with `location` pointing into the installed package so directory-based skills keep their supporting files', '01M19580542A1BB87XVK0Z4PAN', 14, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195A23A83Z2QQJJ3899KH01', '01M191HD4T54B4H7JB9M9Z8DF9', 'so directory-based skills keep their supporting files', '01M19581F5PNNE5NRYM3WB9AP0', 15, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195A3FPRPF0T8Y3K373DRRY', '01M191H7HSQA83WM93W0J944HF', 'yields a working DPM: the MCP server registered and connected, all skills advertised, and nothing further for the user to copy into the project', '01M19582S6ABCHQ857XN2YRTYV', 4, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195A4V1RG5EX92M2D67J01Z', '01M191H7HSQA83WM93W0J944HF', 'yields a working DPM', '01M1958422X7G47SMQ39TMXG8P', 5, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195A6SKBM6K956182YJMPZJ', '01M191H7HSQA83WM93W0J944HF', 'and later the npm form', '01M19585MT85VK08FVW7BECR4C', 6, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195A84BND1631RWDYS41ETG', '01M191Q578097ZDAS8SA8MGHY1', 'network access must not be required at runtime', '01M19586ZSAR67SXCYCPMJ809T', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195AA79Q6TWZ1K5XFEGJ8W9', '01M191Q6FFNXB7AR19TRT6RCSE', 'a database service must not be required', '01M19588P1E29S4HC9CCKXZBW0', 0, NULL, NULL, NULL, NULL);
INSERT INTO "coverage" ("id", "requirement_id", "spec_fragment", "story_criterion_id", "position", "verified_at", "binding_hash", "retired_at", "retired_reason") VALUES ('01M195ABNSAPG47JEWMCVPJ76S', '01M191Q82N7NWEGDG30HYFKX8S', 'Claude Code artefacts must not be required', '01M1958A0KK1F5NKHD6FV933JV', 0, NULL, NULL, NULL, NULL);
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
