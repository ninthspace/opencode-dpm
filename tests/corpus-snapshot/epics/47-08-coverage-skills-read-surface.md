# Coverage Matrix: Skills — Read Surface

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Epic**: docs/epics/47-08-epic-skills-read-surface.md  
**Date**: 2026-08-08

> **Verification rule**: Verification status (✓) is bound to criterion text. Any change to a story criterion or its spec mapping resets that row to unverified.

| # | Spec Requirement | Spec Text (verbatim) | Story Criterion (verbatim) | Covered by | Spec Test Approach | Verified |
|---|------------------|----------------------|----------------------------|------------|--------------------|----------|
| 1 | FR25 | each rewritten against the tool surface | A status run reports across specs, epics, stories and tasks from queries, with no directory walk and no file read | Story 1 | `[feature]` | ✓ |
| 2 | FR25 | no glob | Retro-waived and archived items are excluded by `WHERE` clauses over columns, not by grepping for markers | Story 1 | `[integration]` | ✓ |
| 3 | FR25 (must NOT) | no procedure that recovers an entity by reading what an earlier skill wrote | must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool | Story 1 | `[unit]` | ✓ |
| 4 | FR13 | every list-returning tool takes a `limit` with a default | An inspect run characterises a change against the planning graph through read tools, and its every list-returning call carries the tool's default `limit` | Story 2 | `[feature]` | ✓ |
| 5 | FR25 (must NOT) | no procedure that recovers an entity by reading what an earlier skill wrote | must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool | Story 2 | `[unit]` | ✓ |
| 6 | FR2 | an artifact link cannot point at a missing document | A present run resolves its sources through the artifact join rather than by reading an index file, and a source that does not exist is a foreign-key failure rather than a broken link | Story 3 | `[feature]` | ✓ |
| 7 | FR25 (must NOT) | no procedure that recovers an entity by reading what an earlier skill wrote | must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool | Story 3 | `[unit]` | ✓ |
| 8 | AD7 | the four kinds with structure to hold | A library run reads `library_document` and `library_scope` rows, so the Library Check's scope filter is a `WHERE` clause rather than a front-matter parse | Story 4 | `[integration]` | ✓ |
| 9 | FR25 (must NOT) | no procedure that recovers an entity by reading what an earlier skill wrote | must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool | Story 4 | `[unit]` | ✓ |
| 10 | FR1 | `cpm:artifact` maintains an index file *and* backlinks inside each source document — a bidirectional link kept honest by hand, where updating one side and forgetting the other produces no diagnostic | An artifact run writes one `artifact_document` row per link; the index file and the in-document backlinks are both projections of it, so the two cannot disagree | Story 5 | `[integration]` | ✓ |
| 11 | FR25 | Each of those is a tool call. | Publishing updates the artifact row's URL in place, and a republish to the same file path resolves to the same row | Story 5 | `[feature]` | ✓ |
| 12 | FR25 (must NOT) | no procedure that recovers an entity by reading what an earlier skill wrote | must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool | Story 5 | `[unit]` | ✓ |
| 13 | FR6 | The projection is a render, not a store (AD3). | A templates run renders its previews from 47-04's projection templates, so a template and its preview cannot drift | Story 6 | `[integration]` | ✓ |
| 14 | FR25 (must NOT) | no procedure that recovers an entity by reading what an earlier skill wrote | must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool | Story 6 | `[unit]` | ✓ |
| 15 | FR9 | a search that covers only sections misses the majority of what a user would look for | A consult run retrieves prior context through the search tool rather than by reading files, and a term held only on a child row is reachable | Story 7 | `[feature]` | ✓ |
| 16 | FR25 (must NOT) | no procedure that recovers an entity by reading what an earlier skill wrote | must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool | Story 7 | `[unit]` | ✓ |
| 17 | FR24 | agent personas are rows referenced by foreign key — seeded with defaults, extensible per project | A party run loads its roster from the `agent` table and reads the artifact under discussion through read tools, with no YAML parse and no roster file on disk | Story 8 | `[feature]` | ✓ |
| 18 | FR25 (must NOT) | no procedure that recovers an entity by reading what an earlier skill wrote | must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool | Story 8 | `[unit]` | ✓ |
| 19 | FR25 | no filename construction, no glob, no number allocation, no markdown parsing, no progress-file lifecycle | None of the eight skill files contains a filename pattern under `docs/`, a glob, a number-allocation procedure, or a progress-file lifecycle | Story 9 | `[unit]` | ✓ |
| 20 | FR3 | Every dpm SKILL.md contains no SQL keyword and no `sqlite3` invocation | None of the eight skill files contains a SQL keyword or a `sqlite3` invocation | Story 9 | `[unit]` | ✓ |
| 21 | FR13 | The bound is a default that costs nothing to override, not a limit. | Every list-returning call any of the eight skills makes supplies or inherits a `limit`, asserted over the call sites | Story 9 | `[unit]` | ✓ |
| 22 | FR25 (must NOT) | no markdown parsing | Deleting the entire `docs/` tree and regenerating it leaves all eight skills producing identical output, since none of them reads it | Story 9 | `[feature]` | ✓ |
| 23 | NFR7 (must NOT) | Every piece of state is reachable through a read tool without SQL | must NOT — a read skill reports an empty result where the data exists, because it queried one index or one table where the state spans two | Story 9 | `[integration]` | ✓ |
| 24 | FR25 | What remains is the facilitation — the questions, the gates, the judgement | The facilitation survives: an unrecognised status is still flagged rather than guessed and still counts as not-done, and the optional artifact is still never produced unless asked for and separately confirmed | Story 1 | `[feature]` | ✓ |
| 25 | FR25 | What remains is the facilitation — the questions, the gates, the judgement | The facilitation survives: the run still derives its axis before using it, still refuses to describe a suite as passing without having run it, and still reports what it did not read | Story 2 | `[feature]` | ✓ |
| 26 | FR25 | What remains is the facilitation — the questions, the gates, the judgement | The facilitation survives: the run still gates audience, then format, then draft in turn, and a regeneration over an existing artifact still offers update-in-place rather than silently minting a second one | Story 3 | `[feature]` | ✓ |
| 27 | FR25 | What remains is the facilitation — the questions, the gates, the judgement | The facilitation survives: a suggested scope is still presented for adjustment rather than applied, and the derived front-matter is still confirmed before the document is written | Story 4 | `[feature]` | ✓ |
| 28 | FR25 | What remains is the facilitation — the questions, the gates, the judgement | The facilitation survives: the run still refuses to invent any of an entry's facts, and a proposed name is still confirmed rather than assigned | Story 5 | `[feature]` | ✓ |
| 29 | FR25 | What remains is the facilitation — the questions, the gates, the judgement | The facilitation survives: both `list` and `preview` still complete in a single response with no gate, which is the one skill here whose facilitation is the absence of one | Story 6 | `[feature]` | ✓ |
| 30 | FR25 | What remains is the facilitation — the questions, the gates, the judgement | The facilitation survives: an inferred agent is still confirmed before the consultation begins, the voice is still rendered from that agent's stored traits without inventing beyond them, and the exit is still offered rather than assumed | Story 7 | `[feature]` | ✓ |
| 31 | FR25 | What remains is the facilitation — the questions, the gates, the judgement | The facilitation survives: agents are still selected from the topic rather than fixed, each voice is still rendered from that agent's stored traits alone, and the run still ends in a direction of travel rather than a transcript | Story 8 | `[feature]` | ✓ |
| 32 | FR24 | A persona added to a project's `agent` table is offered by `party`, `review` and `consult` with no plugin change and no file edit | A consult run loads its roster from the `agent` table with no YAML parse, so a persona a project added and the plugin never shipped can be consulted by name with no plugin change and no file edit | Story 7 | `[feature]` | ✓ |

**Mapping notes.**

**Row 32 arrived on 2026-08-09 from Epic 47-05's row 18, and `party` deliberately did not get one.**
FR24's persona sentence names `party`, `review` and `consult`, converting across two epics, so no
single row could carry it. 47-05 kept the tool half it verified; `review` became Epic 47-07's row
32; `consult` is this row. **`party` needed nothing new** — row 17 already asserts that a party run
loads its roster from the `agent` table with no YAML parse and no roster file on disk, and a roster
read from the table offers a project-added row by construction. A separate row would have asserted
the same behaviour twice, which is the drift this document exists to catch rather than to create.

**Rows 3, 5, 7, 9, 12, 14, 16 and 18 are the same clause against eight files**, for the
reason given in Epics 47-06 and 47-07: FR25's recovery clause is per-file.

**Row 10 maps to FR1, and its Spec Text is drawn from the Problem Summary rather than from
FR1's own sentence.** FR1 states the rule — every artefact type is a table, not a file parsed
at read time — and the Problem Summary states the specific defect this criterion removes.
The criterion is the only one in the breakdown that closes a defect the spec opens with, so
it is bound to that sentence.

**Row 22 is a proposed criterion, not a spec line.** Its Spec Text is FR25's "no markdown
parsing", which is what it enforces; the delete-and-regenerate method was written during
breakdown and accepted by Chris on 2026-08-08. It is worth its place because it is the only
criterion here that tests the whole subtraction behaviourally rather than by grep — a skill
can pass every grep and still hold a path it constructs at runtime.

**Row 23 maps to NFR7 and is proposed.** The failure it names — a query returning nothing,
read as "nothing to report", raising no error — is the false-pass shape NFR6 forbids
generally and NFR7 forbids for read reachability specifically. It is bound to NFR7 because
the fix is that the state be reachable, not merely that the failure be loud.

**Rows 24–31 were added on 2026-08-08 and are one per conversion story — this matrix had
none.** That is the largest single gap the retention sweep found, and it was concentrated
here for a reason worth recording: these eight skills mostly *read*, so a conversion that
rewrites the query and drops the judgement produces output that still looks right. `status`
that guesses at an unrecognised token still renders a board. `inspect` that calls a suite
passing without running it still writes a characterisation. Rows 1–23 would pass in both
cases, because every one of them asserts where the data came from.

**Row 29 is the odd one and is not a filler row.** `templates` facilitates by *not* gating —
`list` and `preview` complete in a single response — so its retention criterion asserts an
absence where the other seven assert presences. It is worth its place precisely because the
conversion pressure runs the other way: a skill being rewritten alongside seven that gate
acquires a gate by symmetry, and nothing else here would catch it.

**Rows 30 and 31 depend on the `agent` table from the second pivot of 2026-08-08.** Both say
a voice is rendered from that agent's *stored traits* and not invented beyond them, which was
unassertable while personas lived in `agents/roster.yaml` as text a skill could paraphrase.
The traits are now columns — `personality` and `communication_style` — so "rendered from the
row" is a comparison rather than a judgement.

**Partial coverage to flag.** FR25 is covered here for eight of twenty-two skills, FR3 for
eight of twenty-two files; both complete in Epic 47-09. FR13's rows here are the call-site
half, its tool-side half being Epic 47-03's — so FR13 also reads as partially covered in two
matrices.

**Row 17 remapped from FR25 to FR24 in the second pivot of 2026-08-08.** Its criterion said
`party` "loads its roster … through read tools", and until that pivot no table held a roster
— personas lived in `agents/roster.yaml` and `review_agent.agent` was free text. The row was
filed under FR25 because it read as one more skill conversion; what it actually asserts is a
vocabulary being reachable, which is FR24's. The schema half is Epic 47-01 row 81 and the
tool half is Epic 47-05 row 18, so FR24 is partially covered here too.
