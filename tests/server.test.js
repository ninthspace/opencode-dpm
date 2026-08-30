/**
 * Story 1 — the server starts, states its floor, and keeps stdout to itself.
 *
 * Two of the three criteria are about what does *not* appear: no stray output on stdout, and no
 * crash-instead-of-message below the Node floor. Both are absences, and an absence is what a
 * broken check always reports — so each is paired here with the positive control that makes it
 * fail. The floor refusal is driven through a real spawned process rather than asserted against
 * the function alone, because what NFR2 promises is the behaviour of the *binary*.
 *
 * NFR1 — "a clean clone starts the server with no compilation step" — is `[target]` and is not
 * closed here. What is checked is the part a machine that already has the tree can honestly
 * check: that no dependency exists to install and no build output is required to run.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { advertisedTools, main, open, serve } from '../src/server/index.ts';
import { IGNORE_FILE, IGNORE_PATTERN } from '../src/server/ignore.ts';
import { dispatch, methods, negotiate, PREFERRED_PROTOCOL, SERVER_INFO, serverIdentity, SUPPORTED_PROTOCOLS, UNKNOWN_VERSION } from '../src/server/mcp.ts';
import { takeLines } from '../src/server/transport.ts';
import { targetVersion } from '../src/schema/migrate.ts';
import { assertNodeFloor, floorMessage, meetsFloor, REQUIRED_NODE } from '../src/server/node-floor.ts';
import { filterWarnings, isSqliteExperimental } from '../src/server/warnings.ts';
import { sha256 } from './support/hashes.js';
import {
  moduleFilesUnder, packageManifest, reachesBySpecifier, staticImports, unsanctionedDependencies,
} from './support/sources.js';
import { openDatabaseFile } from './support/database.js';
import { openPlanningDatabase } from './support/planning-database.js';
import { recordOpen, recordStarts } from './support/recorders.js';
import { runNode } from './support/run-node.js';
import { ownedDirectory as scratch } from './support/scratch.js';
import { BIN, call, HELLO, NO_OVERRIDE, repliesFrom, wire } from './support/session.js';
import { sessionOutput } from './support/streams.js';
import { compareToolLists, describedBy } from './support/tool-lists.js';
import { dump } from '../src/dump/index.ts';
import { start } from '../src/start.ts';
import { spineTools } from '../src/tools/index.ts';

const ROOT = join(import.meta.dirname, '..');

/** Run a whole session through the real loop and hand back what reached stdout. */
async function session(messages, tools = []) {
  const output = sessionOutput();
  const input = Readable.from([`${messages.map((m) => JSON.stringify(m)).join('\n')}\n`]);

  const { handled } = await serve({ input, output: output.stream, tools });

  return { handled, lines: output.lines, replies: output.replies() };
}


// --- The Node floor ----------------------------------------------------------------------------

test('the floor compares versions numerically, not as strings', () => {
  // **The claims about the floor are made against `REQUIRED_NODE`, and the claims about the
  // comparison are made against a floor supplied on the call.** This test was written with the
  // number in it eleven times and had to be rewritten the first time the floor moved — which is
  // the same drift the manifest test below exists to catch, in the place nobody was watching. A
  // property of the comparison is not a fact about 24, and writing it as one costs a rewrite at
  // every raise.
  assert.equal(meetsFloor(REQUIRED_NODE), true, 'the floor itself clears the floor');
  assert.equal(meetsFloor('0.0.1'), false, 'and something far below it does not');

  assert.equal(meetsFloor('22.4.9', '22.5.0'), false);
  assert.equal(meetsFloor('21.99.99', '22.5.0'), false, 'a high minor under a low major is still under');

  // The case a lexicographic comparison gets backwards: '22.10.0' < '22.5.0' as text.
  assert.equal(meetsFloor('22.10.0', '22.5.0'), true);
  assert.equal(meetsFloor('22.9.0', '22.5.0'), true);

  assert.equal(meetsFloor('23.0.0-nightly20260101', '22.5.0'), true,
    'a prerelease is judged on its numbers');
  assert.equal(meetsFloor(`v${REQUIRED_NODE}`), true, 'a leading v is tolerated');
});

test('an unreadable version is not treated as a version that passes', () => {
  for (const version of ['', 'garbage', 'x.y.z', undefined, null]) {
    assert.equal(meetsFloor(version), false, `${version} must not read as above the floor`);
  }
});

test('the refusal names both the required version and the one in use', () => {
  const message = floorMessage('20.11.0');

  assert.match(message, /20\.11\.0/, 'the version in use');
  assert.match(message, new RegExp(REQUIRED_NODE.replaceAll('.', '\\.')), 'the version required');
  assert.match(message, /node:sqlite/, 'and why, so the user can judge the upgrade');

  assert.throws(() => assertNodeFloor('20.11.0'),
    new RegExp(`requires Node >=${REQUIRED_NODE.replaceAll('.', '\\.')}`));
  assert.doesNotThrow(() => assertNodeFloor(REQUIRED_NODE), 'the control: at the floor it proceeds');
});

test('package.json states the same floor the code enforces', () => {
  const manifest = packageManifest();

  // Two copies of one number, which is the drift this project keeps finding. The test is what
  // makes them one fact.
  assert.equal(manifest.engines.node, `>=${REQUIRED_NODE}`);
});

test('the entry point refuses to start below its floor, as a process', async (t) => {
  // A fixture that differs from `bin/dpm-mcp.ts` in one constant — the floor it demands — so
  // the refusal path is exercised through a real process on a machine that is above the real
  // floor. Asserting `assertNodeFloor` alone would leave untested the part NFR2 is about:
  // that the binary exits, says why, and says it on stderr.
  const impossible = '999.0.0';
  const fixture = join(ROOT, 'tests', 'fixtures', 'floor-entry.mjs');

  const refused = await runNode([fixture, impossible]);

  assert.equal(refused.code, 1, 'the process exited non-zero');
  assert.match(refused.stderr, /requires Node >=999\.0\.0/, 'and named the version it wanted');
  assert.equal(refused.stdout, '', 'nothing reached stdout — it is the transport, even on failure');

  // The control: the same fixture, above its floor, starts. Without it this test passes against
  // an entry point that refuses unconditionally.
  const started = await runNode([fixture, '0.0.1']);

  assert.equal(started.code, 0);
  assert.equal(started.stdout, 'started\n');
});

// --- Stdout carries JSON-RPC and nothing else ---------------------------------------------------

test('a full session leaves nothing but well-formed JSON-RPC on stdout', async () => {
  const { lines, replies } = await session([
    HELLO,
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'ping' },
  ]);

  for (const line of lines) {
    const parsed = JSON.parse(line);
    assert.equal(parsed.jsonrpc, '2.0', line);
    assert.ok(Object.hasOwn(parsed, 'result') || Object.hasOwn(parsed, 'error'), line);
  }

  assert.deepEqual(replies.map((reply) => reply.id), [1, 2, 3]);
});

test('a notification is answered with nothing at all', async () => {
  const { handled, lines } = await session([
    HELLO,
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', method: 'notifications/anything/else' },
  ]);

  // Three messages in, one reply out. Answering a notification is well-formed JSON and a
  // protocol violation, and `notifications/initialized` arrives in every real session — so a
  // server that replied would put a stray message on stdout every time.
  assert.equal(handled, 3);
  assert.equal(lines.length, 1, 'only the request was answered');
  assert.equal(JSON.parse(lines[0]).id, 1);
});

test('an unparseable line becomes a parse error on stdout and a diagnostic on stderr', async () => {
  const output = sessionOutput();
  const input = Readable.from(['not json at all\n{"jsonrpc":"2.0","id":7,"method":"ping"}\n']);

  await serve({ input, output: output.stream });

  const replies = output.replies();

  // The bad line does not take the stream down with it — the request after it is still served,
  // which is the whole reason the transport reports parse failures rather than throwing.
  assert.deepEqual(
    replies.map((reply) => [reply.id, reply.error?.code ?? null]),
    [[null, -32700], [7, null]],
  );
});

test('an unknown method and an unknown tool are errors, not silence', async () => {
  const { replies } = await session([
    { jsonrpc: '2.0', id: 1, method: 'no/such/method' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'not_a_tool' } },
  ]);

  assert.equal(replies[0].error.code, -32601);
  assert.equal(replies[0].error.data.method, 'no/such/method');
  assert.equal(replies[1].error.code, -32601);
  assert.match(replies[1].error.data.message, /not_a_tool/);
});

test('a tool that throws becomes an error response rather than stopping the server', async () => {
  const { replies } = await session(
    [
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'explodes', arguments: {} } },
      { jsonrpc: '2.0', id: 2, method: 'ping' },
    ],
    [
      {
        name: 'explodes',
        description: 'throws',
        inputSchema: { type: 'object', properties: {} },
        handler: () => {
          throw new Error('the tool failed');
        },
      },
    ],
  );

  assert.equal(replies[0].error.code, -32603);
  assert.match(replies[0].error.data.message, /the tool failed/);
  assert.deepEqual(replies[1].result, {}, 'and the session continues');
});

test('the real binary serves a session over real pipes', async (t) => {
  const messages = [
    JSON.stringify(HELLO),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
  ].join('\n');

  // The loop is driven over streams everywhere else in this file; this is the one test that
  // proves the entry point wires the process's actual stdin and stdout to it.
  //
  // `:memory:` because the entry point otherwise creates `.dpm/dpm.db` wherever it is launched
  // from — which for a test run is the repository root. It did, once, before this was passed.
  const { stdout, stderr, code } = await runNode([BIN], `${messages}\n`, {
    DPM_DATABASE: ':memory:',
  });

  assert.equal(code, 0, 'and it exits cleanly when stdin closes');

  const lines = stdout.split('\n').filter((line) => line !== '');
  assert.equal(lines.length, 2);
  const info = JSON.parse(lines[0]).result.serverInfo;

  assert.equal(info.name, 'dpm');

  // From the spawned binary rather than the module, because the version is resolved from the
  // manifest at load and the question is what a *client* is told. The in-process test below reads
  // the same two values; this one proves they survive a real launch.
  assert.equal(info.version, packageManifest().version,
    'the binary announces a version the manifest does not state');

  // The schema version reaches a client through the handshake and nowhere else: the connection is
  // not open when `initialize` is answered (AD12 defers it to the first call) and no read tool
  // reports it. A client caching derived answers needs it, because an entry produced under an
  // earlier schema is stale however untouched the database file is. Compared against the schema
  // module's own answer rather than a number written here, which is the only form that survives a
  // migration landing.
  assert.equal(info.schemaVersion, targetVersion(), 'the handshake carries the schema it writes');
  assert.ok(info.schemaVersion > 0, 'and the version it carries is a real one');

  // Story 1 asserted this list was empty, which was true and is no longer: the entry point now
  // opens a database and registers the spine. What is checked is that the real binary reaches
  // the *same* registry the in-process tests use — the names are derived from it, never restated
  // — because a binary serving a different tool set from the one under test is the failure this
  // test exists to catch.
  const served = JSON.parse(lines[1]).result.tools.map((tool) => tool.name).sort();
  const registered = spineTools(openPlanningDatabase(t)).map((tool) => tool.name).sort();

  assert.ok(registered.length > 0, 'and the registry it is compared against is not empty');
  assert.deepEqual(served, registered);

  assert.equal(stderr, '', 'a clean session says nothing on stderr either');
});

// --- The hoisting hazard the entry point is shaped around ---------------------------------------

test('nothing the entry point imports statically reaches node:sqlite', () => {
  // The floor check exists to replace `ERR_UNKNOWN_BUILTIN_MODULE` with a sentence. It can only
  // do that if it runs first — and ES imports are evaluated before any statement in the file
  // that wrote them, so a single static import reaching `node:sqlite` moves the crash *before*
  // the check and silently un-implements NFR2. Nothing about the source would look wrong.
  //
  // The walk and its type-only exclusion live in `support/sources.js`, because `publish-cli.js`
  // asserts the same thing over all five binaries and the two must not disagree about what an
  // import edge is.
  const reaches = (file) => reachesBySpecifier(file, 'node:sqlite');

  assert.deepEqual(reaches(BIN), []);

  // The control: the walker must be able to find one, or its empty answer means nothing. The
  // connection module is where `node:sqlite` legitimately lives.
  assert.deepEqual(reaches(join(ROOT, 'src', 'db', 'connection.ts')), [
    `${join(ROOT, 'src', 'db', 'connection.ts')} imports node:sqlite`,
  ]);

  // The control on the exclusion itself, since the walk above would now be equally quiet if the
  // lookahead had swallowed every import rather than the type-only ones.
  assert.deepEqual(staticImports("import { DatabaseSync } from 'node:sqlite';"), ['node:sqlite'],
    'a value import is still counted');
  assert.deepEqual(staticImports("import type { DatabaseSync } from 'node:sqlite';"), [],
    'a type-only import is erased before evaluation, so it reaches nothing');
  assert.deepEqual(staticImports("import { type Row, insert } from './crud.ts';"), ['./crud.ts'],
    'a mixed import still loads the module for its value binding');
});

// The name must not end on the bare word `import` before the closing quote: `plugin.test.js`'s
// specifier scan is textual, and `import '…'` in prose reads to it as a real bare specifier.
test('the entry point reaches the server through a dynamic import, not a hoisted one', () => {
  const source = readFileSync(BIN, 'utf8');

  // **This is the assertion with teeth today, and the one above is the one with teeth later.**
  // `src/server/` does not reach `node:sqlite` yet — no tool touches the database until Story 2
  // — so the graph walk currently finds nothing whichever way this file is written, and adding
  // a static `import … from '../src/server/index.ts'` passes it. That was mutation-tested and
  // slipped through. What cannot slip through is the shape itself: the server must arrive by
  // `await import`, because that is what defers evaluation until after the floor check, and it
  // has to be true *now* so it is still true when the graph fills in.
  assert.match(source, /await import\(\s*['"]\.\.\/src\/server\/index\.ts['"]\s*\)/);

  const staticSpecifiers = [...source.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)]
    .map((match) => match[1]);

  assert.deepEqual(
    staticSpecifiers,
    ['../src/server/node-floor.ts', '../src/server/warnings.ts'],
    'only the two modules that must run before the floor check are imported statically',
  );
});

test('dpm has no dependency to install, which is the checkable half of NFR1', () => {
  const manifest = packageManifest();

  // NFR1's criterion is `[target]` — only a clean clone on a real host can close it. What can
  // be checked here is that there is nothing to install at runtime and nothing to build: no
  // runtime dependency means no `npm install` to run dpm, which is the step AD5 rejected Python
  // for needing. Development is a separate question, and `SANCTIONED_DEV_DEPENDENCIES` answers it.
  assert.deepEqual(manifest.dependencies ?? {}, {});
  assert.deepEqual(unsanctionedDependencies(manifest), []);
  assert.equal(manifest.scripts?.build, undefined, 'and no build script to forget to run');

  const external = moduleFilesUnder(join(ROOT, 'src'))
    .flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/from\s+['"]([^'".][^'"]*)['"]/g)]
        .map((match) => match[1])
        .filter((specifier) => !specifier.startsWith('node:'))
        .map((specifier) => `${file} imports ${specifier}`),
    );

  assert.deepEqual(external, [], 'and no source file imports anything but Node built-ins');
});

// --- The advertised list, before any database exists (Epic 49-01 Story 1: FR2, AD12) ------------

/** A tool that answers with one value, for the tests about *which list* was dispatched against. */
const stubTool = (name, answer) => ({
  name,
  description: name,
  inputSchema: { type: 'object', properties: {} },
  handler: () => answer,
});

test('the template-built tool list is the list a real file database builds', async (t) => {
  // The comparison that makes deferral safe. `mcp.js` declares `listChanged: false`, so the list
  // advertised at launch — built from a `:memory:` template, with no file anywhere — has to be the
  // list the real database would have produced. Compared over the whole wire form, because a
  // template that got the names right and the schemas wrong would advertise a contract the server
  // does not keep, and every client would be checked against it.
  const file = openDatabaseFile(t);
  const { db } = start(file.path);

  t.after(() => {
    try {
      db.close();
    } catch {
      // Already closed; the directory removal is `openDatabaseFile`'s.
    }
  });

  assert.deepEqual(compareToolLists(describedBy(spineTools(db)), describedBy(advertisedTools())), []);
});

test('the advertised list is non-empty and as long as the registry itself builds', (t) => {
  // The floor, and it is derived rather than typed. A template yielding two tools compares equal
  // to a real build that also yielded two, so the criterion above cannot catch a failure that
  // reached both sides — this is the third construction that can. `openPlanningDatabase` reaches
  // the registry by `applySchema` + `applyVocabulary` rather than through `start()`, and the count
  // comes off the list it builds. There is no number in this test.
  const planning = openPlanningDatabase(t);
  const registered = spineTools(planning);

  assert.ok(registered.length > 0, 'the registry the count comes from is not empty');
  assert.equal(advertisedTools().length, registered.length);

  // **And a second floor, because all three of those constructions run through `spineTools`.** A
  // registry that collapsed — the `document_kind` read yielding nothing, say — collapses every one
  // of them by the same amount, and the equality above goes green over three empty lists. This
  // bound comes off the seeded vocabulary instead: each kind carries create, read, update and
  // list tools, so the list cannot be shorter than four per seeded kind however the registry is
  // built. Still derived, still no transcribed number.
  const kinds = planning.prepare('SELECT count(*) AS kinds FROM document_kind').get().kinds;

  assert.ok(kinds > 0, 'the vocabulary the floor comes from is seeded');
  assert.ok(
    registered.length >= kinds * 4,
    `${registered.length} tools for ${kinds} document kinds is below four apiece`,
  );
});

test('tools/list describes the advertised list and tools/call resolves the live one', () => {
  // Deliberately disjoint. Sharing a name between the two would let a table wired to the wrong
  // list answer correctly, which is the failure this is written to find.
  const advertised = [stubTool('advertised_only', 'template')];
  const live = [stubTool('live_only', 'real')];

  const split = methods(advertised, () => live);

  assert.deepEqual(split['tools/list']().tools.map((each) => each.name), ['advertised_only']);
  assert.equal(split['tools/call']({ name: 'live_only' }).structuredContent, 'real');
  assert.throws(() => split['tools/call']({ name: 'advertised_only' }), /no such tool/);

  // The compatibility half: one argument, and both methods answer from that one list. This is what
  // leaves every existing `methods(tools)` call site unchanged.
  const unsplit = methods(advertised);

  assert.deepEqual(unsplit['tools/list']().tools.map((each) => each.name), ['advertised_only']);
  assert.equal(unsplit['tools/call']({ name: 'advertised_only' }).structuredContent, 'template');
});

test('the resolver is untouched until the first tools/call', () => {
  // The whole epic turns on this. A resolver called while the method table is built opens the
  // database at launch, and every assertion about the *result* still passes — AD12 rejected a lazy
  // getter on `context.db` for the same reason, since several tool modules destructure
  // `const { db } = context` at build time and would resolve it invisibly.
  let resolved = 0;
  const live = [stubTool('live_only', 'real')];

  const table = methods([], () => {
    resolved += 1;
    return live;
  });

  assert.equal(resolved, 0, 'building the table resolves nothing');

  table.initialize({});
  table.ping();
  table['tools/list']();

  assert.equal(resolved, 0, 'and neither does the handshake or the listing');

  table['tools/call']({ name: 'live_only' });

  assert.ok(resolved > 0, 'only the call reaches it');
});

test('the comparison must not pass on names alone', () => {
  // The planted control. Without it the comparison could be name-only and would read exactly like
  // a working one — the failure retro 40 recorded, where a check that found nothing anywhere let
  // every case pass by never being tested. The names are correct and complete here; only the
  // contract is gone.
  const real = describedBy(advertisedTools());
  const namesOnly = real.map((each) => ({ ...each, inputSchema: {} }));

  assert.deepEqual(compareToolLists(real, real), [], 'the control: the real list matches itself');

  const complaints = compareToolLists(real, namesOnly);

  assert.equal(complaints.length, real.length, 'every tool is complained about');
  assert.ok(complaints.every((line) => line.endsWith('inputSchema differs')));
});

// --- Creating nothing until asked (Epic 49-01 Story 2: FR1, NFR1) -------------------------------

/** A temp directory the child runs in, so the relative default database path lands inside it. */
const ownedDirectory = (t) => scratch(t, 'dpm-deferred-');

test('a session that never calls a tool creates nothing, and one that does create the database', async (t) => {
  const directory = ownedDirectory(t);

  const listed = await runNode([BIN], wire([HELLO, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]),
    NO_OVERRIDE, { cwd: directory });

  assert.equal(listed.code, 0, `the server exited ${listed.code}: ${listed.stderr}`);
  assert.deepEqual(readdirSync(directory), [], 'a session that called no tool left something on disk');
  assert.equal(listed.stderr, '', 'a clean spawned session says nothing on stderr');

  // **The must-NOT, and it is the reason the absence above means anything.** A server that crashed
  // before it reached the filesystem leaves an empty directory too. What distinguishes the two is
  // that this one served: a well-formed result, with more tools in it than a floor taken off the
  // registry rather than typed here.
  const served = repliesFrom(listed.stdout).find((reply) => reply.id === 2)?.result?.tools;
  const floor = spineTools(openPlanningDatabase(t)).length;

  assert.ok(floor > 0, 'the registry the floor comes from is not empty');
  assert.ok(Array.isArray(served), `stdout carried no tools/list result:\n${listed.stdout}`);
  assert.ok(served.length >= floor, `${served.length} tools served, below the registry's ${floor}`);
  assert.ok(served.every((tool) => tool.name && tool.inputSchema), 'a served tool was not well formed');

  // **The paired positive, in the same test and in the same directory.** Separated, a server that
  // died at startup passes the absence and this never runs; here the only thing that differs
  // between the two spawns is the message, so the file appearing is attributable to the call.
  const called = await runNode([BIN], wire([HELLO, call(2, 'list_spec')]),
    NO_OVERRIDE, { cwd: directory });

  assert.equal(called.code, 0, `the server exited ${called.code}: ${called.stderr}`);
  assert.equal(called.stderr, '', 'an ordinary create says nothing on stderr either');
  assert.equal(existsSync(join(directory, '.dpm', 'dpm.db')), true,
    'the first tool call did not bring the database into existence');
});

test('launch writes nothing, and a session migrates once however many requests arrive', async (t) => {
  const directory = ownedDirectory(t);
  const location = join(directory, '.dpm', 'dpm.db');

  const run = async (messages) => {
    const recorder = recordStarts();
    const output = sessionOutput();

    await main({
      input: Readable.from([wire(messages)]),
      output: output.stream,
      location,
      start: recorder.start,
    });

    return { locations: recorder.locations, replies: output.replies() };
  };

  const launch = await run([HELLO, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]);

  assert.deepEqual(launch.locations, [':memory:'], 'launch brought up something other than the template');
  assert.deepEqual(readdirSync(directory), [], 'launch performed a filesystem write');

  // Three calls, one bring-up of the file. Counted rather than timed: the question is whether the
  // migration ran once for the session or once for each request, and a duration answers neither.
  const worked = await run([HELLO, call(2, 'list_spec'), call(3, 'list_spec'), call(4, 'list_spec')]);

  assert.deepEqual(worked.locations, [':memory:', location],
    'the file was brought up other than exactly once');

  // The control: all three calls were answered. A resolver that threw on the second would leave
  // one bring-up in the record and satisfy the assertion above by failing.
  assert.deepEqual(
    worked.replies.filter((reply) => [2, 3, 4].includes(reply.id)).map((reply) => reply.error),
    [undefined, undefined, undefined],
  );
});

// --- The first call brings the database into existence (Epic 49-01 Story 3: FR3) ----------------

test('a first tool call answers normally, and leaves an ignored database behind', async (t) => {
  const directory = ownedDirectory(t);

  const session = await runNode([BIN], wire([HELLO, call(2, 'list_spec')]),
    NO_OVERRIDE, { cwd: directory });

  assert.equal(session.code, 0, `the server exited ${session.code}: ${session.stderr}`);

  // **The result first, because it is what "invisible to a caller" means.** A first call that
  // reported a missing database, or that succeeded with an `isError` payload explaining what it had
  // just had to create, would satisfy every file-existence assertion below. What FR3 asks is that
  // the caller cannot tell this call from the second one.
  const reply = repliesFrom(session.stdout).find((message) => message.id === 2);

  assert.ok(reply, `stdout carried no reply to the call:\n${session.stdout}`);
  assert.equal(reply.error, undefined, `the first call failed: ${JSON.stringify(reply.error)}`);
  assert.equal(reply.result?.isError, undefined, 'the first call returned a tool error');
  assert.ok(reply.result?.content?.length > 0, 'the first call returned an empty result');

  // Both files, and the ignore one read back rather than merely counted: an empty `.gitignore`
  // exists just as convincingly as one that ignores anything.
  assert.equal(existsSync(join(directory, '.dpm', 'dpm.db')), true,
    'the first tool call did not bring the database into existence');
  assert.equal(readFileSync(join(directory, '.dpm', IGNORE_FILE), 'utf8'), `${IGNORE_PATTERN}\n`);
});

test('the ignore file is written before the database is opened', async (t) => {
  const directory = ownedDirectory(t);
  const location = join(directory, '.dpm', 'dpm.db');
  const recorder = recordOpen();

  open(location, recorder);

  // The ordering, which is the whole of AD15: a database that exists unignored even for the moment
  // between the two writes can be staged by a `git add -A` landing in that window. The restore
  // (49-02, FR6) sits between them and declines — there is no dump in this directory — which is
  // the case that has to stay silent for AD15's window to be the one asserted here.
  assert.deepEqual(recorder.events, ['ignore', 'restore:skipped', `start:${location}`]);

  // The control, and it is what stops the assertion above from being satisfied by an `open()` that
  // did neither: both seams delegated to the real thing, so both files are on disk afterwards.
  assert.deepEqual(readdirSync(join(directory, '.dpm')).sort(), [IGNORE_FILE, 'dpm.db']);

  // **An ignore file already there is left exactly as it was** (AD15, ENVX2 — a user who has edited
  // theirs has said something). Recorded through the same seam, so a second session's order is
  // observed rather than assumed: the write is skipped, the bring-up still happens.
  const second = recordOpen();

  writeFileSync(join(directory, '.dpm', IGNORE_FILE), 'dpm.db*\n!keep-this\n', 'utf8');
  open(location, second);

  assert.deepEqual(second.events, ['ignore', 'restore:skipped', `start:${location}`]);
  assert.equal(readFileSync(join(directory, '.dpm', IGNORE_FILE), 'utf8'), 'dpm.db*\n!keep-this\n',
    'a second open rewrote an ignore file the user owns');
});

// --- The version-ahead gate, decided at first open (Epic 49-01 Story 5: FR5, NFR3) ---------------

const FUTURE = 999;

/**
 * A database with one spec in it, stamped with a version no server understands, and **closed**.
 *
 * **Deliberately not `naming.test.js`'s `fromTheFuture`, which is otherwise nearly identical.**
 * That one hands back an open connection, because its subject is what `readOnlyTools` does to a
 * table built against it. Here the file being closed *is* the point: the criterion is about a
 * database the server opens lazily for itself, and a fixture holding a handle would be supplying
 * the one thing the story exists to defer. Sharing would mean a flag deciding whether the thing
 * under test has already happened.
 *
 * @returns {{path: string, spec: object, supported: number}}
 */
function aheadDatabase(t) {
  const file = openDatabaseFile(t);
  const { db, migrated } = start(file.path);
  const handlers = Object.fromEntries(spineTools(db).map((tool) => [tool.name, tool.handler]));
  const spec = handlers.create_spec({ slug: 'history', title: 'Planning history' });

  db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
    .run(FUTURE, '2027-01-01T00:00:00Z');
  db.close();

  return { path: file.path, spec, supported: migrated.target };
}

test('an ahead database, opened lazily, answers reads and refuses writes by name', async (t) => {
  const ahead = aheadDatabase(t);

  const session = await runNode([BIN],
    wire([HELLO,
      { jsonrpc: '2.0', id: 2, method: 'tools/call',
        params: { name: 'create_spec', arguments: { slug: 'new', title: 'New' } } },
      call(3, 'list_spec')]),
    { DPM_DATABASE: ahead.path });

  // **Served, not refused to start.** NFR7's clause is that a user is not locked out of their own
  // planning history, and the outcome it rules out is a server that will not come up at all.
  assert.equal(session.code, 0, `the server exited ${session.code}: ${session.stderr}`);

  const replies = new Map(repliesFrom(session.stdout).map((reply) => [reply.id, reply]));

  // The write, refused with the existing two-version message — both numbers, because a refusal
  // naming only one of them tells a caller nothing about which side has to move.
  // Read out of `data`, not `message`: `rpc.js` keeps `message` as the code's standard text and
  // puts the detail a caller can act on in `data`, so a test matching on `message` would be
  // asserting against the string "Invalid params" and would pass for any refusal at all.
  const refused = replies.get(2);

  assert.ok(refused?.error, `the write was not refused:\n${session.stdout}`);
  assert.equal(refused.error.code, -32602);
  assert.match(JSON.stringify(refused.error.data), new RegExp(`\\b${FUTURE}\\b`),
    'the refusal does not name the version the database is at');
  assert.match(JSON.stringify(refused.error.data), new RegExp(`\\b${ahead.supported}\\b`),
    'the refusal does not name what this server understands');

  // The read, answered — and answering with the row that was there before the stamp, so this is
  // the history NFR7 is about rather than an empty database that refuses nothing.
  const read = replies.get(3);

  assert.equal(read?.error, undefined, `a read was refused: ${JSON.stringify(read?.error)}`);
  assert.ok(JSON.stringify(read.result).includes('Planning history'),
    `the read did not return the spec that was there:\n${JSON.stringify(read.result)}`);

  // And the skew is said out loud once, on stderr, where a diagnostic belongs. Without this a
  // caller's only clue is a refusal they have to trigger.
  assert.match(session.stderr, new RegExp(`${FUTURE}[\\s\\S]*${ahead.supported}`),
    `the version skew was not reported:\n${session.stderr}`);
});

/**
 * The database's *content*, hashed — every object and every row, through the dump.
 *
 * **Not the file's bytes, and the difference is a finding rather than a convenience.** `migrate()`
 * calls `createRetirementGuards()` on every open, which drops and recreates twenty-four triggers by
 * design — its own comment says recreating an identical trigger is the ordinary case. So the file
 * hash differs after *any* open, including two consecutive ones, and a criterion pinned to it would
 * be asserting against pre-existing migration behaviour this epic does not touch. NFR3's clause is
 * "no migration beyond what `migrate()` already does", and the guard regeneration is what it
 * already does. What NFR3 is protecting is the data, and this is the hash that watches it.
 */
const contentDigest = (path) => {
  const db = new DatabaseSync(path);

  try {
    return sha256(dump(db).sql);
  } finally {
    db.close();
  }
};

test('an existing database is unchanged by a read-only lazy session [NFR3]', async (t) => {
  const file = openDatabaseFile(t);
  const { db } = start(file.path);
  const handlers = Object.fromEntries(spineTools(db).map((tool) => [tool.name, tool.handler]));
  const spec = handlers.create_spec({ slug: 'existing', title: 'Already here' });

  db.close();

  const before = contentDigest(file.path);

  const session = await runNode([BIN], wire([HELLO, call(2, 'list_spec'), call(3, 'check_integrity')]),
    { DPM_DATABASE: file.path });

  assert.equal(session.code, 0, `the server exited ${session.code}: ${session.stderr}`);

  // **The reads first, because they are what stops the hash from being satisfied by a session that
  // never opened the file.** NFR3 asks that an existing database opens and serves exactly as today,
  // and a server that failed to find it would leave the bytes just as identical.
  const replies = new Map(repliesFrom(session.stdout).map((reply) => [reply.id, reply]));

  assert.equal(replies.get(2)?.error, undefined, `the list was refused: ${JSON.stringify(replies.get(2))}`);
  assert.ok(JSON.stringify(replies.get(2).result).includes(spec.id),
    'the session did not read back the spec that was already there');
  assert.equal(replies.get(3)?.error, undefined, 'check_integrity was refused');

  // No rebuild, no re-seed, no migration: the content is byte-identical. Hashed over the whole
  // dump rather than compared table by table, because "no rebuild" is a claim about everything.
  assert.equal(contentDigest(file.path), before, 'a read-only session changed the database');

  // **And the two ways an open writes without changing content, stated separately.** A dump hash
  // that held while a migration ran or the vocabulary was re-seeded would mean the writes happened
  // to be idempotent, not that they did not happen — and NFR3's clause is about the second.
  const reopened = start(file.path);

  t.after(() => reopened.db.close());

  assert.deepEqual(reopened.migrated.applied, [], 'a migration ran against an up-to-date database');
  assert.deepEqual(
    Object.values(reopened.vocabulary.inserted).map((table) => table.inserted),
    Object.values(reopened.vocabulary.inserted).map(() => 0),
    'the vocabulary was re-seeded into a database that already had it',
  );
});

test('an ahead database keeps its write tools listed, and they refuse [unit]', (t) => {
  const ahead = aheadDatabase(t);

  const table = open(ahead.path);
  const advertised = advertisedTools();

  // **Listed, not withheld** — the must-NOT, and it is what keeps `listChanged: false` honest for
  // an ahead database. `tools/list` describes the template, which is never made read-only; if the
  // live table dropped its write tools, what was advertised at launch would be false for the rest
  // of the session, which is the failure Story 1 exists to prevent arriving by another route.
  assert.deepEqual(table.map((tool) => tool.name), advertised.map((tool) => tool.name));

  // Every write refuses, and a read still answers. Both halves, because a table that refused
  // everything and one that refused nothing each pass one of them alone.
  const writes = table.filter((tool) => tool.mutates);

  assert.ok(writes.length > 0, 'the table has no write tools, so refusing them proves nothing');

  for (const tool of writes) {
    assert.throws(() => tool.handler({}), new RegExp(`\\b${FUTURE}\\b`), `${tool.name} was not refused`);
  }

  const list = table.find((tool) => tool.name === 'list_spec');

  assert.equal(list.handler({}).returned, 1, 'a read tool was refused along with the writes');
});

// --- The pieces, directly -----------------------------------------------------------------------

test('protocol negotiation echoes a version it knows and offers its own otherwise', () => {
  for (const version of SUPPORTED_PROTOCOLS) {
    assert.equal(negotiate(version), version, 'a supported version is echoed, not overridden');
  }

  assert.equal(negotiate('1999-01-01'), PREFERRED_PROTOCOL);
  assert.equal(negotiate(undefined), PREFERRED_PROTOCOL);
  assert.equal(SUPPORTED_PROTOCOLS[0], PREFERRED_PROTOCOL, 'the preferred one is the newest');
});

test('the version the handshake announces is the version the manifest states', () => {
  // **The assertion that was missing for three releases.** `SERVER_INFO.version` was the literal
  // `'0.1.0'` while `package.json` said `0.4.0`, and no test in the suite read the two together —
  // the end-to-end handshake test above checks the name and the schema version and steps over the
  // version between them. A value nothing compares is a value that drifts, and this is the compare.
  assert.equal(SERVER_INFO.name, 'dpm');
  assert.equal(SERVER_INFO.version, packageManifest().version,
    'the server announces a version its own manifest does not state');

  // And it is a real one, so a manifest that lost its `version` cannot satisfy the line above by
  // making both sides the fallback.
  assert.notEqual(SERVER_INFO.version, UNKNOWN_VERSION);
  assert.match(SERVER_INFO.version, /^\d+\.\d+\.\d+/, 'the manifest states something that is not a version');

  // **The unreadable-manifest branch**, which is reachable in production and would otherwise be a
  // fallback nothing exercises. `pluginVersion` answers `null` for a manifest that is missing,
  // unparseable, or silent about its version, and a handshake has to answer with something.
  assert.equal(serverIdentity(null).version, UNKNOWN_VERSION);
  assert.equal(serverIdentity(null).name, 'dpm', 'the name is not conditional on the version');
  assert.equal(serverIdentity('9.9.9').version, '9.9.9', 'a version given is a version announced');
});

test('a message split across chunk boundaries is parsed once and whole', () => {
  // A pipe delivers bytes, not lines. This is the failure that shows up only under load, as a
  // parse error on a message that was never malformed.
  const whole = '{"jsonrpc":"2.0","id":1,"method":"ping"}';

  const first = takeLines(whole.slice(0, 12));
  assert.deepEqual(first.lines, [], 'no complete line yet');
  assert.equal(first.rest, whole.slice(0, 12), 'and the fragment is kept');

  const second = takeLines(first.rest + `${whole.slice(12)}\n{"partial":`);
  assert.deepEqual(second.lines, [whole]);
  assert.equal(second.rest, '{"partial":', 'the next fragment carries over');
});

test('a malformed but parseable message is an Invalid Request, not a crash', () => {
  const table = methods([]);

  for (const message of [null, 42, [], {}, { jsonrpc: '1.0', method: 'ping' }, { jsonrpc: '2.0' }]) {
    const reply = dispatch(message, table);

    if (reply === null) continue;
    assert.equal(reply.error.code, -32600, JSON.stringify(message));
  }
});

test('the SQLite experimental warning is dropped and every other warning survives', () => {
  const written = [];
  const fake = { removeAllListeners() {}, on() {} };
  const listener = filterWarnings(fake, { write: (line) => written.push(line) });

  const experimental = Object.assign(new Error('SQLite is an experimental feature'), {
    name: 'ExperimentalWarning',
  });
  assert.ok(isSqliteExperimental(experimental));

  listener(experimental);
  assert.deepEqual(written, [], 'the one warning AD5 knowingly accepts is not shown');

  // The control, and the reason this is a filter rather than NODE_NO_WARNINGS: a deprecation is
  // the early notice for AD5's stated risk that this API may change between minors.
  listener(Object.assign(new Error('x is deprecated'), { name: 'DeprecationWarning' }));
  listener(Object.assign(new Error('some other experiment'), { name: 'ExperimentalWarning' }));

  assert.deepEqual(written, [
    '[dpm] DeprecationWarning: x is deprecated\n',
    '[dpm] ExperimentalWarning: some other experiment\n',
  ]);
});
