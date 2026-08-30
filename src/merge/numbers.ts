/**
 * Human-number collisions, and their repair (FR8, AD9).
 *
 * AD9 gives every row a ULID, so two branches adding artefacts never collide on a primary key —
 * which is what makes the dump merge as text at all. The human number is the exception, and it is
 * not an oversight: a number is short, ordered and quotable precisely because it is allocated from
 * a counter, and each branch has its own copy of that counter. Both got 47.
 *
 * **Detection is separate from repair, and the separation is what the must-NOT rests on.** A tool
 * that only ever renumbered would have nothing to assert against — "a collision was not silently
 * overwritten" is a claim about a state the repair has already left. `collisions()` names that
 * state, so a test can stand in the middle of the merge and see it.
 */

import type { DatabaseSync } from 'node:sqlite';

import { allocateNumber } from '../numbering/allocate.ts';
import { MergeError } from './rows.ts';

/**
 * The `COLUMNS` shape below — what `documents()` returns and what every function here reads.
 *
 * The index signature is not slack: `columnOf` returns a column *name*, and half this file reads
 * `row[column]` with the name in a variable. Naming the six columns as well keeps `row.kind` a
 * string rather than an `unknown` every caller has to cast.
 */
export type DocumentRow = {
  id: string;
  kind: string;
  numbering: string;
  number: number | null;
  sequence: number | null;
  parent_id: string | null;
  [column: string]: unknown;
};

/** A partial unique index over `document`, and the columns it spans. */
type Scope = { name: string; columns: string[] };

/** One group of documents that would share a number under `scope`. */
export type Collision = { scope: string; columns: string[]; values: unknown[]; ids: string[] };

/** A document moved off a number it would otherwise have shared. */
export type Move = {
  id: string; kind: string; numbering: string; column: string; from: unknown; to: number;
};

/** SQLite's own identifiers, never user input. */
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/**
 * The column sets a document's number must be unique within, read from the indexes that enforce it.
 *
 * `001-identity.sql` declares two partial unique indexes — `(kind, number)` for root-numbered kinds
 * and `(kind, parent_id, sequence)` for child-numbered ones — and this reads their columns rather
 * than restating them. A detector that carried its own copy of the rule could disagree with the
 * constraint — and the merge writes its rows through that constraint, so the disagreement surfaces
 * either as a `UNIQUE constraint failed` on a collision detection did not see, or as a renumber
 * nobody needed. Reading the index is what keeps the two answers one answer.
 *
 * **A NULL in any keyed column means the row is outside that index**, which is exactly what both
 * partial predicates say: `number IS NOT NULL` for the first, `sequence IS NOT NULL AND parent_id
 * IS NOT NULL` for the second, and `kind` is `NOT NULL` on the table. So the predicate needs no
 * separate evaluation — skipping rows with a NULL in the key reproduces both.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{name: string, columns: string[]}[]}
 */
export function numberScopes(db: DatabaseSync): Scope[] {
  const partial = (db
    .prepare('PRAGMA index_list("document")')
    .all() as Array<{ name: string; unique: number; partial: number }>)
    .filter((index) => index.unique === 1 && index.partial === 1)
    .map((index) => index.name)
    .sort();

  const scopes = partial.map((name) => ({
    name,
    columns: (db
      .prepare(`PRAGMA index_info(${quote(name)})`)
      .all() as Array<{ seqno: number; name: string }>)
      .sort((a, b) => a.seqno - b.seqno)
      .map((column) => column.name),
  }));

  if (scopes.length === 0) {
    throw new MergeError(
      'document has no partial unique index on its number — there is nothing to detect a '
      + 'collision against, so a merge here would report success on a duplicated number',
    );
  }

  return scopes;
}

/** The columns every collision question is asked of, and the shape `documents()` returns. */
const COLUMNS = 'id, kind, numbering, number, sequence, parent_id';

/**
 * Every document, in the shape collision detection reads.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {object[]}
 */
export function documents(db: DatabaseSync): DocumentRow[] {
  return db.prepare(`SELECT ${COLUMNS} FROM document ORDER BY id`).all() as DocumentRow[];
}

/**
 * Every group of documents claiming one number.
 *
 * **`rows` is a parameter because the interesting state is one the database cannot hold.** The two
 * partial unique indexes forbid a collision, so a merge never gets to write one down and then look
 * at it; what it has instead is a *candidate* row set — what the database would hold once both
 * sides' rows are in — and that is what has to be examined. Passing the rows in also keeps
 * detection genuinely separate from repair, which is what the story's must-NOT needs: a test can
 * hold the colliding set and assert it is seen, without the repair having run.
 *
 * @param {import('node:sqlite').DatabaseSync} db  Only for the scopes, when they are not given.
 * @param {ReturnType<typeof numberScopes>} [scopes]
 * @param {object[]} [rows] The candidate set. Defaults to what `db` actually holds.
 * @returns {{scope: string, columns: string[], values: unknown[], ids: string[]}[]}
 */
export function collisions(
  db: DatabaseSync, scopes: Scope[] = numberScopes(db), rows: DocumentRow[] = documents(db),
) {
  const found: Collision[] = [];
  const ordered = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));

  for (const scope of scopes) {
    const groups = new Map<string, { values: unknown[]; ids: string[] }>();

    for (const row of ordered) {
      const values = scope.columns.map((column) => row[column]);

      if (values.some((value) => value === null || value === undefined)) continue;

      const key = JSON.stringify(values);

      if (!groups.has(key)) groups.set(key, { values, ids: [] });

      // `!` because the line above puts the key there when it is missing.
      groups.get(key)!.ids.push(row.id);
    }

    for (const group of groups.values()) {
      if (group.ids.length < 2) continue;

      found.push({ scope: scope.name, columns: scope.columns, values: group.values, ids: group.ids });
    }
  }

  return found;
}

/**
 * Which documents in a collision give up their number.
 *
 * **The greater ULID loses.** The rule is computed from data both sides carry, so it does not
 * depend on which branch is being merged into which: `git merge main` from a feature branch and
 * `git merge feature` on main move the same document. And it agrees with what would have happened
 * had the two artefacts been created one after the other in a single repository, since AD9 already
 * means ids sort by creation time — the second one to exist takes the next number, exactly as it
 * would have without the branch.
 *
 * It can pick the side a human would not have. Nothing is lost when it does: both documents
 * survive, the loser takes the next free number, and the report names which moved, so reversing it
 * is one further command.
 *
 * Three documents on one number is reachable through a repeated merge, so this returns a list:
 * every id but the smallest, in id order, which is the same rule applied repeatedly rather than a
 * second rule for the three-way case.
 *
 * @param {string[]} ids
 * @returns {string[]}
 */
export function losersOf(ids: string[]) {
  return [...ids].sort().slice(1);
}

/** Which column carries a row's human number, or null when the kind has none. */
const columnOf = (row: DocumentRow) => (
  { root: 'number', child: 'sequence' } as Record<string, string | undefined>
)[row.numbering] ?? null;

/** The slot a value would occupy — the identity the uniqueness indexes enforce. */
const slotOf = (row: DocumentRow, value: unknown) => (row.numbering === 'root'
  ? `root|${row.kind}|${value}`
  : `child|${row.kind}|${row.parent_id}|${value}`);

/**
 * A number for `row` that nothing in `claimed` holds.
 *
 * **One allocation, and a tripwire — not a search.** The counter always clears the whole merged
 * set, and it does so by two facts that meet here rather than by luck. Register entry 5 requires
 * `next_value` to be at least the highest number allocated for its kind, and every side of a merge
 * has been through `restore()`, so every side satisfies it. `mergeSequence` then takes the larger
 * of the two counters, which is therefore at least the highest number in the union. The next
 * allocation is past all of them.
 *
 * A retry loop was written here first, on the assumption that a document might hold a number the
 * counter never issued. Nothing that restores can be in that state — entry 5 rejects it — so the
 * loop could not run twice, and a loop that cannot iterate reads as though numbers were scattered
 * when they are not.
 *
 * **`claimed` is the merged set, not the database**, and the check stays because the two facts
 * above are held in two other files. If either moves, the symptom without this is a `UNIQUE
 * constraint failed` several statements later, naming an index rather than the reason.
 */
function freeNumber(db: DatabaseSync, row: DocumentRow, claimed: Set<string>) {
  const to = allocateNumber(db, row.kind, row.numbering === 'root' ? null : row.parent_id);

  if (claimed.has(slotOf(row, to))) {
    throw new MergeError(
      `allocating a ${columnOf(row)} for ${row.kind} '${row.id}' returned ${to}, which the merged `
      + 'set already holds — the merged counter is behind the merged documents, which register '
      + 'entry 5 forbids and every side of this merge satisfied on its own',
    );
  }

  return to;
}

/** The slots a candidate row set occupies. */
function claimedSlots(rows: DocumentRow[]) {
  const claimed = new Set<string>();

  for (const row of rows) {
    const column = columnOf(row);

    if (column && row[column] !== null) claimed.add(slotOf(row, row[column]));
  }

  return claimed;
}

/**
 * Decide a new number for the loser of every collision in `rows`, and allocate it.
 *
 * Returns the moves rather than applying them, because the rows they describe are in two different
 * places: a document already in this database moves by `UPDATE`, and one arriving from the other
 * branch moves by having its number changed on the way in. One decision, two applications.
 *
 * **No other column is touched, including `updated_at`.** The criterion is that renumbering changes
 * no stored text, and it is not a technicality: FR28 makes every reference to this document a
 * `{{ref:<id>}}` marker or a foreign key, so no stored text *needs* changing — and a tool that
 * rewrote a timestamp here would make the merged dump differ from a freshly regenerated one on a
 * column nobody asked about.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {ReturnType<typeof numberScopes>} scopes
 * @param {object[]} rows The candidate document set.
 * @returns {Map<string, {id: string, kind: string, numbering: string, column: string,
 *   from: number, to: number}>}
 */
export function assignNumbers(db: DatabaseSync, scopes: Scope[], rows: DocumentRow[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const claimed = claimedSlots(rows);
  const moves = new Map<string, Move>();

  for (const group of collisions(db, scopes, rows)) {
    for (const id of losersOf(group.ids)) {
      // `!` because the ids come from `collisions` over these same `rows`.
      const row = byId.get(id)!;
      const column = columnOf(row);

      if (!column || row[column] === null) {
        throw new MergeError(
          `cannot renumber ${row.kind} '${id}' — it is numbered '${row.numbering}' and has no number`,
        );
      }

      const to = freeNumber(db, row, claimed);

      claimed.add(slotOf(row, to));
      moves.set(id, { id, kind: row.kind, numbering: row.numbering, column, from: row[column], to });
    }
  }

  return moves;
}

/**
 * Move one stored document to a free number.
 *
 * The single-row form of the same decision, for the documents that are already here. It shares
 * `freeNumber`, so the number a stored document moves to and the number an arriving one moves to
 * come from one allocator rather than two that agree today.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} id
 * @returns {{id: string, kind: string, numbering: string, column: string, from: number, to: number}}
 */
export function renumber(db: DatabaseSync, id: string) {
  const row = db.prepare(`SELECT ${COLUMNS} FROM document WHERE id = ?`)
    .get(id) as DocumentRow | undefined;

  if (!row) throw new MergeError(`cannot renumber ${id} — no document with that id`);

  const column = columnOf(row);

  if (!column || row[column] === null) {
    throw new MergeError(
      `cannot renumber ${row.kind} '${id}' — it is numbered '${row.numbering}' and has no number`,
    );
  }

  const others = documents(db).filter((other) => other.id !== id);
  const to = freeNumber(db, row, claimedSlots(others));

  db.prepare(`UPDATE document SET ${column} = ? WHERE id = ?`).run(to, id);

  return { id, kind: row.kind, numbering: row.numbering, column, from: row[column], to };
}
