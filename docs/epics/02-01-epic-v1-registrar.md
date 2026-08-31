# The v1 registrar

**Number**: 02-01  
**Source spec**: 02  
**Status**: pending  

## Story 1 — The second SDK, typed against both hosts

**Status**: pending  
**Blocked by**: Story 5, Story 2  

### Acceptance Criteria

- `@opencode-ai/plugin-v1` resolves to `@opencode-ai/plugin@1.18.25` through an npm alias declared in `devDependencies`, and `tsc --noEmit` exits zero with both SDK versions in the type graph. `[unit]`
- `dependencies` in `package.json` is empty and both SDK entries sit under `devDependencies`. Control: a planted runtime entry fails the check. `[unit]`
- Nothing under `src/` imports a package at runtime, with the module sweep extended to recognise the aliased specifier as an SDK import. Control: a planted value import of either SDK fails the sweep. `[unit]`
- must NOT — Any invocation passes a loader flag, a transpiler flag, or any other runtime argument beyond the entry path. Control: a planted `--import` in a package script fails the check. `[unit]`
- There is no build script and no compiled artefact; `tsc --noEmit` remains a check rather than a step that produces output. Control: a planted build script fails the check. `[unit]`

### Task 1 — Add the aliased v1 SDK to devDependencies and install it

**Status**: pending  

Covers the alias declaration and the lockfile only. Nothing imports the alias in this task — the registrar that uses it is story 2.

### Task 2 — Teach the module sweep the aliased specifier

**Status**: pending  

Addresses the hole the alias opens: a sweep that only knows `@opencode-ai/plugin` would pass a runtime import of `@opencode-ai/plugin-v1`. Scope is the sweep's recognition rule, not its reporting.

### Task 3 — Write tests for The second SDK, typed against both hosts

**Status**: pending  

Covers the five criteria tagged `unit`, each with the planted control the criterion names.

## Story 2 — One entry, two registrars

**Status**: pending  
**Blocked by**: Story 5, Story 3, Story 4  

### Acceptance Criteria

- A single named predicate classifies the host from the plugin context it is given, and the exported entry hands off to one of two registrars on its result. `[unit]`
- control — The predicate's test fails when given a context both branches would match and when given one neither would, so a classification that has stopped discriminating is caught rather than silently defaulting. `[unit]`
- Both registrars are given the same skill list and the same server entry, each computed by one call, rather than by two constructions that happen to agree. `[unit]`
- The predicate's identifier appears only in the registration layer and its own test. Control: a planted use elsewhere under `src/` fails the check. `[unit]`
- must NOT — Registration requires the user to name a host, choose between entry points, or set an option. Control: a planted second required argument on the exported entry fails the check. `[unit]`

### Task 1 — Extract the shared registration inputs so both hosts read one computation

**Status**: pending  

The server entry and the skill list, computed once before either registrar runs. Scope is the extraction, not either registrar's use of it.

### Task 2 — Write the host-detection predicate

**Status**: pending  

One named function over the plugin context. Addresses the classification only — what each branch then registers belongs to stories 3 and 4.

### Task 3 — Split the entry into two registrars behind the predicate

**Status**: pending  

Restructures `src/plugin/index.ts`, keeping the exported shape a host loads unchanged and the v2 behaviour identical.

### Task 4 — Write tests for One entry, two registrars

**Status**: pending  

Covers the five criteria tagged `unit`, including the both-match and neither-match control and the confinement check.

## Story 3 — Register the MCP server under v1

**Status**: pending  
**Blocked by**: Story 5  

### Acceptance Criteria

- Given a stub v1 plugin context, the v1 registrar's `config` hook sets `mcp.dpm` to a local-server entry whose command runs the packaged executable. `[unit]`
- The local-server entry the v1 registrar builds is identical to the one the v2 registrar builds — same command array, same environment. `[unit]`
- must NOT — Any tool is advertised under one host and not the other. Control: a planted host-conditional tool registration fails the check. `[unit]`
- must NOT — The plugin writes to the user's OpenCode configuration file. Control: the configuration files are hashed across a plugin load and compared, with a planted write proving the comparison fires. `[integration]`

### Task 1 — Implement the v1 config hook that registers mcp.dpm

**Status**: pending  

Reads the shared server entry from story 2 and writes it into the host's config. Scope is the MCP key only; `skills.paths` is story 4.

### Task 2 — Write tests for Register the MCP server under v1

**Status**: pending  

Covers the three `unit` criteria and the `integration` no-config-write criterion, whose control is the planted write.

## Story 4 — Register the skills under v1, fenced and alarmed

**Status**: pending  
**Blocked by**: Story 5, 02-02 Story 4  

### Acceptance Criteria

- The v1 registrar appends the package's own skills directory to `config.skills.paths`, and discovery over that directory finds exactly twenty-three `SKILL.md` files, every one resolving to a path inside the installed package. `[unit]`
- `skills.paths` is written from exactly one module, and that module carries a marker naming the key as undocumented by OpenCode and saying what to do when it stops working. Control: a planted second write site fails the check. `[unit]`
- The post-registration check reports failure when given a host configuration that does not hold dpm's skills path, and passes when given one that does. `[unit]`
- must NOT — Registration writes anything into the user's project tree. Control: the project tree is hashed before and after a plugin load and compared, with a planted write proving the comparison fires. `[integration]`

### Task 1 — Write the single skills-path module with its unsupported marker

**Status**: pending  

One module owns the undocumented key, per ADR 02-03. The marker states the dependency and the recovery, not the history.

### Task 2 — Implement the post-registration check and its refusal

**Status**: pending  

Addresses the failure path the undocumented key creates: registration that silently does nothing. Scope is detection and the loud report, not a fallback mechanism.

### Task 3 — Write tests for Register the skills under v1, fenced and alarmed

**Status**: pending  

Covers the three `unit` criteria and the `integration` no-project-write criterion, whose control is the planted write.

## Story 5 — Verify cross-story integration for The v1 registrar

**Status**: pending  
**Blocked by**: —  

### Acceptance Criteria

- One plugin load under a stub v1 context produces a configuration holding both `mcp.dpm` and dpm's `skills.paths` entry, built from the same computed inputs rather than from two independent constructions. `[integration]`
- The same exported entry loaded under a stub v2 context produces the v2 registrations and writes no `config` at all. `[integration]`

### Task 1 — Write the cross-registrar integration test

**Status**: pending  

Exercises one load per host stub and asserts the whole configuration each produces. Distinct from the per-story tests, which each assert one registrar's own key.

## Dependencies

- blocks → 02-04
- blocks → 02-05
