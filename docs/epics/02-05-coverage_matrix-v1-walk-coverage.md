# Coverage — The v1 walk

**Number**: 02-05  
**Source epic**: 02-05  
**Status**: pending  

## Coverage

| # | Requirement | Spec Text | Story Criterion | Covered by | Test Approach | Verified |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | FR4 | The requirement is satisfied when a real session reads the file, not when a path exists | In a real v1 session, a dpm skill starts and performs a step that only the conventions prescribe — a session row created with `skill` and `phase` set, per the shared Session Startup procedure — observable in the database rather than inferred from the transcript. | Story 3 | `[manual]` | ✓ |
| 2 | FR6 | README install, first run, guard symlink and "when the guard refuses" cover v1 and v2 | Following the README's v1 instructions verbatim produces a working install, a guard symlink that resolves, and a refusal on a deliberately stale projection. | Story 3 | `[manual]` | ✓ |
| 3 | FR7 | The recommended entries are stated per host, against what that host actually matches on | Under a running v1 host, a `deny` rule written as the README recommends blocks a dpm skill, and the same session without the rule runs it. The two directions are each other's control: a block that would have happened anyway proves nothing. | Story 3 | `[manual]` |  |
| 4 | FR8 | A session starts a dpm skill by its documented invocation, the skill reads its conventions, a dpm tool writes a row, and the guard accepts the resulting commit | A v1 session starts a dpm skill by the documented invocation, the skill obtains its conventions, a dpm tool writes a row, and `dpm-guard` accepts the resulting commit. The evidence is the row, the regenerated projection and the commit. | Story 3 | `[manual]` | ✓ |
| 5 | NFR4 | Nothing written under `.dpm/` records or depends on which host wrote it | Nothing in the dump or the projection records which host wrote it. Control: a planted host identifier in a row, found by the sweep. | Story 1 | `[unit]` | ✓ |
| 6 | NFR4 | The same project worked under either host produces the same rows, the same dump and the same projection | A database written through the v1 server produces a byte-identical dump when read through the v2 server, and the guard accepts both. | Story 1 | `[integration]` | ✓ |
| 7 | ENVR1 | `opencode --version` reporting a 1.x build matching the version the v1 types are taken from | `opencode --version` reports a 1.x build matching the version the v1 types are taken from, so the CLI and the types the registrar is checked against are the same release. | Story 2 | `[manual]` | ✓ |
| 8 | ENVR2 | `opencode2 --version` reporting a `0.0.0-beta-*` build matching the v2 SDK | `opencode2 --version` reports a `0.0.0-beta-*` build matching the v2 SDK. | Story 2 | `[manual]` |  |
| 9 | ENVR3 | installing the plugin into a throwaway project under each host and observing its MCP server reach connected state with the skills advertised | The plugin installed into a throwaway project outside this checkout, under the 1.x host, has its MCP server reach connected state with the skills advertised. Amended from "under each host" at epic 02-05's change moment: epic 02-01 dropped the second host by decision and epic 02-04's README must-NOT forbids naming it, so an install verified under a host DPM refuses to document would be verifying a promise nobody made. The throwaway project is what distinguishes this from the registries criterion below — it is the README's install path walked from cold, in a directory that is not the one the port is developed in. | Story 2 | `[manual]` | ✓ |
| 10 | ENVR4 | a model provider the v1 host can reach and complete a turn against | A v1 session completes a turn against the contributor's model provider. | Story 2 | `[manual]` | ✓ |
| 11 | ENVX1 | the full `node --test` suite passing on a machine with neither `opencode` nor `opencode2` on `PATH` | The full `node --test` suite passes on a machine with neither `opencode` nor `opencode2` on `PATH`. | Story 1 | `[unit]` | ✓ |
| 12 | ENVR5 | the plugin loading under a 1.x host and its MCP server and skills appearing in that host's registries | The plugin loads under a 1.x host and its MCP server and skills appear in that host's registries. | Story 2 | `[target]` | ✓ |
