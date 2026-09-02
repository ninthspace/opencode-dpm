/**
 * What the plugin entry registers, computed here so that the entry does not compute it.
 *
 * ## There is one entry, and the skills do not come through a plugin at all
 *
 * This file used to open by explaining why there were two, and the explanation was right about the
 * protocols and wrong about the host. OpenCode 1.18.25 does have two plugin routes. The **callable
 * route** — a module exporting `server`, reached from the `plugin` config key — returns `Hooks`,
 * and `Hooks.config` is the only handle it offers on the MCP registry. The **object route** — a
 * module default-exporting `{ id, setup }` — is handed a nine-domain context whose `skill.transform`
 * is the only handle on the skill registry.
 *
 * **The object route is unreachable under 1.18.25, and that was read off the running host rather
 * than inferred.** It is fed by the `plugins` config key, and v1's configuration layer strips that
 * key before any loader sees it:
 *
 * ```
 * WARN configuration compatibility diagnostic path=["plugins"] kind=unsupported
 *      action="Omitted native setting that cannot be represented in V1"
 * ```
 *
 * The resolved configuration the host then serves from `/config` carries no `plugins` at all. Named
 * under `plugin` instead, the same module is refused by the legacy loader — *"must default export an
 * object with `server()`"* — and reshaping it to satisfy that would not help, because the v1 SDK's
 * `Hooks` interface has no skill member of any kind. So there is no arrangement of exports by which
 * a plugin registers a skill on this host. Epic 02-05 story 2 deleted the second entry rather than
 * keep a module with nowhere to run.
 *
 * **The skills reach the host through the `skills` config key instead** — *"Additional paths or URLs
 * to discover skills from"* — pointed at this package's `skills/` directory, which the host reads
 * itself. Verified against 1.18.25 from a project outside this checkout: 23 `dpm-*` skills in the
 * host's registry, the MCP server `connected`, and no compatibility diagnostic. The control is the
 * run beside it with the key removed, which registered 0.
 *
 * **ADR 01-05's namespace survives the move, because the host reads the same field the old
 * registration did.** A probe with a directory named `zzz-dirname` whose front matter declared
 * `name: probe-frontmatter` registered as `probe-frontmatter`: the front-matter name wins and the
 * directory name is ignored. What changed is the *failure* mode, and it got quieter — a `SKILL.md`
 * with no `name` field at all was dropped from the registry entirely, where `discoverSkills` would
 * have fallen back to the directory name. `skills-registered.test.js` holds both halves.
 *
 * FR5 and FR7 are undisturbed by the move for the same reason. What v1 keeps of a skill is
 * `{ name, description, location, content }`, `name` is the flat keyspace, and the README's
 * `{"action":"skill","resource":"dpm-*"}` permission rule matches on exactly the string the host now
 * reads out of the front matter. Every skill description already says *invoke with the id `dpm-…`*,
 * which stays true. What is lost is the skills half of ADR 01-08's profile seam: a profile selected
 * a subset at registration time, and a directory the host reads itself takes no options. Only `full`
 * — every skill in the package — has ever been defined, so nothing observable changes today, and the
 * seam still governs the tool surface. FR13's `lite` will need a different mechanism for its skill
 * half, and that is a note for whoever writes it rather than a debt against this epic.
 *
 * ## What is left here, and why it is still not in the entry
 *
 * One computation, kept out of `index.ts` because that module may export nothing but its route —
 * see `SERVER_NAME` below, which is the export that proved it.
 */

import { packageRoot } from './root.ts';
import { localServer, type LocalServer } from './server.ts';

/**
 * The name the MCP server is registered under, which is the second `dpm` in its tool prefix.
 *
 * **It lives here rather than in `index.ts` because the entry module may export nothing but its
 * route.** OpenCode 1.18.25 walks a plugin module's exports and treats each one as a plugin, so a
 * `const` beside the route fails the whole module with `Plugin export is not a function` — and the
 * failure is a single `ERROR` line in a log nobody reads, after which the host carries on with no
 * server registered and no tools behind the skills. That is not a deduction from the SDK's types,
 * which describe `PluginModule = { id?, server, tui? }` and say nothing about the other exports;
 * it is what the running CLI did in epic 02-05 story 2, isolated to one variable by a pair of
 * probes: a module exporting `server` alone loaded, and the same module with one string constant
 * added did not.
 */
export const SERVER_NAME = 'dpm';

/**
 * The MCP server entry the plugin sets into `config.mcp` — FR2.
 *
 * @returns {LocalServer}
 */
export function serverEntry(): LocalServer {
  return localServer(packageRoot());
}
