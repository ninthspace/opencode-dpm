/**
 * Story 0 — "must NOT — a fixture is a markdown file parsed at load, rather than built by
 * calling create tools" [integration].
 *
 * Two halves, and the second is the one that can go quietly wrong. The first is that the
 * fixture layer goes through the seam and reads no files. The second is that the check
 * saying so actually looked at something: a scan over an empty directory reports a clean
 * pass it never computed, which is the false pass this project exists to remove. So the
 * assertions below name what was read as well as what was found.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  fixtureDisciplineBypasses,
  fixtureSourcesChecked,
} from './support/fixture-discipline.js';
import { create, defineCreator, registeredCreators, resetCreators } from './fixtures/tool-surface.js';
import { openDatabase } from './support/database.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');

test('no fixture reaches past the seam, and the check that says so read the fixtures', () => {
  const checked = fixtureSourcesChecked();

  assert.ok(checked.length > 0, 'the discipline check found fixture sources to read');
  assert.ok(
    checked.includes('tool-surface.js'),
    'including the seam itself, which is bound by the no-file-reading rule too',
  );

  assert.deepEqual(
    fixtureDisciplineBypasses(),
    [],
    'every fixture builds through create(); none opens a database or reads a file',
  );
});

/**
 * The oracles, which live here and are not fixtures.
 *
 * **Named individually because the exemption has to be argued for each time.** A fixture is code
 * that calls tools; an oracle is a recording of what *another program* printed, kept so the port
 * can be compared against something it did not write. `v070-dump.sql` is v0.7.0's dumper output and
 * `v070-tool-surface.json` is v0.7.0's `tools/list` reply, captured from the released marketplace
 * package. Neither is parsed into planning rows, which is the thing the rule below forbids — they
 * are read by one test each and compared, and `parity-v070.test.js` refuses to let either be
 * rewritten.
 *
 * An extension-shaped exemption would have been cheaper and would have let a corpus arrive as JSON.
 */
const ORACLES = ['v070-dump.sql', 'v070-tool-surface.json'];

test('the fixture corpus holds no markdown to parse', () => {
  const parseable = readdirSync(FIXTURES, { recursive: true })
    .map(String)
    .filter((entry) => /\.(md|markdown|ya?ml|json)$/.test(entry))
    .filter((entry) => !ORACLES.includes(entry));

  assert.deepEqual(parseable, [], 'fixtures are code that calls tools, not documents to read');

  // Two controls, because that emptiness now has a second uninteresting explanation — an exemption
  // list that swallowed everything. The reading still recognises a document, and the exempted files
  // are really there rather than being names nobody maintains.
  assert.deepEqual(['corpus.md', 'rows.json'].filter((entry) => /\.(md|markdown|ya?ml|json)$/.test(entry))
    .filter((entry) => !ORACLES.includes(entry)), ['corpus.md', 'rows.json'],
    'the reading no longer recognises a document a fixture could parse');

  const present = readdirSync(FIXTURES, { recursive: true }).map(String);

  for (const oracle of ORACLES) {
    assert.ok(present.includes(oracle), `${oracle} is exempted and is not there`);
  }
});

test('the seam refuses to create an entity nothing registered', (t) => {
  const db = openDatabase(t);

  assert.throws(
    () => create(db, 'epic', { title: 'made up' }),
    /No creator registered for 'epic'/,
    'a fixture cannot fall back to writing the row itself',
  );
});

test('a fixture is built by calling the tool surface', (t) => {
  const db = openDatabase(t);
  t.after(() => resetCreators());

  // Stands in for the creators Stories 1 onwards register, against a table this test owns.
  db.exec('CREATE TABLE scratch (id TEXT PRIMARY KEY, label TEXT NOT NULL)');
  defineCreator('scratch', (connection, { id, label }) => {
    connection.prepare('INSERT INTO scratch (id, label) VALUES (?, ?)').run(id, label);
    return connection.prepare('SELECT * FROM scratch WHERE id = ?').get(id);
  });

  assert.deepEqual(registeredCreators(), ['scratch']);

  const row = create(db, 'scratch', { id: 'a', label: 'built through the seam' });
  // `node:sqlite` returns null-prototype objects, so a row never deep-equals a literal
  // until it is spread. Every later story comparing a row against an expected shape needs
  // this, and the failure it produces names the values as equal while reporting them unequal.
  assert.deepEqual({ ...row }, { id: 'a', label: 'built through the seam' });
  assert.equal(db.prepare('SELECT count(*) AS n FROM scratch').get().n, 1);
});

test('one entity cannot have two creators', (t) => {
  const db = openDatabase(t);
  t.after(() => resetCreators());

  defineCreator('scratch', () => ({}));
  assert.throws(
    () => defineCreator('scratch', () => ({})),
    /already defined/,
    'which write path a fixture exercises must not depend on import order',
  );

  assert.equal(db.prepare('SELECT 1 AS ok').get().ok, 1);
});
