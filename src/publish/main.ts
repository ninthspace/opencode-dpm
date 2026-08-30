/**
 * Publishing as a command: open the database, write the artefacts, report, decide the exit code.
 *
 * Separated from `bin/dpm-publish.ts` for the reason `guard/main.ts` is separated from
 * `bin/dpm-guard.ts` — the entry point must reach `node:sqlite` through `await import` and nothing
 * else, so that the Node floor check runs before the module that needs the floor is evaluated.
 * Everything below this line is free to import normally.
 *
 * **The database is opened, not started**, the same as the guard's. `start()` migrates and seeds,
 * and publishing is the operation a user reaches for when the guard has just refused a commit — so
 * a publish that quietly upgraded the schema would resolve the refusal by changing the thing being
 * checked, and the evidence would be a `.dpm/dpm.sql` diff nobody asked for. If the schema is
 * behind, the answer is to start the server.
 */

import type { DatabaseSync } from 'node:sqlite';

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { openConnection } from '../db/connection.ts';
import { DATABASE } from '../db/location.ts';
import { ProjectionError } from '../projection/naming.ts';
import { describe, publish } from './index.ts';

/** Where the report goes. One copy per executable, as the JSDoc typedef it replaces was. */
type Streams = { out: (text: string) => void; err: (text: string) => void };

/**
 * Publish the tree.
 *
 * @param {object} [options]
 * @param {string} [options.root] The repository root the generated files sit under.
 * @param {string} [options.location] The database.
 * @param {Streams} [options.streams] Injected so a test reads the report rather than a process's
 *   stdout — and so the exit code and the text are asserted from the same call.
 * @returns {number} The exit code: 0 published, 1 a document refused to render, 2 could not run.
 */
export function run({ root = '.', location = DATABASE, streams }: {
  root?: string; location?: string; streams?: Streams;
} = {}): number {
  const out = streams?.out ?? ((text: string) => { process.stdout.write(text); });
  const err = streams?.err ?? ((text: string) => { process.stderr.write(text); });

  // Resolved under `root` rather than the working directory, for the reason `guard/main.js`
  // records: the docs come from `root`, and a database found somewhere else means publishing one
  // repository's rows over another repository's files.
  const database = location === ':memory:' ? location : resolve(root, location);

  // **Checked before opening, because opening creates it.** `DatabaseSync` makes an empty database
  // at a path that has none, so a publish that opened first would write a `.dpm/dpm.db` into a
  // repository and then project nothing over it — deleting every generated file in the tree as an
  // orphan, because an empty database produces none of them. That is the one failure here that
  // destroys work rather than reporting it.
  if (database !== ':memory:' && !existsSync(database)) {
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
    out(`${describe(publish(db, { root }))}\n`);

    return 0;
  } catch (error) {
    // **A refusal is separated from a failure, because they have different fixes and one of them
    // is the user's.** A document that cannot render names the documents and the templates
    // involved; anything else names a tool that broke. Exit 1 rather than 2 says the tree is
    // intact and the database is the thing to change.
    if (error instanceof ProjectionError) {
      err(`dpm: nothing was published — ${error.message}\n`);

      return 1;
    }

    err(`dpm: publishing ${database} failed — ${(error as Error).message}\n`);

    return 2;
  } finally {
    db.close();
  }
}
