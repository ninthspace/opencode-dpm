/**
 * Epic 04-02 Story 2 — a retirement with no reason, refused at the boundary and by the column.
 *
 * FR4: "The pivot deleted the clause this quoted" and "this criterion was superseded by epic 4" are
 * the same column and different facts, and only a reason separates them. So a withdrawal with no
 * record of why is not a tidy-up, it is a decision nobody can audit — and the story's third
 * criterion says the state must be unreachable *whatever writes it*.
 *
 * **That is two guarantees, not one, and refusing at one of them proves nothing about the other.**
 * The tool's `required` stops a caller; the column's `CHECK` stops everything else — a migration, a
 * fixture, a tool nobody has written yet. This file exercises both, and the control that
 * `retire_coverage` succeeds with a reason is what stops either refusal being read as a tool or a
 * table that refuses everything.
 *
 * Nothing here re-asserts what `coverage-retirement-tool.test.js` already holds about the happy
 * path. What is new is the shape of the refusal: that it names the argument the caller left out,
 * rather than arriving as a constraint name from three layers down.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase as planning, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';

const AT = '2026-08-27T00:00:00Z';

/** The surface, with a pinned clock so what the tool supplies is readable back. */
function surface(t) {
  const db = planning(t);
  const tools = spineTools(db, { now: () => AT });

  return { db, tools, call: handlers(tools) };
}

/** A live binding, and the requirement and criterion it joins. */
function bound(call) {
  const spec = call.create_spec({ slug: 'supersession', title: 'Coverage binding supersession' });
  const epic = call.create_epic({ parent_id: spec.id, slug: 'retire', title: 'Retiring a binding' });
  const story = call.create_story({ epic_id: epic.id, number: 1, title: 'Refuse it', position: 0 });
  const criterion = call.create_story_criterion({
    story_id: story.id, text: 'A retirement carries its reason.', position: 0,
  });
  const requirement = call.create_requirement({
    spec_id: spec.id, label: 'FR4', class: 'functional', position: 0,
    text: 'A retirement without a stated reason is refused, so a binding leaving the matrix is a decision on the record.',
  });

  return call.create_coverage({
    requirement_id: requirement.id,
    spec_fragment: 'A retirement without a stated reason is refused',
    story_criterion_id: criterion.id,
    position: 0,
  });
}

/**
 * Run something that must be refused, and hand back the error so the message can be read.
 *
 * The shape `vocabulary-tools.test.js` and its siblings use. `assert.throws` returns undefined, so
 * a refusal whose message is the point cannot be asserted through it.
 */
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

// --- Criteria 1 and 2: refused at the boundary, naming the argument -------------------------------

test('retire_coverage with no reason is refused and the row is untouched [integration]', (t) => {
  const { call } = surface(t);
  const row = bound(call);

  refused(() => call.retire_coverage({ id: row.id }));

  // **Read back through the tool, because "unchanged" is the half of the criterion a refusal does
  // not establish on its own.** A handler that wrote `retired_at` and then threw would satisfy the
  // rejection and leave exactly the state FR4 forbids.
  const after = call.read_coverage({ id: row.id });

  assert.equal(after.retired_at, null);
  assert.equal(after.retired_reason, null);

  // And it is still offered as live, which is the observable consequence of the row being untouched
  // rather than a second reading of the same two columns.
  assert.deepEqual(call.list_coverage({ story_criterion_id: row.story_criterion_id }).items
    .map((item) => item.id), [row.id]);
});

test('every way of omitting the reason names it, and none reaches the schema [unit]', (t) => {
  const { call } = surface(t);
  const row = bound(call);

  // Four shapes a caller actually produces, each with the message the boundary gives it. The
  // criterion is about *which layer answers*: a `CHECK constraint failed` here would be a true
  // refusal naming a column the caller never wrote, which is the failure this criterion rejects.
  const omissions = [
    { args: {}, says: /'reason' is required/ },
    { args: { reason: undefined }, says: /'reason' is required/ },
    { args: { reason: null }, says: /'reason' is required/ },
    { args: { reason: '' }, says: /'reason' must not be empty/ },
  ];

  for (const { args, says } of omissions) {
    const error = refused(() => call.retire_coverage({ id: row.id, ...args }));

    assert.match(error.message, says);
    assert.match(error.message, /^retire_coverage:/, 'the rejection does not name the tool');
    assert.doesNotMatch(error.message, /CHECK constraint|SQLITE_|constraint failed/,
      `omitting the reason as ${JSON.stringify(args)} surfaced a schema error to the caller`);
  }

  assert.equal(call.read_coverage({ id: row.id }).retired_at, null, 'and none of them wrote');
});

// --- Criterion 3: the state is unreachable, whatever writes it ------------------------------------

test('a half-set retirement is refused by the column, not only by the tool [integration]', (t) => {
  const { db, call } = surface(t);
  const row = bound(call);

  // **The second path to the state, and the reason the criterion says "whatever writes it".** The
  // boundary refusal above is satisfied by a `required` list; a guard there says nothing about a
  // migration, a fixture, or a tool written later. What holds for all of them is the column's
  // `CHECK ((retired_at IS NULL) = (retired_reason IS NULL))`, so it is exercised directly.
  const half = (sql) => refused(
    () => db.prepare(`UPDATE coverage SET ${sql} WHERE id = ?`).run(row.id),
    `a direct write of ${sql} was accepted`,
  );

  assert.match(half(`retired_at = '${AT}'`).message, /CHECK constraint failed/);
  assert.match(half("retired_reason = 'No date given.'").message, /CHECK constraint failed/);

  // Both directions on the insert path too, since a new row is a third writer and the `CHECK` is
  // the same one. Written by statement because no tool creates a binding already retired.
  const inserted = (columns, values) => refused(() => db.prepare(
    `INSERT INTO coverage (id, requirement_id, spec_fragment, story_criterion_id, position, ${columns})
     SELECT 'planted', requirement_id, 'a second fragment', story_criterion_id, 1, ${values}
       FROM coverage WHERE id = ?`,
  ).run(row.id));

  assert.match(inserted('retired_at', `'${AT}'`).message, /CHECK constraint failed/);
  assert.match(inserted('retired_reason', "'No date given.'").message, /CHECK constraint failed/);

  // The sweep that makes this a claim about the table rather than about two statements: no row in
  // the corpus this test built holds the state, and the query is the one an audit would run.
  const halfSet = db.prepare(`SELECT count(*) AS rows FROM coverage
     WHERE (retired_at IS NULL) <> (retired_reason IS NULL)`).get().rows;

  assert.equal(halfSet, 0);
});

// --- Criterion 4, the control: the same call with a reason succeeds -------------------------------

test('the same binding retires when the reason is given [integration]', (t) => {
  const { db, call } = surface(t);
  const row = bound(call);

  // The control on all three refusals above. Without it, a tool that refused every call and a
  // `CHECK` that refused every write would both pass, and the criteria would be satisfied by a
  // feature that does not work.
  const retired = call.retire_coverage({
    id: row.id, reason: 'The pivot deleted the clause this quoted.',
  });

  assert.equal(retired.retired_at, AT);
  assert.equal(retired.retired_reason, 'The pivot deleted the clause this quoted.');

  // And the pair is genuinely both-set on the row, which is the state the `CHECK` admits — so the
  // refusals above are the pairing rather than a column nothing can write at all.
  const stored = db.prepare('SELECT retired_at, retired_reason FROM coverage WHERE id = ?')
    .get(row.id);

  assert.equal(stored.retired_at, AT);
  assert.equal(stored.retired_reason, 'The pivot deleted the clause this quoted.');
});
