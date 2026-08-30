# Coverage Matrix: Publishing

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Epic**: docs/epics/47-10-epic-publishing.md  
**Date**: 2026-08-10

> **Verification rule**: Verification status (✓) is bound to criterion text. Any change to a story criterion or its spec mapping resets that row to unverified.

| # | Spec Requirement | Spec Text (verbatim) | Story Criterion (verbatim) | Covered by | Spec Test Approach | Verified |
|---|------------------|----------------------|----------------------------|------------|--------------------|----------|
| 1 | FR6 | A markdown projection is generated and committed | Publishing into an empty tree writes every document the database produces and `.dpm/dpm.sql` beside it, and returns a record naming what it wrote | Story 1 | `[integration]` | ✓ |
| 2 | FR6 | Regenerating the projection twice from one database state yields byte-identical output | Publishing twice from one database state rewrites nothing the second time and reports no change, so a run that changed the tree is distinguishable from one that did not | Story 1 | `[integration]` | ✓ |
| 3 | FR6 | so the tree holds what the database produces and nothing else | A file that no longer belongs — the old path of a renumbered document, or a document deleted from the database — is removed, and the removal is named in the record separately from the writes | Story 1 | `[integration]` | ✓ |
| 4 | FR7 | a commit carrying a fresh projection and a stale dump is the other | The projection and the dump are written by one call, so no sequence of publishes leaves one current and the other stale | Story 1 | `[integration]` | ✓ |
| 5 | FR6 (must NOT) | must NOT — publishing writes a partial tree when one document cannot render, leaving files the guard then diffs clean | must NOT — a partial tree is written when one document cannot render, leaving files the guard subsequently diffs clean | Story 1 | `[unit]` | ✓ |
| 6 | AD11 | One implementation because two would disagree about orphan removal the first time naming changed, and that disagreement is silent | must NOT — orphan removal is implemented a second time here rather than reusing the guard's rule, so publish and merge can disagree about which files are orphaned | Story 1 | `[unit]` | ✓ |
| 7 | AD11 | one implementation behind three entry points: a CLI (`bin/dpm-publish.js`) | `bin/dpm-publish.js` publishes the tree rooted at the path it is given, exits 0, and prints what changed | Story 2 | `[feature]` | ✓ |
| 8 | NFR2 | The server refuses to start with a clear message below its minimum Node version rather than failing on a missing module | On a Node below the floor it fails with NFR2's message rather than `ERR_UNKNOWN_BUILTIN_MODULE`, the same as the other three binaries | Story 2 | `[unit]` | ✓ |
| 9 | FR6 (must NOT) | must NOT — publishing writes a partial tree when one document cannot render | A publish that cannot render exits non-zero, names every document that refused, and leaves the tree untouched | Story 2 | `[feature]` | ✓ |
| 10 | NFR6 | Any condition that could produce a false pass … reports and blocks | must NOT — a failure is reported on stdout, so a shell cannot separate success from failure without reading the exit code | Story 2 | `[unit]` | ✓ |
| 11 | AD11 | an MCP tool (`mcp__dpm__publish`) … All three return the same record | `mcp__dpm__publish` publishes and returns the same record the CLI prints, derived from the same call, so the two cannot report different things about one database state | Story 3 | `[integration]` | ✓ |
| 12 | NFR5 | every underscore-separated part is a whole word | The tool is in the registry, its name is whole words per NFR5, and the conformance test holds over it | Story 3 | `[unit]` | ✓ |
| 13 | NFR6 | the failure being designed against is one that looks like success | A publish that cannot render returns an error naming every document that refused, rather than a success carrying an empty record | Story 3 | `[integration]` | ✓ |
| 14 | AD11 | All three return the same record of what was written, rewritten, left unchanged and removed as orphaned | must NOT — the tool composes its own report from the record rather than returning it, so the CLI's wording and the tool's drift apart | Story 3 | `[unit]` | ✓ |
| 15 | FR25 | the `publish` skill of FR25 that calls it | A `publish` run calls `mcp__dpm__publish` and reports what changed, grouped as written, rewritten and removed | Story 4 | `[feature]` | ✓ |
| 16 | FR25 | What remains is the facilitation — the questions, the gates, the judgement | A publish that would remove a file names each one and gates before removing, since removal is the only irreversible thing publishing does | Story 4 | `[feature]` | ✓ |
| 17 | AD11 | the step is named by the thing that blocks on it | The run ends by naming the two artefacts to commit and stops there, rather than committing anything | Story 4 | `[feature]` | ✓ |
| 18 | FR25 | no filename construction, no glob, no number allocation, no markdown parsing, no progress-file lifecycle | `dpm/skills/publish/SKILL.md` contains no filename pattern under `docs/`, no glob, no number-allocation procedure and no progress-file lifecycle, and no SQL keyword or `sqlite3` invocation | Story 4 | `[unit]` | ✓ |
| 19 | FR25 (must NOT) | Each of those is a tool call | must NOT — the skill writes or deletes a file itself rather than calling the tool | Story 4 | `[unit]` | ✓ |
| 20 | FR25 (must NOT) | no procedure that recovers an entity by reading what an earlier skill wrote | must NOT — the skill reports a tree it did not publish, by describing the database's contents rather than the record the tool returned | Story 4 | `[feature]` | ✓ |
| 21 | FR25 | The twenty-three skills named in FR25 all exist, and no skill exists that FR25 does not name | Every name FR25 enumerates has a skill directory, and every skill directory is a name FR25 enumerates, asserted in both directions against the spec's list and reading nothing outside dpm | Story 5 | `[integration]` | ✓ |
| 22 | FR25 | Every pipeline stage a CPM user can reach has a dpm skill, asserted by comparing the corpus against CPM's own skill directory | Every CPM pipeline stage has a dpm skill, so the half that catches a conversion nobody wrote survives the separation intact | Story 5 | `[integration]` | ✓ |
| 23 | FR25 | The CPM comparison is a subset check — a dpm skill CPM has no counterpart for passes it, and dpm's corpus is bounded by FR25's enumeration rather than by CPM's directory | A dpm skill with no CPM counterpart passes the CPM comparison, and the comparison names no dpm-side expectation at all | Story 5 | `[integration]` | ✓ |
| 24 | FR25 (must NOT) | must NOT — the pipeline-stage comparison reports success because CPM's `skills/` directory was absent, rather than failing on a fixture it could not read | CPM's `skills/` directory being absent still fails rather than passing trivially | Story 5 | `[integration]` | ✓ |
| 25 | FR25 (must NOT) | must NOT — the pipeline-stage comparison is an equality check, so a capability dpm adds fails a test that is about CPM's completeness and not about dpm's | must NOT — the CPM comparison is equality, so a capability dpm adds fails a test that is about CPM's completeness and not about dpm's | Story 5 | `[integration]` | ✓ |
| 26 | FR25 | FR25's enumeration is the oracle for dpm's own corpus | must NOT — the corpus bound is a count rather than the enumeration, so any extra directory satisfies it as long as the total is right | Story 5 | `[unit]` | ✓ |
| 27 | FR7 | fails on divergence in either, naming what diverged | The guard's divergence message names the command that resolves it, and that command exists on disk at the path named | Story 6 | `[feature]` | ✓ |
| 28 | FR7 | A write made since the last commit leaves `.dpm/dpm.sql` stale, and the guard regenerates it and fails, naming it | A write followed by a publish leaves the guard passing; the same write without the publish leaves it naming both artefacts | Story 6 | `[feature]` | ✓ |
| 29 | FR7 (must NOT) | must NOT — the pre-commit hook regenerates and stages the result, overwriting a hand-edit rather than refusing the commit | must NOT — the pre-commit hook regenerates and stages the result, overwriting a hand-edit rather than refusing the commit | Story 6 | `[feature]` | ✓ |
| 30 | NFR6 | a projection silently stale | must NOT — the guard's message names a command, and nothing asserts the command exists, so the diagnostic can outlive the binary it points at | Story 6 | `[unit]` | ✓ |
| 31 | FR6 | regenerated from the database and committed, so that pull requests show a readable prose diff of what changed | An empty repository, a skill run that writes, a publish and a commit: the hook accepts it, and the tree holds exactly what the database produces and nothing else | Story 7 | `[feature]` | ✓ |
| 32 | FR7 | Silent loss of a user's edit is one failure this prevents | The same sequence with the publish omitted is refused, and the message names the command that would have fixed it | Story 7 | `[feature]` | ✓ |
| 33 | AD11 | a step that has to be taken before committing | `dpm/README.md` names both first-run steps — installing the hook, and publishing before committing — so the sequence is discoverable without reading a hook comment | Story 7 | `[unit]` | ✓ |
| 34 | NFR6 | This spec's subject applied to itself: the failure being designed against is one that looks like success | must NOT — the end-to-end run passes against a stubbed publish, a stubbed guard, or a database with one document, so the sequence is asserted on a corpus too small to have an orphan in it | Story 7 | `[feature]` | ✓ |

**Mapping notes.**

**Rows 5 and 9 cite the same spec must-NOT against two surfaces.** The partial-write failure is a
property of the implementation (row 5, Story 1) and of what a user sees when it happens (row 9,
Story 2). One sweep would pass while the CLI reported the refusal as a success, which is the same
per-file reasoning Epics 47-06 to 47-09 applied to FR25's recovery clause.

**Rows 6, 14 and 17 map to AD11 rather than to an FR**, because each is a claim about *how* the
operation is built rather than about what it produces. FR6 is satisfied by any correct
implementation; "one implementation, one record, named by the thing that blocks on it" is the
architecture decision and belongs to it.

**Row 16 maps to FR25's facilitation clause, and it is the only criterion in this matrix that
carries the skill's judgement.** The rest of the `publish` skill is subtraction and delegation.
Removal is the one place where a human should see something before it happens, and a conversion of
this skill that dropped the gate would still satisfy rows 15, 18 and 19 — which is precisely why
the clause is bound separately, on the same reasoning as Epic 47-07's rows 28–31.

**Rows 21–26 replace an assertion Epic 47-09 verified, and split it in two.** That epic's Story 5
asserted the corpus *equals* CPM's skill directory — one test doing two jobs. Row 21 is the job that
bounds dpm's corpus, and it now reads FR25's enumeration and nothing outside dpm; row 22 is the job
that catches a missing conversion, and it stays with CPM where it belongs. Row 23 states the
separation as a property rather than leaving it as an absence, because an equality check and a
subset check are one edit apart and the edit is invisible in a passing suite.

Rows 25 and 26 are the two ways the split can be undone. **Row 25 is the one that matters**: dpm is
independent of CPM for new functionality, so a comparison that fails when dpm adds a capability has
made CPM's feature set a precondition for dpm's — the coupling the spec exists to remove, arriving
through its own suite. Row 26 is the cheaper failure: a bound expressed as a count passes for any
directory as long as the total is right.

**Row 29's Spec Text and Story Criterion are identical.** The spec line was written for this epic
during the amendment of 2026-08-10, so there is nothing to restate. It is recorded here rather than
elided because the hook already behaves this way — the criterion is a regression guard on a
deliberate decision, not new work, and a matrix that omits it loses the only record that the
behaviour is intentional.

**Row 33 is a documentation criterion and is `[unit]` rather than `[target]`.** What it asserts is
containment — that two named steps appear — which a test can check on a file in the repository. It
is not a quality judgement about the README and must not become one.

**Partial coverage to flag.** FR6 and FR7 were already covered by Epic 47-04 for *rendering* and
*detecting*; this matrix covers *writing*, and neither requirement is complete without both
matrices. FR25 is covered here for one skill of twenty-three — the other twenty-two are Epics 47-06
to 47-09 — and the corpus-level rows 21–26 supersede that epic group's closing assertion rather than
adding to it.
