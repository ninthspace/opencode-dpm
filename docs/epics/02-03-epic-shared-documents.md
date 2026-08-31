# Shared documents through the server

**Number**: 02-03  
**Source spec**: 02  
**Status**: pending  

## Story 1 — The shared-document tool

**Status**: pending  
**Blocked by**: Story 2, Story 4  

### Acceptance Criteria

- The tool returns the byte content of the package's `shared/skill-conventions.md` for the name it is given, and refuses an unknown name rather than returning empty. `[unit]`
- `status-model.md` is served by the same tool under the same name-to-document mechanism, so the shared surface is one tool rather than one tool and one special case. `[unit]`
- The tool's answer is identical under both hosts: it reads from the installed package and takes nothing from the host context. `[unit]`
- must NOT — A second copy of either shared document exists anywhere in the tree. Control: a planted duplicate, reported by path. `[unit]`

### Task 1 — Implement the shared-document tool with its refusal

**Status**: pending  

Name-to-document over the package's `shared/` directory. The refusal on an unknown name is the point, not an edge case — it is what stops the mechanism reproducing the silent omission inside the tool boundary.

### Task 2 — Write tests for The shared-document tool

**Status**: pending  

Covers the four criteria tagged `unit`, including the planted-duplicate control for the must-not.

## Story 2 — Route all twenty-four references through the tool

**Status**: pending  
**Blocked by**: Story 3, Story 4  

### Acceptance Criteria

- Every one of the twenty-three bodies reaches the shared conventions through the tool, and none names a filesystem path to `shared/`. Control: a planted body carrying the old path form, which the check reports by name rather than by count. `[unit]`
- The single reference to `status-model.md` reaches it through the same tool. `[unit]`
- must NOT — A skill body names a host. Control: a planted host name in a body, reported by skill. `[unit]`

### Task 1 — Rewrite the twenty-three conventions references to call the tool

**Status**: pending  

One line per body. The surrounding procedure prose is not touched.

### Task 2 — Rewrite the single status-model reference to the same form

**Status**: pending  

The twenty-fourth reference. Separated so the one-off is not lost inside the batch of twenty-three.

### Task 3 — Write tests for Route all twenty-four references through the tool

**Status**: pending  

Covers the three criteria tagged `unit`. Both checks report by name rather than by count, so a miss says which body.

## Story 3 — Delete the rewrite and bring v2 onto the same mechanism

**Status**: pending  
**Blocked by**: Story 4  

### Acceptance Criteria

- `resolveSupportingPaths` and the `SHARED_REFERENCE` rewrite are gone from `src/plugin/`. Control: a planted reintroduction fails the check. `[unit]`
- A skill body as the v2 registrar presents it is byte-identical to the file on disk. `[unit]`
- No code path under `src/` transforms skill content at registration time, under either host. Control: a planted transform fails the check. `[unit]`

### Task 1 — Delete resolveSupportingPaths and the shared-reference rewrite

**Status**: pending  

Runs only after story 2, when no body still needs the rewrite. Also closes the external-directory rejection standing open on retro 04 under v2.

### Task 2 — Write tests for Delete the rewrite and bring v2 onto the same mechanism

**Status**: pending  

Covers the three criteria tagged `unit`, with the planted reintroduction and the planted transform as controls.

## Story 4 — Verify cross-story integration for Shared documents

**Status**: pending  
**Blocked by**: —  

### Acceptance Criteria

- Taking each of the twenty-three bodies, extracting the reference it carries, and calling the tool with that name returns the conventions text — for all twenty-three. `[integration]`
- The same round trip performed under a v1 stub context returns bytes identical to the one performed under a v2 stub context. `[integration]`

### Task 1 — Write the cross-story round-trip test

**Status**: pending  

Body to reference to tool to text, for all twenty-three under both host stubs. Distinct from story 1's and story 2's tests, which each check one end of that trip.

## Dependencies

- blocks → 02-05
