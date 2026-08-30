/**
 * ULID generation (AD9) — the only source of surrogate ids in dpm.
 *
 * AD9's property is *collision-free identity allocated without coordination*, because AD4
 * stakes branching on the `.sql` dump merging and a per-database `INTEGER PRIMARY KEY`
 * counter cannot be unique across databases edited independently. A ULID is 48 bits of
 * millisecond timestamp followed by 80 bits of randomness, rendered as 26 characters of
 * Crockford base32 — which is why it also gives every table a lexicographic default order
 * for free, the tiebreak FR6's determinism criterion needs.
 *
 * **Monotonicity is the part that needs code rather than randomness.** Ids minted inside one
 * millisecond share a timestamp prefix, so their order is decided entirely by the random
 * suffix — which, generated afresh each time, sorts arbitrarily. Ten thousand ids take a few
 * milliseconds to produce, so this is the common case rather than an edge one. Within a
 * repeated (or regressed) millisecond the generator therefore reuses the previous timestamp
 * and increments the previous random value, which keeps the sequence strictly ascending as
 * a string.
 */

import { randomFillSync } from 'node:crypto';

/** Crockford base32 — no I, L, O or U, so a transcribed id cannot be misread. */
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const TIME_CHARS = 10;
const RANDOM_CHARS = 16;
const TIME_MAX = 2n ** 48n - 1n;
const RANDOM_MAX = 2n ** 80n - 1n;

/**
 * Render `value` as exactly `length` base32 characters, most significant first.
 *
 * Ten characters hold 50 bits and the timestamp is 48, so the two leading bits are always
 * zero; sixteen characters hold exactly the 80 random bits. Fixed width is what makes the
 * ids comparable with `<`, so it is padded rather than trimmed.
 */
function encodeBase32(value: bigint, length: number): string {
  let encoded = '';
  let remaining = value;

  for (let position = 0; position < length; position += 1) {
    encoded = ENCODING[Number(remaining & 31n)] + encoded;
    remaining >>= 5n;
  }

  return encoded;
}

/** 80 bits from the platform CSPRNG, as a single integer. */
function randomEightyBits() {
  const bytes = randomFillSync(new Uint8Array(10));
  let value = 0n;

  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }

  return value;
}

/**
 * Build a generator with its own monotonic state.
 *
 * `now` and `random` are injectable so the same-millisecond and clock-regression paths can
 * be tested deterministically — both are reached by ordinary use, and neither is reachable
 * from a test that can only wait.
 */
export function createUlidGenerator({ now = Date.now, random = randomEightyBits } = {}) {
  let lastTime = -1n;
  let lastRandom = 0n;

  return function ulid() {
    const time = BigInt(now());

    if (time < 0n || time > TIME_MAX) {
      throw new RangeError(`timestamp ${time} is outside the 48 bits a ULID can carry`);
    }

    if (time > lastTime) {
      lastTime = time;
      lastRandom = random();
    } else {
      // Same millisecond, or a clock that stepped backwards. Both are handled by holding the
      // previous timestamp and incrementing: an id whose prefix is a millisecond behind the
      // wall clock is a smaller cost than a pair of ids that sort out of generation order,
      // which is what the criterion is about.
      if (lastRandom >= RANDOM_MAX) {
        throw new Error('ULID randomness exhausted within a single millisecond');
      }

      lastRandom += 1n;
    }

    return encodeBase32(lastTime, TIME_CHARS) + encodeBase32(lastRandom, RANDOM_CHARS);
  };
}

/** The process-wide generator. Nothing else in dpm mints an id. */
export const ulid = createUlidGenerator();
