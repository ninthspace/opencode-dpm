/**
 * The profile seam — ADR 01-08.
 *
 * A profile is a **registration-time** choice of model-facing surface, selected by plugin option
 * against the same server and the same database. The ADR is explicit about where the boundary
 * falls: skill prose, the advertised tool surface, and the text of tool refusals vary; everything
 * below those three is deterministic code no model reads, and stays byte-identical across
 * profiles. That is what lets a corpus planned under one profile continue under another with no
 * migration.
 *
 * **One profile is defined here and that is the point of the shape, not a shortfall.** FR13 defers
 * the `lite` profile — a reduced surface for constrained local open-weight models — to a
 * specification of its own, and defers only the profile, not the seam: *"The architectural seam
 * that makes it selectable at registration time is decided here and is not deferred."* So a second
 * profile is a row in the table below and a filter beside `skills`, rather than a branch threaded
 * back through the entry.
 *
 * An unknown name is refused rather than silently treated as `full`. A user who writes
 * `profile: "lte"` and gets the full surface has been told nothing; a user who gets a message
 * naming the profiles there are has been told everything.
 */

import type { DiscoveredSkill } from './skills.ts';

/** A profile: a name, and what it does to the discovered surface. */
export type Profile = {
  readonly name: string;
  /** The skills this profile registers, given everything the package holds. */
  readonly skills: (discovered: readonly DiscoveredSkill[]) => DiscoveredSkill[];
};

/**
 * The profiles, by name.
 *
 * `full` is every skill in the package. It is written as a function over the discovered set rather
 * than as the set itself, so `lite` — when its specification is written — is a sibling entry and
 * not a second code path.
 */
export const PROFILES: Readonly<Record<string, Profile>> = {
  full: { name: 'full', skills: (discovered) => [...discovered] },
};

/** What a user gets by saying nothing. */
export const DEFAULT_PROFILE = 'full';

/**
 * The profile named by the host's plugin options, or the default.
 *
 * `options` is whatever the user put under `options` in their config entry for this plugin, so
 * every value in it is untrusted and `profile` may be anything at all — including not a string.
 *
 * @param options The host's `ctx.options`.
 * @returns {Profile}
 */
export function profileFrom(options: Readonly<Record<string, unknown>> = {}): Profile {
  const requested = options.profile ?? DEFAULT_PROFILE;

  if (typeof requested !== 'string' || !Object.hasOwn(PROFILES, requested)) {
    throw new Error(
      `dpm: no profile named ${JSON.stringify(requested)}. `
      + `The profiles are: ${Object.keys(PROFILES).sort().join(', ')}.`,
    );
  }

  return PROFILES[requested]!;
}
