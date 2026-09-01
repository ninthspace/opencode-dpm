/**
 * The skills this package holds, **read from the tree and never listed** — FR3, ADR 01-05.
 *
 * A named list is the thing that goes stale silently: a skill added after the list was written is
 * precisely the one nobody thought about, and the plugin goes on registering twenty-three while
 * twenty-four are on disk. `tests/support/skills.js` reaches the same conclusion for the same
 * reason and reads the directory too; the difference is only that this one runs in the host.
 *
 * **Names are prefixed `dpm-`, the prefix is the decision rather than a convention, and this file no
 * longer applies it.** ADR 01-05: the host's skill namespace is flat and last-source-wins, so an
 * unprefixed `review` or `status` is silently replaced by whatever registers after it — which
 * presents as a skill behaving oddly, not as a collision anybody sees. The ADR also records that
 * this is effectively permanent from the first publish, because renaming a registered name breaks
 * every invocation of it.
 *
 * **What changed in epic 02-02 is where the prefix originates, and nothing else.** It used to be an
 * `ID_PREFIX` constant here, composed onto a directory called `do` to make `dpm-do`; the tree knew
 * nothing about it, so a skill's identity was half on disk and half in this file. Now the directory
 * *is* `dpm-do` and its front matter declares that string, and registration reads it. The name that
 * comes out is byte-identical, which is what makes the move safe at all — see the epic's own
 * section on it. The decision is unchanged; it simply lives in one place.
 *
 * The front-matter reader is deliberately shallow, in the same way and for the same reason as the
 * one in the test support module: the fields a skill declares are flat strings, and a parser
 * richer than the format invites assertions the format cannot carry.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SKILLS_DIRECTORY } from './root.ts';

/** The one file every skill directory has, and the only one this reads. */
export const SKILL_FILE = 'SKILL.md';

/** Where the shared procedures live, relative to the package root. */
export const SHARED_DIRECTORY = 'shared';

/**
 * How the skill bodies name a shared procedure file: `dpm/shared/<name>.md`.
 *
 * That path was resolvable under Claude Code, which laid the plugin out beneath a directory called
 * `dpm` and ran the model in it. Under v2 it resolves against nothing: the model's file tools work
 * from the *project* directory, and a user's project has no `dpm/shared/` in it. Twenty-three
 * skills open with "read that file at startup", so left alone every one of them would begin by
 * failing to read its own conventions.
 */
const SHARED_REFERENCE = /\bdpm\/shared\/([A-Za-z0-9_-]+\.md)\b/g;

/**
 * A skill body with its shared-procedure references made absolute — the supporting-files answer.
 *
 * **The alternative the specification named was inlining the conventions into all twenty-three
 * bodies, and this is cheaper in every direction.** Inlining puts 15KB of identical prose into each
 * skill, turns one file into twenty-three copies that drift, and costs the model context on every
 * invocation whether it needed the conventions or not. Substituting the path costs one regex, keeps
 * the single copy the whole convention system depends on, and leaves the bodies readable as
 * sources: what a maintainer edits still says `dpm/shared/skill-conventions.md`.
 *
 * **The substitution refuses rather than guesses.** A path rewritten to a file that is not there is
 * worse than the original — the original fails visibly at the first read, and a confident absolute
 * path to nothing fails the same way while looking correct. So the target is checked, and a missing
 * one throws at registration where the message can name it.
 *
 * @param content The skill's own text.
 * @param root The package root, as `packageRoot()` returned it.
 * @returns {string}
 */
export function resolveSupportingPaths(content: string, root: string): string {
  return content.replaceAll(SHARED_REFERENCE, (matched, file: string) => {
    const absolute = join(root, SHARED_DIRECTORY, file);

    if (!existsSync(absolute)) {
      throw new Error(
        `dpm: a skill names ${matched}, which resolves to ${absolute}, and that file is not in the `
        + 'package. Registering the skill would advertise a reference the model cannot follow.',
      );
    }

    return absolute;
  });
}

/**
 * A skill as the host's registry wants it.
 *
 * **`id` came out with `ID_PREFIX`, and it was the same field twice.** It held the prefixed string
 * and `name` held the bare one; every caller that registered a skill reached for `id` and every
 * caller that identified one reached for `name`, which is two answers to *what is this skill
 * called* and a standing invitation to pick the wrong one. There is one name now.
 */
export type DiscoveredSkill = {
  readonly name: string;
  readonly description?: string;
  readonly location: string;
  readonly content: string;
};

/**
 * The front matter as key/value pairs, shallow by design.
 *
 * @param source
 * @returns {Record<string, string>}
 */
export function frontMatter(source: string): Record<string, string> {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return {};

  return Object.fromEntries(match[1]!.split('\n')
    .map((line) => line.match(/^([a-z_]+):\s*(.*)$/))
    .filter((field) => field !== null)
    .map((field) => [field[1]!, field[2]!.trim()]));
}

/**
 * Every skill in the package, in directory order.
 *
 * A directory with no `SKILL.md` is skipped rather than refused: the tree is the plugin's own, so
 * a stray directory is an editor artefact rather than a user error, and refusing to register
 * twenty-three skills over one of those would be the worse failure.
 *
 * The `name` comes from the front matter rather than from the directory name. They agree — that is
 * `skill-identity.test.js`'s first criterion, over the whole tree — and taking the declared one
 * means a skill that renames itself renames in the catalogue, rather than registering under a
 * directory name nothing else uses. The fallback to the directory is for a body with no front
 * matter at all, which the same test refuses; it is here so discovery has an answer rather than
 * `undefined` to hand the host.
 *
 * @param root The package root, as `packageRoot()` returned it.
 * @returns {DiscoveredSkill[]}
 */
export function discoverSkills(root: string): DiscoveredSkill[] {
  const skills = join(root, SKILLS_DIRECTORY);

  return readdirSync(skills, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .flatMap((directory) => {
      const location = join(skills, directory);
      let content: string;

      try {
        content = readFileSync(join(location, SKILL_FILE), 'utf8');
      } catch {
        return [];
      }

      const declared = frontMatter(content);
      const name = declared.name ?? directory;

      return [{
        name,
        ...(declared.description === undefined ? {} : { description: declared.description }),
        location,
        content: resolveSupportingPaths(content, root),
      }];
    });
}
