# The v1 registrar

**Number**: 02-01  
**Source spec**: 02  
**Status**: complete — Delivered against OpenCode v1 alone. The specification was written for a second registrar alongside v2 (FR11 records "both hosts stay supported from one codebase" as a `wont`); Chris retargeted the epic at v1 mid-run, so FR11 is contradicted by decision rather than overlooked. dpm ships two entry modules because v1's two plugin protocols cannot share one, and installs from a clone because no runtime can start its MCP server from a packaged copy.  

## Story 1 — The second SDK, typed against both hosts

**Status**: complete  
**Blocked by**: Story 5, Story 2  

### Acceptance Criteria

- `@opencode-ai/plugin-v1` resolves to `@opencode-ai/plugin@1.18.25` through an npm alias declared in `devDependencies`, and `tsc --noEmit` exits zero with both SDK versions in the type graph. `[unit]`
- `dependencies` in `package.json` is empty and both SDK entries sit under `devDependencies`. Control: a planted runtime entry fails the check. `[unit]`
- Nothing under `src/` imports a package at runtime, with the module sweep extended to recognise the aliased specifier as an SDK import. Control: a planted value import of either SDK fails the sweep. `[unit]`
- must NOT — Any invocation passes a loader flag, a transpiler flag, or any other runtime argument beyond the entry path. Control: a planted `--import` in a package script fails the check. `[unit]`
- There is no build script and no compiled artefact; `tsc --noEmit` remains a check rather than a step that produces output. Control: a planted build script fails the check. `[unit]`

### Task 1 — Add the aliased v1 SDK to devDependencies and install it

**Status**: complete  

Covers the alias declaration and the lockfile only. Nothing imports the alias in this task — the registrar that uses it is story 2.

### Task 2 — Teach the module sweep the aliased specifier

**Status**: complete — Built as the type-only recognition rule, after the task's stated premise was tested and found false — the sweep already refused a value import of either SDK by the same bare-specifier rule, with no name list to teach.  

Addresses the hole the alias opens: a sweep that only knows `@opencode-ai/plugin` would pass a runtime import of `@opencode-ai/plugin-v1`. Scope is the sweep's recognition rule, not its reporting.

### Task 3 — Write tests for The second SDK, typed against both hosts

**Status**: complete  

Covers the five criteria tagged `unit`, each with the planted control the criterion names.

### Retro

- **Erasure is a blind spot, and the second SDK is what turned it from harmless into load-bearing.** A type-only import is erased before evaluation, so every runtime check in this project is blind to it *by design* and correctly so: `staticImports` skips it, the module sweep's bare-specifier rule never receives it, and `dependencies` staying empty says nothing about it. With one SDK nothing could fall into that gap. With two published under one package name at two versions and told apart only by an npm alias, the specifier is the sole evidence of which host a module is typed against — so a registrar typed against the wrong SDK type-checks, sweeps clean, and is wrong. That is the same failure shape as epic 01-05's "23 skills registered and 0 tools": the thing advertises correctness and cannot perform it, with nothing in the interface saying so.

**The rule found two defects on its first two runs, neither of which was what it was built for.**

First run: `src/plugin/index.ts` names `@opencode-ai/schema/skill` for `Skill.Info`, and `@opencode-ai/schema` is declared nowhere. It resolves only because the v2 SDK depends on it and npm hoists it — so `tsc` has been passing on an edge no artefact in this repository asserts, and a v2 release that dropped the dependency would break the type check on a file nobody touched with nothing naming the cause. That forced the rule's set to be a *type surface* per host rather than a plugin package per host, which is the more honest model anyway. The undeclared transitive is recorded and not fixed: declaring it is a manifest decision.

Second run: the partition control between the two readings failed on `import type from './x.ts'`. `staticImports` excluded type-only imports with a lookahead containing `type\b\s*(?!from\b)`, and `\s*` **backtracks to empty** — so the inner test succeeded against a space, the exclusion fired, and a value default import bound to the name `type` was read as type-only by the one reading whose entire job is to see runtime edges. Its own doc comment claimed the opposite, in a bullet written to document exactly that case. Nothing in the tree writes the form, so it cost nothing; what matters is that the comment had been right-sounding and wrong for three epics, and the thing that found it was a control asserting a *property of the pair* — every static import is either evaluated or erased, never both and never neither — rather than another assertion about either pattern. The fix was to stop having two patterns: one match, one predicate, and the partition holds by construction instead of by two regexes agreeing.

**Carry forward: after any change to what an import *means*, the readings of the import graph need a partition control and not another example.** Retro 01 recorded that every textual sweep over import statements asserts something subtly different after such a change. This is the third epic in which that has come true, and the difference this time is that the check which caught it was written to hold two readings against each other rather than to test either one against a case somebody thought of.

- **A task described a hole that was not there and pointed at one that was, and the difference was settled by planting rather than by reading.** Task 2 said "a sweep that only knows `@opencode-ai/plugin` would pass a runtime import of `@opencode-ai/plugin-v1`". Three citations said otherwise: NFR2 asks for checkability by "the **existing** module sweep"; `scripts/module-sweep.ts` refuses every bare specifier before it attempts resolution, with no name list anywhere; and a planted tree inside the repository — so `node_modules` really would resolve — produced the identical complaint for both SDKs and none for a type-only import of the alias.

The temptation at that point is to amend the criterion and drop the task, and that would have been wrong. The clause named a mechanism that does not exist, but the task's own scope note — "the sweep's **recognition rule**, not its reporting" — described a real and unguarded property one level over: not *which specifiers may be evaluated*, which was already absolute, but *which packages may be named for their types*, which nothing checked at all. Reading the clause as the second thing kept the criterion standing, kept the task real, and closed a gap that would otherwise have been story 2's to discover.

**Worth carrying: when a criterion's stated mechanism is false, ask what the criterion would have to mean to be worth its place before proposing to remove it.** Retro 01 recorded the mirror case — a criterion naming a mechanism that was unsatisfiable, amended to the checkable property. Both times the fix was to separate the mechanism from what the mechanism was reaching for. The difference is which way it resolved, and the reason it resolved differently here is that the planting produced *evidence about what was already covered*, which made the uncovered thing visible by contrast.

**And the refactoring pass found what four passing suites were hiding from each other.** Four files each asked "does this manifest declare a script that runs at install time" with a loop of their own, and the four lists disagreed: `plugin.test.js` guarded `prepublish` and not `prepack`; `baseline`, `dependency-isolation` and `plugin-entry` guarded `prepack` and not `prepublish`, two of them omitting `build` as well. Every one of them passed, and every one was a genuine hole another was covering with nothing recording the arrangement — a `prepublish` script would have been caught by exactly one of the four. The union is now one reading with a control that plants each name in turn, driven from the list itself so a fifth copy cannot appear. This is the same shape as retro 02's six duplicate readings of the import graph, arriving through a different artefact: the duplicates were not written to disagree, they were written at different times by people who each needed the answer and none of whom could see the others.

## Story 2 — One entry, two registrars

**Status**: complete — Delivered and verified on 2026-08-31, then largely superseded the same day by Chris's decision to target OpenCode v1 alone. Four of its five criteria named a host predicate and a two-registrar dispatch that no longer exist, and stand superseded with their coverage retired. What survives is `src/plugin/registration.ts`, the recorded v1 context in `tests/support/host-contexts.js`, and criterion 5 — that registration asks the user to name no host and set no option, which the two-module arrangement still honours because both modules load unconditionally.  
**Blocked by**: Story 5, Story 3, Story 4  

### Acceptance Criteria

- A single named predicate classifies the host from the plugin context it is given, and the exported entry hands off to one of two registrars on its result. `[unit]`
- control — The predicate's test fails when given a context both branches would match and when given one neither would, so a classification that has stopped discriminating is caught rather than silently defaulting. `[unit]`
- Both registrars are given the same skill list and the same server entry, each computed by one call, rather than by two constructions that happen to agree. `[unit]`
- The predicate's identifier appears only in the registration layer and its own test. Control: a planted use elsewhere under `src/` fails the check. `[unit]`
- must NOT — Registration requires the user to name a host, choose between entry points, or set an option. Control: a planted second required argument on the exported entry fails the check. `[unit]`

### Task 1 — Extract the shared registration inputs so both hosts read one computation

**Status**: complete  

The server entry and the skill list, computed once before either registrar runs. Scope is the extraction, not either registrar's use of it.

### Task 2 — Write the host-detection predicate

**Status**: complete  

One named function over the plugin context. Addresses the classification only — what each branch then registers belongs to stories 3 and 4.

### Task 3 — Split the entry into two registrars behind the predicate

**Status**: complete  

Restructures `src/plugin/index.ts`, keeping the exported shape a host loads unchanged and the v2 behaviour identical.

### Task 4 — Write tests for One entry, two registrars

**Status**: complete  

Covers the five criteria tagged `unit`, including the both-match and neither-match control and the confinement check.

### Retro

- The story was planned against a premise the hosts disproved: that v1 and v2 differ in how they *call* a plugin. They do not. OpenCode 1.18.25 accepts a default export of `{id, setup}` and calls `setup(context)` exactly as the v2 beta does, so one unchanged export serves both and the entry needed no new shape. What differs is context capability — nine domains against twenty-two. Reading that off the SDK types would have found the opposite: `@opencode-ai/plugin-v1` types only v1's callable entry, so the protocol dpm actually uses under v1 is undocumented there, and a plan built from the types would have produced a second entry point nobody needs.

The finding that made criterion 2 buildable came from the same probes and would not have been guessed. v1's nine domains are a strict *subset* of v2's twenty-two, so no missing domain identifies v1 — absence cannot be the marker. The one domain both carry with disjoint contents is `plugin`: `{add, remove}` under v1, `{list}` under v2. That, with `mcp` being v2-only, gives each host an *independent positive* marker. Written the obvious way — v2 is "has mcp", v1 is "does not" — the two branches are one test and its negation, every context classifies as something, and the both-match case the criterion demands is unreachable. Loosening the predicate to exactly that shape was run as a deliberate red: three controls failed and the happy-path classification test still passed, which is the whole argument for the controls existing.

The probing cost far more than the building. Eight consecutive readings came back empty because `opencode2 run` hands the prompt to a shared background service started from the user's own config, so the fixture config and every `XDG_*` override were being applied to a process that was not loading the plugin. `--standalone` fixed it. A separate v1 reading was recorded as a negative when it was really a truncation — the run had been killed at a four-minute timeout before `setup` was called — and re-running it to completion reversed the conclusion. Both traps have the same shape as the lesson already in the library: an empty reading needs a control before it is believed, and the control has to be a *positive* result from the same harness.

## Story 3 — Register the MCP server under v1 through the config hook

**Status**: complete — Re-scoped twice and delivered as originally planned. Planned against FR2's `config` hook; re-scoped on 2026-08-31 to skills-without-tools when a probe suggested the hook was unreachable from the shape v2 requires; restored the same day when Chris retargeted the port at v1 alone, which removed the constraint. dpm ships two modules, one per v1 protocol. Five live criteria verified, five coverage rows marked. Criteria 1, 2 and 5 stand superseded with their reasons, and task 1's warning was implemented and reverted.  
**Blocked by**: Story 5  

### Acceptance Criteria

- Given a stub v1 plugin context, the v1 registrar's `config` hook sets `mcp.dpm` to a local-server entry whose command runs the packaged executable. `[unit]`
- The local-server entry the v1 registrar builds is identical to the one the v2 registrar builds — same command array, same environment. `[unit]`
- must NOT — Any tool is advertised under one host and not the other. Control: a planted host-conditional tool registration fails the check. `[unit]`
- must NOT — The plugin writes to the user's OpenCode configuration file. Control: the configuration files are hashed across a plugin load and compared, with a planted write proving the comparison fires. Amended by the spec 02 pivot of 2026-09-03: where the hashes differ, the difference is attributed before the criterion is judged. 1.18.25 inserts a `"$schema"` member into `opencode.json` on load, and a bare hash comparison reports the host's own write as dpm's — so the comparison locates a write and does not, on its own, say whose it was. `[integration]`
- Loading under v1 emits one warning naming the `mcp` block the user must add to their own configuration and the path to the packaged executable it should run. Control: the same load under v2 emits nothing, so the warning is proof of the v1 branch rather than of a logger that always fires. `[unit]`
- v1's `config` hook sets `mcp.dpm` to a local-server entry of type `local` whose command runs the packaged executable, and the user's own `mcp` entries survive the registration unchanged. Control: a load against an empty `mcp` block shows the reading would notice a user entry that had been dropped. `[integration]`
- The entry the hook registers is the one `localServer` builds — same type, same command array — rather than a second construction of the path that agrees today. Each load is handed its own copy, so a host mutating what it was given cannot change what the next load reads. `[unit]`
- The tools module exports a callable `server` and no default, and the skills module exports a default object and no callable `server`, so the two v1 protocols stay in two files. Control: the absence is read off the module namespace rather than through a default import, which would be a parse error rather than a failing assertion. `[unit]`

### Task 1 — Warn, under v1 only, that the tool surface must be configured by hand

**Status**: superseded — Written when story 3 was re-scoped to skills-without-tools, and undone by the v1-only retarget on 2026-08-31. It was implemented — `manualServerNotice` and a `registerV1` that reported it — and then reverted with `src/plugin/registrars.ts`, because a v1 load now registers its MCP server and the notice would be false. Replaced by task 3.  

The v1 registrar registers no MCP server and emits one warning naming the `mcp` block to add and the executable path it should run. Reads the server entry story 2 already computed, so the path in the message is the same one v2 registers rather than a second construction. Scope is the warning; the skills are story 4.

### Task 2 — Write tests for Register the MCP server under v1

**Status**: complete — `tests/v1-registrar.test.js` rewritten for the config hook — 7 tests, all passing. Also carries the two must-NOTs with their planted controls, and the module-shape check that keeps the two v1 protocols in two files.  

Covers the three `unit` criteria and the `integration` no-config-write criterion, whose control is the planted write.

### Task 3 — Register the MCP server through v1's config hook

**Status**: complete  

`src/plugin/index.ts` becomes the callable route: a named `server` export, no default, returning `Hooks.config` which sets `config.mcp.dpm` to the entry `localServer` builds. The user's own `mcp` block is spread rather than replaced, and each load is handed its own copy of the command array. `src/plugin/registration.ts` splits into `serverEntry` and `skillSources` so a skill-body failure cannot take down the MCP registration. `host.ts` and `registrars.ts` are deleted.

### Retro

- Four consecutive v1 probe readings were lost to a stale plugin cache, and every one of them read as a clean negative. v1 caches plugin loading per project under XDG_CACHE_HOME; once poisoned — by an earlier run that stalled the loader — the object-route module still *evaluates* and its `setup` is simply never called. The report therefore shows the module loading and nothing else, which is exactly the shape of a host that does not support the protocol. Two design conclusions were drawn from those readings and both were wrong: that one module cannot carry two routes was right for a different reason, and that v1 will not resolve a package specifier was never established at all. Clearing the cache directory made the same fixture produce the full reading immediately.

The rule that would have caught it: a negative reading needs a positive control in the SAME run, not merely in the same harness. The control that finally worked was a known-good path entry listed alongside the specifier under test, so one run answers both. Recorded in tests/support/host-contexts.js's re-recording notes alongside the three other traps.

- `opencode debug skill` and `opencode debug config` answer without an LLM turn, and neither was found until most of a session had been spent driving probes through `opencode run` — which loads the plugins early and then blocks on a model call that may never return. Half the lost time in this story was spent waiting on turns whose output was never needed. Neither debug command loads the object route, so `run` is still the trigger for skill registration, but the right technique is to poll the incremental report and kill the process the moment it holds what was asked for, rather than waiting for the turn.

`opencode serve` boots a headless server and does NOT load project plugins — checked, so it is not the shortcut it looks like. Plugins load per session, per directory.

## Story 4 — Register the skills under v1, fenced and alarmed

**Status**: complete — Re-scoped off `config.skills.paths` and onto `skill.transform` with embedded sources, which is typed, published, and carries the skill body rather than a path to it. Three of the four planned criteria named the undocumented key and stand superseded; four replacements were written and verified, with seven passing tests in `tests/v1-skills.test.js`. NFR3, which existed only to fence that key, has no subject left — reported at the roll-up rather than claimed.  
**Blocked by**: Story 5, 02-02 Story 4  

### Acceptance Criteria

- The v1 registrar appends the package's own skills directory to `config.skills.paths`, and discovery over that directory finds exactly twenty-three `SKILL.md` files, every one resolving to a path inside the installed package. `[unit]`
- `skills.paths` is written from exactly one module, and that module carries a marker naming the key as undocumented by OpenCode and saying what to do when it stops working. Control: a planted second write site fails the check. `[unit]`
- The post-registration check reports failure when given a host configuration that does not hold dpm's skills path, and passes when given one that does. `[unit]`
- must NOT — Registration writes anything into the user's project tree. Control: the project tree is hashed before and after a plugin load and compared, with a planted write proving the comparison fires. `[integration]`
- The skills module registers all twenty-three skills as `embedded` sources through `skill.transform`, each carrying a non-empty body and a `location` inside the installed package. Control: the source list is driven against a draft offering `source` and `list` and not `add`, so a registration written against the v2 API fails rather than passing against a double more generous than the host. `[integration]`
- Every registered skill's `name` carries the `dpm-` prefix, because `name` is the only field v1 keeps of an embedded skill and so is the whole of its keyspace. Control: the reading recognises an unprefixed name, so the empty result is a finding rather than a filter over nothing. `[unit]`
- Registering over a name another embedded source already claimed reports that name rather than shadowing it silently. Control: a draft holding no clashing name produces no report, so the notice is proof of a clash rather than of a logger that always fires. The report states its own reach: a clash behind a `directory` or `url` source is not visible at this point and the prefix is the whole of the defence there. `[unit]`
- Every `dpm/shared/*.md` reference in every registered body has been rewritten to an absolute path that exists on disk, so a session reading a skill's conventions reaches the file rather than a path that resolves against nothing. Control: a body naming a shared file that is not in the package is refused at registration rather than registered with a broken path. `[integration]`

### Task 1 — Write the single skills-path module with its unsupported marker

**Status**: superseded — There is no undocumented key to own. `config.skills.paths` is not the route: `skill.transform` takes embedded sources carrying the computed skill, which is typed and published. Replaced by task 4.  

One module owns the undocumented key, per ADR 02-03. The marker states the dependency and the recovery, not the history.

### Task 2 — Implement the post-registration check and its refusal

**Status**: superseded — The failure mode it detected does not exist on this route. A configuration key the host silently normalises away registers nothing while appearing to work; `draft.source` decodes what it is handed and throws on a shape it does not accept. The alarm that survives is a different one — FR5's clash report — and it is task 4's.  

Addresses the failure path the undocumented key creates: registration that silently does nothing. Scope is detection and the loud report, not a fallback mechanism.

### Task 3 — Write tests for Register the skills under v1, fenced and alarmed

**Status**: complete — `tests/v1-skills.test.js` — 7 tests, all passing, covering the four re-scoped criteria with their controls. Added to suite-integrity's ADDED list.  

Covers the three `unit` criteria and the `integration` no-project-write criterion, whose control is the planted write.

### Task 4 — Register the skills as embedded sources, with the prefix on name and a clash report

**Status**: complete  

`src/plugin/skills-entry.ts` is the object route: default `{id, setup}` calling `skill.transform` and handing the draft one `{type:'embedded', skill}` per discovered skill. `registration.ts` puts the `dpm-` prefix on `name` — the only field v1 keeps — which is the fence FR5 asks for and also makes the README's `dpm-*` permission rule match under v1 (FR7). Before registering, the draft is read for names already claimed by other embedded sources and any dpm is about to shadow is reported on stderr; the notice states its own reach, since a clash behind a directory or url source is not visible at that point.

### Retro

- A requirement written to fence a risk can be discharged by the risk not existing, and the record needs somewhere to say so. NFR3 is a spec `must` whose entire content is how to build safely on `config.skills.paths` — one write site, a marker naming it unsupported, a check that fails loudly when the host normalises it away. Probing found `skill.transform`, a typed and published route that carries the skill body rather than a path to it, so the undocumented key is written from nowhere. NFR3 is not met and not breached: its premise dissolved. Two of story 4's four criteria and two of its three tasks existed only to satisfy it, and were superseded rather than completed.

The same probe collapsed FR4 and ENVX2 from hard problems into non-problems — both are about a host that reads SKILL.md verbatim leaving resolveSupportingPaths nowhere to run, and an embedded source is handed the rewritten text directly. Worth carrying into the next spec: the specification was written from the SDK's published types, and the route that mattered was in the bundled v2 API the types do not describe.

## Story 5 — Verify the two entries as one installation under v1

**Status**: complete — Re-scoped onto the v1-only two-module design; both planned criteria named `skills.paths` and a v2 context and stand superseded. Four replacements written and verified. The story's own integration check found the defect four green per-story files could not: `localServer` registered the host's bun, which under v1 1.18.25 has no `node:sqlite`, so the server never started and the host blocked — taking the skills down with it. Fixed by registering `node`, which closes the packaged install (Node refuses type-stripping under `node_modules`) and makes the documented install a clone. FR6 was folded in here as task 4, since no story owned it and the install route had just changed under the epic.  
**Blocked by**: —  

### Acceptance Criteria

- One plugin load under a stub v1 context produces a configuration holding both `mcp.dpm` and dpm's `skills.paths` entry, built from the same computed inputs rather than from two independent constructions. `[integration]`
- The same exported entry loaded under a stub v2 context produces the v2 registrations and writes no `config` at all. `[integration]`
- One load of both plugin entries against the recorded v1 context produces a configuration holding `mcp.dpm` and a skill registry holding twenty-three embedded sources, with the server command and every skill location resolved from the same package root rather than from two independent constructions. `[integration]`
- The MCP command the config hook registers is one a v1 host can actually spawn: it names a runtime that carries `node:sqlite`, so the server starts and answers rather than dying on a missing built-in module while the host waits for it. `[integration]`
- control — The reading that accepts the registered command would reject the one it replaced: handed a bun runtime, the same check refuses rather than passing, so "the command is startable" is a property being measured rather than an assertion nothing could contradict. `[unit]`
- The README documents the install this epic actually delivers — both entry files named, the clone route given, and the reason the packaged route is not offered stated where a reader meets it — and every runnable block it gives is executed by the suite rather than transcribed into it. `[integration]`

### Task 1 — Write the cross-registrar integration test

**Status**: superseded — Written for one entry loaded under two host stubs. There is one host and two entries, and the integration check found a defect the test has to cover: the registered MCP command cannot start under v1. Replaced by tasks 2–4.  

Exercises one load per host stub and asserts the whole configuration each produces. Distinct from the per-story tests, which each assert one registrar's own key.

### Task 2 — Register a runtime a v1 host can actually spawn

**Status**: complete  

`localServer`'s bun branch hands the host its own binary in bun mode, on the recorded belief that bun carries `node:sqlite`. That held for v2's bun and does not hold for v1's (Bun 1.3.14): the server dies on `No such built-in module: node:sqlite` and the host blocks waiting for it. Register `node` instead, and say in the doc comment which bun the old rationale was true of.

### Task 3 — Write the cross-entry integration test

**Status**: complete  

One pass loads both entries against the recorded v1 context and asserts the whole result: `mcp.dpm` present, twenty-three embedded skill sources present, and both resolved from the same package root. Plus the startability reading and its control, which is what the per-story tests could not see — each asserted its own registrar's key and neither asked whether the command would run.

### Task 4 — Document the v1 install the epic actually delivers — FR6

**Status**: complete — Reached further than scoped. The install section was one of five places built on the packaged model — the link instructions, the shell functions, the `external_directory` permission entry, the out-of-date-guard section and the develop-DPM-itself section all named a package cache — and two test files guarded that model. All were converted; `package-cache.test.js` and its fixture became `readme-symlink.test.js` and `support/dpm-clone.js`.  

The README names `opencode2 plugin add github:ninthspace/opencode-dpm` and one entry. Under v1 that install cannot supply tools at all: v1 unpacks plugins under `node_modules`, where Node refuses to strip types. What works is a checkout with both entry paths in `plugin`. FR6 is unowned by any story and the install route changed under this epic, so it is documented here rather than left describing something that cannot work.

### Retro

- The integration story found a defect that four green per-story test files could not see, and the reason is that every one of them compared the registration to the thing that built it. `localServer` named a runtime; `v1-registrar.test.js` asserted the config hook registered what `localServer` returned; `plugin-entry.test.js` asserted the command's second element was the packaged executable. All true of any command whatever, including one that cannot start. Nothing asked whether the runtime named could run the server, and the answer under the target host was no — v1's bun is 1.3.14 and has no `node:sqlite`, where the `installed-runtime.test.js` fixture that established the bun route preferred a standalone `bun` and fell back to `opencode2`, whose bun is 1.4.0 and does. On a machine with no standalone bun, that test had been passing against the runtime of the host the epic had already dropped. The reading that closes it is one line — spawn the registered runtime and import `node:sqlite` — and it is the kind of reading a suite acquires only when something forces it, because until then the registration and the assertion are the same sentence read twice.

- A one-line change to which runtime is registered turned into a rewrite of two test files and five README sections, and the reason is worth recording: the packaged install was not a paragraph in the README, it was a model the document was built on. The link instructions globbed the package cache, the shell functions globbed it twice more, the `external_directory` permission entry named it, the out-of-date-guard section explained staleness in terms of two specifiers for one repository, and the develop-DPM-itself section rested on there being an installed release distinct from the working tree. That last one does not survive the change at all — with a checkout install the guard is the code you are editing, so a bug in the guard now blocks committing its own fix, which the README had to be made to say rather than quietly stop saying. The estimate was "update the install section"; the work was "the install route is load-bearing in six places, and two test files hold it there".

## Dependencies

- blocks → 02-04
- blocks → 02-05

## Retro Applied

- 03 · Codebase Discoveries · applied — The v1 skill registration inherits the substituted absolute path into shared/, which v2 treats as external_directory and auto-rejects. Whether v1 gates the same way is a host fact to probe rather than assume, so story 4's verification asks whether a v1 session can actually read what the registration points at, not merely that it registered.
- 03 · Complexity Underestimates · applied — This epic is a dual-form transition — one entry, two registrars — which is precisely the case where the cost lands in the apparatus that observes the change rather than in the change. Step 1 budgets for tests/support/ before the registrar itself, and any dual-host matcher is asserted against the exact set on each side so it cannot silently accept the wrong one.
- 02 · Criteria Gaps · applied — Every criterion in this epic was written before the v1 SDK was opened, which is exactly the shape retro 02 recorded. Step 1 opens the v1 SDK before planning against any criterion that names its shape, and any amendment is followed immediately by list_coverage on the requirement to find what else quotes the amended text.
- 03 · Criteria Gaps · applied — Story 4 registers the skills under v1 "fenced and alarmed", and an enumerated must-NOT is a checklist rather than a sweep. The fence is re-derived from the v1 mechanism rather than copied from the v2 prohibition list, and that is raised in Step 5 early enough to change what gets built.
- 05 · Scope Surprises · applied — Host version is now the variable the suite has never varied, exactly as install location was in epic 01-05 — where 1085 passing tests were all evidence about the checkout. Every test written this epic is asked which host it is evidence about; a v1 registrar that registers cleanly and does nothing is this epic's "23 skills, 0 tools", so probes record raw shape unfiltered rather than a filtered sample whose absence reads as a defect.
- 02 · Testing Gaps · applied — This run adds a second SDK devDependency — the same trigger that turned eleven tests red one epic ago, and every one was a duplicate reading rather than a broken property. Before adding it, grep for every reader of dependencies, devDependencies and the import graph, and migrate them in the same change rather than fixing them as they go red.
