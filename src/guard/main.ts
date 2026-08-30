/**
 * The guard as a command: open the database, check, report, decide the exit code.
 *
 * Separated from `bin/dpm-guard.ts` for the reason `server/index.ts` is separated from
 * `bin/dpm-mcp.ts` — the entry point must reach `node:sqlite` through `await import` and nothing
 * else, so that the Node floor check runs before the module that needs the floor is evaluated.
 * Everything below this line is free to import normally.
 *
 * **The database is opened, not started.** `start()` migrates and seeds; a pre-commit hook that
 * quietly upgraded the schema would make committing a schema-writing operation, and the first
 * anyone knew of it would be an unexplained diff in `.dpm/dpm.sql` produced by the guard that was
 * supposed to be checking it. The guard reads. If the schema is behind, the answer is to start the
 * server, not to have the hook do it.
 *
 * **And it refuses a database from a newer release**, for the reason `migrate` leaves one alone.
 * The hook is installed as a symlink into a package directory the user does not maintain, and
 * nothing re-points that link — so a current database checked by an older release's guard is a
 * reachable state. That guard compares the projection against a schema missing whatever the
 * release added: a pass from it means nothing, and it is the one outcome nobody investigates.
 *
 * **What makes it reachable changed with the host, and the message says the new one** (epic 01-04
 * story 2). Claude Code installed each release in its own version-named directory, so *every*
 * upgrade left the previous one in place and the stale link was the ordinary state after one.
 * OpenCode names a package directory for a digest of the specifier, so re-resolving the same
 * specifier writes into the same directory and the link survives; what still produces two installs
 * of different ages is two specifiers for one repository — a tag and a branch, say.
 */

import type { DatabaseSync } from 'node:sqlite';

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { openConnection } from '../db/connection.ts';
import { DATABASE } from '../db/location.ts';
import { currentVersion, targetVersion } from '../schema/migrate.ts';
import { describe, guard } from './index.ts';

/** Where the report goes. One copy per executable, as the JSDoc typedef it replaces was. */
type Streams = { out: (text: string) => void; err: (text: string) => void };

/**
 * Run the guard.
 *
 * @param {object} [options]
 * @param {string} [options.root] The repository root.
 * @param {string} [options.location] The database.
 * @param {Streams} [options.streams] Injected so a test reads the report rather than a process's
 *   stdout — and so the exit code and the text are asserted from the same call.
 * @returns {number} The exit code: 0 clean, 1 divergence, 2 the guard could not run.
 */
export function run({ root = '.', location = DATABASE, streams }: {
  root?: string; location?: string; streams?: Streams;
} = {}): number {
  const out = streams?.out ?? ((text: string) => { process.stdout.write(text); });
  const err = streams?.err ?? ((text: string) => { process.stderr.write(text); });

  // **The database is found under `root`, not under the working directory.** In a pre-commit hook
  // the two are the same, which is why this went unnoticed: git runs hooks from the repository
  // root and the guard's own `root` is `git rev-parse --show-toplevel`. Run against any other
  // tree — as `dpm merge` does when it checks its own output — the docs came from `root` and the
  // database came from wherever the process happened to start, and the guard compared one
  // repository's files against another's rows. `resolve` and not `join`, so an absolute
  // `DPM_DATABASE` still points where it says.
  const database = location === ':memory:' ? location : resolve(root, location);

  // **Checked before opening, because opening creates it.** `DatabaseSync` makes an empty database
  // at a path that has none, so a guard that opened first would write a `.dpm/dpm.db` into a
  // repository as a side effect of checking one — and then fail with `no such table: document`,
  // which names a SQLite internal rather than the thing that is wrong. This module writes nothing;
  // that has to include the database.
  if (database !== ':memory:' && !existsSync(database)) {
    // **Exit 2 and not 1.** "The guard could not run" is not "the tree is clean", and it is not
    // "the tree diverged" either — a hook that reported divergence because the database was
    // missing would send a user to regenerate files against nothing.
    err(`dpm: cannot open ${database} — there is no database there. Start the dpm server to `
      + 'create one, or point DPM_DATABASE at the right path.\n');

    return 2;
  }

  let db: DatabaseSync;

  try {
    db = openConnection(database);
  } catch (error) {
    err(`dpm: cannot open ${database} — ${(error as Error).message}\n`);

    return 2;
  }

  try {
    // **Before the comparison, because the comparison is what cannot be trusted.** Every other
    // failure here is the guard reporting on the tree; this one is the guard reporting on itself.
    //
    // The message names the path this executable was loaded from rather than a version number.
    // That path *is* the diagnosis — it ends in the release the symlink still points at — and it
    // is the argument to the `ln -s` that fixes it, so a user who reads it has already been told
    // both what happened and what to type.
    const schema = currentVersion(db);
    const known = targetVersion();

    if (schema > known) {
      err(`dpm: this guard is from an older release than ${database} — the database is at schema `
        + `version ${schema} and this one knows ${known}. The guard that ran is the one at `
        + `${resolve(import.meta.dirname, '..', '..')}. A package directory is named for the `
        + 'specifier it was installed from, so two specifiers for one repository are two installs '
        + 'of different ages, and a .git/hooks/pre-commit symlinked into the older one keeps '
        + 'running it. Re-create the symlink against the current package path. Nothing was '
        + 'checked.\n');

      // Exit 2 for the reason the missing database is: this is "the guard could not run". A 1
      // would send a user to regenerate a current projection against an older understanding of it.
      return 2;
    }

    const result = guard(db, { root });

    if (result.diverged.length === 0) {
      out(`${describe(result)}\n`);

      return 0;
    }

    err(`${describe(result)}\n`);

    return 1;
  } catch (error) {
    err(`dpm: the guard failed before it could compare ${database} — ${(error as Error).message}\n`);

    return 2;
  } finally {
    db.close();
  }
}
