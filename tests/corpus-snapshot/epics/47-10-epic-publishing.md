# Publishing

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Date**: 2026-08-10  
**Status**: Complete  
**Blocked by**: Epic 47-04-epic-projection-guard-and-merge, Epic 47-09-epic-skills-lifecycle

**Retro applied**: 39 · Testing gaps · Applied — every idempotency and orphan criterion states what the wrong answer would return before its assertion is written; a publish that wrote nothing and one that silently skipped everything both report "no change", so Story 1's second and third criteria are checked against a tree that differs, and Story 5's two must-NOTs each get a planted control  
**Retro applied**: 39 · Codebase discoveries · Applied — Story 5's corpus list is read from FR25 in the spec rather than transcribed into the test, which is why the amendment to twenty-three broke no test and nothing could see the drift; Task 5.1 treats that as the story's load-bearing decision rather than a preference  
**Retro applied**: 39 · Patterns worth reusing · Applied — Story 4's "the skill writes a file itself" and Story 6's "the hook regenerates and stages" are both driven rather than swept: the first against what the publish record says versus what is on disk, the second against a dirty tree's bytes after the hook has run  
**Retro applied**: 33 · Patterns worth reusing · Applied — every count this epic touches is derived from the thing it counts before it is written, including the ones already in the 2026-08-10 spec amendment, which are re-checked rather than trusted

Milestone M5 (AD6, AD11). Everything this epic needs already exists: `project(db, { root, write })`
renders and writes the tree, `dump(db)` returns the `.sql`, and `guard(db, { root })` knows which
files are orphaned. What does not exist is anything that calls them.

**The gap, and how it was found.** FR6 requires the projection to be generated and committed; FR7
requires a guard that regenerates both artefacts and refuses a commit on divergence. Both were
delivered and neither writes. `project` defaults to `write: true`, but the only caller that passes a
root is `src/merge/main.js`, on the conflicted-merge path; the guard calls it with `write: false`
because comparing is its whole job. FR7's prose hands regeneration to the pre-commit hook, and the
hook was deliberately built to refuse and fix nothing — a hook that regenerates silently overwrites
the hand-edit FR7 exists to protect. So the operation had no home.

It was found by running the guard on an empty repository after Epic 47-09 closed, not by reading
either requirement. One `create_spec`, then the guard:

```
dpm: 2 generated files do not match the database:
  docs/specifications/1-spec-smoke.md — is not on disk, and the database produces it
  .dpm/dpm.sql — is not on disk, and the database produces it
...
Regenerate both artefacts to resolve.
```

No command regenerates them. Installing the hook on a real project therefore refuses every commit
and names a fix that cannot be carried out — which is worth stating as the shape it is: not a
missing feature, but two delivered requirements each assuming the other provided the operation.

**This epic adds a skill, and the corpus was closed against one.** `publish` has no CPM counterpart
— CPM's artefacts *are* its files, so it has nothing to regenerate — and it is the first dpm skill
defined by what it adds rather than by what FR25 subtracts. That is not an exception to be argued
for: **dpm is independent of CPM for new functionality**, and a skill dpm needs is a dpm skill. What
has to change is a test, not a principle. Epic 47-09 Story 5 asserted the corpus *equals* CPM's
skill directory, and equality makes every future dpm capability a failure until CPM grows a matching
directory — the coupling this spec exists to remove, arriving through its own suite. The comparison
becomes a subset check over the conversions, and the both-directions check that bounds dpm's corpus
moves to where it belongs: FR25's own enumeration, which mentions CPM nowhere. The spec amendment of
2026-08-10 carries both halves, plus AD11 recording why regeneration is an operation rather than a
side effect.

## One publish implementation [plan]
**Story**: 1  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: FR6, FR7, AD11  
**Retro**: [testing gaps] The dump-last write order was defended by a comment and nothing else — it changes nothing a completed run leaves behind, so no assertion over a finished tree could see it, and a mutation moving the dump first passed the whole suite until a fault-injected test (a dangling symlink, chosen over a permission bit so it holds when the suite runs as root) was written for it.

The function the other three stories call. It exists in pieces already, spread across the merge
path and the guard; this story assembles it in one place and makes merge a caller rather than a
second implementation.

**Acceptance Criteria**:

- Publishing into an empty tree writes every document the database produces and `.dpm/dpm.sql` beside it, and returns a record naming what it wrote [integration]
- Publishing twice from one database state rewrites nothing the second time and reports no change, so a run that changed the tree is distinguishable from one that did not [integration]
- A file that no longer belongs — the old path of a renumbered document, or a document deleted from the database — is removed, and the removal is named in the record separately from the writes [integration]
- The projection and the dump are written by one call, so no sequence of publishes leaves one current and the other stale [integration]
- must NOT — a partial tree is written when one document cannot render, leaving files the guard subsequently diffs clean [unit]
- must NOT — orphan removal is implemented a second time here rather than reusing the guard's rule, so publish and merge can disagree about which files are orphaned [unit]

### Assemble `src/publish/index.js` from the merge path's write block
**Task**: 1.1  
**Description**: `src/merge/main.js:170-186` already does the whole operation — write the dump, project, then remove what `guard()` reports as orphaned. Lift it rather than write it again, and leave the merge path calling the result. The lift is what makes the last must-NOT checkable: with one implementation there is no second rule to disagree with.  
**Status**: Complete

### Return a record rather than a count
**Task**: 1.2  
**Description**: `written`, `unchanged`, `removed`, `inline` — four lists, because every consumer needs a different one and a total tells none of them anything. The second criterion is the reason: "publishing twice changes nothing" is only observable if the second run can say so, and a function returning the number of documents projected reports the same figure both times.  
**Status**: Complete

### Render everything before writing anything
**Task**: 1.3  
**Description**: `project` already does this and Epic 47-04's retro records why — a run that wrote nine files and refused the tenth leaves a stale tree the guard then diffs clean, which is NFR6's false pass arriving from the tool built to prevent it. The task here is to keep that property across the widened operation: the dump is written after the projection succeeds, not before, for the same reason the merge path writes it after the restore.  
**Status**: Complete

### Write tests for One publish implementation
**Task**: 1.4  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`. The orphan case needs a renumber or a delete to produce a file the database no longer accounts for; a hand-placed stray file tests the same code path but not the same claim, so use the real one. The partial-write must-NOT needs a document that refuses to render — a kind with no template, or a marker naming a deleted document — and asserts the tree is untouched, not merely that the call threw.  
**Status**: Complete

## The CLI
**Story**: 2  
**Status**: Complete  
**Blocked by**: Story 1  
**Satisfies**: FR6, AD11, NFR2  
**Retro**: [testing gaps] Two mutations survived and both were the same shape as Story 1's — a claim defended by a stand-in rather than by an assertion. Changing `bin/dpm-publish.js`'s floor exit from 2 to 1 passed the whole suite, because the only test of that path runs a fixture *copy* of the binary; the hole sits under `floor-entry.mjs` and `bin/dpm-mcp.js` too, and has since the server shipped. A test joining each binary to the exit code its fixture stands in for now closes it for all four.

**Acceptance Criteria**:

- `bin/dpm-publish.js` publishes the tree rooted at the path it is given, exits 0, and prints what changed [feature]
- On a Node below the floor it fails with NFR2's message rather than `ERR_UNKNOWN_BUILTIN_MODULE`, the same as the other three binaries [unit]
- A publish that cannot render exits non-zero, names every document that refused, and leaves the tree untouched [feature]
- must NOT — a failure is reported on stdout, so a shell cannot separate success from failure without reading the exit code [unit]

### Entry point with the static node-floor import
**Task**: 2.1  
**Description**: Same shape as `dpm-mcp.js`, `dpm-guard.js` and `dpm-merge.js`, and for the reason each of them documents: ES module imports are hoisted, so anything reaching `node:sqlite` has to arrive through `await import(…)` below the floor check or the check never runs. Unlike the server, stdout here is a terminal rather than a transport.  
**Status**: Complete

### Stream discipline and exit codes
**Task**: 2.2  
**Description**: Report to stdout on success, to stderr on failure, matching `dpm-merge.js`. Floor failure exits 2 as the others do; a render refusal exits 1.  
**Status**: Complete

### Write tests for The CLI
**Task**: 2.3  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`. `tests/support/run-node.js` already spawns a binary under a chosen Node for the floor check; the failure-stream criterion needs the two streams captured separately, since a test reading them merged passes whichever one carries the message.  
**Status**: Complete

## The MCP tool
**Story**: 3  
**Status**: Complete  
**Blocked by**: Story 1  
**Satisfies**: FR6, FR29, AD11  
**Retro**: [patterns worth reusing] `naming.test.js`'s exemption list — three tool names asserted verbatim, with a comment saying a fourth appearing there is a decision rather than a detail — did exactly its job: registering `publish` failed it, and the failure was the prompt to write down *why* a schema-spanning tool takes the exemption. A deliberate tripwire on a list that should rarely grow costs one assertion and converts a silent widening into a conversation.

**Acceptance Criteria**:

- `mcp__dpm__publish` publishes and returns the same record the CLI prints, derived from the same call, so the two cannot report different things about one database state [integration]
- The tool is in the registry, its name is whole words per NFR5, and the conformance test holds over it [unit]
- A publish that cannot render returns an error naming every document that refused, rather than a success carrying an empty record [integration]
- must NOT — the tool composes its own report from the record rather than returning it, so the CLI's wording and the tool's drift apart [unit]

### Register `publish` among the cross-cutting tools
**Task**: 3.1  
**Description**: It sits with `check_integrity` and `search` rather than with the entity tools — it names no table and writes no row. The root it publishes into is the server's own working directory, which is where the database already resolves from; taking a root as an argument would let a skill name a path, which is the filename construction FR25 removes.  
**Status**: Complete

### Write tests for The MCP tool
**Task**: 3.2  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`. The equivalence criterion is the one worth designing: assert the tool's record and the CLI's output are derived from one call by driving both against the same database and comparing, not by asserting each against a fixture — two fixtures agree until someone edits one.  
**Status**: Complete

## The `publish` skill
**Story**: 4  
**Status**: Complete  
**Blocked by**: Story 3  
**Satisfies**: FR25, AD11  
**Retro**: [criteria gaps] "Gates before removing" had no path through a tool that writes and unlinks in one call, and nothing in Stories 1–3 had noticed — the gap only appeared when the skill had to be written against it. `dry_run` was added to `publish` and to the tool, and Story 3's test was corrected from "takes no arguments" to "takes no path", which is what FR25 actually forbids. A criterion that depends on a capability no earlier story was asked to build reads as satisfiable until someone tries.

The twenty-third skill, and the first with no CPM counterpart. Its facilitation is thin but real:
publishing is the one operation in dpm that **deletes** a file, and a deletion is the thing a user
should see before it happens rather than read about afterwards.

**Acceptance Criteria**:

- A `publish` run calls `mcp__dpm__publish` and reports what changed, grouped as written, rewritten and removed [feature]
- A publish that would remove a file names each one and gates before removing, since removal is the only irreversible thing publishing does [feature]
- The run ends by naming the two artefacts to commit and stops there, rather than committing anything [feature]
- `dpm/skills/publish/SKILL.md` contains no filename pattern under `docs/`, no glob, no number-allocation procedure and no progress-file lifecycle, and no SQL keyword or `sqlite3` invocation [unit]
- must NOT — the skill writes or deletes a file itself rather than calling the tool [unit]
- must NOT — the skill reports a tree it did not publish, by describing the database's contents rather than the record the tool returned [feature]

### Write `dpm/skills/publish/SKILL.md`
**Task**: 4.1  
**Description**: FR25's subtractions apply unchanged even though the skill is an addition — it names no path and allocates no number; the tool tells it what happened. The removal gate is the one judgement in the file, and the reason belongs there: a renumber makes an old filename an orphan, so the file about to be deleted may be one the user was reading five minutes ago under a name that has since moved.  
**Status**: Complete

### Write tests for The `publish` skill
**Task**: 4.2  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`. The removal gate is a claim about the skill's own text, asserted the way Epic 47-09 asserted its facilitation criteria — driving the step and checking the prose it produces, with a control that is wrong on purpose. The last must-NOT needs a database whose contents and whose publish record differ, which is any state where a second publish changes nothing.  
**Status**: Complete

## The corpus is bounded by FR25, not by CPM
**Story**: 5  
**Status**: Complete  
**Blocked by**: Story 4  
**Satisfies**: FR25  
**Retro**: [codebase discoveries] The separation was already half-built — the CPM check was written as a subset in Epic 47-09 and the corpus bound already read FR25's list — so what the story actually removed was the *hard-coded 22* standing in for both, and what it added was the ability to drive either check against sets that are wrong on purpose. Neither must-NOT could be shown while the comparisons were inline expressions; extracting them to functions is what turned "the CPM check is not equality" from a claim in a comment into a failing assertion against the live sets.

Epic 47-09 Story 5 asserted the corpus *equals* CPM's skill directory. That test does two jobs at
once — it catches a missing conversion, and it bounds dpm's corpus — and only the first of them is
CPM's to do. Left as equality it fails the moment dpm adds anything, which makes CPM's feature set a
precondition for dpm's; the separation is the story, and `publish` is only what exposed it.

**Acceptance Criteria**:

- Every name FR25 enumerates has a skill directory, and every skill directory is a name FR25 enumerates, asserted in both directions against the spec's list and reading nothing outside dpm [integration]
- Every CPM pipeline stage has a dpm skill, so the half that catches a conversion nobody wrote survives the separation intact [integration]
- A dpm skill with no CPM counterpart passes the CPM comparison, and the comparison names no dpm-side expectation at all [integration]
- CPM's `skills/` directory being absent still fails rather than passing trivially [integration]
- must NOT — the CPM comparison is equality, so a capability dpm adds fails a test that is about CPM's completeness and not about dpm's [integration]
- must NOT — the corpus bound is a count rather than the enumeration, so any extra directory satisfies it as long as the total is right [unit]

### Separate the two checks `corpus.test.js` currently performs as one
**Task**: 5.1  
**Description**: It asserts `22` in four places and compares two sets for equality. Two tests replace it. The **corpus bound** reads FR25's enumerated list and compares it with the directories in both directions, reading nothing outside dpm — that is what closes the undeclared-extra hole, and it closes it without CPM. The **conversion check** asserts CPM's set is a subset and stops there; it makes no claim about dpm's extras and must not be written in a way that could grow one. The list comes from FR25 rather than from a literal, for the same reason the enumeration exists at all: a second hand-kept copy drifts from the first.  
**Status**: Complete

### Write tests for The corpus is bounded by FR25, not by CPM
**Task**: 5.2  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`. Both must-NOTs need planted controls: a dpm-only directory, which must pass the CPM comparison and fail the corpus bound until FR25 names it; and a name swapped for another with the total unchanged, which a count cannot see. The first control is the story — a test written to the old shape fails on it, which is the only evidence that the separation actually happened rather than being described.  
**Status**: Complete

## The guard names a fix that exists
**Story**: 6  
**Status**: Complete  
**Blocked by**: Story 2  
**Satisfies**: FR7, NFR6  
**Retro**: [testing gaps] The story's own must-NOT is a claim about the *test* rather than about the code — "nothing asserts the command exists" is satisfied by any string assertion, so the only way to close it is to ask the filesystem. Driving it proved the point: pointing `PUBLISH_COMMAND` at a file that does not exist failed exactly one test, and every assertion that merely matched the message's text went on passing. The hook must-NOT needed the same treatment from the other side — a source sweep for a write would pass on a hook that shells out to something that writes, so it is asserted on a dirty tree with a hand-edit that must survive byte-for-byte.

**Acceptance Criteria**:

- The guard's divergence message names the command that resolves it, and that command exists on disk at the path named [feature]
- A write followed by a publish leaves the guard passing; the same write without the publish leaves it naming both artefacts [feature]
- must NOT — the pre-commit hook regenerates and stages the result, overwriting a hand-edit rather than refusing the commit [feature]
- must NOT — the guard's message names a command, and nothing asserts the command exists, so the diagnostic can outlive the binary it points at [unit]

### Replace "Regenerate both artefacts to resolve" with the command
**Task**: 6.1  
**Description**: `describe()` in `src/guard/index.js` currently tells the user what to do without saying how. The message names the CLI, and the skill beside it for a user already in a session. The last must-NOT is why the assertion is against the filesystem rather than against the string: a message naming `dpm-publish` is correct today and silently wrong the day the binary is renamed, which is exactly the class NFR6 names.  
**Status**: Complete

### Write tests for The guard names a fix that exists
**Task**: 6.2  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`. The hook must-NOT is asserted against the hook's behaviour on a dirty tree — that it exits non-zero and the edited file is byte-identical afterwards — not against the absence of a write call in its source.  
**Status**: Complete

## A fresh project, start to commit [plan]
**Story**: 7  
**Status**: Complete  
**Blocked by**: Story 5, Story 6  
**Satisfies**: FR6, FR7, NFR6  
**Retro**: [testing gaps] The must-NOT's three limbs are not equally hard to satisfy, and driving them showed which one was carrying the story. Installing the hook as a *copy* fails every test in the file — the copy breaks `$0` resolution, so nothing commits — which looks like coverage and is not: it never reaches the assertion. A hand-written stub hook that invokes the guard correctly passes every commit, and only the `realpathSync` comparison notices the shipped hook was never involved. The planned mutation for orphan removal was also mispredicted: it does not fail the first criterion's set-equality check, because that criterion's sequence publishes once into an empty tree and no orphan can exist in it. The orphan case lives entirely in the must-NOT, which is the right place for it but was not where the plan expected the failure.

The story that decides whether any of this closed the gap. Every criterion above is checked against
a component; this one is checked against the sequence a new user actually performs.

**Acceptance Criteria**:

- An empty repository, a skill run that writes, a publish and a commit: the hook accepts it, and the tree holds exactly what the database produces and nothing else [feature]
- The same sequence with the publish omitted is refused, and the message names the command that would have fixed it [feature]
- `dpm/README.md` names both first-run steps — installing the hook, and publishing before committing — so the sequence is discoverable without reading a hook comment [unit]
- must NOT — the end-to-end run passes against a stubbed publish, a stubbed guard, or a database with one document, so the sequence is asserted on a corpus too small to have an orphan in it [feature]

### Write the first-run section of `dpm/README.md`
**Task**: 7.1  
**Description**: The install today is a `ln -s` documented only inside the hook it installs, and the README still reads "Under construction". Both first-run steps belong there. Keep it to what a new user must do; the reasoning lives in AD11 and in the hook's own comment, and repeating it here is a second copy to keep true.  
**Status**: Complete

### Write tests for A fresh project, start to commit
**Task**: 7.2  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`. `tests/support/git.js` already builds a real repository, which is what the hook criteria need. The must-NOT is the story's whole value: a one-document corpus has no orphan and no ordering, so the run has to carry enough documents that a renumber moves a file — otherwise it asserts the sequence works on the only case where nothing can go wrong.  
**Status**: Complete

## Notes

**Raised, not claimed by this epic.** These surfaced in the same readiness check and none of them
is publishing's business:

- `dpm` sits at `0.1.0` in `dpm/package.json` and `dpm/.claude-plugin/plugin.json`, and in the  
  marketplace entry, with spec 47 otherwise delivered. A version decision is Chris's.
- Root documents rendered unpadded — `1-spec-smoke.md` where CPM writes `01-`. FR5 makes numbering  
  a database concern and says nothing about width, so it was recorded as possibly intended rather  
  than as a defect. **Fixed 2026-08-10** — Chris's decision, at his direction, outside any story:  
  a two-digit minimum on the root number, matching the sequence half, which was padded already.  
  The reason is lexical sort rather than appearance — a directory lists in byte order, so unpadded  
  the tenth document files between the first and the second. Twenty-two assertions across seven  
  suites moved with it, which is the evidence the shape is asserted rather than incidental.
- `dpm/bin/dpm-merge.js` was mode 644 where the other three binaries are 755, from Epic 47-08. It  
  has a shebang, so the mode was the only thing stopping it being run directly; every caller today  
  reaches it as `node dpm-merge.js`, which is why nothing had failed. Noticed while writing Story  
  2's cross-binary floor test, which reads all four sources and had no reason to look at modes.  
  **Fixed 2026-08-10** — `chmod 755`, at Chris's direction, outside any story. **Guarded  
  2026-08-11**, also at his direction: `plugin.test.js` holds the set of files carrying a shebang  
  equal to the set git records as `100755`. Derived from the shebang rather than from a list of  
  four paths, so a fifth binary is covered the day it arrives; and read from the **index** rather  
  than from the filesystem, because the plugin ships as a clone and a local `chmod` fixes a  
  working tree while shipping nothing. Confirmed by `git update-index --chmod=-x` on one binary,  
  which fails that test alone and no other — with the file still `755` on disk, which is exactly  
  what a `statSync` check would have passed on.  
  Three fixtures were `chmod`-ing `dpm/hooks/pre-commit` to 755 before symlinking it, which is a  
  test writing to a repository file and, worse, supplying the one property a real install has to  
  have arrived with. Removed the same day — which exposed a second defect underneath. With the  
  repair gone, `chmod 644` failed only the three tests requiring a *refusal*: a skipped hook lets  
  every clean-tree commit through, so eight tests asserting acceptance were passing with no guard  
  running at all. **Fixed by `tests/support/commit.js`**, which every fixture that commits now  
  uses: it reads stdout **and stderr** and asserts the guard reported on whichever path was taken.  
  git had been saying so the whole time — `hint: … hook was ignored because it's not set as  
  executable` — on stderr, the stream `execFileSync`'s return value drops. The same mutation now  
  fails eleven tests by name. The generalisation is worth keeping: an acceptance asserted by exit  
  code alone cannot tell approval from absence, and the evidence separating them is often on the  
  stream the fixture is not reading.
- Nothing asserted that a first start puts the **whole** agent roster in the database. Two personas  
  were exercised by name and the other seven by nothing, so a seed that stopped short would have  
  shipped a working install with a thin cast. Noticed during the temp-directory first-run exercise,  
  where the roster is the part a user meets by name. **Guarded 2026-08-11**, at Chris's direction:  
  two tests in `vocabulary.test.js` — one asserting that `start()` (not a fixture calling  
  `applyVocabulary`) lands every shipped term in every vocabulary, counted against the manifest  
  rather than against a transcribed total; one looping the *table's own rows* through both columns  
  that name a persona, so a tenth is covered the day it is seeded. Dropping one persona from the  
  seed fails the first alone; excluding one persona from `document_agent` fails the second alone.

**Why `publish` is not a `[target]` story.** The whole of it is checkable in a real repository with
a real hook, which `tests/support/git.js` already builds. Nothing here needs a deployment.

## Lessons

Seven stories, all Complete. The suite moved from 547 passing to 591, none failing. Every story's
mutations were driven and reverted; five survivors were found and closed across Stories 1–4, and
none survived Stories 5–7.

**Testing gaps.** Three of this epic's criteria are claims about a *test* rather than about the
code, and each needed a different instrument. Story 6's "nothing asserts the command exists" is
satisfiable by any string match, so the assertion had to reach the filesystem — pointing
`PUBLISH_COMMAND` at a missing file failed exactly one test while every text assertion went on
passing. Story 7's "not a stubbed guard" is the same shape: a hook installed as a *copy* fails
every test in the file, which looks like coverage but never reaches the assertion, while a
hand-written stub that works correctly passes everything except the `realpath` comparison. Story 2
found the general case — a floor-check mutation in `bin/dpm-publish.js` passed the whole suite,
because the only test that exercised the refusal ran a fixture *copy* of the binary. The same hole
sat under `bin/dpm-mcp.js` and was closed with it.

**Criteria gaps.** Two criteria had no path through the code as written, and both were found by
trying to test them rather than by reading them. Story 4's "gates before removing" cannot be
satisfied by a tool that writes and unlinks in one call, so `dry_run` was added — a preview, not a
fourth entry point, which is why FR25's subtraction was untouched. Story 1's record needed
`rewritten` as a subset of `written` rather than a fifth disjoint list, because the distinction
between "arrived" and "moved" is destroyed at the moment of writing and cannot be recovered after.

**Codebase discoveries.** The corpus separation Story 5 performs was already half-built — the CPM
check was written as a subset in Epic 47-09 and the bound already read FR25's list. What was
actually standing in for both was a hard-coded `22`, and neither must-NOT could be shown while the
comparisons were inline expressions. Extracting them to functions is what turned "the CPM check is
not equality" from a comment into a failing assertion.

**Patterns worth reusing.** Fault injection beats permission bits: Story 1's write-ordering
criterion is asserted with a dangling symlink, which holds when the suite runs as root and a
chmod-based fixture does not. And a criterion whose subject is a *process* has to be asserted
against one — Story 7's publish is spawned rather than imported precisely so an in-process
substitute could not satisfy it.

**Complexity underestimates.** One planned mutation was mispredicted: dropping orphan removal does
not fail Story 7's first criterion, whose sequence publishes once into an empty tree where no
orphan can exist. The orphan case lives entirely in that story's must-NOT. The lesson is narrow and
worth carrying — a "the tree holds nothing else" assertion only bites on a tree that has had
something removed from it.
