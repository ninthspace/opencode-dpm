/**
 * Epic 2 Story 4 — comparing the stamp against the running version.
 *
 * Story 3 put a version in the database. This reads it back and decides whether the server holding
 * the connection is older than the plugin that wrote it — the shared-repository skew, where a
 * colleague publishes from a newer release, you pull, and your server serves the project without
 * anything failing.
 *
 * **The three states are the neighbour check's, imported rather than restated** (FR5). The
 * distinction that matters is between *checked and found nothing* and *could not check*, and it is
 * the reason four of this story's five criteria are about the second. A database with no stamp table
 * is the ordinary case for a read-only launch against a project this release has never opened, and
 * reporting it as no-skew would be a lie told confidently to a board observing forty of them.
 *
 * **Nothing here composes prose.** The verdict is a value; the sentence a human reads is Story 5's,
 * composed in one place for both skews (FR4).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openDatabase, openDatabaseFile } from './support/database.js';
import { SKEW } from '../src/server/skew.ts';
import { readStamp, recordedStamp, stampSkew } from '../src/server/stamp.ts';
import { start } from '../src/start.ts';

const RUNNING = '1.2.3';

/** A started database stamped at `version`, open for the test's duration. */
function stamped(t, version) {
  const { db } = start(openDatabaseFile(t).path, { version });

  t.after(() => db.close());

  return db;
}

/**
 * A database whose `plugin_stamp` is present but has no `version` column.
 *
 * The shape a release far enough ahead would leave behind if it renamed the column, and the only
 * fixture here that reaches the *second* of `readStamp`'s two guards: the table lookup succeeds and
 * the row read is what fails. Named rather than inlined because the two lines look like an
 * arbitrary malformed table, and which guard they exercise is the whole of their value.
 */
function reshapedStamp(t) {
  const db = openDatabase(t);

  db.exec('CREATE TABLE plugin_stamp (singleton INTEGER, release TEXT)');

  return db;
}

// --- Criterion 1: stamped above the running version ----------------------------------------------

test('a database stamped above the running version reports a skew naming both [integration]', (t) => {
  const db = stamped(t, '2.0.0');
  const skew = stampSkew(db, { version: RUNNING });

  assert.equal(skew.state, SKEW.found);
  assert.equal(skew.running, RUNNING);
  assert.equal(skew.recorded, '2.0.0');
});

// --- Criterion 2: stamped at or below it ---------------------------------------------------------

test('a database stamped at or below the running version reports no skew [integration]', (t) => {
  // Both halves, because *equal* and *below* are different comparisons and a wrong operator
  // satisfies one of them. `1.10.0` against `1.2.3` is the case a string comparison gets backwards,
  // and it is below by the only reading that counts.
  for (const recorded of [RUNNING, '1.0.0', '0.9.9', '1.2.2']) {
    const db = stamped(t, recorded);
    const skew = stampSkew(db, { version: RUNNING });

    assert.equal(skew.state, SKEW.none, `${recorded} against ${RUNNING} reported a skew`);
    assert.equal(skew.recorded, recorded);
  }

  const higher = stamped(t, '1.10.0');

  assert.equal(stampSkew(higher, { version: RUNNING }).state, SKEW.found,
    '1.10.0 was read as below 1.2.3 — the comparison is lexicographic');
});

// --- Criterion 3: an absent table is could-not-check, not no-skew ---------------------------------

test('a database with no stamp table reports could-not-check [integration]', (t) => {
  // A bare connection with no schema at all, which is what a read-only launch meets when it opens a
  // project this release has never migrated.
  const db = openDatabase(t);
  const reading = readStamp(db);

  assert.deepEqual(
    { present: reading.present, version: reading.version },
    { present: false, version: null },
    'the reader found a stamp table in a database that has none',
  );

  const skew = stampSkew(db, { version: RUNNING });

  assert.equal(skew.state, SKEW.unknown);
  assert.equal(skew.running, RUNNING, 'the verdict forgot which version it was comparing against');
  assert.match(skew.reason, /no plugin stamp/);

  // **The control.** Without it, `unknown` here is equally true of a comparison that returns
  // `unknown` for everything — which would satisfy this criterion and quietly defeat criteria 1
  // and 2 in the same move.
  assert.equal(stampSkew(stamped(t, '2.0.0'), { version: RUNNING }).state, SKEW.found,
    'the comparison reports unknown for a stamped database too, so the unknown above means nothing');
});

test('a stamp table that is present and empty reports could-not-check [integration]', (t) => {
  // The narrow window between the migration that creates the table and the start step that fills
  // it. It is one start wide in life, and it is a state a caller can be handed, so it gets an
  // answer of its own rather than falling through to no-skew.
  const db = stamped(t, RUNNING);

  db.prepare('DELETE FROM plugin_stamp').run();

  assert.equal(recordedStamp(db), null);

  const skew = stampSkew(db, { version: RUNNING });

  assert.equal(skew.state, SKEW.unknown);
  assert.match(skew.reason, /present and empty/,
    'an empty table and an absent one gave the same reason, so a reader cannot tell them apart');
});

// --- Criterion 4: a comparison that throws yields could-not-check, and the caller survives --------

test('a comparison that throws yields could-not-check rather than propagating [integration]', (t) => {
  // A connection closed underneath the comparison — the general shape of "the database went away",
  // and the one thing a diagnostic about an unusual state must survive.
  const { db } = start(openDatabaseFile(t).path, { version: RUNNING });

  db.close();

  let skew;

  assert.doesNotThrow(() => { skew = stampSkew(db, { version: RUNNING }); },
    'the comparison threw, so a tool call would have failed over an advisory diagnostic');

  assert.equal(skew.state, SKEW.unknown);
  assert.equal(skew.running, RUNNING);
  assert.ok(skew.reason.length > 0, 'could-not-check arrived with nothing said about why');
});

test('a stamp table this server cannot read reports could-not-check [integration]', (t) => {
  // **The second guard, and it needs a case of its own** — which a mutation run is what established.
  // Rewriting both of `readStamp`'s `catch` clauses to rethrow broke nothing, because the closed
  // connection above is caught by the *first* one: the `sqlite_schema` lookup fails before the row
  // read is ever attempted. One rejected behaviour, two places it can live, and a control that
  // reaches one of them verifies one of them.
  //
  // A table that is present but shaped differently is what reaches the second. It is also the
  // realistic form of it: a release far enough ahead to have renamed the column is precisely the
  // database this check exists to describe, and it must describe it rather than fail on it.
  const db = reshapedStamp(t);
  const reading = readStamp(db);

  assert.equal(reading.present, true, 'the reader did not find a table that is there');
  assert.equal(reading.version, null);
  assert.match(reading.reason, /could not be read/);

  let skew;

  assert.doesNotThrow(() => { skew = stampSkew(db, { version: RUNNING }); },
    'a table with an unexpected shape propagated, so a tool call would have failed on it');

  assert.equal(skew.state, SKEW.unknown);
  assert.equal(skew.running, RUNNING);

  // **The control.** The same connection, the same reader, the one column restored — without it
  // "could not read" is equally true of a reader that never reads anything.
  db.exec('DROP TABLE plugin_stamp');
  db.exec("CREATE TABLE plugin_stamp (singleton INTEGER, version TEXT); "
    + "INSERT INTO plugin_stamp VALUES (1, '2.0.0')");

  assert.equal(stampSkew(db, { version: RUNNING }).state, SKEW.found,
    'the reader reports could-not-check for a readable table too, so the verdict above means nothing');
});

test('a server that cannot name itself reports could-not-check [integration]', (t) => {
  const db = stamped(t, '2.0.0');
  const skew = stampSkew(db, { version: null });

  assert.equal(skew.state, SKEW.unknown);
  assert.equal(skew.running, null);
  assert.match(skew.reason, /cannot read its own version/);

  // **The control**, and it is the one that matters most here: this database *is* stamped above
  // anything plausible, so a comparison that ignored the missing running version would have every
  // opportunity to report `found` and be wrong about which two things it compared.
  assert.equal(stampSkew(db, { version: RUNNING }).state, SKEW.found,
    'the same database reports no skew when the running version is known, so the unknown is not about the stamp');
});

// --- Criterion 5 (must NOT): an absent or unreadable stamp rendering as no-skew -------------------

test('no silence is ever reported as checked-and-found-no-skew [integration]', (t) => {
  const closed = start(openDatabaseFile(t).path, { version: RUNNING }).db;

  closed.close();

  const empty = stamped(t, RUNNING);

  empty.prepare('DELETE FROM plugin_stamp').run();

  const reshaped = reshapedStamp(t);

  // Five, and the last two are separate on purpose: they are the two `catch` clauses in `readStamp`,
  // and a sweep listing only one of them leaves the other free to return whatever it likes.
  const silences = [
    ['no stamp table', () => stampSkew(openDatabase(t), { version: RUNNING })],
    ['an empty stamp table', () => stampSkew(empty, { version: RUNNING })],
    ['a closed connection', () => stampSkew(closed, { version: RUNNING })],
    ['a stamp table with no version column', () => stampSkew(reshaped, { version: RUNNING })],
    ['no version of its own', () => stampSkew(stamped(t, RUNNING), { version: null })],
  ];

  for (const [label, verdict] of silences) {
    const skew = verdict();

    assert.notEqual(skew.state, SKEW.none, `${label} was reported as checked-and-found-no-skew`);
    assert.equal(skew.state, SKEW.unknown, `${label} produced ${skew.state}`);
    assert.ok(skew.reason, `${label} produced could-not-check with no reason`);
  }

  // **The control on the whole sweep.** `none` has to be reachable, or "never `none`" is a claim
  // about a function that has one state — and every assertion above would hold over it.
  assert.equal(stampSkew(stamped(t, '1.0.0'), { version: RUNNING }).state, SKEW.none,
    'no case produces no-skew at all, so refusing to produce it for the silences proves nothing');
});
