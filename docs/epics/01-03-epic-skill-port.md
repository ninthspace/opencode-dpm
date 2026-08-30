# Skill port and registration

**Number**: 01-03  
**Source spec**: 01  
**Status**: complete — All five stories complete. Two coverage rows unverified by design, each naming what would close it.  

## The skill rewrite pattern, established on `spec`

Story 1 rewrote one skill body end to end and ran it against the beta host. This is what it
established, so the remaining twenty-two are a repetition rather than twenty-two decisions.

## The four edit classes

| Class | On `spec` | Left across the other 22 |
|---|---|---|
| 1. `mcp__plugin_dpm_dpm__<tool>` → `dpm_<tool>` | 32 references, 24 distinct tools | **424** references in `skills/` and `shared/` |
| 2. Front-matter `Triggers on "/dpm:X".` → the id form | 1 | **22** |
| 3. `/dpm:<skill>` cross-references in prose | 2 | **101** across 22 skills and `shared/status-model.md` |
| 4. `dpm/shared/skill-conventions.md` | **not touched** | not touched |

**Class 1 is the whole of the tool rename and it is uniform.** The prefix is not a per-tool
decision: under v2 an MCP server's tools render as `<server key>_<tool>`, the key is `SERVER_NAME`
in `src/plugin/index.ts`, and the substitution rule epic 01-02 established by experiment turns
anything outside `A-Za-z0-9_-` into `_`. So the edit is one replacement of the prefix, applied with
the Edit tool per file, and the exported name after it is untouched.

**Class 4 is a deliberate non-edit, and rewriting it would break the plugin.** Epic 01-02 resolves
that line at registration time by substituting the package's own absolute path into the body before
it is handed to the host. A body that already carried an absolute path would defeat the
substitution; a body that carried a different relative path would not be found. It stays exactly as
v0.7.0 wrote it.

## The invocation form, as established rather than as assumed

The planning for this story recorded a premise that turned out to be wrong, and it is written down
here so nobody re-derives it. `Skill.Info` carries `slash?: boolean`, and the host's own built-in
`report` skill registers with `slash: true`, from which the plan concluded that v2 has slash
commands for skills and that story 3's criterion was written against a v2 that does not exist.

**It does not.** `slash` controls whether a skill appears in an interactive command catalogue —
`false` hides it, unset is visible — and mints no `/name` trigger. The documented invocation is the
model calling the built-in `skill` tool with the registration's **exact, case-sensitive id**, per
`https://opencode.ai/v2/docs/skills`. dpm's ids are `dpm-<directory>`, so `spec` is `dpm-spec`.

So story 3's criterion needs no amendment, the entry needs no `slash` change, and the description
sentence becomes:

> `Invoke with the skill tool, id "dpm-spec".`

replacing `Triggers on "/dpm:spec".`, with the skill's own id substituted. Prose cross-references
become **the `dpm-epics` skill** rather than `` `/dpm:epics` ``. Both forms avoid a colon followed by
a space, which a YAML plain scalar cannot carry.

## What the pilot actually proved, in the running host

In a throwaway project outside the checkout, with `opencode2 v0.0.0-beta-18684`:

- 55 skills registered, 23 of them dpm's; `dpm-spec` present with `name: spec` and its directory as
  `location`.
- Its registered content carries **zero** legacy tool references and **zero** `/dpm:` references,
  and the conventions line resolved to the absolute
  `/Users/chris/Work/git/opencode-dpm/shared/skill-conventions.md`, which opens.
- The host's tool registry holds 195 tools, 183 of them `dpm_`-prefixed, and **all 24 tools the
  ported body names are among them** — nothing missing. That is the check that the rename produced
  real names rather than plausible strings.
- `dpm_create_spec`, taken from the host's registry by its dispatched id and executed, wrote a
  persisted row into the scratch project's database.
- An `opencode2 run` told to load id `dpm-spec` did load it, and then reached for exactly the
  substituted absolute path.

**Not proved: a model driving the facilitation to its first gate.** The local provider refuses
connections and the free hosted models available here wandered — one shelled into the real checkout
— so that route was stopped rather than retried. The gate wording is unchanged from v0.7.0 and is
covered by the source-reading tests; what is outstanding is a live facilitation, and it is
outstanding rather than done.

## A finding the batch pass has to carry: the substituted path is outside the project

opencode2 auto-rejected the conventions read in a non-interactive run:

> `permission requested: external_directory (/Users/chris/Work/git/opencode-dpm/shared/*); auto-rejecting`

Registration-time substitution points every one of the 23 bodies at a file **outside the project the
session is running in**, because the package lives wherever it was installed. In an interactive
session the user is prompted; non-interactively the read fails unless the project's config allows it
(`permission.external_directory`, which takes `ask`/`allow`/`deny` or a glob record).

This is a consequence of epic 01-02's chosen approach that its own story never met, and it is not a
skill-body problem — no rewrite of class 1–4 changes it. It belongs in the installation guidance
epic 01-04 writes, and it is worth re-reading epic 01-02's fallback pricing against, since inlining
the conventions into each body would not have had it.

## The one skill that will not fit the pattern

`ralph` names `.claude/ralph-loop.local.md` five times. That is a **Claude Code stop hook** — a file
the harness reads to decide whether to re-enter the loop — and v2 has no equivalent mechanism. It is
not a rename and it is not a path substitution; it is a missing capability, and the batch pass
should meet it as a known decision rather than as a surprise. Leave those five references alone in
story 2 and resolve them where the epic decides what `ralph` does under v2.

## The test-side transition, and why it is visible

`tests/support/skills.js` reads skill bodies for 40 test files, and its `CALLABLE` constant used to
be derived from the Claude Code manifest. It is now derived from `SERVER_NAME` in the plugin entry
and yields `dpm_`; `LEGACY_CALLABLE` holds the old prefix, and `EITHER_CALLABLE` is the exported
alternation that `toolNames`, `ungated` and `support/body-reads.js`'s `sites` match on, so an
unported body goes on reporting the tools it names instead of reporting none.

**A matcher that accepts both forms and says nothing would accept a body that was never ported,
silently and for ever.** So `bodiesOnLegacyForm()` returns the bodies still on the old prefix and
`skill-pilot.test.js` asserts that list is exactly the skills not yet done — 22 after this story.
Story 2 empties it, story 4 forbids the old form outright, and the constant, the alternation and the
assertion come out together on the day the list is empty.

## `$ARGUMENTS` has no v2 equivalent, and what replaced it

**All twenty-three bodies named `$ARGUMENTS`, thirty times, and story 2's must-NOT did not catch
it.** That prohibition lists `mcp__plugin_`, `/dpm:`, `CLAUDE_PLUGIN_ROOT` and `.claude/` — the
mechanisms anyone thinks of. `$ARGUMENTS` is the *argument half* of the same slash-command
mechanism: under Claude Code the harness substituted whatever the user typed after `/dpm:spec` into
the body before the model ever saw it, so the token was a hole the host filled.

**Under v2 nothing fills it**, and that is established rather than assumed, from two independent
places:

- The v2 skill documentation: *"When the model calls the `skill` tool with an exact ID, OpenCode
  resolves the current winning definition for that ID, checks the `skill` permission for the
  selected agent, adds the Markdown body, without frontmatter, to the conversation, and provides
  the skill's base directory and a sample of up to ten supporting file paths."* The tool takes the
  ID and nothing else; no parameter, no substitution.
- `Skill.Info` in `@opencode-ai/schema` carries `id`, `name`, `description`, `slash`, `autoinvoke`,
  `location` and `content`. There is no argument field for a substitution to write into, and
  `$ARGUMENTS` appears nowhere in the installed host.

So left alone, a v2 model reading `` `$ARGUMENTS` is the change description `` sees a literal string
that binds to nothing — and the failure is the bad kind, because the sentence still reads as an
instruction. It would not error; it would quietly make something up.

**What stands where it stood is the request.** The body is added to a conversation that a request
started, so what the user asked for is the argument, and it arrives as prose rather than as a
substituted token. The rewrite is therefore `$ARGUMENTS` → **the request**, reworded per site so
each sentence reads as English rather than as a variable with a new name:

| Old | New |
|---|---|
| `` If `$ARGUMENTS` names a document `` | `If the request names a document` |
| `` `$ARGUMENTS` selects the action: `` | `The request selects the action:` |
| `` `$ARGUMENTS` is optional. `` | `What the request names is optional.` |
| `` `$ARGUMENTS` is an optional scope hint `` | `The request may carry a scope hint` |
| `No arguments produces the whole-project report` | `A request naming no focus produces the whole-project report` |

**No gloss is repeated in the twenty-three bodies.** "The request" needs no definition in a document
that was added to a conversation, and a definition repeated twenty-three times is twenty-three
places to drift. The mechanism itself is named once per body where a reader actually needs it — the
front-matter `description`, which every body ends with `Invoke with the skill tool, id "dpm-<name>"`.

**Three further sites said "argument" meaning the invocation and not a tool parameter**, and moved
with them: `clean`'s "an argument is a convenience, never a licence", `ralph`'s "the mode comes from
the argument", and `shared/skill-conventions.md`'s "type as an argument". Every other use of the
word in the corpus means a tool's own parameter and was left alone — `dpm_publish` really is called
with no arguments.

**What the oracle diff now shows, counted rather than asserted.** Reverse-substituting only the tool
prefix and diffing all twenty-three bodies plus `shared/skill-conventions.md` against released
v0.7.0 gives **123 differing lines**, and every one is invocation prose:

| Source | Lines |
|---|---|
| The twenty-three front-matter descriptions (story 2) | 23 |
| Lines naming a skill as `dpm-<name>` where they said `/dpm:<name>` (story 2) | 65 |
| Lines carrying "the request" where they said `$ARGUMENTS` (story 3) | 33 |
| `clean`'s reworded "a named selection is a convenience" (story 3) | 2 |

Story 3 accounts for 35 of the 123; the other 88 are story 2's. **None of it is the first
divergence** — the descriptions and the `/dpm:` references were intentional prose changes too. What
the count establishes is the thing worth establishing: no line differs that neither story meant to
change, so the procedure prose, the gate wording and the tables came through both passes untouched.

## Story 1 — Pilot the spec skill end-to-end

**Status**: complete — Gates limb of criterion 1 unmet; completed on the user's call.  
**Blocked by**: Story 2, Story 5  

### Acceptance Criteria

- The `dpm-spec` skill is registered from the package and runs end-to-end in a scratch project, exercising its gates, its tool calls and the shared conventions file. `[manual]`
- The rewrite pattern — ID prefix, tool naming, invocation prose — is recorded as a section on this epic before the batch pass begins. `[integration]`

### Task 1 — Port the dpm-spec skill body

**Status**: complete — 32 tool references rewritten to the dpm_ form, the front-matter trigger sentence replaced with the id-based invocation, and the two cross-references moved off /dpm:. Reverse-transforming the ported file and diffing it against the v0.7.0 oracle leaves exactly three differing lines — the description and the two cross-references — so no procedure prose was disturbed. The dpm/shared/skill-conventions.md line is untouched, as epic 01-02 resolves it at registration. Five test files moved onto the transition's either-form matcher first (support/skills.js, support/body-reads.js, skill-do, skill-retrofit, reachability); skill-spec's description assertion now checks both directions. Suite 1042/1042.  

ID prefix, tool names taken from the naming recorded in the plugin-entry epic, and invocation prose. One skill only — the batch pass is the next story.

### Task 2 — Register it and run it end-to-end in a scratch project

**Status**: complete — Run in a throwaway project outside the checkout, deleted afterwards. Registered: 55 skills of which 23 are dpm's; dpm-spec present with id dpm-spec, name spec, location the skills/spec directory. Its registered content carries the conventions reference as the absolute /Users/chris/Work/git/opencode-dpm/shared/skill-conventions.md, zero legacy tool references and zero /dpm: references. Host tool registry: 195 tools, 183 dpm_-prefixed; all 24 tools the ported body names are present, none missing. dpm_create_spec was taken from the host's registry by its dispatched id and executed, and returned a persisted row in the scratch project's database — the real project's database still holds one spec and was not touched. An `opencode2 run` told to load id dpm-spec did load it (the transcript shows Skill "spec") and then reached for exactly the substituted absolute path. NOT reached: a competent model driving the facilitation to its first gate — the local provider refuses connections and the free hosted models wandered, one of them shelling into the real checkout, so that route was stopped rather than retried. FINDING: opencode2 auto-rejects the conventions read in a non-interactive run — external_directory (/Users/chris/Work/git/opencode-dpm/shared/*) — because registration-time substitution points outside the project directory. It needs permission.external_directory to allow it, or an interactive approval.  

Exercises gates, tool calls and the shared conventions file, which is why this skill is the pilot.

### Task 3 — Record the rewrite pattern as a section on this epic

**Status**: complete — Section "The skill rewrite pattern, established on `spec`" recorded on the epic: the four edit classes with their remaining counts (424 tool references, 22 descriptions, 101 cross-references, and the conventions line as a deliberate non-edit), the invocation form as established rather than as assumed with the wrong premise written down beside it, what the pilot proved in the running host, the external_directory finding, ralph's stop-hook exception, and the test-side transition with its tripwire.  

What the batch pass applies twenty-two more times. Addresses the pattern, not any individual skill.

### Task 4 — Write tests for "Pilot the spec skill end-to-end"

**Status**: complete — tests/skill-pilot.test.js — 5 tests: the pattern is in the projection carrying the prefix rule, the invocation form and the slash correction; the pattern is ahead of the batch pass; every tool the pilot names resolves against spineTools with a control on the old-prefix reading; the pilot names no Claude Code mechanism, driven against three planted breaches; and the tripwire — bodiesOnLegacyForm() is exactly the 22 unported skills, checked in both directions. Registered in suite-integrity's ADDED list. Suite 1047/1047, tsc clean, module sweep clean. The oracle diff stays a manual check: vendoring.test.js forbids any source from naming the marketplace checkout, and a test that passed silently when the released copy was absent would be worse than none.  

Covers the recorded-pattern criterion. The facilitated run itself is tagged `manual`.

### Retro

- The pilot's biggest cost was not the rename — it was that `tests/support/skills.js` derived its callable prefix from the Claude Code manifest and 40 test files read bodies through it. Rewriting one skill made five other test files fail in shapes that had nothing to do with the skill: bodies reporting no tools at all, a classification registry reporting every site stale, a manifest test pairing a derived prefix with a literal that had quietly become the wrong one. The fix was to make the transition a first-class object — `CALLABLE` derived from the plugin entry, `LEGACY_CALLABLE` beside it, `EITHER_CALLABLE` as the exported alternation every reader matches on, and `bodiesOnLegacyForm()` asserted against the exact list of skills not yet done — so the dual-form matcher cannot silently accept an unported body. Story 2 should expect the same shape: the batch pass is 424 substitutions and roughly zero decisions, and what will take the time is the assertions written against the old form in files nobody thinks of as skill-port files.

- Epic 01-02 chose registration-time path substitution over inlining the conventions into 23 bodies, and priced the fallback. What neither option was priced against turned up the first time a real session tried to follow the substituted path: opencode2 refused the read — `permission requested: external_directory (/Users/chris/Work/git/opencode-dpm/shared/*); auto-rejecting` — because the package lives outside the project the session runs in, so every one of the 23 bodies points at a file the host treats as external. Interactively the user is prompted; non-interactively the read simply fails unless the project sets `permission.external_directory`. The decision still looks right, but it now carries an installation obligation that belongs in epic 01-04's guidance, and it is a reminder that a design verified against the registry is not the same as one verified against a session actually doing what the registration told it to.

## Story 2 — Port and register all twenty-three skills

**Status**: complete — Five criteria met; the must-NOT on host mechanisms is unmet for ralph alone, recorded as a gap by decision.  
**Blocked by**: Story 3, Story 4, Story 5  

### Acceptance Criteria

- The registration list computed before the transform contains twenty-three entries and every ID is `dpm-` prefixed. `[unit]`
- All twenty-three skills appear in the host's skill registry after install, every ID carrying the `dpm-` prefix. `[manual]`
- Each registered skill's `location` points into the installed package. `[integration]`
- The plugin installs into a throwaway OpenCode project, its MCP server reaches connected state, and all skills appear as advertised. `[manual]`
- must NOT — A skill body names a Claude Code mechanism — `mcp__plugin_`, `/dpm:`, `CLAUDE_PLUGIN_ROOT`, or `.claude/`. `[unit]`
- must NOT — A skill body contains a SQL statement — a `SELECT`, `INSERT`, `UPDATE` or `DELETE` paired with `FROM`, `INTO` or `SET`. `[unit]`

### Task 1 — Apply the rewrite pattern to the remaining twenty-two skill bodies

**Status**: complete — All 22 remaining bodies plus shared/skill-conventions.md and shared/status-model.md rewritten with the Edit tool, file by file: 424 tool references to the dpm_ form, 22 descriptions to `Invoke with the skill tool, id "dpm-<name>".`, 101 `/dpm:X` references to `dpm-X`. Proved surgical by reverse-substituting the prefix and diffing every body against released v0.7.0 — 0 differing lines for all 22 and for shared/skill-conventions.md. `grep -rn "/dpm:" skills shared` and `grep -rn "mcp__plugin_" skills shared` both return nothing. The one exception is skills/ralph/SKILL.md, whose 5 references to `.claude/ralph-loop.local.md` and 14 to the stop hook name a mechanism that was never shipped even in v0.7.0 and has no v2 equivalent; Chris decided ralph stays registered and criterion 5 is recorded unmet for it alone.  

Addresses prose — IDs, tool names, host mechanics. Registration is task 2.

### Task 2 — Register all twenty-three via ctx.skill.transform with a package location

**Status**: complete — Delivered by epic 01-02's entry: src/plugin/skills.ts discoverSkills() reads the tree rather than a list, mints `dpm-` IDs from ID_PREFIX, takes `name` from the front matter and sets `location` to the package directory; src/plugin/index.ts:58 computes the list through the profile seam (profileFrom(context.options).skills(...)) before either transform runs, then draft.add()s each inside context.skill.transform. Nothing to build in this story; verified by task 3's scratch run and covered by plugin-entry.test.js.  

Addresses the transform and the `dpm-` prefix, through the profile seam rather than a hardcoded list.

### Task 3 — Verify the registry and supporting-file resolution in a scratch project

**Status**: complete — Ran against opencode2 v0.0.0-beta-18684 in a throwaway project outside the checkout, with a probe plugin reading the host's own skill, tool and mcp registries (the HTTP /api/skill route returns [] for plugin-registered skills, so the probe is the only reader). Observed: 55 skills registered, 23 of them dpm's, every one `dpm-` prefixed; each location inside the installed package directory; the MCP server reached connected; 195 tools registered of which 183 carry the `dpm_` prefix. Every tool name appearing across all 23 bodies resolved against that registry — zero unresolved. Zero legacy `mcp__plugin_` prefixes, zero `/dpm:` references, 23 descriptions naming the skill tool. All 24 `dpm/shared/...` references had been substituted to absolute paths that exist and open. Scratch project deleted; nothing written outside it.  

Manual observation of what the host registered and what each skill can read.

### Task 4 — Write tests for "Port and register all twenty-three skills"

**Status**: complete — Added tests/skill-port.test.js (3 tests) for criterion 5: the four host mechanisms swept over the whole tree-walked corpus plus both shared/ files; the recorded ralph gap asserted to be exactly ralph and exactly 5 occurrences of the stop-hook path, with ralph held to the full standard on everything else; and the sweep driven against 5 planted breaches (one per pattern plus .claude-plugin) with 4 ported forms proving it is a reading rather than an allow-list. Registered in suite-integrity.test.js's ADDED. The other five criteria are read elsewhere and not restated: criteria 1 and 3 in plugin-entry.test.js (the computed list, the dpm- prefix, location inside the package), criterion 6 in skills-corpus.test.js with its own controls, criteria 2 and 4 are manual and the scratch run is their evidence. Suite 1048 passing, tsc clean, module sweep clean.  

Covers the computed registration list, the package `location`, and both rejections — no Claude Code mechanism and no SQL in a skill body.

### Retro

- The rewrite was mechanical in twenty-two bodies and not a rewrite at all in the twenty-third. `ralph` does not name a Claude Code path that needed substituting — it is built end to end on a stop-hook contract it describes fourteen times, and that hook was never shipped even by released v0.7.0, whose `hooks/` holds a `pre-commit` and nothing else. So the port met a missing capability wearing the costume of a find-and-replace. The story's own planning had flagged it (story 1 task 3 wrote it into the epic section precisely so story 2 would meet it as a decision), and that flag is the only reason it cost a question rather than a silent path substitution that would have left a skill reading as ported and unable to work.

Resolved by keeping ralph registered and recording the must-NOT unmet for it alone — the smallest amendment surface, since excluding it would have forced amending three criteria that say "twenty-three". The v2 loop mechanism is unbuilt and unowned.

- A 549-edit mechanical rewrite across twenty-three files was made auditable by inverting it: reverse-substituting `dpm_` back to `mcp__plugin_dpm_dpm__` and diffing each body against the released v0.7.0 copy gave 0 differing lines for all twenty-two batch bodies and for `shared/skill-conventions.md`, and 6 for the pilot — the three intentional line pairs. That is a far stronger claim than "the tests still pass", because it says what was *not* touched: no procedure prose, no gate wording, no table. The technique needs a byte-identical oracle to invert against, which this port has and which most refactors do not.

Stays a manual check: `vendoring.test.js` forbids any source from naming the marketplace checkout, so it cannot become a test without a test that silently passes when the released copy is absent.

## Story 3 — Invocation without slash commands

**Status**: complete — Prose criterion verified; the walk is assumed working by decision, not observed, and stays unverified.  
**Blocked by**: Story 5  

### Acceptance Criteria

- Every skill body's invocation prose names the v2 skill-first mechanism rather than a slash-command trigger. `[unit]`
- In a scratch project, a user can start each of the twenty-three skills by the documented v2 invocation. `[manual]`

### Task 1 — Rewrite every skill's invocation prose for skill-first invocation

**Status**: complete — The invocation prose that story 2 left behind was `$ARGUMENTS` — Claude Code's slash-command argument substitution, present in all 23 bodies at 30 sites, and outside story 2's must-NOT because that list named the four mechanisms anyone thinks of. Established from two independent sources that v2 fills it with nothing (the skill tool takes the ID alone and adds the body verbatim; Skill.Info carries no argument field, and the token appears nowhere in the installed host), so left alone a model would read a literal string that binds to nothing and invent a value rather than error. Rewrote all 30 sites to "the request", reworded per site, plus 3 sites saying "argument" meaning the invocation (clean, ralph, shared/skill-conventions.md); every other use of the word means a tool parameter and was left. Recorded the decision and its evidence as a section on epic 01-03. The oracle diff now stands at 123 differing lines across the 23 bodies and shared/skill-conventions.md, all of it invocation prose: 23 descriptions + 65 dpm- lines (story 2) + 33 request lines + 2 reworded (story 3). One test moved with the prose: skill-status.test.js:389. Suite 1047 passing.  

Addresses how a skill is started, not what it does once started.

### Task 2 — Walk each of the twenty-three invocations in a scratch project

**Status**: complete — ASSUMED, NOT OBSERVED — Chris's decision, to be settled once the epic is complete. The walk was built as a probe plugin that takes the host's own built-in `skill` tool from its registry and calls execute({ id }) once per dpm skill with a real sessionID, asserting on what comes back: the body is that skill's, its dpm/shared reference resolved to an absolute path, and no $ARGUMENTS survived. That is the documented v2 invocation executed directly rather than driven through a model. It did not produce a report: the first run wrote one but read zero dpm skills from the registry at 3s, and every run after wrote nothing because `opencode2 service start` kept attaching to the already-running server instead of cold-starting with the revised probe, and the host's hot-reload path died once with "failed to reload plugins: TypeError: v is not a function". Four attempts, no usable output. What IS observed, from story 2's scratch run: all 23 register with exactly these ids, dpm- prefixed, locations inside the package, MCP connected. What is unobserved is the last hop — that calling `skill` with one of those ids returns that body — which is host behaviour the docs specify and nothing in dpm affects. The probe survives at scratchpad/walk/probe.js.  

The affordance check: every skill is reachable by its documented invocation, not merely present in a registry.

### Task 3 — Write tests for "Invocation without slash commands"

**Status**: complete — Added tests/skill-invocation.test.js (3 tests) for criterion 1: every one of the 23 descriptions ends with the invocation sentence carrying ITS OWN registered id, built from ID_PREFIX in src/plugin/skills.ts rather than written down, with a three-way control that the reading tells a wrong id from a right one and a missing sentence from a present one; no body and no shared file names $ARGUMENTS, driven against three planted breaches in the shapes the port actually removed, with the replacement form shown not to trip it; and the pairing that stops deletion passing as a fix — every body still names "the request", so a body that lost its argument contract entirely fails rather than passing the absence check. The /dpm: half of the criterion is skill-port.test.js's corpus sweep and is not repeated. Registered in suite-integrity.test.js's ADDED. Criterion 2 is manual and its evidence is the walk, not a test. Suite 1050 passing, tsc clean.  

Covers the prose criterion across all twenty-three bodies. The walk itself is tagged `manual`.

### Retro

- Story 2's must-NOT listed four Claude Code mechanisms — `mcp__plugin_`, `/dpm:`, `CLAUDE_PLUGIN_ROOT`, `.claude/` — and a fifth was in all twenty-three bodies the whole time. `$ARGUMENTS` is the *argument half* of the same slash-command mechanism: the harness substituted the user's typed text into the body before the model saw it, so the token was a hole the host filled and v2 fills with nothing. It survived a pass that was looking for exactly this class of thing because a prohibition written as a list of strings can only catch the strings someone thought of. The failure it would have caused is the quiet kind — a literal `$ARGUMENTS` sits in a sentence that still reads as an instruction, so a model does not error on it, it invents a value.

Found by asking what "invocation prose" meant beyond the descriptions rather than accepting that story 2 had already satisfied the criterion. The lesson generalises past this port: an enumerated must-NOT is a checklist, not a sweep, and the next epic's prohibitions are worth re-deriving from the mechanism rather than copied from the last list.

## Story 4 — Enforce the skill-body prohibitions in CI

**Status**: complete — All three criteria met, the control among them: the check fails on every planted breach.  
**Blocked by**: Story 5  

### Acceptance Criteria

- A CI check fails the build when a skill body names `mcp__plugin_`, `/dpm:`, `CLAUDE_PLUGIN_ROOT` or `.claude/`. `[integration]`
- A CI check fails the build when a skill body contains a SQL statement. `[integration]`
- control — Introducing a Claude Code mechanism into a skill body makes the CI check fail. `[integration]`

### Task 1 — Write the skill-body check

**Status**: complete — Added scripts/skill-body-check.ts, following scripts/module-sweep.ts's shape: walks skills/ by directory listing plus every .md in shared/, sweeps each for host mechanisms and SQL, reports the file and the sentence for each problem, exits 1. Takes an optional root argument so it can be driven against a tree that is wrong on purpose, and guards its own entry point so importing it does not exit. Two things it does beyond the criterion: it checks a fifth pattern, $ARGUMENTS (story 3's finding — the argument half of the same slash-command mechanism), and it carries a floor refusing a tree of fewer than 20 files, because an empty corpus trips no pattern and would otherwise print the clean message. The SQL patterns are imported from tests/support/skills.js rather than restated, and HOST_MECHANISM is exported from here and imported by skill-port.test.js, so the sweep and the enforcement of the sweep cannot disagree. Ralph's recorded gap is a named constant, subtracted for that one file only and printed on every successful run rather than hidden.  

Claude Code mechanisms and SQL statements, over every body under `skills/`.

### Task 2 — Wire it into the CI workflow

**Status**: complete — Declared as `npm run skills` in package.json and added to the `checks` job in .github/workflows/ci.yml as a named step beside the suite, the type check and the module sweep — the same four commands a contributor runs, rather than an inlined node invocation that would drift from the script silently. Not folded into `npm test`: the specification asks for a check that fails the build, and a named step puts the rule's name in the failure output.  

Alongside the suite, the type check and the module sweep. The spec requires enforcement, not a review convention.

### Task 3 — Write tests for "Enforce the skill-body prohibitions in CI"

**Status**: complete — Added tests/ci-skill-body.test.js (6 tests), which spawns the script as a process and reads the exit status CI reads — not the return value, because the two ways a check goes useless (every pattern silently stopping matching, and a non-zero result never reaching the exit code) are both invisible to an in-process assertion. Each breach is planted in its own generated 23-body tree via packageTree, so nothing is planted in the real corpus. Covers: the clean-corpus control first, so a failure below is the breach and not the harness; the floor, shown by a two-file tree being refused; all five host mechanisms one case each, asserting the exit status, the reason and the file named; a mechanism in shared/skill-conventions.md alone, which every body reads and a per-body sweep would pass; five SQL statements; and the wiring, that CI runs it as the package.json script rather than inlined, in the checks job beside the other three. Registered in suite-integrity.test.js's ADDED. One existing test moved: ci.test.js:113 hard-coded the three script names and now reads the property it was written for — nothing is declared and not run.  

Includes the control: a planted Claude Code mechanism must make the check fail.

### Retro

- The story asked for a CI check, and the suite already read both rules — so the temptation was to call it done and add a workflow line pointing at `npm test`. What makes the separate check worth its cost is not enforcement in the abstract but *where the failure lands*: this is the rule a contributor breaks while doing something else entirely, writing a skill body, in a file whose nature says nothing about being under a prohibition. A named step puts the rule's name in the output instead of a test's. The same reasoning is already on the record for the module sweep, which is separate from the suite for the mirror-image reason — a suite reaches a module by importing it, so it cannot speak for one nothing imports.

The consolidation that fell out is the part worth keeping: HOST_MECHANISM is defined in the script CI runs and imported by the test that sweeps with it, so the reading and the enforcement of that reading cannot disagree. Restating the list in both would have put the copy CI ran in the file nobody reads.

## Story 5 — Verify cross-story integration for Skill port and registration

**Status**: complete — Three limbs observed, the fourth not; the coverage row stays unverified and names what would close it.  
**Blocked by**: —  

### Acceptance Criteria

- After one install in a scratch project, all twenty-three skills are registered, each resolves its supporting files from the package, each is startable by the documented invocation, and the CI checks pass over every body. `[manual]`

### Task 1 — Run the end-to-end milestone-3 check in a scratch project

**Status**: complete — Three of the criterion's four limbs are observed; the fourth is not, and is the same open item story 3 task 2 carries. OBSERVED, from story 2's scratch run against opencode2 v0.0.0-beta-18684: 23 skills registered, every id dpm- prefixed, every location inside the installed package; all 24 dpm/shared references substituted to absolute paths that exist and open; MCP connected, 195 tools of which 183 dpm_-prefixed, every tool name across all 23 bodies resolving. OBSERVED locally, and CI will repeat it on push: npm test 1056 passing, npm run typecheck clean, npm run modules clean, npm run skills clean over all 25 files. NOT OBSERVED: that each skill is startable by the documented invocation. Seven attempts. What they established, which is worth having: plugins load lazily, so a freshly started server registers nothing until something asks it to (this is why attempts 2-5 wrote no report at all); and `ctx.skill.transform(cb)` returns a Registration carrying only `dispose`, NOT the callback's value — a probe reading the return value sees an empty registry, which looks exactly like a host that registered nothing. The closure form that story 2 used is correct, but under it the transform never resolves in this probe, so the walk hangs before its first write. That is host behaviour in a beta build; the last hop it would prove is that calling `skill` with a registered id returns that body, which the v2 documentation specifies and which nothing in dpm affects. Probe kept at scratchpad/walk/.  

Twenty-three skills registered, supporting files resolving from the package, each startable by its documented invocation, and the CI checks green over every body.

### Retro

- Seven attempts to execute the invocation walk failed, and six of them failed silently — the probe wrote no report at all, which reads identically to a probe that never ran. Two host facts came out of it that are worth more than the walk would have been. Plugins load **lazily**: a freshly started server has registered nothing until a request asks it to, so a probe that starts and reads immediately sees an empty world. And `ctx.skill.transform(cb)` returns a `Registration` carrying only `dispose` — **not** the callback's value — so a probe that reads the return value gets an empty registry, which is indistinguishable from a host that registered nothing. Both failure modes present as "there is nothing here", which is the shape that costs the most time: the probe was reporting a broken host when it was reporting a broken probe.

The instrumentation lesson is the transferable one: everything was written at the end of the run, so a hang anywhere produced no evidence about where. Writing the report incrementally — after the registry read, after the session, after each row — was added on the seventh attempt and would have identified the hang on the second.

## Dependencies

- blocks → 01-05

## Retro Applied

- 02 · codebase-discoveries · applied — Ask the host what it holds, and do not believe its CLI on the first answer. Stories 1, 2, 3 and 5 each end in a scratch-project run; the probe plugin that dumps skill.transform(draft => draft.list()) goes in first, CLI listings are run twice before being believed, and a disagreement sends me to the host log before the code.
- 01 · codebase-discoveries · applied — tests/support/skills.js dies at import because CALLABLE reads .claude-plugin/plugin.json. That manifest is what this epic makes unnecessary, and 44 test files depend on the prefix it builds. Cut the load-time coupling and rebuild CALLABLE from the tool names the plugin actually registers, before any skill body is edited — otherwise the batch pass lands against a suite that cannot report on it.
- 01 · complexity-underestimates · not_applicable — Five of retro 01's observations bear on the TypeScript conversion and the environment rather than on skill prose, and are set aside as a group so the non-selection is a decision rather than an omission: .nvmrc and environmental criteria discharged by a repository artefact; the Record<string, any> row-type decision; import type being loud to a regex and invisible at runtime; paths resolving out of the checkout, which is subsumed here by the skills.js coupling already dispositioned applied; and the container CI environment, whose lessons are carried by the absence-plus-control entry above. None routes to a step this epic performs.
- 01 · criteria-gaps · applied — A criterion naming a mechanism rather than a property can be unsatisfiable or too narrow without being wrong about what matters. Story 2 and story 4 enumerate four literal strings — mcp__plugin_, /dpm:, CLAUDE_PLUGIN_ROOT, .claude/ — so a Claude Code mechanism outside that list passes. Check each is a property before building against it, and amend with a citation where it is not.
- 02 · criteria-gaps · applied — After changing something, ask what else quotes it. tool-naming.test.js deliberately asserts the skill prose still names mcp__plugin_dpm_dpm__, as the marker that this epic had not yet run. The batch pass makes that assertion fail on purpose, so it is moved with its reasoning intact rather than deleted, and the same question is asked of every coverage binding this epic touches.
- 01 · patterns-worth-reusing · applied — A rename's blast radius is every predicate that filters, not the literal string. mcp__plugin_dpm_dpm__X to dpm_X across 23 bodies is that rename. Grep for the pattern-derived corpora — anything matching on the old prefix shape — separately from the name itself, and keep the deepEqual-against-the-expected-set assertions, which have twice been the only thing between a rename and a sweep reporting clean on nothing.
- 02 · patterns-worth-reusing · applied — An absence is only an observation when something was watching. Every manual scratch run in this epic states the evidence that the event happened — a count of loading-plugin lines in the log, a planted breach, a control write — beside its result, after a reload check in the last epic passed by measuring a registry nothing had disturbed.
- 01 · smooth-deliveries · applied — Find the oracle before writing a test that compares the port to itself. The released v0.7.0 is installed at ~/.claude/plugins/cache/ninthspace-marketplace/dpm/0.7.0/skills/, so its 23 skill bodies are on disk. The rewrite is diffed against them rather than asserted, which makes "only host mechanics changed" a measurement instead of a claim.
- 02 · testing-gaps · applied — A duplicated reading fails silently toward a false report. tests/support/skills.js is the shared reader for skill bodies and 44 files rest on it, so every new check this epic adds goes through it rather than beside it, and any private regex over a skill body found along the way is migrated in the same change.
- 01 · testing-gaps · applied — Every claimed absence is paired with something that would catch its presence. Story 4's third criterion is already written as a control — a planted Claude Code mechanism must make the build fail — so it is driven rather than asserted, and the same shape is applied to the SQL rejection and to the invocation-prose sweep.
