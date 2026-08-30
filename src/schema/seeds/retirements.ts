/**
 * Vocabulary defaults the plugin has retired.
 *
 * A term the plugin stops shipping cannot be expressed by dropping it from the seed lists,
 * because absence is ambiguous: a term missing from `TAXONOMY` may be one the plugin retired,
 * one a project deleted, or one that never existed. Retirement is therefore stated, not
 * inferred — and stating it is also what keeps the operation idempotent, since re-applying a
 * retirement to an already-retired row changes nothing.
 *
 * `at` is a fixed date rather than the time of the upgrade. The row records when the *plugin*
 * retired the term, which is a fact about the release; stamping it with the upgrade clock
 * would make two projects upgrading in different months disagree about the same event.
 *
 * **Empty is the correct state today** — dpm has shipped no vocabulary and so has retired
 * nothing. It is a list rather than an absent module because the mechanism is what Story 5
 * delivers, and a mechanism with nowhere to put its first entry acquires one in a hurry later.
 * The tests drive it with their own list rather than waiting for a real retirement, which is
 * also what stops this file's emptiness making the retire path untested.
 *
 * @type {{table: string, key: string, at: string}[]}
 */
export const RETIREMENTS = [];
