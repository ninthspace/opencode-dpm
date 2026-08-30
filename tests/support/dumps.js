/**
 * Dump text built for a test to hand to something that reads one.
 *
 * Three files had grown their own copy of "bring up an in-memory planning database, write through
 * the tool surface, dump it" — the merge suite, the restore-on-create suite and the marker suite.
 * They are the same four lines, and the reason to collect them is not the four lines: it is that a
 * dump is an *input* to everything under test here, and three private builders is three chances for
 * one of them to drift into producing something the release would never write.
 *
 * Built through `applySchema` + `applyVocabulary` + the real tool handlers, never by statement, so
 * what comes out is a dump of a database dpm itself could have produced.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openConnection } from '../../src/db/connection.ts';
import { dump } from '../../src/dump/index.ts';
import { DUMP_FILE } from '../../src/server/from-dump.ts';
import { applySchema } from '../../src/schema/index.ts';
import { applyVocabulary } from '../../src/schema/seeds/index.ts';
import { surface } from './git.js';

/**
 * Put a dump where a first open will find it, creating `.dpm/` if this is a bare directory.
 *
 * The shape a fresh clone arrives in, and the fixture behind both of the questions asked about one:
 * whether an ordinary first call restores from it, and whether a read-only one leaves it alone. The
 * path is built from `DUMP_FILE` rather than written out, so a suite cannot come to disagree with
 * the module about where a dump lives.
 *
 * @param {string} directory The project root the server will run in.
 * @param {string} sql
 */
export function commitDump(directory, sql) {
  mkdirSync(join(directory, '.dpm'), { recursive: true });
  writeFileSync(join(directory, '.dpm', DUMP_FILE), sql, 'utf8');
}

/**
 * The dump of a database with the schema and the seeded vocabulary and nothing else.
 *
 * @returns {string}
 */
export function emptyDump() {
  return dumpOf(() => {});
}

/**
 * The dump of a database holding one spec, and a slug nothing else in the suite creates.
 *
 * The slug is the point rather than the spec: a criterion about *the dump's* rows needs a row that
 * cannot have come from anywhere else, and a seeded vocabulary term or a tool-synthesised default
 * satisfies a bare non-empty check without the dump having been read at all.
 *
 * @param {string} slug
 * @returns {string}
 */
export function dumpHolding(slug) {
  return dumpOf((call) => call.create_spec({ slug, title: `The ${slug}` }));
}

/**
 * Apply `change` through the tool surface and dump the result.
 *
 * @param {(call: Record<string, Function>) => void} change
 * @returns {string}
 */
function dumpOf(change) {
  const db = applySchema(openConnection(':memory:'));

  try {
    applyVocabulary(db);
    change(surface(db));

    return dump(db).sql;
  } finally {
    db.close();
  }
}
