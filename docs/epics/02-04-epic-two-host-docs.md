# Documentation and permissions

**Number**: 02-04  
**Source spec**: 02  
**Status**: pending  

## Story 1 — The README covers both hosts

**Status**: pending  
**Blocked by**: —  

### Acceptance Criteria

- For each of install, first run, guard symlink and "when the guard refuses", the README gives both the v1 and the v2 form. Control: a planted section carrying only one host's form, reported by heading. `[unit]`
- The plugin-package location is stated per host, so neither host's path is presented as the location. Control: a planted single-location sentence, reported by line. `[unit]`
- must NOT — The README names one host's binary where the sentence is true of either. Control: a planted `opencode2` in a host-neutral sentence, reported by line. `[unit]`

### Task 1 — Rewrite install, first run, guard symlink and the refusal section in both host forms

**Status**: pending  

Four sections, each gaining a v1 form beside its v2 one. Scope is those four; the rest of the README is untouched.

### Task 2 — Write tests for The README covers both hosts

**Status**: pending  

Covers the three criteria tagged `unit`. Every check reports by heading or by line, so a failure names where.

## Story 2 — Permission guidance per host

**Status**: pending  
**Blocked by**: —  

### Acceptance Criteria

- The permission rule the README recommends matches all twenty-three skill identities on both hosts — one `dpm-*` form once the skills carry their own prefix. Control: a planted rule matching none, reported as a failure rather than passing over an empty match set, which is the shape that passes by doing nothing. `[unit]`
- The README states, per host, what the permission engine matches on — v1 the front-matter name, v2 the registered id — so a reader can tell why one rule works on both. `[unit]`

### Task 1 — State the recommended rule and what each host matches on

**Status**: pending  

One rule, two explanations of why it matches. Addresses the guidance, not the rename that makes it true — that is epic 02-02.

### Task 2 — Write tests for Permission guidance per host

**Status**: pending  

Covers the two criteria tagged `unit`, with the empty-match-set control on the recommended rule.

## Dependencies

- blocks → 02-05
