#!/usr/bin/env node
/**
 * The executable that regenerates the projection and the dump (AD11).
 *
 * Same shape as `dpm-guard.ts`, `dpm-merge.ts` and `dpm-mcp.ts`, and for the same reason: **nothing
 * that touches `node:sqlite` may be imported statically here.** ES module imports are hoisted, so
 * an entry point that imported the publish at the top and checked the Node version below would
 * already have crashed with `ERR_UNKNOWN_BUILTIN_MODULE` on any Node under 24 — and this is the
 * command the guard sends a user to when it refuses a commit, so an unexplained failure here leaves
 * them with a refusal and no way through it.
 *
 * Unlike the server, stdout here is a terminal rather than a transport, so the report goes to
 * stdout and every failure to stderr.
 */

import { assertNodeFloor } from '../src/server/node-floor.ts';
import { filterWarnings } from '../src/server/warnings.ts';

try {
  assertNodeFloor();
} catch (error) {
  // Cast rather than narrowed, for the reason written out in `dpm-guard.ts`.
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(2);
}

filterWarnings();

const { run } = await import('../src/publish/main.ts');

process.exit(run({ root: process.argv[2] ?? process.cwd() }));
