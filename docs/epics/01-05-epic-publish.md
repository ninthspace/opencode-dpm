# Publish and release verification

**Number**: 01-05  
**Source spec**: 01  
**Status**: complete  

## Why this epic no longer publishes to npm

A change moment, resolved by the user at the start of the run rather than at verification.

**The epic was written to publish `opencode-dpm@0.1.0` to the npm registry, and the specification does not ask for that yet.** FR1 reads: *"`opencode2 plugin add github:ninthspace/opencode-dpm` — **and later** the npm form — yields a working DPM."* The GitHub specifier is the primary route in the requirement's own sentence, and *later* is doing work in it. Epic 01-04 story 2 already ran that command against the real remote and established where the package lands, so the route the requirement names first is the one that exists and is verified. This epic was treating *later* as *now*.

**What the registry would have bought, stated so the deferral is a decision and not a dismissal.** A git specifier carries no version — which is exactly why OpenCode names the cache directory after a sha256 of the specifier *string*, and why epic 01-04's symlink instruction had to abandon `sort -V` for modification-time ordering. On npm, `opencode-dpm@^0.1` resolves, an upgrade is a resolvable thing rather than whatever the branch says today, and the install line is shorter. Those are real, and they are what FR1's *later* is reserving.

**What it would have cost, which is why the decision is the user's and not the run's.** The name is claimed permanently on the first publish, 0.1.0 is immutable and unpublishable after seventy-two hours, and a second distribution channel is a second thing to keep in step — a stale npm copy is worse for a user than no npm copy. None of that is reversible by a later story.

**So the epic keeps its shape and changes its artefact.** Story 1 still settles what the package contains; stories 2 and 3 still verify an install and the production restrictions. What changes is which artefact they verify: the package OpenCode builds from the GitHub specifier, rather than a tarball on a registry. The verification value is unchanged, because the thing being verified is the one users actually install.

**FR1 is not amended.** The requirement already says what this run is now doing, and a pivot that had to weaken a requirement would be a different conversation. Two coverage rows quoted the fragment *"and later the npm form"* and are withdrawn rather than re-pointed — one of them was bound to story 2's must-NOT, a criterion about not verifying from the working tree, which was never about npm at all.

**The finding that stands either way, and is the reason task 1 was worth doing before this came up.** The package OpenCode installed from the GitHub specifier in epic 01-04 was **418 files and 6.4 MB**: the whole repository, including `docs/` (this project's planning corpus), `tests/`, `scripts/`, `.dpm/` with the database dump, and `.claude-plugin/plugin.json`, a manifest addressed to a different host. The `files` allow-list settled in task 1 describes 166 files and 1.15 MB. Whether OpenCode's installer honours `files` is unproven — that install predates the field — and it is now story 2's first question rather than an assumption.

## The installed package could not run its own MCP server

Found by story 2 task 1, doing the thing the story exists to do: installing by the documented command and reading what the host then holds. **Fixed in the same task**; the finding is kept in full because the defect shipped past 1085 green tests and the reason it did is the part worth keeping.

**What was run.** `opencode2 plugin add github:ninthspace/opencode-dpm` in a fully isolated XDG environment; then a private server (`opencode2 --standalone --prompt …`) in a fresh project, with a probe plugin beside dpm in the same global configuration the installer wrote.

**What worked.** The host log records `loading plugin id=github:ninthspace/opencode-dpm entrypoint=file://…/node_modules/opencode-dpm/src/plugin/index.ts` — the installed copy, not the working tree. The probe read the registry back: **23 dpm skills of 55 total**, every `location` resolving inside the installed package.

**What failed.**

    level=WARN message="mcp connect failed" server=dpm
      status.status=failed status.error="MCP error -32000: Connection closed"

and in the interface, *MCP server failed: dpm — 1 MCP failed*.

**The cause, established directly rather than inferred.** `localServer()` registered `['node', <root>/bin/dpm-mcp.ts]`. Running exactly that command by hand against the installed copy:

    Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]: Stripping types is currently
    unsupported for files under node_modules, for ".../node_modules/opencode-dpm/bin/dpm-mcp.ts"

**Node refuses to strip types from any `.ts` file underneath a `node_modules` directory.** It is a deliberate policy rather than a bug, and the checks below close off the obvious escapes:

- **Not a Node 22 artefact.** The same error on 22.18.0 and on 24.20.0.
- **Not the file.** The identical tree copied *outside* `node_modules` runs the same command with no error at all. The only difference is the path.
- **Not reachable by a flag.** `--experimental-strip-types`, `--experimental-transform-types` and `--no-experimental-detect-module` each produce the same refusal.
- **Not avoidable by installing elsewhere.** OpenCode's package cache is `$XDG_CACHE_HOME/opencode/packages/git-<digest>/node_modules/<name>/`. Every install of every plugin is under a `node_modules`.

**Why the plugin loaded and the server did not.** OpenCode loads plugin entrypoints with the bun runtime compiled into `opencode2`, which reads TypeScript from anywhere. The MCP server is a *spawned subprocess*, and the thing spawned was `node`. The two halves of dpm were being loaded by two different runtimes, and only one of them was subject to the restriction.

## The fix, and why it costs NFR2 nothing

**The host's own runtime is spawned instead**, and it is detected rather than assumed. A bun-compiled standalone executable behaves as the bun CLI when `BUN_BE_BUN=1` is set, `process.execPath` inside the plugin names that binary, and `Mcp.LocalConfig` already carries an `environment` map. So `localServer()` now returns `[process.execPath, <root>/bin/dpm-mcp.ts]` with `BUN_BE_BUN=1` when `process.versions.bun` is set, and the previous `['node', …]` when it is not.

**No build step, no artefact, no dependency.** What is spawned is still one runtime and one `.ts` source with nothing between them. The change is *which* runtime, so NFR2 — "No build step. TypeScript throughout, restricted to erasable syntax so Node runs the sources directly" — reads as it always did, with the sources now genuinely run directly in the artefact rather than only in the checkout. Two facts make it work and both were measured in the host rather than reasoned about: bun reads `.ts` from inside `node_modules`, and bun carries `node:sqlite`, which is the one built-in the server cannot do without.

**Verified end to end against the installed copy.** With the fix in place at the cache path, the same standalone run reports:

    level=INFO message="mcp connected" server=dpm tools=183

the interface shows `⊙ 1 MCP` where it showed *1 MCP failed*, and the probe reads 195 tools where it read 12. The registered command in the host's own registry is the host binary, the installed `.ts`, and `BUN_BE_BUN: 1`.

**And the tool names are the ones the ported skills call.** The same probe first reported `dpmTools: 0`, which looked like a second defect and was a bug in the probe: it read `tool.name` where the namespace lives on `tool.id`. Read correctly, `create_spec` registers as `id: dpm_create_spec` with `options.namespace: dpm`, and **183 of the 195 ids carry the `dpm_` prefix** — so epic 01-03's 456 rewrites to `dpm_<tool>` are landing on the names the host actually publishes. Worth recording as its own line: a filtered sample reported an absence, and the absence was in the instrument.

## What this cost, and the lesson under it

**The whole suite was green throughout.** Every existing check ran the executables from the checkout, where the restriction does not apply, so 1085 passing tests said nothing whatever about the only copy a user ever receives — `executables-typescript.test.js` spawns all five binaries and does it from the tree. **Location was an untested variable**, and the artefact differed from the checkout in exactly that one respect.

`tests/installed-runtime.test.js` is the guard, and it is built the way this project keeps having to learn: the control comes first. Test 1 plants the package under a real `node_modules` and shows `node` refusing it, with the checkout copy passing the same handshake as the other half of the control — so the fix is demonstrably needed rather than merely present, and a future revert to `['node', …]` turns the file red instead of green.

## What the epic found, across its three stories

Synthesis is mandatory here on three counts: a criterion resolved at a gate rather than by this run, a story pivoted mid-epic, and a defect found that no story was looking for.

**One theme runs through all three stories: this epic was the first to look at the artefact.** Epics 01-01 through 01-04 built and tested the repository. 01-05 packed it, installed it, and used it — and each of those three acts found something the 1085-test suite could not have found, because every one of those tests read the working tree.

- **Packing it** found `"private": true`, left behind by the vendoring commit as scaffolding rather than as a decision. It would have refused distribution outright, and nothing checked for it because nothing had ever tried to distribute.
- **Installing it** found the type-stripping restriction. `node bin/dpm-mcp.ts` runs in a checkout and cannot run under `node_modules`, which is the only place a plugin is ever installed. See *The installed package could not run its own MCP server*.
- **Using it** found nothing further, which is the result worth having: 24 of 24 tools the spec skill names resolved against the installed server, and a `create_spec` call wrote a row into the target project's own database.

**"The suite is green" and "the product works" turned out to be different claims**, and the gap between them was exactly one variable: location. This is the epic's transferable finding. A test that spawns an executable from the repository is evidence about the repository; the artefact differs from it in ways no amount of care inside the repository can anticipate, which is why `installed-runtime.test.js` plants the package under a real `node_modules` rather than reasoning about what one would be like.

**Story 1 was pivoted away from npm mid-epic, and the pivot held.** FR1 names the GitHub specifier first and reserves the npm form for *later*; two tasks and two coverage bindings had been written toward a registry release that the requirement does not yet ask for. Dropping it cost the epic nothing — the tarball still had to be right, because the installer builds one — and the story's tests are about the packed artefact rather than about a registry. The reasoning is in *Why this epic no longer publishes to npm*.

**One open question closed itself as a side effect.** The epic had recorded that a GitHub install brought down 418 files and left open whether the installer honours `files`. After story 1 added the allow-list, the cold re-install came down at **166 files with seven top-level entries** — identical to `npm pack`. It does honour it, and `docs/`, `tests/`, `.dpm/` and `.claude-plugin/plugin.json` no longer reach users.

**The absence checks got harder on purpose.** Story 3's three criteria are all negatives, and the epic's own history — two false passes found in earlier retros — argued against every cheap way of answering them. The static reading (no `node:net` anywhere in `src/`) was kept as a supporting fact and refused as the answer. The runtime instrument records rather than blocks, because a thrown refusal can be swallowed and leave a log that reads like an absence; a second run then blocks outright, because the criterion names two things and "did not try" does not imply "works when it cannot". Notably, the suite's own outbound sweeps rejected the instrument on both counts, and the exceptions were named rather than the rules relaxed.

**What is not discharged.** FR1 stays unclaimed, on one clause: *"and later the npm form"*. Every other fragment of it is bound and verified across seven live bindings, and the npm form is a future obligation the requirement itself defers — but it is an obligation, and claiming FR1 whole would say it had been met. ENVX4, ENVX5 and ENVX6 are claimed whole: each is one obligation plus a *Checkable by* sentence, and in each case the check performed is the check the requirement names.

## Story 1 — Settle what the package ships at 0.1.0

**Status**: complete — Three criteria met; three of three coverage rows verified. Task 2 was withdrawn with the registry — see the epic's *Why this epic no longer publishes to npm*.  
**Blocked by**: Story 2, Story 3  

### Acceptance Criteria

- The package is distributable at version 0.1.0: the manifest declares 0.1.0, nothing marks it private, and `npm pack` produces the tarball an installer builds from this repository. `[integration]`
- The packed tarball contains the plugin entry, all twenty-three skill directories, `shared/`, and the five executables. `[integration]`
- must NOT — The packed tarball omits a file a registered skill needs at runtime. `[integration]`

### Task 1 — Set the version to 0.1.0 and settle the files and exports fields

**Status**: complete — The version was already `0.1.0`. Two things stood between that and a publishable package, and neither was in the task title.

**`"private": true` would have refused the publish outright.** It arrived with the initial vendoring commit (`37b7c31`) as scaffolding, not as a decision — nothing in the spec, the epic or any story asks for it, and FR1 names the npm form as a supported install. Removed.

**There was no `files` field, so npm would have shipped 425 files and 6.0 MB** — the entire test suite (230 files), the whole planning corpus under `docs/`, the database dump in `.dpm/`, `.github/`, `.claude/`, `tsconfig.json`, and `.claude-plugin/plugin.json`, a Claude Code manifest that FR14 puts out of scope for this repository. That last one is the sharp end: a package published for OpenCode v2 would have carried a manifest advertising itself to a different host, with `${CLAUDE_PLUGIN_ROOT}` in it.

`files` is now an allow-list of five directories — `bin/`, `hooks/`, `shared/`, `skills/`, `src/` — which npm supplements with `package.json` and `README.md` of its own accord. `npm pack --dry-run` reports **166 files, 1.15 MB**: 133 under `src/`, all twenty-three skill directories, the five executables, both `shared/` documents, and `hooks/pre-commit`, which the README's pre-commit-framework entry names by path. `.claude-plugin/plugin.json` is excluded by the allow-list without touching the four test files that still read it from the working tree.

**`exports` needed nothing.** It already points at `./src/plugin/index.ts` — a source file, which is the whole point of NFR2: there is no build output directory for either field to point at, because there is no build. `files` names five source directories for the same reason.

Three fields were added while the manifest was open, because a published package without them is worse than one with them and this is the story that publishes it: `repository` (npmjs.com shows no source link without it, and the README sends readers to that repository), `author`, and `keywords` — the last two recovered from `.claude-plugin/plugin.json`, which is not shipping, with the Claude Code-specific terms dropped and `opencode`/`opencode-plugin` added.

Full suite after the change: 1080 tests, 1080 pass.  

Addresses what the tarball will contain. Neither field may point at a build output directory.

### Task 2 — Publish to npm

**Status**: withdrawn — Dropped with the registry, at the user's decision, before any of it was done. FR1 names the GitHub specifier first and reserves the npm form for *later*; publishing claims the name permanently and makes 0.1.0 immutable, so it is not a step a run takes on the requirement's behalf. The reasoning is on the epic as *Why this epic no longer publishes to npm*.

Withdrawn rather than left pending, because pending would go on reporting an npm release as work this project still owes. What replaces it is nothing: the story's remaining tasks settle the package and check what it packs, and story 2 installs it by the documented command.  

The release itself. Verification from the published artefact is story 2.

### Task 3 — Write tests for "Settle what the package ships at 0.1.0"

**Status**: complete — `tests/publish-package.test.js` — five tests, all passing.

**The tarball is packed, not predicted.** `files` is an allow-list the packer supplements with rules of its own — `package.json` and `README.md` go in whatever the field says, `.git` and `node_modules` stay out however it is written — so a check that reasoned from the manifest would be asserting a model of the packer. `npm pack --pack-destination` writes into a scratch directory the test owns, and the artefact is opened: `tar -tzf` for what shipped, an extraction for whether it still works.

**Held against named sets, never looped over.** The skills are compared against `discoverSkills(ROOT)`, so a skill added to the tree is either shipped or reported and never silently neither; the executables against `EXECUTABLES`; `shared/` against `readdirSync`; the top-level entries against an exact seven. A `files` field that stopped matching would leave a loop iterating nothing and reporting clean, which is the false pass a `deepEqual` against an expected set has twice been the only defence against.

**The must-NOT's control is the shipped code, not a second reading.** `resolveSupportingPaths` throws when a skill names a `shared/` document the package does not hold, because registering it would advertise a reference the model cannot follow. So the extracted package is handed to `discoverSkills` — twenty-three skills, each with a supporting path resolved inside the extracted tree — and then `shared/skill-conventions.md` is deleted from it and the same call must throw. Passing the first half alone would say only that nothing was checked.

Two more controls, because two of the assertions are absences. The exclusion check confirms `docs/`, `tests/`, `.dpm/` and `.claude-plugin/` are non-empty in the working tree, so their absence from the tarball is a fact about the tarball rather than about a reading that found nothing. And the build-output check — every path `files` and `exports` name is tracked by git, which is the strongest available evidence that it is not generated — is driven against a planted `dist/` and `build/lib.js` that must be rejected.

**The refactoring this story earned, done at the point of need.** `EXECUTABLES` existed twice, in `executables-typescript.test.js` and `vendoring.test.js`, each with its own paragraph making the same argument for naming the five rather than reading the directory. This file was about to be the third, so the list moved to `tests/support/sources.js` with the two rationales merged and both callers migrated in the same change — including the rename-by-extension incident that is the reason the argument holds.

`npm`'s per-file `notice` output goes to stderr and is ignored rather than inherited: 166 lines in the middle of a run bury every other result.

Typecheck clean, module sweep clean, full suite **1085 tests, 1085 pass**.  

Covers what the tarball an installer builds contains — plugin entry, twenty-three skill directories, `shared/`, five executables — including the rejection of a file a registered skill would need at runtime.

### Retro

- **The story's real defect was not in its tasks — it was that the story existed.** The tasks named the version, `files` and `exports`; what was actually wrong was that the epic proposed to claim a permanent name on a public registry for a route the specification defers. FR1 says `opencode2 plugin add github:...` "**and later** the npm form", and *later* had been read as *now* by whoever planned the epic, me included, for four tasks and two coverage bindings before anyone asked why. The user asked, in five words, and the answer took one reading of the requirement.

**Worth carrying: a task list can be entirely correct and still be executing the wrong story.** Nothing in tasks 1 or 3 was wasted — the manifest work and the tarball tests apply unchanged, because the artefact is the same artefact whichever route delivers it. What would have been wasted, irreversibly, is the act the task list did not describe as a decision: `npm publish` reads as a step when it is written between "set the version" and "write the tests", and it is the one line in the epic that cannot be undone. **A step that cannot be reversed should not be a task; it should be a gate.** That is a planning lesson rather than an execution one, and it belongs to whatever writes epics.

**The pivot cost two coverage rows, and one of them was already wrong.** Both quoted the fragment "and later the npm form". The second was bound to story 2's must-NOT — *the install is verified from the working tree rather than from the package the installer built* — a criterion about where evidence comes from, which was never about npm at all. It had been sitting there unverified since the epic was planned, and the only reason it surfaced is that `list_coverage` on the requirement was the first thing the pivot did. Retro 02 recorded exactly this procedure after an amendment; this is the first time running it found a binding that was wrong for a different reason than the one being fixed.

**And the finding that made the manifest work worth doing regardless.** The package OpenCode had actually installed from the GitHub specifier in epic 01-04 was on disk in the scratch cache: **418 files, 6.4 MB**, the whole repository — `docs/` with this project's planning corpus, `tests/`, `scripts/`, `.dpm/` with the database dump, and `.claude-plugin/plugin.json`, a manifest addressed to Claude Code shipped inside an OpenCode package. There was no `files` field, and `private: true` from the vendoring commit would have blocked distribution outright. Both were invisible from the manifest alone and obvious the moment the installed artefact was opened — which is the same move as running the README's commands rather than reading them, one epic earlier.

## Story 2 — Verify the install from the GitHub specifier

**Status**: complete — Verified twice: once against an install patched with the fix, then — after the fix was pushed as 1dd6a9e — discarded and re-run against a wholly cold install. Only the second run is the evidence.  
**Blocked by**: —  

### Acceptance Criteria

- Installing into a fresh project by the documented command — `opencode2 plugin add github:ninthspace/opencode-dpm` — leaves the MCP server connected and all twenty-three skills advertised, with no further user action. `[manual]`
- One skill runs end to end from the installed package, in a clean environment. `[manual]`
- must NOT — The install is verified from the working tree rather than from the package the installer built. `[manual]`

### Task 1 — Install from the GitHub specifier in a clean environment and register

**Status**: complete — Installed and registered, and the task also fixed the defect the install exposed: `node bin/dpm-mcp.ts` cannot run from under `node_modules`, so the shipped server never started. `localServer()` now spawns the host's own bun. Verified against the installed copy: 23 skills, `mcp connected server=dpm tools=183`, ids `dpm_*`.  

From the package the installer builds, never the working tree. Addresses install and registration; running a skill is task 2. The first question is whether OpenCode's installer honours the `files` allow-list, which the 418-file install recorded on the epic leaves open.

### Task 2 — Run one skill end to end from that install

**Status**: complete — The spec skill, from the installed package only: body read from the cache path, all 24 tools it names published by the installed server, and `create_spec` writing a row into the target project's own `.dpm/dpm.db`. Re-run against a cold install of 1dd6a9e after the patched run was discarded.  

The last check before the install route stands: a real skill doing real work from what a user would actually get by running the documented command.

### Retro

- The story did the one thing no other story in the port had done — installed the thing and used it — and that alone found a defect that made every install non-functional.

**The defect was invisible from inside the repository, by construction.** Node refuses to strip types from any `.ts` under a `node_modules` directory, and OpenCode installs every plugin into one. So `node bin/dpm-mcp.ts` worked in the checkout and could not work in the artefact, and 1085 passing tests were all evidence about the checkout. `executables-typescript.test.js` spawns all five binaries and spawns them from the tree. **Location was a variable the suite never varied**, and the artefact differed from the checkout in exactly that one respect.

**The failure mode was worse than a crash.** 23 skills registered and 0 tools; every skill's procedure writes exclusively through those tools. The plugin advertised the whole method and could perform none of it, with nothing in the interface saying so. A plugin that failed to load would have been a better outcome — someone would have noticed.

**Two diagnostic habits paid for themselves.** Every escape from the type-stripping restriction was closed off by *test* rather than by reasoning — two Node versions, three flags, and the same tree copied outside `node_modules` — which is what turned "Node seems not to like this" into a fact with a shape. And the fix candidate was checked the same way: `BUN_BE_BUN=1` really does turn `opencode2` into a bun CLI, that bun really does carry `node:sqlite`, and `process.execPath` really is the host binary *inside a loaded plugin*, which is where it mattered and not where it was convenient to check.

**The instrument lied once, and it looked exactly like a second defect.** After the server connected, the probe reported `dpmTools: 0`. It was reading `tool.name`, where the namespace lives on `tool.id` — the tools were all there as `dpm_create_spec`. Ten minutes were nearly spent on a bug in the port that was a bug in the probe. **A filtered sample reporting an absence is not evidence of an absence**, and the fix was to record both fields unfiltered rather than to guess a better filter. Recording the raw shape first would have cost nothing and saved all of it.

**The gate was worth stopping at.** The first end-to-end pass ran against an install carrying the fix as a local patch, which was enough to prove the mechanism and not enough to satisfy a criterion naming the documented command against GitHub. Chris chose push-then-re-verify, the patched cache was deleted outright, and the cold run is the only evidence on the record. It also paid an unplanned dividend: the cold install came down at **166 files**, matching `npm pack` exactly, which answers the question the epic had left open at 418 — the installer does honour the `files` allow-list.

## Story 3 — Verify the production restrictions

**Status**: complete  
**Blocked by**: —  

### Acceptance Criteria

- A full plan-and-publish cycle completes with networking disabled, making no outbound connection attempt. `[integration]`
- Persistence uses only files under `.dpm/`: no port is bound and no external service is contacted during a full plan-and-publish cycle. `[integration]`
- The plugin runs correctly in a project containing no `.claude/` directory and no CPM or dpm marketplace installation. `[integration]`

### Task 1 — Run a full plan-and-publish cycle with networking disabled

**Status**: complete — Done as watch-then-block rather than as a disabled interface. Watching answers "made no outbound attempt", which disabling cannot — a swallowed ECONNREFUSED looks like never having called. Blocking then answers "completes with networking disabled", stricter than a firewall since loopback and DNS go too, and needing no privileges.  

Inside the disposable environment from the bootstrap epic, so the claim is run rather than asserted.

### Task 2 — Run the same cycle in a project with no .claude/ directory and no marketplace installation

**Status**: complete — Cycle runs in a bare directory; no `.claude/` or `.claude-plugin/` is created. Also demonstrated outside the suite by the story 2 install, which ran in an XDG scratch with no marketplace at all.  

Addresses independence from Claude Code artefacts at runtime, which the development-side check in the bootstrap epic does not cover.

### Task 3 — Write tests for "Verify the production restrictions"

**Status**: complete — tests/production-restrictions.test.js (5) and tests/support/network-watch.js. Two exceptions named in suite-integrity.test.js rather than exempted by loosening its sweeps: the instrument imports node:net and node:dns to wrap them, and the control script calls fetch at a loopback port nothing answers on.  

Covers the criteria tagged `integration`: no port bound, no external service contacted, and persistence confined to files under `.dpm/`.

### Retro

- Three absence criteria, and the work that mattered was choosing the instrument rather than writing the checks.

**The obvious experiment was the weak one.** "Run it with networking disabled" is what the criterion says and what the task was titled, and it answers only half the criterion: a cycle that completes offline has shown it does not *need* the network, not that it did not *try*. A swallowed `ECONNREFUSED` is indistinguishable from never having called, and the criterion's second clause is "making no outbound connection attempt". So the order was inverted — watch first, then block — and both clauses got their own run. Watching also turned out to be the cheaper of the two to make trustworthy, because a recorder cannot be caught by a `try`/`catch` up the stack the way a thrower can.

**Blocking in-process beat blocking at the interface.** No privileges, no machine state, and stricter than a firewall: loopback and name resolution go too, so there is no local service and no cached lookup for the cycle to lean on. The reflex was to reach for the OS.

**Static evidence was available and was not enough.** `node:net`, `node:dns`, `node:http` and `fetch` appear nowhere in `src/` or `bin/`, which is worth knowing and is not the claim — a grep cannot see through a dynamic specifier or into a dependency. Kept as a supporting reading in the `.claude/` check, where it is paired with a control on the comment-stripper, and not relied on for the network claim.

**The suite refused the instrument, and refusing it was correct.** `suite-integrity.test.js` already forbids importing an outbound builtin and calling an outbound global, so the watch failed on both counts — it imports `node:net` and `node:dns` to wrap them, and its control script calls `fetch` at a loopback port nothing answers on. The temptation was to relax the sweeps to admit a "helper". Both were **named** instead, following the precedent the file sets for `capability.test.js`: a rule loosened to a shape admits the next real violation silently, whereas a third entry arriving in a named list fails until somebody classifies it. Worth noting that the guard caught its own enforcement mechanism — the sweeps are doing their job on the people writing them.

**Every check here has a firing control, and one of them is the block itself.** An empty log is also what an instrument that never loaded would produce, so the blocked run ends by asking the same child to do the one forbidden thing and requiring it to fail. That pattern — prove the instrument works in the same test that relies on it — is what the earlier stories kept having to retrofit.

## Retro Applied

- 02 · codebase-discoveries · applied — Story 2 asks whether a plugin installed from the published artefact actually registers, which is a question about a running host and not about a file. The probe plugin goes in first rather than after exhausting `opencode2 plugin list`, which produced two false "it is not loading" conclusions last epic and a third in epic 01-04 story 2. Any CLI listing is run twice before being believed, and a disagreement sends me to the host log — where `Duplicate plugin ID: dpm` announced itself last epic while every CLI route stayed silent.
- 01 · complexity-underestimates · not_applicable — Six of retro 01's observations are set aside as a group so the non-selection is a decision rather than an omission: the module that dies at import and takes a suite's assertions with it; `.nvmrc` versus the version manager; the `Record&lt;string, any&gt;` row-type decision; `import type` being loud to a regex and invisible at runtime; and the v0.7.0 dump as a parity oracle. All five belong to the conversion of the source tree, which this epic does not touch — it packages what that work produced. The sixth, a criterion naming a mechanism rather than a property, is carried instead by the retro 02 entry on amendment, which says the same thing with the stronger procedure attached.
- 02 · criteria-gaps · applied — This epic's criteria name a mechanism — publishing to npm at 0.1.0 — and publishing is irreversible in a way the earlier epics' mechanisms were not, so the check that the mechanism is still the right one happens before the act rather than after. And when a requirement is amended here, `list_coverage` on it names every binding immediately: a bound fragment that is no longer a substring of the requirement is a broken binding whatever its verified date says, and this epic closes the spec's last unclaimed requirements.
- 01 · patterns-worth-reusing · applied — A sweep whose corpus is derived from a filter goes quiet rather than breaking, and this epic's central artefact — the published tarball — is exactly that: `files` in package.json is a filter, and the check over its contents enumerates whatever the filter produced. So the tarball listing is asserted against a named expected set (the plugin entry, twenty-three skill directories, `shared/`, the five executables) rather than looped over, because a `files` field that stopped matching would otherwise leave the check sweeping an empty list and reporting clean. Twice now a deepEqual against the expected set has been the only thing between that and a false pass.
- 02 · patterns-worth-reusing · applied — Story 1's must-NOT is an absence — the tarball omits a file a registered skill needs at runtime — and an absence is only an observation when something was watching. The control is a planted one: a file a skill genuinely reads at startup is excluded from `files`, the check must fail on it, and only then does a clean result mean anything. `npm pack --dry-run` against the working tree is the oracle here in the same way the released v0.7.0 was last epic: it reports what npm will actually ship rather than what the manifest is believed to say.
- 01 · testing-gaps · applied — Story 2 installs from the published artefact into a project outside the checkout, which is the shape that produced fifty inherited failures and, worse, the ones that passed while asserting about a directory that was nobody's. Every check about that install anchors on evidence the install produces — a file present in the extracted package, the package's own manifest naming itself and its version — rather than on a path this repository computes. Epic 01-04 story 2 already proved the XDG-rooted scratch works for this and it is the fixture reached for again.
- 01 · testing-gaps · applied — Story 3 verifies the production restrictions — no network at runtime, no database service, no Claude Code artefacts — and every one of those is an absence. The isolated CI job epic 01-01 built is their intended consumer, and the discipline it established governs here: a flag whose effect is invisible when honoured is probed both ways, because a step that runs offline and passes is indistinguishable from a step whose `--network none` was silently ignored. Nothing in this story is recorded as met by inspection.
- 02 · testing-gaps · applied — `tests/support/sources.js` is the shared reader for `package.json` and exists because `plugin.test.js` carried a private copy of that read. This epic's whole subject is fields in that file — `version`, `files`, `exports` — so every new assertion goes through `sources.js` rather than beside it, and any private `readFileSync(package.json)` found on the way is migrated in the same change rather than left as style.
