# Body Reads Across the Corpus

**Source spec**: docs/specifications/47-spec-dpm-sqlite-persistence.md  
**Date**: 2026-08-11  
**Status**: Complete  
**Blocked by**: —  
**Retro applied**: 38 · Testing gaps · Applied — Story 1 classifies each site from its own step's text and Story 3 binds a read to its step, so no site passes because `include_body` appears elsewhere in the file.  
**Retro applied**: 39 · Codebase discoveries · Applied — Task 1.1 enumerates from the live tool registry rather than a typed list, so the generated half of the body declarations in `list.js` is not missed.  
**Retro applied**: 39 · Testing gaps · Applied — Story 3's must-NOT is written as a count-guarded assertion, so an empty registry enumeration or a glob matching no skills fails rather than reading as compliance.  
**Retro applied**: 39 · Patterns worth reusing · Applied — Story 1's must-NOT is driven as a claim about the recorded classification rather than swept for as a pattern, which would flag the epic's own prose.

FR13 specifies that reads are bounded by default and the default is always raisable. All three of
its original criteria test the tool. None asks whether a consumer raises it, and 15 of the 23
skills do not.

## Classify every read of a body-carrying tool
**Story**: 1  
**Status**: Complete  
**Blocked by**: —  
**Satisfies**: FR13

**Acceptance Criteria**:

- Every mention of a body-carrying tool across the 23 skill files carries a classification — *renders or quotes stored text* (needs the body) or *needs only identity or a typed column* (does not) — with its reason, enumerated against the live tool registry [unit]
- The classification covers the skills the proximity sweep reported clean on the same terms as those it flagged; no site is excluded because `include_body` appears elsewhere in the same file [unit]
- must NOT — a site is classified from the presence of `include_body` nearby rather than from what the step does with the rows [unit]

**Retro**: [Criteria gap] The sweep's 37 was wrong in both directions and the story's criteria only anticipated one of them — 29 real defects, with two of the six "clean" skills carrying one and seven of `inspect`'s flagged sites needing no body at all.

### Enumerate every site
**Task**: 1.1  
**Description**: Build the (skill, tool, step) set from the live tool registry and the skill files, so the input is derived rather than typed. Covers the enumerated-against-the-registry criterion.  
**Status**: Complete

### Classify each site by what its step does with the rows
**Task**: 1.2  
**Description**: The judgement pass, and the one that cannot be automated away. Covers the classification criterion and its must-NOT.  
**Status**: Complete

### Record the classification where Story 3's assertion can read it
**Task**: 1.3  
**Description**: Each entry carries its reason, so an exemption fails when its reason expires rather than outliving it — the exemption-with-a-control shape retro 38 recommends.  
**Status**: Complete

### Write tests for Story 1
**Task**: 1.4  
**Description**: The controls — a site whose only nearby `include_body` belongs to a different read must classify on its own step, and an enumeration yielding nothing must fail.  
**Status**: Complete

---

## Ask for the body where the skill renders text
**Story**: 2  
**Status**: Complete  
**Blocked by**: Story 1  
**Satisfies**: FR13

**Acceptance Criteria**:

- Every site classified as rendering or quoting stored text passes `include_body` [unit]
- `spec` §7 renders requirement text, criterion text and section bodies rather than labels and counts [unit]
- `epics` Step 3d quotes spec text and story criteria verbatim, and Step 4's reachability gate reads criterion text rather than counting rows [unit]

**Retro**: [Testing gaps] Story 1's must-NOT asserted a floor on the defect count (`>= 20` sites needing a body their step never asks for), which Story 2 made unsatisfiable by fixing them — a criterion phrased as *the corpus still has N of these* expires the moment the epic that found them succeeds, and the disagreement it was really testing had to be re-grounded on the direction no fix can empty.

### Fix the two verified sites
**Task**: 2.1  
**Description**: `spec` §7's render, and `epics` Step 3d's verbatim matrix and Step 4's reachability gate. Named separately from 2.2 because they are criteria rather than examples — a story that fixed thirty-five sites and missed these two would pass a criterion written only in general terms.  
**Status**: Complete

### Fix the remaining sites Story 1 classified as needing the body
**Task**: 2.2  
**Description**: Covers the first criterion. Scope comes from Story 1's recorded classification, not from the proximity sweep.  
**Status**: Complete

### Write tests for Story 2
**Task**: 2.3  
**Description**: That each fixed site now returns the text it renders, driven through the read rather than asserted on the file.  
**Status**: Complete

---

## Assert the rule over the corpus
**Story**: 3  
**Status**: Complete  
**Blocked by**: Story 1, Story 2, Epic 47-11-epic-capability-and-unmade-checks  
**Satisfies**: FR13, NFR6 (register #25)

**Acceptance Criteria**:

- Every skill mention of a tool that withholds a body either requests the body or is recorded as not needing it, checked over the corpus against the live tool registry rather than a transcribed list [unit]
- The check matches the construction that binds a read to its step, rather than the proximity of `include_body` to a tool name [unit]
- The residual gap the check cannot close is stated in the test rather than left implied [unit]
- Entry #25's disposition is changed from `closedIn: 47-12` to name the test that asserts it [unit]
- must NOT — the check passes over an empty enumeration, so a registry yielding no body-carrying tools or a glob matching no skills reads as full compliance [unit]

**Retro**: [Testing gaps] Story 2's success made the corpus agree with itself, so a block-scoped and a file-scoped reading now return the same answer everywhere the answer is `true` — the construction criterion could only be driven on planted sources, and merging block boundaries in `blocks()` was the mutation that proved the real check reads the block rather than the file.

### Assert the rule over the corpus
**Task**: 3.1  
**Description**: Reads Story 1's recorded classification and matches the construction that binds a read to its step. Covers the first two criteria.  
**Status**: Complete

### State the residual gap the check cannot close
**Task**: 3.2  
**Description**: Given its own task so it is not the thing that gets dropped when 3.1 goes green. Retro 36: when a grep *is* the requirement, state what the sweep cannot see rather than pretend it is total.  
**Status**: Complete

### Change entry #25's disposition
**Task**: 3.3  
**Description**: From `closedIn: 47-12` to the test 3.1 produces. This is the criterion that makes the story blocked by 47-11 — the register must be parsed from the spec before a disposition can be changed in it.  
**Status**: Complete

### Write tests for Story 3
**Task**: 3.4  
**Description**: The controls — an empty registry enumeration must fail, a glob matching no skills must fail, and a site passing only by proximity must fail.  
**Status**: Complete

---

## Notes

**How the 37 was found, and why it is a floor rather than a count.** On 2026-08-11 the corpus was
swept against the live tool registry: 36 tools withhold a body column, and 37 (skill, tool) pairs
across 15 of the 23 skills mention one with no `include_body` within 400 characters. Six skills
came back clean — `artifact`, `clean`, `consult`, `discover`, `library`, `party`.

**That clean list is the least trustworthy part of the output**, and retro 38 says why in as many
words: *"a step's `include_body` was covered by a shared section that names it for different
reads."* A proximity check on this exact subject has already produced a false pass in this
project. Story 1's classification therefore reads every site rather than inheriting the sweep's
verdict, and its must-NOT forbids the shortcut that produced the number.

**The four verified defects**, established by reading what each skill says it does with the rows:

- `spec` §7 — "Render the complete spec in the message body", from `list_requirement`,  
  `list_acceptance_criterion`, `list_adr` and `list_document_section`. The section names `limit`  
  and never `include_body`; the whole file mentions `include_body` once, for `list_agent`.
- `epics` line 73 — "Read the spec and its parts" before breaking it down.
- `epics` Step 3d — the coverage matrix quotes spec text and story criteria **verbatim**.
- `epics` Step 4 — the reachability gate, which the skill describes as requiring "reading the  
  criteria rather than counting rows", and which the skill calls "the only gate that asks whether  
  the delivered system can be used".

Step 4 is the worst of the four. A thin render looks thin; a reachability verdict computed over
withheld text looks decided.

**Where the body columns are declared**: `dpm/src/tools/spine/requirement.js` and
`criterion.js` declare `body: ['text']`; `dpm/src/tools/list.js` copies each list tool's `body`
from its matching read tool, which is why the list side withholds without declaring it locally.
Any enumeration must come from the registry for that reason — a transcribed list would miss the
generated half.

**The shared conventions file is already correct** and is the model: `dpm/shared/skill-conventions.md`
passes `include_body` in all four of its reads. The lesson was learnt at that one site and not
carried to the 23 beside it, which is the shape recorded in `docs/library/lessons-learned.md`.

**Step 3c — integration testing story: skipped.** No `[integration]` criteria in the epic. The
cross-story links are sequential dependencies rather than components that must interoperate, and
each is already carried by a blocking relationship.
