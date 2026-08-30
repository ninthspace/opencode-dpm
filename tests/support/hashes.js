/**
 * Digests computed for a test, deliberately not through the code under test.
 *
 * Three suites had grown the same line — the marker suite, the publish suite and the verdict suite —
 * and each of them had it for the same stated reason: `src/sync/marker.js` exports `hashDump`, and a
 * test that checked a marker by hashing with `hashDump` would have both sides of the equality coming
 * out of one function. That holds for any digest at all, including one taken over the wrong text,
 * which is the only way a marker is ever wrong.
 *
 * Collecting them here keeps that independence rather than spending it: this is still a test-owned
 * implementation over `node:crypto`, with no import from `src/`. What it removes is the third copy.
 */

import { createHash } from 'node:crypto';

/**
 * sha256 of `text`, hex.
 *
 * @param {string} text
 * @returns {string}
 */
export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * The claim digest as `claimHash` computed it before coverage rows could be retired.
 *
 * Every bound row, with no live qualification — which is the point. Two suites need it and neither
 * can call `claimHash`: both run against a database built one migration back, where `retired_at`
 * does not exist yet, so the live function's own query is a syntax error there. The independence
 * this module exists for applies doubly, the assertion in both cases being that a digest stored by
 * an older release still matches what the current one computes.
 *
 * The separator is built from its code point rather than written as an escape. An escape sequence
 * that only looked right would fail those tests for a reason with nothing to do with the migration —
 * and a literal NUL byte in a source file makes the file un-greppable.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} requirementId
 * @returns {string}
 */
export function claimDigestOverEveryBoundRow(db, requirementId) {
  const digest = createHash('sha256');
  const nul = String.fromCharCode(0);

  const bound = db.prepare(`SELECT spec_fragment, story_criterion_id FROM coverage
     WHERE requirement_id = ? ORDER BY spec_fragment, story_criterion_id`).all(requirementId);

  for (const row of bound) digest.update(row.spec_fragment + nul + row.story_criterion_id + nul);

  return digest.digest('hex');
}
