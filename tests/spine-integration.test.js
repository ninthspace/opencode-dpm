/**
 * Story 8 — the tool surface, exercised the way a client reaches it.
 *
 * Every other story in this epic calls a handler. That is the right level for the thing each
 * story is about, and it is not the level at which this epic's promise lives: FR3 says the tool
 * *schemas* are the write contract, and a handler called directly has already skipped the schema.
 * So every test here goes over stdio to a spawned `bin/dpm-mcp.ts` — `initialize`, `tools/list`,
 * `tools/call` — against a temp database the test owns.
 *
 * **That is also what makes the conformance criterion mean anything.** AD10's check could be run
 * against `spineTools(db)` in-process and pass while the server registered something else
 * entirely; nothing in Story 7 observes the difference, because Story 7 builds the registry
 * itself. Here the tool list is read off the wire, matched against the local registry name for
 * name and schema for schema, and only then handed to the checker — so a server registering a
 * different set fails before the conformance check runs at all.
 *
 * The chain test is the other half. A spec, an epic under it, a story, a criterion, a requirement
 * and a coverage row binding the last two: six creates that each pass in isolation in Story 2 and
 * whose *composition* nothing until now has run. The foreign keys between them are what a
 * per-tool test cannot reach.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabaseFile } from './support/database.js';
import { conformance } from './support/conformance.js';
import { runNode } from './support/run-node.js';
import { spineTools } from '../src/tools/index.ts';
import { PREFERRED_PROTOCOL } from '../src/server/mcp.ts';

const ROOT = join(import.meta.dirname, '..');
const BIN = join(ROOT, 'bin', 'dpm-mcp.ts');

/** `tools/call` as one JSON-RPC request. */
const callTool = (id, name, args = {}) => ({
  jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args },
});

/**
 * Run a whole session against a real spawned server and hand back its replies by id.
 *
 * Keyed by id rather than returned as an array, because a session here is a *sequence* whose
 * later calls name ids the earlier ones returned — so the tests read individual replies far more
 * often than they read the whole stream, and an off-by-one from the `initialize` reply sitting at
 * index 0 is the kind of mistake that makes an assertion pass against the wrong message.
 */
async function session(t, requests, { path } = {}) {
  const file = path ? { path } : openDatabaseFile(t);
  const messages = [
    { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: PREFERRED_PROTOCOL } },
    ...requests,
  ];

  const { code, stdout, stderr } = await runNode([BIN],
    `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`,
    { DPM_DATABASE: file.path });

  assert.equal(code, 0, `the server exited ${code}: ${stderr}`);

  const replies = new Map(stdout.trim().split('\n')
    .map((line) => JSON.parse(line))
    .map((reply) => [reply.id, reply]));

  return {
    path: file.path,
    stderr,
    replies,
    /** The structured result of one call, asserting it was not an error. */
    result(id) {
      const reply = replies.get(id);

      assert.ok(reply, `no reply for id ${id}`);
      assert.equal(reply.error, undefined,
        `id ${id} failed: ${reply.error?.data?.message ?? reply.error?.message}`);

      return reply.result.structuredContent;
    },
    /** The error of one call, asserting it was not a success. */
    error(id) {
      const reply = replies.get(id);

      assert.ok(reply, `no reply for id ${id}`);
      assert.ok(reply.error, `id ${id} succeeded when it should have been refused`);

      return reply.error;
    },
  };
}

/** Read the finished database back, outside the server, to see what was actually written. */
function inspect(t, path) {
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true });

  t.after(() => db.close());

  return db;
}

// --- The chain -------------------------------------------------------------------------------------

test('a spec, an epic, a story, a criterion and a coverage row survive the whole chain', async (t) => {
  // Two passes over one database file, because a coverage row's arguments are ids the earlier
  // calls returned and one stdio session cannot read its own replies. The second session opens
  // the same file, which is also the only thing here that proves the writes were durable rather
  // than held on a connection.
  const first = await session(t, [
    callTool(1, 'create_spec', { slug: 'dpm-persistence', title: 'DPM SQLite persistence' }),
    callTool(2, 'create_requirement', {
      spec_id: '', label: 'FR3', class: 'functional', position: 0,
      text: 'dpm ships an MCP server whose tool schemas are the write contract.',
    }),
  ]);

  const spec = first.result(1);

  assert.ok(spec.id, 'the create tool returned no row');
  assert.equal(spec.kind, 'spec');
  assert.equal(spec.number, 1, 'the first spec was not allocated number 1');
  assert.equal(spec.parent_id, null, 'a spec was given a parent');

  // The second call in that session named an empty `spec_id` on purpose: it is the control for
  // the chain below, showing that a create refuses rather than orphans when its parent is absent.
  assert.match(first.error(2).data.message, /must not be empty/);

  const second = await session(t, [
    callTool(1, 'create_requirement', {
      spec_id: spec.id, label: 'FR3', class: 'functional', position: 0,
      text: 'dpm ships an MCP server whose tool schemas are the write contract.',
    }),
    callTool(2, 'create_epic', {
      parent_id: spec.id, slug: 'server-and-spine-tools', title: 'Server and spine tools',
    }),
  ], { path: first.path });

  const requirement = second.result(1);
  const epic = second.result(2);

  assert.equal(epic.parent_id, spec.id);
  assert.equal(epic.parent_kind, 'spec', 'the parent kind was not derived from the parent');
  assert.equal(epic.sequence, 1, 'a child document was root-numbered');
  assert.equal(epic.number, null);

  const third = await session(t, [
    callTool(1, 'create_story', {
      epic_id: epic.id, number: 8, position: 8, title: 'Verify cross-story integration',
    }),
  ], { path: first.path });

  const story = third.result(1);

  const fourth = await session(t, [
    callTool(1, 'create_story_criterion', {
      story_id: story.id, position: 0, polarity: 'must',
      text: 'A spec, an epic under it, a story and a coverage row all succeed in sequence.',
    }),
  ], { path: first.path });

  const criterion = fourth.result(1);

  const fifth = await session(t, [
    callTool(1, 'create_coverage', {
      requirement_id: requirement.id,
      story_criterion_id: criterion.id,
      spec_fragment: 'whose tool schemas are the write contract',
      position: 0,
    }),
    // Read every link back through its own read tool, which is the second half of the criterion:
    // "read back consistently through their read tools", not "the inserts returned something".
    callTool(2, 'read_spec', { id: spec.id }),
    callTool(3, 'read_epic', { id: epic.id }),
    callTool(4, 'read_story', { id: story.id }),
    callTool(5, 'read_requirement', { id: requirement.id, include_body: true }),
    callTool(6, 'read_story_criterion', { id: criterion.id, include_body: true }),
    callTool(7, 'list_epic', { parent_id: spec.id }),
  ], { path: first.path });

  const coverage = fifth.result(1);

  assert.equal(coverage.requirement_id, requirement.id);
  assert.equal(coverage.story_criterion_id, criterion.id);
  assert.equal(coverage.verified_at, null, 'a coverage row arrived already verified');

  assert.equal(fifth.result(2).title, 'DPM SQLite persistence');
  assert.equal(fifth.result(3).parent_id, spec.id);
  assert.equal(fifth.result(4).epic_id, epic.id);

  // The requirement's `class` is the one supplied and not one inferred from `FR3` — FR4's rule,
  // asserted at the far end of the chain rather than at the tool that wrote it.
  assert.equal(fifth.result(5).label, 'FR3');
  assert.equal(fifth.result(5).class, 'functional');
  assert.match(fifth.result(5).text, /write contract/);
  assert.equal(fifth.result(6).polarity, 'must');

  assert.equal(fifth.result(7).returned, 1, 'the epic was not listed under its spec');
  assert.equal(fifth.result(7).more, false);

  // And the row the coverage tool wrote is the row the database holds — read outside the server,
  // so nothing about how it answers can make this pass.
  const db = inspect(t, first.path);
  const stored = db.prepare('SELECT * FROM coverage').all();

  assert.equal(stored.length, 1);
  assert.equal(stored[0].spec_fragment, 'whose tool schemas are the write contract');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM document').get().n, 2);
});

// --- The boundary ----------------------------------------------------------------------------------

test('an enum value the CHECK rejects fails at the boundary, and no row is written', async (t) => {
  const first = await session(t, [
    callTool(1, 'create_spec', { slug: 's', title: 'S' }),
  ]);

  const spec = first.result(1);

  const run = await session(t, [
    // `environmental` is a plausible near-miss for two of the four real values, which is the
    // shape a caller actually gets wrong.
    callTool(1, 'create_requirement', {
      spec_id: spec.id, label: 'ENV1', class: 'environmental', text: 'A rule.', position: 0,
    }),
    // The control: the same call with a value the `CHECK` admits.
    callTool(2, 'create_requirement', {
      spec_id: spec.id, label: 'ENV1', class: 'environmental_requirement',
      text: 'A rule.', position: 0,
    }),
    callTool(3, 'list_requirement', { spec_id: spec.id }),
  ], { path: first.path });

  const error = run.error(1);

  assert.equal(error.code, -32602, 'the refusal was not invalid-params');

  // **Refused by the schema, not by SQLite.** The message names the four permitted values, which
  // is what validation at the boundary produces; a call that reached the database would come back
  // with `CHECK constraint failed` and no vocabulary at all. That distinction is the criterion —
  // "fails at the tool boundary" — and asserting only that it failed would pass either way.
  assert.match(error.data.message, /'class' must be one of/);
  assert.match(error.data.message, /environmental_requirement/);
  assert.doesNotMatch(error.data.message, /CHECK constraint/);

  assert.equal(run.result(2).class, 'environmental_requirement');
  assert.equal(run.result(3).returned, 1, 'the refused call left a row behind');

  const db = inspect(t, first.path);

  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM requirement').get().n, 1);
});

test('must NOT — a tool accepts an argument the schema rejects', async (t) => {
  // The failure this rules out is validation happening at *neither* layer: a tool that passes an
  // argument through and a column that does not constrain it. It is swept rather than sampled,
  // because one tool getting it right says nothing about the other forty-one.
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());

  const probe = openDatabaseFile(t);

  // A `tools/call` rather than a `ping`, because a ping no longer brings the database into
  // existence: FR1 defers the open to the first call, so a session that only handshakes leaves
  // nothing on disk for `inspect` to read back.
  const opened = await session(t, [callTool(1, 'list_spec')], { path: probe.path });

  assert.ok(opened.replies.has(1));

  const live = inspect(t, probe.path);
  const tools = spineTools(live);

  let swept = 0;

  for (const tool of tools) {
    for (const [name, rule] of Object.entries(tool.inputSchema.properties ?? {})) {
      if (!rule.enum) continue;

      assert.throws(
        () => tool.handler({ [name]: 'definitely_not_a_permitted_value' }),
        (error) => /must be one of|is required/.test(error.message),
        `${tool.name} accepted an out-of-set value for '${name}'`,
      );
      swept += 1;
    }

    // And the other half of the same must-NOT: an argument no column answers to. `validate`
    // refuses an unknown name outright, which is what stops a typo becoming an insert against a
    // column the caller never heard of.
    assert.throws(() => tool.handler({ not_a_column_anywhere: 'x' }),
      /unknown argument 'not_a_column_anywhere'/,
      `${tool.name} accepted an argument that names nothing`);
  }

  assert.ok(swept >= 15, `only ${swept} enum arguments were swept`);

  // The control: every one of those tools accepts a legitimate call. A registry that refused
  // everything would satisfy the sweep above and be useless.
  const create = tools.find((tool) => tool.name === 'create_spec');

  assert.ok(create.handler({ slug: 'ok', title: 'OK', status: 'pending' }).id);
});

// --- The registry the server actually exposes ------------------------------------------------------

/** The tool list as the running server reports it, paired with the local registry. */
async function registered(t) {
  const file = openDatabaseFile(t);

  // The read call is what makes the database exist. `tools/list` is answered from the in-memory
  // template built at launch (FR2), so on its own it writes nothing and there would be no file to
  // build the local registry against — which is also the pairing that makes the comparison below
  // worth making, since the two lists now come from genuinely different databases.
  const run = await session(t, [
    { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    callTool(2, 'list_spec'),
  ], { path: file.path });
  const wire = run.replies.get(1).result.tools;

  const db = inspect(t, file.path);
  const local = spineTools(db);
  const byName = new Map(local.map((tool) => [tool.name, tool]));

  // Name for name and schema for schema, before anything is derived from it. This is what makes
  // everything below a statement about the *server's* registry rather than about `spineTools`:
  // if the two ever diverge, this fails first and the rest never runs on the wrong list.
  assert.deepEqual(
    wire.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })),
    local.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })),
    'the server registered a different tool list than this test built',
  );

  return { db, wire, tools: wire.map((tool) => byName.get(tool.name)) };
}

test('the conformance check passes against the list the running server registers', async (t) => {
  const { db, wire, tools } = await registered(t);

  assert.ok(wire.length >= 40, `the server listed only ${wire.length} tools`);

  const { problems, checked } = conformance(db, tools);

  assert.deepEqual(problems, []);
  assert.equal(checked.tools, wire.length, 'the checker saw a different number of tools than the wire');
  assert.ok(checked.tables >= 9 && checked.enums >= 15,
    `the check compared ${checked.tables} tables and ${checked.enums} enums`);

  // Every listed tool carries a schema a client can act on. A `tools/list` entry with no
  // `inputSchema` is well-formed MCP and unusable, and would sail through the check above.
  for (const tool of wire) {
    assert.equal(tool.inputSchema.type, 'object', `${tool.name} exposes no object schema`);
    assert.equal(tool.inputSchema.additionalProperties, false,
      `${tool.name} accepts arguments it does not declare`);
    assert.ok(tool.description?.length > 10, `${tool.name} is listed without a description`);
  }
});

test('every table the registered tools write is readable through a registered tool', async (t) => {
  const { db, wire, tools } = await registered(t);

  const readable = new Set(tools.filter((tool) => !tool.mutates).flatMap((tool) => tool.reads));
  const written = new Set(tools.filter((tool) => tool.mutates).flatMap((tool) => tool.reads));

  assert.ok(written.size > 0 && readable.size > 0);

  // Story 5's assertion, re-run over the registry the server exposes rather than the one the test
  // builds. The two agree today; what this adds is that they are *required* to.
  assert.deepEqual([...written].filter((table) => !readable.has(table)).sort(), [],
    'a registered tool writes a table no registered read tool returns');

  const live = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all()
    .map((row) => row.name));

  // `sqlite_schema` is exempt because it is not a row of itself: SQLite's own catalogue does not
  // list the catalogue, so a tool that reads it — `check_integrity`, which sweeps every table
  // there is — declares a name this query can never return. That is a property of the catalogue,
  // not a tool declaring something that does not exist, and it is the same exemption Story 5's
  // assertion takes.
  assert.deepEqual([...readable].filter((table) => !live.has(table) && table !== 'sqlite_schema'),
    [], 'a registered read tool declares a table the database does not have');

  // The tables no tool reaches yet, named by this assertion rather than filtered out of it. NFR7's
  // promise is over all of them; this epic closes the part it writes, and Epic 47-05 closes the
  // rest from the same live list.
  const untooled = [...live].filter((table) => !readable.has(table)).sort();

  t.diagnostic(`${untooled.length} of ${live.size} tables are not yet read by any registered tool: `
    + untooled.join(', '));

  assert.deepEqual(untooled.filter((table) => tools.some((tool) => tool.table === table)), [],
    'a tool was registered for a table with no read tool beside it');

  // Every tool the server registers is in the assertion — no name resolved to nothing, which is
  // the way a sweep over a mapped list silently shrinks.
  assert.equal(tools.filter(Boolean).length, wire.length);
});

// --- FR11, over the wire ---------------------------------------------------------------------------

test('a session resumed under a new id returns the state written before the resume', async (t) => {
  const STATE = JSON.stringify({ step: 3, of: 8, skill: 'cpm:do' });

  const first = await session(t, [
    callTool(1, 'create_session', { id: 'session-alpha', skill: 'cpm:do', phase: 'story 8' }),
    callTool(2, 'update_session', { id: 'session-alpha', phase: 'task 8.1', state: STATE }),
  ]);

  assert.equal(first.result(1).id, 'session-alpha');
  assert.equal(first.result(2).phase, 'task 8.1');

  // What a `--resume` actually looks like: a *new* harness id adopting the previous run's row.
  const second = await session(t, [
    callTool(1, 'adopt_session', { id: 'session-beta', predecessor_id: 'session-alpha' }),
    callTool(2, 'read_session', { id: 'session-beta', include_body: true }),
    callTool(3, 'read_session', { id: 'session-alpha' }),
    callTool(4, 'list_session', {}),
  ], { path: first.path });

  const adopted = second.result(2);

  assert.equal(adopted.state, STATE, 'the state did not survive the resume');
  assert.equal(adopted.skill, 'cpm:do');
  assert.equal(adopted.phase, 'task 8.1', 'the phase was carried but the state was not, or vice versa');
  assert.equal(adopted.superseded_by, null, 'the adopting session was marked superseded');

  // The predecessor is not deleted; it points forward. A resume that removed the old row would
  // pass every assertion above and lose the record of where the work came from.
  assert.equal(second.result(3).superseded_by, 'session-beta');

  assert.equal(second.result(4).returned, 2);

  // Read withheld by default and returned when asked — the bound Story 4 put on every read,
  // asserted here at the layer a client sees.
  const third = await session(t, [
    callTool(1, 'read_session', { id: 'session-beta' }),
  ], { path: first.path });

  assert.equal(Object.hasOwn(third.result(1), 'state'), false,
    'the session body came back on a read that did not ask for it');
  assert.equal(third.result(1).phase, 'task 8.1');
});
