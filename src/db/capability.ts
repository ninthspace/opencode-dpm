/**
 * Runtime capability of the SQLite behind a connection (NFR2).
 *
 * AD5 takes `node:sqlite`, so the SQLite dpm runs on is the runtime's own — and its compile-time
 * options vary between builds of the same version, not just between versions. Six tables carry FTS
 * triggers (`document_section`, `requirement`, `acceptance_criterion`, `story_criterion`,
 * `observation`, `finding`), which is every table holding prose. On a build without FTS5 the server
 * starts clean, the tool list is complete, reads answer, and every write reaching one of those
 * triggers fails as `no such module: fts5`. It presents as a working server.
 *
 * **The probe is behavioural, and that is the point.** Both of the declarative answers —
 * `sqlite_compileoption_used('ENABLE_FTS5')` and a scan of `PRAGMA compile_options` — report the
 * flag the build was compiled with, and reach the capability only through the assumption that a
 * flag set implies a module registered. Creating the virtual table needs no such assumption: it is
 * the operation the schema performs, asked of the connection that would perform it.
 *
 * It is created in the **temp** schema rather than the main one, so it writes nothing to the
 * database file and answers on a read-only connection as readily as a writable one — the probe has
 * to run before anything else at every open, including opens that were never going to write.
 */

import type { DatabaseSync } from 'node:sqlite';

/** Named rather than inlined, because the refusal quotes it and the test asserts on it. */
export const FTS5 = 'fts5';

/**
 * Whether the SQLite behind this connection can create an FTS5 table.
 *
 * Nothing here reads `process.version`. The must-NOT this closes is a capability inferred from the
 * Node version, which is wrong in both directions: one version's builds differ from each other, and
 * a version that usually carries FTS5 is not the connection that was handed over.
 *
 * @param db An open connection.
 */
export function hasFts5(db: DatabaseSync): boolean {
  try {
    db.exec(`CREATE VIRTUAL TABLE temp.dpm_probe_${FTS5} USING ${FTS5}(probe)`);
  } catch {
    return false;
  }

  db.exec(`DROP TABLE temp.dpm_probe_${FTS5}`);

  return true;
}

/**
 * The refusal, naming the capability and the interpreter that lacks it.
 *
 * `process.execPath` is here because `process.version` alone does not identify the runtime to
 * anyone trying to fix it: diagnosing this in the field took an hour, almost all of it spent
 * establishing which interpreter was running — `ps -o command=` prints `node`, `ps -o comm=` did
 * not resolve it, and only `lsof` on the process named the binary. The server knew the whole time.
 *
 * @param location The database the connection was for.
 */
export function refusal(location: string): string {
  return `the SQLite behind this runtime has no ${FTS5} — refusing to open ${location}, because `
    + 'every table holding prose carries an FTS trigger and the failure would otherwise arrive as a '
    + `write error long after startup. Node ${process.version} at ${process.execPath}`;
}
