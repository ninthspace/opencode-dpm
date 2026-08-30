/**
 * Epic 2 Story 7 — the stamp end to end, across all six stories.
 *
 * Every suite before this one holds a seam: story 1 has the table, story 3 the write, story 4 the
 * comparison, story 5 the two channels. Each injects the version it is reasoning about, which is
 * what makes those tests about the rule rather than about this checkout — and it is also what leaves
 * them all passing over a chain whose links do not meet. A stamp written to a column the comparison
 * never reads, a verdict composed but wired to nothing, a report built and not returned: none of
 * those is visible from inside a single story.
 *
 * **So these two run the real binary.** No injection, no stubs, no in-process `open()`: a project
 * directory on disk, a server process spawned in it, and the answers read out of the streams a
 * client would read them from. What that costs in speed it buys in the one thing the per-story
 * suites cannot give — evidence that the parts are connected.
 *
 * **The second criterion is not story 3's dump comparison repeated.** That one ran `start()` twice
 * in-process with the neighbour check absent. This runs two whole sessions with both detectors
 * live, which is where NFR3 is actually at risk: the feature that must not disturb the committed
 * dump now has two checks running on every call, and either could have acquired a write.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { ownedDirectory as scratch } from './support/scratch.js';
import { sha256 } from './support/hashes.js';
import { runNode } from './support/run-node.js';
import { BIN, HELLO, NO_OVERRIDE, call, repliesFrom, wire } from './support/session.js';
import { openConnection } from '../src/db/connection.ts';
import { pluginVersion } from '../src/server/plugin-version.ts';
import { SKEW } from '../src/server/skew.ts';
import { dump } from '../src/dump/index.ts';
import { start } from '../src/start.ts';

/** The version the colleague who published last was running. Nothing here will ever ship it. */
const PUBLISHED_FROM = '99.0.0';

/** Where a project's database lives inside its directory. */
const DATABASE = join('.dpm', 'dpm.db');

const ownedDirectory = (t) => scratch(t, 'dpm-stamp-e2e-');

/**
 * A project whose database was written by a server at `version`.
 *
 * The stamp is placed by running the real start with that version rather than by writing the row —
 * which is what makes this fixture *a database a newer server wrote*, rather than a database with a
 * row in it that resembles one.
 */
function projectWrittenBy(t, version) {
  const directory = ownedDirectory(t);
  const path = join(directory, DATABASE);

  mkdirSync(dirname(path), { recursive: true });

  const { db } = start(path, { version });

  db.close();

  return { directory, path };
}

/** One spawned session that opens the database and calls `check_integrity`. */
async function sessionIn(directory) {
  const session = await runNode(
    [BIN],
    wire([HELLO, call(2, 'check_integrity')]),
    NO_OVERRIDE,
    { cwd: directory },
  );

  assert.equal(session.code, 0, `the server exited ${session.code}: ${session.stderr}`);

  const reply = repliesFrom(session.stdout).find((message) => message.id === 2);

  assert.ok(reply?.result, `no integrity result on stdout:\n${session.stdout}`);
  assert.equal(reply.result.isError, undefined,
    `check_integrity returned a tool error: ${JSON.stringify(reply.result)}`);

  return { session, report: reply.result.structuredContent };
}

/** The dump a database produces, read through a connection this test opens and closes. */
function dumpOf(path) {
  const db = openConnection(path);

  try {
    return dump(db).sql;
  } finally {
    db.close();
  }
}

/** The bytes of a file. Base64 rather than a text read — a database is not text. */
const bytesOf = (path) => sha256(readFileSync(path).toString('base64'));

// --- Criterion 1: the whole chain, in one run -----------------------------------------------------

test('a database written by a newer server is reported on both channels by an older one [integration]',
  async (t) => {
    const { directory } = projectWrittenBy(t, PUBLISHED_FROM);
    const { session, report } = await sessionIn(directory);

    // **The tool response, which is the load-bearing channel.** Nothing in a Claude session reads
    // MCP stderr, so this is the half that reaches the reader whose session is stale.
    assert.equal(report.skew.stamp.state, SKEW.found,
      `the server did not notice the newer writer: ${JSON.stringify(report.skew)}`);
    assert.equal(report.skew.stamp.recorded, PUBLISHED_FROM);
    assert.equal(report.skew.stamp.running, pluginVersion());
    assert.equal(report.skew.state, SKEW.found, 'the roll-up did not carry it');

    assert.match(report.skew.stamp.message, /99\.0\.0/);
    assert.ok(report.skew.stamp.message.includes(pluginVersion()),
      'the sentence does not name the version running');
    assert.match(report.skew.stamp.message, /[Uu]pdate the plugin/, 'the sentence names no remedy');

    // **And the data is still sound**, which is the separation AD1 turned on and the one thing a
    // caller must not lose here: the rows are fine and the reader is stale, and a report conflating
    // them fires the corruption alarm on every session running an older plugin against a good
    // database.
    assert.equal(report.ok, true, 'a stale reader was reported as a corrupt database');
    assert.equal(report.entries.every((entry) => entry.held), true);

    // **The stderr channel, from the same run.** Two channels asserted against one process is the
    // point of doing this end to end: a wiring that fed one of them from a verdict the other never
    // saw would pass both per-story suites.
    const lines = session.stderr.split('\n').filter(Boolean);

    assert.equal(lines.length, 1, `the session wrote ${lines.length} lines to stderr:\n${session.stderr}`);
    assert.match(lines[0], /99\.0\.0/, `the stderr line does not name the newer version: ${lines[0]}`);

    // **The control, and without it every assertion above is equally true of a server that reports
    // a skew unconditionally.** Same binary, same call, same shape of project — the one difference
    // is who wrote the database.
    const settled = await sessionIn(projectWrittenBy(t, '0.0.1').directory);

    assert.equal(settled.report.skew.stamp.state, SKEW.none,
      'the server reports a skew against a database it is newer than, so the report above means nothing');
    assert.equal(settled.session.stderr, '', `a clean session said something:\n${settled.session.stderr}`);
  });

// --- Criterion 2: NFR3, with both detectors live --------------------------------------------------

test('two full sessions at one version leave the dump byte-identical [integration]', async (t) => {
  // Written by *this* server, so the increase rule has nothing to do on either run and the question
  // is only whether anything else moved. A stamp rewritten with the same value would be invisible in
  // the row and very visible here, which is the failure NFR3 exists to prevent: a dump diverging
  // every session turns the pre-commit projection guard into noise a user learns to ignore, and the
  // project loses the check that catches real divergence in exchange for a diagnostic.
  const { directory, path } = projectWrittenBy(t, pluginVersion());

  const first = await sessionIn(directory);
  const afterFirst = dumpOf(path);

  const second = await sessionIn(directory);
  const afterSecond = dumpOf(path);

  assert.equal(afterSecond, afterFirst,
    'two sessions at one version produced different dumps — something in the run is diverging them');

  // **The dump, and deliberately not the file's bytes.** A repeated `start()` rewrites the database
  // file every time and always has: the seeding and guard-regeneration steps touch pages whether or
  // not they change a row, which was measured here rather than assumed. NFR3's subject is the
  // artefact that is *committed* and compared by the pre-commit guard, and that is this projection.
  // Asserting the bytes would be asserting something SQLite does not offer and the requirement does
  // not claim, and it would fail on a checkout that had changed neither.
  assert.notEqual(bytesOf(path), '', 'the fixture database is unreadable');

  // Both detectors really ran on both, or this is a comparison across two sessions that did nothing.
  for (const { report } of [first, second]) {
    assert.equal(report.skew.stamp.state, SKEW.none);
    assert.ok(report.skew.neighbour.state, 'the neighbour check did not run in this session');
    assert.ok(report.skew.neighbour.message.length > 0);
  }

  // **The positive half, and it is not optional.** A comparison that is broken — reading the wrong
  // file, comparing an empty string to itself, dumping a table it never reaches — satisfies both
  // assertions above perfectly. This is the same comparison with the one thing that should change,
  // changed: a session that genuinely raises the stamp moves the dump, and it has to.
  const raised = start(path, { version: PUBLISHED_FROM });

  assert.equal(raised.stamp.written, true, 'the raising start declined to write');
  raised.db.close();

  assert.notEqual(dumpOf(path), afterSecond, 'raising the stamp left the dump identical');
  assert.ok(dumpOf(path).includes(PUBLISHED_FROM), 'the raised version is not in the dump');
});
