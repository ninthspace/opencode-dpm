/**
 * Story 3 — allocation, and the two ways a number goes wrong.
 *
 * It can *repeat*, which is what CPM's glob-the-directory numbering did whenever a file moved
 * to the archive mirror and the union missed it. And it can be *absent*, which is the subtler
 * one: an allocation that matches no row returns nothing and reports success, so the document
 * is written without a number and nothing anywhere raises a hand. The first failure is
 * visible the moment two artefacts collide; the second is visible only if someone looks.
 *
 * So every test here that asserts a number was allocated also asserts what it was, and the
 * one that matters most asserts the rejected design still fails in the way the chosen one
 * does not.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase as planning } from './support/planning-database.js';
import { allocateNumber } from '../src/numbering/allocate.ts';
import { create } from './fixtures/index.js';
import { childDocument, rootDocument } from './fixtures/planning.js';

/** Allocate and write in one step, the way a create tool will. */
function allocateSpec(db, slug) {
  return rootDocument(db, 'spec', { number: allocateNumber(db, 'spec'), slug });
}

test('the first allocation for a kind returns 1, with nothing seeded and nothing to seed it', (t) => {
  const db = planning(t);

  assert.equal(
    db.prepare('SELECT count(*) AS n FROM number_sequence').get().n,
    0,
    'the table starts empty — AD8, and the reason allocation cannot be a bare UPDATE',
  );

  assert.equal(allocateNumber(db, 'spec'), 1, 'the first spec');
  assert.equal(allocateNumber(db, 'spec'), 2, 'and the counter carries on from there');

  const spec = rootDocument(db, 'spec', { number: 1 });
  assert.equal(allocateNumber(db, 'epic', spec.id), 1, 'the first epic under a spec never allocated for');
});

test('an allocation never reports success without a number', (t) => {
  const db = planning(t);

  // The rejected design, run here so the criterion has something to be true *about*. A bare
  // UPDATE against a kind with no row matches nothing: `.get()` returns undefined and no
  // error is raised anywhere, which is a document written with no number.
  const bare = db.prepare(`
    UPDATE number_sequence SET next_value = next_value + 1
     WHERE kind = 'discussion' AND parent_id IS NULL
     RETURNING next_value
  `).get();
  assert.equal(bare, undefined, 'the update path returns nothing and reports success');

  // The chosen one, against the same kind in the same state.
  assert.equal(allocateNumber(db, 'discussion'), 1, 'the upsert creates the row it needs');

  // And the guard, for the case where the statement returns something unusable anyway.
  assert.throws(
    () => allocateNumber(db, 'no_such_kind'),
    /FOREIGN KEY constraint failed/,
    'a kind outside the vocabulary cannot be allocated for at all',
  );
});

test('numbers never repeat across create, archive and create — including past 99', (t) => {
  const db = planning(t);
  const allocated = [];

  for (let i = 0; i < 101; i += 1) {
    const number = allocateNumber(db, 'runbook');
    allocated.push(number);
    const runbook = rootDocument(db, 'runbook', { number, slug: `runbook-${number}` });

    // Archive every third one. CPM's numbering globbed two directories and unioned them; here
    // archival sets a column on a row that never moves, so it is not in the counter's path at
    // all — which is the claim this loop is making.
    if (i % 3 === 0) {
      db.prepare('UPDATE document SET archived_at = ? WHERE id = ?').run('2026-08-08', runbook.id);
    }
  }

  assert.equal(new Set(allocated).size, 101, 'no number was issued twice');
  assert.deepEqual(allocated.slice(98), [99, 100, 101], 'and 99 → 100 is not a boundary here');
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM document WHERE kind = 'runbook' AND archived_at IS NOT NULL").get().n,
    34,
    'while a third of them are archived, which the counter never consulted',
  );
});

test('child sequences restart at 1 per parent and do not reuse after deletion', (t) => {
  const db = planning(t);
  const first = allocateSpec(db, 'first');
  const second = allocateSpec(db, 'second');

  const a1 = allocateNumber(db, 'epic', first.id);
  const a2 = allocateNumber(db, 'epic', first.id);
  assert.deepEqual([a1, a2], [1, 2], 'epics count within their spec');
  assert.equal(allocateNumber(db, 'epic', second.id), 1, 'and every spec restarts at 1');

  // Restarting is only safe because the schema scopes the uniqueness the same way the counter
  // does. Two counters agreeing is not the claim; a counter and a constraint agreeing is.
  childDocument(db, 'epic', first, { sequence: 1, slug: 'first-one' });
  assert.ok(childDocument(db, 'epic', second, { sequence: 1, slug: 'second-one' }), 'sequence 1 twice, under different specs');
  assert.throws(
    () => childDocument(db, 'epic', first, { sequence: 1, slug: 'collides' }),
    /UNIQUE constraint failed: document\.kind, document\.parent_id, document\.sequence/,
    'and not twice under one spec',
  );

  const epic = childDocument(db, 'epic', first, { sequence: a2, slug: 'to-be-deleted' });
  db.prepare('DELETE FROM document WHERE id = ?').run(epic.id);

  assert.equal(
    allocateNumber(db, 'epic', first.id),
    3,
    'deleting the document that held 2 does not put 2 back in circulation',
  );
});

test('a deleted parent takes its counter with it, and a new parent starts clean', (t) => {
  const db = planning(t);
  const spec = allocateSpec(db, 'doomed');

  allocateNumber(db, 'epic', spec.id);
  allocateNumber(db, 'epic', spec.id);
  assert.equal(
    db.prepare('SELECT next_value AS n FROM number_sequence WHERE parent_id = ?').get(spec.id).n,
    2,
  );

  db.prepare('DELETE FROM document WHERE id = ?').run(spec.id);
  assert.equal(
    db.prepare('SELECT count(*) AS n FROM number_sequence WHERE parent_id = ?').get(spec.id).n,
    0,
    'the child counter cascades with the parent it counted within',
  );

  // The root counter is untouched: `spec` numbers are global and never reissued, so the next
  // spec is 2 even though the first one is gone.
  assert.equal(allocateNumber(db, 'spec'), 2, 'while the global spec counter does not rewind');
});

test('the numbering scheme a kind declares is the one it must use', (t) => {
  const db = planning(t);
  const spec = allocateSpec(db, 'schemes');

  assert.throws(
    () => rootDocument(db, 'spec', { number: null, sequence: 3, slug: 'root-with-a-sequence' }),
    /CHECK constraint failed/,
    "a kind declared 'root' cannot store a sequence instead",
  );
  assert.throws(
    () => create(db, 'document', {
      kind: 'epic', numbering: 'child', number: 4, parent_id: spec.id, parent_kind: 'spec',
    }),
    /CHECK constraint failed/,
    'and a kind declared child cannot store a number',
  );
  assert.throws(
    () => rootDocument(db, 'spec', { number: null, slug: 'neither' }),
    /CHECK constraint failed/,
    'nor may a numbered kind carry neither',
  );
  assert.throws(
    () => create(db, 'document', {
      kind: 'epic', numbering: 'child', number: 5, sequence: 5,
      parent_id: spec.id, parent_kind: 'spec',
    }),
    /CHECK constraint failed/,
    'nor both',
  );
});

test("a kind declared numbering = 'none' carries neither number nor sequence", (t) => {
  const db = planning(t);

  // No seeded kind uses 'none' today, so the test declares one. That is the point rather than
  // a gap in the test: an earlier form of the numbering CHECK said "exactly one of number and
  // sequence, always", which made 'none' unusable — no row of such a kind could be inserted
  // at all. A value the vocabulary offers and the schema forbids is a defect however it is
  // found, and it is found by trying the value rather than by reading the CHECK.
  create(db, 'document_kind', { kind: 'note', dir: 'notes', numbering: 'none' });

  const note = create(db, 'document', { kind: 'note', numbering: 'none', slug: 'unnumbered' });
  assert.deepEqual(
    { number: note.number, sequence: note.sequence },
    { number: null, sequence: null },
    'the row is accepted carrying neither',
  );

  assert.throws(
    () => create(db, 'document', { kind: 'note', numbering: 'none', number: 1, slug: 'numbered' }),
    /CHECK constraint failed/,
    'and rejected carrying either — the third branch constrains as well as permits',
  );
});
