/**
 * Epic 03-03 Story 2 — a skill recommends a command by reference, never by id (FR5, FR6).
 *
 * **The corpus is read from the tree, not listed here.** `skillNames()` walks it, so a skill added
 * after this file was written is covered on the day it lands — which is the one skill nobody
 * thought about, and the one a named list would silently exclude while the suite reported the
 * property holding everywhere.
 *
 * **The control is a captured fixture rather than the live file, and it has to be.** The criterion
 * says the pattern finds the four occurrences in the status skill; the rewrite removed them, so by
 * the time this runs the live file cannot demonstrate anything. Without the capture a pattern that
 * matches nothing passes the corpus check exactly as loudly as one that works.
 * `tests/skill-text/README.md` records why nothing there is ever updated to track its source, and
 * why the captures sit beside `tests/fixtures/` rather than in it: a fixture there is code that
 * calls the tool surface, and `fixtures.test.js` holds that line by refusing any document in the
 * directory. Captured prose is a document, so it lives where documents may.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  conventions, NAMED_BY_ID, skillNames, skillSource, sweep,
} from './support/skills.js';

const BEFORE = join(import.meta.dirname, 'skill-text', 'status-next-steps-before.md');

/** Every match, not the first — `sweep` reports one hit per pattern, and the control counts them. */
const occurrences = (text) => NAMED_BY_ID.flatMap(({ pattern }) =>
  [...text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))].map(([hit]) => hit));

/** The rows of the *Recommended next steps* table, as a person reads them. */
function nextSteps(source) {
  const marker = source.indexOf('**Recommended next steps**');

  assert.notEqual(marker, -1, 'the status skill still has a Recommended next steps table');

  return source.slice(marker).split('\n')
    .filter((line) => line.startsWith('|'))
    .filter((line) => !/^\|[-|\s]+\|$/.test(line));
}

// --- Criterion 1: the table the spec was raised from ---------------------------------------------

test('no row of the status table interpolates a document id into a command', () => {
  const rows = nextSteps(skillSource('status'));

  assert.ok(rows.length > 8, `only ${rows.length} table rows were read, so little was checked`);

  for (const row of rows) {
    assert.deepEqual(occurrences(row), [], `this row still names an id: ${row}`);
  }

  // The rows that recommend a command still recommend one. A table emptied of its commands would
  // pass the check above and be a worse table than the one it replaced.
  const commands = rows.filter((row) => /`\/dpm:/.test(row));

  assert.ok(commands.length >= 4, `${commands.length} rows still carry a runnable command`);
  assert.ok(commands.filter((row) => /reference/.test(row)).length >= 4,
    'and the ones that take a target say to pass its reference');
});

// --- Criterion 2: the whole tree ------------------------------------------------------------------

test('no skill in the tree names a document by its id where a person reads or types', () => {
  const names = skillNames();

  assert.ok(names.length > 20, `only ${names.length} skills were enumerated from the tree`);

  const offenders = names
    .map((name) => ({ name, found: sweep(skillSource(name), NAMED_BY_ID) }))
    .filter(({ found }) => found.length > 0);

  assert.deepEqual(offenders, [], 'a skill interpolates a document id where a reference belongs');

  // The shared conventions too. No per-skill sweep covers that file, and a pattern moved into it
  // would leave every skill clean and reach all of them anyway.
  assert.deepEqual(sweep(conventions(), NAMED_BY_ID), [],
    'and neither does the file every skill reads');
});

// --- Criterion 3 (control): the pattern finds what it was written to find -------------------------

test('the pattern finds all four occurrences in the status table as it stood before', () => {
  const before = readFileSync(BEFORE, 'utf8');
  const found = occurrences(before);

  assert.equal(found.length, 4,
    `the capture holds four interpolated ids and the pattern found ${found.length}`);
  assert.deepEqual([...new Set(found)].sort(), ['{brief id}', '{epic id}', '{spec id}'],
    'and they are the epic, spec and brief placeholders the spec named');

  // The other half of the control: the correct form is not caught. A pattern that also fired on
  // `{{ref:<id>}}` would report the whole corpus and be silenced by an allow-list, which is how a
  // reading stops being one.
  assert.deepEqual(occurrences('A body names {{ref:<id>}} and renders the identifier.'), [],
    'the marker form stored prose uses passes the same reading');

  // And it is not a check for a literal ULID, which this corpus contains none of — a reading built
  // that way matches nothing here and passes over every leak in it.
  assert.equal(occurrences(`Run /dpm:do ${['01M0Z8', 'C1K74RSJ42VJRFS7BRPJ'].join('')}.`).length, 0,
    'the reading is over the placeholder, which is what a skill file actually carries');
});
