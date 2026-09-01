/**
 * What the two plugin entries register, computed here so that neither entry computes it.
 *
 * ## Why there are two entries at all
 *
 * OpenCode 1.18.25 has two plugin protocols and dpm needs one thing from each. The **callable
 * route** — a module exporting `server`, which the host calls with its `PluginInput` — returns
 * `Hooks`, and `Hooks.config` is the only handle v1 offers on the MCP registry. The **object
 * route** — a module default-exporting `{ id, setup }` — is handed a nine-domain context, and
 * `skill.transform` is the only handle v1 offers on the skill registry. Neither route has the
 * other's: the v1 SDK's `Config` carries `mcp` and no skill field at all, and the object route's
 * context carries no `mcp` domain.
 *
 * **And one module cannot carry both**, which was probed rather than assumed. A file exporting a
 * callable `server` *and* a default `{ id, setup }` evaluated and then stalled the loader: neither
 * hook ran and the CLI produced no output at all. The control is that the same two hook bodies, in
 * two files, both ran in one session — `config` set `mcp.dpm` and `setup` was called with the nine
 * domains. Two files it is.
 *
 * Two other routes to a single entry were tried and closed, both with controls:
 *
 * - **The `config` hook cannot bootstrap the second module.** `config.plugin` is writable and the
 *   hook really did append to it — the array's contents before the write are in the probe report —
 *   and the appended module never evaluated. The plugin list is resolved before `config` runs.
 * - **`plugin.add` cannot bootstrap the first.** Its type is `(plugin: { id, effect }) => …` and
 *   what it hands the added plugin is another `PluginContext`, so a plugin added that way gets the
 *   same nine domains and still no MCP registry.
 *
 * ## Why the two computations are here rather than in the entries
 *
 * Both entries resolve the same package root through `packageRoot`, which is what stops the server
 * command and the skill locations disagreeing about where dpm is installed. Keeping the two
 * computations side by side is what makes that shared root visible; splitting them into the entries
 * would leave two files each resolving a root and agreeing by habit.
 *
 * **They are two functions rather than one, though, and the split is deliberate.** Discovering the
 * skills reads twenty-three files and throws when a skill names a shared procedure that is not in
 * the package. Folding that into the tools entry would mean a skill-body problem taking down the
 * MCP registration, which is the one part of dpm that has nothing to do with skills.
 *
 * **Everything a transform reads is resolved before any transform runs** — ADR 01-07. The host
 * replays transforms on reload, so a transform reading mutable state observes something different
 * on the replay, and the bug appears only after an edit and reads as flakiness. Each entry calls
 * its function once, above its transform.
 */

import type { SkillDraft } from '@opencode-ai/plugin-v1/v2/promise';

import { profileFrom } from './profile.ts';
import { packageRoot } from './root.ts';
import { localServer, type LocalServer } from './server.ts';
import { discoverSkills, type DiscoveredSkill } from './skills.ts';

/**
 * A skill source as v1's registry wants it, taken from the draft rather than named.
 *
 * **The type is read off `SkillDraft['source']` so that it comes from the host SDK the manifest
 * declares.** Naming `SkillV2Source` directly would reach `@opencode-ai/sdk`, and the shape's
 * other home — `@opencode-ai/schema` — is declared in no manifest and resolves only because npm
 * hoists it out of a transitive. Either would be a type this project depends on and does not ask
 * for. `Parameters<…>` gets the same shape through the door that is already open.
 */
export type SkillSource = Parameters<SkillDraft['source']>[0];

/**
 * One discovered skill, as an embedded source.
 *
 * **`embedded` rather than `directory`, and the difference is not a preference.** A directory
 * source hands v1 a path and lets it read the tree, which would register the skills under their
 * *directory* names — and the `dpm-` prefix ADR 01-05 turns on would be lost, because a host that
 * reads the tree never sees what discovery computed.
 *
 * **The bodies themselves are now identical either way, and that is epic 02-03's doing.** Discovery
 * used to rewrite `dpm/shared/*.md` into an absolute path as it read each body, so an embedded
 * source carried something a directory source could not have produced. FR4 and ENVX2 record the
 * concern that motivated it — a host reading `SKILL.md` verbatim off disk leaves that rewrite
 * nowhere to run — and the answer taken was to remove the rewrite rather than to require the hook.
 * The shared documents are behind `read_shared_document`, discovery transforms nothing, and what
 * the host stores is byte for byte what a maintainer opened. The prefix is the only reason left for
 * `embedded`, and it is reason enough.
 *
 * **The prefix rides on `name`, and that is FR5 rather than a liberty taken with ADR 01-05.** What
 * v1 keeps of a skill is `{ name, description, location, content }` and nothing else — an `id`
 * passed alongside them is dropped by the host's own decode, which is observed rather than read off
 * a type. So `name` *is* the keyspace here, it is flat, and a later registration of `do` wins. ADR
 * 01-05's decision is unchanged — namespace the skills so another source's `review` or `status`
 * cannot silently take dpm's place — and only the field carrying it moves. It lands where the rest
 * of the project already points: the README's `{"action":"skill","resource":"dpm-*"}` rule matches
 * on the name v1 evaluates, which is FR7, and every skill description already says *invoke with the
 * id `dpm-…`*, which stays true when the name is that string.
 *
 * **Nothing here composes that prefix, and epic 02-02 story 2 is why.** This function used to read
 * `skill.id` — a string discovery built by prepending `ID_PREFIX` to a directory called `do` — so
 * the namespace defence was applied at registration to a tree that did not carry it, and a skill's
 * identity was half on disk and half in a constant. The directories are named `dpm-<skill>` now and
 * each declares that same name in its own front matter, so the field is copied rather than
 * constructed. The string that reaches the host is byte-identical to the one that reached it
 * before; a criterion pins that, because ADR 01-05 records a registered name as effectively
 * permanent from the first publish.
 *
 * @param skill One skill, as discovery found it.
 * @returns {SkillSource}
 */
const embedded = (skill: DiscoveredSkill): SkillSource => ({
  type: 'embedded',
  skill: {
    name: skill.name,
    ...(skill.description === undefined ? {} : { description: skill.description }),
    location: skill.location,
    content: skill.content,
  },
});

/**
 * The MCP server entry the tools entry sets into `config.mcp` — FR2.
 *
 * @returns {LocalServer}
 */
export function serverEntry(): LocalServer {
  return localServer(packageRoot());
}

/**
 * The skill sources the skills entry hands to `skill.transform` — FR3.
 *
 * @param options Whatever the host was configured with. Selects the profile; an unknown name is
 *   refused by name rather than treated as the default.
 * @returns {readonly SkillSource[]}
 */
export function skillSources(
  options: Readonly<Record<string, unknown>> = {},
): readonly SkillSource[] {
  const root = packageRoot();

  return profileFrom(options).skills(discoverSkills(root)).map(embedded);
}
