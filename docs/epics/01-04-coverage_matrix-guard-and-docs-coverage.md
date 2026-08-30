# Coverage: Guard, documentation and host behaviour

**Number**: 01-04  
**Source epic**: 01-04  
**Status**: pending  

## Coverage

| # | Requirement | Spec Text | Story Criterion | Covered by | Test Approach | Verified |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | FR6 | It remains a git hook that regenerates and compares, fixes nothing, and refuses with the four-case explanation. | The guard regenerates the projection, compares it against what is on disk, and exits non-zero on a mismatch. | Story 1 | `[integration]` | ✓ |
| 2 | FR6 | refuses with the four-case explanation | Each of the four refusal cases produces its own explanation, distinguishable from the other three. | Story 1 | `[integration]` | ✓ |
| 3 | FR6 | the missing-symlink warning on server start carries over | Starting the server in a repository with no hook symlink installed emits the missing-symlink warning. | Story 1 | `[integration]` | ✓ |
| 4 | FR6 | fixes nothing | must NOT — The guard writes to the working tree or repairs any discrepancy it finds. | Story 1 | `[integration]` | ✓ |
| 5 | FR6 | The install instruction is updated for where OpenCode places plugin packages | The filesystem location where OpenCode places a git-installed plugin package is confirmed against a real install and recorded as a section on this epic. | Story 2 | `[manual]` | ✓ |
| 6 | FR6 | The install instruction is updated for where OpenCode places plugin packages | The documented symlink instruction, followed in a fresh project, resolves to an existing file. | Story 2 | `[integration]` | ✓ |
| 7 | FR8 | Skills behave correctly under `ask` and `deny` rules for the `skill` action | Skills behave correctly under `ask` and `deny` rules for the `skill` action. | Story 5 | `[manual]` | ✓ |
| 8 | FR8 | the README documents the recommended permission entries | The README documents the recommended permission entries. | Story 5 | `[unit]` | ✓ |
| 9 | FR8 | Skills behave correctly under `ask` and `deny` rules for the `skill` action | must NOT — A skill denied by a `deny` rule for the `skill` action performs its work anyway through another route. | Story 5 | `[manual]` | ✓ |
| 10 | FR9 | Anything that was per-session scratch keyed by an environment variable in Claude Code uses `ctx.storage` where a database session row is not already the answer. | Anything that was per-session scratch keyed by an environment variable uses `ctx.storage` where a database session row is not already the answer. | Story 3 | `[unit]` | ✓ |
| 11 | FR9 | No transient files land in the project tree. | must NOT — A transient file lands in the project tree. | Story 3 | `[integration]` | ✓ |
| 12 | FR10 | Install, first run, guard symlink, and "when the guard refuses" are rewritten for `opencode2`. | Install, first run, guard symlink, and "when the guard refuses" are rewritten for `opencode2`. | Story 4 | `[manual]` | ✓ |
| 13 | FR10 | README for a v2 audience | Every command the README gives runs as written in a fresh project. | Story 4 | `[integration]` | ✓ |
| 14 | FR10 | The CPM MIGRATION.md does not carry over. | must NOT — The repository contains a CPM `MIGRATION.md`. | Story 4 | `[unit]` | ✓ |
| 15 | NFR3 | the README states plainly that OpenCode v2 is beta and that entrypoints may move under it | The README states that OpenCode v2 is beta and that entrypoints may move under it. | Story 4 | `[unit]` | ✓ |
| 16 | ENVR6 | git with hook support | `git --version` reports 2.9 or above, and a hook installed at `.git/hooks/pre-commit` in a temporary repository fires on commit. | Story 1 | `[integration]` | ✓ |
| 17 | ENVR10 | a git repository in the user's project | In a temporary git repository, the guard hook installs at the repository's hook path and refuses a commit whose projection is stale, with the explanatory output intact. | Story 1 | `[integration]` | ✓ |
| 18 | ENVR11 | filesystem write access to `.dpm/` inside the project | On a first run in a fresh project, the database and the dump are created under `.dpm/` and rewritten on a subsequent publish. | Story 3 | `[integration]` | ✓ |
