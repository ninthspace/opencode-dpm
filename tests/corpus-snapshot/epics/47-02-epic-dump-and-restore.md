# Dump and Restore

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Date**: 2026-08-08  
**Status**: Complete  
**Blocked by**: Epic 47-01-epic-substrate

**Retro applied**: 33 · Codebase discoveries · Applied — the dumper is written against `node:sqlite` and `sqlite_schema` directly; Story 1's must-NOT is asserted by a test that would catch a delegation to `sqlite3 .dump`, not satisfied merely by not delegating.  
**Retro applied**: 33 · Codebase discoveries · Applied — every restore-path probe asserts `PRAGMA foreign_keys` in the same connection it tests, so a check passing because enforcement was off cannot read as a pass.  
**Retro applied**: 35 · Testing gaps · Applied — dump output and test output are written to files and read whole; nothing is piped to `head`/`tail` for a verdict. A dump is large by nature, so this epic carries the hazard at its highest.  
**Retro applied**: 35 · Complexity underestimates · Applied — the FTS5 shadow-table set is derived from `sqlite_schema` rather than taken from Task 1.1's stated five, and the number was verified before restating it: an in-memory `CREATE VIRTUAL TABLE document_fts USING fts5(…)` yields six objects, the table plus `_config`, `_content`, `_data`, `_docsize` and `_idx`. Five is correct — standalone FTS5 keeps `_content` where the external-content form drops it.

Milestone M1 (AD6). The committed form of the database is text, and this epic produces the
bytes and reads them back. The **merge tool** is deliberately *not* here: FR8's merge
criterion requires renaming a projection file, so the whole of it lives in Epic 47-04 where
the renderer exists. Splitting that criterion across two epics would have manufactured the
partial-coverage state recorded as self-hosting register entry 1.

## Write the deterministic dumper [plan]
**Story**: 1  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: FR8, NFR4, AD4

**Retro**: [Codebase discovery] Two of this story's byte-stability defects were invisible to the check that was supposed to find them, and both were found by widening the check rather than by reading the code. **First**, `orderingOf` fell back to the first UNIQUE index and picked `number_sequence_root`, which indexes `kind` alone — but both of that table's indexes are *partial*, splitting on `parent_id IS NULL`, so neither orders the whole table and the pair is the point (`009-numbering.sql`). Two rows sharing a `kind` had no defined order. It passed because the fixture held one row per kind. Partial indexes are now skipped and the last resort is every column. **Second**, `schema_version.applied_at` put the migration wall-clock into the dump, so two developers at the same commit differed in eleven rows forever — the conflict-on-every-commit failure NFR4 names, from the one table nobody thinks of as content. Both were hidden by the same weak check: "byte-stable across runs" was dumping *one* database twice, which is stable by construction. Building two databases independently, and migrating them at different times, is what made either visible.

**Retro**: [Codebase discovery] The spec's shadow-table rule — exclude "every object whose name begins with an FTS5 virtual table's name followed by `_`" — drops the FTS triggers when applied to every object type, because this project names them for the index they maintain (`document_fts_insert`, `_update`, `_delete`). A dump missing them restores every row into an empty index and reports success, which is the false pass the exclusion was written to prevent, produced by the exclusion itself. The spec's very next paragraph says triggers are what make the index reproducible without dumping it, so the two readings cannot both hold and only the table-scoped one does — shadow storage is always `type = 'table'`. Found by running the enumerator against the real schema on its first execution; reading the rule does not reveal it, because the sentence is correct about tables and silent about everything else.

**Acceptance Criteria**:

- The dump omits every shadow table of an FTS5 virtual table created in the test fixture and carries no hex blob, while keeping that table's own `CREATE VIRTUAL TABLE` statement — so restoring the file recreates the index as a consequence of the data rather than carrying it [integration]
- Every `INSERT` in the dump names its columns, and every table's rows are emitted in primary-key order [unit]
- Dumping the same database on two machines yields byte-identical `.sql` [integration]
- Dumping the same state repeatedly is byte-stable across runs and locales [integration]
- must NOT — the dumper delegates to `sqlite3 .dump`, which emits FTS5 shadow blobs, orders rows by insertion, and does not exist in `node:sqlite` [unit]
- must NOT — a table is skipped from the dump without the exclusion being declared and asserted, so a restored database is missing rows and reports success [integration]

### Enumerate dumpable objects from `sqlite_schema`, excluding `sqlite_%` and the FTS5 shadow tables
**Task**: 1.1  
**Description**: The exclusion is declared and asserted rather than implicit — that is what the no-silent-omission clause requires. The `CREATE VIRTUAL TABLE` statements are kept; their five shadow tables each are not. Derive the virtual-table names from `sqlite_schema` rather than from a list, so an index added later is excluded with no code change — which is also what makes this testable before `document_fts` exists: the fixture creates an FTS5 table of its own and the filter finds it the same way it will find the real ones.  
**Status**: Complete

### Emit schema first, with triggers created before any data
**Task**: 1.2  
**Description**: This is what makes the index reproducible without dumping it — restoring `document_section` fires `document_fts_insert` row by row. Covers the no-shadow-table criterion's second half.  
**Status**: Complete

### Emit rows as one column-named INSERT per row, ordered by primary key
**Task**: 1.3  
**Description**: AD9 is what makes "order by primary key" a total order on every table, including the association tables whose key is composite. Naming columns keeps historic dumps valid across a migration that adds one. The two tables with no primary key fall back to a declared ordering, and the fallback skips *partial* unique indexes — one that covers half a table orders the other half not at all.  
**Status**: Complete

### Write the fixed literal formatter and the LF / trailing-newline discipline
**Task**: 1.4  
**Description**: Covers byte-stability across machines and locales — no locale collation anywhere in the pipeline, no float shortening, integers in base ten. The machine-dependent value the schema actually contains is `schema_version.applied_at`, which is normalised to a fixed stamp and the substitution declared, since NFR4 says "no timestamps" and that ledger records when *this* install migrated.  
**Status**: Complete

### Write tests for Write the deterministic dumper
**Task**: 1.5  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`. The fixture creates a real FTS5 table, a real BLOB column and explicit ids, because the shipped schema has none of the three — every criterion here is true of a dumper that does nothing until something exists for it to get wrong.  
**Status**: Complete

---

## Restore a dump and prove it intact
**Story**: 2  
**Status**: Complete  
**Blocked by**: Story 1  
**Satisfies**: FR14

**Retro**: [Codebase discovery] **`PRAGMA foreign_keys` is silently ignored inside a transaction**, which makes the dump's own opening `PRAGMA foreign_keys=OFF` do nothing on the path this story builds. The spec reads as though that line is what makes a restore possible — "a `.sql` dump opens with `PRAGMA foreign_keys=OFF`, and it has to" — and it is, at a `sqlite3` shell where nothing wraps it. Applied inside the transaction this story requires, it leaves enforcement exactly as it found it and the first forward reference fails with `FOREIGN KEY constraint failed`, hundreds of statements from the cause. So the restorer sets the pragma before `BEGIN` and reads it back to confirm. Found by probing the interaction before building on it rather than after.

**Retro**: [Testing gaps] The forward-reference test passed against a restorer with this bug for as long as its ids were generated. A ULID is monotonic and fixtures create a parent before its child, so the parent's id is always lower and the dump never actually contains a forward reference — the test asserted that one existed by counting parented rows, which is true and not the same thing. Only explicit ids that sort child-before-parent construct the case. The same shape appeared twice more in this epic: primary-key ordering is indistinguishable from insertion order under generated ULIDs, and "the dump carries no hex blob" is vacuous while no column is declared BLOB. **Generated identifiers hide ordering bugs, and an absent feature makes its own guard untestable.**

**Acceptance Criteria**:

- A restore ending in `PRAGMA foreign_key_check` fails loudly on a dump carrying a dangling reference, naming the row [integration]
- A restored dump violating each register entry in turn is reported, one entry at a time, naming the rows [integration]

### Apply the dump in a transaction and let the triggers rebuild any derived index
**Task**: 2.1  
**Description**: No reindex step — a derived index arrives as a consequence of the data, which is why the dump emits triggers before rows. Scoped to applying the file; the checks that follow are Task 2.2. The two FTS indexes this property was written for are built by Epic 47-05, so what is asserted here is the mechanism against a fixture-created index rather than against `document_fts` by name.  
**Status**: Complete

### End the restore with `PRAGMA foreign_key_check` and the register sweep
**Task**: 2.2  
**Description**: Restore is the one connection where FR2 cannot hold, because a sorted dump is not in topological order and `document.parent_id` is self-referential. Neither check is optional and neither is the caller's to remember. Both run *before* the commit, so a restore that finds a violation rolls back rather than reporting a broken database it has just written.  
**Status**: Complete

### Write tests for Restore a dump and prove it intact
**Task**: 2.3  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`. The thirteen violating states moved to `tests/support/violations.js`, shared with Epic 47-01's live-database suite: the two stories make different claims about the same fixtures, and two copies of thirteen invariants drift the first time the register moves. Every per-entry assertion stayed with its own suite.  
**Status**: Complete

---

## Verify cross-story integration for Dump and restore
**Story**: 3  
**Status**: Complete  
**Blocked by**: Story 1, Story 2  
**Satisfies**: NFR4

**Retro**: [Criteria gap] **Byte-identity does not detect a consistent loss, which is why this story's must-NOT is a separate criterion and not a restatement of the first.** Excluding a trigger from the dump was mutation-tested here: the round trip stayed byte-identical, because the object is missing from both dumps equally and two identical wrong answers compare equal. What caught it was the object-and-row inventory taken either side of the trip. A round-trip criterion phrased only as "the bytes match" would have passed a dumper that silently dropped every trigger in the schema.

**Acceptance Criteria**:

- A database dumped, restored into an empty file, and dumped again produces byte-identical output to the first dump [integration]
- A dump taken before and after a no-op read produces identical bytes, so reading does not perturb dump order [integration]
- must NOT — a round trip loses a row, an index entry, or a trigger without failing [integration]

### Write integration tests for Dump and restore
**Task**: 3.1  
**Description**: The round-trip criterion is what earns this story. Stories 1 and 2 each satisfy their own criteria without ever being compared to one another — the same gap shape as Epic 47-01's DDL-versus-migration-runner divergence. The trip goes through a temp *file* and reopens the connection, since a `:memory:` target shares a process with its source and a reused handle can reproduce connection state rather than the bytes.  
**Status**: Complete

---

## Address review findings
**Story**: 4  
**Status**: Complete — applied by `/cpm:pivot` on 2026-08-08 from review 05  
**Blocked by**: —

**Acceptance Criteria**:

- Each critical and warning finding from review 05 scoped to this epic has been addressed
- Existing acceptance criteria on other stories continue to pass

### Fix: coverage matrix row 12 is bound to a story that does not exist
**Task**: 4.1  
**Description**: [critical] Row 12 of `47-02-coverage-dump-and-restore.md` names **Story 4** under `Covered by`. This epic had three stories when the review ran; the criterion — "A dump taken before and after a no-op read produces identical bytes, so reading does not perturb dump order" — sits on **Story 3**. The matrix's own mapping note repeats the error ("the criterion was already on Story 4"), so it is recorded twice and self-corroborating. Correct both the row and the note. A coverage row that cannot resolve to a story is retro 34's "green mark with nothing behind it" one column over: a roll-up either breaks on it or silently drops it, and a dropped row lowers the denominator rather than raising an error. Note that this remediation story is itself numbered 4 — the fix is to repoint row 12 at Story 3, not to let the new numbering make the stale citation accidentally resolve.  
**Status**: Complete — row 12 repointed to Story 3, mapping note corrected and the near-miss recorded

---

## Notes

### Self-hosting register — entries in this epic's scope

The register lives in Epic 47-01's Notes. No entry falls in this epic's scope; all four are
schema or seeding concerns owned by 47-01 and closable only by a spec change.

**One entry was reinforced by this epic's breakdown rather than added.** Entry 1 (partial
coverage indistinguishable from full) is what decided the merge tool's placement: keeping
FR8's merge criterion whole in 47-04 was preferred over splitting it across two epics,
precisely because the split would have produced a requirement that reads as covered in two
matrices while no single story delivers it.

### Requirements only partially covered by this epic

- **FR8** — the dump half only. The merge half is Epic 47-04.
- **FR14** — the restore-path checks only. The integrity tool itself is Epic 47-01 Story 6.

### FR9 left this epic on 2026-08-08, and the reason generalises

This epic used to carry one FR9 row asserting that search survives a restore, and Story 1's
first criterion named `document_fts` directly. **Neither table existed when the work started**:
`document_fts` and `entry_fts` are created by Epic 47-05 Stories 3 and 4, and 47-05 is M3 while
this epic is M1. The placement was deliberate rather than an oversight — 47-05's Notes record
the boundary and the reason for it, that the FTS objects arriving through the migration runner
make that epic the runner's first real customer — so the fix was to move the *criteria* to
where the tables are, not the tables to where the criteria were.

What stayed is the part this epic can actually prove. The dumper's obligation is to exclude
**any** FTS5 virtual table's shadow tables while keeping its `CREATE VIRTUAL TABLE` statement,
and to emit triggers before rows so a derived index is rebuilt by the data arriving. Both are
properties of the dumper, not of `document_fts`, and both are asserted against an FTS5 table
the test fixture creates. That is a stronger test than naming the real one would have been: a
filter written against a hardcoded name passes for `document_fts` and silently swallows the
next index somebody adds.

The relocated criterion is Epic 47-05 Story 6's, where the dumper and both indexes exist at
once — 47-05 waits on 47-04, and 47-04 waits on this epic. **Coverage matrix rows 11 and 12
became 10 and 11** when the old row 10 left; the mapping notes there were repointed in the same
edit, because a citation left to go stale would have resolved to a real row and the wrong one.
