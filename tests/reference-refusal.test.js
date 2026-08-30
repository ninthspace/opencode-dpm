/**
 * Epic 03-02 Story 2 — `resolve_reference` refuses rather than guessing.
 *
 * Two refusals, and they fail differently on purpose. **Nothing matches** is a caller's typo and
 * the fix is a corrected string, so the message carries what was looked for and what exists.
 * **Several match** is a legitimate collision — an epic and its coverage matrix share an identifier
 * by design — and the fix is an argument, so the message names the kinds and says to pass one.
 *
 * **The must-NOT is not verified by watching a call throw.** *Returns neither candidate* is an
 * absence, and an absence needs a control that would catch its opposite. The guess has more than
 * one home here — a collapse in the map, a `[0]` on the candidate list, a tie-break by kind — so
 * the control is run once per home, each planted and removed in turn, rather than argued away by
 * the one that happened to be checked. The third test below is the fixture half of that: a suite
 * whose ambiguous case is not actually ambiguous would report the must-NOT held while testing
 * nothing at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { childDocument, matrixUnderEpic, rootDocument } from './fixtures/planning.js';
import { spineTools } from '../src/tools/index.ts';

/** The colliding pair, plus the handlers to ask about it. */
function withPair(t) {
  const db = openPlanningDatabase(t);
  const call = handlers(spineTools(db));

  return { db, call, pair: matrixUnderEpic(db) };
}

/** What a refusal said, or a failure naming what came back instead. */
function refusalOf(call, args) {
  try {
    const row = call.resolve_reference(args);

    assert.fail(`resolve_reference returned ${row.kind} '${row.id}' where it should have refused`);
  } catch (error) {
    assert.ok(error instanceof Error, 'the refusal is an error rather than a returned sentinel');

    return error.message;
  }
}

// --- Criterion 1: the unresolvable reference -----------------------------------------------------

test('a reference matching nothing is refused, and the refusal quotes what was asked for', (t) => {
  const { call } = withPair(t);

  // A near miss rather than nonsense, because that is the case that actually happens: an unpadded
  // number, typed from memory. A refusal that did not quote it back leaves the caller guessing
  // which of the two references in their command was the wrong one.
  const message = refusalOf(call, { reference: '47-3' });

  assert.match(message, /47-3/, 'the refusal names the reference that was looked for');
  assert.match(message, /resolve_reference/, 'and says which tool refused');

  // Narrowed by a kind that has no such document either — the same refusal, with the kind named,
  // so the caller can tell "no such reference" from "not that kind".
  const narrowed = refusalOf(call, { reference: '47-3', kind: 'epic' });

  assert.match(narrowed, /47-3/);
  assert.match(narrowed, /epic/, 'the narrowed refusal says which kind it looked in');
});

// --- Criterion 2 (must_not): the ambiguous reference returns neither -----------------------------

test('a reference two kinds share is refused rather than resolved to either of them', (t) => {
  const { call, pair } = withPair(t);
  const shared = call.read_epic({ id: pair.epic.id }).reference;

  const message = refusalOf(call, { reference: shared });

  // Neither id reaches the caller — not in a row, and not smuggled into the message as "did you
  // mean this one", which would be the same guess written one layer out.
  assert.doesNotMatch(message, new RegExp(pair.epic.id), 'the epic is not offered as the answer');
  assert.doesNotMatch(message, new RegExp(pair.matrix.id), 'and neither is the matrix');

  // **Symmetry is what says no preference was encoded.** A refusal naming only one kind would be a
  // tie-break in prose: the caller would reach for that one, and the ordering that produced it
  // would never be visible. Both kinds appear, so neither is being pointed at.
  assert.match(message, /epic/, 'both kinds are named');
  assert.match(message, /coverage_matrix/, 'including the one a kind-ordered tie-break would drop');
  assert.match(message, /kind/, 'and the message says which argument resolves it');
});

// --- Criterion 3 (control): the fixture really is ambiguous --------------------------------------

test('the ambiguous case above is ambiguous, and the unambiguous one still resolves', (t) => {
  const { call, pair } = withPair(t);

  const epic = call.read_epic({ id: pair.epic.id }).reference;
  const matrix = call.read_coverage_matrix({ id: pair.matrix.id }).reference;

  assert.equal(epic, matrix,
    'the pair shares a reference — without that, the test above watches an ordinary failure');
  assert.notEqual(pair.epic.id, pair.matrix.id, 'and they are two documents rather than one row');

  // The other half of the control. A resolver broken outright would refuse everything, and every
  // assertion above would pass for the wrong reason. Something has to still resolve.
  const spec = call.resolve_reference({ reference: epic.split('-')[0] });

  assert.equal(spec.kind, 'spec', 'a reference only one document holds resolves as it always did');
});

// --- Criterion 4: the refusal names what does exist ----------------------------------------------

test('the refusal lists the references that do exist, narrowed to the kind when one was given', (t) => {
  const db = openPlanningDatabase(t);
  const spec = rootDocument(db, 'spec', { number: 47, slug: 'substrate' });
  const epic = childDocument(db, 'epic', spec, { sequence: 1, slug: 'first' });

  // An ADR, because it is the other child-numbered kind a spec parents — so it takes `47-02` and
  // is a genuine near neighbour of the epic rather than a document from somewhere else entirely.
  childDocument(db, 'adr', spec, { sequence: 2, slug: 'shape' });

  const call = handlers(spineTools(db));
  const printed = call.read_epic({ id: epic.id }).reference;

  const message = refusalOf(call, { reference: '47-9', kind: 'epic' });

  assert.match(message, new RegExp(printed),
    `the refusal offers '${printed}', which is the reference the caller meant`);
  assert.doesNotMatch(message, /47-02/,
    'and not the ADR, which is not what was asked for and would read as a candidate');

  // Unnarrowed, the same call has no kind to filter by and says so by listing across kinds — the
  // caller who mistyped without a kind is the one with least to go on.
  const unnarrowed = refusalOf(call, { reference: '47-9' });

  assert.match(unnarrowed, new RegExp(printed), 'the epic is still offered');
  assert.match(unnarrowed, /47-02/, 'and so is the ADR, since no kind ruled it out');
});

test('a long corpus is truncated in the refusal rather than printed whole', (t) => {
  const db = openPlanningDatabase(t);
  const spec = rootDocument(db, 'spec', { number: 47, slug: 'substrate' });

  for (let sequence = 1; sequence <= 40; sequence += 1) {
    childDocument(db, 'epic', spec, { sequence, slug: `epic-${sequence}` });
  }

  const call = handlers(spineTools(db));
  const message = refusalOf(call, { reference: '47-99', kind: 'epic' });

  const listed = [...message.matchAll(/47-\d+/g)].map(([reference]) => reference)
    .filter((reference) => reference !== '47-99');

  assert.equal(listed.length, 10, `the refusal listed ${listed.length} references rather than ten`);
  assert.match(message, /30 more/, 'and says how many it did not list, so ten does not read as all');
});
