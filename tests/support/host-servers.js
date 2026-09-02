/**
 * The runtimes the two hosts spawn dpm's MCP server under, and a way to drive one over a project.
 *
 * ## Why a runtime is the thing that differs, and not a command
 *
 * `localServer()` computes one command — `node <root>/bin/dpm-mcp.ts` — and hands the same one to
 * whichever host asks. So "the v1 server" and "the v2 server" are not two commands, and a test
 * looking for a difference in what dpm *registers* would find none and report agreement it had not
 * earned. What actually differs is the process that ends up running the file, and
 * `src/plugin/server.ts` records why in full:
 *
 * - **v1 must run it under `node`.** The bun compiled into OpenCode v1 1.18.25 is 1.3.14 and
 *   answers `No such built-in module: node:sqlite`, so the server cannot start under it at all.
 * - **v2 can run it under its own bun.** `opencode2`'s bun is 1.4.0 and does carry `node:sqlite`;
 *   epic 01-05 established that by spawning the host binary with `BUN_BE_BUN=1` and watching the
 *   server come up.
 *
 * Two runtimes, one database, one file: that is the comparison epic 02-05 story 1 asks for, and it
 * is reachable with no model provider because a server process is not a session.
 *
 * ## What happens on a machine that has only one of them
 *
 * `runtimes()` returns what it *found*, and every caller is expected to report the set it got
 * rather than assume the strong one. A machine without `opencode2` still compares two independent
 * server processes over one database — which catches a dump that is not deterministic — and it
 * cannot catch a dump that depends on the runtime. Those are different readings and the difference
 * has to stay visible: story 1's third criterion requires the whole suite to pass with neither host
 * binary on `PATH`, so a test that failed here without `opencode2` would be a test that made that
 * criterion unsatisfiable, and one that skipped would be the silent binary dependency the same
 * criterion exists to find.
 *
 * The second runtime is resolved to an **absolute path** by walking `PATH` here rather than handed
 * to `spawn` as a bare name. A bare name is resolved by the child's own environment, and the
 * environments below deliberately edit that environment — so the name would be looked up under
 * conditions the test set, which is the test asking itself.
 */

import { accessSync, constants, readFileSync, rmSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';

import { runWith } from './run-node.js';
import { BIN, HELLO, NO_OVERRIDE, call, repliesFrom, wire } from './session.js';

/** Where the dump lands under a project root, as the guard names it. */
export const DUMP = join('.dpm', 'dpm.sql');

/**
 * The first executable named `name` on `PATH`, or `null`.
 *
 * Written out rather than shelled to `which`, which is a third program whose absence would be
 * reported as the absence of the one being looked for.
 *
 * @param {string} name
 * @returns {string|null}
 */
export function onPath(name) {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (directory === '') continue;

    const candidate = join(directory, name);

    try {
      if (!statSync(candidate).isFile()) continue;
      accessSync(candidate, constants.X_OK);

      return candidate;
    } catch {
      // Not there, not a file, or not executable — all three mean "keep looking", and telling
      // them apart would be a diagnosis nothing downstream asks for.
    }
  }

  return null;
}

/**
 * The runtime v1 spawns the server with.
 *
 * `process.execPath` and not the string `node`: the claim being checked is about the Node running
 * this suite, and a bare name would let `PATH` answer a question about `process`.
 */
export const NODE_RUNTIME = {
  name: 'node',
  command: process.execPath,
  env: {},
};

/**
 * The runtime v2 spawns the server with, or `null` where that host is not installed.
 *
 * `BUN_BE_BUN=1` is what makes the host binary behave as the bun it was compiled from rather than
 * as OpenCode — the same lever epic 01-05 used to establish that this bun carries `node:sqlite`.
 *
 * @returns {{name: string, command: string, env: Record<string, string>}|null}
 */
export function bunRuntime() {
  const command = onPath('opencode2');

  return command === null
    ? null
    : { name: 'opencode2-bun', command, env: { BUN_BE_BUN: '1' } };
}

/**
 * Every server runtime this machine can offer, `node` first.
 *
 * @returns {Array<{name: string, command: string, env: Record<string, string>}>}
 */
export function runtimes() {
  const bun = bunRuntime();

  return bun === null ? [NODE_RUNTIME] : [NODE_RUNTIME, bun];
}

/**
 * At least two server processes to read one database with, whatever this machine has.
 *
 * With both hosts installed these are the two runtimes and the comparison is the criterion's:
 * v1's server and v2's server over one database. With only `node` it is `node` twice, and the
 * reading degrades from "the dump does not depend on the runtime" to "the dump does not depend on
 * the process" — weaker, still true of a correct dump, and false of a dump carrying a timestamp or
 * an unordered map.
 *
 * **The degradation is why the second entry is renamed rather than repeated.** A caller reporting
 * the set it compared prints `node, node (second process)` and a reader can see which reading they
 * got; two entries both called `node` would print as a machine that found the same runtime twice,
 * which is a different and more alarming thing.
 *
 * @returns {Array<{name: string, command: string, env: Record<string, string>}>}
 */
export function comparisonRuntimes() {
  const found = runtimes();

  return found.length >= 2
    ? found
    : [found[0], { ...found[0], name: `${found[0].name} (second process)` }];
}

/**
 * Drive one session against a project directory and hand back the parsed replies.
 *
 * `DPM_DATABASE` is unset for the child through `NO_OVERRIDE`: inherited from the parent it would
 * point every runtime at one database somewhere else, and the comparison would compare a file
 * nothing under test had written.
 *
 * @param {{name: string, command: string, env: Record<string, string>}} runtime
 * @param {string} project The project root the server runs in.
 * @param {Array<object>} messages Following the handshake, which is prepended.
 * @returns {Promise<{code: number, replies: object[], stderr: string}>}
 */
export async function drive(runtime, project, messages) {
  const { code, stdout, stderr } = await runWith(
    runtime.command,
    [BIN],
    wire([HELLO, ...messages]),
    { ...NO_OVERRIDE, ...runtime.env },
    { cwd: project },
  );

  return { code, replies: repliesFrom(stdout), stderr };
}

/**
 * Regenerate the projection and the dump through one runtime, and read the dump back.
 *
 * The dump is deleted first, so what comes back was **written by this call** rather than left over
 * from the one before it. Without that a second runtime that did nothing at all would hand back
 * the first runtime's bytes and the comparison would pass on the strength of the failure.
 *
 * @param {{name: string, command: string, env: Record<string, string>}} runtime
 * @param {string} project
 * @returns {Promise<{dump: string, reply: object}>}
 */
export async function publishThrough(runtime, project) {
  rmSync(join(project, DUMP), { force: true });

  const { replies, stderr } = await drive(runtime, project, [call(2, 'publish')]);
  const reply = replies.find((message) => message.id === 2);

  if (reply === undefined || reply.error !== undefined) {
    throw new Error(
      `publish through ${runtime.name} did not answer: ${JSON.stringify(reply)}\n${stderr}`,
    );
  }

  return { dump: readFileSync(join(project, DUMP), 'utf8'), reply };
}
