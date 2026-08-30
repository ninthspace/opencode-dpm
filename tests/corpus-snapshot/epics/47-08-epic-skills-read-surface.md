# Skills: Read Surface

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Date**: 2026-08-08  
**Status**: Complete  
**Blocked by**: Epic 47-04-epic-projection-guard-and-merge, Epic 47-05-epic-parity-and-search  
**Retro applied**: 37 · Codebase discovery · Applied — every one of the eight conversion stories opens by calling the reads its skill needs against the live surface before any SKILL.md is written; several here touch surfaces no conversion has exercised (`artifact`, `templates`, `library`), and a missing scope or an unbounded list is found there rather than in a half-written file  
**Retro applied**: 37 · Testing gap · Applied — a mutation surviving in a shape already seen once in this epic fixes `tests/support/` rather than adding a second per-story assertion; and, before Story 1, `valuedArguments` and `bindings` are audited against what a *read*-surface skill gets wrong — an unbounded list, a missing scope, a body flag — and widened once rather than after a survivor  
**Retro applied**: 37 · Pattern worth reusing · Applied — every read assertion carries the decoy the wrong query would also return (out-of-scope, retired, wrong parent), so a filter that does not exist is visible rather than passing on a fixture that could not have failed  
**Retro applied**: 37 · Testing gap · Applied — where a criterion is about what a reader gets, the assertion runs against the projection or the returned rows and not the row that was written; plus a sweep asserting every column these eight skills cause to be written actually renders somewhere, which generalises the audit `Recommendation` survivor  
**Inline change** (2026-08-10, before Story 1): the binding audit the second retro disposition called for was run, and it widened `bindings()` to the read surface. A write tool's binding already covered every *valued* argument the run supplied; a read tool's covered none, so an unbounded list, a missing `include_body` or a silently-defaulted `include_retired` bound to nothing. `bindings()` now checks reads against `READ_DECISIONS` — `limit`, `offset`, `include_body`, `include_retired`, `ready` — on the same rule: an argument the run supplies with a value is one the file has to name. The first probe, keyed on every argument any read *offers*, produced noise on 48 of 50 cells and was discarded; keyed on what the run actually passed it produced 8 distinct pairs and no noise.

56 of the 76 hits fell in four blocks that were near-verbatim across ten SKILL.md files, so the fix was extraction rather than ten edits: **Session Startup**, **Library Check** and **Retro Awareness** are now sections of `dpm/shared/skill-conventions.md`, each naming the read decisions its procedure depends on, and each skill keeps only its own part — what `state` holds, which scope keyword, where a category routes. `reachable()` in `tests/support/skills.js` splices **only the sections a skill cites** into the text the binding reads, so a skill that drops its citation loses the tools with it; verified by mutation against `spec`, which fails two tests without the citation. The remaining hits were real gaps and are now named in the files: `epics` and `spec` bound `list_requirement`, `retro` bounds `list_taxonomy`.

Milestone M4 (AD6). Eight of FR25's twenty-two skills, one story each. These consume rather
than produce, so the criteria shift: what matters is that each reads through a query instead
of a scan, and returns bounded results.

Six carry two criteria; `status` and `artifact` carry three, because each holds a specific
defect the conversion exists to remove — marker-grepping in one, the index-and-backlinks
pair that can disagree in the other. FR25's and FR3's mechanical checks sweep all eight
files on Story 9, per the pattern approved on 2026-08-08.

## Convert `status`
**Story**: 1  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: FR25, FR22  
**Inline change** (2026-08-10): the consumer walk found the two predicates criterion 2 names by
column had no clause anywhere. Both gated with Chris, both taken as recommended, and both are
derivations rather than declarations.

1. **`archived_at` became a `WHERE` clause on every document list.** `documentLists` gave each kind  
   `gated` and no `live`, so an archived epic came back like any other and the run had to drop it.  
   `live: 'archived_at'` now applies to all thirteen kinds, because archival is on `document` rather  
   than on any one of them. The clause form already existed; what did not was a *name* for opting  
   out of it — `include_retired` was hardcoded in `selectPage`. `includeFlag(column)` in  
   `src/tools/query.js` derives it: `retired_at` yields `include_retired`, `archived_at` yields  
   `include_archived`. Derived rather than declared because the two words are not interchangeable  
   here — a term is retired and refuses new rows, a document is archived and stays complete and  
   true — and one flag spelled either way would have a caller ask for one and receive the other.  
   The projection is untouched and still renders an archived document with its `**Archived**` field:  
   the record survives, the working set excludes it. `readiness.js` already excluded archived  
   documents from `ready`, so the two clauses agree rather than compete.
2. **The parent scope now follows parentage rather than numbering.** `documentLists` derived  
   `within: 'parent_id'` from `numbering`, conflating two independent questions: `retro`, `review`  
   and `product_brief` are all root-numbered *and* have parents, so all three could only be listed  
   unscoped. Story 5 of Epic 47-07 recorded this and left it; `status` is the second story to pay  
   for it, because "which completed epics have no retro" is its central recommendation. The scope is  
   now read from `document_kind_parent`, which already says which kinds have parents. Order still  
   follows `numbering`. `retro`'s triage step was updated in the same pass to scope its list.

**Retro**: Testing gap — **the three-direction binding is file-scoped by design, so it cannot guard
a per-step claim.** Deleting the sentence that bounds Phase 1's inventory reads survived every check
in the story: `bindings` asks whether the file names an argument the run passed, and Phase 3b names
`limit` for the coverage read, so the file answered yes on behalf of a phase that had gone silent.
This is the section-versus-line lesson (retro 37) in a third shape — not prose overriding a step,
but a *whole-file* check standing in for a step-level one. There is nothing to hoist: the fix is
that a claim about one phase is asserted on that phase's text. Worth stating because the binding
looks like it covers this and does not.

**Retro**: Codebase discovery — **`entityTools` drops nulls, so the waiver cannot be lifted**, and
the test had to be redesigned around it. The obvious proof that `retro_waived_at` is load-bearing is
to clear it and watch the recommendation appear; the clear is accepted, changes nothing, and reports
success. The sound shape is two epics differing in that column and nothing else. This is the third
story to hit the same surface — 47-07 Story 5 for observation retirement, Story 8 for the document
path — and it is the same finding carried forward since retro 36: nothing in dpm can un-retire, and
a caller cannot tell a refused clear from an applied one.

**Retro**: Pattern worth reusing — **`driveStartup` now switches three of its four blocks off**, not
one. `roster` was already optional; `session` and `retro` joined it because `status` is the first
skill that genuinely runs neither. A flag is a claim about the skill, checkable against its file in
both directions: driving a block the skill does not run demands it name tools it has no use for, and
switching off one it *does* run hides a missing call.

**Retro**: Codebase discovery — **a read-only skill has a checkable definition beyond its prose.**
`status` writes nothing, and the two halves that prove it are that no tool in `used` has `mutates`
set, and that no tool *named* in the file does either. The second is the stronger: the recorder can
only catch a run that reached for a write, where the file-level check catches one that made the
route available. Both are three lines and both generalise to the read-surface skills after this one.

**Acceptance Criteria**:

- A status run reports across specs, epics, stories and tasks from queries, with no directory walk and no file read [feature]
- Retro-waived and archived items are excluded by `WHERE` clauses over columns, not by grepping for markers [integration]
- The facilitation survives: an unrecognised status is still flagged rather than guessed and still counts as not-done, and the optional artifact is still never produced unless asked for and separately confirmed [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Rewrite the roll-up as queries over specs, epics, stories and tasks
**Task**: 1.1  
**Description**: `status` is the skill that most obviously wants a database — its entire output is an aggregate that markdown forces it to assemble by walking a tree.  
**Status**: Complete

### Replace marker greps with column predicates
**Task**: 1.2  
**Description**: Waived, archived and superseded are all `WHERE` clauses. `archived_at` is separate from `status` because a document is archived *and* complete, so neither predicate hides the other.  
**Status**: Complete — archived and waived converted; **superseded has no column to be a clause over**, `document.status` admitting only `pending` and `complete`. That is the finding carried forward from retro 36 and it is a spec-level call, so `status` flags a `status_note` reading like a status and counts the row by its column instead.

### Write tests for Convert `status`
**Task**: 1.3  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Convert `inspect`
**Story**: 2  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: FR25, FR13  
**Note** (2026-08-10): a parked design critique of CPM's `inspect` exists — that it is too
review-heavy and should characterise the change in repo context — and it was **not** acted on here.
It is a `/cpm:pivot` on CPM's own spec 42, not a conversion; spec 47 subtracts the storage layer and
leaves the skill's question alone. Recorded so a reader knows it was considered rather than missed.

**Retro**: Testing gap — **the scoped-versus-unscoped instruction is invisible to any run.** Both
shapes return the same rows on a fixture of any size a test will build, so the recorder cannot tell
`list_retro({parent_id})` from `list_retro({})` matched in the caller; rewriting the file to the
second survived every other check in the story. This is the second story running where the guard had
to be a phase-scoped prose assertion, and it is the *same* underlying fact as Story 1's survivor from
the other side: the binding sees which tools were called, never how they were scoped.

**Retro**: Testing gap — **a judgement the section exists for cannot be driven at all.** "Beware the
signal that cannot discriminate" is the reason the intent join is read rather than computed, and a
fixture where every file traces to one record returns the same rows as one where the mapping is
informative. Deleting the paragraph passed everything. Two of this story's ten mutations survived and
both were of this kind, which suggests the read-surface skills need a habit rather than a helper:
where a section states a judgement about the *shape* of an answer rather than about which rows to
fetch, assert its text, because there is no run to catch it.

**Retro**: Codebase discovery — **`list_artifact_document` is scoped only by `artifact_id`**, so
"which artifacts point at this document" has no route. `inspect` did not need it — reading what has
been published is `list_artifact` unscoped — but Story 5 converts `artifact`, whose whole subject is
that join, and it will. The reverse scope is one line in the same derivation Story 1 changed.

**Retro**: Pattern worth reusing — **the bound is asserted by making the answer change, not by
checking the argument.** The fixture holds twelve more requirements than one page, with a covered
requirement placed *past* the first page, so a run that took the default silently judges a set it
never saw and reports a clean sweep. `passed.get('list_requirement').has('limit')` says the argument
was supplied; only the paging fixture says it mattered.

**Acceptance Criteria**:

- An inspect run characterises a change against the planning graph through read tools, and its every list-returning call carries the tool's default `limit` [feature]
- The facilitation survives: the run still derives its axis before using it, still refuses to describe a suite as passing without having run it, and still reports what it did not read [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Rewrite characterisation against read tools, supplying the declared `limit` at every list call
**Task**: 2.1  
**Description**: The bound is a default that costs nothing to override, so the skill raises it where it needs more rather than working around its absence.  
**Status**: Complete

### Write tests for Convert `inspect`
**Task**: 2.2  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Convert `present`
**Story**: 3  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: FR25, FR2  
**Inline change** (2026-08-10, gated with Chris): **`artifact_document` is declared in `LISTS` with a
`document_id` scope**, which is Story 2's recorded finding brought forward one story because
criterion 2 needs it. Derivation takes the first column of a composite key — `artifact_id`, "what was
this artifact published from" — and a regeneration asks the reverse before it holds an artifact id at
all. Without the scope the check is a list of every artifact compared in the caller, so a project
with more artifacts than one page silently mints a duplicate: an unbounded scan producing the exact
outcome the criterion forbids. Both ends optional and ANDed, as on `dependency`.

**Note** (2026-08-10, gated with Chris): **dpm has no `communication` document kind**, and FR10's
parity list omits it too. A present run that is kept local — which CPM's own prohibitions require for
content issued in an organisation's name — therefore has nowhere to store its output, and the
converted skill says so rather than pretending otherwise. Story 3's criteria are written entirely
around the artifact and its join and neither names a communication document, so the gap is **carried
forward as a spec-level question** alongside `document.status` admitting only `pending`/`complete`,
both to be raised before Epic 47-09. Seeding the kind here was the alternative considered and
declined: the precedent for a migration inside a skills epic (47-07's `015-retro-waiver.sql`) rests
on a criterion requiring the column, and no criterion requires this one.

**Retro**: Codebase discovery — **the artifact table has no room for an unpublished communication.**
`url` and `published_at` are both `NOT NULL`, so the row cannot exist before there is a URL to put in
it. That is right for what `artifact` means and it is why the local-only branch stores nothing; it is
also why Story 5's "publishing updates the artifact row's URL in place" needs a second look, since
the row it updates cannot have predated the first publication.

**Retro**: Pattern worth reusing — **the decoy for a set operation is a source two artifacts do not
share.** `partial` is published from one of this run's two sources and `other` from neither, so a run
taking the union rather than the intersection has something to find and offers to overwrite a
communication that was never this one. Both failures — minting a second artifact and updating
somebody else's — are invisible on a fixture where every artifact shares every source.

**Retro**: Pattern worth reusing — **drive the same function against both sides of the branch.** The
regeneration clause has two halves, create and update, and they are one `run()` called against a
project where the artifact exists and one where it does not. Asserting only the update half would
pass a skill that always reuses the first artifact it finds.

**Retro**: Testing gap — **the intersection is a third judgement no run can hold**, after Story 1's
and Story 2's. The test computes the set operation itself, so the recorder sees the right answer
whatever the file says; only the prose assertion distinguishes union from intersection. Three stories,
three survivors of the same shape — the habit Story 2 proposed is now the settled practice for this
epic rather than a suggestion.

**Acceptance Criteria**:

- A present run resolves its sources through the artifact join rather than by reading an index file, and a source that does not exist is a foreign-key failure rather than a broken link [feature]
- The facilitation survives: the run still gates audience, then format, then draft in turn, and a regeneration over an existing artifact still offers update-in-place rather than silently minting a second one [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Resolve sources through the artifact join
**Task**: 3.1  
**Description**: A missing source fails at write time instead of being discovered by a reader following a dead link.  
**Status**: Complete

### Write tests for Convert `present`
**Task**: 3.2  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Convert `library`
**Story**: 4  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: FR25, AD7  
**Inline change** (2026-08-10, gated with Chris): **`document_section` gains `superseded_at`**, in a
new additive migration `018-section-supersession.sql`, with `live: 'superseded_at'` on the section
list and the matching filter on the projection's `sections` collection. CPM's `library consolidate`
reconciles the `## Amendment` blocks a retro appended and then **deletes** them; here they are
`document_section` rows and **dpm has no delete tool anywhere** — 172 tools, every one create, read,
update or list. A consolidation that reconciled and stopped would leave the document rendering the
same material twice. Marking rather than removing is what the rest of the schema already does
(`retired_at`, `archived_at`, `retro_waived_at`), a delete verb would be the first destructive
operation in the surface, and it would throw away the record `retro`'s write-back exists to leave
behind. The projection half is not optional: the column changes what a reader opens only if
`collection()` filters on it, and without that the tool surface would be right and the defect intact.
Two consequences recorded here: `integration.test.js`'s pinned target version moved 17 → 18, and
`include_superseded` joined `READ_DECISIONS` in `dpm/tests/support/skills.js`, because it fails
silently in exactly the way the other five do.

**Inline change** (2026-08-10, gated with Chris): **the summary becomes a `Summary` section and
`source` is recorded as a gap.** CPM's front-matter has six fields; dpm holds `title`, `doc_type` and
the `library_scope` rows, with `created_at` standing in for `added` and `updated_at` for
`last-reviewed`. The summary is genuinely prose under a heading and every Library Check already reads
every section with `include_body`, so a `Summary` at position 0 reaches every consumer with no schema
change. `source` is metadata rather than prose — a URL under a heading is a field parsed out of the
text by whoever needs it, which is the defect FR1 opens the spec with — so it is carried forward
rather than smuggled into a section.

**Note** (2026-08-10): **the batch front-matter workflow is deleted by construction, not dropped.**
It exists in CPM because a file can lack the block; here `doc_type` is `NOT NULL` and scope is a set
of rows, so a library document missing either cannot exist to be found and fixed. The converted file
says so rather than going quiet, and a test asserts it does.

**Retro**: Testing gap — **a fourth judgement no run can hold, and the first one where the *step*
and its *paragraph* diverged.** Rewriting Step 3's instruction from "each amendment that was folded
in" to "every amendment section" survived every behavioural check, because the test performs the fold
and supersedes what it chose whatever the file says. Closed with `instructions()` rather than
`prose()` — the numbered step is the rule and the paragraph beneath is why it is kept, and this
mutation reached one without the other, which is exactly the gap `instructions` was added for.

**Retro**: Codebase discovery — **a `live` column is three changes, not one.** The tool list, the
projection's collection descriptor, and the pinned schema version all had to move together, and only
the first is where the machinery lives. Story 1 added `live` to `document` and needed none of the
others because `archived_at` predated the projection's descriptor; a new column does not. Worth
knowing before Epic 47-09 adds any more.

**Retro**: Pattern worth reusing — **assert an exclusion in the units the run counts.** The scope
filter is checked on sections *consulted* rather than documents *seen*, because a run that ignored
`library_scope` entirely still consults a section and still returns something plausible. The same
reading closed a mutation in `seedStartup` two epics ago and it holds here for the same reason.

**Acceptance Criteria**:

- A library run reads `library_document` and `library_scope` rows, so the Library Check's scope filter is a `WHERE` clause rather than a front-matter parse [integration]
- The facilitation survives: a suggested scope is still presented for adjustment rather than applied, and the derived front-matter is still confirmed before the document is written [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Read `library_document` and `library_scope` rows
**Task**: 4.1  
**Description**: Scope is a set of rows, so a document scoped to three stages is three rows rather than a YAML array every consumer parses independently.  
**Status**: Complete

### Write tests for Convert `library`
**Task**: 4.2  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Convert `artifact`
**Story**: 5  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: FR25, FR1

**Inline change** (2026-08-10, gated with Chris): **`artifact` gains `retired_at` and
`retired_reason`**, in a new additive migration `019-artifact-retirement.sql`, CHECK-paired exactly as
`observation`'s are, with `live: 'retired_at'` on the artifact list. CPM strikes a superseded entry
through rather than removing it, and gives the reason — *"a register that silently drops entries
cannot answer 'what happened to that page?'"*. dpm had no column for that, so a converted review flow
would have offered two of its three actions. Marking rather than deleting is what the rest of the
schema does, and `includeFlag` derives `include_retired` with no further change. The reason column is
not decorative: *"superseded by the new explorer"* and *"the page is gone"* are the same date and
different facts, and only the second means the URL is dead.

**Inline change** (2026-08-10): **the register becomes a projection**, in a new
`src/projection/templates/artifacts.js` appended to `project()`'s output. It is the **first projected
file that is not a document**, which is why it cannot live in `TEMPLATES` — that registry's keys are
enumerated against `document_kind` in both directions, and an entry with no kind would break the
enumeration that exists to catch a missing template. It is written only when the project holds at
least one artifact, which is the empty-block rule `render` already applies one level down, and it goes
in after the refusal check so a corpus that could not be rendered still writes nothing at all. This is
the half that closes FR1: the register and the per-document **Published Artifacts** table are now two
renders of one row set, with nowhere to disagree.

**Note** (2026-08-10, gated with Chris): **`artifact` stays out of `entry_fts`, and the file says the
search is a scan.** The index covers `document_section` and five child tables; adding a sixth is an
FR9 change landing inside an FR25 story, and `entry-index.test.js` asserts the entity list in both
directions. The converted skill instead lists with a raised `limit` and matches in the run — honest at
a register's size and not at a corpus's — and states that plainly rather than implying a query.
Recorded for the FR9 index questions.

**Retro**: Codebase discovery — **a `retired_at` column is not the same thing as a vocabulary.**
`vocabulary-tools.test.js` enumerates every table carrying `retired_at` and demands a `retire_<table>`
verb, which was right while every such table was a roster something is offered *from*. `artifact` is a
record of what was published, as `observation` is a record of what was learned, and its update tool is
the intended path — so the enumeration grew a named exception set rather than a second literal list.
Worth knowing before any later story adds a sixth retirable table.

**Retro**: Pattern worth reusing — **name the new output in the count, do not bump the literal.** Four
assertions across three suites moved by one when the register joined the projection. Each was fixed by
asserting the register is present *and* that the remaining count still matches the documents filed,
rather than by editing a number — so a fifth output arriving later fails with the name of what changed
instead of an off-by-one.

**Retro**: Codebase discovery — **the projection had exactly one shape until now.** Every output was
one file per `document` row, and both the path rule and the orphan sweep are built on that. The
register fits without an exemption only because `orphans()` considers a filename carrying a seeded
kind and `index.md` carries none — verified by hand, not assumed. Any further non-document output
should check the same two places.

**Acceptance Criteria**:

- An artifact run writes one `artifact_document` row per link; the index file and the in-document backlinks are both projections of it, so the two cannot disagree [integration]
- Publishing updates the artifact row's URL in place, and a republish to the same file path resolves to the same row [feature]
- The facilitation survives: the run still refuses to invent any of an entry's facts, and a proposed name is still confirmed rather than assigned [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Write one `artifact_document` row per link
**Task**: 5.1  
**Description**: One relationship, one row.  
**Status**: Complete

### Make the index file and the in-document backlinks projections of that row
**Task**: 5.2  
**Description**: This closes the defect the spec's Problem Summary leads with — a bidirectional link kept honest by hand, where updating one side and forgetting the other produces no diagnostic. One join table has nowhere to hold a disagreement.  
**Status**: Complete

### Update the artifact row's URL in place on publish
**Task**: 5.3  
**Description**: A republish to the same file path resolves to the same row, which is what makes "keep the same link" a lookup rather than a convention the caller remembers.  
**Status**: Complete

### Write tests for Convert `artifact`
**Task**: 5.4  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Convert `templates`
**Story**: 6  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: FR25, FR6

**Inline change** (2026-08-10, gated with Chris): **`preview_document_kind` renders an example
through the real projection template.** Criterion 1 requires the preview to come from 47-04's
templates and nothing on the surface rendered one, so the only routes open to a converted skill were
a tool or a copy of the format written into its own prose — and the second is FR1's opening defect
one directory over, right the day it is written and silently wrong after the next template change.
The tool opens `start(':memory:')`, seeds one example of the kind **through the ordinary create
tools**, and returns `renderDocument`'s bytes. Building it in a scratch database rather than in a
rolled-back transaction is what makes `mutates: false` true at the storage level and not only at the
API: no row of the project is written, no counter moves, no trigger fires. The example corpus is
`src/preview/example.js`, one recipe per kind, and each carries **both sides of anything its template
renders differently** — a must and a must-NOT, a chosen and a rejected option, a met and an unmet
check — because a preview of the common case alone is a preview of half the format.

**Inline change** (2026-08-10, gated with Chris): **`document_kind` becomes readable and listable.**
Nothing exposed the kinds, so the `list` half had no route either and a converted skill would have
had to carry the thirteen in its own prose. `read_document_kind` is keyed on `kind`, which is the
table's primary key — the shape the vocabularies already have — and `list_document_kind` is one line
of `LISTS`. **The list was hand-rolled first and the suite refused it three ways over**: it ignored
its own default, reported no bound, and sat outside the tiebreaker check. That is the machinery
working as designed, and the correction is recorded as an observation rather than as a detail.

**Note** (2026-08-10): **the scaffold action and the structural/presentational split are deleted, not
converted.** CPM lets a project override a presentational template with a file under `docs/templates/`.
Here every rendered file is generated whole from rows and never read back (AD3), and the pre-commit
guard regenerates and compares bytes (AD8) — so an override would either be overwritten on the next
projection or fail the commit as divergence, and reading one first is the single thing the renderer
may not do. The converted file states the refusal with its reason and offers the library document as
what does work, because a run asked to customise a format will otherwise write a file nobody reads.
The story's criteria already name only `list` and `preview`.

**Retro**: Codebase discovery — **a hand-rolled list tool is a list tool exempt from every guarantee
`LISTS` makes.** The first cut of `list_document_kind` was written beside the preview and failed
three separate sweeps in `reading.test.js`. Declaring it in `LISTS` instead cost one line and picked
up the bound, the paging, the declared order, the response shape and the tiebreaker check. Worth
knowing before Epic 47-09 adds any more reads: the question is never "should this be paged" but
"which declaration does this belong in".

**Retro**: Criteria gap — **`document_kind` is the first list whose table cannot be crowded.** Two of
`reading.test.js`'s sweeps require more than fifty rows within reach of every paged tool, and the
kinds are a closed set of thirteen with no create tool and no business having one. The exemption is
named with its reason, is scoped to those two sweeps rather than to `paged`, and is paid for by a
dedicated test that drives the bound at a limit the table *can* exceed — plus a control asserting the
table is still small, so an exemption that outlives its reason fails rather than persists.

**Retro**: Pattern worth reusing — **assert a preview against the renderer, not against its shape.**
Criterion 1's whole content is that two things cannot drift, and a test checking the preview merely
*looked* like an epic would pass a stored skeleton — which is right on the day it is written, so
nothing else would notice either. Comparing the bytes with `renderDocument` over the same example,
for every kind rather than a representative one, is what makes the mutation fail.

**Acceptance Criteria**:

- A templates run renders its previews from 47-04's projection templates, so a template and its preview cannot drift [integration]
- The facilitation survives: both `list` and `preview` still complete in a single response with no gate, which is the one skill here whose facilitation is the absence of one [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Render previews from the projection templates rather than from a second copy
**Task**: 6.1  
**Description**: A preview generated from its own copy of the format is the artifact-index-and-backlinks defect again, one directory over.  
**Status**: Complete

### Write tests for Convert `templates`
**Task**: 6.2  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Convert `consult`
**Story**: 7  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: FR25, FR9

**Note** (2026-08-10): **no substrate change, and the one gap found is recorded rather than fixed.**
`review_agent` is pinned by composite foreign key to the `review` kind, so a `discussion` cannot
record who took part — CPM's discussion record carries an `**Agents**:` header line and there is no
column for it. **No criterion requires it**: the four here are the search tool, the facilitation, the
roster as a table, and the recovery must-NOT. So the converted file states the absence and forbids
the workaround — naming participants in the prose where it matters, never inventing a field for them,
because a relationship recorded in prose is FR1's opening defect. Carried forward as a spec-level
question. This is the third story in the spec to need no tool-surface addition.

**Retro**: Testing gap — **`bindings` is file-scoped, and this is the fourth story to lose a mutation
to that.** Dropping `include_body` from the search step's reads survived every check, because the
shared **Library Check** this skill cites names `include_body` for its own reads and the binding
greps the file. Closed with two step-scoped assertions, one per read that is answerable for it. The
pattern is now established enough to state plainly: **where a read's decision argument is named in
more than one place in a file, the binding cannot tell which step is answerable, and the step needs
its own assertion.**

**Retro**: Codebase discovery — **a fixture must reach a state through the surface that produces it.**
Seeding a retired persona by passing `retired_at` to `create_agent` was refused: retirement is a verb,
and the create tool does not take the column. The fixture reaches it through `retire_agent` instead,
which is both correct and stronger — a fixture that had written the column directly would have been
asserting against a state no run can produce.

**Retro**: Pattern worth reusing — **put the searched term where only one index can find it.** The
fixture holds `shard` on a single story criterion and says `partition` in every section body, so a run
reaching only `document_fts` comes back empty rather than plausible. The control runs the other way:
a search for `partition` reaches both indexes, which is what stops "found nothing" from being the
test's own doing.

**Acceptance Criteria**:

- A consult run retrieves prior context through the search tool rather than by reading files, and a term held only on a child row is reachable [feature]
- The facilitation survives: an inferred agent is still confirmed before the consultation begins, the voice is still rendered from that agent's stored traits without inventing beyond them, and the exit is still offered rather than assumed [feature]
- A consult run loads its roster from the `agent` table with no YAML parse, so a persona a project added and the plugin never shipped can be consulted by name with no plugin change and no file edit [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Retrieve prior context through the search tool, covering both indexes
**Task**: 7.1  
**Description**: The child-row half is the one that matters here — most of what a consult would look for is a requirement's or a finding's text, not a section body.  
**Status**: Complete

### Write tests for Convert `consult`
**Task**: 7.2  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Convert `party`
**Story**: 8  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: FR25, FR24

**Note** (2026-08-10): **no substrate change — the fourth story in the spec to need none.** The
consumer walk found every part of this conversion already built: `list_agent` carries the traits
behind `include_body`, `search` reaches both indexes, a section hit hands back the `document_id` its
whole document is listed by, and `create_discussion` allocates its own number. The participant gap
Story 7 recorded applies here unchanged and is not restated as a new finding — `review_agent` is
kind-pinned to `review`, so this file states the absence and forbids the workaround in the same terms.

**Note** (2026-08-10): **a defect found in the shared `Perspectives` procedure, recorded and not
fixed.** Its step 1 says `mcp__dpm__list_agent` loads a roster whose rows carry `personality` and
`communication_style`. They are body columns, so without `include_body` it does not, and a skill
following the procedure renders its voices off nothing — the exact failure this story's second
criterion forbids one skill over. It is left alone deliberately: its four consumers are `architect`,
`brief`, `discover` and `spec`, none of them among this epic's eight, and Epic 47-09 converts all
four. Carried forward as an eighth finding rather than fixed here, on the bar this epic has applied
throughout.

**Retro**: Testing gap — **a criterion about selection cannot be tested by one run.** "Agents are
still selected from the topic rather than fixed" reads identically in a file that says "choose by
role" and a run that always answers with the first three agents; every grep passes both. The test
drives the same run twice with different topics and requires the two casts to differ, which is the
only shape that separates them. **Where a criterion says *derived from the input*, the test needs two
inputs.**

**Retro**: Codebase discovery — **the shared `driveStartup` helper is not always the right way to
drive a startup.** It loads the roster with a bare `list_agent`, and this skill's load asks for the
body. Driving it through the helper would have satisfied every binding while asserting nothing about
the one argument the voices depend on, so the test passes `roster: false` and drives the call itself.
A shared helper that covers the common case is a decoy for a skill whose case is not the common one.

**Retro**: Pattern worth reusing — **the strongest roster fixture has an edge at each end.** One
persona the plugin never seeded, which must be offered, and one retired, which must not be and must
still read. Between them they catch a roster read from anywhere but the table: a file-backed run
finds the nine seeded personas and looks entirely correct until it is asked for the tenth.

**Acceptance Criteria**:

- A party run loads its roster from the `agent` table and reads the artifact under discussion through read tools, with no YAML parse and no roster file on disk [feature]
- The facilitation survives: agents are still selected from the topic rather than fixed, each voice is still rendered from that agent's stored traits alone, and the run still ends in a direction of travel rather than a transcript [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Load the roster from the `agent` table and the artifact through read tools
**Task**: 8.1  
**Description**: The lightest conversion in the corpus — `party` writes nothing and its facilitation is untouched. Until the pivot of 2026-08-08 "its roster" named no table: personas lived in `agents/roster.yaml` and `review_agent.agent` was free text, so this skill would have kept a YAML parse in a corpus whose whole thesis is that nothing parses files. The roster is now an FR24 vocabulary (Epic 47-01 Story 2), which is also what makes a project-added persona reach this skill without a plugin change.  
**Status**: Complete

### Write tests for Convert `party`
**Task**: 8.2  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Verify cross-story integration for Skills: read surface
**Story**: 9  
**Status**: Complete  
**Blocked by**: Story 1, Story 2, Story 3, Story 4, Story 5, Story 6, Story 7, Story 8  
**Satisfies**: FR25, FR3, FR13, NFR7

**Note** (2026-08-10): **the fourth criterion is the one that could not have been written as a
grep, and it is the reason this story exists.** Each conversion test proves its own skill reads
through tools; only deleting the tree those skills used to read proves it across all eight. The test
writes a real projection to a temporary root, drives the corpus reads, deletes `docs/`, drives them
again, then regenerates and compares — and carries a **control that genuinely depends on the tree**,
required to throw `ENOENT` once it is gone. Without that control, "identical either side" would be a
statement about a test that never touched the filesystem.

**Note** (2026-08-10): **the projection sweep carried here from Epic 47-07's retro landed a real
gap, and the gap was in the sweep's own strength.** Dropping `artifact.description` from the
register survived the entire suite: the column renders in two places — the register's *Why* column
and the **Published Artifacts** backlink table — so a corpus-wide "does this value appear anywhere"
search passes with either one deleted. Story 5's criterion 1 catches the backlink half (a mutation
removing that table fails it) and nothing caught the register half. The four `artifact` columns are
now pinned to `docs/artifacts/index.md` rather than to the corpus, which closes it. **A column with
two homes cannot be swept for at corpus scope.**

**Retro**: Testing gap — **"renders somewhere" is the wrong quantifier for a column with more than
one render.** It is the right one for a column with one, which is why the sweep keeps it as the
default and pins only where a second render exists. The general form: *a sweep asserting existence
across a corpus is blind to a duplicated fact losing one of its copies*, and the way to find that is
to mutate each render separately rather than to reason about the sweep.

**Retro**: Testing gap — **two of thirteen mutations landed on code the tests do not drive, and
both read as survivors.** `search` holds two query builders — a `UNION ALL` literal for the ordinary
case and a `one()` helper for the `entity:`-scoped case — and the first mutation hit the branch the
corpus reads never take. A survivor is only evidence once the mutation is known to have changed the
path under test; re-aiming both caught them immediately. **Check that the mutation reached the code
the test runs before recording it as a gap.**

**Retro**: Pattern worth reusing — **a delete-and-regenerate test needs a reader that dies.** The
control that reads a projected file and is asserted to throw after the deletion is what separates
"the skills do not read the tree" from "this test does not read the tree". The same shape applies to
any independence claim: assert the dependent thing breaks under the same operation.

**Acceptance Criteria**:

- None of the eight skill files contains a filename pattern under `docs/`, a glob, a number-allocation procedure, or a progress-file lifecycle [unit]
- None of the eight skill files contains a SQL keyword or a `sqlite3` invocation [unit]
- Every list-returning call any of the eight skills makes supplies or inherits a `limit`, asserted over the call sites [unit]
- Deleting the entire `docs/` tree and regenerating it leaves all eight skills producing identical output, since none of them reads it [feature]
- must NOT — a read skill reports an empty result where the data exists, because it queried one index or one table where the state spans two [integration]

### Write integration tests for Skills: read surface
**Task**: 9.1  
**Description**: The fourth criterion is the strongest available statement that the read surface is genuinely converted, and it is cheap to run: `docs/` is a projection, so deleting and regenerating it must be a no-op for a skill that only reads. Any skill still parsing a generated file fails it. The final clause guards the failure this epic is most exposed to — a query that returns nothing reads as "nothing to report" and raises no error.  
**Status**: Complete

---

## Notes

### Where the eight carried findings went

Added on 2026-08-10 by `/cpm:pivot`, after this epic completed. **No story, criterion or status
above is changed by it** — the record of what shipped stands; this says only where the questions it
raised were answered, so that the answer is not reachable solely through a deleted progress file.

Each of the eight came out of a conversion reaching for something the schema did not hold. Five
became spec amendments and are built by **Epic 47-09 Stories 8 and 9**:

| Finding | Raised by | Closed as |
|---|---|---|
| `document.status` admits only `pending`/`complete` | Story 1 (`status`), and retro 36's first recommendation | `superseded` and `withdrawn` on `document`, `story` and `task`, plus FR22 readiness treating them as unsatisfied |
| No `communication` document kind | Story 3 (`present`) | A fourteenth `document_kind`, so a local-only run has a store rather than a prohibition |
| `artifact.url` and `published_at` are both `NOT NULL` | Story 5 (`artifact`) | No schema change: `artifact` means *published*, and a draft is a `communication` |
| `library_document` has no `source` | Story 4 (`library`) | A nullable column, because the alternative is a `**Source**:` line parsed back out of prose |
| `review_agent` is kind-pinned to `review` | Story 7 (`consult`), unchanged by Story 8 (`party`) | `document_agent`, pinned by `CHECK` to `review` and `discussion` |

Two are not spec questions and are **Epic 47-09 Story 9's** work directly: the shared
**Perspectives** procedure loading the roster without `include_body`, and `documentTools`'s update
accepting a clear that changes nothing — the latter also entering the spec's false-pass register as
entry #15, since a call that reports success and changes nothing is the shape NFR6 exists to refuse.

The eighth stands: **`artifact` stays out of `entry_fts`**, so its search is a bounded list and a
match performed in the run. A register is tens of rows, and adding it to the index would be an FR9
change with no consumer asking for it.

### Self-hosting register — entries in this epic's scope

The register lives in Epic 47-01's Notes. **Entry 5** is in scope: `present` and `artifact`
both resolve references between documents, and body-prose references — the ones a stored number
would strand — are exactly what neither can resolve, because they are text and not rows. This epic does not close it and is not blocked by it; it is where the consequence first
becomes visible to a user.

No other entry is actionable here.

### Requirements only partially covered by this epic

**FR25** — eight of twenty-two skills. **FR3** — the skill-corpus half, for eight files.
Both complete only in Epic 47-09.

**FR13** — the call-site half. FR13's tool-side criteria, that every list tool declares a
`limit` with a raisable default, are Epic 47-03's. This epic asserts that the skills use it.
