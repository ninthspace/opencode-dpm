/**
 * Epic 48-01 — the server launched read-only (Story 1: NFR1, ENVX2; Story 2: FR3, FR11, ENVX3).
 *
 * The board observes projects it does not own. Before this, merely opening one would migrate its
 * database and re-seed its vocabulary, leaving the project diverged from its committed dump — and
 * the pre-commit guard would then refuse the user's next commit in a repository they had not
 * touched. The failure is silent, delayed, and impossible to attribute to the thing that caused it.
 *
 * **Every criterion here is an absence, and an absence is what a broken check always reports.** A
 * mode that did nothing at all would satisfy "no migration ran" perfectly. So the shape throughout
 * is a pair: the same fixture, the same sequence, run once with the mode and once without, with the
 * second arm asserting that the thing said not to happen *does* happen when the mode is removed.
 * That is retro 44's remove-the-condition control, and it is the only thing separating "correctly
 * inert" from "never worked".
 *
 * **The three observables.** A session under this mode is distinguished by three things, and the
 * tests below name the same three every time: the connection was opened with `readOnly` set, the
 * file was never brought up through `start` (which is `openConnection` then `migrate` then
 * `applyVocabulary`, so nothing reachable only through it can have run), and a mutating call is
 * refused while a read answers. One of the three alone would pass on a mode wired to two of them.
 *
 * **Story 2's sequence is spawn-then-call, and the *call* is what makes it discriminate.** Spec 49
 * deferred creation to the first tool call rather than removing it, so a spawn on its own creates
 * nothing under either mode and an assertion taken there would hold over a flag that did nothing
 * at all. Those tests spawn the real binary rather than driving `main`, because what FR11 renders
 * is the behaviour of a process the board started.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { openConnection } from '../src/db/connection.ts';
import { DATABASE } from '../src/db/location.ts';
import { main, open } from '../src/server/index.ts';
import { IGNORE_FILE } from '../src/server/ignore.ts';
import { LAUNCHED_READ_ONLY, READ_ONLY_ENV, READ_ONLY_FLAG, readOnlyRequested } from '../src/server/read-only.ts';
import { targetVersion } from '../src/schema/migrate.ts';
import { applyVocabulary } from '../src/schema/seeds/index.ts';
import { start } from '../src/start.ts';
import { sha256 } from './support/hashes.js';
import { databaseAtVersion, previousVersion, vocabularyAsOf } from './support/migration.js';
import { recordOpen } from './support/recorders.js';
import { runNode } from './support/run-node.js';
import { ownedDirectory } from './support/scratch.js';
import { BIN, HELLO, NO_OVERRIDE, call, repliesFrom, wire } from './support/session.js';
import { packageManifest, unsanctionedDependencies } from './support/sources.js';
import { sessionOutput } from './support/streams.js';

const ROOT = join(import.meta.dirname, '..');

const PREVIOUS = previousVersion();

/**
 * The bytes of a file, as something `sha256` can take.
 *
 * Base64 rather than a text read, because a SQLite database is not text and a lossy decode would
 * hash two different files to the same digest — which is the one failure a byte-identity assertion
 * cannot survive.
 */
const bytesOf = (path) => sha256(readFileSync(path).toString('base64'));

/** The largest applied migration recorded in a database, read without going through `src/`. */
function schemaVersionOf(path) {
  const db = new DatabaseSync(path, { readOnly: true });

  try {
    return db.prepare('SELECT MAX(version) AS version FROM schema_version').get().version;
  } finally {
    db.close();
  }
}

/** A directory holding a real dpm database at the current schema version, closed. */
function settled(t, prefix) {
  const directory = ownedDirectory(t, prefix);
  const location = join(directory, '.dpm', 'dpm.db');

  mkdirSync(join(directory, '.dpm'), { recursive: true });

  const built = start(location);

  built.db.close();

  return { directory, location };
}

/**
 * A database a release ago: the schema as of `PREVIOUS`, with that release's vocabulary seeded.
 *
 * Built by applying the DDL up to a version rather than by keeping a committed file, so it stays
 * one release behind as migrations are added instead of drifting further behind every release
 * until it no longer resembles anything a user has. The vocabulary is applied on top because a
 * project's database has been through a real bring-up, and an unseeded one would serve a tool list
 * built from an empty `document_kind` — a difference that has nothing to do with this story.
 */
function behind(t) {
  const file = databaseAtVersion(t, PREVIOUS);
  const db = file.connect();

  // The vocabulary *that release* shipped, which is bounded by the tables it had — seeding this
  // release's whole set into a database a version behind fails on the first table a later
  // migration adds, and no release ever shipped that combination.
  applyVocabulary(db, { vocabularies: vocabularyAsOf(db) });
  db.close();

  return file.path;
}

/**
 * One in-process session against `location`, with every seam recorded.
 *
 * `argv` and the variable's value are given explicitly on both arms — including the arms that mean
 * *off* — so a developer whose own environment carries `DPM_READ_ONLY` runs the same test everyone
 * else does. The value travels the same path a real environment read produces; that the read itself
 * reaches the variable is what the spawned session below checks.
 */
async function session(location, messages, { value = '', argv = [] } = {}) {
  const recorder = recordOpen();
  const output = sessionOutput();

  await main({
    input: Readable.from([wire(messages)]),
    output: output.stream,
    location,
    start: recorder.start,
    connect: recorder.connect,
    readOnlyEnv: value,
    argv,
  });

  return {
    events: recorder.events,
    connections: recorder.connections,
    replies: output.replies(),
    reply: (id) => output.replies().find((message) => message.id === id),
  };
}

/** A `tools/call` that must be refused, and one that must be answered. */
const WRITE = call(3, 'create_spec', { slug: 'written-by-an-observer', title: 'Written by an observer' });
const READ = call(2, 'list_spec');

/**
 * The three observables, reduced to something two runs can be compared on.
 *
 * The refusal is reduced to its text rather than kept as the whole reply, because the reply
 * carries the request id and the two runs answer different requests.
 */
const observed = (run) => ({
  events: run.events,
  readOnly: run.connections.map(({ readOnly }) => readOnly),
  read: run.reply(2)?.error === undefined,
  refusal: run.reply(3)?.error?.data?.message,
});

// --- Criterion 1: the variable produces all three observables ------------------------------------

test('DPM_READ_ONLY opens the connection read-only, skips the bring-up, and refuses writes [integration]', async (t) => {
  const { location } = settled(t, 'dpm-read-only-env-');
  const before = bytesOf(location);
  const run = await session(location, [HELLO, READ, WRITE], { value: '1' });

  // **The connection, by the options it was given.** That a connection was opened says nothing —
  // an ordinary launch opens one too. The mode is in the argument.
  assert.deepEqual(run.connections.map(({ location: at, readOnly }) => ({ at, readOnly })),
    [{ at: location, readOnly: true }], 'the live connection was not opened read-only');

  // **Neither write step ran, because the composition that holds them was never called.** The
  // template still comes up — `tools/list` has to answer before any database exists — and it is
  // `:memory:`, so the event list is also the assertion that nothing brought up the file.
  assert.deepEqual(run.events, [`start::memory:`, `read-only:${location}`],
    'the session brought the file up through start(), which is migrate and applyVocabulary');

  // And the file says the same thing independently: a migration that ran would have left bytes
  // behind, and this hash is taken over the file rather than over what the server reported.
  assert.equal(bytesOf(location), before, 'the read-only session changed the database file');

  // **The served set.** A read answers, a write is refused, and the refusal names the launch —
  // `error.data` rather than `error.message`, which `rpc.js` holds at the JSON-RPC code's standard
  // text and which would therefore match for any refusal at all, including a broken one.
  assert.equal(run.reply(2)?.error, undefined, `the read was refused: ${JSON.stringify(run.reply(2)?.error)}`);
  assert.equal(run.reply(3)?.error?.data?.message, `create_spec: ${LAUNCHED_READ_ONLY}`);

  // **The remove-the-condition control, on the same fixture and the same messages.** Without the
  // mode the identical sequence brings the file up through `start()` and the write succeeds — so
  // every absence above is attributable to the mode rather than to a session that did nothing.
  const ordinary = await session(location, [HELLO, READ, WRITE]);

  // The ignore and restore seams are not threaded through `main` — `server.test.js` drives those
  // against `open()` directly — so the real ones run here and the event list is the bring-ups
  // alone. That is the comparison this control needs: the same two positions, filled differently.
  assert.deepEqual(ordinary.connections, [], 'the ordinary path opened a connection through the seam');
  assert.deepEqual(ordinary.events, ['start::memory:', `start:${location}`]);
  assert.equal(ordinary.reply(3)?.error, undefined,
    `the control run could not write either: ${JSON.stringify(ordinary.reply(3)?.error)}`);
  assert.notEqual(bytesOf(location), before, 'the control run left the database byte-identical');
});

// --- Criterion 2: the flag and the variable are one mode -----------------------------------------

test('the CLI flag produces the same mode as the environment variable [integration]', async (t) => {
  const withVariable = await session(settled(t, 'dpm-read-only-a-').location, [HELLO, READ, WRITE],
    { value: '1' });
  const withFlag = await session(settled(t, 'dpm-read-only-b-').location, [HELLO, READ, WRITE],
    { argv: ['node', 'dpm-mcp.ts', READ_ONLY_FLAG] });

  // The two runs are compared to each other rather than each to a transcript. Two transcripts agree
  // until someone updates one of them, which is the divergence this criterion exists to rule out.
  // The locations differ by construction, so the events are compared with them removed.
  const withoutLocations = (run) => ({
    ...observed(run),
    events: observed(run).events.map((event) => event.replace(/:.*dpm\.db$/, ':<database>')),
  });

  assert.deepEqual(withoutLocations(withFlag), withoutLocations(withVariable),
    'the flag and the variable produce different modes');

  // The control: the comparison can tell the modes apart. Without it, two runs that had both
  // silently failed to enter the mode would agree just as convincingly.
  const neither = await session(settled(t, 'dpm-read-only-c-').location, [HELLO, READ, WRITE]);

  assert.notDeepEqual(withoutLocations(neither), withoutLocations(withVariable),
    'a run with no mode at all matched a read-only one, so the comparison distinguishes nothing');

  // And the resolution itself, at its own level: both routes, and every shape of the variable that
  // means *off*. A rule of "set means on" would leave `DPM_READ_ONLY=0` on, which is the value a
  // caller reaches for to turn it back off.
  assert.equal(readOnlyRequested({ argv: [READ_ONLY_FLAG], value: undefined }), true);
  assert.equal(readOnlyRequested({ argv: [], value: '1' }), true);
  assert.equal(readOnlyRequested({ argv: [], value: undefined }), false);
  assert.deepEqual(['', '0', 'false', 'no', 'off', ' OFF '].map((off) =>
    readOnlyRequested({ argv: [], value: off })), [false, false, false, false, false, false]);
});

// --- Criterion 3: a mutating call is refused by the server, as a process -------------------------

test('a spawned server launched read-only refuses a mutating call [integration]', async (t) => {
  const { directory, location } = settled(t, 'dpm-read-only-spawn-');
  const before = bytesOf(location);

  const refusing = await runNode([BIN], wire([HELLO, READ, WRITE]),
    { ...NO_OVERRIDE, [READ_ONLY_ENV]: '1' }, { cwd: directory });

  assert.equal(refusing.code, 0, `the server exited ${refusing.code}: ${refusing.stderr}`);

  const replies = repliesFrom(refusing.stdout);
  const refused = replies.find((message) => message.id === 3);

  assert.ok(refused, `stdout carried no reply to the write:\n${refusing.stdout}`);
  assert.equal(refused.error?.data?.message, `create_spec: ${LAUNCHED_READ_ONLY}`);
  assert.equal(replies.find((message) => message.id === 2)?.error, undefined,
    'the read was refused too, so this server refuses everything rather than every write');
  assert.equal(bytesOf(location), before, 'the refused session still changed the database file');

  // The paired positive, in the same directory and over the same messages: the variable is what
  // did it. This is also the only assertion in the file that the *real* environment read happens —
  // every other run hands the value in.
  const writing = await runNode([BIN], wire([HELLO, READ, WRITE]), NO_OVERRIDE, { cwd: directory });

  assert.equal(writing.code, 0, `the server exited ${writing.code}: ${writing.stderr}`);
  assert.equal(repliesFrom(writing.stdout).find((message) => message.id === 3)?.error, undefined,
    'the control server refused the write as well, so the refusal above proves nothing');
});

// --- Criterion 4: a database at the current version is left alone --------------------------------

test('a database at the current schema version is opened read-only without a write [integration]', async (t) => {
  const { location } = settled(t, 'dpm-read-only-current-');
  const before = bytesOf(location);
  const version = schemaVersionOf(location);

  assert.equal(version, targetVersion(), 'the fixture is not at the current schema version');

  const run = await session(location, [HELLO, READ], { value: '1' });

  assert.equal(run.reply(2)?.error, undefined, 'the session did not answer a read, so it did nothing');
  assert.equal(bytesOf(location), before, 'the read-only session wrote to the database');
  assert.equal(schemaVersionOf(location), version);

  // **The control that makes this criterion mean something, and it is not the obvious one.** A
  // database already at the current version is migrated by nothing, so "no migration ran" holds
  // for a mode that does not exist. What separates them is that `migrate()` drops and recreates
  // the retirement guards on *every* open by design — so an ordinary open of this same untouched
  // file does not leave it byte-identical, and the assertion above is a real one.
  await session(location, [HELLO, READ]);

  assert.notEqual(bytesOf(location), before,
    'an ordinary open left the file byte-identical too, so byte-identity is not evidence here');
});

// --- Criterion 5: a database behind the server is left behind ------------------------------------

test('a database behind the server is not migrated read-only, and is migrated without the mode [integration]', async (t) => {
  const location = behind(t);
  const before = bytesOf(location);

  assert.equal(schemaVersionOf(location), PREVIOUS, 'the fixture is not behind the server');
  assert.notEqual(PREVIOUS, targetVersion(), 'there is only one schema version, so nothing is behind');

  const run = await session(location, [HELLO, READ], { value: '1' });

  assert.equal(run.reply(2)?.error, undefined,
    `the behind database was not served at all: ${JSON.stringify(run.reply(2)?.error)}`);
  assert.deepEqual(run.events, [`start::memory:`, `read-only:${location}`]);
  assert.equal(bytesOf(location), before, 'the read-only session migrated a database behind it');
  assert.equal(schemaVersionOf(location), PREVIOUS, 'the schema version moved');

  // **The same file, the same sequence, the mode removed.** This is the pair the whole story turns
  // on: the migration this mode prevents is one that would otherwise have happened, to this exact
  // database, on this exact call.
  await session(location, [HELLO, READ]);

  assert.notEqual(bytesOf(location), before, 'the ordinary session left the database untouched');
  assert.equal(schemaVersionOf(location), targetVersion(),
    'the ordinary session did not migrate, so nothing here shows the mode prevented one');
});

// --- Criterion 6 (must NOT): the refusal is the connection and the tool set, not a handler -------

test('the write refusal comes from the connection and the served set, not from a handler [integration]', async (t) => {
  const { location } = settled(t, 'dpm-read-only-mechanism-');
  const recorder = recordOpen();
  const tools = open(location, { connect: recorder.connect, readOnly: true });
  const [connection] = recorder.connections;

  // **The layer under every handler.** Reaching past the whole tool surface to the connection
  // itself and being refused there is what says the guarantee does not depend on any handler
  // having remembered it — including handlers nobody has written yet. A mode implemented as a
  // check inside each tool passes every assertion below this one and fails this.
  assert.equal(connection?.readOnly, true,
    'the read-only bring-up did not go through the connection seam, so there is none to reach');
  assert.throws(() => connection.db.exec('CREATE TABLE written_past_every_handler (a TEXT)'),
    (error) => error.code === 'ERR_SQLITE_ERROR',
    'a write reaching the database directly was allowed, so the connection is not read-only');

  // **The served set, by name in both directions.** Named rather than derived: the refusing list
  // and the list its names would be derived from are both built by `spineTools`, so a registry
  // that collapsed would collapse both and a derived comparison would go green over two empty
  // lists.
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const refuse = ['create_spec', 'update_spec', 'create_epic', 'create_story', 'publish'];
  const answer = ['list_spec', 'read_spec', 'search'];

  for (const name of [...refuse, ...answer]) {
    assert.ok(byName.has(name), `${name} is not in the served set at all`);
  }

  for (const name of refuse) {
    assert.throws(() => byName.get(name).handler({}),
      (error) => error.message.startsWith(`${name}: `), `${name} was served able to run`);
  }

  // Every tool declaring itself a mutation, not only the five named — the property is of the set.
  const mutating = tools.filter((tool) => tool.mutates);

  assert.ok(mutating.length >= refuse.length, `only ${mutating.length} tools declare a mutation`);

  for (const tool of mutating) {
    assert.throws(() => tool.handler({}), (error) => error.message === `${tool.name}: ${LAUNCHED_READ_ONLY}`,
      `${tool.name} refused for some reason other than the launch`);
  }

  // **And the reads still answer, which is the half a set that refused everything would also
  // satisfy.** Filtered on the *reason* rather than on success: most read tools called with no
  // arguments are declined with `'id' is required`, which is a tool that was resolved and then
  // asked for an argument — the opposite of one this mode took away. Only the launch's own
  // sentence counts as a refusal here.
  assert.doesNotThrow(() => byName.get('list_spec').handler({}),
    'a read needing no arguments was refused');

  const refusedByTheMode = tools.filter((tool) => !tool.mutates).filter((tool) => {
    try {
      tool.handler({});

      return false;
    } catch (error) {
      return error.message === `${tool.name}: ${LAUNCHED_READ_ONLY}`;
    }
  });

  assert.deepEqual(refusedByTheMode.map((tool) => tool.name), [],
    'a read was refused by the mode, which serves reads');

  // **The remove-the-condition control.** Built without the mode, over the same database, the same
  // names run — so the refusals above are the mode rather than a tool table that never worked.
  const ordinary = new Map(open(location, {}).map((tool) => [tool.name, tool]));

  assert.doesNotThrow(
    () => ordinary.get('create_spec').handler({ slug: 'written-without-the-mode', title: 'Written' }),
    'the control could not write either, so the refusals above prove nothing',
  );
});

// --- Criterion 7: node:sqlite alone ---------------------------------------------------------------

test('the read-only mode is node:sqlite and nothing else, with no dependency added [unit]', (t) => {
  const manifest = packageManifest();

  assert.deepEqual(manifest.dependencies ?? {}, {});
  assert.deepEqual(unsanctionedDependencies(manifest), [],
    'and no driver package smuggled in as a development dependency');

  // **The mode is SQLite's own flag, asserted behaviourally.** A wrapper that intercepted writes
  // in JavaScript would satisfy every criterion above and none of this one: the refusal has to come
  // from the same object an ordinary connection is, opened differently.
  const { location } = settled(t, 'dpm-read-only-envx2-');
  const reading = openConnection(location, { readOnly: true });

  t.after(() => reading.close());

  assert.ok(reading instanceof DatabaseSync, 'the read-only connection is not a node:sqlite one');
  assert.throws(() => reading.exec('CREATE TABLE from_a_read_only_connection (a TEXT)'),
    (error) => error.code === 'ERR_SQLITE_ERROR',
    'a connection opened with readOnly accepted a write, so the option reached nothing');

  // The control: the same function, the same file, without the option. Without this the assertion
  // above holds for a connection that could not write for some entirely different reason.
  const writing = openConnection(location);

  t.after(() => writing.close());

  assert.doesNotThrow(() => writing.exec('CREATE TABLE from_a_writable_connection (a TEXT)'));
});

// --- Story 2, criteria 1, 2 and the must-NOT: a project that has no database ---------------------

/**
 * The spawn-then-call sequence, run against a directory with the mode on or off.
 *
 * `messages` is open so the sequence a test extends is visibly the same one the pair below is
 * asserted on, rather than a second spawn written out beside it that could drift from it.
 */
const spawnThenCall = (directory, mode, messages = [HELLO, READ]) =>
  runNode([BIN], wire(messages), { ...NO_OVERRIDE, ...mode }, { cwd: directory });

test('a read-only server against a missing database refuses and creates nothing [integration]', async (t) => {
  const directory = ownedDirectory(t, 'dpm-read-only-missing-');

  assert.deepEqual(readdirSync(directory), [], 'the fixture is not a project without a database');

  const refusing = await spawnThenCall(directory, { [READ_ONLY_ENV]: '1' });

  // **A response, not an exit.** A server that died on the exception would satisfy every
  // filesystem assertion below and would be a *different* one of FR11's four states — the board is
  // required to tell "this project has no database" from "this server failed to start", and a
  // process that stopped is how it learns the second.
  assert.equal(refusing.code, 0, `the server exited ${refusing.code}: ${refusing.stderr}`);

  const refused = repliesFrom(refusing.stdout).find((message) => message.id === 2);

  assert.ok(refused?.error, `the call was answered rather than refused:\n${refusing.stdout}`);
  assert.match(refused.error.data?.message, /ERR_SQLITE_ERROR/,
    'the refusal does not carry SQLite\'s classification, so it names no state the board can render');

  // **The must-NOT, read off the directory rather than off the code** (ENVX3). Both write sweeps
  // in this suite are token sweeps and neither can follow a call, so neither can prove that
  // nothing on this path writes; what can is the directory the process ran in, listed.
  assert.deepEqual(readdirSync(directory), [],
    'the read-only server wrote into a project that has no database');

  // **The paired positive, in the same directory and over the same messages.** Without it the
  // assertion above holds for a server that crashed at startup, for spec 49 having removed the
  // creation entirely, and for a flag that does nothing — three explanations the absence cannot
  // distinguish. The only thing that differs between the two runs is the variable.
  const creating = await spawnThenCall(directory, {});

  assert.equal(creating.code, 0, `the control server exited ${creating.code}: ${creating.stderr}`);
  assert.equal(repliesFrom(creating.stdout).find((message) => message.id === 2)?.error, undefined,
    'the control call was refused too, so the refusal above is not the mode');
  assert.deepEqual(readdirSync(directory), ['.dpm'], 'the control run created no database either');
  assert.deepEqual(readdirSync(join(directory, '.dpm')).sort(), [IGNORE_FILE, 'dpm.db']);
});

// --- Story 2, criterion 3: the refusal is legible ------------------------------------------------

test('the refusal names the database it could not open, and the session survives it [integration]', async (t) => {
  const directory = ownedDirectory(t, 'dpm-read-only-legible-');
  const listing = { jsonrpc: '2.0', id: 4, method: 'tools/list' };

  const refusing = await spawnThenCall(directory, { [READ_ONLY_ENV]: '1' }, [HELLO, READ, listing]);

  const replies = repliesFrom(refusing.stdout);
  const message = replies.find((reply) => reply.id === 2)?.error?.data?.message;

  // **The path, because "unable to open database file" is the whole of what SQLite says.** A board
  // rendering one row per project has nothing to put in the row without it, and a person reading
  // this by hand cannot tell which of several projects produced it.
  assert.ok(message?.includes(DATABASE),
    `the refusal does not name the database it could not open:\n${message}`);

  // **And the session is still serving afterwards** (FR11 — a state, not a crash). The refusal
  // arrived as one message about one call; the connection to the client is unaffected, which is
  // what lets a board keep every other project rendering.
  assert.ok(replies.find((reply) => reply.id === 4)?.result?.tools?.length > 0,
    `the session stopped serving after the refusal:\n${refusing.stdout}`);
  assert.equal(refusing.stderr, '', `the refusal was also written to stderr:\n${refusing.stderr}`);

  // The control: this diagnostic is produced by the missing database and not by the mode. The same
  // read-only launch over a project that *has* one answers the call.
  const answering = await spawnThenCall(settled(t, 'dpm-read-only-present-').directory,
    { [READ_ONLY_ENV]: '1' });

  assert.equal(repliesFrom(answering.stdout).find((reply) => reply.id === 2)?.error, undefined,
    'a read-only server refused a database that was there, so the refusal names nothing in particular');
});
