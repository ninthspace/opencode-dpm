#!/usr/bin/env node
/**
 * The executable a user runs during a conflicted `git merge`.
 *
 * Same shape as `dpm-guard.ts` and `dpm-mcp.ts`, and for the same reason: **nothing that touches
 * `node:sqlite` may be imported statically here.** ES module imports are hoisted, so an entry point
 * that imported the merge at the top and checked the Node version below would already have crashed
 * with `ERR_UNKNOWN_BUILTIN_MODULE` on any Node under 24 — in the middle of a merge, where a
 * user has the least appetite for an unexplained failure.
 *
 * The report goes to stdout when the merge succeeded and to stderr when it did not, so a shell can
 * tell them apart without reading the exit code.
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

const { run } = await import('../src/merge/main.ts');

process.exit(run({ root: process.argv[2] ?? process.cwd() }));
