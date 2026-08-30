**Recommended next steps** — one to three, in priority order, each with a runnable command. **The
order of the table is the priority order.** `/dpm:do`, `/dpm:epics` and `/dpm:retro` appear in that
relative order because it is the candidate ordering in `dpm/shared/status-model.md`: work that can
start now, then work that needs planning, then the follow-up on work already done.

| What the rows say | What to recommend |
|---|---|
| Nothing at all | `/dpm:discover` or `/dpm:brief` |
| An epic the `ready` filter returns | `/dpm:do {epic id}` |
| An epic held by an incomplete blocker | Nothing to run — name the blocker from the edge that holds it; the action is to unblock |
| Specs but no epics | `/dpm:epics {spec id}` |
| Briefs but no specs | `/dpm:spec {brief id}` |
| A retired epic, or one whose only incomplete stories are retired | Nothing — it will not be worked, and no retro is owed on it |
| A complete epic, no retro, no `retro_waived_at` | `/dpm:retro {epic id}` |
| A complete epic carrying `retro_waived_at` | Nothing — it is settled |
| A session in flight | Resume it — name the skill and its `phase` |
| Uncommitted changes | Commit before starting new work |

