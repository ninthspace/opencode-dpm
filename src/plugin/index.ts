/**
 * The plugin entry — the MCP server, registered through v1's `config` hook. FR2.
 *
 * **This is the whole plugin.** dpm shipped a second entry until epic 02-05 story 2, which
 * registered the skills through the object route's `skill.transform`. That route is fed by the
 * `plugins` config key, and 1.18.25 strips the key before any loader sees it — so the module had no
 * host to run on and was deleted. The skills reach the host through the `skills` config key
 * instead, pointed at this package's `skills/` directory. `registration.ts` carries that argument in
 * full, with the diagnostic it rests on.
 *
 * ## The shape, and why it is a named export with no default
 *
 * v1's own module type is `PluginModule = { id?, server, tui? }`: a **named** `server` export
 * that the host calls with its `PluginInput`, returning the hooks it wants. `Hooks.config` is
 * handed the resolved configuration before the host uses it, and `config.mcp` is the only handle
 * v1's plugin API offers on the MCP registry.
 *
 * **There is no default export here and that is load-bearing rather than incidental.** With one
 * present the loader takes the object route instead, and refuses the module outright unless the
 * default carries a `server()` of its own.
 *
 * **And `server` is the only export, which is a second rule and a harder one.** The published type
 * describes the export the host *calls* and says nothing about the module's other exports, so it
 * reads as though a constant could sit beside the route. It cannot: 1.18.25 walks every export and
 * requires each to be a plugin, and one non-function export fails the whole module with
 * `Plugin export is not a function`. Epic 02-05 story 2 found that against the running CLI after
 * 1185 green tests had not — every one of them reached into this module and called `server` itself,
 * which is a question about this file rather than about the host. The single-variable probe is in
 * `registration.ts` beside `SERVER_NAME`, which is the constant that used to be here.
 *
 * `plugin-entry.test.js` holds this module to one export, so the next constant that wants to live
 * here fails a test rather than a session.
 *
 * ## What stays true from before the host changed
 *
 * **`@opencode-ai/plugin-v1` is imported for its types and nothing else, and that is NFR1.** The
 * SDK would pull `effect`, `zod` and six more packages into every user's install; `import type` is
 * erased by both Node's type-stripper and `tsc` before anything is evaluated. So `dependencies`
 * stays empty and a user installing dpm installs nothing at all.
 *
 * **Nothing here writes to disk.** Registration is a description handed to the host; the project's
 * configuration is the user's file and the plugin has no business editing it. Setting `config.mcp`
 * mutates the object v1 passed in for exactly that purpose and touches no file. The only writes dpm
 * ever performs are the ones the MCP server makes under `.dpm/`, in the process the host spawns,
 * long after this has returned.
 */

import type { Plugin } from '@opencode-ai/plugin-v1';

import { SERVER_NAME, serverEntry } from './registration.ts';

/**
 * dpm's tools, as v1 wants them.
 *
 * The entry is computed once, outside the hook, so the value the hook sets is the same one on every
 * call the host makes — ADR 01-07 applied to the one registration this module performs.
 *
 * **It reads neither of the arguments v1 offers, which is a claim worth being able to see.** The
 * server dpm registers is the one it ships: the command is this package's own executable under this
 * package's own root, so there is nothing the host could say that would change it, and no option
 * selects a different one. The profile — the one thing a user could configure — selected skills, and
 * the host now reads those from a directory that takes no options; `registration.ts` records what
 * that costs.
 *
 * The existing `mcp` block is spread rather than replaced: it is the user's, and dpm is adding one
 * key to it.
 */
export const server: Plugin = async () => {
  const entry = serverEntry();

  return {
    config: async (config) => {
      // The registry's own type is mutable where `LocalServer` is `readonly`, so the arrays are
      // copied rather than cast. dpm holds one entry and hands out copies of it; a host that later
      // edited what it was given would otherwise be editing the value every subsequent call reads.
      config.mcp = {
        ...config.mcp,
        [SERVER_NAME]: { ...entry, command: [...entry.command] },
      };
    },
  };
};
