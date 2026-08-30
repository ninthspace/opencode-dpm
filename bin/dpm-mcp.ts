#!/usr/bin/env node
/**
 * The executable the MCP client launches.
 *
 * **Nothing that touches `node:sqlite` may be imported statically from this file**, and that
 * shapes the whole of it. ES module imports are hoisted: every `import` in a module is resolved
 * and evaluated before the first statement of its body runs. So an entry point that imported
 * the server at the top and checked the Node version below would already have crashed with
 * `ERR_UNKNOWN_BUILTIN_MODULE` on any Node below 24 — the exact message NFR2 exists to
 * replace. The floor check is therefore a static import of a module that reaches nothing, and
 * the server arrives through `await import(…)`, which runs where it is written.
 *
 * Failures here print to stderr and exit non-zero. Stdout belongs to the transport from the
 * first byte, and a server that never got as far as speaking protocol must not put an error
 * message where a JSON-RPC message is expected — the client would report it as a parse error
 * and the real reason would never reach the user.
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
  process.exit(1);
}

// Before the import below, because that is what triggers the warning being filtered. Neither
// module here reaches `node:sqlite`, which is what makes them safe to import statically.
filterWarnings();

// Reached only above the floor, so `node:sqlite` is importable by the time this resolves.
const { main } = await import('../src/server/index.ts');

try {
  await main();
} catch (error) {
  const { stack, message } = error as Error;

  process.stderr.write(`[dpm] server stopped: ${stack ?? message}\n`);
  process.exit(1);
}
