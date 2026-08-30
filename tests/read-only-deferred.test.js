/**
 * Epic 49-05 — the deferred open honours read-only (FR12, AD14).
 *
 * **This is where two specs meet, and either one alone is satisfied by the wrong behaviour.** Spec
 * 49 defers creation to the first tool call; spec 48 launches servers read-only so that observing a
 * project cannot change it. Left alone the first defeats the second: an observer's first *read* is
 * now the call that would create the database it was launched specifically not to touch. Nothing in
 * spec 49's own criteria would notice, because creating on first call is exactly what they ask for.
 *
 * **So the fixture is a project that has no database, and the question is what a first call does to
 * it.** Every criterion here is an absence — no error class of dpm's own, no directory, no ignore
 * file, no database, no restore — and an absence is what a server too broken to reach the file
 * system reports just as well. Each story therefore runs its decoy in the *same directory*,
 * immediately after, with the flag as the only term that differs.
 *
 * **Not a second copy of `read-only.test.js`.** That file asks what spec 48 requires of the mode:
 * that the refusal carries `ERR_SQLITE_ERROR` so a board can tell "this project has no database"
 * from "this server failed to start". This one asks what spec 49 requires of the *deferral* — that
 * the session is alive and answering when the refusal arrives, because the refusal's whole location
 * is the first call rather than the launch. The two matrices are independent: neither's ✓ is
 * evidence about the other's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DUMP_FILE } from '../src/server/from-dump.ts';
import { IGNORE_FILE } from '../src/server/ignore.ts';
import { READ_ONLY_ENV } from '../src/server/read-only.ts';
import { commitDump, dumpHolding } from './support/dumps.js';
import { runNode } from './support/run-node.js';
import { ownedDirectory } from './support/scratch.js';
import { BIN, HELLO, NO_OVERRIDE, call, repliesFrom, wire } from './support/session.js';

/** The handshake, the advertised list, and the first tool call — a board's opening sequence. */
const LISTING = { jsonrpc: '2.0', id: 2, method: 'tools/list' };
const READ = call(3, 'list_spec');

/** Read-only on, and read-only off, as the only thing that differs between two runs. */
const ON = { [READ_ONLY_ENV]: '1' };
const OFF = {};

/**
 * One spawned session in `directory`, with the mode on or off.
 *
 * The real binary rather than `main`, because FR12 is about what a process the board started does
 * to a directory the board does not own — and `cwd` is what puts the relative default database path
 * inside the directory the test is watching.
 */
const sessionIn = (directory, mode, messages = [HELLO, LISTING, READ]) =>
  runNode([BIN], wire(messages), { ...NO_OVERRIDE, ...mode }, { cwd: directory });

// --- Story 1: the first call refuses, and refusing writes nothing --------------------------------

test('a read-only first call refuses rather than creating, and the session is serving when it does [integration]', async (t) => {
  const project = ownedDirectory(t, 'dpm-ro-deferred-');

  assert.deepEqual(readdirSync(project), [], 'the fixture is not a project without a database');

  const refusing = await sessionIn(project, ON);

  // **The absences first, before anything parses a reply** (retro 44). Every assertion below can
  // fail on a session that wrote a file, and the reply lookups would report the write as a missing
  // message about a different subject entirely. Listing the directory first is what makes a
  // mutation that reintroduces the create say so in the first line of the failure.
  assert.deepEqual(readdirSync(project), [],
    'the read-only session wrote into a project that has no database');

  const replies = repliesFrom(refusing.stdout);

  assert.equal(refusing.code, 0, `the server exited ${refusing.code}: ${refusing.stderr}`);

  // **Serving, and then refusing — which is the whole of what this epic adds.** The handshake and
  // the advertised list are answered from the in-memory template (FR2), so the session is alive and
  // has told the client what it can do; the refusal arrives at the first `tools/call` because that
  // is where the open now happens (FR5). A server that refused at launch would satisfy every
  // absence in this test and be the state spec 48's FR11 requires the board to tell apart from it.
  assert.ok(replies.find((reply) => reply.id === 1)?.result, `the handshake was not answered:\n${refusing.stdout}`);
  assert.ok(replies.find((reply) => reply.id === 2)?.result?.tools?.length > 0,
    `the advertised list was not answered:\n${refusing.stdout}`);

  const refused = replies.find((reply) => reply.id === 3);

  // SQLite's own error, not a class of dpm's own. A pre-check above the open would satisfy every
  // other assertion here and break spec 48's FR11, which reads this code as its named
  // missing-database state — a requirement nothing in spec 49 mentions.
  assert.ok(refused?.error, `the first call was answered rather than refused:\n${refusing.stdout}`);
  assert.match(refused.error.data?.message, /ERR_SQLITE_ERROR/,
    'the refusal is not SQLite\'s, so it names no state the board can render');

  // **The decoy, in the same directory and over the same messages.** Three absences asserted alone
  // are all satisfied by a server that fell over before reaching the file system, by spec 49 having
  // removed the creation outright, and by a flag that does nothing. The only difference between
  // this run and the one above is the variable.
  const creating = await sessionIn(project, OFF);

  assert.equal(creating.code, 0, `the control server exited ${creating.code}: ${creating.stderr}`);
  assert.equal(repliesFrom(creating.stdout).find((reply) => reply.id === 3)?.error, undefined,
    'the control call was refused too, so the refusal above is not the mode');
  assert.deepEqual(readdirSync(project), ['.dpm'], 'the control run created no `.dpm/`');
  assert.deepEqual(readdirSync(join(project, '.dpm')).sort(), [IGNORE_FILE, 'dpm.db'],
    'the control run created no ignore file and no database');
});

// --- Story 2: the restore is a write, so it does not happen either -------------------------------

/** A fresh clone's shape: the committed dump, `.dpm/` around it, and no database. */
function clone(t, slug) {
  const directory = ownedDirectory(t, 'dpm-ro-restore-');

  commitDump(directory, dumpHolding(slug));

  return directory;
}

test('a read-only first call does not restore the dump beside it, and the same directory does without the mode [integration]', async (t) => {
  // A slug nothing else in the suite creates, so a reply carrying it can only have come from this
  // dump — the control below asserts a *restore*, and rows a seeded database returns by itself
  // would satisfy a bare non-empty check with nothing having been read at all.
  const SLUG = 'restored-only-when-the-server-may-write';
  const project = clone(t, SLUG);

  const refusing = await sessionIn(project, ON);

  // **The absence first** (retro 44), and read off the directory rather than off the modules on the
  // path: the two write sweeps in this suite are token sweeps and neither follows a call, so
  // neither can say whether this run wrote. `dpm.sql` is the fixture; anything beside it is new.
  assert.deepEqual(readdirSync(join(project, '.dpm')), [DUMP_FILE],
    'the read-only session wrote into a project it was only supposed to read');

  const refused = repliesFrom(refusing.stdout).find((reply) => reply.id === 3);

  assert.equal(refusing.code, 0, `the server exited ${refusing.code}: ${refusing.stderr}`);
  assert.ok(refused?.error, `the call was answered from the dump rather than refused:\n${refusing.stdout}`);
  assert.match(refused.error.data?.message, /ERR_SQLITE_ERROR/,
    'the refusal is not SQLite\'s, so a dump-shaped directory produces a different state to an empty one');

  // **The pair the spec's own discipline asks for and this criterion was written without.** "No
  // database was written" is equally true of a restore path that has never worked, of a dump this
  // test wrote wrongly, and of a session that died before reaching either. The same directory, the
  // same dump, the same messages, with the flag off.
  const restoring = await sessionIn(project, OFF);

  assert.equal(restoring.code, 0, `the control server exited ${restoring.code}: ${restoring.stderr}`);
  assert.deepEqual(readdirSync(join(project, '.dpm')).sort(), [IGNORE_FILE, 'dpm.db', DUMP_FILE].sort(),
    'the control run restored nothing, so the absence above is not the mode');

  const answered = repliesFrom(restoring.stdout).find((reply) => reply.id === 3);

  assert.equal(answered?.error, undefined, `the control call was refused too:\n${restoring.stdout}`);
  assert.deepEqual(answered.result.structuredContent.items.map((item) => item.slug), [SLUG],
    'the control created a database without reading the dump into it');
});
