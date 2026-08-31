# The v1 walk

**Number**: 02-05  
**Source spec**: 02  
**Status**: pending  

## Story 1 — Host-independent artefacts, without models

**Status**: pending  
**Blocked by**: —  

### Acceptance Criteria

- Nothing in the dump or the projection records which host wrote it. Control: a planted host identifier in a row, found by the sweep. `[unit]`
- A database written through the v1 server produces a byte-identical dump when read through the v2 server, and the guard accepts both. `[integration]`
- The full `node --test` suite passes on a machine with neither `opencode` nor `opencode2` on `PATH`. `[unit]`

### Task 1 — Build the cross-server dump comparison

**Status**: pending  

Two server processes over one database, not two sessions — which is what makes this reachable without a model provider.

### Task 2 — Run the full suite with neither host binary on PATH

**Status**: pending  

Addresses ENVX1 directly. The failure it looks for is a test that silently depends on a binary being installed.

### Task 3 — Write tests for Host-independent artefacts, without models

**Status**: pending  

Covers the two `unit` criteria and the `integration` cross-server comparison, with the planted host identifier as the sweep's control.

## Story 2 — Install under a real v1 host

**Status**: pending  
**Blocked by**: Story 3  

### Acceptance Criteria

- `opencode --version` reports a 1.x build matching the version the v1 types are taken from, so the CLI and the types the registrar is checked against are the same release. `[manual]`
- `opencode2 --version` reports a `0.0.0-beta-*` build matching the v2 SDK. `[manual]`
- The plugin installed into a throwaway project under each host has its MCP server reach connected state with the skills advertised. `[manual]`
- A v1 session completes a turn against the contributor's model provider. `[manual]`
- The plugin loads under a 1.x host and its MCP server and skills appear in that host's registries. `[target]`

### Task 1 — Verify both CLI versions against the SDKs they are typed to

**Status**: pending  

Confirms the CLI and the types the registrar is checked against are the same release, for each host.

### Task 2 — Install into a throwaway project under each host and observe the server connect

**Status**: pending  

Scratch projects outside the checkout, deleted after. Reaching connected state with the skills advertised is the observation; the walk itself is story 3.

## Story 3 — The end-to-end walk

**Status**: pending  
**Blocked by**: —  

### Acceptance Criteria

- A v1 session starts a dpm skill by the documented invocation, the skill obtains its conventions, a dpm tool writes a row, and `dpm-guard` accepts the resulting commit. The evidence is the row, the regenerated projection and the commit. `[manual]`
- In a real v1 session, a dpm skill starts and performs a step that only the conventions prescribe — a session row created with `skill` and `phase` set, per the shared Session Startup procedure — observable in the database rather than inferred from the transcript. `[manual]`
- Following the README's v1 instructions verbatim produces a working install, a guard symlink that resolves, and a refusal on a deliberately stale projection. `[manual]`
- Under a running v1 host, a `deny` rule written as the README recommends blocks a dpm skill, and the same session without the rule runs it. The two directions are each other's control: a block that would have happened anyway proves nothing. `[manual]`

### Task 1 — Drive the v1 walk end to end and record the evidence

**Status**: pending  

One session covering invocation, conventions, a written row and an accepted commit. The evidence is the row, the regenerated projection and the commit — not the transcript.

### Task 2 — Walk the README's v1 instructions and the stale-projection refusal

**Status**: pending  

Followed verbatim rather than adapted — the point is whether the written instructions work, not whether the installer knows what they meant.

### Task 3 — Exercise the permission deny rule in both directions

**Status**: pending  

With the rule and without it. The second run is the control: a block that would have happened anyway proves nothing.
