/**
 * The controlled vocabularies, and the only two ways they ever change (FR24, FR12).
 *
 * AD8 says a project starts from an empty database, and this is the one thing that is not
 * empty in it. The distinction is between *data* and *terms*: a spec, an epic and a finding
 * arrive through the tool surface, but the fact that `finding` is a legal category name and
 * `Findings` is not has to be true before the first row is written, or the constraints that
 * depend on it hold vacuously.
 *
 * **Seeding and upgrading are the same operation, run on every server start.** A plugin-side
 * vocabulary change reaches an existing project through FR12's migration channel and never
 * through a re-seed, and exactly two operations are legal:
 *
 * 1. **Insert a term that is absent**, guarded on the **primary key**.
 * 2. **Retire a term that is live**, `SET retired_at WHERE retired_at IS NULL`.
 *
 * Both are idempotent and neither reads project state, which together are why the schema
 * needs no record of which rows a project has touched — no provenance column, no content
 * hash, no reconcile step. A fresh database is simply one where every term is absent, so the
 * first run inserts all of them and every later run inserts what the release added.
 *
 * **Guarding on the key and not on live terms is what stops resurrection.** Retirement sets a
 * column; the row stays. An insert guarded on "no live term of this name" would find none,
 * insert a second row — or overwrite the first — and hand back a term the project had
 * deliberately retired, on the next upgrade, every upgrade. Guarding on the key sees the row
 * that is there and does nothing.
 *
 * **Rewriting a term's text is not one of the operations, deliberately.** A row's `name` or
 * `display_name` is what every row referencing it is recorded as meaning, and changing it
 * changes the meaning of history silently — no row moves, no constraint fires, and the
 * finding filed last year now says something else. It is also how a project's own edit would
 * be destroyed, since nothing distinguishes an edited default from a shipped one. The ban is
 * kept by there being no statement here that could do it.
 */

import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

import { AGENTS } from './agents.ts';
import { DEPENDENCY_ENDPOINTS } from './dependency-endpoints.ts';
import { DEPENDENCY_KINDS } from './dependency-kinds.ts';
import { DOCUMENT_KINDS, KIND_PARENTS } from './document-kinds.ts';
import { RETIREMENTS } from './retirements.ts';
import { TAXONOMY } from './taxonomy.ts';
import { TEST_APPROACHES } from './test-approaches.ts';

/** One vocabulary table and the terms this release ships for it. */
export type Vocabulary = { table: string; rows: Array<Record<string, unknown>> };

/** One term this release retires, and the date it records for the retirement. */
export type Retirement = { table: string; key: string; at: string };

/** Every vocabulary, in application order — parents before the tables that reference them. */
export const VOCABULARIES: Vocabulary[] = [
  { table: 'document_kind', rows: DOCUMENT_KINDS },
  {
    table: 'document_kind_parent',
    rows: KIND_PARENTS.map(([kind, parent_kind]) => ({ kind, parent_kind })),
  },
  { table: 'taxonomy', rows: TAXONOMY },
  { table: 'agent', rows: AGENTS },
  { table: 'test_approach', rows: TEST_APPROACHES },
  { table: 'dependency_kind', rows: DEPENDENCY_KINDS },
  {
    table: 'dependency_kind_endpoint',
    rows: DEPENDENCY_ENDPOINTS.map(([kind, source_kind, target_kind]) => ({
      kind, source_kind, target_kind,
    })),
  },
];

/** A table's primary key columns, in declaration order — the conflict target. */
function primaryKeyOf(db: DatabaseSync, table: string): string[] {
  const columns = (db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ pk: number; name: string }>)
    .filter((column) => column.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((column) => column.name);

  // A vocabulary with no primary key has no absence to guard on, so every run would insert
  // its terms again. Refusing is the only honest answer: `ON CONFLICT DO NOTHING` without a
  // target would appear to work and would quietly key off whichever other constraint fired.
  if (columns.length === 0) {
    throw new Error(`${table} has no primary key — an insert-if-absent has nothing to guard on`);
  }

  return columns;
}

/**
 * Operation 1 — insert each row that is not already present, by primary key.
 *
 * @returns {{inserted: number, present: number}} Distinguishing the two is the point: a run
 *   that found everything present and one that could not write are otherwise identical.
 */
function insertIfAbsent(db: DatabaseSync, table: string, rows: Vocabulary['rows']) {
  const columns = Object.keys(rows[0]);
  const statement = db.prepare(`
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${columns.map(() => '?').join(', ')})
    ON CONFLICT (${primaryKeyOf(db, table).join(', ')}) DO NOTHING
  `);

  let inserted = 0;

  for (const row of rows) {
    inserted += Number(statement.run(...columns.map((column) => row[column] as SQLInputValue)).changes);
  }

  return { inserted, present: rows.length - inserted };
}

/**
 * Operation 2 — retire each named term that is still live.
 *
 * `WHERE retired_at IS NULL` is what makes this idempotent *and* what stops it overwriting a
 * date. A project that retired the same term earlier keeps its own date, which is the one that
 * describes what actually happened in that project.
 *
 * @returns {{retired: number, alreadyRetired: number, absent: number}}
 */
function retireIfLive(db: DatabaseSync, retirements: Retirement[]) {
  const summary = { retired: 0, alreadyRetired: 0, absent: 0 };

  for (const { table, key, at } of retirements) {
    const column = primaryKeyOf(db, table);

    if (column.length !== 1) {
      throw new Error(`cannot retire ${table} by key: its primary key is ${column.join(', ')}`);
    }

    const changes = db
      .prepare(`UPDATE ${table} SET retired_at = ? WHERE ${column[0]} = ? AND retired_at IS NULL`)
      .run(at, key).changes;

    if (changes === 1) {
      summary.retired += 1;
      continue;
    }

    // Nothing changed, and the two reasons are not the same event. A term already retired is
    // the ordinary second run; a term that is not there at all is a project that deleted it,
    // which is legal and is worth being able to see in the return value rather than reading
    // as a retirement that happened.
    const present = db.prepare(`SELECT 1 FROM ${table} WHERE ${column[0]} = ?`).get(key);
    if (present) summary.alreadyRetired += 1;
    else summary.absent += 1;
  }

  return summary;
}

/**
 * Bring `db`'s vocabularies up to what this release ships. Safe on a fresh database and on one
 * that has been through every upgrade since.
 *
 * @param options.vocabularies What this release ships; injected so a test can run an upgrade
 *   carrying a term the current release does not.
 */
export function applyVocabulary(
  db: DatabaseSync,
  { vocabularies = VOCABULARIES, retirements = RETIREMENTS }: {
    vocabularies?: Vocabulary[];
    retirements?: Retirement[];
  } = {},
) {
  db.exec('BEGIN');

  let result;

  try {
    result = {
      inserted: Object.fromEntries(
        vocabularies.map(({ table, rows }) => [table, insertIfAbsent(db, table, rows)]),
      ),
      retired: retireIfLive(db, retirements),
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  db.exec('COMMIT');
  return result;
}
