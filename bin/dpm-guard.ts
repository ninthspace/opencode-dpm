#!/usr/bin/env node
/**
 * The executable a pre-commit hook runs.
 *
 * Same shape as `dpm-mcp.ts` and for the same reason: **nothing that touches `node:sqlite` may be
 * imported statically here.** ES module imports are hoisted, so an entry point that imported the
 * guard at the top and checked the Node version below would already have crashed with
 * `ERR_UNKNOWN_BUILTIN_MODULE` on any Node under 24 — inside a git hook, where the message a
 * user actually sees is "pre-commit hook failed".
 *
 * Unlike the server, stdout here is a terminal rather than a transport, so the clean-result line
 * goes to stdout and every failure to stderr.
 */

import { assertNodeFloor } from '../src/server/node-floor.ts';
import { filterWarnings } from '../src/server/warnings.ts';

try {
  assertNodeFloor();
} catch (error) {
  // Cast rather than narrowed: `catch` binds `unknown` under `strict`, and the only thing thrown
  // here is `assertNodeFloor`'s own error. A `instanceof` guard would add a branch that cannot be
  // taken and would have to decide what to print on the path that never runs.
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(2);
}

filterWarnings();

const { run } = await import('../src/guard/main.ts');

process.exit(run({ root: process.argv[2] ?? process.cwd() }));
