# Coverage Matrix: Parity and Search

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Epic**: docs/epics/47-05-epic-parity-and-search.md  
**Date**: 2026-08-08

> **Verification rule**: Verification status (✓) is bound to criterion text. Any change to a story criterion or its spec mapping resets that row to unverified.

| # | Spec Requirement | Spec Text (verbatim) | Story Criterion (verbatim) | Covered by | Spec Test Approach | Verified |
|---|------------------|----------------------|----------------------------|------------|--------------------|----------|
| 1 | FR10 | Every table in `sqlite_master` has a create tool, asserted by comparing the live table list against the registered tool list — neither side is a hand-kept enumeration | Every table in `sqlite_master` has a create tool, asserted by comparing the live table list against the registered tool list — neither side is a hand-kept enumeration | Story 1 | `[integration]` | ✓ |
| 2 | FR10 | The list and every vocabulary in it are taken from a real CPM project's `docs/` tree, not from CPM's documentation — the two disagree. | An observation written against a story and later gathered into a retro retains its `story_id`, so its origin is still queryable | Story 1 | `[unit]` | ✓ |
| 3 | FR24 | seeded with defaults, extensible per project | A project-added category is usable without a schema migration | Story 2 | `[integration]` | ✓ |
| 4 | FR24 | An item may carry more than one category where the work genuinely spans two. | An observation carrying two categories round-trips, and appears under both in the projection | Story 2 | `[integration]` | ✓ |
| 5 | FR24 | retirable without invalidating rows that already use them | Retiring a test approach and a dependency kind leaves rows using them intact, as it does for a taxonomy row | Story 2 | `[unit]` | ✓ |
| 6 | FR24 (must NOT) | Observation categories, finding categories, audit dimensions, severities and test approaches are rows referenced by foreign key — seeded with defaults, extensible per project, and retirable | must NOT — any vocabulary is seeded and extensible but cannot be retired | Story 2 | `[unit]` | ✓ |
| 7 | FR9 | Artefact bodies *and* the hand-written text on their child rows — requirements, story criteria, retro observations, review findings — are indexed with FTS5 | A section written with a ULID id is retrievable by `MATCH`, and `document_fts` declares no `content=` option — the external-content form rejects a non-integer rowid at write time | Story 3 | `[unit]` | ✓ |
| 8 | FR9 | The FTS index is maintained by the three triggers above, not by a reindex step. | Updating and deleting a section both leave the index consistent with the table, asserted by comparing a `MATCH` against a `LIKE` scan | Story 3 | `[unit]` | ✓ |
| 9 | FR9 | a search that covers only sections misses the majority of what a user would look for | Every table `entry_fts` indexes has all three triggers — insert, update-of-the-indexed-column, delete — enumerated from `sqlite_schema`, with no table indexed by fewer than three | Story 4 | `[unit]` | ✓ |
| 10 | FR9 | A search index that lags a write returns a result set missing the thing just written, and reports success | Updating and deleting a row of each indexed child table leaves `entry_fts` consistent with that table, asserted by the same `MATCH`-versus-`LIKE` comparison | Story 4 | `[unit]` | ✓ |
| 11 | FR9 | are indexed with FTS5 | A search returns ranked results, and the index reflects a write made in the same session | Story 5 | `[integration]` | ✓ |
| 12 | FR9 | "which requirement mentioned the coverage helpers" returns nothing while the answer sits in `requirement.text` | A term appearing only in a `requirement.text` is found by an unscoped search, and the hit names the entity and row id | Story 5 | `[integration]` | ✓ |
| 13 | FR9 (must NOT) | Artefact bodies *and* the hand-written text on their child rows | must NOT — a search covers `document_section` only, so text held on a child row is unreachable while the tool reports success | Story 5 | `[integration]` | ✓ |
| 14 | FR9 | `entry_fts` covers those, tagged by entity, so `entity:requirement AND helpers` scopes a search and an untagged query spans everything | Creating one row of every indexed entity type through its own tool, then searching a term common to all of them, returns a hit from every one — the tools and the triggers are built by different stories and nothing else runs them together | Story 6 | `[integration]` | ✓ |
| 15 | FR24 | retirement stops rows arriving as well as preserving those that have | A create tool refuses a vocabulary row retired through Story 2's retire tool, and the refusal names the retired item | Story 6 | `[integration]` | ✓ |
| 16 | FR10 | Every artefact type CPM produces is modelled from the outset | Every table, enumerated from `sqlite_master` and populated through its own tool, appears in the projection its kind renders into — or inside its parent's, for the ten that produce no file and for the ADR | Story 6 | `[integration]` | ✓ |
| 17 | NFR7 (must NOT) | Every piece of state is reachable through a read tool without SQL | must NOT — a search returns a hit whose entity and row id do not resolve to a live row through that entity's read tool | Story 6 | `[integration]` | ✓ |
| 18 | FR24 | A persona added to a project's `agent` table is offered by `party`, `review` and `consult` with no plugin change and no file edit | A persona added to a project's `agent` table joins the roster in position among the seeded personas, with no plugin change, no file edit and no schema migration | Story 2 | `[integration]` | ✓ |
| 19 | NFR6 | Any condition that could produce a false pass — a constraint violation swallowed, a projection silently stale, a search index behind the data — reports and blocks. | Every condition in the false-pass register has a test asserting it blocks rather than warns — including the six Epic 47-01 deferred, whose closing epics are all complete by the time this story runs | Story 6 | `[integration]` | ✓ |
| 20 | FR9 | Artefact bodies *and* the hand-written text on their child rows — requirements, story criteria, retro observations, review findings — are indexed with FTS5 | A restored database's `document_fts` and `entry_fts` both return the same `MATCH` results as the source database's, for a term present in a section body and a term present only in a `requirement.text` | Story 6 | `[integration]` | ✓ |

**Mapping notes.**

**Row 1 is the whole of FR10's create-tool obligation, and it is checked here for the last
time.** Epic 47-03's row 5 covered the seven spine types; this row covers the enumeration in
full, so FR10's create-tool half is satisfied by this epic's matrix alone. The template half
remains Epic 47-04's. FR10 is therefore covered across three matrices and complete in none —
self-hosting register entry 1, in the requirement that gave the register its first entry.

**Rows 1 and 16 no longer carry a count, as of the pivot of 2026-08-08.** Both stated a total
that had already been recounted once — from twenty-two to twenty-three, when FR27 added
`milestone` as an eighth child table — and the total was wrong in its noun besides: twenty-three
is the number of *tables*, while FR10 enumerates twenty-two *types*, the two differing because
`brief` is two document kinds, `coverage` is both a kind and a child table, and the verification
record is deliberately no table at all. Both rows now assert against `sqlite_master` instead, so
adding a table changes no text here. Row 1's Spec Text remains identical to its criterion. Both
rows are unverified under the verification rule.

The arithmetic itself, and the phrase to quote if a count is ever needed again, live in one place:
the Data Model's *"fourteen document kinds, nine child tables and two standalone tables"*.
That phrase read *thirteen, eight and two* when this epic was written and delivered against it;
the pivot of 2026-08-10 added `communication` and `document_agent`, both of which are Epic 47-09's
to build. **This epic's sixteen is therefore unchanged** — it is what was accounted for here, not a
figure that tracks the current schema.

**Row 4's spec text is FR24's own multi-category clause, not the criterion's projection
half.** The projection is where the two categories are observed; FR24 is what requires there
to be two. The dependency this creates on Epic 47-04 is declared in the epic's `Blocked by`.

**Rows 3 and 5 are the tool-side counterparts of Epic 47-01's rows 10–12.** 47-01 proved the
constraints hold; these prove they are reachable without SQL, which is the half of FR24 that
says "extensible per project". Neither substitutes for the other.

**Row 16 is the parity closure and is deliberately duplicated in intent with row 1.** Row 1
asserts every type has a tool; row 16 asserts every type reaches a template. Together they
are FR10. Separately, each passes in a world where the other fails — which is the reason
Story 6 exists.

**Row 17 maps to NFR7, not FR9.** The clause is about reachability through read tools, which
is NFR7's subject; FR9 would be satisfied by a search that finds text and hands back an
unusable identifier.

**Story 7's two criteria have no rows here, and that is declared rather than missed.** It is
the "Address review findings" story, which records repairs to this breakdown rather than
obligations drawn from the spec, so its criteria have no requirement to bind to. The
both-directions set comparison should expect exactly those two as an unmatched remainder.

**Row 18 was added by the second pivot of 2026-08-08**, which made the agent roster an FR24
vocabulary. It is the criterion that justifies the table: CPM's `agents/roster.yaml` can only
be overridden by replacing the whole file, so a project wanting one extra persona must fork
all nine and maintain the fork — which is why the override has never been used, while
appending to the shipped roster has. FR24's seeded-extensible-retirable semantics express
append directly. The row sits here rather than in 47-08 because it asserts the *tool* half;
`party` reading the table is 47-08 row 17.

**Inline change**: the count in the paragraph above read "all ten" and the roster holds nine.
Corrected 2026-08-08, the same drift already fixed once in Epic 47-01's Story 2 — a count
restated in prose in several places is a fact with several copies and no owner.

**And it came back, in the two copies that correction did not reach.** On 2026-08-09 the epic doc
still said "forking all ten" in Task 2.1 and "the seeded ten" in the Notes, both written before the
matrix was corrected and neither touched by it. Correcting the number a third time would have set
up a fourth: **the count is now gone from all three**, replaced by "the whole roster" and "the
seeded personas". Retro 35's lesson is applied here rather than merely cited — a fact with no
owner is not fixed by giving it a better value.

**Row 18's criterion reached further than this row could verify, and was split on 2026-08-09
rather than narrowed.** As written it claimed the persona "is offered by `party`, `review` and
`consult`" — a behaviour of three skills that still read `agents/roster.yaml`, converting across
**two** later epics (`review` in 47-07; `party` and `consult` in 47-08). The mapping note above
scopes this row to "the *tool* half", the criterion text did not, and the verification rule binds
✓ to criterion text rather than to a note's intent, so the row sat unmarked while everything it was
meant to assert was built and verified.

Both of the obvious repairs were rejected. Narrowing the criterion until the built thing satisfies
it is the failure mode this document exists to prevent, and it would have deleted the skill-facing
promise rather than rehoming it. Moving the row wholesale to 47-08 fails on the arithmetic: three
skills, two epics — 47-08's matrix would hold a row it could not mark until 47-07 landed, beside
row 17 which already covers `party` on its own.

**So the spec sentence is now asserted by four rows across three matrices, and this one holds the
half dpm can run.** The Spec Text column is unchanged — the sentence is what it is — and only the
Story Criterion narrowed to the claim this epic owns. The rest:

| Where | Skill | Row |
|-------|-------|-----|
| `docs/epics/47-07-coverage-skills-authoring.md` | `review` | added 2026-08-09, Story 4 |
| `docs/epics/47-08-coverage-skills-read-surface.md` | `consult` | added 2026-08-09, Story 7 |
| `docs/epics/47-08-coverage-skills-read-surface.md` | `party` | row 17, already present |

`party` needed no new row: its criterion already says the roster loads from the `agent` table with
no YAML parse and no roster file on disk, and a roster read from the table offers an added row by
construction. A fourth row would have asserted the same thing twice, which is the drift a matrix is
supposed to catch rather than create.

FR24's persona clause is therefore covered across three matrices and complete in none — self-hosting
register entry 1's shape, arriving for the second requirement in this epic after FR10.

**Rows 3, 4, 5 and 6 were verified by Story 2** — `dpm/tests/vocabulary-tools.test.js`, with the
schema compared byte-for-byte before and after so "without a schema migration" is a measurement
rather than a claim. **Row 1 was verified at the same moment**: it was held back through Story 1
because seven tables still had no create tool, the exemption entries carrying that deferral were
spent-checked, and Story 2 registering the vocabulary tools failed that check until they were
deleted.

**Row 19 was declared forward from Epic 47-01 by the third pivot of 2026-08-08, and it is the
only row in the breakdown that asserts the false-pass register as a whole.** 47-01 built the
register as executable data and gave each of the twenty conditions exactly one disposition,
but six carry the second kind — a named epic rather than a test — so 47-01's own criterion was
narrowed to what it could deliver (complete, disposed, honest about its coverage) and the
whole-register claim was declared here. **This story and not another** because the six close
across four epics — #9 in 47-02, #10 in 47-03, #4 in 47-04, and #3, #15 and #16 in this
epic's own Stories 3–5 — and Story 6 is the first point at which all four are complete: this
epic waits on 47-04, and 47-04 waits on 47-02, so the two it does not name directly are
reached transitively. Anyone re-sequencing the build should check that property still holds
before moving this row, because nothing else in the format records it.

**Row 20 arrived from Epic 47-02 on 2026-08-08**, where it was that matrix's row 10. It asserts
that search survives a restore, and 47-02 could not carry it: `document_fts` and `entry_fts` are
built by this epic's Stories 3 and 4, and 47-02 is M1 while this is M3. The FTS placement here
was a considered decision rather than an oversight — the note above on the tables arriving as a
migration records it — so the criterion moved to the tables rather than the tables to the
criterion. Story 6 is the only story that can hold it: it needs the dumper *and* both indexes,
and this epic waits on 47-04, which waits on 47-02. What 47-02 kept is the half that is about
the dumper rather than about FTS — that shadow tables are excluded and the
`CREATE VIRTUAL TABLE` statement retained for **any** FTS5 table, asserted against one its own
fixture creates.

Everywhere else NFR6 appears in the breakdown it appears as a single false-pass *instance* —
47-04's row 21 on a renderer that silently differs, 47-09's row 19 on a load that drops
content — and an instance passing says nothing about the register being closed. That is the
distinction this row exists to hold, and it is why narrowing 47-01's row without declaring
this one would have left the register asserted nowhere. One requirement covered across two
epics, declared in both, is the ordinary case FR26 exists to make visible.
