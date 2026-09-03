# The epic projection renders Blocked by from the wrong end of the edge

**Number**: 01  
**Status**: complete — All three criteria met, each driven red first. The fix is `storyBlockers` parented on `target_story_id` and `edgeSource` resolving the source end; the rest of the change is three fixtures rewritten to state the direction they already meant.  

**Closed**: 2026-09-02T16:55:00.000Z  

## Acceptance Criteria

| Met | Criterion | Note |
| --- | --- | --- |
| ✓ | A story's `**Blocked by**` line names the ends that hold it up — the edges where the story is the *target* — so the rendered epic agrees with `readiness.ts`'s stated contract that an edge reads source-blocks-target. [integration] | `templates.test.js` — "a story's Blocked by line agrees with the readiness query". The oracle is `list_story ready: true`, not a second walk of `dependency`: every story in the corpus is pending, so ready is exactly "nothing holds it". Driven red first, where story 1 rendered `Story 2` while the query called it ready. |
| ✓ | A story blocked by a whole epic renders that epic's identifier under `**Blocked by**`. The source-keyed reading could never show it, so this is a second defect the same fix closes rather than a restatement of the first. [unit] | `templates.test.js` — "a story blocked by a whole epic names that epic". Red first: the pairing has no `source_story_id` to be found by, so the source-keyed read returned the sibling edge instead and rendered `Story 2`. |
| ✓ | must NOT: no story's `**Blocked by**` line names something that story blocks. Control — the check is driven against the pre-fix renderer and must report the inverted names before it is trusted to report none. [integration] | `templates.test.js` — "must NOT — a story names what it blocks under **Blocked by**". Split into a test of its own precisely so it executes: as a second assertion on the cross-epic test it was shadowed by that test's first failure, and a must-NOT nothing ran is not a control. Red first, reporting `01-01 Story 1` on the blocking story's own file. |
