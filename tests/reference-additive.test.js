/**
 * Epic 03-01 Story 3 — the suite survives an additive field.
 *
 * FR13 keeps this work additive: ids go on being returned and `reference` arrives beside them, so
 * the risk is what a new field costs rather than what a changed one breaks. The cost falls
 * entirely on assertions that state a claim over a *whole row* — those fail on any addition,
 * whatever it was for, and they fail with a diff rather than with a sentence about what broke.
 *
 * NFR4 asks for that set to be enumerated before the work rather than discovered during it. The
 * enumeration is `documentRowEqualities()`, which reads the suite source; this holds it empty.
 *
 * **The check must be able to find one, and the second test is what says so.** A sweep that
 * returns nothing looks identical whether the suite is clean or the reading is broken — the
 * failure this project has recorded in thirteen retros — so the reading is run against a planted
 * corpus as well as against the real one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  documentRowEqualities, equalitiesIn, suiteSourcesChecked,
} from './support/document-equality.js';

test('no test states a claim by deep-equality over a whole document row', () => {
  const checked = suiteSourcesChecked();

  assert.ok(checked.length > 100, `the check read ${checked.length} suite sources`);
  assert.ok(checked.includes('tools.test.js'),
    'including the round-trip suite, which is where the one instance was');

  assert.deepEqual(
    documentRowEqualities(), [],
    'a whole-row equality breaks on the next additive field, whatever that field is for',
  );
});

test('the reading finds a whole-row equality when there is one to find', () => {
  // Both shapes the check recognises, written out as a corpus rather than described. The first is
  // the literal form; the second is the form `tools.test.js` actually had, where neither side of
  // the equality is a literal and only the binding says what the value is.
  const planted = [
    "assert.deepEqual(row, { id: 'x', kind: 'spec', slug: 'a', title: 'A' });",
    'const written = call.read_spec({ id });\nassert.deepEqual(written, expected);',
  ];

  for (const source of planted) {
    assert.ok(
      equalitiesIn(source, 'planted.js').length > 0,
      `the check finds the equality in: ${source.split('\n')[0]}`,
    );
  }

  // And the shapes it must leave alone, or it will be argued with rather than acted on.
  const innocent = [
    "assert.deepEqual(stampRows(db), [{ singleton: 1, version: '0.4.0' }]);",
    'const ids = call.list_epic({}).items.map((row) => row.id);\nassert.deepEqual(ids, [first]);',
  ];

  for (const source of innocent) {
    assert.deepEqual(
      equalitiesIn(source, 'planted.js'), [],
      `a row that is not a document, and a projection off one, are left alone: ${source}`,
    );
  }
});
