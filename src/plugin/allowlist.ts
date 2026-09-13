/**
 * The tools a skill may call, narrowed to the ones it names — because the full registry is what
 * makes a small model unusable.
 *
 * ## The measurement this exists for
 *
 * dpm registers 184 tools, and their JSON Schema is **116.5 KB on every request**. On
 * `mtplx-qwen38-27b` that is not a tax, it is the difference between working and not. One prompt
 * ("list three fruits"), same model, same directory, three conditions:
 *
 * | condition | time | outcome |
 * |---|---|---|
 * | no dpm loaded | 1m36s | answered |
 * | dpm loaded, `dpm_*` denied | 2m47s | answered |
 * | dpm loaded, unrestricted | 19+ min | killed, never answered |
 *
 * The same surface is why gates arrived with nothing rendered above them: with `question` alone the
 * model wrote 1,593 characters of prose and called `question`; with all 184 it wrote 91 and called
 * `dpm_read_shared_document` instead. It is a request-size effect and not a comprehension one — the
 * model quotes the render rule verbatim and then fails to follow it.
 *
 * A skill's mean is 28 tools and the largest is 46. Nothing needs the other 138.
 *
 * ## Why this is a session permission and not an agent
 *
 * The obvious route is a hidden agent per skill carrying `tools`, with each command pointing at its
 * own through the `agent` field the command schema has. It was built to that design and abandoned,
 * because **a command's agent governs exactly one turn.** The host resolves `O.agent ?? t.agent`
 * and prompts with it, but the TUI's own `agent.current()` is client-local — seeded from the
 * non-hidden agent list, changed only by the picker — and nothing syncs it back from the session
 * row. So the second turn of a skill run, which is the user answering the first gate, arrives under
 * `build` with all 184 tools again. A facilitated skill is almost entirely second turns.
 *
 * The session's own permission has the scope the agent's lacked. It is one list on the session row,
 * it survives every turn until something replaces it, and it reaches the same filter:
 *
 * ```js
 * function jd(e) {
 *   let o = de.disabled(Object.keys(e.tools), de.merge(e.agent.permission, e.permission ?? []));
 *   return Bi.filter(e.tools, (l, i) => e.user.tools?.[i] !== false && !o.has(i))
 * }
 * ```
 *
 * That runs while the request is being assembled and filters the `tools` object that goes into it —
 * so a denied tool is **absent from the payload**, not merely refused when called. Which is what the
 * 19-minutes-to-2m47s reading above was measuring, by the identical code path.
 *
 * ## Two facts about the ruleset that the order below depends on
 *
 * `merge` is `(...j) => j.flat()` — plain concatenation, no precedence by specificity — and the
 * matcher takes `findLast`. **Later rules win, and the order is the one written here.** That is not
 * the rule the `permission` block in a config file follows, where entries are sorted by key length
 * and the longest match wins; this is an array, and it is ours.
 *
 * And a tool is dropped only when its last matching rule is `pattern: '*'` **and** `action: 'deny'`.
 * An `ask` does not drop it and neither does a narrower pattern. So the shape is one wildcard deny
 * followed by a specific allow per named tool, every pattern `'*'`, and nothing subtler would work.
 *
 * ## Where the list comes from, and why it is the prose
 *
 * Each skill names its tools in its own body, which makes the body the only copy that cannot
 * disagree with what the skill actually does. Front matter or a generated manifest would both be a
 * second list, and the failure they produce is a tool denied in the middle of a run — the silent
 * kind, arriving as a skill that stops working three steps in.
 *
 * The extraction is a regex over `dpm_*` identifiers, which is approximate in exactly one
 * direction: it takes a tool named as an illustration as though it were called. `skill-conventions`
 * names `dpm_create_epic` in a sentence about numbering and nothing calls it there. That costs one
 * schema entry. The opposite error — missing a tool a skill really calls — would break the run, and
 * a regex cannot make it, because a call site is a mention.
 *
 * **Every skill gets the shared conventions' tools too.** They all open by reading that document,
 * and the procedures in it — Session Startup, Library Check, Retro Awareness, Perspectives — are
 * where a third of a typical skill's calls live. Deriving from the skill body alone would deny
 * `dpm_create_session` to all twenty-three.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Hooks } from '@opencode-ai/plugin-v1';

import { discoverSkills } from './skills.ts';
import { SHARED_DIRECTORY } from './root.ts';

/** The shared document every skill reads at startup, and the procedures it holds. */
export const SHARED_CONVENTIONS = 'skill-conventions.md';

/** What a tool of dpm's looks like in prose. The prefix is the MCP server's registered name. */
export const TOOL = /\bdpm_[a-z][a-z0-9_]*/g;

/** The wildcard every rule is written against — the only pattern that drops a tool. */
export const ANY = '*';

/** One entry of the host's session permission list. */
export type Rule = {
  readonly permission: string;
  readonly pattern: string;
  readonly action: 'allow' | 'deny';
};

/**
 * The dpm tools a body names, in no particular order.
 *
 * @param source A skill body or a shared document.
 * @returns {Set<string>}
 */
export function toolsNamed(source: string): Set<string> {
  return new Set(source.match(TOOL) ?? []);
}

/**
 * Each skill's tools, keyed by the name its front matter declares.
 *
 * The shared conventions are unioned into every entry rather than detected per skill. A skill that
 * did not read them would be carrying fifteen tools it has no use for, which costs a kilobyte; a
 * skill that reads them and was judged not to would lose `dpm_create_session`, which costs the run.
 *
 * @param root The package root, as `packageRoot` computed it.
 * @returns {Record<string, string[]>}
 */
export function allowances(root: string): Record<string, string[]> {
  const shared = toolsNamed(readFileSync(join(root, SHARED_DIRECTORY, SHARED_CONVENTIONS), 'utf8'));

  // `content` is the body the registry already holds, so nothing here opens a `SKILL.md` a second
  // time — `discoverSkills` read them all to build the catalogue this plugin registers.
  return Object.fromEntries(discoverSkills(root).map((skill) => [
    skill.name,
    [...new Set([...shared, ...toolsNamed(skill.content)])].sort(),
  ]));
}

/**
 * The rules that leave a skill holding its own tools and none of the others.
 *
 * The wildcard deny goes first and every allow after it, per `findLast` above. Nothing here names a
 * tool that is not dpm's: the host's own `read`, `edit`, `bash` and `question` are untouched, and a
 * skill needs all four.
 *
 * @param tools The tools to leave reachable.
 * @returns {Rule[]}
 */
export function ruleset(tools: readonly string[]): Rule[] {
  return [
    { permission: 'dpm_*', pattern: ANY, action: 'deny' },
    ...tools.map((permission): Rule => ({ permission, pattern: ANY, action: 'allow' })),
  ];
}

/** As much of the host's client as this needs, which is one call it does not fully declare. */
export type SessionWriter = {
  update(options: { path: { id: string }; body: Record<string, unknown> }): Promise<unknown>;
};

/**
 * Narrow the session's tools to the skill a `/dpm-` command is about to run.
 *
 * **The route accepts more than its published type says, and that was read off the running host
 * rather than inferred.** `SessionUpdateData['body']` declares `{ title?: string }`; the handler
 * behind `PATCH /session/{id}` also takes `metadata`, `time.archived` and `permission`, and stores
 * the last of those through `setPermission`. A probe against 1.18.30 sent the ruleset below and got
 * it back on the session, which is the same gap between published type and runtime that
 * `session-id.ts` documents for message parts.
 *
 * **`SessionWriter` is how that gap is held, and it is a narrowing rather than a cast.** The
 * parameter is declared as the call this actually makes — an id and a body of arbitrary fields —
 * and the host's client satisfies it structurally. So the one place the published type is
 * contradicted is a type in this file, named and argued for, instead of an `as` buried at a call
 * site where the next reader has to reconstruct why it is there.
 *
 * **Writes accumulate rather than replace**, because the handler merges what it is given onto what
 * is there. A session running six dpm commands ends with six wildcard denies and their allows in
 * one list. That is untidy and it is not wrong: `findLast` means the most recent command's rules
 * decide, and the earlier allows are superseded by the later deny that follows them. There is no
 * replacing route to prefer; the only one is the deprecated per-message `tools` field, which the
 * TUI does not send and a plugin cannot reach.
 *
 * **A failure here is swallowed, and the reasoning is worth stating because the other choice is
 * defensible.** This narrowing is an optimisation: without it a dpm command still runs, just slowly
 * on a small model and indistinguishably on a large one. Throwing would make every dpm command
 * unusable the day this undocumented route changes shape, in exchange for making a slow run
 * legible. The cost of swallowing is real — the 19-minute failure comes back with nothing saying
 * why — so it goes to `console.error`, which is where the host puts a plugin's own diagnostics.
 *
 * @param client The host's client, for the one call this makes.
 * @param tools Each skill's allowance, as `allowances` derived it.
 * @returns {NonNullable<Hooks['command.execute.before']>}
 */
export function restrictTools(
  client: SessionWriter,
  tools: Record<string, readonly string[]>,
): NonNullable<Hooks['command.execute.before']> {
  return async (input) => {
    const allowed = tools[input.command.replace(/^\//, '')];

    if (allowed === undefined) return;

    try {
      await client.update({
        path: { id: input.sessionID },
        body: { permission: ruleset(allowed) },
      });
    } catch (error) {
      console.error(
        `dpm: could not narrow ${input.command} to its ${allowed.length} tools, so the run carries `
        + 'the whole registry and will be slow on a small model.',
        error,
      );
    }
  };
}
