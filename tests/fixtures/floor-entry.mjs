/**
 * `bin/dpm-mcp.ts`'s refusal path, with the floor supplied as an argument.
 *
 * NFR2 is a promise about the *binary*: it exits, it says which version it needs, and it says so
 * on stderr. None of that is exercised by calling `assertNodeFloor` in-process, and none of it
 * can be exercised against the real floor on a machine that clears it — which every machine
 * running these tests does, since the suite itself needs `node:sqlite`.
 *
 * So this mirrors the entry point's structure exactly and differs in one constant. It is not a
 * reimplementation: the refusal, the message and the exit behaviour all come from the module
 * under test. What is substituted is the number, which is the only part a passing machine makes
 * untestable.
 *
 * It lives in `fixtures/` and issues no statements and reads no file, so the fixture-discipline
 * check has nothing to object to.
 */

import { assertNodeFloor } from '../../src/server/node-floor.ts';

try {
  assertNodeFloor(process.versions.node, process.argv[2]);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

process.stdout.write('started\n');
