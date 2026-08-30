# Guard, documentation and host behaviour

**Number**: 01-04  
**Source spec**: 01  
**Status**: pending  

## Story 1 — Guard at OpenCode's hook path

**Status**: pending  
**Blocked by**: Story 4  

### Acceptance Criteria

- The guard regenerates the projection, compares it against what is on disk, and exits non-zero on a mismatch. `[integration]`
- Each of the four refusal cases produces its own explanation, distinguishable from the other three. `[integration]`
- Starting the server in a repository with no hook symlink installed emits the missing-symlink warning. `[integration]`
- In a temporary git repository, the guard hook installs at the repository's hook path and refuses a commit whose projection is stale, with the explanatory output intact. `[integration]`
- `git --version` reports 2.9 or above, and a hook installed at `.git/hooks/pre-commit` in a temporary repository fires on commit. `[integration]`
- must NOT — The guard writes to the working tree or repairs any discrepancy it finds. `[integration]`

### Task 1 — Port the guard to the v2 hook path

**Status**: pending  

Regenerate-and-compare is unchanged in kind. Addresses where the hook lives and what it invokes, not what it decides.

### Task 2 — Carry over the missing-symlink warning on server start

**Status**: pending  

Addresses the warning path in the server, not the guard's own refusals.

### Task 3 — Write tests for "Guard at OpenCode's hook path"

**Status**: pending  

Covers the four distinguishable refusal cases, the stale-commit refusal in a temporary repository, and the rejection of any working-tree write.

## Story 2 — Confirm the package cache location and the symlink target

**Status**: pending  
**Blocked by**: Story 4  

### Acceptance Criteria

- The filesystem location where OpenCode places a git-installed plugin package is confirmed against a real install and recorded as a section on this epic. `[manual]`
- The documented symlink instruction, followed in a fresh project, resolves to an existing file. `[integration]`

### Task 1 — Install the plugin from git and observe where the package lands

**Status**: pending  

A real install rather than a reading of the documentation, since this decides whether the symlink instruction is correct.

### Task 2 — Record the location as a section on this epic

**Status**: pending  

What the README's symlink instruction is written against.

### Task 3 — Write tests for "Confirm the package cache location and the symlink target"

**Status**: pending  

Covers the documented instruction resolving to an existing file. The observation itself is tagged `manual`.

## Story 3 — Session scratch via plugin storage

**Status**: pending  
**Blocked by**: —  

### Acceptance Criteria

- Anything that was per-session scratch keyed by an environment variable uses `ctx.storage` where a database session row is not already the answer. `[unit]`
- On a first run in a fresh project, the database and the dump are created under `.dpm/` and rewritten on a subsequent publish. `[integration]`
- must NOT — A transient file lands in the project tree. `[integration]`

### Task 1 — Audit what was per-session scratch keyed by an environment variable

**Status**: pending  

Names each site and whether a database session row already answers it. Addresses the inventory, not the migration.

### Task 2 — Move the remainder to ctx.storage

**Status**: pending  

Only what the audit found unanswered by a session row. A row that already holds the fact is left alone.

### Task 3 — Write tests for "Session scratch via plugin storage"

**Status**: pending  

Covers the storage criterion, the `.dpm/` first-run behaviour, and the rejection of any transient file landing in the project tree.

## Story 4 — README for a v2 audience

**Status**: pending  
**Blocked by**: —  

### Acceptance Criteria

- Install, first run, guard symlink, and "when the guard refuses" are rewritten for `opencode2`. `[manual]`
- Every command the README gives runs as written in a fresh project. `[integration]`
- The README states that OpenCode v2 is beta and that entrypoints may move under it. `[unit]`
- must NOT — The repository contains a CPM `MIGRATION.md`. `[unit]`

### Task 1 — Rewrite install, first run, guard symlink and "when the guard refuses"

**Status**: pending  

For an `opencode2` audience, against the cache location story 2 confirmed and the refusal behaviour story 1 delivers.

### Task 2 — Remove the CPM MIGRATION.md

**Status**: pending  

It does not carry over. Anyone on CPM migrates via the existing Claude Code dpm first.

### Task 3 — Write tests for "README for a v2 audience"

**Status**: pending  

Every documented command runs as written; the beta statement is present and `MIGRATION.md` is absent. The editorial judgement is tagged `manual`.

## Story 5 — Permission-aware behaviour

**Status**: pending  
**Blocked by**: Story 4  

### Acceptance Criteria

- Skills behave correctly under `ask` and `deny` rules for the `skill` action. `[manual]`
- The README documents the recommended permission entries. `[unit]`
- must NOT — A skill denied by a `deny` rule for the `skill` action performs its work anyway through another route. `[manual]`

### Task 1 — Exercise skills under ask and deny rules for the skill action

**Status**: pending  

Includes checking that a denied skill does not reach its work by another route.

### Task 2 — Document the recommended permission entries in the README

**Status**: pending  

Addresses the entries themselves; the surrounding README rewrite is story 4.

### Task 3 — Write tests for "Permission-aware behaviour"

**Status**: pending  

Covers the documented entries. Behaviour under the host's permission engine is tagged `manual`, since the `ask` path needs a human answering the prompt.

## Dependencies

- blocks → 01-05
