/**
 * Epic 01-05 Story 2 — the registered MCP command runs from where the host installs it (FR1, FR2).
 *
 * **This file exists because the install was tried and the server did not start.** Story 2 put
 * `opencode2 plugin add github:ninthspace/opencode-dpm` through an isolated XDG environment and
 * read back what the host held: 23 skills registered from the installed copy, and
 * `mcp connect failed … MCP error -32000: Connection closed`. The cause was one line —
 * `localServer` spawning `node` against a `.ts` source — meeting one Node policy:
 *
 *     ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING: Stripping types is currently unsupported
 *     for files under node_modules
 *
 * on 22 and on 24, with no flag that lifts it. OpenCode installs every plugin under
 * `…/packages/git-<digest>/node_modules/<name>/`, so the command that runs in the checkout is
 * precisely the command that cannot run in the artefact.
 *
 * **The whole suite passed throughout, and that is what this file is really about.** Every existing
 * check ran the executables from the checkout, where the restriction does not apply, so 1085 green
 * tests said nothing whatever about the only copy a user ever receives. `executables-typescript.js`
 * even spawns all five — from the tree. **The location was the untested variable**, so it is the
 * one this file changes: the package is planted *under a `node_modules` directory* and the server
 * is run from there.
 *
 * **The control comes first and is the point.** Test 1 shows `node` genuinely refusing the planted
 * copy. Without it the passing spawn below would be a fact about bun rather than evidence that the
 * fix was needed, and a future change reverting `localServer` to `node` would turn this file green
 * on a package that does not work.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { ownedDirectory } from './support/scratch.js';
import { HELLO, repliesFrom, wire } from './support/session.js';
import { runNode } from './support/run-node.js';
import { BE_BUN, localServer } from '../src/plugin/server.ts';
import { SERVER_EXECUTABLE } from '../src/plugin/root.ts';

const ROOT = join(import.meta.dirname, '..');

/** What OpenCode names the directory it installs a plugin package into. */
const INSTALLED = join('node_modules', 'opencode-dpm');

/**
 * The package, copied to where the host would have put it: under a `node_modules` directory.
 *
 * Only `bin/` and `src/` are copied — 138 files and about 1MB — because they are the whole of what
 * the server executable reaches. `skills/` and `shared/` are the plugin entry's business and
 * `publish-package.test.js` already holds them against the tarball.
 *
 * **A symlink would not do.** Node resolves a module's real path before deciding whether it sits
 * under `node_modules`, so a link pointing back at the checkout would be judged by the checkout's
 * location and the restriction would never fire — the fixture would quietly test nothing.
 *
 * @param {import('node:test').TestContext} t Owns the directory's removal.
 * @returns {string} Absolute path to the planted `bin/dpm-mcp.ts`.
 */
function installed(t) {
  const root = join(ownedDirectory(t, 'dpm-installed-'), INSTALLED);

  mkdirSync(root, { recursive: true });

  for (const directory of ['bin', 'src']) {
    cpSync(join(ROOT, directory), join(root, directory), { recursive: true });
  }

  return root;
}

/**
 * A bun-capable executable, or `undefined` when this machine has none.
 *
 * Two forms are accepted because they are two ways of having the same runtime: a standalone `bun`,
 * and the bun compiled into `opencode2` — which is the one that matters, since it is what the host
 * uses and therefore what `process.execPath` names inside a loaded plugin. A bun-compiled binary
 * behaves as the bun CLI when `BUN_BE_BUN` is set, which is the whole mechanism under test.
 *
 * **Reading the machine is against the usual rule and is unavoidable here.** ENVX2 says a fixture
 * must not depend on what the author happens to have installed; this file's subject *is* the host
 * runtime, and there is no way to show a spawn works without one. What the rule still buys is
 * honesty about it: absence skips with a stated reason rather than passing, and the control in
 * test 1 needs no bun at all, so the evidence that the defect is real survives on any machine.
 *
 * @returns {string|undefined}
 */
function bunExecutable() {
  for (const name of ['bun', 'opencode2']) {
    try {
      const path = execFileSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).trim();
      const version = execFileSync(path, ['--version'], {
        encoding: 'utf8', env: { ...process.env, [BE_BUN]: '1' }, stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();

      // A bun version and not opencode's own — `--version` under `BUN_BE_BUN` is what tells them
      // apart, and a binary that answers with anything else is not a runtime we can spawn.
      if (/^\d+\.\d+\.\d+/.test(version)) return path;
    } catch { /* not on PATH, or not bun-capable: try the next. */ }
  }

  return undefined;
}

/** Speak the handshake to a command and return what came back. */
const handshake = (command, environment) => {
  const [executable, ...args] = command;

  return execFileSync(executable, args, {
    input: wire([HELLO]),
    encoding: 'utf8',
    env: { ...process.env, ...environment, DPM_DATABASE: undefined },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
};

// --- The control: the defect is real, and it is about location and nothing else ------------------

test('node refuses the server executable once it sits under node_modules [integration]', async (t) => {
  const root = installed(t);

  const refused = await runNode([join(root, SERVER_EXECUTABLE)], wire([HELLO]));

  assert.notEqual(refused.code, 0, 'node ran a .ts file under node_modules, which it does not do');
  assert.match(refused.stderr, /ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING/,
    `node failed for some other reason, so this file is guarding the wrong thing:\n${refused.stderr}`);

  // **The other half of the control, and the one that pins the cause to the path.** The same source
  // in the checkout runs perfectly, so the failure above is not the file being broken, a dependency
  // being absent, or the handshake being malformed. Location is the only variable that moved.
  const accepted = await runNode([join(ROOT, SERVER_EXECUTABLE)], wire([HELLO]));

  assert.equal(accepted.code, 0, `the checkout copy failed too, so location is not the variable:\n${accepted.stderr}`);
  assert.ok(repliesFrom(accepted.stdout)[0]?.result?.serverInfo, 'and it answered the handshake');
});

// --- The registration: which runtime, and driven on both branches --------------------------------

test('localServer spawns the host runtime under bun and node otherwise [unit]', () => {
  const executable = join(ROOT, SERVER_EXECUTABLE);
  const host = '/somewhere/opencode2.exe';

  // Under a bun host — which is every real OpenCode, since it loads plugin entrypoints with the bun
  // compiled into itself — the command is the host's own binary put into bun mode.
  const underBun = localServer(ROOT, { bun: '1.4.0', execPath: host });

  assert.deepEqual(underBun.command, [host, executable]);
  assert.deepEqual(underBun.environment, { [BE_BUN]: '1' },
    'without this the host binary would start its own interface instead of running the server');

  // Under anything else, unchanged from what shipped before — the checkout, the hook, the scripts.
  const underNode = localServer(ROOT, { bun: undefined, execPath: '/usr/bin/node' });

  assert.deepEqual(underNode.command, ['node', executable]);
  assert.equal(underNode.environment, undefined, 'nothing is set for a runtime that does not read it');

  // **NFR2 on both branches: a runtime, a source, and nothing between them.** The defect was fixed
  // by changing which runtime is named, and a fix that reached for `--loader` or a compiled `dist/`
  // instead would have been a build step. Asserted as a length rather than a flag scan, because the
  // only argument either command may carry is the executable itself.
  for (const { command } of [underBun, underNode]) {
    assert.equal(command.length, 2, `the command carries an extra argument: ${command.join(' ')}`);
    assert.match(command[1], /\.ts$/, 'the source is spawned directly, with nothing generated from it');
  }
});

// --- The fix, against the layout that broke ------------------------------------------------------

test('the registered command starts the server from inside node_modules [integration]', (t) => {
  const bun = bunExecutable();

  if (!bun) {
    t.skip('no bun-capable runtime on this machine, so the spawn cannot be shown here');

    return;
  }

  const root = installed(t);

  // **The command is taken from `localServer` rather than written out.** What is being verified is
  // the registration the host receives, so a test composing its own command would confirm that bun
  // works and leave the registration unexamined — which is exactly the gap that let the defect ship.
  const { command, environment } = localServer(root, { bun: '1.4.0', execPath: bun });
  const [reply] = repliesFrom(handshake(command, environment));

  assert.equal(reply.id, 1, 'the server answered the handshake from under node_modules');
  assert.ok(reply.result?.serverInfo, 'and answered it with a server identity');
  assert.equal(reply.result.serverInfo.name, 'dpm', 'and the identity is dpm rather than some other server');
});
