# Coverage Matrix: Dump and Restore

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Epic**: docs/epics/47-02-epic-dump-and-restore.md  
**Date**: 2026-08-08

> **Verification rule**: Verification status (✓) is bound to criterion text. Any change to a story criterion or its spec mapping resets that row to unverified.

| # | Spec Requirement | Spec Text (verbatim) | Story Criterion (verbatim) | Covered by | Spec Test Approach | Verified |
|---|------------------|----------------------|----------------------------|------------|--------------------|----------|
| 1 | FR8 | A deterministic, sorted `.sql` dump is committed; the binary `.db` is generated and ignored. | Every `INSERT` in the dump names its columns, and every table's rows are emitted in primary-key order | Story 1 | `[unit]` | ✓ |
| 2 | FR8 | A deterministic, sorted `.sql` dump is committed | The dump omits every shadow table of an FTS5 virtual table created in the test fixture and carries no hex blob, while keeping that table's own `CREATE VIRTUAL TABLE` statement — so restoring the file recreates the index as a consequence of the data rather than carrying it | Story 1 | `[integration]` | ✓ |
| 3 | FR8 | Two branches that both add artefacts produce an ordinary text conflict (AD4). | Dumping the same database on two machines yields byte-identical `.sql` | Story 1 | `[integration]` | ✓ |
| 4 | NFR4 | The same database state produces the same `.sql` bytes on any machine, on any run — ordered rows, no timestamps, no locale dependence. | Dumping the same state repeatedly is byte-stable across runs and locales | Story 1 | `[integration]` | ✓ |
| 5 | NFR4 (must NOT) | ordered rows, no timestamps, no locale dependence | must NOT — the dumper delegates to `sqlite3 .dump`, which emits FTS5 shadow blobs, orders rows by insertion, and does not exist in `node:sqlite` | Story 1 | `[unit]` | ✓ |
| 6 | FR8 (must NOT) | A deterministic, sorted `.sql` dump is committed | must NOT — a table is skipped from the dump without the exclusion being declared and asserted, so a restored database is missing rows and reports success | Story 1 | `[integration]` | ✓ |
| 7 | FR14 | A verification tool reports orphans, dangling links, and each entry in the cross-row invariant register (Data Model), so a corrupted state is diagnosable without SQL. | A restore ending in `PRAGMA foreign_key_check` fails loudly on a dump carrying a dangling reference, naming the row | Story 2 | `[integration]` | ✓ |
| 8 | FR14 | each entry in the cross-row invariant register (Data Model) | A restored dump violating each register entry in turn is reported, one entry at a time, naming the rows | Story 2 | `[integration]` | ✓ |
| 9 | NFR4 | The same database state produces the same `.sql` bytes on any machine, on any run | A database dumped, restored into an empty file, and dumped again produces byte-identical output to the first dump | Story 3 | `[integration]` | ✓ |
| 10 | NFR4 (must NOT) | no timestamps, no locale dependence | must NOT — a round trip loses a row, an index entry, or a trigger without failing | Story 3 | `[integration]` | ✓ |
| 11 | NFR4 | The same database state produces the same `.sql` bytes on any machine, on any run — ordered rows, no timestamps, no locale dependence. | A dump taken before and after a no-op read produces identical bytes, so reading does not perturb dump order | Story 3 | `[integration]` | ✓ |

**Mapping notes.**

**The old row 10 left this epic on 2026-08-08, and rows 11 and 12 became 10 and 11.** It
mapped to **FR9** and asserted that a restored database's `document_fts` and `entry_fts` return
the same `MATCH` results as the source's. Neither table exists when this epic runs: both are
created by Epic 47-05 Stories 3 and 4, and 47-05 is M3 while this epic is M1. The criterion
moved with the row to **Epic 47-05 Story 6**, which is the first point where the dumper and both
indexes exist together — 47-05 waits on 47-04, and 47-04 waits on this epic. FR9 is therefore
no longer covered here at all, which the epic's Notes declare rather than leave to be inferred
from a missing row.

The renumbering is the part worth stating. Three notes below cited rows by number, and a
citation left to go stale would have resolved to a real row and the wrong one — the same
failure that made the stale Story 4 reference on what is now row 11 dangerous once a Story 4
existed. All three
were repointed in this edit, not after it.

**Row 11 was added on 2026-08-08** (as row 12), during the pivot that closed the self-hosting
register. It was not a cascaded change: the criterion was already on Story 3 and had no row,
found by a set comparison between each epic's criteria and its matrix's `Story Criterion`
column. It sits alongside row 9 and asserts the other half of byte-stability — row 9 says a
round trip is stable, row 11 says a read is not a write.

**Row 11 named Story 4 until review 05, and this epic had three stories.** The criterion has
always sat on Story 3; both the row and the note above said Story 4, so the error corroborated
itself and reading either one confirmed the other. Both are corrected here. The correction is
worth recording rather than making silently, because this epic now *does* have a Story 4 — the
remediation story the review generated — so from this point on the stale citation would have
resolved to a real story, silently, and to the wrong one. A dangling reference that later
becomes a valid reference to something else is the failure mode `coverage.story_criterion_id`
being a foreign key is meant to make unavailable, and it is the reason the fix repoints the row
rather than leaving the numbering to absorb it.

**What rows 3 and 4 rest on, since neither can be run as written.** "On two machines" and
"across locales" both name conditions a single process cannot produce, and a ✓ that quietly
means something narrower is the green mark with nothing behind it. What is asserted instead is
that no machine-varying input reaches the file, channel by channel: two databases *migrated at
different wall-clock times* dump identically (which is the difference two developers actually
have, and it failed before `schema_version.applied_at` was normalised); two independently built
corpora dump identically; row order comes from declared keys rather than storage order, proved
with ids that disagree with insertion order; and no `COLLATE` appears in any object's DDL while
no `toLocale*`, `localeCompare` or `Intl` appears anywhere in `dpm/src`. The locale claim was
additionally run empirically — the same corpus dumped under `C`, `en_US`, `de_DE`, `tr_TR` and
`sv_SE` yields one SHA-256 — but that run is a recorded probe rather than a suite test, because
a locale-spawning test skips itself on any machine lacking those locales and a test that skips
everything passes vacuously. The residue is a genuinely different machine: another CPU, Node
build or SQLite version. That part is `[target]`.

Rows 5 and 10 map their must-NOT clauses to **NFR4** because byte-stability is the property
both defend. Neither clause is quoted from the spec — both were proposed under the skill's
must-NOT suggestion path for data-integrity stories and accepted by Chris on 2026-08-08 — so
the Spec Text column holds the requirement text they attach to rather than a verbatim
must-NOT line the spec does not contain.

**Story 4's two criteria have no rows here, and that is declared rather than missed.** It is
the "Address review findings" story, which records repairs to this breakdown rather than
obligations drawn from the spec, so its criteria have no requirement to bind to. The
both-directions set comparison should expect exactly those two as an unmatched remainder.
