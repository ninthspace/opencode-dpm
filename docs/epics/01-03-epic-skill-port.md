# Skill port and registration

**Number**: 01-03  
**Source spec**: 01  
**Status**: pending  

## Story 1 — Pilot the spec skill end-to-end

**Status**: pending  
**Blocked by**: Story 2, Story 5  

### Acceptance Criteria

- The `dpm-spec` skill is registered from the package and runs end-to-end in a scratch project, exercising its gates, its tool calls and the shared conventions file. `[manual]`
- The rewrite pattern — ID prefix, tool naming, invocation prose — is recorded as a section on this epic before the batch pass begins. `[integration]`

### Task 1 — Port the dpm-spec skill body

**Status**: pending  

ID prefix, tool names taken from the naming recorded in the plugin-entry epic, and invocation prose. One skill only — the batch pass is the next story.

### Task 2 — Register it and run it end-to-end in a scratch project

**Status**: pending  

Exercises gates, tool calls and the shared conventions file, which is why this skill is the pilot.

### Task 3 — Record the rewrite pattern as a section on this epic

**Status**: pending  

What the batch pass applies twenty-two more times. Addresses the pattern, not any individual skill.

### Task 4 — Write tests for "Pilot the spec skill end-to-end"

**Status**: pending  

Covers the recorded-pattern criterion. The facilitated run itself is tagged `manual`.

## Story 2 — Port and register all twenty-three skills

**Status**: pending  
**Blocked by**: Story 3, Story 4, Story 5  

### Acceptance Criteria

- The registration list computed before the transform contains twenty-three entries and every ID is `dpm-` prefixed. `[unit]`
- All twenty-three skills appear in the host's skill registry after install, every ID carrying the `dpm-` prefix. `[manual]`
- Each registered skill's `location` points into the installed package. `[integration]`
- The plugin installs into a throwaway OpenCode project, its MCP server reaches connected state, and all skills appear as advertised. `[manual]`
- must NOT — A skill body names a Claude Code mechanism — `mcp__plugin_`, `/dpm:`, `CLAUDE_PLUGIN_ROOT`, or `.claude/`. `[unit]`
- must NOT — A skill body contains a SQL statement — a `SELECT`, `INSERT`, `UPDATE` or `DELETE` paired with `FROM`, `INTO` or `SET`. `[unit]`

### Task 1 — Apply the rewrite pattern to the remaining twenty-two skill bodies

**Status**: pending  

Addresses prose — IDs, tool names, host mechanics. Registration is task 2.

### Task 2 — Register all twenty-three via ctx.skill.transform with a package location

**Status**: pending  

Addresses the transform and the `dpm-` prefix, through the profile seam rather than a hardcoded list.

### Task 3 — Verify the registry and supporting-file resolution in a scratch project

**Status**: pending  

Manual observation of what the host registered and what each skill can read.

### Task 4 — Write tests for "Port and register all twenty-three skills"

**Status**: pending  

Covers the computed registration list, the package `location`, and both rejections — no Claude Code mechanism and no SQL in a skill body.

## Story 3 — Invocation without slash commands

**Status**: pending  
**Blocked by**: Story 5  

### Acceptance Criteria

- Every skill body's invocation prose names the v2 skill-first mechanism rather than a slash-command trigger. `[unit]`
- In a scratch project, a user can start each of the twenty-three skills by the documented v2 invocation. `[manual]`

### Task 1 — Rewrite every skill's invocation prose for skill-first invocation

**Status**: pending  

Addresses how a skill is started, not what it does once started.

### Task 2 — Walk each of the twenty-three invocations in a scratch project

**Status**: pending  

The affordance check: every skill is reachable by its documented invocation, not merely present in a registry.

### Task 3 — Write tests for "Invocation without slash commands"

**Status**: pending  

Covers the prose criterion across all twenty-three bodies. The walk itself is tagged `manual`.

## Story 4 — Enforce the skill-body prohibitions in CI

**Status**: pending  
**Blocked by**: Story 5  

### Acceptance Criteria

- A CI check fails the build when a skill body names `mcp__plugin_`, `/dpm:`, `CLAUDE_PLUGIN_ROOT` or `.claude/`. `[integration]`
- A CI check fails the build when a skill body contains a SQL statement. `[integration]`
- control — Introducing a Claude Code mechanism into a skill body makes the CI check fail. `[integration]`

### Task 1 — Write the skill-body check

**Status**: pending  

Claude Code mechanisms and SQL statements, over every body under `skills/`.

### Task 2 — Wire it into the CI workflow

**Status**: pending  

Alongside the suite, the type check and the module sweep. The spec requires enforcement, not a review convention.

### Task 3 — Write tests for "Enforce the skill-body prohibitions in CI"

**Status**: pending  

Includes the control: a planted Claude Code mechanism must make the check fail.

## Story 5 — Verify cross-story integration for Skill port and registration

**Status**: pending  
**Blocked by**: —  

### Acceptance Criteria

- After one install in a scratch project, all twenty-three skills are registered, each resolves its supporting files from the package, each is startable by the documented invocation, and the CI checks pass over every body. `[manual]`

### Task 1 — Run the end-to-end milestone-3 check in a scratch project

**Status**: pending  

Twenty-three skills registered, supporting files resolving from the package, each startable by its documented invocation, and the CI checks green over every body.

## Dependencies

- blocks → 01-05
