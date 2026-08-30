/**
 * Retirement guards, derived from the schema rather than written into it.
 *
 * FR24 makes retirement two promises, and a foreign key keeps only one of them. Rows that
 * already reference a retired term stay intact and readable — that is what *not* deleting the
 * row buys, and it costs nothing. The other half is that **no new row may arrive** against a
 * retired term, and SQLite has no way to say that in a foreign key: the reference is still
 * satisfiable, because the parent row is still there. Before this module that half was
 * enforced by nothing, which is the state cross-row register #10 exists to name.
 *
 * So it is said in a trigger. The triggers are **generated** from `PRAGMA foreign_key_list`
 * rather than hand-written, because the alternative is remembering: nine referencing columns
 * today, two more when Story 4 adds `dependency_kind`, and an unbounded number after that as
 * vocabularies accumulate. A hand-written guard that someone forgets to add fails silently
 * and looks exactly like one that is working.
 *
 * **The predicate is `retired_at`, not a list of vocabularies.** That sweeps in `observation`,
 * whose `retired_at` is the marker `cpm:retro retire` writes on a spent lesson — so a retired
 * observation stops gaining new categories. That is the right reading of the same promise and
 * it is asserted rather than excluded; narrowing the predicate would mean maintaining exactly
 * the list this module exists to avoid.
 *
 * The cost, taken deliberately: not all DDL lives in the numbered `.sql` files any more. Story
 * 5's migration path has to call this same generator for its `sqlite_schema` comparison against
 * a freshly created database to hold.
 */

import type { DatabaseSync } from 'node:sqlite';

/** A row of `PRAGMA foreign_key_list`. `to` is NULL where the reference names no column. */
type ForeignKeyRow = { id: number; seq: number; table: string; from: string; to: string | null };

/** A row of `PRAGMA table_info`. `pk` is 0 for a column outside the primary key. */
type ColumnRow = { name: string; pk: number };

/** One foreign key, its columns paired by position. */
type Reference = { parent: string; from: string[]; to: Array<string | null> };

/** The same, once the referencing table is known and every `to` column has been resolved. */
type NamedReference = { table: string; parent: string; from: string[]; to: string[] };

/** The two writes a guard fires on. Narrowed so a third name cannot reach `guardName`. */
type Event = 'insert' | 'update';

/**
 * Tables dpm authored — excluding every virtual table and the shadow storage FTS5 creates beside
 * one.
 *
 * **The virtual table itself belongs out, and it was not until Epic 47-05 Story 6.** The filter
 * read `table.name !== v && …`, which is a guard against a table excluding itself and is exactly
 * wrong here: it kept `document_fts` and `entry_fts` in the walk. The same character-level mistake
 * lived in `tests/support/introspection.js` until Story 3, where it broke four sweeps the day the
 * first virtual table appeared. Here it broke nothing — a virtual table cannot declare a foreign
 * key, so `foreign_key_list` returns nothing and no guard was ever derived either way — which is
 * why it survived to be found by reading rather than by failing.
 *
 * It is corrected rather than left inert because the two copies are meant to be independent, not
 * divergent, and because the consequence of the divergence going live is silent: a guard the
 * generator emits and the checker does not expect. That case is held by
 * `tests/vocabulary.test.js`, which derives the guard set from the *other* copy of this walk and
 * compares it against the triggers actually in the schema.
 */
function authoredTables(db: DatabaseSync): string[] {
  const all = db
    .prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string; sql: string | null }>;

  const virtual = all
    .filter((table) => /^\s*CREATE\s+VIRTUAL\s+TABLE/i.test(table.sql ?? ''))
    .map((table) => table.name);

  return all
    .filter((table) => !virtual.some((v) => table.name === v || table.name.startsWith(`${v}_`)))
    .map((table) => table.name);
}

/** One entry per foreign key, with its columns in declaration order — composite keys included. */
function foreignKeys(db: DatabaseSync, table: string): Reference[] {
  const rows = db.prepare(`PRAGMA foreign_key_list(${table})`).all() as ForeignKeyRow[];

  return [...new Set(rows.map((row) => row.id))].map((id) => {
    const columns = rows.filter((row) => row.id === id).sort((a, b) => a.seq - b.seq);

    return {
      parent: columns[0].table,
      from: columns.map((column) => column.from),
      to: columns.map((column) => column.to),
    };
  });
}

function columnsOf(db: DatabaseSync, table: string): ColumnRow[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as ColumnRow[];
}

function primaryKeyColumns(db: DatabaseSync, table: string): string[] {
  return columnsOf(db, table)
    .filter((column) => column.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((column) => column.name);
}

/**
 * Every reference into a table that can be retired.
 *
 */
export function vocabularyReferences(db: DatabaseSync): NamedReference[] {
  const references: NamedReference[] = [];

  for (const table of authoredTables(db)) {
    const retirable = (parent: string) =>
      columnsOf(db, parent).some((c) => c.name === 'retired_at');

    for (const key of foreignKeys(db, table)) {
      if (!retirable(key.parent)) continue;

      references.push({
        table,
        parent: key.parent,
        from: key.from,
        // `to` is NULL when a reference names no columns and resolves against the parent's
        // primary key implicitly. Every reference in this schema is explicit, so the fallback
        // is never taken today — and a trigger keyed on `undefined` would be silently wrong.
        to: key.to.every((column) => column !== null)
          ? key.to as string[]
          : primaryKeyColumns(db, key.parent),
      });
    }
  }

  return references;
}

/** `finding.category_id, finding.category_domain` — the phrase the abort message carries. */
function describe(reference: NamedReference): string {
  return reference.from.map((column) => `${reference.table}.${column}`).join(', ');
}

/** The suffix every generated guard's name ends in — how the set is recognised to be dropped. */
const GUARD_SUFFIX = /_not_retired_on_(insert|update)$/;

export function guardName(reference: NamedReference, event: Event): string {
  return `${reference.table}_${reference.from.join('_')}_not_retired_on_${event}`;
}

function guard(reference: NamedReference, event: Event): string {
  const match = reference.to
    .map((column: string, index: number) => `${column} = NEW.${reference.from[index]}`)
    .join(' AND ');

  // `UPDATE OF` and not a bare `UPDATE`: a row that references a term retired after it was
  // written must stay editable in its other columns, or "leaves rows referencing it intact"
  // would mean intact and frozen. Narrowing to the reference columns is what keeps the two
  // halves of the promise from contradicting each other.
  const on = event === 'insert'
    ? `BEFORE INSERT ON ${reference.table}`
    : `BEFORE UPDATE OF ${reference.from.join(', ')} ON ${reference.table}`;

  // A NULL reference selects no row, so the subquery is NULL and the WHEN is false — which is
  // what a nullable reference like `finding.agent` needs, and what a `NOT NULL` one never
  // reaches.
  return `
    CREATE TRIGGER ${guardName(reference, event)}
    ${on} FOR EACH ROW
    WHEN (SELECT retired_at FROM ${reference.parent} WHERE ${match}) IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'retired: ${describe(reference)} references a retired ${reference.parent} row');
    END
  `;
}

/**
 * Create a guard per referencing column, for inserts and for updates of that column.
 *
 * **The existing set is dropped first, and that is what makes this callable more than once.**
 * A migration adds tables and columns after the guards were last derived, so the set has to be
 * re-derived on every run rather than appended to — and the drop is by name pattern read out
 * of `sqlite_schema`, not by the names about to be created, so a guard whose reference a
 * migration *removed* goes with it. Recreating an identical trigger is the ordinary case and
 * costs nothing; leaving a stale one behind would refuse writes against a table that no longer
 * has the reference the guard was protecting.
 *
 * @returns The trigger names created — so a caller and a test can distinguish a generator that ran
 *   from one that produced nothing, which a green suite cannot.
 */
export function createRetirementGuards(db: DatabaseSync): string[] {
  const stale = (db
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger'")
    .all() as Array<{ name: string }>)
    .filter((trigger) => GUARD_SUFFIX.test(trigger.name));

  for (const trigger of stale) {
    db.exec(`DROP TRIGGER ${trigger.name}`);
  }

  const created: string[] = [];

  for (const reference of vocabularyReferences(db)) {
    for (const event of ['insert', 'update'] as Event[]) {
      db.exec(guard(reference, event));
      created.push(guardName(reference, event));
    }
  }

  return created;
}
