# Skill identity

**Number**: 02-02  
**Source spec**: 02  
**Status**: complete  

## Two criteria amended at story 1's plan gate

This epic was planned before epic 02-01 chose embedded skill sources, and two of story 1's criteria carried premises that choice invalidated. Both were amended before any work started; the work each measures is unchanged.

**Criterion 1 named a host requirement that does not exist.** It read "…whose front-matter `name` is that same string, which is what OpenCode requires of the pair". OpenCode requires nothing of that pair. dpm registers `{type: 'embedded', skill: {name, description, location, content}}` — the host is handed a computed name and never opens the skill directory or parses its front matter. Epic 02-01 demonstrated exactly this live under 1.18.25: all twenty-three registered as `dpm-<skill>` from directories named *without* the prefix, which is the mismatch the criterion described as forbidden, and the host accepted it. The rename is still worth doing, but for dpm's own reasons — one identity declared in both places a reader looks, and story 2's removal of `ID_PREFIX`, after which the registered name comes straight off disk. The clause was replaced with that reason.

This is retro 06's *scope-surprises* lesson landing a second time: a requirement written to fence a risk can be discharged by the risk not existing.

**Criterion 3 forbade an edit its own second clause required.** It permitted the rename to change "only the directory name, the front-matter `name`, and cross-references between bodies", and required the skill-body check to pass. `scripts/skill-body-check.ts` holds `RECORDED_GAP = { skill: 'ralph', … }` and compares it against the directory name it reads off the tree; rename the directory and the recorded gap stops being subtracted and the check fails. Satisfying the second clause needs an edit the first clause excluded. The permitted surface was widened to four items, naming the code that indexes a skill by its directory name.

This is retro 03's *criteria-gaps* lesson from the other side: an enumerated permission goes stale in exactly the way an enumerated prohibition does.

## Story 2's criteria named a registrar epic 02-01 removed

Two of story 2's criteria were written against a two-host plugin: one said "the v2 registrar registers each skill under the `name` its front matter carries", the other "the registered v2 id for each skill is the same string as before". Epic 02-01 established that OpenCode v1 is the host and that its two plugin protocols cannot live in one module, and collapsed the registration onto `src/plugin/registration.ts` feeding two entries. There is no v2 registrar to name, and what v1 keeps of a skill is `name` — an `id` passed alongside is dropped by the host's own decode.

Both were amended to drop the host qualifier: "Registration registers each skill under the `name` its front matter carries", and "the registered name for each skill is the same string as before the change". The work each measures is untouched — the prefix stops being composed at registration and comes off disk instead, and every skill ends up registered under exactly the string it was registered under before.

Worth separating from the wording: the second criterion is the one that makes this story safe to do at all. ADR 01-05 records that a registered id is effectively permanent from the first publish, because renaming it breaks every invocation. Moving where the prefix originates is only acceptable while the string that comes out is byte-identical, and that is what the criterion pins.

## Story 3's no-per-file-edit clause could not hold, and should not have

Criterion 1 asked that the helper yield the prefixed names and that "every test file importing it passes with no per-file edit made for the rename". Thirty-five files do. Seven cannot, and the reason is that they hold deliberate hand-kept transcriptions: `corpus.test.js`'s `NAMED`, `skill-port.test.js`'s `RECORDED_GAP`, `skill-reference-input.test.js`'s `SEVEN`, the `EXEMPT` maps in `skills-resume.test.js` and `skills-gates.test.js`, and a `SKILL` constant each in `skill-epics.test.js` and `skill-spec.test.js`.

Those lists are transcriptions on purpose — each carries a paragraph arguing why it must not be derived, and `skill-reference-input.test.js` goes further and asserts that `SEVEN` is a literal array with no call in its declaration. Deriving them to satisfy the clause would delete the property they exist for, and would break the check that keeps them honest.

The clause was replaced with the distinction it was missing: reaching a skill *through* the helper costs nothing, and a transcription is updated, because a list that cannot be edited is not a transcription.

## Story 1 — Rename the twenty-three skills to dpm-*

**Status**: complete  
**Blocked by**: Story 2, Story 3, Story 4  

### Acceptance Criteria

- Each of the twenty-three skill directories is named `dpm-<skill>` and holds a `SKILL.md` whose front-matter `name` is that same string, so that a skill declares one identity in both places a reader looks for it and story 2 can take the registered name straight off disk. `[unit]`
- Every front-matter `name` matches `^[a-z0-9]+(-[a-z0-9]+)*$`. Control: a planted name carrying an underscore or a capital fails the check. `[unit]`
- The rename changes only the directory name, the front-matter `name`, cross-references between bodies, and the code that indexes a skill by its directory name; the existing skill-body check passes unchanged over all twenty-three. `[unit]`
- must NOT — Two skills share a front-matter name. Control: a planted duplicate name fails the check. `[unit]`

### Task 1 — Rename the twenty-three skill directories to dpm-*

**Status**: complete  

Directory names only. Every path constant that follows from them belongs to story 3.

### Task 2 — Rewrite the twenty-three front-matter names to match their directories

**Status**: complete  

The `name` field alone. Procedure prose, gate wording and the conventions reference are not touched here.

### Task 3 — Update cross-references between skill bodies to the new names

**Status**: complete — Cross-references needed no edit: all twenty-three were already written `dpm-<name>` in every body and in every `description`, because the registered id already carried the prefix. The edit the task did carry is `scripts/skill-body-check.ts`, whose `RECORDED_GAP.skill` indexes a body by its directory name.  

Addresses the handoff lines one skill uses to name another. Scope is the reference, not the sentence around it.

### Task 4 — Write tests for Rename the twenty-three skills to dpm-*

**Status**: complete  

Covers the four criteria tagged `unit`, each with the planted control the criterion names.

### Retro

- The rename itself was twenty-three `mv`s and twenty-three one-line edits, and the plan's own surface enumeration under-counted the fallout by four to one. Retro 03's lesson was applied deliberately — `skillSource` was made to resolve a bare name to its `dpm-` directory *before* the directories moved, which is what kept roughly forty test files from going red on the spot. It worked, and the plan then predicted three files would still fail. Eleven did, across twenty-four tests: the corpus list, `skill-port`'s recorded gap and `skill-invocation`'s composition were the three that were foreseen, but `body-asks`, `body-corpus`, `body-reads`, `skill-epics`, `skill-spec`, `skill-reference-input`, `skills-gates` and `skills-resume` were not, and each one holds a *bare-name* assumption of its own rather than reading through the instrument. The instrument absorbed the reads; what it could not absorb was every file that compares a name it got from the instrument against a literal it wrote down.

Two of those literals are worth separating, because they fail in opposite ways. `guard-fix.test.js` ran the composition backwards — `PUBLISH_SKILL.slice(ID_PREFIX.length)` — to turn an id back into a directory, and broke loudly the moment the round trip stopped being needed. `scripts/skill-body-check.ts` compared `RECORDED_GAP.skill === 'ralph'` against a directory name and would have gone *quiet*: a valid string matching nothing, the exemption silently unapplied, and five stop-hook references surfacing as five breaches of a corpus nobody had touched. Library lesson 04 names exactly this — after a rename, grep for the predicates that filter on the old form separately from the literal name — and it was that instruction, not the failing suite, that found the second one before it fired.

The other thing the story established is that the criterion's stated premise was false. OpenCode requires nothing of the directory/front-matter pair: under the embedded-source route the host is handed `{name, description, location, content}` and never opens the directory. Epic 02-01 had already demonstrated the exact mismatch live — twenty-three skills registered as `dpm-<skill>` from unprefixed directories, accepted by 1.18.25 — so the evidence was in hand before the story started and only needed reading. The rename is still right, for dpm's own reasons, but a story built on the stated reason would have gone looking for a host constraint to satisfy and found nothing to aim at.

## Story 2 — Stop the v2 registrar prefixing

**Status**: complete  
**Blocked by**: —  

### Acceptance Criteria

- Registration registers each skill under the `name` its front matter carries, applying no prefix of its own at registration time. `[unit]`
- The registered name for each skill is the same string as before the change, so ADR 01-05's namespace defence holds by a different route and with the same result. `[unit]`
- `ID_PREFIX` and any other registration-time prefixing constant is gone from `src/plugin/`. Control: a planted re-introduction fails the check. `[unit]`

### Task 1 — Register on the front-matter name and delete the id prefix

**Status**: complete  

The registered id must come out the same string it did before; only where the prefix originates changes.

### Task 2 — Write tests for Stop the v2 registrar prefixing

**Status**: complete  

Covers the three criteria tagged `unit`, including the planted re-introduction control.

### Retro

- Deleting `ID_PREFIX` took four lines in `src/`. What it actually cost was `DiscoveredSkill.id`, which turned out to be reachable from seven places across five test files — and every one of them read `skill.id` on an object that now returns `undefined` rather than throwing. Two of the seven were caught by a `deepEqual` and reported as `[undefined, undefined, …]`; the other five were `undefined` interpolated into an assertion *message*, where the assertion still passes and the failure text, if it ever fired, would say "undefined is registered from …". Those were found by grepping for the field, not by running the suite. The field was two answers to one question — `id` held the prefixed string, `name` the bare one — and every caller had to know which one it wanted; deleting it is the reason the seven sites existed to find.

The criterion asked for the constant to be gone from `src/plugin/` with a planted-reintroduction control, and writing that check honestly is where the real thinking went. `ID_PREFIX` still appears five times under `src/`, in the doc comments explaining that it was removed and why. A sweep for the word reports all five, and the only way to quiet it is to delete the explanations — a check that passes by destroying the record of why it exists. So the sweep strips comments first, and it reads for a *declaration* of a namespace fragment rather than for the identifier: `/(const|let|var)\s+[A-Z_]*(PREFIX|NAMESPACE)[A-Z_]*\s*(:[^=]+)?=\s*['"`]/`. Retro 03's criteria-gaps lesson decided that shape — a check naming `ID_PREFIX` would be walked straight past by the same constant called `SKILL_PREFIX`, which is what anyone reintroducing it would actually write. The control asserts both directions on the same predicate: four reintroduction spellings caught, five innocent lines including two real doc comments left alone.

One criterion here was load-bearing in a way its wording understates. "The registered name for each skill is the same string as before the change" is what makes moving the prefix safe at all, because ADR 01-05 records a registered name as effectively permanent from the first publish. It is also the one list in the epic that may not be derived from the tree — deriving it would make the check read its answer off the thing under test — so the twenty-three published ids are transcribed, with a comment saying why that is the exception.

## Story 3 — Move the suite's skill-name assumptions

**Status**: complete  
**Blocked by**: —  

### Acceptance Criteria

- `tests/support/skills.js` yields the twenty-three prefixed names, every test file that reaches a skill through the helper passes untouched, and the files holding a hand-kept list of skill names are updated to the new ones. `[unit]`
- `tests/corpus.test.js`'s transcribed name list holds the twenty-three prefixed names and still fails when the tree and the list disagree. Control: a planted extra skill directory fails it. `[unit]`
- No test is lost or skipped to the rename: every test file the suite shipped before this epic is still in the suite, still unskipped, and still declaring cases — read file by file rather than against a suite total. A passing count is not the measure: it reports the state of the working tree's index as much as the suite's, and a rename that has not been staged moves it without a test having been lost. `[unit]`

### Task 1 — Move tests/support/skills.js off the unprefixed names

**Status**: complete — Two support-module edits (`skills.js`'s PREFIX + tolerant `skillSource`, `body-reads.js`'s `prefixed` applied to CLASSIFICATION on construction) covered thirty-five files plus six body-test failures. Seven files holding a hand-kept name registry were edited: `body-reads.test.js` (REPORTED_CLEAN and two site keys), `skill-port.test.js`, `skill-reference-input.test.js`, `skills-resume.test.js`, `skills-gates.test.js`, `skill-epics.test.js`, `skill-spec.test.js`. One predicate had to move with them — `SEVEN`'s literal-check regex was `[a-z]+`, which would have gone on matching nothing.  

The shared helper roughly forty test files import. Scope is the helper, so those files need no edit of their own.

### Task 2 — Update the corpus transcription to the prefixed names

**Status**: complete  

The list stays transcribed rather than derived — it is the control that catches a skill silently leaving the tree.

### Task 3 — Write tests for Move the suite's skill-name assumptions

**Status**: complete  

Covers the three criteria tagged `unit`, including the planted extra-directory control and the suite-count floor.

### Retro

- The criterion asked for a suite-passing-count floor, and the count turned out to measure the user's staging area rather than the suite. Renaming twenty-three tracked directories without staging the moves puts the index and the working tree out of step, and `plugin.test.js`'s index reading fails on exactly that — one test short of the floor, with nothing lost, nothing skipped and every other file green. The criterion was amended to drop the count and read file by file instead: every pre-epic test file present, unskipped, and still declaring cases. The per-file reading catches the failure the count was written for — a file emptied by the rename is present, unskipped, and asserts nothing — and it catches it in the one place a total cannot, because a total goes on looking healthy while one file quietly stops testing.

- Every sweep written for this rename had to be told what is not a skill name, and the first draft of each got it wrong in the same way. A blanket sweep for bare skill-name literals across `tests/` returned 489 hits in 101 files, nearly all of them document kinds, library scope keywords and agent names — `'spec'`, `'review'`, `'do'` — which merely share spellings with a directory. A sweep for `skillSource('x')` call sites reported four skills the tree does not have, because `tests/support/package-tree.js` exports a same-named function that *builds* a synthetic source. And the third draft reported this file's own `assert.throws(() => skillSource('nonesuch'))` controls, which name something missing on purpose. Each was fixed by narrowing to the position rather than the string: the front of a quoted literal, the import the call resolves through, and the absence of an `assert.throws` wrapper. Library lesson 04 is written about renames, and it applies just as hard to the readings written to police one.

## Story 4 — Make a v1 name clash visible

**Status**: complete  
**Blocked by**: —  

### Acceptance Criteria

- After registration under v1, a check reports every dpm skill whose registered entry does not resolve to a path inside the installed package, naming each one. `[unit]`
- The check fails when given a host registry in which another source has claimed one of dpm's names, and passes when every dpm name resolves to dpm's own directory. `[unit]`
- must NOT — dpm's registration silently overwrites, or is silently overwritten by, another source's skill of the same name. Control: a planted foreign skill under one of dpm's names fires the report. `[unit]`

### Task 1 — Extend the post-registration check to resolve each skill to dpm's own directory

**Status**: complete  

Extends the check epic 02-01 story 4 builds rather than adding a second one. Scope is the per-skill resolution and its report, not the skills-path assertion already there.

### Task 2 — Write tests for Make a v1 name clash visible

**Status**: complete  

Covers the three criteria tagged `unit`, with the planted foreign skill as the control for the must-not.

### Retro

- The read-back is quiet in the ordinary case by construction, and saying so is what stopped it becoming a check that cannot fail. dpm's sources go in last, so inside dpm's own transform dpm's entries win every name it claimed — a post-registration check written as another look at what `discoverSkills` returned would have passed forever and proved nothing. Retro application 01M1CXES34CZ14V6CDT54KQRSH said as much before the code existed, and the shape it forced is a pure `displacedSkills(registered, registry, root)` the tests hand a registry holding a foreign skill dpm did not put there, plus a draft whose `list()` starts returning entries the `source` calls never made. What the check catches in production is named rather than implied: a host that keys and replaces rather than appends, a replay that reorders the transforms, and a source the decode dropped so dpm's name is registered to nobody.

- Four assertions already in the suite asked whether a skill's location was inside this package, and all four asked it with `location.startsWith(join(ROOT, 'skills'))` — the exact form library lesson 04 forbids. A sibling package installed one character along, `${ROOT}-other/skills/dpm-do`, satisfies every one of them, so the single path each was written to reject was the path it accepted. None had ever failed, and none would have. The fix is one predicate, `withinPackage(root, path)` in `src/plugin/root.ts`, asking `relative` whether the step climbs out; the four sites now share it, and the control that distinguishes it from the prefix form is driven rather than described — the planted sibling passes `startsWith` and fails `withinPackage` in the same test. Worth noting that the lesson was already in the library and already cited in this epic's other stories, and the four sites still went unnoticed until a story asked the same question in production code.

## Dependencies

- blocks → 02-03
- blocks → 02-04
- blocks → 02-05

## Retro Applied

- 06 · complexity-underestimates · applied — The packaged install was not a paragraph in the README, it was a model the document was built on — a documented model is load-bearing in more places than the section stating it. The dpm- prefix is the same kind of thing: it lives in ID_PREFIX, in the README's permission resource rule, in cross-references inside the twenty-three skill bodies, in the guard, and in the suite's derived names. Applied at story 1's Step 1: enumerate every site the prefix is load-bearing at before the rename, so the surface is known up front rather than discovered one failing test at a time.
- 03 · complexity-underestimates · applied — The pilot's cost landed in the instruments, not the rename: tests/support/skills.js derived a prefix and 40 files read through it. This epic is the same rename one layer down — the name moves onto disk. Applied at story 1's Step 1: before renaming anything, enumerate every reader that derives or asserts a skill name, and build the dual-form object (current + legacy, plus the exact list of not-yet-renamed skills) FIRST, so the intermediate state is expressible and a dual-form matcher cannot silently accept an unrenamed skill. Story 3 exists because of this lesson; it is worked as the enabling step, not the cleanup.
- 03 · criteria-gaps · applied — A prohibition written as a list of strings catches only the strings someone thought of — $ARGUMENTS survived a pass looking for exactly its class. This epic carries two must-NOTs of the same shape: story 1's "no two skills share a front-matter name" and story 4's "no silent overwrite". Applied at Step 5 for both: each must-NOT is derived from the mechanism rather than enumerated — read every name the skills tree actually produces and every key the host actually indexes on, and assert over that set, so a name nobody anticipated is still in the denominator.
- 06 · scope-surprises · applied — A requirement written to fence a risk can be discharged by the risk not existing — NFR3's premise dissolved rather than being met or breached. This epic was planned before 02-01 chose embedded skill sources, and story 1's first criterion asserts the directory name must equal the front-matter name "which is what OpenCode requires of the pair". Under the embedded route the host is handed name, location and content directly, so that premise may not hold. Applied at story 1's Step 1: probe 1.18.25 for what it actually keys on before building to the stated requirement, per library 05 — and if the premise has dissolved, raise it as a change moment rather than quietly satisfying a criterion that no longer fences anything.
- 06 · testing-gaps · applied — Four green files in 02-01 compared the registration to the thing that built it, so they were true of any command whatever — including one that could not start. Story 4 asks for a post-registration check on the host's registry, and written the easy way it becomes a second reading of discoverSkills, which cannot fail. Applied at Step 5 for story 4: the check must be exercised against a draft/registry that already contains a skill dpm did not put there, so the assertion has something to be wrong about.
