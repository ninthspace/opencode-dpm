# Runtime Capability and Unmade Checks

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Date**: 2026-08-11  
**Status**: Complete  
**Blocked by**: —  
**Retro applied**: 39 · Codebase discoveries · Applied — Task 2.1 parses the register from the spec's table at test time rather than refactoring the hand-kept copy, because the drift this lesson records is the same array one epic later.  
**Retro applied**: 39 · Patterns worth reusing · Applied — Story 2's and Story 3's must-NOTs are each written as a count-guarded assertion, so a parse matching no rows and a glob matching no skills fail rather than reading as compliance.  
**Retro applied**: 37 · Patterns worth reusing · Applied — Story 1 probes how FTS5 absence actually presents on a connection, and whether `openConnection()` is genuinely the single funnel, before writing either; the design is not built around what the failure is assumed to look like.  
**Retro applied**: 38 · Testing gaps · Applied — Story 3's check runs on the step that reaches the resume path rather than on the file, reusing the block construction built for 47-12 instead of restating a file-scoped match.

Three obligations, one shape: each is a guarantee the spec states and nothing enforces. NFR2's
floor check runs and its capability check does not exist. NFR6's register says a condition added
to it fails the suite until it has a test, and adding #24 left the suite green. FR11's
`adopt_session` works and nothing asks whether a skill ever calls it.

## Refuse a runtime whose SQLite cannot maintain the schema
**Story**: 1  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: NFR2, NFR6 (register #24)

**Acceptance Criteria**:

- A runtime whose SQLite lacks FTS5 is refused at every database open — by all four binaries, and against a database already carrying every migration — with a message naming the capability and `process.execPath` [integration]
- must NOT — the capability is inferred from the Node version rather than probed on the connection [unit]
- The refusal is exercised with the capability forced false on a runtime that does have FTS5, so the test distinguishes the probe from the version rather than from the machine it happens to run on [unit]
- The probe answers for the connection it is handed, and answers true on the Node running the suite [unit]

**Retro**: [Testing gaps] A mutation that leaves the probe's table behind was caught only by a *later* test, because the "leaves nothing behind" assertion read `sqlite_schema` — and the probe writes to `temp.`, which is not in it. The limb was named correctly and checked the wrong place; what makes the property real is that the probe is repeatable on one connection, and asserting that is what caught it.

### Probe the connection for FTS5
**Task**: 1.1  
**Description**: Answers whether the SQLite behind a given connection carries FTS5, and builds the refusal naming the capability, `process.version` and `process.execPath`. Covers the must-NOT and the probe-answers-for-its-connection criteria.  
**Status**: Complete

### Refuse at `openConnection()`
**Task**: 1.2  
**Description**: The one funnel all four binaries pass through, which is what makes "every open" a property of the code rather than of four remembered call sites. Covers the all-binaries criterion, including against a fully-migrated database.  
**Status**: Complete

### Write tests for Story 1
**Task**: 1.3  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]` and `[integration]` — the forced-false and forced-true cases, the four-binary sweep, and the already-migrated fixture.  
**Status**: Complete

---

## The false-pass register is read from the spec, not copied from it
**Story**: 2  
**Status**: Complete  
**Blocked by**: Story 1  
**Satisfies**: NFR6

**Acceptance Criteria**:

- Every condition in the false-pass register has a test asserting it blocks rather than warns, and the register has no unregistered entries [integration]
- The register's conditions, numbers and count are parsed from the spec's table at test time, so a condition added to the spec fails this suite until it has a disposition [unit]
- Entry #24 carries a disposition naming a test that asserts the refusal [unit]
- Entry #25 carries a `closedIn` disposition naming epic 47-12, and the parse accepts both dispositions — a test citation and a `closedIn` — rather than only the first [unit]
- must NOT — a parse matching no rows passes every assertion, so an empty or unrecognised table reads as a satisfied register [unit]

**Retro**: [Patterns worth reusing] Extracting the reconciliation into an `audit(conditions, dispositions)` returning complaints — rather than a run of assertions — let the controls drive the deliverable on planted inputs instead of restating its rules, which is the defect this story closed reappearing one level up in the controls themselves.

### Parse the register out of the spec
**Task**: 2.1  
**Description**: Replaces the hand-kept `FALSE_PASSES` array in `dpm/tests/false-pass.test.js` with the spec's table read at test time. Covers the parse and count criteria.  
**Status**: Complete

### Give entries #24 and #25 their dispositions
**Task**: 2.2  
**Description**: #24 cites the Story 1 test that asserts the refusal, which is why this story is blocked by that one. #25 takes `closedIn: 47-12` — its mechanism is FR13's corpus criterion, which this epic does not build. The `closedIn` branch has been unused since 47-05 and this is the condition it was kept for.  
**Status**: Complete

### Write tests for Story 2
**Task**: 2.3  
**Description**: The controls rather than a second copy of the deliverable — a table that parses to zero rows must fail, and a condition present in the spec with no disposition must fail.  
**Status**: Complete

---

## Every skill that records a session reaches the resume path
**Story**: 3  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: FR11

**Acceptance Criteria**:

- Every skill that records a session reaches the resume path on startup, checked over the corpus; and the shared convention it reaches carries adoption rather than each file restating it [unit]
- `artifact`, `status` and `templates` are each either brought under the convention or named as exempt with the reason, and an exempt skill that records a session fails the check [unit]
- must NOT — the check passes over a corpus it failed to read, so a glob matching no skills reads as full compliance [unit]

**Retro**: [Testing gaps] The exempt-skill control was written with `/\b(create_session|update_session)\b/`, and the leading `\b` never matches — skills write the callable form and the character before the verb is an underscore. The check found nothing anywhere, so every exemption passed by never being tested; the planted control caught it, and nothing about the regex read as wrong.

**Retro**: [Scope surprises] The story named three skills to settle and the corpus held five — `clean` and `publish` were already exempt in their own words, so a check written to the three named would have been correct about them and silent about the other two.

### Settle `artifact`, `status` and `templates`
**Task**: 3.1  
**Description**: Each is either brought under the shared *Session Startup* convention or recorded as exempt with its reason. This is the judgement the assertion needs before it can be written.  
**Status**: Complete

### Assert the corpus reaches the resume path
**Task**: 3.2  
**Description**: Over `dpm/skills/*/SKILL.md`, checking the convention is referenced rather than restated. Covers the first criterion.  
**Status**: Complete

### Write tests for Story 3
**Task**: 3.3  
**Description**: The controls — an exempt skill that records a session must fail, and a glob matching no skills must fail.  
**Status**: Complete

---

## Notes

**Why the probe belongs at `openConnection()` and not in the migration path.** The condition was
found in the field on 2026-08-11: an MCP server on Node v23.4.0, whose bundled SQLite has no FTS5,
opened a `.dpm/dpm.db` that an earlier Node 24 run had migrated in full. `schema_version` recorded
all 21 migrations as applied, so `start()` correctly did nothing, the server started clean, the
tool list was complete, and reads answered. Only writes reaching an FTS trigger failed — as
`-32603 Internal error` carrying `no such module: fts5`. The migration path is precisely the path
that does not run in this case, which is what makes every-open the requirement rather than a
stricter reading of it.

**The six tables that carry FTS triggers** are `document_section`, `requirement`,
`acceptance_criterion`, `story_criterion`, `observation` and `finding` — which is why
`create_discussion` and `create_document_agent` succeeded while every prose write failed. The
blast radius is "everything holding content", and it presents as a working server.

**Story 2 exists because the register's advertised mechanism is a transcription.** The spec says a
condition added to the register fails NFR6's second criterion until it has a test. Entry #24 was
added on 2026-08-11 and `node --test dpm/tests/false-pass.test.js` reported 3 pass, 0 fail —
because `FALSE_PASSES` is a hand-copied array asserted for count and contiguity against itself.
The file's own header claims otherwise under the heading *"The register is itself under test."*

**`process.execPath`, not just `process.version`.** Diagnosing the field failure took an hour, and
almost all of it went on establishing which interpreter was running: `ps -o command=` prints
argv[0] (`node`), `ps -o comm=` did not resolve it either, and only `lsof` on the process named
the binary. The server knew the whole time.

**AD5's Consequence gained a third cost in the same amendment** — the SQLite underneath is the
runtime's, and its compile-time options vary between builds of the same version. That is rationale
rather than a new obligation, so it carries no criterion; NFR2's criteria are where it becomes
testable.

**Step 3c — integration testing story: skipped.** Three stories whose only cross-story link is a
citation (#24's disposition naming Story 1's test) rather than a data flow or contract. Story 1's
own criterion already spans all four binaries end to end, which is where the integration risk sits.
