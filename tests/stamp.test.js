/**
 * Epic 2 Story 3 — writing the stamp, and the much larger job of not writing it.
 *
 * FR2 puts the writing plugin's version in the database. FR2a writes it **only on an increase**,
 * and that clause is the requirement rather than a refinement of it: `.dpm/dpm.sql` is committed and
 * a pre-commit guard compares it against the live database, so a stamp rewritten every start would
 * diverge the dump every session, the guard would refuse commits that changed nothing, and a guard
 * that fires on nothing stops being read. The feature would have cost the project its real
 * divergence check in exchange for a diagnostic.
 *
 * So seven of this story's ten criteria are about the write *not* happening — at equal versions, at
 * lower ones, under a read-only launch, and across two runs of the same release. Every one of them
 * is an absence, and the shape throughout is the pair: the same fixture and the same sequence, run
 * once where the write must not happen and once where it must, so that "correctly inert" and "never
 * worked" cannot both pass.
 *
 * **The version is injected everywhere below.** A test reading whatever this checkout's manifest
 * happens to say can assert that the row holds something; it cannot assert the increase rule, which
 * needs three versions and a fixed order between them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { openDatabaseFile } from './support/database.js';
import { databaseAtVersion, versionBefore } from './support/migration.js';
import { sha256 } from './support/hashes.js';
import { recordedStamp, stampPlugin } from '../src/server/stamp.ts';
import { pluginVersion } from '../src/server/plugin-version.ts';
import { isAbove } from '../src/server/node-floor.ts';
import { open } from '../src/server/index.ts';
import { start } from '../src/start.ts';
import { dump } from '../src/dump/index.ts';

/** Three versions in a fixed order, so "above", "equal" and "below" are all available. */
const LOW = '1.0.0';
const MID = '1.2.3';
const HIGH = '2.0.0';

/** The bytes of a file. Base64 rather than a text read — a database is not text. */
const bytesOf = (path) => sha256(readFileSync(path).toString('base64'));

/** Start a database, read what the stamp step did and what the row says, and close. */
function started(path, version) {
  const { db, stamp } = start(path, { version });

  try {
    return { stamp, recorded: recordedStamp(db), sql: dump(db).sql };
  } finally {
    db.close();
  }
}

// --- Criterion 1: a database started at X carries X ----------------------------------------------

test('a database started by a server at a version carries that version [integration]', (t) => {
  const file = openDatabaseFile(t);
  const run = started(file.path, MID);

  assert.equal(run.recorded, MID);
  assert.equal(run.stamp.written, true);
  assert.equal(run.stamp.previous, null, 'a fresh database already had a stamp');
});

// --- Criterion 2: a database from before the stamp existed acquires it ---------------------------

test('a database from before the stamp acquires the running version on the next start [integration]', (t) => {
  // The version before the stamp's own migration, not the version before the newest one: this
  // test is about the upgrade that creates `plugin_stamp`, and `previousVersion()` stopped being
  // that the moment another migration landed on top of it.
  const file = databaseAtVersion(t, versionBefore('plugin-stamp'));
  const db = file.connect();

  // The premise: the table is not there yet. Without this the test would pass against a fixture
  // already carrying the migration, and would be asserting nothing about the upgrade path.
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name = 'plugin_stamp'").get().n,
    0,
    'the fixture already has the stamp table, so there is no upgrade here',
  );

  db.close();

  const run = started(file.path, MID);

  assert.equal(run.recorded, MID);
  assert.equal(run.stamp.written, true);
  assert.equal(run.stamp.previous, null);
});

// --- Criteria 3, 4 and 5: equal leaves it, lower leaves it, higher replaces it -------------------

test('the stamp moves only upwards [integration]', (t) => {
  const file = openDatabaseFile(t);

  assert.equal(started(file.path, MID).recorded, MID);

  // Equal. The row is not rewritten with the same value — which would be invisible in the row and
  // very visible in the dump, and is the failure NFR3 exists to prevent.
  const same = started(file.path, MID);

  assert.equal(same.recorded, MID);
  assert.equal(same.stamp.written, false);
  assert.match(same.stamp.reason, /not above/);

  // Lower. The stamp answers *what is the newest release that has written here*, so an older
  // server passing through must not erase the record of the newer one — which is the evidence the
  // backward-skew check exists to read.
  const older = started(file.path, LOW);

  assert.equal(older.recorded, MID, 'an older server moved the stamp backwards');
  assert.equal(older.stamp.written, false);

  // Higher. The control on both of the above: without it, "the row did not change" is equally true
  // of a stamp step that never writes at all.
  const newer = started(file.path, HIGH);

  assert.equal(newer.recorded, HIGH);
  assert.equal(newer.stamp.written, true);
  assert.equal(newer.stamp.previous, MID);
});

// --- Criteria 6 and 7: the dump is stable across runs, and moves when the stamp does -------------

test('two starts at the same version dump identically, and a raise does not [integration]', (t) => {
  const file = openDatabaseFile(t);

  started(file.path, MID);

  const first = started(file.path, MID);
  const second = started(file.path, MID);

  assert.equal(second.sql, first.sql,
    'two starts at the same version produced different dumps — the stamp is diverging them');

  // **The positive half, and it is not optional.** A comparison that is broken — reading the wrong
  // database, comparing an empty string to an empty string, dumping a table it never reaches —
  // satisfies the criterion above perfectly. This is the same comparison with the one thing that
  // should change, changed.
  const raised = started(file.path, HIGH);

  assert.notEqual(raised.sql, second.sql, 'raising the stamp left the dump identical');
  assert.ok(raised.sql.includes(HIGH), 'the raised version is not in the dump');
  assert.equal(first.sql.includes(HIGH), false, 'the earlier dump already carried the later version');
});

// --- Criterion 8 (must NOT): a read-only launch writes the stamp ---------------------------------

test('a read-only launch leaves the stamp as it found it [integration]', (t) => {
  const file = openDatabaseFile(t);

  // Stamped low, so this checkout's own version is above it — which is the state in which an
  // unguarded start *would* write, and therefore the only state in which not writing means
  // anything. The default version is used deliberately here: the read-only path never reaches
  // `start`, so there is nowhere to inject one, and the test has to be about the real path.
  // `ANCIENT` rather than `LOW`, because the comparison has to hold against whatever this checkout
  // actually is, and this checkout is below 1.0.0.
  const ANCIENT = '0.0.1';

  started(file.path, ANCIENT);

  assert.ok(isAbove(pluginVersion(), ANCIENT), 'this checkout is not above the seeded stamp');

  const before = bytesOf(file.path);

  open(file.path, { readOnly: true });

  assert.equal(bytesOf(file.path), before, 'the read-only launch wrote to the database');

  const observed = file.connect();

  assert.equal(recordedStamp(observed), ANCIENT, 'the read-only launch moved the stamp');
  observed.close();

  // **The same file, the same sequence, the mode removed.** This is the pair the criterion turns
  // on: the write it prevents is one that would otherwise have happened, to this database, now.
  const ordinary = start(file.path);

  assert.equal(recordedStamp(ordinary.db), pluginVersion(),
    'an ordinary start did not write the stamp either, so the read-only launch proves nothing');
  ordinary.db.close();
});

// --- Criterion 9 (must NOT): a value that differs between two runs of one version ----------------

test('the stamped row is the same on every run of one version [integration]', (t) => {
  const file = openDatabaseFile(t);

  started(file.path, MID);

  const rowOf = () => {
    const db = file.connect();

    try {
      return JSON.stringify(db.prepare('SELECT * FROM plugin_stamp').all());
    } finally {
      db.close();
    }
  };

  const first = rowOf();

  started(file.path, MID);
  started(file.path, MID);

  assert.equal(rowOf(), first, 'the row changed across runs of one version');

  // **The structural half, because the behavioural one is satisfiable by luck.** Two runs a
  // millisecond apart could write the same timestamp and pass everything above. The table carries
  // two columns and neither can hold an instant — which is why there is no `recorded_at`, and is
  // the thing a later migration adding one would break here rather than in the field.
  const db = file.connect();
  const columns = db.prepare('PRAGMA table_info(plugin_stamp)').all().map((column) => column.name);

  db.close();

  assert.deepEqual(columns, ['singleton', 'version'],
    'plugin_stamp gained a column, and a column that can hold an instant diverges every dump');
});

// --- The step's own reporting, directly ----------------------------------------------------------

test('the stamp step says what it did in every case [unit]', (t) => {
  const file = openDatabaseFile(t);
  const { db } = start(file.path, { version: MID });

  t.after(() => db.close());

  // A server that cannot name itself writes nothing and says which of the two silences this is —
  // *nothing to do* and *something went wrong* being the same observation from outside (NFR6).
  const nameless = stampPlugin(db, { version: null });

  assert.equal(nameless.written, false);
  assert.equal(nameless.recorded, MID, 'the failed step reported the row as something other than it is');
  assert.match(nameless.reason, /cannot read its own version/);

  assert.equal(recordedStamp(db), MID, 'a server with no version of its own overwrote the row');
});
