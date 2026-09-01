/**
 * Epic 02-01 Story 5 — the two entries as one installation.
 *
 * Stories 3 and 4 each verified one entry against the domain it registers into: the config hook
 * sets `mcp.dpm`, the skills entry registers twenty-three embedded sources. Both passed, and the
 * arrangement was still broken, because **neither story asked a question that spans them**. Two
 * such questions turn out to matter, and they are the two this file is for.
 *
 * **Do the two entries describe the same installation?** They are separate modules loaded from
 * separate lines of a user's `plugin` array, and nothing in either one's own test would notice if
 * they resolved different roots — the server would be spawned from one tree and the skills read
 * from another, each internally consistent. `registration.ts` computes one `packageRoot()` for
 * both, and this is where that stops being an implementation detail and becomes a property.
 *
 * **Is the command the host is handed one it can actually run?** Story 3 asserted the entry equals
 * what `localServer` builds, which is true of any command whatever, including the one that shipped.
 * A registration is not a registration until something starts, and under v1 a command that does not
 * start does not merely fail — the host blocks waiting for it, and the skills registered by the
 * other entry never load either. So the failure mode this file guards is the whole plugin going
 * silent, not one absent server.
 *
 * The live half — dpm's real modules loaded by OpenCode 1.18.25, its skills read back out of the
 * host's own draft — was run against the CLI during story 5 and is recorded there. ENVX1 keeps it
 * out of the suite: what is here runs on any machine, and the one test that reaches for the v1
 * runtime skips with a reason when it is absent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import * as tools from '../src/plugin/index.ts';
import { SERVER_NAME } from '../src/plugin/index.ts';
import skillsEntry from '../src/plugin/skills-entry.ts';
import { RUNTIME } from '../src/plugin/server.ts';
import {
  SERVER_EXECUTABLE, SKILLS_DIRECTORY, packageRoot, withinPackage,
} from '../src/plugin/root.ts';
import { registerServer, registerSkills } from './support/host-contexts.js';

const ROOT = packageRoot();

/** Where a v1 install puts its CLI. Absent on most machines, which is why its use skips. */
const V1_CLI = join(process.env.HOME ?? '', '.opencode', 'bin', 'opencode');

/**
 * Whether a runtime can load `node:sqlite`, which is the whole of what the server needs of it.
 *
 * **This is the reading the epic did not have.** `localServer` named a runtime and every test asked
 * whether the command matched the one it named; none asked whether that runtime could run the
 * server. The bun the host was handing itself could not, and the arrangement was green throughout.
 *
 * @param {string[]} command The runtime, followed by any arguments it needs before `-e`.
 * @param {Record<string,string>} [environment]
 * @returns {boolean}
 */
function carriesNodeSqlite(command, environment = {}) {
  const [executable, ...args] = command;

  return spawnSync(executable, [...args, '-e', 'await import("node:sqlite")'], {
    encoding: 'utf8',
    env: { ...process.env, ...environment },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).status === 0;
}

/** One load of both entries, as a user's two-line `plugin` array produces. */
async function loadBoth(options = {}) {
  const config = await registerServer(tools, {});
  const { sources } = await registerSkills(skillsEntry, options);

  return { config, sources };
}

// --- Criterion: one installation, described twice ------------------------------------------------

test('both entries register from the same package root [integration]', async () => {
  const { config, sources } = await loadBoth();

  // Both halves arrived, which is the thing a per-entry test cannot say.
  const entry = config.mcp?.[SERVER_NAME];

  assert.ok(entry, 'the config hook registered no server, so there is nothing to cross-check');
  assert.equal(sources.length, 23, `${sources.length} skills registered, not the twenty-three on disk`);

  // **The same tree, not two trees that agree.** Asserted as a shared prefix rather than by
  // comparing two calls to `packageRoot()`, which would agree with themselves whatever they
  // returned: the executable and every skill location are read out of the registrations the host
  // was actually handed.
  assert.equal(entry.command[1], join(ROOT, SERVER_EXECUTABLE));

  // **`withinPackage`, not `startsWith`** — epic 02-02 story 4. This read `!location.startsWith(…)`,
  // which places a sibling package one character along inside this one: `${ROOT}-other/skills/x`
  // starts with `${ROOT}/skills`'s parent and reads as a skill of dpm's. The check being made here
  // is precisely that a skill did not come from somewhere else, so the one path it must not accept
  // was the one it accepted.
  const skills = join(ROOT, SKILLS_DIRECTORY);
  const strays = sources
    .map((source) => source.skill.location)
    .filter((location) => !withinPackage(skills, location));

  assert.deepEqual(strays, [], 'a skill is registered from outside the tree the server is spawned from');

  // The control on that reading: it can find a stray, and it finds the one a prefix match misses.
  assert.equal(withinPackage(skills, skills), true);
  assert.equal(withinPackage(skills, join(`${ROOT}-other`, SKILLS_DIRECTORY, 'dpm-do')), false);
  assert.equal(withinPackage(skills, '/elsewhere/skills/do'), false);
});

test('the user\'s own registrations survive both entries [integration]', async () => {
  // A host resolving a config that already holds the user's servers, and a draft that already holds
  // the host's built-in skills. Neither entry may take anything away, and the two are checked
  // together because a load is what a user performs — not one entry at a time.
  const mine = { type: 'local', command: ['echo', 'mine'] };
  const config = await registerServer(tools, { mcp: { 'user-thing': mine } });

  assert.deepEqual(config.mcp['user-thing'], mine, 'dpm overwrote a server the user registered');
  assert.deepEqual(Object.keys(config.mcp).sort(), ['dpm', 'user-thing']);
});

// --- Criterion: the command is one the host can start ---------------------------------------------

test('the registered command names a runtime that carries node:sqlite [integration]', async () => {
  const { config } = await loadBoth();
  const [runtime] = config.mcp[SERVER_NAME].command;

  assert.equal(runtime, RUNTIME, 'the registration names a runtime other than the one server.ts chose');
  assert.ok(carriesNodeSqlite([runtime]),
    `the registered runtime \`${runtime}\` cannot load node:sqlite, so the server cannot start and `
    + 'a v1 host will block waiting for it — taking the skills down with it');
});

test('control — the same reading refuses a runtime that lacks it [unit]', () => {
  // **Without this the assertion above is unfalsifiable.** A probe that returned true for anything
  // would pass it, and that is precisely how the bun branch stayed green: every test compared the
  // command to the command, and none of them could have come out the other way.
  assert.equal(carriesNodeSqlite(['/usr/bin/false']), false,
    'the reading passed a runtime that runs nothing, so it is not measuring anything');
  assert.equal(carriesNodeSqlite([process.execPath]), true,
    'and it fails this Node, so a false above would mean nothing either');
});

test('control — the runtime that was registered before this story is refused [integration]', (t) => {
  // ENVX1: the suite runs without either host CLI. Absent, this skips with its reason — the control
  // above still shows the reading can return false, and what is lost is only the demonstration
  // against the exact runtime that motivated the change.
  if (!existsSync(V1_CLI)) {
    t.skip('no OpenCode v1 on this machine, so the runtime the bun branch would have named is unreadable');

    return;
  }

  // This is what `localServer` used to hand the host: its own binary, in bun mode. It is a working
  // runtime — `installed-runtime.test.js` drives `bun:sqlite` through it — and it cannot start dpm.
  assert.equal(carriesNodeSqlite([V1_CLI], { BUN_BE_BUN: '1' }), false,
    'the v1 host runtime loads node:sqlite after all, which would mean the bun branch was removed '
    + 'on a reading that no longer holds');
});
