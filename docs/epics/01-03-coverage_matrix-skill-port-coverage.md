# Coverage: Skill port and registration

**Number**: 01-03  
**Source epic**: 01-03  
**Status**: pending  

## Coverage

| # | Requirement | Spec Text | Story Criterion | Covered by | Test Approach | Verified |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | FR2 | no skill contains SQL and nothing parses prose | must NOT — A skill body contains a SQL statement — a `SELECT`, `INSERT`, `UPDATE` or `DELETE` paired with `FROM`, `INTO` or `SET`. | Story 2 | `[unit]` | ✓ |
| 2 | FR2 | no skill contains SQL and nothing parses prose | A CI check fails the build when a skill body contains a SQL statement. | Story 4 | `[integration]` | ✓ |
| 3 | FR3 | All twenty-three skills port and are registered via `ctx.skill.transform` | The `dpm-spec` skill is registered from the package and runs end-to-end in a scratch project, exercising its gates, its tool calls and the shared conventions file. | Story 1 | `[manual]` |  |
| 4 | FR3 | Skill prose is revised wherever it names host mechanics | The rewrite pattern — ID prefix, tool naming, invocation prose — is recorded as a section on this epic before the batch pass begins. | Story 1 | `[integration]` | ✓ |
| 5 | FR3 | All twenty-three skills port and are registered via `ctx.skill.transform` | The registration list computed before the transform contains twenty-three entries and every ID is `dpm-` prefixed. | Story 2 | `[unit]` | ✓ |
| 6 | FR3 | All twenty-three skills port and are registered via `ctx.skill.transform` | All twenty-three skills appear in the host's skill registry after install, every ID carrying the `dpm-` prefix. | Story 2 | `[manual]` | ✓ |
| 7 | FR3 | with `location` pointing into the installed package so directory-based skills keep their supporting files | Each registered skill's `location` points into the installed package. | Story 2 | `[integration]` | ✓ |
| 8 | FR3 | Skill prose is revised wherever it names host mechanics | must NOT — A skill body names a Claude Code mechanism — `mcp__plugin_`, `/dpm:`, `CLAUDE_PLUGIN_ROOT`, or `.claude/`. | Story 2 | `[unit]` |  |
| 9 | FR3 | the invocation story replaces Claude Code's slash-command triggers | Every skill body's invocation prose names the v2 skill-first mechanism rather than a slash-command trigger. | Story 3 | `[unit]` | ✓ |
| 10 | FR3 | the invocation story replaces Claude Code's slash-command triggers | In a scratch project, a user can start each of the twenty-three skills by the documented v2 invocation. | Story 3 | `[manual]` |  |
| 11 | FR3 | Skill prose is revised wherever it names host mechanics | A CI check fails the build when a skill body names `mcp__plugin_`, `/dpm:`, `CLAUDE_PLUGIN_ROOT` or `.claude/`. | Story 4 | `[integration]` | ✓ |
| 12 | FR3 | Skill prose is revised wherever it names host mechanics | control — Introducing a Claude Code mechanism into a skill body makes the CI check fail. | Story 4 | `[integration]` | ✓ |
| 13 | FR3 | All twenty-three skills port and are registered via `ctx.skill.transform` | After one install in a scratch project, all twenty-three skills are registered, each resolves its supporting files from the package, each is startable by the documented invocation, and the CI checks pass over every body. | Story 5 | `[manual]` |  |
| 14 | ENVR5 | a scratch OpenCode project to register into | The plugin installs into a throwaway OpenCode project, its MCP server reaches connected state, and all skills appear as advertised. | Story 2 | `[manual]` | ✓ |
