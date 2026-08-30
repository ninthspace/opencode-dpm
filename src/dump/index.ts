/**
 * The deterministic dump (FR8, NFR4, AD4).
 *
 * Schema first with the index triggers before any row, then the rows, then the triggers that
 * react to edits. The committed form of the database is this file, and AD4 stakes the whole
 * branching story on it merging as ordinary text — which is only true if the same state
 * produces the same bytes every time.
 *
 * **Not `sqlite3 .dump`**, for three reasons the spec executed rather than reasoned about: it
 * emits FTS5 shadow tables as hex blobs, it orders rows by storage order, and it does not exist
 * in `node:sqlite`. The first two are silent — a file that looks right and conflicts on every
 * commit — which is why the story asserts the absence of a delegation structurally rather than
 * trusting the output to reveal it.
 */

import type { DatabaseSync } from 'node:sqlite';

import { dumpSchema, PREAMBLE } from './schema.ts';
import { dumpRows } from './rows.ts';
import { dumpableObjects } from './objects.ts';

/** Every dump ends with exactly one newline, and every line separator is LF. */
const LF = '\n';

export type Dump = {
  /** The file's whole contents. */
  sql: string;
  /** Schema objects emitted, by name. */
  kept: string[];
  /** What was left out, and why. */
  excluded: Array<{ name: string; reason: string }>;
  /** Rows emitted per table. */
  counts: Record<string, number>;
  /** How each table's order was decided. */
  orderings: Record<string, string>;
  /**
   * Columns emitted with a fixed value in place of the stored one, because the stored one is a
   * property of the machine rather than of the content. See `rows.ts`.
   */
  normalised: Array<{ table: string; column: string; value: string }>;
};

/**
 * Dump `db` to deterministic SQL.
 *
 * The return value carries far more than the text on purpose. A dump is a large file whose
 * defects are invisible by inspection — a missing table looks exactly like a table with no
 * rows — so the exclusions, the row counts and the ordering decisions come back as data a test
 * can assert against. Returning the string alone would leave every one of those properties
 * checkable only by parsing the output, which is how a checker ends up testing itself.
 *
 */
export function dump(db: DatabaseSync): Dump {
  const { objects, excluded, owners } = dumpableObjects(db);
  const schema = dumpSchema(db);
  const rows = dumpRows(db, objects, owners);

  // LF is the only separator every part produces, so the file needs no normalisation pass —
  // and a normalisation pass is what would hide a CRLF creeping in from a value rather than
  // from the format. Values are emitted verbatim; only the framing is fixed here.
  //
  // Four parts, not three: the triggers that maintain a derived index come before the rows so
  // the index rebuilds from them, and every other trigger comes after so that replaying a row
  // is not mistaken for editing it. `schema.js` holds the reasoning and the predicate.
  const sql = `${PREAMBLE}${schema.sql}${rows.sql}${schema.deferred}`;

  if (!sql.endsWith(LF)) {
    throw new Error('dump does not end in a newline — a statement was emitted without one');
  }

  return {
    sql,
    kept: schema.kept,
    excluded,
    counts: rows.counts,
    orderings: rows.orderings,
    normalised: rows.normalised,
  };
}
