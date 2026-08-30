# Spec: dpm — SQLite-Backed Artefact Persistence

**Date**: 2026-08-08  
**Brief**: none — authored from a facilitated design conversation, taking CPM as the reference implementation  
**Artifacts**: [dpm — Schema Map](https://claude.ai/code/artifact/bb0b3460-708c-4fdf-8cf8-7664457c896b) · source `docs/artifacts/47-dpm-schema-map.html`

## Problem Summary

**Who this is for.** dpm is for the *next* project — started empty, by someone who has already run CPM at volume and knows what accumulates. A single real project carrying **393 CPM artefacts** is the evidence that the accumulation is real: seven retro categories written as twelve different headings, a `**Builds on**:` field invented independently in three specs because none was provided, coverage matrices whose verification marks outlive the criteria they attest to. None of that appears in a project with nine artefacts, and all of it compounds, because every artefact is read by parsing what an earlier one wrote.

**That project is the evidence, not the customer.** AD8 rules out an importer, so its 393 artefacts stay in CPM and dpm does not offer to repair them. Reading this spec as a remediation plan for an existing corpus is reading it for a benefit it does not deliver.

**The payoff lands on artefact one.** The drift above is not a debt that dpm pays off; it is a class of failure that never starts. On the first spec written through dpm, a requirement's class is a column rather than a spelling, so nothing later has to infer it from `ENVX2`. On the first retro, a category is a foreign key into `taxonomy`, so a seventh heading spelling cannot be introduced. On the first coverage row, the verification mark is invalidated by a trigger when the criterion it attests to changes. None of that waits for volume — volume is only what makes its *absence* expensive enough to notice.

So the person this helps is the one starting work they expect to run long enough for the difference to matter, and what dpm offers them is that "what is blocked", "is this requirement covered", and "does this ✓ still mean anything" are looked up rather than reconstructed — from the first artefact, not from the hundredth. That is the outcome; everything below is how.

CPM's entity model is real but implicit. A spec has requirements; an epic belongs to a spec; a coverage row joins a requirement to a story; an artifact points at the documents that produced it. None of those relationships is stored — each is spelled into markdown prose and reconstructed, on demand, by a parser.

The cost is measurable. `cpm/hooks/lib/coverage-parse.sh` (677 lines) and `coverage-rollup.sh` (802 lines) exist entirely to recover entities that were never persisted as entities: `FRn` labels lifted from prose bullets, matrix rows lifted from markdown tables, a parent spec lifted from a `**Source spec**` line. Two of those functions — `coverage_base_label()` (`coverage-parse.sh:239`) and `coverage_environmental_class()` (`:248`) — derive an entity's *type* from the spelling of its label, because there is nowhere else for a type to live.

Reconstruction fails in ways that are invisible. The parser's own header records one:

> `awk -v` applies escape processing to its value, so `\*\*` arrives collapsed to `**` and a pattern built that way silently matches nothing — a failure invisible in the pattern itself (retro 21). (`coverage-parse.sh:41–45`)

A coverage roll-up that silently matches nothing reports full coverage. The failure mode of a prose-derived entity model is not an error; it is a false pass.

The same shape recurs wherever a relationship has two ends. `cpm:artifact` maintains an index file *and* backlinks inside each source document — a bidirectional link kept honest by hand, where updating one side and forgetting the other produces no diagnostic. `cpm:archive` must preserve `docs/archive/{type}/` as a mirrored tree solely so the **Numbering** procedure's glob can still find retired numbers, making a directory layout into a load-bearing contract.

Three sections of `cpm/shared/skill-conventions.md` — **Progress File Management** (`:136`), **Stale-Progress Check** (`:167`), and **Numbering** (`:195`), 92 lines between them — specify in English what a database provides as primitives: session-scoped state with adoption on resume, staleness by age, and a monotonic sequence with retirement. `progress-classify.sh` and `cleancheck-guard.sh` (207 lines) implement the first two against the filesystem.

None of this is bad engineering. It is the necessary consequence of choosing a storage format that cannot express a foreign key. **dpm keeps CPM's pipeline and replaces its substrate.**

## Functional Requirements

### Must Have

- **FR1 — Artefacts persist as rows in SQLite.** Every CPM artefact type is a table with typed columns, not a markdown file parsed at read time. The database is the sole source of truth for artefact content and relationships.
- **FR2 — Cross-entity references are foreign keys.** An epic cannot name a spec that does not exist; a coverage row cannot cite an absent requirement; an artifact link cannot point at a missing document. `PRAGMA foreign_keys=ON` is enforced on every connection, and a violation is an error at write time rather than a discrepancy discovered later.
- **FR3 — Skills write exclusively through typed MCP tools.** dpm ships an MCP server whose tool schemas are the write contract. No skill contains SQL, and no skill constructs a query. A malformed call is rejected at the tool boundary before it reaches the database.
- **FR4 — Entity type is a column, never a spelling.** Requirement class, MoSCoW band, status, test-approach tag, coverage verification state, and whether a story is planned before it is executed are typed columns constrained by `CHECK`. Nothing infers a type by parsing an identifier — including from a marker inside a title, which is where CPM keeps a story's `[plan]` mark and is one of the parses FR25 removes.
- **FR5 — Numbering is a database concern.** Human-facing artefact numbers are allocated monotonically and are never reused, including after archival. No glob, no filename parse, no archive-mirror contract.
- **FR6 — A markdown projection is generated and committed.** Every artefact renders to markdown under `docs/`, regenerated from the database and committed, so that pull requests show a readable prose diff of what changed. The projection is a render, not a store (AD3).
- **FR7 — Hand-edits to the projection are detected and refused, and the committed dump is regenerated by the same guard.** Because the projection is one-way, an edit made to a generated file is lost at the next regeneration. A pre-commit guard regenerates both generated artefacts — the markdown projection and `.dpm/dpm.sql` — and fails on divergence in either, naming what diverged. Silent loss of a user's edit is one failure this prevents; a commit carrying a fresh projection and a stale dump is the other.
- **FR8 — The committed database representation is text.** A deterministic, sorted `.sql` dump is committed; the binary `.db` is generated and ignored. Two branches that both add artefacts produce an ordinary text conflict (AD4). Surrogate keys are ULIDs and never collide, so the conflict is confined to the human numbers: dpm ships a **merge tool** that reads the conflict's three sides from git's index and restores each — every side is valid alone, because the collision exists only in their union — merges them by row, and detects the collisions on the merged row set, using the columns `document_root_number` and `document_child_number` govern. It then re-allocates the loser's number from `number_sequence`, renames its projection file, and re-renders the artefacts that referenced it (AD9). **Detection is before the write and not after a rejection**, because a dump carrying two rows with one number does not restore at all — the second `INSERT` trips the index and the restore is all-or-nothing, so there is no state in which the rejected rows exist to be read. A tool that waited to be refused would have to split the merged file into statements, and `document_section.body` holds newlines that the dump emits raw inside the quoted string — a quote-aware SQL parser, on the path that repairs a merge. **Nothing is rewritten, because no reference ever stored a number**: a reference between artefacts is either a foreign key, which renumbering does not touch, or a `{{ref:<id>}}` marker in prose, which the renderer resolves to the target's current identifier (FR28).
- **FR9 — Search is a query, not a grep.** Artefact bodies *and* the hand-written text on their child rows — requirements, story criteria, retro observations, review findings — are indexed with FTS5 and exposed as a typed search tool returning ranked results, each hit naming the entity and row it came from. A search can be scoped to one entity type or left open across all of them. **Which columns are indexed is derived from the schema and checked, never listed in prose.** A column holding prose a person wrote that no other column can find the row by is either indexed or carries a recorded reason it is not; a column that is neither fails the check. A list is the wrong instrument here because its two failures are not symmetric: a stale entry is visible to anyone who reads the list against the schema, whereas a column nobody thought to add is visible to no one, and the search answers, ranks, and returns nothing. **What search cannot do is stated alongside what it can**, for the same reason — FTS5 matches whole tokens and prefixes, so there is no infix match and no stemming, and `rank` is bm25 *within* one index, so an unscoped query interleaves two independently-scored rankings rather than ordering globally. An empty result is therefore not evidence of absence, and no step in the corpus may treat it as one.
- **FR10 — Full CPM artefact parity, derived from real output.** Every artefact type CPM produces is modelled from the outset: brief (problem and product), ADR, spec, requirement, epic, story, task, story criterion, coverage, review, finding, retro, lesson, quick record, discussion, communication, artifact, library document, audit, runbook, milestone, verification record, and session state. The list and every vocabulary in it are taken from a real CPM project's `docs/` tree, not from CPM's documentation — the two disagree. **`communication` is the one entry not derived that way**, because CPM has no file for it: `cpm:present` drafts content for an audience and then either publishes it, producing an `artifact` row and nothing else, or is told to keep it local, at which point the draft has nowhere to go. Parity with a gap is still a gap; the kind exists so the local branch has a store rather than a prohibition.
- **FR11 — Session state is a row.** The progress-file subsystem — session-suffixed filenames, hook injection, adoption on `--resume`, compact-summary companions — is replaced by a session table. Adoption is an `UPDATE`; staleness is a `WHERE` clause. **Adoption is an obligation on the corpus and not only a tool**, which is the half that has no natural test: a working `adopt_session` that no skill reaches on startup loses exactly as much state as no adoption at all, and every suite passes, because each one drives the tool directly. So a skill that records a session also carries the resume path — via the shared *Session Startup* convention rather than by restating it — and that is checked over the corpus.
- **FR21 — Verification is bound to the text it verified, and decays when that text changes.** A coverage row records what it was verified against; editing either the requirement fragment or the story criterion resets it to unverified automatically. Every coverage matrix CPM writes states this rule in prose and relies on an agent to honour it; here the database enforces it.
- **FR26 — Whether a requirement's bindings *account for* it is recorded, and decays like a verification.** FR21 makes each coverage row's ✓ decay; nothing makes the *set* of rows decay, so a requirement with one of five obligations bound reads exactly like one fully covered — a roll-up that matches something reports full coverage, which is the Problem Summary's defect with the sign flipped. Completeness is therefore a separate, deliberate claim on the requirement, cleared automatically whenever a coverage row for it is added or removed, its fragment is edited, or the requirement's own text changes.
- **FR27 — The build order is data.** A specification's milestones are rows scoped to it, ordered, and joined to the artefacts that deliver them — so "which epics are in M2" is a query, and an epic that spans two milestones says so rather than being filed under one. Without this, a build order stated in prose is unreachable to every tool that would sequence work by it.
- **FR28 — A reference from one artefact's prose to another is a marker, never a number.** Cross-artefact references that are structural are foreign keys (FR2). The rest — a sentence in an epic's notes naming another epic, a retro observation citing the spec it came from — are written `{{ref:<id>}}` and resolved by the renderer to the target's current human identifier. A stored number would go stale the moment a merge renumbered its target, and no tool could find it to repair (FR8).
- **FR22 — Relationships between artefacts are typed edges, not status values.** Blocking, spec-to-spec lineage, and ADR constraint are rows in one edge table with a kind, so "which epics are ready" is a query, a blocker's completion is visible to everything downstream, and a new relationship kind is data rather than a migration. Source and target may each be a document or a story. **Only completion clears a blocker**: a blocker that is `superseded` or `withdrawn` is terminal but undelivered, so readiness treats it as unsatisfied rather than as done. Reading every non-pending state as satisfaction is what makes abandoned work look like finished work, and it starts the thing that was waiting on it.
- **FR24 — Every controlled vocabulary is a table, and projects may edit it.** Observation categories, finding categories, audit dimensions, severities, test approaches and **agent personas** are rows referenced by foreign key — seeded with defaults, extensible per project, and retirable without invalidating rows that already use them. An item may carry more than one category where the work genuinely spans two. A vocabulary default the plugin later adds or retires reaches an existing project through **FR12's migration channel, never a re-seed**: a migration may *insert a term that is absent* and *retire a term that is live*, and may **not** rewrite the text of a term that rows already reference. Both permitted operations are idempotent and neither reads project state, so a project's own additions, edits and retirements survive every upgrade without the schema having to record which rows it touched.
- **FR23 — Two-level numbering.** Root-numbered kinds (a spec) and child-numbered kinds (an epic, numbered within its spec and restarting at 1 per parent) are both allocated monotonically and never reused.
- **FR25 — The skill corpus is twenty-three files, enumerated here, each written against the tool surface.** Naming them is what makes AD6's largest line item plannable and testable. Twenty-two mirror CPM's pipeline one for one: `architect`, `archive`, `artifact`, `audit`, `brief`, `clean`, `consult`, `discover`, `do`, `epics`, `inspect`, `library`, `party`, `pivot`, `present`, `quick`, `ralph`, `retro`, `review`, `spec`, `status`, `templates`. **What makes one of those different from its CPM counterpart is subtraction, and it is the same subtraction in every file**: no filename construction, no glob, no number allocation, no markdown parsing, no progress-file lifecycle, and no procedure that recovers an entity by reading what an earlier skill wrote. Each of those is a tool call. What remains is the facilitation — the questions, the gates, the judgement — which is the part that was never the storage layer's business. **The twenty-third, `publish`, is dpm's own** (AD11): CPM's artefacts *are* its files, so it has nothing to regenerate, while dpm's are rows and the files are a render that something has to write. It is defined by what it adds rather than by what it subtracts, and it needs no counterpart to justify it.

**The mirroring is a one-time parity commitment, not a standing constraint.** AD6 requires dpm to reach CPM's pipeline before it ships, which is what the twenty-two are; it does not make CPM the definition of dpm's corpus, and nothing about a dpm capability has to be argued back to a CPM equivalent. **Where dpm needs a skill CPM has no reason to have, it has one.** So the two checks over this list are different in kind and neither subsumes the other: **FR25's enumeration is the oracle for dpm's own corpus** — every name here exists and no skill exists that is not named here, in both directions — while **CPM's `skills/` directory is only ever an oracle for the conversions**, catching a hand-kept list that has gone short of a stage a CPM user can reach. A dpm skill CPM lacks is not a failure of either check, and never becomes one.

- **FR29 — The server is declared by the plugin, and the name a skill writes is the name the harness dispatches.** FR3 says dpm *ships* an MCP server; shipping one is not the same as reaching one. A server that nothing declares is never launched, so its tools are absent from the session and every skill written against them calls into nothing — a failure that no test spawning the server over stdio can see, because that test supplies the launch the session does not. The plugin manifest therefore declares the server, and a test asserts the declaration names an entry point that exists. **Because the harness namespaces a plugin-bundled server's tools as `mcp__plugin_<plugin>_<server>__<tool>`, the exported name and the callable name are not the same string, and the callable one is the contract**: tools are exported unprefixed (`create_spec`, `list_requirement`) and called as `mcp__plugin_dpm_dpm__create_spec`. That is what an FR25 skill writes and what NFR5 is checked against. Carrying the prefix in the export as well would yield `mcp__plugin_dpm_dpm__dpm_create_spec` — the server's identity stated twice, once by the harness and once by hand.

**The plugin name is in there as well as the server key, and this requirement originally said otherwise.** `mcp__<server>__<tool>` is the form for a server registered directly, with `claude mcp add`; a server a *plugin* declares carries both names, and the two `dpm` parts above are the plugin and the server key rather than a duplication to be tidied away. The distinction is not visible from inside this repository — the suite spawns the server itself, so every test of it supplies a launch that bypasses the harness's naming entirely, which is the same blind spot the first half of this requirement exists to name. **The prefix is therefore derived from the plugin manifest rather than transcribed**: the manifest already carries the plugin name and the single `mcpServers` key, so a constant spelling it out is a second copy of something stated exactly once, and it is the copy that was wrong.

### Should Have

- **FR12 — Schema migrations are versioned and forward-only.** A `schema_version` row and an ordered migration set, applied automatically on server start, so a plugin update never requires the user to intervene.
- **FR13 — Reads are bounded by default, and the default is always raisable.** Query tools return summaries rather than whole bodies unless a body is explicitly requested, and every list-returning tool takes a `limit` with a default, so a skill reading an epic no longer pulls 20 KB into context to answer a question about its status. **There is deliberately no ceiling.** A cap the caller cannot lift is a boundary on what dpm can be asked for, and a planning store that cannot return a large artefact when a large artefact is what was asked for has traded usefulness for a number. The bound is a default that costs nothing to override, not a limit. **Overriding it is an obligation on the corpus, and one that has to be stated because its failure is invisible**: a withheld column arrives as an *absent field*, not as an error, so a skill that renders stored text from a read that never asked for it produces output that is well-formed, structurally complete, and simply says less. Nothing is empty and nothing throws — the missing text reads as a field nobody filled in. So a skill that renders or quotes stored text requests the body, a skill that needs only identity or a typed column does not, and which of the two each read is gets recorded rather than left to be inferred from what a file happens to say.
- **FR14 — The invariants SQLite cannot hold are enumerated, and a tool checks every one.** A verification tool reports orphans, dangling links, and each entry in the cross-row invariant register (Data Model), so a corrupted state is diagnosable without SQL. The register is the contract: an invariant that cannot be a constraint is not thereby excused from being checked, and "constraint drift" as a phrase covers nothing a test can fail on.

### Could Have

- **FR16 — Semantic diff.** A tool rendering the difference between two database states as entity-level changes rather than text.
- **FR17 — Cross-project queries.** A read path spanning several project databases, for portfolio-level status.

### Won't Have (this iteration)

- **FR18 — Round-trip import of the markdown projection.** The projection is explicitly one-way (AD3). Markdown is never a write path.
- **FR19 — Concurrent multi-writer coordination beyond SQLite's own.** WAL mode and SQLite's locking are the whole concurrency story; no external lock manager.
- **FR20 — A migration path *back* to CPM's file format.** Adoption is one-directional; dpm does not maintain an exit.

## Non-Functional Requirements

- **NFR1 — No native compilation at install time.** The plugin installs by clone or marketplace fetch with no build step, no `node-gyp`, and no per-platform binary. Satisfied by AD5's choice of `node:sqlite`.
- **NFR2 — The runtime is checked for what it can do, not only for what it is called.** The server refuses to start with a clear message rather than failing on a missing module or a missing SQL feature. That is two checks, and conflating them is the mistake this requirement is written against. The **floor** — `>=22.5.0` — is what makes `node:sqlite` exist at all; below it the failure is `ERR_UNKNOWN_BUILTIN_MODULE`, which is the message the floor check replaces. `node:sqlite` is experimental and its API may change between minors, which is the floor's other reason to exist. The **capability** is FTS5, and the floor does not imply it: `node:sqlite` shipped in 22.5.0 *without* FTS5, which was enabled by [nodejs/node#57621](https://github.com/nodejs/node/pull/57621) and released in **22.16.0**. Node 23 never received it — its final release, 23.11.0, predates the change, and the line reached end-of-life in June 2025 — so the floor admits an entire major version that cannot maintain this schema. FTS5 is also a build-time option (`--sqlite-enable-fts5`), so a custom build at any version can go either way, and **a version comparison can therefore never be a correct predicate for it**. The capability is probed on the connection, and probed at **every** open rather than when migrating: a database that another binary has already migrated records every migration as applied, so the migration path is precisely the path that does not run. The refusal names the capability, the Node in hand, and `process.execPath` — the question a user is left holding is *which interpreter is this actually*, and the process is the only thing that knows.
- **NFR3 — Standard output is reserved for JSON-RPC.** The MCP stdio transport owns stdout. All logging, including Node's `ExperimentalWarning` for `node:sqlite`, goes to stderr or is suppressed (`NODE_NO_WARNINGS=1`). Verified on Node v22.18.0, where `node:sqlite` loads with no flag and emits the warning on stderr only.
- **NFR4 — The dump is byte-stable.** The same database state produces the same `.sql` bytes on any machine, on any run — ordered rows, no timestamps, no locale dependence. Without this, FR8 delivers a text file that conflicts on every commit.
- **NFR5 — Tool names are discoverable.** This harness defers MCP tool schemas, listing tools by name and loading schemas on demand, so a large tool surface costs a name list rather than a wall of JSON Schema. Names must therefore be searchable words (`create_epic`, not `ce`, reaching a session as `mcp__plugin_dpm_dpm__create_epic` per FR29); brevity is not a virtue here. The rule is that every underscore-separated part is a whole word, which a test can check without maintaining a list of permitted abbreviations — a list being one more hand-kept vocabulary of exactly the kind this spec exists to remove.
- **NFR6 — Failure is loud.** Any condition that could produce a false pass — a constraint violation swallowed, a projection silently stale, a search index behind the data — reports and blocks. This spec's subject applied to itself: the failure being designed against is one that looks like success.
- **NFR7 — The database is never a black box to its owner.** Every piece of state is reachable through a read tool without SQL, so a user whose server will not start is not locked out of their own planning history.

## Architecture Decisions

No ADRs exist for this project; these were facilitated from scratch during the design conversation of 2026-08-08.

### AD1 — SQLite is the source of truth, not an index over files

**Decision**: Artefact content and relationships live in SQLite. Markdown is derived.

**Rejected**: markdown as truth with SQLite as a derived cache. It preserves git behaviour perfectly and changes nothing about drift, because it keeps the parser — entities are still reconstructed from prose a model wrote, which is the defect. A derived index that disagrees with its source is an additional failure mode, not a fix.

**Consequence**: `docs/` becomes generated output. The directory tree stops being structure and becomes presentation.

### AD2 — Skills write through typed MCP tools

**Decision**: An MCP server exposes typed tools; validation happens at the tool boundary.

**Rejected**: raw `sqlite3` from Bash, which hands schema knowledge to the model in every SKILL.md and trades a prose-parsing drift problem for a SQL-generation drift problem. Also rejected as the primary surface: a CLI shelled out to from Bash — cheaper to build and genuinely adequate, but argument construction stays free-text, so violations surface at runtime rather than in a schema the model cannot malform.

**Consequence**: the tool schema *is* the contract. A model cannot create an epic without a valid `spec_id`, because the call will not typecheck.

### AD3 — The markdown projection is one-way

**Decision**: Generated markdown is committed for review, and is never an input.

**Rejected**: a lossless, reimportable projection. It is genuinely attractive — merge conflicts would resolve in readable markdown, hand-edits would become legal, and the binary database need never be committed at all. It was rejected because it constrains every column to have a stable textual form that survives `db → md → db` identity, and that constraint is paid on every schema decision forever. FR10's parity scope makes that price too high: twenty-two entity types is tractable precisely because they do not each need to round-trip.

**Consequence**: two obligations follow directly. The database must itself be committed (AD4), and hand-edits to generated files must be actively refused (FR7) rather than merely discouraged.

### AD4 — The committed database form is a deterministic `.sql` dump

**Decision**: Commit `.dpm/dpm.sql` — sorted, stable, text. Generate and gitignore `.dpm/dpm.db`.

**Rejected**: committing the binary. Simpler, with no sync surface and no rebuild step, but git sees `Binary files differ` — no diff, and two branches that both add an artefact produce a conflict no tool can merge, meaning one side redoes its work by hand. Since AD3 removed markdown as a merge surface, the dump is the only remaining place where branching can work.

**Consequence**: NFR4 becomes load-bearing. A dump that is not byte-stable produces a conflict on every commit and is worse than the binary it replaced.

### AD5 — Node 22+ with `node:sqlite`

**Decision**: The server is Node, using SQLite from the standard library.

**Verified rather than assumed**, on Node v22.18.0:

```
node:sqlite → OK  DatabaseSync, StatementSync, constants, backup
```

It loads with no flag and needs no native module. `better-sqlite3` was rejected for requiring compilation at install; Python was a close second — `sqlite3` and FTS5 are stdlib there too — but has no clean dependency story for the `mcp` package inside a plugin cache directory. Go and Rust were rejected for requiring a per-platform release pipeline and committed binaries.

**Consequence**: NFR2's floor and NFR3's stderr discipline both exist to contain two of the three known costs of this choice — API instability and the experimental warning. **The third is that the SQLite underneath is the runtime's, not ours**, and its compile-time options vary between builds of the same version: adopting the bundled library means adopting whatever the person who built that Node decided to enable. FTS5 is the option this schema depends on, which is why NFR2 probes rather than compares. A bundled library is a dependency whose version is somebody else's decision; a bundled library's *build flags* are somebody else's decision that no version number records.

### AD6 — Full parity from the outset

**Decision**: Model every CPM artefact type in the first version rather than proving the architecture on a spine first.

**Rejected**: a core-spine-only first cut (spec → requirement → epic → story → task → coverage), which would be usable sooner and would retire the coverage helpers immediately.

**Consequence**: the schema is large before anything ships. AD3 is what makes this affordable — one-way projection is the decision that removes the per-entity round-trip burden that would otherwise make parity the expensive path.

**The size, stated rather than implied — and sized against tables, not document kinds.** An earlier form of this paragraph derived the tool count from "thirteen kinds", which is the number of things that produce a *file*. It is the wrong denominator: the Data Model resolves FR10's parity list to **fourteen document kinds, nine child tables and two standalone tables**, and the eleven that never produce a file of their own — requirement, story, task, story criterion, coverage, finding, lesson, milestone, document participant, artifact, session state — each still need typed create, read and update tools, because FR3 makes the tool surface the only write path. Undercounting them halved the estimate for the largest line item in the decision. A twelfth, the ADR, produces no file either but is a document kind rather than a child table (`dir IS NULL`), so it is counted among the fourteen.

| Line item | Count | Derived from |
|---|---|---|
| Tables | 39 real, plus 2 FTS5 virtual | The Data Model, counted from the executed DDL |
| Typed entity tools | ~75 | 25 tables × create, read, update |
| Cross-cutting tools | ~9 | link, search, integrity, migrate, dump, restore, merge-renumber, allocate-number, claim-coverage |
| Projection templates | 14 | One per document kind — the eleven child entity types render inside their parent's template, as does the ADR, which is why 14 is right here and wrong above |
| Triggers | 49 | 18 FTS — three each on `document_section` and the five indexed child tables — plus 3 coverage unverify, 4 coverage-claim unclaim, and 24 retirement guards (two per column referencing a retirable vocabulary). Thirteen are written out in the Data Model; the rest are the same patterns applied across the remaining tables, and FR9's completeness criterion is what asserts the FTS ones exist. **This number is derived, not maintained** — it read 22 while the schema held 49, counting four indexed child tables where there are five and omitting the retirement guards entirely |
| Skill files | 23 | The corpus enumerated in FR25 — CPM's twenty-two stages plus `publish`, which has no counterpart (AD11) |

Roughly **84 tools** rather than 45–55, against 41 tables and 23 skills. **The table count does not move with the two entity types added on 2026-08-10**, which is worth a sentence because it looks like an error: `communication` is a `document_kind` row and needs no table of its own, and `document_agent` is `review_agent` widened rather than a new join. Both need their three typed tools all the same, which is the count this paragraph is about. AD6 asserts this is affordable; a decision that expensive should carry its own number, and the number is larger than the first draft of this paragraph claimed.

**Build order, which is not a release plan.** AD6 is unchanged — nothing releases until all of it works — but the order in which it is built is a real constraint and leaving it unstated hands the decision to whoever decomposes the spec:

| | Milestone | Contains |
|---|---|---|
| M1 | Substrate | Schema, migrations, dump and restore, integrity check. Nothing user-facing. |
| M2 | Core spine | spec → requirement → epic → story → task → coverage: tools and projection, plus the server declaration that makes them reachable from a session (FR29). The first point at which a project could actually be planned. |
| M3 | Parity | The remaining ten kinds, the four detail tables, taxonomy seeds, both FTS5 indexes. |
| M4 | Pipeline | The 22 conversions of FR25, and the pre-commit divergence guard. |
| M5 | Publishing | The regeneration path FR6 and FR7 both assume and neither provides: one implementation, the CLI, the MCP tool, and the `publish` skill that makes the corpus twenty-three (AD11). |

**This table is seeded data, not prose.** FR27 makes a spec's build order rows, and this
spec's four milestones are the first four. The distinction matters because the table above
is what a breakdown sequences against: stated only here, it is unreachable to any tool that
would ask which epics deliver M2, and an epic spanning M2 and M4 has nowhere to say so. That
is not hypothetical — this spec's own breakdown produced exactly such an epic, and the
absence of a milestone table is what made it unrecordable.

M2 is deliberately the spine AD6 rejected as a *release*, kept as a *checkpoint*: it is the earliest point where the design can be judged against real use, and reaching it without releasing costs nothing. If M2 turns out to invalidate a decision here, that is the moment to find out — which is the one benefit the rejected spine-first alternative had, obtained without reversing AD6.

### AD7 — A `document` supertype, with per-kind detail tables

**Decision**: All numbered, file-producing artefacts share one `document` table carrying identity, numbering, status, and lineage. Kind-specific columns live in detail tables keyed to it. Sub-entities that never produce a file of their own — requirements, stories, tasks, coverage rows, findings, lessons — are ordinary child tables.

**Rejected**: one independent table per artefact type, with polymorphic joins carrying a `(kind, id)` pair. It is the obvious shape and it defeats FR2: SQLite cannot enforce a foreign key whose target table varies by row. Every polymorphic link would be an unchecked integer — which is the `**Source spec**` string again, in a column instead of a line of prose.

**Consequence**: cross-kind relationships that CPM maintains by hand become real constraints. `artifact → document`, `retro → epic`, `review → epic`, `present → sources`, and `lesson → library doc` all reference one enforceable primary key.

**Which kinds get a detail table is decided by evidence, not by symmetry.** Four do — library document, ADR, review and quick record — and the Data Model specifies each. The other nine get none, because their kind-specific content is either already a child table or genuinely prose, and a detail table holding one nullable text column is worse than no table at all. The test is whether something *reads* the field: the library's `scope` earns a table because every skill's Library Check filters on it, and a discussion's narrative does not because nothing does anything with it but render it. New kinds are added the same way — on a demonstrated reader, not on the shape of the list.

### AD8 — Every project starts with an empty database

**Decision**: dpm never reads a CPM `docs/` tree. New and existing projects alike begin with a blank database; there is no importer and no migration path from CPM's markdown artefacts.

**Rejected**: a one-time importer, so an existing CPM project could adopt dpm carrying its history. Attractive on its face, and it was in an earlier draft of this spec as FR15 — added on the author's initiative rather than requested. It was cut because it buys continuity at the price of making CPM's entire historical output a compatibility surface.

**Consequence**: this is the decision that makes the rest of the schema free, and three things follow from it directly.

- **dpm parses no prose anywhere.** Markdown is strictly write-only output with no reader in the system. The one component that would have had to re-solve CPM's parsing problems — and inherit its parsing failures — does not exist.
- **CPM's vocabularies are not binding.** Status words, severity scales, retro categories and audit dimensions are dpm's to choose. What dpm must still *express* is whatever its own pipeline needs; what it calls things is unconstrained, because no artefact crosses between the systems.
- **Constraints can be strict.** With the only write path a typed MCP tool, an unrecognised value cannot arrive, so `CHECK` constraints reject rather than lint. CPM must accept-and-flag a malformed status because it reads human-edited files; dpm reads none, so the conservative behaviour is unnecessary here.

The two systems coexist by not touching. A project runs CPM or dpm, and the choice is made once at the start.

### AD9 — Surrogate keys are ULIDs; human numbers are re-allocated on merge

**Decision**: every surrogate primary key in the schema is a ULID stored as `TEXT`. Human-facing numbers stay integers allocated by `number_sequence`, and a merge step re-allocates the ones that collide, renaming the projection files that carry them.

**Why this is an AD and not a column type.** AD4 stakes the entire branching story on the `.sql` dump merging — it is that decision's whole justification, since AD3 removed markdown as a merge surface. Executed, it does not merge: two branches from a common base each adding an epic both allocate `document.id = 2`, and the merged dump fails to restore with `UNIQUE constraint failed: document.id`. The collision is not specific to documents. Two branches each adding a requirement, a story or a coverage row allocate the same integer for different rows, because `INTEGER PRIMARY KEY` is a per-database counter and a per-database counter cannot be unique across databases edited independently. The property AD4 needs is therefore **collision-free identity allocated without coordination**, which is what a ULID is for, and it is needed on every table rather than on `document` alone.

**Rejected**: keeping integer surrogates and resolving collisions during the merge. It turns every concurrent insert into a hand-resolution — the failure AD4 rejected the binary `.db` for, relocated into a text file.

**Rejected**: numbers derived at render time rather than stored. It removes the number collision at the cost of FR5's stability guarantee: a document's number would change when an earlier one was added on another branch, and its filename with it, so every cross-reference in the projection becomes a moving target.

**Rejected**: declaring dpm single-writer and retracting AD4's merge claim. Honest, much cheaper, and it was close. It gives up the one workflow — plan on a branch, review the diff, merge — that AD3's committed projection exists to serve.

**Consequence**, in four parts.

- **Ids sort by creation time and carry no meaning.** A ULID is lexicographically sortable by its timestamp prefix, which gives every table a stable default order for free — the tiebreak FR6's determinism criterion needs. Nothing renders a ULID; the human-facing identifier is the number, which is why making ids opaque costs the reader nothing.
- **The number collision survives, and is resolved deliberately.** ULIDs fix the surrogate; `document_root_number`'s `UNIQUE (kind, number)` and `document_child_number`'s `(kind, parent_id, sequence)` still reject two branches that each allocated 48. That rejection is correct — both are real artefacts and one must be renumbered — so the merge tool re-allocates the loser from `number_sequence`, renames its projection file, and re-renders the artefacts that reference it. **Nothing rewrites stored text**, because no reference ever stored a number (FR28) — a structural reference is a foreign key the renumber does not touch, and a prose reference is a marker the renderer resolves. That is a tool in scope, not a convention to remember.
- **The greater ULID is the one renumbered.** Which side loses has to be decided by something, and deciding it from data both sides already share is what makes the outcome independent of merge direction: `git merge main` from a feature branch and `git merge feature` on main renumber the same document. It also agrees with what would have happened had the two artefacts been created one after the other in a single repository, which is what ids-sort-by-creation-time means everywhere else in this decision. **Rejected**: "ours always wins" — it renumbers a public artefact whenever the mainline is the incoming side, and the renumbered artefact then re-collides on the next merge. The ULID rule can still pick the side a human would not have; nothing is lost when it does, because both documents survive and the tool's report names which moved and to what.
- **`number_sequence` merges by taking the maximum.** Two branches that each advanced a counter produce two `next_value` rows; the resolution is `max`, and register entry #5 catches a merge that got it wrong — which is why that entry is the one marked repairable.

### AD10 — Seam 1 is closed by a conformance test, not by codegen

**Decision**: the MCP tool schemas and the DDL stay two hand-written definitions, and a test asserts their correspondence against the live database. It runs in the suite, not at build time.

**What the test asserts**, derived from the schema rather than from a copy of it:

- Every tool argument that names a column exists on that table, with a compatible type — read from `PRAGMA table_info`.
- Every enum a tool declares matches the `CHECK` on its column exactly, in both directions. A tool offering a value the `CHECK` rejects is validation in the wrong layer; a `CHECK` admitting a value no tool offers is a column the pipeline cannot reach.
- Every `NOT NULL` column without a default is a required argument on its create tool.
- Every foreign key on the table has a corresponding argument — read from `PRAGMA foreign_key_list`, which is also FR2's third criterion, so the two checks share a source.

**Rejected**: generating the tool schemas from one definition. It closes the seam structurally rather than testing for it, which is the stronger property, and it was rejected on cost rather than on merit — it needs a definition format designed, a generator built and a build step added to a plugin that currently has none, all before the first tool works. The test needs none of that and fails just as loudly. **It is the intended direction of travel**: a generator can be introduced later with the conformance test as its acceptance criterion, which is a better position to build one from than a blank page.

**Rejected**: doing both from the outset — the generator plus the test that guards it. Correct and unaffordable at the same time as AD6's parity commitment.

**Consequence**: the correspondence is checked, not enforced, so it can be broken between test runs. That is acceptable because the window is a test run rather than a release, and unacceptable to leave unstated: this is the one seam in the system where two descriptions of the same rule are maintained by hand, which is the shape of exactly the drift the rest of the spec removes structurally.

### AD11 — Regeneration is an explicit operation, not a side effect

**Decision**: writing the two generated artefacts — the markdown projection under `docs/` and `.dpm/dpm.sql` — is one implementation behind three entry points: a CLI (`bin/dpm-publish.js`), an MCP tool (`mcp__dpm__publish`), and the `publish` skill of FR25 that calls it. All three return the same record of what was written, rewritten, left unchanged and removed as orphaned. One implementation because two would disagree about orphan removal the first time naming changed, and that disagreement is silent.

**Why this decision exists at all, stated plainly.** FR6 requires the projection to be generated and committed, and FR7 requires a guard that regenerates both artefacts and refuses a commit on divergence. Both were delivered; neither writes anything. FR7's own prose hands regeneration to the pre-commit hook, and the hook was deliberately built to refuse and fix nothing — for the reason immediately below — which left the operation with no home at all. A fresh project could reach a state where every commit was refused with an instruction no command could carry out. It was found by running the guard on an empty repository after the build closed, not by reading either requirement.

**Rejected**: the pre-commit hook regenerating and staging the result. A hook that regenerates silently overwrites a hand-edit — the exact loss FR7 exists to prevent, arriving through the guard built to prevent it. The hook stays refusal-only, and the edit stays where its author left it.

**Rejected**: the server regenerating after every write. It is the only option under which the tree is never stale and nobody has to remember anything, and it was rejected on behaviour rather than on cost: a full projection on every create and update rewrites the working tree while a skill is still mid-facilitation, so files appear and change under a user who is answering a question and has not decided anything yet. A skill's writes are provisional until its run closes; the projection is not the place to discover that.

**Rejected**: the MCP tool alone, with no CLI. A database reached outside a skill run — after a restore, a hand-run migration, or a merge resolved by hand — would have no way to bring its tree back into agreement, and the guard's diagnostic would name a fix reachable only by starting a session.

**Consequence**: a tree can be stale between a write and a publish, and nothing prevents it. What makes that survivable rather than an instance of NFR6 is that the staleness is loud: the guard refuses the commit and names both artefacts. This buys a working tree that holds still during a facilitation, at the price of a step that has to be taken before committing — and the step is named by the thing that blocks on it.

## Data Model

Abridged to the load-bearing definitions. Full DDL is an implementation artefact; what belongs here is the shape and the constraint behind each drift class named in the Problem Summary.

### Identity, numbering and lineage

```sql
CREATE TABLE document_kind (
  kind        TEXT PRIMARY KEY,          -- 'spec','epic','retro','review','runbook',…
  dir         TEXT,                      -- projection dir under docs/; NULL = this kind
                                         -- produces no file and renders inside its parent
  numbering   TEXT NOT NULL DEFAULT 'root'
                CHECK (numbering IN ('root','child','none')),
  UNIQUE (kind, numbering)               -- parent key for document's composite FK
);

-- Which kinds may parent which. A kind may legally have more than one parent
-- kind — a review hangs off a spec or an epic — so this is a table and not a
-- column on `document_kind`.
CREATE TABLE document_kind_parent (
  kind        TEXT NOT NULL REFERENCES document_kind(kind),
  parent_kind TEXT NOT NULL REFERENCES document_kind(kind),
  PRIMARY KEY (kind, parent_kind)
);

CREATE TABLE document (
  id          TEXT PRIMARY KEY,
  kind        TEXT    NOT NULL,
  numbering   TEXT    NOT NULL,  -- denormalised from document_kind, pinned by FK
  number      INTEGER,           -- root-numbered kinds: spec 47
  sequence    INTEGER,           -- child-numbered kinds: epic 03 within spec 101
  slug        TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','complete','superseded','withdrawn')),
  status_note TEXT,             -- the free-text qualifier real epics append to a status
  parent_id   TEXT,             -- epic→spec; adr→spec, brief or discussion;
                                -- retro→epic, spec or quick; review→spec or epic
  parent_kind TEXT,             -- denormalised from the parent, pinned by FK
  archived_at TEXT,             -- orthogonal to status; NULL means live
  commit_sha  TEXT,             -- audit and inspect pin to a commit
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (kind, numbering)        REFERENCES document_kind(kind, numbering),
  FOREIGN KEY (kind, parent_kind)      REFERENCES document_kind_parent(kind, parent_kind),
  FOREIGN KEY (parent_id, parent_kind) REFERENCES document(id, kind),
  CHECK ((numbering = 'root'  AND number   IS NOT NULL AND sequence IS NULL)
      OR (numbering = 'child' AND sequence IS NOT NULL AND number   IS NULL)
      OR (numbering = 'none'  AND number   IS NULL     AND sequence IS NULL)),
  CHECK ((parent_kind IS NULL) = (parent_id IS NULL)),
  CHECK (numbering <> 'child' OR parent_id IS NOT NULL)
);

CREATE UNIQUE INDEX document_id_kind      ON document (id, kind);
CREATE UNIQUE INDEX document_root_number
  ON document (kind, number)              WHERE number IS NOT NULL;
CREATE UNIQUE INDEX document_child_number
  ON document (kind, parent_id, sequence) WHERE sequence IS NOT NULL;

CREATE TABLE number_sequence (
  kind        TEXT    NOT NULL REFERENCES document_kind(kind),
  parent_id   TEXT REFERENCES document(id) ON DELETE CASCADE,  -- NULL for root-numbered
  next_value  INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX number_sequence_root
  ON number_sequence (kind)            WHERE parent_id IS NULL;
CREATE UNIQUE INDEX number_sequence_child
  ON number_sequence (kind, parent_id) WHERE parent_id IS NOT NULL;
```

**Numbering is two-level, because real projects number two ways.** A spec is numbered globally (`47-spec-…`); an epic is numbered *within* its spec (`101-03-epic-cpm-markers.md` is sequence 3 under spec 101, and every spec restarts at 1). A single `number` column with `UNIQUE (kind, number)` cannot hold the second, so `number` and `sequence` are exclusive alternatives, and a child sequence requires a parent to be counted within.

**The numbering `CHECK` is keyed to the kind's declared scheme, not merely to exclusivity.** An earlier form said `CHECK ((number IS NULL) <> (sequence IS NULL))` — exactly one of the two, always. That is wrong in both directions. It permitted a kind declared `numbering = 'root'` to store a `sequence` instead, so the declaration on `document_kind` constrained nothing; and it made `numbering = 'none'` **unusable**, since a kind that should carry no number at all could satisfy neither branch and no row of that kind could be inserted. A value the vocabulary offers and the schema forbids is a defect however it is discovered. Denormalising `numbering` onto `document` and pinning it with `FOREIGN KEY (kind, numbering)` makes the kind's scheme available to a row-local `CHECK`, which then enumerates all three cases.

**Parentage is constrained by kind, which is the last mile of the `**Source spec**` fix.** A plain `parent_id REFERENCES document(id)` guarantees the parent *exists* — the Problem Summary's first complaint — but not that it is the right sort of thing. An epic could hang off a review, a retro off a runbook, and every foreign key would be satisfied. `document_kind_parent` is the allow-list, `parent_kind` is denormalised alongside `parent_id`, and two further composite foreign keys close both halves: `(kind, parent_kind)` against the allow-list rejects an illegal pairing, and `(parent_id, parent_kind)` against `document(id, kind)` rejects a row whose `parent_kind` misdescribes the parent it actually points at. Neither can be satisfied by lying, because the second checks the claim against the parent's own row.

**And the same pinning applies to every other reference into `document`, because the argument does not stop at parentage.** A first version of this schema applied the pattern to `parent_id` and `observation.library_doc_id` and to nothing else, which left sixteen references guaranteeing only that *a* document existed: `story.epic_id` accepted a spec, `requirement.spec_id` accepted an epic, and a `library_document` detail row attached to a spec — each verified by execution, each rendering a plausible tree that is not the real one. So every reference whose target kind is fixed carries a `CHECK`-pinned kind column and a composite foreign key to `document(id, kind)`: `requirement.spec_id`, `story.epic_id`, `finding.review_id`, `observation.retro_id`, `audit_finding.audit_id`, `retro_application.retro_id`, `document_agent.document_id`, and all four detail tables. **`document_agent` is the one whose `CHECK` admits more than one kind**, because participants belong to a review and to a discussion and to nothing else. A set of two is still a fixed target — what the pinning forbids is a participant attaching to a spec, and a `CHECK` over an enumerated pair forbids that exactly as well as a `CHECK` over a single value.

**The references that stay unpinned are enumerated here, and this list is the authority.** Each is deliberate and each has a stated reason; anything downstream that needs the set names *the ones the Data Model names* rather than counting them, because the count is what went stale the last three times and a list cannot.

- `document_section.document_id` and `artifact_document.document_id` legitimately admit any kind.
- `retro_application.applied_to_id` likewise — a retro's lesson may be applied to a document of any kind.
- `number_sequence.parent_id` — the parent a child-numbered kind is counted within, which varies by kind: an epic counts under a spec, an ADR under a spec, a brief or a discussion.
- `document_milestone.document_id` — any kind of document may deliver a milestone, and whether the pairing is coherent is register entry #12 rather than a constraint.
- `dependency`'s two ends vary by edge kind, which is register entry #6.

A foreign key added later that names `document(id)` alone belongs in this list or it is a defect; there is nowhere else for it to be correct.

The composite foreign key carries `ON DELETE CASCADE` and replaces the single-column one rather than sitting beside it. Two foreign keys to the same parent with different delete actions is how a schema acquires a delete whose outcome depends on which children happen to exist.

The general rule, which is the one worth carrying to a table added later: **a foreign key that names `document(id)` alone is only correct where every kind is a legal target.** Anywhere else it is the `**Source spec**` string again, in a column instead of a line of prose — the exact criticism this spec opens with, relocated rather than answered.

`number_sequence` satisfies FR5 for both levels — one row per root kind, one row per (child kind, parent). Allocation is an **upsert**, one statement per level, targeting the partial index that governs it:

```sql
-- root-numbered kinds
INSERT INTO number_sequence (kind, parent_id, next_value) VALUES (:kind, NULL, 1)
  ON CONFLICT (kind) WHERE parent_id IS NULL
  DO UPDATE SET next_value = number_sequence.next_value + 1
  RETURNING next_value;

-- child-numbered kinds
INSERT INTO number_sequence (kind, parent_id, next_value) VALUES (:kind, :parent, 1)
  ON CONFLICT (kind, parent_id) WHERE parent_id IS NOT NULL
  DO UPDATE SET next_value = number_sequence.next_value + 1
  RETURNING next_value;
```

**It has to be an upsert, not an update, because there is no seeding step.** A bare `UPDATE … RETURNING` against a kind that has never been allocated matches no row: it returns nothing and reports success, and the caller writes a document with no number. That is FR5's entire promise failing on the first allocation of every kind, silently — and for child-numbered kinds it recurs on the first epic under every new spec, so it is not a once-per-project edge case. The upsert creates the row it needs, which also removes the question of who seeds it and when. `RETURNING next_value` after the increment returns 1 on first call, then 2, 3, …; monotonic irrespective of deletion or archival.

The **Numbering** procedure's glob-the-active-directory, glob-the-archive-mirror, union, parse-as-integer-not-string, and its standing `99 → 100` warning all reduce to those two statements — and `cpm:archive`'s obligation to preserve `docs/archive/{type}/` as a mirrored tree stops being a contract at all, because retirement sets `archived_at` on a row that never moves.

**The kinds are seeded data, and the list is the parity contract.** FR10 names twenty-two artefact types; without an enumeration its acceptance criterion has nothing to check and passes by construction. They land in five places:

| Where it lives | Types |
|---|---|
| `document_kind` rows — numbered, file-producing | problem brief, product brief, spec, epic *(child)*, coverage matrix *(child)*, review, retro, quick record, discussion, communication, audit, runbook, library document |
| `document_kind` rows — numbered, rendered inside a parent (`dir IS NULL`) | ADR *(child)* |
| Detail tables — the four kinds with structure to hold (AD7) | `library_document` + `library_scope`, `adr` + `adr_option` + `adr_option_tradeoff`, `review`, `quick` + `quick_criterion` |
| Child tables — sub-entities that produce no file of their own | requirement, story, task, story criterion, coverage row, finding, observation *(the lesson)*, milestone, document participant |
| Standalone tables | artifact, session state |

That is fourteen document kinds, nine child tables and two standalone tables — twenty-five tables, accounting for twenty-two of FR10's twenty-three types. The arithmetic does not reduce to a subtraction, so it is worth stating rather than leaving a reader to check it: two of FR10's types are carried by more than one table. **Brief** is two document kinds (problem and product), and **coverage** is both a document kind (the matrix, which is a file) and a child table (its rows, which are not). The twenty-third, **the verification record, is deliberately not a table**: verification is not an artefact in dpm but a pair of columns, `coverage.verified_at` and `binding_hash`, on the row being verified. CPM writes it as a separate record because a markdown table cannot carry state that decays; here the decay is triggers (FR21), so the record has nowhere to be and nothing to hold.

**`document_agent` moved out of the detail group when it stopped belonging to one kind.** It was `review_agent`, a detail table of `review`, until a `discussion` needed the same fact; a join that spans two kinds is a child table with a pinned parent, which is the group it now sits in and the reason the child count moved from eight to nine.

**These two counts are stated here and nowhere else, and this paragraph is the only place either is derived.** Both drifted in the first three sessions on this document: the tool-count paragraph in AD6, the rejected-alternative paragraph in AD3, and FR10's create-tool criterion below all said "twenty-three entity types", conflating the table count with the type count and contradicting the arithmetic above. Anything downstream that needs either number quotes the phrase **"fourteen document kinds, nine child tables and two standalone tables"** rather than restating a total, so a single grep for that phrase finds every site that has to move when a table is added. **A quoting site must keep the phrase on one line.** The downstream documents are hard-wrapped, and the first site written under this rule wrapped the phrase across a line break, which makes it invisible to the grep the rule exists to enable — a quoting convention that a text editor can silently break is not a mechanism, so the constraint is part of it rather than a matter of care. Where a criterion can read the count from the live schema instead, it does, and carries no number at all — the create-tool and reachability criteria in the Testing Strategy are both written that way, which is why neither needed amending when FR27 added `milestone`.

**An ADR is a child document, not a root-numbered one, and that is a real restriction.** CPM
writes ADRs as their own files under `docs/architecture/`; this spec writes ten of them
*inside itself*, as AD1–AD10, and a schema that cannot hold its own ADs is not one to build
on. Making `adr` a child kind with `dir IS NULL` gives every AD the full `adr` +
`adr_option` + `adr_option_tradeoff` structure — `decision_status`, the rejected
alternatives, the tradeoff axes — with `document_kind_parent` allow-listing `spec`, both
briefs, and `discussion` as parents. What it costs is the free-floating ADR: every
architecture decision in dpm belongs to something that prompted it. That matches how
`cpm:architect` actually works, which produces ADRs from a brief, but it is a constraint and
not merely a modelling choice.

**The alternative was to let `numbering` vary by parent pairing**, so `adr` could be
root-numbered standalone and child-numbered inside a spec. It is the more general answer and
it was rejected on cost: `document`'s numbering `CHECK` reads one denormalised `numbering`
column pinned by one composite foreign key, and making the applicable scheme depend on
whether `parent_id` is NULL is not expressible as a row-local constraint against two
different parent keys. Buying the free-floating ADR means restructuring the identity section
around a case this corpus does not contain.

**Status carries a note, and archival is not a status.** A status frequently needs a qualifier — *complete, but folded into another story*; *pending, but waiting on a third party*. In a markdown store that qualifier has nowhere to go but the same line as the status word, which is why CPM parses a lead token and preserves the tail. dpm has a typed write path and no such constraint, so the qualifier is simply its own column: `status` is always exactly one enum value, and `status_note` carries the rest.

`archived_at` is separate from `status` because the two are orthogonal — a document is archived *and* complete. Collapsing them into one enum forces a false choice and loses the completion state on archival.

**Retirement is a status, and it is terminal.** `superseded` and `withdrawn` say that a document's work will not be done — the first because something else took it over, the second because it was called off. Neither is a qualifier on a live status, which is what `status_note` is for: *pending, but waiting on a third party* is still pending and still work. Retirement is also not archival — `archived_at` says a document has left the working set while keeping whatever it achieved, and a withdrawn document may sit unarchived for months while people argue about it. Both states are set by a person and by nothing else; no procedure infers them, and nothing moves a document out of them.

**A retired document does not satisfy a dependency, and that is the clause worth stating separately.** It is the half a reader assumes and a query gets wrong: `pending` blocks and `complete` clears, so a two-value enum makes every terminal state look like completion the moment it stops being pending. FR22's readiness therefore treats `superseded` and `withdrawn` as **unsatisfied** — a blocker that will never be delivered has not stopped blocking. The opposite reading has the failure shape NFR6 names: work whose blocker was quietly abandoned reads as ready and gets started, and nothing reports an error at any point. It is entry #23 in the false-pass register for that reason.

**Vocabularies here are dpm's own** (AD8). Studying a real 393-artefact CPM project was useful evidence about what planning data actually contains — statuses need qualifiers, blocking is a graph, coverage binds to text fragments — but dpm is not bound to CPM's spellings, because nothing ever crosses between the two.

Undecomposed prose keeps a home rather than being over-modelled:

```sql
CREATE TABLE document_section (
  id           TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  heading      TEXT    NOT NULL,
  body         TEXT    NOT NULL,
  position     INTEGER NOT NULL,
  UNIQUE (document_id, position)
);
```

### Per-kind detail (AD7)

Four of the fourteen document kinds carry structure that `document_section` would flatten into prose. The other ten carry none that is not already a child table — a spec's requirements, an epic's stories, a retro's observations and an audit's findings are all modelled elsewhere, and what remains in those kinds is genuinely narrative. A `communication` is the clearest case of the second group: it is a title, an audience and prose, and modelling the audience as anything but a section would be inventing structure the artefact does not have.

```sql
-- The library's `scope` is machine-read: every skill's Library Check filters
-- documents by it before deciding what to load. Held as prose it is not
-- queryable, and being queryable is the entire feature.
CREATE TABLE library_document (
  document_id   TEXT PRIMARY KEY,
  document_kind TEXT NOT NULL DEFAULT 'library' CHECK (document_kind = 'library'),
  doc_type      TEXT NOT NULL,     -- 'architecture','coding-standards','domain',…
  source        TEXT,              -- where it came from; NULL when written here
  FOREIGN KEY (document_id, document_kind) REFERENCES document(id, kind) ON DELETE CASCADE
);

CREATE TABLE library_scope (
  document_id  TEXT NOT NULL REFERENCES library_document(document_id) ON DELETE CASCADE,
  scope        TEXT    NOT NULL,  -- a skill name, or 'all'
  PRIMARY KEY (document_id, scope)
);

-- An ADR's lifecycle is not `document.status`. Supersession is the edge
-- (`dependency_kind = 'supersedes'`); what lives here is the state.
CREATE TABLE adr (
  document_id     TEXT PRIMARY KEY,
  document_kind   TEXT NOT NULL DEFAULT 'adr' CHECK (document_kind = 'adr'),
  decision_status TEXT NOT NULL DEFAULT 'proposed'
                    CHECK (decision_status IN
                      ('proposed','accepted','rejected','superseded','deprecated')),
  decision        TEXT NOT NULL,
  FOREIGN KEY (document_id, document_kind) REFERENCES document(id, kind) ON DELETE CASCADE
);

-- Options Considered repeats per option, against the same axes each time —
-- which is a table, and is unreadable as a paragraph per option.
CREATE TABLE adr_option (
  id           TEXT PRIMARY KEY,
  adr_id       TEXT NOT NULL REFERENCES adr(document_id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  chosen       INTEGER NOT NULL DEFAULT 0,
  rationale    TEXT,
  position     INTEGER NOT NULL,
  UNIQUE (adr_id, position)
);

CREATE TABLE adr_option_tradeoff (
  option_id    TEXT NOT NULL REFERENCES adr_option(id) ON DELETE CASCADE,
  axis         TEXT    NOT NULL,   -- 'cost','complexity','reversibility',…
  assessment   TEXT    NOT NULL,
  PRIMARY KEY (option_id, axis)
);

-- What was reviewed is `document.parent_id`; only the narrowing lives here.
CREATE TABLE review (
  document_id    TEXT PRIMARY KEY,
  document_kind  TEXT NOT NULL DEFAULT 'review' CHECK (document_kind = 'review'),
  scope          TEXT NOT NULL DEFAULT 'whole'
                   CHECK (scope IN ('whole','story')),
  scope_story_id TEXT REFERENCES story(id) ON DELETE CASCADE,
  CHECK ((scope = 'story') = (scope_story_id IS NOT NULL)),
  FOREIGN KEY (document_id, document_kind) REFERENCES document(id, kind) ON DELETE CASCADE
);

-- Who took part. Not a detail table of `review`, because a discussion has the
-- same fact to record: `party` and `consult` both convene personas and both
-- write a `discussion`. The kinds that may carry participants are pinned by
-- CHECK and joined on the composite key, so widening the table did not weaken
-- what the narrower one guaranteed.
CREATE TABLE document_agent (
  document_id   TEXT NOT NULL,
  document_kind TEXT NOT NULL CHECK (document_kind IN ('review','discussion')),
  agent         TEXT NOT NULL REFERENCES agent(name),
  PRIMARY KEY (document_id, agent),
  FOREIGN KEY (document_id, document_kind) REFERENCES document(id, kind) ON DELETE CASCADE
);

-- A quick record's criteria are decided met or not met at close, which is a
-- tri-state (NULL while open) and not a status word.
CREATE TABLE quick (
  document_id   TEXT PRIMARY KEY,
  document_kind TEXT NOT NULL DEFAULT 'quick' CHECK (document_kind = 'quick'),
  closed_at     TEXT,
  FOREIGN KEY (document_id, document_kind) REFERENCES document(id, kind) ON DELETE CASCADE
);

CREATE TABLE quick_criterion (
  id           TEXT PRIMARY KEY,
  quick_id     TEXT NOT NULL REFERENCES quick(document_id) ON DELETE CASCADE,
  text         TEXT    NOT NULL,
  met          INTEGER,           -- NULL until closed
  note         TEXT,
  position     INTEGER NOT NULL,
  UNIQUE (quick_id, position)
);
```

**`source` is nullable and is still a column.** A library document imported from a standards site, a vendor guide or another project has a provenance its readers need; one written here has none, which is what the NULL says. The alternative — a `**Source**:` line under a heading, as CPM's front-matter carries it — is a field parsed back out of prose by whoever needs it, which is the defect FR1 opens this spec with, arriving one section after the section that removes it. The rest of CPM's front-matter genuinely is prose and stays prose: a summary is a `document_section` at position 0, and `added` and `last-reviewed` are `created_at` and `updated_at`.

**The detail table's primary key is the document's, which is what makes AD7 work.** `library_document.document_id` is both primary key and foreign key, so a detail row cannot exist without its document, cannot outlive it, and cannot be duplicated — the one-to-one is structural rather than a rule to maintain. That is also why the polymorphic alternative AD7 rejected fails: a `(kind, id)` pair has no such key to point at.

**What a review reviewed is its `parent_id`, and the detail table only narrows it.** A review of an epic and a review of one story within it are the same kind of document with a different scope, which CPM distinguishes by appending `-s2` to a filename. Here it is `scope` plus `scope_story_id` and a `CHECK`. An earlier form of this table also carried `reviewed_id` — which is `document.parent_id` under another name, and so the same relationship recorded twice in two places with nothing keeping them equal. That is the artifact-index-and-backlinks defect this spec was written to remove, reintroduced one section after removing it.

**Supersession is an edge, not a column.** An earlier shape gave `adr` its own `superseded_by`, which would have been a second mechanism for the thing `dependency` already does — the criticism this spec makes of `test_approach` applied to itself. `supersedes` joins `blocks`, `builds_on` and `constrains` as a `dependency_kind` row with `gates_work = 0`. What the schema cannot enforce is that `decision_status = 'superseded'` implies such an edge exists; that pairing is cross-row, so it belongs to FR14's integrity check alongside cycle detection.

### Requirements — where type stops being a spelling

```sql
CREATE TABLE requirement (
  id            TEXT PRIMARY KEY,
  spec_id       TEXT    NOT NULL,
  spec_kind     TEXT    NOT NULL DEFAULT 'spec' CHECK (spec_kind = 'spec'),
  label         TEXT    NOT NULL,                  -- display only: 'FR1','NFR3','ENVX2'
  class         TEXT    NOT NULL CHECK (class IN (
                  'functional','non_functional',
                  'environmental_requirement','environmental_restriction')),
  moscow        TEXT    CHECK (moscow IN ('must','should','could','wont')),
  exclusion     TEXT    CHECK (exclusion IN ('deferred','out_of_scope')),
  parent_id     TEXT REFERENCES requirement(id),  -- FR1a's parent is FR1
  text          TEXT    NOT NULL,
  position      INTEGER NOT NULL,
  -- FR26. NULL = nobody has claimed the bindings account for this requirement.
  -- Set together, cleared together, by the four triggers below.
  coverage_claimed_at TEXT,
  coverage_claim_hash TEXT,   -- hash of the bound fragment set at claim time
  FOREIGN KEY (spec_id, spec_kind) REFERENCES document(id, kind) ON DELETE CASCADE,
  UNIQUE (spec_id, label),
  CHECK ((coverage_claimed_at IS NULL) = (coverage_claim_hash IS NULL))
);
```

Four parsers die here, and it is worth being explicit about which:

- `coverage_environmental_class()` (`coverage-parse.sh:248`) derives requirement class from whether a label reads `ENVn` or `ENVXn`. `class` is that value, stored.
- `coverage_base_label()` (`:239`) reduces `FR1a` to `FR1` by string surgery. `parent_id` is that relationship, enforced.
- `coverage_spec_requirements()` (`:262`) reads MoSCoW from the markdown heading a bullet sits under, and carries the heading along so a Won't Have can be told from an uncovered requirement. `moscow` is a column; `wont` is a value in it.
- `coverage_spec_scope_deferrals()` (`:382`) scans `### Deferred` and `### Out of Scope` bullets for labels to exclude. `exclusion` is that fact, attached to the requirement rather than inferred from where its name was mentioned.

`label` survives as a display string only. Nothing reads it to determine meaning — which is FR4 stated as a schema property rather than a rule to remember.

### Delivery and coverage

```sql
CREATE TABLE story (
  id          TEXT PRIMARY KEY,
  epic_id     TEXT    NOT NULL,
  epic_kind   TEXT    NOT NULL DEFAULT 'epic' CHECK (epic_kind = 'epic'),
  number      INTEGER NOT NULL,
  title       TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','complete','superseded','withdrawn')),
  status_note TEXT,
  -- FR4. CPM writes this as `[plan]` appended to the story's `##` heading and reads it
  -- back off that heading; here it is a column, so `do` asks the story rather than the title.
  plan        INTEGER NOT NULL DEFAULT 0 CHECK (plan IN (0,1)),
  position    INTEGER NOT NULL,
  FOREIGN KEY (epic_id, epic_kind) REFERENCES document(id, kind) ON DELETE CASCADE,
  UNIQUE (epic_id, number)
);

CREATE TABLE task (
  id          TEXT PRIMARY KEY,
  story_id    TEXT NOT NULL REFERENCES story(id) ON DELETE CASCADE,
  number      INTEGER NOT NULL,
  title       TEXT    NOT NULL,
  description TEXT,
  status      TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','complete','superseded','withdrawn')),
  status_note TEXT,
  position    INTEGER NOT NULL,
  UNIQUE (story_id, number)
);

-- A vocabulary like the `taxonomy` domains, kept as its own table only because
-- it carries `kind`, which no other vocabulary needs. FR24's three promises —
-- seeded, extensible, retirable — apply here too, so `retired_at` is not
-- optional; without it a project can add an approach but never stop offering one.
CREATE TABLE test_approach (
  tag         TEXT PRIMARY KEY,                      -- unit, integration, feature, manual, target, tdd
  kind        TEXT NOT NULL CHECK (kind IN ('level','mode')),
  position    INTEGER NOT NULL,
  retired_at  TEXT
);

-- Spec-side criteria: the spec's own Testing Strategy table,
-- `| Requirement | Acceptance Criterion | Test Approach |`.
CREATE TABLE acceptance_criterion (
  id              TEXT PRIMARY KEY,
  requirement_id  TEXT NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
  text            TEXT    NOT NULL,
  polarity        TEXT    NOT NULL DEFAULT 'must'
                    CHECK (polarity IN ('must','must_not','control')),
  position        INTEGER NOT NULL,
  UNIQUE (requirement_id, position)
);

CREATE TABLE criterion_approach (
  criterion_id  TEXT NOT NULL REFERENCES acceptance_criterion(id) ON DELETE CASCADE,
  tag           TEXT    NOT NULL REFERENCES test_approach(tag),
  PRIMARY KEY (criterion_id, tag)
);

-- Story-side criteria: the epic's `**Acceptance Criteria**:` bullets,
-- a DIFFERENT set from the spec's. The coverage matrix joins the two.
CREATE TABLE story_criterion (
  id          TEXT PRIMARY KEY,
  story_id    TEXT NOT NULL REFERENCES story(id) ON DELETE CASCADE,
  text        TEXT    NOT NULL,
  polarity    TEXT    NOT NULL DEFAULT 'must'
                CHECK (polarity IN ('must','must_not','control')),
  position    INTEGER NOT NULL,
  UNIQUE (story_id, position)
);

CREATE TABLE story_criterion_approach (
  story_criterion_id TEXT NOT NULL REFERENCES story_criterion(id) ON DELETE CASCADE,
  tag                TEXT    NOT NULL REFERENCES test_approach(tag),
  PRIMARY KEY (story_criterion_id, tag)
);

-- One row per matrix row: a VERBATIM FRAGMENT of a requirement bound to one
-- story criterion. A single requirement yields several rows — FR4 of spec 101
-- produces three, each independently verified.
CREATE TABLE coverage (
  id                 TEXT PRIMARY KEY,
  requirement_id     TEXT NOT NULL REFERENCES requirement(id) ON DELETE CASCADE,
  spec_fragment      TEXT    NOT NULL,
  story_criterion_id TEXT NOT NULL REFERENCES story_criterion(id) ON DELETE CASCADE,
  position           INTEGER NOT NULL,   -- display order only; NOT part of identity
  verified_at        TEXT,            -- NULL = unverified; the ✓ column
  binding_hash       TEXT,            -- hash of (spec_fragment ‖ criterion text) at verification
  UNIQUE (requirement_id, spec_fragment, story_criterion_id),
  CHECK ((verified_at IS NULL) = (binding_hash IS NULL))
);

-- "Covered by: Story 2, Story 4" — a criterion may be delivered by more than
-- the story that declares it. Rare (3 rows in a 393-artefact corpus) but real.
CREATE TABLE coverage_story (
  coverage_id  TEXT NOT NULL REFERENCES coverage(id) ON DELETE CASCADE,
  story_id     TEXT NOT NULL REFERENCES story(id)    ON DELETE CASCADE,
  PRIMARY KEY (coverage_id, story_id)
);

-- Verification is bound to text, and text changes silently. These triggers are
-- the schema-level statement of the rule every coverage matrix carries in prose.
CREATE TRIGGER coverage_unverify_on_criterion_edit
AFTER UPDATE OF text ON story_criterion
WHEN OLD.text <> NEW.text
BEGIN
  UPDATE coverage SET verified_at = NULL, binding_hash = NULL
   WHERE story_criterion_id = NEW.id;
END;

CREATE TRIGGER coverage_unverify_on_requirement_edit
AFTER UPDATE OF text ON requirement
WHEN OLD.text <> NEW.text
BEGIN
  UPDATE coverage SET verified_at = NULL, binding_hash = NULL
   WHERE requirement_id = NEW.id;
END;

-- The third edit path, and the one an earlier draft missed: the fragment is a
-- stored copy, so rewriting it changes what was verified without touching
-- either table the two triggers above watch.
CREATE TRIGGER coverage_unverify_on_fragment_edit
AFTER UPDATE OF spec_fragment ON coverage
WHEN OLD.spec_fragment <> NEW.spec_fragment
BEGIN
  UPDATE coverage SET verified_at = NULL, binding_hash = NULL
   WHERE id = NEW.id;
END;

-- FR26. The three triggers above decay one row's ✓; these four decay the claim
-- that the rows, as a set, account for the requirement. The set changes when a
-- row arrives, when one leaves, when a fragment is rewritten, and when the text
-- being accounted for is itself edited — four events, four triggers.
CREATE TRIGGER requirement_unclaim_on_coverage_insert
AFTER INSERT ON coverage
BEGIN
  UPDATE requirement SET coverage_claimed_at = NULL, coverage_claim_hash = NULL
   WHERE id = NEW.requirement_id;
END;

CREATE TRIGGER requirement_unclaim_on_coverage_delete
AFTER DELETE ON coverage
BEGIN
  UPDATE requirement SET coverage_claimed_at = NULL, coverage_claim_hash = NULL
   WHERE id = OLD.requirement_id;
END;

CREATE TRIGGER requirement_unclaim_on_fragment_edit
AFTER UPDATE OF spec_fragment ON coverage
WHEN OLD.spec_fragment <> NEW.spec_fragment
BEGIN
  UPDATE requirement SET coverage_claimed_at = NULL, coverage_claim_hash = NULL
   WHERE id = NEW.requirement_id;
END;

CREATE TRIGGER requirement_unclaim_on_text_edit
AFTER UPDATE OF text ON requirement
WHEN OLD.text <> NEW.text
BEGIN
  UPDATE requirement SET coverage_claimed_at = NULL, coverage_claim_hash = NULL
   WHERE id = NEW.id;
END;
```

**Completeness is a claim and not a computation, and the alternative is worth stating
because it looks better than it is.** Deriving it — storing each fragment's offset and
requiring the fragments to tile the requirement's text — needs no human act and cannot be
forgotten. It was rejected because the derivation is wrong in both directions at once:
connective prose carries no obligation and would have to be bound to satisfy it, while two
obligations inside one sentence are discharged by a fragment covering either. A derived
signal that is confidently wrong is worse than a claim a person made, because nothing
prompts anyone to look at it. What the schema can guarantee is not that the judgement was
right but that it is **current**, which is what the four triggers deliver — and it is the
same guarantee, and the same mechanism, FR21 already provides one level down.

**`requirement_unclaim_on_text_edit` updates the table it fires on**, which is safe here and
was verified with `recursive_triggers` both off and on: the trigger watches `text` and
writes only the two claim columns, so the inner statement cannot re-enter it. The three
`coverage` triggers are likewise disjoint from `coverage_unverify_*`, which write
`verified_at` and `binding_hash` and match no `UPDATE OF spec_fragment`.

`polarity` is the sleeper. A negative criterion is currently written `must NOT — …` and recognised by that prefix; a control case by the word `control`. Both are types carried in prose, in the one artefact whose whole purpose is deciding whether the work is done.

The coverage matrix — a markdown table, parsed row by row by `coverage_matrix_rows()` (`:585`) — becomes rows. The roll-up that `coverage-rollup.sh` performs in 802 lines becomes a join, and its `REQ = STATE ∪ EXCLUDED` partition property (spec 44 NFR4, restated as spec 46 NFR4) stops being a property to assert and becomes one that cannot fail: `exclusion IS NOT NULL` and `exclusion IS NULL` partition the table by construction.

**Two criterion sets, not one.** A spec states its criteria in `## Testing Strategy`; an epic states different ones per story. The matrix's job is joining them, and its columns say so — `Spec Requirement | Spec Text (verbatim) | Story Criterion (verbatim) | Covered by | Spec Test Approach | Verified`. Modelling only the spec side leaves the join with nothing on its right-hand side, which is what an earlier draft of this section did.

**The grain is a fragment, not a requirement.** Rows 1–3 of a real matrix all cite `FR4`, each binding a different verbatim slice of FR4's text to a different story criterion, each carrying its own ✓. A `coverage(requirement_id, story_id)` row cannot represent three independent verification states for one requirement, so `spec_fragment` is stored per row and the requirement is referenced, not consumed.

**Which makes the fragment part of the row's identity, and `position` none of it.** The natural key is `(requirement_id, spec_fragment, story_criterion_id)`. An earlier draft keyed on `position` instead of `spec_fragment` and was wrong in both directions at once: it accepted the same fragment bound to the same criterion twice at two positions — two identical rows, each independently verifiable, each counting toward a roll-up — while rejecting two genuinely different fragments that happened to share a position. Display order is not identity, and a duplicated verified coverage row inflating a roll-up is the false pass this whole subsystem is being rebuilt to prevent.

**Verification decays, and the schema has to know.** Every matrix carries this rule in prose:

> **Verification rule**: Verification status (✓) is bound to criterion text. Any change to a story criterion or its spec mapping resets that row to unverified.

A plain `state` column cannot honour it: edit a criterion and the ✓ survives, now attesting to text that no longer exists. That is a false pass inside the coverage subsystem — the precise failure class this spec exists to eliminate, reproduced by this spec's own first draft. `binding_hash` records what was verified, the `CHECK` keeps it in lockstep with `verified_at`, and the three triggers make the reset automatic rather than remembered.

**There are three edit paths, not two, and counting them wrong is how this table stayed broken across drafts.** FR21 names "the requirement fragment or the story criterion", and the fragment is not `requirement.text` — it is `coverage.spec_fragment`, a stored verbatim slice, which is also half of what `binding_hash` hashes. A draft carrying only the two triggers on `requirement.text` and `story_criterion.text` left the fragment editable with the ✓ intact, verified by execution: the row kept `verified_at` and a `binding_hash` computed over text that had been replaced. The rule to hold on to is that **a trigger must watch every column the binding is computed from**, and the binding is computed from two texts held in three places.

**And one level up, the same argument applies to the set.** Each of those triggers keeps one
row's ✓ honest about the text it names. None of them says the rows, together, account for
the requirement — so a requirement carrying five obligations with one fragment bound has one
correct, current, verified row and reads as covered. `coverage_claimed_at` is the claim that
they do account for it, and its four triggers are the same decay applied to membership of the
set rather than to the content of a row (FR26).

### Milestones — the build order as rows

```sql
-- A specification's build order. Scoped to the spec, ordered within it, and
-- joined to the artefacts that deliver it — an epic may span more than one.
CREATE TABLE milestone (
  id          TEXT    PRIMARY KEY,
  spec_id     TEXT    NOT NULL,
  spec_kind   TEXT    NOT NULL DEFAULT 'spec' CHECK (spec_kind = 'spec'),
  label       TEXT    NOT NULL,      -- 'M1'
  title       TEXT    NOT NULL,      -- 'Substrate'
  summary     TEXT,
  position    INTEGER NOT NULL,
  FOREIGN KEY (spec_id, spec_kind) REFERENCES document(id, kind) ON DELETE CASCADE,
  UNIQUE (spec_id, label),
  UNIQUE (spec_id, position)
);

CREATE TABLE document_milestone (
  document_id  TEXT NOT NULL REFERENCES document(id)  ON DELETE CASCADE,
  milestone_id TEXT NOT NULL REFERENCES milestone(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, milestone_id)
);
```

**A join table and not a column, because an epic really does span two.** AD6 lists four
milestones and this spec's own breakdown has an epic delivering part of M2 and part of M4.
A `document.milestone_id` column forces that epic into one of them, and the choice is
unrecoverable — nothing afterwards can tell "delivers M2" from "delivers M2 and M4 but was
filed under M2".

**Scoped to a spec rather than global, and not a `taxonomy` row.** Milestones are one
specification's build order, so two specs may both have an `M1` meaning different things —
`UNIQUE (spec_id, label)` permits that and `UNIQUE (spec_id, position)` keeps the order
total within each. A `taxonomy` row is the wrong shape twice over: the vocabulary is not
project-wide, and `taxonomy` carries no owner to scope it to.

**What the schema cannot hold here is the pairing's coherence.** `document_milestone`
accepts an epic under spec A joined to a milestone of spec B — verified by execution, since
both foreign keys are satisfied and neither knows about the other. Establishing that they
share a spec means walking `document.parent_id` up to the root, which is not row-local, so
it is register entry #12 rather than a constraint.

### Dependencies and retro feed-forward

```sql
-- Edge kinds are rows, so a new relationship is data rather than a migration.
-- `blocks` gates readiness; `builds_on` and `constrains` are lineage only.
CREATE TABLE dependency_kind (
  kind         TEXT PRIMARY KEY,      -- 'blocks','builds_on','constrains'
  gates_work   INTEGER NOT NULL DEFAULT 0,
  position     INTEGER NOT NULL,
  retired_at   TEXT                   -- FR24 applies here too
);

CREATE TABLE dependency (
  id                  TEXT PRIMARY KEY,
  kind                TEXT NOT NULL REFERENCES dependency_kind(kind),
  source_document_id  TEXT REFERENCES document(id) ON DELETE CASCADE,
  source_story_id     TEXT REFERENCES story(id)    ON DELETE CASCADE,
  target_document_id  TEXT REFERENCES document(id) ON DELETE CASCADE,
  target_story_id     TEXT REFERENCES story(id)    ON DELETE CASCADE,
  CHECK ((source_document_id IS NULL) <> (source_story_id IS NULL)),
  CHECK ((target_document_id IS NULL) <> (target_story_id IS NULL)),
  CHECK (source_document_id IS NULL OR target_document_id IS NULL
         OR source_document_id <> target_document_id),
  CHECK (source_story_id IS NULL OR target_story_id IS NULL
         OR source_story_id <> target_story_id)
);

-- One expression index rather than four partial ones: coalesce removes the
-- NULLs that would otherwise make every edge distinct from every other.
CREATE UNIQUE INDEX dependency_edge ON dependency (
  kind,
  coalesce(source_document_id, -1), coalesce(source_story_id, -1),
  coalesce(target_document_id, -1), coalesce(target_story_id, -1)
);

-- `**Retro applied**: 12 · Codebase discovery · Applied — <text>`
-- Four fields in one prose line, on 29 epics.
CREATE TABLE retro_application (
  id            TEXT PRIMARY KEY,
  retro_id      TEXT NOT NULL,
  retro_kind    TEXT NOT NULL DEFAULT 'retro' CHECK (retro_kind = 'retro'),
  -- `applied_to_id` is deliberately NOT kind-pinned: a retro's lesson may be
  -- applied to a document of any kind, so there is no single legal target kind.
  applied_to_id TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  theme         TEXT NOT NULL DEFAULT '',
  disposition   TEXT NOT NULL
                  CHECK (disposition IN ('applied','not_applicable','deferred')),
  note          TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (retro_id, retro_kind) REFERENCES document(id, kind) ON DELETE CASCADE,
  UNIQUE (retro_id, applied_to_id, theme, note)
);
```

Blocking is a **relationship**, and an earlier draft of this spec made it a `status` value — the same category error the Problem Summary accuses CPM of committing with `**Source spec**`. A status cannot say *what* blocks you, cannot be traversed to find a ready epic, and cannot be invalidated when the blocker completes.

**Edges are typed, and their kinds are rows, because more relationships exist than any one skill defines.** Three are already in evidence:

- **`blocks`** — an epic blocked by epics, or a story blocked by another story. Both directions occur in real epics, which is why source and target may each be either a document or a story.
- **`builds_on`** — spec-to-spec lineage. CPM has no field for this, yet three real specifications carry a hand-written `**Builds on**:` header. A field invented independently in three documents is a missing feature, not a stylistic flourish.
- **`constrains`** — ADR-to-ADR, which CPM *does* define ("Depends on ADR {nn}" / "Constrains ADR {nn}") and which is directional and distinct from blocking.

`gates_work` separates the edge that stops work from the edges that merely record lineage, so readiness is a query over one flag rather than a hardcoded list of kinds.

**Cycles are the one dependency failure the schema cannot catch, so a tool has to.** The `CHECK` constraints above rule out self-edges and nothing more: `A blocks B` together with `B blocks A` is two perfectly legal rows. Reachability is not expressible as a row-level constraint, and the consequence of leaving it unhandled is the worst shape available — a readiness query over a cycle returns *nothing ready*, which is indistinguishable from *everything is done* and raises no error. Since FR22 makes that query the one that drives execution, two obligations attach to it: the link tool refuses an edge that would close a cycle over any `gates_work` kind, rejecting at the tool boundary in the manner of AD2; and FR14's integrity check reports cycles that predate the rule or arrive by restore. Lineage kinds are left alone — a `builds_on` cycle is meaningless but harmless, because nothing waits on it.

`theme` and `note` are `NOT NULL DEFAULT ''` rather than nullable, so the `UNIQUE` actually constrains. Nullable columns in a `UNIQUE` are the trap already documented against `coverage`, and the fix is cheaper here than a second pair of partial indexes.

### Review, retro, and the library

```sql
-- Every controlled vocabulary is a table, seeded but project-editable.
-- `retired_at` lets a project stop offering a category without deleting the
-- rows that already use it.
CREATE TABLE taxonomy (
  id          TEXT PRIMARY KEY,
  domain      TEXT    NOT NULL,   -- 'observation','finding','audit_dimension','severity'
  name        TEXT    NOT NULL,   -- canonical form, e.g. 'Patterns Worth Reusing'
  singular    TEXT,               -- per-item display form, e.g. 'Pattern worth reusing'
  position    INTEGER NOT NULL,
  retired_at  TEXT,
  UNIQUE (domain, name),
  UNIQUE (id, domain)             -- parent key for the domain-scoped FKs below
);

-- The agent roster, a vocabulary like the `taxonomy` domains but its own table
-- for the reason `test_approach` is: it carries columns no other vocabulary
-- needs. In CPM this is `agents/roster.yaml`, whose header says the project
-- copy "completely replaces this default — no merging", so adding one persona
-- means forking all nine and maintaining the fork. The observed practice is
-- append-only, which is what FR24 provides and the file cannot.
--
-- `personality` and `communication_style` are prose and nothing filters on
-- them, which under AD7 would argue for leaving them out. They are columns
-- anyway, because a project-added persona needs somewhere to put its own —
-- keeping them in a plugin file keyed by name breaks the append case that is
-- the whole point of the table.
CREATE TABLE agent (
  name                TEXT PRIMARY KEY,      -- 'pm', 'architect' — the id skills reference
  display_name        TEXT    NOT NULL,      -- 'Jordan'
  icon                TEXT    NOT NULL,      -- single emoji, the party-mode prefix
  role                TEXT    NOT NULL,      -- 'Product Manager'
  personality         TEXT    NOT NULL,
  communication_style TEXT    NOT NULL,
  position            INTEGER NOT NULL,
  retired_at          TEXT,                  -- FR24 applies here too
  UNIQUE (display_name)                      -- two Jordans make the rendered output ambiguous
);

-- Each reference to `taxonomy` pins the domain it is allowed to draw from, in a
-- column the CHECK holds to one value, and joins BOTH columns to the composite
-- parent key. A plain `REFERENCES taxonomy(id)` would let a severity row sit in
-- a category slot — which is the drift, relocated rather than removed.
CREATE TABLE finding (
  id              TEXT PRIMARY KEY,
  review_id       TEXT NOT NULL,
  review_kind     TEXT NOT NULL DEFAULT 'review' CHECK (review_kind = 'review'),
  position        INTEGER NOT NULL,   -- projection order; without it a review's findings render unordered
  agent           TEXT REFERENCES agent(name),   -- nullable: not every finding is attributed
  category_id     TEXT NOT NULL,
  category_domain TEXT NOT NULL DEFAULT 'finding'
                    CHECK (category_domain = 'finding'),
  severity_id     TEXT NOT NULL,
  severity_domain TEXT NOT NULL DEFAULT 'severity'
                    CHECK (severity_domain = 'severity'),
  summary         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','accepted','rejected','remediated')),
  remediation_task_id TEXT REFERENCES task(id),
  FOREIGN KEY (review_id, review_kind)      REFERENCES document(id, kind) ON DELETE CASCADE,
  FOREIGN KEY (category_id, category_domain) REFERENCES taxonomy(id, domain),
  FOREIGN KEY (severity_id, severity_domain) REFERENCES taxonomy(id, domain),
  UNIQUE (review_id, position)
);

-- A retro observation. Also the story-level `**Retro**:` field, which is the
-- same thing recorded earlier — hence the exclusive parentage.
CREATE TABLE observation (
  id              TEXT PRIMARY KEY,
  retro_id        TEXT,
  retro_kind      TEXT CHECK (retro_kind = 'retro'),
  story_id        TEXT REFERENCES story(id)    ON DELETE CASCADE,
  position        INTEGER NOT NULL DEFAULT 0,  -- projection order within a retro
  text            TEXT NOT NULL,
  synthesis       TEXT,            -- written when grouped into a retro
  note            TEXT,            -- escape hatch: qualifiers, caveats, scope
  library_doc_id  TEXT,            -- set on promotion
  library_doc_kind TEXT CHECK (library_doc_kind = 'library'),
  retired_at      TEXT,
  retired_reason  TEXT,
  FOREIGN KEY (library_doc_id, library_doc_kind) REFERENCES document(id, kind),
  FOREIGN KEY (retro_id, retro_kind) REFERENCES document(id, kind) ON DELETE CASCADE,
  CHECK ((library_doc_id IS NULL) = (library_doc_kind IS NULL)),
  CHECK ((retro_id IS NULL) = (retro_kind IS NULL)),
  CHECK (retro_id IS NOT NULL OR story_id IS NOT NULL),
  CHECK ((retired_at IS NULL) = (retired_reason IS NULL))
);

-- Nullable `retro_id` makes a plain UNIQUE useless here, for the reason already
-- documented against `coverage`. The partial index constrains only rows that
-- have a retro to order within.
CREATE UNIQUE INDEX observation_retro_position
  ON observation (retro_id, position) WHERE retro_id IS NOT NULL;

-- Many-to-many: an observation genuinely spans categories.
CREATE TABLE observation_category (
  observation_id   TEXT NOT NULL REFERENCES observation(id) ON DELETE CASCADE,
  taxonomy_id      TEXT NOT NULL,
  taxonomy_domain  TEXT NOT NULL DEFAULT 'observation'
                     CHECK (taxonomy_domain = 'observation'),
  PRIMARY KEY (observation_id, taxonomy_id),
  FOREIGN KEY (taxonomy_id, taxonomy_domain) REFERENCES taxonomy(id, domain)
);

CREATE TABLE audit_finding (
  id               TEXT PRIMARY KEY,
  audit_id         TEXT NOT NULL,
  audit_kind       TEXT NOT NULL DEFAULT 'audit' CHECK (audit_kind = 'audit'),
  position         INTEGER NOT NULL,   -- projection order, as on `finding`
  dimension_id     TEXT NOT NULL,
  dimension_domain TEXT NOT NULL DEFAULT 'audit_dimension'
                     CHECK (dimension_domain = 'audit_dimension'),
  file             TEXT NOT NULL,
  line             INTEGER,
  symbol           TEXT,
  severity_id      TEXT NOT NULL,
  severity_domain  TEXT NOT NULL DEFAULT 'severity'
                     CHECK (severity_domain = 'severity'),
  FOREIGN KEY (audit_id, audit_kind)           REFERENCES document(id, kind) ON DELETE CASCADE,
  FOREIGN KEY (dimension_id, dimension_domain) REFERENCES taxonomy(id, domain),
  FOREIGN KEY (severity_id,  severity_domain)  REFERENCES taxonomy(id, domain),
  UNIQUE (audit_id, position)
);
```

`finding.remediation_task_id` closes a loop CPM leaves open: a review finding that generated a remediation task is joined to it, so "which findings were actually acted on" is a query rather than a reading exercise.

**Why every taxonomy is a table.** This is the design decision in this spec with the strongest empirical backing, and the evidence is worth stating exactly.

CPM fixes seven retro observation categories, named in a prose sentence inside a shared procedure. Across 22 real retro files in one project they appear as **twelve distinct headings**:

| Intended category | What was actually written |
|---|---|
| smooth deliveries | `Smooth Deliveries` (7), `What Went Smoothly` (5), `Smooth Delivery` (5) |
| codebase discoveries | `Codebase Discoveries` (15), `Codebase Discovery` (2) |
| testing gaps | `Testing Gaps` (11), `Testing Gap` (1), `Testing Notes` (1) |
| scope surprises | `Scope Surprises` (1), `Scope Surprise` (1) |
| criteria gaps | `Criteria Gaps` (2) |
| patterns worth reusing | `Patterns Worth Reusing` (18) |
| complexity underestimates | *never used, in any file* |

`What Went Smoothly` is a paraphrase, `Testing Notes` an invention, and the canonical `Smooth Deliveries` is the minority spelling of its own category.

The control case is in the same project, by the same author, in the same period: **review finding categories held almost perfectly** — all ten canonical categories used, roughly seven strays across a hundred headings. The difference is not discipline, it is form. Review categories appear as **literal headings in the skill's output template** and get copied; retro categories appear as **prose inside a shared procedure** and get restated in the author's own words.

Three consequences are built into the schema above:

- **`taxonomy` rows, referenced by a domain-scoped FK.** Twelve spellings of seven categories cannot occur when the category is an id. The scoping is the other half and is easy to leave out: a bare `REFERENCES taxonomy(id)` stops the misspellings but still admits a severity where a category belongs, so the vocabulary is enforced and the *vocabularies* are not. `UNIQUE (id, domain)` on the parent plus a `CHECK`-pinned domain column on each child makes the wrong-domain reference a foreign-key failure at write time.
- **`observation_category` is many-to-many.** Real observations were forced into invented compounds — `Testing gap → guard friction`, `Testing gap / pattern`, `Pattern reuse + testing` — because the format allowed one category and the work spanned two.
- **`taxonomy.retired_at`, not deletion.** One of the seven categories was never used once. A project should be able to stop offering a category without invalidating rows that already reference it, which means the vocabulary is data and not an enum.

`taxonomy.singular` exists because the canonical list is plural (it names categories) while a field carrying one observation wants the singular — `Pattern worth reusing` outnumbers `Patterns worth reusing` 31 to 4. Nobody specified which to use, so both were guessed. Storing both forms makes it a projection concern rather than an authoring decision.

**Parentage is inclusive, because promotion must not erase where an observation came from.** An observation is first written against a story (the `**Retro**:` field) and later gathered into a retro. An exclusive `CHECK ((retro_id IS NULL) <> (story_id IS NULL))` — which an earlier draft had — makes the act of gathering it destroy the story link, since satisfying the constraint means clearing `story_id`. The retro then holds an observation with no traceable origin, and nothing anywhere records which story produced it. `CHECK (retro_id IS NOT NULL OR story_id IS NOT NULL)` requires at least one parent and permits both: `story_id` is the origin and survives promotion, `retro_id` is the grouping and is set when the retro is written.

**Retirement keeps its date and reason and stays reversible.** `observation.retired_at` / `retired_reason` mirror CPM's in-place `**Retired {date}**: {reason}` marker rather than collapsing it to a status value. CPM's design note gives the reason — the marker "preserves category context and leaves a visible, greppable, reversible record" — and un-retiring is setting both columns back to NULL. `library_doc_id` records where an observation went when promoted, which is also what a promotion sets as its retirement reason.

### Artifacts — the bidirectional link, made unable to disagree

```sql
CREATE TABLE artifact (
  id            TEXT PRIMARY KEY,
  url           TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  description   TEXT,
  published_at  TEXT NOT NULL
);

CREATE TABLE artifact_document (
  artifact_id   TEXT NOT NULL REFERENCES artifact(id)  ON DELETE CASCADE,
  document_id   TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  PRIMARY KEY (artifact_id, document_id)
);
```

`cpm:artifact` today maintains `docs/artifacts/index.md` **and** backlinks written into each source document — the same relationship recorded twice, in two files, by hand, with no diagnostic when one side is updated and the other is not. One join table cannot hold a disagreement, because there is only one place for the fact to live. Both the index and the in-document backlinks become projections of the same rows.

**An artifact is a published thing, which is why `url` and `published_at` are both `NOT NULL`.** The row cannot exist before there is a URL to put in it, and that is the table meaning what it says rather than a restriction to work around. Two things follow. A draft, or content deliberately kept inside an organisation, is a `communication` document (FR10) and never an artifact with a placeholder URL — a register that admits `https://example.invalid/tbd` stops being a register of what was published. And "publishing updates the artifact row's URL in place" is therefore always a **re**-publish: the row being updated cannot have predated its own first publication, so the update path is reached by a second publication of something already registered, keyed on the `UNIQUE` URL or on the source join.

### References in prose — a marker, not a number

FR2 makes every *structural* reference a foreign key: an epic's spec, a coverage row's
requirement, an artifact's document. Those need no further thought here — a ULID does not
change when a merge renumbers its target, so a renumber is a re-render and there is nothing
to repair.

The references FR28 exists for are the other kind: **a sentence naming another artefact**.
This spec's own corpus is full of them — an epic's notes saying "the merge half is Epic
47-04", a retro observation citing the spec it came from. They are prose, they name a human
number, and that number moves.

The rule is that a body never stores the number. It stores `{{ref:<id>}}`, and the renderer
resolves the marker to the target's current identifier at projection time.

**No `document_reference` table, and the reason is the corpus.** A table with
`section_id REFERENCES document_section(id)` was the first design, and it buys write-time
enforcement — FR2's own argument. It was rejected because it reaches only section bodies,
and the references that actually matter are not all in sections: a retro observation citing
a spec lives in `observation.text`, a child row. Reaching those from one table means a
polymorphic source across five prose columns, which is precisely the unchecked-integer
shape AD1 rejected. A marker embedded in the text works in every column without caring
which table it is.

**The cost is that resolution is checked rather than constrained**, and that is register
entry #13. Deleting a document leaves markers naming it, and they render as broken
references instead of failing at write time. This is the same trade the register already
makes for `dependency` endpoints (#6) and for the same reason: the guarantee that can be
had cheaply is worth less than the one that cannot be had at all, but it is not nothing —
the check is a sweep over every prose column, and it was verified to work:

```
document_section.SEC1 | A1   | ok -> adr
document_section.SEC1 | S2   | ok -> spec
document_section.SEC2 | NOPE | *** DANGLING ***
```

### Session state

```sql
CREATE TABLE session (
  id             TEXT PRIMARY KEY,       -- CPM_SESSION_ID
  skill          TEXT,
  phase          TEXT,
  state          TEXT,                   -- JSON blob, skill-defined
  superseded_by  TEXT REFERENCES session(id),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
```

Adoption on `--resume` is `UPDATE session SET superseded_by = ?`. Classification is `updated_at < datetime('now','-3 days')`, replacing `progress-classify.sh`'s tab-delimited record emission and `cleancheck-guard.sh`'s once-per-session sentinel (207 lines together). The `.gitignore` leak — `/docs/plans/.cpm-*` swept into commits by `git add -A`, untrackable after the fact — ceases to be a category of problem, since session state is not a file.

### Search and schema management

```sql
-- A standalone FTS5 table carrying the section's ULID as an UNINDEXED column.
-- It is NOT external-content: an external-content table addresses its rows by
-- `content_rowid`, which must be an integer, and AD9 made every id a ULID.
CREATE VIRTUAL TABLE document_fts USING fts5(
  section_id UNINDEXED, heading, body
);

-- Written out rather than described, because the index is not self-maintaining
-- and the failure of an absent trigger is a search that misses what was just
-- written and reports success.
CREATE TRIGGER document_fts_insert AFTER INSERT ON document_section BEGIN
  INSERT INTO document_fts(section_id, heading, body)
    VALUES (new.id, new.heading, new.body);
END;

CREATE TRIGGER document_fts_delete AFTER DELETE ON document_section BEGIN
  DELETE FROM document_fts WHERE section_id = old.id;
END;

CREATE TRIGGER document_fts_update AFTER UPDATE ON document_section BEGIN
  DELETE FROM document_fts WHERE section_id = old.id;
  INSERT INTO document_fts(section_id, heading, body)
    VALUES (new.id, new.heading, new.body);
END;

-- Narrative bodies live in `document_section`; most of the prose a user would
-- search for does not. A second standalone index covers the child tables that
-- hold hand-written text, tagged with the entity it came from so a search can
-- be scoped or left open.
CREATE VIRTUAL TABLE entry_fts USING fts5(
  entity, entity_id UNINDEXED, text
);

CREATE TRIGGER requirement_fts_insert AFTER INSERT ON requirement BEGIN
  INSERT INTO entry_fts(entity, entity_id, text)
    VALUES ('requirement', new.id, new.text);
END;

CREATE TRIGGER requirement_fts_update AFTER UPDATE OF text ON requirement BEGIN
  DELETE FROM entry_fts WHERE entity = 'requirement' AND entity_id = old.id;
  INSERT INTO entry_fts(entity, entity_id, text)
    VALUES ('requirement', new.id, new.text);
END;

CREATE TRIGGER requirement_fts_delete AFTER DELETE ON requirement BEGIN
  DELETE FROM entry_fts WHERE entity = 'requirement' AND entity_id = old.id;
END;

-- The same three triggers exist for `acceptance_criterion.text`,
-- `observation.text` and `finding.summary`, differing only in the entity tag,
-- the table and the column. They are not written out here; the coverage
-- criterion below asserts that all three exist for every indexed table, which
-- closes the absent-trigger risk with a test rather than with twelve near
-- copies a reader would have to diff by eye.

CREATE TABLE schema_version (
  version     INTEGER NOT NULL,
  applied_at  TEXT    NOT NULL
);
```

The FTS index is maintained by the three triggers above, not by a reindex step. A search index that lags a write returns a result set missing the thing just written, and reports success — an instance of NFR6's false-pass class, so it is closed at the schema rather than left to a caller to remember.

**The index is standalone, and that is a consequence of AD9 rather than a preference.** An external-content FTS5 table addresses its rows through `content_rowid`, and a rowid is an integer: with `document_section.id` a ULID, `INSERT INTO document_fts(rowid, …) VALUES (new.id, …)` fails at runtime with `datatype mismatch` on the first section written. The table is therefore standalone, storing `heading` and `body` itself and carrying the section's ULID in an `UNINDEXED` column that the delete and update triggers key on. The cost is the section text held twice; the corpus is a project's docs directory, so it is not a cost worth a per-database integer that AD9 exists to remove. Because the table owns its content, there is no `rebuild` to run and none to test — the triggers are the whole maintenance story.

**The indexed columns are `heading` and `body`, not `title`.** Titles live on `document`, sections have `heading`, and a column named for the wrong table is an error the standalone form no longer catches at `MATCH` time — it silently indexes nothing. Document titles are therefore deliberately outside this index: `document` is small and ordered, and a title query is an ordinary `WHERE`.

**Two indexes, because most of the searchable prose is not in a section.** `document_section` holds narrative bodies, but a requirement's text, a story criterion's text, a retro observation and a review finding are all rows in child tables, and a search that covers only sections misses the majority of what a user would look for — "which requirement mentioned the coverage helpers" returns nothing while the answer sits in `requirement.text`. `entry_fts` covers those, tagged by entity, so `entity:requirement AND helpers` scopes a search and an untagged query spans everything. A column earns a place in it by holding prose a person wrote that no other column can find the row by. Labels, statuses and enums are not indexed — they are `WHERE` clauses, and putting them in a full-text index would make ranking meaningless. **The set is deliberately not enumerated here.** It was, once: four columns, written at a point when the schema indexed eight, so the list was wrong about `story_criterion.text` and `observation.synthesis` while continuing to read as a specification of what the index holds. FR9's criterion enumerates the indexed set from `sqlite_schema` and reconciles it against the columns holding prose, so *what is indexed* is answered by a query and *what should be* by a reconciliation — and neither is a sentence anyone has to keep true.

### The cross-row invariant register

The table below is the complement of the one that follows it. That one lists drift the schema ends; this one lists the rules the schema **cannot** express, because each spans rows the way a foreign key cannot — reachability across a graph, the existence of a row conditional on a column elsewhere, or agreement between two ends of a four-table join.

Enumerating them is the point. An invariant with no constraint and no register entry is not enforced by anything, and it is invisible: nothing fails, nothing warns, and the rule survives only as long as whoever knew it is still reading the code. That is the same failure the Problem Summary describes for prose-held relationships, one level up.

Every entry is closed twice — refused at the write path so it cannot arrive, and reported by FR14 so it can be found if it arrives another way, chiefly by restoring a dump.

| # | Invariant | Why it cannot be a constraint | Refused at write by | Reported by |
|---|---|---|---|---|
| 1 | No cycle among `gates_work` edges | Reachability is not row-local | link tool | FR14 |
| 2 | `adr.decision_status = 'superseded'` implies a `supersedes` edge out of it | Existence of a row in another table, conditional on a column value | ADR status tool, which sets both or neither | FR14 |
| 3 | A `coverage` row's requirement and its story criterion belong to the same spec | A four-table join: requirement → spec, criterion → story → epic → spec | coverage create tool | FR14 |
| 4 | A `coverage_story` row's story is in the same epic as the coverage row it extends | Same shape as #3 | coverage link tool | FR14 |
| 5 | `number_sequence.next_value` is at least the highest number allocated for that kind | An aggregate over another table | upsert allocation holds it by construction | FR14, and it is repairable |
| 6 | A `dependency`'s ends are kinds that edge admits — `builds_on` spec→spec, `constrains` ADR→ADR | Needs both ends' kinds, and the legal set varies by `dependency_kind` | link tool | FR14 |
| 7 | A `review`'s `scope_story_id` names a story inside the epic it reviews | The same four-table join as #3 | review create tool | FR14 |
| 8 | An `adr` at `decision_status = 'accepted'` has exactly one `adr_option` with `chosen = 1` | An aggregate over a child table, conditional on a column here | ADR status tool | FR14 |
| 9 | `coverage.spec_fragment` is a substring of its requirement's `text` | Spans two tables, and the predicate is textual rather than referential | coverage create tool | FR14 |
| 10 | No row is written referencing a vocabulary row already retired | Depends on the parent's `retired_at` at the moment of writing | every create tool | FR14 |
| 11 | `session.superseded_by` forms no cycle | Reachability, as #1 | session adoption tool | FR14 |
| 12 | A `document_milestone` row's document and milestone belong to the same spec | Needs `document.parent_id` walked to the root; not row-local | milestone link tool | FR14, FR27 |
| 13 | Every `{{ref:<id>}}` marker in every prose column resolves to a live `document` | The reference is inside text, so no foreign key can reach it | link and delete tools | FR14, FR28 |

**#3 is the one that matters most.** It is the only entry whose violation produces a *plausible* result rather than an obviously broken one: a coverage matrix joining spec A's requirement to spec B's criterion renders perfectly, rolls up to a percentage, and is wrong. It belongs in the false-pass register too, and is listed there.

**#5 says "at least" and not "greater than", and the difference is the whole entry.** The upsert returns the value it has just incremented to, so allocating the first number of a kind leaves `next_value` at 1 with number 1 issued: equal, not greater. The strict form holds only in the window between an allocation and the write that consumes it, which no check can observe, so an entry asserting it fails on every correctly-numbered database — a register entry that reports a violation on healthy data teaches its reader to disregard the register.

**#10 is the entry that makes FR24's retirement mean something.** Retirement was previously enforced against nothing: `retired_at` kept existing rows valid, which is half the promise, while nothing stopped a *new* row referencing a retired category. A project could retire a vocabulary item and find it still on offer and still accepted, with no failure anywhere — the drift class the taxonomy tables exist to end, surviving as a soft convention in the one place FR24 promised it would not.

**Restore is the one connection where FR2 cannot hold, so it ends with an explicit check.** A `.sql` dump opens with `PRAGMA foreign_keys=OFF`, and it has to: any dump sorted by natural key, as NFR4 requires, is not in topological order, and `document.parent_id` is self-referential so no fixed table order avoids it. That makes restore precisely the path on which every foreign key in the schema is advisory — false-pass entry #7 arriving as a designed step rather than an accident, on the path the register already names as how violations arrive. Restore therefore ends with `PRAGMA foreign_key_check`, failing loudly and naming the rows, followed by the FR14 register sweep. Neither is optional and neither is the caller's to remember.

**#12 and #13 are new, and both arrived the same way.** Neither was reasoned into existence:
each was found by executing the schema the change proposed. `document_milestone` accepted a
cross-spec pairing on the first probe, and the marker sweep was written to prove markers
were checkable at all. An invariant discovered by running the thing is the only kind this
register has ever gained.

**#6 is deliberately a register entry and not an allow-list table.** The machinery exists — a `dependency_kind_endpoint(kind, source_kind, target_kind)` table with composite foreign keys would close it structurally, exactly as `document_kind_parent` closes parentage. It is not built because the legal set is not yet known: `blocks` alone spans epic→epic and story→story, and inventing the rest of the matrix before dpm's own pipeline exists would fix guesses in a constraint. When the pipeline settles, this entry converts from a check to a table, and that is the intended direction of travel for anything here that can make the trip.

### The dumper is dpm's own component

NFR4 asks for byte-stability and AD4 stakes branching on it, but neither says what produces the bytes. `sqlite3 .dump` does not, for three reasons, each of which was executed rather than reasoned about:

- **It emits the FTS5 shadow tables.** `document_fts` expands to five real tables in `sqlite_schema` — `_data`, `_idx`, `_content`, `_docsize`, `_config` — and `.dump` writes their contents as hex blobs. Those blobs are FTS5's internal representation of an index that is *derived*, so committing them commits a second copy of every section body in a form no reviewer can read and no merge can resolve.
- **It emits rows in storage order.** For every table without a rowid alias the order is insertion order, so two machines that reached the same logical state by different routes produce different files. That is the exact failure NFR4 names, arriving from the tool chosen to prevent it.
- **`node:sqlite` does not have it.** `.dump` is a feature of the `sqlite3` CLI, not of the library. Depending on it would put a per-platform binary back into the runtime that AD5 chose Node specifically to avoid.

**dpm therefore writes its own dumper, and its output is defined here rather than left to a library.**

1. **Schema first, in `sqlite_schema` order**, filtered to exclude `sqlite_%` and every object whose name begins with an FTS5 virtual table's name followed by `_`. The `CREATE VIRTUAL TABLE` for `document_fts` itself is kept; its five shadow tables are not.
2. **Triggers are part of the schema and are created before any data.** This is what makes the FTS index reproducible without dumping it: restoring `document_section` fires `document_fts_insert` row by row, and the index is rebuilt as a consequence of the data arriving. Verified by round trip — a restore from a schema-then-data file yields a populated index and a clean `PRAGMA foreign_key_check`.
3. **One `INSERT` per row, one row per line, columns named explicitly.** Naming the columns means a later migration that adds one does not invalidate every historic dump.
4. **Rows ordered by primary key.** AD9 is what makes this a *total* order on every table without a declared tiebreak: a ULID is unique and lexicographically comparable, so "order by the primary key" is well-defined everywhere, including the association tables whose key is composite.
5. **Values rendered by a fixed literal formatter** — SQL string quoting with doubled single quotes, integers in base ten, `NULL` unquoted, no float shortening, no locale collation anywhere in the pipeline. Text is written as-is; dpm stores no floats and no blobs, which is a constraint on the schema rather than a property of the data.
6. **LF endings and a trailing newline**, so the file is stable across platforms and git adds no diff of its own.

**The `.sql` is written by the same pre-commit hook that regenerates the projection** (FR7), and for the same reason: both are generated artefacts committed alongside a source of truth that is not in the commit, so both are stale the moment a write lands and nothing regenerates them. The hook regenerates the projection, regenerates the dump, and fails on divergence in either — one guard, because a commit carrying a fresh projection and a stale dump is the worse of the two failures and would otherwise pass.

### Constraint-to-drift mapping

| Drift in CPM today | Constraint that ends it |
|---|---|
| `**Source spec**` naming a spec that may not exist | `document.parent_id` FK |
| `FR1a` reduced to `FR1` by string surgery | `requirement.parent_id` FK |
| `ENVn` vs `ENVXn` distinguished by spelling | `requirement.class` CHECK |
| MoSCoW read from the markdown heading above a bullet | `requirement.moscow` CHECK |
| Deferral inferred from a label appearing in a Scope bullet | `requirement.exclusion` CHECK |
| `must NOT —` recognised by prose prefix | `acceptance_criterion.polarity` CHECK |
| Coverage matrix parsed as a markdown table | `coverage` rows |
| `REQ = STATE ∪ EXCLUDED` asserted by test | partition holds by construction |
| ✓ surviving an edit to the criterion it verified | `binding_hash` + unverify triggers |
| One requirement's several obligations collapsed to one row | `coverage.spec_fragment`, one row each |
| Story criteria readable only as epic prose | `story_criterion` rows |
| `**Blocked by**` as a prose list of epic filenames | `dependency` edges |
| Seven retro categories written as twelve headings | `taxonomy` rows, referenced by FK |
| An observation forced into one category when it spans two | `observation_category` many-to-many |
| `**Builds on**` hand-invented in three specs, unspecified | `dependency_kind = 'builds_on'` |
| Retirement collapsing date and reason into a state | `retired_at` + `retired_reason`, reversible |
| A test-approach tag appearing in a retro category slot | FK to `taxonomy`, domain-scoped |
| `**Retro applied**: 12 · theme · Applied — …` in one line | `retro_application` columns |
| Status carrying an unparseable free-text qualifier | `status` + `status_note` |
| Numbers recovered by globbing two directories | `number_sequence`, root and child |
| Archive mirror as a load-bearing directory contract | `document.archived_at`, orthogonal to `status` |
| Artifact index and in-document backlinks, kept in step by hand | `artifact_document` join table |
| Progress files, session suffixes, adoption on resume | `session` rows |
| Status written as `Done` / `done` / `✅` | `CHECK` constrained enums throughout |
| A search index lagging the write that filled it | FTS5 triggers on `document_section` |
| An observation losing its story when promoted to a retro | inclusive parentage, `story_id` survives |
| The first number for a kind allocated against no row | upsert allocation, no seeding step |
| `**Source spec**` naming a document of the wrong kind | `document_kind_parent` + composite FKs |
| A story, requirement or finding hung off a document of the wrong kind | composite `(id, kind)` FK on every kind-specific reference |
| A ✓ surviving a rewrite of the coverage fragment it verified | `coverage_unverify_on_fragment_edit` |
| A retired vocabulary item still accepted on new rows | cross-row register #10, refused at the tool boundary |
| A restore silently admitting what foreign keys would have caught | `PRAGMA foreign_key_check` after restore, then the FR14 sweep |
| A review's findings rendering in whatever order the query returned | `position` on `finding`, `audit_finding` and `observation` |
| A kind's declared numbering scheme constraining nothing | `numbering` denormalised, pinned, and `CHECK`ed |
| An invariant too cross-row to be a constraint going unchecked | the cross-row invariant register + FR14 |

Thirty-five rows. The four shell helpers doing this work in CPM — `coverage-parse.sh`, `coverage-rollup.sh`, `progress-classify.sh`, `cleancheck-guard.sh` — are 1,686 of the 2,305 lines in `cpm/hooks/lib/`.

**That figure is evidence, not a saving.** Those helpers stay shipped and working in CPM, which this spec does not touch; nothing here deletes a line of them. What 1,686 lines measures is the price of reconstructing entities from prose *when you do it as carefully as CPM does* — and even paid in full it buys a roll-up that can still silently match nothing and report full coverage. The benefit dpm delivers is not the shell it makes unnecessary but the failures it makes unavailable: the thirty-five rows above are each a question a user currently has to answer by reading, and afterwards answers by asking. The claim is not that the schema is clever; it is entirely ordinary. It is that ordinary constraints are unavailable in the current substrate at any price.

Every count in this document that describes a table in this document is checked by the FR14 integrity criterion below, because a hand-maintained count drifting from what it counts is the defect this spec is about, and this spec has committed it twice.

## Scope

### In Scope

- The SQLite schema for all CPM artefact types, with foreign keys, `CHECK`-constrained enums, and FTS5.
- The MCP server: typed create, read, update, link, and search tools; migrations; integrity verification.
- The plugin manifest's declaration of that server, which is what makes the tool surface reachable from a session at all (FR29).
- The markdown projection renderer and the pre-commit divergence guard.
- The deterministic dump-and-restore path, and the merge tool that renumbers colliding human numbers after a branch merge (AD9).
- The twenty-three dpm skill files enumerated in FR25 — CPM's twenty-two stages mirrored one for one and rewritten against the tool surface, plus `publish`, which is dpm's own and needs no counterpart.
- The regeneration path behind `publish`: one implementation, a CLI, and an MCP tool (AD11). FR6 and FR7 both assume it; until it exists neither is reachable.

### Out of Scope

- **Any importer from CPM's markdown artefacts** (AD8). Every project starts with an empty database. This was briefly FR15 in an earlier draft; it was never requested and is now an explicit non-goal.
- **Compatibility with CPM's existing output.** dpm does not read, parse, or reproduce historic artefacts, and therefore does not inherit their conventions — legacy filename shapes, read-only status synonyms, or free-text status tails are CPM's concerns, not dpm's.
- **Reproducing CPM's vocabularies.** dpm defines its own enums (AD8). CPM's are useful prior art and no more.
- Changes to CPM itself. dpm is a separate plugin; CPM is unmodified and remains installable alongside.
- A web or TUI interface. Reads go through MCP tools or the generated markdown.
- Any write path through markdown (FR18).
- Multi-project federation (FR17 is a Could Have, not committed).

### Deferred

- **FR16 semantic diff** — valuable for review, but the markdown projection already gives reviewers a readable diff, so this is an improvement rather than a gap.
- **FR17 cross-project queries** — needs a project-registry design that does not exist yet.
- **Retirement of CPM's coverage helpers.** They stay shipped and working in CPM. dpm not needing them is the win; deleting them from another plugin is not this spec's business.

## Testing Strategy

### Tag Vocabulary

- `[unit]` — Individual components in isolation.
- `[integration]` — Boundaries between components.
- `[feature]` — Complete workflows end to end.
- `[manual]` — A human judges it; no automation is possible in principle.
- `[target]` — Mechanically checkable, but only against a real deployment target. Not self-assessable in an autonomous run.
- `[tdd]` — Workflow mode, composable with any level tag.

### What the suite reads outside dpm

Two criteria below reach outside dpm's own tree, and they are different in kind. Saying which
is which is the difference between a declared dependency and an accidental one.

**CPM's skill directory is a name oracle for the conversions, and that is the whole of it.**
FR25's list is hand-kept, and a hand-kept list can be short. The only thing that catches a
list short of a stage a CPM user can reach is comparing it against CPM's own `skills/`
directory — a set comparison over **directory names**, reading no file. CPM ships at `cpm/`
in the same marketplace repository as dpm, so this is a sibling directory in the same commit:
no version pin, no install step, no skew between what the suite reads and what the repository
holds. When CPM gains a pipeline stage the comparison fails, and that failure is correct —
dpm is short a conversion and someone should find out from a test rather than from a user.

**It is a subset check, and it must never become an equality check.** dpm is independent of
CPM for new functionality: a skill dpm needs and CPM has no reason to have is not an
exception, an addition, or anything requiring justification against CPM — it is simply a dpm
skill, and `publish` is the first. An equality comparison would make every future dpm
capability a test failure until CPM grew a matching directory, which inverts the dependency
this spec exists to remove.

**What keeps the list honest in the other direction is FR25 itself, not CPM.** The
enumeration is the oracle for dpm's corpus — every name in FR25 has a directory, and every
directory is named in FR25. That pair closes the undeclared-extra hole without reference to
CPM at all, which is the point: the two checks answer different questions, and reading either
as a version of the other reintroduces the coupling.

**An absent fixture is a failure, not a skip.** A suite run from an extracted plugin copy has
no `cpm/` beside it, and a name comparison against a directory that does not exist passes
trivially. That is NFR6's false pass in its purest form: the check that exists to catch a
short list is the check most easily satisfied by finding nothing at all.

**CPM's `SKILL.md` *content* is not an oracle of any kind.** The retention criterion asserts
that each converted skill still performs its counterpart's gates and refusals — but the
behaviours are named in that skill's own criterion, and the test drives the **dpm** skill to
check them. Nothing reads CPM's prose at test time. Three reasons, and the second is the one
that matters:

- **The extraction is not possible.** "Still refuses an untestable criterion" is not derivable  
  from a paragraph by any means a suite could run. It would need a hand-written manifest of  
  CPM's behaviours — a third hand-kept list, existing to check the second.
- **It would couple dpm's suite to CPM's wording, and fail in the safe direction only.** CPM's  
  skill files get edited for prose reasons, and a dpm test failing on a rewording is noise.  
  The reverse is the real cost: CPM removing a gate would silently license dpm to remove it  
  too, and the suite would report success all the way down. A test whose oracle can be edited  
  by the thing it is testing is not a test.
- **It would quietly contradict the Scope section.** CPM is unmodified and remains installable  
  alongside; a suite that pins CPM's behaviour withdraws that freedom without saying so.

CPM's `SKILL.md` is what an author reads while *writing* the criterion. That is the same
relationship FR10 already has with a real CPM project's `docs/` tree — which supplied the
artefact list, disagrees with CPM's documentation, and is not a fixture either.

**What this leaves uncovered, stated rather than papered over.** A criterion naming too few
behaviours passes while the conversion drops the rest. The corpus roll-up catches a skill with
*no* retention criterion; nothing mechanical catches one that is merely thin. That judgement
is `[manual]` and belongs to whoever reviews the conversion.

### Acceptance Criteria Coverage

| Requirement | Acceptance Criterion | Test Approach |
|---|---|---|
| FR1 | Creating each artefact type produces a row readable by its typed read tool | `[integration]` |
| FR2 | Creating an epic with a non-existent `spec_id` fails, and no row is written | `[integration]` |
| FR2 | must NOT — a foreign-key violation is accepted because `foreign_keys` defaulted off on a fresh connection | `[integration]` |
| FR2 | Every column named `*_id` on every table appears in that table's `PRAGMA foreign_key_list`, with no exceptions list (AD7) | `[unit]` |
| FR2 | Every foreign key whose target is `document` names `(id, kind)`, except the ones the Data Model names as legitimately kind-agnostic — and that exceptions list is the one in the Data Model, not one the test may extend | `[unit]` |
| FR2 | must NOT — a `story` is accepted under a spec, a `requirement` under an epic, or a detail row on a document of another kind | `[unit]` |
| FR4 | Every `requirement` and `acceptance_criterion` type distinction is readable from a column with `label` and `text` withheld | `[integration]` |
| FR3 | Every dpm SKILL.md contains no SQL keyword and no `sqlite3` invocation | `[integration]` |
| FR29 | The plugin manifest declares an MCP server whose entry point exists on disk and starts | `[integration]` |
| FR29 | must NOT — the declaration is absent or names a missing entry point, and the suite still passes because every server test supplies its own launch | `[unit]` |
| FR29 | Every tool name a dpm SKILL.md writes is `mcp__dpm__` followed by an exported tool name, resolved against the live registry | `[unit]` |
| FR25 | The twenty-three skills named in FR25 all exist, and no skill exists that FR25 does not name | `[unit]` |
| FR25 | No skill file contains a filename pattern under `docs/`, a glob, a number-allocation procedure, or a progress-file lifecycle — each is a tool call | `[unit]` |
| FR25 | Every pipeline stage a CPM user can reach has a dpm skill, asserted by comparing the corpus against CPM's own skill directory | `[integration]` |
| FR25 | The CPM comparison is a subset check — a dpm skill CPM has no counterpart for passes it, and dpm's corpus is bounded by FR25's enumeration rather than by CPM's directory | `[integration]` |
| FR25 | must NOT — the pipeline-stage comparison reports success because CPM's `skills/` directory was absent, rather than failing on a fixture it could not read | `[integration]` |
| FR25 | must NOT — the pipeline-stage comparison is an equality check, so a capability dpm adds fails a test that is about CPM's completeness and not about dpm's | `[integration]` |
| FR25 | must NOT — a skill recovers an entity by reading a generated markdown file rather than by calling a read tool | `[integration]` |
| FR25 | Each converted skill still performs its counterpart's gates, questions and refusals — the behaviours named in that skill's own criterion, asserted **per skill** by driving the dpm skill and never by reading CPM's `SKILL.md` | `[feature]` |
| FR25 | must NOT — a skill satisfies every subtraction sweep while retaining none of its counterpart's facilitation, so a corpus of twenty-two files each carrying a title and a single tool call passes | `[unit]` |
| FR4 | A status value outside its enum is rejected by `CHECK`, not coerced | `[unit]` |
| FR4 | `superseded` and `withdrawn` round-trip on a document, a story and a task, and remain distinguishable from an archived document and from a `status_note` qualifying a live one | `[integration]` |
| FR4 | Loading a corpus whose labels are all replaced with opaque identifiers leaves every class, MoSCoW band and exclusion value unchanged | `[integration]` |
| FR4 | must NOT — the `requirement` create tool accepts a class inferred from `label`, rather than requiring `class` as an argument | `[unit]` |
| FR4 | A story written with `plan` set reads back with it set, and its title is unchanged — the mark is a column and never a suffix on the title | `[integration]` |
| FR5 | Numbers allocated across create-archive-create never repeat, including past 99 | `[unit]` |
| FR5 | The first allocation for a kind with no `number_sequence` row returns 1, and the first child allocation under a new parent does the same | `[unit]` |
| FR5 | must NOT — an allocation returns no row, or returns success without a number | `[unit]` |
| FR6 | Regenerating the projection twice from one database state yields byte-identical output | `[integration]` |
| FR6 | A value written through a create tool appears in the rendered markdown for its document — determinism without this is satisfied by a renderer that emits nothing | `[integration]` |
| FR6 | Two databases holding identical logical content, with child rows inserted in different orders, render byte-identical markdown | `[integration]` |
| FR6 | must NOT — a projected collection has no ordering column and no declared tiebreak, so its render order is whatever the query returns | `[unit]` |
| FR6 | Publishing an empty tree writes every document the database produces and the dump beside it, and publishing again from the same state rewrites nothing and reports no change | `[integration]` |
| FR6 | A document whose file no longer belongs — renamed by a renumber, or removed from the database — is deleted by the publish, so the tree holds what the database produces and nothing else | `[integration]` |
| FR6 | must NOT — publishing writes a partial tree when one document cannot render, leaving files the guard then diffs clean | `[unit]` |
| FR7 | A write, then a publish, leaves the guard passing; the same write without the publish leaves it naming both artefacts | `[feature]` |
| FR7 | must NOT — the pre-commit hook regenerates and stages the result, overwriting a hand-edit rather than refusing the commit | `[feature]` |
| FR7 | A hand-edited generated file causes the pre-commit guard to exit non-zero, naming the file | `[feature]` |
| FR7 | must NOT — a hand-edit is silently overwritten with no diagnostic | `[feature]` |
| FR7 | A write made since the last commit leaves `.dpm/dpm.sql` stale, and the guard regenerates it and fails, naming it | `[feature]` |
| FR7 | must NOT — a commit is accepted carrying a regenerated projection and an unregenerated dump | `[feature]` |
| FR8 | The dump contains no FTS5 shadow table and no hex blob, and restoring it yields a populated `document_fts` — the index is rebuilt by the insert trigger, not carried in the file | `[integration]` |
| FR8 | Every `INSERT` in the dump names its columns, and every table's rows are emitted in primary-key order | `[unit]` |
| FR8 | Dumping the same database on two machines yields byte-identical `.sql` | `[integration]` |
| FR8 | Two branches each adding an epic produce a resolvable text conflict, and the merged dump restores | `[feature]` |
| FR8 | Two branches each adding a spec allocate distinct ULIDs for every row, so the merged dump has no primary-key collision on any table | `[integration]` |
| FR8 | When both branches allocated the same human number, the merge tool renumbers one, renames its projection file, and re-renders the artefacts that referenced it; the restored database then passes `PRAGMA foreign_key_check` and the register's checks | `[feature]` |
| FR8 | must NOT — a number collision is resolved by silently overwriting one side, or left for the user to find when the projection renders two artefacts with the same number | `[feature]` |
| FR9 | A search returns ranked results, and the index reflects a write made in the same session | `[integration]` |
| FR9 | A section written with a ULID id is retrievable by `MATCH`, and `document_fts` declares no `content=` option — the external-content form rejects a non-integer rowid at write time | `[unit]` |
| FR9 | Updating and deleting a section both leave the index consistent with the table, asserted by comparing a `MATCH` against a `LIKE` scan | `[unit]` |
| FR9 | A term appearing only in a `requirement.text` is found by an unscoped search, and the hit names the entity and row id | `[integration]` |
| FR9 | Every table `entry_fts` indexes has all three triggers — insert, update-of-the-indexed-column, delete — enumerated from `sqlite_schema`, with no table indexed by fewer than three | `[unit]` |
| FR9 | Updating and deleting a row of each indexed child table leaves `entry_fts` consistent with that table, asserted by the same `MATCH`-versus-`LIKE` comparison | `[unit]` |
| FR9 | must NOT — a search covers `document_section` only, so text held on a child row is unreachable while the tool reports success | `[integration]` |
| FR9 | Every column holding prose a person wrote is either indexed or carries a recorded reason it is not, enumerated from `sqlite_schema` rather than from a list, and reconciled in both directions so an indexed column with no entry and an entry for a column that has gone both fail | `[unit]` |
| FR9 | `audit_finding.summary` is searchable on the same terms as `finding.summary`, and `quick_criterion.text` on the same terms as `acceptance_criterion.text` and `story_criterion.text` — named because a fix written in general terms would satisfy the criterion above while leaving both | `[integration]` |
| FR9 | The search tool states what it cannot answer — no infix match, no stemming, and ranking interleaved across the two indexes — where the caller reads it, rather than only in the requirement | `[unit]` |
| FR9 | must NOT — the reconciliation passes over an empty enumeration, so a schema read yielding no prose columns or no indexed columns reads as full coverage | `[unit]` |
| FR10 | Every table in `sqlite_master` has a create tool, asserted by comparing the live table list against the registered tool list — neither side is a hand-kept enumeration | `[integration]` |
| FR10 | Every seeded `document_kind` row has a projection template, enumerated against the live table in both directions; the child entity types and the ADR render inside a parent's template and are asserted to appear in one | `[integration]` |
| FR10 | must NOT — a `document_kind` row exists that the parity enumeration does not name, or the reverse | `[unit]` |
| FR10 | A `present` run told to keep its output local writes a `communication` document with its sections, and writes no `artifact` row | `[feature]` |
| FR10 | must NOT — an unpublished communication is recorded as an `artifact`, with a placeholder URL or any other stand-in for one | `[unit]` |
| FR10 | A library document imported from elsewhere records its provenance in `library_document.source`, and one written in the project reads back with it NULL | `[unit]` |
| FR10 | must NOT — a library document's provenance is written into a section body rather than into its column | `[unit]` |
| FR11 | A session row survives simulated resume under a new session id, and stale rows are selected by age | `[integration]` |
| FR11 | Every skill that records a session reaches the resume path on startup, checked over the corpus; and the shared convention it reaches carries adoption rather than each file restating it | `[unit]` |
| FR21 | Editing a story criterion's text clears `verified_at` and `binding_hash` on every coverage row bound to it | `[unit]` |
| FR21 | Editing a requirement's text clears verification on its coverage rows | `[unit]` |
| FR21 | must NOT — a coverage row holds `verified_at` while `binding_hash` is NULL, or the reverse | `[unit]` |
| FR21 | Editing `coverage.spec_fragment` clears `verified_at` and `binding_hash` on that row | `[unit]` |
| FR21 | control — an edit that leaves the text byte-identical does not clear verification, on all three watched columns | `[unit]` |
| FR21 | must NOT — any column the binding is computed from can be edited without clearing verification | `[unit]` |
| FR26 | Claiming completeness on a requirement, then inserting a coverage row for it, leaves the claim cleared | `[unit]` |
| FR26 | Deleting a coverage row, and editing a bound fragment, each clear the claim on that row's requirement | `[unit]` |
| FR26 | Editing a requirement's text clears its own completeness claim, not only its coverage rows' verification | `[unit]` |
| FR26 | control — an edit leaving the requirement's text byte-identical does not clear the claim, and neither does an update to an unrelated column | `[unit]` |
| FR26 | A requirement with fragments bound and no claim is distinguishable by query from one with the same fragments and a current claim | `[integration]` |
| FR26 | must NOT — `coverage_claimed_at` is set while `coverage_claim_hash` is NULL, or the reverse | `[unit]` |
| FR26 | must NOT — completeness is derived from fragment offsets rather than claimed, so connective prose must be bound to satisfy it | `[unit]` |
| FR27 | An epic joined to two milestones is returned by a readiness query for either, and reports both | `[integration]` |
| FR27 | Two specs may each hold a milestone labelled `M1`; one spec may not hold two, and positions are unique within a spec | `[unit]` |
| FR27 | must NOT — an artefact's milestone is a column, so an epic spanning two must be filed under one | `[unit]` |
| FR28 | A `{{ref:<id>}}` marker in a section body and in a `requirement.text` both render as the target's current human identifier | `[integration]` |
| FR28 | Renumbering a document through the merge tool changes no stored text, and the next render resolves every marker naming it to the new number | `[feature]` |
| FR28 | must NOT — a projected body contains a literal artefact number that no row produced | `[unit]` |
| FR22 | An epic blocked by two epics yields two `dependency` rows, and completing both makes it selectable as ready | `[integration]` |
| FR22 | A story-to-story `blocks` edge and a spec-to-spec `builds_on` edge both round-trip through one table | `[unit]` |
| FR22 | A `builds_on` edge does not gate readiness; a `blocks` edge does | `[unit]` |
| FR22 | A blocker set to `superseded` or `withdrawn` leaves the thing it blocks unready, where the same blocker set to `complete` makes it ready | `[integration]` |
| FR22 | must NOT — readiness treats any non-`pending` blocker status as satisfied, so abandoned work clears the way for what waited on it | `[unit]` |
| FR22 | must NOT — a document or story depends on itself | `[unit]` |
| FR22 | must NOT — the same edge is storable twice, for any combination of NULL source/target columns | `[unit]` |
| FR22 | The link tool refuses an edge that would close a cycle over a `gates_work` kind, naming both ends | `[integration]` |
| FR22 | A `builds_on` cycle is accepted, since no readiness query traverses it | `[unit]` |
| FR14 | The integrity tool reports a `gates_work` cycle introduced by restoring a dump | `[integration]` |
| FR24 | An observation carrying two categories round-trips, and appears under both in the projection | `[integration]` |
| FR10 | An observation written against a story and later gathered into a retro retains its `story_id`, so its origin is still queryable | `[unit]` |
| FR24 | Retiring a taxonomy row leaves rows referencing it intact and readable | `[unit]` |
| FR24 | A project-added category is usable without a schema migration | `[integration]` |
| FR24 | must NOT — any category, severity, dimension or approach is stored as free text rather than a foreign key | `[integration]` |
| FR24 | A severity row is rejected in a category slot, and an audit dimension in a severity slot, on `finding` and `audit_finding` alike | `[unit]` |
| FR24 | Retiring a test approach and a dependency kind leaves rows using them intact, as it does for a taxonomy row | `[unit]` |
| FR24 | must NOT — any vocabulary is seeded and extensible but cannot be retired | `[unit]` |
| FR24 | must NOT — a new row is accepted referencing a taxonomy row, test approach or dependency kind already retired, so that retirement stops rows arriving as well as preserving those that have | `[unit]` |
| FR24 | The agent roster is a table: `document_agent.agent` and `finding.agent` both reject a persona name no `agent` row carries, and every persona a skill offers is read from the table rather than from a file | `[integration]` |
| FR10 | A discussion records its participants as `document_agent` rows, and a run that has participants to record must NOT name them only in the document's prose | `[integration]` |
| FR24 | A persona added to a project's `agent` table is offered by `party`, `review` and `consult` with no plugin change and no file edit | `[integration]` |
| FR24 | A vocabulary default the plugin adds after a database was created appears in it on the next server start, and a term the project added under the same name is not overwritten | `[integration]` |
| FR24 | A vocabulary default the plugin retires is retired in an existing database, and rows already referencing it stay readable | `[integration]` |
| FR24 | must NOT — an upgrade resurrects a term the project retired, because the seed comparison was made against live terms rather than against every row present | `[integration]` |
| FR24 | must NOT — a migration rewrites the `name` or `display_name` of a vocabulary row that existing rows reference, silently changing what those rows are recorded as meaning | `[unit]` |
| FR23 | Two epics under different specs may both hold sequence 1; two under the same spec may not | `[unit]` |
| FR23 | Child sequences restart at 1 per parent and never reuse a value after deletion | `[unit]` |
| FR23 | must NOT — a row carries both `number` and `sequence`, or neither, unless its kind is declared `numbering = 'none'` | `[unit]` |
| FR23 | A kind declared `numbering = 'none'` accepts a document carrying neither `number` nor `sequence` | `[unit]` |
| FR23 | must NOT — a kind declared `numbering = 'root'` accepts a row carrying `sequence`, or the reverse | `[unit]` |
| FR2 | An epic whose `parent_id` names a review is rejected, and one naming a spec is accepted | `[unit]` |
| FR2 | must NOT — a document's `parent_kind` can misdescribe the kind of the parent it points at | `[unit]` |
| FR2 | A review parents onto either a spec or an epic, both being allow-listed, and onto a runbook not at all | `[unit]` |
| FR2 | must NOT — `observation.library_doc_id` accepts a document that is not of kind `library` | `[unit]` |
| FR2 | An `adr` parents onto a spec, a brief or a discussion, and onto an epic not at all | `[unit]` |
| FR2 | A `retro` parents onto an epic, a spec or a quick record — the three sources `cpm:retro` actually accepts | `[unit]` |
| FR12 | A database at schema version *n* is migrated to *n+1* on server start with no user action | `[integration]` |
| FR14 | The integrity tool reports a deliberately orphaned row | `[integration]` |
| FR14 | Every numbered entry in the cross-row invariant register has a check in the integrity tool, and the tool has no *register-derived* check absent from the register | `[integration]` |
| FR14 | A restore ending in `PRAGMA foreign_key_check` fails loudly on a dump carrying a dangling reference, naming the row | `[integration]` |
| FR14 | A restored dump violating each register entry in turn is reported, one entry at a time, naming the rows | `[integration]` |
| FR14 | An ADR at `decision_status = 'superseded'` with no outgoing `supersedes` edge is reported (register #2) | `[unit]` |
| FR14 | A coverage row joining one spec's requirement to another spec's story criterion is reported (register #3) | `[unit]` |
| FR14 | A `coverage_story` row naming a story outside the coverage row's epic is reported (register #4) | `[unit]` |
| FR14 | A `number_sequence` row behind the highest number already allocated for its kind is reported and repairable (register #5) | `[unit]` |
| FR14 | A `builds_on` edge between two epics is reported (register #6) | `[unit]` |
| FR14 | A review scoped to a story outside the epic it reviews is reported (register #7) | `[unit]` |
| FR14 | An accepted ADR carrying zero or two `chosen` options is reported (register #8) | `[unit]` |
| FR14 | A `spec_fragment` that is not a substring of its requirement's text is reported (register #9) | `[unit]` |
| FR14 | A row referencing a vocabulary item retired before that row was written is reported (register #10) | `[unit]` |
| FR14 | A `session.superseded_by` cycle is reported (register #11) | `[unit]` |
| FR14 | A `document_milestone` row whose document and milestone belong to different specs is reported (register #12) | `[unit]` |
| FR14 | A `{{ref:}}` marker naming a deleted document is reported, naming the column and row it sits in, and a marker naming a live document is not (register #13) | `[unit]` |
| FR14 | must NOT — the integrity tool reports a violation it cannot locate, or passes a database holding one | `[integration]` |
| AD8 | No source file outside the projection renderer imports a markdown parser, and the renderer's only filesystem calls under `docs/` are writes — asserted over the module list, not over behaviour | `[integration]` |
| AD8 | must NOT — the pre-commit divergence guard (FR7) compares by parsing a generated file rather than by regenerating and diffing bytes | `[integration]` |
| AD9 | Every primary key in `sqlite_schema` is declared `TEXT`, excluding the FTS5 shadow tables, which SQLite creates with `INTEGER PRIMARY KEY` and dpm does not author | `[unit]` |
| AD9 | Ten thousand ids generated in one process are unique and sort in generation order | `[unit]` |
| AD10 | Every enum a tool declares is equal to the `CHECK` set on its column, in both directions, read from the live schema | `[unit]` |
| AD10 | Every `NOT NULL` column without a default is a required argument on its create tool, and every foreign key on the table has a corresponding argument | `[unit]` |
| AD10 | must NOT — the conformance test compares tool schemas against a second copy of the DDL rather than against `PRAGMA` output | `[unit]` |
| NFR1 | A clean clone starts the server with no compilation step | `[target]` |
| NFR2 | The server refuses to start below the Node floor with a message naming the required version | `[integration]` |
| NFR2 | A runtime whose SQLite lacks FTS5 is refused at every database open — by all four binaries, and against a database already carrying every migration — with a message naming the capability and `process.execPath` | `[integration]` |
| NFR2 | must NOT — the capability is inferred from the Node version rather than probed on the connection | `[unit]` |
| NFR3 | A full session's stdout parses as well-formed JSON-RPC with no stray output | `[integration]` |
| NFR4 | Dumping the same state repeatedly is byte-stable across runs and locales | `[integration]` |
| NFR6 | Every condition in the false-pass register below has a test asserting it blocks rather than warns, and the register has no unregistered entries | `[integration]` |
| NFR6 | Binding the same `(requirement_id, spec_fragment, story_criterion_id)` twice is rejected, and two different fragments against one criterion are both accepted | `[unit]` |
| NFR6 | must NOT — any `UNIQUE` constraint over a nullable column is relied on to reject duplicates, given SQLite's distinct-NULL semantics | `[unit]` |
| NFR6 | must NOT — `coverage` identity depends on `position`, so that display order can admit or reject a binding | `[unit]` |
| NFR6 | An update told to clear a nullable column clears it and the next read returns NULL; an update that omits the column leaves it alone | `[unit]` |
| NFR6 | must NOT — an update accepts a clear, reports success, and changes nothing, so *omitted* and *explicitly null* are indistinguishable at the tool boundary | `[unit]` |
| FR13 | For the same artefact, a read without an explicit body request returns strictly fewer bytes than one with it — asserted as a comparison between two responses, not against a fixed number | `[integration]` |
| FR13 | Every list-returning tool declares a `limit` with a default, and a caller that raises it receives the larger result | `[unit]` |
| FR13 | must NOT — a query tool returns an unbounded row set when no limit is supplied, or refuses a limit the caller raised | `[unit]` |
| FR13 | Every skill mention of a tool that withholds a body either requests the body or is recorded as not needing it, checked over the corpus against the live tool registry rather than a transcribed list | `[unit]` |
| NFR5 | Every exported tool name matches `[a-z]{3,}(_[a-z]{3,})*`, and every part after the verb is a table name, a column name, or a seeded `document_kind.kind` value — checked against the live schema, not against a hand-kept word list | `[unit]` |
| NFR5 | must NOT — an exported name carries the server's own identity as a part, which the harness prefix already supplies (FR29) | `[unit]` |
| NFR7 | Every table in `sqlite_master` is reachable through at least one read tool, asserted by comparing the table list against the tools' declared coverage | `[integration]` |
| NFR7 | A database whose schema version is ahead of the server still answers read tools rather than refusing to start | `[integration]` |

FR3's criterion is a **property of the skill corpus**, checkable by grep, and is the one place where a grep proxy is the real thing rather than a stand-in: the requirement is literally that no SQL appears in a skill file.

FR8's two-branch merge criterion — the one requiring a resolvable text conflict and a merged dump that restores — is the only test that exercises the branching story end to end, and it is the criterion most likely to be skipped for being awkward to automate. It is the one that decides whether AD3 and AD4 together actually work. **It is named rather than numbered on purpose**: an ordinal into a table is a stored number that goes stale the moment a row is inserted above it, which is FR28's argument applied to this document.

### The false-pass register

NFR6 requires that every condition capable of producing a false pass blocks rather than warns. Stated that way it is a sentiment, not a criterion — there is no set to check it against, so a suite with one such test passes as readily as a suite with ten. The set is therefore enumerated here, and NFR6's criterion is checked against this table rather than against a reading of the code.

| # | Condition | Where it would look like success | Blocked by |
|---|---|---|---|
| 1 | A binding stored twice | A roll-up counts one obligation as two, and reports higher coverage | `coverage` natural key |
| 2 | ✓ outliving the text it verified | A criterion is edited and stays green | `binding_hash` + unverify triggers |
| 3 | Search index behind the data | A query misses what was just written and returns 0 hits, not an error | FTS5 triggers |
| 4 | A hand-edit to a generated file | The edit is silently overwritten at the next render | FR7 pre-commit guard |
| 5 | Number allocation matching no row | A document is created with no number, allocation reports success | upsert allocation |
| 6 | A cycle among `gates_work` edges | Readiness returns nothing, which reads as "all done" | link-tool refusal + FR14 |
| 7 | `foreign_keys` defaulting off on a connection | Every FK in the schema becomes advisory, silently | FR2 connection setup |
| 8 | A wrong-domain taxonomy reference | A severity renders as a category and looks merely odd | domain-scoped composite FKs |
| 9 | A non-deterministic dump | Conflicts on every commit, masking the real ones | NFR4 byte-stability |
| 10 | A class inferred from a label | Correct until the first label that does not fit the pattern | `requirement.class`, required at the tool boundary |
| 11 | Coverage joining one spec's requirement to another spec's criterion | The matrix renders, rolls up, and reports a percentage — all of it wrong | cross-row register #3 |
| 12 | A document referenced as the wrong kind of document — as a parent, or as a spec, epic, review, retro or audit | Lineage and roll-up queries return a plausible tree that is not the real one | `document_kind_parent` plus composite `(id, kind)` FKs on every kind-specific reference |
| 13 | A ✓ surviving an edit to `coverage.spec_fragment` | A criterion is rewritten and stays green, exactly as #2 but through the third edit path | `coverage_unverify_on_fragment_edit` |
| 14 | A row referencing a retired vocabulary item | Retirement appears to work because existing rows survive, while new ones keep arriving | cross-row register #10 |
| 15 | A search covering `document_section` only | Text held on a child row is unreachable, and the tool reports success with an empty result — indistinguishable from "not present" | `entry_fts` over the four indexed child tables, plus FR9's trigger-completeness criterion |
| 16 | An FTS trigger absent for one indexed table | That table's rows silently never enter the index; every other table searches correctly, so the gap looks like absence of matches | FR9's criterion enumerating all three triggers per indexed table from `sqlite_schema` |
| 17 | A requirement with one of five obligations bound | Every coverage row is current and correct, and the roll-up reports the requirement covered — #1 with the sign flipped, and the reason a matching roll-up is not a complete one | `requirement.coverage_claimed_at` + its four unclaim triggers (FR26) |
| 18 | A completeness claim outliving the binding set it was made against | A fragment is added or rewritten and the requirement stays claimed, attesting to a set that no longer exists — #2 one level up | the four unclaim triggers, and the byte-identical control that proves they do not simply clear on every write |
| 19 | A `{{ref:}}` marker naming a deleted document | The projection renders a broken reference rather than failing, and no foreign key can reach inside prose to catch it | cross-row register #13, swept over every prose column |
| 20 | A `document_milestone` row pairing across specs | "Which epics are in M2" silently returns an epic from another specification | cross-row register #12 |
| 21 | A server nothing declares | Every suite passes, because each one launches the server itself; only a real session finds the tools missing | FR29's manifest criterion, asserted against the manifest rather than against a spawn |
| 22 | An update that clears a field and changes nothing | The call returns success, the caller believes the field is cleared, and the next read still returns the old value | the update tool distinguishing an *absent* argument from an *explicit* null |
| 23 | A `superseded` or `withdrawn` blocker read as satisfied | Work whose blocker was abandoned reads as ready and gets started; no query errors and nothing is empty | FR22 readiness treating only `complete` as clearing |
| 24 | A runtime without FTS5 opened against a database another binary already migrated | `schema_version` records every migration as applied, so the migration path does nothing; the server starts clean, the tool list is complete, and every read answers — only writes reaching an FTS trigger fail, in SQLite's own words, naming neither dpm nor the runtime | NFR2's capability probe, run at every open rather than when migrating |

| 25 | A skill rendering stored text from a read that withheld it | The render is well-formed and structurally complete and simply says less; a withheld column arrives as an absent field rather than an error, so the omission reads as a value nobody supplied — and an approval gate built this way returns a verdict computed over text it never saw | FR13's corpus criterion, checked against the live tool registry |

| 26 | Prose held on a column nothing indexes | The search accepts the query, ranks what it has, and returns nothing — indistinguishable from "not present", and indistinguishable from a correct empty result. #15 one level down: that entry closed *sections only* by adding a second index, and the same hole reopens per column every time the schema gains prose. An `adr.decision` or an `audit_finding.summary` is unfindable while `finding.summary` beside it answers | FR9's derived-and-reconciled indexed set, enumerated from `sqlite_schema` |

Twenty-six conditions, each with a criterion above. The register is itself the thing under test: a condition discovered later is added here first, and NFR6's second criterion fails until it has a test.

**A new condition is appended, and the number it gets is never reused.** The amendments of 2026-08-10 added the last two rows above by inserting them after #14, where they read best — and gave them 15 and 16, which two conditions already had. Numbering a register in reading order makes the number a position rather than an identity, and the number is the join key: `false-pass.test.js` resolves against this table, and so does every "entry #n" written anywhere else. So the table is ordered by when a condition was discovered, not by what it is about, and grouping is left to the prose below.

**#17 and #18 are the pair worth reading together**, because the second is what stops the first being closed on paper. A completeness claim removes the false pass only while it is current; a claim that survives its binding set changing is a green mark attesting to something that no longer exists, which is exactly #2 at the level of the set rather than the row. That is why FR26 spends four triggers rather than one column, and why its control case — an edit leaving the text byte-identical must *not* clear the claim — is a criterion and not a nicety: a trigger that clears on every write satisfies all four decay tests and makes the claim worthless.

**Where each is closed matters for where its test lives, and an earlier draft got this wrong by claiming ten of twelve were closed at the schema.** Reading the "Blocked by" column: eight are genuinely schema-level and unit-testable against a bare database (#1, #2, #3, #8, #12, #13, #15, #16 — the last two because a trigger and a virtual table are schema objects, assertable from `sqlite_schema` with no server running). The rest are not — #4 is a git hook, #5 an application statement, #7 a `PRAGMA` on a connection, #9 the dump code, #10 the tool boundary (the register's own column says so), and #6, #11 and #14 are cross-row entries closed by a write-path refusal plus an FR14 check. Eight of the sixteen therefore need the server, the hook, or the dump path in the loop, and a suite that files them all as `[unit]` is testing something else.

### Integration Boundaries

Four seams, and an importer deliberately absent:

1. **MCP tool schemas → database constraints.** A tool that accepts an argument the schema will reject has moved validation to the wrong layer. The two definitions must correspond, not merely coexist.
2. **Database state → markdown projection.** Determinism (FR6) and the divergence guard (FR7) both live here.
3. **Database state → `.sql` dump.** Byte-stability (NFR4) is the whole contract.
4. **Skill prose → the harness's tool registry.** A skill names its tools in prose; the harness dispatches on a name assembled from the plugin's server declaration and the exported name (FR29). Nothing in the language makes the two agree, and a disagreement is invisible to every test that supplies its own launch and calls the handlers directly.

There is deliberately **no importer seam**. An earlier draft listed "CPM `docs/` tree → importer" as the one place dpm parses prose by necessity. AD8 removes it: nothing in dpm reads markdown, so the component that would have inherited CPM's parsing failures — retro 21's `awk -v` collapse among them — has no counterpart here.

Seam 1 is where drift would re-enter the system if it re-entered anywhere: two descriptions of the same constraint, in two languages, maintained separately. **AD10 closes it with a conformance test** that reads the correspondence out of `PRAGMA table_info` and `PRAGMA foreign_key_list` rather than out of a second copy of the schema, and records codegen as the intended direction of travel once the tool surface is stable.

### Test Infrastructure

New. CPM's suites are bash against fixture markdown files; dpm needs a Node test setup with an in-memory or temp-file database per test, plus a fixture corpus of artefacts.

Fixtures are written against the tool surface, not parsed from markdown — AD8 means there is no import path to exercise. Each test creates entities through the MCP tools, so the fixtures and the production write path are the same code.

A real 393-artefact CPM project remains valuable as **design evidence** rather than as a test input: it shows what planning data accumulates in practice once a pipeline has been run in anger, including structure the skills never specified. Every vocabulary in this schema was corrected against it, and the schema before that check contained eight defects — one of them a false pass in the coverage subsystem (FR21).

### Unit Testing

Handled at the `cpm:do` task level — each story's acceptance criteria drive coverage during implementation.
