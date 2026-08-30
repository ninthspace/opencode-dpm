/**
 * Where this package is on disk, computed once and **checked against the tree it claims to be**.
 *
 * Everything the plugin registers is a path into this package: the MCP server's command, and every
 * skill's `location` and `content`. So a root computed one directory wrong does not fail here — it
 * fails at the host, as a server that will not start and a skill catalogue that is empty, with
 * nothing in either message naming this file.
 *
 * **That is not a hypothetical, it is the failure this fork was born from.** When dpm left the
 * marketplace, fifty tests went red at once because a `join(dirname, '..', '..')` written for a
 * directory two levels down was still being read two levels down from somewhere else. The shape
 * below is that same shape. What makes it safe is not care, it is the check: the root is only
 * returned once the server executable has been found underneath it, and the message names the
 * computed path and the file that was missing so the next reader is told where to look.
 *
 * `from` is a parameter rather than a closed-over constant so the check itself is drivable — a test
 * can hand it a directory with no executable under it and see the refusal, which is the only way to
 * know the check would fire.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** The server executable, relative to the package root. Also what proves the root is the root. */
export const SERVER_EXECUTABLE = join('bin', 'dpm-mcp.ts');

/** Where the skills live, relative to the package root. */
export const SKILLS_DIRECTORY = 'skills';

/**
 * The package root, or a refusal naming what was looked for and where.
 *
 * @param from The directory to resolve from. Defaults to this module's own, which is `src/plugin`.
 * @returns {string}
 */
export function packageRoot(from: string = import.meta.dirname): string {
  const root = join(from, '..', '..');

  if (!existsSync(join(root, SERVER_EXECUTABLE))) {
    throw new Error(
      `dpm: resolved its package root to ${root}, but ${SERVER_EXECUTABLE} is not there. `
      + 'Registering against this root would install an MCP server that cannot start, so it is '
      + 'refused here instead.',
    );
  }

  return root;
}
