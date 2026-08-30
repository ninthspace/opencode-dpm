/**
 * Completeness claims (FR26).
 *
 * A coverage row says "this fragment is discharged by this criterion". A *claim* says something
 * the rows cannot: that the set of them accounts for the requirement whole. Without it a
 * requirement with one of five obligations bound has every coverage row current and correct,
 * and the roll-up reports it covered — false-pass register #17, which is #1 with the sign
 * flipped, and the reason a matching roll-up is not a complete one.
 *
 * **Completeness is a claim and not a computation, and the alternative is worth stating because
 * it looks better than it is.** Deriving it — storing each fragment's offset and requiring the
 * fragments to tile the requirement's text — needs no human act and cannot be forgotten. It is
 * wrong in both directions at once: connective prose carries no obligation and would have to be
 * bound to satisfy it, while two obligations inside one sentence are discharged by a fragment
 * covering either. A derived signal that is confidently wrong is worse than a claim a person
 * made, because nothing prompts anyone to look at it.
 *
 * What the schema guarantees is therefore not that the judgement was right but that it is
 * **current** — which is what the five unclaim triggers deliver (four in `011-decay.sql`, the
 * fifth in `026-retired-claim.sql`), and the same guarantee FR21 provides one level down for a
 * single row's ✓.
 *
 * **The set this file hashes and the set those triggers watch are one set, and keeping them one is
 * the contract.** FR3 takes retired bindings out of it, so `FRAGMENTS` below carries
 * `retired_at IS NULL` and `requirement_unclaim_on_coverage_retire` fires on that column changing.
 * Either half alone is worse than neither: qualify the hash and leave the trigger out, and a
 * retirement silently changes what the standing claim was over while the claim goes on reading as
 * current; add the trigger and leave the hash unqualified, and the withdrawn claim cannot be
 * re-made — `claimHash` would keep returning a digest over a set that includes the row somebody
 * just retired. A change to one is a change to both.
 */

import type { DatabaseSync } from 'node:sqlite';

import { createHash } from 'node:crypto';

/**
 * The bound fragment set, in a fixed order — what a claim is a claim *about*.
 *
 * Ordered by fragment text rather than by `position`, because `position` is display order and
 * two databases holding the same bindings in a different display order would otherwise hash
 * differently and each read the other's claim as stale.
 *
 * **Live rows only (FR3).** A retired binding accounts for nothing, so a claim cannot be a claim
 * about it. Costs no project a re-claim: `retired_at` and this clause arrive in the same release, so
 * no database holds a retired row when the clause first runs and the digest over every existing
 * claim is unchanged.
 */
const FRAGMENTS = `
  SELECT spec_fragment, story_criterion_id FROM coverage
   WHERE requirement_id = ? AND retired_at IS NULL
   ORDER BY spec_fragment, story_criterion_id
`;

/**
 * A hash over the bound set as it stands now.
 *
 * The separator is a character no fragment can contain, so two different sets cannot hash the
 * same by their concatenation running together — `['ab','c']` and `['a','bc']` are otherwise
 * one string.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} requirementId
 * @returns {string}
 */
export function claimHash(db: DatabaseSync, requirementId: string): string {
  const bound = db.prepare(FRAGMENTS).all(requirementId) as Array<{
    spec_fragment: string; story_criterion_id: string;
  }>;
  const digest = createHash('sha256');

  for (const row of bound) {
    digest.update(`${row.spec_fragment}\u0000${row.story_criterion_id}\u0000`);
  }

  return digest.digest('hex');
}

/**
 * Claim that the bound fragments account for `requirementId` whole.
 *
 * Both columns are written together, which the `CHECK` on `requirement` also insists on: a row
 * holding one without the other is a claim state nothing can re-derive.
 *
 * **A null `at` withdraws the claim, and takes the hash with it.** Hashing a withdrawal would
 * leave a digest of the bound set beside a requirement claiming nothing — the pair the `CHECK`
 * forbids, and the residue #18 is about read from the other end.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} requirementId
 * @param {string|null} at
 * @returns {{coverage_claimed_at: string|null, coverage_claim_hash: string|null}}
 */
export function claimComplete(db: DatabaseSync, requirementId: string, at: string | null) {
  const hash = at === null ? null : claimHash(db, requirementId);

  const changes = db
    .prepare('UPDATE requirement SET coverage_claimed_at = ?, coverage_claim_hash = ? WHERE id = ?')
    .run(at, hash, requirementId).changes;

  // A claim against a requirement that is not there would otherwise report success and write
  // nothing, which is the shape NFR6 refuses.
  if (changes !== 1) {
    throw new Error(`claiming completeness for ${requirementId} matched ${changes} rows, not 1`);
  }

  return { coverage_claimed_at: at, coverage_claim_hash: hash };
}

/**
 * Whether a requirement carries a claim, and whether that claim still describes what is bound.
 *
 * The two are separate answers on purpose. `claimed` is what the roll-up reads; `current` is
 * the check that a claim which somehow outlived its set is visible rather than trusted — the
 * triggers are what make that state unreachable in normal use, and this is what would notice
 * if one were dropped by a migration recreating the table.
 *
 * **`bound` excludes retired rows for FR3's reason and not by copying the clause above.** The two
 * answer different questions: `bound` is the count a reader acts on, and `FRAGMENTS` is the set a
 * digest is taken over. They agree on which rows count, which is why the clause reads the same —
 * but a future change that gave a reader a reason to see withdrawn bindings in the total would move
 * this one and must not move the other, since moving the other invalidates every stored claim.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} requirementId
 * @returns {{claimed: boolean, current: boolean, bound: number}}
 */
export function claimState(db: DatabaseSync, requirementId: string) {
  const requirement = db
    .prepare('SELECT coverage_claimed_at, coverage_claim_hash FROM requirement WHERE id = ?')
    .get(requirementId) as {
      coverage_claimed_at: string | null; coverage_claim_hash: string | null;
    } | undefined;

  if (!requirement) throw new Error(`no requirement ${requirementId}`);

  return {
    claimed: requirement.coverage_claimed_at !== null,
    current: requirement.coverage_claim_hash === claimHash(db, requirementId),
    bound: (db
      .prepare('SELECT count(*) AS n FROM coverage WHERE requirement_id = ? AND retired_at IS NULL')
      .get(requirementId) as { n: number }).n,
  };
}
