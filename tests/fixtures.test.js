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

test('the fixture corpus holds no markdown to parse', () => {
  const parseable = readdirSync(FIXTURES, { recursive: true })
    .map(String)
    .filter((entry) => /\.(md|markdown|ya?ml|json)$/.test(entry));

  assert.deepEqual(parseable, [], 'fixtures are code that calls tools, not documents to read');
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
