# opencode-dpm: DPM Ported to OpenCode v2

**Number**: 01  
**Status**: pending  

**Type**: architecture  
**Scope**: architect, do, epics, spec  

## Summary

Clean fork of dpm v0.7.0 into a standalone OpenCode v2 repository; no Claude Code compatibility in this repo, no OpenCode v1 support, no shared core with the marketplace repo.

The MCP server stays the tool boundary — skills write exclusively through typed tools, no skill contains SQL, nothing parses prose. Native plugin tools (`ctx.tool.transform`) are deliberately not used this iteration.

Erasable-syntax TypeScript, run natively by Node ≥ 24. No build step, no runtime dependencies beyond `@opencode-ai/plugin`, no native modules. One `enum`, namespace with runtime meaning, or parameter property breaks native execution.

Skills are registered from the installed package via `ctx.skill.transform`, never copied into `.opencode/skills/`; skill IDs are prefixed `dpm-` because v2 IDs are a flat last-source-wins namespace. Invocation is skill-first — `/dpm:` does not exist in v2.

Schema, ULID identity, number sequences, the document supertype, coverage, the one-way projection, the dump and the guard are inherited unchanged and must stay byte-deterministic across the port.

No skill body may name a Claude Code mechanism (`mcp__plugin_`, `/dpm:`, `CLAUDE_PLUGIN_ROOT`, `.claude/`) — enforced as a CI grep, not a review convention.

The model-facing surface is a registration-time profile, not a fork: a `lite` profile registers a reduced skill set and trimmed tool advertisement against the same server and the same database.

## Problem Summary

**Status:** Draft for review
**Repository:** `ninthspace/opencode-dpm` (new, standalone)
**Fork point:** Clean fork of `dpm` v0.7.0 from `ninthspace/claude-code-marketplace`

DPM exists today as a Claude Code plugin: an MCP server over `node:sqlite`, twenty-three skills that write through typed tools, a one-way markdown projection, a committed `.sql` dump, and a pre-commit guard. OpenCode v2 has a different extension model — TypeScript plugins loaded via `Plugin.define`, with the plugin context registering MCP servers, skills, commands, and tools programmatically — and its beta explicitly warns that plugin APIs may change.

The port is a separate repository so that neither codebase constrains the other. The Claude Code plugin continues to live in the marketplace; this repository targets OpenCode v2 only, diverges where v2 idiom differs, and accepts the maintenance cost of two codebases in exchange for each being native to its host.

## Functional Requirements — Must Have

- **FR1 — Single-command install.** `opencode2 plugin add github:ninthspace/opencode-dpm` (and later the npm form) yields a working DPM: MCP server registered and connected, all skills advertised, nothing further to copy into the project.
- **FR2 — The MCP server is the tool surface.** The plugin registers the bundled server via `ctx.mcp.transform` (`draft.set("dpm", { type: "local", command: [...] })`). Skills continue to write exclusively through typed MCP tools; no skill contains SQL and nothing parses prose. Tool *behaviour* and schemas carry over from v0.7.0 unchanged.
- **FR3 — Skills registered from the package.** All skills port and are registered via `ctx.skill.transform`, with `location` pointing into the installed package so directory-based skills keep their supporting-file sample. Skill prose is revised wherever it names host mechanics: tool names take v2's effective naming, and `/dpm:spec`-style triggers become the v2 invocation story (see AD6).
- **FR4 — Persistence parity.** Fresh-clone restore from `.dpm/dpm.sql`, deterministic dump on publish, the empty-database restore asymmetry (AD14 in the source spec), read-only server mode, and the Node-floor refusal all carry over.
- **FR5 — The five executables port.** `dpm-mcp`, `dpm-guard`, `dpm-publish`, `dpm-import`, `dpm-merge` — same responsibilities, TypeScript sources, still runnable directly with `node`.
- **FR6 — Pre-commit guard unchanged in kind.** It remains a git hook that regenerates and compares, fixes nothing, and refuses with the four-case explanation. The install instruction is updated for where OpenCode places plugin packages, and the missing-symlink warning on server start (hook-check) carries over.
- **FR7 — Test suite ports.** The `node --test` suite, including the corpus snapshot tests, runs against the TypeScript sources in CI.

## Functional Requirements — Should Have

- **FR8 — Permission-aware behaviour.** Skills behave correctly under `ask` and `deny` rules for the `skill` action; the README documents recommended permission entries.
- **FR9 — Session scratch via plugin storage.** Anything that was per-session scratch keyed by an environment variable in Claude Code uses `ctx.storage` where a DB session row is not already the answer. No transient files land in the project tree.
- **FR10 — README for a v2 audience.** Install, first run, guard symlink, and "when the guard refuses" rewritten for `opencode2`; the CPM MIGRATION.md does not carry over (see Won't Have).

## Functional Requirements — Could Have

- **FR11 — Slash-catalog commands.** Register `ctx.command.transform` entries that prompt the session into a named skill, restoring something close to the `/dpm:spec` ergonomics if skill-as-slash proves insufficient.
- **FR12 — HTTP skill catalog.** Publish the skills as a v2 HTTP catalog for teams that want skills without the plugin. Low value while tools require the plugin anyway.
- **FR13 — Lite profile for local open-weight models.** A `profile: "lite"` plugin option registers a reduced model-facing surface for constrained local models (target: Qwen3.8-27B under MTPLX). The selection criterion is the daily loop, not simplicity, on the assumption the full profile stays one config edit away against the same database: **quick** (the flagship — right-sized single-record changes), **spec** (cut hardest: fewer gates, no Perspectives), **epics**, **do** (its verify-record rhythm is what keeps a small model honest), **status** (cheap re-orientation for short-context session restarts), **publish** (or lite cannot commit past the guard), and **consult** constrained to a single persona — panel mode stays full-profile, since multi-persona breadth is the capability gap itself. Excluded by category: judgment-breadth facilitation (party, review, brief, discover, architect), autonomy (ralph), and corpus maintenance (pivot, retro, library, audit, inspect, present, artifact, archive, templates, clean), all of which run under the full profile against the shared corpus. All skills rewritten as terse imperative checklists, tool descriptions and schemas hard-trimmed, conventions inlined instead of the read-at-startup file. The database, schema, projection, dump, and guard are byte-identical across profiles — a corpus planned under lite continues under full, and vice versa, with no migration.
- **FR14 — Lite-profile error messages a small model can act on.** Tool refusals in lite are single-sentence, name the field, and state the correction, on the working assumption that a 4-bit 27B retries from the error text rather than from re-read documentation.

## Won't Have (this iteration)

- Claude Code compatibility in this repository — the marketplace repo remains the home of the Claude Code plugin.
- OpenCode v1 support.
- CPM migration tooling — anyone on CPM migrates via the existing Claude Code dpm first.
- CLI/TUI plugin work (`cli.json` plugins, theme or keybinding integration).

## Non-Functional Requirements

- **NFR1 — Zero runtime dependencies.** `node:sqlite` stays; no native modules, no install-time compilation. The only `dependencies` entry is `@opencode-ai/plugin`.
- **NFR2 — No build step.** TypeScript throughout, restricted to erasable syntax so Node runs the sources directly (see AD3). `tsc --noEmit` is a CI check, not a compile.
- **NFR3 — Beta churn tolerance.** The plugin pins `@opencode-ai/plugin@beta` and the README states plainly that v2 is beta and entrypoints may move under it. API breakage is expected maintenance, not a bug.
- **NFR4 — Determinism.** Dump output, projection output, and ULID/number allocation behaviour remain byte-stable across the port; the guard depends on it.

## Architecture Decisions

### AD1 — Clean fork, free to diverge

The repository vendors the dpm v0.7.0 sources as its starting commit and takes no dependency — package, git, or copy-script — on the marketplace repo. Fixes flow between the two by hand when worth it. The alternative (a shared `dpm-core`) was rejected: the extraction cost lands immediately, the benefit only materialises if both hosts stay API-compatible with the core, and v2's beta churn makes that unlikely this year.

### AD2 — The MCP server remains the tool boundary

v2 offers native plugin tools (`ctx.tool.transform`), which would eliminate the child process. Rejected for this iteration: the MCP server is the most tested seam in dpm, the typed contract and its conformance tests carry over wholesale, and the server keeps working for any other MCP-speaking host. The plugin's job is registration, not reimplementation. Native tools remain open as a future migration with the plugin as the obvious seam to do it behind.

### AD3 — Erasable-syntax TypeScript, run natively; Node ≥ 24 floor

The port is authored in TypeScript but ships sources, not artefacts. OpenCode loads the plugin's `.ts` entry directly (its own manifest examples export `./src/index.ts`), and Node 24 type-strips erasable TypeScript natively — which covers the whole codebase as long as it avoids non-erasable constructs (`enum`, namespaces with runtime meaning, parameter properties). The Node floor rises from 22.5 to 24: it buys stable native TS execution and a stable `node:sqlite` in one move, and a new repo has no installed base to protect. The floor check in each executable ports with the new number and the same refuse-with-a-message behaviour.

### AD4 — SQLite remains the source of truth; the data model does not change

Schema, ULID identity, number sequences, the document supertype, coverage, and the one-way projection are inherited from the source spec's AD1–AD11 without modification. This spec deliberately re-decides nothing below the host boundary.

### AD5 — Skills are registered, not copied

The plugin registers skills from its own package via `ctx.skill.transform` rather than asking users to copy directories into `.opencode/skills/`. One install, one version, and an upgrade replaces everything atomically. Skill IDs are prefixed `dpm-` (`dpm-spec`, `dpm-do`, …) because v2 skill IDs are a flat, last-source-wins namespace and unprefixed names like `review` and `status` invite silent collisions.

### AD6 — Invocation is skill-first

`/dpm:spec` does not exist in v2. Skills with a `description` are advertised to the model and appear in the slash catalog unless `slash: false`; that is the primary invocation path, and skill descriptions are rewritten so "trigger on /dpm:spec" becomes model-facing language plus the `dpm-` slash entry. FR11's explicit commands exist as a fallback if the catalog ergonomics disappoint in practice.

### AD7 — Registration is idempotent and disposal-clean

`setup` returns a cleanup that disposes registrations; transforms are written to be replayed (v2 replays transforms on reload). No transform closes over mutable state that a replay would observe differently — server command, skill list, and command list are computed before the transform registers.

### AD8 — The model-facing surface is a profile, not a fork

Only two parts of dpm are model-facing: skill prose and the advertised tool surface. Everything below them — schema, identity, projection, dump, guard — is deterministic code no model touches. Supporting weaker models is therefore a registration-time choice, selected via v2 plugin options (`{ "options": { "profile": "lite" } }`), not a parallel repository: the plugin registers a different skill set and trimmed tool advertisement against the same server and the same database. A parallel repo was rejected because it would fork the invariant part to vary the variable part. The profile also bounds context cost deliberately: the target runtime's decode rate roughly halves between 1K and 16K tokens of context, so the lite surface budget (schemas plus any one skill body) is a number, set and tested, not an aspiration.

## Repository Layout

```
opencode-dpm/
├── src/
│   ├── index.ts              # Plugin.define entry: MCP + skills (+ commands)
│   ├── server/               # ported dpm MCP server
│   ├── tools/                # typed tool implementations
│   ├── projection/ …         # coverage, dump, guard, import, merge, …
├── bin/                      # dpm-mcp.ts, dpm-guard.ts, dpm-publish.ts, …
├── skills/
│   ├── dpm-spec/SKILL.md
│   ├── dpm-do/SKILL.md …
├── hooks/pre-commit
├── shared/                   # skill-conventions.md, status-model.md
├── tests/
├── package.json              # name: opencode-dpm, exports ./src/index.ts
└── opencode.jsonc            # dev: loads ./src/index.ts as a local plugin
```

## Risks and Verification Items

1. **Effective MCP tool names in v2.** Skill prose names tools; the exact rendered name for MCP-provided tools (namespacing, `_` substitution) must be verified against a running beta before skills are rewritten. First implementation task.
2. **`ctx.skill.transform` and supporting files.** The docs say directory-based `SKILL.md` skills get the ten-file sample; confirm registered skills with a package `location` behave the same. If not, skills inline their critical references.
3. **Beta API drift.** Transforms, hook names, and `SkillInfo` shape may change before 2.0 stable. Mitigated by NFR3 and by keeping the plugin entry thin.
4. **Erasable-syntax discipline.** One `enum` breaks native execution. CI runs the test suite under plain `node` — no loader — so a violation fails immediately.
5. **Guard symlink target.** OpenCode's package cache location for git-installed plugins needs confirming so the README's absolute-symlink instruction is right.
6. **Local-model tool-call adherence.** The lite profile assumes a 4-bit 27B can drive typed MCP tools reliably enough for gated facilitation. Unproven; validate with one skill (`dpm-spec` lite) against MTPLX before building the rest, and compare the 8-bit Optimized Quality build, which is markedly closer to the bf16 distribution and the likelier fit for judgment-heavy planning sessions.

## First Milestones

1. Repo bootstrap: vendor v0.7.0, rename, TS conversion of `bin/` + `src/server/`, floor bump, suite green under Node 24.
2. Plugin entry: MCP registration working end-to-end in `opencode2` against a scratch project; verify risk items 1–2.
3. Skill port: pilot one skill end-to-end first (`dpm-spec` — it exercises gates, tool calls, and the shared conventions file) against a scratch project before the batch pass; then prefix IDs, rewrite tool names and invocation prose, register from package. **Acceptance criterion:** no skill body names a Claude Code mechanism (`mcp__plugin_`, `/dpm:`, `CLAUDE_PLUGIN_ROOT`, `.claude/`) — enforced as a CI grep, not a review convention.
4. Guard and docs: hook path, README, permission guidance.
5. Publish: npm `opencode-dpm@0.1.0`, install tested from the published artefact, not the working tree.
6. Lite profile (after 1–5 are stable): profile option plumbing, context budget set and measured, `dpm-spec` lite piloted against MTPLX per risk 6, then the remaining core skills.
