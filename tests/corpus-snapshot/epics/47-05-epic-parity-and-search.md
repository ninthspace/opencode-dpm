# Parity and Search

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Date**: 2026-08-08  
**Status**: Complete — all seven stories delivered and all twenty matrix rows verified; row 18's criterion was split on 2026-08-09, its skill-facing half rehomed to 47-07 and 47-08 rather than narrowed away, see Notes  
**Blocked by**: Epic 47-01-epic-substrate, Epic 47-03-epic-server-and-spine-tools, Epic 47-04-epic-projection-guard-and-merge  
**Retro applied**: 33 · Codebase discoveries · Applied — the ULID/FTS5 external-content break governs Story 3: `document_fts` is standalone, and the shape is checked against a live database before the triggers are written rather than after  
**Retro applied**: 33 · Patterns worth reusing · Applied — Stories 3 and 4 execute the migration against a live database after each batch of DDL, not at the story's test task; this epic is the migration runner's first real customer  
**Retro applied**: 35 · Complexity underestimates · Applied — no new count is written anywhere in this epic's output; Story 1's criterion reads `sqlite_master` and every summary and status line derives from the live schema rather than restating a total  
**Retro applied**: 34 · Patterns worth reusing · Applied — the epic/matrix criteria comparison runs in both directions before Story 1 starts, so a mismatch is a criterion to fix rather than a finding at the gate

Milestone M3 (AD6). Epic 47-03 gave the seven spine types their tools; this completes the
enumeration and makes the corpus searchable. The dependency on 47-04 is narrow and real —
Story 2's multi-category criterion and Story 6's parity closure both assert what the
projection renders.

**The `Blocked by` field above over-constrains this epic, and the excess is a milestone
inversion.** What this epic actually waits on is 47-04's **projection**, which is Stories 1
and 2 and is M2 work. It does **not** wait on 47-04 Story 4, the merge tool, which is M4 —
later in AD6's build order than this entire epic. Read literally, the field holds M3 behind
M4 for a third of the build. The field stays as it is because `Blocked by` is declared per
epic and 47-04 is the epic that spans two milestones (self-hosting register entry 2), so
there is nowhere in this format to say "Stories 1–2 of 47-04, not Story 4". Anyone sequencing
from the field should read this paragraph with it. FR22 is what removes the limitation once
dpm holds this corpus: a `dependency` edge's source and target may each be a document **or a
story**, so the narrow dependency becomes expressible and the inversion stops being something
a note has to carry.

## Give the remaining sixteen entity types create, read and update tools [plan]
**Story**: 1  
**Status**: Complete — both criteria are verified; the first was held over a stated remainder until Story 2 spent it, see Notes  
**Blocked by**: —  
**Satisfies**: FR10, FR1, FR27

**Acceptance Criteria**:

- Every table in `sqlite_master` has a create tool, asserted by comparing the live table list against the registered tool list — neither side is a hand-kept enumeration [integration]
- An observation written against a story and later gathered into a retro retains its `story_id`, so its origin is still queryable [unit]

### Write create, read and update tools for the ten remaining document kinds
**Task**: 1.1  
**Description**: Problem brief, product brief, ADR, review, retro, quick record, discussion, audit, runbook, library document. All are rows in `document`, so the tools differ by their `kind` pin and their detail table, not by their storage.  
**Status**: Complete — eleven kinds and not ten; `coverage_matrix` was the omission. The list is now read from `document_kind` rather than written here, so a seeded kind cannot arrive without tools again

### Write tools for the nine detail tables behind ADR, review, quick and library document
**Task**: 1.2  
**Description**: `adr` + `adr_option` + `adr_option_tradeoff`, `review` + `review_agent`, `quick` + `quick_criterion`, `library_document` + `library_scope`. AD7 gives these structure to hold; without tools that structure is write-only.  
**Status**: Complete — the four 1:1 tables are written by the document's own create tool in one transaction, since a document of these kinds without its detail row is legal by every constraint and readable by nothing

### Write tools for `finding` and `observation`
**Task**: 1.3  
**Description**: `observation` is the one with inclusive parentage — `story_id` is the origin and survives promotion into a retro, `retro_id` is the grouping. The update tool must not clear one to set the other.  
**Status**: Complete — `audit_finding` and `retro_application` were taken here too; they are the same shape and were named by no task

### Write tools for `artifact` and its document join
**Task**: 1.4  
**Description**: One join table replaces CPM's index-plus-backlinks pair. The tools write the row; the index file and the in-document backlinks are both 47-04 projections of it.  
**Status**: Complete

### Write tools for `milestone` and `document_milestone`
**Task**: 1.5  
**Description**: FR27's tool half — create a milestone scoped to a spec at a given position, and join an artefact to one. The join tool is where register #12 is enforced: the document and the milestone must belong to the same spec, which no foreign key can express because it needs `document.parent_id` walked to the root.  
**Status**: Complete — the walk is `ancestryOf`, reused rather than rewritten, so this refusal and the projection's filenames cannot disagree about which spec a document belongs to

### Enumerate the live table list against the registered tool list
**Task**: 1.6  
**Description**: Read the table list from `sqlite_master` and compare against what the server registered, in both directions — neither side is a hand-kept enumeration. This is what makes the boundary with Epic 47-03 non-load-bearing — see the Notes. It reads the set from the live schema, so it caught `milestone` the moment FR27 added it, without amendment.  
**Status**: Complete — `dpm/tests/parity.test.js`, in both directions and at two levels: tables, and the kinds a table-level check cannot see

### Write tests for Give the remaining sixteen entity types create, read and update tools
**Task**: 1.7  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete — `dpm/tests/entity-tools.test.js`; four mutations were driven through the source and reverted, and each failed only the test written for it

---

## Make every vocabulary extensible and retirable through tools
**Story**: 2  
**Status**: Complete — all five criteria verified; the fifth was split on 2026-08-09, its skill-facing half going to 47-07 and 47-08 rather than being narrowed away, see Notes  
**Blocked by**: Story 1  
**Satisfies**: FR24

**Acceptance Criteria**:

- A project-added category is usable without a schema migration [integration]
- An observation carrying two categories round-trips, and appears under both in the projection [integration]
- Retiring a test approach and a dependency kind leaves rows using them intact, as it does for a taxonomy row [unit]
- must NOT — any vocabulary is seeded and extensible but cannot be retired [unit]
- A persona added to a project's `agent` table joins the roster in position among the seeded personas, with no plugin change, no file edit and no schema migration [integration]

### Write add and retire tools for taxonomy rows, test approaches, dependency kinds and agents
**Task**: 2.1  
**Description**: Four vocabularies, one retirement semantic. Epic 47-01 Story 2 built the constraint; this makes it reachable without SQL, which is what "extensible per project" requires. The `agent` roster is the case that motivated FR24's evolution clause: CPM's `agents/roster.yaml` can only be overridden by replacing the whole file, so adding one persona means forking the whole roster and maintaining the fork. Append is the operation projects actually perform, and it is the one the file cannot express.  
**Status**: Complete — `dpm/src/tools/vocabulary.js`; retirement is its own verb rather than a column the update tool offers, and each vocabulary also gained the list tool a roster needs, see Notes

### Attach more than one category to an item through the join, and project both
**Task**: 2.2  
**Description**: An item may genuinely span two categories. The projection half is why this story depends on Epic 47-04.  
**Status**: Complete — the tool half is the three join tools; the projection half needed no code, because `observationsOf` and the retro template already render every category the join holds

### Write tests for Make every vocabulary extensible and retirable through tools
**Task**: 2.3  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete — `dpm/tests/vocabulary-tools.test.js`; three mutations were driven through the source and reverted, and each failed only the test written for it

---

## Index section bodies and maintain the index by trigger [plan]
**Story**: 3  
**Status**: Complete — both criteria verified; five mutations driven and reverted, one of which found a bug four other sweeps were resting on, see Notes  
**Blocked by**: —  
**Satisfies**: FR9, AD9

**Acceptance Criteria**:

- A section written with a ULID id is retrievable by `MATCH`, and `document_fts` declares no `content=` option — the external-content form rejects a non-integer rowid at write time [unit]
- Updating and deleting a section both leave the index consistent with the table, asserted by comparing a `MATCH` against a `LIKE` scan [unit]

### Write `document_fts` as a standalone FTS5 table carrying `section_id UNINDEXED`
**Task**: 3.1  
**Description**: Standalone, not external-content: `content_rowid` must be an integer and AD9 made every id a ULID, so the external form fails with `datatype mismatch` on the first section written. The criterion asserts the absence of `content=`, not just that search works.  
**Status**: Complete — `dpm/src/schema/012-search.sql`, the migration runner's first real customer; `heading` is indexed alongside `body` under Story 4's own column rule

### Write the insert, update-of-indexed-column and delete triggers
**Task**: 3.2  
**Description**: The triggers are the whole maintenance story — the table owns its content, so there is no `rebuild` to run and none to test.  
**Status**: Complete — named `document_fts_insert`/`_update`/`_delete` because `dump/objects.js` already reads those names; the coupling is recorded in `docs/maintenance/README.md` and asserted at both ends

### Write tests for Index section bodies and maintain the index by trigger
**Task**: 3.3  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`. The `MATCH`-versus-`LIKE` comparison is the assertion shape: it fails on a stale index where a bare `MATCH` would pass.  
**Status**: Complete — `dpm/tests/search-index.test.js`; the cascade case is asserted rather than left to the comment, because trigger-on-cascade is a property of the SQLite in use

---

## Index the prose held on child rows
**Story**: 4  
**Status**: Complete — both criteria verified; five tables and not four, and one mutation found a false pass no test had a subject for, see Notes  
**Blocked by**: —  
**Satisfies**: FR9

**Acceptance Criteria**:

- Every table `entry_fts` indexes has all three triggers — insert, update-of-the-indexed-column, delete — enumerated from `sqlite_schema`, with no table indexed by fewer than three [unit]
- Updating and deleting a row of each indexed child table leaves `entry_fts` consistent with that table, asserted by the same `MATCH`-versus-`LIKE` comparison [unit]

### Write `entry_fts` with an `entity` tag column and `entity_id UNINDEXED`
**Task**: 4.1  
**Description**: The tag is what makes `entity:requirement AND term` scope a search while an untagged query spans everything.  
**Status**: Complete — `dpm/src/schema/013-entry-search.sql`; `entity` is an indexed column so FTS5's own `entity:` syntax does the scoping, which is what lets one index serve five tables

### Write three triggers for each indexed table — `requirement`, `acceptance_criterion`, `observation`, `finding`
**Task**: 4.2  
**Description**: Twelve triggers. A column earns its place by holding prose a person wrote that no other column can find the row by; labels, statuses and enums stay out, being `WHERE` clauses and not search terms.  
**Status**: Complete — fifteen and not twelve: `story_criterion` is indexed too, because FR9's own enumeration reads "story criteria" and the task list named `acceptance_criterion`, see Notes

### Enumerate the indexed tables from `sqlite_schema` and assert three triggers each
**Task**: 4.3  
**Description**: A missing update trigger leaves the index behind the data while every search still returns something, so it is asserted structurally rather than behaviourally.  
**Status**: Complete — the indexed set is read off the triggers that reference `entry_fts`, so a table indexed without its full triple is still enumerated and then fails the count

### Write tests for Index the prose held on child rows
**Task**: 4.4  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete — `dpm/tests/entry-index.test.js`; four mutations, one of which passed and had to be closed before it could be reverted

---

## Search across both indexes through one tool
**Story**: 5  
**Status**: Complete — all three criteria verified; four mutations driven, one of which passed and could not be closed by any fixture, see Notes  
**Blocked by**: Story 3, Story 4  
**Satisfies**: FR9

**Acceptance Criteria**:

- A search returns ranked results, and the index reflects a write made in the same session [integration]
- A term appearing only in a `requirement.text` is found by an unscoped search, and the hit names the entity and row id [integration]
- must NOT — a search covers `document_section` only, so text held on a child row is unreachable while the tool reports success [integration]

### Query both indexes from one tool and merge ranked results
**Task**: 5.1  
**Description**: One tool, two indexes. A tool reading only `document_section` returns success while missing most of the searchable prose, which is the story's final clause.  
**Status**: Complete — `dpm/src/tools/search.js`; one `UNION ALL` over both indexes, and the merge is stated as an approximation rather than hidden, because `rank` is bm25 within one index and the two sides are scored on independent corpora

### Name the entity and row id on every hit, and accept a column-scoped `entity:` term
**Task**: 5.2  
**Description**: A hit that cannot be resolved back to a row is not a result. Scoping is what makes the tagged index usable rather than merely tagged.  
**Status**: Complete — the entity vocabulary is read off `entry_fts`'s triggers rather than written in the tool, so a table indexed by a later migration becomes scopable with no edit here; scoping is enforced conjunctive, see Notes

### Write tests for Search across both indexes through one tool
**Task**: 5.3  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`, including same-session write visibility.  
**Status**: Complete — `dpm/tests/search.test.js`; the resolve sweep calls `dpm_read_<entity>` on every hit rather than checking the two fields are present, because a hit naming an entity whose read tool refuses the id looks identical from outside

---

## Verify cross-story integration for Parity and search
**Story**: 6  
**Status**: Complete — all six criteria verified; three real defects found, each of which had passed 399 tests, see Notes  
**Blocked by**: Story 1, Story 2, Story 3, Story 4, Story 5  
**Satisfies**: FR9, FR10, FR24, NFR7, NFR6

**Acceptance Criteria**:

- Creating one row of every indexed entity type through its own tool, then searching a term common to all of them, returns a hit from every one — the tools and the triggers are built by different stories and nothing else runs them together [integration]
- A create tool refuses a vocabulary row retired through Story 2's retire tool, and the refusal names the retired item [integration]
- Every table, enumerated from `sqlite_master` and populated through its own tool, appears in the projection its kind renders into — or inside its parent's, for the ten that produce no file and for the ADR [integration]
- must NOT — a search returns a hit whose entity and row id do not resolve to a live row through that entity's read tool [integration]
- Every condition in the false-pass register has a test asserting it blocks rather than warns — including the six Epic 47-01 deferred, whose closing epics are all complete by the time this story runs [integration]
- A restored database's `document_fts` and `entry_fts` both return the same `MATCH` results as the source database's, for a term present in a section body and a term present only in a `requirement.text` [integration]

### Write integration tests for Parity and search
**Task**: 6.1  
**Description**: The third criterion is the parity closure: FR10's enumeration (Story 1) and FR10's templates (Epic 47-04 Story 2) are the same requirement checked in two epics, and this is the only place both are true at once. The final clause guards the seam NFR7 cares about — a search index drifted from the tables returns hits nothing can open.  
**Status**: Complete — `dpm/tests/parity-integration.test.js` over a corpus written only through tools (`support/tool-corpus.js`); four mutations driven and reverted, and the fixture itself found two of the three defects before any assertion was written

### Close the false-pass register
**Task**: 6.2  
**Description**: Epic 47-01 built the register as executable data in `dpm/tests/false-pass.test.js` and gave each of the twenty conditions exactly one disposition: a test that closes it, or the epic that will. Six carry the second kind — #9 to the dump path (47-02), #10 to the tool boundary (47-03), #4 to the projection guard (47-04), and #3, #15 and #16 to the search index built by this epic's Stories 3–5. This story is the first point in the build order where all four of those epics are complete, which is why the whole-register claim is declared here rather than at its author. Convert each of the six from a `closedIn` deferral to a `test` citation naming a test that exists, and the existing assertion that every deferral names where it closes then passes over an empty set — the register goes from complete and honest to satisfied. A condition converted without a test behind it is register entry #18's own shape applied to the register, so each conversion is mutation-checked the way 47-01 checked the other fourteen.  
**Status**: Complete — twenty of twenty now cite a test; six mutations driven at the guards themselves, and one citation was wrong and was found only that way, see Notes

---

## Address review findings
**Story**: 7  
**Status**: Complete — applied by `/cpm:pivot` on 2026-08-08 from review 05  
**Blocked by**: —

**Acceptance Criteria**:

- Each critical and warning finding from review 05 scoped to this epic has been addressed
- Existing acceptance criteria on other stories continue to pass

### Fix: the epic-level blocker inverts the milestone order
**Task**: 7.1  
**Description**: [warning] This epic is M3 and declares `**Blocked by**: … Epic 47-04-epic-projection-guard-and-merge`. Epic 47-04 spans **M2 and M4** — its merge tool is M4 work — so followed literally, M3 cannot start until M4's merge tool is complete, reversing AD6's build order for a third of the build. This epic's header note says the real dependency is narrow (Story 2's projection assertion and Story 6's parity closure, both against 47-04's M2 half), but nothing machine-readable records that and `cpm:do`'s readiness pass reads the field, not the note. Narrow the declaration to the stories it actually depends on, or record the milestone-half distinction where a reader of the field will find it. FR22 exists to make blocking a typed edge whose source and target "may each be a document or a story", and this is the case that needs it.  
**Status**: Complete — the inversion is now stated in the header beside the field, since the format cannot express the narrow edge

### Fix: `§332` resolves to the wrong passage
**Task**: 7.2  
**Description**: [warning] This epic's Notes say "Rather than fixing a number that the spec itself qualifies at §332". Spec line 332 is blank; the passage that qualifies the arithmetic — *"The arithmetic does not reduce to a subtraction…"* — is at line 345. One of five stale spec line-references across the breakdown; Epics 47-01 and 47-04 carry the others. Prefer a quoted phrase or a section heading to a line number.  
**Status**: Complete — repointed to the Data Model's parity-contract heading and its quoted sentence

---

## Notes

### The blocker no longer holds anything back

Task 7.1 above records the milestone inversion in this epic's `**Blocked by**` field — M3 held
behind M4 because Epic 47-04 spans two milestones and the field cannot name a story. **Epic
47-04 completed on 2026-08-09, so the field is now satisfied and the inversion is moot in
practice.** The paragraph in the header stays because the *format* limitation it describes is
real and will recur on the next epic that spans milestones; what has gone is its effect on this
one. Nothing here is waiting. Recorded from review 06, 2026-08-09.

### M2's checkpoint was reached and not taken — an open decision, not a defect

AD6 makes M2 "the earliest point where the design can be judged against real use", and says
that if M2 invalidates a decision, "that is the moment to find out". M2 is complete: Epic 47-03
gave the spine its tools and Epic 47-04 Stories 1–2 gave it a projection. **Nothing has yet
been planned through dpm.** Everything built so far is substrate whose only consumer is its own
test suite — AD10's conformance test closes the schema↔tool seam it was designed for, and no
check reaches the tool↔*use* one.

The real-use test exists and is Epic 47-09 Story 6, "Verify dpm holds its own planning corpus":
the last story of the last epic, behind 103 rows of skill conversion. That placement is
defensible — the corpus check needs the skills — but it means the cheap invalidation AD6
designed for has become an expensive one.

This is Chris's call and is recorded rather than decided. The options are to leave it (accept
that the first real use arrives at the end), to run a manual planning pass against the current
tool surface before Epic 47-06, or to move a reduced form of 47-09 Story 6 forward. Recorded
from review 06 (`docs/reviews/06-review-dpm-spec-47-progress.md`), 2026-08-09.

### Story 1's criterion passes over a remainder, and the remainder is Story 2's

The enumeration is built, mutation-checked and passing (`dpm/tests/parity.test.js`), and it passes
over eleven of the thirty-nine tables. **Row 1 of the coverage matrix was therefore left
unverified at the close of this story**, because the criterion says every table has a create tool
and seven of the eleven did not yet — marking it ✓ would have been the false pass NFR6 is about,
asserted by the story whose whole subject is enumeration. Story 2 spent the remainder; the section
below records what that left.

The eleven split two ways, and the split was decided from the live registry rather than from the
task list:

- **Seven are deferred to Story 2** — `taxonomy`, `agent`, `test_approach`, `dependency_kind`,  
  `observation_category`, `criterion_approach`, `story_criterion_approach`. They are FR24's  
  vocabularies and their joins, and retirement has to be enforced on write, which is Story 2's  
  semantic rather than one this story would half-build. Each entry carries that reason and is  
  **spent-checked**: the moment Story 2 registers `dpm_create_taxonomy` the entry is covered and  
  the assertion fails until it is deleted. Row 1 becomes unqualified at the same moment.
- **Four are standing exemptions.** `schema_version` (the migration runner writes it; a create tool  
  would let a caller declare a version the database does not have) and `number_sequence` (FR5  
  allocates and never accepts) were expected. **`document_kind` and `document_kind_parent` were  
  not, and are a decision taken during the work**: a kind's create tool is *named for the kind*, so  
  a kind added by a caller would have no tool and would fail this story's own kind-level check.  
  The pair is seeded structure — the parity contract the enumeration reads — rather than a  
  vocabulary the enumeration covers. Making document kinds caller-extensible would need a generic  
  `dpm_create_document(kind, …)`, which no requirement asks for.

### Three things the breakdown could not have known, found by running the criterion first

Recorded because each changed the work, and because the first two are the same defect in two
places.

**The task list under-enumerated its own criterion.** Eleven document kinds had no create tool
where Task 1.1 named ten — `coverage_matrix` was missing — and seven further tables were named by
no task at all. The fix is structural rather than editorial: the registry now reads the kinds from
`document_kind`, so a seeded kind acquires its three tools by being seeded and the list cannot be
short again.

**A table-level check cannot see a missing kind.** `document` had create tools throughout Epic
47-03 — `spec` and `epic` — while eleven kinds had none, so the criterion as written would have
reported the table covered. `parity.test.js` therefore checks at two levels, and drives the
pre-Story-1 registry through both to show which one catches it.

**`documentTools`' `child` boolean conflated two independent axes.** It read as "is
child-numbered" and was used as "takes a parent". `review` and `retro` are **root**-numbered and
both appear in `document_kind_parent`; built with `child: false` a review could not have recorded
what it reviewed. Parentage is now derived from the allow-list, which is the only source that
knows.

### Story 1's remainder is spent, and row 1 is now unqualified

Story 2 registered the seven deferred tables' create tools, the spent-check in `parity.test.js`
failed exactly as it was built to, and the seven entries are gone. What is left is the four
standing exemptions above. **Row 1 of the coverage matrix is marked verified as of Story 2**, which
is the mechanism working rather than a second judgement: the deferral could not outlive the work it
deferred to, so nobody had to remember to come back.

### A vocabulary nothing can enumerate is not extensible, and that took a list tool

Story 2's breakdown has three tasks and none of them says "list". Every vocabulary was reachable by
key — `dpm_read_agent({name: 'pm'})` — and by nothing else, which is enough to *store* a term and
not enough to *offer* one. FR24's "extensible per project" is a claim about what a project can
then use, and criterion 5's "offered by `party`, `review` and `consult`" has no dpm-side meaning at
all until something can answer "what personas does this project have". So the four vocabularies
gained list tools alongside their create and retire tools.

Two consequences worth stating, because both are rules rather than conveniences:

- **A retired term is left out by default, and `include_retired` asks for it.** Retirement's  
  guarantee is that existing rows survive and new ones are refused — so a roster that went on  
  offering a retired term would be handing a caller a choice the database will reject, and the  
  rejection would arrive at the write rather than at the choice. The term stays readable by key,  
  because a projection rendering a row written years ago still needs its display form.
- **`selectPage` gained its second named clause, and the third would need the same argument.** The  
  file exists to avoid being a query builder; `before` was admitted for FR11's age comparison and  
  `live` for this, each because a requirement asks for a shape no equality can express. Both are  
  named and closed. A general operator parameter is the thing being refused, not a fourth clause.

### Criterion 5 is verified as far as dpm reaches, and the rest is 47-07's and 47-08's

*"A persona added to a project's `agent` table is offered by `party`, `review` and `consult` with
no plugin change and no file edit."* Two halves, and only one of them is in this epic.

What is asserted here: a persona the plugin never shipped is added through `dpm_create_agent`,
appears in `dpm_list_agent` **in its position among the seeded personas rather than appended after
them**, and the DDL is byte-identical before and after — so the roster is a query and there was no
migration. A retired persona leaves the roster and the review it already sat on still renders
*Jordan (Product Manager)* rather than `pm`.

What is not: `party`, `review` and `consult` do not read this table yet. `review` is converted by
Epic 47-07 and `party` and `consult` by Epic 47-08.

**The criterion was split on 2026-08-09, and the shape of the fix matters more than the fix.** It
sat unverified because the sentence made two claims and only one of them was anybody's here. The
two obvious moves were both wrong. *Narrowing* it — rewriting the criterion until what was built
satisfies it — is the failure mode a coverage matrix exists to prevent, and it would have deleted
the skill-facing promise rather than relocating it. *Moving the row to 47-08* looks better and is
not: the sentence names three skills converting in **two** different epics, so 47-08's matrix would
have held a row it could not mark until 47-07 also landed, next to a row already covering `party`
alone.

So the sentence is now asserted in three places, each where someone can run it. The tool half stays
here — a persona added to the table joins the roster in position, with no plugin change, no file
edit and no schema migration. The skill half became a criterion on Epic 47-07 Story 4 (`review`)
and Epic 47-08 Story 7 (`consult`). Epic 47-08 Story 8 (`party`) already carried it: its criterion
says the roster loads from the `agent` table with no YAML parse and no roster file on disk, and a
roster read from the table offers an added row by construction — a fourth row would have asserted
the same thing twice.

FR24's persona clause is therefore covered across three matrices and complete in none, which is
self-hosting register entry 1's shape arriving for the second requirement in this epic. The
standing constraint was observed throughout: CPM is edited only as part of the epic under work, and
no skill file was touched — what moved is a criterion, not an implementation.

### The first virtual table broke four sweeps at once, and the guard against it was already wrong

`document_fts` is the first `CREATE VIRTUAL TABLE` this schema has ever held, and creating it
failed five tests that had nothing to do with search: the parity enumeration reported six tables
with no create tool (the index and its five FTS5 shadow tables), and two schema-wide sweeps
reported `document_fts.section_id` as an unconstrained `*_id` and `document_fts` as a table with
no primary key.

The cause is one line. `authoredTables` in `dpm/tests/support/introspection.js` was written in
Epic 47-01 *in anticipation* of this, and its docblock says it excludes "everything SQLite
maintains for itself or a virtual table" — while its filter carried a `t.name !== v` guard that
kept the virtual table and dropped only its shadows. Nothing caught it, because until this story
there was no virtual table for the wrong branch to return. **An exclusion written before the thing
it excludes exists is an exclusion nothing has run.** It is now `t.name === v || t.name.startsWith`,
and the mutation restoring the old form fails exactly those four tests and nothing else.

The parity enumeration was separately keeping its own copy of "every table", which is how it came
to disagree. It now delegates to `authoredTables`, so the six FTS tables are excluded by the
definition rather than by six exemptions that are not exemptions — an index is derived from the
table it indexes, and FR3's "the tool surface is the only write path" is about rows a person
authors.

**The external-content mutation is worth recording for its blast radius.** Switching
`document_fts` to `content='document_section', content_rowid='id'` — the form that avoids storing
the text twice — takes 80 tests down, not one: every dump, restore, round-trip, projection and
guard test fails, because the first section written raises `datatype mismatch` and nothing
downstream has a corpus. `CREATE VIRTUAL TABLE` accepts it. That is why the criterion asserts the
*absence* of `content=` rather than that search works, and why the test demonstrates the failure on
a throwaway connection instead of describing it.

### Story 4 indexes five tables, and the fifth is in FR9's own sentence

Task 4.2 names `requirement`, `acceptance_criterion`, `observation` and `finding`, and calls the
result twelve triggers. FR9's text names *"requirements, story criteria, retro observations,
review findings"* — and this schema has **two** kinds of criterion. `acceptance_criterion` is the
spec-side one; `story_criterion` is the one FR9's phrase actually says, and the task list has the
other. Both hold hand-written prose that no other column can find the row by, so both are indexed.
Fifteen triggers, and the requirement is satisfied under either reading rather than under a
choice nobody would have recorded making.

Deliberately still out, each for a stated reason rather than by omission: `document.title` and
`story.title` are labels a reader navigates by; `task.description` is prose scoped inside a story
already found; `adr.decision`, `quick_criterion.text` and `retro_application.note` are prose FR9's
enumeration does not name, and adding them is a decision for whoever needs them.

### A mutation that passed, and the false pass underneath it

Four mutations were driven through `013-entry-search.sql`. Three failed exactly the test written
for them. The fourth — replacing `coalesce(NEW.synthesis, '')` with `NEW.synthesis` in the
observation triggers — **passed the whole suite**, and that is the finding.

`a || NULL` is NULL in SQLite. An observation written against a story and not yet gathered into a
retro has no synthesis, so without the `coalesce` its entire indexed value is NULL: the row is
indexed as nothing, every search for its text returns nothing, and no step reports an error. NFR6
names that exact shape. It survived four tests because every observation the corpus created
carried a synthesis — the fixture only ever exercised the gathered half of a column that is
nullable precisely because the ungathered half exists.

The fix is a corpus row rather than a test: an ungathered observation now sits in the shared
fixture, so all seven `MATCH`-versus-`LIKE` sweeps cover it. Re-driven, the mutation fails five
tests. **A mutation that passes is worth more than one that fails** — it is the only kind that
finds a gap rather than confirming a guard, and it is the reason the mutation pass is run against
the source rather than reasoned about.

### The structural criterion catches what no behavioural sweep can

Story 4's first criterion enumerates the indexed tables from `sqlite_schema` and asserts three
triggers each. That reads as a restatement of the second criterion until it is driven: adding
insert and delete triggers for a **sixth** table — `task`, with no update trigger — leaves every
behavioural test green, because no `MATCH`-versus-`LIKE` sweep in the file knows `task` exists.
Only the structural pair names it. Which is the same asymmetry Story 1 found between its
table-level and kind-level checks, arriving a second time in a different disguise.

### A tie-breaker that cannot be shown to break a tie — and stays anyway

Four mutations were driven through `search.js`. Three failed exactly the tests written for them:
querying `document_fts` alone broke the must-NOT and both FR13 sweeps; removing the unknown-scope
refusal and collapsing the `document_section` scope onto `entry_fts` each broke the scoping test
and nothing else. The fourth — dropping `entity, entity_id` from the merged `ORDER BY`, leaving
`score` alone — **passed all 399 tests**, and unlike Story 4's it could not be closed.

It was probed rather than reasoned about. Cross-index ties do not arise at all: the two indexes are
separate corpora with separate IDF, so a section and an acceptance criterion holding *character-for-
character identical text* score `-1e-6` and `-9.47e-7`. Within one index ties are universal — sixty
rows, one distinct score — but they fall out in rowid order, and the key is a ULID, so the sorter's
order and the tiebreaker's order are the same order. Walks at limit 7 over 4,000 rows tile the match
exactly with the tiebreaker and without it.

So the tiebreaker buys nothing today. It stays because what it guards is SQLite's sort stability
being **incidental** — undocumented, and the only thing standing between a paged search and a hit
that appears on two pages. What changed is the claim: the test's comment asserted that without it a
tie "can fall differently at two offsets", which the mutation disproves for this build. The comment
now records the measurement, and the test asserts the contract that can be shown — that the returned
order is reproducible by the caller from `(score, entity, entity_id)`, a total key.

**The register of mutations should record the ones that pass and cannot be closed, not only the ones
that pass and can.** Story 4's `coalesce` was a genuine gap in the fixture. This one is a guarantee
with no observable face, and the honest disposition is to keep the guard, delete the false claim,
and say which is which — an unclosable mutation quietly dropped from the write-up reads afterwards
exactly like one that was never driven.

### Scoping is conjunctive because the alternative means two different things

`entry_fts` has an `entity` column and `document_fts` does not, and that asymmetry decides more than
it first appears. FTS5 will happily evaluate `entity:requirement OR helpers` against the entry
index; the same query cannot be written against the section index at all. Accepting it would give a
tool whose meaning depends on which index a scope happens to name — and every individual call would
look correct, which is the failure mode this epic keeps meeting in new clothes.

So `entity:` is enforced conjunctive: `entity:<name> AND <terms>`, either order, and anything else is
refused with the reason. Three refusals fall out of one rule — the disjunctive form, a scope with no
terms beside it (a listing, and `dpm_list_*` is the tool for that), and a scope naming something
nothing indexes. The last is the one worth having: FTS5 answers `entity:tsak AND helpers` with an
empty set, which a caller reads as "no matches" and is really "you named nothing".

The section scope is answered by lifting the term out and querying `document_fts` alone, which is
why the terms have to be parsed here rather than passed through — a query built for one index and
handed to the other errors, and an error swallowed at that seam is the must-NOT wearing a hat.

### Three defects that had each passed 399 tests, and why one story had to exist to find them

Story 6 is the story that runs other stories together, and the case for it being a story rather
than a gate is that it found three real defects — none of them findable one story earlier, and all
three green under the whole suite until the moment the composition was written.

**A retirement refusal reached the caller as *Internal error*.** `RAISE(ABORT, …)` carries only the
message the trigger wrote, and the tool layer's translation matched on `constraint|FOREIGN
KEY|UNIQUE|CHECK` — none of which appear in `retired: finding.category_id … references a retired
taxonomy row`. So every retirement abort fell through untranslated: a bare `Error` carrying
`ERR_SQLITE_ERROR` and no `rpc` code, which the MCP boundary renders as a server fault. The guard
was working perfectly and the report said dpm had broken. Story 2 built the guards, Epic 47-03
built the translation, and neither story's tests reach the other's code — `assert.throws` passes
against exactly this, which is why the criterion is now asserted on the error's *class and rpc
code* rather than on the fact of a refusal.

**The epic template rendered `**Blocked by**: —` for an edge that gates work.** It filtered on
`kind === 'blocks'`; `readiness.js` reads `dependency_kind.gates_work` and its docblock says in as
many words that "a query with `WHERE kind = 'blocks'`" is the thing to avoid. A project adding a
gating kind under FR24 therefore got a readiness query that held the story back and an epic file
that said nothing did. Both modules are internally consistent, both report success, and the reader
believes the file. Found by the fixture rather than by an assertion: the witness for
`dependency_kind` had nowhere to appear.

**The refusal named the column and never the item.** A trigger cannot name it — `RAISE` takes a
string literal — so a caller was left to work out what they had done by cross-referencing the
message against their own arguments. Completed at the tool boundary, where the values are.

The shape they share is worth more than any of them: **each is a seam between two stories that are
individually correct.** No amount of per-story rigour reaches it, because the defect is not in
either story. That is the argument for the cross-story story, and it is now three-for-three.

### The fixture had to be written through tools, and that is what found two of the three

`support/corpus.js` already builds a whole corpus and could not be used here. It writes eleven
document kinds and nine child tables by `INSERT`, which was right when Epic 47-04 wrote it — the
create tools covered the spine and nothing else — and is the wrong instrument for this criterion.
FR10 has two halves, "every table has a create tool" and "every kind has a template", and a fixture
that writes rows by statement satisfies the second while saying nothing about the first. The
closure needs one corpus that passed through both, so `support/tool-corpus.js` writes all
thirty-nine tables through nothing but tools.

Building it is what surfaced the defects, before a single assertion existed: the gating-kind bug
appeared as a witness with nowhere to render, and the integrity register's entry 9 refused the
restore because the fixture's `coverage.spec_fragment` was not a substring of its requirement's
text — the check working, and worth recording as such.

**Two witnesses are rendered table cells rather than words, and they have to be.** A coverage row
is made entirely of other tables' values, and its `spec_fragment` is *required* to be a substring
of the requirement's own text. So any word it holds is already in the spec file whether or not the
matrix rendered anything at all — the witness has to be the pipe-delimited cell, which only the
matrix produces. The same for `coverage_story`, whose story title would have been found in the epic
file with the matrix empty. **A witness that the wrong file can satisfy is a passing assertion about
nothing**, and it is invisible: the sweep is green either way.

### The register is satisfied, and one of its six citations was wrong

The six deferred conditions named four epics — 47-02's dump path, 47-03's tool boundary, 47-04's
projection guard, and this epic's search index — and this story is the first point in the build
order where all four are complete. Twenty of twenty now cite a test that exists.

A citation resolves a *name*. It cannot read what the test asserts, which is register entry #18's
own shape turned on the register, so each conversion was mutation-checked at the guard the condition
names. **That found one citation that was wrong**, and it was the obvious one: #9 is "a
non-deterministic dump", and the natural citation is `dumping the same state twice from independent
databases is byte-stable`. Dropping the `ORDER BY` from the dump's row select leaves that test
green — two databases built by the same statements in the same order hand back the same unordered
scan — while `rows are emitted in primary-key order regardless of the order they were written`
fails at once. Determinism is only observable where the inputs differ, so the citation has to be
the test that varies them. Nothing about the two names says which is which; only the mutation did.

The `closedIn` branch stays in the file with nothing using it. It is not dead code: the register
outlives this epic, and a twenty-first condition whose mechanism nobody has built yet needs
somewhere honest to sit. The assertion that every deferral names where it closes now passes over an
empty set — which is the register being satisfied, not the check being removed.

### A fourth defect, found and deliberately not fixed

`dpm/src/schema/retirement.js` carries its own copy of `authoredTables`, deliberately — the
duplication is the independence, and `tests/support/introspection.js` says so in as many words.
What it also carries is the **same bug** that copy had until Story 3: the shadow-table filter reads
`table.name !== v && table.name.startsWith(...)`, so a virtual table survives its own exclusion.
`vocabularyReferences` therefore walks `document_fts` and `entry_fts` looking for foreign keys.

It is inert, and the reason is structural rather than lucky: a virtual table cannot declare a
foreign key, so `PRAGMA foreign_key_list` returns nothing and no guard is generated either way.
That is also why it is recorded here instead of corrected — a fix would change no behaviour and
could carry no test that fails without it, which makes it a change with nothing holding it in
place. Worth knowing that the two copies have diverged, and worth fixing alongside the first thing
that gives it a consequence.

### The FTS tables arrive as a migration, not in the founding DDL

Stories 3 and 4 write both virtual tables and their fifteen triggers, and Epic 47-01 Story 1
writes "the DDL". The boundary is drawn here: the FTS objects are 47-05's, delivered through
the migration runner, which makes this epic the runner's first real customer. Epic 47-01
Story 8's DDL-versus-migration parity criterion covers them once they land, so the split
costs no assertion. Approved by Chris on 2026-08-08.

### Where the tables divide between this epic and 47-03

Epic 47-03 Story 2 covers seven spine types by name; this epic covers the rest. The count
does not resolve cleanly — `coverage` is both a `document_kind` and a child table, `brief` is
two kinds, and `session state` has a table built in 47-03 Story 6 without typed tools
enumerated there. Rather than fixing a number that the spec itself qualifies under **"The
kinds are seeded data, and the list is the parity contract"** in the Data Model — the
paragraph beginning *"The arithmetic does not reduce to a subtraction"* — Story
1's enumeration criterion reads the set from the live schema and fails on any member without
a tool. **The boundary is therefore not load-bearing**: however it is drawn, the enumeration
catches anything that falls between the two epics. This is the one place in the breakdown
where a partial split is safe, and it is safe only because the requirement was written as an
enumeration rather than a count.

Epic 47-03 said "the remaining fifteen" against this epic's "sixteen" until review 05. Both
are now sixteen — the Data Model's
*fourteen document kinds, nine child tables and two standalone tables*, less the spine's
seven — with the `session` qualification stated in 47-03 where the number appears, rather
than left to a reader to reconcile from a third note. **The phrase read *thirteen, eight and
two* when that reconciliation was done**, and the sixteen is the figure this epic delivered
against; the two types the pivot of 2026-08-10 added are Epic 47-09's to build, so the
subtraction is quoted here for its source rather than recomputed.

The pivot of 2026-08-08 removed the count from Story 1's criterion altogether: it now reads
the table list from `sqlite_master` and compares it against the registered tools, so no
number in this epic is load-bearing. Story 1's heading still says "sixteen" because it names
a scope split rather than an assertion, and the split is the thing this note declares safe.

### Self-hosting register — entries in this epic's scope

The register lives in Epic 47-01's Notes. **Entry 1** is in scope here in its most direct
form: FR10 is now claimed across three epics — 47-03 (spine tools), 47-04 (templates) and
47-05 (the remaining types) — and no single coverage matrix shows it satisfied. Story 6's
third criterion is the nearest thing to a fix available without a schema change, since it
asserts the enumeration and the templates together. It closes the *test* gap, not the
*storage* gap: dpm still cannot record that FR10 is covered in three places.

No other entry is actionable here.

### Requirements only partially covered by this epic

- **FR9** — fully covered here. This epic owns search.
- **FR10** — the create-tool half. Templates are 47-04; the spine tools are 47-03.
- **FR24** — the tool and extensibility half. The schema and retirement constraints are  
  Epic 47-01 Story 2.
