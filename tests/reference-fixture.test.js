/**
 * Epic 03-01 Story 1 — a fixture that can tell the derivations apart.
 *
 * The reference this spec adds to every document row is `identifierOf()`'s answer, so the tests
 * that check it are only worth as much as the corpus they run against. Two shapes decide that,
 * and neither is reachable from the ordinary fixtures:
 *
 * - **The two-deep chain.** `identifierOf` takes a child's number from the document immediately
 *   below the root, not from the document itself. Those are the same row for an epic, so a
 *   fixture of specs and epics cannot tell a correct implementation from one reading the wrong
 *   sequence. A `coverage_matrix` under an epic is the only seeded shape where they differ.
 * - **The two unnameable rows.** FR3 says a document that cannot be named comes back with the
 *   field empty and the call still succeeds. A corpus in which every document *can* be named
 *   satisfies that requirement by having nothing to fail on.
 *
 * The assertions below therefore say what the fixture makes visible, not merely that it exists:
 * each one names the wrong answer it excludes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase } from './support/planning-database.js';
import { matrixUnderEpic, unnameableDocuments } from './fixtures/planning.js';
import { ProjectionError, ancestryOf, identifierOf, identifiers } from '../src/projection/naming.ts';

/** Every document row, keyed by id — what `ancestryOf` walks. */
function corpus(db) {
  const rows = db.prepare('SELECT id, kind, numbering, number, sequence, parent_id FROM document').all();

  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * A child identifier, spelled out here rather than imported.
 *
 * The module under test is what these assertions are checking, so building the expected string
 * from its own `pad` would make the comparison agree with any padding rule it happened to have.
 */
const childIdentifier = (number, sequence) =>
  `${String(number).padStart(2, '0')}-${String(sequence).padStart(2, '0')}`;

/** `identifierOf` with the ancestry assembled from the database, as `identifiers` does it. */
function nameOf(db, document) {
  const byId = corpus(db);
  const row = byId.get(document.id);

  return identifierOf(row, ...ancestryOf(byId, row));
}

test('the fixture separates a derivation taking the epic\'s sequence from one taking the document\'s own', (t) => {
  const db = openPlanningDatabase(t);
  const { spec, epic, matrix } = matrixUnderEpic(db);

  assert.equal(matrix.parent_id, epic.id, 'the matrix hangs off the epic');
  assert.equal(epic.parent_id, spec.id, 'and the epic off the spec — two levels below the root');
  assert.equal(spec.numbering, 'root', 'with the spec as the only numbered ancestor');

  // The discrimination itself: the two derivations disagree on this chain, so a comparison over
  // it fails for an implementation that reads the wrong sequence. Written as the two answers
  // rather than as an inequality of the sequences, because what the reference carries is the
  // string and it is the string that has to differ.
  const fromTheEpic = childIdentifier(spec.number, epic.sequence);
  const fromItself = childIdentifier(spec.number, matrix.sequence);

  assert.notEqual(
    fromTheEpic,
    fromItself,
    'the epic is not at sequence 1, so the wrong derivation produces a different string — '
    + 'on a chain where both are 1 this criterion verifies nothing',
  );

  assert.equal(nameOf(db, matrix), fromTheEpic, 'and the fixture names the matrix from its epic');
  assert.equal(nameOf(db, matrix), '47-03', 'which is 47-03, where the wrong answer is 47-01');
});

test('the fixture holds one document of each unnameable shape', (t) => {
  const db = openPlanningDatabase(t);
  const { unnumbered, orphan } = unnameableDocuments(db);

  assert.equal(unnumbered.numbering, 'none', 'one row is numbered none');
  assert.equal(orphan.numbering, 'child', 'the other is child-numbered');
  assert.equal(orphan.parent_id, unnumbered.id, 'and its only ancestor carries no number');

  assert.throws(
    () => nameOf(db, unnumbered),
    (error) => error instanceof ProjectionError && /has no human identifier/.test(error.message),
    'a numbering = none document cannot be named, and says so as a ProjectionError',
  );

  assert.throws(
    () => nameOf(db, orphan),
    (error) => error instanceof ProjectionError && /no root-numbered ancestor/.test(error.message),
    'and a child whose chain reaches no root fails for its own distinct reason, not the same one',
  );
});

test('a corpus holding both shapes still names everything nameable', (t) => {
  const db = openPlanningDatabase(t);
  const { matrix } = matrixUnderEpic(db);
  const { unnumbered, orphan } = unnameableDocuments(db);

  const map = identifiers(db);

  assert.equal(map.get(matrix.id), '47-03', 'the nameable document is named');
  assert.equal(map.has(unnumbered.id), false, 'the unnumbered one is omitted rather than raised on');
  assert.equal(map.has(orphan.id), false, 'and so is the one with no root above it');
});
