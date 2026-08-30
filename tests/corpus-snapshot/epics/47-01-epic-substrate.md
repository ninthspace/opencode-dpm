# Substrate

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Date**: 2026-08-08  
**Status**: Complete — all 88 coverage rows verified. Row 81's ✓ was cleared by the pivot of 2026-08-10 when `review_agent` became `document_agent`, and restored on 2026-08-10 against `vocabulary.test.js`, which asserts the rejection on `document_agent.agent` and on `finding.agent` alike — the criterion as amended, not as it stood before  
**Blocked by**: —  
**Retro applied**: 33 · Codebase discovery · Applied — every DDL batch is executed against a real SQLite database as it is written; each kind-pinning and rejection criterion is asserted by a failed INSERT rather than by reading the constraint  
**Retro applied**: 33 · Codebase discovery · Applied — no probe or test counts unless `PRAGMA foreign_keys=ON` was set on that same connection; Story 1's fresh-connection criterion asserts against a reopened temp-file database, not a shared handle  
**Retro applied**: 33 · Codebase discovery · Applied — Task 1.3's ULID switch sweeps for consumers assuming an integer rowid (FTS5 in particular) before being declared done  
**Retro applied**: 35 · Complexity underestimate · Applied — every count this epic states is derived from the spec's Data Model at the moment the task needs it, and the build follows the derived number rather than the epic's prose figure  
**Retro applied**: 35 · Testing gap · Applied — no test or check run is piped through `head`/`tail`; full output goes to a file and is read, so a cut-off buffer is never read as a clean pass  
**Retro applied**: 33 · Pattern worth reusing · Applied — after each DDL-writing task the whole schema is re-run from empty, catching a break at the batch that caused it rather than at Story 8's parity gate

Milestone M1 (AD6). Nothing here is user-facing: the plugin skeleton and test harness, the
schema, its seeded vocabularies, number allocation, the edge table, migrations, and the
integrity check that reports the invariants SQLite cannot hold.

**Story 0 runs first, and its number is not its position in the build order.** Every other
story in this epic writes DDL or a test, and both need somewhere to live and something to run
them. Stories 1–9 keep the numbers Chris approved because renumbering them churns roughly 79
`Covered by` cells in the coverage matrix — the churn Task 9.4 decided against, and the cause
of three of review 05's findings. The `Blocked by` graph is what orders execution; the number
is identity only.

## Stand up the plugin skeleton and the test harness
**Story**: 0  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: NFR1, and the spec's **Test Infrastructure** section  
**Retro**: [Codebase discovery] `node:sqlite` is not `sqlite3` on the point retro 33 warned about — `DatabaseSync`'s `enableForeignKeyConstraints` defaults to **true**, so a connection enforces unless something disables it, and the harness's non-enforcing connection has to be built through the constructor rather than by omitting a `PRAGMA`; Story 1's fresh-connection criterion is still worth its place, since Task 1.4 must set the pragma explicitly rather than inherit an experimental API's default.  
**Retro**: [Pattern worth reusing] Every guard this story produced was mutation-checked by planting the violation it exists to catch — a seam-bypassing fixture, a markdown fixture, a `better-sqlite3` dependency — and each failed the right test before being reverted; worth repeating for Story 6's register-to-check parity and Story 7's triggers, where a check that cannot fail passes exactly as loudly as one that works.  
**Retro**: [Codebase discovery] `node --test` on Node 22.18 does not accept a directory argument — it resolves the path as a module and fails — so the suite's one command is a quoted glob Node expands itself (`node --test "dpm/**/*.test.js"`), or a bare `node --test` run from `dpm/`.

**Acceptance Criteria**:

- A test creates its own database, exercises it, and leaves nothing behind; two tests running in one process do not share state [unit]
- The whole suite runs from one command that needs no install step and no compiled dependency [integration]
- must NOT — a fixture is a markdown file parsed at load, rather than built by calling create tools [integration]
- `dpm/` is installable from the marketplace manifest as a plugin alongside `cpm/`, with no build step [target]
- must NOT — a dependency is added whose install requires compilation [unit]

### Create the `dpm/` plugin directory, its manifest and its marketplace entry
**Task**: 0.1  
**Description**: `dpm/` sits beside `cpm/` in the same marketplace repository, which is not an incidental layout: the spec's **Testing Strategy** requires the suite to read CPM's `skills/` directory as a name oracle for FR25's twenty-two, and states that being a sibling in the same commit is what removes the version pin. Covers the marketplace-installability criterion, which is `[target]` for the same reason Epic 47-03's NFR1 criterion is — it needs a real install to assess.  
**Status**: Complete

### Stand up the test harness on `node --test` with a per-test database lifecycle
**Task**: 0.2  
**Description**: `node --test` is the runner, and the reason is AD5's reason one layer over: the spec asks for "a Node test setup", NFR1 bans any dependency requiring compilation at install, and every third-party runner is an `npm install` this plugin has no way to perform from a plugin cache directory. Node's built-in runner is already present wherever the Node floor is met, so the suite inherits the floor rather than adding a precondition. Covers the isolation and one-command criteria. Each test takes its own database — in-memory by default, temp-file where a test must reopen a connection, since `PRAGMA foreign_keys` is per-connection and Story 1's fresh-connection criterion cannot be asserted against a single shared handle.  
**Status**: Complete

### Build fixtures through the tool surface, not from markdown
**Task**: 0.3  
**Description**: Covers the must-NOT. AD8 means no import path exists to exercise, so a fixture parsed from a file would be testing a code path dpm does not have. Until Epic 47-03 ships the MCP tools, the builder calls the same statements those tools will wrap and exposes one seam — a single module the tools replace — so the substitution is one edit rather than a rewrite of every fixture. Name that seam explicitly; a fixture layer that reaches into the schema directly is the thing this task exists to prevent.  
**Status**: Complete

### Write tests for Stand up the plugin skeleton and the test harness
**Task**: 0.4  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`. The isolation criterion needs two tests observed in one process — a single test that cleans up after itself asserts nothing about leakage between them.  
**Status**: Complete

---

## Create the core schema with kind-pinned references [plan]
**Story**: 1  
**Status**: Complete  
**Blocked by**: Story 0  
**Satisfies**: FR1, FR2, FR27, AD7, AD9, NFR6  
**Retro**: [Codebase discovery] SQLite implies `NOT NULL` only for `INTEGER PRIMARY KEY`; for every other type it preserves a longstanding bug and accepts NULL, so the Data Model's `id TEXT PRIMARY KEY` transcribed literally is a unique index over a nullable column — two `document` rows with a NULL `id` were both accepted, on the parent key every other table joins to. Every single-column primary key is now `TEXT NOT NULL PRIMARY KEY`, and Stories 2–8 must declare it on each new table rather than assume the keyword implies it.  
**Retro**: [Testing gap] A rejection is not evidence until you know which constraint produced it. The `observation.library_doc_id` kind-pin first appeared to pass while the row was actually being rejected by `observation_retro_position`, because the probe reused a `position` — the kind pin was never consulted. Every assertion in this story now matches the constraint by name, and the same trap is waiting wherever a table carries both a pinned reference and a unique index over the same rows.  
**Retro**: [Criteria gap] A criterion that defers to a list held in another document is only as good as that list, and nothing checks the referent is complete. Story 1's kind-agnostic exceptions were "the three the Data Model names"; a `grep` for `REFERENCES document(id)` found seven, of which the paragraph accounted for five. One was FR27 cascade fallout and one — `number_sequence.parent_id` — was an original omission nobody had reported. The pivot replaced the count with an enumeration rather than correcting it, which is retro 35's recommendation applied for the first time; the mechanical sweep that found the second omission cost one command.  
**Retro**: [Criteria gap] `retro_application` is named in no epic anywhere in the breakdown — a grep across `docs/epics/` returns nothing. Story 1 builds it under FR1 so nothing goes unbuilt, but the table reached the schema without any story claiming it, and a table that arrives that way is one nothing will test on purpose.  
**Retro**: [Pattern worth reusing] The two schema-wide criteria are read out of `sqlite_schema` and the `PRAGMA`s rather than from a maintained list, so every table Stories 2–8 add is covered on the day it lands. The same shape closed three false passes the criteria did not ask for: the kind-pinned test also asserts that pinned references outnumber unpinned ones (a schema with no composite keys at all would otherwise pass it), the TEXT-key test also asserts every table *has* a primary key (the claim is vacuous without one), and the ULID test asserts the ids span fewer milliseconds than there are ids, so the sort is a statement about the counter rather than the clock.

**Acceptance Criteria**:

- Every column named `*_id` on every table appears in that table's `PRAGMA foreign_key_list`, with no exceptions list (AD7) [unit]
- Every foreign key whose target is `document` names `(id, kind)`, except the ones the Data Model names as legitimately kind-agnostic — and that exceptions list is the one in the Data Model, not one the test may extend [unit]
- must NOT — a `story` is accepted under a spec, a `requirement` under an epic, or a detail row on a document of another kind [unit]
- Creating an epic with a non-existent `spec_id` fails, and no row is written [integration]
- must NOT — a foreign-key violation is accepted because `foreign_keys` defaulted off on a fresh connection [integration]
- Every primary key in `sqlite_schema` is declared `TEXT`, excluding the FTS5 shadow tables, which SQLite creates with `INTEGER PRIMARY KEY` and dpm does not author [unit]
- Ten thousand ids generated in one process are unique and sort in generation order [unit]
- `document_kind.dir` is nullable, and a kind declaring `dir IS NULL` accepts documents that render inside a parent rather than into a file of their own [unit]
- Two specs may each hold a milestone labelled `M1`; one spec may not hold two, and positions are unique within a spec [unit]
- must NOT — an artefact's milestone is a column, so an epic spanning two must be filed under one [unit]
- An epic whose `parent_id` names a review is rejected, and one naming a spec is accepted [unit]
- A review parents onto either a spec or an epic, both being allow-listed, and onto a runbook not at all [unit]
- must NOT — `observation.library_doc_id` accepts a document that is not of kind `library` [unit]
- must NOT — a document's `parent_kind` can misdescribe the kind of the parent it points at [unit]
- Binding the same `(requirement_id, spec_fragment, story_criterion_id)` twice is rejected, and two different fragments against one criterion are both accepted [unit]
- must NOT — any `UNIQUE` constraint over a nullable column is relied on to reject duplicates, given SQLite's distinct-NULL semantics [unit]
- must NOT — `coverage` identity depends on `position`, so that display order can admit or reject a binding [unit]

### Write `document`, `document_kind` and `document_kind_parent`
**Task**: 1.1  
**Description**: Establishes the composite `(id, kind)` parent key that every other table joins to. Covers the parentage criteria; the allow-list table is what makes an illegal pairing unsatisfiable rather than merely unwritten.  
**Status**: Complete

### Write the nine per-kind detail tables and fourteen child tables with kind-pinned composite FKs
**Task**: 1.2  
**Description**: Covers the story-under-a-spec and requirement-under-an-epic rejections. Every reference whose target kind is fixed carries a `CHECK`-pinned kind column; the three deliberately unpinned ones are named in the Data Model and stay unpinned. The fourteenth child table is `milestone` (FR27), which brings `document_milestone` with it.  
**Status**: Complete

### Implement ULID generation and apply TEXT keys throughout
**Task**: 1.3  
**Description**: Covers both AD9 criteria. The generator is the only source of ids in the system — nothing else may mint one.  
**Status**: Complete

### Enforce `PRAGMA foreign_keys=ON` on every connection the server opens
**Task**: 1.4  
**Description**: Addresses the criterion that a fresh connection defaults it off. Scoped to connection setup, not to the tool layer.  
**Status**: Complete

### Write tests for Create the core schema with kind-pinned references
**Task**: 1.5  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Seed and constrain every vocabulary [plan]
**Story**: 2  
**Status**: Complete  
**Blocked by**: Story 1  
**Satisfies**: FR4, FR10, FR24  
**Inline change**: corrected "forking all ten" to nine in the spec's `agent` DDL comment — `cpm/agents/roster.yaml` carries nine personas (2026-08-08)

**Acceptance Criteria**:

- A status value outside its enum is rejected by `CHECK`, not coerced [unit]
- must NOT — any category, severity, dimension or approach is stored as free text rather than a foreign key [integration]
- A severity row is rejected in a category slot, and an audit dimension in a severity slot, on `finding` and `audit_finding` alike [unit]
- Retiring a taxonomy row leaves rows referencing it intact and readable [unit]
- must NOT — a new row is accepted referencing a taxonomy row, test approach or dependency kind already retired, so that retirement stops rows arriving as well as preserving those that have [unit]
- `document_agent.agent` and `finding.agent` both reject a persona name no `agent` row carries, so the roster is a vocabulary rather than free text [unit]
- must NOT — a `document_kind` row exists that the parity enumeration does not name, or the reverse [unit]
- An `adr` parents onto a spec, a brief or a discussion, and onto an epic not at all [unit]
- A `retro` parents onto an epic, a spec or a quick record — the three sources `cpm:retro` actually accepts [unit]
- Loading a corpus whose labels are all replaced with opaque identifiers leaves every class, MoSCoW band and exclusion value unchanged [integration]

### Seed the thirteen `document_kind` rows and their `document_kind_parent` allow-list
**Task**: 2.1  
**Description**: Covers the parity-enumeration criterion in both directions, and the two parentage criteria. `adr` seeds with `dir IS NULL` and `numbering = 'child'`, so an AD written inside a spec keeps its `decision_status` and tradeoff axes instead of degrading to prose. The allow-list is what makes an unlisted pairing unwritable, so each criterion needs its accepted control as well as its refusal.  
**Status**: Complete

### Write the taxonomy tables with domain-scoped composite FKs
**Task**: 2.2  
**Description**: Covers the severity-in-a-category-slot rejections on `finding` and `audit_finding` alike. A plain `REFERENCES taxonomy(id)` would relocate the drift rather than remove it.  
**Status**: Complete

### Write and seed the `agent` table, and point `document_agent` and `finding` at it
**Task**: 2.3  
**Description**: The roster becomes a vocabulary under FR24 — its own table rather than a `taxonomy` domain, for the reason `test_approach` is one: it carries four columns no other vocabulary needs. Seed from CPM's `agents/roster.yaml`. Both referencing columns are declared several hundred lines before `agent` in the Data Model's DDL order; SQLite resolves a foreign key at write time rather than at `CREATE`, so the forward reference holds — asserted by the story's rejection criterion rather than assumed.  
**Status**: Complete

### Implement retirement so it stops new rows arriving as well as preserving those that have
**Task**: 2.4  
**Description**: Covers cross-row register #10 — the half of the retirement promise that was previously enforced by nothing.  
**Status**: Complete

### Write tests for Seed and constrain every vocabulary
**Task**: 2.5  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

**Retro**: [Codebase discovery] SQLite's `BEFORE UPDATE` and `BEFORE UPDATE OF` are not a style choice here. A bare update trigger fires on every column, so a row referencing a term retired after it was written becomes uneditable in *any* field — which turns FR24's "leaves rows referencing it intact and readable" into intact and frozen, and makes the two halves of the retirement promise contradict each other. Found by mutation rather than by design: the narrowed form was written first for tidiness, and only widening it back showed what it was load-bearing for.

**Retro**: [Pattern worth reusing] Generate DDL from the schema and have the generator report what it produced. `createRetirementGuards` walks `PRAGMA foreign_key_list`, finds every parent carrying `retired_at`, and emits a trigger per referencing column — ten references, twenty triggers, and `dependency_kind` guarded on the day Story 4 creates it with no new code. The reporting is the half that matters for verification: a generator that generates nothing passes every behavioural test that has nothing to test, so it returns its trigger names and a test derives the same set independently and compares. That independence is the point — a test that asks the generator which references it found cannot notice the generator missing one.

**Retro**: [Testing gap] A criterion of the form "X is rejected in a Y slot" hides that there are two distinct ways to attempt it, guarded by two different constraints. Filling a category slot with a severity id fails the composite foreign key; *relabelling* the slot as a severity slot and then filling it satisfies that foreign key perfectly and fails only the `CHECK` pinning the domain column. The first draft of the test exercised one route, passed, and would have kept passing with the `CHECK` deleted — confirmed by dropping it. Both routes are now asserted on both tables.

**Retro**: [Criteria gap] Story 2's retirement criterion names three vocabularies and Story 4 creates one of them, so no gate can verify it whole. Coverage row 12 is left unmarked with the reason recorded rather than marked on the strength of a guard that will certainly cover it — a criterion spanning two stories needs its verification split at authoring time, not adjudicated at the gate.

**Retro**: [Codebase discovery] A test fixture that seeds its own copy of a vocabulary diverges from the shipped one silently and in a direction no test can see. Story 1's fixture declared `retro` as child-numbered; the real seed makes it root-numbered, because `docs/retros/` numbers globally while still hanging off an epic. Every Story 1 test passed against the wrong numbering because nothing in Story 1 asserted the seed. The fixture's vocabulary was deleted rather than corrected: once a real seed exists, a test bed with its own is testing a corpus that does not ship.

---

## Allocate numbers two-level and never reuse them
**Story**: 3  
**Status**: Complete  
**Blocked by**: Story 1  
**Satisfies**: FR5, FR23

**Acceptance Criteria**:

- Numbers allocated across create-archive-create never repeat, including past 99 [unit]
- The first allocation for a kind with no `number_sequence` row returns 1, and the first child allocation under a new parent does the same [unit]
- Two epics under different specs may both hold sequence 1; two under the same spec may not [unit]
- must NOT — a row carries both `number` and `sequence`, or neither, unless its kind is declared `numbering = 'none'` [unit]
- must NOT — an allocation returns no row, or returns success without a number [unit]
- Child sequences restart at 1 per parent and never reuse a value after deletion [unit]
- A kind declared `numbering = 'none'` accepts a document carrying neither `number` nor `sequence` [unit]
- must NOT — a kind declared `numbering = 'root'` accepts a row carrying `sequence`, or the reverse [unit]

### Write `number_sequence` with partial unique indexes for root and child allocation
**Task**: 3.1  
**Description**: The two schemes are exclusive alternatives, so they are two partial indexes rather than one nullable column.  
**Status**: Complete

### Implement the upsert allocation that holds register #5 by construction
**Task**: 3.2  
**Description**: Scoped to the allocation statement only — the MCP tool wrapping it belongs to Epic 47-03.  
**Status**: Complete

### Write tests for Allocate numbers two-level and never reuse them
**Task**: 3.3  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

**Retro**: [Codebase discovery] `number_sequence` cannot have a primary key, and the reason generalises. Its natural key is `(kind, parent_id)`, `parent_id` is NULL for every root-numbered kind, and a unique index treats NULLs as distinct — so a key over that pair would enforce nothing on exactly the rows that most need it. Two partial indexes splitting the table on `parent_id IS NULL` do enforce it, on both sides. This collided with an assertion added in Story 1 as a false-pass closure — "every table has a primary key" — which is a proxy for the property that actually matters, that every table has an identity something enforces. The assertion was rewritten to read the partition out of `sqlite_schema` rather than to excuse the table by name, so a table that merely *lacks* a key still fails; breaking the complementary pair was checked to confirm it does.

**Retro**: [Testing gap] Run the rejected design inside the test when the criterion is about a silent failure. "An allocation never reports success without a number" is unfalsifiable as written — a passing allocation satisfies it, and so does one that would fail differently. The test executes the bare `UPDATE … RETURNING` against an unallocated kind first and asserts it returns `undefined` with no error, then asserts the upsert returns 1 in the same state. Without the first half the second is a test that a working thing works.

**Retro**: [Codebase discovery] No seeded kind uses `numbering = 'none'`, so nothing built from realistic fixtures ever reaches that branch of the numbering CHECK — and an earlier form of the CHECK made the value unusable outright, since a kind carrying no number could satisfy neither branch and no row of it could be inserted at all. A vocabulary value with no seeded user needs a test that declares one; otherwise the schema can forbid what the vocabulary offers and every test still passes.

---

## Model relationships as typed edges
**Story**: 4  
**Status**: Complete  
**Blocked by**: Story 1  
**Satisfies**: FR22, FR27

**Retro**: [Testing gaps] The criterion "a `builds_on` edge does not gate readiness; a `blocks` edge does" is satisfied identically by reading `gates_work` and by hardcoding `WHERE kind = 'blocks'` — a mutation to the latter survived all 67 tests. `blocks` is the only seeded kind with the flag set, so every criterion phrased in kind names is blind to the difference. Closed by a test that moves the flag and leaves the kinds alone; the general shape is that a criterion naming a seeded value cannot test the indirection that value is reached through.

**Retro**: [Codebase discoveries] Three of `dependency`'s four end columns are NULL in every row, and SQLite treats NULLs as distinct in a `UNIQUE` index — so the obvious constraint over those four columns forbids nothing at all and the same edge stores any number of times. One expression index over `coalesce(col, -1)` collapses each absent end to a sentinel; the sentinel is safe because SQLite never compares an INTEGER equal to a TEXT ULID.

**Retro**: [Complexity underestimates] Three test failures in Task 4.4 read as readiness bugs and were one fixture default: `childDocument` titles every row `'Title'`, so title-keyed assertions matched whichever epic came back first and one negative assertion was true regardless of the result. Fixture defaults that collide are invisible in the passing direction — assertions key on `id` now, and `specWithEpics` titles each epic distinctly.

**Retro**: [Patterns worth reusing] Story 2's derived retirement guards covered `dependency_kind` the day Task 4.1 created it — two triggers generated from `PRAGMA foreign_key_list`, no new code, nothing to remember. Deriving DDL from the schema rather than writing it per table is what let a Story 2 criterion be closed by a Story 4 task without either story reaching into the other.

**Acceptance Criteria**:

- A story-to-story `blocks` edge and a spec-to-spec `builds_on` edge both round-trip through one table [unit]
- A `builds_on` edge does not gate readiness; a `blocks` edge does [unit]
- must NOT — a document or story depends on itself [unit]
- must NOT — the same edge is storable twice, for any combination of NULL source/target columns [unit]
- An epic blocked by two epics yields two `dependency` rows, and completing both makes it selectable as ready [integration]
- A `builds_on` cycle is accepted, since no readiness query traverses it [unit]
- An epic joined to two milestones is returned by a readiness query for either, and reports both [integration]

### Write `dependency` and `dependency_kind` with the coalesce dedup index
**Task**: 4.1  
**Description**: Covers the duplicate-edge rejection across every NULL combination. One expression index rather than four partial ones.  
**Status**: Complete

### Implement readiness traversal so only `gates_work` kinds gate
**Task**: 4.2  
**Description**: Covers the `builds_on`-does-not-gate pair and the two-blockers case. A `builds_on` cycle is legal precisely because no readiness query traverses it.  
**Status**: Complete

### Project `document_milestone` into the readiness result
**Task**: 4.3  
**Description**: FR27's query half — "which epics are in M2" is answered here, and an epic joined to two milestones reports both rather than being filed under one. The join is many-to-many for exactly that case; a readiness result that returns a single milestone re-imposes the column FR27 removed.  
**Status**: Complete

### Write tests for Model relationships as typed edges
**Task**: 4.4  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Version the schema and migrate forward-only
**Story**: 5  
**Status**: Complete  
**Blocked by**: Story 1  
**Satisfies**: FR12, FR24

**Retro**: [Pattern worth reusing] The numbered `.sql` files *are* the migrations, so creating a schema and upgrading one are one loop over one list and a fresh database is just one recorded at version 0. Story 8's "migrations and DDL produce an identical `sqlite_schema`" becomes structural rather than something two paths have to be tested into agreeing on. What it does not buy is worth stating in the same breath: editing an already-released file still produces two schemas, and no in-process comparison can see it, because both sides read the same working tree.

**Retro**: [Codebase discovery] `PRAGMA index_list` and `sqlite_schema` disagree about what a unique index is. A table-level `UNIQUE (…)` becomes an *auto-index* whose `sql` is NULL, so a check reading index DDL out of `sqlite_schema` sees no index at all — Story 1's identity check reported `schema_version` as having nothing keying it while `UNIQUE (version)` was sitting in its `CREATE TABLE`. The pragma reports both kinds; the DDL text is needed only for a partial index's `WHERE`, which is the one thing the pragma reduces to a flag.

**Retro**: [Testing gap] Four of Story 5's five criteria are about what an *upgrade* does, and a test that builds the new state and checks the new state passes against an implementation that does nothing. Every test here builds a database from before the change, closes it, and starts it again — which needed a `support/` helper that applies DDL by hand, because `migrate` always brings a database to the current version and so cannot produce a state to upgrade *from*.

**Retro**: [Complexity underestimate] Three of the seven Story 5 mutations landed on the wrong thing before landing on the right one: one edited a comment that named the banned operation, one broke every test in the suite because `document_kind` lacks the column it set, and one was absorbed by a second line of defence and proved only that the two guards are genuinely independent. A mutation is a hypothesis about which line carries a behaviour, and a mutation that fails everything or fails the wrong test has not tested the guard — it has to be re-aimed rather than counted.

**Acceptance Criteria**:

- A database at schema version *n* is migrated to *n+1* on server start with no user action [integration]
- A vocabulary default the plugin adds after a database was created appears in it on the next server start, and a term the project added under the same name is not overwritten [integration]
- A vocabulary default the plugin retires is retired in an existing database, and rows already referencing it stay readable [integration]
- must NOT — an upgrade resurrects a term the project retired, because the seed comparison was made against live terms rather than against every row present [integration]
- must NOT — a migration rewrites the `name` or `display_name` of a vocabulary row that existing rows reference, silently changing what those rows are recorded as meaning [unit]

### Write `schema_version` and the ordered migration runner applied on server start
**Task**: 5.1  
**Description**: Forward-only, no user intervention. The runner is a second path to the same schema as the DDL, which is what Story 8's first criterion exists to catch.  
**Status**: Complete

### Restrict vocabulary migrations to insert-if-absent and retire-if-live
**Task**: 5.2  
**Description**: FR24's evolution clause. A plugin-side vocabulary change is a migration, never a re-seed, and only two operations are legal: `INSERT` guarded on absence **by primary key**, and `UPDATE … SET retired_at WHERE retired_at IS NULL`. Guarding on the key rather than on live terms is what stops the resurrection case — retirement sets a column, so a retired row is still present. Rewriting a vocabulary row's text is not an operation, and that ban is what makes both permitted ones idempotent without the schema recording which rows a project has touched: no provenance column, no content hash, no reconcile.  
**Status**: Complete

### Write tests for Version the schema and migrate forward-only
**Task**: 5.3  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`. The four vocabulary-evolution criteria each need a database created *before* the change and migrated into it — a test that seeds the new state directly asserts nothing about the upgrade path.  
**Status**: Complete

---

## Check the invariants SQLite cannot hold
**Story**: 6  
**Status**: Complete  
**Blocked by**: Story 1, Story 2, Story 3, Story 4  
**Satisfies**: FR14, NFR6

**Retro**: [Criteria gap] Two of Story 6's coverage rows could not be marked as originally written, for two different reasons, and the pivot of 2026-08-08 resolved each in the way its own defect called for. Row 27 asked every false-pass condition to have a test, over a register spanning the whole product — six of the twenty close in epics this one does not touch — so the criterion was **narrowed to what this story delivers** (the register is complete, disposed and honest about its own coverage) and the whole-register claim was **declared forward to Epic 47-05 Story 6**, the first point at which all six deferrals are closed. Row 52 asked for a check the schema cannot support: no detail table carries a timestamp, so a row written before a term was retired is indistinguishable from one written after, and reporting "rows referencing a retired term" would flag the legal rows FR24 exists to protect. It was **repointed to the decidable check that shipped** — a vocabulary reference no retirement guard covers. The lesson is in the pair: a criterion whose scope exceeds its story is a *split*, and one that names an undecidable predicate is a *rewording*, but both are invisible until a gate tries to mark them and neither is a defect in the work. Both were writable at authoring, and what would have caught them is asking, of each criterion, which artefact supplies the value it cites.

**Retro**: [Testing gap] A helper that scans the suite for test names was reading capture group 1 (the quote character) instead of group 2, so every citation in the false-pass register resolved against a two-element set and the register looked complete. Nothing about the citations said so — what said so was a guard asserting the scan had found more than fifty tests. Any check that resolves names against a set it built itself needs an assertion that the set is populated, because an empty set makes every lookup fail in the same direction and a full one makes them all pass.

**Retro**: [Codebase discovery] `PRAGMA foreign_key_check` reports `table`, `rowid` and the foreign key's *index*, not its columns — so an orphan arrives as "table story, row 41, key 0", which is precisely the "reports a violation it cannot locate" half of this story's must-NOT. Resolving the index through `PRAGMA foreign_key_list` is what turns it into `epic_id, epic_kind`, and it names a composite key whole rather than reporting one of its columns.

**Retro**: [Pattern worth reusing] The marker sweep for register #13 derives its columns from `PRAGMA table_info` and scans every TEXT column, rather than working from a list of the prose ones. The entry's whole difficulty is that a marker lives where no foreign key reaches, so a declared list fails in exactly the way the entry exists to prevent — a column added later holds markers nothing sweeps and the report still reads clean. Same reasoning as Story 2's derived retirement guards, and mutating the sweep to a three-name list was caught immediately.

**Acceptance Criteria**:

- Every numbered entry in the cross-row invariant register has a check in the integrity tool, and the tool has no *register-derived* check absent from the register [integration]
- Each of the thirteen register entries is reported in turn, naming the rows [unit]
- The integrity tool reports a deliberately orphaned row [integration]
- The false-pass register is enumerated in full with no unregistered entries, every condition this epic closes names a test that exists asserting it blocks rather than warns, and every condition it defers names the epic that closes it [integration]
- must NOT — the integrity tool reports a violation it cannot locate, or passes a database holding one [integration]

### Implement the thirteen cross-row register checks
**Task**: 6.1  
**Description**: One check per numbered entry, each naming the offending rows. Entry #3 matters most — it is the only one whose violation renders plausibly.  
**Status**: Complete

### Implement orphan and dangling-reference detection
**Task**: 6.2  
**Description**: Covers the deliberately-orphaned-row criterion, and the restore path's `PRAGMA foreign_key_check` consumes the same detection.  
**Status**: Complete

### Assert register-to-check parity in both directions
**Task**: 6.3  
**Description**: An entry with no check, and a register-derived check with no entry, both fail. Scoped to register-derived checks — the tool may hold others.  
**Status**: Complete

### Write tests for Check the invariants SQLite cannot hold
**Task**: 6.4  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Decay verification and completeness when the text they were bound to changes
**Story**: 7  
**Status**: Complete  
**Blocked by**: Story 1  
**Satisfies**: FR21, FR26, NFR6

**Retro**: [Testing gap] `coverage_claim_hash` looked like a column nothing reads: a mutation emptying the hash of all content — digesting nothing at all — passed the whole 108-test suite. The triggers clear the claim on every event that changes the bound set, so the hash's *content* only matters once a trigger is gone, and no test reached that state. Closed by dropping `requirement_unclaim_on_coverage_insert`, changing the set, and asserting the claim reads claimed-but-stale. A second line of defence is untested by construction while the first works, and the only way to test it is to remove the first.

**Retro**: [Codebase discovery] The seven triggers went in verbatim from the spec's DDL and all thirteen criteria passed on the first run — the only story in this epic where that happened. The spec had already executed them: the `spec_fragment` trigger exists because a draft carrying only two was run and the row kept a `binding_hash` over replaced text. Trigger DDL that has been executed against a real database transcribes without adjustment in a way prose about triggers never does.

**Retro**: [Pattern worth reusing] Every decay assertion has a byte-identical control beside it — `UPDATE … SET text = text` on all three watched columns, and an unrelated-column write on each of the three tables. Removing `WHEN OLD.text <> NEW.text` from one trigger fails only the control, which is the whole point: a trigger clearing on any write passes every decay test and makes the mark worthless. False-pass #18 is that observation written down, and it earned its place.

**Retro**: [Codebase discovery] A source file acquired two raw NUL bytes where an escape was intended — a hash separator written as a literal rather than as the six-character escape. It ran correctly, so nothing failed; what found it was a byte-level sweep of `dpm/` after a string-replace refused to match text that looked identical on screen. A separator chosen precisely because no fragment can contain it is the kind of value that has to be written as an escape, or it is invisible in every diff it appears in.

**Acceptance Criteria**:

- Editing a story criterion's text clears `verified_at` and `binding_hash` on every coverage row bound to it [unit]
- Editing a requirement's text clears verification on its coverage rows [unit]
- Editing `coverage.spec_fragment` clears `verified_at` and `binding_hash` on that row [unit]
- control — an edit that leaves the text byte-identical does not clear verification, on all three watched columns [unit]
- must NOT — a coverage row holds `verified_at` while `binding_hash` is NULL, or the reverse [unit]
- must NOT — any column the binding is computed from can be edited without clearing verification [unit]
- Claiming completeness on a requirement, then inserting a coverage row for it, leaves the claim cleared [unit]
- Deleting a coverage row, and editing a bound fragment, each clear the claim on that row's requirement [unit]
- Editing a requirement's text clears its own completeness claim, not only its coverage rows' verification [unit]
- control — an edit leaving the requirement's text byte-identical does not clear the claim, and neither does an update to an unrelated column [unit]
- A requirement with fragments bound and no claim is distinguishable by query from one with the same fragments and a current claim [integration]
- must NOT — `coverage_claimed_at` is set while `coverage_claim_hash` is NULL, or the reverse [unit]
- must NOT — completeness is derived from fragment offsets rather than claimed, so connective prose must be bound to satisfy it [unit]

### Write the three `AFTER UPDATE OF` triggers, one per column the binding is computed from
**Task**: 7.1  
**Description**: Three, not two. The binding is computed from two texts held in three places — `requirement.text`, `acceptance_criterion.text` and `coverage.spec_fragment` — and a draft carrying only the first two left the fragment editable with the ✓ intact, verified by execution.  
**Status**: Complete

### Constrain `verified_at` and `binding_hash` to be set and cleared together
**Task**: 7.2  
**Description**: A row holding one without the other is a verification state nothing can re-derive. The `CHECK` makes the pair atomic rather than leaving it to whichever trigger fired.  
**Status**: Complete

### Enumerate the watched columns and assert a trigger exists for each
**Task**: 7.3  
**Description**: Closes the final clause. The set of columns the binding hashes is declared and compared against `sqlite_schema`, so adding a fourth input to the hash fails until it has a trigger — the same shape as Story 6's register-to-check parity.  
**Status**: Complete

### Write the four unclaim triggers on `requirement.coverage_claimed_at`
**Task**: 7.4  
**Description**: FR26. Four events change the set a claim was made against — a coverage row arrives, one leaves, a fragment is rewritten, and the text being accounted for is edited — so four triggers. `requirement_unclaim_on_text_edit` updates the table it fires on; that was verified safe with `recursive_triggers` both off and on, because it watches `text` and writes only the two claim columns.  
**Status**: Complete

### Write the claim tool and the `CHECK` binding the claim pair together
**Task**: 7.5  
**Description**: Claiming is a deliberate act with no derived alternative — the Data Model records why a computed version was rejected. The `CHECK` keeps `coverage_claimed_at` and `coverage_claim_hash` set and cleared together, as `verified_at`/`binding_hash` are one level down.  
**Status**: Complete

### Write tests for Decay verification and completeness when the text they were bound to changes
**Task**: 7.6  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`. Both byte-identical controls matter as much as the decay cases — a trigger that clears on every write passes every decay criterion and makes the claim worthless. That is false-pass register entry #18.  
**Status**: Complete

---

## Verify cross-story integration for Substrate
**Story**: 8  
**Status**: Complete  
**Blocked by**: Story 1, Story 2, Story 3, Story 4, Story 5, Story 6, Story 7  
**Satisfies**: FR12, FR14

**Retro**: [Scope surprise] This story's headline criterion — that a migrated schema and a directly created one are identical — was satisfied by a Story 5 design decision rather than by anything written here. Making the numbered `.sql` files *be* the migrations left one code path where the epic assumed two, so the comparison could not fail structurally. It was still worth writing: mutating the migration path to derive retirement guards only on a fresh database made the two schemas differ, and five tests caught it, four of them here. A criterion made structurally true is not a criterion that stopped being worth testing — the derived DDL is exactly the part that lives outside the files.

**Retro**: [Testing gap] The recurring shape across five of these seven tests is *data survives, behaviour does not*: a ✓, a completeness claim, a milestone assignment and a number counter all persist across an upgrade while the triggers that decay them can vanish with a recreated table. Each half passes its own story's criteria, and a database that is structurally correct and behaviourally hollow reads as healthy until the first edit that should have cleared something. Testing that a value survived a migration asserts almost nothing; testing that the mechanism which invalidates it survived is the assertion worth making.

**Retro**: [Codebase discovery] Comparing two schemas by object *count* reports "41 versus 40" on the only failure the comparison exists to catch. Comparing them as a sorted list of `type name on table` plus DDL text names the missing object, and a guard on list length stops a shape function that read nothing from passing as agreement — the same emptiness trap as Story 6's test-name scan, two files apart.

**Acceptance Criteria**:

- A database built by running the migration set from empty has a `sqlite_schema` identical to one built by executing the DDL directly — every table, index, trigger and constraint [integration]
- Seeding, retiring a vocabulary row, then applying a migration leaves the retirement in force and the rows referencing it readable [integration]
- The integrity tool passes on a freshly migrated and seeded database, and fails on each of the thirteen register violations injected into it in turn [integration]
- A number allocated before a migration is not reissued after it [integration]
- A coverage row verified before a migration is still verified after it, and a text edit made after the migration still clears it — a migration that recreates a table drops its triggers, and nothing in Story 5 or Story 7 alone observes that [integration]
- A completeness claim made before a migration survives it, and a coverage row inserted after the migration still clears the claim — the same trigger-loss failure one level up, on the four FR26 triggers rather than the three FR21 ones [integration]
- A document assigned to two milestones keeps both across a migration, and the spec-scoping pair check still refuses a cross-spec assignment afterwards [integration]
- must NOT — the migration runner and the DDL produce schemas differing in any constraint, index or trigger [integration]

### Write integration tests for Substrate
**Task**: 8.1  
**Description**: Covers the cross-story criteria above. The first criterion is the one that earns this story — Stories 1–5 produce two independent paths to the same schema and no per-story criterion compares them.  
**Status**: Complete

---

## Address review findings
**Story**: 9  
**Status**: Complete — applied by `/cpm:pivot` on 2026-08-08 from review 05  
**Blocked by**: —

**Acceptance Criteria**:

- Each critical and warning finding from review 05 scoped to this epic has been addressed
- Existing acceptance criteria on other stories continue to pass

### Fix: FR26's must-NOT criterion is carried by no story in any epic
**Task**: 9.1  
**Description**: [critical] Spec:1311 — *"must NOT — completeness is derived from fragment offsets rather than claimed, so connective prose must be bound to satisfy it"* — is carried by no story in any of the nine epics, and no matrix row cites it; `offset` and `connective` appear nowhere in `docs/epics/`. This epic's Story 7 owns FR26, and this matrix's note asserts "FR26 is complete here", so the gap and the false claim are both here. Add the criterion to Story 7 and a row to the coverage matrix, then correct the note. Without it an implementer can derive completeness from fragment offsets, pass the other six FR26 criteria and both controls, and reintroduce the alternative the Data Model rejects under **"Completeness is a claim and not a computation, and the alternative is worth stating because it looks better than it is"**.  
**Status**: Complete — criterion added to Story 7, matrix row 80 added, completeness note corrected

### Fix: Task 5.1 cites Story 7's first criterion, which is Story 8's
**Task**: 9.2  
**Description**: [warning] Task 5.1's description says the migration runner "is a second path to the same schema as the DDL, which is what Story 7's first criterion exists to catch". Story 7's first criterion is about a story criterion's text edit clearing verification; the DDL-versus-migration parity criterion is **Story 8's**. The note is right about the risk and wrong about where it closes.  
**Status**: Complete — Task 5.1 now cites Story 8

### Fix: `§1234` in the coverage matrix resolves to the wrong passage
**Task**: 9.3  
**Description**: [warning] The matrix's mapping notes cite `§1234` for the spec's record that the real corpus exposed eight schema defects. Spec line 1234 is `### Deferred`; the passage is at line 1440. One of five stale spec line-references across the breakdown — see Epic 47-04 and 47-05 for the others. Prefer a quoted phrase or a section heading over a line number, since a line number into an amendable document is the failure FR28 exists to prevent.  
**Status**: Complete — repointed to the spec's **Test Infrastructure** heading

### Decision: Story 1 stays whole, and the reason is recorded rather than the split deferred
**Task**: 9.4  
**Description**: [warning] Review 05 observed that Story 1 carries 17 acceptance criteria against FR1, FR2, FR27, AD7, AD9 and NFR6 — the whole 38-table schema — in four implementation tasks, blocks six of this epic's seven other stories, and gates four further epics transitively. Nothing partial can land. **Chris decided on 2026-08-08 to leave it whole**, and the trade is worth stating because the observation is correct and was not rejected. Splitting means either renumbering Stories 1–9, which churns roughly 79 `Covered by` cells in the coverage matrix, or appending new stories out of build order. Both are large edits to citation-bearing text, and three of the same review's findings — a row bound to a story that did not exist, five stale spec line-references, a task pointing at the wrong story — were caused by exactly that kind of churn. The sizing risk is a scheduling cost, paid once and visibly; the citation risk is a correctness cost that hides. Tasks 1.1–1.5 already decompose the work, so the story is large to *track* rather than large to *do*. Revisit if Story 1 stalls in execution: at that point the matrix is being edited anyway.  
**Status**: Complete — decision recorded; no split performed

---

## Notes

### Self-hosting register

Chris's standing check for this build: **dpm must be able to represent spec 47's own
planning corpus** — this spec, review 04, retro 33, these nine epics and their coverage
matrices. Each entry below is something that corpus requires and the schema as specified
could not do when the breakdown was written. All five needed a **spec** change, so none was
fixable during the breakdown; all five were carried to `/cpm:pivot` and closed there on
2026-08-08.

Later epics add to this register as they surface more. Epic 47-09's terminal story is where
it must be empty or every remaining entry explicitly waived.

| # | What the corpus requires | Status | Closed by |
|---|---|---|---|
| 1 | A requirement covered partially across several epics, distinguishable from one fully covered. Fragment rows are stored, but nothing tells "some fragments bound" from "accounted for", so a requirement with one of five obligations bound rolls up as covered | CLOSED | FR26 — `requirement.coverage_claimed_at`/`coverage_claim_hash`, a deliberate claim decayed by four triggers. Story 7 |
| 2 | AD6's four-milestone build order, and an epic spanning two of them — 47-04 spans M2 and M4. There is no `milestone` table and no build-order column on `document` or `story` | CLOSED | FR27 — `milestone` (spec-scoped, ordered by `position`) and the `document_milestone` join, which is many-to-many precisely so 47-04 can span two. Story 1 |
| 3 | Spec 47's ten inline ADs, carrying Decision / Rejected / Consequence and their rejected alternatives. `adr` is a *document kind*, so an AD inside a spec degrades to `document_section` prose and loses `decision_status`, `adr_option` and the tradeoff axes | CLOSED | `document_kind.dir` made nullable — NULL means the kind produces no file of its own and renders inside its parent, so `adr` stays a document kind with all its child tables while living inside a spec. Stories 1 and 2 |
| 4 | Retro 33, whose `**Source**` is a spec. `document_kind_parent` seeds `retro→epic`, not `retro→spec` — the retro written during this session is unstorable | CLOSED | Seeding widened to `retro→epic, spec or quick` and `adr→spec, brief or discussion`. Story 2 |
| 5 | A reference from one artefact to another written *in body prose* — this corpus has "The merge half is Epic 47-04" inside 47-02's Notes. FR8's merge tool "rewrites the references that named it", but every reference dpm models is a foreign key to a ULID and renumbering changes no ULID, so under FR2 there is nothing to rewrite. The references that do go stale are opaque text no tool can find. The clause is either vacuous or unimplementable, and the spec does not say which | CLOSED | FR28 — a prose reference is a `{{ref:<ULID>}}` marker the renderer resolves at projection time, so it never stored a number and nothing is rewritten. FR8 amended to say so. Renderer work is Epic 47-04 |

Entry 1 is the one that mattered most, on the spec's own terms: it was a false pass in the
subsystem built to remove false passes. The Problem Summary's "a coverage roll-up that
silently matches nothing reports full coverage" had a sibling the schema did not close —
a roll-up that matches *something* also reports full coverage. FR26's answer is that
completeness is asserted, not derived, and decays when the text it was asserted over moves.

Entry 5's mechanism changed during the pivot. A `document_reference` table was designed and
rejected on execution: the corpus's hardest case is retro 33's reference to spec 47, which
lives in `observation.text` — a child row, not a section — so a section-scoped reference
table cannot reach it. Markers can live in any text column.

**Two register entries in the Data Model were found by executing the amended schema, not by
reading it**: #12 (a document and its milestone must belong to the same spec) and #13 (every
`{{ref:}}` marker resolves to a live artefact). Both are cross-row invariants SQLite cannot
express, and both are now in Story 6's thirteen.

### Requirements only partially covered by this epic

FR10's seeding half is covered (Story 2's parity-enumeration criterion). Its other
obligation — every table having a create tool — belongs to Epics 47-03 and
47-05, so FR10 reads as fully covered only in the cross-epic union, not in this epic's
coverage matrix. This is register entry 1 in miniature, and is the reason it was noticed.
