# Coverage — Shared documents through the server

**Number**: 02-03  
**Source epic**: 02-03  
**Status**: pending  

## Coverage

| # | Requirement | Spec Text | Story Criterion | Covered by | Test Approach | Verified |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | FR4 | All twenty-three bodies open by reading `dpm/shared/skill-conventions.md` | The tool returns the byte content of the package's `shared/skill-conventions.md` for the name it is given, and refuses an unknown name rather than returning empty. | Story 1 | `[unit]` | ✓ |
| 2 | FR4 | All twenty-three bodies open by reading `dpm/shared/skill-conventions.md` | must NOT — A second copy of either shared document exists anywhere in the tree. Control: a planted duplicate, reported by path. | Story 1 | `[unit]` | ✓ |
| 3 | FR4 | Every skill's conventions reference resolves under a host that reads skill bodies verbatim | Every one of the twenty-three bodies reaches the shared conventions through the tool, and none names a filesystem path to `shared/`. Control: a planted body carrying the old path form, which the check reports by name rather than by count. | Story 2 | `[unit]` | ✓ |
| 4 | FR4 | `resolveSupportingPaths` — the registration-time rewrite that makes this work under v2 — has nowhere to run | `resolveSupportingPaths` and the `SHARED_REFERENCE` rewrite are gone from `src/plugin/`. Control: a planted reintroduction fails the check. | Story 3 | `[unit]` | ✓ |
| 5 | FR4 | Every skill's conventions reference resolves under a host that reads skill bodies verbatim | Taking each of the twenty-three bodies, extracting the reference it carries, and calling the tool with that name returns the conventions text — for all twenty-three. | Story 4 | `[integration]` | ✓ |
| 6 | NFR1 | Skill bodies, tool schemas, the MCP server, the guard and the database are shared verbatim between hosts | The tool's answer is identical under both hosts: it reads from the installed package and takes nothing from the host context. | Story 1 | `[unit]` | ✓ |
| 7 | NFR1 | no skill body and no tool module branching on which host is running | must NOT — A skill body names a host. Control: a planted host name in a body, reported by skill. | Story 2 | `[unit]` | ✓ |
| 8 | ENVX2 | offers no content transform | A skill body as the v2 registrar presents it is byte-identical to the file on disk. | Story 3 | `[unit]` | ✓ |
| 9 | ENVX2 | a host hook that rewrites skill content must not be required | No code path under `src/` transforms skill content at registration time, under either host. Control: a planted transform fails the check. | Story 3 | `[unit]` | ✓ |
| 10 | ENVX2 | a design that assumes one is a design that runs on one host | The same round trip performed through the callable route — the `server` export, which is v1's only handle on the MCP registry — returns bytes identical to the one performed through the object route, the `{id, setup}` default export whose `skill.transform` is v1's only handle on the skill registry and which `tests/support/host-contexts.js` records as the v2-shaped API v1 bundles alongside it. Amended from "a v1 stub context" and "a v2 stub context": there is one recorded host context, taken off OpenCode 1.18.25, and v2 exists in this port only in the type graph, which is erased before evaluation. The two protocol routes are the real axis dpm ships a separate module for, and the divergence they can produce — two entries resolving different trees — is the one epic 02-01 story 5 was written to catch. | Story 4 | `[integration]` | ✓ |
