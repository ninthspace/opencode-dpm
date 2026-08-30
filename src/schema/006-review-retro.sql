-- Review, retro and audit.
--
-- **Every reference to `taxonomy` pins the domain it may draw from**, in a column a CHECK
-- holds to one value, joined to `taxonomy(id, domain)` rather than to `taxonomy(id)`. The
-- scoping is the half that is easy to leave out: a bare `REFERENCES taxonomy(id)` stops the
-- misspellings but still admits a severity where a category belongs, so the vocabulary is
-- enforced and the *vocabularies* are not.
--
-- `taxonomy` and `agent` are seeded in Story 2. The forward references are legal at CREATE
-- and unsatisfiable at write time until then.

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

-- A retro observation. Also the story-level `**Retro**:` field, which is the
-- same thing recorded earlier — hence the inclusive parentage.
--
-- **Parentage is inclusive, because promotion must not erase where an observation came
-- from.** An exclusive `CHECK ((retro_id IS NULL) <> (story_id IS NULL))` — which an earlier
-- draft had — makes the act of gathering an observation into a retro destroy its story link,
-- since satisfying the constraint means clearing `story_id`. `story_id` is the origin and
-- survives promotion; `retro_id` is the grouping and is set when the retro is written.
CREATE TABLE observation (
  id              TEXT NOT NULL PRIMARY KEY,
  retro_id        TEXT,
  retro_kind      TEXT CHECK (retro_kind = 'retro'),
  story_id        TEXT REFERENCES story(id)    ON DELETE CASCADE,
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
  CHECK ((library_doc_id IS NULL) = (library_doc_kind IS NULL)),
  CHECK ((retro_id IS NULL) = (retro_kind IS NULL)),
  CHECK (retro_id IS NOT NULL OR story_id IS NOT NULL),
  CHECK ((retired_at IS NULL) = (retired_reason IS NULL))
);

-- Nullable `retro_id` makes a plain UNIQUE useless here, for the reason already
-- documented against `coverage`. The partial index constrains only rows that
-- have a retro to order within.
CREATE UNIQUE INDEX observation_retro_position
  ON observation (retro_id, position) WHERE retro_id IS NOT NULL;

-- Many-to-many: an observation genuinely spans categories. Real ones were forced into
-- invented compounds — `Testing gap / pattern`, `Pattern reuse + testing` — because the
-- format allowed one category and the work spanned two.
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
                     CHECK (severity_domain = 'severity'),
  FOREIGN KEY (audit_id, audit_kind)           REFERENCES document(id, kind) ON DELETE CASCADE,
  FOREIGN KEY (dimension_id, dimension_domain) REFERENCES taxonomy(id, domain),
  FOREIGN KEY (severity_id,  severity_domain)  REFERENCES taxonomy(id, domain),
  UNIQUE (audit_id, position)
);

-- `**Retro applied**: 12 · Codebase discovery · Applied — <text>`
-- Four fields in one prose line, on 29 epics.
--
-- `theme` and `note` are `NOT NULL DEFAULT ''` rather than nullable, so the UNIQUE actually
-- constrains — nullable columns in a UNIQUE are the trap documented against `coverage`, and
-- the fix is cheaper here than a second pair of partial indexes.
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
