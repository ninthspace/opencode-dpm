/**
 * Epic 49-02 Story 1 — the dump restores itself into a database that is not there (FR6, AD14).
 *
 * **The subject is a condition, not a result.** "Answers from the dump's rows" is satisfied by any
 * server that returns rows, and the rows a planning database returns are mostly rows it seeds for
 * itself: a spec list read back non-empty proves nothing unless the same call over a directory with
 * no dump in it comes back *empty*. So every assertion here is anchored on a slug that exists in
 * exactly one place — the dump this test built — and the empty-directory call is in the same test as
 * the restoring one, where it cannot drift away from the thing it is the control for.
 *
 * **And the must-NOT is an ordering-and-condition claim, which rows cannot show either.** A restore
 * that ran over an existing database and a restore that never ran at all are the same set of rows if
 * the dump happens to hold nothing new. Two things separate them: a control that removes the
 * database and watches the *same dump* restore into the space it left, and the recorded seams, which
 * show where in `open()`'s sequence the restore sat and whether it fired.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { openConnection } from '../src/db/connection.ts';
import { applySchema } from '../src/schema/index.ts';
import { applyVocabulary } from '../src/schema/seeds/index.ts';
import { DUMP_FILE, restoreIfUnwritten } from '../src/server/from-dump.ts';
import { open } from '../src/server/index.ts';
import { commitDump, dumpHolding } from './support/dumps.js';
import { surface } from './support/git.js';
import { recordOpen } from './support/recorders.js';
import { runNode } from './support/run-node.js';
import { ownedDirectory as scratch } from './support/scratch.js';
import { BIN, HELLO, NO_OVERRIDE, call, repliesFrom, wire } from './support/session.js';

/** A directory the child runs in, so the relative default database path lands inside it. */
const ownedDirectory = (t) => scratch(t, 'dpm-restore-');

/** The `list_spec` reply of a spawned session, as the slugs it returned. */
function slugsFrom(session, id = 2) {
  assert.equal(session.code, 0, `the server exited ${session.code}: ${session.stderr}`);

  const reply = repliesFrom(session.stdout).find((message) => message.id === id);

  assert.ok(reply?.result, `no result for id ${id} on stdout:\n${session.stdout}`);
  assert.equal(reply.result.isError, undefined,
    `the call returned a tool error: ${JSON.stringify(reply.result)}`);

  return reply.result.structuredContent.items.map((item) => item.slug);
}

const LIST = (id) => call(id, 'list_spec');

// --- Criteria 1 and 2: the dump is read, and only a dump makes rows appear ------------------------

test('a first open with a dump beside it answers from it, and without one answers empty [integration]', async (t) => {
  const SLUG = 'restored-from-the-dump-and-nowhere-else';

  // The shape a fresh clone arrives in: the committed dump, and no database — which until this epic
  // meant an empty planning database beside a file full of rows.
  const clone = ownedDirectory(t);

  commitDump(clone, dumpHolding(SLUG));

  const restored = await runNode([BIN], wire([HELLO, LIST(2)]), NO_OVERRIDE, { cwd: clone });

  assert.deepEqual(slugsFrom(restored), [SLUG], 'the first call did not answer from the dump');
  assert.equal(existsSync(join(clone, '.dpm', 'dpm.db')), true,
    'the session answered from the dump without leaving a database behind');

  // **The decoy, and it is what the assertion above rests on.** Same binary, same call, same kind of
  // directory — the one difference is that there is no dump in it. A server that answered the line
  // above out of its own seeded vocabulary, or out of a database it found somewhere else, answers
  // this one the same way and fails here.
  const bare = ownedDirectory(t);
  const empty = await runNode([BIN], wire([HELLO, LIST(2)]), NO_OVERRIDE, { cwd: bare });

  assert.deepEqual(slugsFrom(empty), [], 'a directory with no dump in it answered with rows');
  assert.equal(existsSync(join(bare, '.dpm', 'dpm.db')), true,
    'the empty case did not create a database either, so it is not the same call');
});

// --- Criterion 3: never over a database that is already there ------------------------------------

test('a first open finding a database leaves it alone, whatever the dump holds [integration]', async (t) => {
  const KEPT = 'only-ever-in-the-database';
  const DUMPED = 'only-ever-in-the-dump';

  const directory = ownedDirectory(t);

  // The database first, and with no dump present while it is created — otherwise the session that
  // creates it restores, and the case this test is about never arises.
  const seeding = await runNode([BIN], wire([HELLO, {
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'create_spec', arguments: { slug: KEPT, title: 'Written by a session' } },
  }]), NO_OVERRIDE, { cwd: directory });

  assert.equal(seeding.code, 0, `the seeding session exited ${seeding.code}: ${seeding.stderr}`);
  assert.equal(existsSync(join(directory, '.dpm', 'dpm.db')), true,
    'the seeding session created no database');

  // Now the dump arrives — a checkout of a branch, or a merge — and it does not hold that spec.
  commitDump(directory, dumpHolding(DUMPED));

  const after = await runNode([BIN], wire([HELLO, LIST(2)]), NO_OVERRIDE, { cwd: directory });

  // Both halves in one assertion, because both are the same failure seen from either side: the row
  // that was there is still there, and the row the dump would have brought never arrived.
  assert.deepEqual(slugsFrom(after), [KEPT], 'a dump was restored over an existing database');

  // **The control, and without it this test passes for a restore that never works at all.** The
  // database goes away; the same dump, untouched, is now the only thing in the directory — and the
  // next session restores it. That is what makes the assertion above a statement about the
  // *condition* rather than about a feature that is simply broken.
  rmSync(join(directory, '.dpm', 'dpm.db'), { force: true });

  const again = await runNode([BIN], wire([HELLO, LIST(2)]), NO_OVERRIDE, { cwd: directory });

  assert.deepEqual(slugsFrom(again), [DUMPED],
    'with the database gone the same dump did not restore, so the check above proves nothing');
});

// --- The case "no file" was too narrow by: present, and never written to ---------------------------

test('a database that was created and never written to restores from a dump that arrives later [integration]', async (t) => {
  const SLUG = 'arrived-after-the-empty-database-did';

  const directory = ownedDirectory(t);
  const location = join(directory, '.dpm', 'dpm.db');

  // No dump in the directory yet, so this session creates the database and restores nothing into
  // it — and it writes no artefact, which is the whole condition under test. This is not a
  // contrived state: it is what a clone opened once before its dump was pulled ends up in, and it
  // is what this repository was in for three months.
  const first = await runNode([BIN], wire([HELLO, LIST(2)]), NO_OVERRIDE, { cwd: directory });

  assert.deepEqual(slugsFrom(first), [], 'the seeding session found rows it should not have');
  assert.equal(existsSync(location), true, 'the seeding session left no database to be empty');

  commitDump(directory, dumpHolding(SLUG));

  const second = await runNode([BIN], wire([HELLO, LIST(2)]), NO_OVERRIDE, { cwd: directory });

  assert.deepEqual(slugsFrom(second), [SLUG],
    'the empty database stopped the dump beside it from ever restoring');

  // And it says so, in the terms of the thing that happened: a user who can see a `dpm.db` sitting
  // there is not helped by a line claiming there was no database (FR10).
  assert.match(second.stderr, /held no planning artefacts/,
    `the replacement was silent or misreported: ${JSON.stringify(second.stderr)}`);
});

test('a corpus somebody cleared is not resurrected, because the sequences it allocated remain', (t) => {
  const directory = ownedDirectory(t);
  const location = join(directory, '.dpm', 'dpm.db');

  mkdirSync(join(directory, '.dpm'), { recursive: true });

  // A database that held planning work and holds none now — the state a user reaches by deleting
  // their documents, and the one an over-broad "is it empty" test cannot tell from a database that
  // was never used. The numbers it handed out are what separates them: DPM does not reclaim them,
  // so a sequence row outlives the document that caused it.
  const db = applySchema(openConnection(location));

  try {
    applyVocabulary(db);
    surface(db).create_spec({ slug: 'deleted-on-purpose', title: 'Written, then cleared' });
    db.prepare('DELETE FROM document').run();

    assert.equal(db.prepare('SELECT count(*) AS n FROM document').get().n, 0,
      'the fixture did not clear the corpus, so it is not the state this is about');
    assert.ok(db.prepare('SELECT count(*) AS n FROM number_sequence').get().n > 0,
      'clearing the corpus took the sequences with it, and nothing here can tell the cases apart');
  } finally {
    db.close();
  }

  commitDump(directory, dumpHolding('would-have-come-back'));

  assert.equal(restoreIfUnwritten(location), false, 'a corpus somebody cleared was restored over');

  // **The control, and without it this passes for a restore that declines on everything.** Same
  // location, same dump, same emptied `document` table — the one difference is that the sequences
  // are gone too, which is the only signal the previous line rests on.
  const emptied = openConnection(location);

  try {
    emptied.prepare('DELETE FROM number_sequence').run();
  } finally {
    emptied.close();
  }

  assert.equal(restoreIfUnwritten(location), 'unwritten',
    'with the sequences gone it still declined, so the check above proves nothing');
});

// --- Where in the sequence it sits, and when it declines ------------------------------------------

test('the restore runs after the ignore file and before the open, and only when the database is absent', (t) => {
  const directory = ownedDirectory(t);
  const location = join(directory, '.dpm', 'dpm.db');

  commitDump(directory, dumpHolding('ordered-against-the-seams'));

  const first = recordOpen();

  open(location, first);

  // **Before `start()` is not a preference, it is the only place it works**: `start()` creating the
  // file is exactly what makes the restore's own condition false. After the ignore write for AD15's
  // reason — a restored database that exists unignored, even briefly, can be staged by a `git add`
  // landing in that window, and it is a database with content in it.
  assert.deepEqual(first.events, ['ignore', 'restore', `start:${location}`]);

  const second = recordOpen();

  open(location, second);

  // The same open a moment later, against the same dump, declines — and this is the seam-level form
  // of the criterion above. Rows read back afterwards would be identical either way.
  assert.deepEqual(second.events, ['ignore', 'restore:skipped', `start:${location}`]);

  // The conditions that never reach `open()`'s sequence at all, so the recorder cannot show them: no
  // dump beside the location, and the in-memory template the tool list is advertised from.
  const bare = ownedDirectory(t);

  assert.equal(restoreIfUnwritten(join(bare, '.dpm', 'dpm.db')), false,
    'restored with no dump to restore from');
  assert.equal(existsSync(join(bare, '.dpm')), false, 'the declined restore created a directory anyway');
  assert.equal(restoreIfUnwritten(':memory:'), false);
});

// --- A restore that fails leaves nothing behind --------------------------------------------------

test('a restore that fails removes the database it created, so the next attempt still reports', (t) => {
  const directory = ownedDirectory(t);
  const location = join(directory, '.dpm', 'dpm.db');

  // A dangling reference, appended to a dump that is otherwise sound: `document_kind_parent.
  // parent_kind` names a kind the vocabulary does not carry. Enforcement is off for the duration of
  // a restore — it has to be, since no dump ordered by natural key is in topological order — so this
  // applies without complaint and is found by the integrity check that runs before the commit.
  commitDump(directory, `${dumpHolding('never-arrives')}\n`
    + 'INSERT INTO "document_kind_parent" ("kind", "parent_kind") VALUES (\'epic\', \'no-such-kind\');\n');

  const failed = (error) => error.name === 'RestoreFailed' && /document_kind_parent/.test(error.message);

  assert.throws(() => restoreIfUnwritten(location), failed);

  // **This is the line the cleanup exists for.** `restore()` rolls back, so nothing was written —
  // but opening the connection created the file, and a file that exists is precisely what stops the
  // restore running next time. Left behind, one bad dump would produce a single error and then an
  // empty planning database, silently, for the life of the checkout.
  assert.equal(existsSync(location), false, 'a failed restore left the database file it created');

  // So the next attempt still finds the fault rather than quietly serving nothing.
  assert.throws(() => restoreIfUnwritten(location), failed);

  // And the undo removed only what it created: fix the dump and the same location restores.
  commitDump(directory, dumpHolding('arrives-once-the-dump-is-sound'));

  assert.equal(restoreIfUnwritten(location), 'absent');
  assert.equal(existsSync(location), true);
});

// --- Story 2: the report, and only on the unusual open (FR10) -------------------------------------

test('a restore reports one line on stderr; an ordinary create says nothing [integration]', async (t) => {
  const SLUG = 'reported-because-it-came-from-the-dump';

  const clone = ownedDirectory(t);

  commitDump(clone, dumpHolding(SLUG));

  const restored = await runNode([BIN], wire([HELLO, LIST(2)]), NO_OVERRIDE, { cwd: clone });

  const lines = restored.stderr.split('\n').filter(Boolean);

  assert.equal(lines.length, 1,
    `the restoring session wrote ${lines.length} lines to stderr:\n${restored.stderr}`);
  assert.match(lines[0], /restored/, `the line does not name the restore: ${lines[0]}`);
  assert.ok(lines[0].includes(DUMP_FILE), `the line does not name what it restored from: ${lines[0]}`);

  // **must NOT write any of it to stdout**, checked here rather than at the end, and on this session
  // rather than the ordinary one — it is the only one of the two where a line exists that could have
  // gone to the wrong stream. stdout is protocol: every line of it has to parse as a JSON-RPC
  // message, and a diagnostic in there is not something a client can skip past, it is a client that
  // has stopped being able to read the session. Before the reply is read, because reading the reply
  // is *also* a parse and would otherwise fail first, with a message about a token.
  for (const line of restored.stdout.split('\n').filter(Boolean)) {
    assert.doesNotThrow(() => JSON.parse(line), `stdout carried a line that is not a message: ${line}`);
  }

  // And the report itself, matched as the exact text stderr received rather than as a pattern —
  // which is what keeps this true of whatever the line says next.
  assert.equal(restored.stdout.includes(lines[0]), false, 'the report was written to stdout as well');

  assert.deepEqual(slugsFrom(restored), [SLUG],
    'this session did not restore, so there is nothing here for it to have reported');

  // **The other half, and it is the one that makes "exactly one line" mean anything.** A server that
  // wrote its line on every open satisfies the count above and fails here. Same binary, same call,
  // same shape of directory — the one difference is that there is no dump in it, so the open is an
  // ordinary create and the spec's Deferred list says an ordinary create is silent.
  const bare = ownedDirectory(t);
  const created = await runNode([BIN], wire([HELLO, LIST(2)]), NO_OVERRIDE, { cwd: bare });

  assert.deepEqual(slugsFrom(created), [], 'the ordinary case restored something after all');
  assert.equal(created.stderr, '', `an ordinary create said something on stderr:\n${created.stderr}`);
});
