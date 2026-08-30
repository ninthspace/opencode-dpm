/**
 * The data half of the dump — one column-named `INSERT` per row, in primary-key order (FR8).
 *
 * **Columns are named on every statement**, which costs bytes and buys the thing FR8 is for: a
 * dump written before a migration added a column still restores after it, because the values
 * are bound to names rather than to positions. A positional `INSERT INTO t VALUES (…)` is
 * correct exactly until the schema moves, and then it either fails or — if the added column is
 * nullable and last — silently loads every value into the wrong column.
 *
 * **Order is the primary key, which AD9 turned into a total order.** Every surrogate is a ULID,
 * so ordering by it is well-defined on every table, and the association tables whose key is
 * composite order by the whole key. Two tables have no primary key at all; see `orderingOf`.
 */

import type { DatabaseSync } from 'node:sqlite';

import { literal } from './literal.ts';
import type { SchemaObject } from './objects.ts';

/** `document_kind` → the identifier as SQL. Table and column names are SQLite's own, never user input. */
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/**
 * Columns whose value is a property of the machine rather than of the content, and the literal
 * emitted in their place.
 *
 * NFR4 says the bytes must be identical "on any machine, on any run — ordered rows, **no
 * timestamps**, no locale dependence", and `schema_version.applied_at` is the one column in this
 * schema that defeats it. `000-version.sql` is explicit that the row-per-migration form exists to
 * record *when* each step ran, "the first thing anyone asks of a database that upgraded badly" —
 * so the column is deliberately diagnostic and deliberately local. Two developers at the same
 * commit ran their migrations at different times, both correctly, and their dumps differ in
 * eleven rows for no reason a reviewer could act on. That is the conflict-on-every-commit
 * failure NFR4 exists to prevent, arriving from the one table nobody thinks of as content.
 *
 * **The versions themselves are kept, and must be.** A restored database with an empty
 * `schema_version` reads as version 0, so the next start replays all eleven migrations against a
 * schema that already has every table and fails on the first `CREATE`. What is dropped is the
 * stamp, not the ledger.
 *
 * The epoch is used rather than a word like `restored` so the column stays a valid ISO-8601
 * string — anything that parses it keeps working, while a human reading `1970` sees at once that
 * it is not a real stamp. **The substitution is reported by `dumpRows`, not applied silently**:
 * a value the dump rewrites is the same hazard as a table the dump omits, and Story 1's last
 * criterion is that such a thing be declared and asserted rather than discovered.
 */
const NORMALISED: Record<string, Record<string, string>> = {
  schema_version: { applied_at: "'1970-01-01T00:00:00Z'" },
};

/**
 * The columns to order a table's rows by, and how that was decided.
 *
 * The primary key first, because that is what the criterion names. Two tables in this schema
 * have none, and neither is an oversight: `schema_version` records applied migrations and
 * `number_sequence` cannot have one, because its natural key is `(kind, parent_id)`, `parent_id`
 * is NULL for every root-numbered kind, and a UNIQUE index treats NULLs as distinct — so a key
 * over that pair would enforce nothing on exactly the rows that most need it.
 *
 * **A partial unique index is not an ordering, and taking one is how this went wrong first.**
 * `number_sequence` is covered by a complementary *pair* of partial indexes, split on
 * `parent_id IS NULL` — that is what enforces its key across both sides. Reading the first of
 * them yields `kind` alone, which is unique only among the rows that index covers and orders
 * nothing on the rest. It passed every check available at the time because the fixture held one
 * row per kind. Partial indexes are therefore skipped, and the last resort is every column,
 * which is a total order on any set of distinct rows and leaves nothing to SQLite's discretion.
 *
 * **The choice is derived and reported, never silent.** A dumper that quietly emitted an
 * unordered table would produce a file differing between runs for one table out of thirty-nine,
 * surfacing as a spurious merge conflict long after the run that caused it — so the source of
 * the ordering comes back with it and the test asserts which tables use which.
 *
 */
export function orderingOf(db: DatabaseSync, table: string): {
  columns: string[];
  source: 'primary-key' | 'unique-index' | 'all-columns';
} {
  const info = db.prepare(`PRAGMA table_info(${quote(table)})`)
    .all() as Array<{ name: string; pk: number }>;

  const key = info
    .filter((column) => column.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((column) => column.name);

  if (key.length > 0) return { columns: key, source: 'primary-key' };

  // `index_list` reports newest first; reversing makes the choice depend on the schema's own
  // order rather than on SQLite's reporting order, which is not a documented guarantee.
  const unique = (db
    .prepare(`PRAGMA index_list(${quote(table)})`)
    .all() as Array<{ name: string; unique: number; partial: number }>)
    .filter((index) => index.unique === 1 && index.partial === 0)
    .reverse();

  for (const index of unique) {
    const columns = (db
      .prepare(`PRAGMA index_info(${quote(index.name)})`)
      .all() as Array<{ name: string | null; seqno: number }>)
      .sort((a, b) => a.seqno - b.seqno)
      .map((column) => column.name)
      .filter((name) => name !== null);

    if (columns.length > 0) return { columns, source: 'unique-index' };
  }

  return { columns: info.map((column) => column.name), source: 'all-columns' as const };
}

/**
 * Every row of every dumpable table, as `INSERT` statements.
 *
 * Virtual tables are skipped: an FTS5 index's contents are derived from the tables it indexes,
 * and the triggers emitted with the schema rebuild it as those rows arrive. Emitting its rows
 * as well would insert each indexed body twice — once from the trigger and once from the dump —
 * so a restored search would return duplicate hits for every section, having reported success.
 *
 * Ordering uses no `COLLATE` clause, because none of the DDL declares one: every TEXT column
 * sorts BINARY, which is a byte comparison and therefore identical under every locale. The
 * accompanying test asserts the schema still contains no `COLLATE`, so a column that acquires
 * `NOCASE` later fails there rather than silently making the dump locale-dependent.
 *
 * @param objects From `dumpableObjects`.
 * @param owners Virtual table names, whose rows are derived and skipped.
 */
export function dumpRows(db: DatabaseSync, objects: SchemaObject[], owners: string[]): {
  sql: string;
  counts: Record<string, number>;
  orderings: Record<string, string>;
  normalised: Array<{ table: string; column: string; value: string }>;
} {
  const tables = objects
    .filter((object) => object.type === 'table' && !owners.includes(object.name))
    .map((object) => object.name);

  const parts: string[] = [];
  const counts: Record<string, number> = {};
  const orderings: Record<string, string> = {};
  const normalised: Array<{ table: string; column: string; value: string }> = [];

  for (const table of tables) {
    const { columns: order, source } = orderingOf(db, table);
    orderings[table] = `${source}: ${order.join(', ')}`;

    const columns = (db
      .prepare(`PRAGMA table_info(${quote(table)})`)
      .all() as Array<{ name: string }>)
      .map((column) => column.name);

    const rows = db
      .prepare(`SELECT ${columns.map(quote).join(', ')} FROM ${quote(table)}
                 ORDER BY ${order.map(quote).join(', ')}`)
      .all() as Array<Record<string, null | string | number | bigint | Uint8Array>>;

    counts[table] = rows.length;

    // The column must exist whether or not any row uses it: a migration that renames it away
    // leaves an entry here that silently stops applying, and the dump quietly becomes
    // machine-dependent again. Reporting, though, is only for tables that actually emitted
    // rows — a substitution declared against an empty table is a claim about nothing.
    const fixed = NORMALISED[table] ?? {};
    for (const [column, value] of Object.entries(fixed)) {
      if (!columns.includes(column)) {
        throw new Error(`${table}.${column} is normalised in the dump but no longer exists`);
      }
      if (rows.length > 0) normalised.push({ table, column, value });
    }

    const names = columns.map(quote).join(', ');
    for (const row of rows) {
      const values = columns.map((column) => fixed[column] ?? literal(row[column])).join(', ');
      parts.push(`INSERT INTO ${quote(table)} (${names}) VALUES (${values});\n`);
    }
  }

  return { sql: parts.join(''), counts, orderings, normalised };
}
