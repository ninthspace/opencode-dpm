# Coverage — The v1 registrar

**Number**: 02-01  
**Source epic**: 02-01  
**Status**: pending  

## Coverage

| # | Requirement | Spec Text | Story Criterion | Covered by | Test Approach | Verified |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | FR1 | the one appropriate to the host runs for the host that loaded it | A single named predicate classifies the host from the plugin context it is given, and the exported entry hands off to one of two registrars on its result. | Story 2 | `[unit]` |  |
| 2 | FR1 | the one appropriate to the host runs for the host that loaded it | control — The predicate's test fails when given a context both branches would match and when given one neither would, so a classification that has stopped discriminating is caught rather than silently defaulting. | Story 2 | `[unit]` |  |
| 3 | FR1 | the user does not choose a registrar | must NOT — Registration requires the user to name a host, choose between entry points, or set an option. Control: a planted second required argument on the exported entry fails the check. | Story 2 | `[unit]` |  |
| 4 | FR1 | all twenty-three skills advertised | The v1 registrar appends the package's own skills directory to `config.skills.paths`, and discovery over that directory finds exactly twenty-three `SKILL.md` files, every one resolving to a path inside the installed package. | Story 4 | `[unit]` |  |
| 5 | FR1 | The package registers itself with a v1 host | One plugin load under a stub v1 context produces a configuration holding both `mcp.dpm` and dpm's `skills.paths` entry, built from the same computed inputs rather than from two independent constructions. | Story 5 | `[integration]` |  |
| 6 | FR2 | Registration goes through v1's `config` hook, setting a local server entry whose command runs the packaged executable | Given a stub v1 plugin context, the v1 registrar's `config` hook sets `mcp.dpm` to a local-server entry whose command runs the packaged executable. | Story 3 | `[unit]` |  |
| 7 | FR2 | the same `{type:"local", command, environment?}` shape the v2 registrar already builds | The local-server entry the v1 registrar builds is identical to the one the v2 registrar builds — same command array, same environment. | Story 3 | `[unit]` |  |
| 8 | FR2 | no host-specific tool exists | must NOT — Any tool is advertised under one host and not the other. Control: a planted host-conditional tool registration fails the check. | Story 3 | `[unit]` |  |
| 9 | FR3 | each skill resolves with its `location` inside the installed package | The v1 registrar appends the package's own skills directory to `config.skills.paths`, and discovery over that directory finds exactly twenty-three `SKILL.md` files, every one resolving to a path inside the installed package. | Story 4 | `[unit]` |  |
| 10 | NFR1 | host-specific code is confined to the registration layer | The predicate's identifier appears only in the registration layer and its own test. Control: a planted use elsewhere under `src/` fails the check. | Story 2 | `[unit]` |  |
| 11 | NFR1 | Skill bodies, tool schemas, the MCP server, the guard and the database are shared verbatim between hosts | Both registrars are given the same skill list and the same server entry, each computed by one call, rather than by two constructions that happen to agree. | Story 2 | `[unit]` |  |
| 12 | NFR1 | One codebase, no per-host fork | The same exported entry loaded under a stub v2 context produces the v2 registrations and writes no `config` at all. | Story 5 | `[integration]` |  |
| 13 | NFR2 | v1 and v2 publish the same package name at different versions | `@opencode-ai/plugin-v1` resolves to `@opencode-ai/plugin@1.18.25` through an npm alias declared in `devDependencies`, and `tsc --noEmit` exits zero with both SDK versions in the type graph. | Story 1 | `[unit]` |  |
| 14 | NFR2 | `dependencies` stays empty | `dependencies` in `package.json` is empty and both SDK entries sit under `devDependencies`. Control: a planted runtime entry fails the check. | Story 1 | `[unit]` |  |
| 15 | NFR2 | the existing module sweep proving nothing under `src/` imports a package at runtime | Nothing under `src/` imports a package at runtime, with the module sweep extended to recognise the aliased specifier as an SDK import. Control: a planted value import of either SDK fails the sweep. | Story 1 | `[unit]` |  |
| 16 | NFR3 | from exactly one place, named as unsupported where a maintainer will read it | `skills.paths` is written from exactly one module, and that module carries a marker naming the key as undocumented by OpenCode and saying what to do when it stops working. Control: a planted second write site fails the check. | Story 4 | `[unit]` |  |
| 17 | NFR3 | with a check that fails when it stops working | The post-registration check reports failure when given a host configuration that does not hold dpm's skills path, and passes when given one that does. | Story 4 | `[unit]` |  |
| 18 | NFR5 | The second registrar adds no compile, no loader and no published artefact | must NOT — Any invocation passes a loader flag, a transpiler flag, or any other runtime argument beyond the entry path. Control: a planted `--import` in a package script fails the check. | Story 1 | `[unit]` |  |
| 19 | NFR5 | `tsc --noEmit` remains a type check rather than a build | There is no build script and no compiled artefact; `tsc --noEmit` remains a check rather than a step that produces output. Control: a planted build script fails the check. | Story 1 | `[unit]` |  |
| 20 | ENVX3 | copying skill files into the user's project tree must not be required | must NOT — Registration writes anything into the user's project tree. Control: the project tree is hashed before and after a plugin load and compared, with a planted write proving the comparison fires. | Story 4 | `[integration]` |  |
| 21 | ENVX4 | the plugin must not write to the user's OpenCode configuration | must NOT — The plugin writes to the user's OpenCode configuration file. Control: the configuration files are hashed across a plugin load and compared, with a planted write proving the comparison fires. | Story 3 | `[integration]` |  |
