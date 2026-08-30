# opencode-dpm: port DPM to OpenCode v2

**Number**: 01  
**Status**: complete  

## Problem Recap

DPM exists as a Claude Code plugin: an MCP server over `node:sqlite`, twenty-three skills that write exclusively through typed tools, a one-way markdown projection, a committed `.sql` dump, and a pre-commit guard that regenerates and compares. Measured at v0.7.0 the subject of the port is roughly 14,600 lines across 100 source files, 133 test files, 23 skills, 5 executables, a Node floor of 22.5.0, and zero runtime dependencies.

OpenCode v2 has a different extension model — TypeScript plugins loaded via `Plugin.define`, with the plugin context registering MCP servers, skills, commands and tools programmatically — and is explicitly beta, with plugin APIs that may move before 2.0 stable.

The port is a new standalone repository, `ninthspace/opencode-dpm`, vendoring dpm v0.7.0 as its starting commit and taking no dependency — package, git, or copy-script — on the marketplace repo, which remains the home of the Claude Code plugin. Two codebases is the accepted maintenance cost; each being native to its host is what it buys.

**Scope of this specification:** the port itself — install, registration, persistence parity, the five executables, the guard, the test suite, and documentation for a v2 audience. Nothing below the host boundary changes.

**Explicitly not covered:** the lite profile for constrained local open-weight models, deferred to a specification of its own as an iteration on what this one builds. The architectural seam that makes a profile possible is decided here; the build behind that seam is not.

The specification also carries three positions established in review that the source document did not hold: the model-facing boundary includes the text of tool refusals, import-extension discipline is a separately checkable requirement rather than a clause inside the language decision, and the supporting-files behaviour of skill registration is a go/no-go gate rather than a risk bullet — because its fallback, inlining the shared conventions into twenty-three skills, has no precedent left in the plan.

## Scope: In Scope

Five milestones, in order.

**1. Repo bootstrap.** Vendor v0.7.0, rename, convert `bin/` and `src/` to TypeScript, raise the Node floor to 24, and get the suite green under Node 24 with the module sweep in place.

**2. Plugin entry.** MCP registration working end-to-end in `opencode2` against a scratch project. **Two verification items gate this milestone.** The first is the effective rendered name of MCP-provided tools under v2 — namespacing and character substitution — which must be established before any skill prose is rewritten, because skill bodies name tools. The second is whether skills registered with a package `location` resolve their supporting files the way directory-based skills do, and it is **a written go/no-go**: if the answer is no, the fallback is inlining the shared conventions into twenty-three skills, which reintroduces exactly the duplication that file exists to eliminate and has no precedent left in the plan now that the lite profile is deferred. That decision is taken explicitly, at this milestone, and recorded.

**3. Skill port.** Pilot one skill end-to-end first — the spec skill, because it exercises gates, tool calls and the shared conventions file — against a scratch project before the batch pass. Then prefix the IDs, rewrite tool names and invocation prose, and register from the package. The CI grep enforcing that no skill body names a Claude Code mechanism lands here.

**4. Guard and docs.** Hook path, README, permission guidance. OpenCode's package cache location for a git-installed plugin is confirmed here rather than left to the first user to discover, since it decides whether the README's symlink instruction is correct.

**5. Release.** Tag 0.1.0, with install tested from the artefact the installer builds rather than from the working tree: a clean environment, install by the documented command, register, and run one skill end to end. **Distribution is the GitHub specifier, not a registry** — see *Why the release is a tag rather than an npm package*.

**What the inherited suite evidences, and what it does not.** The 133 test files carry over from a codebase that already passed them, so a green suite in milestone 1 establishes that the TypeScript conversion broke nothing beneath the host boundary. It is a regression net over the part that is not changing. Everything genuinely new in this port — registration, skill advertisement, invocation, the guard's new hook path — is verified in milestones 2 through 5 by checks nobody has written yet, and a green milestone 1 should not be read as coverage of any of it.

**And a boundary the suite cannot reach at all, learned in milestone 5.** Every one of those 133 files runs the executables from the working tree, and the artefact differs from the working tree in one respect no test inside the repository had varied: it lives under `node_modules`. Node refuses to type-strip `.ts` there, so the shipped MCP server could not start while the whole suite stayed green. Milestone 5's install-from-the-artefact is not a formality on top of the earlier milestones — it is the only check that reads the thing users receive.

## Scope: Deferred

The lite profile for constrained local open-weight models, carried here as FR13 with an exclusion rather than as silence, and deferred to a specification of its own.

What is deferred is the build: the reduced skill set, the terse rewriting, the trimmed schemas, the inlined conventions, the measured context budget, and the single-sentence refusals. What is **not** deferred is the seam that makes any of it selectable — the profile decision is accepted in this specification, and its model-facing boundary explicitly includes tool refusal text so the deferred work inherits a constraint it can actually satisfy.

The distinction matters for a reason that is easy to lose: if the profile decision were deferred along with the requirements, the natural implementation in milestone 2 hardcodes the skill list into the plugin entry, and the seam is gone before anyone notices it was load-bearing.

## Scope: Out of Scope

Four exclusions, each recorded as a requirement row carrying `out_of_scope` rather than living only in this prose.

- **Claude Code compatibility in this repository.** The marketplace repository remains the home of the Claude Code plugin, and the two are free to diverge — that freedom is the point of the fork.
- **OpenCode v1 support.**
- **CPM migration tooling.** Anyone on CPM migrates via the existing Claude Code dpm first.
- **CLI and TUI plugin work** — `cli.json` plugins, theme integration, keybinding integration.

None of these is a judgement that the work lacks value; each is a judgement that it does not belong in the release that establishes whether the port works at all.

## Integration Boundaries

Six seams, derived from the architecture decisions, and the places integration coverage belongs.

**1. Plugin to host registries.** The three transforms, and what appears in the host's MCP, skill and command registries as a result. This is a beta API, it is replayed on reload, and it is the most volatile boundary in the system — which is why the idempotency decision constrains what a transform may close over.

**2. Plugin to MCP server.** The spawned command, the stdio transport, the connection lifecycle, and the failure modes when the server does not start. The child process exists because of the tool-boundary decision, and this seam is what that decision costs.

**3. MCP server to database.** The typed tool contract over `node:sqlite`. Unchanged by decision and covered by the inherited conformance suite, which is the reason the decision was safe to take.

**4. Skill prose to effective tool names.** Skill bodies name tools by whatever the host renders them as, so a change in that rendering silently breaks twenty-three documents at once. Establishing the rendering is the first implementation task and gates the skill port.

**5. Database to projection and dump.** One-way and deterministic, with the guard sitting across it comparing regenerated output against committed output. Determinism is not a quality goal here but a precondition: the guard has no other way to tell a real difference from an incidental one.

**6. Package to filesystem.** Skill `location`, supporting-file resolution, and the guard symlink target inside OpenCode's package cache. Two open questions live on this seam — whether registered skills resolve their supporting files, and where a git-installed plugin actually lands — and the first is the milestone-2 go/no-go.

## Why the release is a tag rather than an npm package

**Amendment.** FR1 read *"`opencode2 plugin add github:ninthspace/opencode-dpm` — and later the npm form — yields a working DPM"*. The npm clause is retired and replaced by the ref form: *"optionally with `#<ref>` to pin a release"*. Milestone 5 changes from *Publish: npm at 0.1.0* to *Release: tag 0.1.0*. Nothing else about FR1's obligations moves — the install must still leave the server connected, the skills advertised, and nothing for the user to copy.

**Citation, and it is the whole argument.** The GitHub specifier accepts a git ref, and the ref genuinely pins:

    opencode2 plugin add github:ninthspace/opencode-dpm#d28c37b

installed the pre-fix tree — 424 files, `docs/` present, zero occurrences of `BUN_BE_BUN` in `src/plugin/server.ts` — against the 166-file post-fix package that the unpinned form brings down. Two different specifier strings, two different cache digests, two different trees. Version pinning was the one capability npm offered that the documented command was assumed not to have, and the assumption was wrong.

**What npm would have cost.** A second install path to keep verified, a registry name to hold, a release step between a commit and a usable version, and a real hazard rather than a theoretical one: OpenCode keys its package cache on the literal specifier string, so a user who installed both forms would hold two copies of dpm, and **`Duplicate plugin ID: dpm` fails the entire plugin load rather than skipping the duplicate**. A second distribution channel for a plugin whose id is a bare `dpm` is a way to break installs that were working.

**What it would have bought.** Discoverability, which is not a problem this project has, and semver resolution (`opencode-dpm@^0.1`), which is a real difference — a ref pins exactly and does not float within a minor. That is a smaller loss than it sounds for a tool distributed by a documented one-line command to people who are told which line to run, and it can be revisited without unpicking anything: adding npm later is additive, and this amendment retires a clause rather than closing a door.

**Recorded because it is the second time the clause generated work by being read rather than questioned.** Epic 01-05 opened with four planned tasks and two coverage bindings aimed at a registry release, and was pivoted mid-epic when the question was finally asked; the clause then survived that pivot as deferred scope and reappeared as outstanding work at the epic's close. A requirement fragment carrying "and later" is an obligation nobody has yet examined, and it will keep producing plans until somebody either does the work or writes down why not. This is the writing down.

## Functional Requirements

### FR1 (must)

Single-command install. `opencode2 plugin add github:ninthspace/opencode-dpm` — optionally with `#<ref>` to pin a release — yields a working DPM: the MCP server registered and connected, all skills advertised, and nothing further for the user to copy into the project.

- Installing into a fresh project by the documented command leaves the MCP server connected and all twenty-three skills advertised, with no further user action. `[manual]`
- The published package's manifest declares the plugin entry, and the server command path resolves to an existing file inside the installed package tree. `[integration]`
- must NOT — Installation requires the user to copy a file, hand-edit project configuration, or run a post-install step. `[integration]`

### FR2 (must)

The MCP server is the tool surface. The plugin registers the bundled server via `ctx.mcp.transform`, setting a local server entry whose command runs the packaged executable. Skills continue to write exclusively through typed MCP tools: no skill contains SQL and nothing parses prose. Tool behaviour and schemas carry over from v0.7.0 unchanged.

- The advertised tool set and every tool schema match v0.7.0's, compared against a stored snapshot of the tool surface. `[integration]`
- must NOT — A skill body contains a SQL statement — a `SELECT`, `INSERT`, `UPDATE` or `DELETE` paired with `FROM`, `INTO` or `SET`. `[unit]`

### FR3 (must)

Skills registered from the package. All twenty-three skills port and are registered via `ctx.skill.transform`, with `location` pointing into the installed package so directory-based skills keep their supporting files. Skill prose is revised wherever it names host mechanics: tool names take v2's effective naming, and the invocation story replaces Claude Code's slash-command triggers.

- All twenty-three skills appear in the host's skill registry after install, every ID carrying the `dpm-` prefix. `[manual]`
- The registration list computed before the transform contains twenty-three entries and every ID is `dpm-` prefixed. `[unit]`
- A registered skill's supporting files resolve from the package location, so a skill that reads the shared conventions file at startup finds it. This is the milestone-2 go/no-go: a negative answer forces inlining and is recorded as an explicit decision. `[manual]`
- must NOT — A skill body names a Claude Code mechanism — `mcp__plugin_`, `/dpm:`, `CLAUDE_PLUGIN_ROOT`, or `.claude/`. `[unit]`

### FR4 (must)

Persistence parity. Fresh-clone restore from `.dpm/dpm.sql`, deterministic dump on publish, the empty-database restore asymmetry, read-only server mode, and the Node-floor refusal all carry over with their existing behaviour.

- A fresh-clone restore from `.dpm/dpm.sql` reproduces the database, and a subsequent dump is byte-identical to the committed one. `[integration]`
- Restore into an empty database and restore into a populated one behave as v0.7.0 defines, with the asymmetry between them preserved. `[integration]`
- Read-only server mode refuses every write tool and serves every read tool. `[integration]`
- must NOT — A restore silently discards rows that were present in the dump. `[integration]`

### FR5 (must)

The five executables port. `dpm-mcp`, `dpm-guard`, `dpm-publish`, `dpm-import` and `dpm-merge` keep their responsibilities, become TypeScript sources, and remain runnable directly with `node` and no loader.

- Each of the five executables runs directly with `node` and no loader flag, and performs the responsibility it held at v0.7.0. `[integration]`
- must NOT — An executable requires a build artefact to exist before it will run. `[integration]`

### FR6 (must)

Pre-commit guard unchanged in kind. It remains a git hook that regenerates and compares, fixes nothing, and refuses with the four-case explanation. The install instruction is updated for where OpenCode places plugin packages, and the missing-symlink warning on server start carries over.

- The guard regenerates the projection, compares it against what is on disk, and exits non-zero on a mismatch. `[integration]`
- Each of the four refusal cases produces its own explanation, distinguishable from the other three. `[integration]`
- Starting the server in a repository with no hook symlink installed emits the missing-symlink warning. `[integration]`
- must NOT — The guard writes to the working tree or repairs any discrepancy it finds. `[integration]`

### FR7 (must)

Test suite ports. The `node --test` suite — 133 test files at v0.7.0, including the corpus snapshot tests — runs against the TypeScript sources in CI, under plain `node` with no loader.

- The full suite runs under plain `node` on Node 24 and passes, corpus snapshot tests included. `[integration]`
- must NOT — A test requires a loader, a transpiler, or a network connection in order to pass. `[integration]`

### FR8 (should)

Permission-aware behaviour. Skills behave correctly under `ask` and `deny` rules for the `skill` action, and the README documents the recommended permission entries.

### FR9 (should)

Session scratch via plugin storage. Anything that was per-session scratch keyed by an environment variable in Claude Code uses `ctx.storage` where a database session row is not already the answer. No transient files land in the project tree.

### FR10 (should)

README for a v2 audience. Install, first run, guard symlink, and "when the guard refuses" are rewritten for `opencode2`. The CPM MIGRATION.md does not carry over.

### FR11 (could)

Slash-catalog commands. Register `ctx.command.transform` entries that prompt the session into a named skill, restoring something close to the previous slash-command ergonomics if skill-as-slash proves insufficient in practice.

### FR12 (could)

HTTP skill catalog. Publish the skills as a v2 HTTP catalog for teams that want the skills without the plugin. Low value while the tools require the plugin anyway.

### FR13 (wont) — deferred

Lite profile for constrained local open-weight models — a reduced model-facing surface selected by plugin option, with skills rewritten as terse imperative checklists, tool descriptions and schemas hard-trimmed, conventions inlined rather than read at startup, a measured context budget, and single-sentence tool refusals that name the field and state the correction. Deferred to a specification of its own: it is an iteration on what this specification builds rather than part of it. The architectural seam that makes it selectable at registration time is decided here and is not deferred.

### FR14 (wont) — out_of_scope

Claude Code compatibility in this repository. The marketplace repository remains the home of the Claude Code plugin.

### FR15 (wont) — out_of_scope

OpenCode v1 support.

### FR16 (wont) — out_of_scope

CPM migration tooling. Anyone on CPM migrates via the existing Claude Code dpm first.

### FR17 (wont) — out_of_scope

CLI and TUI plugin work — `cli.json` plugins, theme integration, keybinding integration.

## Non-Functional Requirements

### NFR1 (must)

Zero runtime dependencies. `node:sqlite` stays; no native modules and no install-time compilation. The only package the plugin needs is `@opencode-ai/plugin`, and it is needed for its types alone — `Plugin.define` is the identity function `define(plugin) { return plugin }`, so importing it at runtime would pull eight transitive packages in to call a function that returns its argument. The SDK is therefore taken as a type-only import, sits under `devDependencies`, and `dependencies` stays empty.

- The package's `dependencies` contains exactly one entry, `@opencode-ai/plugin`. `[unit]`
- must NOT — A `.node` binary, or a compile step, appears anywhere in the production install tree. `[integration]`

### NFR2 (must)

No build step. TypeScript throughout, restricted to erasable syntax so Node runs the sources directly. `tsc --noEmit` is a type check in CI, not a compile, and no build artefact is produced or published.

- `tsc --noEmit` exits zero over the whole codebase, and the package declares no build script. `[integration]`
- must NOT — The published package contains a build output directory, or its `files` or `exports` fields point at one. `[unit]`

### NFR3 (must)

Beta churn tolerance. The plugin pins `@opencode-ai/plugin@beta` and the README states plainly that OpenCode v2 is beta and that entrypoints may move under it. API breakage is expected maintenance rather than a defect.

- The plugin dependency is pinned to the `beta` tag, and the README states that OpenCode v2 is beta and that entrypoints may move under it. `[unit]`

### NFR4 (must)

Determinism. Dump output, projection output, and ULID and number allocation behaviour remain byte-stable across the port. The guard's regenerate-and-compare depends on it.

- Dumping the same database twice produces byte-identical output, and regenerating the projection twice produces byte-identical output. `[integration]`
- The corpus snapshot tests pass against the ported sources without their fixtures being regenerated. `[integration]`
- must NOT — Dump or projection output varies with wall-clock time, filesystem ordering, or hash-map iteration order. `[integration]`

### NFR5 (must)

Import-extension discipline. Every internal import specifier carries an explicit `.ts` extension, as native type-stripping requires specifiers to resolve exactly as written, and `tsconfig.json` sets `allowImportingTsExtensions` so the type check accepts them. Enforced by a dedicated CI sweep that imports every module under `src/` and `bin/` with plain `node`. The sweep exists separately from the test suite because the suite only exercises modules some test imports, and a bad specifier in a module nothing imports would otherwise reach a release unobserved.

- The module sweep imports every file under `src/` and `bin/` with plain `node`, and every import resolves. `[integration]`
- `tsconfig.json` sets `allowImportingTsExtensions`, and `tsc --noEmit` accepts the extensioned specifiers. `[integration]`
- control — Control: introducing a deliberately extension-less internal import makes the module sweep fail. Without this the sweep can pass because it is not looking, which is the blind spot NFR5 exists to close. `[integration]`

## Environmental Requirements

### ENVR1 (must)

Development: Node 24 or later on the contributor's machine. Checkable by `node --version` reporting 24.0.0 or above. This is the floor that buys native type-stripping and a stable `node:sqlite` in one move.

- `node --version` on the contributor's machine reports 24.0.0 or above, and the repository's `engines.node` field declares the same floor. `[unit]`

### ENVR2 (must)

Development: `node --test` is the test runner. Checkable by the test script being `node --test` and no third-party test runner appearing in `devDependencies`.

- The package's test script is `node --test`, and no third-party test runner appears in `devDependencies`. `[unit]`

### ENVR3 (must)

Development: TypeScript available for type checking. Checkable by `tsc --noEmit` running from `devDependencies` and exiting zero.

- `tsc --noEmit` runs from `devDependencies` against the whole codebase and exits zero. `[integration]`

### ENVR4 (must)

Development: an OpenCode v2 beta CLI on the contributor's machine. Checkable by `opencode2 --version` reporting a `0.0.0-beta-*` build matching the `beta` dist-tag of `@opencode-ai/plugin`, so the CLI and the SDK the plugin is typed against are the same build. Without it neither the effective tool naming nor the skill-registration behaviour can be verified, and both gate the skill port.

- `opencode2 --version` on the contributor's machine reports a 2.x beta release. `[manual]`

### ENVR5 (must)

Development: a scratch OpenCode project to register into. Checkable by installing the plugin into a throwaway project and observing its MCP server reach connected state with the skills advertised.

- The plugin installs into a throwaway OpenCode project, its MCP server reaches connected state, and all skills appear as advertised. `[manual]`

### ENVR6 (must)

Development: git with hook support. Checkable by `git --version` reporting 2.9 or above and a hook installed at `.git/hooks/pre-commit` firing on commit.

- `git --version` reports 2.9 or above, and a hook installed at `.git/hooks/pre-commit` in a temporary repository fires on commit. `[integration]`

### ENVR7 (must)

Development: CI that runs the suite. Checkable by a CI job running the full `node --test` suite on Node 24 under plain `node`, plus the type check and the module sweep, on every push.

- A CI job runs the full `node --test` suite, the `tsc --noEmit` type check and the module sweep on Node 24 under plain `node`, on every push, and the run is observable in the repository's CI history. `[integration]`

### ENVR8 (must)

Production: Node 24 or later on the host running OpenCode. Checkable by the runtime the host invokes reporting 24.0.0 or above, and by each executable refusing with an explanatory message when it is below.

- Each of the five executables, run on a runtime below 24, refuses with a message naming the required version rather than failing on a syntax or module error. `[unit]`
- The runtime the host invokes on the user's machine reports 24.0.0 or above. `[target]`

### ENVR9 (must)

Production: OpenCode v2 as the host application. Checkable by the plugin loading under a 2.x host and its MCP server, skills and any commands appearing in that host's registries.

- Under an OpenCode 2.x host, the plugin loads and its MCP server, skills and any registered commands appear in that host's registries. `[target]`

### ENVR10 (must)

Production: a git repository in the user's project. Checkable by the guard hook installing at the repository's hook path and refusing a commit whose projection is stale.

- In a temporary git repository, the guard hook installs at the repository's hook path and refuses a commit whose projection is stale, with the explanatory output intact. `[integration]`

### ENVR11 (must)

Production: filesystem write access to `.dpm/` inside the project. Checkable by the database and the dump being created and rewritten there on a first run in a fresh project.

- On a first run in a fresh project, the database and the dump are created under `.dpm/` and rewritten on a subsequent publish. `[integration]`

### ENVR12 (must)

Development: a disposable isolated environment — a container or equivalent — that can be started with no language toolchain present and with networking disabled. Captured after the testing tags were assigned, because two integration criteria need it: the clean-install check under ENVX1 and the offline plan-and-publish cycle under ENVX4. Both are development tooling, so neither is a target claim; without this entry each would be satisfied by inspection rather than by running.

- A disposable isolated environment is available in CI, and both the clean-install check and the networking-disabled cycle run inside it rather than being asserted by inspection. `[integration]`

## Environmental Restrictions

### ENVX1 (must)

Development: native compilation must not be required. Checkable by a clean install completing with no node-gyp invocation, no C or C++ toolchain and no Python present.

- A clean install in an environment with no C or C++ toolchain and no Python completes successfully, with no node-gyp invocation in its output. `[integration]`

### ENVX2 (must)

Development: a loader or transpiler must not be required. Checkable by the test command and each executable's invocation passing no `--loader`, no `--import`, and no transpiler flag — the sources run on what Node 24 does by default.

- The test script and every executable's documented invocation pass no `--loader`, no `--import` and no transpiler flag. `[unit]`

### ENVX3 (must)

Development: Claude Code must not be required. Checkable by the full suite passing on a machine with no Claude Code installed and no `CLAUDE_`-prefixed environment variables set.

- The full suite passes in an environment with no Claude Code installed and no `CLAUDE_`-prefixed environment variables set. `[integration]`

### ENVX4 (must)

Production: network access must not be required at runtime. Checkable by a full plan-and-publish cycle completing with networking disabled.

- A full plan-and-publish cycle completes with networking disabled, making no outbound connection attempt. `[integration]`

### ENVX5 (must)

Production: a database service must not be required. Checkable by persistence needing only files under `.dpm/`, with no port bound and no external service contacted.

- Persistence uses only files under `.dpm/`: no port is bound and no external service is contacted during a full plan-and-publish cycle. `[integration]`

### ENVX6 (must)

Production: Claude Code artefacts must not be required. Checkable by the plugin running correctly in a project containing no `.claude/` directory and no CPM or dpm marketplace installation.

- The plugin runs correctly in a project containing no `.claude/` directory and no CPM or dpm marketplace installation. `[integration]`

## Architecture Decisions

### 01-01 — Clean fork, free to diverge

**Decision status**: accepted  

The repository vendors dpm v0.7.0 as its starting commit and takes no dependency — package, git, or copy-script — on the marketplace repository, with fixes flowing between the two by hand when worth it.

#### Clean fork with hand-carried fixes — chosen

Neither codebase constrains the other. Each is native to its host and free to take that host's idiom, and the cost — two codebases, fixes moved by hand — is paid in maintenance rather than in design compromise.

| Axis | Assessment |
| --- | --- |
| cost | Ongoing rather than up-front: every fix worth having in both places is applied twice, indefinitely. |
| reversibility | Low. Once the two codebases diverge, extracting a shared core later means reconciling two histories rather than one. Accepted knowingly — divergence is the point. |

#### Shared dpm-core package

Rejected. The extraction cost lands immediately and in full, while the benefit only materialises if both hosts stay API-compatible with the core — which OpenCode v2's beta churn makes unlikely within the year. It also forks the invariant part of the system in order to serve the variable part.

### 01-02 — The MCP server remains the tool boundary

**Decision status**: accepted  

The bundled MCP server stays the tool surface and the plugin's job is registration rather than reimplementation, keeping the typed contract and its conformance tests intact.

#### Keep the bundled MCP server; the plugin registers it — chosen

The MCP server is the most tested seam in dpm — 133 test files point at it — and the typed contract with its conformance tests carries over wholesale. The server also keeps working for any other MCP-speaking host. Shipping a proven child process beats shipping an unproven native surface.

| Axis | Assessment |
| --- | --- |
| complexity | A child process per session that native tools would not need, plus its startup and connection failure modes. |
| reversibility | High. The plugin is the seam, so migrating to native tools later changes registration and leaves skills and database untouched. This is why the decision is safe to take on incomplete information about v2. |

#### Native plugin tools via the host's tool transform

Rejected for this iteration, not on principle. It would eliminate the child process, but it discards the conformance suite and replaces a tested boundary with a beta API. It remains open as a future migration, and the plugin is the obvious seam to do it behind — which is why this decision is recorded as reversible rather than settled.

### 01-03 — Erasable-syntax TypeScript, run natively, on a Node 24 floor

**Decision status**: accepted  

The port is authored in TypeScript restricted to erasable syntax and ships sources rather than artefacts, with the Node floor raised from 22.5 to 24 so native type-stripping and a stable `node:sqlite` arrive together.

#### Erasable TypeScript on Node 24, sources shipped — chosen

OpenCode loads a plugin's TypeScript entry directly, and Node 24 type-strips erasable TypeScript natively — so types are available to authors with no artefact to build, publish or keep in sync. Raising the floor to 24 buys stable native execution and a stable `node:sqlite` in one move, and a new repository has no installed base to protect.

| Axis | Assessment |
| --- | --- |
| complexity | Shifted rather than removed: no build pipeline, but a permanent syntax restriction and an import-extension discipline that every file must observe and CI must police. |
| reversibility | Moderate. Adding a build step later is mechanical; lowering the Node floor afterwards is not, because code written against 24 spreads. |

#### TypeScript with a build step

Rejected. It lifts the syntax restrictions but introduces a compile between source and behaviour, an artefact that can drift from its source, and a publish step that can ship a stale build. It also breaks the property that each executable runs directly with `node`.

#### Stay on plain JavaScript

Rejected. It is the smallest change and forgoes the type checking that a port of this size most benefits from, in a codebase whose typed tool contract is the thing being preserved. The host's own examples are TypeScript, so this would also diverge from v2 idiom for no gain.

### 01-04 — SQLite remains the source of truth and the data model does not change

**Decision status**: accepted  

Schema, ULID identity, number sequences, the document supertype, coverage and the one-way projection are inherited without modification, and this specification re-decides nothing below the host boundary.

#### Inherit the data model unchanged — chosen

The port's risk is concentrated entirely at the host boundary, and changing anything beneath it would mix two kinds of failure in one release — a registration bug and a schema bug looking identical from the outside. Holding the model constant also means the corpus, the dump and the guard's byte-comparison all keep working as evidence that the port is correct.

| Axis | Assessment |
| --- | --- |
| reversibility | High, and deliberately deferred rather than closed. Any change beneath the boundary can be made after the port, against a system whose behaviour is known good. |

#### Revisit the model while porting

Rejected. A port is the moment every accumulated reservation about a schema asks to be addressed, and taking any of them turns a mechanical change with a byte-comparable outcome into a redesign with none. Anything worth changing beneath the boundary is worth its own decision afterwards.

### 01-05 — Skills are registered, not copied

**Decision status**: accepted  

The plugin registers skills from its own package rather than asking users to copy directories into the project, and skill IDs are prefixed `dpm-` because v2 skill IDs are a flat last-source-wins namespace where names like `review` and `status` invite silent collisions.

#### Register from the package with prefixed IDs — chosen

One install, one version, and an upgrade that replaces everything atomically. The `dpm-` prefix is the cheap defence against a flat last-source-wins namespace, where a generic ID like `review` or `status` is silently overridden by whatever registers after it — a failure that presents as a skill behaving oddly rather than as a collision.

| Axis | Assessment |
| --- | --- |
| reversibility | Low for the IDs specifically. Renaming a skill ID after release breaks anything that invokes it by name, so the prefix is effectively permanent from the first publish. |

#### Users copy skill directories into the project

Rejected. It puts twenty-three directories under the user's control with no version attached, so an upgrade becomes a merge the user performs, partial upgrades are the normal state, and the question of which version of a skill is running has no answer.

#### Register from the package with unprefixed IDs

Rejected. It reads better in the catalog and loses to any other source that registers a skill of the same name. The cost of the prefix is cosmetic; the cost of the collision is a skill that silently is not the one that was installed.

### 01-06 — Invocation is skill-first

**Decision status**: accepted  

Skill descriptions rewritten as model-facing language are the primary invocation path, with the prefixed slash entry alongside them, and FR11's explicit commands stand as the named contingency if catalog ergonomics disappoint in practice.

#### Skill-first, with explicit commands as a named contingency — chosen

The host advertises any skill carrying a description to the model and lists it in the slash catalog, so skill-first is the path the platform already provides and needs no machinery. Naming FR11 as the contingency inside this decision is what keeps the fallback attached to the risk rather than to somebody's memory.

| Axis | Assessment |
| --- | --- |
| cost | Borne by existing users rather than by the build: muscle memory for the old triggers stops working, and the replacement is less precise until FR11 is funded. |
| reversibility | High. FR11 adds explicit commands alongside the catalog without withdrawing anything, so the contingency is additive rather than a reversal. |

#### Reproduce slash ergonomics as the primary path

Rejected as the primary path, and retained as FR11. It preserves the precision that existing users have muscle memory for, but it builds a parallel invocation surface that the host does not need and that has to be maintained against a beta command API. Building it first would also mean never learning whether the catalog was sufficient.

### 01-07 — Registration is idempotent and disposal-clean

**Decision status**: accepted  

Setup returns a cleanup that disposes registrations, and no transform closes over mutable state a replay would observe differently — the server command, skill list and command list are computed before the transform registers.

#### Compute registrations before the transform, dispose on cleanup — chosen

The host replays transforms on reload, so a transform that reads mutable state observes something different on the replay than it did on the first pass — a bug that appears only after an edit and looks like flakiness. Computing the server command, skill list and command list up front makes replay identical by construction rather than by care.

| Axis | Assessment |
| --- | --- |
| complexity | Negligible, and lower than the alternative: computing up front is fewer moving parts than reasoning about what a replay observes. |

#### Compute registrations lazily inside the transform

Rejected. It is the natural way to write the code and the reason the failure is worth deciding against in advance: it works on first load, survives testing, and diverges only on reload — which is exactly the path a developer exercises most and a test suite exercises least.

### 01-08 — The model-facing surface is a profile, not a fork

**Decision status**: accepted  

Support for weaker models is a registration-time choice selected by plugin option against the same server and the same database, and the model-facing surface it varies is skill prose, the advertised tool surface, and the text of tool refusals — everything below those three is deterministic code no model reads.

#### A registration-time profile against one server and one database — chosen

Only the model-facing surface needs to vary, so only it should. Selecting a different skill set and a trimmed tool advertisement at registration keeps the schema, projection, dump and guard byte-identical across profiles — which is what lets a corpus planned under one continue under the other with no migration. The boundary includes tool refusal text, because a refusal is read by the model and acted on, which is the whole test of being model-facing.

| Axis | Assessment |
| --- | --- |
| cost | Near zero now — the skill and command lists are already computed before registration under the idempotency decision, so the seam is a parameter on work already being done. |
| reversibility | High. Nothing behind the seam is built in this iteration, so the profile mechanism can be widened, narrowed or removed while the deferred specification is still unwritten. |

#### A parallel repository for constrained models

Rejected. It would fork the invariant part of the system — schema, identity, projection, dump, guard — in order to vary the variable part, and the two copies would then have to be kept byte-identical by discipline rather than by construction. It also splits the corpus, so a project could not move between them.

#### A profile whose boundary stops at skill prose and tool schemas

Rejected, and this is the correction the review produced. Drawing the boundary above refusal text makes the decision internally inconsistent the moment a profile wants to rewrite an error message, and leaves the deferred lite specification inheriting a constraint it cannot satisfy without reopening this decision.

## Dependencies

- builds_on → 01
