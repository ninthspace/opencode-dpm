/**
 * What goes into the dump, and what is left out on purpose (FR8, NFR4).
 *
 * The dump is written from `sqlite_schema` rather than by `sqlite3 .dump`, which is unavailable
 * in `node:sqlite` and would be the wrong tool anyway: it emits rows in storage order and
 * writes an FTS5 index's shadow tables as hex blobs. Those blobs are the internal
 * representation of an index that is *derived*, so committing them commits a second copy of
 * every indexed body in a form no reviewer can read and no merge can resolve.
 *
 * **The exclusion is returned, not merely applied.** A filter that silently drops a table
 * produces a restored database missing rows while every step reports success — false-pass
 * register #6's shape, and the thing this story's second must-NOT names. Callers get the list
 * of what was left out so a test can assert it names exactly the shadow tables and nothing
 * else; a dumper that only returned the survivors could omit `document` and no assertion
 * available to the caller would notice.
 */

import type { DatabaseSync } from 'node:sqlite';

/** Objects SQLite owns. `sqlite_sequence`, `sqlite_stat1` and friends are rebuilt, not restored. */
const INTERNAL = 'sqlite_';

/**
 * The virtual tables in this database, by name.
 *
 * Derived from the schema rather than from a list of index names, because the list is the thing
 * that goes stale: an index added by a later migration would keep its shadow tables in the dump
 * while every existing test still passed. It is also what makes this testable before
 * `document_fts` exists — a fixture creating an FTS5 table of its own is found the same way.
 *
 * Matching is on `CREATE VIRTUAL TABLE` in the stored SQL rather than on a name suffix like
 * `_fts`, since the suffix is a convention this project happens to follow and the SQL is what
 * SQLite actually recorded.
 *
 * @returns Names, in schema order.
 */
export function virtualTables(db: DatabaseSync): string[] {
  return (db
    .prepare(`SELECT name FROM sqlite_schema
               WHERE type = 'table' AND sql LIKE 'CREATE VIRTUAL TABLE%'`)
    .all() as Array<{ name: string }>)
    .map((row) => row.name);
}

/**
 * Whether the object `type`/`name` is shadow storage belonging to one of `owners`.
 *
 * SQLite names an FTS5 table's storage `<name>_data`, `_idx`, `_content`, `_docsize` and
 * `_config`, and the rule the spec states is the prefix rather than that list of five suffixes.
 * The prefix is the safer of the two: FTS5 has changed which shadow tables it creates between
 * releases, and a suffix list would silently stop excluding one.
 *
 * **`type` is part of the rule, and leaving it out is a false pass rather than an
 * inefficiency.** Shadow storage is always a table. The project's own triggers are named for
 * the index they maintain — `document_fts_insert`, `document_fts_update`,
 * `document_fts_delete` — so a prefix test applied to every object type excludes exactly the
 * triggers that rebuild the index from the data. The restored database then holds every row,
 * an empty index, and no error: false-pass register #3 arriving out of the filter written to
 * prevent #9. The spec states the prefix rule at one paragraph and, at the next, that
 * "triggers are part of the schema and are created before any data … this is what makes the
 * FTS index reproducible without dumping it". Only the table-scoped reading satisfies both.
 *
 * The residual cost is that a *real* table named `document_fts_notes` would be excluded and
 * its rows lost. Nothing here is named that way, and the no-silent-omission assertion is what
 * catches it if anything ever is: a real table appearing in `excluded` fails the test that
 * names exactly what was dropped.
 *
 */
export function isShadowOf(type: string, name: string, owners: string[]): boolean {
  return type === 'table' && owners.some((owner) => name.startsWith(`${owner}_`));
}

/**
 * Whether `object` is a trigger that maintains one of `owners` — an FTS5 index.
 *
 * **This is the predicate that decides whether a trigger fires during a restore**, and the two
 * answers are both load-bearing. A trigger maintaining a derived index has to fire: the index
 * is not in the dump, and restoring `document_section` row by row is the only thing that
 * rebuilds it. Every other trigger must not fire, because a restore is a replay and not an
 * edit — `requirement_unclaim_on_coverage_insert` decays a claim when a user adds coverage,
 * and replaying the coverage rows made it decay 40 claims the dump had just carried faithfully.
 * The claim stamps are recorded facts, not derived state; the FTS index is the reverse. Only
 * the trigger's own body distinguishes them.
 *
 * **Matching is on the body rather than on the name.** The naming convention holds today —
 * `document_fts_insert`, `entry_fts_requirement_update` — and `isShadowOf` above relies on it
 * for a different purpose. Relying on it here would mean a future index trigger named off-
 * convention gets deferred, restores into an empty index, and reports success: false-pass
 * register #3, arriving through the fix for a different one. What the trigger writes to is the
 * fact being asked about, and it is in the SQL SQLite stored.
 *
 * A trigger that merely *reads* a virtual table is classified as maintaining it, and that is
 * deliberate: the misclassification puts it before the rows, which is where every trigger sits
 * today, so the error is inert in the one direction it can occur.
 *
 */
export function maintainsVirtualTable(object: SchemaObject, owners: string[]): boolean {
  return object.type === 'trigger'
    && typeof object.sql === 'string'
    && owners.some((owner) => object.sql!.includes(owner));
}

/** One row of `sqlite_schema`, as the dump reads it. */
export type SchemaObject = {
  /** `table`, `index`, `trigger` or `view`. */
  type: string;
  name: string;
  tbl_name: string;
  /** NULL for an index SQLite created itself for a UNIQUE or PK. */
  sql: string | null;
};

/**
 * Every object the dump should carry, and every object it deliberately leaves behind.
 *
 * A `CREATE VIRTUAL TABLE` statement is **kept** — it is the declaration that makes the index
 * exist, and restoring it plus the triggers is what rebuilds the index from the data rather
 * than from a blob. Only its shadow tables go.
 *
 * **There is no separate branch for indexes SQLite created itself.** A `PRIMARY KEY` or a
 * table-level `UNIQUE` produces an index whose `sql` is NULL, which would fail on restore
 * because the constraint that creates it is already in the table's own DDL — but every one of
 * them is named `sqlite_autoindex_…` and is already gone with the internal objects. A second
 * branch keying on `sql IS NULL` was written and removed after running: it caught nothing, and
 * a filter that cannot fire reads in the source as a guard while guarding nothing.
 *
 */
export function dumpableObjects(db: DatabaseSync): {
  objects: SchemaObject[];
  excluded: Array<{ name: string; reason: string }>;
  owners: string[];
} {
  const owners = virtualTables(db);
  const objects: SchemaObject[] = [];
  const excluded: Array<{ name: string; reason: string }> = [];

  const all = db
    .prepare('SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY rowid')
    .all() as SchemaObject[];

  for (const object of all) {
    if (object.name.startsWith(INTERNAL)) {
      excluded.push({ name: object.name, reason: 'sqlite-internal' });
    } else if (isShadowOf(object.type, object.name, owners)) {
      excluded.push({ name: object.name, reason: 'fts5-shadow' });
    } else {
      objects.push(object);
    }
  }

  // An object SQLite recorded with no SQL, that is not one of its own auto-indexes, is
  // something this function does not understand — emitting it would produce an `undefined`
  // in the dump and restoring that fails at a line nothing here would explain.
  const unprintable = objects.filter((object) => object.sql === null).map((object) => object.name);

  if (unprintable.length > 0) {
    throw new Error(`schema objects carry no SQL and cannot be dumped: ${unprintable.join(', ')}`);
  }

  // A dumper that enumerated nothing would emit an empty file, and an empty file restores
  // without error into an empty database that every later read reports as merely having no
  // rows. Same guard, and the same reason, as `schemaFiles()`.
  if (objects.length === 0) {
    throw new Error('no dumpable objects found — the schema read returned nothing');
  }

  return { objects, excluded, owners };
}
