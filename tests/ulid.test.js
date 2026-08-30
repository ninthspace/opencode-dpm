/**
 * Story 1 — "Ten thousand ids generated in one process are unique and sort in generation
 * order" (AD9).
 *
 * The two halves of that criterion are not the same claim, and the second is the one that
 * needs code. Ten thousand ids take a handful of milliseconds to produce, so most of them
 * share a timestamp prefix with their neighbours and their order is decided entirely by the
 * random suffix — which, drawn afresh each time, sorts arbitrarily. A generator with no
 * monotonic branch passes the uniqueness half and fails this one, which is why both are
 * asserted and why the millisecond span is asserted too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUlidGenerator, ulid } from '../src/id/ulid.ts';

const CROCKFORD = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

test('ten thousand ids in one process are unique and sort in generation order', () => {
  const ids = Array.from({ length: 10_000 }, () => ulid());

  assert.equal(new Set(ids).size, ids.length, 'no two ids collide');
  assert.deepEqual(ids, [...ids].sort(), 'and their generation order is their sort order');

  const timestamps = new Set(ids.map((id) => id.slice(0, 10)));
  assert.ok(
    timestamps.size < ids.length,
    `${timestamps.size} distinct milliseconds across ${ids.length} ids — so the sort above is ` +
      'a statement about the monotonic counter, not about the clock',
  );
});

test('an id is 26 Crockford base32 characters and nothing else', () => {
  const malformed = Array.from({ length: 500 }, () => ulid()).filter((id) => !CROCKFORD.test(id));

  assert.deepEqual(malformed, [], 'no I, L, O or U, so a transcribed id cannot be misread');
});

test('ids minted in one millisecond ascend, and a clock that steps back does not break that', () => {
  let clock = 1_000;
  const generator = createUlidGenerator({ now: () => clock });

  const sameMillisecond = [generator(), generator(), generator()];
  assert.deepEqual(sameMillisecond, [...sameMillisecond].sort(), 'a frozen clock still ascends');

  clock = 900;
  const afterRegression = generator();
  assert.ok(
    afterRegression > sameMillisecond.at(-1),
    'an id whose prefix trails the wall clock costs less than a pair that sorts out of order',
  );

  clock = 1_001;
  assert.ok(generator() > afterRegression, 'and the clock moving on again is no different');
});

test('randomness exhausted inside a millisecond is reported, not wrapped', () => {
  const generator = createUlidGenerator({ now: () => 5, random: () => 2n ** 80n - 1n });

  assert.ok(generator());
  assert.throws(
    () => generator(),
    /randomness exhausted/,
    'wrapping would mint a smaller id than the one before it, silently',
  );
});

test('two generators do not share monotonic state', () => {
  const first = createUlidGenerator({ now: () => 7, random: () => 1n });
  const second = createUlidGenerator({ now: () => 7, random: () => 1n });

  const firstRun = [first(), first(), first()];
  const secondRun = [second(), second(), second()];

  // Same injected clock and same injected randomness, so identical output is what independent
  // state looks like: each generator counted up from its own start rather than from a shared one.
  assert.deepEqual(firstRun, secondRun, 'each advances a counter of its own');
  assert.equal(new Set(firstRun).size, 3, 'and within one generator no id repeats');
});
