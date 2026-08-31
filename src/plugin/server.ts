/**
 * The MCP server entry the plugin sets into the host's registry — FR2.
 *
 * A local server is a command the host spawns, and this one is a runtime followed by a TypeScript
 * source with nothing in between. That is ADR 01-03 arriving where it is load-bearing: `bin/`,
 * `hooks/pre-commit` and `package.json`'s scripts all invoke the executables that way already, and
 * a `--loader` or `--import` appearing *here* would be the one invocation surface a contributor
 * never types and so never notices. `executables-typescript.test.js` sweeps this file for exactly
 * that, alongside the scripts and the hook.
 *
 * **Computed rather than read from a manifest, and that is the change v2 brings.** Under Claude
 * Code the command lived in `.claude-plugin/plugin.json` as a string with `${CLAUDE_PLUGIN_ROOT}`
 * in it, substituted by the host. v2 has no such substitution: the plugin is code, it knows where
 * it is, and it says so. `packageRoot` is what makes "knows where it is" true rather than assumed.
 *
 * ## Why the runtime is `node`, and why that also decides how dpm is installed
 *
 * There are two runtimes that could be named here and each is closed off by one fact, so the pair
 * of facts settles the command and the install route together.
 *
 * **Node refuses to strip types from any `.ts` file underneath a `node_modules` directory** —
 * `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, on 22 and on 24, with no flag that lifts it. Epic
 * 01-05 found that by installing the package the documented way and watching the server fail: the
 * host had 23 skills registered from the installed copy and zero tools, and nothing in the
 * interface said the skills were inert. Both OpenCode majors unpack a plugin under `node_modules` —
 * v1 to `$XDG_CACHE_HOME/opencode/packages/<spec>/node_modules/<name>/`, probed directly — so
 * `node bin/dpm-mcp.ts` runs in a checkout and cannot run in an installed package.
 *
 * **The host's own bun has no `node:sqlite`.** 01-05 answered the paragraph above by spawning the
 * host binary in bun mode (`BUN_BE_BUN=1`), a runtime with no such restriction, and recorded that
 * it "carries `node:sqlite`". That was measured against `opencode2` — bun 1.4.0 — and it is not
 * true of the bun compiled into OpenCode v1 1.18.25, which is 1.3.14 and answers
 * `No such built-in module: node:sqlite`. Under v1 the host does not fail loudly either: it blocks
 * waiting for the server it just registered, and the skills that would have loaded after it never
 * do.
 *
 * **So the runtime is `node` and the install is a checkout**, which is where a `.ts` source is one
 * Node will read. Epic 02-01 story 5 established both halves live against 1.18.25 rather than
 * inferring either, and the install route the README documents follows from them rather than being
 * a separate preference. What would reopen the packaged install is `src/db/connection.ts` choosing
 * `bun:sqlite` under bun — it is the one value import of `node:sqlite` in `src/`, and v1's bun does
 * carry `bun:sqlite` and does read TypeScript from `node_modules`. That is storage-layer work and
 * not a registrar's.
 *
 * **NFR2 is untouched throughout.** No artefact is produced and nothing is compiled: the command is
 * one runtime and one `.ts` source, as it was before.
 */

import { join } from 'node:path';

import { SERVER_EXECUTABLE } from './root.ts';

/** A local MCP server entry, in the shape `Mcp.LocalConfig` describes. */
export type LocalServer = {
  readonly type: 'local';
  readonly command: readonly string[];
};

/** The runtime the server is spawned with. Named once, so a reader finds it in one place. */
export const RUNTIME = 'node';

/**
 * The bundled server, as the host's registry wants it.
 *
 * Takes the root rather than computing it, so the caller resolves once and every path it hands out
 * comes from the same answer — ADR 01-07's "compute before the transform", applied to the input as
 * well as to the output.
 *
 * **There is no branch on the host runtime, and the absence is the decision.** One stood here,
 * naming the host's own binary in bun mode wherever `process.versions.bun` was set. It was correct
 * against v2 and wrong against v1, whose bun has no `node:sqlite`, and a branch that picks the
 * broken runtime precisely when it is running under the supported host is worse than no branch —
 * the file comment holds why.
 *
 * @param root The package root, as `packageRoot()` returned it.
 * @returns {LocalServer}
 */
export function localServer(root: string): LocalServer {
  return { type: 'local', command: [RUNTIME, join(root, SERVER_EXECUTABLE)] };
}
