/**
 * The Node floor, checked before anything that would fail without it (NFR2).
 *
 * The floor is 24. Two things sit on it and either alone would set it there: `node:sqlite`,
 * which the database is read and written with, and native execution of erasable-syntax
 * TypeScript, which is how this codebase is run at all — there is no build step and no loader,
 * so a runtime that cannot type-strip cannot start. Below the floor the failures are
 * `ERR_UNKNOWN_BUILTIN_MODULE` and a syntax error respectively: messages about a module the
 * reader has never heard of and about a type annotation they did not write, naming neither the
 * version they have nor the version they need. NFR2 exists to replace both with a sentence
 * someone can act on.
 *
 * **This module must not import `node:sqlite`, directly or through anything else, and that is
 * the whole reason it is a module of its own.** ES module imports are hoisted and evaluated
 * before any statement in the importing file runs, so an entry point that statically imports
 * the server and then checks the version has already crashed by the time the check would have
 * run. The check therefore lives here, is imported first, and the rest of the server is reached
 * by `await import(…)` afterwards — a dynamic import is evaluated where it is written rather
 * than at load.
 */

/** The floor, stated once. `package.json`'s `engines.node` is asserted equal to it by the tests. */
export const REQUIRED_NODE = '24.0.0';

/**
 * `'22.18.0'` → `[22, 18, 0]`.
 *
 * A prerelease or build suffix is dropped rather than compared: `23.0.0-nightly` is above the
 * floor on the part that matters, and ordering prereleases correctly is a semver problem this
 * does not have. Anything unparseable yields `NaN`, which every comparison below treats as
 * failing — an unreadable version is not evidence of a version that is high enough.
 *
 * @returns Three numbers, major first.
 */
export function parseVersion(version: string): number[] {
  return String(version)
    .replace(/^v/, '')
    .split('-')[0]
    .split('.')
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10));
}

/**
 * Whether `current` is at or above `required`.
 *
 * Compared component by component as numbers, never as strings: `'22.9.0' < '22.10.0'` is false
 * under a lexicographic comparison, which would put the floor above a release that clears it.
 *
 */
export function meetsFloor(current: string, required: string = REQUIRED_NODE): boolean {
  const have = parseVersion(current);
  const need = parseVersion(required);

  for (const [index, needed] of need.entries()) {
    const held = have[index];

    if (!Number.isInteger(held)) return false;
    if (held > needed) return true;
    if (held < needed) return false;
  }

  return true;
}

/**
 * Whether `candidate` is strictly above `reference`, with anything unparseable answering no.
 *
 * `meetsFloor` answers *at or above*, and both callers here need to tell equal from higher: the
 * neighbour check reports a skew only for a version genuinely newer than the running one, and the
 * database stamp is written only on an increase (FR2a). Composed from `meetsFloor` in both
 * directions rather than comparing components again, so the NaN handling that makes an unreadable
 * version fail every comparison holds here for free.
 *
 */
export function isAbove(candidate: string, reference: string): boolean {
  return meetsFloor(candidate, reference) && !meetsFloor(reference, candidate);
}

/** What the user is told. Names both versions, because either alone leaves them guessing. */
export const floorMessage = (current: string, required: string = REQUIRED_NODE) =>
  `dpm requires Node >=${required} and this is Node ${current}. ` +
  `dpm is written in TypeScript that Node type-strips natively, and reads and writes its ` +
  `database with the built-in node:sqlite module; Node ${required} is where both are ` +
  `dependable. Upgrade Node, then start the server again.`;

/**
 * Refuse to continue below the floor.
 *
 * Throws rather than calling `process.exit`, so the entry point owns the exit code and a test
 * can drive this without ending its own process.
 *
 */
export function assertNodeFloor(
  current: string = process.versions.node,
  required: string = REQUIRED_NODE,
): void {
  if (!meetsFloor(current, required)) {
    throw new Error(floorMessage(current, required));
  }
}
