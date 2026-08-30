# Skills: Spine

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Date**: 2026-08-08  
**Status**: Complete  
**Blocked by**: Epic 47-03-epic-server-and-spine-tools, Epic 47-04-epic-projection-guard-and-merge, Epic 47-05-epic-parity-and-search  
**Retro applied**: 35 · Testing gaps · Applied — Story 4's two grep sweeps and every suite run go to a file and are read whole; no `head`, no `tail`, no piping to a count  
**Retro applied**: 35 · Patterns worth reusing · Applied — Story 4's criteria are greps, so every hit is opened and read before it counts as a violation, and a clean pass gets a hostile read too  
**Retro applied**: 34 · Codebase discoveries · Applied — Story 1 is the spike; the converted `spec` is tested against the hardest real case, spec 47 itself and the ten inline ADs register entry 3 names  
**Retro applied**: 33 · Codebase discoveries · Applied — `spec`, `epics` and `do` are a pipeline, so converting one sweeps its consumers before that story is called done rather than waiting for Story 4

Milestone M4 (AD6). Three of FR25's twenty-two skills, one story each. These three are the
pipeline CPM's handoff problem lives in — each recovers the previous stage's work by parsing
what it wrote — so they convert first and their sequence is what the integration story runs.

The mechanical checks FR25 and FR3 impose on every file — no glob, no filename pattern under
`docs/`, no number-allocation procedure, no progress-file lifecycle, no SQL keyword — sweep
all three files in one test and therefore sit on Story 4. What stays per-skill is what that
skill writes, and the recovery clause, because what a skill would wrongly read back differs
by skill.

**Story 1 is a spike, and the epic stops after it.** Converting `spec` establishes the pattern
that Stories 2 and 3 and all nineteen skills in Epics 47-07, 47-08 and 47-09 then repeat — 103
of the 123 coverage rows left in the build. If the pattern is wrong it is wrong twenty-two
times, and as this epic is written the first evidence about it arrives at Story 4, after three
files already carry it. So: convert `spec`, then **stop and review the shape before starting
Story 2** — whether a skill of that size is readable, whether the tool surface it needs is the
one Epics 47-03 and 47-05 built, and whether the subtraction FR25 promises is what actually
came out. Re-shaping four epics after one story is cheap; after twenty-two files it is the
build. Added from review 06 (`docs/reviews/06-review-dpm-spec-47-progress.md`), 2026-08-09.

## Make the tool surface reachable, and name it as it is called
**Story**: 0  
**Status**: Complete — all six criteria met; suite 415 passing, coverage rows 16–21 marked  
**Blocked by**: —  
**Satisfies**: FR29, FR4, NFR5  
**Retro**: [Testing gap] A test that spawns the server supplies the launch a session does not, so every suite that drives dpm over stdio stayed green through five epics in which nothing declared the server — the check that closes it had to read the manifest, and the mutations that prove it works had to break the manifest rather than the code.  
**Retro**: [Codebase discovery] AD10's conformance seam is one-directional: it reports a tool whose `enum` matches no column `CHECK`, but not a column whose `CHECK` no tool declares, so deleting a tool's enum moves validation from the boundary to the database and the whole suite stays green — found by mutation, not by reading.  
**Retro**: [Pattern worth reusing] Where two layers can each refuse the same call, assert them separately: `assert.throws(…, /plan/)` passed with the tool's enum deleted *and* with the column's `CHECK` deleted, because one refusal is indistinguishable from the other from outside.  
**Inline change**: the name pattern's trailing quantifier moved from `+` to `*` — `search` is a one-part name, and requiring two parts was a transcription slip rather than NFR5's rule, which is that every part is a whole word (2026-08-09)

Added by the pivot of 2026-08-09. Story 2's planning found that nothing declares dpm's MCP
server — no `mcpServers` block in the plugin manifest, no `.mcp.json`, nothing in the marketplace
entry — so the 171 tools Epics 47-03 and 47-05 built are absent from a session and the skill
Story 1 wrote against them calls into nothing. Three suites drive the server over stdio and all
of them pass, because each one spawns it itself; that is false-pass register #21.

Declaring it forces the second half. The harness namespaces an MCP server's tools as
`mcp__<server>__<tool>`, so the exported name and the callable one differ, and it is the callable
one a skill writes. The exports therefore lose the `dpm_` prefix rather than gaining a second copy
of the server's identity — a rename across `src/` and the suites, done here so that twenty-two
skills are written against the settled name rather than twenty-one being rewritten later.

`story.plan` rides along because it is the same kind of gap found the same way: CPM keeps a
story's `[plan]` mark as a suffix on the `##` heading and reads it back off that heading, and
`story` had no column for it. The column is what lets Stories 2 and 3 keep the capability without
reintroducing the title parse FR25 removes.

**Acceptance Criteria**:

- The plugin manifest declares an MCP server whose entry point exists on disk and starts [integration]
- must NOT — the declaration is absent or names a missing entry point, and the suite still passes because every server test supplies its own launch [unit]
- Every tool name a dpm SKILL.md writes is `mcp__dpm__` followed by an exported tool name, resolved against the live registry [unit]
- Every exported tool name matches `[a-z]{3,}(_[a-z]{3,})*`, and every part after the verb is a table name, a column name, or a seeded `document_kind.kind` value — checked against the live schema, not against a hand-kept word list [unit]
- must NOT — an exported name carries the server's own identity as a part, which the harness prefix already supplies [unit]
- A story written with `plan` set reads back with it set, and its title is unchanged — the mark is a column and never a suffix on the title [integration]

### Declare the server in the plugin manifest
**Task**: 0.1  
**Description**: `dpm/.claude-plugin/plugin.json` gains the block that launches `bin/dpm-mcp.js`. The criterion asserts against the manifest rather than against a spawn, because a spawn is what every existing server test already supplies and is why the gap survived five epics.  
**Status**: Complete

### Drop the `dpm_` prefix from every exported tool name
**Task**: 0.2  
**Description**: 171 names across `dpm/src/`, the suites, and the ~30 references in `dpm/skills/spec/SKILL.md`. `tests/naming.test.js` moves to the new pattern and gains the must-NOT on a name carrying the server's identity; `tests/support/skills.js` extracts callable names rather than `dpm_*`.  
**Status**: Complete

### Add `plan` to `story`
**Task**: 0.3  
**Description**: `plan INTEGER NOT NULL DEFAULT 0 CHECK (plan IN (0,1))` in the delivery schema. Tool arguments derive from the schema, so the create and update tools pick it up without a per-tool edit — which is the property worth checking rather than assuming.  
**Status**: Complete

### Write tests for Make the tool surface reachable
**Task**: 0.4  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Convert `spec` [plan]
**Story**: 1  
**Status**: Complete — the spike's stop-and-review gate was taken; Chris approved the pattern and asked for it to be shrunk before Stories 2 and 3 inherit it, which was done (2,747 words against CPM's 5,260) and the rationale moved to this epic's Notes  
**Blocked by**: —  
**Satisfies**: FR25, FR5, FR11  
**Inline change**: eleven document kinds gained list tools; the converted `spec` cannot discover its inputs without them (2026-08-09)  
**Inline change**: nineteen child and link tables gained list tools, derived from the schema; every read tool is by primary key, so a child row could be created and then reachable only through the rendered markdown FR25 forbids (2026-08-09)  
**Inline change**: `dependency` was deliberately left out of that derivation — it has two ends and four candidate columns, and the rule would scope it on `kind`, answering a different question from the one the name asks. The direction is Story 3's to decide (2026-08-09)

**Acceptance Criteria**:

- A spec run writes the document, its requirements with `class` and MoSCoW band, and its acceptance-criteria coverage rows, all through create tools [feature]
- The facilitation survives: the run still gates on scope, still produces a testing strategy, and still refuses an untestable criterion [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Rewrite the spec write path as tool calls — document, requirements, criteria, coverage
**Task**: 1.1  
**Description**: Everything the skill currently composes into markdown becomes typed arguments. `class` and MoSCoW band stop being label prefixes the skill formats and become columns it passes.  
**Status**: Complete

### Replace numbering, filename construction and the progress file with tool calls and a session row
**Task**: 1.2  
**Description**: Four of FR25's six subtractions land in this one task. The number comes from the allocation tool, the filename does not exist, and the progress file becomes an `UPDATE`.  
**Status**: Complete

### Write tests for Convert `spec`
**Task**: 1.3  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Convert `epics` [plan]
**Story**: 2  
**Status**: Complete — all five criteria met; suite 421 passing, coverage rows 4, 5, 6, 14 and 22 marked  
**Blocked by**: Story 0  
**Satisfies**: FR25, FR23, FR21, FR4  
**Inline change**: the `Dependency View (on request)` mode is removed rather than converted — it globs the epic docs and parses `**Blocked by**` per story, and nothing enumerates edges to replace that with. Story readiness is Story 3's, where coverage row 8 already assigns it. Gated with Chris (2026-08-09)  
**Retro**: [Codebase discovery] Nothing computes `coverage.binding_hash` — every test passes a literal, the decay triggers only clear it, and the `CHECK` accepts any string. So FR21's "verified against this text" is bound to a value no two callers would agree on, and `do` writing `verified_at` in Story 3 has to invent one. `requirement.coverage_claim_hash` (FR26) is the same shape, and no tool writes it at all.  
**Retro**: [Codebase discovery] `list_coverage` is scoped by `requirement_id` only, so a story-first consumer has no route from a story criterion to the rows bound to it — `do` would have to enumerate every requirement of the spec and filter. Same shape as the `dependency` gap: a derived owner answering a different question from the one the caller asks.  
**Retro**: [Pattern worth reusing] The both-directions binding earned its keep on its first reuse: the run's read-backs were the *test's* verification rather than behaviour the file prescribed, and the binding said so. The fix was in the skill, not the test — Step 4 now reads the tree off the rows, which is better facilitation than trusting what the run holds.

**Acceptance Criteria**:

- An epics run allocates every epic number through the allocation tool, and writes stories, tasks, criteria and coverage rows through create tools [feature]
- The coverage matrix is a projection of `coverage` rows, not a file the skill writes — the skill emits no markdown table [integration]
- A story the run marks for planning is written with the `plan` argument set, and its title carries no marker [feature]
- The facilitation survives: the run still gates on the epic grouping before writing any story, still carries every must-NOT the source spec states into a story criterion, and still refuses to attach a criterion it cannot trace to spec text [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Rewrite epic, story, task, criterion and coverage writes as tool calls
**Task**: 2.1  
**Description**: Every epic number and child sequence comes from the allocation tool, so the two-level numbering the skill implements today by globbing both `docs/epics/` and `docs/archive/epics/` disappears entirely.  
**Status**: Complete

### Remove the coverage-matrix writer
**Task**: 2.2  
**Description**: The matrix is a projection of `coverage` rows. The skill writes rows and stops emitting a markdown table, which is also what makes its verification marks decay under FR21 instead of persisting as text.  
**Status**: Complete

### Replace the progress file with a session row
**Task**: 2.3  
**Description**: Including the session-suffixed filename and the compaction-recovery read. Adoption on resume is an `UPDATE`.  
**Status**: Complete

### Write tests for Convert `epics`
**Task**: 2.4  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Convert `do`
**Story**: 3  
**Status**: Complete — all five criteria met; suite 426 passing, coverage rows 7, 8, 9, 15 and 23 marked  
**Blocked by**: Story 0  
**Satisfies**: FR25, FR22, FR21, FR11, FR4  
**Inline change**: the tool surface FR22 and FR21 were built for had no exports — `readyDocuments` and `blockedBy` were called only by tests, and nothing computed `binding_hash` at all. Added inline, gated with Chris (2026-08-09): a `ready` argument on `list_story` and the document lists from a shared `readyClause`; `list_dependency` with all four ends offered separately, which settles the direction `list.js` deferred to this story; a server-computed `binding_hash` on the coverage tools with the argument withdrawn; `coverage_claimed_at` on `update_requirement`, wired to the existing `claimComplete`; and a `story_criterion_id` scope on `list_coverage`  
**Retro**: [Codebase discovery] A story blocked by a *document* is a legal edge the schema always admitted and no query read — `readyClause('story')` needs two blocker sources where the document form needs one, and reading only `source_story_id` would have reported a story ready while an epic held it up, which is the wrong answer in the direction that starts work  
**Retro**: [Criteria gap] `status` admits only `pending` and `complete`, so the run's "in progress" transition has nowhere to go and is carried by `session.phase` instead; the same two-value set means CPM's `Superseded` and `Withdrawn` have no representation, and a retired epic therefore reads as ready — out of scope here, and worth a spec-level look before Epic 47-09 converts the twenty-two  
**Retro**: [Testing gap] A section-scoped assertion matched `each one` against an incidental use three lines above the rule it meant to pin, so deleting the rule left the test green; the mutation caught it and the fix was to match the construction (`require a disposition for **each one**`) rather than the words  
**Retro**: [Pattern worth reusing] The three-direction binding earned its keep twice more — it caught the skill describing gating edges without ever telling the run to read `gates_work` from `dependency_kind`, and it caught a test-side read counted as a run write; both fixes were to the file rather than to the test

**Acceptance Criteria**:

- A do run updates story and task status through update tools, and records verification by writing `coverage.verified_at`, so FR21's triggers govern it rather than the skill's own prose rule [feature]
- Story readiness comes from the dependency query, not from reading `**Blocked by**` lines [integration]
- A do run reads whether to enter plan mode from the story's `plan` column, not from a marker in its title [feature]
- The facilitation survives: the retro-consumption gate still requires a disposition per observation rather than one blanket acknowledgement, and a story's verification gate still fires only once every implementation task under it is complete [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Rewrite status and verification updates as tool calls
**Task**: 3.1  
**Description**: `status` and `status_note` are separate columns, so the lead-token-plus-tail parse the skill performs today has nothing left to parse. Verification is `coverage.verified_at`, written not asserted.  
**Status**: Complete

### Replace `**Blocked by**` parsing with the readiness query
**Task**: 3.2  
**Description**: Readiness becomes a query over `dependency` — the FR22 capability the schema was built for, and the one place `do` currently derives a graph from prose.  
**Status**: Complete

### Replace the progress file and its compact-summary companion with a session row
**Task**: 3.3  
**Description**: The companion file exists only because a markdown store cannot hold state that survives compaction; a row can.  
**Status**: Complete

### Write tests for Convert `do`
**Task**: 3.4  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Verify cross-story integration for Skills: spine
**Story**: 4  
**Status**: Complete — all four criteria met; suite 430 passing, coverage rows 10–13 marked  
**Blocked by**: Story 0, Story 1, Story 2, Story 3  
**Satisfies**: FR25, FR3, FR11  
**Retro**: [Testing gap] The SQL sweep is the one criterion in this epic where a grep *is* the requirement, and the naive form of it fails: `spec` contains the sentence "Select the few most relevant rather than everything from the newest retro", which matches every structural `SELECT … FROM` pattern that can be written — so the ambiguous keywords are matched case-sensitively and the unambiguous ones either way, with the remaining gap (a lowercase `select … from`) stated rather than papered over  
**Retro**: [Codebase discovery] Running the three stages in sequence found what three passing conversion tests could not: `list_requirement` withholds `text` unless `include_body` asks for it, so an `epics` stage binding a verbatim fragment would have hashed `undefined` — a real handoff bug, reached through the tool surface rather than through a parse  
**Retro**: [Pattern worth reusing] Handing each stage **one id and nothing else** turns "no step reads what the previous one wrote" into a function signature: a stage needing a second parameter is a stage that could not find something, and that is checkable at the call site instead of by inspection

**Acceptance Criteria**:

- None of the three skill files contains a filename pattern under `docs/`, a glob, a number-allocation procedure, or a progress-file lifecycle [unit]
- None of the three skill files contains a SQL keyword or a `sqlite3` invocation [unit]
- A spec written by `spec`, broken down by `epics`, and executed by `do` produces one connected graph — requirements to criteria to coverage to stories — with no step reading what the previous one wrote from disk [feature]
- must NOT — a skill's progress state is a file rather than a `session` row [integration]

### Write integration tests for Skills: spine
**Task**: 4.1  
**Description**: The third criterion is what earns this story. Converting each skill individually proves each writes through tools; only running them in sequence proves none still reads back. The grep criteria are cheap and belong here rather than restated on each story — one sweep covers the epic's whole corpus.  
**Status**: Complete

---

## Notes

### The conversion pattern, settled by Story 1

Story 1 was the spike, and this is what it found. Stories 2 and 3 and the nineteen skills in
Epics 47-07 to 47-09 inherit these rather than rediscovering them. The rationale lives here
because a SKILL.md is loaded in full on every invocation, and a paragraph explaining why the
shape is the shape is paid for on every run by readers who never saw the alternative.

**What subtraction actually removes.** Six CPM shared procedures become tool calls written at
the point of use: Numbering (`create_<kind>` assigns it), Progress File Management and
Stale-Progress Check (`create_session` / `update_session` / `adopt_session` / `list_session`),
Roster Loading (`list_agent`), Library Check (`list_library` plus `list_library_scope`), Retro
Awareness (`list_retro` plus `list_observation`, with retirement carried on the row so nothing
parses to find it). `dpm/shared/skill-conventions.md` holds only what is left: prose several
skills reference and no tool implements. Tool names here are the **exported** ones; a SKILL.md
writes the callable form, `mcp__dpm__create_session` (FR29, Story 0).

**Every value is an argument, and the file says so once.** A class, a MoSCoW band, an exclusion,
a polarity and an approach tag are columns. A converted skill states that where the write
happens and does not restate it — the corpus check in Story 4 and the per-skill argument binding
in the test shape both hold it.

**A skill never reports a path.** Building one from a number and a slug is the filename
construction the conversion removes, and the projection alone decides where a kind renders.

**Two things the schema settles that read the other way in CPM.** A `spec` takes no parent, so
its lineage to a brief is a `builds_on` edge rather than containment. And `create_coverage`
requires a `story_criterion_id`, so `spec` writes none: CPM's *Acceptance Criteria Coverage*
section is requirement, criterion and tag, which is `acceptance_criterion` plus
`criterion_approach`. Story 2 owns the binding, and its first criterion should be read that way.

**The test shape, which twenty-one conversions repeat** (`dpm/tests/support/skills.js`): every
tool name the file mentions resolves to a real tool, every tool the driven run used is named
in the file, and every fixed-vocabulary argument the run supplied is named in the file. The
third was added after mutation testing showed the first two pass with `moscow` deleted from the
skill entirely. No manifest of "the tools this skill uses" — that is a third place the truth
lives and the only one nothing fails on.

**Sizing, for the epic's readability question.** The converted `spec` is 2,747 words against
CPM's 5,260 — 48% smaller. Line counts understate it because CPM's files do not wrap.

**Still open, and Story 3's to decide.** Nothing enumerates the edges out of a document, so
`dependency` has no list tool. The consequence is visible in `spec` now: constraint inheritance
asks the user which problem brief a product brief came from, where CPM parsed a `**Source**:`
field. Story 3's readiness query is where the direction gets settled.

### Why Story 2 stopped in planning — the tools are not reachable from a session

Found while exploring Story 2 on 2026-08-09, and pivoted to the spec rather than absorbed here.

**Nothing registers dpm's MCP server.** There is no `mcpServers` block in
`dpm/.claude-plugin/plugin.json`, no `.mcp.json` in the repo, and no server declaration in the
marketplace entry. `bin/dpm-mcp.js` works — `server.test.js`, `spine-integration.test.js` and
`naming.test.js` each spawn it and speak JSON-RPC over stdio — but nothing tells the harness to
launch it, so in a live session the tool surface does not exist. `plugin.test.js` compares the two
manifests and never asks whether a server is declared, which is why the suite is green over it.

**Once registered, the harness-visible name will not be the exported one.** Claude Code namespaces
MCP tools `mcp__<server>__<tool>`, and the servers loaded in a live session each export a bare verb
for that reason. dpm exported `dpm_create_spec` under a server whose `serverInfo.name` is `dpm`, so
the callable name stuttered and was not what `dpm/skills/spec/SKILL.md` instructed an agent to call.

**Neither is caught by anything.** NFR5's criterion and `naming.test.js` govern the *exported*
name, which is correct as far as it goes; Story 1's skill test binds the SKILL.md to the same
exported names. Both stay green whichever way the callable-name question is resolved, because
neither asks whether an agent can call what a skill names.

It reaches the spec rather than this epic: registration is a requirement the spec does not state,
and the callable-name contract is one every one of FR25's twenty-two skills depends on. Story 1's
finished skill is affected too.

**Resolved by the pivot of 2026-08-09.** The spec gained **FR29** — the manifest declares the
server, exports drop the `dpm_` prefix, and `mcp__dpm__create_spec` is what a SKILL.md writes —
together with a fourth integration seam (*skill prose → the harness's tool registry*) and
false-pass register entry #21. A second gap found alongside it, that `story` had no column for
CPM's `[plan]` heading suffix, was folded into the same pivot as a `plan` column under FR4. The
work is **Story 0** of this epic, and Stories 2 and 3 are blocked on it.

### Self-hosting register — entries in this epic's scope

The register lives in Epic 47-01's Notes. **Entry 3** is in scope: `spec` is converted here,
and spec 47 itself carries ten inline ADs with Decision / Rejected / Consequence structure
that degrade to `document_section` prose because `adr` is a document kind. A converted
`spec` skill therefore cannot write the spec it was converted from without loss. Not
actionable here — it needs a schema change.

**Entry 1** is also visible: the converted `epics` skill writes `coverage` rows and nothing
else, so the partial-coverage state this very breakdown produced for FR10 would be
unrepresentable in the tool the breakdown was made with.

### Requirements only partially covered by this epic

**FR25** — three of twenty-two skills. The remaining nineteen are Epics 47-07, 47-08 and
47-09; FR25's corpus-wide criteria — that all twenty-two exist, that none exists which FR25
does not name, and that every reachable pipeline stage has one — can only be asserted once
the last skill lands, and are Epic 47-09's.

**FR3** — the skill-corpus half, for three files. The tool-boundary half is Epic 47-03.
