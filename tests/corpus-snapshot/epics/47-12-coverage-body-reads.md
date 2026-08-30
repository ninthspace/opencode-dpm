# Coverage Matrix: Body Reads Across the Corpus

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Epic**: docs/epics/47-12-epic-body-reads.md  
**Date**: 2026-08-11

> **Verification rule**: Verification status (✓) is bound to criterion text. Any change to a story criterion or its spec mapping resets that row to unverified.

| # | Spec Requirement | Spec Text (verbatim) | Story Criterion (verbatim) | Covered by | Spec Test Approach | Verified |
|---|------------------|----------------------|----------------------------|------------|--------------------|----------|
| 1 | FR13 | "So a skill that renders or quotes stored text requests the body, a skill that needs only identity or a typed column does not" | "Every mention of a body-carrying tool across the 23 skill files carries a classification — *renders or quotes stored text* (needs the body) or *needs only identity or a typed column* (does not) — with its reason, enumerated against the live tool registry" | Story 1 | `[unit]` | ✓ |
| 2 | FR13 | "which of the two each read is gets recorded rather than left to be inferred from what a file happens to say" | "The classification covers the skills the proximity sweep reported clean on the same terms as those it flagged; no site is excluded because `include_body` appears elsewhere in the same file" | Story 1 | `[unit]` | ✓ |
| 3 | FR13 (must NOT) | "which of the two each read is gets recorded rather than left to be inferred from what a file happens to say" | "must NOT — a site is classified from the presence of `include_body` nearby rather than from what the step does with the rows" | Story 1 | `[unit]` | ✓ |
| 4 | FR13 | "So a skill that renders or quotes stored text requests the body" | "Every site classified as rendering or quoting stored text passes `include_body`" | Story 2 | `[unit]` | ✓ |
| 5 | FR13 | "a skill that renders stored text from a read that never asked for it produces output that is well-formed, structurally complete, and simply says less" | "`spec` §7 renders requirement text, criterion text and section bodies rather than labels and counts" | Story 2 | `[unit]` | ✓ |
| 6 | FR13 | "a skill that renders stored text from a read that never asked for it produces output that is well-formed, structurally complete, and simply says less" | "`epics` Step 3d quotes spec text and story criteria verbatim, and Step 4's reachability gate reads criterion text rather than counting rows" | Story 2 | `[unit]` | ✓ |
| 7 | FR13 | "Overriding it is an obligation on the corpus, and one that has to be stated because its failure is invisible" | "Every skill mention of a tool that withholds a body either requests the body or is recorded as not needing it, checked over the corpus against the live tool registry rather than a transcribed list" | Story 3 | `[unit]` | ✓ |
| 8 | FR13 | "which of the two each read is gets recorded rather than left to be inferred from what a file happens to say" | "The check matches the construction that binds a read to its step, rather than the proximity of `include_body` to a tool name" | Story 3 | `[unit]` | ✓ |
| 9 | FR13 | "one that has to be stated because its failure is invisible: a withheld column arrives as an *absent field*, not as an error" | "The residual gap the check cannot close is stated in the test rather than left implied" | Story 3 | `[unit]` | ✓ |
| 10 | NFR6 | "Any condition that could produce a false pass — a constraint violation swallowed, a projection silently stale, a search index behind the data — reports and blocks." | "Entry #25's disposition is changed from `closedIn: 47-12` to name the test that asserts it" | Story 3 | `[integration]` | ✓ |
| 11 | FR13 (must NOT) | "Overriding it is an obligation on the corpus, and one that has to be stated because its failure is invisible" | "must NOT — the check passes over an empty enumeration, so a registry yielding no body-carrying tools or a glob matching no skills reads as full compliance" | Story 3 | `[unit]` | ✓ |

## Notes

**Rows 5 and 6 share a spec fragment** because both name a site where the fragment's failure was
actually observed. They are separate rows rather than one because a single ✓ covering both would
let the epic close with one of the two verified.

**Rows 2, 3 and 8 share a fragment** — *"rather than left to be inferred from what a file happens
to say"*. It is the clause the whole epic turns on: the proximity sweep that found the 37 is
itself an inference from what a file happens to say, and each of the three rows forbids that
shortcut at a different point — in the classification's coverage, in how a site is classified, and
in how the check reads a site.

**Row 10 is the only `[integration]` row** and takes its tag from NFR6's register criterion in the
spec's coverage table rather than from FR13's `[unit]`.

**FR13's three original criteria are not in this matrix.** They are delivered and verified under
earlier epics; this covers only the corpus criterion added by the amendment of 2026-08-11.
