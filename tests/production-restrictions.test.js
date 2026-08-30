/**
 * Epic 01-05 Story 3 — what dpm does not do, watched rather than asserted (ENVX5, ENVX6).
 *
 * Three criteria, and all three are absences: nothing is contacted, no port is bound, and no host
 * mechanism is needed. **An absence is only an observation when something was watching**, and this
 * project has twice been caught by a sweep that reported clean because it examined nothing. So each
 * check below pairs its reading with a control that fires, and the controls come first.
 *
 * **Why the network claim is watched at runtime instead of grepped.** `node:net`, `node:dns`,
 * `node:http` and `fetch` appear nowhere in `src/` or `bin/` today — worth knowing, and not an
 * answer. A string search cannot see through a dynamic specifier or into a dependency, and the
 * criterion is about what the process *does*. `support/network-watch.js` wraps the four primitives
 * every higher-level client funnels through and records rather than blocks, because a thrown
 * refusal can be swallowed by a `catch` up the stack and would leave an empty log that reads
 * exactly like an absence.
 *
 * **Why cutting the network would have been the weaker experiment.** A cycle that completes offline
 * has shown it does not *need* the network. It has not shown it did not *try*: a swallowed
 * `ECONNREFUSED` is indistinguishable from never having called, and criterion 1 says "making no
 * outbound connection attempt". The instrument sees the attempt, which is the thing named.
 *
 * **`--import` here is a test instrument and not a documented invocation.** The sweep in
 * `executables-typescript.test.js` forbids a loader flag in `package.json`'s scripts, the hook and
 * the CI workflow, which are the surfaces a user or contributor actually types. Nothing about that
 * is weakened by a test attaching an observer to a child it spawned.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ownedDirectory } from './support/scratch.js';
import { runNode } from './support/run-node.js';
import { NETWORK_BLOCK, NETWORK_LOG } from './support/network-watch.js';
import { call, repliesFrom, wire } from './support/session.js';

const ROOT = join(import.meta.dirname, '..');
const BIN = join(ROOT, 'bin', 'dpm-mcp.ts');
const WATCH = join(import.meta.dirname, 'support', 'network-watch.js');

/** `initialize` first, because a server that has not shaken hands answers nothing else. */
const HANDSHAKE = {
  jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05' },
};

/**
 * A project directory with no `.claude/`, no marketplace and nothing else in it.
 *
 * Criterion 3 is about a project that has never met Claude Code, so the fixture is a bare directory
 * and the absence is asserted rather than assumed — a helper that quietly created one would make
 * the criterion untestable from here.
 *
 * @param {import('node:test').TestContext} t
 * @returns {string}
 */
function bareProject(t) {
  const project = ownedDirectory(t, 'dpm-production-');

  assert.deepEqual(readdirSync(project), [], 'the fixture starts empty, so anything found later was written by the run');

  return project;
}

/**
 * Run a session against a spawned server with the watch attached, and hand back what it recorded.
 *
 * `cwd` is the project and `DPM_DATABASE` is removed, so the server resolves its own default path —
 * which is what criterion 2 is about. Inheriting the parent's override would point the child at a
 * database somewhere else and every assertion about the project directory would hold while watching
 * nothing.
 *
 * @param {string} project Where the child runs.
 * @param {object[]} requests Messages after the handshake.
 * @param {object} [options]
 * @param {boolean} [options.blocked] Make every wrapped surface throw, which is criterion 1's
 *   "with networking disabled" performed rather than inferred.
 * @returns {Promise<{replies: Map<number, object>, recorded: string[], stderr: string, code: number}>}
 */
async function watched(project, requests, { blocked = false } = {}) {
  const log = join(project, '..', `network-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);

  const { code, stdout, stderr } = await runNode(
    ['--import', WATCH, BIN],
    wire([HANDSHAKE, ...requests]),
    { [NETWORK_LOG]: log, [NETWORK_BLOCK]: blocked ? '1' : undefined, DPM_DATABASE: undefined },
    { cwd: project },
  );

  return {
    code,
    stderr,
    replies: new Map(repliesFrom(stdout).map((reply) => [reply.id, reply])),
    // Absent means nothing was recorded, which is the expected result and must be distinguishable
    // from a log that could not be written — the control below is what makes that distinction.
    recorded: existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : [],
  };
}

/** The structured result of one call, refusing to return anything for a call that failed. */
const resultOf = (replies, id) => {
  const reply = replies.get(id);

  assert.ok(reply, `no reply for id ${id}`);
  assert.equal(reply.error, undefined,
    `id ${id} failed: ${reply.error?.data?.message ?? reply.error?.message}`);

  return reply.result.structuredContent;
};

// --- The control, first: the instrument sees all four surfaces -----------------------------------

test('the network watch records connect, listen, dns and fetch when they happen [unit]', async (t) => {
  const scratch = ownedDirectory(t, 'dpm-watch-control-');
  const log = join(scratch, 'network.log');
  const script = join(scratch, 'reaches-out.mjs');

  // **Every target is loopback or a port nothing answers on.** The point is to record the *attempt*,
  // which happens before any connection succeeds, so the control needs no network at all — and a
  // test suite that made real outbound requests to prove it makes none would be its own joke.
  writeFileSync(script, [
    "import net from 'node:net';",
    "import dns from 'node:dns';",
    "net.createServer().listen(0, '127.0.0.1').close();",
    "new net.Socket().connect(1, '127.0.0.1').on('error', () => {});",
    "dns.lookup('localhost', () => {});",
    "await fetch('http://127.0.0.1:1/').catch(() => {});",
  ].join('\n'));

  const { recorded } = await (async () => {
    const run = await runNode(['--import', WATCH, script], '', { [NETWORK_LOG]: log });

    return { run, recorded: existsSync(log) ? readFileSync(log, 'utf8') : '' };
  })();

  for (const surface of ['listen', 'connect', 'dns.lookup', 'fetch']) {
    assert.match(recorded, new RegExp(`^${surface.replace('.', '\\.')} `, 'm'),
      `the watch missed ${surface}, so an empty log elsewhere proves nothing about it`);
  }
});

// --- Criteria 1 and 2: a full plan-and-publish cycle, watched ------------------------------------

test('a full plan-and-publish cycle contacts nothing and binds no port [integration]', async (t) => {
  const project = bareProject(t);

  // **A whole cycle rather than one call**, because the criteria say "during a full plan-and-publish
  // cycle" and the surfaces that would dial out are not evenly spread — an integrity check, a
  // template render and the projection write are all different code paths, and stopping at
  // `create_spec` would watch the shortest one.
  const first = await watched(project, [
    call(1, 'create_spec', { slug: 'offline-cycle', title: 'A cycle with nobody listening' }),
  ]);

  assert.equal(first.code, 0, `the server exited ${first.code}: ${first.stderr}`);

  const spec = resultOf(first.replies, 1);

  // The second pass names ids the first returned, which one stdio session cannot do — it cannot read
  // its own replies. The same database file is reopened, which is also the only thing here proving
  // the first pass's writes were durable rather than held on a connection.
  const second = await watched(project, [
    call(1, 'create_requirement', {
      spec_id: spec.id,
      label: 'FR1',
      class: 'functional',
      text: 'The cycle completes with nothing listening.',
      position: 0,
    }),
    call(2, 'create_epic', { parent_id: spec.id, slug: 'offline-epic', title: 'Offline epic' }),
    call(3, 'check_integrity', {}),
  ]);

  assert.equal(second.code, 0, `the server exited ${second.code}: ${second.stderr}`);

  const epic = resultOf(second.replies, 2);

  resultOf(second.replies, 1);
  resultOf(second.replies, 3);

  const third = await watched(project, [
    call(1, 'create_story', { epic_id: epic.id, number: 1, title: 'A story', position: 0 }),
    call(2, 'publish', {}),
  ]);

  assert.equal(third.code, 0, `the server exited ${third.code}: ${third.stderr}`);

  const published = resultOf(third.replies, 2);

  assert.ok(published, 'publish returned nothing, so the cycle did not reach its last step');

  // **Criterion 1 and criterion 2's second half, over every pass.** The control above is what makes
  // an empty result mean something; without it this is three assertions that nothing was written to
  // three files that might never have been writable.
  const recorded = [...first.recorded, ...second.recorded, ...third.recorded];

  assert.deepEqual(recorded, [],
    `the cycle reached out or listened:\n${recorded.join('\n')}`);
});

test('the same cycle completes with networking disabled outright [integration]', async (t) => {
  const project = bareProject(t);

  // **Criterion 1 says "completes with networking disabled" and this is that clause performed.**
  // The test above proves nothing was called; this proves the cycle survives every outbound
  // primitive being made to throw — a stricter condition than an unplugged cable, since loopback
  // and name resolution go with it. Inferring one from the other was the alternative, and the
  // criterion names two things.
  const { code, replies, stderr, recorded } = await watched(project, [
    call(1, 'create_spec', { slug: 'no-network-at-all', title: 'No network at all' }),
    call(2, 'check_integrity', {}),
    call(3, 'publish', {}),
  ], { blocked: true });

  assert.equal(code, 0, `the cycle did not survive networking being disabled:\n${stderr}`);
  resultOf(replies, 1);
  resultOf(replies, 2);
  resultOf(replies, 3);

  assert.deepEqual(recorded, [],
    `a surface was reached for and refused, which the exit code alone would have hidden:\n${recorded.join('\n')}`);
  assert.ok(existsSync(join(project, 'docs')), 'publish wrote no projection, so the cycle stopped short of its last step');

  // **The control, and it is the blocking itself.** An empty log is also what a `blocked` flag that
  // never reached the child would produce, so the same child is asked to do the one thing the
  // block forbids — and must fail. Without this the pass above says only that nothing was set.
  const proof = await runNode(
    ['--import', WATCH, '--input-type=module', '--eval', "import dns from 'node:dns'; dns.lookup('localhost', () => {});"],
    '', { [NETWORK_LOG]: join(project, '..', 'blocked.log'), [NETWORK_BLOCK]: '1' },
  );

  assert.notEqual(proof.code, 0, 'the block did not fire, so the cycle above ran unblocked');
  assert.match(proof.stderr, /networking is disabled, and dns\.lookup was called/);
});

// --- Criterion 2, first half: persistence is files under .dpm/ -----------------------------------

test('the cycle persists to .dpm/ and writes nothing else it was not asked to [integration]', async (t) => {
  const project = bareProject(t);

  const { code, replies, stderr } = await watched(project, [
    call(1, 'create_spec', { slug: 'where-it-lands', title: 'Where it lands' }),
  ]);

  assert.equal(code, 0, `the server exited ${code}: ${stderr}`);
  resultOf(replies, 1);

  // **`.dpm/` and nothing beside it.** `publish` is deliberately not run here: it writes `docs/`,
  // which is a projection somebody explicitly asked for rather than persistence, and folding the
  // two together would make this assertion unable to tell a stray temp file from a requested one.
  assert.deepEqual(readdirSync(project), ['.dpm'],
    'the server wrote somewhere other than .dpm/ without being asked to');
  assert.ok(existsSync(join(project, '.dpm', 'dpm.db')),
    'the database is not where the default path says it is, so this reading is about the wrong directory');
});

// --- Criterion 3: no .claude/, no marketplace ----------------------------------------------------

test('the cycle runs in a project with no .claude directory and no marketplace [integration]', async (t) => {
  const project = bareProject(t);

  const { code, replies, stderr, recorded } = await watched(project, [
    call(1, 'create_spec', { slug: 'no-host-mechanism', title: 'No host mechanism' }),
    call(2, 'publish', {}),
  ]);

  assert.equal(code, 0, `the server exited ${code}: ${stderr}`);
  resultOf(replies, 1);
  resultOf(replies, 2);
  assert.deepEqual(recorded, [], `it reached out:\n${recorded.join('\n')}`);

  // **The absence is asserted after the run, not before.** `bareProject` checked the directory
  // started empty; this checks the server did not create the very thing the criterion says it does
  // not need — which is a different claim, and the one that would catch a `.claude/` written as a
  // convenience.
  assert.equal(existsSync(join(project, '.claude')), false,
    'the run created a .claude/ directory, which the criterion says it does not need');
  assert.equal(existsSync(join(project, '.claude-plugin')), false,
    'the run created a Claude Code plugin manifest in the user project');

  // **And the control, which is the shipped source rather than a second reading of the same tree.**
  // An empty project proves nothing if the code never looks for a host mechanism in the project to
  // begin with — the thing that would break criterion 3 is a *reference* to one, so the sources are
  // swept for it. `src/plugin/server.ts` names `.claude-plugin` in a comment explaining what v2
  // replaced, which is why comments come out first.
  const sources = readdirSync(join(ROOT, 'src'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(entry.parentPath, entry.name));

  assert.ok(sources.length > 40, `the sweep read ${sources.length} sources, which is not this tree`);

  const reaching = sources.filter((path) => readFileSync(path, 'utf8')
    .replaceAll(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    .includes('.claude'));

  assert.deepEqual(reaching, [], 'a source reaches for a Claude Code path outside a comment');

  // The control on that sweep: it can see one when it is there.
  assert.ok('const marketplace = ".claude/plugins";'.replaceAll(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').includes('.claude'),
    'the comment stripper removes the string it was meant to keep');
});
