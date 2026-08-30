# Coverage: Repository bootstrap and TypeScript conversion

**Number**: 01-01  
**Source epic**: 01-01  
**Status**: pending  

## Coverage

| # | Requirement | Spec Text | Story Criterion | Covered by | Test Approach | Verified |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | FR4 | the Node-floor refusal | Each of the five executables, run on a runtime below 24, refuses with a message naming the required version rather than failing on a syntax or module error. | Story 1 | `[unit]` | ✓ |
| 2 | FR4 | Fresh-clone restore from `.dpm/dpm.sql`, deterministic dump on publish | A fresh-clone restore from `.dpm/dpm.sql` reproduces the database, and a subsequent dump is byte-identical to the committed one. | Story 5 | `[integration]` |  |
| 3 | FR4 | the empty-database restore asymmetry | Restore into an empty database and restore into a populated one behave as v0.7.0 defines, with the asymmetry between them preserved. | Story 5 | `[integration]` |  |
| 4 | FR4 | read-only server mode | Read-only server mode refuses every write tool and serves every read tool. | Story 5 | `[integration]` |  |
| 5 | FR4 | all carry over with their existing behaviour | must NOT — A restore silently discards rows that were present in the dump. | Story 5 | `[integration]` |  |
| 6 | FR5 | keep their responsibilities, become TypeScript sources, and remain runnable directly with `node` and no loader | Each of `dpm-mcp`, `dpm-guard`, `dpm-publish`, `dpm-import` and `dpm-merge` runs directly with `node` and no loader flag, and performs the responsibility it held at v0.7.0. | Story 3 | `[integration]` | ✓ |
| 7 | FR5 | remain runnable directly with `node` and no loader | must NOT — An executable requires a build artefact to exist before it will run. | Story 3 | `[integration]` | ✓ |
| 8 | FR7 | The `node --test` suite — 133 test files at v0.7.0, including the corpus snapshot tests — runs against the TypeScript sources in CI, under plain `node` with no loader | The full suite runs under plain `node` on Node 24 and passes, corpus snapshot tests included. | Story 4 | `[integration]` |  |
| 9 | FR7 | under plain `node` with no loader | must NOT — A test requires a loader, a transpiler, or a network connection in order to pass. | Story 4 | `[integration]` | ✓ |
| 10 | FR7 | 133 test files at v0.7.0 | must NOT — A test file is deleted, skipped or quarantined in order to reach a green suite. | Story 4 | `[integration]` | ✓ |
| 11 | NFR2 | TypeScript throughout, restricted to erasable syntax so Node runs the sources directly | Every module under `src/` is a `.ts` file and the tree runs under plain `node` with no loader. | Story 2 | `[integration]` | ✓ |
| 12 | NFR2 | `tsc --noEmit` is a type check in CI, not a compile, and no build artefact is produced or published | `tsc --noEmit` exits zero over the whole codebase, and the package declares no build script. | Story 2 | `[integration]` | ✓ |
| 13 | NFR2 | no build artefact is produced or published | must NOT — The published package contains a build output directory, or its `files` or `exports` fields point at one. | Story 2 | `[unit]` | ✓ |
| 14 | NFR2 | restricted to erasable syntax so Node runs the sources directly | must NOT — A module under `src/` uses a TypeScript construct native type-stripping cannot erase — an `enum`, a parameter property, a `namespace`, or a legacy decorator. | Story 2 | `[unit]` | ✓ |
| 15 | NFR4 | Dump output, projection output, and ULID and number allocation behaviour remain byte-stable across the port | Dumping the same database twice produces byte-identical output, and regenerating the projection twice produces byte-identical output. | Story 5 | `[integration]` |  |
| 16 | NFR4 | remain byte-stable across the port | The corpus snapshot tests pass against the ported sources without their fixtures being regenerated. | Story 5 | `[integration]` |  |
| 17 | NFR4 | ULID and number allocation behaviour remain byte-stable | Number allocation over a fixed sequence of creates produces the same numbers as v0.7.0 for the same inputs. | Story 5 | `[integration]` |  |
| 18 | NFR4 | The guard's regenerate-and-compare depends on it | must NOT — Dump or projection output varies with wall-clock time, filesystem ordering, or hash-map iteration order. | Story 5 | `[integration]` |  |
| 19 | NFR4 | remain byte-stable across the port | must NOT — Dump or projection output varies with wall-clock time, filesystem ordering, or hash-map iteration order. | Story 5 | `[integration]` |  |
| 20 | NFR5 | Every internal import specifier carries an explicit `.ts` extension | Every internal import specifier under `src/` carries an explicit `.ts` extension. | Story 2 | `[integration]` | ✓ |
| 21 | NFR5 | `tsconfig.json` sets `allowImportingTsExtensions` so the type check accepts them | `tsconfig.json` sets `allowImportingTsExtensions`, and `tsc --noEmit` accepts the extensioned specifiers. | Story 2 | `[integration]` | ✓ |
| 22 | NFR5 | Every internal import specifier carries an explicit `.ts` extension | Every internal import specifier under `bin/` carries an explicit `.ts` extension. | Story 3 | `[integration]` | ✓ |
| 23 | NFR5 | a dedicated CI sweep that imports every module under `src/` and `bin/` with plain `node` | The module sweep reaches every file under `src/` and `bin/` with plain `node` — importing those under `src/` and resolving every specifier named in both — and every import resolves. | Story 6 | `[integration]` | ✓ |
| 24 | NFR5 | The sweep exists separately from the test suite | The sweep runs as a step separate from the test suite. | Story 6 | `[integration]` | ✓ |
| 25 | NFR5 | a bad specifier in a module nothing imports would otherwise reach a release unobserved | control — Introducing a deliberately extension-less internal import makes the module sweep fail. | Story 6 | `[integration]` | ✓ |
| 26 | ENVR1 | Node 24 or later on the contributor's machine | The repository's `package.json` declares the name `opencode-dpm` and an `engines.node` field of `>=24.0.0`. | Story 1 | `[unit]` | ✓ |
| 27 | ENVR1 | `node --version` reporting 24.0.0 or above | `node --version` on the contributor's machine reports 24.0.0 or above. | Story 1 | `[unit]` | ✓ |
| 28 | ENVR2 | `node --test` is the test runner | The package's test script is `node --test`, and no third-party test runner appears in `devDependencies`. | Story 4 | `[unit]` | ✓ |
| 29 | ENVR3 | TypeScript available for type checking | `tsc --noEmit` runs from `devDependencies` against the whole codebase and exits zero. | Story 2 | `[integration]` | ✓ |
| 30 | ENVR7 | a CI job running the full `node --test` suite on Node 24 under plain `node`, plus the type check and the module sweep, on every push | A CI job runs the full `node --test` suite, the `tsc --noEmit` type check and the module sweep on Node 24 under plain `node`, on every push, and the run is observable in the repository's CI history. | Story 7 | `[integration]` |  |
| 31 | ENVX2 | the test command and each executable's invocation passing no `--loader`, no `--import`, and no transpiler flag | The test script and every executable's documented invocation pass no `--loader`, no `--import` and no transpiler flag. | Story 3 | `[unit]` | ✓ |
| 32 | ENVX3 | Claude Code must not be required | The full suite passes in an environment with no Claude Code installed and no `CLAUDE_`-prefixed environment variables set. | Story 4 | `[integration]` |  |
| 33 | ENVR8 | each executable refusing with an explanatory message when it is below | Each of the five executables, run on a runtime below 24, refuses with a message naming the required version rather than failing on a syntax or module error. | Story 1 | `[unit]` | ✓ |
| 34 | ENVR8 | Node 24 or later on the host running OpenCode | The runtime the host invokes on the user's machine reports 24.0.0 or above. | Story 1 | `[target]` |  |
| 35 | ENVR12 | a disposable isolated environment — a container or equivalent — that can be started with no language toolchain present and with networking disabled | A disposable isolated environment is available in CI, and both the clean-install check and the networking-disabled cycle run inside it rather than being asserted by inspection. | Story 7 | `[integration]` |  |
