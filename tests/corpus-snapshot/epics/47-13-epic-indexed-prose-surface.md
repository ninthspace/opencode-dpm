# The Indexed Prose Surface

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Date**: 2026-08-11  
**Status**: Complete  
**Blocked by**: —  
**Retro applied**: 40 · Scope surprises · Applied — no story names the columns to index; Story 1 derives the set from `sqlite_schema`, because the enumeration in prose was narrower than the schema at every point it has been written down.  
**Retro applied**: 40 · Patterns worth reusing · Applied — Task 4.1 extracts the reconciliation into `audit(inputs) → complaints` so Story 4's controls drive the deliverable on planted inputs rather than restating its rules beside it.  
**Retro applied**: 41 · Criteria gaps · Applied — Story 1's classification carries a reason on the **exclusion** side as well as the inclusion side; without it the rule degenerates into "index everything", including `slug` and `commit_sha`.  
**Retro applied**: 41 · Testing gaps · Applied — Story 4's must-NOT is a count-guarded assertion over a planted empty enumeration, because once Story 2 succeeds the live schema can no longer distinguish a working check from a vacuous one.  
**Retro applied**: 33 · Codebase discoveries · Applied — Step 3c weighed the dump/restore path against Story 2's new triggers, which is the one prior occasion this subsystem broke from a change that never mentioned it; the round trip became a criterion on Story 2.  
**Retro applied**: 40 · Testing gaps · Applied (execution) — Task 1.1's `UPDATE OF` parse is checked against a known-answer count before anything is built on it; a scratchpad version of the same parse returned two indexed columns where the schema holds eight, and read as working.  
**Retro applied**: 40 · Patterns worth reusing · Applied (execution) — Task 4.1 is written as `audit(columns, indexed, classification) → complaints` so Task 4.3's three controls drive that function on planted inputs.  
**Retro applied**: 41 · Testing gaps · Applied (execution) — after Story 2 the live schema cannot distinguish a working reconciliation from a vacuous one, so Task 4.3 plants an empty enumeration and an unexplained exclusion rather than asserting over the real schema.  
**Retro applied**: 33 · Codebase discoveries · Applied (execution) — Task 2.1 establishes how `entry_fts` is declared and what 47-02's dump/restore does with it *before* the migration is written, rather than after the first row breaks.

FR9 indexes prose and states the rule that decides which columns: *prose a person wrote that no
other column can find the row by*. The rule is right and nothing checks it. Eight columns across six
tables are indexed; the schema holds 194 TEXT columns, and `adr.decision`, `audit_finding.summary`
and `quick_criterion.text` are not among the eight while `finding.summary` beside them is.

## Classify every column that holds prose
**Story**: 1  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: FR9

**Acceptance Criteria**:

- Every TEXT column in the schema carries a classification — *prose a person wrote that no other column can find the row by*, or not — with its reason, enumerated from `sqlite_schema` rather than from a list [unit]
- The classification covers the eight columns already indexed on the same terms as the ones that are not, and reconciles in both directions: an indexed column with no entry fails, and an entry for a column the schema no longer has fails [unit]
- must NOT — a column is classified from its name or its declared type rather than from what it holds [unit]

**Retro**: [Codebase discovery] FR9's rule has two clauses and only the first was ever applied — the second, *that no other column can find the row by*, is what separates `observation.note` from `retro_application.note`, and writing the exclusion as the column that reaches the row (rather than as a sentence) is what makes it fail when that column stops being indexed.

### Enumerate the columns and the indexed set
**Task**: 1.1  
**Description**: Both sides derived from the live schema — TEXT columns from `PRAGMA table_info`, the indexed set from the triggers themselves — so a column added by a later migration arrives in the check with no edit. Covers the enumerated-from-schema criterion.  
**Status**: Complete

### Classify each column by what it holds
**Task**: 1.2  
**Description**: The judgement pass, and the one that cannot be derived. Covers the classification criterion and its must-NOT.  
**Status**: Complete

### Record the classification where Story 4's assertion can read it
**Task**: 1.3  
**Description**: Each entry carries its reason on both sides, so an exclusion fails when its reason stops being true rather than outliving it.  
**Status**: Complete

### Write tests for Story 1
**Task**: 1.4  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`.  
**Status**: Complete

---

## Index the columns the classification says hold prose [plan]
**Story**: 2  
**Status**: Complete  
**Blocked by**: Story 1  
**Satisfies**: FR9

**Acceptance Criteria**:

- Every column classified as holding prose is reachable by `search`, with all three triggers — insert, update-of-the-indexed-column, delete — on each newly indexed table [unit]
- `audit_finding.summary` is searchable on the same terms as `finding.summary`, and `quick_criterion.text` on the same terms as `acceptance_criterion.text` and `story_criterion.text` [integration]
- Rows written before the migration are searchable after it — the migration backfills, rather than relying on triggers that fire only on writes after them [integration]
- A restored database's `entry_fts` returns the same `MATCH` results as the source for a term held only in a newly indexed column [integration]
- The search tool's entity vocabulary gains each newly indexed table with no edit to the tool [unit]
- Updating and deleting a row of each newly indexed table leaves `entry_fts` consistent with that table, asserted by the same `MATCH`-versus-`LIKE` comparison [unit]

**Retro**: [Testing gaps] Three of `entry-index.test.js`'s controls were hard-coded lists of the five tables indexed in 2026, and each one had become a way for a new table to go unchecked while every test passed — the tables swept, the `LIKE` expressions compared against, and the rows deleted. Replacing each with a reconciliation against the derived enumeration, plus a floor, is what turned "add a table" from a silent widening of the untested set into a failure.

### Write the migration
**Task**: 2.1  
**Description**: Forward-only per FR12; three triggers per newly indexed table, with `UPDATE OF` naming exactly the indexed column so an edit to a status or a position never rewrites an index entry.  
**Status**: Complete

### Backfill rows written before the migration
**Task**: 2.2  
**Description**: Named separately because a trigger fires only on writes after it. This is the half that makes existing rows findable, and the half whose absence looks like success — every new row searchable, every old one not.  
**Status**: Complete

### Close the two named inconsistencies
**Task**: 2.3  
**Description**: `audit_finding.summary` and `quick_criterion.text`. Separate from 2.1 because they are criteria rather than examples: a migration written in general terms could satisfy the first criterion and leave both.  
**Status**: Complete

### Write tests for Story 2
**Task**: 2.4  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]` and `[integration]`.  
**Status**: Complete

---

## The search tool says what it cannot answer
**Story**: 3  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: FR9

**Acceptance Criteria**:

- The search tool states, where the caller reads it, that there is no infix match, no stemming, and that `rank` is bm25 within one index so an unscoped query interleaves two rankings rather than ordering globally [unit]
- The statement is asserted against the tool description the server actually exposes, not against a comment in the source [unit]

**Retro**: [Patterns worth reusing] A stated limit and the behaviour it describes are two claims, and asserting only the first is the same substring-proxy failure the epic exists to close — so each of the three limits is checked twice, once against the description read off `tools/list` and once against a query that comes back empty. The demonstration half earned its place immediately: it failed on the first run because a corpus sentence contained the bare token the limit says is unreachable.

### State the limits in the tool description
**Task**: 3.1  
**Description**: Where the caller reads it. Three limits, each a real false-negative source: no infix, no stemming, interleaved ranking.  
**Status**: Complete

### Write tests for Story 3
**Task**: 3.2  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`.  
**Status**: Complete

---

## Assert the reconciliation, and close register #26
**Story**: 4  
**Status**: Complete  
**Blocked by**: Story 1, Story 2  
**Satisfies**: FR9, NFR6 (register #26)

**Acceptance Criteria**:

- Every column holding prose is either indexed or carries a recorded reason it is not, checked over the live schema at test time rather than against a transcribed set [unit]
- Entry #26's disposition names the test that asserts it [unit]
- must NOT — the reconciliation passes over an empty enumeration, so a schema read yielding no prose columns or no indexed columns reads as full coverage [unit]

**Retro**: [Testing gaps] The obvious citation for #26 was the triple-trigger test that already existed, and it is the wrong one: it asserts the index is maintained for the tables it covers and stays green on a schema that grows a prose column and indexes nothing — which is the entry's condition exactly. Driving the mutation at the source is what separated them, as the register's own convention requires; the name alone said nothing.

### Assert the reconciliation over the live schema
**Task**: 4.1  
**Description**: `audit(inputs) → complaints`, so the controls drive the deliverable on planted inputs rather than restating its rules in a second place. Covers the first criterion.  
**Status**: Complete

### Change entry #26's disposition
**Task**: 4.2  
**Description**: From undisposed to the test 4.1 produces. The register has been red since the spec was amended, which is NFR6's mechanism working; this is what closes it.  
**Status**: Complete

### Write tests for Story 4
**Task**: 4.3  
**Description**: The controls — an empty column enumeration must fail, an empty indexed set must fail, and a column excluded with no reason must fail.  
**Status**: Complete

---

## Notes

**Why the classification is a story rather than a task.** The rule FR9 states is one sentence and
applying it to 194 columns is a judgement per column, in both directions. `agent.personality` and
`agent.communication_style` are prose by any reading and are also the two columns 47-12 spent a
story teaching skills to *ask* for — indexing them is defensible and so is excluding them, and the
epic is worth nothing if that call is made in passing inside a migration.

**Where the eight indexed columns are**: `document_section.heading` and `.body` via `document_fts`;
`requirement.text`, `acceptance_criterion.text`, `story_criterion.text`, `observation.text`,
`observation.synthesis` and `finding.summary` via `entry_fts`. Derived from the triggers on
2026-08-11, not read off the spec — the spec's own list named four of them.

**The register has been red since the spec was amended.** Entry #26 was added with no disposition,
and `false-pass.test.js` fails on it. That is NFR6's second criterion working as specified — a
condition added to the register fails the suite until it has a test — and it is deliberately not
worked around. `closedIn` was not available as an interim because the disposition must name an epic
that exists on disk, and none did until this document was written. Task 4.2 closes it.

**A control worth tightening while Story 4 is in that file.** `false-pass.test.js`'s
"a condition the spec adds fails until it has a disposition" asserts `complaints.length === 1` after
dropping one disposition, which assumes a fully-disposed register — so whenever the register leads
the dispositions it fails for a second, uninteresting reason on top of the real one. Not a criterion
here; recorded so the next person in that file does not rediscover it.

**Step 3c — integration testing story: skipped.** One story carries `[integration]` criteria and the
cross-story links are sequential dependencies rather than components that must interoperate. The one
genuine integration risk — new FTS triggers against the dump/restore path from 47-02 — became a
criterion on Story 2 instead, where the migration that creates the risk is delivered.

## Lessons

**Codebase discoveries.** FR9's rule has two clauses and only the first was ever applied; the second
— *that no other column can find the row by* — is what separates `observation.note` from
`retro_application.note`. Writing an exclusion as the column that reaches the row, rather than as a
sentence, is what makes it fail when that column stops being indexed. Two structural exclusions came
out of the same reading and neither needed a criterion amended: `document.*` has prose and no
`read_document`, and `adr_option_tradeoff` has a composite key where `entry_fts.entity_id` holds one
value.

**Testing gaps.** Three of `entry-index.test.js`'s controls were hard-coded lists of the five tables
indexed in 013, and each had become a way for a new table to go unchecked while every test passed —
the tables swept, the `LIKE` expressions compared against, and the rows deleted. Reconciliation
against the derived enumeration plus a floor is what turned "add a table" into a failure. Separately,
the obvious citation for register #26 was the triple-trigger test that already existed and was the
wrong one: it stays green on a schema that grows a prose column and indexes nothing, which is the
entry's condition exactly. Only driving the mutation at the source separated them.

**Patterns worth reusing.** A stated limit and the behaviour it describes are two claims, and
asserting only the first is a substring proxy. Story 3 checks each of its three limits twice — once
against the description read off `tools/list`, once against a query that comes back empty — and the
second half failed on its first run, because a corpus sentence contained the very token the limit
says is unreachable.

**Scope surprises.** The classification found 22 prose columns where the epic's own Notes named
eight indexed and the spec's list named four of those. Deriving the set rather than transcribing it
was the story's premise, and it changed the size of Story 2 from "the three columns named in the
Notes" to ten tables and thirty triggers.
