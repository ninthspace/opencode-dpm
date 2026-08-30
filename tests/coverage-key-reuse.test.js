/**
 * Epic 04-02 Story 4 — the natural key a retirement gives back.
 *
 * `025-coverage-retirement.sql` made `coverage_binding` a **partial** unique index: the triple of
 * requirement, fragment and criterion is unique among live rows and unconstrained among retired
 * ones. Epic 04-01 asserted the two ends of that — a live duplicate is refused, and a retirement
 * lets a corrected binding take the key. What is left, and what this file is, is the middle: the
 * two rows coexisting rather than one replacing the other, the cycle repeating, and the recovery
 * costing nothing above it.
 *
 * **Two of the five criteria are must-NOTs, and the third is the control that gives them meaning.**
 * "Two live bindings on one triple cannot exist" and "recovery does not require destroying the
 * requirement or the criterion" are both satisfied by a schema with a plain `UNIQUE` on the table,
 * where the second binding is refused because *nothing* may repeat the key — retired or not. The
 * criterion that separates the two schemas is the one that retires the same triple twice. Without
 * it every other test here passes against the constraint this epic replaced.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase as planning, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import { claimState } from '../src/coverage/claim.ts';
import { boundCoverage as bound } from './fixtures/planning.js';

const AT = '2026-08-27T00:00:00Z';

/** The tool surface, with a pinned clock so `retired_at` is readable back. */
function surface(t) {
  const db = planning(t);
  const tools = spineTools(db, { now: () => AT });

  return { db, call: handlers(tools) };
}

/** Run something that must be refused, and hand the error back so its message can be read. */
function refused(run, message) {
  let caught;

  try {
    run();
  } catch (error) {
    caught = error;
  }

  assert.ok(caught, message ?? 'the call was accepted when it should have been refused');

  return caught;
}

/** How many coverage rows exist on this requirement, live and retired. */
function rows(db, requirementId) {
  const count = (clause) => db
    .prepare(`SELECT count(*) AS n FROM coverage WHERE requirement_id = ? AND ${clause}`)
    .get(requirementId).n;

  return { live: count('retired_at IS NULL'), retired: count('retired_at IS NOT NULL') };
}

// --- Criteria 1 and 2: the replacement is live, and the two rows coexist --------------------------

test('a retired binding is replaced on the same key, and both rows remain [integration]', (t) => {
  const { db, call } = surface(t);
  const { requirement, binding } = bound(db);

  const first = call.create_coverage(binding());

  call.retire_coverage({ id: first.id, reason: 'The fragment stopped mid-clause.' });

  const replacement = call.create_coverage(binding());

  assert.notEqual(replacement.id, first.id, 'the replacement is the same row, not a new binding');
  assert.equal(replacement.retired_at, null, 'the replacement arrived retired');
  assert.equal(replacement.retired_reason, null);

  // **Coexist, rather than one standing in for the other.** A `retired_at` that behaved like a
  // delete would satisfy the two assertions above and leave nothing to read afterwards, which is
  // the whole reason retirement is a column and not a `DELETE`.
  assert.deepEqual(rows(db, requirement.id), { live: 1, retired: 1 });

  const withdrawn = call.read_coverage({ id: first.id, include_body: true });

  assert.equal(withdrawn.retired_at, AT, 'the withdrawn row lost its retirement');
  assert.equal(withdrawn.spec_fragment, binding().spec_fragment,
    'the withdrawn row lost the fragment that makes it readable as a record');
});

test('only the live binding of the pair counts toward the bound total [integration]', (t) => {
  const { db, call } = surface(t);
  const { requirement, binding } = bound(db);

  const first = call.create_coverage(binding());

  assert.equal(claimState(db, requirement.id).bound, 1);

  call.retire_coverage({ id: first.id, reason: 'The fragment stopped mid-clause.' });

  // The control on the number below, and the reason it is asserted here rather than only after the
  // replacement: a `bound` of 1 at the end is reached either by counting the live row alone or by
  // counting both and subtracting nothing from a table that never held two. Zero in between is what
  // says the count follows the column.
  assert.equal(claimState(db, requirement.id).bound, 0,
    'the retired row is still counted, so the total describes the table rather than the live set');

  call.create_coverage(binding());

  assert.equal(claimState(db, requirement.id).bound, 1,
    'both rows are counted, so a replacement inflates what the requirement claims to cover');
  assert.deepEqual(rows(db, requirement.id), { live: 1, retired: 1 },
    'the total moved because a row went, not because a row was excluded');
});

// --- Criterion 3: the constraint still constrains -------------------------------------------------

test('a second live binding on the same triple is still refused [integration]', (t) => {
  const { db, call } = surface(t);
  const { requirement, binding } = bound(db);

  const first = call.create_coverage(binding());

  const error = refused(() => call.create_coverage(binding()),
    'a duplicate live binding was accepted — the rebuild dropped the key rather than narrowing it');

  assert.match(error.message, /UNIQUE|constraint/i);
  assert.deepEqual(rows(db, requirement.id), { live: 1, retired: 0 },
    'the refused call left a row behind');

  // And it goes on refusing after the key has been round the cycle once, which is the case a
  // partial index gets wrong in the other direction: an index that stopped applying to the
  // replacement would leave the second binding of every corrected pair unconstrained.
  call.retire_coverage({ id: first.id, reason: 'The fragment stopped mid-clause.' });
  call.create_coverage(binding());

  refused(() => call.create_coverage(binding()),
    'the replacement is not covered by the key, so a corrected binding can be duplicated freely');
});

// --- Criterion 5: the control — the same triple retired twice -------------------------------------

test('the same triple may be retired twice, so the key constrains live rows [integration]', (t) => {
  const { db, call } = surface(t);
  const { requirement, binding } = bound(db);

  const first = call.create_coverage(binding());

  call.retire_coverage({ id: first.id, reason: 'The fragment stopped mid-clause.' });

  const second = call.create_coverage(binding());

  call.retire_coverage({ id: second.id, reason: 'The replacement quoted the wrong requirement.' });

  // **This is the assertion the epic turns on.** A plain `UNIQUE (requirement_id, spec_fragment,
  // story_criterion_id)` on the table refuses this write, and passes every other test in this file:
  // "a replacement can take the key" is satisfied by a schema where the first row was deleted, and
  // "a duplicate is refused" is satisfied by a schema where all duplicates are. Two retired rows
  // sharing a key is the one behaviour only a partial index has.
  assert.deepEqual(rows(db, requirement.id), { live: 0, retired: 2 });

  const third = call.create_coverage(binding());

  assert.deepEqual(rows(db, requirement.id), { live: 1, retired: 2 },
    'a third attempt at the key was refused, so the two retired rows are still holding it');
  assert.equal(third.retired_at, null);

  // The reasons are per row rather than per key — the record of *why* each withdrawal happened is
  // what a reader comes to a retired binding for, and a key held once would have lost the first.
  const reasons = call
    .list_coverage({ requirement_id: requirement.id, include_retired: true, include_body: true })
    .items
    .filter((item) => item.retired_at !== null)
    .map((item) => item.retired_reason)
    .sort();

  assert.deepEqual(reasons, [
    'The fragment stopped mid-clause.',
    'The replacement quoted the wrong requirement.',
  ]);
});

// --- Criterion 4: what recovery costs -------------------------------------------------------------

test('recovering a mistaken retirement destroys neither end of the binding [integration]', (t) => {
  const { db, call } = surface(t);
  const { requirement, criterion, binding } = bound(db);

  /** Both documents the binding hangs between, as comparable text. */
  const ends = () => ({
    requirement: db.prepare('SELECT id, text, spec_id FROM requirement WHERE id = ?')
      .get(requirement.id),
    criterion: db.prepare('SELECT id, text, story_id FROM story_criterion WHERE id = ?')
      .get(criterion.id),
  });

  const before = ends();
  const mistaken = call.create_coverage(binding());

  call.retire_coverage({ id: mistaken.id, reason: 'Retired by mistake — the fragment was right.' });

  // The whole of the recovery: one call, reaching neither end. Nothing was deleted, nothing was
  // re-created, and the requirement and the criterion were not touched — which is the criterion,
  // and which is only worth asserting because the alternative was available. A plain `UNIQUE`
  // leaves a project that retired a binding in error with no way back to the key except removing
  // the requirement or the criterion and building both again, taking every other binding on them
  // with it.
  const recovered = call.create_coverage(binding());

  assert.equal(recovered.retired_at, null);
  assert.deepEqual(ends(), before, 'the recovery altered one of the documents it hangs between');

  // **The control.** The comparison above passes on a snapshot that reads nothing, so it has to be
  // shown catching the thing it reports as absent. Deleting the criterion is exactly what recovery
  // must not require, and the same comparison sees it — after which this database is finished with.
  db.exec('PRAGMA foreign_keys = OFF');
  db.prepare('DELETE FROM story_criterion WHERE id = ?').run(criterion.id);

  assert.notDeepEqual(ends(), before,
    'the snapshot cannot see a criterion being destroyed, so it proved nothing above');
});
