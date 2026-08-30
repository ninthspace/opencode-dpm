-- The vocabularies.
--
-- Everything here is a controlled term list, and every one of them is a table rather than a
-- sentence in a skill file because that is the difference the spec measured. CPM fixes seven
-- retro observation categories in prose; across 22 real retro files they appear as twelve
-- distinct headings, the canonical spelling in the minority of its own category and one
-- category never used at all. Review finding categories — the same project, the same author,
-- but written into an output template as literal headings — held almost perfectly. The
-- difference is form, not discipline.
--
-- These tables are created here and filled by `applyVocabulary`. Story 1's tables reference
-- all three as forward references, which SQLite resolves at write time rather than at CREATE.
--
-- **`retired_at` is the only retirement column.** A retired term stays readable and stays
-- referenced; what retirement stops is *new* rows arriving. SQLite has no way to say that in
-- a foreign key, so it is said in a trigger — and those triggers are derived rather than
-- written, in `retirement.js`, because the alternative is remembering to hand-write one for
-- every referencing column every vocabulary ever gains.

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

-- The agent roster: a vocabulary like the `taxonomy` domains, but its own table for the
-- reason `test_approach` is one — it carries columns no other vocabulary needs.
--
-- `personality` and `communication_style` are prose and nothing filters on them, which under
-- AD7 would argue for leaving them out. They are columns anyway, because a project-added
-- persona needs somewhere to put its own; keeping them in a plugin file keyed by name breaks
-- the append case that is the whole point of the table.
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
