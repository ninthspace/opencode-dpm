/**
 * Schema application.
 *
 * Creating a schema is migrating an empty database, so this is a thin name over `migrate.js`
 * rather than a second path to the same tables. Before Story 5 it was the only path; keeping
 * the name means Story 1's tests still say what they meant, and keeping it *thin* means there
 * is nothing here that a migrated database could fail to receive.
 *
 * The DDL lives in numbered `.sql` files listed by `files.js`; the one exception is the
 * retirement guards, which `retirement.js` generates from the finished schema because they are
 * one trigger per referencing column and a hand-written set is a set someone eventually
 * forgets to extend. The migration path calls the same generator, which is what lets Story 8's
 * comparison of a migrated `sqlite_schema` against a freshly created one mean anything.
 */

import type { DatabaseSync } from 'node:sqlite';

import { migrate } from './migrate.ts';

export { schemaFiles } from './files.ts';

/**
 * Create the schema on `db`.
 *
 * Each file applies in its own transaction, so a file that fails part-way leaves the database
 * at the version before it rather than holding a partial schema — a state in which some
 * constraints hold and others are merely absent, which is the hardest kind to notice.
 *
 * @returns The same connection, for chaining.
 */
export function applySchema(db: DatabaseSync): DatabaseSync {
  migrate(db);
  return db;
}
