/**
 * The verification binding (FR21) — what a ✓ is a ✓ *of*.
 *
 * `coverage.verified_at` says a fragment was checked against a criterion; `binding_hash` says
 * which texts were in front of whoever checked. The `CHECK` keeps the pair in lockstep and the
 * three triggers in `011-decay.sql` clear both when either text moves, so the mark cannot outlive
 * what it attests to.
 *
 * **The hash is computed here and is not an argument.** A caller that supplies it can supply
 * anything, and a digest chosen by the same party making the claim records nothing — it is
 * false-pass register #1 with an extra column, and the column makes it look checked. `claim.js`
 * already settled this shape one level up: `claimComplete` takes a requirement and a time, never
 * a hash. This is the same rule for the row-level mark, and the reason `binding_hash` came off
 * `create_coverage` and `update_coverage` when `do` first needed to write a verification.
 *
 * **Two texts, not three.** FR21 names "the requirement fragment or the story criterion", and the
 * fragment is `coverage.spec_fragment` — a stored verbatim slice — rather than `requirement.text`.
 * The requirement-edit trigger clears the mark as well, which is wider than what is hashed here
 * and deliberately so: a fragment is a slice of a text, and a text that has been rewritten no
 * longer vouches for the slice even when the slice's own bytes are unchanged.
 */

import type { DatabaseSync } from 'node:sqlite';

import { createHash } from 'node:crypto';

/**
 * The criterion text a binding is half made of, by id.
 *
 * Read rather than passed, because the caller writing a verification holds the coverage row and
 * has no reason to be holding the criterion's current text — and if it did hold a stale copy, the
 * hash would attest to text nobody is looking at.
 */
/** The two texts a binding is made of, named because a caller has to hand both over together. */
export type Binding = { spec_fragment: string; story_criterion_id: string };

const CRITERION = 'SELECT text FROM story_criterion WHERE id = ?';

const BOUND = `
  SELECT coverage.spec_fragment, coverage.story_criterion_id, coverage.binding_hash
    FROM coverage
   WHERE coverage.id = ?
`;

/**
 * A hash over the two texts a coverage row binds together.
 *
 * The separator is a character no text can contain, so two different pairs cannot hash the same
 * by their concatenation running together — the reason `claimHash` uses the same one.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} binding
 * @param {string} binding.spec_fragment
 * @param {string} binding.story_criterion_id
 * @returns {string}
 * @throws {Error} If the criterion is not there — a hash over a missing half is a hash over `''`,
 *   which is a real-looking digest for a binding that does not exist.
 */
export function bindingHash(
  db: DatabaseSync,
  { spec_fragment: fragment, story_criterion_id: criterionId }: Binding,
): string {
  const criterion = db.prepare(CRITERION).get(criterionId) as { text: string } | undefined;

  if (!criterion) throw new Error(`no story_criterion ${criterionId} to bind against`);

  return createHash('sha256')
    .update(`${fragment}\\u0000${criterion.text}\\u0000`)
    .digest('hex');
}

/**
 * Whether a coverage row's stored hash still describes the texts it is bound to.
 *
 * The mirror of `claimState`'s `current`, and here for the same reason: the triggers make a stale
 * hash unreachable in normal use, so this is what would notice if a migration recreating the table
 * dropped one. `verified` and `current` are separate answers because an unverified row is not a
 * stale one.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} coverageId
 * @returns {{verified: boolean, current: boolean}}
 */
export function bindingState(db: DatabaseSync, coverageId: string) {
  const row = db.prepare(BOUND).get(coverageId) as {
    spec_fragment: string; story_criterion_id: string; binding_hash: string | null;
  } | undefined;

  if (!row) throw new Error(`no coverage ${coverageId}`);

  return {
    verified: row.binding_hash !== null,
    current: row.binding_hash === bindingHash(db, row),
  };
}
