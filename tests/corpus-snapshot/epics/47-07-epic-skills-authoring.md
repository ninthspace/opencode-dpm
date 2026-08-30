# Skills: Authoring

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Date**: 2026-08-08  
**Status**: Complete — all eight stories and all 32 coverage rows verified. Row 10's ✓ was cleared by the pivot of 2026-08-10 when `review_agent` became `document_agent`, and restored on 2026-08-10 against `skill-review.test.js`, which drives a review run writing `document_agent` rows against the roster and refuses a persona no `agent` row carries  
**Blocked by**: Epic 47-04-epic-projection-guard-and-merge, Epic 47-05-epic-parity-and-search  
**Retro applied**: 36 · Codebase discovery · Applied — each story opens by calling the reads and writes its skill needs against the live surface before any SKILL.md is written; this epic's tables (`adr_option`, `adr_option_tradeoff`, `finding`, `audit_finding`, `library_document`, `quick_criterion`) have had less consumer exercise than the spine's  
**Retro applied**: 36 · Pattern worth reusing · Applied — every conversion test opens with `bindings(source, tools, run)` from `support/skills.js` as standard rather than per-story choice; Story 8 runs it over all seven files at once  
**Retro applied**: 36 · Testing gap · Applied — retention assertions match a construction rather than a bare word, and every one is mutation-driven before its story closes  
**Retro applied**: 35 · Pattern worth reusing · Applied — Story 8's two sweeps treat every hit as a candidate to be opened and read before it is called a defect, and state any residual gap the pattern cannot catch in the test itself

Milestone M4 (AD6). Seven of FR25's twenty-two skills, one story each. These are the skills
that *produce* artefacts other than the spine's, and they are where CPM's prose markers are
densest — `**Retired**`, `**Retro waived**`, `**Superseded**`, each a separate convention
with its own parse. Every one becomes a column here.

Per the pattern set in Epic 47-06 and approved on 2026-08-08, FR25's and FR3's mechanical
checks sweep all seven files on Story 8 rather than being restated per story.

## Convert `discover`
**Story**: 1  
**Status**: Complete — all three criteria met; suite 433 passing, coverage rows 1, 2, 3 marked  
**Blocked by**: —  
**Satisfies**: FR25

**Acceptance Criteria**:

- A discover run writes a problem brief document and its sections through create tools [feature]
- The facilitation survives: the run still explores the problem before proposing, and still refuses to produce a brief from an unexamined premise [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

**Inline change**: `spec` and `epics` both instructed a run to select retro observations "judging by subject overlap and category" without naming `mcp__dpm__list_observation_category`, so a run had no route to the value both files key on. Fixed in both, and the shared startup that surfaced it now drives the category read in every conversion test, so the next occurrence fails a binding rather than shipping. Gated with Chris (2026-08-09)

**Retro**: [Codebase discovery] `discover` is the first skill in the corpus whose tool surface needed no addition — the consumer walk found all eighteen calls present and working. It is also the only skill with nothing upstream of it, which is the same fact: a skill that reads no other artefact asks less of the surface than one that does.  
**Retro**: [Testing gap] The three-direction binding caught `discover` describing selection by category without naming the tool that supplies one — and the fix generalised, because `spec` and `epics` had the identical gap and their tests could not see it. **A conversion test only binds what its run drives**, so a startup block duplicated per file is a blind spot duplicated per file; sharing the run is what converts one file's catch into the corpus's.  
**Retro**: [Patterns worth reusing] Driving the same run twice — once approved, once refused at the gate — is what makes "writes only after approval" observable. Both runs leave the same rows behind when the rule holds, so only the refusal distinguishes ordering from coincidence.  
**Retro**: [Testing gap] A fixture's exclusion control needs a body, not just a row. The out-of-scope library document had no section, so disabling the scope filter entirely consulted the same one section and every assertion passed — the mutation survived until the excluded document was given something to exclude.

### Rewrite the problem-brief write path as tool calls
**Task**: 1.1  
**Description**: The document and its sections. Undecomposed prose keeps a home in `document_section` rather than being over-modelled.  
**Status**: Complete

### Replace numbering, filename construction and the progress file with tool calls and a session row
**Task**: 1.2  
**Description**: The same four subtractions every skill makes. Stated once per skill because each file makes them independently.  
**Status**: Complete

### Write tests for Convert `discover`
**Task**: 1.3  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Convert `brief`
**Story**: 2  
**Status**: Complete — all three criteria met; suite 436 passing, coverage rows 4, 5, 6 marked  
**Blocked by**: —  
**Satisfies**: FR25, FR2

**Inline change**: `document_kind_parent` held no pair for `product_brief`, so `parentageOf` reported `mode: 'none'` and `create_product_brief` refused `parent_id` as an unknown argument — this story's first criterion had no route through the surface at all. `['product_brief', 'problem_brief']` seeded; root numbering makes the parent optional, which is what a brief started from a description needs. Found by the consumer walk before the file was written, gated with Chris (2026-08-09)

**Retro**: [Codebase discovery] A refused create still burns its number — `create_product_brief` allocates before the composite key refuses the parent, so a project that names a wrong-kind parent once has a gap in its brief numbering. The allocator's docblock accepts this deliberately ("nothing here can hand back a number it has handed back before"), and uniqueness is what matters, but "why is there no brief 2?" is a question someone will ask.  
**Retro**: [Testing gap] The three-direction binding cannot see a non-enum argument. `valuedArguments` reads `enum` declarations only, so a file that demoted its lineage from `parent_id` to a sentence of prose passed all three tests — the run still supplied the argument, because the test supplied it. **Where a claim is about a specific column rather than a vocabulary, the file has to be asserted directly.**  
**Retro**: [Testing gap] A prose assertion written against a hard-wrapped file breaks on the wrap, and worse, one written *with* a wrap in it stops constraining anything when the wrap moves. Added `prose(source, heading)` — `section` with whitespace collapsed — so a phrase assertion is about the words; `section` still returns raw text for structural checks that read the line breaks.  
**Retro**: [Patterns worth reusing] Seeding a decoy the wrong heuristic would have picked — a second, newer problem brief — is what makes "never take the most recent" checkable at all. It still needed the file asserted alongside it: the decoy proves the run stored the right parent, not that the instruction forbids the shortcut.

**Acceptance Criteria**:

- A brief run writes a product brief whose `parent_id` names the problem brief, read through a read tool rather than resolved by slug matching [feature]
- The facilitation survives: the run still gates on scope and still separates the problem from the proposed shape [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Rewrite the product-brief write path, resolving its parent through a read tool
**Task**: 2.1  
**Description**: Parentage is `parent_id` plus a `CHECK`-pinned `parent_kind`, so naming the wrong kind of document is a write-time failure rather than a chain that resolves to the wrong node.  
**Status**: Complete

### Remove slug-matching chain discovery
**Task**: 2.2  
**Description**: A brief cannot name a problem brief that does not exist, so it never needs to guess which one it meant. Slug matching exists only because a filename is the only handle a markdown store offers.  
**Status**: Complete

### Write tests for Convert `brief`
**Task**: 2.3  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Convert `architect` [plan]
**Story**: 3  
**Status**: Complete — all five criteria met; suite 441 passing, coverage rows 7, 8, 9, 27, 28 marked  
**Blocked by**: —  
**Satisfies**: FR25, FR14, AD7

**Inline change**: an ADR's `document_section` rows did not render. `adrBlocks` emitted the title, decision status, decision and the options with their tradeoff table, and nothing else — so an ADR's Context and Consequence had no home, and spec 47's own ten ADs each carry a `**Consequence**:` that Task 3.4 promised survives conversion. `adrBlocks` now splices the existing `sections()` helper over `collection(db, 'sections', adr.id)`. Found by the consumer walk before the file was written, gated with Chris (2026-08-09)

**Inline change**: Task 3.2's guard needed a hook neither factory had. `entityTools` ran `guard` on create only, so `update_adr_option` could add a second chosen option that `create_adr_option` would have refused; `documentTools` had no guard at all, so nothing could see zero-chosen at the moment an ADR became accepted. `guard` now runs on both calls and receives the *resolved row* rather than the arguments — on update the stored row with the changes over it — plus the tool name, so a refusal can say which call it refused. `DETAIL.adr` gained a guard of the same kind. Gated with Chris (2026-08-09)

**Inline change**: `dpm/skills/spec/SKILL.md`, twice. Its Section 4 said `decision_status` records "where it stands", which the guard now makes unreachable at create time — it names the promotion by `mcp__dpm__update_adr` and the order it requires. And its Prior decisions step said to "read each" while naming only `mcp__dpm__list_adr`; the decision is not on the list row, so `mcp__dpm__read_adr` is named beside it. The second was found by the consumer sweep this story's plan called for (2026-08-09)

**Retro**: [Testing gap] The three-direction binding cannot see a **boolean** argument either, and this is the same hole Story 2 found in a second shape. `valuedArguments` reads `enum` declarations, so a file that told a run to say which option was taken *in the rationale* — deleting `chosen` from the write step outright — passed all five tests. The run still supplied `chosen`, because the test supplied it. **Two stories running have now found this; the direction is worth widening rather than working around a third time.**  
**Retro**: [Codebase discovery] A guard that fires on the stored state rather than on the call refuses edits it should not. Running `DETAIL.adr`'s guard on every `update_adr` meant a title change was refused because the row was *already* in a state a restore had put it in — blocking the edit while leaving the violation exactly where it was. It is scoped to calls that touched the detail, which is the honest rule: what is refused is a call that sets the offending state, not one that arrives after one.  
**Retro**: [Codebase discovery] Enforcing "exactly one" needs both directions and the error messages have to know it. On an accepted ADR every single-step fix is itself refused — unsetting the choice leaves none, setting another leaves two — so a message advising either sends the caller into a second refusal. The accepted case is tested first and names the only route through: move the decision back to `proposed`. A guard whose message describes an impossible remedy is a guard people route around.  
**Retro**: [Patterns worth reusing] The consumer walk paid for itself twice over here, and both findings were about the *substrate* rather than the surface — a projection that dropped prose and a guard that did not exist. Neither would have surfaced from reading the tool list; both came from calling the tools in the order the skill would call them and looking at what came out.

**Acceptance Criteria**:

- An architect run writes `adr` rows with `decision_status`, plus `adr_option` and `adr_option_tradeoff` rows — the options and their axes are columns, not prose the skill formats [feature]
- Exactly one option per accepted ADR carries `chosen`, enforced at write time rather than by the integrity check finding it later [integration]
- An ADR is created as a child document of a spec, brief or discussion and renders inside its parent, with no number allocated and no path under `docs/architecture/` [feature]
- The facilitation survives: the run still works one phase at a time, still explores trade-offs across options before choosing, and still gates each decision before writing it [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Write `adr_option` and `adr_option_tradeoff` rows
**Task**: 3.1  
**Description**: Options and their axes stop being a prose table the skill formats and a reader compares by eye.  
**Status**: Complete

### Enforce exactly-one-`chosen` at the tool boundary
**Task**: 3.2  
**Description**: Register #8 exists because zero or two chosen options is not expressible as a row-level constraint. Refusing it at the tool boundary means this skill stops being a source of it — the register check stays, because a restore can still bring one in.  
**Status**: Complete

### Replace supersession-by-prose with a `supersedes` edge
**Task**: 3.3  
**Description**: Same reasoning as 3.2, for register #2. A superseded ADR with no outgoing edge is the state the register catches; writing the edge is what stops it being created.  
**Status**: Complete

### Create ADRs as child documents rather than root-numbered files
**Task**: 3.4  
**Description**: `adr` seeds with `dir IS NULL`, so an ADR renders inside the spec, brief or discussion that holds it and has no file of its own. This deletes the skill's number allocation and its `docs/architecture/` path construction outright — two of the five subtractions FR25 names, in one skill. It is also what closes self-hosting register entry 3: spec 47's own ten inline ADs keep `decision_status`, `adr_option` and the tradeoff axes instead of degrading to prose.  
**Status**: Complete

### Write tests for Convert `architect`
**Task**: 3.5  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Convert `review`
**Story**: 4  
**Status**: Complete — all five criteria met; suite 446 passing, coverage rows 10, 11, 12, 29, 32 marked  
**Blocked by**: —  
**Satisfies**: FR25, FR24

**Inline change**: `dpm/skills/review/SKILL.md` is new; the four listed below are edits to files this epic had already closed, all driven by the binding widening in the entry that follows and all verified by the suite that found them.

**Inline change**: `valuedArguments` in `dpm/tests/support/skills.js` widened, and the four SKILL.md files the widening caught. The binding's valued-argument direction read `enum` declarations only, so a boolean or a foreign key could be deleted from a write step with every test still passing — Story 2 lost a mutation to it, Story 3 lost one, and this story lost two (`remediation_task_id` in Step 5, `scope`/`scope_story_id` in Step 4). It now covers every **optional** argument of a **write** tool, plus enum arguments whether optional or not. Optionality is the discriminator: a required argument is forced by the call, an optional one happens only if the file asks. Scoped to writes because a read's arguments are a query the prose already prescribes in words. It found four real omissions on first run — `source_document_id`/`target_document_id` on the `supersedes` and `constrains` edges in `architect` and the `builds_on` edge in `spec`, `rationale` on `spec`'s ADR options, `theme` on `do`'s retro application, and `description` on `review`'s remediation tasks — all four files fixed, and one architect assertion re-pinned to the new wording (2026-08-09)

**Retro**: [Testing gap] **The same testing gap surfaced in three shapes across three stories before it was fixed at source.** Story 2 lost a mutation to a non-enum argument, Story 3 to a boolean, and this story to two foreign keys; each was closed with a direct prose assertion, and the third workaround was the signal that the direction, not the file, was the thing to change. The wrong cut was tried first — every declared argument — and it fired on owner foreign keys and free text in seven tests, because a file prescribes `document_id` by saying "on the ADR". Two narrowings later (optional-only, writes-only) it fired on exactly the omissions worth naming. **The lesson is about the second and third occurrence rather than the first: a workaround applied once is a fix, applied three times it is the finding.**  
**Retro**: [Testing gap] A forbidden-pattern check anchored on a literal digit does not see the generalised form of the same instruction. `RECOVERY`'s story-suffix pattern was `/-s\{?\d|-s2/`, so a Step 4 that said to suffix a slug `-s{n}` — the same prescription with a placeholder in place of the number — read as clean. Widened to `/-s(\d|\{\s*\w+\s*\})/`. The lesson generalises past this pattern: a sweep written against an example catches the example.  
**Retro**: [Codebase discovery] Naming a tool once in a file is not evidence a *step* uses it. Step 5 names `mcp__dpm__update_finding` twice — for the remediation link and for the rejection path — so deleting the first left the name-level binding satisfied by the second. A binding that asks "is this tool named anywhere?" cannot distinguish a step that lost its write from one that never had it, which is why the assertions that closed both survivors are scoped to a step rather than to the file.  
**Retro**: [Patterns worth reusing] Testing the *table* the edge replaced, and not only the edge, caught the mutation's real shape. `assert.doesNotMatch(section(source, 'Step 5: Remediation'), /\|\s*-{3}/)` fails on a file that reintroduces a findings-to-tasks table — the artefact `remediation_task_id` exists to delete. `section()` returning the raw body rather than collapsed prose is what makes a structural check like this possible.

**Acceptance Criteria**:

- A review run writes `review` with its `scope` and `scope_story_id`, `document_agent` rows referencing `agent` rows rather than carrying persona names as text, and `finding` rows with severity and category as taxonomy references [feature]
- A story-scoped review parents onto the epic and narrows by `scope_story_id`, rather than appending `-s2` to a filename [integration]
- The facilitation survives: agent selection still includes one reviewer challenging business value and one challenging technical approach, and the finding stage still reports comprehensively before the ranking stage curates [feature]
- A review run loads its roster from the `agent` table with no YAML parse, so a persona a project added and the plugin never shipped is offered to agent selection with no plugin change and no file edit [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Write `review`, `review_agent` and `finding` rows with domain-scoped taxonomy references
**Task**: 4.1  
**Description**: Severity and category are drawn from their own domains, so a severity cannot land in a category slot.  
**Status**: Complete

### Replace `-s2` filename scoping with `scope` and `scope_story_id`
**Task**: 4.2  
**Description**: A story-scoped review is the same kind of document with a narrower scope, which is a column pair rather than a filename suffix.  
**Status**: Complete

### Write tests for Convert `review`
**Task**: 4.3  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Convert `retro` [plan]
**Story**: 5  
**Status**: Complete — all four criteria met; suite 450 passing, coverage rows 13, 14, 15, 30 marked  
**Blocked by**: —  
**Satisfies**: FR25, FR10, FR24

**Inline change**: `list_observation` moved out of `childLists`'s derivation and declared in `LISTS` in `dpm/src/tools/list.js`, with `within: 'retro_id'`, `scopes: ['story_id']` and `live: 'retired_at'`. Derivation takes the first foreign key in column order, which is `retro_id` — the *grouping*. `story_id` is the origin, carried from before any retro exists, and without a scope for it "the observations of this story" was an unscoped list filtered by the caller. `live` is the existing vocabulary machinery and renders as `retired_at IS NULL` unless the caller passes `include_retired`, which is criterion 2's `WHERE` clause verbatim rather than a convention the skill remembers. Found by the consumer walk before the file was written, gated with Chris (2026-08-09)

**Inline change**: **task 6.2 moved here from Story 6.** `**Retro waived**` is written by `retro`'s triage mode and read by `/cpm:status`; `audit` never writes it, so the task was filed under the wrong skill. New migration `dpm/src/schema/015-retro-waiver.sql` adds `retro_waived_at` / `retro_waived_reason` to `document`, paired by a CHECK that SQLite does accept on `ALTER TABLE … ADD COLUMN` — the plan assumed it would not and the assumption was checked rather than carried. Exposed through `MUTABLE` in `dpm/src/tools/spine/document.js`. Gated with Chris (2026-08-09)

**Inline change**: the seven converted files' retro-awareness blocks, and `driveStartup`. All seven said "Skip any observation carrying a retirement", which the `live` declaration above makes a skip of nothing; they now say the list omits them, which is the stronger statement. `dpm/tests/support/skills.js` lost its matching `.filter((entry) => !entry.retired_at)` for the same reason — a filter in the run passes whether or not the clause exists, so its absence is now the assertion (2026-08-09)

**Retro**: [Testing gap] **A rationale paragraph outlives the step it explains, and a section-wide assertion cannot tell.** Two of this story's three survivors were the same shape: the numbered step was rewritten to create a fresh observation, or to null `story_id` as it gathered, while the paragraph underneath went on saying "Setting `retro_id` is the gathering, and nothing else changes". `prose(source, heading)` spans both, so every assertion passed. The fix is to extract the step's *instruction lines* and assert those separately from the prose that justifies them — the paragraph is why a maintainer keeps the rule, the line is the rule. Story 4 found the file-versus-step version of this; this is the section-versus-line version, and the general form is that an assertion must be scoped to the thing that can change alone.  
**Retro**: [Codebase discovery] **Nothing in dpm can un-retire, and the skill file claimed otherwise until a test failed.** CPM's retirement is a marker you delete; here `entityTools` drops null and undefined alike when building its change set, so `update_observation` with explicit nulls reports "nothing to update" — and the document path is worse, accepting the call and changing nothing at all. Both prose claims were corrected to say retirement and waiving are durable and this skill does not undo them. The silent no-op on the document update is the part worth carrying forward: a caller cannot tell a refused clear from an applied one.  
**Retro**: [Codebase discovery] `list_retro` has no `parent_id` scope, because `documentLists` gives root-numbered kinds no `within` — the scope is derived from numbering rather than from whether the kind has a parent, and `retro` is root-numbered *and* parented. Triage therefore lists every retro once and compares `parent_id` in the run. Not a prose parse and not wrong, but it is a join the tool could do, and the same gap applies to every root-numbered kind that takes a parent.  
**Retro**: [Patterns worth reusing] Checking the assumption rather than writing around it saved a real weakening. The plan said SQLite's `ALTER TABLE … ADD COLUMN` takes no table-level CHECK and that the pairing would have to be enforced by the tools — stated openly in the migration's own comment as a weakening against `observation`. Four lines of node confirmed it accepts a cross-column CHECK and applies it to the whole row. The comment now describes what the schema does instead of apologising for what it was assumed not to do.

**Acceptance Criteria**:

- A retro run gathers `observation` rows already written against stories by setting `retro_id`, leaving `story_id` intact, so an observation's origin survives promotion [feature]
- `learn` and `retire` set the retirement columns on the observation rather than editing a marker into prose; a retired observation is excluded from candidate gathering by a `WHERE` clause [integration]
- The facilitation survives: the four modes stay mutually exclusive, a `learn` still previews both the library entry and the retirement before either is written, and promotion still retires at the source in the same operation [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Gather observations by setting `retro_id` without clearing `story_id`
**Task**: 5.1  
**Description**: Inclusive parentage is what makes this possible — an exclusive constraint would make the act of gathering destroy the origin.  
**Status**: Complete

### Replace the `**Retired**` prose marker with retirement columns, and candidate filtering with a `WHERE` clause
**Task**: 5.2  
**Description**: Offer-side idempotency stops being a convention the skill remembers and becomes a predicate.  
**Status**: Complete

### Rewrite `learn` promotion to write a `library_document` and its `library_scope` rows
**Task**: 5.3  
**Description**: Provenance is a foreign key rather than a `→`-joined source line that has to be parsed to find what was promoted from where.  
**Status**: Complete

### Replace the `**Retro waived**` marker with a column
**Task**: 5.4  
**Description**: Moved here from Story 6 at the gate of 2026-08-09 — the marker is written by `retro`'s triage mode and read by `/cpm:status`; `audit` never writes it. One of three prose markers CPM maintains, each with its own parse. Making it a column is what lets a reader stop grepping for it.  
**Status**: Complete

### Write tests for Convert `retro`
**Task**: 5.5  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Convert `audit`
**Story**: 6  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: FR25, FR24

**Inline change**: **task 6.2 moved to Story 5 on 2026-08-09**, and the remaining tasks renumbered. `**Retro waived**` is written by `retro`'s triage mode and read by `/cpm:status`; `audit` never writes it, so the task was filed against a skill that has no use for the column. Story 5's triage mode could not convert without it, and Story 6 does not need it — which is the whole of the reasoning. The coverage matrix is unaffected: no row mapped to 6.2.

**Inline change**: **`audit_finding` gained `summary` and `recommendation` on 2026-08-09**, decided at a gate during the consumer walk. The table arrived carrying the citation, the dimension and the severity and nothing else, so a row could record that there was decay at `src/tools/list.js:42 (selectPage)` and could not record what the decay was — the asymmetry was in spec 47's own DDL, since the review-side `finding` has carried `summary TEXT NOT NULL` from the start. Migration `016-audit-finding-text.sql`, additive; `summary` is required at the create tool because `ADD COLUMN` cannot make it unwritable-by-omission the way `finding.summary` is. Effort and confidence were **not** added: spec 47 leaves CPM's scales to dpm, neither has a consumer here, and a vocabulary nothing reads is a column nobody queries arriving as a taxonomy domain.

**Retro**: `create_audit` takes no `commit_sha`, so pinning an audit to the tree it was taken at is `create_audit` followed by `update_audit`. Two calls where the fact is known before either — the SHA is captured at orient and the row is created at the gate. Not a blocker and not fixed here; the create tools take `slug`, `title` and the detail columns by convention, and widening that for one kind is a spine decision rather than a skill one.

**Retro**: `Object.fromEntries(tools.map((tool) => [tool.name, tool.handler]))` — the raw dispatcher every test builds beside the recorded one — now appears 44 times across 22 test files. Well past the third occurrence, and a one-line `raw(tools)` in `tests/support/skills.js` would take it. Not done here: it touches twenty-two files Story 6 does not own, and Stories 7 and 8 are still writing into several of them. Story 8 is the sweep story and is where it belongs.

**Retro**: dropping the `Recommendation` column from `dpm/src/projection/templates/audit.js` passed all 454 tests. The column was added in this story precisely so the pairing is answered on the row, and every assertion about it was about the *write*: the row had both columns, the citation rendered, and nothing compared the two ends. Closed with a rendered-row assertion in `skill-audit.test.js`; the general shape is that a column added for a reader needs an assertion that the reader gets it.

**Acceptance Criteria**:

- An audit run writes `audit_finding` rows whose dimension and severity are domain-scoped taxonomy references, rejected at write time if drawn from the wrong vocabulary [integration]
- The facilitation survives: the run still separates its complete findings from its ranked executive summary [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Write `audit_finding` rows with domain-scoped dimension and severity references
**Task**: 6.1  
**Description**: `audit_finding` and `finding` draw from different domains, and the scoping is what stops one accepting the other's rows.  
**Status**: Complete

### Write tests for Convert `audit`
**Task**: 6.2  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Convert `quick`
**Story**: 7  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: FR25, AD7

**Inline change**: **`observation` gained `quick_id` on 2026-08-10**, decided at a gate during the consumer walk, and migration `017-observation-quick.sql` is **the first that is not additive**. `observation`'s parentage CHECK admitted a retro or a story, and a quick record is neither — so the mandatory single-category observation this story requires had nowhere to live. SQLite cannot alter a table-level CHECK, so the table is rebuilt. The rule forward-only actually enforces is untouched: a new numbered file, no released one edited. The alternative needing no migration — a retro per quick — was rejected because an observation that arrives already grouped is one `retro` can never gather, which is the sentence task 7.1 is built on. `quick_id` behaves exactly as `story_id` does: written where the work happened, gathered later by setting `retro_id`, never cleared.

**Retro**: the rebuild failed first time on a hazard no additive migration meets. `ALTER TABLE … RENAME TO` reparses every schema object, and at the moment of the rename `observation` does not exist — so `createRetirementGuards`'s generated trigger on `observation_category` failed the reparse and rolled the whole migration back. A fresh database passed, because its guards are created *after* the migration loop; only the upgrade path had them. The fix is two `DROP TRIGGER IF EXISTS` at the top, safe because the guard set is regenerated from the finished schema. The general lesson is that a rebuild has to account for objects generated *outside* the schema files, which no reading of those files reveals.

**Retro**: dropping a recreated FTS trigger from the rebuild is **not** caught by the migrated-versus-fresh schema comparison — both paths lose it equally, so they still match object for object. Five FTS tests caught it instead. The identity test is necessary and not sufficient: it proves the two paths agree, not that what they agree on is complete.

**Retro**: the first mutation survived in the shape Story 5 already named — rewriting the numbered step to open a retro for the observation left the paragraph beneath still forbidding exactly that, and the run supplies `quick_id` whatever the step says. Third occurrence of section-versus-line across three stories, closed the same way each time. The pattern is worth stating outright in Story 8: **a step and the paragraph explaining it are two assertions, not one.**

**Acceptance Criteria**:

- A quick run writes a `quick` row with its `quick_criterion` rows and its single-category retro observation, all typed [feature]
- Promotion to a completion record is a status update, not a rewrite of the file [feature]
- The facilitation survives: a fix still has its root cause investigated and its diagnosis confirmed before any change is proposed, and implementation still refuses to begin without the written change description [feature]
- must NOT — the skill recovers an entity by reading a generated markdown file rather than by calling a read tool [unit]

### Write the `quick` row, its `quick_criterion` rows and its single-category observation
**Task**: 7.1  
**Description**: The mandatory single-category observation is a row like any other, so `retro` gathers it without knowing it came from a quick record.  
**Status**: Complete

### Make promotion to a completion record a status update
**Task**: 7.2  
**Description**: The record does not change shape when it ships; its status does. Rewriting the file was the only way to express that in markdown.  
**Status**: Complete

### Write tests for Convert `quick`
**Task**: 7.3  
**Description**: Write automated tests covering the story's acceptance criteria tagged `[unit]`, `[integration]`, or `[feature]`.  
**Status**: Complete

---

## Verify cross-story integration for Skills: authoring
**Story**: 8  
**Status**: Complete  
**Blocked by**: Story 1, Story 2, Story 3, Story 4, Story 5, Story 6, Story 7  
**Satisfies**: FR25, FR3, FR24, FR10

**Inline change**: **`list_observation` gained a `library_doc_id` scope on 2026-08-10**, decided at a gate during the consumer walk. The third criterion asks that a promoted observation's origin be queryable *from the library entry*, and there was no route: the list scoped by `retro_id`, `story_id` and `quick_id`, so a reader holding the entry could only list every observation and filter — and every promoted one is retired, so the filter has to ask for the retired rows first, which is a caller reconstructing the query the tool exists to answer. One line on the `observation` entry in `LISTS`; the column shipped in `006-review-retro.sql` and is kind-pinned, so no migration and no tool change. Provenance is now an edge readable from both ends, which is what Story 5's plan claimed it already was.

**Retro**: **two mutations against the vocabulary boundary both survived, and what they proved is worth more than the guard they failed to break.** Seeding the nine audit dimensions into the `finding` domain changed nothing, because `domain()` builds ids as `{domain}:{slug}` and the copies simply had different ids. Seeding them under their *original* ids in the `finding` domain also changed nothing, because `taxonomy`'s primary key is `id` alone — so a term cannot exist in two domains at all, and the insert-if-absent silently skipped every row. Criterion 4's refusal half is therefore enforced three deep: the id namespace, the composite foreign key, and the domain CHECK — and no mutation short of editing a released migration can reach it. The test documents a guarantee rather than guarding a mutable decision, which is a different and weaker thing than it looks; the half that *is* mutable is extensibility, and a plugin-shipped `enum` on `dimension_id` fails it immediately.

**Retro**: the `raw`-dispatcher consolidation recorded in Story 6 landed in `support/planning-database.js` rather than in `support/skills.js` where it was filed. Ten of the twenty-three call sites are tool tests that have no business importing skill-test support, and nine already used `raw` as a local name — so the recorded home would have forced either a half-migration or nine renames. Naming it `handlers` and putting it beside `openPlanningDatabase`, which all twenty-three already import, made it two edits per file with no new dependency. A consolidation's home is decided by its callers, and the callers were not surveyed when it was recorded.

**Retro**: `audit` cannot be parented on an epic — it is deliberately absent from `KIND_PARENTS`, because an audit is of a codebase at a commit and not of a document. The fourth criterion says "an audit of the same epic", which reads as parentage and is not available. The substance is unaffected: the two writes share a subject through the review's parent and the audit's `commit_sha`, and the criterion is about the two tables and their vocabularies. Recorded rather than fixed, because adding the pair would contradict the reasoning `KIND_PARENTS` states about root kinds that stand alone.

**Acceptance Criteria**:

- None of the seven skill files contains a filename pattern under `docs/`, a glob, a number-allocation procedure, or a progress-file lifecycle [unit]
- None of the seven skill files contains a SQL keyword or a `sqlite3` invocation [unit]
- An observation written by `do`, gathered by `retro`, and promoted by `retro learn` retains its `story_id` through all three, so its origin is queryable from the library entry [feature]
- A review of an epic and an audit of the same epic write findings into two different tables with independently scoped vocabularies, and neither accepts the other's severity rows [integration]
- must NOT — a skill writes a `retired`, `waived` or `superseded` marker as prose rather than as a column [integration]

### Write integration tests for Skills: authoring
**Task**: 8.1  
**Description**: The third criterion crosses into Epic 47-06 — `do` writes the observation this epic's `retro` gathers — and is the only place the full promotion chain runs. The final criterion generalises past this epic: three separate prose-marker conventions become columns, and only a sweep over all seven files shows none survived.  
**Status**: Complete

---

## Notes

### `review_agent` became `document_agent` after this epic completed

Added on 2026-08-10 by `/cpm:pivot`. **No story, criterion or status above is changed by it.** The
note exists because this epic's `review` conversion writes participant rows, and the table it writes
them to has since been renamed and widened.

Epic 47-08 Story 7 found that `review_agent` was pinned by composite foreign key to the `review`
kind, so a `discussion` — which both `consult` and `party` write — could not record who took part.
The spec now carries `document_agent`, pinned by `CHECK` to `review` and `discussion`, keeping the
composite-key guarantee the narrower table had. **Epic 47-09 Story 8** builds it and **Story 9**
updates the three skills that write to it, `review` among them.

Nothing here was wrong. The table was correct for the only consumer that existed when this epic
converted `review`; a second consumer arrived one epic later, which is retro 36's observation that a
conversion is a consumer test the tools have never had, showing up a second time.

### Self-hosting register — entries in this epic's scope

The register lives in Epic 47-01's Notes.

**Entry 3** is in scope and is this epic's most direct instance: `architect` is converted
here to write `adr`, `adr_option` and `adr_option_tradeoff` rows, and spec 47 carries ten
inline ADs with exactly that structure — which degrade to `document_section` prose because
`adr` is a document kind and an AD inside a spec has no home. The skill that would have
written them correctly is built here, against a schema that cannot hold them.

**Entry 4** is in scope: `retro` is converted here, and retro 33's `**Source**` is a spec.
`document_kind_parent` seeds `retro→epic`, so the converted skill cannot write the retro
this session produced.

Neither is actionable here — both need spec changes and both carry to `/cpm:pivot`.

### Requirements only partially covered by this epic

**FR25** — seven of twenty-two skills. **FR3** — the skill-corpus half, for seven files.
**FR24** — the write-side use of domain-scoped vocabularies; the schema is Epic 47-01 and
the tools are Epic 47-05. **FR10** — one criterion, on observation origin surviving
promotion, which Epic 47-05 also asserts at the tool layer.
