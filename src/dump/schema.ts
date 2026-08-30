/**
 * The schema half of the dump — every object's DDL, index triggers included, before any row (FR8).
 *
 * **Index triggers are emitted here rather than after the data, and that ordering is the
 * mechanism rather than a tidiness preference.** A derived index is not carried in the file:
 * restoring `document_section` fires `document_fts_insert` row by row and the index arrives as
 * a consequence of the data. Emit those triggers after the rows and the restored database holds
 * every row, an empty index, and no error — which is why the dump excludes FTS5 shadow tables
 * in the first place, and why doing so is only safe if the triggers survive.
 *
 * **Every other trigger is emitted after the rows, for the mirror-image reason.** A restore is
 * a replay, not an edit, and the triggers that react to edits corrupt it: replaying the
 * `coverage` rows fired `requirement_unclaim_on_coverage_insert` once per row and nulled the
 * `coverage_claimed_at` and `coverage_claim_hash` of 40 requirements the dump had carried
 * faithfully three hundred lines earlier. That is not a rounding error in a derived value — a
 * claim is a recorded fact, with a time and a hash, and nothing regenerates it. The retirement
 * guards (`*_not_retired_on_insert`) are deferred by the same rule; they write nothing, so
 * deferring them costs only their validation during the replay, and `checkIntegrity` runs over
 * the restored database afterwards and holds the same invariants from the register.
 *
 * The split is `maintainsVirtualTable`, which reads what the trigger writes to rather than what
 * it is called.
 *
 * **Order is `sqlite_schema` order, and it was verified rather than assumed.** The concern was
 * that a database reached by migration and one created from empty would order their objects
 * differently, making two logically identical databases dump to different bytes — the
 * conflict-on-every-commit failure NFR4 exists to prevent. They do not: Epic 47-01 Story 5 made
 * `applySchema` delegate to `migrate`, so both paths apply the same numbered files in the same
 * sequence, and `createRetirementGuards` dropping and recreating its triggers on every start
 * leaves the order unchanged. Both cases were run before this file was written.
 */

import type { DatabaseSync } from 'node:sqlite';

import { dumpableObjects, maintainsVirtualTable } from './objects.ts';
import type { SchemaObject } from './objects.ts';

/**
 * The dump's opening lines.
 *
 * `foreign_keys=OFF` is not optional and not a convenience. Any dump ordered by natural key —
 * which NFR4 requires — is not in topological order, and `document.parent_id` is
 * self-referential, so no fixed table order avoids a forward reference. Restore is therefore
 * the one connection on which every foreign key in the schema is advisory, which is exactly
 * why it must end with `PRAGMA foreign_key_check` (Story 2) rather than trusting that it did
 * not need to.
 *
 * No `BEGIN`/`COMMIT` here: the restorer wraps the file in its own transaction, so a dump
 * carrying one would nest and the failure would surface as a confusing error rather than as
 * the rollback that was wanted.
 */
export const PREAMBLE = 'PRAGMA foreign_keys=OFF;\n';

/**
 * Every schema object's `CREATE` statement, in `sqlite_schema` order.
 *
 * The SQL is SQLite's own record of the statement, not a re-rendering of it: anything this
 * function reconstructed could differ from what the database actually holds, and a dump that
 * restores into a *nearly* identical schema is worse than one that fails.
 *
 * @returns `sql` precedes the rows and `deferred` follows them. Both halves keep `sqlite_schema`
 *   order within themselves, so the same database still produces the same bytes (NFR4).
 */
export function dumpSchema(db: DatabaseSync) {
  const { objects, excluded, owners } = dumpableObjects(db);

  // Each `sql` is stored without its terminator, so every statement gets one. A missing
  // semicolon does not fail at dump time — it fails on restore, at the line where two
  // statements ran together into one that means something else.
  const statement = (object: SchemaObject) => `${object.sql};\n`;
  const deferrable = (object: SchemaObject) =>
    object.type === 'trigger' && !maintainsVirtualTable(object, owners);

  const sql = objects.filter((object) => !deferrable(object)).map(statement).join('');
  const deferred = objects.filter(deferrable).map(statement).join('');

  return { sql, deferred, kept: objects.map((object) => object.name), excluded, owners };
}
