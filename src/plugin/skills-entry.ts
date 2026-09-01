/**
 * The skills entry — the twenty-three skills, registered through v1's `skill` domain. FR3, FR5.
 *
 * ## Why this is a second module rather than a second export
 *
 * v1 speaks two plugin protocols. This one — a default export of `{ id, setup }`, handed a
 * nine-domain context — is the only one with a skill registry; the callable `server` export in
 * `index.ts` is the only one with an MCP registry. A single module carrying both stalls v1's
 * loader outright, which was probed with a control rather than inferred. `registration.ts` holds
 * that argument and the two single-entry routes that were tried and closed.
 *
 * So a user's `plugin` array names this module alongside the other. Neither is conditional and
 * neither is chosen: both go in, unconditionally, and nothing asks the user which OpenCode they
 * are on.
 *
 * ## `source`, not `add`, and not `config.skills.paths`
 *
 * v1's skill draft is `{ list, source }`. There is no `add` — that is the v2 API, and code written
 * against it fails at the call rather than at the type. `source` takes a tagged union decoded by
 * the host's schema, and the variant dpm needs is `embedded`: it carries the computed skill, so the
 * `dpm-` prefix and the rewritten shared-procedure paths both survive into the registry.
 *
 * **This route was not the one the specification anticipated, and it is better than the one that
 * was.** NFR3 exists to fence `config.skills.paths` — a key absent from the published SDK types and
 * from the live schema — because that was believed to be the only way in. It is not: `skill.transform`
 * is typed, published, and carries the body rather than a path to it. So dpm builds on nothing
 * undocumented, and FR4 and ENVX2 — a host that reads `SKILL.md` verbatim leaving the conventions
 * rewrite nowhere to run — do not arise, because the host is handed the rewritten text directly.
 *
 * ## The fence and the alarm — FR5
 *
 * v1 keys skills on `name`, the keyspace is flat, and a later registration wins. **The fence is the
 * `dpm-` prefix**, which `registration.ts` puts on `name` because `name` is the only field v1 keeps.
 * A source registering a bare `do` or `review` no longer displaces dpm's.
 *
 * **The alarm is this module's, and its reach is worth stating exactly rather than implying.** Before
 * registering, the draft is read for names already claimed, and anything dpm is about to shadow is
 * reported. What that can see is every skill registered as an *embedded* source, which is how the
 * host registers its own built-ins and how any plugin taking this route registers theirs. What it
 * cannot see is a skill behind a `directory` or `url` source, because those are paths the host has
 * not yet expanded — a clash with one of those stays invisible here and the prefix is the whole of
 * the defence against it. Reporting the reachable half is worth more than reporting nothing, and
 * claiming the whole would be worth less than either.
 *
 * **And the alarm has a second half, which reads the registry back rather than reading it first.**
 * `claimedNames` answers *whose name am I about to take*; `displacedSkills` answers *did I keep
 * mine*, by finding the winning entry for every name dpm registered and asking whether it resolves
 * inside this package. The two directions of one failure — dpm silently overwriting somebody, and
 * dpm being silently overwritten — and neither is visible from the other's reading.
 *
 * ## The disposal that is not this module's to perform
 *
 * Under v2 `setup` returned a cleanup and the entry disposed what it had registered, because an
 * appended skill source accumulates where a keyed server entry replaces — so a reload that did not
 * unwind first would leave two of every skill. **v1's `setup` returns `Promise<void> | void`**, so
 * there is nowhere to hand a cleanup back to. The `Registration` that `transform` resolves with is
 * released by the host: the Effect-flavoured form of this same API types the plugin's body as
 * running in a `Scope`, and a scope closing is what releases what was acquired in it.
 *
 * So this module registers and returns, and the reload behaviour is the host's rather than a
 * property of this code. That makes it a claim about a running v1 rather than about a double, and
 * it is verified where such claims are verified — against the CLI, in story 5.
 */

import type { Plugin } from '@opencode-ai/plugin-v1/v2/promise';

import { type SkillSource, skillSources } from './registration.ts';
import { packageRoot, withinPackage } from './root.ts';

/**
 * The plugin id, which is distinct from the tools module's by necessity rather than by taste.
 *
 * Two modules of one package load into one host, and v1 keys its plugin registry by id — two
 * plugins claiming one id is a collision the host resolves by hanging, which cost a probe to find.
 * `SERVER_NAME` in `index.ts` is a different namespace again: it names the MCP server, and is the
 * second `dpm` in the `dpm_` tool prefix.
 */
export const PLUGIN_ID = 'dpm-skills';

/**
 * The names already claimed by embedded sources in the draft.
 *
 * Narrowed on the tag rather than on the presence of `skill`, so a variant added to the union later
 * is skipped rather than read for a field it may not carry.
 *
 * @param sources Whatever `draft.list()` returned.
 * @returns {Set<string>}
 */
export function claimedNames(sources: readonly SkillSource[]): Set<string> {
  return new Set(sources
    .filter((source) => source.type === 'embedded')
    .map((source) => source.skill.name));
}

/**
 * What dpm says when it is about to shadow a skill somebody else registered.
 *
 * **Named rather than counted.** The point of the report is that a reader can go and look, and
 * "1 skill was shadowed" sends them nowhere. It also says which way the shadowing runs, because
 * the interesting case is not that dpm lost — the prefix makes that nearly impossible — but that
 * dpm won against something a user had deliberately installed.
 *
 * @param names The clashing names, as they will be registered.
 * @returns {string}
 */
export const clashNotice = (names: readonly string[]): string =>
  `dpm: ${names.length === 1 ? 'a skill was' : `${names.length} skills were`} already registered `
  + `under ${names.length === 1 ? 'a name' : 'names'} dpm is about to claim, and v1 keys skills on `
  + `name with the later registration winning — so dpm's will be used instead of theirs: `
  + `${names.join(', ')}. Nothing is lost on disk; rename dpm's skill or remove the other source `
  + 'if that is the wrong way round.\n';

/**
 * One dpm skill whose registry entry is not dpm's, as the read-back found it.
 *
 * `location` is `null` where the name is not in the registry at all — registered and then absent,
 * which is a different failure from registered and then displaced and wants a different sentence.
 */
export interface Displaced {
  readonly name: string;
  readonly location: string | null;
}

/**
 * Every skill dpm registered whose winning entry in the registry is not a path inside dpm.
 *
 * **v1 keys skills on `name` and the later registration wins, so the winner is the last entry
 * carrying the name** — which is the whole reason this is a read-back rather than a second look at
 * what dpm computed. `claimedNames` above answers "whose name am I about to take"; this answers
 * "did I keep mine", and the two are different questions with different answers. The prefix makes
 * the first rare and the second rarer, and rare is not the same as reported.
 *
 * **Containment is `withinPackage`, so a package installed alongside this one is outside it.** A
 * `startsWith` on the root would place `/opt/dpm-other/skills/dpm-do` inside `/opt/dpm` and report
 * a displacement as a clean pass — the failure mode being looked for, read as its own absence.
 *
 * **What it can see is what `claimedNames` can see, and for the same reason.** A `directory` or
 * `url` source is a path the host has not expanded, so a skill hiding behind one is invisible here;
 * a name behind such a source could win and this would report nothing. Reporting the readable half
 * is worth more than reporting nothing, and claiming the whole would be worth less than either.
 *
 * @param registered What dpm handed the draft.
 * @param registry What the draft holds, read back after.
 * @param root The installed package root.
 * @returns {Displaced[]} Empty when every dpm name resolves to dpm's own directory.
 */
export function displacedSkills(
  registered: readonly SkillSource[],
  registry: readonly SkillSource[],
  root: string,
): Displaced[] {
  const mine = claimedNames(registered);
  const winner = new Map<string, string>();

  for (const source of registry) {
    if (source.type === 'embedded' && mine.has(source.skill.name)) {
      winner.set(source.skill.name, source.skill.location);
    }
  }

  return [...mine]
    .filter((name) => {
      const location = winner.get(name);

      return location === undefined || !withinPackage(root, location);
    })
    .sort()
    .map((name) => ({ name, location: winner.get(name) ?? null }));
}

/**
 * What dpm says when a skill it registered is not the one the registry holds under that name.
 *
 * **Named, and each with the path that won**, for `clashNotice`'s reason one step further on: a
 * reader told that `dpm-do` was displaced still cannot act, and a reader told which package it was
 * displaced by can go and look at it.
 *
 * @param displaced The skills whose entries are not dpm's.
 * @returns {string}
 */
export const displacementNotice = (displaced: readonly Displaced[]): string =>
  `dpm: after registering, ${displaced.length === 1 ? 'a skill dpm registered is' : `${displaced.length} skills dpm registered are`} `
  + 'not what the host now holds under that name — v1 keys skills on name, so something else has '
  + `taken ${displaced.length === 1 ? 'it' : 'them'}, and invoking ${displaced.length === 1 ? 'it' : 'them'} will run that instead of dpm's: `
  + `${displaced.map(({ name, location }) => `${name} (${location ?? 'not in the registry at all'})`).join(', ')}. `
  + 'Remove the other source, or rename it, if that is the wrong way round.\n';

export default {
  id: PLUGIN_ID,

  // **Both readings are resolved before the transform runs** — ADR 01-07. The host replays
  // transforms, so a root computed inside one is a root recomputed on every replay.
  async setup(context) {
    const sources = skillSources(context.options);
    const root = packageRoot();
    const report = (message: string) => { process.stderr.write(message); };

    await context.skill.transform((draft) => {
      const claimed = claimedNames(draft.list());
      const clashes = sources
        .map((source) => (source.type === 'embedded' ? source.skill.name : ''))
        .filter((name) => name !== '' && claimed.has(name));

      for (const source of sources) draft.source(source);

      if (clashes.length > 0) report(clashNotice(clashes));

      // **The other direction, and it is quiet in the ordinary case by construction.** dpm's
      // sources went in last, so within dpm's own transform dpm's entries win and there is nothing
      // to say. What this catches is the cases where that reasoning does not hold: a host that keys
      // and replaces rather than appends, a replay that reorders the transforms, a source the
      // host's decode dropped so dpm's name is registered to nobody. None of those announce
      // themselves, and each leaves a user invoking a dpm skill and getting something else.
      const displaced = displacedSkills(sources, draft.list(), root);

      if (displaced.length > 0) report(displacementNotice(displaced));
    });
  },
} satisfies Plugin;
