# Coverage Matrix: Skills — Spine

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Epic**: docs/epics/47-06-epic-skills-spine.md  
**Date**: 2026-08-08

> **Verification rule**: Verification status (✓) is bound to criterion text. Any change to a story criterion or its spec mapping resets that row to unverified.

| # | Spec Requirement | Spec Text (verbatim) | Story Criterion (verbatim) | Covered by | Spec Test Approach | Verified |
|---|------------------|----------------------|----------------------------|------------|--------------------|----------|
| 1 | FR25 | each rewritten against the tool surface | A spec run writes the document, its requirements with `class` and MoSCoW band, and its acceptance-criteria coverage rows, all through create tools | Story 1 | `[feature]` | ✓ |
| 2 | FR25 | What remains is the facilitation — the questions, the gates, the judgement — which is the part that was never the storage layer's business. | The facilitation survives: the run still gates on scope, still produces a testing strategy, and still refuses an untestable criterion | Story 1 | `[feature]` | ✓ |
| 3 | FR25 (must NOT) | no procedure that recovers an entity by reading what an earlier skill wrote | must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool | Story 1 | `[unit]` | ✓ |
| 4 | FR25 | no number allocation | An epics run allocates every epic number through the allocation tool, and writes stories, tasks, criteria and coverage rows through create tools | Story 2 | `[feature]` | ✓ |
| 5 | FR25 | no markdown parsing | The coverage matrix is a projection of `coverage` rows, not a file the skill writes — the skill emits no markdown table | Story 2 | `[integration]` | ✓ |
| 6 | FR25 (must NOT) | no procedure that recovers an entity by reading what an earlier skill wrote | must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool | Story 2 | `[unit]` | ✓ |
| 7 | FR25 | Each of those is a tool call. | A do run updates story and task status through update tools, and records verification by writing `coverage.verified_at`, so FR21's triggers govern it rather than the skill's own prose rule | Story 3 | `[feature]` | ✓ |
| 8 | FR22 | so "which epics are ready" is a query, a blocker's completion is visible to everything downstream | Story readiness comes from the dependency query, not from reading `**Blocked by**` lines | Story 3 | `[integration]` | ✓ |
| 9 | FR25 (must NOT) | no procedure that recovers an entity by reading what an earlier skill wrote | must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool | Story 3 | `[unit]` | ✓ |
| 10 | FR25 | no filename construction, no glob, no number allocation, no markdown parsing, no progress-file lifecycle | None of the three skill files contains a filename pattern under `docs/`, a glob, a number-allocation procedure, or a progress-file lifecycle | Story 4 | `[unit]` | ✓ |
| 11 | FR3 | Every dpm SKILL.md contains no SQL keyword and no `sqlite3` invocation | None of the three skill files contains a SQL keyword or a `sqlite3` invocation | Story 4 | `[unit]` | ✓ |
| 12 | FR25 | What makes a dpm skill different from its CPM counterpart is subtraction, and it is the same subtraction in every file | A spec written by `spec`, broken down by `epics`, and executed by `do` produces one connected graph — requirements to criteria to coverage to stories — with no step reading what the previous one wrote from disk | Story 4 | `[feature]` | ✓ |
| 13 | FR11 (must NOT) | The progress-file subsystem — session-suffixed filenames, hook injection, adoption on `--resume`, compact-summary companions — is replaced by a session table. | must NOT — a skill's progress state is a file rather than a `session` row | Story 4 | `[integration]` | ✓ |
| 14 | FR25 | What remains is the facilitation — the questions, the gates, the judgement | The facilitation survives: the run still gates on the epic grouping before writing any story, still carries every must-NOT the source spec states into a story criterion, and still refuses to attach a criterion it cannot trace to spec text | Story 2 | `[feature]` | ✓ |
| 15 | FR25 | What remains is the facilitation — the questions, the gates, the judgement | The facilitation survives: the retro-consumption gate still requires a disposition per observation rather than one blanket acknowledgement, and a story's verification gate still fires only once every implementation task under it is complete | Story 3 | `[feature]` | ✓ |
| 16 | FR29 | The plugin manifest therefore declares the server, and a test asserts the declaration names an entry point that exists. | The plugin manifest declares an MCP server whose entry point exists on disk and starts | Story 0 | `[integration]` | ✓ |
| 17 | FR29 (must NOT) | a failure that no test spawning the server over stdio can see, because that test supplies the launch the session does not | must NOT — the declaration is absent or names a missing entry point, and the suite still passes because every server test supplies its own launch | Story 0 | `[unit]` | ✓ |
| 18 | FR29 | tools are exported unprefixed (`create_spec`, `list_requirement`) and called as `mcp__dpm__create_spec`. That is what an FR25 skill writes | Every tool name a dpm SKILL.md writes is `mcp__dpm__` followed by an exported tool name, resolved against the live registry | Story 0 | `[unit]` | ✓ |
| 19 | NFR5 | Names must therefore be searchable words (`create_epic`, not `ce`, reaching a session as `mcp__dpm__create_epic` per FR29) | Every exported tool name matches `[a-z]{3,}(_[a-z]{3,})*`, and every part after the verb is a table name, a column name, or a seeded `document_kind.kind` value — checked against the live schema, not against a hand-kept word list | Story 0 | `[unit]` | ✓ |
| 20 | NFR5 (must NOT) | Carrying the prefix in the export as well would yield `mcp__dpm__dpm_create_spec` — the server's identity stated twice | must NOT — an exported name carries the server's own identity as a part, which the harness prefix already supplies | Story 0 | `[unit]` | ✓ |
| 21 | FR4 | whether a story is planned before it is executed [is a] typed column constrained by `CHECK` | A story written with `plan` set reads back with it set, and its title is unchanged — the mark is a column and never a suffix on the title | Story 0 | `[integration]` | ✓ |
| 22 | FR4 | Nothing infers a type by parsing an identifier — including from a marker inside a title | A story the run marks for planning is written with the `plan` argument set, and its title carries no marker | Story 2 | `[feature]` | ✓ |
| 23 | FR4 | Nothing infers a type by parsing an identifier — including from a marker inside a title, which is where CPM keeps a story's `[plan]` mark | A do run reads whether to enter plan mode from the story's `plan` column, not from a marker in its title | Story 3 | `[feature]` | ✓ |

**Mapping notes.**

**Rows 3, 6 and 9 are the same spec clause asserted against three different files.** That is
deliberate rather than redundant: FR25's recovery clause is per-file, and what each skill
would wrongly read back differs — `spec` would re-read a requirement list, `epics` a
coverage matrix, `do` a `**Blocked by**` line. One test over three files would pass while a
fourth skill added later reintroduced the pattern.

**Row 8 maps to FR22, not FR25.** The criterion is the readiness query being the source of
truth, which is FR22's own subject. FR25 requires the skill not to parse; FR22 requires
there to be something better to do instead, and this row asserts the second.

**Row 11 is FR3's skill-corpus half, and it is the one place a grep is the requirement
rather than a proxy for it** — the spec says so directly. This epic covers three of the
twenty-two files; Epic 47-09 covers the corpus.

**Row 13 maps to FR11 as a must-NOT the spec does not state in that form.** FR11's own
criterion (Epic 47-03 row 17) asserts the session row works; this asserts no skill kept a
file alongside it. Proposed during breakdown and accepted by Chris on 2026-08-08.

**Rows 14 and 15 were added on 2026-08-08, and are appended rather than placed beside rows
4–9 so the numbers Chris approved keep their positions** — the `Covered by` column carries
the grouping, not the row order. Only Story 1 carried a retention criterion when this matrix
was written, which made `spec` look like the exception rather than the pattern; four of the
breakdown's twenty-two conversion stories had one. They bind to a new FR25 criterion added
the same day, because FR25's requirement text stated the retention clause while none of its
four criteria asserted it — the shape review 05 caught at FR26.

**Rows 16–23 were added by the pivot of 2026-08-09**, appended for the same reason rows 14–15
were: the `Covered by` column carries the grouping. Rows 16–21 are Story 0, the story the pivot
created; 22 and 23 are the two criteria it added to Stories 2 and 3.

**Rows 19 and 20 restate NFR5 against a pattern Epic 47-03 row 14 also asserts.** That is a
supersession rather than a duplicate: 47-03's row was verified against `dpm_[a-z_]{6,}`, which
FR29 replaced, so its ✓ was cleared by this pivot and the live assertion moved here. Both rows
exist because 47-03 still owns the *rule* — that every part after the verb is schema vocabulary —
and this epic owns the *pattern* the rename settled.

**Row 22 is Story 2's and row 23 is Story 3's, and the pair is the point.** A column nothing
writes and nothing reads is a column, not a capability; each half is asserted where the skill
that performs it is converted.

**Partial coverage to flag.** FR25 is covered here for three of twenty-two skills. Its
corpus-wide criteria are Epic 47-09's, and FR25 will read as partially covered in four
matrices — the largest instance of self-hosting register entry 1 in this breakdown.
