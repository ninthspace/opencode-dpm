# OpenCode v1 host support

**Number**: 02  
**Status**: complete  

## The problem

dpm runs on exactly one host, and that host cannot reach the models this project is developed against.

OpenCode v2 beta-18684 exposes no `provider` in its plugin context and no `chat.*` hooks. mtplx — the local LLM server this work runs against — is wired into OpenCode v1 as an `@ai-sdk/openai-compatible` provider at `127.0.0.1:8000`, together with two plugins hooking `chat.headers` and `chat.params`. There is no v2 shape for either half. So the port completed and tagged v0.1.2 with three `[manual]` FR3 rows that cannot be walked, because the host they would be walked on cannot talk to the models.

**The remedy is cheap everywhere except one place, and the evidence for that is a running host rather than a reading of the types.** Exactly one file imports the SDK — `src/plugin/index.ts` — and `src/plugin/` is 427 of 15,867 lines. v1's `config` hook mutates `Config.mcp`, whose `McpLocalConfig` is `{type:"local", command, environment?}`: the identical shape dpm already builds for `ctx.mcp.transform`. The same hook appends to `Config.skills.paths`, a list of directories globbed for `**/SKILL.md`. Both were confirmed against a real `opencode serve` driven at a scratch project whose configuration declared nothing but a plugin path: the server came back holding `config.mcp.dpm` and `config.skills.paths` set by the plugin, and `/skill` returned the out-of-tree skill with its `location` inside the package. Nothing was copied into the project, so ADR 01-05's first half survives the host change intact.

**What does not cross is one mechanism, and it fails silently.** v1 reads `SKILL.md` verbatim off disk; the plugin never sees the text. `resolveSupportingPaths` — dpm's rewrite of `dpm/shared/skill-conventions.md` to an absolute path inside the package — therefore has no hook to run in, and the probe confirmed the returned content still carrying the raw reference. All twenty-three bodies open by reading that file. Left alone, every skill silently begins without its conventions: not an error, an omission, which is the failure mode retro 04 recorded as the one that passes by doing nothing.

Two consequences follow from v1 keying skills on the front-matter `name` in a flat namespace rather than on `id`. ADR 01-05's namespace defence — the `dpm-` prefix — loses its mechanism and needs a new one. And v1's permission engine evaluates the `skill` action against that unprefixed name, so the `dpm-*` rule the README recommends matches nothing under v1 until the names carry the prefix.

**Scope.** Add v1 as a second supported host. Do not retarget. Both hosts, one codebase, one MCP server, one database, one set of skill bodies.

**Boundaries, stated rather than assumed.** mtplx's own provider and plugin configuration is the user's setup and is not dpm's to own or document here. `ralph` remains deferred on its existing record against epic 01-03 and is not reopened by this specification, notwithstanding that v1 restores a slash-command surface which might have made its stop-hook contract portable.

**Lineage.** This is a new specification rather than an amendment to spec 01. Spec 01 is complete, tagged, five epics closed, thirty-two requirement claims standing; reopening it would reopen a settled coverage set and leave a reader unable to tell which requirements were discharged against which host. Four requirements in spec 01 are now factually wrong — ENVR9 names v2 as *the* production host, ENVR4 names a v2 beta CLI as a development requirement, NFR3 pins `@opencode-ai/plugin@beta`, and FR3's mechanism criterion names `ctx.skill.transform` explicitly. Amending those is a separate pivot with its own citations, not work this specification performs on itself.

## Scope boundary

**In scope.** The v1 registrar and the single entry point that detects which host loaded it (FR1–FR3, ADR 02-02, ADR 02-03). Moving the two shared documents behind a typed tool, deleting `resolveSupportingPaths`, and bringing the v2 path onto the same mechanism (FR4, ADR 02-01) — which also closes the `external_directory` rejection recorded as an open cost on retro 04. Renaming twenty-three skill directories and their front-matter names to `dpm-*` and dropping the id prefix the name now carries (FR5, ADR 02-04). The second SDK under an npm alias (NFR2, ADR 02-05). README for both hosts and per-host permission guidance (FR6, FR7). The end-to-end walk on v1 against real models (FR8).

**Explicitly out of scope.** Dropping v2, mtplx's own provider and plugin configuration, and v1's remote skill registry — each recorded as a requirement row carrying its own `exclusion` rather than as prose here.

Also out of scope, and named because forgetting it is the likely failure: **amending spec 01**. Five of its requirements are now wrong. ENVR9 names v2 as the production host in the singular; ENVR4 names a v2 beta CLI as the development requirement; NFR3 pins `@opencode-ai/plugin@beta`; FR3's mechanism criterion names `ctx.skill.transform` explicitly; and FR15 is `OpenCode v1 support`, marked `wont` and `out_of_scope`, which this specification reverses outright and which should be superseded rather than reworded. That is a `dpm:pivot` run against spec 01, carrying its own citations, and it is adjacent work rather than work this spec's epics perform.

**Deferred.** Explicit slash commands under v1 and argument passthrough (FR9, FR10, both `could`). `ralph` (FR13), held on its existing record against epic 01-03.

**The boundary's own risk, stated rather than discovered.** This began as "add a registrar" and contains a twenty-three-body rewrite and a twenty-three-directory rename, which is most of the effort and none of the title. Both are forced rather than opportunistic — FR4 by v1 reading bodies verbatim off disk, FR5 by v1 keying on the front-matter name — and the boundary's job is to say that nothing *else* touches those bodies while they are open. Anything else that wants to ride along on twenty-three files being edited is creep, and this line is where it is refused.

**And the value is concentrated in one requirement.** Only FR8 delivers something a user can feel: dpm working against the models this project is developed with. Everything above it is enabling work. If this specification has to be cut, it is cut from the bottom of the `should`s upward and never from FR8.

## Integration boundaries

Six seams follow from the decisions above. Five carry coverage of their own; the sixth is inherited from spec 01 and needs only a check that it stayed host-independent.

**Plugin ↔ host.** Two registration shapes — v2's transform drafts and v1's `Config` mutation — reached through one context object that has to be classified correctly. The coverage is the detection predicate's own test, carrying a control that fails when both branches would match or neither would, plus one live check per host.

**Plugin ↔ MCP server.** The local-server entry: a command array and an environment, produced by one builder and consumed by two registrars. FR2.1 asserts the two consumers receive the same value rather than two constructions that agree today, because this is where a v1-only regression would hide without anything else noticing.

**Skill body ↔ shared documents.** New with ADR 02-01, and the only seam in this list with no prior test at all. The contract is a document name in, bytes out, and a refusal rather than an empty answer on an unknown name. FR4.1 and FR4.2 cover it. In planning this is the row to watch: it is new, it is the mechanism FR4 rests on, and nothing in the existing suite touches it.

**Skill identity ↔ host registry.** After ADR 02-04 the front-matter name is the identity on both hosts, so the contract is that the name equals the directory equals the v2 id. FR5.1 and FR5.2 cover it, and the equality is what makes one set of bodies able to describe their own invocation truthfully.

**Plugin ↔ host configuration.** `Config.skills.paths` — the one undocumented contract in the system, a list of directories the host globs for `**/SKILL.md`. NFR3.2's post-registration check is the assertion at this seam and the reason the check exists at all: this is the boundary where a silent normalisation would leave the server connected and twenty-three skills absent.

**Server ↔ database and projection.** Unchanged from spec 01 and re-decided by nothing here. NFR4.1 and NFR4.2 only establish that it stayed host-independent — that nothing written under `.dpm/` records which host wrote it, and that a database written through one server dumps identically through the other.

## Functional Requirements

### FR1 (must)

Registration under OpenCode v1. The package registers itself with a v1 host: the MCP server registered and connected, all twenty-three skills advertised, and nothing further for the user to copy into the project. A single documented install route, and the user does not choose a registrar — the one appropriate to the host runs for the host that loaded it.

- Given a stub host context, the v1 registrar produces a configuration whose `mcp.dpm` command array is the one the shared server builder returns, and whose `skills.paths` contains the package's own skills directory. `[unit]`
- With the package installed into a fresh v1 project, the host holds the dpm MCP server in a connected state and all twenty-three skills, each resolving to a location inside the installed package. Automation is infeasible: it needs a running host, and ENVX1 keeps host binaries out of the suite. `[manual]`
- must NOT — Registration requires the user to name a host, choose between entries, or set an option. Control: a planted second required argument on the exported entry, which the check reports by name rather than by count. `[unit]`

### FR2 (must)

The MCP server remains the tool surface under v1. Registration goes through v1's `config` hook, setting a local server entry whose command runs the packaged executable — the same `{type:"local", command, environment?}` shape the v2 registrar already builds. Tool names, schemas and behaviour are identical under both hosts, and no host-specific tool exists.

- The local-server entry the v1 registrar builds is identical to the one the v2 registrar builds — the same command array and the same environment — because both are the return value of one function rather than two constructions that agree today. `[unit]`
- must NOT — Any tool is advertised under one host and not the other. Control: a planted host-conditional tool, which the check names rather than merely counting a mismatch. `[unit]`
- Under a running v1 host, a dpm tool call writes a row and that row is readable from `.dpm/dpm.db` afterwards. `[manual]`

### FR3 (must)

Skills registered from the package, not copied. The package's skills directory is made discoverable to the host by the `skills` configuration key the user sets at install, and each skill resolves with its `location` inside the installed package so directory-based skills keep their supporting files. ADR 01-05's first half — registered rather than copied — holds unchanged under v1; only the mechanism that implements it differs. There is no v1 skills registrar: v1's plugin `Hooks` has no skill member and its configuration layer strips the `plugins` key a second entry would have needed, so the mechanism is a documented configuration entry rather than code dpm runs.

- Discovery over the directory the v1 registrar contributes finds exactly twenty-three `SKILL.md` files, all resolving under the installed package. `[unit]`
- Under a running v1 host, the skill listing returns dpm's skills with `location` inside the installed package. `[manual]`
- must NOT — Registration writes anything into the user's project tree. Control: the project tree hashed before and after a plugin load, with a planted write proving the comparison fires rather than an unchanged hash proving nothing was watching. `[integration]`

### FR4 (must)

Every skill's conventions reference resolves under a host that reads skill bodies verbatim. All twenty-three bodies open by reading `dpm/shared/skill-conventions.md`. v1 reads `SKILL.md` off disk and the plugin never sees the text, so `resolveSupportingPaths` — the registration-time rewrite that makes this work under v2 — has nowhere to run. The requirement is satisfied when a real session reads the file, not when a path exists: the failure this guards against is an omission rather than an error, and an omission passes every check that only asks whether something is present.

- Every one of the twenty-three bodies reaches the shared conventions through the tool, and none names a filesystem path to `shared/`. Control: a planted body carrying the old path form, which the check reports by name rather than by count. `[unit]`
- The tool returns the byte content of the package's `shared/skill-conventions.md` for the name it is given, and refuses an unknown name rather than returning empty. The refusal is the property FR4 turns on: a mechanism that answers an unknown name with nothing reproduces, inside the tool boundary, exactly the silent omission the file read produced outside it. `[unit]`
- In a real v1 session, a dpm skill starts and performs a step that only the conventions prescribe — a session row created with `skill` and `phase` set, per the shared Session Startup procedure — observable in the database rather than inferred from the transcript. "The model read its conventions" is not directly observable, so the criterion asks for a consequence nothing else produces. `[manual]`
- must NOT — A second copy of either shared document exists anywhere in the tree. Control: a planted duplicate, reported by path. `[unit]`

### FR5 (must)

dpm's skills survive v1's flat name keyspace, and a collision is not silent. v1 keys skills on the front-matter `name`, logs `duplicate skill name`, and lets the later registration win. The `dpm-` id prefix that ADR 01-05 relies on under v2 has no effect there. Whatever replaces it must make a clash visible rather than quietly serving another source's `review`, `status` or `do` in place of dpm's.

- Every skill's front-matter `name` equals the name of the directory containing its `SKILL.md`, and begins with `dpm-`. Controls: a planted skill whose name and directory disagree, and one carrying no prefix — each reported by name. `[unit]`
- The skill id the v2 registrar produces equals the front-matter name exactly — no prefix added and none doubled. Control: a planted unprefixed name, which the check reports rather than silently repairing. `[unit]`
- Under a running v1 host, all twenty-three dpm names appear in the skill listing distinct from every other registered skill, and the host log carries no `duplicate skill name` line for any of them. Control: a scratch skill deliberately named `dpm-status`, confirming the log does report a duplicate — so a clean log means the observation was capable of firing rather than that nothing was watching. `[manual]`

### FR6 (must)

Both hosts documented. README install, first run, guard symlink and "when the guard refuses" cover v1 and v2, with the plugin-package location correct for each host rather than one location presented as the location.

- For each of install, first run, guard symlink and "when the guard refuses", the README gives both the v1 and the v2 form. Control: a planted section carrying only one host's form, reported by heading. `[unit]`
- Following the README's v1 instructions verbatim produces a working install, a guard symlink that resolves, and a refusal on a deliberately stale projection. `[manual]`
- must NOT — The README names one host's binary where the sentence is true of either. Control: a planted `opencode2` in a host-neutral sentence, reported by line. `[unit]`

### FR7 (should)

Permission guidance matches what each host evaluates. v1's permission engine evaluates the `skill` key against the front-matter `name` — which carries the `dpm-` prefix, so a `dpm-*` pattern matches every dpm skill and nothing else. The recommended entries are stated per host, against what that host actually matches on.

- The permission rule the README recommends matches all twenty-three skill identities on both hosts — one `dpm-*` form once the skills carry their own prefix. Control: a planted rule matching none, reported as a failure rather than passing over an empty match set, which is the shape that passes by doing nothing. `[unit]`
- Under a running v1 host, a `deny` rule written as the README recommends blocks a dpm skill, and the same session without the rule runs it. The two directions are each other's control: a block that would have happened anyway proves nothing. `[manual]`

### FR8 (should)

Verified end to end under v1 against real models. A session starts a dpm skill by its documented invocation, the skill reads its conventions, a dpm tool writes a row, and the guard accepts the resulting commit. This is the walk spec 01's three `[manual]` FR3 rows could not reach, and it is written as a requirement rather than left to the test approach because the port has twice been proved wrong by the act of installing it and using it.

- A v1 session starts a dpm skill by the documented invocation, the skill obtains its conventions, a dpm tool writes a row, and `dpm-guard` accepts the resulting commit. The evidence is the row, the regenerated projection and the commit. Deliberately one criterion rather than four: splitting it would let three pass while the thing it exists to prove — that the whole path works in one session — did not happen. `[manual]`

### FR9 (could)

Explicit slash commands under v1. v1 carries a command surface, and registering named entries that prompt the session into a skill would restore something close to the pre-port ergonomics. Spec 01's FR11 named this as the contingency under v2 and it was never needed there.

### FR10 (could)

Argument passthrough. `$ARGUMENTS` was removed from all twenty-three bodies as a Claude Code slash-command mechanism the host filled before the model saw the text. If v1 supplies an equivalent, skills that took arguments could take them again — but only behind a form that degrades to nothing under v2, so that one set of bodies goes on serving both hosts.

### FR11 (wont) — out_of_scope

Dropping v2. This is a second registrar, not a retarget; both hosts stay supported from one codebase.

### FR12 (wont) — out_of_scope

mtplx's provider and plugin configuration. It is the reason v1 matters and it is the user's own setup; dpm neither supplies it nor documents it.

### FR13 (wont) — deferred

`ralph`. Its withdrawal from registration is decided in principle and held on its existing record against epic 01-03, with a withdrawal radius of twelve assertions across eight test files. v1 restoring a slash-command surface does not reopen it here — the stop-hook contract it is built on was never shipped by any host.

### FR14 (wont) — out_of_scope

v1's remote skill registry, `config.skills.urls`. A distribution route rather than a host-support one, and one that would put the skills somewhere the guard and the MCP server cannot reach.

## Non-Functional Requirements

### NFR1 (must)

One codebase, no per-host fork. Skill bodies, tool schemas, the MCP server, the guard and the database are shared verbatim between hosts, and host-specific code is confined to the registration layer — 427 of 15,867 lines at the point this specification was written. Checkable by the host-support change touching only that layer, and by no skill body and no tool module branching on which host is running.

- The host-detection predicate's identifier appears only in the registration layer and its own test. Control: a planted use elsewhere under `src/`, reported by file. `[unit]`
- Both registrars are given the same skill list and the same server entry, each from one call rather than from two constructions that happen to agree. `[unit]`
- must NOT — A skill body names a host. Control: a planted host name in a body, reported by skill. `[unit]`

### NFR2 (must)

Zero runtime dependencies survives a second SDK. `dependencies` stays empty. Both host SDKs are needed for types alone and neither may reach a user's install — a complication rather than a formality here, because v1 and v2 publish the same package name at different versions and the package manifest can hold one entry per name. Checkable by `dependencies` being `{}` after the work, and by the existing module sweep proving nothing under `src/` imports a package at runtime.

- `dependencies` is empty and both SDK entries sit under `devDependencies`. Control: a planted runtime entry. `[unit]`
- Nothing under `src/` imports a package at runtime — the existing module sweep, extended to recognise the aliased SDK specifier. Control: a planted value import of either SDK, which the sweep names. `[unit]`

### NFR3 (must)

The undocumented dependency is declared, isolated, and fails loudly. `Config.skills.paths` is absent from the published SDK types and from the live `opencode.ai/config.json` schema, so building on it is building on something OpenCode has not committed to. dpm may build on it, but from exactly one place, named as unsupported where a maintainer will read it, and with a check that fails when it stops working — because the failure mode of a configuration key the host silently normalises away is twenty-three skills quietly not registering, which reads to a user as dpm being broken rather than as the host having moved.

- `skills.paths` is written from exactly one module, and that module carries a marker naming the key as undocumented and saying what to do when it stops working. Control: a planted second write site, reported by file. `[unit]`
- The post-registration check reports failure when given a host configuration that does not hold dpm's skills path, and passes when it does. The passing direction is the control: a check that always fails would satisfy the first half alone. `[unit]`

### NFR4 (must)

Host-independent artefacts. The same project worked under either host produces the same rows, the same dump and the same projection. Nothing written under `.dpm/` records or depends on which host wrote it, and the guard's regenerate-and-compare cannot tell the difference. A project moved between hosts mid-epic notices nothing.

- Nothing in the dump or the projection records which host wrote it. Control: a planted host identifier in a row, found by the sweep. `[unit]`
- A database written through the v1 server produces a byte-identical dump when read through the v2 server, and the guard accepts both. Reachable without models on either host — it needs the two server processes, not two sessions, so it is not blocked on the thing this specification exists to fix. `[integration]`

### NFR5 (must)

No build step, unchanged. Erasable-syntax TypeScript run natively by Node. The second registrar adds no compile, no loader and no published artefact, and `tsc --noEmit` remains a type check rather than a build.

- No build script and no published artefact; `tsc --noEmit` remains a check. Control: a planted build script. `[unit]`
- must NOT — Any invocation passes a loader or transpiler flag. Control: a planted `--import`, reported by the invocation that carries it. `[unit]`

## Environmental Requirements

### ENVR1 (must)

Development: an OpenCode v1 CLI on the contributor's machine, at a version matching the v1 SDK the plugin is typed against. Checkable by `opencode --version` reporting a 1.x build matching the version the v1 types are taken from — 1.18.25 at the time of writing — so that the CLI and the types the registrar is checked against are the same release.

### ENVR2 (must)

Development: the OpenCode v2 beta CLI retained alongside the v1 one. Checkable by `opencode2 --version` reporting a `0.0.0-beta-*` build matching the v2 SDK. Spec 01's ENVR4 required a v2 CLI; this entry changes it to a requirement for both at once, because parity across two hosts is the deliverable and a regression under v2 introduced while adding v1 is otherwise invisible on this machine.

### ENVR3 (must)

Development: a scratch project per host to register into. Checkable by installing the plugin into a throwaway project under each host and observing its MCP server reach connected state with the skills advertised.

### ENVR4 (must)

Development: a model provider the v1 host can reach and complete a turn against. Checkable by a v1 session completing a turn. Without this entry FR8's end-to-end walk is unverifiable by anybody, and the specification would be one whose central claim can only be asserted. The configuration of that provider is the contributor's own and is explicitly not dpm's to supply — FR12 — but its availability is an environment condition and belongs here.

### ENVR5 (must)

Production: OpenCode v1 (1.x) or OpenCode v2 as the host application. Checkable by the plugin loading under a 1.x host and its MCP server and skills appearing in that host's registries. This is the entry that replaces spec 01's ENVR9, which names v2 as the production host in the singular.

## Environmental Restrictions

### ENVX1 (must)

Development: neither host CLI may be required to run the test suite. Checkable by the full `node --test` suite passing on a machine with neither `opencode` nor `opencode2` on `PATH`. The suite tests a package, not a host, and a suite that needs either binary is one CI cannot run and one a contributor cannot reproduce.

### ENVX2 (must)

Production: a host hook that rewrites skill content must not be required. Checkable by a session reading the shared conventions file on a host that reads `SKILL.md` verbatim off disk and offers no content transform. v2 supplies such a hook and v1 does not, so a design that assumes one is a design that runs on one host.

### ENVX3 (must)

Production: copying skill files into the user's project tree must not be required. Checkable by a fresh project holding no skill files and no skills directory after install and a first run. Copying resolved bodies into the project is the easiest thing that would appear to work and it is the thing ADR 01-05 exists to prevent, so the prohibition is recorded rather than left to be remembered.

### ENVX4 (must)

Production: the plugin must not write to the user's OpenCode configuration. Checkable by no write to those files being attributable to dpm across a plugin load — not by the files being byte-identical, because 1.18.25 inserts a `"$schema"` member into `opencode.json` on load and a byte comparison cannot tell that write from one of dpm's. Registration is a description handed to the host, not an edit to the user's file. The host's own writes are excluded from this, whether they arrive on load or from `plugin add` writing to the global configuration: those are the host's write and the user's choice, not the plugin's.

## Architecture Decisions

### 02-01 — The shared documents are served by the MCP server

**Decision status**: accepted  

A typed MCP tool returns a named shared document and every skill body opens by calling it, so the conventions reach the model identically on both hosts, through the one boundary that is already host-agnostic, and `resolveSupportingPaths` is deleted rather than duplicated.

#### Served by the MCP server — chosen

A typed tool returns the named shared document; each body opens with a tool call instead of a path read. It is the only route whose answer is the same on both hosts, because a tool call crosses the boundary ADR 01-02 already established as host-agnostic. It depends on no permission fact: the server reads its own package in its own process, which it is already doing for everything else. Its failure is loud — a failed tool call returns an error the session sees — where a denied file read returns nothing and the skill proceeds without its conventions, which is the omission FR4 exists to prevent. And it closes a defect already open: under v2 the substituted absolute path is auto-rejected as `external_directory`, recorded on retro 04, so the conventions are not being read on the supported host today either. Twenty-four references to two files, one line each, and `resolveSupportingPaths` is removed rather than joined by a second mechanism.

| Axis | Assessment |
| --- | --- |
| complexity | Lowest of the five. One mechanism serving both hosts, no per-host branch, no permission story, no second copy. The only thing added is a tool in a package that already has 183 of them. |
| cost | Twenty-four one-line edits across twenty-three bodies, one new tool, and the deletion of `resolveSupportingPaths` and its tests. Net removal of code. The recurring cost is one tool result per skill run — the same context a file read would have cost. |
| legibility to a human reader | The weakest axis for this option, and the reason it is not free. A body that says "call a tool for your conventions" is one indirection further from someone who opens `SKILL.md` in an editor and wants to follow the reference. Mitigated by the tool naming the document and the document still sitting in the package, but not eliminated. |
| reversibility | High. The shared files stay in the package unchanged; reverting means putting the path back in twenty-four lines. Nothing is migrated and no user state depends on it. |

#### Resolve from the skill's own location

Keep it a file read and rewrite the reference so the model resolves it from the `location` the host hands it. This is the pattern OpenCode's own documentation recommends — it does not expand `@` references, and tells authors to instruct the model to read referenced files with its own tool — so the mechanism is sound and the body still names a real path a human can follow. What it cannot answer from here is whether either host permits a read of a path outside the project. v2 does not: `permission requested: external_directory (…/shared/*); auto-rejecting`. v1's behaviour is unestablished. So this route costs a probe now and a per-host permission entry in the install instructions afterwards, and it leaves the v2 rejection open rather than closing it.

| Axis | Assessment |
| --- | --- |
| complexity | Low in the code and high in the contract. Nothing complicated is written, but the thing that makes it work lives in the user's permission configuration, which is the one place dpm cannot test and cannot fix. |
| cost | Cheapest to write and the most expensive to be sure of: a probe against v1 before it can be chosen, then a permission entry in the install instructions for each host, then the v2 rejection still to close separately. |
| failure mode | Silent. A denied read returns nothing and the skill carries on without its conventions, indistinguishable from a skill that had none. This is the decisive axis and it is the one FR4 was written against. |

#### Materialise resolved copies into plugin storage

The plugin writes resolved bodies into storage it owns and points discovery there — closest in spirit to what the v2 registrar does today. It creates a second copy of all twenty-three bodies that can disagree with the first, moves each skill's `location` off the installed package against FR3, and makes registration a thing that writes to disk, which the v2 entry today explicitly does not do. It also does not escape the underlying problem: plugin storage is outside the project too, so the same permission question applies.

| Axis | Assessment |
| --- | --- |
| complexity | Highest of the five. Registration acquires a side effect on disk, `location` stops meaning the installed package, and the copy and the original can disagree without anything noticing. |
| cost | A materialisation step at registration, a storage location to own, and a staleness question to answer on every plugin upgrade. |
| reversibility | Moderate. Reverting means deleting materialised trees on every machine that ever ran it, which is the kind of cleanup that gets half done. |

#### Append the conventions to the host's instructions

v1's `config` hook can append a path to `Config.instructions`, which is documented, glob-capable and the route OpenCode's own documentation names first. It fails on two counts. It injects fifteen kilobytes into every session whether a dpm skill is running or not, so every user pays for the conventions on every turn to serve the runs that need them. And v2 exposes no established equivalent, so it would be a v1-only mechanism — a per-host fork of the thing that is supposed to be shared, against NFR1.

| Axis | Assessment |
| --- | --- |
| cost | Almost nothing to build, and fifteen kilobytes of context on every turn of every session for every user, whether dpm is being used or not. |
| host parity | Fails outright. Documented on v1, with no established v2 equivalent, so it forks the shared surface along the host boundary — which is what NFR1 forbids. |

#### Inline the conventions into every body

Fifteen kilobytes copied into each of twenty-three bodies, with no mechanism at all and therefore nothing to break. Spec 01 named and rejected this as its fallback, and it is recorded here so the decision shows what it was weighed against rather than what it happened to pick. Twenty-three copies of one document is twenty-three places for it to drift, and nothing would notice.

| Axis | Assessment |
| --- | --- |
| cost | Fifteen kilobytes times twenty-three bodies, paid in the package and again in every session that loads a skill. |
| maintainability | Twenty-three copies of one document, each free to drift, with no check that could tell. It is the option with no mechanism, and therefore the option with no way to be wrong loudly. |

### 02-02 — One entry point, with the host detected once

**Decision status**: accepted  

The package keeps a single entry point and detects which host loaded it in one named predicate that carries its own test and a control, with two registrars beneath it sharing the inputs computed before either runs.

#### One entry, detection in a tested predicate — chosen

The package exports one entry. It asks the context which host it is — v2 carries `mcp.transform` and `skill.transform`, v1 carries neither and takes a `config` hook — and hands off to one of two registrars that share the server command and the skill list computed before either runs, which is ADR 01-07 unchanged. The user installs the same way on both hosts and chooses nothing, which is FR1. The weakness is that the detection is a shape test on an object neither host promises to keep stable; the answer is to confine it to one named predicate with its own test and a control that fails when both branches would match or neither would, so a host change breaks a test rather than silently taking the wrong path.

| Axis | Assessment |
| --- | --- |
| cost | One predicate, one branch, and a second registrar module. The install instructions stay identical for both hosts, which is where most of the saving is. |
| failure mode | The risk is a host changing shape so that both branches match or neither does. The control in the predicate's test is what converts that from a silent wrong path into a failing build. |

#### Two exported entries, selected by each host's loading convention

Export one registrar per host and let each host pick up the one it knows about. Attractive because nothing has to guess. It rests on a fact nobody here has established — how v1 treats a plugin module exporting more than one function, and whether it would call both — and getting that wrong means the v2 registrar runs under v1, or both run, with no obvious symptom. It also splits the install instructions, since each host would name a different entry.

| Axis | Assessment |
| --- | --- |
| cost | Low to write, and it costs a probe first: how v1 loads a module exporting more than one plugin function is unestablished, and the decision cannot be made without it. |
| failure mode | Both registrars running under one host, or the wrong one running, with no obvious symptom — the server would still connect and the skills would still appear. |

#### Two published packages

A package per host, sharing the core by dependency. Unambiguous at load time and wrong everywhere else: two release trains, two version numbers, two guard symlink stories, and a shared core that has to be published to be consumed — which reintroduces the npm publication FR1 of spec 01 deliberately defers.

| Axis | Assessment |
| --- | --- |
| cost | Highest by a wide margin: two release trains, two version numbers, two guard stories, and a shared core that must be published to be consumed. |

### 02-03 — Build on the undocumented skills.paths, fenced and alarmed

**Decision status**: accepted  

Skill registration under v1 goes through `Config.skills.paths` despite its absence from the SDK types and the published schema, confined to one module, labelled as unsupported where a maintainer will read it, and guarded by a registration-time check that turns the host silently discarding it into a loud failure.

#### Use it, fenced and alarmed — chosen

One module sets `Config.skills.paths`, carrying a comment that says plainly it is undocumented and what to do when it stops working, and registration then checks that the path took — that the host actually holds dpm's skills — refusing loudly rather than leaving the user with a plugin that connected its server and advertised nothing. The check is the whole point: a configuration key the host normalises away is accepted in silence, and the symptom is twenty-three skills quietly absent, which reads as dpm being broken rather than as the host having moved.

| Axis | Assessment |
| --- | --- |
| cost | One module and one check. The recurring cost is watching an undocumented key across v1 point releases, which the check makes visible rather than free. |
| reversibility | High, and deliberately so: confining it to one module means that if OpenCode replaces the key, one file changes. |

#### Copy into a documented discovery root

The six documented roots are all under the project or the user's home. Using one means copying twenty-three directories out of the package and keeping them in step with every upgrade — which ENVX3 prohibits for the project roots and which reintroduces, for the home roots, exactly the copy-and-drift problem ADR 01-05 exists to prevent. It would also put skills where the user's other tooling can edit them, so the package and the installed copy could disagree with nothing to notice.

| Axis | Assessment |
| --- | --- |
| cost | A copy step, an upgrade-sync problem, and a prohibition to relax. ENVX3 forbids the project roots outright. |

#### Wait for OpenCode to document it

Raise it upstream and defer v1 support until the key is in the schema. Correct in principle and indefinite in practice: the reason v1 matters is that v2 cannot reach the models this project is developed against, so deferring is choosing to keep dpm unusable for an unbounded period on the strength of a documentation preference. Raising it upstream is worth doing anyway, and does not have to gate the work.

| Axis | Assessment |
| --- | --- |
| cost | Nothing to build and an unbounded wait, during which dpm stays unusable against the models this project is developed with. That is the cost, and it is the largest one here. |

### 02-04 — The skills carry the prefix themselves

**Decision status**: accepted  

The twenty-three skill directories and their front-matter names are renamed to `dpm-*` and the v2 registrar stops prepending a prefix the name now carries, so one identity serves both hosts, one permission rule matches on both, and one set of bodies can name its cross-references truthfully.

#### Rename directories and front-matter names to dpm-* — chosen

`skills/spec/SKILL.md` with `name: spec` becomes `skills/dpm-spec/SKILL.md` with `name: dpm-spec`, twenty-three times, and the v2 registrar stops prepending `dpm-` to a name that now carries it — so the v2 id and the v1 name are the same string. Both halves are required: OpenCode's documentation says the front-matter name must match the directory containing `SKILL.md`, so this is not twenty-three front-matter edits, it is twenty-three directory renames as well, and every path constant in the suite moves with them.

What makes it worth that is that nothing else keeps one set of bodies true on both hosts. dpm's names are `spec`, `do`, `review`, `status`, `publish`, `clean` — as generic as names get, and v1 lets the later registration win with a log line nobody reads. Leaving them unprefixed means the skill is `dpm-spec` under v2 and `spec` under v1, so every cross-reference between bodies would have to name both forms, the invocation prose would be host-conditional, and the permission rule would differ per host. The prefix carried by the skill itself collapses all of that to one identity.

| Axis | Assessment |
| --- | --- |
| complexity | Large but flat. It is one edit repeated, with no branching and no new mechanism, and it removes the id-prefixing step rather than adding to it. A rename's blast radius is every predicate that filters on the old name, which retro 01 recorded as the thing the narrow rewrite misses. |
| cost | The largest single change in this specification: twenty-three directory renames, twenty-three front-matter edits, the id derivation in `src/plugin/skills.ts`, the corpus test's twenty-three-name transcription, every cross-reference between bodies, the README, and every path constant in the suite that names a skill directory. |
| reversibility | Low once released. The skill names are what a user types and what their permission rules match, so reverting breaks configurations that were written against the new names. |

#### Leave the names, add a presence check

Keep `name: spec` and have the v1 registrar verify after registration that all twenty-three skills are present and resolve to locations inside dpm's own package, failing loudly when one has been displaced. This satisfies FR5's "not silent" at a fraction of the cost, and it is the cheaper answer to the narrow question. It does not answer the wider one: the skill still has two names, so the bodies cannot describe their own invocation without branching on the host, and FR7's permission rule stays host-specific. It also detects a collision rather than preventing one, and the user's remedy would be to rename somebody else's skill.

| Axis | Assessment |
| --- | --- |
| cost | A check and a README paragraph, and then a permanent second identity: host-conditional invocation prose in twenty-three bodies and a per-host permission rule. |
| failure mode | Loud, which is what FR5 asks for — but the remedy it offers the user is to rename somebody else's skill, because dpm has claimed a generic name and will not give it up. |

#### Leave the names and document the risk

Change nothing and put a paragraph in the README. Recorded because it is the zero-cost option and because it is what happens by default if nobody decides. It fails FR5 on its own terms — a displacement stays silent — and it is the option most likely to be discovered by a user whose own `review` skill quietly replaced dpm's mid-run.

| Axis | Assessment |
| --- | --- |
| failure mode | Silent displacement mid-run, which is the outcome FR5 names and forbids. |

### 02-05 — The second SDK arrives under an npm alias

**Decision status**: accepted  

The v1 SDK is installed as an aliased devDependency alongside the v2 one, so both registrars are type-checked against the real published types of the host they target and `dependencies` stays empty.

#### npm alias in devDependencies — chosen

`"@opencode-ai/plugin-v1": "npm:@opencode-ai/plugin@1.18.25"` beside the existing beta pin, with the v1 registrar importing types from the alias. Both registrars are then checked against the real published types of the host they target, which is the entire value of taking the SDK at all. It stays in `devDependencies`, both imports remain type-only, and `dependencies` stays empty — NFR2 holds without a special case.

| Axis | Assessment |
| --- | --- |
| cost | One manifest line and one import specifier. Both SDKs stay in `devDependencies` and neither reaches a user's install. |
| reversibility | High. Removing the alias removes the check; nothing at runtime depends on it, because both imports are erased before anything is evaluated. |

#### Hand-declare the v1 types locally

Write a small local declaration for the handful of v1 shapes dpm touches. No second install, and full control. It is also a second reading of the host, maintained by hand, which is the failure retro 02 recorded six times in a single epic — four separate readings of the import graph, only one of them correct. A hand-written type that drifts from the host does not fail; it type-checks, and the mismatch surfaces at runtime on a user's machine.

| Axis | Assessment |
| --- | --- |
| failure mode | A hand-written type that has drifted from the host does not fail the build — it passes it, and the mismatch surfaces at runtime on a user's machine. |

#### Type-check against v2 only

Keep one SDK and write the v1 registrar structurally, unchecked. The cheapest thing to set up and the one that forfeits the check on the half of the code that is new and least understood, which is the opposite of where the type checking should be concentrated.

| Axis | Assessment |
| --- | --- |
| cost | Nothing to set up, and it forfeits type checking on the newest and least understood half of the code. |

## Dependencies

- builds_on → 01
