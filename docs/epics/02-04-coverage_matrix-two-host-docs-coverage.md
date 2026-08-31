# Coverage — Documentation and permissions

**Number**: 02-04  
**Source epic**: 02-04  
**Status**: pending  

## Coverage

| # | Requirement | Spec Text | Story Criterion | Covered by | Test Approach | Verified |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | FR6 | README install, first run, guard symlink and "when the guard refuses" cover v1 and v2 | For each of install, first run, guard symlink and "when the guard refuses", the README gives both the v1 and the v2 form. Control: a planted section carrying only one host's form, reported by heading. | Story 1 | `[unit]` |  |
| 2 | FR6 | with the plugin-package location correct for each host rather than one location presented as the location | The plugin-package location is stated per host, so neither host's path is presented as the location. Control: a planted single-location sentence, reported by line. | Story 1 | `[unit]` |  |
| 3 | FR6 | rather than one location presented as the location | must NOT — The README names one host's binary where the sentence is true of either. Control: a planted `opencode2` in a host-neutral sentence, reported by line. | Story 1 | `[unit]` |  |
| 4 | FR7 | The recommended entries are stated per host, against what that host actually matches on | The permission rule the README recommends matches all twenty-three skill identities on both hosts — one `dpm-*` form once the skills carry their own prefix. Control: a planted rule matching none, reported as a failure rather than passing over an empty match set, which is the shape that passes by doing nothing. | Story 2 | `[unit]` |  |
| 5 | FR7 | v1's permission engine evaluates the `skill` action against the unprefixed front-matter name | The README states, per host, what the permission engine matches on — v1 the front-matter name, v2 the registered id — so a reader can tell why one rule works on both. | Story 2 | `[unit]` |  |
