/**
 * Epic 01-03 Story 3 — how a skill is started, said in every body the same way.
 *
 * - "Every skill body's invocation prose names the v2 skill-first mechanism rather than a
 *   slash-command trigger" [unit]
 * - "In a scratch project, a user can start each of the twenty-three skills by the documented v2
 *   invocation" [manual] — the walk is its evidence, and is not doubled here.
 *
 * **The half of the criterion with teeth is the one nobody would have written down.** That no body
 * says `/dpm:spec` any more is `skill-port.test.js`'s sweep and is not repeated. What this file adds
 * is the other end of the same mechanism: `$ARGUMENTS`, which Claude Code substituted into a body
 * before the model saw it and which v2 fills with nothing. Story 2's must-NOT named the four host
 * mechanisms anyone thinks of and this was not among them, so it survived a pass that was looking
 * for exactly this kind of thing — which is why the reading is here rather than folded in as a fifth
 * pattern nobody would notice was doing any work.
 *
 * The corpus is walked rather than listed, so a skill added tomorrow is held to both readings.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conventions, frontMatter, skillNames, skillSource } from './support/skills.js';
import { ID_PREFIX } from '../src/plugin/skills.ts';

/** The sentence every description ends with, built from the id the plugin will actually register. */
const invocation = (name) => `Invoke with the skill tool, id "${ID_PREFIX}${name}".`;

test('every description says how the skill is invoked, with its own registered id [unit]', () => {
  const names = skillNames();

  assert.equal(names.length, 23, `${names.length} skills were enumerated from the tree`);

  for (const name of names) {
    const { description } = frontMatter(skillSource(name));

    assert.ok(description, `${name} has no description, so the host can advertise nothing`);

    // **Its own id, not merely some id.** A rewrite that pasted the same sentence into all
    // twenty-three would satisfy a check for the phrase and send every reader to one skill.
    assert.ok(description.endsWith(invocation(name)),
      `${name}'s description does not end with: ${invocation(name)}`);
  }

  // The control on the reading above: it can tell a wrong id from a right one, and a missing
  // sentence from a present one. Without this, a helper returning the empty string would pass.
  assert.equal(invocation('spec').endsWith(invocation('epics')), false);
  assert.equal(`A skill. ${invocation('do')}`.endsWith(invocation('do')), true);
  assert.equal('A skill that does things.'.endsWith(invocation('do')), false);
});

test('no body names $ARGUMENTS, the substitution v2 does not perform [unit]', () => {
  // **The failure this catches is the quiet one.** `$ARGUMENTS` under v2 is a literal string in a
  // sentence that still reads as an instruction, so a model does not error on it — it invents a
  // value. That is worse than a broken tool name, which fails loudly at the first call.
  const offenders = skillNames()
    .filter((name) => /\$ARGUMENTS/.test(skillSource(name)));

  assert.deepEqual(offenders, [], 'a body still names Claude Code\'s argument substitution');
  assert.doesNotMatch(conventions(), /\$ARGUMENTS/,
    'the file every skill reads at startup names it, so all twenty-three inherit it');

  // Driven against the sentences the port actually removed, one per shape, because a sweep over a
  // corpus that no longer contains the thing proves nothing about the sweep.
  for (const breach of [
    '`$ARGUMENTS` is optional.',
    'If `$ARGUMENTS` names a document — a ULID, or a human reference — read it.',
    '`$ARGUMENTS` selects the action:',
  ]) {
    assert.match(breach, /\$ARGUMENTS/, `the reading passes a body containing ${breach}`);
  }

  // And the replacement is not caught, which is what makes this a reading rather than a ban on the
  // word. Every body carries the new form, so a pattern that fired on it would empty the corpus.
  assert.doesNotMatch('The request selects the action:', /\$ARGUMENTS/);
});

test('the replacement actually landed in every body, not merely the old form removed [unit]', () => {
  // **Deleting the sentence would pass the test above.** A body whose Input section lost its
  // argument contract entirely names no `$ARGUMENTS` and tells a run nothing about what it was
  // started with, so the absence has to be paired with the presence.
  const silent = skillNames()
    .filter((name) => !/\brequest\b/i.test(skillSource(name)));

  assert.deepEqual(silent, [],
    'a body names neither $ARGUMENTS nor the request, so its argument contract went missing');
});
