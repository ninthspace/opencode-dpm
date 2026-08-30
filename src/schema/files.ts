/**
 * The DDL files, and the order they apply in.
 *
 * A module of its own so that `index.js` and `migrate.js` can both read the list without one
 * importing the other. The DDL lives in numbered `.sql` files rather than in template literals
 * so it stays greppable and its diffs read as SQL.
 *
 * Ordering is the filename prefix, and it is also the schema version — see `migrate.js`.
 * Nothing here resolves dependencies between files: SQLite resolves a foreign key at write
 * time rather than at `CREATE`, so a forward reference to a table a later file creates is
 * legal — it simply cannot take rows until that file has run.
 */

import { readdirSync } from 'node:fs';

/** `001-identity.sql` — a three-digit order prefix and a lower-case slug. */
const SCHEMA_FILE = /^\d{3}-[a-z0-9-]+\.sql$/;

/** Where the `.sql` files live. */
export function schemaDirectory() {
  return import.meta.dirname;
}

/**
 * The DDL files, in application order.
 *
 * Throws rather than returning nothing: a migration run that silently applied no DDL leaves
 * an empty database that every subsequent read reports as merely having no rows (NFR6).
 *
 * @returns {string[]} Filenames, sorted by their order prefix.
 */
export function schemaFiles() {
  const files = readdirSync(schemaDirectory()).filter((name) => SCHEMA_FILE.test(name)).sort();

  if (files.length === 0) {
    throw new Error(`no schema files found in ${schemaDirectory()}`);
  }

  return files;
}
