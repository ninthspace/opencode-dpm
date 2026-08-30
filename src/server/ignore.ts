/**
 * The ignore file that keeps the generated database out of the commit (FR4, AD15).
 *
 * **Nested in `.dpm/` rather than appended to the repository's root `.gitignore`.** git honours a
 * `.gitignore` in any directory, so this does the same job without editing a file the user owns
 * (ENVX2) and without needing to be idempotent against whatever else is in theirs. Committed
 * beside `.dpm/dpm.sql`, it reaches every clone once.
 *
 * **The star is load-bearing.** `dpm.db*` covers the WAL and journal siblings — `merge/main.js`
 * already looks for `.dpm/dpm.db-wal` — and the `dpm.db.synced` sync marker. What it must *not*
 * cover is `dpm.sql`: that is the committed artefact AD4 says carries the text, and a pattern that
 * swallowed it would break every clone while looking like it worked.
 *
 * **Written before the database file is created, and only when absent.** Before, because a
 * database that exists unignored even briefly can be staged by a `git add -A` in that window.
 * Only when absent, because a user who has edited theirs has said something, and a server that
 * rewrote it every session would be the "edit a file they own" ENVX2 rules out.
 */

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** What the file holds. Named so the tests and the write cannot disagree about it. */
export const IGNORE_PATTERN = 'dpm.db*';

/** The file's name inside `.dpm/`. */
export const IGNORE_FILE = '.gitignore';

/**
 * Write `.dpm/.gitignore` if there is not one there already.
 *
 * @param directory The directory holding the database — `.dpm/`, which the caller has
 *   already created.
 * @returns Whether this call wrote it. `false` means one was already there and was left
 *   exactly as it was.
 */
export function writeIgnore(directory: string): boolean {
  const path = join(directory, IGNORE_FILE);

  if (existsSync(path)) return false;

  writeFileSync(path, `${IGNORE_PATTERN}\n`, 'utf8');

  return true;
}
