# Coverage Matrix: Server and Spine Tools

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Epic**: docs/epics/47-03-epic-server-and-spine-tools.md  
**Date**: 2026-08-08

> **Verification rule**: Verification status (✓) is bound to criterion text. Any change to a story criterion or its spec mapping resets that row to unverified.

| # | Spec Requirement | Spec Text (verbatim) | Story Criterion (verbatim) | Covered by | Spec Test Approach | Verified |
|---|------------------|----------------------|----------------------------|------------|--------------------|----------|
| 1 | NFR1 | The plugin installs by clone or marketplace fetch with no build step, no `node-gyp`, and no per-platform binary. | A clean clone starts the server with no compilation step | Story 1 | `[target]` | ✓ |
| 2 | NFR2 | The server refuses to start with a clear message below its minimum Node version rather than failing on a missing module. | The server refuses to start below the Node floor with a message naming the required version | Story 1 | `[integration]` | ✓ |
| 3 | NFR3 | The MCP stdio transport owns stdout. All logging, including Node's `ExperimentalWarning` for `node:sqlite`, goes to stderr or is suppressed (`NODE_NO_WARNINGS=1`). | A full session's stdout parses as well-formed JSON-RPC with no stray output | Story 1 | `[integration]` | ✓ |
| 4 | FR1 | Every CPM artefact type is a table with typed columns, not a markdown file parsed at read time. | Creating each artefact type produces a row readable by its typed read tool | Story 2 | `[integration]` | ✓ |
| 5 | FR10 | Every table in `sqlite_master` has a create tool, asserted by comparing the live table list against the registered tool list — neither side is a hand-kept enumeration | The seven spine entity types — spec, requirement, story criterion, epic, story, task, coverage — each have create, read and update tools | Story 2 | `[integration]` | ✓ |
| 6 | FR4 (must NOT) | Nothing infers a type by parsing an identifier. | must NOT — the `requirement` create tool accepts a class inferred from `label`, rather than requiring `class` as an argument | Story 2 | `[unit]` | ✓ |
| 7 | FR4 | Requirement class, MoSCoW band, status, test-approach tag, and coverage verification state are typed columns constrained by `CHECK`. | Every `requirement` and `acceptance_criterion` type distinction is readable from a column with `label` and `text` withheld | Story 2 | `[integration]` | ✓ |
| 8 | FR5 (must NOT) | Human-facing artefact numbers are allocated monotonically and are never reused, including after archival. | Allocating a number through its tool returns the value and never a success without one | Story 3 | `[unit]` | ✓ |
| 9 | FR22 | so "which epics are ready" is a query, a blocker's completion is visible to everything downstream | The link tool refuses an edge that would close a cycle over a `gates_work` kind, naming both ends | Story 3 | `[integration]` | ✓ |
| 10 | FR14 | A verification tool reports orphans, dangling links, and each entry in the cross-row invariant register (Data Model), so a corrupted state is diagnosable without SQL. | The integrity tool is callable and reports every register entry it checks | Story 3 | `[integration]` | ✓ |
| 11 | FR13 | Query tools return summaries rather than whole bodies unless a body is explicitly requested | For the same artefact, a read without an explicit body request returns strictly fewer bytes than one with it — asserted as a comparison between two responses, not against a fixed number | Story 4 | `[integration]` | ✓ |
| 12 | FR13 | every list-returning tool takes a `limit` with a default | Every list-returning tool declares a `limit` with a default, and a caller that raises it receives the larger result | Story 4 | `[unit]` | ✓ |
| 13 | FR13 (must NOT) | The bound is a default that costs nothing to override, not a limit. | must NOT — a query tool returns an unbounded row set when no limit is supplied, or refuses a limit the caller raised | Story 4 | `[unit]` | ✓ |
| 14 | NFR5 | Names must therefore be searchable words (`create_epic`, not `ce`, reaching a session as `mcp__dpm__create_epic` per FR29); brevity is not a virtue here. | Every exported tool name matches `[a-z]{3,}(_[a-z]{3,})*`, and every part after the verb is a table name, a column name, or a seeded `document_kind.kind` value — checked against the live schema, not against a hand-kept word list. A tool whose declared table is not one of the live tables spans the schema rather than acting on it, and is held to the shape and not to the vocabulary | Story 5 | `[unit]` | ✓ |
| 15 | NFR7 | Every piece of state is reachable through a read tool without SQL | Every table a registered tool writes is reachable through at least one read tool, compared in both directions from the tools' own declarations against `sqlite_master` — and the tables no tool reaches yet are named by the same assertion rather than excluded from it | Story 5 | `[integration]` | ✓ |
| 16 | NFR7 | so a user whose server will not start is not locked out of their own planning history | A database whose schema version is ahead of the server still answers read tools rather than refusing to start | Story 5 | `[integration]` | ✓ |
| 17 | FR11 | The progress-file subsystem — session-suffixed filenames, hook injection, adoption on `--resume`, compact-summary companions — is replaced by a session table. Adoption is an `UPDATE`; staleness is a `WHERE` clause. | A session row survives simulated resume under a new session id, and stale rows are selected by age | Story 6 | `[integration]` | ✓ |
| 18 | AD10 | Every tool argument that names a column exists on that table, with a compatible type | Every enum a tool declares is equal to the `CHECK` set on its column, in both directions, read from the live schema | Story 7 | `[unit]` | ✓ |
| 19 | AD10 | Every `NOT NULL` column without a default is a required argument on its create tool. | Every `NOT NULL` column without a default is a required argument on its create tool, and every foreign key on the table has a corresponding argument | Story 7 | `[unit]` | ✓ |
| 20 | AD10 (must NOT) | a test asserts their correspondence against the live database | must NOT — the conformance test compares tool schemas against a second copy of the DDL rather than against `PRAGMA` output | Story 7 | `[unit]` | ✓ |
| 21 | FR3 | dpm ships an MCP server whose tool schemas are the write contract. A malformed call is rejected at the tool boundary before it reaches the database. | A create call whose enum value the column's `CHECK` rejects fails at the tool boundary, and no row is written | Story 8 | `[integration]` | ✓ |
| 22 | FR3 (must NOT) | A malformed call is rejected at the tool boundary before it reaches the database. | must NOT — a tool accepts an argument the schema rejects, so validation happens at neither layer | Story 8 | `[integration]` | ✓ |
| 23 | AD10 | It runs in the suite, not at build time. | The conformance test passes against the running server's actual registered tool list, not a fixture of it | Story 8 | `[integration]` | ✓ |
| 24 | FR3 | dpm ships an MCP server whose tool schemas are the write contract. | A spec created through its tool, then an epic under it, then a story, then a coverage row binding a requirement fragment to a story criterion, all succeed in sequence and read back consistently through their read tools | Story 8 | `[integration]` | ✓ |
| 25 | FR11 | The progress-file subsystem — session-suffixed filenames, hook injection, adoption on `--resume`, compact-summary companions — is replaced by a session table. Adoption is an `UPDATE`; staleness is a `WHERE` clause. | A session created, resumed under a new id, and read back returns the state written before the resume | Story 8 | `[integration]` | ✓ |
| 26 | AD10 | It runs in the suite, not at build time. | Every tool the server registers appears in the reachability assertion, and every table this server's tools write appears in at least one registered tool's declared coverage — the tables no tool reaches yet named by the same assertion rather than excluded from it | Story 8 | `[integration]` | ✓ |

**Partial coverage to flag.**

**Row 1 was run on 2026-08-09 and is now marked.** A `git clone` into an empty directory, with
no `npm install`, no `node_modules` anywhere in the tree and no lockfile: `bin/dpm-mcp.js`
answered `initialize`, listed 115 tools, migrated a database to 39 tables and wrote a `spec` row
through `dpm_create_spec` — and the full suite ran there, 362 passing. Nothing was fetched and
nothing was built. **The residue is now one clause narrower than the paragraph below describes**:
what remains unshown is a *different host* — another OS, another Node build — and not the
install-or-build step NFR1's text actually names, which was exercised rather than inspected.
Raised by review 06 (`docs/reviews/06-review-dpm-spec-47-progress.md`), which found this row and
47-01's row 86 to be the same check under two wordings, both unrun.

The original reasoning, kept because it is why the row was `[target]` in the first place:

**Row 1 is `[target]` and stayed unverified after Story 1, deliberately.** NFR1's criterion is
about a *clean clone on a real host*, and no suite running inside the tree can produce one. What
Story 1 does close is the half a machine can honestly check, in `dpm/tests/plugin.test.js`: no
`dependencies`, `devDependencies`, `peerDependencies` or `optionalDependencies`; no `install`,
`postinstall`, `prepare` or `build` script; no `binding.gyp`; no `.node` binary anywhere in the
tree; and every module specifier under `dpm/` resolving to `node:*` or to this tree, since a bare
specifier is a package and a package is an install step whether or not it compiles. The residue
— that a fresh clone actually starts — is the same residue as 47-01 row 86, and is closed the
same way: by a human on a machine that has never seen this repository.

**Rows 12 and 13 had no subject until Story 4 built one.** Both criteria quantify over
list-returning tools, and after Stories 2 and 3 there were none — twenty-seven tools, every read by
primary key, and `dpm_check_integrity` unbounded on purpose. Nothing downstream would have supplied
them either: Epics 47-04 and 47-05 scope create/read/update for the remaining types and no queries.
So the eight list tools were built in Story 4 rather than assumed by it, which is what makes these
two rows falsifiable rather than vacuously true. FR13 names the bound and takes the tools it bounds
for granted; that gap was in the requirement, not in the breakdown of it, and is worth carrying
into any later spec that bounds something it does not also create.

**Rows 14 and 15 were amended by Story 5, and row 26 needs the same treatment.** Row 14 gained the
exemption described below; row 15 was over-scoped and now asserts the half this epic can close.
NFR7's promise is over every table in `sqlite_master`, and this epic's read tools reach ten of
thirty-nine — `session` is Story 6's and the rest are Epic 47-05's, which its Story 1 already reads
from the live schema. The count is the one the suite prints, not one kept here. The amended
criterion asserts that nothing this server *writes* is unreadable, in both directions, and reports
the untooled tables from the same assertion so the gap stays visible from here. **Row 26, which is
Story 8's, was amended the same way before Story 8 began** — it read "every table appears in at
least one tool's declared coverage" and was unsatisfiable for exactly the same reason: written as
a whole-system property, living in the epic that builds a quarter of the system. The note above
is what made that an amendment rather than a discovery, which is the only difference between the
two.

**Row 14 was amended again on 2026-08-09, and its ✓ cleared.** The pivot that added FR29 settled
that the harness supplies the `mcp__dpm__` prefix, so `dpm_` in an export states the server's
identity twice; the pattern moved from `dpm_[a-z_]{6,}` to `[a-z]{3,}(_[a-z]{3,})*`. **The rule
this row exists for is unchanged** — every part after the verb is still schema vocabulary, and the
derived exemption below still applies to exactly one tool — so the amendment is to the prefix and
nothing else. The rename that makes the criterion true again is Epic 47-06 Story 0, and the live
assertion of the new pattern is that epic's rows 19 and 20. This row stays here because the *rule*
was settled here and the mutation record below is its evidence.

**Row 15 also found a real hole rather than only a wording one.** `dependency` was written by
`dpm_create_dependency` and `number_sequence` by `dpm_allocate_number`, and neither had a read
tool — the plainest instance of what NFR7 forbids, invisible to every Story 2 and Story 3 test
because each of those checks a tool against its own table. `dpm_read_dependency` and
`dpm_read_number_sequence` were added in Story 5.

**Row 14's rule cannot name row 10's tool, and Story 5 settled it by widening.** The record of the
clash follows; the resolution is that a tool whose declared `table` is not one of the live tables
is not acting on a table but spanning the schema, and is held to the shape rule and not the
vocabulary. Derived from the tool's own declaration and checked against `sqlite_master`, so it is
not the hand-kept word list the criterion forbids. Exactly one tool takes it. NFR5 requires every
part of a tool name after the verb to be "a table name, a column name, or a seeded
`document_kind.kind` value — checked against the live schema, not against a hand-kept word list".
Story 3's integrity tool sweeps thirteen register entries and every foreign key, and there is no
`integrity` table or column for it to be named after; nor would any name built only from schema
words describe it. `dpm_allocate_number` and `dpm_create_dependency` are fine — `number` is a
column, `dependency` a table — so the clash is specific to the one tool that spans everything.
It is named `dpm_check_integrity`, honestly, and Story 5 decides whether to widen the rule or
rename. Recorded here rather than discovered there, and nothing outside dpm consumes tool names
yet, so a rename at Story 5 costs nothing.

**FR3 is half covered here.** Rows 21–22 cover the tool boundary rejecting malformed calls.
FR3's other clause — "No skill contains SQL, and no skill constructs a query", whose spec
criterion is "Every dpm SKILL.md contains no SQL keyword and no `sqlite3` invocation" — is a
property of the skill corpus and belongs to Epics 47-06 through 47-09.

**FR10's create-tool criterion (row 5) covers the spine types only.** The remaining tables are
Epic 47-05's. **The split is 8/15, not the 7/16 recorded before Story 2** — sixteen rather than
fifteen since the pivot of 2026-08-08 added `milestone` (FR27), and then one moved across:
Story 2 tooled `acceptance_criterion` as well as the seven the criterion enumerates, because row
7's criterion names it. It is the spec-side twin of `story_criterion` with the same `polarity`
column, and `coverage` — which *is* one of the seven — binds one of each, so tooling one side and
not the other would have left the join reachable from one end only. Row 5's criterion text is
unchanged and still true; what changed is that it now understates the surface. FR10 therefore has
partial coverage across three epics, making it the clearest live instance of self-hosting register
entry 1 in this breakdown.

**Rows 24–26 were added on 2026-08-08**, during the pivot that closed the self-hosting
register. They were not cascaded changes: all three criteria were already on Story 8 and had
no row, found by a set comparison between each epic's criteria and its matrix's `Story
Criterion` column. Row 26 is the pair to row 23 and neither substitutes for it — row 23 says
the conformance test reads the live registration, row 26 says the registration is complete in
both directions.

**Row 25 is FR11's only appearance in this matrix.** The session *table* is Story 6's; the
skills that stop writing progress files are Epics 47-06 through 47-09. FR11 is therefore
partially covered here and completed in 47-09.

**Row 18's spec text says "with a compatible type" and the criterion checks enums only.** The
gap is deliberate and worth stating rather than closing. `PRAGMA table_info` reports a column's
declared type, and SQLite's affinity rules mean that type constrains almost nothing: a `TEXT`
column accepts an integer, an `INTEGER` column accepts `'3'`, and a `NUMERIC` column silently
converts. A check that compared JSON Schema's `type` against the declared one would pass on every
pairing the database would actually have refused and fail on several it accepts — a rule that
reports noise in both directions is worse than no rule, because its failures train a reader to
override it. What *does* constrain a value is the `CHECK` set, and that is what the criterion
asserts, in both directions. The residue is the `INTEGER`/`string` mismatch that SQLite would
coerce rather than reject, which no test here catches and which Story 8's boundary rows do not
catch either.

**Rows 18–20 are what AD10 bought instead of code generation.** AD10 chose two hand-written
definitions and a test over a generator, on cost, and the test is the whole of what it bought — so
the question of *where the test reads from* is the decision, not an implementation detail. Row 20
is the must-NOT that makes the answer falsifiable: rewriting the checker to read the shipped `.sql`
files fails the drift test, and would fail nothing at all if the test compared texts. Two defects
came out of it that neither Story 2 nor Story 3 could have surfaced, both on the tool side —
`dpm_create_spec` filling two foreign keys that nothing declared, and a column carried by two
foreign keys counted twice.

**Rows 21–26 are the only rows read off the wire, and row 23 is why the rest are.** Every other
row in this matrix is closed by calling a handler, which is the right level for what each story is
about and is one layer below where FR3's promise lives — a handler called directly has already
skipped the schema that FR3 says *is* the write contract. Story 8's tests spawn `bin/dpm-mcp.js`
and speak `initialize`/`tools/list`/`tools/call` to it over stdio. Row 23 is the load-bearing one:
serving a filtered registry fails six of them while leaving row 18's in-process conformance check
passing, because Story 7 builds the registry it checks. Reading the list off `tools/list` and
asserting it equal to the local one *before* deriving anything from it is what makes rows 24–26
statements about the server rather than about `spineTools`.

**Row 24's chain is composition, and one plausible mutation shows what it does not cover.**
Hardcoding a child document's `parent_kind` instead of reading it from the named parent fails a
Story 2 test and none of Story 8's — `epic` is the only child kind this epic tools and its only
parent is a spec, so the two are indistinguishable from here. What row 24 adds is that six creates
whose foreign keys point at ids the previous call returned can be run in sequence at all, and that
each link reads back through its own read tool.

**FR4, FR5, FR14 and FR22** each appear here in their tool-boundary half only; the schema
half is Epic 47-01's matrix.

**Story 9's two criteria have no rows here, and that is declared rather than missed.** It is
the "Address review findings" story, which records repairs to this breakdown rather than
obligations drawn from the spec, so its criteria have no requirement to bind to. The
both-directions set comparison should expect exactly those two as an unmatched remainder.

**Row 26 read "exactly one tool's declared coverage" until review 05.** It now reads "at
least one", matching both Story 5's criterion and NFR7. The two were not merely different
wordings of one rule: `document` is read by every kind's read tool and `taxonomy` by three
child-table tools, so exactly-one was unsatisfiable against this schema, and an epic holding
both criteria could not pass.
