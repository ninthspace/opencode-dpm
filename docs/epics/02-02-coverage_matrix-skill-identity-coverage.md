# Coverage — Skill identity

**Number**: 02-02  
**Source epic**: 02-02  
**Status**: pending  

## Coverage

| # | Requirement | Spec Text | Story Criterion | Covered by | Test Approach | Verified |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | FR5 | v1 keys skills on the front-matter `name` | Each of the twenty-three skill directories is named `dpm-<skill>` and holds a `SKILL.md` whose front-matter `name` is that same string, which is what OpenCode requires of the pair. | Story 1 | `[unit]` |  |
| 2 | FR5 | lets the later registration win | must NOT — Two skills share a front-matter name. Control: a planted duplicate name fails the check. | Story 1 | `[unit]` |  |
| 3 | FR5 | dpm's skills survive v1's flat name keyspace | `tests/support/skills.js` yields the twenty-three prefixed names, and every test file importing it passes with no per-file edit made for the rename. | Story 3 | `[unit]` |  |
| 4 | FR5 | The `dpm-` id prefix that ADR 01-05 relies on under v2 has no effect there | The v2 registrar registers each skill under the `name` its front matter carries, applying no prefix of its own at registration time. | Story 2 | `[unit]` |  |
| 5 | FR5 | must make a clash visible rather than quietly serving another source's `review`, `status` or `do` in place of dpm's | After registration under v1, a check reports every dpm skill whose registered entry does not resolve to a path inside the installed package, naming each one. | Story 4 | `[unit]` |  |
| 6 | FR5 | a collision is not silent | The check fails when given a host registry in which another source has claimed one of dpm's names, and passes when every dpm name resolves to dpm's own directory. | Story 4 | `[unit]` |  |
| 7 | FR5 | must make a clash visible rather than quietly serving another source's `review`, `status` or `do` in place of dpm's | must NOT — dpm's registration silently overwrites, or is silently overwritten by, another source's skill of the same name. Control: a planted foreign skill under one of dpm's names fires the report. | Story 4 | `[unit]` |  |
