# Skill identity

**Number**: 02-02  
**Source spec**: 02  
**Status**: pending  

## Story 1 — Rename the twenty-three skills to dpm-*

**Status**: pending  
**Blocked by**: Story 2, Story 3, Story 4  

### Acceptance Criteria

- Each of the twenty-three skill directories is named `dpm-<skill>` and holds a `SKILL.md` whose front-matter `name` is that same string, which is what OpenCode requires of the pair. `[unit]`
- Every front-matter `name` matches `^[a-z0-9]+(-[a-z0-9]+)*$`. Control: a planted name carrying an underscore or a capital fails the check. `[unit]`
- The rename changes only the directory name, the front-matter `name`, and cross-references between bodies; the existing skill-body check passes unchanged over all twenty-three. `[unit]`
- must NOT — Two skills share a front-matter name. Control: a planted duplicate name fails the check. `[unit]`

### Task 1 — Rename the twenty-three skill directories to dpm-*

**Status**: pending  

Directory names only. Every path constant that follows from them belongs to story 3.

### Task 2 — Rewrite the twenty-three front-matter names to match their directories

**Status**: pending  

The `name` field alone. Procedure prose, gate wording and the conventions reference are not touched here.

### Task 3 — Update cross-references between skill bodies to the new names

**Status**: pending  

Addresses the handoff lines one skill uses to name another. Scope is the reference, not the sentence around it.

### Task 4 — Write tests for Rename the twenty-three skills to dpm-*

**Status**: pending  

Covers the four criteria tagged `unit`, each with the planted control the criterion names.

## Story 2 — Stop the v2 registrar prefixing

**Status**: pending  
**Blocked by**: —  

### Acceptance Criteria

- The v2 registrar registers each skill under the `name` its front matter carries, applying no prefix of its own at registration time. `[unit]`
- The registered v2 id for each skill is the same string as before the change, so ADR 01-05's namespace defence holds by a different route and with the same result. `[unit]`
- `ID_PREFIX` and any other registration-time prefixing constant is gone from `src/plugin/`. Control: a planted re-introduction fails the check. `[unit]`

### Task 1 — Register on the front-matter name and delete the id prefix

**Status**: pending  

The registered id must come out the same string it did before; only where the prefix originates changes.

### Task 2 — Write tests for Stop the v2 registrar prefixing

**Status**: pending  

Covers the three criteria tagged `unit`, including the planted re-introduction control.

## Story 3 — Move the suite's skill-name assumptions

**Status**: pending  
**Blocked by**: —  

### Acceptance Criteria

- `tests/support/skills.js` yields the twenty-three prefixed names, and every test file importing it passes with no per-file edit made for the rename. `[unit]`
- `tests/corpus.test.js`'s transcribed name list holds the twenty-three prefixed names and still fails when the tree and the list disagree. Control: a planted extra skill directory fails it. `[unit]`
- No test is lost or skipped to the rename: the suite's passing count is at least its pre-rename 1,093. `[unit]`

### Task 1 — Move tests/support/skills.js off the unprefixed names

**Status**: pending  

The shared helper roughly forty test files import. Scope is the helper, so those files need no edit of their own.

### Task 2 — Update the corpus transcription to the prefixed names

**Status**: pending  

The list stays transcribed rather than derived — it is the control that catches a skill silently leaving the tree.

### Task 3 — Write tests for Move the suite's skill-name assumptions

**Status**: pending  

Covers the three criteria tagged `unit`, including the planted extra-directory control and the suite-count floor.

## Story 4 — Make a v1 name clash visible

**Status**: pending  
**Blocked by**: —  

### Acceptance Criteria

- After registration under v1, a check reports every dpm skill whose registered entry does not resolve to a path inside the installed package, naming each one. `[unit]`
- The check fails when given a host registry in which another source has claimed one of dpm's names, and passes when every dpm name resolves to dpm's own directory. `[unit]`
- must NOT — dpm's registration silently overwrites, or is silently overwritten by, another source's skill of the same name. Control: a planted foreign skill under one of dpm's names fires the report. `[unit]`

### Task 1 — Extend the post-registration check to resolve each skill to dpm's own directory

**Status**: pending  

Extends the check epic 02-01 story 4 builds rather than adding a second one. Scope is the per-skill resolution and its report, not the skills-path assertion already there.

### Task 2 — Write tests for Make a v1 name clash visible

**Status**: pending  

Covers the three criteria tagged `unit`, with the planted foreign skill as the control for the must-not.

## Dependencies

- blocks → 02-03
- blocks → 02-04
- blocks → 02-05
