# Coverage Matrix: The Indexed Prose Surface

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Epic**: docs/epics/47-13-epic-indexed-prose-surface.md  
**Date**: 2026-08-11

> **Verification rule**: Verification status (✓) is bound to criterion text. Any change to a story criterion or its spec mapping resets that row to unverified.

| # | Spec Requirement | Spec Text (verbatim) | Story Criterion (verbatim) | Covered by | Spec Test Approach | Verified |
|---|------------------|----------------------|----------------------------|------------|--------------------|----------|
| 1 | FR9 | "Which columns are indexed is derived from the schema and checked, never listed in prose." | "Every TEXT column in the schema carries a classification — *prose a person wrote that no other column can find the row by*, or not — with its reason, enumerated from `sqlite_schema` rather than from a list" | Story 1 | `[unit]` | ✓ |
| 2 | FR9 | "a stale entry is visible to anyone who reads the list against the schema, whereas a column nobody thought to add is visible to no one, and the search answers, ranks, and returns nothing" | "The classification covers the eight columns already indexed on the same terms as the ones that are not, and reconciles in both directions: an indexed column with no entry fails, and an entry for a column the schema no longer has fails" | Story 1 | `[unit]` | ✓ |
| 3 | FR9 (must NOT) | "A column holding prose a person wrote that no other column can find the row by is either indexed or carries a recorded reason it is not; a column that is neither fails the check." | "must NOT — a column is classified from its name or its declared type rather than from what it holds" | Story 1 | `[unit]` | ✓ |
| 4 | FR9 | "A column holding prose a person wrote that no other column can find the row by is either indexed or carries a recorded reason it is not; a column that is neither fails the check." | "Every column classified as holding prose is reachable by `search`, with all three triggers — insert, update-of-the-indexed-column, delete — on each newly indexed table" | Story 2 | `[unit]` | ✓ |
| 5 | FR9 | "a column nobody thought to add is visible to no one, and the search answers, ranks, and returns nothing" | "`audit_finding.summary` is searchable on the same terms as `finding.summary`, and `quick_criterion.text` on the same terms as `acceptance_criterion.text` and `story_criterion.text`" | Story 2 | `[integration]` | ✓ |
| 6 | FR9 | "The FTS index is maintained by the three triggers above, not by a reindex step." | "Rows written before the migration are searchable after it — the migration backfills, rather than relying on triggers that fire only on writes after them" | Story 2 | `[integration]` | ✓ |
| 7 | FR8 | "This is what makes the FTS index reproducible without dumping it: restoring `document_section` fires `document_fts_insert` row by row, and the index is rebuilt as a consequence of the data arriving." | "A restored database's `entry_fts` returns the same `MATCH` results as the source for a term held only in a newly indexed column" | Story 2 | `[integration]` | ✓ |
| 8 | FR9 | "A search can be scoped to one entity type or left open across all of them." | "The search tool's entity vocabulary gains each newly indexed table with no edit to the tool" | Story 2 | `[unit]` | ✓ |
| 9 | FR9 | "The FTS index is maintained by the three triggers above, not by a reindex step." | "Updating and deleting a row of each newly indexed table leaves `entry_fts` consistent with that table, asserted by the same `MATCH`-versus-`LIKE` comparison" | Story 2 | `[unit]` | ✓ |
| 10 | FR9 | "What search cannot do is stated alongside what it can" | "The search tool states, where the caller reads it, that there is no infix match, no stemming, and that `rank` is bm25 within one index so an unscoped query interleaves two rankings rather than ordering globally" | Story 3 | `[unit]` | ✓ |
| 11 | FR9 | "An empty result is therefore not evidence of absence, and no step in the corpus may treat it as one." | "The statement is asserted against the tool description the server actually exposes, not against a comment in the source" | Story 3 | `[unit]` | ✓ |
| 12 | FR9 | "Which columns are indexed is derived from the schema and checked, never listed in prose." | "Every column holding prose is either indexed or carries a recorded reason it is not, checked over the live schema at test time rather than against a transcribed set" | Story 4 | `[unit]` | ✓ |
| 13 | NFR6 | "Any condition that could produce a false pass — a constraint violation swallowed, a projection silently stale, a search index behind the data — reports and blocks." | "Entry #26's disposition names the test that asserts it" | Story 4 | `[unit]` | ✓ |
| 14 | FR9 (must NOT) | "Which columns are indexed is derived from the schema and checked, never listed in prose." | "must NOT — the reconciliation passes over an empty enumeration, so a schema read yielding no prose columns or no indexed columns reads as full coverage" | Story 4 | `[unit]` | ✓ |

## Notes

**Rows 1, 12 and 14 share a fragment** — *"derived from the schema and checked, never listed in
prose"*. It is the clause the epic turns on, and each row forbids a different way of failing it: a
classification that was transcribed (1), a check that reads a transcription (12), and a check that
derives correctly but over nothing (14). Merging them would let one ✓ stand for a rule that holds in
one of the three.

**Rows 3 and 4 share a fragment** for the same reason rows 2 and 3 of `47-12-coverage-body-reads.md`
do: the requirement states the rule once, and the two rows are the two directions of failing it —
classifying a column wrongly, and leaving a correctly classified column unindexed.

**Row 7 maps to FR8, not FR9.** The criterion is about the dump/restore round trip surviving a new
trigger set, which is FR8's subject; FR9 would be satisfied by an index that works in the live
database and vanishes on restore. This is the row that exists because of retro 33's observation that
a ULID decision silently invalidated `document_fts`.

**Rows 6 and 9 share a fragment.** The Data Model says index maintenance *is* the triggers, and the
two rows are the two things that claim makes true: nothing that already exists is missed (6), and
nothing that changes afterwards drifts (9). The backfill row is the one the sentence does not cover
on its own, which is why it is a criterion rather than an assumption.

**FR9's original criteria are not in this matrix.** They are delivered and verified under
`docs/epics/47-05-coverage-parity-and-search.md`; this covers only what the amendment of 2026-08-11
added, plus the one FR8 row the new triggers put at risk.
