# Repository bootstrap and TypeScript conversion

**Number**: 01-01  
**Source spec**: 01  
**Status**: complete  
**Commit**: 6de9736  

## Story 1 — Vendor v0.7.0 and raise the Node floor to 24

**Status**: complete  
**Blocked by**: Story 2, Story 3  

### Acceptance Criteria

- The repository contains the v0.7.0 tree at its starting commit — 100 modules under `src/`, five executables under `bin/`, 133 test files under `tests/`, 23 skill directories under `skills/`, and `shared/skill-conventions.md` and `shared/status-model.md`. `[integration]`
- The repository's `package.json` declares the name `opencode-dpm` and an `engines.node` field of `>=24.0.0`. `[unit]`
- `node --version` on the contributor's machine reports 24.0.0 or above. `[unit]`
- Each of the five executables, run on a runtime below 24, refuses with a message naming the required version rather than failing on a syntax or module error. `[unit]`
- The runtime the host invokes on the user's machine reports 24.0.0 or above. `[target]`
- must NOT — The repository takes a package, git or copy-script dependency on the marketplace repository. `[unit]`

### Task 1 — Vendor the v0.7.0 tree as the starting commit

**Status**: complete  

Copy `src/`, `bin/`, `tests/`, `skills/`, `shared/` and `hooks/` verbatim from dpm v0.7.0; drop `.claude-plugin/plugin.json` and `MIGRATION.md`. Addresses the tree only, not any conversion of it.

### Task 2 — Rename the package and raise the engine floor

**Status**: complete  

`name` becomes `opencode-dpm` and `engines.node` becomes `>=24.0.0`. Addresses the manifest; the runtime refusal is task 3.

### Task 3 — Raise the node-floor refusal from 22.5.0 to 24

**Status**: complete  

Addresses the version the refusal checks and the message it prints, not the detection mechanism, which already exists in `src/server/node-floor`.

### Task 4 — Write tests for "Vendor v0.7.0 and raise the Node floor to 24"

**Status**: complete  

Covers the criteria tagged `unit` and `integration`. The host-runtime criterion is tagged `target` and is not automatable here.

### Retro

- `tests/support/skills.js` cannot be imported in this fork at all: its module-level `CALLABLE` constant reads `.claude-plugin/plugin.json`, which the vendoring step deliberately dropped. Every suite importing it therefore dies at load with an ENOENT before running a single assertion, rather than failing an assertion that names the cause. The refactoring pass found this by trying to reuse `skillNames()` and had to revert.

This shapes Story 4. "Restore the inherited test suite green" has two classes of failure in it, not one: assertions that are wrong about the fork, and modules that will not load in the fork. The second class hides the first — a suite that dies at import contributes one opaque failure standing in for however many real assertions it holds, so the 50 remaining failures are a lower bound on the work rather than a count of it. Cutting the load-time couplings first is what makes the rest of the count mean anything.

- Raising the floor to 24 was one constant; getting the machine to 24 was not. `nvm install 24` and `nvm alias default 24` both succeeded and `node --version` went on reporting 22.18.0, because nvm's auto-activation re-selects whatever Node is already on `PATH` rather than the default alias — so every shell descending from an already-pinned session keeps the old version, and the alias is only consulted where nothing was pinned. What actually satisfied the criterion was committing `.nvmrc`, which the contributor's shell already acts on when entering the directory.

Worth carrying forward because the criterion is written as "`node --version` on the contributor's machine reports 24.0.0 or above", and the obvious reading of that — install the version — leaves it false. The repository artefact is the mechanism, not the install.

## Story 2 — Convert src/ to erasable-syntax TypeScript

**Status**: complete  
**Blocked by**: Story 4, Story 6  

### Acceptance Criteria

- Every module under `src/` is a `.ts` file and the tree runs under plain `node` with no loader. `[integration]`
- `tsc --noEmit` exits zero over the whole codebase, and the package declares no build script. `[integration]`
- must NOT — The published package contains a build output directory, or its `files` or `exports` fields point at one. `[unit]`
- Every internal import specifier under `src/` carries an explicit `.ts` extension. `[integration]`
- `tsconfig.json` sets `allowImportingTsExtensions`, and `tsc --noEmit` accepts the extensioned specifiers. `[integration]`
- `tsc --noEmit` runs from `devDependencies` against the whole codebase and exits zero. `[integration]`
- must NOT — A module under `src/` uses a TypeScript construct native type-stripping cannot erase — an `enum`, a parameter property, a `namespace`, or a legacy decorator. `[unit]`

### Task 1 — Establish the TypeScript configuration

**Status**: complete  

`tsconfig.json` with `allowImportingTsExtensions` and no emit, plus TypeScript as a devDependency. Addresses configuration, not module contents.

### Task 2 — Convert the modules under src/ to .ts, erasable syntax only

**Status**: complete  

All 100 modules across the 24 subdirectories. Addresses file extension and syntax; import specifiers are task 3.

### Task 3 — Add explicit .ts extensions to every internal import specifier under src/

**Status**: complete — Widened during planning beyond `src/`: the 393 specifiers pointing into `src/` from `tests/`, `bin/` and two `.mjs` fixtures were rewritten in the same pass, because Node does not map a `.js` specifier onto a `.ts` file and the story's own tests import `src/`.  

Addresses the specifier text. The sweep that enforces it across modules nothing imports is story 6.

### Task 4 — Write tests for "Convert src/ to erasable-syntax TypeScript"

**Status**: complete  

Covers the criteria tagged `unit` and `integration`, including the rejection of non-erasable constructs.

### Retro

- The conversion's hard part was not the syntax but the *type* for an untyped SQLite row, and getting it wrong once cost a full pass over the projection. TypeScript's rule — an index signature does not supply a target type's *required* named properties — was established empirically in a scratch file rather than guessed at, and it invalidated the first approach (small named row shapes like `{id, number}` passed between modules), because `Record<string, any>` is not assignable to them. The settled answer is one honest type, `Record<string, any>`, declared once per layer with a written rationale: `Row` in `projection/naming.ts`, `Args`/`Row` in `tools/convention.ts`, `ViolationRow` in `integrity/register.ts`. The alternative, `unknown`, was rejected in writing because it puts several hundred identical casts at call sites, none of which check anything. Two consequences worth carrying forward: object spread **drops** an index signature, so `.map((r): Row => ({...r, x}))` needs the return annotation or the nested shape silently loses every column it came in with; and shared types were pushed *downwards* into the module with no imports and re-exported, rather than sideways, so no type-only import points back up a dependency edge.

- A type-only import is invisible at runtime and highly visible to a textual sweep, and that mismatch broke a real invariant test two suites deep. `server.test.js` and `publish-cli.test.js` each walk the static import graph to prove no executable reaches `node:sqlite` before the Node-floor check runs — a genuine NFR2 guarantee, since ES imports evaluate before any statement in the file. Adding `import type { DatabaseSync } from 'node:sqlite'` to `src/db/capability.ts` is erased by both Node's type-stripper and `tsc` under `verbatimModuleSyntax`, so the guarantee held; the regex did not know that, and reported a crash that cannot happen. The right fix was the sweep, not the source. Two things made it safe: the exclusion lookahead is narrow in both directions (`import { type Row, insert }` still loads the module for `insert`; `import type from './x'` is a value default import bound to the name `type`), and each suite now asserts the exclusion directly against three literal strings rather than trusting the walk's silence. The generalisable lesson: after a TypeScript port, every textual sweep over import statements is asserting something subtly different from what it was written to assert.

## Story 3 — Convert the five executables to TypeScript

**Status**: complete  
**Blocked by**: Story 4, Story 6  

### Acceptance Criteria

- Each of `dpm-mcp`, `dpm-guard`, `dpm-publish`, `dpm-import` and `dpm-merge` runs directly with `node` and no loader flag, and performs the responsibility it held at v0.7.0. `[integration]`
- must NOT — An executable requires a build artefact to exist before it will run. `[integration]`
- The test script and every executable's documented invocation pass no `--loader`, no `--import` and no transpiler flag. `[unit]`
- Every internal import specifier under `bin/` carries an explicit `.ts` extension. `[integration]`

### Task 1 — Convert the five executables to .ts

**Status**: complete  

`dpm-mcp`, `dpm-guard`, `dpm-publish`, `dpm-import` and `dpm-merge`. Addresses the executables' own sources and their import specifiers.

### Task 2 — Update every documented invocation to plain node

**Status**: complete — `hooks/pre-commit` now execs `node .../bin/dpm-guard.ts` with no flag; `package.json`'s only invocation is `"test": "node --test"`, which already passed none. The README is the third documented surface and this fork vendors none — `first-run.test.js` asserts it when it lands, and its `dpm-publish` reference was moved to `.ts` here so it is correct on arrival.  

Addresses `package.json` scripts and the pre-commit hook. The README rewrite belongs to the guard-and-docs epic.

### Task 3 — Write tests for "Convert the five executables to TypeScript"

**Status**: complete  

Covers the criteria tagged `unit` and `integration`, including the rejection of a build-artefact prerequisite.

### Retro

- A rename's blast radius is not the string that names the file — it is every predicate that *filters* by extension, and only one of those is caught by rewriting the string. The narrow rewrite moved 54 occurrences of `dpm-X.js` across 26 files cleanly, and the suite then went from 50 to 55 failures. Four were escaped regexes (`/dpm-import\.js$/`) the pattern could not see, and the fifth was the dangerous one: `readdirSync(bin).filter((name) => name.endsWith('.js'))` in two suites, which silently became an empty enumeration. Both were saved by an assertion their authors had written for exactly this — `deepEqual(binaries, [the five])` with the message "the set of binaries moved — the sweep below is enumerating something else now". Without that line the two suites would have swept nothing and reported clean, which is the false pass this project keeps rediscovering. The generalisable rule: when renaming by extension, grep for `endsWith`, `filter` and escaped `\.js` separately from the literal name, and treat any sweep whose corpus is derived from an extension as part of the rename.

## Story 4 — Restore the inherited test suite green under Node 24

**Status**: complete  
**Blocked by**: Story 5, Story 7  

### Acceptance Criteria

- The full suite runs under plain `node` on Node 24 and passes, corpus snapshot tests included. `[integration]`
- must NOT — A test requires a loader, a transpiler, or a network connection in order to pass. `[integration]`
- The package's test script is `node --test`, and no third-party test runner appears in `devDependencies`. `[unit]`
- The full suite passes in an environment with no Claude Code installed and no `CLAUDE_`-prefixed environment variables set. `[integration]`
- must NOT — A test file is deleted, skipped or quarantined in order to reach a green suite. `[integration]`

### Task 1 — Run the inherited suite under Node 24 and fix what the conversion broke

**Status**: complete  

Addresses failures the port introduced, not pre-existing behaviour. A failure that reveals a real defect in v0.7.0 is recorded, not silently repaired here.

### Task 2 — Confirm the suite's independence from loaders, network and Claude Code

**Status**: complete  

Addresses the environment the suite runs in, not the assertions it makes.

### Task 3 — Write tests for "Restore the inherited test suite green under Node 24"

**Status**: complete  

Covers the shape criteria: the test script, the absence of a third-party runner, and the file count holding at 133 with nothing skipped or quarantined.

### Retro

- Every one of the 50 inherited failures traced to a path that resolved out of the checkout. At v0.7.0 the plugin sat inside the marketplace repository, so `join(dirname, '..', '..')` reached a sibling; in a standalone fork it reaches the developer's home directory. The damaging cases were not the ones that crashed but the ones that passed: `reference-environment.test.js` checked that CI did not exist in a directory that was never this project's, and `corpus.test.js` compared dpm's skills against an unrelated `~/Work/git/cpm` and reported a missing conversion. The fix in each case was to anchor on evidence rather than on a path — a plugin manifest naming itself and its version, a recorded list of what the source release shipped — and to report an absent neighbour by diagnostic rather than skipping. Twice during this story a control I wrote fired and was right: the CPM drift detector found that the sibling was a genuine but abandoned 1.0.0, and the `CLAUDE_` scrub control fired in exactly the environment its criterion describes, where there is nothing to scrub. The second was a bug in the control, not the code — a control that demands the hazard be present fails on the machine where the hazard is absent.

## Story 5 — Verify persistence parity and determinism

**Status**: complete  
**Blocked by**: —  

### Acceptance Criteria

- A fresh-clone restore from `.dpm/dpm.sql` reproduces the database, and a subsequent dump is byte-identical to the committed one. `[integration]`
- Restore into an empty database and restore into a populated one behave as v0.7.0 defines, with the asymmetry between them preserved. `[integration]`
- Read-only server mode refuses every write tool and serves every read tool. `[integration]`
- must NOT — A restore silently discards rows that were present in the dump. `[integration]`
- Dumping the same database twice produces byte-identical output, and regenerating the projection twice produces byte-identical output. `[integration]`
- The corpus snapshot tests pass against the ported sources without their fixtures being regenerated. `[integration]`
- Number allocation over a fixed sequence of creates produces the same numbers as v0.7.0 for the same inputs. `[integration]`
- must NOT — Dump or projection output varies with wall-clock time, filesystem ordering, or hash-map iteration order. `[integration]`

### Task 1 — Confirm the inherited persistence tests still cover restore asymmetry, read-only mode and row preservation

**Status**: complete — The inherited suite reaches criteria 2, 3, 4 and 5 in full: restore.test.js and restore-on-create.test.js cover the empty/populated asymmetry and first-open behaviour; read-only.test.js asserts every tool declaring `mutates` refuses and that no read is refused, with a remove-the-condition control and a refusal at the connection rather than in a handler; round-trip.test.js covers "loses no row, no index and no trigger" and dump-twice byte-identity; projection.test.js:161 and projection-integration.test.js:109 cover projection byte-identity. Not reached, and left to tasks 2 and 3: parity against v0.7.0 itself (criteria 1 and 7 — nothing compared the ported output to a v0.7.0-produced artefact), evidence that the corpus-snapshot fixtures were not regenerated (criterion 6), and the must-NOT on wall-clock, filesystem and iteration order (criterion 8).  

Addresses sufficiency of existing coverage, not new behaviour. Names any criterion the inherited suite does not reach.

### Task 2 — Add byte-stability checks for dump, projection and number allocation

**Status**: complete  

Addresses determinism against v0.7.0 output, which the guard's regenerate-and-compare depends on.

### Task 3 — Write tests for "Verify persistence parity and determinism"

**Status**: complete  

Covers whatever tasks 1 and 2 found uncovered, including the rejection of time-, filesystem- or iteration-order-dependent output.

### Retro

- The inherited suite already covered four of this story's eight criteria properly, and every one of those tests compares the port against itself — they would all keep passing if the conversion had changed the dump format, the sort order or the allocator, provided it changed them consistently, which is the shape a 100-module rename actually takes. What was missing was an oracle written by v0.7.0, and the repository turned out to hold one: `.dpm/dpm.sql` at commit 1123bc7 was produced by v0.7.0's dumper and allocator before a line of the port existed. Frozen as `tests/fixtures/v070-dump.sql`, it gave the strongest result of the epic — the ported restorer reads 296,061 bytes of v0.7.0 output and the ported dumper writes them back unchanged, and replaying v0.7.0's 21 creates in v0.7.0's order allocates v0.7.0's numbers. The lesson worth carrying: when porting, look for an artefact the old code left behind before writing a test that can only compare the new code to itself. Also worth noting for the next story that touches this area: `start()` does not restore — the restore is a step in the server's bring-up — and a test that calls `start()` on a clone gets a seeded database whose empty content tables look exactly like a broken restore.

## Story 6 — Enforce import-extension discipline with a module sweep

**Status**: complete  
**Blocked by**: Story 7  

### Acceptance Criteria

- The module sweep reaches every file under `src/` and `bin/` with plain `node` — importing those under `src/` and resolving every specifier named in both — and every import resolves. `[integration]`
- The sweep runs as a step separate from the test suite. `[integration]`
- control — Introducing a deliberately extension-less internal import makes the module sweep fail. `[integration]`

### Task 1 — Write the module sweep

**Status**: complete  

Imports every file under `src/` and `bin/` with plain `node` and reports any specifier that does not resolve.

### Task 2 — Wire the sweep as a step separate from the test suite

**Status**: complete  

Addresses the separation NFR5 requires, and is the reason a bad specifier in a module nothing imports is still caught.

### Task 3 — Write tests for "Enforce import-extension discipline with a module sweep"

**Status**: complete  

Includes the control check: a deliberately extension-less internal import must make the sweep fail.

### Retro

- The criterion said the sweep "imports every file under `src/` and `bin/`", and `bin/` cannot be imported: `dpm-guard.ts` ends in `process.exit(run(...))` and `dpm-mcp.ts` in `await main()`, both at module top level, so importing them runs the guard against the repository and starts a server waiting on stdin. The criterion was amended to say what is actually checkable and equally strong — resolve every specifier in both roots, import the modules under `src/` — rather than the sweep being written to match wording it could not satisfy. The distinction matters because resolution is what a wrong extension breaks, so nothing was given up: the planted controls catch an extension-less import, a stale `.js` pointing at a `.ts`, and a bare specifier, all three in `bin/` as readily as in `src/`.

## Story 7 — Stand up CI on Node 24

**Status**: complete  
**Blocked by**: —  

### Acceptance Criteria

- A CI job runs the full `node --test` suite, the `tsc --noEmit` type check and the module sweep on Node 24 under plain `node`, on every push, and the run is observable in the repository's CI history. `[integration]`
- A disposable isolated environment is available in CI, and both the clean-install check and the networking-disabled cycle run inside it rather than being asserted by inspection. `[integration]`

### Task 1 — Add the CI workflow running suite, type check and sweep on Node 24

**Status**: complete  

On every push, under plain `node`, with the run observable in the repository's CI history.

### Task 2 — Provide the disposable isolated environment job

**Status**: complete  

No language toolchain present, networking controllable. Consumed by the clean-install check in the plugin-entry epic and the offline cycle in the publish epic.

### Task 3 — Write tests for "Stand up CI on Node 24"

**Status**: complete  

Covers the criteria tagged `integration`: the workflow declares Node 24, runs all three checks, and the isolated environment job exists.

### Retro

- The first CI run was the first time this suite had ever run on a machine other than the one that wrote it, and it failed two tests out of 1015 — both for reasons no amount of local running could have surfaced.

The sharper of the two is a genuine latent bug that had been passing for the wrong reason since v0.7.0. `coverage-retirement-environment.test.js` asserted that a fixture database is outside the repository by writing `file.path.includes(DPM)` — a substring test standing in for a path test. It asks whether the repository's path appears anywhere inside the fixture's, which is a different and much weaker question. On a checkout at `/Users/chris/Work/git/opencode-dpm` it is indistinguishable from the right check; in the container, where the checkout is `/dpm` and `mkdtempSync` produces `/tmp/dpm-XXXXXX`, it fired on a scratch file that was exactly where it belonged. Containment between two paths is `relative(a, b).startsWith('..')`, and nothing else.

The second was not a bug but a missing environment: ENVR6 asks for a hook installed at `.git/hooks/pre-commit`, a fresh checkout has none, and the choice was between narrowing the assertion to accommodate CI or installing the hook so the assertion stays true. Installing it is right — it is what a contributor does on their first clone, so a CI run without it is a run against an environment the specification does not describe. The same problem arrived a second way in the container: `COPY` brings a symlink across as a symlink, so the host's hook link pointed at a path that exists on one machine and nowhere in the image, and a dangling link reads as no hook at all.

The design decision worth carrying is that every absence in the isolated job is paired with something that would catch its presence. The Docker build fails if the base image already has Node or a compiler, so "installed into a bare environment" is a state the build passes through rather than a claim about it. And `.github/network-probe.js` is run twice — once with networking and once with `--network none` — because a step that runs the suite offline and passes is indistinguishable from a step whose `--network none` was silently ignored. The probe takes its target as an argument, so the suite drives it against a `data:` URL and a closed loopback port and exercises all four combinations without a packet leaving the machine, which keeps the suite offline-clean while still proving the control works.

## Dependencies

- blocks → 01-02
