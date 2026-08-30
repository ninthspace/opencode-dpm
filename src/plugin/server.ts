/**
 * The MCP server entry the plugin sets into the host's registry — FR2.
 *
 * A local server is a command the host spawns, and this one is `node` followed by a TypeScript
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
 */

import { join } from 'node:path';

import { SERVER_EXECUTABLE } from './root.ts';

/** A local MCP server entry, in the shape `Mcp.LocalConfig` describes. */
export type LocalServer = {
  readonly type: 'local';
  readonly command: readonly string[];
};

/**
 * The bundled server, as the host's registry wants it.
 *
 * Takes the root rather than computing it, so the caller resolves once and every path it hands out
 * comes from the same answer — ADR 01-07's "compute before the transform", applied to the input as
 * well as to the output.
 *
 * @param root The package root, as `packageRoot()` returned it.
 * @returns {LocalServer}
 */
export function localServer(root: string): LocalServer {
  return { type: 'local', command: ['node', join(root, SERVER_EXECUTABLE)] };
}
