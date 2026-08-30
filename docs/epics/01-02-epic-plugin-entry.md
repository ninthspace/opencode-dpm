# Plugin entry and MCP registration

**Number**: 01-02  
**Source spec**: 01  
**Status**: complete  

## The effective MCP tool naming under OpenCode v2

**Observed against a running host, not read from documentation.** `opencode2 v0.0.0-beta-18684`, a scratch project, and a throwaway probe plugin that called `ctx.tool.transform` and wrote the draft's ids to a file. Everything below is what that file contained.

## The rule

A tool provided by an MCP server is rendered to the model as:

```
<server key>_<tool name>
```

One underscore, and nothing else. dpm registers its server under the key `dpm`, so `create_spec` is advertised as **`dpm_create_spec`**, `list_epic` as `dpm_list_epic`, and so on for all 183.

**Character substitution:** every character in the server key outside `A-Za-z0-9_-` becomes `_`. The hyphen survives. Established by registering a second server under the key `dpm-odd.name x` and reading back what its tools were called: `dpm-odd_name_x_adopt_session`. So the dot and the space were replaced and the hyphen was not.

This is the same substitution rule Claude Code documents. What differs is the namespace around it.

## What this replaces

Under Claude Code a plugin-bundled server's tools were dispatched as `mcp__plugin_<plugin>_<server>__<tool>`, so dpm's skills were written to call `mcp__plugin_dpm_dpm__create_spec` — the two `dpm` parts being the plugin name and the server key, not one name said twice. v2 has no `mcp__` prefix and no plugin segment: the server key alone is the namespace.

| | Claude Code v0.7.0 | OpenCode v2 |
| --- | --- | --- |
| `create_spec` | `mcp__plugin_dpm_dpm__create_spec` | `dpm_create_spec` |
| prefix source | plugin name **and** server key | server key alone |
| separator | `__` on both sides | a single `_` |

Every one of the twenty-three skill bodies names tools in the old form. Rewriting them is the skill-port epic's work, and **this section is the reference it is rewritten against** — which is why it is recorded before any prose is touched.

## What is registered alongside

The host's own built-in tools share the flat namespace and carry no prefix at all: `patch`, `edit`, `glob`, `grep`, `question`, `read`, `shell`, `skill`, `subagent`, `webfetch`, `websearch`, `write`. A dpm tool named `read` or `write` would therefore have collided had the prefix not been there; it is, so none do.

## The surface itself is unchanged

The port advertises 183 tools and the released v0.7.0 advertises 183 tools, and the two lists — every name, every description, every input schema — are byte-identical when both are sorted by name. The oracle is `tests/fixtures/v070-tool-surface.json`, captured by running the released `bin/dpm-mcp.js` out of the installed marketplace package rather than by writing down what this repository produces.

So the port changes how a tool is *addressed* and changes nothing about what the tools are.

## Skill supporting files: the go/no-go

**The answer is no for native resolution, and yes for the skills — because the plugin resolves the path itself at registration.** That is neither of the two outcomes the story anticipated, and it is cheaper than both.

## What was asked

All twenty-three skills open with the same sentence:

> Follow the shared conventions in `dpm/shared/skill-conventions.md` — read that file at startup.

One of them also names `dpm/shared/status-model.md`. Those are the only supporting files any skill reads; every other `dpm/…` path in the prose is an illustrative example, not a file to open.

Under Claude Code that path resolved because the host laid the plugin out beneath a directory called `dpm`. The question for v2 was whether a skill registered with a package `location` gets the same courtesy.

## What was observed

Against `opencode2 v0.0.0-beta-18684`, with a sample skill registered from a directory holding a `SKILL.md` and a sibling supporting file:

- `Skill.Info.location` **is preserved by the registry**, verbatim, as the absolute path of the skill's directory inside the package.
- `content` is likewise stored verbatim. The registry does no rewriting of the body, so a relative path in the prose stays a relative path.
- The host's built-in `skill` tool describes itself as loading "a specialized skill's instructions and resources", but nothing in `Skill.Info` declares a base directory for the model's *file* tools, and those work from the project directory.

A user's project has no `dpm/shared/` in it. So the reference as written resolves against nothing, and left alone every one of the twenty-three skills would begin by failing to read its own conventions.

**What was not observed:** whether the host, on invoking a skill, hands the model the skill's location in a form it can read siblings from. Establishing that needs a model turn, and no model provider was reachable in this environment. It is left open deliberately, because the decision below does not depend on the answer — if the host does help, the substitution is harmless; if it does not, the substitution is what makes the skills work.

## The decision

`src/plugin/skills.ts` rewrites `dpm/shared/<name>.md` to an absolute path under the package root as each skill is read, before it is registered. The reference the maintainer edits still says `dpm/shared/skill-conventions.md`; the reference the model receives is a path that exists on the machine it is running on.

The substitution **refuses rather than guesses**: a target that is not in the package throws at registration. A confident absolute path to nothing is worse than the original relative path, because the original fails visibly at the first read while the rewritten one fails the same way while looking correct.

## Why not the fallback the specification named

The story's negative case named inlining the shared conventions into all twenty-three skill bodies, and its cost is why it was not taken:

| | Inline into 23 bodies | Resolve the path at registration |
| --- | --- | --- |
| copies of the conventions | 23, which drift | 1 |
| added to each skill | ~15KB of identical prose | one absolute path |
| model context per invocation | the whole conventions file, needed or not | unchanged |
| what a maintainer edits | twenty-three copies | one file |
| cost to build | a rewrite of every skill | one function, one regex |

Inlining also breaks the mechanism the conventions system is built on: `tests/support/skills.js` resolves a skill's tool references *per named procedure*, so that dropping a `Follow the shared **Library Check** procedure` sentence drops its tools with it. A body with everything inlined names every tool any procedure uses, and that check stops being able to see its subject.

The fallback remains available and is not withdrawn — if a future host makes registration-time substitution impossible, inlining is what it falls back to.

## Two amendments to story 4's dependency criteria

Both were written before the SDK was opened, and both are amended with the same citation rather than worked around.

## `dependencies` is empty, not "exactly one entry"

**Was**: *The package's `dependencies` contains exactly one entry, `@opencode-ai/plugin`.*
**Now**: *The package's `dependencies` is empty. `@opencode-ai/plugin` is needed for its types alone, so it sits under `devDependencies` and nothing is fetched at install.*

**Citation.** `node_modules/@opencode-ai/plugin/dist/promise/plugin.js` is, in full:

```js
export function define(plugin) {
    return plugin;
}
```

The entry is an object literal checked with `satisfies Plugin.Plugin`, which gives the identical compile-time check with nothing left at run time. Importing the package for real would fetch its eight dependencies — `@ai-sdk/provider`, `@opencode-ai/ai`, `@opencode-ai/client`, `@opencode-ai/protocol`, `@opencode-ai/schema`, `@standard-schema/spec`, `effect`, `zod` — into every user's install in order to call a function that returns its argument.

`import type` is erased by both Node's type-stripper and `tsc` before evaluation, so the type surface is available while the runtime graph stays empty. This is the same amendment story 1 made to NFR1; these two criteria were the copies of the old assumption that had not been reached yet.

**The requirement's headline is strengthened, not relaxed.** Zero runtime dependencies is now literally zero, and the nine `deepEqual(dependencies, {})` assertions across the suite went on passing untouched.

## Pinned to the version, not to the tag

**Was**: *The plugin dependency is pinned to the `beta` tag.*
**Now**: *…pinned to the exact version the `beta` dist-tag resolves to, rather than to the floating tag itself.*

**Citation.** `npm view @opencode-ai/plugin dist-tags.beta` → `0.0.0-beta-18684`, which is what the manifest carries and what the installed `opencode2` reports for itself. A manifest naming `beta` is not a pin: two installs a day apart compile against different type surfaces, and the failure surfaces as a type error in a file nobody touched. The tag is how the version is *chosen* and re-checked; the version is what is written down.

## Milestone 2, run end to end in a scratch project

One install, one host, everything the epic promised, observed from inside the running registry rather than inferred from the code. Host: `opencode2 v0.0.0-beta-18684`, Node 24.20.0, a throwaway project outside the checkout holding nothing but an `opencode.json`.

## The configuration that works

```json
{
  "plugins": [
    {
      "package": "/absolute/path/to/opencode-dpm/src/plugin/index.ts",
      "options": { "profile": "full" }
    }
  ]
}
```

**`plugins` is an array of `string | { package, options }`, not a map.** The map form was tried first and was silently discarded — the host emitted `configuration normalization diagnostic … path=$.plugins kind=invalid action="skipped malformed recognized value"` to the log and started with no plugin, and every CLI listing then correctly reported nothing. The schema is `@opencode-ai/schema/dist/config/plugin.js`: `Entry` is `{ package: string, options?: Record<string, unknown> }` and `Plugins` is an array of `string | Entry`. `package` names the entry **file**; a directory does not resolve, because the host `import()`s the string verbatim with `?mtime=<n>` appended.

## What the registry held

Read by a second plugin in the same project that dumps `skill.transform(draft => draft.list())`, `mcp.transform(draft => draft.list())` and `tool.transform(draft => draft.list())` to a file — the technique that has now unblocked four separate questions in this epic.

| | |
| --- | --- |
| MCP servers | `dpm`, reported `✓ dpm connected` on three consecutive checks |
| tools advertised | 195 total: **183 prefixed `dpm_`**, 12 host built-ins with no prefix |
| old-form names | **0** — nothing carries `mcp__` |
| skills registered | 55 total, **23 of them dpm's**, every one prefixed `dpm-` |
| duplicate skill ids | **0** |
| `location` | the package's own directory, e.g. `…/opencode-dpm/skills/architect` |
| conventions reference | an absolute path that **exists and opens** — first line read back as `# dpm Shared Skill Conventions` |
| skills whose conventions path opens | **23 of 23** |
| skills still naming the relative form | **0** |

The tool count is the story-2 oracle's number: 183 is exactly what the released v0.7.0 advertises, so the surface crossed the host boundary without losing or gaining a tool.

## The reload

The host was restarted and the log showed `loading plugin id=…/src/plugin/index.ts` **twice** in the new lifetime. That count is the control: without it, "nothing duplicated" is equally satisfied by a reload that never happened. Afterwards the registry held 55 skills, 23 of them dpm's, 0 duplicate ids, one server, and 23 of 23 conventions paths still opening — identical to before.

`tests/plugin-reload.test.js` encodes why that is the plugin's doing rather than the host's kindness. The two registrations differ: `mcp.set(name, config)` is keyed and cannot duplicate, while `skill.add(skill)` appends and would double on a second load. The entry returns a cleanup disposing both in reverse, and the test drives it against a registry that *persists* across transforms — with a control that runs `setup` twice **without** the cleanup and requires the duplication to appear, since a registry that silently deduped would pass the real test for the wrong reason.

## One rough edge worth writing down

The CLI's `mcp list` and `plugin list` report nothing for the first second or two after `service start`, then report correctly and stably. It is a cold-start race in the listing commands, not a registration failure — the log shows the plugin loading throughout, and the probe written from inside the host sees the full registry while the CLI still says "No MCP servers configured". Anyone verifying by CLI should run the command twice before believing the first answer.

## Story 1 — Plugin entry, MCP registration and the profile seam

**Status**: complete  
**Blocked by**: Story 2, Story 3, Story 4, Story 5  

### Acceptance Criteria

- The plugin's entry object registers the bundled MCP server via `ctx.mcp.transform`, setting a local server entry whose command runs the packaged executable. `[integration]`
- In a scratch OpenCode v2 project, the plugin loads and its MCP server reaches connected state. `[manual]`
- The published package's manifest declares the plugin entry, and the server command path resolves to an existing file inside the installed package tree. `[integration]`
- must NOT — Installation requires the user to copy a file, hand-edit project configuration, or run a post-install step. `[integration]`
- The set of skills registered is computed from a profile selection resolved at registration time. `[unit]`
- must NOT — The plugin entry hardcodes the skill list. `[unit]`
- The registration transforms close over no session-specific state, so replaying them on reload produces the same registrations. `[unit]`
- must NOT — A registration transform writes to the user's project configuration on disk. `[integration]`
- `opencode2 --version` on the contributor's machine reports a `0.0.0-beta-*` build matching the `beta` dist-tag of `@opencode-ai/plugin`. `[manual]`

### Task 1 — Add @opencode-ai/plugin at the beta tag and scaffold the Plugin.define entry

**Status**: complete — The SDK is a devDependency taken import-type-only, so `dependencies` stays `{}`; the entry is a plain object with `satisfies Plugin.Plugin` rather than a `Plugin.define` call, per the amendment to criterion 1.  

`src/index.ts` only. The transforms are tasks 2 and 3.

### Task 2 — Register the MCP server via ctx.mcp.transform

**Status**: complete  

A local server entry whose command runs the packaged `dpm-mcp`. Addresses the server, not skills or commands.

### Task 3 — Compute the registration set from a profile selection

**Status**: complete  

The seam the profile decision requires. Addresses how the list is derived, not what the deferred lite profile eventually contains.

### Task 4 — Verify registration in a scratch OpenCode v2 project

**Status**: complete — Observed in a throwaway project: `dpm (active)`, `✓ dpm connected`, and all 23 skills registered under `dpm-` ids with directory locations. Three findings the spec did not have: the config key is `plugins` not `plugin`; `package` is import()ed as a path so a directory does not resolve and the entry file does; and the host runs the TypeScript source directly. Nothing was written to the project or to the user's global config.  

Manual observation of connected state, recording what the host actually did rather than what the API documents.

### Task 5 — Write tests for "Plugin entry, MCP registration and the profile seam"

**Status**: complete  

Covers the criteria tagged `unit` and `integration`, including both rejections: no hardcoded skill list, and no transform writing to project configuration.

### Retro

- Adding one devDependency turned eleven tests red, then six more, and every one was a duplicate reading rather than a broken property. `@opencode-ai/plugin` is taken `import type` only, so `dependencies` stayed `{}` and the nine assertions about it were untouched — exactly as planned. What broke instead was the *other* claim: "nothing under src imports a package". Four separate readings of that existed — `sources.js:staticImports`, `sweeps.js:importSpecifiers`, and inline regexes in `server.test.js` and `projection.test.js` — and only the first had been taught, during the TypeScript port, that `import type` is erased before evaluation. The three that had not went on reporting a runtime dependency that does not exist. Consolidating them onto the one reading fixed all six at their source, and the same shape recurred twice more: the `.node` sweep in `plugin.test.js` walked `node_modules` and read a transitive dev package's prebuilt binary as something dpm ships, and CI's clean-install grep matched the *name* `node-gyp-build-optional-packages` — a script that selects a prebuilt and compiles nothing — rather than the act of compiling. Both were replaced by artefact checks with controls. The lesson is narrower than "avoid duplication": a helper written to end a duplication only ends it for the callers that were migrated, and the copies left behind fail silently in the direction of a false report.

- The scratch-project run was worth three tasks of reading, and every finding contradicted an assumption the plan had written down. The config key is `plugins`, not `plugin` — the wrong key is accepted and normalised away with a diagnostic in the log and no error at the CLI, so the first attempt looked like a plugin that would not load. `package` is `import()`ed as a literal path with `?mtime=` appended, so a *directory* does not resolve and `exports` is never consulted for the filesystem-path form; the entry *file* is what a local config must name. And the host runs the TypeScript source directly, since it is Bun-compiled. The connection failure that followed was dpm's own ENVR8 floor check refusing under Node 22 — correct behaviour, indistinguishable at the CLI from a broken registration ("MCP error -32000: Connection closed"), and resolved by restarting the background service from a shell with Node 24 first on PATH. Reading the registry took a throwaway probe plugin that wrote `ctx.skill.list()` to a file, after three CLI and HTTP routes returned nothing useful; that probe is the technique to reach for again, because it asks the host what it holds rather than asking a test what it thinks the host holds.

## Story 2 — Establish the effective MCP tool naming under v2

**Status**: complete  
**Blocked by**: Story 5  

### Acceptance Criteria

- The effective rendered name of MCP-provided tools under v2 — namespacing and character substitution — is established against a running beta host. `[manual]`
- The established naming is recorded as a written section on this epic before any skill prose is rewritten. `[integration]`
- The advertised tool set and every tool schema match v0.7.0's, compared against a stored snapshot of the tool surface. `[integration]`

### Task 1 — Observe the rendered tool names against a running beta host

**Status**: complete — Observed against opencode2 v0.0.0-beta-18684: `<server key>_<tool>`, a single underscore, no `mcp__` prefix and no plugin segment. Substitution established by registering a second server as `dpm-odd.name x` and reading back `dpm-odd_name_x_adopt_session` — hyphen survives, everything outside `A-Za-z0-9_-` becomes `_`.  

Namespacing and character substitution. The first implementation task of this milestone, because skill bodies name tools.

### Task 2 — Record the naming as a section on this epic

**Status**: complete  

The reference the twenty-three skill bodies are rewritten against in the skill-port epic.

### Task 3 — Snapshot the tool surface and compare against v0.7.0

**Status**: complete — The snapshot is a real oracle rather than a self-portrait: `tests/fixtures/v070-tool-surface.json` was captured by running `bin/dpm-mcp.js` from the installed marketplace package at v0.7.0. The port's 183 tools are byte-identical to it — every name, description and input schema. `parity-v070.test.js` now refuses to let the file be modified or deleted.  

Addresses the advertised set and every schema, not the rendered naming.

### Task 4 — Write tests for "Establish the effective MCP tool naming under v2"

**Status**: complete  

Covers the snapshot comparison and the recorded section. The observation itself is tagged `manual`.

### Retro

- A real oracle for the tool surface was already on this machine and nearly went unused. Criterion 3 asks the advertised set and every schema to match v0.7.0 "against a stored snapshot", and the obvious move — generate the snapshot from the port and commit it — produces a self-portrait: it would pass on the day it was written and go on passing through any consistent drift, which is precisely the failure `parity-v070.test.js` was written to name. What made it a genuine comparison is that the released v0.7.0 is installed at `~/.claude/plugins/cache/ninthspace-marketplace/dpm/0.7.0/`, so `bin/dpm-mcp.js` from the *release* could be run and its `tools/list` reply captured. The two surfaces came back byte-identical at 168,465 bytes — 183 tools, every description, every schema — which is a far stronger result than a self-generated snapshot could ever have reported, and it cost one command. The oracle then joined `v070-dump.sql` under the existing must-NOT against rewriting a fixture, and tripped `fixtures.test.js`'s rule that no fixture is a parseable document; that rule was narrowed by naming the two oracles individually rather than exempting an extension, because an extension-shaped hole would let a corpus arrive as JSON. The lesson: before generating an expected value, look for a copy of the thing being ported.

## Story 3 — Resolve the skill supporting-files go/no-go

**Status**: complete — Both criteria met: 23 of 23 skill bodies carry an absolute conventions path that opens, and the go/no-go is recorded on the epic ahead of any prose rewrite.  
**Blocked by**: Story 5  

### Acceptance Criteria

- A registered skill's supporting files resolve from the package location, so a skill that reads the shared conventions file at startup finds it. `[manual]`
- The go/no-go outcome is recorded as a written decision on this epic before any skill prose is rewritten, and where the answer is negative the decision names inlining as the fallback and its cost. `[integration]`

### Task 1 — Register one sample skill with a package location and test whether it resolves the shared conventions file

**Status**: complete — Answered by probe against opencode2 0.0.0-beta-18684: `location` and `content` are stored verbatim, the registry rewrites nothing, and a relative `dpm/shared/` path resolves against the project directory where it does not exist. Whether the host hands the model a base directory for sibling reads could not be established — it needs a model turn and no provider was reachable — and the decision taken makes the question moot.  

Addresses supporting-file resolution only. A full skill port is the next epic.

### Task 2 — Record the go/no-go as a written decision on this epic

**Status**: complete — Recorded as section "Skill supporting files: the go/no-go" on epic 01-02, before any skill prose was rewritten. It names the inlining fallback and prices it in a table — 23 drifting copies, ~15KB per body, model context on every invocation — and adds the reason the specification could not have known: inlining defeats the per-procedure tool resolution `tests/support/skills.js` performs.  

On a negative answer the decision names inlining the shared conventions into twenty-three skills as the fallback, and states its cost.

### Task 3 — Write tests for "Resolve the skill supporting-files go/no-go"

**Status**: complete — `tests/skill-supporting-files.test.js`, six tests. Four cover the resolution — every registered body names a shared path that opens, the relative form is gone from what the host is handed, the substitution refuses a missing target, and a planted package resolves against itself while the project directory holds nothing. Two cover the recorded decision, read from the projection rather than the database. The refactoring pass extracted `tests/support/package-tree.js` from the builder this file and `plugin-entry.test.js` had both grown.  

Covers the recorded-decision criterion. The resolution itself is tagged `manual`.

### Retro

- The story was framed as a yes/no question about the host — does a registered skill's `location` let it reach a sibling file — with a fallback prepared for "no". Neither branch was taken, because the question turned out to be answerable on our own side: substituting the absolute path at registration means the host's behaviour stops mattering. The half-hour spent trying to make the host answer it was the part that was wasted, and it was spent first: executing the built-in `skill` tool from a probe failed schema validation on a hand-built `Tool.Context` with branded ids, several HTTP and CLI routes returned HTML or nothing, and the local model provider was unreachable. Three dead ends before asking whether the question needed answering at all.

The prepared fallback was what made the wrong branch attractive. Inlining 15KB into twenty-three bodies was written into the story as the negative case, so it read as the sanctioned answer rather than as the expensive one — and its worst cost was not the duplication but that it would have broken `tests/support/skills.js`'s per-procedure tool resolution, which nobody would have noticed until a skill's tool sweep started passing for the wrong reason. A specification that names a fallback is naming what was thinkable when it was written, not what is best once the ground is known.

One reading error worth keeping. The first check that the substitution had worked reported twenty-three bodies still carrying an unresolved `dpm/shared/` reference, against a set that had none: the resolved absolute path ends `.../opencode-dpm/shared/skill-conventions.md`, which contains the literal the search was for. A sweep looking for the thing it replaced has to be run against text the replacement has been taken out of — the same false-report shape as the `import type` readings in story 1, arriving from the opposite direction.

## Story 4 — Zero runtime dependencies and no native compilation

**Status**: complete — All four criteria met, two of them amended first. The production install tree is empty by construction: every locked package is dev. The clean install ran with the toolchain off PATH; the container run is outstanding on the next CI push.  
**Blocked by**: Story 5  

### Acceptance Criteria

- The package's `dependencies` is empty. `@opencode-ai/plugin` is needed for its types alone, so it sits under `devDependencies` and nothing is fetched at install. `[unit]`
- must NOT — A `.node` binary, or a compile step, appears anywhere in the production install tree. `[integration]`
- A clean install in an environment with no C or C++ toolchain and no Python completes successfully, with no node-gyp invocation in its output. `[integration]`
- The plugin dependency is pinned to the exact version the `beta` dist-tag resolves to, rather than to the floating tag itself. `[unit]`

### Task 1 — Pin the dependency set to @opencode-ai/plugin@beta and nothing else

**Status**: complete — `dependencies` is `{}` and `devDependencies` is exactly `@opencode-ai/plugin@0.0.0-beta-18684`, `@types/node@24.13.3`, `typescript@5.9.3` — all three pinned to exact versions with no range operator. The SDK entry landed in story 1; what this task added is the amendment of criteria 1 and 4, recorded on the epic with the `define`-is-identity citation and the eight transitive dependencies it would otherwise pull in.  

Addresses `dependencies`; devDependencies are unaffected.

### Task 2 — Run the clean install in the disposable environment

**Status**: complete — Run, with a qualification stated rather than glossed. There is no container runtime on this machine — no docker, podman, colima, nerdctl or finch — so the isolated job could not be executed here, and pushing to make CI run it is the user's call. What was run instead is the clean install with `PATH` cut to Node's own `bin`, so `cc`, `gcc`, `g++`, `make`, `python`, `python3`, `node-gyp` and `clang` were all unreachable: `npm ci --foreground-scripts` exited 0, added 98 packages, and left no `gyp info`, no `node-gyp rebuild`, no `prebuild-install`, no `build/Release` and no `.node` anywhere. `msgpackr-extract`'s install script ran and selected a prebuilt rather than compiling, which is the behaviour story 1 rewrote the CI grep for. `npm ci --omit=dev` created no `node_modules` at all. The container run is outstanding on the next CI push.  

No C or C++ toolchain and no Python present. Consumes the isolated environment job from the bootstrap epic rather than asserting by inspection.

### Task 3 — Write tests for "Zero runtime dependencies and no native compilation"

**Status**: complete — `tests/dependency-isolation.test.js`, five tests, all passing. The reading is the lockfile, which no other test file had opened: all 107 non-root entries carry `dev: true`, so the production install tree is empty by construction rather than by a sweep that found nothing. The must-NOT names `msgpackr-extract` as the one package declaring an install script and asserts it is dev-only with optional prebuilts, instead of the stronger-sounding and false claim that no install script exists anywhere. Suite is 1039 passing, typecheck clean, module sweep clean.  

Covers the dependency count, the beta pin, and the rejection of a `.node` binary or compile step in the install tree.

### Retro

- The story's four criteria were written against a package that would hold one runtime dependency. It holds none — story 1 established that `Plugin.define` is the identity function and took the SDK `import type` — so two of the four had to be amended before anything could be built against them, and the amendments were bigger than a rewording: "exactly one entry under `dependencies`" became "empty", and with it the whole story got easier. There is no production install tree to sweep for a native binary, because `npm ci --omit=dev` creates no `node_modules` at all.

That is the second time this epic that a criterion arrived carrying an assumption from before the SDK was opened, and both times the copy was found by reaching the story rather than by looking for it. NFR1 was amended in story 1; its two copies in story 4 sat unamended for three stories, and one coverage row was still quoting the sentence that had been amended away — a binding to text that no longer exists in the requirement, which reads as covered and is not. Amending a requirement should be followed by asking what else quotes it, and the tools make that a one-call question.

The verification split cleanly into what this machine can show and what it cannot, and saying so was more useful than a verdict. The clean install was run with `PATH` cut down to Node's own `bin` — no `cc`, `gcc`, `g++`, `make`, `python`, `python3`, `node-gyp` or `clang` reachable — and it completed, compiled nothing, and left no `build/Release`. What it is not is the container: this machine has no runtime for one, and the image's claim is stronger, because there the toolchain is absent from the system rather than hidden from the process. The container run is genuinely outstanding, and recording it as outstanding costs nothing next to a green tick that would have to be walked back.

`msgpackr-extract` earned its second mention. It is the one package in the lockfile declaring an install script, and the tempting assertion — "no install script anywhere" — would have been false the day the SDK arrived and would have read as a regression rather than as a discovery. The true and narrower claim is that it is `dev` and its prebuilts are `optional`, so it never runs for a user and never compiles for a contributor whose platform has a prebuilt.

## Story 5 — Verify cross-story integration for Plugin entry and MCP registration

**Status**: complete — Both criteria met against the running beta host: connected server, 183 `dpm_` tools, 23 skills resolving their conventions, and a reload that left the registry identical.  
**Blocked by**: —  

### Acceptance Criteria

- In a scratch project, one install produces a connected MCP server whose advertised tool names match the naming recorded in story 2, and a registered sample skill resolves its supporting files from the package location. `[manual]`
- The plugin's registrations survive a host reload without duplication. `[integration]`

### Task 1 — Run the end-to-end milestone-2 check in a scratch project

**Status**: complete — Run in a throwaway project against opencode2 0.0.0-beta-18684. `✓ dpm connected` on three consecutive checks; 195 tools advertised, 183 of them `dpm_`-prefixed and 12 host built-ins, none carrying the old `mcp__` form; 55 skills registered of which 23 are dpm's, all `dpm-` prefixed, no duplicate id; `location` is the package directory and 23 of 23 conventions references are absolute paths that open. A host restart loaded the entry twice — that count is the control that a reload happened — and left the registry identical. The scratch project was deleted; nothing was written outside it. Recorded on the epic as "Milestone 2, run end to end in a scratch project", including the correction that `plugins` is an array rather than a map.  

One install: connected server, tool names matching the recorded naming, sample skill resolving its supporting files, and registrations surviving a host reload without duplication.

### Retro

- The integration story found one real defect, and it was in my own recorded knowledge rather than in the code. Story 1's finding was written down as "the project config key is `plugins`", which is true and incomplete: the value is an array of `string | { package, options }`, and the map form I wrote from that note was discarded by the host with a normalisation diagnostic and no error. Twenty minutes went into "the plugin will not load" before reading `@opencode-ai/schema/dist/config/plugin.js`, where the shape is four lines. A note that records a key without its type is a note that will be misread, and the schema was two directories from where I was already working.

The host's own CLI is not a trustworthy first answer. `mcp list` and `plugin list` report "No MCP servers configured" and "No plugins found" for a second or two after `service start`, then report correctly and stably — while the log shows the plugin loading the whole time and a probe running inside the host sees the full registry. Both of my false "it is not loading" conclusions today came from believing a first CLI answer. The probe plugin has now been the reliable instrument four times in this epic, and the CLI has been misleading twice; the ordering should have been obvious sooner.

The reload check needed a control and the control changed the result's meaning. Touching the watched entry file left the registry unchanged, which looked like a pass and was not evidence of anything — the log showed no reload had occurred, so I had measured a registry that had not been disturbed. Restarting the service and counting `loading plugin` lines for the entry gave 2, and only then does "55 skills, 23 dpm, 0 duplicates, unchanged" mean the registrations survived something. This is the same false-pass shape the suite is built around, arriving in a manual check where there is no test file to remind you.

What the run confirmed is worth stating plainly because three stories were building toward it without ever seeing it together: 183 tools, the exact count of the v0.7.0 oracle, all prefixed `dpm_` and none carrying the old form; 23 skills whose conventions path is absolute and opens; one connected server. Every piece had been verified separately and the composition had not been, and the composition is the thing a user actually installs.

## Dependencies

- blocks → 01-03
- blocks → 01-04

## Retro Applied

- 01 · codebase-discoveries · applied — tests/support/skills.js dies at load because it reads .claude-plugin/plugin.json in a module-level constant. Stories 1 and 3 both work near the manifest it was reaching for, so exploration starts by finding every module that reads a manifest at load rather than in a function — those decide whether a suite can start at all, and one of them hides however many assertions it holds.
- 01 · complexity-underestimates · not_applicable — The nvm-versus-.nvmrc lesson and the SQLite row-typing lesson both belong to a bulk conversion of a hundred modules. This epic writes one small plugin entry against a typed SDK, so neither the version-manager trap nor the untyped-row decision arises. Re-judged next run rather than dismissed.
- 01 · patterns-worth-reusing · applied — Every claimed absence is paired with something that would catch its presence. Story 4's ENVX1 clause — no node-gyp, no C toolchain, no Python during a clean install — is an absence, and the disposable isolated environment epic 01-01 story 7 built is exactly its intended consumer. This story runs the check inside that job rather than asserting it by inspection, which is what ENVR12 was captured for.
- 01 · testing-gaps · applied — A path resolving out of the checkout produces checks that pass while asserting about a directory that is nobody's. ENVR5 asks for a scratch OpenCode project to register into, which is outside the checkout by construction, so any check about it anchors on evidence that project produces — a server reaching connected, skills appearing in the host's registry — rather than on a path this repository computes.
- 01 · testing-gaps · applied — Every textual sweep over import statements asserts something subtly different after a change to what an import means. This epic adds the project's first runtime dependency, @opencode-ai/plugin, and unsanctionedDependencies, auditImports and the module sweep's bare-specifier rule all currently forbid exactly that. Story 4's work is deciding which narrow and which stay; the lesson says fix the reading rather than the source, and make each caller assert the new exclusion against literal strings so the walk's silence is never the only evidence.
