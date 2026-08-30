# dpm Status Model

**The shared definition of how a dpm project's planning state is derived and what to do next.**

This document is the single source of truth for status derivation. Two implementations conform to
it and must never diverge (AD5):

- `/dpm:status` — the in-project reconnaissance skill (prose synthesis).
- `dpm/tools/board` — the cross-project status board & launcher (code).

`/dpm:status` *references* this model in prose; the board *implements* it in code. When a rule
changes, change it here first, then both consumers.

**The reconciliation is automated, in both directions.** `dpm/tools/board/tests/test_contract.py`
reconciles the rule names below against the board's own `DERIVATIONS` registry: a rule added here
without a derivation fails a test, and so does a derivation added to the board without a rule here.
Against the skill the reconciliation is a record carrying a disposition for every rule, and a rule
with no disposition fails too.

---

## Inputs (read-only)

State is derived by **calling dpm's typed MCP tools** against a read-only server spawned at the
project root — never by opening the database, and never by parsing markdown under `docs/` (FR2).
Every input below is a row that arrived as a `tools/call` response.

| Input | Tool call |
|---|---|
| Epics | `list_epic` — every epic in the project |
| Ready epics | `list_epic` with `ready: true` |
| Stories | `list_story` — every story, each carrying the `epic_id` it belongs to |
| Ready stories | `list_story` with `ready: true` |
| Specs | `list_spec` |
| Retros | `list_retro` — each carrying the `parent_id` of the epic it reflects on |
| Dependency edges | `list_dependency` — both ends of every edge |
| Which kinds gate | `list_dependency_kind` with `include_retired: true` |
| Requirements | `list_requirement` — every requirement, each carrying the `spec_id` it belongs to |
| Coverage rows | `list_coverage` — every matrix row, each carrying the `requirement_id` it traces |

**Statuses come from the database's own enum, not from prose.** `document.status`, `story.status`
and `task.status` are each one of `pending`, `complete`, `superseded`, `withdrawn` — all three were
widened together by `020-status-lifecycle.sql`. There is no lead-token parsing and no vocabulary
linting, because there is no free text to parse: a status that is not in the enum cannot be
written. What *can* still mislead is a `status_note` that reads like a status on a row whose status
is `pending`, and a note is never read as a status.

**A truncated read is a wrong count, not a smaller project.** A list that comes back with `more`
set has not been read; raise the bound or read the next offset, and never report the page. Every
figure in this model is a count of rows, so a page boundary silently takes stories out of a
denominator and epics off the candidate list.

**Three values in this model exist nowhere in the database** and are the board's own derivations:
*in progress*, the candidate ordering, and *untraced*. Everything else is read.

---

## Derivation rules

Each heading below is a rule name. The names are the reconciliation's keys — the board registers
its derivations under exactly these strings, and a rule here with no derivation, or a derivation
with no rule here, fails.

### readiness

Whether a row can be worked on now. **Asked of dpm, never recomputed**: pass `ready: true` to
`list_epic` and `list_story` and keep the ids that come back.

The rule itself is `readyClause` in `dpm/src/dependency/readiness.js` and is not restated here — it
is the row being `pending`, a document additionally being unarchived, and no incomplete blocker
reaching it over an edge kind whose `gates_work` is set. A consumer that reconstructs the predicate
from rows is a second implementation of it, and drifts silently the first time that clause changes.

A story's blockers are not all stories: `dependency` reaches a story from another story *and* from a
whole epic. That is a second reason the flag is asked for rather than derived.

### blocking

What holds a row up, **by name**. The edges come from `list_dependency`; an edge counts as blocking
when its `kind` appears in the set of kinds `list_dependency_kind` reports with `gates_work` set,
and when its source is not `complete` (see *retired blockers*).

- **`gates_work` is read, never a list of kind names.** `dependency_kind` is a table so that a
  project adding a fifth kind decides for itself whether it gates. A consumer matching on `'blocks'`
  answers for its own vocabulary rather than the project's.
- **`include_retired: true` is required.** A retired edge kind still gates — `readyClause` joins on
  `gates_work` alone and mentions `retired_at` nowhere, because retirement stops new edges arriving
  rather than releasing the work existing ones hold. The list tool hides retired rows unless asked,
  so a consumer taking the default finds an edge whose kind it has never heard of.
- **An edge reads source-blocks-target**, and each end is a document *or* a story — two exclusive
  column pairs, never both.

This is the whole difference from CPM's board, which infers a blocker by matching a title out of a
`**Blocked by**` line: here the edge is a row, so the blocker has a name because it has an id.

### retired blockers

**Only `complete` releases the work.** `readyClause` says `blocker.status <> 'complete'` in those
words: `superseded` and `withdrawn` retire an epic without delivering what the work waiting on it
was waiting for, so a dependent left pointing at a withdrawn blocker is stuck and reads as stuck.

Two wrong readings arrive at the same place — "terminal means done" and "not pending means done" —
and both hand a user work that dpm's own `ready` filter excludes.

The mirror image belongs to `readyClause` and is not restated: a retired *row* is not offered as
workable either, because readiness requires the row's own status to be `pending`.

### in progress

Some stories complete and some not — **a value the status enum does not carry**, derived over the
epic's story rows.

Stated as two counts (`0 < done < total`) rather than "has a completed story", because all three
cases go through one rule: an epic with every story complete is finished, one with none started has
not begun, and only the middle is under way. An epic with no stories is not *in progress*, and
neither is one whose only unfinished stories are retired — the counts are *progress counts*' below,
so the two cannot drift apart.

The states an epic renders in, **in precedence order**: `complete` (its own status), `superseded` /
`withdrawn` (its own status, kept rather than flattened), `blocked` (anything gating it), *in
progress*, then `ready` — dpm's answer — or `pending`. Blocked outranks in progress because the
question a state answers is "can this be picked up".

### progress counts

Stories done over stories total, counted from the story rows the tools returned, per epic and per
project. A story is done when its status is `complete`.

- **A retired story leaves the count rather than joining either side of it.** A `superseded` or
  `withdrawn` story is not work waiting to be done: held in the denominator it keeps an epic open
  for something nobody intends to do, and counted as done it reports dropped work as delivered.
  **Say how many were retired alongside the fraction**, so a denominator that shrank does not do it
  silently.
- **An epic with no stories has no progress, and 0/0 is not it.** Zero of zero is complete by every
  reading available to it, and an epic nobody has broken down yet would render as finished work.
  The absence is reported as an absence.
- **The project figure is its story rows, not the average of its epics' figures.** Averaging gives
  an epic with no stories a completion of its own and lets it lift the project's number.
- Grouping is on the `epic_id` each story row already carries; one unscoped `list_story` answers
  for every epic.

### untraced requirements

A requirement is **untraced** when no coverage row names it — a question that can only be asked of
rows, because a coverage matrix in markdown is a table nobody joins.

The answer is a set difference: every requirement, minus every requirement a coverage row's
`requirement_id` points at. Both reads are **unscoped** — one `list_requirement` and one
`list_coverage` for the whole project — rather than a coverage read per requirement. A consumer
that scopes `list_coverage` by `requirement_id` and asks once per requirement derives the same set;
the shapes are interchangeable and the rule is what says so.

- **Untraced is a gap in the plan, not slow progress.** A requirement with coverage rows that carry
  no `verified_at` is work under way; one with no rows at all was never broken down. The two states
  have different remedies and are never counted together.
- **Nothing here reads `verified_at`.** Whether a coverage row is verified is a separate question
  from whether it exists, and mixing them makes an unverified requirement disappear into the gap
  list, where the remedy on offer would be to plan work that is already planned.
- **A coverage row pointing at a requirement that is not there does not make one.** The difference
  is taken over the requirement rows, so an orphan coverage row is invisible to this rule; naming
  it is `check_integrity`'s business, not this model's.

### candidate ordering

A project usually has more than one actionable next step, so the model derives an **ordered list**
of candidates rather than a single value. Three kinds, in this order:

1. **`epic_ready`** — an epic dpm reports under `ready`.
2. **`spec_without_epics`** — a spec no epic names as its `parent_id`.
3. **`retro_missing`** — an epic whose status is `complete`, that no retro names as its `parent_id`,
   and whose `retro_waived_at` is unset.

Within a kind, ordered by the row's own number — `number` for root-numbered kinds such as `spec`,
`sequence` for child-numbered ones such as `epic` — then by id, so the list is stable.

**A recorded waiver is a decision already taken.** `retro_waived_at` and `retro_waived_reason` are
written together (`015-retro-waiver.sql` enforces the pair), and an epic carrying one is
retro-satisfied exactly as one with a retro is. Offering it again teaches a user that the
next-action list is noise, and it would never stop appearing.

The command each candidate maps to is the launcher's business (FR8), not this model's.

---

## Graceful degradation

A project the board cannot read is a **named state carrying its remedy**, not a crash, and every
other project goes on rendering (FR11):

| State | Condition |
|---|---|
| `no-database` | no `.dpm/dpm.db` at the project root — refused before any process is spawned |
| `tool-surface-mismatch` | the server does not serve a tool or argument the board calls |
| `server-failed` | the server started and could not answer — a database it will not open, a schema it does not understand |

The distinction between the first and the third is load-bearing for what a remedy can say: one is
the board declining before it spawns anything, the other is a server that started.
