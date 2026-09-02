/**
 * The README's configuration blocks, read once for the files that check them.
 *
 * **Two files check the same blocks for the same mistake, and epic 02-05 story 3 is why there are
 * two.** The Permissions section shipped OpenCode 2's `permissions` array through four stories of a
 * v1-only README. `permission-entries.test.js` read those blocks with
 * `JSON.parse(block).permissions ?? []` and found an empty list, which every loop in it passes
 * over; `readme-v2.test.js` checked the same blocks for parsing to a non-empty object, which the
 * wrong shape does. Both green, over a recommendation that made the host refuse to start.
 *
 * So the shape v1 refuses has a name here rather than a filter in each file. The two readings are
 * deliberately at different scopes — the whole README, and the Permissions section alone — because
 * a block in the refused shape is just as wrong in *Installation*, and a single scope would have to
 * pick one of them to stop watching. What they must not do is disagree about what they are reading,
 * which is what this module is.
 *
 * @see tests/support/dpm-clone.js for the same argument about the clone placeholder.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The document under test, read once. */
export const README = readFileSync(join(import.meta.dirname, '..', '..', 'README.md'), 'utf8');

/**
 * Every fenced `json` block, parsed.
 *
 * A parse failure is left to throw: a block a reader is told to paste into `opencode.json` and
 * which is not JSON is a failure of the README, and swallowing it here would turn that into a
 * block silently absent from every check below.
 *
 * @param {string} [source] The document or section to read. Defaults to the whole README.
 * @returns {object[]}
 */
export const configBlocks = (source = README) => [...source.matchAll(/```json\n([\s\S]*?)```/g)]
  .map(([, block]) => JSON.parse(block));

/**
 * The configuration key OpenCode v1 refuses the whole file over.
 *
 * `permissions` — plural, an array of `{ action, resource, effect }` — is the next major version's
 * shape. v1 does not ignore it: it reports the configuration invalid and the session does not
 * start, which makes this the one README mistake in this area that is loud rather than silent.
 */
export const REFUSED_KEY = 'permissions';

/**
 * The blocks that use it, which must be none.
 *
 * Returned rather than counted so a failure can name what it found.
 *
 * @param {string} [source]
 * @returns {object[]}
 */
export const refusedBlocks = (source = README) => configBlocks(source)
  .filter((parsed) => REFUSED_KEY in parsed);
