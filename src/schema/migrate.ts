/**
 * Forward-only migration (FR12).
 *
 * **The numbered `.sql` files are the migrations.** There is no second set: a fresh database
 * is one whose recorded version is 0, so creating a schema and upgrading one are the same
 * loop over the same files, and the only difference is where it starts. Story 8 asks that
 * migrations and DDL produce an identical `sqlite_schema`; the cheapest way to be sure of
 * that is for there to be one path rather than two that have to agree.
 *
 * What that buys is narrow and worth naming: it makes divergence between the two paths
 * impossible, and it does **not** make forward-only safe on its own. Editing an already-
 * released file in place still produces two different schemas — a fresh database gets the new
 * text, an existing one keeps what it applied and never revisits it — and no comparison run
 * inside one process can see that, because both sides read the same working tree. A schema
 * change is a new file with the next number. That rule is the whole of forward-only, and it
 * is enforced by review rather than by code.
 *
 * Each migration runs in its own transaction with its `schema_version` row, so a set that
 * fails at step 9 leaves a database at version 8 rather than at some state between the two.
 * SQLite's DDL is transactional, which is what makes that available.
 */

import type { DatabaseSync } from 'node:sqlite';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRetirementGuards } from './retirement.ts';
import { schemaDirectory, schemaFiles } from './files.ts';

/** `007-artifacts-session.sql` → 7. */
export function versionOf(filename: string): number {
  return Number.parseInt(filename.slice(0, 3), 10);
}

/** The bootstrap: the one file applied unconditionally, because it holds the version. */
const BOOTSTRAP = 0;

/**
 * How far this database has been migrated. 0 for one that has never been.
 *
 */
export function currentVersion(db: DatabaseSync): number {
  const present = db
    .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'schema_version'")
    .get();

  if (!present) return 0;

  // `max()` over no rows is NULL, which is the freshly bootstrapped database.
  return (db.prepare('SELECT max(version) AS version FROM schema_version').get()!.version ?? 0) as number;
}

/** The version the plugin's files represent — what `currentVersion` becomes after a migration. */
export function targetVersion() {
  return Math.max(...schemaFiles().map(versionOf));
}

function readMigration(filename: string): string {
  return readFileSync(join(schemaDirectory(), filename), 'utf8');
}

/**
 * The marker a migration writes to say it rebuilds a table, and so needs foreign keys out of the
 * way — SQLite's own documented procedure for changing a table-level `CHECK`.
 *
 * **`PRAGMA foreign_keys` is silently ignored inside a transaction**, so a rebuild migration cannot
 * turn enforcement off for itself. `017-observation-quick.sql` worked around that by copying its one
 * cascading child aside and putting it back, which is tractable for a leaf table and is not for
 * `document`: with enforcement on, `DROP TABLE document` runs an implicit `DELETE FROM` whose
 * cascades reach roughly every table in the schema, so the rescue would have to cover all of them
 * and its failure mode is silent row loss.
 *
 * So the pragma goes **outside** the per-migration transaction and the DDL stays inside it, which is
 * step 1 and step 2 of SQLite's twelve. The rollback guarantee is unchanged — a rebuild that throws
 * still leaves the database at the previous version — and the enforcement that is off for the
 * duration is replaced by `PRAGMA foreign_key_check` before the commit rather than dropped. That
 * check is the whole of what makes this safe, which is why a failing one throws rather than warns
 * (NFR6): a rebuild that loses a parent row and commits is a corrupt database reporting success.
 *
 * Declared per file rather than applied to every migration, because enforcement being on is what
 * catches an ordinary additive migration writing a row it should not.
 */
const REBUILD = /^-- dpm:rebuild\b/m;

/** Whether this connection is enforcing foreign keys, so a rebuild restores what it found. */
const enforcing = (db: DatabaseSync) =>
  db.prepare('PRAGMA foreign_keys').get()!.foreign_keys === 1;

/**
 * Apply every migration this database has not seen, in order.
 *
 * Runs on server start with no user action, which is the requirement — so it is safe to call
 * against a database that is already current, where it applies nothing and reports as much.
 *
 * @param options Timestamp recorded against each migration; injected so a test can assert what was
 *   written rather than that something was.
 */
export function migrate(db: DatabaseSync, { now = new Date().toISOString() }: { now?: string } = {}) {
  const files = schemaFiles();

  // Unconditional and idempotent — see `000-version.sql` for why this one cannot be versioned.
  db.exec(readMigration(files.find((name) => versionOf(name) === BOOTSTRAP)!));

  const from = currentVersion(db);
  const target = targetVersion();

  // **A database from a newer plugin is left exactly as it is.** Forward-only migration says
  // nothing about the backward case, and the tempting reading — there is nothing pending, so
  // carry on — is the damaging one: `createRetirementGuards` below regenerates triggers *derived
  // from the schema*, so an older server would rewrite a newer database's guards to match an
  // understanding of it that is missing tables. Seeding is the same hazard one table over. NFR7
  // asks that the user still reach their planning history, and reaching it read-only is what
  // makes that possible without an older release quietly editing a newer one.
  if (from > target) return { from, to: from, target, applied: [], guards: [], ahead: true };

  const pending = files.filter((name) => versionOf(name) > from);
  const applied: number[] = [];

  for (const name of pending) {
    const version = versionOf(name);
    const sql = readMigration(name);

    // Read before the pragma is touched, and restored after, so a caller that had enforcement off
    // for its own reasons — `merge` and `restore` both do — does not have it switched on underneath.
    const rebuild = REBUILD.test(sql);
    const enforced = rebuild && enforcing(db);

    if (rebuild) db.exec('PRAGMA foreign_keys = OFF');

    db.exec('BEGIN');

    try {
      db.exec(sql);

      // In place of the enforcement that is off. Every violation is reported rather than the first,
      // because a rebuild that missed two tables is not fixed by hearing about one of them.
      if (rebuild) {
        const violations = db.prepare('PRAGMA foreign_key_check').all();

        if (violations.length > 0) {
          throw new Error(`${violations.length} foreign key violation(s) after the rebuild: `
            + violations.map((row) => `${row.table} row ${row.rowid} → ${row.parent}`).join(', '));
        }
      }

      db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(version, now);
    } catch (error) {
      db.exec('ROLLBACK');
      if (enforced) db.exec('PRAGMA foreign_keys = ON');
      throw new Error(`migration ${name} failed and was rolled back: ${(error as Error).message}`, { cause: error });
    }

    db.exec('COMMIT');
    if (enforced) db.exec('PRAGMA foreign_keys = ON');
    applied.push(version);
  }

  // After the DDL and outside the per-migration transactions, because the guards are derived
  // from the *finished* schema: a migration that adds a referencing column needs a guard that
  // did not exist when its own transaction opened. Regenerating the whole set rather than
  // appending to it is what makes a second run legal and what removes a guard whose reference
  // a migration dropped.
  const guards = createRetirementGuards(db);

  return { from, to: currentVersion(db), target, applied, guards, ahead: false };
}
