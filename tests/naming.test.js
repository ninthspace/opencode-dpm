/**
 * Story 5 — names a person can search for, tables nothing hides, and a database from the future.
 *
 * NFR5's rule is checked against the live schema and never against a list kept beside it, which
 * is the whole reason it is worth having: a permitted-abbreviations list is one more hand-kept
 * vocabulary of exactly the kind this spec exists to remove, and it would grow an entry every
 * time a name failed it.
 *
 * **NFR7's clause is the one with a real failure behind it.** "A user whose server will not start
 * is not locked out of their own planning history" describes a plugin downgrade, a shared
 * checkout, or two projects on different releases — and the damaging outcome is not the refusal
 * to start, which is loud, but the silent alternative: an older server finding nothing pending,
 * carrying on, and rewriting a newer database's derived triggers and vocabulary to match a schema
 * it can only see part of. So the assertions below come in pairs — reads answer, writes refuse,
 * and neither of the two write steps in `start` runs at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { openDatabaseFile } from './support/database.js';
import { authoredTables } from './support/introspection.js';
import { readOnlyTools, spineTools, versionSkew } from '../src/tools/index.ts';
import { REFERENCE_FIELD } from '../src/tools/convention.ts';
import { start } from '../src/start.ts';
import { targetVersion } from '../src/schema/migrate.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(ROOT, 'bin', 'dpm-mcp.ts');

/** A version no release will reach, so "ahead" is unambiguous. */
const FUTURE = 999;

function refused(run, message) {
  let caught;
  try {
    run();
  } catch (error) {
    caught = error;
  }

  assert.ok(caught, message ?? 'the call was accepted when it should have been refused');
  return caught;
}

/**
 * Every word the live schema holds: its table names, every column of every table, and the seeded
 * document kinds. Read here rather than declared, which is the criterion's own requirement.
 */
function vocabulary(db) {
  // `authoredTables` and not every row of `sqlite_schema`: an FTS5 index and its shadow storage
  // are not tables a tool is *named for*. A tool declaring one is spanning the schema rather than
  // acting on an entity type, which is the exemption below, and its columns — `rank`, `rowid` —
  // are not words anything should be called after.
  const tables = authoredTables(db);
  const columns = tables.flatMap((table) =>
    db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
  const kinds = db.prepare('SELECT kind FROM document_kind').all().map((row) => row.kind);

  // **And the fields dpm returns that are not columns of anything.** Until epic 03-01 there were
  // none, so reading the schema was the whole vocabulary; that epic put `reference` on every
  // document row a list or read tool hands back, deriving it rather than storing it (ENVX4 forbids
  // a migration for it). NFR5's rule is that a tool name is a whole word rather than an
  // abbreviation, and `resolve_reference` is named for a word every caller of this server already
  // sees — so the rule admits it and only this reading did not. Imported from where the field is
  // produced, so a second one arrives here by being produced rather than by anyone editing a list.
  return {
    tables: new Set(tables),
    words: new Set([...tables, ...columns, ...kinds, REFERENCE_FIELD]),
  };
}

/** The part of a tool name after `<verb>_`. */
const subject = (name) => name.split('_').slice(1).join('_');

/** NFR5's shape rule, and the whole of it — every part a whole word of three letters or more. */
const SHAPE = /^[a-z]{3,}(_[a-z]{3,})*$/;

// --- Criterion 1: names built from the schema's own words ----------------------------------------

test('every tool name is a searchable word built from the live schema', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { tables, words } = vocabulary(db);

  assert.ok(words.size > 100, 'the vocabulary was not actually read out of the schema');
  assert.ok(tools.length > 30, 'and there was a registry to check it against');

  const unmatched = [];

  for (const tool of tools) {
    assert.match(tool.name, SHAPE, `${tool.name} is not a searchable dpm tool name`);

    // FR29's half of the rule. The harness dispatches `mcp__plugin_dpm_dpm__create_spec` and supplies the
    // `mcp__plugin_dpm_dpm__` itself, so a `dpm` part in the export is the server's identity said twice. This
    // is asserted rather than merely not required, because the prefix was there for five epics and
    // the shape rule above admits it back without complaint.
    assert.ok(!tool.name.split('_').includes('dpm'),
      `${tool.name} carries the server's own identity — the harness already prefixes it`);

    // A tool whose declared table is not one of the live tables is not acting on a table, it is
    // spanning the schema — and there is no schema word for that, which is a gap in the rule
    // rather than in the tool. The exemption is derived from what the tool declares and checked
    // against the live table list, so it is not the hand-kept list the criterion forbids.
    if (!tables.has(tool.table)) continue;

    if (!words.has(subject(tool.name))) unmatched.push(tool.name);
  }

  assert.deepEqual(unmatched, [], 'a tool is named for something the schema does not hold');

  // The tools taking the exemption are named, one line each. A fourth one appearing here is a
  // decision, not a detail — the exemption is meant to cover tools that sweep everything, and all
  // three do: `check_integrity` reads `sqlite_schema`, `search` reads two FTS indexes covering six
  // tables between them, and `publish` renders every document there is. None is named for an
  // entity type because none has one.
  //
  // `publish` is the first to take the exemption while declaring `mutates: true`, and the
  // combination is deliberate rather than an oversight in the rule: what it writes is a working
  // tree, so it belongs to no table in the direction the rule reaches. Its module records why the
  // declaration is what it is.
  assert.deepEqual(
    tools.filter((tool) => !tables.has(tool.table)).map((tool) => tool.name).sort(),
    ['check_integrity', 'publish', 'search'],
  );

  // The control: the vocabulary is not so wide that any name passes. Three plausible names built
  // from words the schema does not hold — an abbreviation and two invented nouns — are rejected
  // by the same lookup that accepted all the real ones.
  assert.deepEqual(
    ['create_ce', 'read_thing', 'list_stuff'].filter((name) => words.has(subject(name))),
    [],
  );

  // And the shape rule refuses what NFR5 names as the failure it exists to prevent — a name too
  // short to search for — while admitting `search`, whose single part is a whole word. Requiring
  // two parts would fail a name the requirement has no complaint about.
  assert.doesNotMatch('ce', SHAPE);
  assert.doesNotMatch('a_b', SHAPE);
  assert.match('search', SHAPE);

  // The mutation FR29 exists to catch, driven rather than described: the pre-rename name passes
  // the shape rule and is refused only by the identity check above.
  assert.match('dpm_create_spec', SHAPE);
  assert.ok('dpm_create_spec'.split('_').includes('dpm'));
});

// --- Criterion 2: nothing written is unreadable ---------------------------------------------------

test('every table a registered tool writes is reachable through a read tool', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  const readable = new Set(tools.filter((tool) => !tool.mutates).flatMap((tool) => tool.reads));
  const written = new Set(tools.filter((tool) => tool.mutates).flatMap((tool) => tool.reads));

  assert.ok(written.size > 0 && readable.size > 0, 'the registry declared neither side');

  // The closable half of NFR7, in both directions: nothing this server can write is unreadable
  // through a tool, and nothing it declares readable is absent from the schema.
  assert.deepEqual([...written].filter((table) => !readable.has(table)).sort(), [],
    'a tool writes a table no read tool can return');

  const live = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all()
    .map((row) => row.name));

  assert.deepEqual([...readable].filter((table) => !live.has(table) && table !== 'sqlite_schema'),
    [], 'a read tool declares a table the schema does not have');

  // **The rest of the schema is named, not excluded.** NFR7's promise is over every table, and
  // this epic tools ten of them — the remaining twenty-nine are Epic 47-05's, whose Story 1 reads the
  // same list from `sqlite_master` and fails on any member without a tool. Reporting them here
  // keeps the gap visible from this epic rather than making it look closed.
  const untooled = [...live].filter((table) => !readable.has(table)).sort();

  t.diagnostic(`${untooled.length} of ${live.size} tables have no read tool yet (Epic 47-05): `
    + untooled.join(', '));

  // What is assertable now: none of the untooled tables is one a registered tool touches. A tool
  // arriving for a table without a read tool beside it fails here rather than in 47-05.
  assert.deepEqual(untooled.filter((table) => tools.some((tool) => tool.table === table)), []);
});

// --- Criterion 3: a database from a newer plugin ---------------------------------------------------

/** A current database with one spec in it, then stamped with a version no server understands. */
function fromTheFuture(t) {
  const file = openDatabaseFile(t);
  const first = start(file.path);
  const create = spineTools(first.db).find((tool) => tool.name === 'create_spec');
  const spec = create.handler({ slug: 'history', title: 'Planning history' });

  first.db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
    .run(FUTURE, '2027-01-01T00:00:00Z');
  first.db.close();

  return { file, spec };
}

test('a database whose version is ahead is opened rather than refused', (t) => {
  const { file, spec } = fromTheFuture(t);

  const again = start(file.path);
  t.after(() => again.db.close());

  assert.equal(again.ahead, true, 'the skew was not noticed');
  assert.equal(again.migrated.from, FUTURE);
  assert.equal(again.migrated.target, targetVersion());

  // Neither write step ran. These are the two ways an older release damages a newer database
  // while believing it did nothing: seeding into vocabulary tables whose shape may have changed,
  // and regenerating triggers derived from a schema it can only see part of.
  assert.deepEqual(again.migrated.applied, []);
  assert.deepEqual(again.migrated.guards, []);
  assert.ok(again.vocabulary.skipped, 'the vocabulary was applied to a schema from the future');

  // And the history is still there, which is the whole of what NFR7 asks for.
  const tools = readOnlyTools(spineTools(again.db),
    { reason: versionSkew({ found: again.migrated.from, supported: again.migrated.target }) });
  const call = handlers(tools);

  assert.equal(call.read_spec({ id: spec.id }).title, 'Planning history');
  assert.equal(call.list_spec({}).returned, 1);
  assert.equal(call.check_integrity({}).ok, true);
});

test('the writes are refused by name, and the tools stay listed', (t) => {
  const { file } = fromTheFuture(t);

  const again = start(file.path);
  t.after(() => again.db.close());

  const full = spineTools(again.db);
  const tools = readOnlyTools(full,
    { reason: versionSkew({ found: FUTURE, supported: again.migrated.target }) });
  const call = handlers(tools);

  // Listed, not withheld. A withheld tool answers Method not found, which reads as a broken
  // server or a renamed tool and says nothing about a version skew.
  assert.deepEqual(tools.map((tool) => tool.name), full.map((tool) => tool.name));

  const error = refused(() => call.create_spec({ slug: 'x', title: 'X' }));

  assert.match(error.message, new RegExp(`${FUTURE}`), 'the refusal does not name the database');
  assert.match(error.message, new RegExp(`${again.migrated.target}`),
    'the refusal does not name what this server understands');
  assert.equal(error.rpc.code, -32602);

  // Every one of them, and every read still answering — a pair, because refusing everything and
  // refusing nothing both pass one half of this on their own.
  let refusals = 0;

  for (const tool of tools.filter((one) => one.mutates)) {
    refused(() => call[tool.name]({}), `${tool.name} was not refused`);
    refusals += 1;
  }

  assert.ok(refusals >= 17, `only ${refusals} write tools were swept`);
  assert.equal(call.list_epic({}).returned, 0, 'a read tool was refused along with the writes');

  // The control: the same registry against a current database writes perfectly well.
  const current = openPlanningDatabase(t);
  assert.ok(spineTools(current).find((tool) => tool.name === 'create_spec')
    .handler({ slug: 'now', title: 'Now' }).id);
});

test('the real server starts on a database from the future and answers a read', async (t) => {
  const { file, spec } = fromTheFuture(t);

  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'read_spec', arguments: { id: spec.id } } },
    { jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'update_spec', arguments: { id: spec.id, title: 'Rewritten' } } },
  ].map((message) => JSON.stringify(message)).join('\n');

  const { code, stdout, stderr } = await runNode([BIN], `${messages}\n`,
    { DPM_DATABASE: file.path });

  assert.equal(code, 0, 'the server refused to start on a database it did not understand');

  const replies = stdout.trim().split('\n').map((line) => JSON.parse(line));

  assert.equal(replies[1].result.structuredContent.title, 'Planning history');
  assert.equal(replies[2].error.code, -32602);

  // `message` stays the code's standard text and `data` carries the detail — the division
  // `rpc.js` draws deliberately, and the reason a refusal is legible to a real client at all.
  assert.match(replies[2].error.data.message, /schema version/);

  // The one line a launch is allowed to print, and it goes to stderr where NFR3 requires it.
  assert.match(stderr, /ahead of this server/);

  // And the refused update did not happen.
  const after = start(file.path);
  t.after(() => after.db.close());
  assert.equal(
    spineTools(after.db).find((tool) => tool.name === 'read_spec').handler({ id: spec.id }).title,
    'Planning history',
  );
});

function runNode(args, input = '', env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));

    child.stdin.end(input);
  });
}
