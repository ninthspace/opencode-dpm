# Plugin entry and MCP registration

**Number**: 01-02  
**Source spec**: 01  
**Status**: pending  

## Story 1 — Plugin entry, MCP registration and the profile seam

**Status**: pending  
**Blocked by**: Story 2, Story 3, Story 4, Story 5  

### Acceptance Criteria

- The plugin's `Plugin.define` entry registers the bundled MCP server via `ctx.mcp.transform`, setting a local server entry whose command runs the packaged executable. `[integration]`
- In a scratch OpenCode v2 project, the plugin loads and its MCP server reaches connected state. `[manual]`
- The published package's manifest declares the plugin entry, and the server command path resolves to an existing file inside the installed package tree. `[integration]`
- must NOT — Installation requires the user to copy a file, hand-edit project configuration, or run a post-install step. `[integration]`
- The set of skills registered is computed from a profile selection resolved at registration time. `[unit]`
- must NOT — The plugin entry hardcodes the skill list. `[unit]`
- The registration transforms close over no session-specific state, so replaying them on reload produces the same registrations. `[unit]`
- must NOT — A registration transform writes to the user's project configuration on disk. `[integration]`
- `opencode2 --version` on the contributor's machine reports a 2.x beta release. `[manual]`

### Task 1 — Add @opencode-ai/plugin at the beta tag and scaffold the Plugin.define entry

**Status**: pending  

`src/index.ts` only. The transforms are tasks 2 and 3.

### Task 2 — Register the MCP server via ctx.mcp.transform

**Status**: pending  

A local server entry whose command runs the packaged `dpm-mcp`. Addresses the server, not skills or commands.

### Task 3 — Compute the registration set from a profile selection

**Status**: pending  

The seam the profile decision requires. Addresses how the list is derived, not what the deferred lite profile eventually contains.

### Task 4 — Verify registration in a scratch OpenCode v2 project

**Status**: pending  

Manual observation of connected state, recording what the host actually did rather than what the API documents.

### Task 5 — Write tests for "Plugin entry, MCP registration and the profile seam"

**Status**: pending  

Covers the criteria tagged `unit` and `integration`, including both rejections: no hardcoded skill list, and no transform writing to project configuration.

## Story 2 — Establish the effective MCP tool naming under v2

**Status**: pending  
**Blocked by**: Story 5  

### Acceptance Criteria

- The effective rendered name of MCP-provided tools under v2 — namespacing and character substitution — is established against a running beta host. `[manual]`
- The established naming is recorded as a written section on this epic before any skill prose is rewritten. `[integration]`
- The advertised tool set and every tool schema match v0.7.0's, compared against a stored snapshot of the tool surface. `[integration]`

### Task 1 — Observe the rendered tool names against a running beta host

**Status**: pending  

Namespacing and character substitution. The first implementation task of this milestone, because skill bodies name tools.

### Task 2 — Record the naming as a section on this epic

**Status**: pending  

The reference the twenty-three skill bodies are rewritten against in the skill-port epic.

### Task 3 — Snapshot the tool surface and compare against v0.7.0

**Status**: pending  

Addresses the advertised set and every schema, not the rendered naming.

### Task 4 — Write tests for "Establish the effective MCP tool naming under v2"

**Status**: pending  

Covers the snapshot comparison and the recorded section. The observation itself is tagged `manual`.

## Story 3 — Resolve the skill supporting-files go/no-go

**Status**: pending  
**Blocked by**: Story 5  

### Acceptance Criteria

- A registered skill's supporting files resolve from the package location, so a skill that reads the shared conventions file at startup finds it. `[manual]`
- The go/no-go outcome is recorded as a written decision on this epic before any skill prose is rewritten, and where the answer is negative the decision names inlining as the fallback and its cost. `[integration]`

### Task 1 — Register one sample skill with a package location and test whether it resolves the shared conventions file

**Status**: pending  

Addresses supporting-file resolution only. A full skill port is the next epic.

### Task 2 — Record the go/no-go as a written decision on this epic

**Status**: pending  

On a negative answer the decision names inlining the shared conventions into twenty-three skills as the fallback, and states its cost.

### Task 3 — Write tests for "Resolve the skill supporting-files go/no-go"

**Status**: pending  

Covers the recorded-decision criterion. The resolution itself is tagged `manual`.

## Story 4 — Zero runtime dependencies and no native compilation

**Status**: pending  
**Blocked by**: Story 5  

### Acceptance Criteria

- The package's `dependencies` contains exactly one entry, `@opencode-ai/plugin`. `[unit]`
- must NOT — A `.node` binary, or a compile step, appears anywhere in the production install tree. `[integration]`
- A clean install in an environment with no C or C++ toolchain and no Python completes successfully, with no node-gyp invocation in its output. `[integration]`
- The plugin dependency is pinned to the `beta` tag. `[unit]`

### Task 1 — Pin the dependency set to @opencode-ai/plugin@beta and nothing else

**Status**: pending  

Addresses `dependencies`; devDependencies are unaffected.

### Task 2 — Run the clean install in the disposable environment

**Status**: pending  

No C or C++ toolchain and no Python present. Consumes the isolated environment job from the bootstrap epic rather than asserting by inspection.

### Task 3 — Write tests for "Zero runtime dependencies and no native compilation"

**Status**: pending  

Covers the dependency count, the beta pin, and the rejection of a `.node` binary or compile step in the install tree.

## Story 5 — Verify cross-story integration for Plugin entry and MCP registration

**Status**: pending  
**Blocked by**: —  

### Acceptance Criteria

- In a scratch project, one install produces a connected MCP server whose advertised tool names match the naming recorded in story 2, and a registered sample skill resolves its supporting files from the package location. `[manual]`
- The plugin's registrations survive a host reload without duplication. `[integration]`

### Task 1 — Run the end-to-end milestone-2 check in a scratch project

**Status**: pending  

One install: connected server, tool names matching the recorded naming, sample skill resolving its supporting files, and registrations surviving a host reload without duplication.

## Dependencies

- blocks → 01-03
- blocks → 01-04
