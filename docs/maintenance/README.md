# Plugin Maintenance Reference

Development-facing records for this plugin: dependencies on external components, formats one
component writes that another parses, and coupling between parts that a change to one of them can
break.

**Vendored from the marketplace repository at the fork, carrying dpm's entries and no others.** At
v0.7.0 this file sat one level above the plugin and held records for every plugin in the
repository — `cpm`'s ralph-loop entries, the shared SessionStart hook budget, dpm's own. This is a
standalone repository and `docs/maintenance/` is inside it, so what "outside the plugin" meant then
is now the distinction the paragraph below draws: outside the skills tree, which is where the cost
is. The entries left behind are the ones about components this fork does not ship.

**Nothing here is loaded at runtime, and nothing here is referenced from a skill.** That is
the point of the file. A `SKILL.md` is read in full on every invocation of that skill, in
every project the plugin is installed in, so a record aimed at a maintainer is paid for by
every run that will never consult it. This file is the single home for that material, and
`CLAUDE.md` is the only thing that points here — see *A SKILL.md is not a change log* there
for the rule.

**Each record below is a record, not an instruction.** Where a behaviour is recorded here,
its operative counterpart lives in the skill, and the test suites assert the pair. Change
one without the other and the suite fails on the half that moved.

## Contents

- [`dpm` ↔ the harness — the MCP tool name prefix](#dpm--the-harness--the-mcp-tool-name-prefix)
- [`dpm` — FTS5 trigger names the dumper reads](#dpm--fts5-trigger-names-the-dumper-reads)
- [`dpm` — the retirement abort message the tool layer parses](#dpm--the-retirement-abort-message-the-tool-layer-parses)
- [`dpm:status` ↔ `dpm/tools/board` — the status-model reconciliation record](#dpmstatus--dpmtoolsboard--the-status-model-reconciliation-record)
- [`dpm` ↔ the harness — the plugin cache layout the neighbour check reads](#dpm--the-harness--the-plugin-cache-layout-the-neighbour-check-reads)
- [`dpm` ↔ the harness — the four files that state dpm's version](#dpm--the-harness--the-four-files-that-state-dpms-version)

---

## `dpm` ↔ the harness — the MCP tool name prefix

**The record.** A tool from a **plugin-bundled** MCP server is callable as
`mcp__plugin_<plugin-name>_<server-name>__<tool-name>`, with any character outside `A-Z`, `a-z`,
`0-9`, `_` and `-` replaced by `_`. For dpm — plugin `dpm`, server key `dpm` — that is
**`mcp__plugin_dpm_dpm__create_spec`**. The rule is the harness's, documented at
[Plugin-provided MCP servers](https://code.claude.com/docs/en/mcp#plugin-provided-mcp-servers),
and it is not the same as the `mcp__<server>__<tool>` form used by a server registered directly
with `claude mcp add`. The server also registers under the scoped name `plugin:dpm:dpm`, which is
what an `mcp_tool` hook's `server` field would take.

**Why it needs a record.** Nothing in this repository can check it. Every test that drives the
server spawns `bin/dpm-mcp.js` by path, so the suite supplies its own launch and never meets a
name the harness constructed — the same blind spot FR29's first half exists to name, applied to
FR29's second half. The corpus shipped `mcp__dpm__` in 456 places across the whole of M4 and every
suite was green, because the only oracle was a constant the corpus was read with.

**What can break it.** Renaming the plugin in `dpm/.claude-plugin/plugin.json`, or renaming the
`mcpServers` key, changes 171 tool names in one edit. Adding a second server makes the prefix
ambiguous, which is why `CALLABLE` refuses more than one rather than picking. A harness change to
the naming rule breaks every skill at once and no test in this repository would fail.

**What asserts it.** `CALLABLE` in `dpm/tests/support/skills.js` **derives** the prefix from the
manifest's `name` and its single `mcpServers` key rather than transcribing it, and every skill
sweep reads the corpus through it — so a skill left on an old prefix contributes no tool names and
fails `reachability.test.js`'s "names no tool at all". `reachability.test.js` pins the literal
`mcp__plugin_dpm_dpm__` against that derivation, the two sides differing in kind so the equality
is a claim rather than a tautology. `plugin.json`'s name and server key are asserted there too.
The literal is the transcription of an external rule, and this record is where the rule's source
is written down.

---

## `dpm` — FTS5 trigger names the dumper reads

**The record.** dpm's search indexes are maintained by triggers named for the index they
maintain: `document_fts_insert`, `document_fts_update`, `document_fts_delete`
(`dpm/src/schema/012-search.sql`), and the same pattern for `entry_fts`. **The dump filter in
`dpm/src/dump/objects.js` depends on that naming, and on those objects being triggers rather
than tables.**

SQLite creates an FTS5 index's storage as tables named `<index>_data`, `<index>_idx`,
`<index>_content`, `<index>_docsize` and `<index>_config`. A dump must exclude them — they are
the internal representation of a derived index, and committing them commits an unreadable second
copy of every indexed body. `isShadowOf` therefore excludes anything whose name starts with
`<index>_` — **scoped to `type = 'table'`**, because the project's own triggers match that same
prefix. Drop the type scope and the filter strips exactly the three triggers that rebuild the
index from the data; a restored database then holds every row, an empty index, and reports no
error. That is false-pass register entry #3 arriving out of the filter written to prevent #9.

**What can break it.** Renaming a trigger so it no longer carries the index prefix does no harm.
Naming a *real table* with the index prefix — `document_fts_notes` — silently excludes it and
loses its rows. Removing the `type === 'table'` condition breaks restore silently.

**What asserts it.** `dpm/tests/search-index.test.js` asserts the three trigger names;
`dpm/tests/dump.test.js` asserts the five shadow tables are excluded *by name and with a reason*
and that the virtual table and its triggers are kept; `dpm/tests/round-trip.test.js` asserts the
index is rebuilt from the data rather than carried. A real table caught by the prefix would fail
the no-silent-omission assertion, which names exactly what was dropped.

---

## `dpm` — the retirement abort message the tool layer parses

**The record.** `dpm/src/schema/retirement.js` generates one trigger per vocabulary reference, and
each raises exactly:

```
retired: <table>.<column>[, <table>.<column>…] references a retired <parent> row
```

**`dpm/src/tools/crud.js` parses that sentence** — for two things. It matches the shape to decide
the failure is a caller's and not the server's, and it lifts the qualified column names out so the
refusal can name the *value* the caller passed alongside the column the trigger blamed.

**Why the parsing exists at all.** `RAISE(ABORT, …)` takes a string literal; SQLite gives a trigger
no way to interpolate `NEW.<column>` into its own message. So the trigger can say which reference
was refused and can never say which item. The values are only in scope at the tool boundary, which
is where the naming is completed.

**What can break it.** Rewording the abort — including changing `retired:` to anything else, or the
`references a retired <parent> row` tail — silently costs both halves. The failure is not a wrong
message: a message the shape no longer matches falls through the translation entirely and reaches
the caller as a bare `Error` with `ERR_SQLITE_ERROR` and no `rpc` code, which the MCP boundary
renders as **Internal error**. The row is still correctly refused. The caller is told dpm broke.
That was the live behaviour until Epic 47-05 Story 6, because the translation matched only on
`constraint|FOREIGN KEY|UNIQUE|CHECK` and the abort contains none of those words.

Changing the qualified-column format — `<table>.<column>` — costs only the item naming, and does so
silently, since the enrichment degrades to an empty string rather than failing.

**What asserts it.** `dpm/tests/parity-integration.test.js`, over all four vocabularies: that the
error is a `ToolError` carrying `rpc.code === -32602` — **not** merely that a refusal happened,
which `assert.throws` satisfies against the broken state — and that its message contains the
retired item in quotes. `dpm/tests/vocabulary-tools.test.js` asserts the guards fire.

---

## `dpm:status` ↔ `dpm/tools/board` — the status-model reconciliation record

**The record.** `dpm/shared/status-model.md` is the single definition of how a dpm project's
planning state is derived (AD5), and it has two consumers: `dpm/skills/status/SKILL.md`, which
references it in prose, and `dpm/tools/board`, which implements it in code. Against the board the
reconciliation is automated in both directions — `dpm/tools/board/tests/test_contract.py`
reconciles the contract's rule names against the board's `DERIVATIONS` registry. **Against the
skill it cannot be**: the skill is prose, and no parse tells a passage that agrees with a rule from
one that never met it. This table is that second reconciliation. Every rule the contract states
carries a disposition here, and a rule with none fails a test.

| Contract rule | Disposition | What happened |
|---|---|---|
| readiness | amended in the skill | The skill's recommendation table offered `/dpm:do` without asking dpm's `ready` filter, so an epic held by a blocker was recommended as workable. The table gained a row for the epics `ready` returns and a row for held ones, and the skill gained *Readiness is asked for, not inferred from the stories*. It still does not restate `readyClause`, which is what the contract asks of both consumers. |
| blocking | amended in the skill, with a bounded omission | The same paragraph now names `list_dependency` as what identifies the blocker. **`gates_work` and `include_retired` were deliberately left out.** The skill never derives the held state — it asks `ready`, and the server has already applied the gating set — so the kinds would serve only to choose *which* edge to name. A project with a non-gating kind can therefore have the skill name an edge that holds nothing; that is a known limit, not a contradiction, and closing it means adding a `list_dependency_kind` call to Phase 1's inventory, which is a change beyond "amend where it contradicts". |
| retired blockers | conformed by delegation | The skill says nothing about a blocker whose status is `superseded` or `withdrawn`, and needs to: because it asks `ready` rather than deriving it, `readyClause`'s `blocker.status <> 'complete'` applies before the rows reach it. Recorded rather than amended — the conformance is real but invisible, and the readiness paragraph added above is what makes the delegation legible to a reader who would otherwise add the rule by hand. |
| in progress | deliberately left alone | The contract's derived value and its precedence order (`complete` → retired → `blocked` → in progress → `ready`/`pending`) are how the *board* renders an epic in a column. The skill prints a fraction and a narrative, never a state word per epic, so there is no passage for the precedence to contradict. The one place the two could disagree — an epic whose only incomplete stories are retired — the skill already handled correctly, and the board was changed to agree with it. |
| progress counts | conformed; the board was amended to match | The skill was right and the board was wrong. *Retired stories leave the count rather than joining either side of it*, and *say how many were retired alongside the fraction*, were already in Phase 1; the board counted a `withdrawn` story in the denominator forever. The board's `progress()` now excludes retired stories and carries the count, and the contract states the rule. The skill's Phase 1 `more` paragraph likewise sent the truncated-read rule into the contract and paging into the board. The skill prints no project-wide fraction, so the averaging trap the contract names cannot arise in it and no wording was added for it. |
| untraced requirements | conformed; the two shapes differ deliberately | The skill was already deriving this rule before the contract stated it — Phase 3b's **Untraced**, "no coverage rows at all", named as the load-bearing measurement and reported before the counts. Nothing in it contradicts the rule and nothing was amended. What is worth recording is the shape: `dpm:status` scopes `list_coverage` by `requirement_id` and asks once per requirement, over one spec; the board reads `list_requirement` and `list_coverage` unscoped, project-wide, and takes the set difference. The rule states the shapes are interchangeable, because otherwise the next reader finds two of them and assumes one is a bug. Two related things stay out of the skill: the contract's *untraced is a gap in the plan, not slow progress* is already Phase 3b's own wording, and the truncated-read rule the two reads are held to is the contract's preamble rule, which the skill's Phase 1 conformed to when it was written — Phase 3b's "a `limit` above its requirement count" is the raise-the-bound half of it and needed nothing. |
| candidate ordering | amended in the skill | The recommendation table's order was not the contract's: it read specs-before-epics, and its preamble said "one to three, in priority order" without saying the table's order was that order. Reordered so the first three command-carrying rows are the contract's three kinds — `epic_ready`, `spec_without_epics`, `retro_missing` — with a preamble that says so and cites the contract. The rows the contract has no kind for (`/dpm:discover` on an empty project, a session in flight, uncommitted changes) stay: they are not derived from planning rows and the contract does not claim them. The waiver rule needed nothing — *Retro-waived epics are settled* already stated it. |

**Deliberate omissions in the other direction.** The contract's *Graceful degradation* table has no
skill counterpart and wants none: `no-database`, `tool-surface-mismatch` and `server-failed` are
states of a board spawning servers across many projects, and a skill running in a project whose
tools answered it has a database by construction. The *Inputs* table's `list_dependency_kind` row
is unreferenced by the skill for the reason recorded against *blocking* above.

**Why it needs a record.** What was left alone is the half that would otherwise be lost — after the
pass, an unamended passage and an unexamined one look identical. Three of the four contradictions
this reconciliation found were the *board's*, not the skill's, which is the case a record written
as a list of skill edits cannot express at all.

**What can break it.** Adding a `###` rule to *Derivation rules* in `dpm/shared/status-model.md`
without dispositioning it here. Rewriting the amended passages in `dpm/skills/status/SKILL.md` —
the recommendation table, the readiness paragraph, Phase 1's retired-story and `more` paragraphs —
puts the skill back out of conformance with no signal, since only the rule *names* are checked
mechanically.

**What asserts it.** `dpm/tools/board/tests/test_contract.py` reconciles this table's first column
against the contract's rule headings, in both directions and over a floor, so a rule added to the
contract fails until it appears here and a disposition for a rule that no longer exists fails too.

---

## `dpm` ↔ the harness — the plugin cache layout the neighbour check reads

**The record.** `dpm/src/server/neighbour.js` assumes that an installed plugin lives in a
**version-named directory**, and that **every version of that plugin installed on the machine is a
sibling of it under one parent**. Today the harness satisfies both:
`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, so a server running from
`.../dpm/0.3.0` finds `0.4.0` beside it. The check derives its own directory from
`import.meta.url`, reads that directory's **parent**, non-recursively, once, and compares the
sibling names as versions using `parseVersion` from `src/server/node-floor.js`. It reads nothing
else — no registry, no `installed_plugins.json`, no environment variable, no network.

None of that layout is dpm's to guarantee. It is the harness's, it is undocumented as a contract,
and the whole mechanism rests on two properties of it that a reorganisation could drop
independently: that the directory is *named for the version*, and that the versions are *siblings*.

**Why it needs a record.** The failure mode when the layout changes is silence, which is the same
failure this check was built to break. A cache reorganised so that versions no longer sit side by
side produces a listing with nothing version-shaped in it, and the check answers *could not check*
— correctly, honestly, and forever, on every machine, while reporting no skew that anyone would
act on. Nothing throws and no test goes red, because every test constructs its own layout rather
than reading the real cache (ENVX2, and the reason for it). The three-state verdict is what keeps
this from being worse: could-not-check is a distinct answer from no-skew, so a reader who looks
sees that nothing was checked. But nobody looks at a diagnostic that has quietly stopped
diagnosing, which is why this is written down rather than left to the code.

**What can break it.** A harness change to where plugins are unpacked, or to how the directories
are named — a content hash instead of a version, a flat directory with the version in the filename,
one directory per marketplace-and-version pair. Also a sweep that removes older versions: the
neighbour check sees a newer release only while the older one it is running from still has a
newer *sibling*, so a cache pruned to one directory reports could-not-check. That last case is
FR8's territory — consulting the installation registry — and it is deferred, not solved.

**What asserts it.** Nothing can, and that is the point of the entry. Every test of the check
builds its own sibling directories under a temporary root, because a test that read the real cache
would pass on the author's machine for reasons unrelated to the code being correct. So the suite
proves the check reads *a* layout of this shape and can prove nothing about whether the host still
produces one. What is asserted is the honesty of the failure: `dpm/tests/neighbour.test.js` pins
that an unreadable or unrecognisable root yields could-not-check rather than no-skew, and
`dpm/tests/cross-tools.test.js` pins that the state reaches `check_integrity`'s response as a
value rather than as prose. **The layout assumption itself is checked by a person reading this.**

---

## `dpm` ↔ the harness — the four files that state dpm's version

**The record.** Releasing dpm means writing the same version into **four files by hand**, and each
is read by a different reader before any of dpm's own code runs:

| File | Read by | What it decides |
|---|---|---|
| `dpm/package.json` | dpm itself, via `pluginVersion()` | what the server announces at handshake, and what the database stamp records |
| `dpm/.claude-plugin/plugin.json` | the harness, on install | that the plugin is installable, and what it is |
| `.claude-plugin/marketplace.json` (the `dpm` entry) | the harness, on catalogue read | that the release is *findable* — which version an install resolves to |
| `README.md` (the `### DPM …` heading) | a person | which version the documentation below it describes |

`package.json` is the one dpm follows. `src/server/plugin-version.js` reads it, `src/server/mcp.js`
resolves `SERVER_INFO.version` from it at module load, and `src/server/stamp.js` writes it into the
database. **Nothing in the running server reads the other three**, and nothing derives any of the
four from another — the harness resolves the plugin before dpm exists to be asked, and the README is
read by nobody but a human.

**Why it needs a record.** There was a fourth, and it was wrong for three releases. `SERVER_INFO`
in `src/server/mcp.js` was the literal `'0.1.0'`, correct when it was written and never touched
again; by the time anyone read it `package.json` said `0.4.0`, and every session in between had been
announcing a version that had not existed for months. Nothing caught it because nothing compared it
to anything — the handshake test asserted the server's *name* and its *schema version* and stepped
over the version between them. That one is now fixed by deletion rather than by discipline: it is
read, not written, so it cannot lag.

The remaining four cannot be collapsed the same way, so they are compared instead. The failure they
produce is not a crash. A `plugin.json` left behind at a bump installs cleanly into a cache directory
named for one version while the server inside answers with another — and `neighbour.js` reads
directory names, so dpm's own skew diagnostic fires on a correct install and reports staleness that
is not there. A diagnostic that cries wolf is spent, which is a worse outcome than the silence the
whole version-skew spec was written to break.

**What can break it.** A release that edits some of the four — which is not hypothetical. The check
below was written naming three, the release later that same day bumped exactly those three, and the
README heading went out at the previous version. It is the site with no machine reader, so it is the
one a release forgets. Also a harness change to where the catalogue lives or what key names a
plugin's version in it — the reading finds the `dpm` entry by `plugins[].name` and reads `version`,
neither of which is dpm's to guarantee. And a checkout publishing `dpm/` on its own, where the
catalogue and the README are legitimately absent.

**What asserts it.** `dpm/tests/reachability.test.js` — `versionProblems()` compares all four and
two tests drive it, one against the real files and one against planted half-bumps. Two halves are
**conditional**: the catalogue and the README sit one directory above the plugin and are genuinely
absent from an installed copy, so a missing one is named with a `t.diagnostic` rather than skipped
quietly. The controls construct their own inputs, so the reading is exercised either way.

**The README binding is weaker than the other three and deliberately so.** It matches a heading with
a regex, where the others read a JSON field. A heading reworded past the pattern reports *no version
stated*, which fails rather than passes — the weakness costs a false alarm, never a false pass.

Verified by mutation on 2026-08-16: a lagging `plugin.json`, a lagging catalogue entry, and a lagging
README heading each fail the first test by name.

---
