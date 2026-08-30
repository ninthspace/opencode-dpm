# Coverage Matrix: Runtime Capability and Unmade Checks

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Epic**: docs/epics/47-11-epic-capability-and-unmade-checks.md  
**Date**: 2026-08-11

> **Verification rule**: Verification status (✓) is bound to criterion text. Any change to a story criterion or its spec mapping resets that row to unverified.

| # | Spec Requirement | Spec Text (verbatim) | Story Criterion (verbatim) | Covered by | Spec Test Approach | Verified |
|---|------------------|----------------------|----------------------------|------------|--------------------|----------|
| 1 | NFR2 | "The capability is probed on the connection, and probed at **every** open rather than when migrating: a database that another binary has already migrated records every migration as applied, so the migration path is precisely the path that does not run." | "A runtime whose SQLite lacks FTS5 is refused at every database open — by all four binaries, and against a database already carrying every migration — with a message naming the capability and `process.execPath`" | Story 1 | `[integration]` | ✓ |
| 2 | NFR2 | "The refusal names the capability, the Node in hand, and `process.execPath` — the question a user is left holding is *which interpreter is this actually*, and the process is the only thing that knows." | "A runtime whose SQLite lacks FTS5 is refused at every database open — by all four binaries, and against a database already carrying every migration — with a message naming the capability and `process.execPath`" | Story 1 | `[integration]` | ✓ |
| 3 | NFR2 (must NOT) | "FTS5 is also a build-time option (`--sqlite-enable-fts5`), so a custom build at any version can go either way, and **a version comparison can therefore never be a correct predicate for it**." | "must NOT — the capability is inferred from the Node version rather than probed on the connection" | Story 1 | `[unit]` | ✓ |
| 4 | NFR2 | "FTS5 is also a build-time option (`--sqlite-enable-fts5`), so a custom build at any version can go either way, and **a version comparison can therefore never be a correct predicate for it**." | "The refusal is exercised with the capability forced false on a runtime that does have FTS5, so the test distinguishes the probe from the version rather than from the machine it happens to run on" | Story 1 | `[unit]` | ✓ |
| 5 | NFR2 | "The capability is probed on the connection, and probed at **every** open rather than when migrating" | "The probe answers for the connection it is handed, and answers true on the Node running the suite" | Story 1 | `[unit]` | ✓ |
| 6 | NFR6 | "Any condition that could produce a false pass — a constraint violation swallowed, a projection silently stale, a search index behind the data — reports and blocks." | "Every condition in the false-pass register has a test asserting it blocks rather than warns, and the register has no unregistered entries" | Story 2 | `[integration]` | ✓ |
| 7 | NFR6 | "The register is itself the thing under test: a condition discovered later is added here first, and NFR6's second criterion fails until it has a test." | "The register's conditions, numbers and count are parsed from the spec's table at test time, so a condition added to the spec fails this suite until it has a disposition" | Story 2 | `[unit]` | ✓ |
| 8 | NFR6 | "A runtime without FTS5 opened against a database another binary already migrated … `schema_version` records every migration as applied, so the migration path does nothing; the server starts clean, the tool list is complete, and every read answers — only writes reaching an FTS trigger fail, in SQLite's own words, naming neither dpm nor the runtime" | "Entry #24 carries a disposition naming a test that asserts the refusal" | Story 2 | `[unit]` | ✓ |
| 9 | NFR6 | "A skill rendering stored text from a read that withheld it … an approval gate built this way returns a verdict computed over text it never saw" | "Entry #25 carries a `closedIn` disposition naming epic 47-12, and the parse accepts both dispositions — a test citation and a `closedIn` — rather than only the first" | Story 2 | `[unit]` | ✓ |
| 10 | NFR6 | "The register is itself the thing under test: a condition discovered later is added here first, and NFR6's second criterion fails until it has a test." | "must NOT — a parse matching no rows passes every assertion, so an empty or unrecognised table reads as a satisfied register" | Story 2 | `[unit]` | ✓ |
| 11 | FR11 | "So a skill that records a session also carries the resume path — via the shared *Session Startup* convention rather than by restating it — and that is checked over the corpus." | "Every skill that records a session reaches the resume path on startup, checked over the corpus; and the shared convention it reaches carries adoption rather than each file restating it" | Story 3 | `[unit]` | ✓ |
| 12 | FR11 | "**Adoption is an obligation on the corpus and not only a tool**, which is the half that has no natural test: a working `adopt_session` that no skill reaches on startup loses exactly as much state as no adoption at all, and every suite passes, because each one drives the tool directly." | "`artifact`, `status` and `templates` are each either brought under the convention or named as exempt with the reason, and an exempt skill that records a session fails the check" | Story 3 | `[unit]` | ✓ |
| 13 | FR11 | "**Adoption is an obligation on the corpus and not only a tool**, which is the half that has no natural test: a working `adopt_session` that no skill reaches on startup loses exactly as much state as no adoption at all, and every suite passes, because each one drives the tool directly." | "must NOT — the check passes over a corpus it failed to read, so a glob matching no skills reads as full compliance" | Story 3 | `[unit]` | ✓ |

## Notes

**Rows 1 and 2 quote the same story criterion against two spec fragments.** The criterion carries
two obligations — where the refusal fires and what it says — and the spec states them in separate
sentences. Splitting the rows keeps each fragment independently verifiable; merging them would let
one ✓ stand for both.

**Rows 3 and 4 share a spec fragment.** The must-NOT states the boundary and the forced-false
criterion is how it is exercised, which is the pairing the spec's own coverage table uses.

**NFR2's first criterion — the Node floor refusal — is not in this matrix.** It is delivered and
verified under `docs/epics/47-10-coverage-publishing.md`. This epic covers only the two criteria
the amendment of 2026-08-11 added.
