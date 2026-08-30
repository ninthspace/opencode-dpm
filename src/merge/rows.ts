/**
 * The row-level three-way merge (FR8, AD4).
 *
 * Git merges `.dpm/dpm.sql` as text, and for the ordinary case — two branches adding artefacts —
 * that produces a resolvable conflict, because AD9's ULIDs mean the two sides never write the same
 * primary key. What text merging cannot do is decide what to keep when both sides changed the
 * *same* row, and it cannot see that two different rows have claimed one human number. So the
 * merge is recomputed here over rows, from the three sides git already has in its index.
 *
 * **Row identity is `orderingOf`'s, reused rather than restated.** The dump's notion of what makes
 * a file stable and the merge's notion of what makes a row *the same row* are then one derivation:
 * the primary key where there is one, every column where there is not. Two definitions that agree
 * today would drift the first time a table gained a key, and the failure would be a merge that
 * duplicated rows while reporting success.
 */

import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

import { dumpableObjects } from '../dump/objects.ts';
import { orderingOf } from '../dump/rows.ts';

/** A row as this file handles one: column names to values, with no knowledge of which table. */
type Row = Record<string, unknown>;

/** What `snapshot` returns, named because three parameters and two return types are it. */
export type Snapshot = Map<string, { key: string[]; columns: string[]; rows: Map<string, Row> }>;

/** One table's share of a plan — the JSDoc `{key, columns, inserts, updates, deletes}` below. */
export type Change = {
  key: string[]; columns: string[]; inserts: Row[]; updates: Row[]; deletes: Row[];
};

/** A row the merge cannot decide, and why. */
export type Conflict = { table: string; key: string; reason: string };

/** Table and column names are SQLite's own, never user input. */
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** A merge that cannot be completed without guessing. Carries what could not be decided. */
export class MergeError extends Error {
  /** @param {string} message */
  constructor(message: string) {
    super(message);
    this.name = 'MergeError';
  }
}

/**
 * The counter table, and the key it is merged on.
 *
 * `number_sequence` has no primary key — `009-numbering.sql` explains why — so `orderingOf` keys
 * it by every column, which puts `next_value` in the key. Under the general rule a *bump* on each
 * side then reads as two unrelated additions, and the merge keeps both: two rows for one
 * `(kind, parent_id)`, which the pair of partial unique indexes exists to forbid. It is merged on
 * its natural key instead, and its value is merged by taking the larger of the two.
 */
export const SEQUENCE_TABLE = 'number_sequence';
const SEQUENCE_KEY = ['kind', 'parent_id'];

/**
 * A row's identity, as a string, from the values of its key columns.
 *
 * JSON rather than a join on a separator, because a separator is ambiguous the moment a value
 * contains it — and `document.slug` is a value that could. `?? null` normalises `undefined`, which
 * a column absent from one side's schema would otherwise encode differently from a stored NULL.
 *
 * @param {Record<string, unknown>} row
 * @param {string[]} columns
 * @returns {string}
 */
export function keyOf(row: Row, columns: string[]): string {
  return JSON.stringify(columns.map((column) => row[column] ?? null));
}

/**
 * Every dumpable row of `db`, indexed by merge key.
 *
 * The same tables the dump carries, found the same way: virtual tables are skipped because an FTS5
 * index is derived from the rows that feed it and is rebuilt by the triggers as they arrive.
 * Merging it directly would apply each indexed body twice.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Map<string, {key: string[], columns: string[], rows: Map<string, object>}>}
 */
export function snapshot(db: DatabaseSync): Snapshot {
  const { objects, owners } = dumpableObjects(db);
  const tables = objects
    .filter((object) => object.type === 'table' && !owners.includes(object.name))
    .map((object) => object.name);

  const taken: Snapshot = new Map();

  for (const table of tables) {
    const key = table === SEQUENCE_TABLE ? SEQUENCE_KEY : orderingOf(db, table).columns;
    const columns = (db
      .prepare(`PRAGMA table_info(${quote(table)})`)
      .all() as Array<{ name: string }>)
      .map((column) => column.name);

    const rows = db
      .prepare(`SELECT ${columns.map(quote).join(', ')} FROM ${quote(table)}`)
      .all();

    const byKey = new Map<string, Row>();
    for (const row of rows) byKey.set(keyOf(row, key), row);

    // NFR6. A key that does not distinguish two rows silently drops one of them here, and the
    // merge then reports success having lost content — the worst failure this tool can have, and
    // one invisible downstream because the merged dump is internally consistent.
    if (byKey.size !== rows.length) {
      throw new MergeError(
        `${table} holds ${rows.length} rows but only ${byKey.size} distinct ${key.join(', ')} — `
        + 'its merge key does not identify its rows, so merging it would discard some',
      );
    }

    taken.set(table, { key, columns, rows: byKey });
  }

  return taken;
}

/** Whether two rows — or two absences — are the same. */
function same(a: Row | undefined, b: Row | undefined) {
  if (a === undefined || b === undefined) return a === b;

  const columns = Object.keys(a);

  return columns.length === Object.keys(b).length
    && columns.every((column) => a[column] === b[column]);
}

/**
 * Merge one `number_sequence` key, whose value is a high-water mark rather than content.
 *
 * Both sides allocated from their own copy, so both bumped it, and neither value is right on its
 * own: taking ours hands out a number theirs has already used, which is register entry 5 —
 * "nothing can hand back a number it has handed back before" — failing on the first artefact
 * created after a merge. The larger of the two is the only value that has not been issued.
 *
 * A deletion is still a deletion: a `parent_id` whose document went away cascades this row with
 * it, and reviving it would leave a dangling reference for `foreign_key_check` to find.
 */
function mergeSequence(
  base: Row | undefined, ours: Row | undefined, theirs: Row | undefined, into: Change,
) {
  if (ours === undefined && theirs === undefined) return;

  if (ours === undefined) {
    // Ours deleted it. If theirs left it alone, the deletion stands; if theirs moved it, the
    // counter is live again and the moved value is the one that has not been issued.
    if (base !== undefined && same(theirs, base)) return;

    // `!` because the guard above already ruled out both being absent, which narrowing over two
    // separate parameters does not carry down to here.
    into.inserts.push(theirs!);

    return;
  }

  if (theirs === undefined) {
    if (base !== undefined && same(ours, base)) into.deletes.push(ours);

    return;
  }

  const next = Math.max(ours.next_value as number, theirs.next_value as number);

  if (next !== ours.next_value) into.updates.push({ ...ours, next_value: next });
}

/**
 * The changes that turn ours into the merge of all three sides.
 *
 * Expressed relative to **ours** rather than as a fresh row set, because ours is a database that
 * already exists and already restored: applying a delta to it reuses every constraint, trigger and
 * index the schema declares, where materialising a computed row set would have to rebuild them.
 *
 * **A row changed differently on both sides is a conflict, and it stops the merge.** Preferring a
 * side would be the silent overwrite the story forbids, arriving one table over from where anyone
 * is watching for it — the criterion is written about numbers, but a body edited on both branches
 * loses exactly the same way and leaves no trace at all.
 *
 * @param {ReturnType<typeof snapshot>} base
 * @param {ReturnType<typeof snapshot>} ours
 * @param {ReturnType<typeof snapshot>} theirs
 * @returns {{plan: Map<string, {key: string[], columns: string[], inserts: object[],
 *   updates: object[], deletes: object[]}>, conflicts: {table: string, key: string,
 *   reason: string}[]}}
 */
export function threeWay(base: Snapshot, ours: Snapshot, theirs: Snapshot) {
  const tables = [...new Set([...base.keys(), ...ours.keys(), ...theirs.keys()])].sort();
  const plan = new Map<string, Change>();
  const conflicts: Conflict[] = [];

  for (const table of tables) {
    const b = base.get(table);
    const o = ours.get(table);
    const t = theirs.get(table);

    // A table on one side and not another means the two dumps were written at different schema
    // versions. Merging them would silently drop whichever table the older side lacks, so it is
    // refused rather than reconciled: the fix is to migrate and re-dump, which is a decision.
    if (!b || !o || !t) {
      conflicts.push({
        table,
        key: '',
        reason: 'present on '
          + [b && 'base', o && 'ours', t && 'theirs'].filter(Boolean).join(', ')
          + ' only — the three sides were dumped at different schema versions',
      });

      continue;
    }

    const into: Change = { key: o.key, columns: o.columns, inserts: [], updates: [], deletes: [] };
    const keys = [...new Set([...b.rows.keys(), ...o.rows.keys(), ...t.rows.keys()])].sort();

    for (const key of keys) {
      const bv = b.rows.get(key);
      const ov = o.rows.get(key);
      const tv = t.rows.get(key);

      if (table === SEQUENCE_TABLE) {
        mergeSequence(bv, ov, tv, into);

        continue;
      }

      // Both sides agree, whether by not touching it or by making the same change. Ours already
      // holds the answer.
      if (same(ov, tv)) continue;

      if (same(ov, bv)) {
        // Only theirs moved: take it. `!` because `same(ov, tv)` returning false with `tv`
        // absent is exactly the case where `ov` is present — a narrowing `same` cannot express.
        if (tv === undefined) into.deletes.push(ov!);
        else if (ov === undefined) into.inserts.push(tv);
        else into.updates.push(tv);

        continue;
      }

      // Only ours moved: ours already holds it.
      if (same(tv, bv)) continue;

      conflicts.push({
        table,
        key,
        reason: bv === undefined
          ? 'added on both sides with different values'
          : 'changed on both sides',
      });
    }

    plan.set(table, into);
  }

  return { plan, conflicts };
}

/**
 * Apply a plan to `db`, inside `db`'s current transaction.
 *
 * Deletions run before insertions across every table, because a number a deletion frees is a
 * number an insertion may then take. Within that, order is the plan's, which is the schema's.
 *
 * **It applies in phases rather than in one pass, and the phases are not cosmetic.** The counter
 * table has to be merged before a collision can be repaired, because the repair allocates from it;
 * and the repair has to happen before the colliding row is inserted, because the uniqueness index
 * is up and would refuse it. An earlier version took the indexes down for the duration instead,
 * which worked and moved them to the end of `sqlite_schema` — so the merged dump's schema section
 * came out reordered, and every future dump of that database carried the reordering. A merge that
 * rewrites 75 schema statements to repair one number is the spurious diff NFR4 exists to prevent,
 * arriving from the tool written to resolve conflicts.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {ReturnType<typeof threeWay>['plan']} plan
 * @param {object} [phase]
 * @param {boolean} [phase.deletes] Apply the deletions.
 * @param {boolean} [phase.writes] Apply the insertions and updates.
 * @param {(table: string) => boolean} [phase.tables] Which tables this pass touches.
 * @param {(table: string, row: object) => object} [phase.substitute] Last chance to change a row on
 *   its way in — how a renumbered document's new number reaches the `INSERT` that carries it.
 * @returns {{inserted: number, updated: number, deleted: number}}
 */
export function applyPlan(db: DatabaseSync, plan: Map<string, Change>, {
  deletes = true,
  writes = true,
  tables = () => true,
  substitute = (table: string, row: Row) => row,
}: {
  deletes?: boolean;
  writes?: boolean;
  tables?: (table: string) => boolean;
  substitute?: (table: string, row: Row) => Row;
} = {}) {
  const counts = { inserted: 0, updated: 0, deleted: 0 };

  for (const [table, change] of deletes ? plan : []) {
    if (!tables(table)) continue;

    for (const row of change.deletes) {
      const where = change.key
        .map((column) => (row[column] === null ? `${quote(column)} IS NULL` : `${quote(column)} = ?`))
        .join(' AND ');
      const values = change.key.map((column) => row[column]).filter((value) => value !== null);

      db.prepare(`DELETE FROM ${quote(table)} WHERE ${where}`).run(...values as SQLInputValue[]);
      counts.deleted += 1;
    }
  }

  for (const [table, change] of writes ? plan : []) {
    if (!tables(table)) continue;

    for (const original of change.updates) {
      const row = substitute(table, original);
      const set = change.columns.map((column) => `${quote(column)} = ?`).join(', ');
      const where = change.key
        .map((column) => (row[column] === null ? `${quote(column)} IS NULL` : `${quote(column)} = ?`))
        .join(' AND ');

      const values = [
        ...change.columns.map((column) => row[column]),
        ...change.key.map((column) => row[column]).filter((value) => value !== null),
      ];

      db.prepare(`UPDATE ${quote(table)} SET ${set} WHERE ${where}`)
        .run(...values as SQLInputValue[]);
      counts.updated += 1;
    }

    for (const original of change.inserts) {
      const row = substitute(table, original);
      const names = change.columns.map(quote).join(', ');
      const placeholders = change.columns.map(() => '?').join(', ');

      db.prepare(`INSERT INTO ${quote(table)} (${names}) VALUES (${placeholders})`)
        .run(...change.columns.map((column) => row[column]) as SQLInputValue[]);
      counts.inserted += 1;
    }
  }

  return counts;
}
