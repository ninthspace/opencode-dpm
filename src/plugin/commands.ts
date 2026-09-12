/**
 * A slash command per skill, so the host stops pasting whole skill bodies into the prompt.
 *
 * **The host already makes every skill a command, and that is the problem rather than the gap.**
 * It assembles its command list from the configured `command` entries first and then adds one per
 * skill for every name not already taken — and the command it generates carries `template:
 * skill.content`, the entire `SKILL.md`. So `/dpm-epics` puts twenty-four thousand characters of
 * markdown into the user's own turn before anything has happened. The instructions do have to
 * reach the model, and the `skill` tool exists to deliver them; what nobody needs is to read them.
 *
 * **So these are overrides, not additions.** Each is named exactly as its skill is named, which is
 * what displaces the generated one — `name` is the whole of the match, and a command DPM registers
 * under a name the tree does not use would leave the pasting entry in place beside it and add a
 * second, broken route. `commands-route.test.js` compares the two sets for that reason.
 *
 * **What this costs, stated plainly.** The generated command guarantees the instructions arrive,
 * because they *are* the prompt; this one asks the model to fetch them, and a model that does not
 * call the tool runs a DPM skill without having read it. That is a real trade and it was made
 * deliberately: the template names the tool and the skill and says nothing else, which is the
 * shortest instruction that can be followed, and `permission.skill` — which the generated route
 * bypasses entirely, never calling the tool it is permission for — starts applying again.
 *
 * Nothing here reads the skill bodies. The template is built from the skill's *name*, so the
 * twenty-three entries cost the length of twenty-three names rather than of the tree.
 */

import { discoverSkills } from './skills.ts';
import { packageRoot } from './root.ts';

/** One entry of the host's `command` config, as much of it as DPM sets. */
export type SkillCommand = {
  template: string;
  description?: string;
};

/**
 * The prompt that replaces a pasted skill body.
 *
 * **`$ARGUMENTS` is how the user's request reaches the skill, and it is the only way it can.** A
 * `SKILL.md` in this package is a static file — the port's skills say "the request is the change
 * description" rather than interpolating a placeholder, because v1 reads the file off disk and
 * never offers the plugin a chance to fill one in. So whatever follows `/dpm-quick` has to be put
 * into the turn here or it is not in the conversation at all.
 *
 * It is left bare on its own line rather than introduced ("The request:"), because each skill
 * names its own input in its own words and a label written here would be a second, weaker name for
 * it. With no arguments the line is empty, which is the state every skill's Input section already
 * has an answer for.
 *
 * @param name The skill's declared name, which is also the command's.
 * @returns {string}
 */
export const templateFor = (name: string): string => `Load the ${name} skill with the skill tool, then follow it.\n\n$ARGUMENTS\n`;

/**
 * One command per skill in the package, keyed by the name the skill declares.
 *
 * @returns {Record<string, SkillCommand>}
 */
export function skillCommands(): Record<string, SkillCommand> {
  return Object.fromEntries(discoverSkills(packageRoot()).map((skill) => [
    skill.name,
    {
      template: templateFor(skill.name),
      // The generated command carries the skill's own description and this one keeps it, so the
      // command list reads exactly as it did. Replacing it with something shorter would be a
      // second description of the skill, maintained here and drifting from the front matter.
      ...(skill.description === undefined ? {} : { description: skill.description }),
    },
  ]));
}
