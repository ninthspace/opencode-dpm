# Coverage Matrix: Skills — Authoring

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Epic**: docs/epics/47-07-epic-skills-authoring.md  
**Date**: 2026-08-08

> **Verification rule**: Verification status (✓) is bound to criterion text. Any change to a story criterion or its spec mapping resets that row to unverified.

| # | Spec Requirement | Spec Text (verbatim) | Story Criterion (verbatim) | Covered by | Spec Test Approach | Verified |
|---|------------------|----------------------|----------------------------|------------|--------------------|----------|
| 1 | FR25 | each rewritten against the tool surface | A discover run writes a problem brief document and its sections through create tools | Story 1 | `[feature]` | ✓ |
| 2 | FR25 | What remains is the facilitation — the questions, the gates, the judgement | The facilitation survives: the run still explores the problem before proposing, and still refuses to produce a brief from an unexamined premise | Story 1 | `[feature]` | ✓ |
| 3 | FR25 (must NOT) | no procedure that recovers an entity by reading what an earlier skill wrote | must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool | Story 1 | `[unit]` | ✓ |
| 4 | FR2 | An epic cannot name a spec that does not exist | A brief run writes a product brief whose `parent_id` names the problem brief, read through a read tool rather than resolved by slug matching | Story 2 | `[feature]` | ✓ |
| 5 | FR25 | What remains is the facilitation — the questions, the gates, the judgement | The facilitation survives: the run still gates on scope and still separates the problem from the proposed shape | Story 2 | `[feature]` | ✓ |
| 6 | FR25 (must NOT) | no procedure that recovers an entity by reading what an earlier skill wrote | must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool | Story 2 | `[unit]` | ✓ |
| 7 | AD7 | the four kinds with structure to hold | An architect run writes `adr` rows with `decision_status`, plus `adr_option` and `adr_option_tradeoff` rows — the options and their axes are columns, not prose the skill formats | Story 3 | `[feature]` | ✓ |
| 8 | FR14 | An accepted ADR carrying zero or two `chosen` options is reported (register #8) | Exactly one option per accepted ADR carries `chosen`, enforced at write time rather than by the integrity check finding it later | Story 3 | `[integration]` | ✓ |
| 9 | FR25 (must NOT) | no procedure that recovers an entity by reading what an earlier skill wrote | must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool | Story 3 | `[unit]` | ✓ |
| 10 | FR24 | Observation categories, finding categories, audit dimensions, severities, test approaches and **agent personas** are rows referenced by foreign key | A review run writes `review` with its `scope` and `scope_story_id`, `document_agent` rows referencing `agent` rows rather than carrying persona names as text, and `finding` rows with severity and category as taxonomy references | Story 4 | `[feature]` | ✓ |
| 11 | FR25 | no filename construction | A story-scoped review parents onto the epic and narrows by `scope_story_id`, rather than appending `-s2` to a filename | Story 4 | `[integration]` | ✓ |
| 12 | FR25 (must NOT) | no procedure that recovers an entity by reading what an earlier skill wrote | must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool | Story 4 | `[unit]` | ✓ |
| 13 | FR10 | An observation written against a story and later gathered into a retro retains its `story_id`, so its origin is still queryable | A retro run gathers `observation` rows already written against stories by setting `retro_id`, leaving `story_id` intact, so an observation's origin survives promotion | Story 5 | `[feature]` | ✓ |
| 14 | FR24 | retirable without invalidating rows that already use them | `learn` and `retire` set the retirement columns on the observation rather than editing a marker into prose; a retired observation is excluded from candidate gathering by a `WHERE` clause | Story 5 | `[integration]` | ✓ |
| 15 | FR25 (must NOT) | no procedure that recovers an entity by reading what an earlier skill wrote | must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool | Story 5 | `[unit]` | ✓ |
| 16 | FR24 | A severity row is rejected in a category slot, and an audit dimension in a severity slot, on `finding` and `audit_finding` alike | An audit run writes `audit_finding` rows whose dimension and severity are domain-scoped taxonomy references, rejected at write time if drawn from the wrong vocabulary | Story 6 | `[integration]` | ✓ |
| 17 | FR25 | What remains is the facilitation — the questions, the gates, the judgement | The facilitation survives: the run still separates its complete findings from its ranked executive summary | Story 6 | `[feature]` | ✓ |
| 18 | FR25 (must NOT) | no procedure that recovers an entity by reading what an earlier skill wrote | must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool | Story 6 | `[unit]` | ✓ |
| 19 | AD7 | the four kinds with structure to hold | A quick run writes a `quick` row with its `quick_criterion` rows and its single-category retro observation, all typed | Story 7 | `[feature]` | ✓ |
| 20 | FR25 | Each of those is a tool call. | Promotion to a completion record is a status update, not a rewrite of the file | Story 7 | `[feature]` | ✓ |
| 21 | FR25 (must NOT) | no procedure that recovers an entity by reading what an earlier skill wrote | must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool | Story 7 | `[unit]` | ✓ |
| 22 | FR25 | no filename construction, no glob, no number allocation, no markdown parsing, no progress-file lifecycle | None of the seven skill files contains a filename pattern under `docs/`, a glob, a number-allocation procedure, or a progress-file lifecycle | Story 8 | `[unit]` | ✓ |
| 23 | FR3 | Every dpm SKILL.md contains no SQL keyword and no `sqlite3` invocation | None of the seven skill files contains a SQL keyword or a `sqlite3` invocation | Story 8 | `[unit]` | ✓ |
| 24 | FR10 | An observation written against a story and later gathered into a retro retains its `story_id`, so its origin is still queryable | An observation written by `do`, gathered by `retro`, and promoted by `retro learn` retains its `story_id` through all three, so its origin is queryable from the library entry | Story 8 | `[feature]` | ✓ |
| 25 | FR24 | A severity row is rejected in a category slot, and an audit dimension in a severity slot, on `finding` and `audit_finding` alike | A review of an epic and an audit of the same epic write findings into two different tables with independently scoped vocabularies, and neither accepts the other's severity rows | Story 8 | `[integration]` | ✓ |
| 26 | FR25 (must NOT) | no markdown parsing | must NOT — a skill writes a `retired`, `waived` or `superseded` marker as prose rather than as a column | Story 8 | `[integration]` | ✓ |
| 27 | FR25 | no filename construction, no glob, no number allocation | An ADR is created as a child document of a spec, brief or discussion and renders inside its parent, with no number allocated and no path under `docs/architecture/` | Story 3 | `[feature]` | ✓ |
| 28 | FR25 | What remains is the facilitation — the questions, the gates, the judgement | The facilitation survives: the run still works one phase at a time, still explores trade-offs across options before choosing, and still gates each decision before writing it | Story 3 | `[feature]` | ✓ |
| 29 | FR25 | What remains is the facilitation — the questions, the gates, the judgement | The facilitation survives: agent selection still includes one reviewer challenging business value and one challenging technical approach, and the finding stage still reports comprehensively before the ranking stage curates | Story 4 | `[feature]` | ✓ |
| 30 | FR25 | What remains is the facilitation — the questions, the gates, the judgement | The facilitation survives: the four modes stay mutually exclusive, a `learn` still previews both the library entry and the retirement before either is written, and promotion still retires at the source in the same operation | Story 5 | `[feature]` | ✓ |
| 31 | FR25 | What remains is the facilitation — the questions, the gates, the judgement | The facilitation survives: a fix still has its root cause investigated and its diagnosis confirmed before any change is proposed, and implementation still refuses to begin without the written change description | Story 7 | `[feature]` | ✓ |
| 32 | FR24 | A persona added to a project's `agent` table is offered by `party`, `review` and `consult` with no plugin change and no file edit | A review run loads its roster from the `agent` table with no YAML parse, so a persona a project added and the plugin never shipped is offered to agent selection with no plugin change and no file edit | Story 4 | `[feature]` | ✓ |

**Mapping notes.**

**Row 32 arrived on 2026-08-09 from Epic 47-05's row 18, which could not verify it.** FR24's
persona sentence names `party`, `review` and `consult` — three skills converting in **two** epics —
so no single row anywhere could ever carry the whole of it. 47-05 built and verified the tool half
(a persona added to the `agent` table joins the roster in position, with no plugin change, no file
edit and no schema migration) and kept its row for that; `review` is this epic's, and this row is
its share. `consult` is Epic 47-08's row 32; `party` is that epic's row 17, which already said the
roster loads from the table with no YAML parse. Splitting rather than narrowing was deliberate:
rewriting the criterion until the built thing satisfied it would have deleted the skill-facing
promise instead of rehoming it.

**Rows 3, 6, 9, 12, 15, 18 and 21 are the same clause against seven files.** Same reasoning
as Epic 47-06's rows 3/6/9: FR25's recovery clause is per-file, and one sweep would pass
while a later file reintroduced the pattern.

**Row 8 maps to FR14, not FR25.** The criterion moves register #8 from *detected* to
*unwritable*, which is a claim about the register entry and not about the skill's shape. The
register check remains Epic 47-01 Story 6's — a restore can still bring a violation in, so
this row narrows the source and does not remove the check.

**Rows 4 and 11 map to FR2 and FR25 respectively, though both are about `brief` and `review`
not using filenames.** Row 4's substance is that parentage is enforced, which is FR2; row
11's is that a filename suffix stops being a scoping mechanism, which is FR25's subtraction
list.

**Row 26 is a proposed must-NOT, not a spec line.** CPM's three durable prose markers —
`**Retired**`, `**Retro waived**`, `**Superseded**` — are named in the shared conventions
rather than in this spec, so the clause was written during breakdown and accepted by Chris
on 2026-08-08. Its Spec Text is FR25's "no markdown parsing", which is the subtraction it
enforces.

**Row 27 was added by the pivot of 2026-08-08**, which made `adr` a kind with `dir IS NULL`.
It is appended rather than placed beside rows 7–9 so that rows 1–26, which Chris approved,
keep their numbers; the `Covered by` column carries the grouping, not the row order. It is
the one criterion in this matrix that deletes two of FR25's five subtractions in a single
skill, which is why it is bound to the subtraction clause rather than to FR10.

**Rows 28–31 were added on 2026-08-08 and complete this epic's retention coverage.** Three
of its seven conversion stories already carried a facilitation criterion — `discover`,
`brief` and `audit`, rows 2, 5 and 17 — and the other four did not, which is the whole of the
distinction: nothing about `architect`, `review`, `retro` or `quick` made them exempt. `retro`
is the one worth naming, because Story 5 was not criterion-less: it had two criteria that
both concern where the *data* goes. What neither asserts is that the four modes stay mutually
exclusive and that `learn` still previews before it writes, and a conversion that collapsed
them into one mode would have passed this matrix unchanged.

**Partial coverage to flag.** FR25 is covered here for seven of twenty-two skills, FR3 for
seven of twenty-two files. Both complete only in Epic 47-09. FR24's rows here are the
write-side use of vocabularies whose schema is Epic 47-01's and whose tools are Epic 47-05's
— three matrices, no single one showing FR24 satisfied.
