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

export default {
  id: PLUGIN_ID,

  async setup(context) {
    const sources = skillSources(context.options);
    const report = (message: string) => { process.stderr.write(message); };

    await context.skill.transform((draft) => {
      const claimed = claimedNames(draft.list());
      const clashes = sources
        .map((source) => (source.type === 'embedded' ? source.skill.name : ''))
        .filter((name) => name !== '' && claimed.has(name));

      for (const source of sources) draft.source(source);

      if (clashes.length > 0) report(clashNotice(clashes));
    });
  },
} satisfies Plugin;
