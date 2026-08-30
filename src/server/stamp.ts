/**
 * Recording which release of dpm last wrote to a database (FR2, FR2a).
 *
 * `plugin_stamp` holds one row. This is what puts a version in it, and — much more of the work —
 * what keeps a version out of it.
 *
 * **The write is conditional on an increase, and that condition is the requirement rather than an
 * optimisation** (FR2a, NFR3). `dpm.sql` is committed, and a pre-commit guard compares it against
 * the live database; a stamp rewritten on every start would diverge that dump every session, so the
 * guard would fire on commits that changed nothing, and a guard that fires on nothing stops being
 * read. The feature would then have cost the project the check that catches real divergence, in
 * exchange for a diagnostic. So: equal leaves the row alone, lower leaves the row alone, and only
 * strictly higher writes.
 *
 * **Lower leaves it alone for a second reason, which outlives the dump argument.** The column
 * answers *what is the newest release that has written here*, and that is what a backward-skew
 * check needs: a colleague publishing from a newer plugin is the situation being detected, and an
 * older server that overwrote the stamp on the way past would erase the evidence of exactly the
 * skew it was about to be asked about.
 *
 * **Nothing here decides whether it may write.** A database ahead of this server, and a server
 * launched to observe, are both refusals that belong to their own callers — `start` skips this the
 * way it skips seeding, and the read-only path never reaches `start` at all. A guard repeated here
 * would be a second answer to a question already answered, and the two would disagree eventually.
 */

import type { DatabaseSync } from 'node:sqlite';

import { isAbove } from './node-floor.ts';
import { pluginVersion } from './plugin-version.ts';
import { SKEW, SOURCE } from './skew.ts';
import type { Skew } from './skew.ts';

/** The one table, named once so a rename is one edit rather than a search. */
const TABLE = 'plugin_stamp';

/** What a read of the stamp answers. `reason` is prose for the cases where `version` is null. */
type Stamp = { present: boolean; version: string | null; reason: string | null };

/** The running server's version, which is `null` when the manifest does not say. */
type Running = { version?: string | null };

/**
 * What this database says about the plugin that last wrote to it, and why it says nothing.
 *
 * **An absent table is a value rather than an error**, and that is the whole reason this returns a
 * record instead of a string. The ordinary case for it is a read-only launch against a project this
 * release has never opened: the table arrives with a migration, a read-only launch does not migrate,
 * and a board observing forty projects will meet this on most of them. A reader that threw would
 * turn the commonest state into an exception at the top of every report.
 *
 * The three silences are kept apart because a caller can tell a user which one it is: no table, a
 * table with no row, and a read that failed. They all yield no version, and only the third is a
 * problem.
 *
 * **This is the containment boundary for NFR2, and it is the only one.** Both reads are guarded
 * here, and they are the only two statements in this module's read path that touch the database —
 * so a caller wanting a verdict that never throws gets it by going through this function rather
 * than by wrapping it. `stampSkew` deliberately carries no `catch` of its own; see there.
 *
 */
export function readStamp(db: DatabaseSync): Stamp {
  let present;

  try {
    present = db
      .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?")
      .get(TABLE) !== undefined;
  } catch (error) {
    // `catch` binds `unknown` under `strict`. Cast rather than narrowed, here and at every other
    // catch in the tree: a runtime `instanceof` test would change what a non-`Error` throw
    // produces, and this conversion is not the place to decide that.
    return { present: false, version: null, reason: `this database could not be read: ${(error as Error).message}` };
  }

  if (!present) {
    return {
      present: false,
      version: null,
      reason: 'this database has no plugin stamp — no server that records one has opened it',
    };
  }

  try {
    const version = (db.prepare(`SELECT version FROM ${TABLE}`).get()?.version ?? null) as string | null;

    return {
      present: true,
      version,
      reason: version === null ? 'the plugin stamp table is present and empty' : null,
    };
  } catch (error) {
    return { present: true, version: null, reason: `the plugin stamp could not be read: ${(error as Error).message}` };
  }
}

/**
 * The version recorded in this database, or `null` if none is.
 *
 * `null` covers all three of the silences above. Callers that need to tell them apart use
 * {@link readStamp}; `stampPlugin` does not, because a database with no stamp and one with an empty
 * stamp are both databases it is about to write the first version into.
 *
 */
export function recordedStamp(db: DatabaseSync): string | null {
  return readStamp(db).version;
}

/**
 * Record this server's version if it is above the one recorded (FR2, FR2a).
 *
 * Reports what it did in every case rather than returning nothing, for the reason the other start
 * steps do (NFR6): *wrote nothing because the versions match* and *wrote nothing because something
 * went wrong* are the same observation from outside, and only one of them is fine.
 *
 * @param options.version The running server's version. A parameter for the reason
 *   `now` is: a test that cannot pin it can assert only that the row holds whatever this checkout
 *   happens to say, which is not a test of the increase rule.
 */
export function stampPlugin(db: DatabaseSync, { version = pluginVersion() }: Running = {}): {
  recorded: string | null; previous: string | null; written: boolean; reason?: string;
} {
  const previous = recordedStamp(db);

  // A server that cannot name itself writes nothing. `pluginVersion` returns `null` for a manifest
  // that is missing, unparseable, or silent about its version, and the alternative to stopping here
  // is recording the absence — which a later comparison would read as a version and report a skew
  // against.
  if (version === null) {
    return {
      recorded: previous,
      previous,
      written: false,
      reason: 'this server cannot read its own version from its manifest',
    };
  }

  if (previous !== null && !isAbove(version, previous)) {
    return {
      recorded: previous,
      previous,
      written: false,
      reason: `${version} is not above the recorded ${previous}`,
    };
  }

  // `ON CONFLICT` rather than a delete and an insert: the row is the table's whole content, and a
  // window in which it is absent is a window in which a concurrent reader sees an unstamped
  // database. The upsert is one statement, so there is no such window.
  db.prepare(`INSERT INTO ${TABLE} (singleton, version) VALUES (1, ?)
              ON CONFLICT (singleton) DO UPDATE SET version = excluded.version`).run(version);

  return { recorded: version, previous, written: true };
}

/**
 * Whether the database was last written by a plugin newer than this one (FR3, FR5).
 *
 * **The same three states as the neighbour check, and the same vocabulary object** — imported from
 * `skew.js` rather than restated, because FR5's distinction is between *checked and found nothing*
 * and *could not check*, and two enums spelling that differently would let one report say `none`
 * where the other says `unknown` for the same situation.
 *
 * **Never throws** (NFR2). Every way this can fail to reach an answer — a server that cannot name
 * itself, a database with no stamp table, a table it cannot read, a version string that will not
 * parse — arrives as `unknown` carrying a reason. The alternative is a tool call failing over a
 * diagnostic that was only ever advisory, and failing hardest against precisely the databases the
 * diagnostic exists to describe.
 *
 * **And it holds without a `catch` here, which is the design rather than an omission.** The two
 * database reads are inside {@link readStamp} and guarded there; `isAbove` composes `parseVersion`,
 * which coerces with `String` and answers `NaN` rather than throwing. So there is no path from this
 * function's body to an exception, and a `catch` around it would be a clause no test could reach —
 * which is exactly what a mutation run found when one was here: rewriting it to rethrow broke
 * nothing, because nothing had ever entered it. Untestable defence reads as tested defence, and
 * that is worse than none. A later change that adds a read here adds its guard to `readStamp`.
 *
 * **The remedy differs from the neighbour skew's and is not composed here** (FR4). A neighbour skew
 * is fixed by restarting the session; this one is fixed by updating the plugin, because the newer
 * release is not on this machine at all. Both sentences are in `skew.js`, selected by the `source`
 * this verdict carries — one composer, one place, and it is not this one.
 *
 * @param options.version The running server's version.
 */
export function stampSkew(db: DatabaseSync, { version = pluginVersion() }: Running = {}): Skew {
  const verdict = { source: SOURCE.stamp };

  if (version === null) {
    return {
      ...verdict,
      state: SKEW.unknown,
      running: null,
      reason: 'this server cannot read its own version from its manifest',
    };
  }

  const stamp = readStamp(db);

  if (stamp.version === null) {
    return { ...verdict, state: SKEW.unknown, running: version, reason: stamp.reason };
  }

  return isAbove(stamp.version, version)
    ? { ...verdict, state: SKEW.found, running: version, recorded: stamp.version }
    : { ...verdict, state: SKEW.none, running: version, recorded: stamp.version };
}
