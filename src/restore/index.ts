/**
 * Applying a dump, and proving the result before keeping it (FR14).
 *
 * A restore is the one path in dpm on which every foreign key is advisory. Any dump ordered by
 * natural key — which NFR4 requires — is not in topological order, and `document.parent_id` is
 * self-referential, so no fixed table order avoids a forward reference. Enforcement therefore
 * has to come off for the duration, which means the state a restore produces is the one state
 * dpm can reach that FR2 does not vouch for. That is why this ends in a check rather than in a
 * commit.
 *
 * **The dump's own `PRAGMA foreign_keys=OFF` does not do this job, and cannot.** SQLite ignores
 * that pragma inside a transaction — silently, with no error and no warning — and the file is
 * applied inside one. Run as the first line of a wrapped restore it leaves enforcement exactly
 * as it found it, and the first forward reference in the file fails with `FOREIGN KEY constraint
 * failed`. So the pragma is set here, before `BEGIN`, and read back to confirm it took. The line
 * in the file is what makes the dump restorable by `sqlite3` at a shell, where there is no
 * wrapping transaction; it is not what makes it restorable by this function.
 *
 * **The checks run before the commit, not after it.** A restore that reports a dangling
 * reference having already committed it has told the user their database is broken and left it
 * that way. Rolling back instead means a failed restore changes nothing, which is the only
 * behaviour that makes the error safe to act on.
 */

import type { DatabaseSync } from 'node:sqlite';

import { checkIntegrity } from '../integrity/check.ts';

/** What `checkIntegrity` answers — named here because the failure carries one. */
type Report = ReturnType<typeof checkIntegrity>;

/** Whether this connection is enforcing foreign keys. Per-connection, and per-transaction-state. */
const enforcing = (db: DatabaseSync) =>
  db.prepare('PRAGMA foreign_keys').get()!.foreign_keys === 1;

/**
 * An integrity failure, carrying the rows rather than only the count.
 *
 * A restore that fails with "3 violations" is a restore whose failure cannot be acted on. The
 * report is attached so a caller can print it, and the message names the first few rows so that
 * a caller which only logs `error.message` still says something locating.
 */
export class RestoreFailed extends Error {
  // Declared rather than assigned in the signature: a parameter property is TypeScript syntax with
  // a runtime effect, which Node's type-stripping refuses (ADR 01-03). The field is written in the
  // constructor body exactly as it always was.
  report: Report;

  constructor(report: Report) {
    super(RestoreFailed.describe(report));
    this.name = 'RestoreFailed';
    this.report = report;
  }

  static describe(report: Report) {
    const parts = [];

    for (const orphan of report.orphans) {
      parts.push(
        `${orphan.table} rowid ${orphan.rowid}: ${orphan.columns} references ` +
          `${orphan.parent}(${orphan.references}), which is not there`,
      );
    }

    for (const violation of report.violations) {
      parts.push(
        `register entry ${violation.entry} (${violation.invariant}): ` +
          `${violation.rows.length} row(s) — ${JSON.stringify(violation.rows.slice(0, 3))}`,
      );
    }

    return `restore rejected after ${report.checked} checks:\n  ${parts.join('\n  ')}`;
  }
}

/**
 * Apply `sql` to `db` and keep it only if the result is intact.
 *
 * The derived indexes are not restored — they are rebuilt. The dump emits every trigger before
 * any row precisely so that inserting a section fires the trigger that indexes it, and the
 * search index arrives as a consequence of the data. There is no reindex step here, and adding
 * one would hide the case where the triggers went missing from the file: the index would be
 * populated either way, and the dump's most important exclusion would stop being tested.
 *
 * @param {import('node:sqlite').DatabaseSync} db  An empty database, or one whose contents the
 *   dump is expected to replace.
 * @param {string} sql  A dump produced by `src/dump/`.
 * @returns {ReturnType<typeof checkIntegrity>} The clean report, so a caller can show what ran.
 * @throws {RestoreFailed} If any check finds a row. The database is left unchanged.
 */
export function restore(db: DatabaseSync, sql: string) {
  const enforced = enforcing(db);

  db.exec('PRAGMA foreign_keys = OFF');

  // Read back rather than assume. This pragma is a no-op inside a transaction, so a caller that
  // opened one before calling would otherwise get a restore that fails part-way through the
  // file on a forward reference — an error about a constraint, three hundred statements from
  // the thing that actually went wrong.
  if (enforcing(db)) {
    throw new Error(
      'foreign key enforcement could not be disabled — restore must not run inside a transaction',
    );
  }

  db.exec('BEGIN');

  let report;
  try {
    db.exec(sql);

    // Inside the transaction, and with enforcement still off: `foreign_key_check` is an explicit
    // scan rather than a constraint, so it reports every dangling row whether or not the
    // connection would have refused to write it.
    report = checkIntegrity(db);

    if (!report.ok) throw new RestoreFailed(report);
  } catch (error) {
    db.exec('ROLLBACK');
    if (enforced) db.exec('PRAGMA foreign_keys = ON');
    throw error;
  }

  db.exec('COMMIT');
  if (enforced) db.exec('PRAGMA foreign_keys = ON');

  return report;
}
