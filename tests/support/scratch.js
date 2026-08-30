/**
 * A temporary directory a test owns, and gives back.
 *
 * Four files had written this themselves by the time the sync marker arrived (Epic 49-03), each
 * with its own prefix and the same three lines under it. It is collected here for the reason the
 * session vocabulary was: the shape is not interesting, and four copies of an uninteresting shape
 * is four places to look when the cleanup needs to change.
 *
 * The prefix stays a parameter rather than becoming a constant, because it is the one part that
 * differs and the one part that is useful — a stray directory left behind by a crashed run names
 * the suite that made it.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * An empty directory under the system temp root, removed when the test finishes.
 *
 * @param {import('node:test').TestContext} t
 * @param {string} [prefix] Named for the suite, so an orphan is traceable.
 * @returns {string} An absolute path to a directory that exists and holds nothing.
 */
export function ownedDirectory(t, prefix = 'dpm-') {
  const directory = mkdtempSync(join(tmpdir(), prefix));

  t.after(() => rmSync(directory, { recursive: true, force: true }));

  return directory;
}
