/**
 * Story 0 — "A test creates its own database, exercises it, and leaves nothing behind; two
 * tests running in one process do not share state" [unit].
 *
 * The criterion names two tests on purpose, and the tests below are written in pairs for
 * that reason: a single test that tidies up after itself asserts nothing about what the next
 * one can see. Each pair does the work in the first test and the observation in the second,
 * so what is being checked is the state *between* them.
 *
 * `node --test` runs the tests in a file sequentially, and a test's `after` hooks run before
 * the next test starts. The first assertion in each observing test states that dependence
 * rather than assuming it, so a change in that behaviour fails here and says why.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  openDatabase,
  openDatabaseFile,
  liveResources,
  foreignKeysEnabled,
} from './support/database.js';

let firstTestRan = false;
let temporaryDatabasePath = null;

test('a test creates its own database and exercises it', (t) => {
  const db = openDatabase(t);

  db.exec('CREATE TABLE only_in_the_first_test (id TEXT PRIMARY KEY)');
  db.prepare('INSERT INTO only_in_the_first_test (id) VALUES (?)').run('a');

  assert.equal(db.prepare('SELECT count(*) AS n FROM only_in_the_first_test').get().n, 1);
  assert.equal(liveResources().databases, 1, 'the database is open while its test runs');
  assert.ok(foreignKeysEnabled(db), 'a harness database enforces foreign keys');

  firstTestRan = true;
});

test('the next test in the same process shares none of it', (t) => {
  assert.ok(firstTestRan, 'these tests depend on running in order, in one process');

  assert.deepEqual(
    liveResources(),
    { databases: 0, directories: 0 },
    'the previous test left nothing open',
  );

  const db = openDatabase(t);
  const leaked = db
    .prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name = 'only_in_the_first_test'")
    .get().n;

  assert.equal(leaked, 0, 'a fresh database cannot see the previous test\'s table');
});

test('a temp-file database can be reopened, and each connection carries its own pragma', (t) => {
  const file = openDatabaseFile(t);
  temporaryDatabasePath = file.path;

  const writer = file.connect();
  writer.exec('CREATE TABLE persisted (id TEXT PRIMARY KEY)');
  writer.prepare('INSERT INTO persisted (id) VALUES (?)').run('a');

  const reader = file.connect();
  assert.equal(
    reader.prepare('SELECT count(*) AS n FROM persisted').get().n,
    1,
    'a second connection sees what the first wrote — this is what :memory: cannot do',
  );

  assert.ok(foreignKeysEnabled(reader), 'the harness enforces foreign keys on each connection');
  assert.equal(
    foreignKeysEnabled(file.connect({ foreignKeys: false })),
    false,
    'and can hand out a non-enforcing connection for the tests that need one to assert against',
  );

  assert.deepEqual(liveResources(), { databases: 3, directories: 1 });
});

test('the temp file and its directory are gone once that test has ended', () => {
  assert.ok(temporaryDatabasePath, 'these tests depend on running in order, in one process');

  assert.equal(existsSync(temporaryDatabasePath), false, 'the database file was removed');
  assert.deepEqual(
    liveResources(),
    { databases: 0, directories: 0 },
    'every connection it handed out was closed, and the directory released',
  );
});
