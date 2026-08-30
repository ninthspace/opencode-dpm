/**
 * The sync marker: what the dump looked like the last time the two sides agreed (AD13).
 *
 * A clean pull rewrites `.dpm/dpm.sql` and touches nothing else, so the local database is silently
 * stale. The guard then compares `dump(db)` against the file, finds they differ, and has no way to
 * say *which* of them moved — after both a pull and local work the worktree matches `HEAD`, so git
 * cannot tell it either, and a row-set diff cannot, because a local deletion and a remote addition
 * produce the same signature. One hash recorded at the last agreement answers it unambiguously.
 *
 * **A file rather than a `sync_state` table**, because the dump is generated from the database: a
 * hash stored in a row would end up inside the file it hashes, and excluding one table from the
 * dump to escape that is a special case against spec 47's NFR4, which makes byte-stability
 * load-bearing. The filename is already covered by AD4's `dpm.db*` ignore pattern — the marker is
 * machine-local for exactly the reason the database is, and `tests/` asserts that coverage from
 * git rather than assuming it from the shape of the name.
 *
 * **This module is the only place the hash is computed.** The guard reads the marker and hashes two
 * other texts to compare against it; publish and import write it. Three call sites computing a
 * digest three ways is a verdict that disagrees with itself the first time one of them normalises
 * a newline — and the disagreement is silent, because every hash looks like a hash.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Where the marker lives, relative to the repository root.
 *
 * Beside the database rather than beside the dump — it describes a *local* state, and the `.synced`
 * suffix on `dpm.db` is what puts it under the ignore pattern written for the database and its WAL
 * sibling. A name like `dpm.sql.synced` would have been committed by everyone.
 */
export const MARKER_PATH = '.dpm/dpm.db.synced';

/**
 * The hash of a dump text.
 *
 * Over the bytes exactly as they are — no trimming, no newline normalisation. The guard's whole
 * discipline is regenerate-and-diff-bytes (AD8), and a marker that agreed with a dump the byte
 * comparison would call different is a marker that reports clean on a divergence.
 *
 * @param {string} sql A dump produced by `src/dump/`.
 * @returns {string} A hex sha256 digest.
 */
export function hashDump(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

/**
 * The hash recorded at the last sync point, or `null` when there is no marker.
 *
 * Absence is a finding rather than an error — it is two of AD13's five states, and it is what every
 * database that exists today will report on its first run after this ships. `contents()` in the
 * guard treats a missing file the same way and for the same reason.
 *
 * @param {object} [options]
 * @param {string} [options.root] The repository root the marker sits under.
 * @returns {string|null}
 */
export function readMarker({ root = '.' }: { root?: string } = {}): string | null {
  try {
    // Trimmed on the way out, not on the way in: the file is written with a trailing newline so it
    // is a normal text file at a terminal, and a reader that returned `"<hash>\n"` would compare
    // unequal to every hash this module produces.
    return readFileSync(join(root, MARKER_PATH), 'utf8').trim();
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return null;

    throw error;
  }
}

/**
 * Record `sql` as the state both sides are now at.
 *
 * Takes the dump *text* rather than a hash, so no caller can record a digest of something other
 * than a dump. That matters more than the convenience: a marker is only ever wrong in ways that
 * look right, and the one thing a caller could get wrong here is which text it hashed.
 *
 * @param {string} sql The dump text now on disk.
 * @param {object} [options]
 * @param {string} [options.root] The repository root the marker sits under.
 * @returns {string} The hash written, so a caller can report or assert it without re-deriving.
 */
export function writeMarker(sql: string, { root = '.' }: { root?: string } = {}): string {
  const target = join(root, MARKER_PATH);
  const hash = hashDump(sql);

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${hash}\n`, 'utf8');

  return hash;
}
