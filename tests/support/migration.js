/**
 * Databases from before the current release.
 *
 * Every vocabulary-evolution criterion in Story 5 is about what an *upgrade* does, and an
 * upgrade needs a database that predates it. A test that builds the new state directly and
 * then checks the new state asserts nothing about the path between them — so the shape here
 * is always: build an old database, close it, start it again with a release description that
 * differs, and read what changed.
 *
 * It lives in `support/` because it opens databases and applies DDL, which is the harness's
 * job rather than a fixture's.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabaseFile } from './database.js';
import { schemaDirectory, schemaFiles } from '../../src/schema/files.ts';
import { versionOf } from '../../src/schema/migrate.ts';
import { createRetirementGuards } from '../../src/schema/retirement.ts';
import { VOCABULARIES } from '../../src/schema/seeds/index.ts';

/**
 * The highest schema version below the one this server migrates to.
 *
 * Derived from the files rather than written down, for the same reason `targetVersion` is: a test
 * pinning "the previous version" to a number goes stale on the next migration while continuing to
 * pass, having quietly become a test about some particular older release.
 *
 * @returns {number}
 */
export function previousVersion() {
  return schemaFiles().map(versionOf).sort((a, b) => a - b).at(-2);
}

/**
 * The schema version immediately before the migration whose filename carries `slug`.
 *
 * **For a test about one particular migration**, where `previousVersion` is the wrong question and
 * silently becomes a different one: a test asserting that a database gains `plugin_stamp` was
 * written when that file was the newest, and the day another file lands "the previous version" is
 * one that already has the table. The failure is loud here and was not free — three tests went red
 * on the migration after it, which is the design working rather than a cost.
 *
 * Derived from the filename so a renamed migration fails here rather than quietly matching nothing.
 *
 * @param {string} slug Part of the file's name, e.g. `plugin-stamp`.
 * @returns {number}
 */
export function versionBefore(slug) {
  const file = schemaFiles().find((name) => name.includes(slug));

  if (!file) throw new Error(`no schema file names '${slug}' — was the migration renamed?`);

  return versionOf(file) - 1;
}

/**
 * The shipped vocabulary narrowed to the tables a database actually has.
 *
 * **What a release seeded is bounded by what that release's schema held**, and a fixture built at
 * an older version is exactly that database. Seeding this release's whole vocabulary into it fails
 * on the first table a later migration adds — which is a fault in the fixture rather than in the
 * seed, since no release ever shipped that combination.
 *
 * The filter is over the live schema rather than over a version number: the question the seed asks
 * is whether the table is there.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{table: string, rows: object[]}[]} [vocabularies]
 * @returns {{table: string, rows: object[]}[]}
 */
export function vocabularyAsOf(db, vocabularies = VOCABULARIES) {
  const present = new Set(
    db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all().map((row) => row.name),
  );

  return vocabularies.filter(({ table }) => present.has(table));
}

/**
 * A temp-file database carrying the schema as of `version`, and nothing later.
 *
 * The DDL is applied and recorded by hand rather than by calling `migrate`, which is the
 * point: `migrate` always brings a database to the current version, so a test that used it to
 * build its starting state would have no earlier state to upgrade from. The guards are
 * derived at the old version too, so the count they reach afterwards is a real change.
 *
 * @param {import('node:test').TestContext} t
 * @param {number} version
 * @returns {{path: string, connect: () => import('node:sqlite').DatabaseSync}}
 */
export function databaseAtVersion(t, version) {
  const file = openDatabaseFile(t);
  const db = file.connect();

  for (const name of schemaFiles().filter((filename) => versionOf(filename) <= version)) {
    db.exec(readFileSync(join(schemaDirectory(), name), 'utf8'));

    if (versionOf(name) > 0) {
      db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
        .run(versionOf(name), '2026-01-01T00:00:00Z');
    }
  }

  createRetirementGuards(db);
  db.close();

  return file;
}

/**
 * The shipped vocabulary with one table's rows replaced — a stand-in for the next release.
 *
 * Takes the real `VOCABULARIES` and substitutes, rather than letting a test hand-write a list:
 * a test whose "release" carried only the table it cares about would upgrade a database into a
 * state where every other vocabulary had been dropped from the release, and would then be
 * asserting against a release that could never ship.
 *
 * @param {{table: string, rows: object[]}[]} vocabularies
 * @param {string} table
 * @param {(rows: object[]) => object[]} change
 */
export function release(vocabularies, table, change) {
  return vocabularies.map((vocabulary) =>
    vocabulary.table === table ? { table, rows: change(vocabulary.rows) } : vocabulary);
}
