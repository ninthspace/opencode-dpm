/**
 * Epic 2 Story 5 — where the stamp skew surfaces (FR4, FR6, AD1).
 *
 * Story 4 produced a verdict. This is about the two places a human meets one, and the whole reason
 * the spec exists is that only one of them is load-bearing: nothing in a Claude session reads MCP
 * stderr, so a stderr-only warning reproduces the exact silence being fixed. The tool response is
 * the channel that arrives; the stderr line is parity with the ahead-message, for whoever is
 * reading a terminal.
 *
 * **Two of the five criteria are rejections, and both are absences.** A clean open must say nothing
 * on stderr, and the report must not grow a second top-level field. Each is paired here with the
 * positive case it is the absence of — the same directory that does speak, the same field that does
 * carry the stamp — because "wrote nothing" and "cannot write anything" are the same observation
 * from outside.
 *
 * **The stderr half is asserted against a spawned server rather than an in-process `open()`.** The
 * criterion is about what a session writes to a stream, and a test that stubbed the writer would be
 * asserting that a function was called. It also costs nothing extra: the harness that already
 * proves an ordinary create is silent is the harness this needs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { ownedDirectory as scratch } from './support/scratch.js';
import { runNode } from './support/run-node.js';
import { BIN, HELLO, NO_OVERRIDE, call, wire } from './support/session.js';
import { spineTools } from '../src/tools/index.ts';
import { SKEW, SOURCE, worstState } from '../src/server/skew.ts';
import { stampPlugin, stampSkew } from '../src/server/stamp.ts';
import { pluginVersion } from '../src/server/plugin-version.ts';
import { start } from '../src/start.ts';

/** Far enough above anything this checkout will ever be that the comparison is not a guess. */
const AHEAD = '99.0.0';

/** Below it, for the same reason and in the other direction. */
const BEHIND = '0.0.1';

/** The path a spawned server opens by default, relative to the directory it runs in. */
const DATABASE = join('.dpm', 'dpm.db');

/** A directory a child server runs in, so the default relative database path lands inside it. */
const ownedDirectory = (t) => scratch(t, 'dpm-stamp-report-');

/**
 * A project directory whose database is already stamped at `version`.
 *
 * Built by starting the database here rather than by writing the row by hand: the row's shape is
 * Story 1's and the write rule is Story 3's, and a fixture that reproduced either would go on
 * passing after the thing it reproduces had changed.
 */
function projectStampedAt(t, version) {
  const directory = ownedDirectory(t);
  const path = join(directory, DATABASE);

  mkdirSync(dirname(path), { recursive: true });

  const { db } = start(path, { version });

  db.close();

  return directory;
}

/** A session that opens the database and asks it something, returning what it wrote to stderr. */
async function sessionIn(directory) {
  // The call matters: the database is not opened at launch, so a session that only says hello
  // never reaches the open this test is about.
  const session = await runNode(
    [BIN],
    wire([HELLO, call(2, 'list_spec')]),
    NO_OVERRIDE,
    { cwd: directory },
  );

  assert.equal(session.code, 0, `the server exited ${session.code}: ${session.stderr}`);

  return session;
}

/** The lines a session wrote to stderr, with the trailing blank dropped. */
const linesOf = (session) => session.stderr.split('\n').filter(Boolean);

/** A `check_integrity` report over a database stamped at `version`, with the neighbour kept quiet. */
function reportFor(t, version) {
  const db = openPlanningDatabase(t);

  stampPlugin(db, { version });

  const quiet = () => ({ source: SOURCE.neighbour, state: SKEW.none, running: pluginVersion() });
  const { check_integrity: report } = handlers(spineTools(db, { skew: quiet }));

  return report({});
}

// --- Criterion 1, and criterion 4's rejection beside it -------------------------------------------

test('a database stamped above the running version writes one line, and a clean open none [integration]',
  async (t) => {
    const stale = await sessionIn(projectStampedAt(t, AHEAD));
    const lines = linesOf(stale);

    assert.equal(lines.length, 1,
      `the stale session wrote ${lines.length} lines to stderr:\n${stale.stderr}`);
    assert.match(lines[0], /99\.0\.0/, `the line does not name the version that wrote the database: ${lines[0]}`);

    // **stdout is protocol.** Every line of it has to parse as a JSON-RPC message, and a diagnostic
    // in there is not a line a client skips past — it is a client that has stopped being able to
    // read the session. Asserted on this session because it is the one with a line to misplace.
    for (const line of stale.stdout.split('\n').filter(Boolean)) {
      assert.doesNotThrow(() => JSON.parse(line), `stdout carried a line that is not a message: ${line}`);
    }

    assert.equal(stale.stdout.includes(lines[0]), false, 'the report went to stdout as well');

    // **The rejection, and it is the same binary, the same call and the same shape of directory.**
    // The one difference is which version wrote the database — below this server rather than above
    // it — so a server that wrote its line on every open passes the count above and fails here.
    const clean = await sessionIn(projectStampedAt(t, BEHIND));

    assert.equal(clean.stderr, '', `a clean open said something on stderr:\n${clean.stderr}`);
  });

test('a database this release has never opened stays silent too [integration]', async (t) => {
  // The other silence, and the one a board meets most: `unknown`. A project with no stamp at all is
  // not a skew and not the absence of one — but a warning nobody can act on, written on every open,
  // is how a reader learns to skip the ones they can act on. It reaches `check_integrity`, where
  // somebody asked; it does not reach the stream that is supposed to be quiet.
  const fresh = await sessionIn(ownedDirectory(t));

  assert.equal(fresh.stderr, '', `an ordinary create said something on stderr:\n${fresh.stderr}`);
});

// --- Criteria 2 and 3: the field, and what the sentence says --------------------------------------

test('the stamp skew reaches check_integrity through the neighbour skew\'s field [integration]', (t) => {
  const report = reportFor(t, AHEAD);

  assert.ok(Object.hasOwn(report, 'skew'), 'the report has no skew field at all');
  assert.equal(report.skew.stamp.state, SKEW.found);
  assert.equal(report.skew.stamp.recorded, AHEAD);
  assert.equal(report.skew.stamp.running, pluginVersion());

  // The roll-up, which is what makes one field one field: a caller learns that something is stale
  // without knowing there are two checks, and only then looks to see which.
  assert.equal(report.skew.state, SKEW.found, 'the stamp skew did not reach the field read first');
  assert.equal(report.skew.neighbour.state, SKEW.none, 'the neighbour half is not the quiet one this assumes');

  // **The control.** A field reporting `found` for everything satisfies every assertion above. The
  // same database, the same call, stamped below this server instead.
  const quietly = reportFor(t, BEHIND);

  assert.equal(quietly.skew.stamp.state, SKEW.none,
    'the stamp check reports found for a database it is newer than, so the verdict above means nothing');
  assert.equal(quietly.skew.state, SKEW.none);
});

test('the stamp skew names both versions and a remedy that can work [integration]', (t) => {
  const { message } = reportFor(t, AHEAD).skew.stamp;

  assert.match(message, /99\.0\.0/, 'the sentence does not name the version that wrote the database');
  assert.ok(message.includes(pluginVersion()), 'the sentence does not name the version running');

  // **The remedy is the half a reader cannot work out for themselves, and it is not the neighbour
  // skew's.** That one is fixed by restarting, because the newer release is already on the machine.
  // This one is not: the release that wrote the database is on whoever published last's machine.
  // Telling someone to restart would be a remedy that cannot work, in the voice of one that can.
  assert.match(message, /[Uu]pdate the plugin/, `the sentence names no remedy: ${message}`);

  // And the two remedies are genuinely different text, or FR4's one composer has become one
  // sentence with the nouns swapped — which would send someone to restart a session that will come
  // back identical.
  const { message: neighbour } = reportFor(t, BEHIND).skew.neighbour;

  assert.notEqual(neighbour, message);
});

// --- Criterion 5 (must NOT): a second top-level field ---------------------------------------------

test('the stamp skew adds no top-level field of its own [integration]', (t) => {
  const FIELDS = ['ok', 'checked', 'entries', 'orphans', 'skew'];

  const stale = reportFor(t, AHEAD);
  const quietly = reportFor(t, BEHIND);

  // Sorted and compared whole, not `hasOwn` per name: the rejection is about a field *appearing*,
  // and a check that only asked whether the expected ones are present would pass over any number of
  // extra ones — which is precisely the failure, since the extra field is the thing being rejected.
  assert.deepEqual(Object.keys(stale).sort(), [...FIELDS].sort(),
    'the report grew a top-level field; AD1 gave the skew one and a caller now has two places to look');
  assert.deepEqual(Object.keys(quietly).sort(), [...FIELDS].sort());

  // **The control, and it is what stops this being a test of a report that dropped the stamp.** The
  // rejected thing is a *second* field, not the absence of a first: the stamp has to be in there,
  // and it has to be in the one field, or "no second field" is satisfied by never reporting at all.
  assert.equal(stale.skew.stamp.state, SKEW.found, 'the stamp verdict is not in the report at all');
  assert.equal(stale.skew.source, undefined,
    'the field carries one verdict flattened into it rather than both under their names');
});

// --- The roll-up, which is the one place three states become one ----------------------------------

test('the roll-up prefers the answer a reader can act on [unit]', () => {
  const of = (source, state) => ({ source, state });
  const neighbour = (state) => of(SOURCE.neighbour, state);
  const stamp = (state) => of(SOURCE.stamp, state);

  // **`unknown` beats `none`**, which is FR5 arriving one level above where it was decided: a
  // session in which one of the two checks never ran has not been checked, whatever the other said.
  assert.equal(worstState([neighbour(SKEW.none), stamp(SKEW.unknown)]), SKEW.unknown);
  assert.equal(worstState([neighbour(SKEW.unknown), stamp(SKEW.none)]), SKEW.unknown,
    'the roll-up depends on which check is listed first');

  // **And `found` beats `unknown`.** The other direction of the same argument: a check that
  // definitely found a skew is the actionable half, and hedging it behind the one that could not
  // run buries the only thing in the report anybody can do something about.
  assert.equal(worstState([neighbour(SKEW.found), stamp(SKEW.unknown)]), SKEW.found);
  assert.equal(worstState([neighbour(SKEW.unknown), stamp(SKEW.found)]), SKEW.found);

  // The control on both: `none` is reachable, so refusing to produce it above is a decision rather
  // than a function with two states.
  assert.equal(worstState([neighbour(SKEW.none), stamp(SKEW.none)]), SKEW.none);
});

// --- The two checks are independent, which is why they are two ------------------------------------

test('each check answers from its own evidence [unit]', (t) => {
  // A stamp verdict is a fact about the database and a neighbour verdict a fact about the disk, and
  // nothing in either reads the other. Worth an assertion because the two now share a vocabulary, a
  // composer and a field, and sharing three things is how two answers start being one.
  const db = openPlanningDatabase(t);

  stampPlugin(db, { version: AHEAD });

  assert.equal(stampSkew(db).state, SKEW.found);
  assert.equal(stampSkew(db, { version: AHEAD }).state, SKEW.none,
    'the stamp check answered the same for two different running versions');
  assert.equal(stampSkew(db).source, SOURCE.stamp, 'the verdict does not say which check produced it');
});
