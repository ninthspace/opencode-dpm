/**
 * Reading a database off disk, from a connection the test opens and closes again.
 *
 * `rebuild.test.js` and `import.test.js` had each written these, and the reason to collect them is
 * not the four lines: **both suites test operations that replace the database file**, and a handle
 * opened before the rename goes on describing the inode that was discarded. Every assertion made
 * through it is about the database the operation threw away, and it is green either way.
 *
 * So the rule is in the helper rather than in a comment each suite has to remember: nothing here
 * takes a connection. It takes a path, and opens it now.
 */

import { openConnection } from '../../src/db/connection.ts';
import { dump } from '../../src/dump/index.ts';

/**
 * Open the database at `path`, hand it to `read`, and close it again.
 *
 * @param {string} path
 * @param {(db: import('node:sqlite').DatabaseSync) => any} read
 * @returns {any} Whatever `read` returned.
 */
export function openConnectionAt(path, read) {
  const db = openConnection(path);

  try {
    return read(db);
  } finally {
    db.close();
  }
}

/**
 * Every document slug in the database at `path`, sorted.
 *
 * Slugs rather than a count, so "the original still opens" can be a claim about *which* database is
 * there — a rebuild that replaced it with a working database of something else passes every count.
 *
 * @param {string} path
 * @returns {string[]}
 */
export function slugsIn(path) {
  return openConnectionAt(path, (db) =>
    db.prepare('SELECT slug FROM document ORDER BY slug').all().map((row) => row.slug));
}

/**
 * The dump of the database at `path`.
 *
 * The byte-for-byte form of the same question `slugsIn` asks loosely, for the assertions that need
 * it: a database that opened and had been rewritten satisfies a slug comparison.
 *
 * @param {string} path
 * @returns {string}
 */
export function dumpOf(path) {
  return openConnectionAt(path, (db) => dump(db).sql);
}
