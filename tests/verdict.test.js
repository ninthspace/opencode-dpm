/**
 * Epic 49-03 Story 3 — the five-state verdict (FR7, AD13).
 *
 * `[tdd]`: these were written before `src/sync/verdict.js` existed. The function is pure — three
 * hashes in, one word out — and that is what makes the states assertable at all, because today the
 * guard produces a single `differs` inline at the point the message is written and there is nothing
 * to ask.
 *
 * **The hashes are real dumps, hashed here rather than through the module under test.** Nothing in
 * the verdict depends on how a hash was computed, so opaque markers like `'A'` and `'B'` would
 * satisfy every line below — but they would also satisfy an implementation that compared lengths or
 * prefixes, and three sha256 digests of three real dumps cannot. `hashDump` is not used: it is the
 * neighbouring module's job and its correctness is Story 1's criterion, not this one's.
 *
 * **Two states are asserted that AD13's table does not enumerate, and they are not embellishment.**
 * The table's rows all describe a divergence to explain, so it says nothing about the case where the
 * dump on disk and the database *agree*: with the marker recording that agreement (all three equal)
 * and with the marker stale (a pull that brought a dump identical to what the local database already
 * produces). Both are reachable and the function has to answer for them, and the answer that would
 * arrive by reading the table literally — differs-from-marker on both sides, therefore *both moved*
 * — would refuse a commit and tell the user to reconcile two byte-identical artefacts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERDICT, verdict } from '../src/sync/verdict.ts';
import { dumpHolding, emptyDump } from './support/dumps.js';
import { sha256 } from './support/hashes.js';

// Three real dumps, and therefore three distinct hashes — `both moved` needs a third value that is
// neither side of the comparison, which is exactly the state a pull into a modified database leaves.
const settled = sha256(emptyDump());
const local = sha256(dumpHolding('verdict-local-only'));
const remote = sha256(dumpHolding('verdict-remote-only'));

// --- The criterion: five states, five verdicts ---------------------------------------------------

test("each of AD13's five marker states gets its own verdict [tdd] [unit]", () => {
  // Row 1 — marker agrees with the file, the database has moved past both. The commit is ahead of
  // what is committed, and publishing is what closes the gap.
  assert.equal(
    verdict({ marker: settled, file: settled, database: local }),
    'database-moved',
    'a database ahead of a dump the marker still matches was not reported as the database moving',
  );

  // Row 2 — the pull case, and the defect this epic exists to close. The marker still matches what
  // the database produces, so the file is what changed under it.
  assert.equal(
    verdict({ marker: settled, file: remote, database: settled }),
    'dump-moved',
    'a pulled dump over an untouched database was not reported as the dump moving',
  );

  // Row 3 — a pull on top of local work. Neither side matches the sync point, and no rule decides
  // between them.
  assert.equal(
    verdict({ marker: settled, file: remote, database: local }),
    'both-moved',
    'a pull on top of local work was not reported as both moving',
  );

  // Row 4 — the upgrade path. Every database that exists today has no marker, and one already
  // agreeing with its dump is not ambiguous at all.
  assert.equal(
    verdict({ marker: null, file: settled, database: settled }),
    'adopt',
    'a marker-less database that agrees with its dump was not adopted',
  );

  // Row 5 — the only verdict that refuses. Divergent at upgrade time, with nothing recording which
  // side moved.
  assert.equal(
    verdict({ marker: null, file: remote, database: local }),
    'unknown',
    'a marker-less divergence was answered with a direction it has no way to know',
  );

  // The five words are the criterion's own, so they are pinned as strings rather than only reached
  // through the constant — a `VERDICT` whose values were swapped satisfies every assertion above if
  // they are all written through it.
  assert.deepEqual(Object.values(VERDICT).sort(), [
    'adopt', 'both-moved', 'clean', 'database-moved', 'dump-moved', 'unknown',
  ]);
});

// --- The pair that must not collapse -------------------------------------------------------------

test('an ambiguity with a marker and one without are different answers [tdd] [unit]', () => {
  // Both states are ambiguous and only one of them has a sync point to reason from, so the cheap
  // implementation — anything that treats "the marker matches neither" and "there is no marker" as
  // one condition — returns the same word for both. It is a wrong answer in both directions:
  // `dpm-merge` named for a divergence nobody can attribute, or a refusal where a reconcile is the
  // known fix.
  const withMarker = verdict({ marker: settled, file: remote, database: local });
  const withoutMarker = verdict({ marker: null, file: remote, database: local });

  assert.notEqual(withMarker, withoutMarker,
    `the same word answers both ambiguous states: ${withMarker}`);

  // And the direction of the difference, because `notEqual` alone holds for any two words at all.
  assert.equal(withMarker, VERDICT.bothMoved);
  assert.equal(withoutMarker, VERDICT.unknown);

  // **Must NOT name a direction without a marker.** The marker is the only input carrying which side
  // moved, so a verdict that names a fix is a claim the function cannot support without one — and
  // the fix it would name on a pull is the one that discards the pulled rows.
  const directional = [VERDICT.databaseMoved, VERDICT.dumpMoved, VERDICT.bothMoved];

  for (const [file, database] of [[settled, local], [remote, settled], [remote, local]]) {
    const answer = verdict({ marker: null, file, database });

    assert.ok(!directional.includes(answer),
      `a direction (${answer}) was named for a divergence with no marker to read it from`);
  }

  // The control in the other direction: the same three divergences *with* a marker do get a
  // direction. Without it the loop above passes for a function that answers `unknown` to everything.
  for (const [file, database] of [[settled, local], [remote, settled], [remote, local]]) {
    const answer = verdict({ marker: settled, file, database });

    assert.ok(directional.includes(answer),
      `a marker was present and no direction was read from it: ${answer}`);
  }
});

// --- Totality, and the two states the table does not enumerate -----------------------------------

test('two artefacts that agree are never reported as diverged [tdd] [unit]', () => {
  // All three equal: the sync point records the agreement and there is nothing to do. Distinct from
  // `adopt` because adopt writes a marker, and a guard that wrote one on every clean commit would
  // touch the tree on every run.
  assert.equal(
    verdict({ marker: settled, file: settled, database: settled }),
    'clean',
    'a marker recording an agreement the two artefacts still hold was not reported clean',
  );

  // **The state AD13's table skips.** A pull that brings a dump identical to what the local database
  // already produces leaves the marker matching neither — which reads off the table as *both moved*,
  // and would refuse a commit and name `dpm-merge` to reconcile two byte-identical artefacts.
  assert.equal(
    verdict({ marker: remote, file: settled, database: settled }),
    'adopt',
    // Two things can go wrong here and the message has to fit both, which it did not until a
    // mutation collapsing `adopt` into `clean` produced "was treated as a divergence" for a verdict
    // of `clean`. Naming what should have happened covers the divergence reading *and* the reading
    // where the agreement is reported but the sync point is left recording an older one.
    'a stale marker over two artefacts that agree was not adopted — the marker still records a '
    + 'state neither of them is in',
  );

  // The rule behind both lines, asserted as a rule: whatever the marker says, agreement between the
  // dump on disk and the database is never a divergence.
  for (const marker of [settled, local, remote, null]) {
    const answer = verdict({ marker, file: settled, database: settled });

    assert.ok([VERDICT.clean, VERDICT.adopt].includes(answer),
      `a divergence (${answer}) was reported for a dump and a database that agree`);
  }
});
