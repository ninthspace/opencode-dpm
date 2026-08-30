# Projection, Guard and Merge

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Date**: 2026-08-08  
**Status**: Complete — all six stories and all 24 coverage rows verified. Row 6's ✓ was cleared by the pivot of 2026-08-10 when FR10's template criterion stopped carrying a count and a fourteenth `document_kind` was added, and restored on 2026-08-10 against `templates.test.js`, which enumerates the registry against `document_kind` in both directions and carries no count  
**Blocked by**: Epic 47-02-epic-dump-and-restore, Epic 47-03-epic-server-and-spine-tools

Milestones M2 and M4 (AD6) — the projection and its guard are M2, the merge tool is M4. An
epic spanning two milestones is register entry 2 in the flesh, and the reason the entry
names this epic by number.

This is seam 2 of the spec's three (Testing Strategy): database state → markdown. It holds
the **merge tool**, moved here from Epic 47-02 because FR8's renumber criterion renames a
projection file and this is where projection filenames are decided.

## Render a document to markdown deterministically [plan]
**Story**: 1  
**Status**: Complete — the filename and the marker resolution are one derivation; both decisions are recorded below  
**Blocked by**: —  
**Satisfies**: FR6, FR28, AD3, AD8

**Acceptance Criteria**:

- Regenerating the projection twice from one database state yields byte-identical output [integration]
- A value written through a create tool appears in the rendered markdown for its document — determinism without this is satisfied by a renderer that emits nothing [integration]
- Two databases holding identical logical content, with child rows inserted in different orders, render byte-identical markdown [integration]
- No source file outside the projection renderer imports a markdown parser, and the renderer's only filesystem calls under `docs/` are writes — asserted over the module list, not over behaviour [integration]
- must NOT — a projected collection has no ordering column and no declared tiebreak, so its render order is whatever the query returns [unit]
- A `{{ref:<id>}}` marker in a section body and in a `requirement.text` both render as the target's current human identifier [integration]
- must NOT — a projected body contains a literal artefact number that no row produced [unit]

### Load a document and its children with an explicit `ORDER BY` on every collection
**Task**: 1.1  
**Description**: Every projected collection orders by a declared column, not by whatever the query returns. AD9's ULIDs make `ORDER BY id` a total order where no `position` exists, which is what closes the no-tiebreak clause.  
**Status**: Complete — `COLLECTIONS` in `src/projection/load.js` declares seven, each ending on the primary key

### Render the spec kind end-to-end as the renderer's worked example
**Task**: 1.2  
**Description**: One template, not thirteen — Story 2 completes the set. This exists so the fidelity criterion has something to assert against: a determinism test passes trivially against a renderer that emits nothing.  
**Status**: Complete — the spec template also renders the ADR inline, which is the only way "renders inside its parent" is a behaviour rather than a claim

### Write the fixed-format text writer — LF, trailing newline, no timestamps, no locale collation
**Task**: 1.3  
**Description**: Same discipline as Epic 47-02's dump formatter and for the same reason. Sorting anywhere in the render path uses byte order, never a locale collator.  
**Status**: Complete — the collation rule is asserted over the source, because no fixture can fail on it

### Write output with whole-file writes and keep markdown parsing out of the dependency graph
**Task**: 1.4  
**Description**: AD8's one-way rule is asserted over the module list, so the constraint is on imports as much as on behaviour. No read-modify-write under `docs/`.  
**Status**: Complete — and `project` now renders everything before writing anything; see the retro on partial projections

### Resolve `{{ref:<id>}}` markers to the target's current human identifier
**Task**: 1.5  
**Description**: FR28. Markers are resolved on every prose column, not only `document_section.body` — retro 33's reference to spec 47 lives in `observation.text`, which is why a section-scoped reference table was rejected during the pivot. Resolution is total: an unresolvable marker raises, and register #13 catches the ones that reach the database anyway. The must-NOT is what makes this checkable — a projected body may contain no literal artefact number that no row produced.  
**Status**: Complete — the pattern moved to `src/projection/markers.js` and `register.js` imports it, so the check and the resolver cannot disagree about what a marker is

### Write tests for Render a document to markdown deterministically
**Task**: 1.6  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete — 20 tests in `dpm/tests/projection.test.js`; 286 across the suite

**Retro**: **A partial projection is worse than no projection, and only running it showed that.** `project` was written to render and write each document in turn, which is the obvious shape and is wrong: a run that wrote nine files and refused the tenth leaves nine current files in a tree Story 3's guard then regenerates and diffs *clean* for every one of them — a stale projection wearing a passing check, which is NFR6's false pass arriving from the tool built to prevent it. It now renders everything into memory, collects every refusal, and writes only if all of them rendered. The same run found the refusal naming a kind and not a document: "no template for kind 'epic'" is unactionable in a corpus with fifty epics, because it does not distinguish an unregistered kind from one row with an unexpected one.

**Retro**: **The mutation that escaped was the one whose rule no fixture can test.** Replacing the byte comparison with `localeCompare` passed all nineteen tests: a collator and a byte comparison agree on every ASCII string, so the render was byte-identical on the machine running the suite and would differ on one with another `LANG`, or on prose carrying an accent. There is no database state that fails here and passes there — which is exactly why the criterion says the rule is asserted *over the module list*, and why the plan's intent to do so was not enough until the assertion was actually written. It now sweeps `src/projection/` for `localeCompare`, `Intl`, `toLocale*`, `Date.now` and `new Date`, with a positive control so an empty result is a finding rather than a broken regex.

**Retro**: **A source-text check can be answered by prose, and one of ours was.** Epic 47-03's NFR1 assertion greps `src/` for `from '…'` and failed on a sentence in `naming.js` reading `… apart from "cannot be named"` — ordinary English shaped like an import. The failure is loud, so it is not dangerous; what it is, is a check that teaches a reader to reword a comment rather than look at what fired. This story's own source assertions strip comments first. **The 47-03 check still does not**, and that is recorded rather than fixed here, because it belongs to a closed epic.

---

## Write a projection template for every document kind
**Story**: 2  
**Status**: Complete  
**Blocked by**: Story 1  
**Satisfies**: FR10

**Acceptance Criteria**:

- Every seeded `document_kind` row has a projection template, enumerated against the live table in both directions; the projectable non-document types and the ADR render inside a parent's template and are asserted to appear in one, with any type that reaches no template named by the same assertion rather than excluded from it [integration]
- The template registry is enumerated against the seeded `document_kind` rows, so a kind seeded without a template fails rather than rendering [unit]
- must NOT — a missing template falls back to a generic renderer, so an untyped dump ships in place of a failure [unit]

### Write templates for the remaining twelve document kinds
**Task**: 2.1  
**Description**: Story 1 delivered the spec template; this completes the thirteen seeded kinds.  
**Status**: Complete

### Render the nine projectable non-document types, and the ADR, inside their parent's template
**Task**: 2.2  
**Description**: These have no file of their own. The ADR joins them not as a child table but as a `document_kind` whose `dir IS NULL` — it keeps `decision_status`, `adr_option` and the tradeoff axes while rendering inside the spec that holds it, which is how the pivot closed register entry 3. Each must be asserted to appear in a parent's output, or the enumeration passes while the content is invisible. Nine, not the spec's ten: `session` has no `document_id`, so no parent's template can hold it, and projecting it would put back the `.cpm-*` leak FR11 removed — and the assertion must *name* it as unreachable rather than leave it out of the input, since an exclusion proves nothing.  
**Status**: Complete

### Build the kind→template registry and enumerate it against the seeded `document_kind` rows
**Task**: 2.3  
**Description**: Read from the live table rather than a hand-kept list, so seeding a fourteenth kind fails the test instead of silently rendering nothing. Resolution is total: an unregistered kind raises, with no generic fallback.  
**Status**: Complete

### Write tests for Write a projection template for every document kind
**Task**: 2.4  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete — 20 tests in `dpm/tests/templates.test.js`; 306 across the suite

**Retro**: **A whole seeded kind could not be named, and every test passed.** `coverage_matrix` hangs off an `epic`, which is itself child-numbered — the only two-deep chain the parentage allow-list permits — and Story 1's `identifierOf` required the *parent* to be root-numbered. It refused every coverage matrix there is, and refused it as "there is no identifier shape for that", which reads as a schema gap rather than as the rule being wrong. Nothing caught it because Story 1's fixture had one child kind, the epic, and an epic's parent is a spec. The rule is now the nearest root-numbered *ancestor* and the walk has no fixed depth to be wrong about. The matrix takes its epic's number — `47-03` for both — and what keeps the two files apart is the kind in the filename, which was already there for the directory collision and is now load-bearing for the number as well.

**Retro**: **The escaped mutation was caught by the wrong witness, not by no witness.** Replacing the coverage matrix's epic filter with a fallback — `criteria.get(id) ?? {criterion: {text: ''}}` — renders the foreign epic's row with an empty criterion cell. The test watched for the foreign criterion's *text*, which the fallback blanks, so it saw nothing and passed while a matrix rendered another epic's row. The witness has to be a column the wrongly-included row owns: `spec_fragment` lives on the coverage row itself and no substitution can blank it. The row count is the assertion nothing survives at all, and it is now there too.

**Retro**: **Four kinds sharing one template opened a hole no per-kind assertion covered.** `problem_brief`, `product_brief`, `discussion` and `runbook` are section-only, so they share `renderProse` — legitimately, since each names it and the registry is enumerated against `document_kind`. But a `renderProse` that emitted only its header would have left everything green: the enumeration counts keys, the appearance checks name values living on other kinds, and a header-only file still starts with `# `. The check that bites is driven from `document_section` itself — whatever sections a document holds must appear in the bytes that document produced — and it covers all thirteen kinds without a list to keep in step.

**Retro**: **CPM's spelling stopped working when the surrounding shape changed.** A story's lesson is a bare `**Retro**:` field in the corpus, and reproducing it put the story's lesson directly beneath `### Task 1`, where it read as that task's. The corpus gets away with it because its tasks are not headed sections; this projection's are. Nothing in dpm reads these files back, so the corpus's spelling is a courtesy rather than a contract — and where the two disagree, the shape that reads correctly wins.

---

## Guard against hand-edits and stale generated files
**Story**: 3  
**Status**: Complete  
**Blocked by**: Story 1  
**Satisfies**: FR7, AD8

**Acceptance Criteria**:

- A hand-edited generated file causes the pre-commit guard to exit non-zero, naming the file [feature]
- A write made since the last commit leaves `.dpm/dpm.sql` stale, and the guard regenerates it and fails, naming it [feature]
- must NOT — a hand-edit is silently overwritten with no diagnostic [feature]
- must NOT — a commit is accepted carrying a regenerated projection and an unregenerated dump [feature]
- must NOT — the pre-commit divergence guard compares by parsing a generated file rather than by regenerating and diffing bytes [integration]

### Regenerate the projection and the dump in the pre-commit hook and diff bytes
**Task**: 3.1  
**Description**: Regenerate-and-compare, never parse-and-compare. Parsing a generated file to check it is the failure mode AD8's clause names, and it would reintroduce the parser import Task 1.4 kept out.  
**Status**: Complete

### Report divergence by naming every differing file, and exit non-zero
**Task**: 3.2  
**Description**: Naming the file is the criterion, not just the exit code. Nothing overwrites a hand-edit: the guard refuses the commit and leaves the edit in place for the user to see.  
**Status**: Complete

### Fail on a stale `.dpm/dpm.sql`, on the same footing as a hand-edited projection
**Task**: 3.3  
**Description**: One guard, not two, because a commit carrying a fresh projection and a stale dump is the worse failure and would otherwise pass — the markdown looks current and the committed database is behind it.  
**Status**: Complete

### Write tests for Guard against hand-edits and stale generated files
**Task**: 3.4  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete — 13 tests in `dpm/tests/guard.test.js`; 319 across the suite

**Retro**: **"No parser imported" is not the must-NOT, and a structural check alone would have passed the mutation.** AD8 forbids checking a generated file by parsing it, and the shape that failure actually takes is nobody importing anything — it is a guard that trims trailing whitespace before comparing, or reads the metadata block into a map. So the tests that carry this criterion are edits chosen to be *semantically invisible*: the two trailing spaces `field()` emits as a markdown hard break, removed the way an editor removes them on save; and two metadata lines swapped, which any field-reading comparison sees as the same three values. Both are byte differences the next regeneration silently destroys. The structural sweep is kept beside them because it fails earlier and more cheaply, not because it is the guard.

**Retro**: **Opening the database is a write, and the obvious shape made the guard create one.** `DatabaseSync` makes an empty database at a path that has none, so "open it and let the failure fall out" writes a `.dpm/dpm.db` into the repository as a side effect of *checking* one — and then reports `no such table: document`, which names a SQLite internal rather than the thing that is wrong. Found by running the missing-database test, not by reading the code: the exit code was already 2, so only the message gave it away. The existence check now comes before the open, and the test asserts the file is still absent afterwards. A module whose whole promise is that it writes nothing has to count the database as something.

**Retro**: **The guard walked only what the projection produces, so a deleted document was invisible to it.** Every generated file matched, and the leftover from a document that no longer exists was never looked at — the same stale-projection false pass Story 1 found in a partial write, reached from the opposite direction. Orphan detection is an addition beyond the five criteria and is recorded as one on the matrix. The rule is deliberately narrow: only a file whose name carries a *seeded kind* in the position the renderer puts it, because a real `docs/` tree holds hand-kept files and a guard that reported those would be turned off.

---

## Merge two branches and renumber colliding numbers [plan]
**Story**: 4  
**Status**: Complete  
**Blocked by**: Story 1  
**Satisfies**: FR8, FR28, AD4, AD9

**Acceptance Criteria**:

- Two branches each adding a spec allocate distinct ULIDs for every row, so the merged dump has no primary-key collision on any table [integration]
- Two branches each adding an epic produce a resolvable text conflict, and the merged dump restores [feature]
- When both branches allocated the same human number, the merge tool renumbers one, renames its projection file, and re-renders the artefacts that referenced it; the restored database then passes `PRAGMA foreign_key_check` and the register's checks [feature]
- Renumbering a document through the merge tool changes no stored text, and the next render resolves every marker naming it to the new number [feature]
- must NOT — a number collision is resolved by silently overwriting one side, or left for the user to find when the projection renders two artefacts with the same number [feature]

### Detect human-number collisions across the two sides of a merge
**Task**: 4.1  
**Description**: ULIDs never collide, so the merge is only ever a text conflict; human numbers do collide, because both branches allocated from their own `max + 1`. Detection is separate from repair so the no-silent-overwrite clause has something to assert against.  
**Status**: Complete

**Retro**: **Detection had to be moved off the database before it could be written at all.** The
two partial unique indexes forbid a collision, so there is no moment at which a merge holds one
and can look at it. `collisions()` therefore takes a *candidate* row set — what the database is
about to hold — and reads its scopes from `PRAGMA index_list`/`index_info` on `document`, so the
detector and the constraint cannot disagree about what a collision is.

### Renumber one side — re-allocate from `number_sequence`, rename its projection file, re-render what referenced it
**Task**: 4.2  
**Description**: All three, or the projection renders two artefacts with the same number. The rename depends on Story 1's naming, which is why this epic owns the merge tool at all. The third is a re-render and not a rewrite: no reference ever stored a number, so a structural reference is a foreign key the renumber does not touch and a prose reference is a `{{ref:<id>}}` marker Task 1.5 resolves. The merge tool writes no text into any row.  
**Status**: Complete

**Retro**: **The rename is Story 3's orphan rule acted on rather than reported.** After the merge
re-renders, the guard already names every file on disk that no document produces — which is
exactly the loser's old path — so the tool deletes what the guard lists instead of recomputing the
old name from the old number. Recomputing it would be a second naming rule, and the two would
disagree the first time naming moved.

**Retro**: **The greater ULID loses, and the rule is direction-independent by construction.** It is
computed from data both sides carry, so merging main into a feature branch and the reverse move
the same document — which a test asserts by running both directions and comparing. "Ours always
wins" was considered and is worse: it renumbers a public artefact whenever the mainline is the
incoming side, and then re-collides on the next merge.

### End the merge with a restore, `PRAGMA foreign_key_check`, and the register sweep
**Task**: 4.3  
**Description**: Reuses Epic 47-02 Story 2's restore path rather than reimplementing the checks. A merged dump that restores is the only evidence the conflict was resolved correctly.  
**Status**: Complete

**Retro**: **Reusing `restore()` bought a guarantee the repair depends on, from a file that does
not know about it.** Each side is loaded through `restore()`, which runs the register — and entry
5 requires `number_sequence.next_value` to be at least the highest number allocated for its kind.
That, plus merging the counter as the larger of the two sides, is what makes the next allocation
clear every number in the union. A retry loop was written here first on the assumption that a
document might hold a number the counter never issued; nothing that restores can be in that state,
so the loop could not iterate. It is now one allocation and a named tripwire on the two facts it
rests on, both of which live in other files.

**Retro**: **The guard and the merge tool disagreed about what `<root>` meant.** The guard read
`docs/` under `root` and `.dpm/dpm.db` under the process's working directory. In a pre-commit hook
those are the same, which is why it went unnoticed — git runs hooks from the repository root. Run
against any other tree, as the merge tool does when it checks its own output, it compared one
repository's files against another's rows. Both now `resolve(root, location)`, so an absolute
`DPM_DATABASE` still points where it says.

### Write tests for Merge two branches and renumber colliding numbers
**Task**: 4.4  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

**Retro**: **Three of the five criteria run against a real `git merge` in a temp repository.** Two
of them are about the conflict itself, and a fabricated three-way input would prove the merge
function works while saying nothing about whether git ever produces that input — a live question
here, because `document_section.body` holds newlines and git merges lines.

**Retro**: **Every feature test computed its expected loser by calling `losersOf`.** Reversing the
rule moved the tool and the expectation together, and only the one unit test noticed. The
expectation is now stated in the test — `a > b ? a : b` — and reversing the rule fails four tests
instead of one. Found by mutating, not by reading.

**Retro**: **A mutation escaped that no criterion covers: dropping the deletions.** Every criterion
is written about two branches *adding* artefacts, so a merge that applied inserts and silently
dropped deletes satisfied all five. A test for a deletion crossing the merge closed it, and the
gap is declared on the matrix rather than left as an unlisted behaviour.

---

## Verify cross-story integration for Projection, guard and merge
**Story**: 5  
**Status**: Complete  
**Blocked by**: Story 1, Story 2, Story 3, Story 4  
**Satisfies**: FR6, FR7, FR8, NFR6

**Acceptance Criteria**:

- A database holding one document of each of the thirteen kinds regenerates byte-identically twice, so determinism is asserted across the full template set rather than the single kind Story 1 used [integration]
- The pre-commit guard runs against the real renderer and the real dumper, and a commit carrying only a database write is rejected until both generated artefacts are regenerated [feature]
- A merge that renumbers a spec yields a projection tree whose filenames and cross-references agree, and regenerating from the merged database changes no bytes [feature]
- must NOT — the guard passes because it regenerates with a renderer that silently skips a kind it has no template for [integration]

### Write integration tests for Projection, guard and merge
**Task**: 5.1  
**Description**: The final clause is what earns this story. Story 2's registry test and Story 3's guard test both pass in a world where the guard regenerates twelve of thirteen kinds and diffs clean, because neither one observes the other. Story 3 can also pass against a stubbed renderer — its own criteria are about exit codes and diagnostics, not about which renderer produced the bytes.  
**Status**: Complete

**Retro**: **The story's premise was right about the wrong component.** The task predicted the
composition gap would be the guard-against-renderer pair, and that pair held: `project()` refuses
the whole projection when a kind has no template, and the guard propagates it as exit 2. What
composition actually caught was the *hook* — installed the documented way, git could not execute
it at all, and three of Story 3's four rows pass against a hook that never runs. The lesson is the
same one one directory over: a component verified through the seam its tests find convenient is
not verified through the seam its users reach.

**Retro**: **Criterion 3 needed a reference from a document that was not renumbered.** A marker
pointing at its own document renders correctly whether or not the rename and the reference share a
derivation. The test now has both branches add a requirement *to the base spec* naming their own
new spec, so whichever loses, a third document's prose has to follow it — and it does, because
`pathOf` calls `identifierOf` rather than rebuilding the number.

---

## Address review findings
**Story**: 6  
**Status**: Complete — applied by `/cpm:pivot` on 2026-08-08 from review 05  
**Blocked by**: —

**Acceptance Criteria**:

- Each critical and warning finding from review 05 scoped to this epic has been addressed
- Existing acceptance criteria on other stories continue to pass

### Fix: `§195`, `§201` and `§202` resolve to the wrong passages
**Task**: 6.1  
**Description**: [warning] This epic's Notes cite `AD9 §202` for *"That is a tool in scope, not a convention to remember"* (actually spec line 212) and `AD9 §195`, twice, for *"every cross-reference in the projection becomes a moving target"* (actually line 205). The coverage matrix cites `AD9 §201` for the ULID-ordering passage (actually line 211). All three are off by exactly **+10** — the lines the spec gained when the pivot inserted FR26, FR27 and FR28 above them — so they were correct when written and were invalidated by an amendment to the document they point into, within the same session. Two of the three sit in the passage explaining why FR28 makes a prose reference a marker rather than a number, on the grounds that a stored number "would go stale the moment a merge renumbered its target, and no tool could find it to repair". Repoint them, and prefer a quoted phrase or a section heading to a line number. Epics 47-01 and 47-05 carry the other two instances.  
**Status**: Complete — all three repointed to AD9's headings; the drift itself is now recorded in the Notes

---

## Notes

### Self-hosting register — entries in this epic's scope

The register lives in Epic 47-01's Notes, where both entries this epic raised are now CLOSED
by the pivot of 2026-08-08. The rows are there and not repeated here, because a register kept
in two places is the defect this spec was written to remove.

**Entry 2 named this epic by number**: AD6's build order had no table and no column, and this
epic spans M2 and M4, so the corpus could not record where in the build order its own largest
epic sat. FR27 makes milestones spec-scoped rows and `document_milestone` a many-to-many join
— many-to-many precisely so this epic can say it spans two rather than being filed under one.
The schema is Epic 47-01; nothing in this epic implements it.

**This epic's breakdown raised entry 5** — body-prose references to another artefact, which
FR8's merge tool claimed to rewrite and dpm had no way to hold. FR28 closes it by making such
a reference a `{{ref:<id>}}` marker resolved at render time, and FR8 now says plainly that
nothing is rewritten because no reference ever stored a number. **The resolution work is this
epic's**: Task 1.5, and the merge-side criterion on Story 4.

The entry was worth its place because AD9's **Consequence**, in its second bullet ("The number
collision survives, and is resolved deliberately"), stated the rewrite as settled — *"That is
a tool in scope, not a convention to remember"* — while AD9's **Rejected: numbers derived at
render time** already knew prose references exist, having turned that option down on the
grounds that *"every cross-reference in the projection becomes a moving target"*. The two
passages together assumed a reference model the Data Model did not provide. FR28's answer is
that render-time numbering is correct after all, and the objection dissolves once the marker
holds a ULID rather than a number: the target moves, the marker does not.

**These three citations were line numbers until review 05, and all three had gone stale** —
`§202`, `§195` twice, and `§201` in the coverage matrix, each off by exactly the ten lines the
spec gained when the pivot inserted FR26, FR27 and FR28 above them. They were correct when
written and were invalidated within the same session by an amendment to the document they
point into. The irony is not incidental to this epic: these are the notes explaining why FR28
makes a prose reference a marker instead of a number, and they were themselves prose
references that stored a position. They now quote AD9's headings, which do not move when the
document above them grows.

### Two decisions Story 1 settled, because Story 4 depends on them

The spec fixes neither, and is explicit that it need not: dpm "does not read, parse, or reproduce
historic artefacts, and therefore does not inherit their conventions — legacy filename shapes …
are CPM's concerns, not dpm's". Both were put to Chris before Story 1 began rather than discovered
in Story 4, where the merge tool renames a projection file and re-renders what referenced it.

- **Filenames.** Root: `docs/{dir}/{number}-{kind}-{slug}.md`. Child:  
  `docs/{dir}/{parent number}-{sequence:02}-{kind}-{slug}.md`. `dir` is `document_kind.dir` and a  
  NULL there means the kind produces no file. **The kind is in the filename and not only in the  
  directory**, because `dir` is not unique — `epic` and `coverage_matrix` both project into  
  `epics`, and a name built from the number and slug alone would have them overwrite each other  
  with nothing reporting it.
- **`{{ref:<id>}}` resolves to the number alone** — `47`, or `47-03`. The author writes the noun  
  ("Epic {{ref:…}}") and the marker supplies only the part that moves, which keeps the renderer  
  out of choosing words and cases for thirteen kinds mid-sentence.

**They are one derivation, not two, and that is the load-bearing part.** `identifierOf()` is
written once; `pathOf()` calls it rather than rebuilding the number. Computed separately, a
renumber in Story 4 would produce a file whose name and whose inbound references disagreed — the
stale-reference failure FR28 exists to remove, reintroduced by the tool meant to repair it.

### Carried forward from Story 4

- **FR8's sentence described a mechanism dpm does not use — pivoted 2026-08-09, closed.** It said  
  the merge tool "restores the merged dump, detects the rows rejected by `document_root_number` and  
  `document_child_number`" — and a dump carrying two rows with one number does not restore at all,  
  so there is no rejected row to read. The tool reads git's three stages and detects the collision  
  on the candidate row set, using the columns read from those same two indexes. FR8 now says so,  
  and AD9 gained the loser rule Story 4 had to decide unaided: the greater ULID is renumbered. The  
  coverage matrix carries the full reasoning under row 16.
- **`.dpm/dpm.db` may be held open by a running MCP server** when the merge rebuilds it. The tool  
  restores into a staging file and renames over the target, so a failure leaves the old database  
  intact; it does not coordinate with a server. The report says to restart one when a WAL file is  
  present, which is a hint and not a check.

### Requirements only partially covered by this epic

- **FR6** — fully covered here. This epic owns the projection.
- **FR7** — fully covered here.
- **FR8** — the merge half only. The dump half is Epic 47-02.
- **FR28** — fully covered here. Marker resolution is a renderer concern (Story 1) and its  
  merge-time consequence is Story 4; nothing outside the projection reads a marker.
- **FR10** — the projection-template criterion only. The create-tool criterion is split  
  across Epics 47-03 and 47-05, so FR10 reads as partially covered in three matrices. That  
  split is the shape register entry 1 described; FR26 now gives the schema a way to tell it  
  from full coverage, which these matrices, being markdown, still cannot.

### Derived criteria

Story 2's second and third criteria are not verbatim from the spec. The enumeration
criterion is inherited from FR10's *"the enumeration has no member without one"*. The
generic-renderer clause has no spec counterpart — it was proposed during breakdown and
accepted by Chris on 2026-08-08, because a template registry is where a convenience
fallback gets added, and FR10's coverage would then pass with twelve templates and a dump.
