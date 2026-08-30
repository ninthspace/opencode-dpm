/**
 * Restoring the committed dump into a database that holds no planning artefacts (FR6, AD14).
 *
 * The README has said since it was written that `.dpm/dpm.sql` is what a checkout restores from,
 * and until now nothing performed it — `restore()` was reachable only from the conflicted-merge
 * path, so a fresh clone got an empty database beside a dump full of rows. Deferring the create
 * (49-01) is what makes this placeable: the first open is now a decision point rather than
 * something that already happened at launch.
 *
 * **Only when the database holds nothing anyone could want, and that asymmetry is the whole of
 * AD14.** Restoring into nothing can lose nothing, so it needs no confirmation and gets none;
 * restoring *over* planning work can lose everything, so this never does it, whatever the dump
 * says. A user who wants that asks for it through the import path, which is a different thing
 * with different protections.
 *
 * **"Nothing" originally meant "no file", and that was too narrow by exactly one case.** A
 * database can be present and have never held an artefact — created by a run that opened it and
 * wrote nothing, or by a version whose first call created the file before deciding anything. It
 * then sits beside a dump full of rows, and `existsSync` alone declines to restore forever. Every
 * read succeeds by returning nothing, which is indistinguishable from a project with no planning
 * yet, so the condition is silent in both directions. Observed in this repository: a database
 * created empty on 13 August, a committed dump holding 27 documents beside it, and three months
 * of DPM work invisible to every session that opened it.
 *
 * **The test for "never held an artefact" is `document` and `number_sequence` both empty**, and
 * the second half is what makes it safe. Every planning artefact is a document, and every document
 * allocates a number — so a user who deliberately cleared their corpus still has the sequences,
 * numbers not being reclaimed, and is never restored over. Seeded vocabulary, `schema_version` and
 * `plugin_stamp` are written by starting the server rather than by anyone planning, so they do not
 * count as use; a session row does not either, being run state that a restore is welcome to
 * replace. Anything this cannot positively prove empty — an unreadable file, a database with no
 * schema at all — declines, because the promise is only ever made in one direction.
 *
 * **An existing file is removed rather than restored into.** The dump carries its own
 * `CREATE TABLE` statements, so it needs a database with no schema; a database that has been
 * opened has one. Removing a file this function has just proved holds nothing is the same act as
 * never having had it, which is the case immediately below.
 *
 * **AD14 has a third case, and the paragraph above is what makes it easy to get wrong: under a
 * read-only server, never** (spec 49, FR12). The safety argument for the automatic restore rests
 * on the caller — someone who asked dpm to open their planning database and was going to use it,
 * for whom a restore is the outcome they wanted. An observer asked for none of that: spec 48's
 * board opens projects it does not own, and a restore is a write, so it is out of bounds there
 * however empty the directory is and however plainly the dump says what belongs in it. Nothing in
 * this function enforces that, deliberately — `open()` returns above the call site, so the
 * suppression is a property of where the read-only branch sits rather than a condition here that
 * a caller could forget to pass.
 *
 * **`restore()` alone — deliberately not the staging-file-and-rename sequence** `merge/main.js`
 * uses. Those protections exist to keep a live database intact while an uncertain restore runs
 * against a scratch file. Here there is no live database: the file this creates did not exist a
 * moment ago and holds nothing anyone could want. Reusing the sequence would be harmless and
 * misleading, and the next reader would take the protections as evidence something was at risk.
 *
 * **What is kept from that sequence is the failure behaviour, for a reason specific to this
 * path.** `restore()` rolls back so that a failed restore changes nothing — but opening the
 * connection has already created the file, and a file that exists is exactly what stops this
 * function running next time. Left behind, a bad dump would produce one error and then an empty
 * database, silently, forever. So a failed restore removes what it created and re-throws, and the
 * next session tries again and reports the same fault.
 */

import type { DatabaseSync } from 'node:sqlite';

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { openConnection } from '../db/connection.ts';
import { restore as restoreDump } from '../restore/index.ts';

/**
 * The dump's name inside the database's directory.
 *
 * Derived from the database's own location rather than taken from `guard/index.js`'s repo-relative
 * `DUMP_PATH`, because `DPM_DATABASE` can point the database anywhere and the dump is defined by
 * AD4 as the file *beside* it. A constant here would be right for the default and wrong for every
 * override.
 */
export const DUMP_FILE = 'dpm.sql';

/**
 * Whether the database at `location` has never held a planning artefact.
 *
 * **Both halves, and the failure direction is chosen rather than incidental.** `document` empty
 * says there is nothing there now; `number_sequence` empty says there never was. Either alone is
 * wrong in a way that matters — the first would restore over a corpus somebody cleared on purpose,
 * and the second is not a claim about content at all.
 *
 * Anything that stops this answering — a file SQLite will not open, a database with no schema in
 * it — is `false`. The caller is deciding whether to delete a file, so "could not tell" and "has
 * been used" have to reach it as the same answer.
 *
 */
function unwritten(location: string, connect: typeof openConnection): boolean {
  let db: DatabaseSync | undefined;

  try {
    db = connect(location, { readOnly: true });

    // Both assertions state what the two lines above already guarantee — the connection is open by
    // the time this runs, and a `count(*)` returns a row. Asserted rather than tested, because a
    // test here would take the `catch` below on a shape that cannot occur, and the `catch` is
    // reserved for the conditions the doc comment names.
    const counted = (table: string) =>
      (db!.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;

    return counted('document') === 0 && counted('number_sequence') === 0;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

/**
 * Restore the dump beside `location` into it, if and only if `location` holds no planning artefact.
 *
 * Runs before `start()` rather than against the connection it returns: the dump carries its own
 * `CREATE TABLE` statements, so it needs a database with no schema, and `start()` migrates and
 * seeds. The restored file is then opened by `start()` in the ordinary way, which is what brings
 * an older dump's schema forward — a clone of a branch behind this server gets migrated on first
 * open exactly as a database committed at that version would be.
 *
 * @param location A file path, or `:memory:`.
 * @param options.restore Injected alongside `open()`'s other seams so the
 *   *order* of the three is observable: the story's must-NOT is a condition-and-ordering claim,
 *   and a test that read the rows afterwards would pass whether the restore ran in the right
 *   place, the wrong place, or not at all.
 * @returns Which case restored, so the caller can report the unusual one accurately (FR10) — the
 *   two differ in what the user is being told happened to a file they may know they have. `false`
 *   when nothing ran.
 */
export function restoreIfUnwritten(
  location: string,
  { restore = restoreDump, connect = openConnection }: {
    restore?: typeof restoreDump;
    connect?: typeof openConnection;
  } = {},
): false | 'absent' | 'unwritten' {
  if (location === ':memory:') return false;

  const dump = join(dirname(location), DUMP_FILE);

  if (!existsSync(dump)) return false;

  const present = existsSync(location);

  if (present && !unwritten(location, connect)) return false;

  // Proved empty a line ago, so this removes nothing anyone could want — and it is what lets the
  // restore below run against a database with no schema, which is the only kind a dump fits.
  if (present) rmSync(location, { force: true });

  const db = connect(location);

  try {
    restore(db, readFileSync(dump, 'utf8'));
  } catch (error) {
    db.close();
    rmSync(location, { force: true });

    throw error;
  }

  db.close();

  return present ? 'unwritten' : 'absent';
}
