-- Relationships as typed edges.
--
-- Blocking is a **relationship**, and an earlier draft of the spec made it a `status` value —
-- the same category error the Problem Summary accuses CPM of committing with `**Source
-- spec**`. A status cannot say *what* blocks you, cannot be traversed to find a ready epic,
-- and cannot be invalidated when the blocker completes.
--
-- The kinds are rows because more relationships exist than any one skill defines, and
-- `gates_work` is what separates the edge that stops work from the ones that only record
-- lineage — so readiness is a query over one flag rather than a hardcoded list of kinds.

CREATE TABLE dependency_kind (
  kind         TEXT NOT NULL PRIMARY KEY,  -- 'blocks','builds_on','constrains','supersedes'
  gates_work   INTEGER NOT NULL DEFAULT 0,
  position     INTEGER NOT NULL,
  retired_at   TEXT                        -- FR24 applies here too
);

-- Source and target may each be a document *or* a story, because both directions occur in
-- real epics: an epic blocked by epics, and a story blocked by another story.
--
-- **The four columns are two exclusive pairs, not four independent nullable references.** The
-- first two CHECKs are what make that true; without them a row could name both a document and
-- a story at one end, or neither, and every query downstream would have to decide what that
-- meant.
--
-- The self-edge CHECKs rule out `A depends on A` and **nothing more**. `A blocks B` together
-- with `B blocks A` is two perfectly legal rows, because reachability is not expressible as a
-- row-level constraint. That gap is deliberate and is closed twice elsewhere: the link tool
-- refuses an edge that would close a cycle over a `gates_work` kind, and FR14's integrity
-- check reports the cycles that predate the rule or arrive by restore. Leaving it open here
-- rather than pretending otherwise matters because the failure is the worst shape available —
-- a readiness query over a cycle returns nothing ready, which reads exactly like everything
-- being done and raises no error at all.
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

-- One expression index rather than four partial ones. Three of the four columns are NULL in
-- every row, and a plain `UNIQUE` over them constrains nothing at all, because SQLite treats
-- NULLs as distinct — so the same edge would be storable any number of times. `coalesce`
-- collapses each absent end to one sentinel value, which makes two identical edges identical
-- to the index as well. The sentinel is an integer and every id is a ULID stored as TEXT, so
-- no real id can ever collide with it: SQLite never compares values of different storage
-- classes as equal.
CREATE UNIQUE INDEX dependency_edge ON dependency (
  kind,
  coalesce(source_document_id, -1), coalesce(source_story_id, -1),
  coalesce(target_document_id, -1), coalesce(target_story_id, -1)
);
