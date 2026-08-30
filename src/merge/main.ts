/**
 * The merge as a command: read git's three stages, merge, and leave the tree consistent.
 *
 * Separated from `bin/dpm-merge.ts` for the reason `guard/main.ts` is separated from
 * `bin/dpm-guard.ts` — the entry point must reach `node:sqlite` through `await import` and nothing
 * else, so the Node floor check runs before the module that needs the floor is evaluated.
 *
 * **Nothing is staged.** The tool writes files and stops; `git add` is the user's, exactly as it is
 * with the guard. A merge tool that staged its own output would make the resolution of a conflict
 * something that happened without a review.
 *
 * **What is left here is the merge and nothing else.** Reading git's three stages, merging them,
 * and reporting — everything after that is `src/rebuild/`, shared with the import (AD16), because
 * rebuilding a database from a dump is the same operation whether the dump came out of a conflict
 * or out of a pull.
 */

import { execFileSync } from 'node:child_process';
import { DATABASE } from '../db/location.ts';
import { DUMP_PATH } from '../guard/index.ts';
import { rebuild, RebuildError, report } from '../rebuild/index.ts';
import { describe, merge } from './index.ts';
import { MergeError } from './rows.ts';

/** git's numbering of the three sides of a conflict. Keyed by the stage as `ls-files` prints it. */
const SIDES: Record<string, string> = { 1: 'base', 2: 'ours', 3: 'theirs' };

/**
 * The three sides of the conflict on `path`, read out of the index.
 *
 * Read by blob sha from `git ls-files -u` rather than by `git show :N:path`, because the pathspec
 * form has to be quoted the way git expects and the sha form does not — and because the same
 * command establishes whether there is a conflict at all. An empty listing is not an error here;
 * it is the answer to "is this a conflicted merge", and the caller turns it into one.
 *
 * @param {string} root
 * @param {string} path
 * @returns {Record<string, string>} `base`, `ours` and `theirs`, for whichever stages exist.
 */
export function stages(root: string, path: string): Record<string, string> {
  const listed = execFileSync('git', ['ls-files', '-u', '--', path], {
    cwd: root,
    encoding: 'utf8',
  });

  const found: Record<string, string> = {};

  for (const line of listed.split('\n')) {
    if (line.trim() === '') continue;

    // `<mode> <sha> <stage>\t<path>`
    const [meta] = line.split('\t');
    const [, sha, stage] = meta.split(/\s+/);
    const side = SIDES[stage];

    if (!side) continue;

    found[side] = execFileSync('git', ['cat-file', 'blob', sha], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
    });
  }

  return found;
}

/** Where the report goes. One copy per executable, as the JSDoc typedef it replaces was. */
type Streams = { out: (text: string) => void; err: (text: string) => void };

/**
 * Run the merge.
 *
 * @param {object} [options]
 * @param {string} [options.root] The repository root.
 * @param {string} [options.location] The database to rebuild from the merged dump.
 * @param {Streams} [options.streams] Injected so a test reads the report rather than a process's
 *   stdout — and so the exit code and the text are asserted from the same call.
 * @returns {number} 0 merged, 1 refused, 2 the merge could not run.
 */
export function run({ root = '.', location = DATABASE, streams }: {
  root?: string; location?: string; streams?: Streams;
} = {}): number {
  const out = streams?.out ?? ((text: string) => { process.stdout.write(text); });
  const err = streams?.err ?? ((text: string) => { process.stderr.write(text); });

  let sides;

  try {
    sides = stages(root, DUMP_PATH);
  } catch (error) {
    err(`dpm: cannot read the merge from git — ${(error as Error).message}\n`);

    return 2;
  }

  if (!sides.ours || !sides.theirs) {
    err(
      `dpm: ${DUMP_PATH} is not in a conflicted merge — there is nothing here to resolve. Run this `
      + 'during a `git merge` that left it conflicted.\n',
    );

    return 2;
  }

  if (!sides.base) {
    // Stage 1 is absent when both sides added the file with no common ancestor. Every row then
    // looks new to both sides, and the merge would keep two copies of a shared history rather than
    // one. Saying so is the whole of the fix; guessing an empty ancestor is not.
    err(
      `dpm: ${DUMP_PATH} has no common ancestor in this merge — the two branches added it `
      + 'independently. There is no base to merge against, so the two databases have to be '
      + 'reconciled deliberately.\n',
    );

    return 2;
  }

  let result;

  try {
    // Cast because the three guards above are what establish the three stages are there — a fact
    // about the checks just made rather than about what `stages` can return.
    result = merge(sides as { base: string; ours: string; theirs: string });
  } catch (error) {
    if (!(error instanceof MergeError)) throw error;

    err(`dpm: ${error.message}\n`);

    return 2;
  }

  if (result.conflicts.length > 0) {
    err(`${describe(result)}\n`);

    return 1;
  }

  // **Everything past the merge itself is shared with the import** (AD16). The staging restore,
  // the rename into place, the round-trip check, the publish and the re-guard are identical for a
  // dump that arrived in a conflict and one that arrived in a pull, and the piece most easily lost
  // to a second copy is the staging file — four lines that read as caution and are correctness.
  //
  // The refusals are worded for both callers, so what a user sees here no longer says "merged".
  // That is FR8's one-message-from-one-implementation criterion spending a little specificity to
  // buy the thing the specificity kept breaking: two error strings kept in step by hand.
  let removed = [];

  try {
    // `!` because `sql` is null only alongside conflicts, and those returned above.
    ({ removed } = rebuild(result.sql!, { root, location }));
  } catch (error) {
    if (!(error instanceof RebuildError)) throw error;

    err(`${error.message}\n`);

    return 2;
  }

  // The dump is in the staging list because the merge is what produced it. On the other side of the
  // shared rebuild it arrived in a pull and is already committed, which is why the two callers
  // differ on this line and agree on everything `report` holds.
  const lines = [
    describe(result),
    ...report({ removed }, { root, stage: `git add ${DUMP_PATH} docs` }),
  ];

  out(`${lines.join('\n')}\n`);

  return 0;
}
