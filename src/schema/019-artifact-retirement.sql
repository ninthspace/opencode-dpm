-- FR25 — a register that drops entries cannot answer the question it exists for.
--
-- `/cpm:artifact` strikes a superseded entry through rather than removing it, and states the reason
-- in the skill: a register that silently drops entries cannot answer "what happened to that page?",
-- which is one of the questions it was written to answer. Held as `~~strikethrough~~` that is an
-- editing convention — the reason it survives is that whoever amends the row remembers to keep it.
--
-- Here it is the pair every other retirable thing in this schema carries. `observation.retired_at` /
-- `retired_reason` is the exact precedent, down to the CHECK: a retirement without a reason is a
-- decision with no record of who made it or why, and a reason without a date is a note. `artifact`
-- then gets `live: 'retired_at'` on its list, so a retired page stops being *offered* and stays
-- readable by key — and `includeFlag` derives `include_retired` from the column name with nothing
-- further to declare.
--
-- **Retirement is not deletion and not archival.** The page may still be live; what has changed is
-- that this project no longer points anyone at it. That is why the reason is required rather than
-- optional: "superseded by the 47-08 explorer" and "the page 404s" are the same column and different
-- facts, and only the second means the URL is dead.
--
-- The CHECK rides on the second column because it needs both to exist, for the reason
-- `015-retro-waiver.sql` sets out at greater length.
--
-- **A new file rather than an edit to `007-artifacts-session.sql`**, per the forward-only rule
-- `migrate.js` states.
ALTER TABLE artifact ADD COLUMN retired_at TEXT;
ALTER TABLE artifact ADD COLUMN retired_reason TEXT
  CHECK ((retired_at IS NULL) = (retired_reason IS NULL));
