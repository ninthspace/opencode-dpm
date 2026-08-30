# Skills: Lifecycle

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Date**: 2026-08-08  
**Status**: Complete — all ten stories and all 44 coverage rows verified  
**Blocked by**: Epic 47-06-epic-skills-spine, Epic 47-07-epic-skills-authoring, Epic 47-08-epic-skills-read-surface  
**Retro applied**: 38 · Testing gap · Applied — every test-writing task in Stories 1–4 and 9 opens by naming which criteria are judgements about the *shape* of an answer (which scope, which set operation, which branch) and asserts those on the step's own text via `instructions()`/`prose()` from the start, rather than discovering the survivor; retro 38's first recommendation — settle once whether a step-scoped binding is buildable in `tests/support/` — is taken as part of Story 1  
**Retro applied**: 38 · Codebase discovery · Applied — Story 8 adds a document kind, a join table, a column and a semantics change to every update tool, and each is checked against every place the assumption is encoded (the `LISTS` declaration, the projection descriptor and `TEMPLATES` enumeration, the pinned schema version, the vocabulary and retire-verb enumerations) before it is called done, rather than after a suite refuses it  
**Retro applied**: 38 · Pattern worth reusing · Applied — every new assertion carries the decoy the wrong answer would also return: a `superseded` blocker beside a `complete` one for readiness, a `communication` beside an `artifact`, a locally written library document beside an imported one, a participant on a spec that must be rejected beside ones on a review and a discussion, and an omitted argument beside an explicit null  
**Retro applied**: 36 · Codebase discovery · Applied — each of Stories 1–4 opens with a consumer walk against the live surface before any SKILL.md is written, and Story 8's substrate is walked against the four unconverted skills first, on retro 38's second recommendation that the next gap is already sitting in an unconverted file  
**Retro applied**: 36 · Codebase discovery · Applied — the retirement gap was raised at spec level before this epic started, as the observation instructed, so it applies here as the check that Story 8.1 lands *both* halves: the widened `CHECK` and the readiness clause that stops reading every non-`pending` status as satisfied. Left live at its source for the next epic that inherits a two-value vocabulary

Milestone M4 (AD6), and the end of the build. Four of FR25's twenty-two skills, then the two
stories that close the spec: Story 5 asserts the corpus is complete, and Story 6 is Chris's
standing check — **dpm must be able to hold dpm's own planning corpus**.

These four are the skills whose entire reason for existing is a markdown-store constraint.
`archive` maintains a mirrored directory tree solely so a glob can find retired numbers;
`clean` deletes files that are only files because state had nowhere else to live. Converting
them is mostly deletion.

**Stories 8 and 9 arrived on 2026-08-10 and are not conversions.** They land five spec amendments
that the eighteen conversions of Epics 47-06 to 47-08 asked for — a widened status vocabulary, a
`communication` kind, a library `source` column, participants on a discussion, and an update that
can genuinely clear a field. **They are ordered before Story 5 rather than after it**, because Story
5's job is to sweep a finished corpus and a corpus swept clean and then edited has been asserted
about in a state it no longer holds. That places substrate work inside a skills epic, which is worth
naming as the exception it is: the alternative was an epic of its own between this one's fifth and
sixth stories, which is the same ordering with a document boundary through the middle of it.

**Inline change** (2026-08-10, gated with Chris): **Story 8 now runs before Stories 2, 3 and 4, and
Story 2 is blocked by it.** Story 2's third criterion requires a *retired* epic, and `status`'s
`CHECK` admits `pending` and `complete` only — in `001-identity.sql` for `document` and in
`004-delivery.sql` for `story` and `task` — so there is no way to construct one until Story 8's
first criterion lands. Found by Story 2's consumer walk before its SKILL.md was written. Running the
substrate first means `archive`, `clean` and `ralph` are each converted once against the final
vocabulary rather than converted and retrofitted; the sequence is 1 → 8 → 2 → 3 → 4 → 9 → 5 → 6, and
Story 5's sweep of a finished corpus still runs last as its own reasoning requires.

## Convert `pivot` [plan]
**Story**: 1  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: FR25, FR21, FR2

**Acceptance Criteria**:

- A pivot run amends artefacts through update tools, and cascades to downstream documents by traversing foreign keys rather than by discovering chains from back-reference prose [feature]
- Coverage verification is cleared by FR21's triggers when a criterion's text changes, so the skill no longer edits `| ✓ |` to `| |` and no longer needs to derive a matrix path from an epic path [integration]
- The facilitation survives: every downstream change is still gated individually rather than applied as a batch, and a status change still edits the token while leaving the human note tail intact [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Rewrite amendment as update-tool calls, and cascade discovery as foreign-key traversal
**Task**: 1.1  
**Description**: Chain discovery today reads back-reference fields, falls back to slug matching when they do not resolve, and presents partial chains when neither works. All three disappear into one join.  
**Status**: Complete

### Delete the coverage-matrix invalidation procedure
**Task**: 1.2  
**Description**: The triggers do it. The procedure being deleted derives a matrix path from an epic path by substituting `-epic-` for `-coverage-` and then edits `✓` cells — a failure that is silent, because a matrix it fails to find keeps asserting that changed criteria were verified.  
**Status**: Complete

### Write tests for Convert `pivot`
**Task**: 1.3  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

**Inline change** (2026-08-10, gated with Chris): **`read_document_kind` now answers parentage in
both directions.** The consumer walk found the one thing criterion 1 needs and the surface did not
have: `document_kind_parent` holds the twelve pairs, is keyed `(kind, parent_kind)`, and nothing
queried it by the second column — so a run holding a document could ask what it may hang off but
not what hangs off it. Without that, the cascade map is a copy of `KIND_PARENTS` written into the
skill's prose, which is the hand-kept duplication FR1 opens the spec with, one directory over. The
handler now returns `parents` and `children`, both ordered on the returned column, and declares
`document_kind_parent` in `reads`. Additive: no migration, no new tool, and no create tool for a
seeded table, so `parity.test.js`'s standing exemption and `parity-integration.test.js`'s
"checked at write time and never rendered" both stay true.

**Retro**: Codebase discovery — **a schema gap was again found by a consumer, not by reading the
schema.** Retro 38's second recommendation said the next gap was already sitting in an unconverted
file; it was, and it was found on the first conversion of this epic. What made it invisible is that
the *upward* half of `document_kind_parent` was already in use — `documentTools` reads it to decide
whether a kind takes a parent — so the table looked covered from every angle except the one a
cascade needs.

**Retro**: Testing gap — **a control can be contaminated by another write in the same run, and it
reads as a pass.** Criterion 2's control drives the run with the criterion's text passed back
unchanged, and the mark was cleared anyway: the same run also amends the *requirement*, and
`011-decay.sql` decays a coverage row from either end. The first version of that test confirmed the
trigger was correct for the wrong reason. Both bound texts are now parameters of the one `run()`,
and the control asserts it drove both writes so it cannot pass by skipping them.

**Retro**: Codebase discovery — **a fixture that spreads a shared helper's return can silently
rebind its own keys.** `seedStartup` returns `retro` and `other`, and this fixture had documents of
both names; `...startup` last meant `fixture.retro` was the startup retro, and the cascade assertion
failed as though the traversal had reached the wrong document. Named apart, with the reason recorded
beside the return.

---

## Convert `archive`
**Story**: 2  
**Status**: Complete  
**Blocked by**: Story 8  
**Satisfies**: FR25, FR5

**Acceptance Criteria**:

- An archive run sets `archived_at` and leaves `status` untouched, so a document is archived *and* complete rather than forced to choose [feature]
- Numbers allocated before archival are never reissued after it, with no mirrored `docs/archive/{type}/` tree and no glob over one [integration]
- The facilitation survives: a coverage matrix is still never archived apart from its epic, and a retired epic sitting in a chain whose other members are live is still archived alone rather than taking the chain with it [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Set `archived_at` without touching `status`
**Task**: 2.1  
**Description**: The two are orthogonal. Collapsing them into one enum forces a false choice and loses the completion state on archival.  
**Status**: Complete  
**Inline change**: The file names status values, which every other converted skill is written not to do. The distinction is that elsewhere a skill *carries* a value the user chose, and here the judgement is the difference between them: the delivered-spec signal needs `withdrawn` to count as an ending and the finished-epic signal needs it not to count as a delivery, and no tool schema holds that. Stated in the file so a later reader does not correct it back.

### Remove the mirrored-tree contract
**Task**: 2.2  
**Description**: `number_sequence` retains allocations, so nothing needs a directory layout to remember them. A load-bearing directory structure existing solely to keep a glob working is the clearest single instance of the class of problem this spec addresses.  
**Status**: Complete  
**Inline change**: Gone with the tree: five globs, the type-identifier slug rule and its five worked examples, the four-way back-reference resolution order, `mkdir -p`, `mv`, the mirrored-path derivation, and the completeness guard that existed to stop a `mv` orphaning a coverage matrix. The matrix now travels with its epic because it is that epic's child, which is a property of the traversal rather than a step that could be skipped.

### Write tests for Convert `archive`
**Task**: 2.3  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete  
**Inline change**: Phase 4 was rewritten from four paragraphs into a numbered procedure. `instructions()` reads numbered steps only, so a phase written as prose gives the step-scoped assertions retro 38 asked for nothing to bind to — the rule and its rationale were indistinguishable to the harness, which is the gap that let a Story 7 mutation through.  
**Retro**: [testing gaps] A criterion about numbers surviving archival is only observable when the archived document holds the *highest* number — with the live sibling numbered above it, a mutation replacing `number_sequence` with `MAX(number) WHERE archived_at IS NULL` passed this test while failing eleven others.

---

## Convert `clean`
**Story**: 3  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: FR25, FR11

**Acceptance Criteria**:

- A clean run selects stale `session` rows by age and removes them, with no filename stem to glob and no session-suffix convention to match [integration]
- The facilitation survives: every candidate is still listed before anything is asked, only what was named and confirmed is deleted, and the skill is still unreachable from an autonomous loop [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Select stale `session` rows by age and remove them
**Task**: 3.1  
**Description**: Staleness is a `WHERE` clause. The exact-stem convention that every reader of the progress file must match today has nothing left to protect.  
**Status**: Complete  
**Inline change**: The tool surface had no removal of any kind — no `delete_*` tool and no delete helper in `crud.js` — so the criterion's second half was unreachable. Gated with Chris, who chose `delete_session` alone over a general delete facility: `crud.js` gains `deleteById`, and `session.js` gains one tool taking a single id. No migration; `session.superseded_by`'s default `NO ACTION` already refuses to leave a row pointing at nothing, and the tool translates that constraint error the way `crud.js` translates the rest. `tools.test.js:93` had already anticipated a fourth verb, asserting create/read/update as a subset rather than an equality.  
**Inline change**: `delete_session` takes one id and no cutoff. A `DELETE … WHERE updated_at < ?` would serve a sweep in one statement, but `clean` exists to put every candidate in front of someone first, and a tool taking the cutoff would let one confirmation stand for a set whose membership was settled after it was given.

### Write tests for Convert `clean`
**Task**: 3.2  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete  
**Inline change**: Steps 3 and 4 were written as numbered procedures for the reason Story 2's Phase 4 was — `instructions()` reads numbered lines only, so a step written as prose leaves the step-scoped assertion with nothing to bind to.  
**Retro**: [codebase discoveries] The chain foreign key runs opposite to the intuition: a predecessor carries `superseded_by`, so it is the *live end* that cannot be deleted while its predecessor survives, and oldest-first — which is the order `list_session` already returns — is the only sweep order that never meets the refusal.

---

## Convert `ralph`
**Story**: 4  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: FR25, FR11

**Acceptance Criteria**:

- A ralph run carries its loop state in `session` rows, and a resume under a new session id adopts the prior row rather than reading a progress file [feature]
- The facilitation survives: pre-flight still probes the stop hook and branches on what it finds, and a detected previous run is still offered as a resume rather than restarted over [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Carry loop state in `session` rows, with resume-adoption as an `UPDATE`
**Task**: 4.1  
**Description**: An autonomous loop is the case where progress-file recovery matters most and is least observable — nobody is watching when it fails to adopt.  
**Status**: Complete  
**Inline change**: The consumer walk found no substrate gap — `list_session({skill})`, `read_session`, `adopt_session`, `story.plan`, `list_epic({parent_id})` and the coverage traversal all already answer what pre-flight asks. `dpm/skills/ralph/SKILL.md` written: 3,368 words against CPM's 9,586.  
**Inline change**: The largest single subtraction is the roll-up script. `coverage-rollup.sh`'s six exit codes become a traversal — `list_story` → `list_story_criterion` → `list_coverage`, with `list_story_criterion_approach` distinguishing a target-only row — giving three answers rather than six codes, because the codes existed only so a shell script could say everything with one integer. Spec mode's fourth reading, an untraced requirement, comes from `list_requirement` → `list_coverage` and is the one epic scope cannot produce at all.  
**Inline change**: The intro's "this skill uses **X**, **Y**" list does not splice a shared procedure — `reachable()` matches `Follow the shared **X** procedure` only — so a `## Startup` section was added citing Session Startup and Library Check in that form. Without it the Library Check tools resolved against nothing and the binding could not see them.

### Write tests for Convert `ralph`
**Task**: 4.2  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete  
**Retro**: [testing gaps] A decoy only tests a filter when it is the row an *unfiltered* read would return — `seedStartup`'s session seeded before the fixture's own left `.at(-1)` finding the right row either way, and a mutation emptying `list_session`'s `skill` filter survived until the two were reordered.  
**Inline change**: One mutation is recorded as a survivor rather than closed. Inserting a sentence granting epic scope the spec verdict left every assertion passing, because it *adds* a false claim rather than removing a true one and no positive assertion sees that. The true claims are now pinned (`can never say a spec is delivered`, and one promise per mode); a bespoke pattern for one invented contradiction would be the grep proxy that ends up asserting nothing.

---

## Close the corpus
**Story**: 5  
**Status**: Complete  
**Blocked by**: Story 1, Story 2, Story 3, Story 4, Story 8, Story 9  
**Satisfies**: FR25, FR3, FR28

**Acceptance Criteria**:

- The twenty-two skills named in FR25 all exist, and no skill exists that FR25 does not name [integration]
- No skill writes a literal artefact number into a prose column; a reference to another artefact is written `{{ref:<id>}}` — swept across all twenty-two [unit]
- Every pipeline stage a CPM user can reach has a dpm skill, asserted by comparing the corpus against CPM's own skill directory [integration]
- must NOT — the pipeline-stage comparison reports success because CPM's `skills/` directory was absent, rather than failing on a fixture it could not read [integration]
- No skill file contains a filename pattern under `docs/`, a glob, a number-allocation procedure, or a progress-file lifecycle — swept across all twenty-two [unit]
- Every dpm SKILL.md contains no SQL keyword and no `sqlite3` invocation — swept across all twenty-two [unit]
- must NOT — a skill recovers an entity by reading a generated markdown file rather than by calling a read tool, swept across all twenty-two [unit]
- Every one of the twenty-two carries a passing facilitation criterion on its own story, checked here as a roll-up: the five sweeps above are all negative, and a corpus of twenty-two files each holding a title and a single tool call satisfies every one of them [integration]

### Enumerate the twenty-two skills against FR25's list in both directions
**Task**: 5.1  
**Description**: Both directions, because a corpus missing one skill and a corpus holding an unnamed twenty-third are different failures and a one-way check finds only the first.  
**Status**: Complete  
**Inline change**: A third direction was added, because a directory is not a skill. Each of the twenty-two carries a `SKILL.md` whose front matter names itself, and the harness dispatches on that name rather than on the directory — so a directory renamed without its front matter is a skill that exists at one name and answers to another, and both set comparisons pass on it.

### Compare the corpus against CPM's own skill directory
**Task**: 5.2  
**Description**: FR25's list could itself be short. Comparing against the directory is what makes "every pipeline stage a user can reach" checkable rather than a claim about the list. It reads **directory names only** — CPM ships at `cpm/` in the same marketplace repository, so this is a sibling directory in the same commit, needing no version pin and no install step. The comparison must fail when that directory is absent: a suite run from an extracted plugin copy has no `cpm/` beside it, and a set comparison against nothing passes trivially, which is the check that exists to catch a short list being satisfied by finding nothing at all.  
**Status**: Complete  
**Inline change**: The absent directory is one of two ways the comparison finds nothing, and only the first was named. `readdirSync` throws on a path that does not exist and succeeds on a directory that exists and holds no subdirectories — so the reader raises on both, and the must-NOT drives both. The empty half is the one a partial checkout produces.

### Sweep all twenty-two files for the five subtractions and for SQL
**Task**: 5.3  
**Description**: Each epic swept its own files; this sweeps the corpus, so a skill converted early and edited later is caught.  
**Status**: Complete  
**Inline change**: The sweep was extended to `dpm/shared/skill-conventions.md`, which no per-epic sweep covers and every run reads — a pattern moved into that file would leave twenty-two clean sweeps and reach every skill anyway. It found two sentences, and both are the trap Story 9 recorded: a file that forbids a thing *by naming it* is reported as committing it. `belongs in \`docs/\`` and `There is no progress file` were reworded to state the rule positively rather than the prohibition. The second is better for a reason beyond the sweep — it was a sentence about a removal, paid for on every run by readers who never knew the removed thing existed.

### Sweep the corpus for prose references written as numbers rather than as markers
**Task**: 5.4  
**Description**: FR28's write side. Epic 47-04 resolves markers at render time and forbids a projected body holding a number no row produced; nothing before this asserts that the skills *emit* markers. The failure is deferred and asymmetric — a skill that writes `spec 47` into a prose column ships clean and fails at someone else's render, months later, in a file it did not write. Every authoring skill is a candidate, so the check belongs to the corpus rather than to any one of them.  
**Status**: Complete  
**Inline change**: Nothing in the corpus mentioned the marker at all, so the negative sweep would have passed against twenty-two files that never reference anything. A **Cross-References** section was added to the shared conventions — the marker form, the prohibition on the number, the separation from a foreign key, and the case where nothing has an id — and cited by the sixteen skills that write a narrative column. **Which sixteen is derived, not listed**: a narrative column is one a read tool declares as `body`, which is the schema's own answer to where prose lives, so a column added to that set later pulls its writers in without an edit. `session` is the one exclusion — `state` is a blob nothing projects, so a marker in it would never resolve.

### Roll up the per-skill facilitation criteria across the corpus
**Task**: 5.5  
**Description**: Every other check this story runs is a sweep for something that must be **absent**, and absence is exactly what a gutted skill has most of. Twenty-two files each carrying a title and one tool call pass all five. The retention criteria live on the individual stories because facilitation differs per skill and cannot be asserted corpus-wide; what belongs here is the roll-up that fails if any of the twenty-two has no such criterion, or has one that does not pass. The failure this guards against is not a skill breaking — it is a conversion that succeeds at the subtraction and quietly discards the part FR25 says is the whole point of keeping.  
**Status**: Complete  
**Inline change**: The join is derived rather than enumerated. Every conversion story is headed ``## Convert `x` `` and carries a `**Story**: N`; every facilitation row in that epic's coverage matrix carries `Story N` in its *Covered by* column, and the matrix sits at the epic's path with `-epic-` replaced. So the roll-up scans every epic in the project rather than the four this spec happens to have written, and a conversion moved into a fifth is picked up instead of silently dropped from the count.

### Write tests for Close the corpus
**Task**: 5.6  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete  
**Retro**: [testing gaps] A mutation that does not parse is not a caught mutation. Deleting the line that filters the narrative writers left unbalanced parentheses, the whole file failed to load, and the run reported one failure — indistinguishable at a glance from the assertion firing. The one before it was worse: the substitution silently matched nothing, the suite stayed green, and it read as a survivor until the diff was checked. Both were re-driven as edits that leave valid syntax, and both were then caught.  
**Inline change**: Fourteen mutations driven and reverted, each verified byte-identical afterwards: FR25's list misspelling a name, a `SKILL.md` declaring a name other than its directory's, a glob and a SQL statement reintroduced into an already-converted skill, a skill dropping its **Cross-References** citation, a skill naming an artefact by its number, the shared rule losing each of its three claims in turn, a facilitation row losing its tick and another deleted outright, a conversion story naming a skill the corpus does not ship, the shared conventions gaining a progress-file lifecycle, and the narrative-column derivation widened twice — once by counting `session` and once by counting every write tool.

---

## Verify dpm holds its own planning corpus [plan]
**Story**: 6  
**Status**: Complete — reopened on 2026-08-10 to add Tasks 6.6 and 6.7 and the two criteria they answer, then closed again  
**Blocked by**: Story 5  
**Satisfies**: FR10, FR14, NFR6

**Amended 2026-08-10.** The last two criteria and Tasks 6.6–6.7 were added after this story first
closed, and they were not in its plan. The handcrafted corpus complies by construction and
populates nearly every optional column, so the story as delivered checked what dpm does with a
*complete* artefact and nothing about what it does with an incomplete or a finished one. A second
corpus was built to cover that, and it is recorded here rather than under a new story because the
claim it supports is this story's claim — that dpm can hold a planning corpus — over the half of
the state space the first corpus does not reach.

**Acceptance Criteria**:

- A handcrafted planning corpus — invented for this purpose and complying with what dpm writes — loads through create tools, and the projection regenerates every document in it. Its completeness is derived rather than listed: every table a create tool writes carries a row, every seeded `document_kind` has a document, and every `document_kind_parent` pair is exercised, all three read from the live schema, so a table or kind added later fails the corpus until it is covered [feature]
- The loaded corpus passes `PRAGMA foreign_key_check` and every entry in the invariant register [integration]
- Every entry in the self-hosting register is closed, or explicitly waived with a recorded reason; no entry remains OPEN [integration]
- must NOT — a corpus artefact loads with content dropped because no column held it, and the load reports success [integration]
- A second corpus covers absence and endings — every create tool called with its optional fields left out, every parent rendered with its child collections empty, and every value in every status vocabulary and every retirement column reached. All three sets are read from the live schema and tool surface, so an optional field, a status value or a retirement column added later fails the corpus until it is reached [feature]
- must NOT — an absent value renders as something that reads like content: a placeholder string in a published document, or a heading with nothing beneath it [integration]

### Build a handcrafted corpus and load every member through create tools
**Task**: 6.1  
**Description**: Through the tools, not by import — AD8 means there is no import path, so this is a fixture written against the tool surface like every other. **Derive the coverage, do not list it**: the claim is not a named set of documents but three readings of the live schema — every table a create tool writes carries a row, every seeded `document_kind` has a document, every `document_kind_parent` pair is exercised. A hand-kept enumeration needs editing every time the surface grows, which is the failure this spec removes everywhere else. `artifact` and `artifact_document` are the case that proves it: an earlier enumeration omitted the artifact, so two of the tables went unexercised by the check that gates the whole build, and nothing reported it.  
**Status**: Complete  
**Inline change**: Found by the corpus, recorded rather than fixed — **a coverage matrix takes its own `sequence` and not its epic's, so every matrix in a project renders as `{spec}-01`.** `identifierOf` builds a child's number from its nearest *root-numbered* ancestor and `document.sequence`; `document_child_number` allocates per parent, so each matrix is `sequence` 1 under its own epic. With one epic the two coincide and the bug is invisible — which is why every minimal fixture passes, `fullCorpus` included. With two, both matrices render `1-01` and only the slug keeps the filenames apart. `naming.js` states the intent as "it shares those bytes with its epic on purpose", and this repository's own tree agrees (`47-03-coverage-server-and-spine-tools.md` carries its epic's number), so the implementation and the stated rule disagree. Nothing asserts it: `projection.test.js` checks only that the kind is in the filename. The fix is in `naming.js` and moves every projected matrix path, so it is raised rather than taken inside this story.  
**Inline change**: The corpus is handcrafted rather than spec 47's own documents — decided with Chris on 2026-08-10, and it changes what this story claims. Those documents were written to CPM's conventions and nothing guarantees they comply with what dpm writes, so a failure to load one is ambiguous: a schema gap and a non-compliant input look identical. An invented corpus complies by construction, which makes every failure attributable. **The cost is worth naming.** A foreign corpus is a discovery instrument — it is what produced all five self-hosting register entries, none of which was found by reading the schema. A handcrafted one cannot surprise the schema; it exercises shapes already known to matter. So this story is now a completeness-and-fidelity check rather than a discovery one, and the register stays closed rather than being re-interrogated.  
**Inline change**: The corpus was refused by integrity register entry 6 on its first load — it wrote `builds_on` between two epics, and that kind admits only spec→spec. The intent was to sit a non-gating edge beside a gating one, and the kind was chosen for its `gates_work` flag without reading what ends it takes. Corrected to a second `blocks` edge between the epics and a `constrains` edge between two ADRs, which is where the non-gating case actually lives.

### Regenerate the projection and compare it against what was loaded
**Task**: 6.2  
**Description**: This is the mechanism behind the story's final criterion. A load that drops what no column holds reports success; only comparing the regenerated projection against the source makes the loss visible.  
**Status**: Complete  
**Inline change**: The comparison is **two readings, not one**, because the first was incomplete and a mutation proved it. A per-document walk over bodies the corpus deliberately records catches a body rendered under the wrong document, but it is blind to a column the corpus writes without recording — dropping `adr_option.rationale` from its template survived it untouched. The second reading derives the narrative columns from the read surface itself (`tool.body` names them, `tool.table` locates them), so every one is swept whether or not anything recorded it, and a narrative column added to any entity is covered the day it is declared. The values whose absence is deliberate are named in an `UNPROJECTED` map with a reason each — `session.state`, which FR11 took off disk, and the two `agent` persona columns, which are roster vocabulary no document renders — rather than being kept out of the corpus, since a corpus that never writes them makes the check pass by shrinking its own input.

### Run `PRAGMA foreign_key_check` and the full register sweep over the loaded corpus
**Task**: 6.3  
**Description**: The corpus is the largest realistic fixture available, and it was authored before the schema was, so it exercises shapes no test written alongside the schema would think to try.  
**Status**: Complete  
**Inline change**: `check_integrity` reports `checked` as one greater than `entries.length`, and the difference is the orphan sweep, which is a check but not a register entry. Asserted as `entries.length + 1` rather than against either literal, so an entry added to the register moves both sides together.

### Resolve the self-hosting register
**Task**: 6.4  
**Description**: Every entry closed or waived with a recorded reason. A waiver is a decision and is written down; an entry left OPEN fails the story.  
**Status**: Complete  
**Inline change**: The sweep reads the **Status column**, not the word `OPEN` in the section text. A first cut swept the prose and failed on this epic, whose own register notes narrate *"it held five OPEN entries when this epic was written"* — a sentence about the register's history in a section whose table has no status to give. Reading the column distinguishes an entry's state from prose that mentions one, and it lets a section tabulating something other than entry status contribute nothing rather than everything.

### Write tests for Verify dpm holds its own planning corpus
**Task**: 6.5  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete  
**Inline change**: `dpm/tests/self-hosting.test.js` — six tests, suite **541 pass, 0 fail**. Ten mutations driven and reverted. Eight were caught by the test that owns them; two are worth recording. Un-choosing the accepted ADR's option never reached its assertion at all — register entry 8 refuses it at the write boundary, so the corpus fails to load and five tests fall together, which is the guard working rather than a test failing. And dropping `adr_option.rationale` from its template **survived**, which is what produced Task 6.2's second reading; it is caught by name now.  
**Retro**: [testing gaps] A fidelity walk that compares only what the fixture chose to record measures the fixture's diligence, not the projection's. It read clean while a template silently dropped a column, because nothing had recorded that column — and the gap was invisible from inside the walk, since a value never recorded is a value never missed. Deriving the swept set from the read surface instead closed it, and the guard that makes the derivation non-vacuous is the count of values swept, asserted against the count recorded.

### Build a corpus of absence and endings
**Task**: 6.6  
**Added**: 2026-08-10, after the story first closed  
**Description**: `dpm/tests/support/sparse.js`. The handcrafted corpus complies by construction and populates nearly every optional column, so the templates' absence branches — `x === null ? null : …`, `x.length > 0 ? … : null` — were reached by no fixture in the tree, and `pending` was the only status value any fixture ever wrote. Three layers, all derived rather than listed: one document of every kind with only its create tool's required fields and no children; a second set carrying one of every child type, each also required-only; and every value in every status vocabulary plus every retirement column, reached through the tools. The vocabularies a project adds are created and then retired **after** rows reference them, which is the order the retirement guard is about.  
**Status**: Complete  
**Inline change**: Two create tools have no required-only call and cannot have one — `create_dependency`, whose four optional fields are the edge's ends, and `create_observation`, whose three parent references are individually optional under a `CHECK` requiring one. Both are the same shape: an "at least one of" rule that `required` cannot express, so a caller reading the schema sees optional fields and nothing saying one is mandatory. Named as exceptions rather than skipped, and Task 6.8 makes both visible where a caller reads.  
**Inline change**: The integrity register refused the corpus twice while it was being written, both times correctly. `builds_on` between two epics — that kind admits spec→spec only, and the kind had been chosen for its `gates_work` flag without reading what ends it takes (entry 6). And a superseded ADR with no `supersedes` edge — an ending is a column *and* an edge, and a corpus writing only the column asserts a state the schema does not consider reachable (entry 2).

### Write tests for the absence-and-endings corpus
**Task**: 6.7  
**Added**: 2026-08-10, after the story first closed  
**Description**: `dpm/tests/sparse.test.js`, six tests against the story's two added criteria. Every claim reads the live schema or tool surface: `inputSchema.required` for what is optional, the `status` `CHECK` constraints for which states exist, `PRAGMA table_info` for the retirement columns. Exceptions are proven rather than asserted — the two tools that cannot be called bare have that refusal driven, so an exception that stops being true fails here instead of quietly excusing a tool that no longer needs excusing.  
**Status**: Complete  
**Inline change**: The measurement that justifies the corpus. Interpolating `requirement.exclusion` without its null guard makes a spec publish `### FR1 — null` in a heading; **one test in 547 caught it, and it was the new one** — all 541 pre-existing tests passed. The comparison that gives the empty-collection claim its teeth is the same shape: "renders fine with no children" is also true of a template that never renders children at all, so each barren document is set against the fullest of its own kind.  
**Retro**: [testing gaps] A mutation that changes no output is a no-op, not a survivor, and the two are indistinguishable from the test result alone. Removing `criteria.length > 0` in `spec.js` failed nothing — not because the check was missing but because the block assembler drops empty strings anyway *and* the corpus held no requirement without criteria. Reading the render before classifying it separated the two, and the case the mutation revealed was missing is now in the corpus.

### Fix what the second corpus found
**Task**: 6.8  
**Added**: 2026-08-10, after the story first closed  
**Description**: Four fixes, each bound to a test so it cannot regress silently. **(1)** `identifierOf` gave a coverage matrix its own `sequence`, which `document_child_number` allocates per parent and is therefore always 1 — so every matrix in every project rendered `{spec}-01`, and two under different epics differed only by slug. The rule now takes the sequence of the child directly under the root, which is what `naming.js`'s own "it shares those bytes with its epic" sentence always meant and what this repository's tree has always shown. **(2, 3)** The two "at least one of" constraints are now carried by the field descriptions a caller actually reads, with the enforcement left in the database. **(4)** `supersedes` runs from the superseded end, which was written down only in integrity register entry 6's `WHERE` clause; it is now on the seeded kind and in `create_dependency`'s description.  
**Status**: Complete  
**Inline change**: The naming fix broke no test, which is the finding rather than a reassurance: with one epic per fixture the matrix's own sequence and its epic's coincide, so nothing in 547 tests distinguished them. The regression assertion went into `self-hosting.test.js`, whose corpus already carries two epics, and it asserts identifier equality with the parent rather than a literal path.  
**Inline change**: Not fixed, deliberately — an ADR option with neither rationale nor tradeoffs renders as a heading with nothing beneath it. The heading carries the option's name and its chosen marker, which is genuinely the whole content of such an option, and changing it moves bytes in every ADR projection for a cosmetic concern with no correctness gain. Recorded as the single allowed empty heading in `sparse.test.js`, where the test asserts the case still occurs so a stale exception fails rather than silently excusing a template that has changed.

---

## Address review findings
**Story**: 7  
**Status**: Complete — applied by `/cpm:pivot` on 2026-08-08 from review 05  
**Blocked by**: —

**Acceptance Criteria**:

- Each critical and warning finding from review 05 scoped to this epic has been addressed
- Existing acceptance criteria on other stories continue to pass

### Fix: the self-hosting corpus enumeration is hand-kept and already incomplete
**Task**: 7.1  
**Description**: [warning] Story 6's first criterion names "Spec 47, review 04, retro 33, the nine epic documents and their nine coverage matrices". Two members of that corpus are missing: **retro 34**, whose `**Source**` is spec 47 and which was written the same day, and the **schema-map artifact** registered in the spec's own `**Artifacts**:` field (source `docs/artifacts/47-dpm-schema-map.html`). The artifact omission has teeth beyond completeness — `artifact` and `artifact_document` are two of the twenty-three tables, and with no artifact in the corpus the standing check that gates the whole build never exercises either. Review 05 is a further member. The list is also the wrong shape for the job: it needs editing every time the corpus gains a member, which is the hand-kept-enumeration failure the spec removes everywhere else by reading the set from the live schema. Prefer deriving the corpus — every artefact whose lineage roots at spec 47 — over naming it.  
**Status**: Complete — Story 6's criterion, Task 6.1 and matrix row 16 now derive membership by lineage

---

## Extend the substrate for the amendments of 2026-08-10
**Story**: 8  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: FR4, FR22, FR10, FR24, NFR6

Added by `/cpm:pivot` on 2026-08-10, cascading five spec amendments. Every one of them came out
of a conversion: Epics 47-06 to 47-08 rewrote eighteen skills against the tool surface, and each
skill that reached for something the schema did not hold recorded it rather than working around it.
**That is the mechanism retro 36 named — a conversion is a consumer test the tools have never had —
so this story is expected to be joined by another after Stories 1 to 4 convert the last four.**

All five are additive. None rewrites a released migration, and none changes a column rows already
depend on.

**Acceptance Criteria**:

- `document`, `story` and `task` accept `superseded` and `withdrawn`, and a value outside the widened enum is still rejected by `CHECK` rather than coerced [unit]
- A blocker that is `superseded` or `withdrawn` leaves what it blocks unready, where the same blocker set to `complete` makes it ready [integration]
- must NOT — readiness treats any non-`pending` blocker status as satisfied, so abandoned work clears the way for what was waiting on it [unit]
- A `communication` document kind is seeded with a projection template, and the template enumeration still passes in both directions against the live `document_kind` table [integration]
- `library_document.source` round-trips a provenance and reads back NULL for a document written in the project [unit]
- `document_agent` accepts a participant on a `review` and on a `discussion`, and rejects one on any other kind [integration]
- An update told to clear a nullable column clears it, and an update that omits the column leaves it alone [unit]
- must NOT — an update accepts a clear, reports success and changes nothing, so *omitted* and *explicitly null* are indistinguishable at the tool boundary [unit]

### Widen the status enum, and make readiness read only completion as satisfaction
**Task**: 8.1  
**Description**: Two halves that must land together. The enum is the easy one; the readiness clause is where the defect is, because a two-value enum let every non-pending state read as done and the widened one makes that reading wrong for two of the four. Retro 35's lesson applies directly — the cascade that added FR26 reached its positive clause and stopped, and this is the same shape one requirement over.  
**Status**: Complete

### Seed the `communication` kind and write its projection template
**Task**: 8.2  
**Description**: A document kind, not a table: title, sections and prose, with no detail row. The template enumeration is asserted against the live table in both directions, so the template and the seed cannot drift apart.  
**Status**: Complete

### Add `library_document.source`, and `document_agent` in place of `review_agent`
**Task**: 8.3  
**Description**: Both are the same argument in two places — a fact held in prose that a reader has to parse back out is the defect FR1 opens the spec with. `document_agent` keeps the composite-key pinning `review_agent` had and widens the `CHECK` to two kinds; a participant still cannot attach to a spec.  
**Status**: Complete  
**Inline change**: `parity.test.js`'s `detailTables()` found `document_agent` and called it a fifth detail table, because it matched on the composite `(document_id, document_kind)` foreign key alone — which `document_agent` now carries and is not detail. The helper additionally requires the table's whole primary key to be `document_id`, which is the structural claim AD7 actually rests on: a detail row cannot be *duplicated*, and only the key delivers that. `document_agent`'s key is `(document_id, agent)`.  
**Inline change**: `review_agent`'s replacement reaches the projection loader, whose descriptor key `reviewAgents` would misname a discussion's participants once Story 9 renders them. Renamed to `documentAgents`, with `review.js` following. Two consumers, both in `src/projection/`.  
**Inline change**: `library.js` renders `**Source**` when the column is non-NULL. A provenance moved out of prose into a column that nothing renders is invisible to the reader it was moved for; a rendered `**Source**: —` on a document written here would invite the prose field back.

### Distinguish an omitted argument from an explicit null in the update tools
**Task**: 8.4  
**Description**: False-pass register #22. The call returns success, the caller believes the field is cleared, and the next read returns the old value — no error at any point, which is the shape NFR6 exists to refuse.  
**Status**: Complete  
**Inline change**: The defect was three lines in `validate()` — an explicit null was dropped before the handler saw it, so `update_x({id, title: 'New', note: null})` moved the title and ignored the clear. Carrying the null through is the fix; the work was everywhere downstream that read `=== undefined` and now has to say what a *third* state means. Five sites: `entityTools`'s create and update (a derived column must clear with what it is derived from, or the paired `CHECK` refuses a legal call), `observation`'s `derive`, `read_number_sequence`'s root branch, `create_coverage`/`update_coverage`'s `binding_hash`, and `claimComplete`'s claim hash. The last two are the same shape as the first — a hash left standing beside a cleared mark is the residue #2 and #18 are about.  
**Inline change**: An explicit null for a *required* argument is refused at the boundary, naming the argument, rather than reaching SQLite as a `NOT NULL` failure naming a column the caller never wrote.  
**Retro**: [testing gaps] Two suites asserted the false pass as a feature — `skill-retro`'s "retirement is durable" and `skill-status`'s "the waiver cannot be lifted" both cited `entityTools` dropping nulls as the mechanism and pinned it in place. Both were corrected: what carries durability is that no tool is *named* for lifting either, and the vocabularies, which keep `retired_at` off `mutable` entirely, are where the surface actually refuses it.

### Write tests for Extend the substrate for the amendments of 2026-08-10
**Task**: 8.5  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete  
**Inline change**: `dpm/tests/substrate-amendments.test.js`, ten tests over the eight criteria, driven through the tools a skill has rather than against the DDL — these were consumer findings and the tests are written from the consumer's side. Nine mutations run; eight caught. The ninth was a gap in the test rather than a survivor: dropping `document.status`'s `CHECK` changed nothing observable, because the criterion's refusal was being satisfied by the tool's hand-copied `STATUS` list and the test never reached the constraint it names. Closed by asserting the refusal at the database as well, with the mutation still in place.  
**Inline change**: Spec 47's false-pass register printed twenty-three rows under prose reading "Twenty-one conditions", with `15` and `16` each appearing twice — the 2026-08-10 pivot inserted the two new conditions after #14 rather than appending them. Gated with Chris and resolved by moving them to **#22** and **#23**, which leaves every existing number and every citation of one untouched. The spec now states the rule that makes it a set: a new condition is appended and its number is never reused, because the number is the join key `false-pass.test.js` resolves against. Citations at `47-spec:388`, the epic's Task 8.4 and two test comments follow.  
**Inline change**: `false-pass.test.js` was three entries behind rather than two — #21 (FR29's undeclared server) had never been added either, so NFR6's "the register has no unregistered entries" was not true when this story started. All three now carry a citation that resolves, and the length assertion is derived rather than a literal, so the next entry fails the file until it has a disposition.  
**Retro**: [testing gaps] A criterion naming the database was satisfied by an assertion that never reached it. The tool's enum and the schema's `CHECK` are the same list written twice, and a test driving only the tool cannot tell which one refused — the mutation is the only thing that says so, which is why it is worth running even on a change this small.  
**Retro**: [codebase discoveries] The register's own numbering had drifted twice over, and nothing could see it: the spec's table is prose, and the test transcribing it asserts contiguity over its *own* list rather than against the source. A register that is "itself the thing under test" is only under test as far as the transcription is honest.

---

## Retrofit the converted skills to the amended substrate
**Story**: 9  
**Status**: Complete  
**Blocked by**: Story 8  
**Satisfies**: FR25, FR10, FR24

Added by `/cpm:pivot` on 2026-08-10. Story 8 adds the columns; without this story nothing writes to
them, **which is precisely the state that produced these findings** — a schema that fully admitted
the fact, with no tool call that recorded it.

Eight already-converted skills are edited here, and their epics are Complete. That is deliberate:
the alternative is reopening 47-06 to 47-08, which would make three finished epics unfinished in
order to record work that postdates them.

**Acceptance Criteria**:

- A `present` run told to keep its output local writes a `communication` document with its sections, and writes no `artifact` row [feature]
- must NOT — an unpublished communication is recorded as an `artifact`, with a placeholder URL or any other stand-in for one [unit]
- A `library` run records an imported document's provenance in `library_document.source`, and a locally written one leaves it unset [integration]
- must NOT — a library document's provenance is written into a section body rather than into its column [unit]
- A `review`, a `consult` and a `party` run each record their participants as `document_agent` rows [integration]
- must NOT — a run with participants to record names them only in the document's prose [unit]
- `status`, `inspect` and `do` report a `superseded` or `withdrawn` item as retired rather than as pending or done, and `do` does not select work whose blocker is retired [feature]
- The shared **Perspectives** procedure loads the roster with `include_body`, so a voice rendered from it is rendered from the row's traits rather than from nothing [unit]

### Give `present` and `library` the columns they asked for
**Task**: 9.1  
**Description**: `present`'s converted file currently states that a local-only run has nowhere to store its output, and says so rather than pretending otherwise. That sentence is what this task deletes.  
**Status**: Complete  
**Inline change**: `present` step 5 gains the local branch — `create_communication` plus one `create_document_section` per section — and the rule that no `artifact` row is written without a real URL, because `artifact.url` is `NOT NULL UNIQUE` and the only way to record an unpublished one is to invent a link somebody will click. The two records are exclusive: published writes an artifact and no document, local writes a document and no artifact, and which one exists is the answer to whether it went out.  
**Inline change**: A local communication's sources are recorded by nothing, and the file says so. `communication` takes no parent and `artifact_document` hangs off the artifact this branch declines to write, so the ids stay on the session `state`. Stating the absence is what stops the next run reaching for a placeholder artifact to hold the join.  
**Inline change**: `library` derives a fifth field. A URL is its own provenance; a file path is the case that needs asking, because a file inside the project may equally be one the team wrote and one somebody dropped in. Unset means written here, and the file forbids the same fact as a bolded line or a *Provenance* heading.  
**Inline change**: Two 47-08 assertions were pinned to sentences this task rewrote, and both were restated rather than dropped: `present`'s declined branch still has to *say* which of the two happened, and `library` still presents every derived field before writing. The `no document row` claim narrowed to the published case, where its reason still holds.

### Record participants on reviews and discussions
**Task**: 9.2  
**Description**: `review` already writes them; `consult` and `party` each state the absence and forbid the workaround. Three skills, one join.  
**Status**: Complete  
**Inline change**: `review` needed no edit — it already calls `create_document_agent` with `document_kind: 'review'`, because Story 8 widened `review_agent` in place rather than adding a second table. `consult` and `party` each gain the call as a numbered step in the save, and each keeps a boundary the other does not: a dismissed agent is still a participant, and so is one whose contribution did not survive the edit.  
**Inline change**: Both files' "records no participants" paragraph became its inverse rather than being deleted. The rule that outlives the gap is that a name in a paragraph is not a record — what reads the join is a run asking which discussions an agent took part in, and prose answers it to a human and to nothing else.

### Teach the reporting skills the retired statuses
**Task**: 9.3  
**Description**: The reading half of Story 8's readiness clause. A skill that renders four statuses as two is the same false pass one layer up: a retired epic drawn on a board as pending is work somebody will pick up.  
**Status**: Complete  
**Inline change**: `status` gains **retired** as a reported category rather than a third way of saying pending, and a rule for the count: a retired story leaves the denominator instead of joining either side of it, with the number of them said out loud so a shrinking denominator is not silent. Its "closed set of two values" paragraph — accurate when it was written — was the clearest instance of a skill stating a vocabulary the database had since widened.  
**Inline change**: `do`'s three touch points are all places where the absence of ready work was about to be reported as the wrong one of three answers: the epic selection ("complete, retired, or waiting"), the story loop's exit, and the `CHECK`-set sentence at Step 2. The story-selection paragraph now states both readings of `status` and says neither is applied here — both are in the query — which is the distinction FR22 turns on.  
**Inline change**: `do` also gains the rule that `superseded` and `withdrawn` are not this run's to set. Without it the widened enum reads as a way to close a task that would not finish, which is the same false pass the story exists to close, arrived at from the writing side.  
**Inline change**: `inspect` keeps retired epics out of the "completed epic with no retro" gap query — it would report one forever on work that was dropped — and gains the finding in the other direction: a change set tracing to retired work is a finding that disappears exactly when the vocabulary is flattened.

### Fix the shared `Perspectives` roster load
**Task**: 9.4  
**Description**: One argument. `personality` and `communication_style` are body columns, so a bare `list_agent` returns names and roles and no traits — and the four skills that weave perspectives all render from what it returns. Found during Epic 47-08's Story 8 and left alone there because none of that epic's eight files consumes the procedure.  
**Status**: Complete  
**Inline change**: `include_body` added to step 1 of the shared **Perspectives** procedure, with the reason named at the point of the call — the two traits are body columns, and the failure is a roster that arrives looking complete. The four consumers (`discover`, `spec`, `architect`, `brief`) reach it only through the procedure, so one edit is the whole fix; `consult` was already correct because it reads each agent individually with `include_body`.

### Write tests for Retrofit the converted skills to the amended substrate
**Task**: 9.5  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete  
**Inline change**: `dpm/tests/skill-retrofit.test.js` — one file for eight skills and one shared procedure, because the story is one substrate. Splitting by skill would put the `communication` claim in one file and the `artifact` claim it is the other half of in another, and neither would carry the pairing. Suite: **529 pass, 0 fail**.  
**Retro**: [patterns worth reusing] Two of the four must-NOTs are driven rather than swept, because each file forbids its workaround *by naming it* — a pattern sweep reports the prohibition as the offence, which is the same trap `sentinel` and `basename` sprang in Stories 3 and 4. Both criteria are claims about rows (no artifact row exists; no section body holds what the column holds), so both are checkable against what a run wrote, each with a control that is wrong on purpose.  
**Inline change**: Writing the tests surfaced the real shape of the `Perspectives` bug. The shared procedure is not where the load happens — `discover`, `spec`, `architect`, `brief` and `review` each call `list_agent` in their own **Roster** startup block, so the shared fix would have arrived after a roster that was already flat. All five now pass `include_body`; `party` and `consult` were already correct. `review` is included though it weaves no perspectives: its panel renders a lens per persona from the same two columns.  
**Inline change**: Recorded rather than closed — `list_document_agent` scopes by `document_id` and not by `agent`, so "which discussions did this persona take part in" is a read across the documents in hand rather than a lookup. No criterion needs it and the skills' claims stay true without it; the test says so where it makes the cross-document read.  
**Retro**: [testing gaps] Thirteen mutations, thirteen caught, and four of them failed a test belonging to an earlier epic as well as this one — which is the signal that a story editing eight finished skills is being checked by more than the story that edited them.

---

## Notes

### Self-hosting register — this epic is where it must be empty

The register lives in Epic 47-01's Notes. It held five OPEN entries when this epic was
written; the pivot of 2026-08-08 closed all five. Story 6's third criterion requires every one
closed or explicitly waived, which is why this epic is last and why Story 6 is blocked by
Story 5 rather than running alongside it. **The criterion is not thereby satisfied** — it
asserts the register is empty at the end of the build, and later epics may add to it.

None of the five was fixable in this epic: every one needed a **spec** change, and those
changes went through `/cpm:pivot` after the breakdown, not during it. What this epic owns is
the check, not the repair:

| # | Bears on | Where it surfaces here | Closed by |
|---|---|---|---|
| 1 | Partial coverage indistinguishable from full | FR25 is covered across four matrices and complete in none; Story 5's enumeration is the closest thing to a fix without a schema change | FR26 — completeness is a claim on the requirement, decayed by four triggers |
| 2 | AD6's milestones have no table | This epic is M4, as are 47-06 through 47-08; nothing recorded that | FR27 — `milestone` rows and the `document_milestone` join |
| 3 | Inline ADs in a spec degrade to prose | Story 6 loads spec 47, which carries ten of them | `document_kind.dir` nullable — `adr` renders inside its parent and keeps its child tables |
| 4 | `retro→spec` parentage is unseeded | Story 6 loads retro 33, whose `**Source**` is a spec | Seeding widened to `retro→epic, spec or quick` |
| 5 | Body-prose references cannot be rewritten | Story 6 loads epics whose Notes name other epics by number | FR28 — `{{ref:<id>}}` markers resolved at render time |

**Entries 3, 4 and 5 were all exercised by Story 6's first criterion**, and each would have
failed it. That was the intended behaviour: the story is the check, and a failing check before
the pivot is the check working. It should now pass — which is a prediction this story exists
to test, not a result.

### Requirements only partially covered by this epic

**FR25** — four of twenty-two skills in Stories 1–4; **complete** in Story 5, which is where
FR25's corpus-wide criteria are asserted and where FR25 stops being partially covered for the
first time since Epic 47-06. **FR3** — same shape: the skill-corpus half completes here.
