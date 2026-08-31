/**
 * The tools entry — the MCP server, registered through v1's `config` hook. FR2.
 *
 * ## The shape, and why it is a named export with no default
 *
 * v1's own module type is `PluginModule = { id?, server, tui? }`: a **named** `server` export
 * that the host calls with its `PluginInput`, returning the hooks it wants. `Hooks.config` is
 * handed the resolved configuration before the host uses it, and `config.mcp` is the only handle
 * v1's plugin API offers on the MCP registry — the object route's context has no `mcp` domain, and
 * the v1 SDK's `Config` has no skill field, which is why the skills live in a second module and
 * not in this one. `registration.ts` carries that argument in full, with the probes it rests on.
 *
 * **There is no default export here and that is load-bearing rather than incidental.** A module
 * carrying both a callable `server` and a default `{ id, setup }` evaluates and then stalls v1's
 * loader — neither hook runs — where the same two bodies in two files both run. So this file
 * exports one route and `skills-entry.ts` exports the other.
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

import { serverEntry } from './registration.ts';

/** The name the server is registered under, which is the second `dpm` in its tool prefix. */
export const SERVER_NAME = 'dpm';

/**
 * dpm's tools, as v1 wants them.
 *
 * The entry is computed once, outside the hook, so the value the hook sets is the same one on every
 * call the host makes — ADR 01-07 applied to the one registration this module performs.
 *
 * **It reads neither of the arguments v1 offers, which is a claim worth being able to see.** The
 * server dpm registers is the one it ships: the command is this package's own executable under this
 * package's own root, so there is nothing the host could say that would change it, and no option
 * selects a different one. The profile — the one thing a user does configure — selects skills, and
 * is read in the module that registers them.
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
