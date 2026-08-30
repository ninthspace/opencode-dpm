# Repository bootstrap and TypeScript conversion

**Number**: 01-01  
**Source spec**: 01  
**Status**: pending  

## Story 1 — Vendor v0.7.0 and raise the Node floor to 24

**Status**: pending  
**Blocked by**: Story 2, Story 3  

### Acceptance Criteria

- The repository contains the v0.7.0 tree at its starting commit — 100 modules under `src/`, five executables under `bin/`, 133 test files under `tests/`, 23 skill directories under `skills/`, and `shared/skill-conventions.md` and `shared/status-model.md`. `[integration]`
- The repository's `package.json` declares the name `opencode-dpm` and an `engines.node` field of `>=24.0.0`. `[unit]`
- `node --version` on the contributor's machine reports 24.0.0 or above. `[unit]`
- Each of the five executables, run on a runtime below 24, refuses with a message naming the required version rather than failing on a syntax or module error. `[unit]`
- The runtime the host invokes on the user's machine reports 24.0.0 or above. `[target]`
- must NOT — The repository takes a package, git or copy-script dependency on the marketplace repository. `[unit]`

### Task 1 — Vendor the v0.7.0 tree as the starting commit

**Status**: pending  

Copy `src/`, `bin/`, `tests/`, `skills/`, `shared/` and `hooks/` verbatim from dpm v0.7.0; drop `.claude-plugin/plugin.json` and `MIGRATION.md`. Addresses the tree only, not any conversion of it.

### Task 2 — Rename the package and raise the engine floor

**Status**: pending  

`name` becomes `opencode-dpm` and `engines.node` becomes `>=24.0.0`. Addresses the manifest; the runtime refusal is task 3.

### Task 3 — Raise the node-floor refusal from 22.5.0 to 24

**Status**: pending  

Addresses the version the refusal checks and the message it prints, not the detection mechanism, which already exists in `src/server/node-floor`.

### Task 4 — Write tests for "Vendor v0.7.0 and raise the Node floor to 24"

**Status**: pending  

Covers the criteria tagged `unit` and `integration`. The host-runtime criterion is tagged `target` and is not automatable here.

## Story 2 — Convert src/ to erasable-syntax TypeScript

**Status**: pending  
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

**Status**: pending  

`tsconfig.json` with `allowImportingTsExtensions` and no emit, plus TypeScript as a devDependency. Addresses configuration, not module contents.

### Task 2 — Convert the modules under src/ to .ts, erasable syntax only

**Status**: pending  

All 100 modules across the 24 subdirectories. Addresses file extension and syntax; import specifiers are task 3.

### Task 3 — Add explicit .ts extensions to every internal import specifier under src/

**Status**: pending  

Addresses the specifier text. The sweep that enforces it across modules nothing imports is story 6.

### Task 4 — Write tests for "Convert src/ to erasable-syntax TypeScript"

**Status**: pending  

Covers the criteria tagged `unit` and `integration`, including the rejection of non-erasable constructs.

## Story 3 — Convert the five executables to TypeScript

**Status**: pending  
**Blocked by**: Story 4, Story 6  

### Acceptance Criteria

- Each of `dpm-mcp`, `dpm-guard`, `dpm-publish`, `dpm-import` and `dpm-merge` runs directly with `node` and no loader flag, and performs the responsibility it held at v0.7.0. `[integration]`
- must NOT — An executable requires a build artefact to exist before it will run. `[integration]`
- The test script and every executable's documented invocation pass no `--loader`, no `--import` and no transpiler flag. `[unit]`
- Every internal import specifier under `bin/` carries an explicit `.ts` extension. `[integration]`

### Task 1 — Convert the five executables to .ts

**Status**: pending  

`dpm-mcp`, `dpm-guard`, `dpm-publish`, `dpm-import` and `dpm-merge`. Addresses the executables' own sources and their import specifiers.

### Task 2 — Update every documented invocation to plain node

**Status**: pending  

Addresses `package.json` scripts and the pre-commit hook. The README rewrite belongs to the guard-and-docs epic.

### Task 3 — Write tests for "Convert the five executables to TypeScript"

**Status**: pending  

Covers the criteria tagged `unit` and `integration`, including the rejection of a build-artefact prerequisite.

## Story 4 — Restore the inherited test suite green under Node 24

**Status**: pending  
**Blocked by**: Story 5, Story 7  

### Acceptance Criteria

- The full suite runs under plain `node` on Node 24 and passes, corpus snapshot tests included. `[integration]`
- must NOT — A test requires a loader, a transpiler, or a network connection in order to pass. `[integration]`
- The package's test script is `node --test`, and no third-party test runner appears in `devDependencies`. `[unit]`
- The full suite passes in an environment with no Claude Code installed and no `CLAUDE_`-prefixed environment variables set. `[integration]`
- must NOT — A test file is deleted, skipped or quarantined in order to reach a green suite. `[integration]`

### Task 1 — Run the inherited suite under Node 24 and fix what the conversion broke

**Status**: pending  

Addresses failures the port introduced, not pre-existing behaviour. A failure that reveals a real defect in v0.7.0 is recorded, not silently repaired here.

### Task 2 — Confirm the suite's independence from loaders, network and Claude Code

**Status**: pending  

Addresses the environment the suite runs in, not the assertions it makes.

### Task 3 — Write tests for "Restore the inherited test suite green under Node 24"

**Status**: pending  

Covers the shape criteria: the test script, the absence of a third-party runner, and the file count holding at 133 with nothing skipped or quarantined.

## Story 5 — Verify persistence parity and determinism

**Status**: pending  
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

**Status**: pending  

Addresses sufficiency of existing coverage, not new behaviour. Names any criterion the inherited suite does not reach.

### Task 2 — Add byte-stability checks for dump, projection and number allocation

**Status**: pending  

Addresses determinism against v0.7.0 output, which the guard's regenerate-and-compare depends on.

### Task 3 — Write tests for "Verify persistence parity and determinism"

**Status**: pending  

Covers whatever tasks 1 and 2 found uncovered, including the rejection of time-, filesystem- or iteration-order-dependent output.

## Story 6 — Enforce import-extension discipline with a module sweep

**Status**: pending  
**Blocked by**: Story 7  

### Acceptance Criteria

- The module sweep imports every file under `src/` and `bin/` with plain `node`, and every import resolves. `[integration]`
- The sweep runs as a step separate from the test suite. `[integration]`
- control — Introducing a deliberately extension-less internal import makes the module sweep fail. `[integration]`

### Task 1 — Write the module sweep

**Status**: pending  

Imports every file under `src/` and `bin/` with plain `node` and reports any specifier that does not resolve.

### Task 2 — Wire the sweep as a step separate from the test suite

**Status**: pending  

Addresses the separation NFR5 requires, and is the reason a bad specifier in a module nothing imports is still caught.

### Task 3 — Write tests for "Enforce import-extension discipline with a module sweep"

**Status**: pending  

Includes the control check: a deliberately extension-less internal import must make the sweep fail.

## Story 7 — Stand up CI on Node 24

**Status**: pending  
**Blocked by**: —  

### Acceptance Criteria

- A CI job runs the full `node --test` suite, the `tsc --noEmit` type check and the module sweep on Node 24 under plain `node`, on every push, and the run is observable in the repository's CI history. `[integration]`
- A disposable isolated environment is available in CI, and both the clean-install check and the networking-disabled cycle run inside it rather than being asserted by inspection. `[integration]`

### Task 1 — Add the CI workflow running suite, type check and sweep on Node 24

**Status**: pending  

On every push, under plain `node`, with the run observable in the repository's CI history.

### Task 2 — Provide the disposable isolated environment job

**Status**: pending  

No language toolchain present, networking controllable. Consumed by the clean-install check in the plugin-entry epic and the offline cycle in the publish epic.

### Task 3 — Write tests for "Stand up CI on Node 24"

**Status**: pending  

Covers the criteria tagged `integration`: the workflow declares Node 24, runs all three checks, and the isolated environment job exists.

## Dependencies

- blocks → 01-02
