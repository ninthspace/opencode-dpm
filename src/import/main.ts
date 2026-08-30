/**
 * Importing as a command: rebuild the database from the committed dump (FR8).
 *
 * Separated from `bin/dpm-import.ts` for the reason `guard/main.ts` is separated from
 * `bin/dpm-guard.ts` — the entry point must reach `node:sqlite` through `await import` and nothing
 * else, so the Node floor check runs before the module that needs the floor is evaluated.
 *
 * **This is the merge without the merge.** Everything it does is `src/rebuild/`, shared with
 * `dpm-merge` under AD16: restore into a staging file, rename it into place, prove the dump survives
 * its own restore, publish both artefacts, re-guard. What the merge adds is reading git's three
 * stages and reconciling them; a dump that arrived in a pull has one side and needs none of it.
 *
 * **The sync point is recorded, and not from here** (AD13). AD13 says the marker is written by both
 * publish and import, and this module contains no write: the rebuild publishes, publish records the
 * marker from what the database dumps, and the round-trip check one line above has already proven
 * that is the dump on disk. A write here would be a second answer to when the sync point is
 * recorded, and two answers to that question is how the marker comes to describe a state neither
 * artefact is in.
 *
 * **It is a binary and not a tool.** The guard's dump-moved verdict tells a person what to run, and
 * this is the thing they run — AD11's reasoning about provisional writes says an operation that
 * overwrites the database from a committed file is one a human triggers after reading a diagnostic,
 * not one an agent reaches for mid-facilitation.
 *
 * **Nothing is staged.** The tool writes files and stops, the same rule the guard and the merge
 * follow: an import that staged its own output would replace the database and record the
 * replacement in one step, with no review between them.
 */

import { join } from 'node:path';
import { DATABASE } from '../db/location.ts';
import { contents, DUMP_PATH } from '../guard/index.ts';
import { rebuild, RebuildError, report } from '../rebuild/index.ts';

/** Where the report goes. One copy per executable, as the JSDoc typedef it replaces was. */
type Streams = { out: (text: string) => void; err: (text: string) => void };

/**
 * Run the import.
 *
 * @param {object} [options]
 * @param {string} [options.root] The repository root.
 * @param {string} [options.location] The database to rebuild from the committed dump.
 * @param {Streams} [options.streams] Injected so a test reads the report rather than a process's
 *   stdout — and so the exit code and the text are asserted from the same call.
 * @returns {number} 0 imported, 2 the import could not run.
 */
export function run({ root = '.', location = DATABASE, streams }: {
  root?: string; location?: string; streams?: Streams;
} = {}): number {
  const out = streams?.out ?? ((text: string) => { process.stdout.write(text); });
  const err = streams?.err ?? ((text: string) => { process.stderr.write(text); });

  const sql = contents(join(root, DUMP_PATH));

  // **A missing dump is the one refusal that is this command's own.** Everything past here is the
  // shared rebuild and its messages are worded for both callers; this one cannot be, because the
  // merge reaches the rebuild with a dump it produced and can never arrive without one.
  if (sql === null) {
    err(`dpm: cannot import ${DUMP_PATH} — there is no dump there. It is committed, so a checkout `
      + 'that has one is the thing to get, not a file to write.\n');

    return 2;
  }

  let removed = [];

  try {
    ({ removed } = rebuild(sql, { root, location }));
  } catch (error) {
    // Anything that is not a refusal is a bug, and a bug reported as an exit code is a bug nobody
    // sees. Re-thrown for the same reason the merge re-throws it.
    if (!(error instanceof RebuildError)) throw error;

    err(`${error.message}\n`);

    return 2;
  }

  // `docs` alone, and the dump is deliberately not in it: the file this rebuilt from is the one that
  // arrived in the pull and is already committed, so a `git add` naming it would stage a path with
  // nothing to stage — or, on the day the two disagree, hide that they do.
  const lines = [
    `dpm: ${location} rebuilt from ${DUMP_PATH}`,
    ...report({ removed }, { root, stage: 'git add docs' }),
  ];

  out(`${lines.join('\n')}\n`);

  return 0;
}
