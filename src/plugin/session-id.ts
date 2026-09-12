/**
 * The harness session id, put in front of the model at the moment a skill run starts.
 *
 * **Session Startup asks for something the host never offered.** Step 3 of the shared procedure
 * says to call `dpm_create_session` *with the harness's session id*. On Claude Code a SessionStart
 * hook supplies one; OpenCode supplies nothing, so a run reaching that step has no id to pass and
 * invents a UUID. Two rows in a real project read `1D6A857A-…` and `930C29F7-…` against a host
 * session of `ses_f69986181ffevgdDOtWT9XDkhK` — plausible, stable within the run, and connected to
 * nothing.
 *
 * The cost is not the fabrication itself. It is step 2: a resume is meant to call
 * `dpm_adopt_session` with the new id and the predecessor's, and a run whose ids are invented
 * cannot tell that it *is* a resume. So it creates a third row, and the interrupted run's `state`
 * — the only record of what the facilitation settled — is stranded where nothing will look for it.
 *
 * ## Why this hook and not another
 *
 * `command.execute.before` fires once, when a `/dpm-…` command runs, which is exactly when a skill
 * run begins; it carries `sessionID`; and its `output.parts` become the message. `chat.message`
 * carries the same id and fires on *every* turn, which would put the sentence in the context
 * repeatedly for one fact that never changes.
 *
 * ## The part is mutated into place, never assigned
 *
 * This is the whole implementation risk and it is invisible in the types. The host builds one array
 * and passes the same binding twice:
 *
 *     yield* d.trigger("command.execute.before", { command, sessionID, arguments }, { parts: We });
 *     let B = yield* we({ sessionID, messageID, model, agent, parts: We, variant });
 *
 * `we` reads `We`, not `output.parts`. So `output.parts.push(…)` is seen and
 * `output.parts = [...output.parts, …]` is discarded in silence — the hook runs, returns cleanly,
 * and nothing reaches the model. `session-id.test.js` holds the array's identity for that reason.
 *
 * ## And it is synthetic
 *
 * `synthetic: true` keeps it out of the transcript the user reads: the renderer takes
 * `parts.filter((e) => e.type === "text" && !e.synthetic)`. The model receives the sentence; the
 * session does not gain a line of bookkeeping above every skill the user starts. A fact the model
 * needs and the user does not is exactly what the flag is for.
 */

import type { Hooks } from '@opencode-ai/plugin-v1';

/** A part the host has already turned into a delegated run, which this must not add text beside. */
const SUBTASK = 'subtask';

/**
 * The text part as the host will actually accept it, which is not the type the hook is declared
 * with.
 *
 * **The published signature is `{ parts: Part[] }` and the array the host passes holds no `Part`.**
 * `Part` is a stored message part and carries `id`, `sessionID` and `messageID`; the array reaching
 * this hook is assembled *before* the message exists, and goes on to `we`, whose own schema reads
 * `s.Array(s.Union([TextPartInput, FilePartInput, AgentPartInput, SubtaskPartInput]))` — the input
 * forms, where all three of those are absent. So the declared element type is narrower than the
 * value, and `tsc` refuses a part the host would accept.
 *
 * The cast is the honest way through, because the alternative is to invent the three fields — a
 * message id composed here would be a fabricated identity in the message store, which is the same
 * class of mistake as the invented session id this module exists to stop. `TextPartInput` is
 * `{ id?, type: 'text', text, synthetic?, ignored?, time?, metadata? }`, so what is pushed is a
 * complete value of the type the host reads; it is only incomplete against the type it published.
 */
type TextPartInput = { type: 'text'; text: string; synthetic: true };

/**
 * The element type the hook declares, read off the hook rather than imported.
 *
 * `Part` is declared in the package and not exported, so it cannot be named directly — and deriving
 * it from the signature is the better of the two anyway: the cast below is against whatever this
 * hook's second argument actually holds, so a version that widens `parts` to the input forms turns
 * the cast into a no-op instead of leaving a stale name behind.
 */
type HostPart = Parameters<NonNullable<Hooks['command.execute.before']>>[1]['parts'][number];

/**
 * What the model is told, in the vocabulary the procedure it is about to follow uses.
 *
 * **It names the parameter as well as the value.** `id` is `create_session`'s only required
 * argument and the one a run gets wrong; a sentence carrying the id alone leaves the model to
 * work out what to do with it, which is the inference this exists to remove.
 *
 * @param {string} sessionID The host's own session id.
 * @returns {string}
 */
export const announcement = (sessionID: string): string =>
  `The harness session id for this run is ${sessionID}. Pass it as \`id\` where the Session `
  + 'Startup procedure calls for the harness\'s session id, rather than composing one.';

/**
 * The hook, bound to the command names dpm registered.
 *
 * **Scoped to dpm's own commands rather than fired on all of them.** The hook is global — every
 * command in the project reaches it, including ones dpm knows nothing about — and a plugin that
 * appended a sentence about dpm sessions to a user's unrelated command would be editing a prompt
 * that is none of its business. `commands.ts` builds the set this is given, so the two cannot drift.
 *
 * A leading slash is tolerated because the host's own field is the bare name and a caller reading
 * this from a keybind or a script may not be.
 *
 * @param {ReadonlySet<string>} commands The names dpm registered, bare.
 * @returns {NonNullable<Hooks['command.execute.before']>}
 */
export function announceSession(
  commands: ReadonlySet<string>,
): NonNullable<Hooks['command.execute.before']> {
  return async (input, output) => {
    if (!commands.has(input.command.replace(/^\//, ''))) return;

    // **A delegated run is left alone.** Where the command resolves to a subtask the host has
    // already replaced the parts with a single `subtask` entry whose `prompt` was composed before
    // this hook was reached, so a text part pushed beside it is not in that prompt and is not
    // anywhere else either. Saying nothing is the honest outcome; `dpm-ralph` is the case.
    if (output.parts.some((part) => part.type === SUBTASK)) return;

    // Pushed, never reassigned. See the module docblock: the host reads its own binding. The cast
    // is `TextPartInput`'s, above — the declared element type describes a stored part and the array
    // holds unstored inputs.
    const part: TextPartInput = {
      type: 'text',
      text: announcement(input.sessionID),
      synthetic: true,
    };

    output.parts.push(part as unknown as HostPart);
  };
}
