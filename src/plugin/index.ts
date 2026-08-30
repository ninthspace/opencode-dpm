/**
 * The plugin entry — what OpenCode v2 loads, and the whole of what it registers.
 *
 * Two registrations: the bundled MCP server (FR2), and the skills (FR3). Both are computed
 * *before* either transform runs, which is ADR 01-07 and is not a stylistic preference — the host
 * replays transforms on reload, so a transform that reads mutable state observes something
 * different on the replay than it did the first time, and the bug appears only after an edit and
 * reads as flakiness. Computing up front makes the replay identical by construction.
 *
 * **`@opencode-ai/plugin` is imported for its types and nothing else, and that is NFR1.** The SDK's
 * `Plugin.define` is `define(plugin) { return plugin }` — the identity function — so importing it
 * at runtime would pull `effect`, `zod` and six more packages into every user's install in order to
 * call a function that returns its argument. `satisfies Plugin.Plugin` is the same compile-time
 * check `define` performs, and `import type` is erased by both Node's type-stripper and `tsc`
 * before anything is evaluated. So `dependencies` stays empty and a user installing dpm installs
 * nothing at all.
 *
 * **Nothing here writes to disk.** Registration is a description handed to the host; the project's
 * configuration is the user's file and the plugin has no business editing it. The only writes dpm
 * ever performs are the ones the MCP server makes under `.dpm/`, in the process the host spawns,
 * long after this has returned.
 */

import type { Plugin } from '@opencode-ai/plugin';
import type { Skill } from '@opencode-ai/schema/skill';

import { profileFrom } from './profile.ts';
import { packageRoot } from './root.ts';
import { localServer } from './server.ts';
import { discoverSkills, type DiscoveredSkill } from './skills.ts';

/** The name the server is registered under, which is the second `dpm` in its tool prefix. */
export const SERVER_NAME = 'dpm';

/**
 * A discovered skill in the shape the host's registry types demand.
 *
 * `Skill.ID`, `Skill.Name` and `AbsolutePath` are branded strings — nominal types effect uses to
 * stop an arbitrary string being passed where a validated one belongs. There is no constructor
 * exported for them that does not also pull the runtime in, and asserting is honest here: the id
 * is prefixed by construction, the name comes from the skill's own front matter, and the location
 * is `join`ed onto a root that was checked before it was returned.
 */
const registrable = (skill: DiscoveredSkill): Skill.Info => ({
  ...skill,
  id: skill.id as Skill.ID,
  name: skill.name as Skill.Name,
  location: skill.location as Skill.Info['location'],
});

export default {
  id: 'dpm',

  async setup(context) {
    // Everything the transforms will need, resolved before either of them runs.
    const root = packageRoot();
    const server = localServer(root);
    const skills = profileFrom(context.options).skills(discoverSkills(root)).map(registrable);

    const registered = [
      await context.mcp.transform((draft) => draft.set(SERVER_NAME, server)),
      await context.skill.transform((draft) => {
        for (const skill of skills) draft.add(skill);
      }),
    ];

    // Disposal in reverse, so the registry unwinds in the order it was built.
    return async () => {
      for (const registration of registered.reverse()) await registration.dispose();
    };
  },
} satisfies Plugin.Plugin;
