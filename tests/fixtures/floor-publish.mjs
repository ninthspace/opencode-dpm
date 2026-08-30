/**
 * `bin/dpm-publish.ts`'s refusal path, with the floor supplied as an argument.
 *
 * The companion of `floor-entry.mjs`, and separate from it for one reason: the exit code. The
 * server exits 1 below the floor; the three command binaries exit 2, because 1 is already spoken
 * for — the guard uses it for "diverged" and publish for "a document refused to render", and a
 * shell that could not tell "your Node is too old" from "your templates are incomplete" would send
 * a user to fix the wrong thing. A fixture that mirrored the server's code would assert the
 * difference away.
 *
 * Why a fixture at all: NFR2 is a promise about the *binary* — that it exits, names the version it
 * needs, and says so on stderr. None of that is exercised by calling `assertNodeFloor` in-process,
 * and none of it can be exercised against the real floor on a machine that clears it, which every
 * machine running these tests does since the suite itself needs `node:sqlite`. So this mirrors the
 * entry point's structure exactly and differs in one constant. The refusal, the message and the
 * exit behaviour all come from the module under test; what is substituted is the number, which is
 * the only part a passing machine makes untestable.
 */

import { assertNodeFloor } from '../../src/server/node-floor.ts';

try {
  assertNodeFloor(process.versions.node, process.argv[2]);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(2);
}

process.stdout.write('published\n');
