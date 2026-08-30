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
 * ## Why the runtime is chosen rather than written down
 *
 * The command said `node` until epic 01-05 installed the package by the documented route and
 * watched the server fail to start. **Node refuses to strip types from any `.ts` file underneath a
 * `node_modules` directory** — `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, on 22 and on 24, with
 * no flag that lifts it — and OpenCode installs every plugin to
 * `$XDG_CACHE_HOME/opencode/packages/git-<digest>/node_modules/<name>/`. So `node bin/dpm-mcp.ts`
 * runs in the checkout and cannot run in the artefact, which is the only copy a user ever has. The
 * install registered 23 skills and zero tools, and nothing in the interface said the skills were
 * inert.
 *
 * **What the plugin already has is the runtime that has no such restriction.** OpenCode loads
 * plugin entrypoints with the bun compiled into `opencode2`, which is why this very file ran at all
 * from inside `node_modules`. `process.execPath` is that binary, and a bun-compiled executable
 * honours `BUN_BE_BUN=1` by behaving as the bun CLI — so the host's own runtime can be handed the
 * source directly. It reads TypeScript from anywhere and carries `node:sqlite`, which are the two
 * things the server needs.
 *
 * **This is not a build step and does not weaken NFR2.** No artefact is produced, nothing is
 * compiled, and what is spawned is still one runtime and one `.ts` source. The change is which
 * runtime, and it is *detected* rather than assumed: `node` remains the answer wherever the host is
 * not bun, which is every path the suite exercised before this and the reason that branch stays.
 */

import { join } from 'node:path';

import { SERVER_EXECUTABLE } from './root.ts';

/** A local MCP server entry, in the shape `Mcp.LocalConfig` describes. */
export type LocalServer = {
  readonly type: 'local';
  readonly command: readonly string[];
  readonly environment?: Readonly<Record<string, string>>;
};

/**
 * How the host is running us, which decides what the server is spawned with.
 *
 * Both fields are read from `process` by the caller's default rather than in here, so a test can
 * drive either branch without a subprocess — the same reason `packageRoot` takes its `from`.
 */
export type Runtime = {
  /** `process.versions.bun`, present only under bun. */
  readonly bun?: string | undefined;
  /** `process.execPath` — under a bun-compiled host, the host binary itself. */
  readonly execPath: string;
};

/** What a bun-compiled standalone executable reads to behave as the bun CLI instead of as itself. */
export const BE_BUN = 'BUN_BE_BUN';

/**
 * The bundled server, as the host's registry wants it.
 *
 * Takes the root rather than computing it, so the caller resolves once and every path it hands out
 * comes from the same answer — ADR 01-07's "compute before the transform", applied to the input as
 * well as to the output.
 *
 * @param root The package root, as `packageRoot()` returned it.
 * @param runtime How the host is running us. Defaults to this process.
 * @returns {LocalServer}
 */
export function localServer(root: string, runtime: Runtime = {
  bun: process.versions.bun,
  execPath: process.execPath,
}): LocalServer {
  const executable = join(root, SERVER_EXECUTABLE);

  // Under a bun host, spawn the host's own binary in bun mode. `environment` is a field
  // `Mcp.LocalConfig` already carries, so this needs nothing of the host it did not offer.
  if (runtime.bun) {
    return {
      type: 'local',
      command: [runtime.execPath, executable],
      environment: { [BE_BUN]: '1' },
    };
  }

  return { type: 'local', command: ['node', executable] };
}
