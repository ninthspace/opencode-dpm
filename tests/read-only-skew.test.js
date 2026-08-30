/**
 * Epic 2 Story 6 — both skews under a read-only launch (FR3, FR11, NFR4).
 *
 * A board observes projects it does not own, and it launches every server it spawns read-only. That
 * branch of `open()` never reaches `start()` — no migration, no seeding, no stamp write — so a
 * detector wired anywhere inside the ordinary bring-up would be invisible to precisely the caller
 * observing forty projects at once, which is the caller with the most skew to find.
 *
 * **No code was written for this story, and that is the finding rather than a gap.** Both detectors
 * are defaults on `spineTools`, which the read-only branch already calls, and `check_integrity`
 * declares `mutates: false`, so the read-only tool set leaves its handler alone. These tests exist
 * to hold that open: it is a property of how the tool table is built, and nothing in the read-only
 * branch says so.
 *
 * **The rejection is an absence, and it is paired throughout.** "Wrote nothing" is what a launch
 * that did nothing at all reports too, so every inertness assertion here is run twice — once under
 * the mode and once with it removed, where the write it is said not to make does happen.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { handlers } from './support/planning-database.js';
import { ownedDirectory as scratch } from './support/scratch.js';
import { sha256 } from './support/hashes.js';
import { open } from '../src/server/index.ts';
import { IGNORE_FILE } from '../src/server/ignore.ts';
import { SKEW, SOURCE } from '../src/server/skew.ts';
import { recordedStamp } from '../src/server/stamp.ts';
import { pluginVersion } from '../src/server/plugin-version.ts';
import { start } from '../src/start.ts';

/** Above anything this checkout will be, and below it. Neither is a version anyone will ship. */
const AHEAD = '99.0.0';
const BEHIND = '0.0.1';

/** Where a project's database lives inside its directory. */
const DATABASE = join('.dpm', 'dpm.db');

const ownedDirectory = (t) => scratch(t, 'dpm-readonly-skew-');

/** The bytes of a file. Base64 rather than a text read — a database is not text. */
const bytesOf = (path) => sha256(readFileSync(path).toString('base64'));

/** A project whose database is already stamped at `version`, built through the real start. */
function projectStampedAt(t, version) {
  const directory = ownedDirectory(t);
  const path = join(directory, DATABASE);

  mkdirSync(dirname(path), { recursive: true });

  const { db } = start(path, { version });

  db.close();

  return { directory, path };
}

/** The `check_integrity` report a launch of `path` produces, in whichever mode. */
const reportFrom = (path, options = {}) => handlers(open(path, options)).check_integrity({});

// --- Criteria 1 and 2: the same field, both halves of it ------------------------------------------

test('a read-only launch reports both skews in the field an ordinary one uses [integration]', (t) => {
  const { path } = projectStampedAt(t, AHEAD);

  const observed = reportFrom(path, { readOnly: true });

  assert.ok(Object.hasOwn(observed, 'skew'), 'the read-only report has no skew field at all');
  assert.equal(observed.skew.stamp.state, SKEW.found,
    'the read-only launch did not notice a database written by a newer release');
  assert.equal(observed.skew.stamp.recorded, AHEAD);
  assert.equal(observed.skew.stamp.running, pluginVersion());
  assert.equal(observed.skew.state, SKEW.found, 'the roll-up did not carry the stamp verdict');

  // **The neighbour half is present too, and asserted as a state rather than as a verdict.** Which
  // verdict it is depends on where this checkout is loaded from — a working tree answers `unknown`
  // by FR1b — and pinning that would be pinning the machine the suite runs on. What the criterion
  // is about is that the check ran at all from a branch that never calls `start()`.
  assert.equal(observed.skew.neighbour.source, SOURCE.neighbour);
  assert.ok(Object.values(SKEW).includes(observed.skew.neighbour.state),
    `the neighbour verdict is not one of the three states: ${observed.skew.neighbour.state}`);
  assert.ok(observed.skew.neighbour.message.length > 0, 'the neighbour half arrived without a sentence');

  // **The pair, and it is the whole of criterion 1.** Same database, same call, mode removed: the
  // field has to be the same field, with the same halves, or a board is reading a different report
  // from everyone else and would not know it.
  const ordinary = reportFrom(path);

  assert.deepEqual(Object.keys(ordinary.skew).sort(), Object.keys(observed.skew).sort(),
    'the two launches report different skew fields');
  assert.equal(ordinary.skew.stamp.state, observed.skew.stamp.state);
  assert.equal(ordinary.skew.stamp.recorded, observed.skew.stamp.recorded);
});

test('a read-only launch reports no-skew and could-not-check too, not only found [integration]', (t) => {
  // The other two states, because a field that only ever says `found` satisfies the test above and
  // tells a board nothing. `BEHIND` is the no-skew case; a project this release has never opened is
  // the could-not-check one, and for a read-only launch it is the commonest state there is — the
  // table arrives with a migration and a read-only launch does not migrate.
  const settled = reportFrom(projectStampedAt(t, BEHIND).path, { readOnly: true });

  assert.equal(settled.skew.stamp.state, SKEW.none);
  assert.equal(settled.skew.stamp.recorded, BEHIND);

  const bare = join(ownedDirectory(t), DATABASE);

  mkdirSync(dirname(bare), { recursive: true });

  const { db } = start(bare, { version: BEHIND });

  db.prepare('DROP TABLE plugin_stamp').run();
  db.close();

  const unread = reportFrom(bare, { readOnly: true });

  assert.equal(unread.skew.stamp.state, SKEW.unknown);
  assert.notEqual(unread.skew.stamp.state, SKEW.none,
    'a database with no stamp table was reported as checked-and-found-no-skew');
  assert.match(unread.skew.stamp.reason, /no plugin stamp/);
});

// --- Criterion 3 (must NOT): writing anything while reporting ------------------------------------

test('a read-only launch reporting a skew leaves the database byte-identical [integration]', (t) => {
  const { path } = projectStampedAt(t, BEHIND);

  // **Stamped below this checkout on purpose.** That is the one state in which an unguarded launch
  // *would* write — the increase rule would fire — so it is the only state in which not writing
  // means anything. Stamped above, the write would be declined for an unrelated reason and this
  // would pass over a read-only mode that did nothing.
  const before = bytesOf(path);

  const observed = reportFrom(path, { readOnly: true });

  assert.equal(bytesOf(path), before, 'the read-only launch wrote to the database while reporting');
  assert.equal(observed.skew.stamp.recorded, BEHIND, 'the read-only launch moved the stamp');

  // And it did report — an inert launch that also reported nothing would satisfy the line above.
  // The stamp half rather than the roll-up: run from a working tree the neighbour check answers
  // `unknown`, and the roll-up takes the worse of the two, so asserting `none` there would be
  // asserting where the suite is running from.
  assert.ok(observed.skew.stamp.message.length > 0);
  assert.equal(observed.skew.stamp.state, SKEW.none);

  // **The same file, the same sequence, the mode removed.** This is the pair the criterion turns
  // on: the write it prevents is one that would otherwise have happened, to this database, now.
  reportFrom(path);

  assert.notEqual(bytesOf(path), before, 'an ordinary launch did not write either, so the mode proves nothing');

  const { db } = start(path);

  assert.equal(recordedStamp(db), pluginVersion());
  db.close();
});

test('a read-only launch creates nothing in a directory that has no database [integration]', (t) => {
  // The filesystem half. The ordinary bring-up makes a directory, an ignore file and a database
  // before it opens anything; the read-only one is a single connect. A board pointed at a path that
  // is not a project must leave it exactly as it found it, which includes not making it one.
  const directory = ownedDirectory(t);
  const path = join(directory, DATABASE);

  assert.deepEqual(readdirSync(directory), [], 'the fixture directory is not empty to begin with');

  // The connection itself fails against a file that is not there, which is the correct outcome and
  // not the subject: what the criterion is about is what remains on disk afterwards.
  assert.throws(() => open(path, { readOnly: true }));

  assert.deepEqual(readdirSync(directory), [], 'the read-only launch created something');
  assert.equal(existsSync(join(directory, '.dpm')), false);

  // **The control**, and it is the one that makes the emptiness above a refusal rather than a
  // no-op: the same path, the same call, the mode removed, and all three appear.
  open(path);

  assert.equal(existsSync(path), true, 'an ordinary launch created no database, so the mode proves nothing');
  assert.equal(existsSync(join(directory, '.dpm', IGNORE_FILE)), true);
});
