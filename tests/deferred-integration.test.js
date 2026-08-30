/**
 * Epic 49-01 Story 7 — the seam, across one real session (FR2, AD12).
 *
 * **Every other test in this epic compares two lists the test itself built.** Story 1 builds a
 * template list and a file-database list side by side and compares them; Story 5 builds a table
 * through `open()` and compares its names to `advertisedTools()`. Both are worth having and neither
 * is this: they compare two constructions, and what `listChanged: false` promises is that the list
 * the *transport advertised* at launch is the table the transport *resolves* on first call. A
 * resolver wired to the wrong list passes every criterion in Stories 1–5 and fails here.
 *
 * So this file drives `bin/dpm-mcp.ts` as a process and reads only what came back over stdout. No
 * module under test is imported for its behaviour — the tool registry is imported once, to derive a
 * floor, and that is the only in-process construction here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { openPlanningDatabase } from './support/planning-database.js';
import { recordStarts } from './support/recorders.js';
import { runNode } from './support/run-node.js';
import { ownedDirectory as scratch } from './support/scratch.js';
import { BIN, HELLO, NO_OVERRIDE, call, repliesFrom, wire } from './support/session.js';
import { IGNORE_FILE } from '../src/server/ignore.ts';
import { MARKER_PATH } from '../src/sync/marker.ts';
import { main } from '../src/server/index.ts';
import { RPC_ERRORS } from '../src/server/rpc.ts';
import { spineTools } from '../src/tools/index.ts';

/** A directory the child runs in, so the relative default database path lands inside it. */
const ownedDirectory = (t) => scratch(t, 'dpm-seam-');

const LIST = { jsonrpc: '2.0', id: 2, method: 'tools/list' };

// --- Criterion 1: what was advertised is what gets resolved --------------------------------------

test('every tool advertised before the database exists resolves after the lazy open [integration]', async (t) => {
  const directory = ownedDirectory(t);

  // Step one, on its own: list the tools in a directory with no database in it. This is the list
  // the `listChanged: false` promise is made about, and it is read off the wire rather than built.
  const listing = await runNode([BIN], wire([HELLO, LIST]), NO_OVERRIDE, { cwd: directory });

  assert.equal(listing.code, 0, `the server exited ${listing.code}: ${listing.stderr}`);
  assert.deepEqual(readdirSync(directory), [], 'listing tools created something on disk');

  const advertised = repliesFrom(listing.stdout).find((reply) => reply.id === 2)?.result?.tools;

  assert.ok(Array.isArray(advertised), `no tools/list result on stdout:\n${listing.stdout}`);

  // The floor, off the registry rather than typed here: a session that advertised three tools would
  // satisfy every assertion below by having almost nothing to check.
  const floor = spineTools(openPlanningDatabase(t)).length;

  assert.ok(floor > 100, `the registry the floor comes from holds only ${floor} tools`);
  assert.equal(advertised.length, floor, `${advertised.length} advertised against a registry of ${floor}`);

  // **Step two: call every one of them, in one session, in the directory the first left empty.**
  // The first call opens the database and the rest are resolved against the table built from it. A
  // name in the advertised list that is missing from that table answers `Method not found` — which
  // is the whole failure this story exists to catch, and it is invisible to any comparison of two
  // lists the test constructed itself.
  const calls = advertised.map((tool, index) => call(index + 10, tool.name));
  const session = await runNode([BIN], wire([HELLO, ...calls]), NO_OVERRIDE, { cwd: directory });

  assert.equal(session.code, 0, `the server exited ${session.code}: ${session.stderr}`);

  const replies = new Map(repliesFrom(session.stdout).map((reply) => [reply.id, reply]));

  // Every call answered — an id with no reply is a message the server dropped, which would take a
  // tool out of the comparison below without failing it.
  assert.deepEqual(calls.filter((message) => !replies.has(message.id)).map((message) => message.params.name), []);

  // **`Method not found` is the only error that means what this criterion is about.** Most of these
  // calls are made with no arguments and are refused for that — `Invalid params` — and that refusal
  // is a tool that *was* resolved and then declined. Filtering on the code rather than on success is
  // what lets one session exercise the whole surface.
  const unresolved = calls
    .filter((message) => replies.get(message.id)?.error?.code === RPC_ERRORS.methodNotFound.code)
    .map((message) => message.params.name);

  assert.deepEqual(unresolved, [], 'a tool was advertised at launch and not resolvable after the open');

  // The control, in the same session: a name that was never advertised *does* get `Method not
  // found`. Without it, a server answering `-32601` to nothing at all — because the resolver
  // returned a table containing everything, or because the code changed — passes the line above.
  const absent = repliesFrom(session.stdout).find((reply) => reply.id === 9);

  assert.equal(absent, undefined, 'id 9 was not sent, so this control is asserting on nothing');

  const decoy = await runNode([BIN], wire([HELLO, call(2, 'no_such_tool_at_all')]),
    NO_OVERRIDE, { cwd: directory });
  const refused = repliesFrom(decoy.stdout).find((reply) => reply.id === 2);

  assert.equal(refused?.error?.code, RPC_ERRORS.methodNotFound.code,
    'an unadvertised name was resolved, so the check above cannot fail');

  // And the session did create the database, which is what makes "after the lazy open" true rather
  // than a description of a session that never opened anything.
  //
  // **The whole of `.dpm/`, named.** Calling every advertised tool also runs every tool's side
  // effects — `publish` regenerates the dump, the markdown, and (49-03, AD13) the sync marker — so
  // this directory holds more than a first run leaves, and each of those is listed rather than
  // filtered past. The failure the assertion is aimed at is a resolver that opened per call against
  // a path derived per call, which would leave a second `dpm.db` here; what makes it worth stating
  // as a whole set is that the last two files to appear in it did so without any test naming them.
  const entries = readdirSync(join(directory, '.dpm')).sort();

  assert.deepEqual(entries, [IGNORE_FILE, 'dpm.db', basename(MARKER_PATH), 'dpm.sql'].sort(),
    'the whole-surface session left something in .dpm/ that nothing here accounts for');
  assert.equal(existsSync(join(directory, '.dpm', 'dpm.db')), true);
});

// --- Criterion 2: one database, opened once ------------------------------------------------------

test('a session that lists then calls twice answers both from one database opened once [integration]', async (t) => {
  const directory = ownedDirectory(t);

  const messages = [
    HELLO,
    LIST,
    { jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'create_spec', arguments: { slug: 'first', title: 'The first' } } },
    call(4, 'list_spec'),
  ];

  const session = await runNode([BIN], wire(messages), NO_OVERRIDE, { cwd: directory });

  assert.equal(session.code, 0, `the server exited ${session.code}: ${session.stderr}`);
  assert.equal(session.stderr, '', 'an ordinary session said something on stderr');

  const replies = new Map(repliesFrom(session.stdout).map((reply) => [reply.id, reply]));

  assert.equal(replies.get(3)?.error, undefined, `the write failed: ${JSON.stringify(replies.get(3)?.error)}`);
  assert.equal(replies.get(4)?.error, undefined, `the read failed: ${JSON.stringify(replies.get(4)?.error)}`);

  // **The second call sees the first call's row.** This is what "one database" means from outside
  // the process: two calls that opened two databases, or one that opened a fresh one per request,
  // would each answer and the read would come back empty.
  assert.ok(JSON.stringify(replies.get(4).result).includes('The first'),
    `the read did not see the write:\n${JSON.stringify(replies.get(4).result)}`);

  // One database file, and nothing beside it but the ignore file — a per-request open against a
  // path derived per request would leave more than one.
  assert.deepEqual(readdirSync(join(directory, '.dpm')).sort(), [IGNORE_FILE, 'dpm.db']);

  // **"Opened once" is a count, and a count cannot be read off a transport.** So the same message
  // sequence is run a second time in-process against a recorder — the same sequence, including the
  // `tools/list` that this criterion puts before the calls, which is what makes this more than a
  // repeat of Story 2's three-identical-calls test. Both runs are here rather than one, because the
  // spawned run is the only thing that proves the real entry point wires this up and the recorded
  // one is the only thing that can count.
  const recorder = recordStarts();
  const location = join(ownedDirectory(t), '.dpm', 'dpm.db');
  const sink = new Writable({ write: (chunk, encoding, done) => done() });

  await main({
    input: Readable.from([wire(messages)]),
    output: sink,
    location,
    start: recorder.start,
  });

  assert.deepEqual(recorder.locations, [':memory:', location],
    'the session brought up other than the template and the file, exactly once each');
});
