# Server and Spine Tools

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Date**: 2026-08-08  
**Status**: Complete — all 26 matrix rows carry a ✓. Row 14's was cleared by the pivot of 2026-08-09 when FR29 changed the name pattern it asserts, and restored on 2026-08-10 against `naming.test.js`, whose `SHAPE` is the amended pattern and whose parts are checked against the live schema. Row 1 is `[target]`: its ✓ predates this and stands on the automated start-up check, not on a human running a clean clone  
**Blocked by**: Epic 47-01-epic-substrate

**Retro applied**: 33 · Codebase discoveries · Applied — every tool is exercised against a live database as it is written rather than reasoned about, and Story 7's conformance check reads `PRAGMA table_info` / `foreign_key_list` output directly. The same practice found three defects in Epic 47-02 on first execution, each invisible in code that looked correct.  
**Retro applied**: 33 · Complexity underestimates · Applied — Story 2's seven spine types and Story 5's reachability are both scoped from the live schema's table list rather than from the thirteen-kind vocabulary, so the nine entity types that produce no file cannot fall out of the count again.  
**Retro applied**: 35 · Testing gaps · Applied — test and check output is written to a file and read whole; nothing is piped to `head`/`tail` for a verdict. This is the largest suite in the breakdown, so the filled-buffer false pass is at its most likely here.  
**Retro applied**: 33 · Patterns worth reusing · Applied — counts are derived and verified rather than restated. Story 5's criterion already requires this of the tool names; it is extended to this epic's own prose, where the seven-versus-sixteen split has drifted three cycles running.

Milestone M2 (AD6), tool half. The MCP server, the typed tools for the seven spine entity
types, the tool-surface properties (bounded reads, discoverable names, reachability), session
state, and the AD10 conformance test that keeps the tool schemas and the DDL in step.

The projection — M2's other half — is Epic 47-04.

## Start the server on a stated Node floor with clean stdout
**Story**: 1  
**Status**: Complete — NFR1's criterion is `[target]` and stays open; see the coverage matrix  
**Blocked by**: —  
**Satisfies**: NFR1, NFR2, NFR3, AD5

**Acceptance Criteria**:

- A clean clone starts the server with no compilation step [target]
- The server refuses to start below the Node floor with a message naming the required version [integration]
- A full session's stdout parses as well-formed JSON-RPC with no stray output [integration]

### Write the MCP stdio server entry point with logging on stderr
**Task**: 1.1  
**Description**: Covers the JSON-RPC criterion — stdout belongs to the transport, so `NODE_NO_WARNINGS=1` and every log line goes to stderr. `node:sqlite`'s ExperimentalWarning is the specific case that motivated it.  
**Status**: Complete — `NODE_NO_WARNINGS=1` was measured and rejected; a warning filter took its place

### Enforce the >=22.5.0 Node floor with a message naming the required version
**Task**: 1.2  
**Description**: Refuse to start rather than fail on a missing module. Scoped to the floor check; the API-instability risk it contains is AD5's rationale, not this task's work.  
**Status**: Complete

### Write tests for Start the server on a stated Node floor with clean stdout
**Task**: 1.3  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[integration]`. NFR1's criterion is `[target]` and is not self-assessable here — it needs a clean clone on a real host.  
**Status**: Complete — 18 tests in `dpm/tests/server.test.js`; 188 across the suite

---

## Expose typed create, read and update tools for the spine [plan]
**Story**: 2  
**Status**: Complete — eight types, not seven; see the third criterion and the matrix note  
**Blocked by**: Story 1  
**Satisfies**: FR1, FR4, FR10

**Acceptance Criteria**:

- Creating each artefact type produces a row readable by its typed read tool [integration]
- The seven spine entity types — spec, requirement, story criterion, epic, story, task, coverage — each have create, read and update tools [integration]
- Every `requirement` and `acceptance_criterion` type distinction is readable from a column with `label` and `text` withheld [integration]
- must NOT — the `requirement` create tool accepts a class inferred from `label`, rather than requiring `class` as an argument [unit]

### Define the tool-schema conventions every entity tool follows
**Task**: 2.1  
**Description**: Argument shape, error envelope, and the rule that a column's `CHECK` set is the tool's enum. Produces the contract Stories 3–7 all assert against — deliberately first and separate, because AD10 exists precisely because this convention is maintained by hand.  
**Status**: Complete — AD10's required-argument rule is reconciled by a declared `serverSupplied` set, which Story 7 asserts in both directions

### Implement create, read and update for spec, requirement and story criterion
**Task**: 2.2  
**Description**: The requirement tool takes `class` as a required argument and never infers one from `label` — covers the must-NOT and the label-withheld criterion.  
**Status**: Complete — `acceptance_criterion` was tooled here too, which is what makes the third criterion satisfiable as written

### Implement create, read and update for epic, story, task and coverage
**Task**: 2.3  
**Description**: The coverage tool binds `(requirement_id, spec_fragment, story_criterion_id)`, which is the natural key — `position` is display order and no part of identity.  
**Status**: Complete — the registry is also wired to the entry point, which is what made Story 1's import-graph guard stop being vacuous

### Write tests for Expose typed create, read and update tools for the spine
**Task**: 2.4  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete — 25 tests in `dpm/tests/tools.test.js`; 213 across the suite

**Retro**: **A mutation that changes what a test iterates over cannot be caught by that test.** Dropping `spec_fragment` from `dpm_create_coverage`'s `required` list survived a sweep that refuses each declared required argument in turn — because the sweep reads `inputSchema.required`, and the mutation removed the entry it would have tested. The sweep is still worth having; it caught the case it was written for. But a *missing* declaration is guarded only by something that reads the table instead of the tool, which is exactly AD10's rule and exactly Story 7's row 19. Verify at Story 7 that this mutation fails there.

**Retro**: **`parent_kind` was derived and nothing could tell.** Replacing the parent lookup with the constant `'spec'` passed the whole suite, because `document_kind_parent` admits exactly one parent kind for `epic`, so the constant and the derivation agree on every legal input. The only observable difference is a parent that does not exist — a lookup that must find a row, against a foreign key that fails one step later having already taken a number. A test now pins that. The derivation proper stays unfalsifiable until Epic 47-05 gives `adr` and `retro` tools, since those are the kinds with several legal parents.

**Retro**: **`undefined` reaching a bound parameter is an Internal error, and it should be a refusal.** Found by the mutation above rather than by design: `node:sqlite` answers an `undefined` binding with a bare `TypeError` carrying no `rpc` code, which `dispatch` renders as `-32603`. The caller is told the server is broken when their call was. Now refused in `crud.js` with the column named.

---

## Expose the cross-cutting tools [plan]
**Story**: 3  
**Status**: Complete  
**Blocked by**: Story 2  
**Satisfies**: FR5, FR14, FR22

**Acceptance Criteria**:

- Allocating a number through its tool returns the value and never a success without one [unit]
- The link tool refuses an edge that would close a cycle over a `gates_work` kind, naming both ends [integration]
- The integrity tool is callable and reports every register entry it checks [integration]

### Wrap the number allocation from Epic 47-01 Story 3 as a tool
**Task**: 3.1  
**Description**: The allocation statement already exists and holds register #5 by construction; this task is only its tool boundary.  
**Status**: Complete — and register #5 turned out not to be held by construction; see the retro below

### Implement the link tool with the gates_work cycle refusal
**Task**: 3.2  
**Description**: Names both ends of the edge it rejects. Cycle detection is reachability, which is why register #1 exists rather than a constraint.  
**Status**: Complete — the refusal reuses register entry 1's own check rather than a second reachability query, so the rule that prevents cycles and the check that reports them cannot disagree

### Wrap the integrity check from Epic 47-01 Story 6 as a tool
**Task**: 3.3  
**Description**: The checks exist; this exposes them so a corrupted state is diagnosable without SQL, which is the whole of FR14's "without SQL" clause.  
**Status**: Complete — the tool adds the roll of every entry, because `checkIntegrity` returns only the ones that failed

### Write tests for Expose the cross-cutting tools
**Task**: 3.4  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete — 13 tests in `dpm/tests/cross-tools.test.js`; 226 across the suite

**Retro**: **Register entry 5 was passing because nothing could make it fail.** Its check joins `number_sequence` to `document`, and until Story 2 shipped create tools no test both allocated a number and wrote it onto a row — so the join was empty and the `HAVING` never ran. The first real database this story produced reported a violation immediately. The invariant as the spec words it, "`next_value` is greater than every number allocated", is true only in the window between an allocation returning N and the row that consumes it being written; afterwards the two are equal, and stay equal until the next allocation. Both readings are correct and they measure at different moments. A register check runs at an arbitrary moment, so the only form it can assert is the one true at every one of them: **at least**, not greater than. Nothing is lost — what entry 5 exists to catch is a document numbered *above* the counter, a number that reached a row without going through `number_sequence`. Restated in `register.js`; **the spec's Data Model row 5 carried the instantaneous wording until it was pivoted to "at least" on 2026-08-09, and this reasoning is what it now carries.**

**Retro**: **A register entry found by position is a rule that can be silently swapped.** Prepending an entry to `REGISTER` and looking the cycle check up as `REGISTER[0]` disabled cycle detection outright — the link tool accepted every edge, and three tests failed only because they existed. Looking it up by its `entry` number survives the same mutation untouched. The prepend itself is caught by 47-01's parity tests, which is the real guard; the lesson is that a consumer of the register must not add a second way for it to be wrong.

---

## Bound reads by default and let callers raise the bound
**Story**: 4  
**Status**: Complete — the list tools were built here, because without them two of the three criteria had no subject  
**Blocked by**: Story 2  
**Satisfies**: FR13

**Acceptance Criteria**:

- For the same artefact, a read without an explicit body request returns strictly fewer bytes than one with it — asserted as a comparison between two responses, not against a fixed number [integration]
- Every list-returning tool declares a `limit` with a default, and a caller that raises it receives the larger result [unit]
- must NOT — a query tool returns an unbounded row set when no limit is supplied, or refuses a limit the caller raised [unit]

### Add summary and body read modes to every read tool
**Task**: 4.1  
**Description**: The summary is the default; the body is requested explicitly. There is deliberately no byte ceiling — a cap the caller cannot lift is a boundary on what dpm can be asked for.  
**Status**: Complete — `include_body` is injected by `defineTool` from the `body` columns a tool declares, so declaring the columns is the whole of what a tool has to do

### Add a defaulted, raisable limit to every list-returning tool
**Task**: 4.2  
**Description**: Covers both the default and the raise. A refused raise fails the must-NOT as squarely as an unbounded default does.  
**Status**: Complete — widened to build the eight list tools, since no tool in the registry returned more than one row

### Write tests for Bound reads by default and let callers raise the bound
**Task**: 4.3  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete — 12 tests in `dpm/tests/reading.test.js`; 239 across the suite

**Retro**: **Two of this story's three criteria were vacuous, and nothing in the breakdown said so.** After Stories 2 and 3 the registry held twenty-seven tools and not one returned more than a single row: every read is by primary key, and the integrity sweep is deliberately unbounded. "Every list-returning tool declares a `limit` with a default" and the must-NOT beneath it were both true over an empty set, and would have stayed true through Epics 47-04 and 47-05, which scope no query tools either. Neither the spec nor this epic assigns the list tools to anyone — FR13 says what the bound must do and takes their existence for granted. So Story 4 built them: one per spine type, scoped by its natural parent, scope optional. The general shape is that a criterion about *every X* needs a story that produces an X, and a breakdown can lose that when X is implied by a requirement rather than named by one.

**Retro**: **A tie in an ordered page is invisible until the rows actually tie.** Dropping the `id` tiebreaker from all eight list orders left the whole suite green, including the test that walks every page and checks the pages tile the set exactly once — the seeding put each type's rows under one parent, where `position` and `number` are already unique. Seeding a real tie was not enough either: with fifty-one pairs of tied tasks, SQLite returned the same tied order at every offset, so the walk still passed. It is entitled not to. What catches the mutation is a structural assertion that each list order ends on a column the live schema marks primary key — the empirical test is kept for what it does check, with the limit of it written down beside it.

---

## Name tools discoverably and keep every table reachable
**Story**: 5  
**Status**: Complete — two criteria were amended here; both amendments are recorded below  
**Blocked by**: Story 2, Story 3  
**Satisfies**: NFR5, NFR7  
**Pivot**: 2026-08-09 — the first criterion's pattern changed from `dpm_[a-z_]{6,}` to `[a-z]{3,}(_[a-z]{3,})+` when FR29 established that the harness supplies the `mcp__dpm__` prefix, so an export carrying `dpm` states the server's identity twice. Coverage row 14's ✓ was cleared with it. The rule this story settled is untouched — every part after the verb is still schema vocabulary, and `check_integrity` still takes the derived exemption. What changed is only the shape of the prefix, and the rename itself is Epic 47-06 Story 0.

**Acceptance Criteria**:

- Every exported tool name matches `[a-z]{3,}(_[a-z]{3,})*`, and every part after the verb is a table name, a column name, or a seeded `document_kind.kind` value — checked against the live schema, not against a hand-kept word list. A tool whose declared table is not one of the live tables spans the schema rather than acting on it, and is held to the shape and not to the vocabulary [unit]
- Every table a registered tool writes is reachable through at least one read tool, compared in both directions from the tools' own declarations against `sqlite_master` — and the tables no tool reaches yet are named by the same assertion rather than excluded from it [integration]
- A database whose schema version is ahead of the server still answers read tools rather than refusing to start [integration]

### Assert every tool name against the live schema's tables, columns and seeded kinds
**Task**: 5.1  
**Description**: No hand-kept word list — a list of permitted abbreviations would be one more hand-maintained vocabulary of exactly the kind this spec removes.  
**Status**: Complete — the rule was widened rather than the tool renamed; the exemption is derived from the tool's declared table

### Assert every table in sqlite_master is reachable through a read tool
**Task**: 5.2  
**Description**: Compares the table list against the tools' declared coverage. This is the assertion that makes NFR7's promise checkable rather than aspirational.  
**Status**: Complete — found two tables written by a tool and readable by nothing; both now have read tools

### Answer read tools when the database schema version is ahead of the server
**Task**: 5.3  
**Description**: NFR7's lockout case — degrade to reads rather than refusing to start, so a user is never shut out of their own planning history by a version skew.  
**Status**: Complete — an older server leaves a newer database alone: no seeding, no guard regeneration, reads answered, writes refused by name

### Write tests for Name tools discoverably and keep every table reachable
**Task**: 5.4  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete — 5 tests in `dpm/tests/naming.test.js`; 244 across the suite

**Retro**: **The NFR5 clash was settled by widening, and the exemption is derived rather than listed.** `dpm_check_integrity` was the one name of thirty-five the rule could not admit, because it spans every table and there is no schema word for that. Renaming was the alternative and it is worse: no name built only from schema words describes what the tool does, so the rename would have cost the discoverability NFR5 exists to protect in order to satisfy the mechanism that protects it. The rule now exempts a tool whose declared `table` is not one of the live tables — a property of the tool's own declaration checked against `sqlite_master`, so it is not the hand-kept word list the criterion forbids. Exactly one tool takes the exemption and the test asserts that, so a second one is a decision rather than a detail.

**Retro**: **The reachability criterion asserted a property of the finished system inside the epic that builds a quarter of it.** As written it required every table in `sqlite_master` to have a read tool; this epic's read tools reach ten of thirty-nine, and the remaining twenty-nine are Epic 47-05's, which the epic's own Notes already said. It is the mirror of Story 4's finding — that criterion was true over an empty set, this one was false over an incomplete one, and neither is visible from reading the criterion alone. Amended to the half this epic can close, in both directions, with the untooled tables *reported by the same assertion* rather than filtered out of it, so the gap is visible from here instead of looking closed. **Story 8's row 26 carries the same over-scoped clause and needs the same amendment when it runs.**

**Retro**: **Two tables were written by a tool and readable by nothing, and only the reachability sweep could see it.** `dpm_create_dependency` wrote `dependency` and `dpm_allocate_number` wrote `number_sequence`, neither with a read tool — the plainest form of the gap NFR7 exists to close, and invisible to every test in Stories 2 and 3 because each of those checks a tool against its own table. `dpm_read_dependency` and `dpm_read_number_sequence` were added here. The second is the more useful of the pair: without it, "what number will this get?" was answerable only by allocating one, and an allocation cannot be given back.

---

## Replace the progress-file subsystem with a session row
**Story**: 6  
**Status**: Complete  
**Blocked by**: Story 2  
**Satisfies**: FR11

**Acceptance Criteria**:

- A session row survives simulated resume under a new session id, and stale rows are selected by age [integration]

### Implement session create, adopt-on-resume and staleness-by-age
**Task**: 6.1  
**Description**: Adoption is an `UPDATE SET superseded_by`; staleness is a `WHERE updated_at < …` clause. Replaces session-suffixed filenames, hook injection and compact-summary companions outright.  
**Status**: Complete — five tools, including `dpm_adopt_session`, which is the `UPDATE` and the state hand-off in one call

### Write tests for Replace the progress-file subsystem with a session row
**Task**: 6.2  
**Description**: Write automated tests covering the story's acceptance criterion tagged `[integration]`.  
**Status**: Complete — 9 tests in `dpm/tests/session.test.js`; 253 across the suite

**Retro**: **Adoption cannot assume dpm created the adopting row.** The first version inserted the new session carrying the predecessor's state forward, and skipped the insert if a row with that id already existed — which is the case that actually happens: the harness issues `CPM_SESSION_ID` and may record the row before anything asks to resume. In that path the state stopped at the pre-existing row and the resume silently lost it. It would have passed every test written against the path dpm controls, and failed in the field. Adoption now carries `skill`, `phase` and `state` onto the adopting row whichever way it arrived, and refuses the one case where that would destroy something — a session already holding state of its own is not resuming anything.

**Retro**: **The `order` a paged tool uses has to be the `order` it declares.** `dpm_list_session` is written by hand rather than through the list factory, because staleness is `updated_at < ?` and the factory does equality only — and it passed the order to its statement without declaring it on the tool. Story 4's tiebreaker assertion reads the declaration, so it failed on `undefined` rather than on a bad order. Worth recording because the failure was in the *shape of the evidence*, not the behaviour: the tool ordered correctly the whole time, and the property Story 4 exists to guarantee was simply unobservable. A hand-written peer of a factory-built tool has to declare everything the factory declares.

---

## Assert tool schemas conform to the live schema
**Story**: 7  
**Status**: Complete — the M18 mutation Story 2 could not catch fails here, in the whole-registry assertion  
**Blocked by**: Story 2, Story 3, Story 4, Story 6  
**Satisfies**: AD10

**Acceptance Criteria**:

- Every enum a tool declares is equal to the `CHECK` set on its column, in both directions, read from the live schema [unit]
- Every `NOT NULL` column without a default is a required argument on its create tool, and every foreign key on the table has a corresponding argument [unit]
- must NOT — the conformance test compares tool schemas against a second copy of the DDL rather than against `PRAGMA` output [unit]

### Read the correspondence out of PRAGMA table_info and PRAGMA foreign_key_list
**Task**: 7.1  
**Description**: Never from a second copy of the DDL — a copy is the drift this seam exists to catch, relocated into the test.  
**Status**: Complete

### Assert enum equality in both directions, and required-argument parity
**Task**: 7.2  
**Description**: A tool offering a value the `CHECK` rejects is validation in the wrong layer; a `CHECK` admitting a value no tool offers is a column the pipeline cannot reach. Both fail.  
**Status**: Complete

### Write tests for Assert tool schemas conform to the live schema
**Task**: 7.3  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`.  
**Status**: Complete

**Retro**: **The must-NOT was falsifiable only because it was tested behaviourally rather than structurally.** "Compares against a second copy of the DDL" describes how the checker is *written*, and the obvious test for it — grep the module for a `.sql` import — is the grep proxy that passes on any file that reads the DDL by some other route. The test instead hands the checker a database whose live schema disagrees with the shipped files and asserts it notices. Rewriting `checkSets` to read the `.sql` files (M39) then fails, which no structural check of the module's imports would have registered as a change in behaviour at all.

**Retro**: **Story 2's escape closed exactly where it was predicted to.** Dropping `spec_fragment` from `dpm_create_coverage`'s `required` (M18) now fails in two places — the targeted test *and* the whole-registry conformance assertion — while every other test in the 260 still passes, which is the same suite that let it through at Story 2. The general form was worth building: the same test drops each of the 40-odd required arguments that name a `NOT NULL` column, one at a time, so a rule that happened to catch only `spec_fragment` would fail its own control.

**Retro**: **Two real defects surfaced from the tool side, not the schema side.** `dpm_create_spec` reached this story with `parent_id` and `parent_kind` accounted for by nothing — the tool writes both NULL, which is correct, but no declaration said so, and the difference between "deliberately NULL" and "nobody filled this in" is exactly what a later reader cannot recover. Declaring them `SUPPLIED.derived` is the account. The second was in the checker: `document.parent_kind` is carried by two foreign keys — the composite and its own — and counting it twice would have reported one column as two problems.

---

## Verify cross-story integration for Server and spine tools
**Story**: 8  
**Status**: Complete — the last criterion was amended before the story ran, as Story 5 said it would need to be  
**Blocked by**: Story 1, Story 2, Story 3, Story 4, Story 5, Story 6, Story 7  
**Satisfies**: FR3, AD10

**Acceptance Criteria**:

- A spec created through its tool, then an epic under it, then a story, then a coverage row binding a requirement fragment to a story criterion, all succeed in sequence and read back consistently through their read tools [integration]
- A create call whose enum value the column's `CHECK` rejects fails at the tool boundary, and no row is written [integration]
- The conformance test passes against the running server's actual registered tool list, not a fixture of it [integration]
- A session created, resumed under a new id, and read back returns the state written before the resume [integration]
- Every tool the server registers appears in the reachability assertion, and every table this server's tools write appears in at least one registered tool's declared coverage — the tables no tool reaches yet named by the same assertion rather than excluded from it [integration]
- must NOT — a tool accepts an argument the schema rejects, so validation happens at neither layer [integration]

### Write integration tests for Server and spine tools
**Task**: 8.1  
**Description**: Drives the full spine chain through the tool surface rather than the database, which is the only way the tool boundary is exercised at all. The third criterion is the load-bearing one — AD10's test could pass against a fixture tool list and prove nothing about what the server exposes.  
**Status**: Complete — 6 tests in `dpm/tests/spine-integration.test.js`, all driven over stdio against a spawned `bin/dpm-mcp.js`; 266 across the suite

**Retro**: **The third criterion was load-bearing exactly as written, and the mutation proves it in a way no other story could.** Filtering the eight list tools out of what `main()` serves (M45) fails six tests here — and leaves Story 7's conformance check passing, because Story 7 builds the registry it checks. That is the false pass the criterion names, reproduced and caught. Reading the list off `tools/list` and asserting it equal to the local registry name-for-name *before* deriving anything from it is what makes every later assertion in the file a statement about the server rather than about `spineTools`.

**Retro**: **A mutation caught by an older story is still a fact worth recording, and it is not a fact about this story.** Hardcoding `parent_kind` to `'spec'` instead of reading it from the parent (M48) fails one Story 2 test and none of Story 8's — because `epic` is the only child kind this epic tools and its only parent is a spec, so the two are behaviourally identical here. The chain test asserting `epic.parent_kind === 'spec'` adds nothing against that mutation and it would be easy to believe otherwise. What it does add is composition: six creates whose foreign keys point at ids the previous call returned, which is the only thing in the suite that fails if the chain cannot be built at all.

**Retro**: **The reachability count in three places was off by one and the suite had been saying so.** The prose read "nine of thirty-nine" while `t.diagnostic` printed 29 untooled of 39 — ten reached, not nine. It was wrong in the Story 5 retro, in the matrix note and in the comment inside the assertion that computes it, all three written from the same arithmetic rather than from the output. The fix is not the number; it is that the diagnostic prints the count so a reader never has to subtract, and prose that restates it should be checked against a run rather than against itself.

---

## Address review findings
**Story**: 9  
**Status**: Complete — applied by `/cpm:pivot` on 2026-08-08 from review 05  
**Blocked by**: —

**Acceptance Criteria**:

- Each critical and warning finding from review 05 scoped to this epic has been addressed
- Existing acceptance criteria on other stories continue to pass

### Fix: Story 5 and Story 8 state reachability requirements that cannot both pass
**Task**: 9.1  
**Description**: [critical] Story 5 requires that "every table in `sqlite_master` is reachable through **at least one** read tool"; Story 8 requires that "every table appears in **exactly one** tool's declared coverage". `document` is read by the read tool of every one of the thirteen kinds, and `taxonomy` by `finding`, `observation` and `audit_finding` — so exactly-one is not merely stricter, it is unsatisfiable against this schema. NFR7 (spec:1383) says at-least-one, so Story 8 also invents an obligation the spec does not carry. Reconcile Story 8's clause to the spec's wording, and update the matching coverage row. Neither criterion is wrong read alone, which is the reading retro 33 recorded as the one that cannot find this.  
**Status**: Complete — Story 8 and matrix row 26 now read "at least one", matching NFR7

### Fix: this epic says "the remaining fifteen"; Epic 47-05 says "sixteen"
**Task**: 9.2  
**Description**: [warning] This epic states "47-05 the remaining fifteen types" and "The remaining fifteen are Epic 47-05", both unqualified. Epic 47-05 titles its Story 1 "Give the remaining **sixteen** entity types create, read and update tools". The two reconcile only via this epic's own FR11 placement note — `session` has its tool here but is counted in 47-05's accounting — which is a derivation held in a third location and stated in neither. 47-05 already routes around the count by reading the enumeration from the live schema; either adopt that qualification here or state the derivation where the number appears. Retro 33's "count in code, quote in prose", returning for a third session.  
**Status**: Complete — both statements now read "sixteen", with the `session` derivation stated inline

---

## Notes

### Self-hosting register — entries in this epic's scope

The register lives in Epic 47-01's Notes. No entry is closable here; all four need spec
changes. Entry 1 is however **most visible in this epic**: FR10 now has partial coverage in
three separate epics (47-01 seeding, 47-03 spine create tools, 47-05 the remaining sixteen
types), and nothing in dpm as specified could distinguish that from FR10 being fully covered.
It is the clearest live instance of the entry in the whole breakdown.

### Placement decisions worth recording

**The MCP protocol layer is written here rather than taken as a dependency, decided on
2026-08-08.** AD5 rejected Python partly because its `mcp` package "has no clean dependency
story for the `mcp` package inside a plugin cache directory", but it does not say what makes
Node's story clean — and `package.json` declares `"dependencies": {}` with no `node_modules`
committed anywhere in the marketplace. Taking `@modelcontextprotocol/sdk` would satisfy NFR1's
literal wording, since it is pure JavaScript and needs no compilation, while reintroducing the
install step that decided AD5 against the alternative. So the newline-delimited JSON-RPC 2.0
loop and the `initialize` / `tools/list` / `tools/call` handshake are implemented in
`src/server/`, and `dependencies` stays empty. The cost is ours: protocol conformance is
maintained here, and a revision to MCP is a change to this epic's code rather than a version
bump. That cost is stated because it is the part a later reader would otherwise have to
rediscover by asking why the SDK is absent.

**The fixture seam does not become the tool surface, and 47-01 expected that it would.**
`tests/fixtures/tool-surface.js` and `tests/support/creators.js` both say in their own headers
that Epic 47-03 replaces `create()`'s statements with MCP tool calls and deletes the creators.
Story 2 is where that became possible, and it must not happen — for a reason the creators file
states two paragraphs later without connecting the two. Creators are deliberately thin and
"write what they are given — including values the schema will reject", because a creator that
derived `parent_kind` from the parent it was handed would make the criterion about a
`parent_kind` that misdescribes its parent untestable. The spine tools derive exactly that, and
refuse exactly those rows: that is what Story 2 built them to do. So a validating tool cannot
produce the invalid rows 47-01's constraint tests exist to reject, and the seam has to keep a
write path that bypasses validation for as long as those tests do. Recorded rather than acted
on — the substitution is not a small edit deferred, it is one that cannot be made.

**NFR1 is tagged `[target]`, not `[manual]`.** "A clean clone starts the server with no
compilation step" is mechanically checkable, but only against a real clone on a real host — a
verdict from a machine that already has the dependencies is worth nothing. Story 1 therefore
cannot be fully closed by an autonomous run, which is a property of the requirement rather
than a gap in the story.

**FR11 sits here rather than in Epic 47-05.** `session` is one of the parity enumeration's
two standalone tables, so on AD6's accounting it is M3 work. But session lifecycle is a
server concern that every skill needs from the first conversion, so the tool lives here.
47-05 retains it in the parity enumeration's accounting only.

### Requirements only partially covered by this epic

- **FR3** — the tool-boundary half (rows 21–22). Its other clause, "No skill contains SQL,  
  and no skill constructs a query", is a property of the skill corpus and belongs to Epics  
  47-06 through 47-09.
- **FR10** — the seven spine entity types only. The remaining **sixteen** are Epic 47-05's —  
  the Data Model's *fourteen document kinds, nine child tables and two standalone tables*,  
  less this epic's seven, where that phrase read *thirteen, eight and two* on the date this  
  was written and the sixteen is the figure delivered against; the two types the pivot of  
  2026-08-10 added belong to Epic 47-09. One of the sixteen, `session`, has its table  
  and its tool built *here* under FR11 and is counted there only for the enumeration's  
  arithmetic, so 47-05 writes fifteen tools against sixteen accounted types. The derivation  
  is stated here because the number alone cannot be reconciled from either epic on its own:  
  until review 05 this note said "fifteen" while 47-05 said "sixteen", and the note that made  
  them consistent lived in a third place. Prefer 47-05 Story 1's enumeration over either  
  number — it reads the set from the live schema and fails on any member without a tool.
- **FR4**, **FR5**, **FR14**, **FR22** — the tool-boundary half of each; the schema half is  
  Epic 47-01.
