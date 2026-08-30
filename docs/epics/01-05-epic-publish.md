# Publish and release verification

**Number**: 01-05  
**Source spec**: 01  
**Status**: pending  

## Story 1 — Publish opencode-dpm at 0.1.0 to npm

**Status**: pending  
**Blocked by**: Story 2, Story 3  

### Acceptance Criteria

- The package publishes to npm at version 0.1.0. `[integration]`
- The published tarball contains the plugin entry, all twenty-three skill directories, `shared/`, and the five executables. `[integration]`
- must NOT — The published tarball omits a file a registered skill needs at runtime. `[integration]`

### Task 1 — Set the version to 0.1.0 and settle the files and exports fields

**Status**: pending  

Addresses what the tarball will contain. Neither field may point at a build output directory.

### Task 2 — Publish to npm

**Status**: pending  

The release itself. Verification from the published artefact is story 2.

### Task 3 — Write tests for "Publish opencode-dpm at 0.1.0 to npm"

**Status**: pending  

Covers tarball contents — plugin entry, twenty-three skill directories, `shared/`, five executables — including the rejection of a file a registered skill would need at runtime.

## Story 2 — Verify the install from the published artefact

**Status**: pending  
**Blocked by**: —  

### Acceptance Criteria

- Installing the published version into a fresh project by the documented command leaves the MCP server connected and all twenty-three skills advertised, with no further user action. `[manual]`
- One skill runs end to end from the published install, in a clean environment, installed by version. `[manual]`
- must NOT — The release is verified from the working tree rather than from the downloaded artefact. `[manual]`

### Task 1 — Install by version in a clean environment and register

**Status**: pending  

From the downloaded artefact, never the working tree. Addresses install and registration; running a skill is task 2.

### Task 2 — Run one skill end to end from that install

**Status**: pending  

The last check before the release stands: a real skill doing real work from what a user would actually download.

## Story 3 — Verify the production restrictions

**Status**: pending  
**Blocked by**: —  

### Acceptance Criteria

- A full plan-and-publish cycle completes with networking disabled, making no outbound connection attempt. `[integration]`
- Persistence uses only files under `.dpm/`: no port is bound and no external service is contacted during a full plan-and-publish cycle. `[integration]`
- The plugin runs correctly in a project containing no `.claude/` directory and no CPM or dpm marketplace installation. `[integration]`

### Task 1 — Run a full plan-and-publish cycle with networking disabled

**Status**: pending  

Inside the disposable environment from the bootstrap epic, so the claim is run rather than asserted.

### Task 2 — Run the same cycle in a project with no .claude/ directory and no marketplace installation

**Status**: pending  

Addresses independence from Claude Code artefacts at runtime, which the development-side check in the bootstrap epic does not cover.

### Task 3 — Write tests for "Verify the production restrictions"

**Status**: pending  

Covers the criteria tagged `integration`: no port bound, no external service contacted, and persistence confined to files under `.dpm/`.
