/**
 * The integrity tool (FR14).
 *
 * Two halves, and they answer different questions. `PRAGMA foreign_key_check` finds rows whose
 * references point at nothing — a state FR2 makes unreachable on any connection dpm opens, and
 * which therefore arrives exactly one way: by restoring a dump. A `.sql` dump opens with
 * `PRAGMA foreign_keys=OFF` and has to, because any dump sorted by natural key is not in
 * topological order and `document.parent_id` is self-referential, so no fixed table order
 * avoids it. Restore is the one path on which every foreign key in the schema is advisory,
 * which is why it ends here rather than trusting itself.
 *
 * The register sweep finds what a foreign key could never have caught in the first place.
 *
 * **A clean report and a report that ran nothing must not look alike.** The result carries the
 * number of checks performed, and `ok` is false the moment any check that settles soundness
 * produces a row — so a register that failed to load reads as zero checks rather than as a pass
 * (NFR6).
 *
 * **`ok` answers "is this database broken?", which is narrower than "did anything get
 * reported".** An advisory entry names a state somebody decided on rather than a fault, so its
 * rows appear in `violations` — located, counted and flagged — and leave `ok` alone. The
 * distinction is declared on the register entry; nothing here knows which entry is which.
 */

import type { DatabaseSync } from 'node:sqlite';

import { REGISTER } from './register.ts';

/**
 * Rows whose foreign keys resolve to nothing.
 *
 * `PRAGMA foreign_key_check` reports `rowid` and the index of the failing key rather than a
 * column name, so the key is resolved through `PRAGMA foreign_key_list` — an orphan reported
 * as "table X, row 41, key 2" is a violation the tool cannot locate, which is half of this
 * story's must-NOT.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 */
export function orphans(db: DatabaseSync) {
  const dangling = db.prepare('PRAGMA foreign_key_check')
    .all() as Array<{ table: string; rowid: number; parent: string; fkid: number }>;

  return dangling.map((row) => {
    const key = (db
      .prepare(`PRAGMA foreign_key_list(${row.table})`)
      .all() as Array<{ id: number; from: string; to: string | null }>)
      .filter((entry) => entry.id === row.fkid);

    return {
      table: row.table,
      rowid: row.rowid,
      parent: row.parent,
      columns: key.map((entry) => entry.from).join(', '),
      references: key.map((entry) => entry.to ?? '(primary key)').join(', '),
    };
  });
}

/**
 * Run every register check and the orphan sweep.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{ok: boolean, checked: number, orphans: object[], violations: {entry: number, invariant: string, rows: object[]}[]}}
 */
export function checkIntegrity(db: DatabaseSync) {
  const violations = REGISTER
    .map((entry) => ({
      entry: entry.entry,
      invariant: entry.invariant,
      advisory: entry.advisory === true,
      rows: entry.check(db),
    }))
    .filter((result) => result.rows.length > 0);

  const dangling = orphans(db);

  return {
    // **An advisory finding is reported and does not make `ok` false**, because `ok` is read as
    // "is this database broken?" — by `restore`, which refuses a dump on it, and by a person
    // running the tool. A decision somebody recorded is not a fault, and answering `false` for
    // one would refuse a legitimate dump and teach every reader to discount the field. The
    // finding is still in `violations`, carrying `advisory`, so nothing is hidden by this.
    ok: violations.every((violation) => violation.advisory) && dangling.length === 0,
    // The orphan sweep counts as one, which is what makes `checked` a number a test can pin:
    // a register that loaded empty reports 1, not 0, and the parity test is what notices.
    checked: REGISTER.length + 1,
    orphans: dangling,
    violations,
  };
}
