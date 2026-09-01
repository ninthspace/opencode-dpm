# Shared documents through the server

**Number**: 02-03  
**Source spec**: 02  
**Status**: complete  

## Story 1 — The shared-document tool

**Status**: complete  
**Blocked by**: Story 2, Story 4  

### Acceptance Criteria

- The tool returns the byte content of the package's `shared/skill-conventions.md` for the name it is given, and refuses an unknown name rather than returning empty. `[unit]`
- `status-model.md` is served by the same tool under the same name-to-document mechanism, so the shared surface is one tool rather than one tool and one special case. `[unit]`
- The tool's answer is identical under both hosts: it reads from the installed package and takes nothing from the host context. `[unit]`
- must NOT — A second copy of either shared document exists anywhere in the tree. Control: a planted duplicate, reported by path. `[unit]`

### Task 1 — Implement the shared-document tool with its refusal

**Status**: complete  

Name-to-document over the package's `shared/` directory. The refusal on an unknown name is the point, not an edge case — it is what stops the mechanism reproducing the silent omission inside the tool boundary.

### Task 2 — Write tests for The shared-document tool

**Status**: complete  

Covers the four criteria tagged `unit`, including the planted-duplicate control for the must-not.

### Retro

- The 184th tool could not be added without reshaping a test that had been correct for two epics. `tests/tool-naming.test.js` asserted the ported surface *equals* v0.7.0's oracle — 183 tools, name for name, description for description — and `tests/parity-v070.test.js` forbids rewriting that oracle, correctly: regenerating a fixture is how any parity finding gets disposed of without a line of the test being deleted. The two together left no room for a tool the port adds on purpose, which ADR 02-01 requires.

The resolution was to change the shape of the claim rather than either side of it: v0.7.0's surface is a **floor**, not a ceiling. Every one of the 183 must still be present and byte-identical; anything else must be named in an `ADDED` list carrying what added it. That is `tests/suite-integrity.test.js`'s existing INHERITED/ADDED idiom, reused rather than invented, and it preserves the property actually worth defending — the surface may not grow *silently*. The oracle was not touched, which `git status` confirms and `parity-v070.test.js` re-checks on every run.

Two consequences the equality had been hiding. The per-tool comparison had to move from index-matching to name-matching: an added tool sorting into the middle would otherwise offset every comparison after it and report 180 failures for one addition. And the subset direction needed its own control — a subset check passes trivially over an empty oracle, so the reading is now driven in both directions with a planted rewording and a planted loss.

Epic 02-03 story 1. Suite 1145 → 1154, all green; typecheck, module sweep and skill-body check clean.

## Story 2 — Route all twenty-four references through the tool

**Status**: complete  
**Blocked by**: Story 3, Story 4  

### Acceptance Criteria

- Every one of the twenty-three bodies reaches the shared conventions through the tool, and none names a filesystem path to `shared/`. Control: a planted body carrying the old path form, which the check reports by name rather than by count. `[unit]`
- The single reference to `status-model.md` reaches it through the same tool. `[unit]`
- must NOT — A skill body names a host. Control: a planted host name in a body, reported by skill. `[unit]`

### Task 1 — Rewrite the twenty-three conventions references to call the tool

**Status**: complete  

One line per body. The surrounding procedure prose is not touched.

### Task 2 — Rewrite the single status-model reference to the same form

**Status**: complete  

The twenty-fourth reference. Separated so the one-off is not lost inside the batch of twenty-three.

### Task 3 — Write tests for Route all twenty-four references through the tool

**Status**: complete  

Covers the three criteria tagged `unit`. Both checks report by name rather than by count, so a miss says which body.

### Retro

- Rewriting twenty-four references cost four edits outside the twenty-four, and each was a check that had been written against the mechanism being replaced rather than against the property it was defending.

Two of them were exact tool-set assertions. `tests/skill-publish.test.js` pinned dpm-publish's surface at exactly `['publish']` and `tests/skill-templates.test.js` pinned dpm-templates at exactly two tools — both correct while the conventions arrived by a *path*, and both broken the moment every body gained a tool call. The temptation was to widen the expected list; that would have said these skills need one more tool than they do. What was done instead is subtract `read_shared_document` explicitly and assert it was there to subtract, so a skill that stops calling for its conventions still fails rather than slipping through the exemption. The constant lives once, in `tests/support/skills.js`, with the reason attached.

One was `tests/corpus.test.js`'s claim that a body naming **Conversational Output** must also name the file that section is in. The claim survives unchanged; what satisfies it is now the tool call. The other was prose: the shared conventions' own opening paragraph described itself as a file a skill reads, which stopped being true of the corpus it governs.

The remaining four suite failures are all one thing — `resolveSupportingPaths`'s own controls, each of the form "and here is proof the rewrite had something to rewrite". With zero references left they fire correctly. They are story 3's subject, not a regression, and they are reported here rather than absorbed.

A near miss worth recording: the first draft of the replacement prose wrote "the whole of ADR 02-01", and `corpus.test.js` refused it — the shared conventions may not name an artefact by a number a renumber would move. The rule caught a sentence written by the run that was meant to be following it.

Epic 02-03 story 2. Suite 1160 tests, 1156 pass, 4 fail — all four are story 3's mechanism. typecheck, module sweep and skill-body check clean.

## Story 3 — Delete the rewrite and bring v2 onto the same mechanism

**Status**: complete  
**Blocked by**: Story 4  

### Acceptance Criteria

- `resolveSupportingPaths` and the `SHARED_REFERENCE` rewrite are gone from `src/plugin/`. Control: a planted reintroduction fails the check. `[unit]`
- A skill body as the v2 registrar presents it is byte-identical to the file on disk. `[unit]`
- No code path under `src/` transforms skill content at registration time, under either host. Control: a planted transform fails the check. `[unit]`

### Task 1 — Delete resolveSupportingPaths and the shared-reference rewrite

**Status**: complete  

Runs only after story 2, when no body still needs the rewrite. Also closes the external-directory rejection standing open on retro 04 under v2.

### Task 2 — Write tests for Delete the rewrite and bring v2 onto the same mechanism

**Status**: complete  

Covers the three criteria tagged `unit`, with the planted reintroduction and the planted transform as controls.

### Retro

- Deleting `resolveSupportingPaths` took forty lines out of `src/plugin/skills.ts` and turned four tests from claims about a transform into claims about its absence — which is the harder thing to check and where the work actually was.

Three of the four inverted rather than being deleted, and the inversions are the record of what happened. `tests/v1-skills.test.js` asserted every body's shared reference had been rewritten to an absolute path that exists, with a control counting the substitutions; it now asserts every registered body is byte-identical to its file, with a control that the comparison can come out false. `tests/skill-supporting-files.test.js` asserted all twenty-three sources still carried the relative form — because the substitution ran at registration and what a maintainer edited was unchanged — and now asserts none does. `tests/publish-package.test.js`'s must-NOT rested on the rewrite throwing when a shared document was missing from the tarball; it now drives `read_shared_document` against the extracted package and deletes a document to see the refusal. That last one got stronger by moving: the old check failed loudly at load, and a tarball missing `shared/` now loads perfectly and fails on the first call of every session, so the check is aimed at where the failure actually is.

The sweep for the deleted rewrite is deliberately not a search for its name. A function deleted and reintroduced under another name passes a name search and fails the criterion, and renaming is the likeliest way it comes back — somebody needs one path fixed and writes four lines rather than reaching for a function that no longer exists. So it matches the operation: a substitution applied to a skill body, and the reference pattern that would drive one. It also had to strip comments first, because four modules explain the removal and name the function while doing so — a sweep over raw source would report those, and the cheapest way to make it pass would be to delete the explanations.

**A user-facing falsehood surfaced that no criterion covered.** The README's "The one entry to set" told every user to grant `external_directory` on the clone's `shared/*`, because every skill body read a file outside their project. That stopped being true the moment story 2 landed, and no test noticed — `permission-entries.test.js` asserted the block was *present*, so it was actively holding the stale instruction in place. Raised as a change moment rather than absorbed; Chris chose to fold it into this story on the grounds that story 3's own task says it closes the external-directory cost retro 04 recorded, and a README recommending a permission for a deleted mechanism is that cost still open. `HOST_ACTIONS` is now empty with the history attached, and the exact-set assertion gained a planted block, because an empty expected set is satisfied by a reader that finds nothing at all.

Epic 02-03 story 3. Suite 1161 tests, all pass. typecheck, module sweep, skill-body check clean. Refactoring pass: nothing to consolidate — the deletion is the consolidation, and the dead SHARED_DIRECTORY re-export from skills.ts went with it.

## Story 4 — Verify cross-story integration for Shared documents

**Status**: complete  
**Blocked by**: —  

### Acceptance Criteria

- Taking each of the twenty-three bodies, extracting the reference it carries, and calling the tool with that name returns the conventions text — for all twenty-three. `[integration]`
- The same round trip performed through the callable route — the `server` export, which is v1's only handle on the MCP registry — returns bytes identical to the one performed through the object route, the `{id, setup}` default export whose `skill.transform` is v1's only handle on the skill registry and which `tests/support/host-contexts.js` records as the v2-shaped API v1 bundles alongside it. Amended from "a v1 stub context" and "a v2 stub context": there is one recorded host context, taken off OpenCode 1.18.25, and v2 exists in this port only in the type graph, which is erased before evaluation. The two protocol routes are the real axis dpm ships a separate module for, and the divergence they can produce — two entries resolving different trees — is the one epic 02-01 story 5 was written to catch. `[integration]`

### Task 1 — Write the cross-story round-trip test

**Status**: complete  

Body to reference to tool to text, for all twenty-three under both host stubs. Distinct from story 1's and story 2's tests, which each check one end of that trip.

### Retro

- The story that was supposed to be a formality found the gap the other three could not see between them, and it is worth naming precisely because all three passed.

Story 1 asked whether the tool answers a name. Story 2 asked whether every body names the tool. Story 3 asked whether anything still transforms a body. **None of them ever took a name out of a body and put it into the tool.** A corpus asking for `conventions` against a tool serving `skill-conventions` satisfies every assertion in all three files, and no dpm skill would ever read its conventions again — the exact silent omission this epic exists to close, reassembled out of three green checks. So the round trip extracts the argument from the registered prose rather than writing it down, and the control plants a body asking for a document that is not there.

**The criterion's second half named something the repo does not have, and it was a gate rather than a judgement call.** It asked for the trip under "a v1 stub context" and "a v2 stub context". There is one recorded host context — `V1_CONTEXT`, probed off OpenCode 1.18.25 — and v2 lives only in `src/plugin/hosts.ts`'s type graph, which is erased before evaluation. Building a v2 double would have meant writing it from SDK types, which is precisely what `support/host-contexts.js`'s own header says it refused to do, and is how the bun regression stayed green through epic 02-01. Chris chose the reading that maps onto something real: v1's two plugin protocols, which dpm ships a separate module for. The criterion was amended to say so.

That turned out to be the better axis anyway. The two routes are the only place a shared-document surface can break invisibly — the skills registering from one tree while the server serves another tree's `shared/` — and it is the same divergence epic 02-01 story 5 was written to catch. The test drives bodies from the object route against the tool from the registry the callable route's command would build, and then checks that the bytes both routes agree on are the file's, because two routes agreeing is not the same as two routes being right.

Epic 02-03 story 4. Suite 1165 tests, all pass. typecheck, module sweep, skill-body check clean. Refactoring pass skipped: the story added one test file and touched no implementation.

## Dependencies

- blocks → 02-05

## Retro Applied

- 07 · codebase-discoveries · applied — Applied to story 1's must-NOT, "a second copy of either shared document exists anywhere in the tree. Control: a planted duplicate, reported by path." That is a tree sweep asserting an absence, and epic 02-02 found four such assertions that had never reported anything and never could. So the duplicate check is driven against a planted second copy in a temporary tree before it is asserted over the real one, the comparison is by content rather than by filename — a copy renamed is still a copy — and containment uses `withinPackage` rather than a path prefix.
- 03 · codebase-discoveries · applied — The `external_directory` auto-reject is this epic's premise, not background. A design verified against the registry is not one verified against a session doing what the registration told it to: all 23 bodies point at an absolute path outside the project, and the host refuses the read. So story 1's tool is judged by whether it removes the need for any body to name a path the host can refuse — not by whether it returns bytes. Carried into Step 1's exploration of every story: the question asked of each change is what a real session does with it, not what the registry holds.
- 03 · complexity-underestimates · applied — Applied as a standing rule for every sweep this epic writes: no absence is asserted until a control has shown the same reading can produce a non-empty answer. Bears hardest on story 3, which deletes `resolveSupportingPaths` — a sweep for "no body names an absolute shared path" would return empty both when the routing succeeded and when the sweep stopped matching, and those are indistinguishable. The instrument also gets its own estimate: `tests/support/skills.js` and `tests/support/body-reads.js` observe the bodies, and epic 02-02 has just shown that the cost of a body-wide change lands in the comparisons those files hold rather than in the reads.
- 06 · complexity-underestimates · applied — Applied to story 2's exploration before any substitution is made. "Route twenty-four references through the tool" reads as twenty-four edits; the README install route read as one section and was load-bearing in six places with two test files holding it there. So story 2 opens by enumerating what the current absolute-path form is load-bearing in — the skill bodies, `resolveSupportingPaths`, the body-check script, the suite's shared-file assertions, and the README's `external_directory` guidance — before the first body is touched, and the enumeration goes in the plan rather than being discovered by a red suite.
- 06 · testing-gaps · applied — Applied to Step 5 of story 1, and raised now rather than after the tests are written. The obvious check on a document-serving tool is that it returns what the reader returned — four readings of one source, agreeing with each other, which is not evidence. At least one check must exercise the outside: read `shared/skill-conventions.md` off disk with `readFileSync` in the test and compare bytes against the tool's answer, and drive the refusal path against a name that is genuinely not a document rather than against a mocked absence.
