/**
 * Rebuilding the database from a dump and bringing the tree back into agreement (FR8, AD16).
 *
 * Restore into a staging file, prove the dump survives its own restore, move it into place,
 * publish both artefacts, and re-guard. **The check sits before the move**, so a refusal is a
 * database the run declined to replace rather than a report about one it already had. The merge has done this since epic 47-04; the import does
 * exactly the same thing with a dump that arrived in a pull rather than one produced by a
 * three-way merge, and **AD16 is AD11's reasoning applied a second time**: two implementations of
 * "rebuild the database from a dump" disagree the first time either end changes, and the
 * disagreement is silent. So there is one, and both callers reach it.
 *
 * **The staging file and the rename are the part a second copy omits.** They are four lines and
 * they look like caution rather than correctness, which is exactly why they would not survive
 * being retyped. A restore straight over `.dpm/dpm.db` that fails part way leaves the user with
 * neither their database nor the operation they ran — a worse position than the one they started
 * in, and one they reached by trying to fix it.
 *
 * **Every refusal here is worded for both callers**, which is a constraint rather than a
 * preference: FR8 asks for one message from one implementation, and a message naming *the merge*
 * is a message the import cannot use, so the drift the extraction prevents would come straight
 * back as two error strings that had to be kept in step by hand.
 *
 * **Nothing here is staged in git.** The tool writes files and stops, the same rule the merge and
 * the guard already follow: a rebuild that staged its own output would make replacing the database
 * something that happened without a review.
 */

import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { openConnection } from '../db/connection.ts';
import { dump } from '../dump/index.ts';
import { describe as describeGuard, guard } from '../guard/index.ts';
import { publish } from '../publish/index.ts';
import { restore } from '../restore/index.ts';

/**
 * The suffix the staging database is built under, beside the real one.
 *
 * Beside rather than in a temp directory, because a rename across filesystems is a copy that can
 * fail half-way — which is the failure the staging file exists to rule out.
 */
export const STAGING_SUFFIX = '.merging';

/**
 * A rebuild that refused, carrying the message both callers print.
 *
 * Typed rather than a return value for the reason `MergeError` is: every one of these is a refusal
 * that ends the command, so a caller that forgot to check a returned flag would carry on and
 * report success. `instanceof` is what lets a caller re-throw anything it did not expect instead of
 * turning a programming error into an exit code.
 */
export class RebuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RebuildError';
  }
}

/**
 * Remove the staging database, and never raise doing it.
 *
 * **This runs only on the failure path, so an error raised here would replace the error being
 * reported.** `rmSync`'s `force` flag covers a file that is not there and nothing else: when the
 * staging path is unreachable — its parent is a regular file, a permission changed underneath —
 * `rmSync` throws, and it throws *inside the `catch` block that was about to explain what actually
 * went wrong. The caller then sees `ENOTDIR: lstat` where it expected a `RebuildError`, re-throws
 * because the type is wrong, and a refusal the tool knows how to report becomes a stack trace.
 *
 * Swallowing is right specifically because of where this sits: the thing it cleans up is a file
 * this function created seconds ago, in a run that has already failed, and the worst outcome of
 * failing to remove it is a stray sibling the next run deletes anyway.
 *
 * @param {string} staging
 */
function discard(staging: string) {
  try {
    rmSync(staging, { force: true });
  } catch {
    // Deliberately nothing — see above.
  }
}

/**
 * Rebuild the database from `sql` and bring the generated artefacts into agreement with it.
 *
 * @param {string} sql The dump to rebuild from — a merged result, or the committed file.
 * @param {object} options
 * @param {string} options.root The repository root.
 * @param {string} options.location The database, relative to `root` or absolute.
 *
 *   Required rather than defaulted. Both entry points already resolve `DPM_DATABASE` and a third
 *   default here would be a fourth answer to "where is the database" that no environment variable
 *   reaches — wrong only in the setups that override it, which are the ones nobody tests.
 * @returns {{removed: string[]}} What publishing deleted, so the caller can report it. Removal is
 *   the one irreversible thing this does, and a caller that could not name what went is a caller
 *   whose user finds out from a diff.
 * @throws {RebuildError} On a restore that fails, a dump that does not survive its own restore, or
 *   a tree left inconsistent afterwards.
 */
export function rebuild(sql: string, { root, location }: { root: string; location: string }) {
  // Under `root` and not under the working directory, and `resolve` rather than `join` so an
  // absolute `DPM_DATABASE` still points where it says — the same rule the guard follows.
  const target = resolve(root, location);
  const staging = `${target}${STAGING_SUFFIX}`;

  try {
    mkdirSync(dirname(target), { recursive: true });
    discard(staging);

    const fresh = openConnection(staging);

    try {
      restore(fresh, sql);

      // **The dump has to survive its own restore, and the check is stated rather than inferred.**
      // Before publish existed this call site wrote `sql` to disk and let the guard compare
      // `dump(db)` against it, so a file that restored into a database dumping differently failed.
      // `publish` writes what the database dumps, which makes that comparison trivially true — the
      // check would have disappeared into the refactor without anything reporting its absence.
      //
      // **It asks the staging database, before the rename, and that is the whole point of having
      // one.** Asked after, the refusal is a report about a replacement that has already happened:
      // the run says it will not commit a state nobody reviewed while the state nobody reviewed is
      // already the database. Observed doing exactly that — an import refused, having first
      // replaced a one-document database with a twenty-seven-document one.
      if (dump(fresh).sql !== sql) {
        throw new RebuildError(
          'dpm: the dump did not survive its own restore — the database it produced dumps '
          + 'differently, so committing it would commit a state nobody reviewed.',
        );
      }
    } finally {
      fresh.close();
    }

    renameSync(staging, target);
  } catch (error) {
    // **The staging file goes before the error does.** Left behind it is a half-written database
    // beside the real one, which the next run would remove anyway — but between the two runs it
    // is a file a user finds, cannot identify, and may well delete the wrong sibling of.
    discard(staging);

    // A refusal composed above already names what it refused and why. Only an error arriving from
    // somewhere else needs the restore framing, and wrapping both would bury the round-trip
    // message inside a sentence about a restore that in fact succeeded.
    if (error instanceof RebuildError) throw error;

    throw new RebuildError(
      `dpm: the dump did not restore into ${location} — ${(error as Error).message}`,
    );
  }

  const db = openConnection(target);

  try {
    // **Both artefacts, one call, and the orphan rule is not restated here.** A renumbered
    // document's old file is on disk and no document produces it, which is what the guard already
    // knows how to recognise; `publish` removes exactly what the guard would report, so the two
    // cannot disagree the first time naming changes. Publishing is also what records the sync
    // point (AD13) — without it the marker would still name the pre-rebuild dump, and the guard
    // below would answer about a state that no longer exists.
    const { removed } = publish(db, { root });

    const after = guard(db, { root });

    if (after.diverged.length > 0) {
      throw new RebuildError(
        `dpm: the rebuild left the tree inconsistent, which is a bug:\n${describeGuard(after)}`,
      );
    }

    return { removed };
  } finally {
    db.close();
  }
}

/**
 * What a rebuild did to the tree, as the lines a person reads after it.
 *
 * **Here rather than in each caller for the reason the sequence itself is** (AD16). The merge and
 * the import both have to report the removals and both have to warn about a server holding the old
 * database open, and the two sentences that matter are the two most easily dropped from a second
 * copy: a removal is the only irreversible thing a rebuild does, and the WAL warning is the
 * difference between a confusing afternoon and a restart. What differs between the callers is the
 * headline above and the `git add` below, so those stay theirs.
 *
 * @param {{removed: string[]}} result What {@link rebuild} returned.
 * @param {object} options
 * @param {string} options.root The repository root.
 * @param {string} options.stage The staging command this caller wants the reader to run.
 * @returns {string[]} Lines, to be joined by the caller with whatever it puts around them.
 */
export function report(
  { removed }: { removed: string[] },
  { root, stage }: { root: string; stage: string },
) {
  const lines = [];

  if (removed.length > 0) {
    lines.push('', 'Removed, because no document produces them any more:',
      ...removed.map((path: string) => `  ${path}`));
  }

  lines.push('', `Review the changes and stage them: ${stage}`);

  if (existsSync(join(root, '.dpm', 'dpm.db-wal'))) {
    lines.push('A dpm server may be holding the old database open — restart it before using it.');
  }

  return lines;
}
