/**
 * Epic 47-09 Story 2 — the converted `archive`, and the four claims made about it.
 *
 * - "An archive run sets `archived_at` and leaves `status` untouched, so a document is archived
 *   *and* complete rather than forced to choose" [feature]
 * - "Numbers allocated before archival are never reissued after it, with no mirrored
 *   `docs/archive/{type}/` tree and no glob over one" [integration]
 * - "The facilitation survives: a coverage matrix is still never archived apart from its epic, and a
 *   retired epic sitting in a chain whose other members are live is still archived alone rather than
 *   taking the chain with it" [feature]
 * - "must NOT — the skill recovers an entity by reading a generated markdown file rather than by
 *   calling a read tool" [unit]
 *
 * **The first criterion is a claim about what a call does *not* carry**, so asserting the stored
 * status is not enough on its own — a run that passed `status: 'complete'` back would leave the same
 * row behind. The recorder's `passed` is what separates them, and the two assertions are made
 * together for that reason.
 *
 * **The second is FR5, and FR5 is only observable across an archive.** `document_root_number` is
 * unique per kind and an archived row still occupies its number, so nothing in the schema would
 * notice a reissue if allocation came from the index rather than from `number_sequence`. The test
 * therefore archives a spec and then creates another, which is the one sequence that tells them
 * apart.
 *
 * **The third is about reach in two directions at once.** Downward, a coverage matrix must arrive
 * because it is its epic's child; upward, a retired epic must *not* drag its spec out of the working
 * set. So the fixture holds a spec with one retired epic and one live one, and the assertion is that
 * the archived set is exactly the retired branch — with the live sibling's own matrix in the project
 * as the control, since an unscoped `list_coverage_matrix` returns it too.
 *
 * **The binding to the file is the three directions every conversion uses.** See
 * `support/skills.js`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import {
  skillSource, toolNames, prose, instructions, recorder, recoveries, sweep, bindings, reachable,
  seedStartup, driveStartup, SQL, CONSTRUCTIONS, section,
} from './support/skills.js';
import { dispositionProblems } from './support/vocabulary.js';

const SKILL = 'archive';
const source = skillSource(SKILL);

/** Above what any of these fixtures holds. */
const BOUND = 200;

const ARCHIVED_AT = '2026-08-10T00:00:00.000Z';

/** The recoveries this file in particular would reach for, on top of the shared sweep. */
const PARSES = [
  {
    pattern: /docs\/archive/,
    why: 'an archive directory, which is a tree standing in for a column',
  },
  { pattern: /\bmkdir\b|\bmv\b/, why: 'a filesystem move, where archival is a write to a row' },
  {
    pattern: /mirror(?:ed|s)?\s+(?:sub)?director/i,
    why: 'a mirrored tree, which exists only to keep a glob working',
  },
  {
    pattern: /\*\*Source spec\*\*|\*\*Brief\*\*:/,
    why: 'a back-reference field, which is what `parent_id` replaced',
  },
  {
    pattern: /slug match|match(?:ing)? by slug|type identifier/i,
    why: 'slug matching, which is a guess where an edge is already stored',
  },
];

/**
 * What a project holds when someone runs `archive`.
 *
 * Two specs and a brief, chosen so that every unit the run offers has a neighbour it must not
 * touch:
 *
 * - `delivered` — complete, one complete epic, that epic's coverage matrix and retro. The whole
 *   chain is settled and archives together.
 * - `mixed` — still open. One epic `superseded`, one still `pending`, and **both carry a coverage
 *   matrix**. The retired epic archives alone; the spec, the live epic and the live matrix stay.
 * - `orphan` — a problem brief nothing hangs off. Flagged, and refused by the user, which is what
 *   makes per-unit gating observable in the rows.
 *
 * **`mixed`'s spec row is created first, so the spec that gets archived holds the higher number.**
 * That ordering is what makes FR5 observable at all: allocation that read the live index rather than
 * `number_sequence` would hand the next spec a number no *unarchived* row occupies, and if the
 * archived spec were the lower-numbered one the live sibling would go on covering it and the reissue
 * would never happen. A mutation replacing the counter with `MAX(number) … WHERE archived_at IS NULL`
 * survived this test until the two were swapped.
 */
function workspace(tools) {
  const seed = handlers(tools);

  const mixed = seed.create_spec({ slug: 'search', title: 'Search' });
  const delivered = seed.create_spec({ slug: 'persistence', title: 'Persistence' });
  const epicDone = seed.create_epic({
    parent_id: delivered.id, slug: 'spine', title: 'Spine',
  });
  const storyDone = seed.create_story({
    epic_id: epicDone.id, number: 1, title: 'Substrate', position: 0,
  });
  const matrixDone = seed.create_coverage_matrix({
    parent_id: epicDone.id, slug: 'spine', title: 'Coverage: spine',
  });
  const retroDone = seed.create_retro({
    parent_id: epicDone.id, slug: 'spine', title: 'Retro: spine',
  });

  seed.update_story({ id: storyDone.id, status: 'complete' });
  seed.update_epic({ id: epicDone.id, status: 'complete' });
  seed.update_spec({ id: delivered.id, status: 'complete' });

  const epicRetired = seed.create_epic({ parent_id: mixed.id, slug: 'index', title: 'Index' });
  const matrixRetired = seed.create_coverage_matrix({
    parent_id: epicRetired.id, slug: 'index', title: 'Coverage: index',
  });

  // Left `pending` on purpose: a retired epic's stories are not finished, and the retirement is a
  // decision about the epic rather than a roll-up of what is under it.
  seed.create_story({ epic_id: epicRetired.id, number: 1, title: 'Indexer', position: 0 });
  seed.update_epic({
    id: epicRetired.id, status: 'superseded', status_note: 'folded into the entry index',
  });

  const epicLive = seed.create_epic({ parent_id: mixed.id, slug: 'ranking', title: 'Ranking' });
  const matrixLive = seed.create_coverage_matrix({
    parent_id: epicLive.id, slug: 'ranking', title: 'Coverage: ranking',
  });
  seed.create_story({ epic_id: epicLive.id, number: 1, title: 'Scoring', position: 0 });

  const orphan = seed.create_problem_brief({ slug: 'imports', title: 'Bulk imports' });

  const startup = seedStartup(seed, {
    scope: 'archive',
    skill: 'dpm:archive',
    phase: 'Phase 4',
    live: ['A completed chain sat in the working set for two cycles because nothing swept it.'],
  });

  // `startup` is spread last and brings a `retro` of its own — an unparented one, which the survey
  // sees and the signals leave unflagged. This fixture's own retro is named apart from it.
  return {
    delivered, epicDone, storyDone, matrixDone, retroDone,
    mixed, epicRetired, matrixRetired, epicLive, matrixLive, orphan, ...startup,
  };
}

/**
 * The run the SKILL.md prescribes: startup, survey, chains, signals, then a decision per unit.
 *
 * `approve` decides each unit on its own. The default refuses the orphan brief, which is what makes
 * the difference between gating per unit and archiving everything flagged visible in the rows.
 */
function run(call, fixture, { attempt = 1, approve = (unit) => unit.kind !== 'problem_brief' } = {}) {
  driveStartup(call, fixture, { scope: 'archive', skill: 'dpm:archive', attempt, roster: false });

  // Phase 1: the working set. `include_archived` is never passed, so what comes back is what a
  // `WHERE` clause left in rather than what the run remembered to skip.
  const surveyed = [
    ...call.list_problem_brief({ limit: BOUND }).items,
    ...call.list_product_brief({ limit: BOUND }).items,
    ...call.list_spec({ limit: BOUND }).items,
    ...call.list_epic({ limit: BOUND }).items,
    ...call.list_adr({ limit: BOUND }).items,
    ...call.list_retro({ limit: BOUND }).items,
    ...call.list_quick({ limit: BOUND }).items,
    ...call.list_discussion({ limit: BOUND }).items,
  ];

  // Phase 2: what hangs off a document, read from parentage and never assembled by name.
  const descend = (document) => {
    const found = [];

    for (const child of call.read_document_kind({ kind: document.kind }).children) {
      for (const row of call[`list_${child}`]({ parent_id: document.id, limit: BOUND }).items) {
        found.push(row, ...descend(row));
      }
    }

    return found;
  };

  // Phase 3: the signals, every one of them a column already held.
  const resolved = (document) => document.status !== 'pending';
  const settled = (document, below) => {
    if (document.kind === 'epic') {
      const stories = call.list_story({ epic_id: document.id, limit: BOUND }).items;

      return (document.status === 'complete' && stories.every((row) => row.status === 'complete'))
        || (document.status === 'superseded' || document.status === 'withdrawn');
    }

    if (document.kind === 'spec') {
      const epics = below.filter((row) => row.kind === 'epic');

      return epics.length > 0 && epics.every(resolved);
    }

    if (document.kind === 'retro') return document.parent_id !== null;

    return below.length === 0;
  };

  // A unit is a document and everything under it. Roots first, so a chain that is settled whole is
  // offered as one thing; a retired epic inside a live spec is then offered on its own.
  const units = [];

  for (const document of surveyed.filter((row) => row.parent_id === null)) {
    const below = descend(document);

    if (settled(document, below)) {
      units.push({ kind: document.kind, documents: [document, ...below] });
      continue;
    }

    // The chain is not settled, so the walk goes no further up than the branches that are — and
    // never back to the spec, which still owns live work.
    for (const branch of below.filter((row) => row.kind === 'epic')) {
      const under = descend(branch);

      if (settled(branch, under)) units.push({ kind: 'epic', documents: [branch, ...under] });
    }
  }

  // Phase 4: one decision per unit, and `archived_at` alone on every call.
  const archived = [];

  for (const unit of units) {
    if (!approve(unit)) continue;

    for (const document of unit.documents) {
      archived.push(call[`update_${document.kind}`]({ id: document.id, archived_at: ARCHIVED_AT }));
    }
  }

  call.update_session({
    id: `session-run-${attempt}`, state: JSON.stringify({ archived: archived.length }),
  });

  return { surveyed, units, archived };
}

// --- Criterion 1: archived_at is written and status is not ---------------------------------------

test('an archive run stamps archived_at and carries no status with it', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used, passed } = recorder(tools);

  const fixture = workspace(tools);
  const result = run(call, fixture);
  const raw = handlers(tools);

  const stored = raw.read_spec({ id: fixture.delivered.id });

  assert.equal(stored.archived_at, ARCHIVED_AT, 'the spec was never archived');
  assert.equal(stored.status, 'complete', 'archiving overwrote what became of the work');

  // **And it is not merely that the value survived.** A run passing `status: 'complete'` back
  // alongside the stamp leaves an identical row and is the failure this criterion is about — a
  // conclusion recorded by the archiver rather than by whoever reached it.
  for (const tool of ['update_spec', 'update_epic', 'update_coverage_matrix', 'update_retro']) {
    assert.ok(used.has(tool), `the run never drove ${tool}`);
    assert.ok(passed.get(tool).has('archived_at'), `${tool} was called without archived_at`);
    assert.ok(!passed.get(tool).has('status'), `${tool} carried a status it was not asked to set`);
    assert.ok(!passed.get(tool).has('status_note'), `${tool} carried a status note`);
  }

  // The retired epic keeps the note whoever retired it wrote, which is the same orthogonality one
  // column over and the case a status-carrying archive would flatten.
  const retired = raw.read_epic({ id: fixture.epicRetired.id });

  assert.equal(retired.archived_at, ARCHIVED_AT);
  assert.equal(retired.status, 'superseded');
  assert.equal(retired.status_note, 'folded into the entry index');

  assert.match(source, /Archival is a column, and it is not a status/);
  assert.match(source, /complete and put\s*away — and neither answer costs the other/);

  // The rule against the step, its rationale against the section — retro 38's disposition, and the
  // reason Phase 4 is a numbered procedure rather than four paragraphs.
  const stamp = instructions(source, 'Phase 4: Decide, then stamp');
  // `instructions` keeps a continuation line's indent, so every gap here is `\s+` rather than a
  // space — an assertion written against today's wrapping stops constraining anything once a word
  // above it changes.
  assert.match(stamp, /with `archived_at`\s+and\s+\*\*nothing else\*\*/);
  assert.match(stamp, /Never pass `status` on an archive call/);
  assert.match(prose(source, 'Phase 4: Decide, then stamp'), /recording a conclusion nobody reached/);

  assert.deepEqual(bindings(source, tools, { used, passed }), []);
  assert.equal(result.archived.length, 6);
});

// --- Criterion 2: numbers survive archival, and no tree stands in for the column ------------------

test('a number allocated before an archive is never issued again after it', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);

  const fixture = workspace(tools);
  const raw = handlers(tools);

  const before = raw.read_spec({ id: fixture.delivered.id }).number;
  const highest = Math.max(...raw.list_spec({ limit: BOUND }).items.map((row) => row.number));

  run(call, fixture);

  // The archived spec has left the working set: excluded by the tool's own clause, not by anything
  // the caller filtered.
  const live = raw.list_spec({ limit: BOUND }).items.map((row) => row.id);

  assert.ok(!live.includes(fixture.delivered.id), 'an archived spec is still in the working set');
  assert.ok(live.includes(fixture.mixed.id));

  // **And it is archived rather than gone.** The row keeps its number, its title and its parentage,
  // and one argument brings it back.
  const kept = raw.list_spec({ limit: BOUND, include_archived: true }).items
    .find((row) => row.id === fixture.delivered.id);

  assert.equal(kept.number, before);
  assert.equal(kept.title, 'Persistence');

  // **The reissue, which is the only way to observe FR5 here.** `document_root_number` is unique per
  // kind and the archived row still holds its number — so if allocation read the index rather than
  // `number_sequence`, this new spec would be handed a number no live row occupies and nothing in
  // the schema would object.
  const next = raw.create_spec({ slug: 'later', title: 'Later' });

  assert.ok(next.number > highest,
    `a number was reissued after an archive: ${next.number} is not above ${highest}`);
  assert.notEqual(next.number, before);

  // No tree, no move, no glob — asserted on the file, because a run cannot demonstrate the absence
  // of a step it was never written to take.
  assert.deepEqual(recoveries(source, PARSES), []);
  assert.match(source, /\*\*Nothing moves\.\*\*/);
  assert.match(source, /no mirrored tree, and no file to relocate/);
  assert.match(source, /`number_sequence`, which keeps its counters whether a document is archived/);
  assert.match(source, /no create tool\s*accepts a number/);

  // The survey leaves the flag alone, which is what makes the exclusion the tool's.
  const survey = prose(source, 'Phase 1: Survey');
  assert.match(survey, /Leave `include_archived` alone/);
  assert.match(survey, /never while building the candidate list/);
});

// --- Criterion 3: the facilitation survives -------------------------------------------------------

test('a matrix travels with its epic, and a retired epic does not take its spec along', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);

  const fixture = workspace(tools);
  const result = run(call, fixture);
  const raw = handlers(tools);

  const archived = new Set(result.archived.map((row) => row.id));

  // Downward: the settled chain arrived whole, matrix and retro included, because both are the
  // epic's children rather than files a step had to remember.
  assert.deepEqual(archived.has(fixture.matrixDone.id), true,
    'a coverage matrix was archived apart from its epic');
  assert.ok(archived.has(fixture.delivered.id));
  assert.ok(archived.has(fixture.epicDone.id));
  assert.ok(archived.has(fixture.retroDone.id));

  // Upward: the retired epic went, with its own matrix, and nothing above or beside it did.
  assert.ok(archived.has(fixture.epicRetired.id));
  assert.ok(archived.has(fixture.matrixRetired.id));
  assert.equal(archived.has(fixture.mixed.id), false,
    'a retired epic took its specification out of the working set');
  assert.equal(archived.has(fixture.epicLive.id), false);
  assert.equal(archived.has(fixture.matrixLive.id), false);

  // **The control for the matrix half.** Both matrices are returned by the unscoped form of the call
  // the traversal makes, so "the live one was left alone" is a fact about the scope rather than
  // about a project that happened to hold one matrix.
  assert.equal(raw.list_coverage_matrix({ limit: BOUND, include_archived: true }).items.length, 3);
  assert.equal(raw.read_coverage_matrix({ id: fixture.matrixLive.id }).archived_at, null);
  assert.equal(raw.read_spec({ id: fixture.mixed.id }).archived_at, null);

  // Per-unit gating: the orphan brief was flagged and refused, and the refusal held while two other
  // units were approved in the same run. A single gate over everything flagged archives it too.
  assert.ok(result.units.some((unit) => unit.documents[0].id === fixture.orphan.id),
    'the orphaned brief was never offered');
  assert.equal(raw.read_problem_brief({ id: fixture.orphan.id }).archived_at, null,
    'a refused unit was archived anyway');

  const decide = instructions(source, 'Phase 4: Decide, then stamp');
  assert.match(decide, /Gate each unit on its own/);
  assert.match(decide, /never carry an approval forward/);
  assert.match(decide, /is \*\*its own unit\*\*/);
  assert.match(prose(source, 'Phase 4: Decide, then stamp'),
    /sweeping it out because one branch of it was abandoned/);

  const chains = prose(source, 'Phase 2: Chains');
  assert.match(chains, /it travels with it and cannot be left behind/);
  assert.match(chains, /The walk goes down and never up/);
  assert.match(chains, /Scope every one of those calls by `parent_id`/);
});

// --- Criterion 4 (must NOT): no recovery by reading a generated file --------------------------------

test('the archive skill recovers nothing by reading a generated file', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  assert.deepEqual(recoveries(source, PARSES), []);
  assert.deepEqual(sweep(source, SQL), []);
  assert.deepEqual(sweep(source, CONSTRUCTIONS), []);

  const known = new Set(tools.map((tool) => tool.name));
  const named = toolNames(reachable(source));

  for (const required of ['list_problem_brief', 'list_product_brief', 'list_spec', 'list_epic',
    'list_adr', 'list_retro', 'list_quick', 'list_discussion', 'read_document_kind',
    'list_coverage_matrix', 'list_review', 'list_story', 'update_spec', 'update_epic',
    'update_coverage_matrix', 'update_retro']) {
    assert.ok(named.includes(required), `the skill never names ${required}`);
    assert.ok(known.has(required), `${required} is not a tool`);
  }

  // The control: the same reading applied to the procedure this conversion deletes finds every part
  // of it. Without it a pattern that stopped matching reports a clean file indistinguishably.
  const regressed = `${source}\n\nGlob docs/epics/[0-9]*-epic-*.md, anchor on the type identifier `
    + 'to take the slug, read **Source spec**: out of each file, fall back to matching by slug, '
    + 'then mkdir -p docs/archive/epics/ and mv each file into the mirrored subdirectory.';

  assert.ok(recoveries(regressed, PARSES).length >= 5,
    'the sweep passed a file that globs, parses a back-reference, matches slugs, and moves files '
    + 'into a mirrored archive tree');
});

// --- Spec 50 FR8: stamped and skipped are dispositions, not a private pair -----------------------

test('the sweep reports by disposition and keeps no wording of its own', () => {
  // The rule closes Phase 4 rather than opening `## Output`, because what `archive` reports is what
  // the decide-and-stamp loop did — `## Output` is about the rows it left behind.
  const rule = section(source, 'Phase 4');

  assert.notEqual(rule, '', 'the decide-and-stamp phase still exists');
  assert.deepEqual(dispositionProblems(rule, 'archive Phase 4'), []);

  assert.match(rule, /stamped is archived\s+now/, 'a stamped document is not routed');
  assert.match(rule, /skipped was seen and deliberately left/, 'a skipped document is not routed');

  // The third state the old pair had no room for. A run stopped midway is the case where "stamped
  // and skipped" is a complete account of what happened and a misleading account of where things
  // stand, which is precisely what a disposition names and a pair of outcomes cannot.
  assert.match(rule, /never reached before it stopped is waiting on the reader/,
    'a run stopped midway reports nothing waiting, so an interrupted sweep reads as a finished one');

  assert.doesNotMatch(rule, /Report what was stamped and what was skipped/,
    'the private wording survives beside the shared rule');

  assert.ok(dispositionProblems(`${rule}\nEach one is Fixed.`, 'planted').length >= 1,
    'the sweep passed a rule that writes a label out');
});
