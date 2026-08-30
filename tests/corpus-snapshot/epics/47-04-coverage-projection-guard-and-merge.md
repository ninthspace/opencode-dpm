# Coverage Matrix: Projection, Guard and Merge

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Epic**: docs/epics/47-04-epic-projection-guard-and-merge.md  
**Date**: 2026-08-08

> **Verification rule**: Verification status (✓) is bound to criterion text. Any change to a story criterion or its spec mapping resets that row to unverified.

| # | Spec Requirement | Spec Text (verbatim) | Story Criterion (verbatim) | Covered by | Spec Test Approach | Verified |
|---|------------------|----------------------|----------------------------|------------|--------------------|----------|
| 1 | FR6 | Every artefact renders to markdown under `docs/`, regenerated from the database and committed | Regenerating the projection twice from one database state yields byte-identical output | Story 1 | `[integration]` | ✓ |
| 2 | FR6 | so that pull requests show a readable prose diff of what changed | A value written through a create tool appears in the rendered markdown for its document — determinism without this is satisfied by a renderer that emits nothing | Story 1 | `[integration]` | ✓ |
| 3 | AD9 | A ULID is lexicographically sortable by its timestamp prefix, which gives every table a stable default order for free — the tiebreak FR6's determinism criterion needs. | Two databases holding identical logical content, with child rows inserted in different orders, render byte-identical markdown | Story 1 | `[integration]` | ✓ |
| 4 | FR6 (must NOT) | The projection is a render, not a store (AD3). | must NOT — a projected collection has no ordering column and no declared tiebreak, so its render order is whatever the query returns | Story 1 | `[unit]` | ✓ |
| 5 | AD8 | nothing in dpm reads markdown, so the component that would have inherited CPM's parsing failures — retro 21's `awk -v` collapse among them — has no counterpart here | No source file outside the projection renderer imports a markdown parser, and the renderer's only filesystem calls under `docs/` are writes — asserted over the module list, not over behaviour | Story 1 | `[integration]` | ✓ |
| 6 | FR10 | Every seeded `document_kind` row has a projection template, enumerated against the live table in both directions; the child entity types and the ADR render inside a parent's template and are asserted to appear in one | Every seeded `document_kind` row has a projection template, enumerated against the live table in both directions; the projectable non-document types and the ADR render inside a parent's template and are asserted to appear in one, with any type that reaches no template named by the same assertion rather than excluded from it | Story 2 | `[integration]` | ✓ |
| 7 | FR10 | the enumeration has no member without one | The template registry is enumerated against the seeded `document_kind` rows, so a kind seeded without a template fails rather than rendering | Story 2 | `[unit]` | ✓ |
| 8 | FR10 (must NOT) | The list and every vocabulary in it are taken from a real CPM project's `docs/` tree | must NOT — a missing template falls back to a generic renderer, so an untyped dump ships in place of a failure | Story 2 | `[unit]` | ✓ |
| 9 | FR7 | A pre-commit guard regenerates both generated artefacts — the markdown projection and `.dpm/dpm.sql` — and fails on divergence in either, naming what diverged. | A hand-edited generated file causes the pre-commit guard to exit non-zero, naming the file | Story 3 | `[feature]` | ✓ |
| 10 | FR7 (must NOT) | Silent loss of a user's edit is one failure this prevents | must NOT — a hand-edit is silently overwritten with no diagnostic | Story 3 | `[feature]` | ✓ |
| 11 | FR7 | a commit carrying a fresh projection and a stale dump is the other | A write made since the last commit leaves `.dpm/dpm.sql` stale, and the guard regenerates it and fails, naming it | Story 3 | `[feature]` | ✓ |
| 12 | FR7 (must NOT) | a commit carrying a fresh projection and a stale dump is the other | must NOT — a commit is accepted carrying a regenerated projection and an unregenerated dump | Story 3 | `[feature]` | ✓ |
| 13 | AD8 (must NOT) | Because the projection is one-way, an edit made to a generated file is lost at the next regeneration. | must NOT — the pre-commit divergence guard compares by parsing a generated file rather than by regenerating and diffing bytes | Story 3 | `[integration]` | ✓ |
| 14 | FR8 | Surrogate keys are ULIDs and never collide, so the conflict is confined to the human numbers | Two branches each adding a spec allocate distinct ULIDs for every row, so the merged dump has no primary-key collision on any table | Story 4 | `[integration]` | ✓ |
| 15 | FR8 | Two branches that both add artefacts produce an ordinary text conflict (AD4). | Two branches each adding an epic produce a resolvable text conflict, and the merged dump restores | Story 4 | `[feature]` | ✓ |
| 16 | FR8 | dpm ships a **merge tool** that reads the conflict's three sides from git's index and restores each — every side is valid alone, because the collision exists only in their union — merges them by row, and detects the collisions on the merged row set, using the columns `document_root_number` and `document_child_number` govern. It then re-allocates the loser's number from `number_sequence`, renames its projection file, and re-renders the artefacts that referenced it (AD9). | When both branches allocated the same human number, the merge tool renumbers one, renames its projection file, and re-renders the artefacts that referenced it; the restored database then passes `PRAGMA foreign_key_check` and the register's checks | Story 4 | `[feature]` | ✓ |
| 17 | FR8 (must NOT) | re-allocates the loser's number from `number_sequence` | must NOT — a number collision is resolved by silently overwriting one side, or left for the user to find when the projection renders two artefacts with the same number | Story 4 | `[feature]` | ✓ |
| 18 | FR6 | Every artefact renders to markdown under `docs/` | A database holding one document of each of the thirteen kinds regenerates byte-identically twice, so determinism is asserted across the full template set rather than the single kind Story 1 used | Story 5 | `[integration]` | ✓ |
| 19 | FR7 | A pre-commit guard regenerates both generated artefacts | The pre-commit guard runs against the real renderer and the real dumper, and a commit carrying only a database write is rejected until both generated artefacts are regenerated | Story 5 | `[feature]` | ✓ |
| 20 | FR8 | renames its projection file, and re-renders the artefacts that referenced it | A merge that renumbers a spec yields a projection tree whose filenames and cross-references agree, and regenerating from the merged database changes no bytes | Story 5 | `[feature]` | ✓ |
| 21 | NFR6 | Any condition that could produce a false pass — a constraint violation swallowed, a projection silently stale, a search index behind the data — reports and blocks. | must NOT — the guard passes because it regenerates with a renderer that silently skips a kind it has no template for | Story 5 | `[integration]` | ✓ |
| 22 | FR28 | are written `{{ref:<id>}}` and resolved by the renderer to the target's current human identifier | A `{{ref:<id>}}` marker in a section body and in a `requirement.text` both render as the target's current human identifier | Story 1 | `[integration]` | ✓ |
| 23 | FR28 (must NOT) | A stored number would go stale the moment a merge renumbered its target, and no tool could find it to repair (FR8). | must NOT — a projected body contains a literal artefact number that no row produced | Story 1 | `[unit]` | ✓ |
| 24 | FR28 | A reference from one artefact's prose to another is a marker, never a number. | Renumbering a document through the merge tool changes no stored text, and the next render resolves every marker naming it to the new number | Story 4 | `[feature]` | ✓ |

**Mapping notes.**

**Row 3 maps to AD9, not FR6**, even though the spec's Acceptance Criteria Coverage table
files that criterion under FR6. The property being asserted — an insertion-order-independent
render — is delivered by ULIDs sorting by creation time, and AD9's **Consequence** says so in
the words quoted, in its first bullet ("Ids sort by creation time and carry no meaning"). FR6
states the obligation; AD9 supplies the mechanism, so the mechanism is what the row is bound
to. The citation read `§201` until review 05, by which point the spec's own pivot had moved
the passage ten lines; it is quoted by heading now for the reason FR28 exists.

**Rows 5 and 13 map to AD8.** Row 5 is the module-list assertion the spec tags AD8. Row 13's
clause the spec also tags AD8, and its Spec Text is FR7's own explanation of why one-wayness
requires refusal — the sentence the guard exists to honour.

**Row 8's Spec Text is the nearest requirement text, not a verbatim must-NOT.** FR10 carries
no clause about template fallback; this one was proposed during breakdown and accepted by
Chris on 2026-08-08. It is recorded here with FR10's text so the row is traceable rather
than appearing to quote a line the spec does not contain.

**Row 21 maps to NFR6, not FR6 or FR7.** The composition failure it describes — a guard that
diffs clean because the renderer skipped a kind — is a false pass, and NFR6 is the
requirement that forbids false passes generally. It is not in NFR6's sixteen-entry register,
because that register enumerates *schema* conditions; this one lives between two components.

**Rows 16 and 20 were rewritten by the pivot of 2026-08-08, and rows 22–24 added.** FR8's
"rewrites the references that named it" was either vacuous or unimplementable under FR2 —
register entry 5. FR28 closed it: a prose reference is a `{{ref:<id>}}` marker, so the merge
tool re-renders rather than rewrites and nothing writes text into a row. Both rows are
unverified under the verification rule, as is row 6, whose count moved from nine to ten plus
the ADR — and whose Story Criterion has since moved back to nine, for the reason the next note
gives.

**Row 6's Story Criterion says nine where the spec says ten, and the missing one is `session`.**
FR10's clause is written as an assertion over the finished projection, so the criterion started
as a copy of it; the count is the one thing that had to change. The spec's ten come from its
*tool-parity* paragraph, which enumerates the types a tool must exist for — a different list
from the types a parent's template must render. `session` is on the first and not the second
twice over: it has no `document_id`, so there is no parent whose template could hold it, and
projecting session state into `docs/` would put back the `.cpm-*` leak FR11 exists to remove.
The story therefore renders nine, and the criterion requires any type reaching no template to
be **named by the assertion** rather than dropped from its input — an exclusion that shrinks
the list it is checked against proves nothing, which is how a count moves from ten to nine
without anyone noticing the tenth. The ADR is counted apart from the nine because it is not
one of them: it is a `document_kind` with `dir IS NULL`, a document that renders inside another
document, and the only member of that class.

**Story 6's two criteria have no rows here, and that is declared rather than missed.** It is
the "Address review findings" story, which records repairs to this breakdown rather than
obligations drawn from the spec, so its criteria have no requirement to bind to. The
both-directions set comparison should expect exactly those two as an unmatched remainder.

**Partial coverage to flag.**

**Row 5 is the only row here whose rule no fixture can fail, and Story 1 proved it.** The
criterion says the module list is asserted "not over behaviour", which reads as a stylistic
preference and is not one. Replacing the renderer's byte comparison with `localeCompare` passed
every behavioural test in the story: a collator and a byte comparison agree on every ASCII
string, so the render was byte-identical on the machine running the suite and would differ on
one with another `LANG`, or on prose carrying an accent or a case the collator folds. There is
no database state that fails here and passes there. The same argument covers the filesystem
half — a renderer that reads a file produces correct output until the run where it does not, so
there is nothing to observe until the damage is done. Both are now swept over the source, with
comments stripped first and a positive control, so an empty result is a finding rather than a
regex that matches nothing.

**Rows 1 and 2 are a pair and neither is meaningful alone.** Row 1's determinism is satisfied
perfectly by a renderer that emits nothing, which is why row 2 exists — and row 2 is written
against values put in through Epic 47-03's **create tools** rather than by `INSERT`, because the
tool surface is the seam the projection sits downstream of. A renderer that agreed with
hand-written rows and disagreed with tool-written ones would pass a fidelity test built the
other way round.

**Row 4's guard is structural, and its behavioural twin would not have caught the mutation.**
Dropping the `id` tiebreaker from `document_section`'s ordering left the insertion-order test
(row 3) green: SQLite returned the tied rows in the same order both times, which it is entitled
to stop doing at any point. What failed is the assertion that reads `PRAGMA table_info` and
requires every declared ordering to end on the primary key. This is the same escape Epic 47-03
Story 4 recorded against its eight list tools, reproduced exactly, and it is the reason both
tests are kept with a comment in each saying which one bites.

**Row 6 is two assertions pulling opposite ways, and neither substitutes for the other.** The
enumeration is structural — the registry's keys against `document_kind`'s rows, in both
directions — and it is what catches a fourteenth kind arriving by migration with nobody writing
its template. The appearance half is behavioural, and it is what catches a template that exists,
is registered, and drops the collection it was written for. A registry of functions returning `''`
passes the first and fails the second; a set that renders twelve kinds beautifully passes the
second and fails the first. **Row 7 is the first of those two written as its own row**, which is
why it is not redundant with row 6: row 6's enumeration is the same check, and row 7 is where the
*failure mode* — a kind seeded without a template — is bound to a requirement fragment of its own.

**Row 6's appearance clause needed a third assertion neither half implied.** Four kinds are
section-only and share one template, and a shared template that emitted only its header would have
left both halves green: the enumeration counts keys, and the nine types' appearance checks name
values that live on other kinds. The check that bites is driven from `document_section` — whatever
sections a document holds must appear in the bytes that document produced — and it covers all
thirteen without a list to keep in step. Recorded here rather than in the criterion because it is
how the criterion is met, not a further obligation.

**Row 13's must-NOT is not held by the structural check that looks like it holds it.** "The guard
imports no markdown parser" is true of a guard that trims trailing whitespace before comparing, or
reads a metadata block into a map — which is the shape parse-and-compare takes long before anyone
adds a dependency. What carries the row is two edits chosen to be *semantically invisible*: the two
trailing spaces `field()` emits as a hard break, removed the way an editor removes them on save,
and two metadata lines swapped. Both are byte differences the next regeneration silently destroys
and any field-reading comparison calls equal. The structural sweep is kept beside them because it
fails earlier, not because it is the guard.

**The guard reports a third divergence class the criteria do not name, and it is declared here.**
Deleting a document removes no file, so a comparison that walks only what the projection produces
finds every generated file matching and never looks at the leftover — the stale-projection false
pass Story 1 found in a partial write, reached from the other direction. Orphan detection closes
it. It has no row because no requirement fragment covers it; it is recorded so a reader meeting it
in `src/guard/index.js` finds the reason rather than an unexplained feature.

**Row 16's spec text described a mechanism the format cannot support; Story 4 built the other
one, and the spec has since been pivoted to match.** FR8 said the tool "restores the merged dump,
detects the rows rejected by `document_root_number` and `document_child_number`" — restore first,
then read what bounced. A
dump carrying two rows with number 47 does not restore at all: the second `INSERT` trips the index
and `db.exec` is all-or-nothing, so there is no partially-loaded database to inspect. Loading it
would mean dropping both indexes *before* applying the file, which means splitting the file into
statements — and `document_section.body` holds newlines that `literal.text()` emits raw inside the
quoted string, so that is a quote-aware SQL parser sitting on the path that repairs a merge. The
tool reads git's three stages instead, each of which restores cleanly on its own, and detects the
collision on the *candidate* row set — the rows the merge is about to write — using the columns
read from those same two indexes. Same indexes, same rows, one step earlier. **The Spec Text above
now quotes FR8 as pivoted**, and the ✓ is unchanged: the Story Criterion never named a mechanism,
so nothing about what Story 4 verified moved — what moved is the requirement, onto the mechanism
that was verified. The reasoning is kept here rather than deleted with the old wording, because
the reason restore-then-detect cannot work is not visible in the amended sentence and a future
reader proposing it deserves to meet the measurement rather than repeat it.

**Dropping the indexes for the repair was tried first, and it reordered the committed dump.**
Taking them down does make the invalid state directly observable, which is why it was the first
design. `CREATE UNIQUE INDEX` then puts them back at the end of `sqlite_schema`, so the merged
`.dpm/dpm.sql` emitted its two index statements 70 objects later than every other dump of the same
schema — and every future dump of that database inherited it. A merge that rewrites the schema
section to repair one number is the spurious diff NFR4 exists to prevent, produced by the tool
written to resolve conflicts. Nothing caught it: the merged dump restored, passed
`foreign_key_check`, passed the register, and round-tripped through the dumper byte for byte,
because the comparison was against a database with the same defect. Row 14's sweep is now
accompanied by a schema-object comparison against the side the merge started from.

**Rows 22 and 23 are the render-time half of FR28; register entry 13 is the other.** They are
not redundant. The register reports dangling markers when something asks it to; the renderer
refuses to write a file containing one. Row 23 in particular is driven rather than asserted
about — the test renumbers the marker's target the way Story 4's merge tool will, re-renders,
and requires the old number to be gone and the stored text to be unchanged. A body that had
stored the number as literal text would survive that untouched and pass every other row here.

**Row 19 found that the pre-commit hook had never run from a commit.** Story 3 verified the guard
by calling `run()` and by spawning `bin/dpm-guard.js`, and both are correct ways to reach the
guard — neither is the way git reaches it. Installed as `dpm/hooks/pre-commit` documents, the hook
is a symlink in `.git/hooks/`, so `$0` is the link and `dirname "$0"` is `.git/hooks` — putting
`../bin/dpm-guard.js` at `.git/bin/dpm-guard.js`, where nothing is. Every commit would have failed
with a Node module-resolution stack trace, and the guard would never have compared anything. The
hook now resolves the symlink chain before taking a directory from it. **This is what row 19's
`[feature]` tag is for**: three of Story 3's rows are about exit codes and diagnostics, and all of
them pass against a hook git cannot execute.

**Two behaviours Story 4 delivered have no row, and are declared rather than left implicit.**
Neither is drawn from a requirement fragment, so neither has anywhere to bind.

- **A row changed differently on both branches refuses the merge.** Row 17 forbids resolving a  
  *number* collision by silently overwriting one side, and a body edited on both branches loses  
  the same way with no trace at all — one table over from where the criterion is watching. The  
  tool names the table and the row and exits 1, having written nothing.
- **A deletion crosses the merge.** Ordinary three-way behaviour, and it is recorded because  
  nothing in the criteria asks for it: they are all written about additions, so a merge that  
  applied inserts and dropped deletes satisfied every one of them.
