/**
 * The harness session id reaching the model, and reaching it the one way the host will read.
 *
 * - "A `/dpm-…` command carries the host's session id into the turn that starts the skill" [unit]
 * - "A command dpm did not register is left exactly as it was" [unit]
 * - "The part is pushed into the host's own array, not assigned over `output.parts`" [unit]
 * - "The part is synthetic, so the model reads it and the transcript does not carry it" [unit]
 * - "A delegated run is left alone, because its prompt was composed before this hook" [unit]
 * - "must NOT — the hook fires on nothing, which reads exactly like a hook that fires correctly"
 *   [unit]
 *
 * **The defect this exists for is the assignment, and it has no error in it.** The host builds one
 * array and hands the same binding to the hook and to the message builder:
 *
 *     yield* d.trigger("command.execute.before", { command, sessionID, arguments }, { parts: We });
 *     let B = yield* we({ sessionID, messageID, model, agent, parts: We, variant });
 *
 * A hook writing `output.parts = [...output.parts, part]` replaces its own local view and leaves
 * `We` untouched. Nothing throws, the hook returns cleanly, the command runs, and the sentence is
 * nowhere — which is indistinguishable, from inside dpm, from a hook that worked. So the array's
 * identity is asserted rather than its contents alone.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { announceSession, announcement } from '../src/plugin/session-id.ts';
import { skillCommands } from '../src/plugin/commands.ts';

/** The host's own id shape, which is nothing like the UUIDs a run composes without one. */
const SESSION = 'ses_f69986181ffevgdDOtWT9XDkhK';

/** dpm's registered command names, read from the builder rather than listed. */
const commands = () => new Set(Object.keys(skillCommands()));

/** One invocation, shaped as the host shapes it. */
const invoke = async (command, parts = [], names = commands()) => {
  const output = { parts };

  await announceSession(names)({ command, sessionID: SESSION, arguments: '' }, output);

  return output;
};

test('a dpm command carries the host session id into the turn [unit]', async () => {
  const { parts } = await invoke('dpm-spec');

  assert.equal(parts.length, 1, 'the hook added no part, so the run still has no id to pass');
  assert.equal(parts[0].type, 'text');
  assert.match(parts[0].text, new RegExp(SESSION),
    'the part does not carry the session id, which is the only fact it exists to carry');

  // **The parameter is named as well as the value.** `id` is what `create_session` requires and
  // what a run gets wrong; an id with no instruction attached is a fact the model must still
  // interpret, and interpreting it is the step this removes.
  assert.match(parts[0].text, /\bid\b/,
    'the sentence does not say what to do with the id');

  // A leading slash is tolerated, because the field is bare and a caller may not be.
  assert.deepEqual((await invoke('/dpm-spec')).parts.length, 1);
});

test('a command dpm did not register is left exactly as it was [unit]', async () => {
  // The hook is global: every command in the project reaches it. Appending dpm's sentence to
  // someone else's command would be editing a prompt that is none of dpm's business.
  for (const command of ['commit', 'review', 'dpm', 'dpm-', 'not-dpm-spec', 'dpm-spec-extra']) {
    assert.deepEqual((await invoke(command)).parts, [],
      `${command} was treated as a dpm command`);
  }

  // The control on that reading: the same probe with a name dpm does register adds the part. A
  // matcher that accepted nothing would satisfy every assertion above.
  assert.equal((await invoke('dpm-do')).parts.length, 1);
});

test('the part is pushed into the host\'s array, not assigned over `output.parts` [unit]', async () => {
  // **The reading the module exists to get right.** `we` reads the binding the host built, so a
  // hook that replaced `output.parts` would be writing somewhere the host never looks.
  const hostArray = [{ type: 'text', text: 'the user typed this' }];
  const output = { parts: hostArray };

  await announceSession(commands())({ command: 'dpm-epics', sessionID: SESSION, arguments: '' }, output);

  assert.equal(output.parts, hostArray,
    'the hook replaced the array the host is holding, so nothing it added reaches the model');
  assert.equal(hostArray.length, 2, 'the host\'s own array did not grow');
  assert.equal(hostArray[0].text, 'the user typed this', 'the user\'s own part was disturbed');
  assert.match(hostArray[1].text, new RegExp(SESSION));
});

test('the part is synthetic, so the model reads it and the transcript does not [unit]', async () => {
  const { parts } = await invoke('dpm-brief');

  assert.equal(parts[0].synthetic, true,
    'the part renders in the user\'s transcript, adding a line of bookkeeping above every skill');

  // Rendered the way the host renders, rather than asserted on the flag alone — the host takes
  // `parts.filter((e) => e.type === "text" && !e.synthetic)`, so this is that filter.
  const shown = parts.filter((part) => part.type === 'text' && !part.synthetic);

  assert.deepEqual(shown, [], 'the host would draw the session id above the skill');
});

test('a delegated run is left alone [unit]', async () => {
  // Where the command resolves to a subtask, the host has already replaced the parts with one
  // `subtask` entry whose `prompt` was composed before this hook was reached. A text part pushed
  // beside it is in no prompt at all, so the honest outcome is to add nothing.
  const only = { type: 'subtask', agent: 'build', prompt: 'do the thing' };
  const delegated = [only];

  // **Compared against a copy taken beforehand, not against `delegated` itself.** The hook mutates
  // in place, so `deepEqual(output.parts, delegated)` is the array compared with itself and passes
  // however many parts were pushed into it — which is what it did until the guard was removed and
  // nothing went red.
  assert.deepEqual((await invoke('dpm-ralph', delegated)).parts, [only],
    'the hook added a part beside a subtask, where it reaches no prompt');
});

test('must NOT — the hook fires on nothing, which reads like one that fires correctly [unit]', async () => {
  // An empty command set makes every assertion about "left as it was" pass, and the positive
  // readings above would be the only thing standing between that and a silent no-op. This names
  // the corpus the hook is actually bound to, so an empty one is a failure rather than a quiet pass.
  const names = commands();

  assert.ok(names.size >= 20,
    `dpm registered ${names.size} commands, so the hook is bound to almost nothing`);
  assert.ok(names.has('dpm-spec') && names.has('dpm-do'),
    'the set does not hold the commands every other case in this file names');

  // And the sentence is a sentence, not an empty string that every `match` above would accept.
  assert.notEqual(announcement(SESSION).trim(), '');
  assert.notEqual(announcement('a'), announcement('b'), 'the id is not interpolated');
});
