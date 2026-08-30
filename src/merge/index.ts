/**
 * The merge tool (FR8, FR28, AD4, AD9).
 *
 * AD4 commits the database as text so that branching works at all, and for most of what a branch
 * does that is enough: two people adding artefacts write disjoint rows with ULID keys, git merges
 * the file as prose, and the result restores. FR8 exists for the one thing that does not resolve
 * that way — both branches allocated from their own copy of `number_sequence` and both got 47 —
 * because the two rows are different rows claiming one name, and no textual merge of a file can
 * see that, let alone repair it.
 *
 * **The three sides come from git's index, not from the file git left behind.** `git show :1:`,
 * `:2:` and `:3:` are the base, ours and theirs as they were committed, and each of them restores
 * cleanly on its own — the collision exists only in their union. So `restore()` is reused
 * unchanged, with its `foreign_key_check` and its register sweep, and nothing here parses SQL.
 *
 * The alternative — repairing the conflicted file after a human resolved it — was rejected on a
 * fact about the format rather than on taste. A dump carrying two rows with number 47 cannot be
 * loaded at all: the second `INSERT` trips `document_root_number` and `db.exec` is all-or-nothing.
 * Loading it would mean dropping the uniqueness indexes *before* applying the file, which means
 * splitting the file into statements — and that is not line-splitting, because
 * `document_section.body` holds newlines and `literal.text()` emits them raw inside the quoted
 * string. It would take a quote-aware SQL parser, sitting on the path that repairs a merge.
 *
 * **The uniqueness indexes come down for the repair and go back up before the commit.** That is
 * the deliberate part: dropping them makes the invalid state reachable, so `collisions()` can name
 * it, and rebuilding them at the end is what proves every collision was repaired. A repair that
 * missed one fails at the `CREATE UNIQUE INDEX` rather than passing and leaving the projection to
 * render two artefacts with the same number.
 */

import type { DatabaseSync } from 'node:sqlite';

import type { Collision, DocumentRow, Move } from './numbers.ts';
import type { Change, Conflict } from './rows.ts';

import { openConnection } from '../db/connection.ts';
import { dump } from '../dump/index.ts';
import { restore } from '../restore/index.ts';
import { assignNumbers, collisions, documents, numberScopes } from './numbers.ts';
import { applyPlan, MergeError, SEQUENCE_TABLE, snapshot, threeWay } from './rows.ts';

/** What a merge produces — one shape, whether or not it got as far as writing rows. */
export type MergeResult = {
  sql: string | null;
  renumbered: Move[];
  conflicts: Conflict[];
  collided: Collision[];
  counts: { inserted: number; updated: number; deleted: number } | null;
};

/** Whether this connection is enforcing foreign keys. Per-connection, and per-transaction-state. */
const enforcing = (db: DatabaseSync) => (db
  .prepare('PRAGMA foreign_keys')
  .get() as { foreign_keys: number }).foreign_keys === 1;

/**
 * The documents this database will hold once `change` is applied.
 *
 * Computed rather than observed, because observing it would mean writing the collision down first —
 * and the two partial unique indexes exist precisely so that cannot happen.
 */
function prospective(db: DatabaseSync, change: Change): DocumentRow[] {
  const rows = new Map(documents(db).map((row) => [row.id, row]));

  // Cast because the caller passes `plan.get('document')`, whose rows are document rows — a fact
  // about which key was asked for rather than about the plan's own type.
  for (const row of [...change.updates, ...change.inserts] as DocumentRow[]) {
    rows.set(row.id, {
      id: row.id,
      kind: row.kind,
      numbering: row.numbering,
      number: row.number,
      sequence: row.sequence,
      parent_id: row.parent_id,
    });
  }

  return [...rows.values()];
}

/**
 * Load one side of the merge into memory.
 *
 * A side that does not restore is reported as that side, by name. "restore rejected after 41
 * checks" during a merge is unactionable otherwise: three dumps went in, and the message says
 * nothing about which one is broken.
 */
function load(side: string, sql: string) {
  const db = openConnection(':memory:');

  try {
    restore(db, sql);
  } catch (error) {
    db.close();

    throw new MergeError(
      `the ${side} side of the merge does not restore — ${(error as Error).message}`,
    );
  }

  return db;
}

/**
 * Merge three dumps into one, repairing number collisions on the way.
 *
 * Pure with respect to the working tree: it takes three strings and returns one, so every
 * assertion about what a merge does can be made without a repository.
 *
 * @param {object} sides
 * @param {string} sides.base    `git show :1:.dpm/dpm.sql` — the common ancestor.
 * @param {string} sides.ours    `git show :2:.dpm/dpm.sql`.
 * @param {string} sides.theirs  `git show :3:.dpm/dpm.sql`.
 * @returns {{sql: string|null, renumbered: object[], conflicts: object[],
 *   collided: object[], counts: object}} `sql` is null exactly when `conflicts` is non-empty —
 *   a merge that could not be decided produces no output rather than a partial one.
 */
export function merge(
  { base, ours, theirs }: { base: string; ours: string; theirs: string },
): MergeResult {
  const dbBase = load('base', base);
  const dbOurs = load('ours', ours);
  const dbTheirs = load('theirs', theirs);

  try {
    const { plan, conflicts } = threeWay(snapshot(dbBase), snapshot(dbOurs), snapshot(dbTheirs));

    if (conflicts.length > 0) {
      return { sql: null, renumbered: [], conflicts, collided: [], counts: null };
    }

    const scopes = numberScopes(dbOurs);

    // Off before `BEGIN`, and read back, for the reason `restore()` states: SQLite ignores this
    // pragma inside a transaction, silently. The merge applies rows in schema order, which is not
    // topological — a child arrives before its parent — so enforcement has to be down for the
    // duration and the check has to be the explicit scan at the end.
    dbOurs.exec('PRAGMA foreign_keys = OFF');

    if (enforcing(dbOurs)) {
      throw new MergeError(
        'foreign key enforcement could not be disabled — merge must not run inside a transaction',
      );
    }

    dbOurs.exec('BEGIN');

    let renumbered;
    let collided;
    let counts;

    try {
      // 1. Every deletion, before anything is written: a number a deletion frees is a number the
      //    repair may then hand out.
      const removed = applyPlan(dbOurs, plan, { writes: false });

      // 2. The counter, before the repair, because the repair allocates from it.
      const counters = applyPlan(dbOurs, plan, {
        deletes: false,
        tables: (table) => table === SEQUENCE_TABLE,
      });

      // 3. The state the repair reasons about is the one the database is *about* to hold, not the
      //    one it holds: the uniqueness indexes are up, so the colliding row cannot be written and
      //    then examined. `collided` is read before any repair and returned with the result,
      //    because "no collision was silently overwritten" is a claim about this state — without
      //    it the only evidence a collision existed is that a number changed.
      // `!` here and below because `threeWay` puts every table of the three snapshots in the plan,
      // and `document` is in all three or the tables-differ conflict above already returned.
      const candidate = prospective(dbOurs, plan.get('document')!);

      collided = collisions(dbOurs, scopes, candidate);

      const moves = assignNumbers(dbOurs, scopes, candidate);

      renumbered = [...moves.values()];

      // 4. A document already here moves by `UPDATE`, and it has to move before the row that wants
      //    its number arrives.
      const incoming = new Set([
        ...plan.get('document')!.inserts.map((row) => row.id),
        ...plan.get('document')!.updates.map((row) => row.id),
      ]);

      for (const move of moves.values()) {
        if (incoming.has(move.id)) continue;

        dbOurs.prepare(`UPDATE document SET ${move.column} = ? WHERE id = ?`)
          .run(move.to, move.id);
      }

      // 5. Everything else, with an arriving document's new number substituted on the way in.
      const written = applyPlan(dbOurs, plan, {
        deletes: false,
        tables: (table) => table !== SEQUENCE_TABLE,
        substitute: (table, row) => {
          const id = row.id as string;

          if (table !== 'document' || !moves.has(id)) return row;

          const move = moves.get(id)!;

          return { ...row, [move.column]: move.to };
        },
      });

      counts = {
        inserted: counters.inserted + written.inserted,
        updated: counters.updated + written.updated,
        deleted: removed.deleted,
      };
    } catch (error) {
      dbOurs.exec('ROLLBACK');

      throw error;
    }

    dbOurs.exec('COMMIT');
    dbOurs.exec('PRAGMA foreign_keys = ON');

    const merged = dump(dbOurs).sql;

    // **Validated by restoring it, not by inspecting it.** The story's criterion is that the
    // merged dump restores and the restored database passes `foreign_key_check` and the register,
    // and the honest way to assert that is to do it — into a throwaway connection, so a merge that
    // produced an unrestorable file reports here rather than at the user's `.dpm/dpm.db`.
    const check = openConnection(':memory:');

    try {
      restore(check, merged);
    } catch (error) {
      throw new MergeError(`the merged dump does not restore — ${(error as Error).message}`);
    } finally {
      check.close();
    }

    return { sql: merged, renumbered, conflicts: [], collided, counts };
  } finally {
    dbBase.close();
    dbOurs.close();
    dbTheirs.close();
  }
}

/**
 * The report a user reads.
 *
 * Every renumber is named with both numbers and the side is not hidden: the ULID rule can pick the
 * document a human would have kept, and a user who can see what moved can move it back.
 *
 * @param {ReturnType<typeof merge>} result
 * @returns {string}
 */
export function describe(result: MergeResult) {
  if (result.conflicts.length > 0) {
    return [
      `dpm: ${result.conflicts.length} row `
      + `${result.conflicts.length === 1 ? 'conflict' : 'conflicts'} the merge cannot decide:`,
      ...result.conflicts.map((conflict) => `  ${conflict.table} ${conflict.key} — ${conflict.reason}`),
      '',
      'Nothing was written. These rows changed on both branches, and choosing one would discard',
      'the other silently. Resolve them in the database on one branch, re-dump, and merge again.',
    ].join('\n');
  }

  if (result.renumbered.length === 0) {
    // `!` because a null `counts` only accompanies conflicts, and those returned above.
    return `dpm: merged cleanly — ${result.counts!.inserted} rows added, `
      + `${result.counts!.updated} changed, ${result.counts!.deleted} removed, `
      + 'no number collisions';
  }

  return [
    `dpm: merged — ${result.renumbered.length} `
    + `${result.renumbered.length === 1 ? 'document was' : 'documents were'} renumbered because `
    + 'both branches allocated the same number:',
    ...result.renumbered.map(
      (moved) => `  ${moved.kind} ${moved.from} → ${moved.to}  (${moved.id})`,
    ),
    '',
    'The later-created document moved, which is what would have happened had both been created on',
    'one branch. Nothing was lost and no stored text changed: references are resolved at render',
    'time, so the projection has been regenerated and now names the new number.',
  ].join('\n');
}
