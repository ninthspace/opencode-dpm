/**
 * Epic 03-03 Story 3 — the seven skills that take a document argument accept a reference (FR7).
 *
 * **The seven are written out, and that is the story's must-NOT rather than a shortcut.** Every
 * other corpus check in this suite reads the tree, for a reason that is right there and wrong here:
 * a claim about *the corpus* must cover the skill nobody thought about. This claim is not about the
 * corpus. FR7 names seven skills because those are the ones whose argument contract takes a
 * document, and a swept list would put a skill added next year silently in scope — passing while
 * nobody decided it should be there, or failing and being fixed by adding a sentence nobody meant.
 * Naming them makes an absence a decision, which is the only form in which an absence can be read.
 *
 * The second test is what stops the first from quietly becoming a sweep, and it reads this file.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { skillNames, skillSource, section, prose, toolNames } from './support/skills.js';

/** FR7's seven, in the order the requirement names them. */
const SEVEN = ['architect', 'brief', 'do', 'epics', 'review', 'retro', 'spec'];

const RESOLVER = 'resolve_reference';

test('each of the seven states that a reference is accepted, and names the resolver', () => {
  for (const name of SEVEN) {
    const source = skillSource(name);
    const input = prose(source, 'Input');

    assert.ok(input.length > 0, `${name} has an Input section to read`);

    // The contract, said in the section a run reads to decide what it was given. Anywhere else in
    // the file would be a sentence the argument-resolving step never reaches.
    assert.match(input, /human reference/i, `${name}'s Input says a reference is accepted`);
    assert.match(input, /ULID/, `${name}'s Input says the id still works`);

    // And the tool by name, which the existing binding then holds to being a tool that exists —
    // that check is what makes this assertion worth more than a spelling test.
    assert.ok(toolNames(section(source, 'Input')).includes(RESOLVER),
      `${name}'s Input names ${RESOLVER} in its callable form`);
  }
});

test('the seven are a written list, not a sweep of the tree', () => {
  const code = readFileSync(new URL(import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));

  // **The reading is over the declaration, not over the file.** The first draft asserted
  // `skillNames()` is never called here and failed on the call three lines below — which is a
  // legitimate one, checking the written names are real. What the must-NOT is about is where the
  // seven *come from*, and that is one line: a literal array, with no call in it to derive them.
  const [declaration] = code.filter((line) => /const SEVEN = /.test(line));

  assert.ok(declaration, 'the list is declared in this file, so there is something to check');
  assert.match(declaration, /^const SEVEN = \[(?:\s*'[a-z]+',?)+\];$/,
    'the seven are string literals — nothing in that line reads the tree or derives them');

  assert.equal(SEVEN.length, 7, 'seven, as FR7 names them');

  // Every one of them is a real skill. A written list is only better than a sweep while it is
  // right, and a renamed skill would otherwise leave this suite asserting over a name nothing has.
  const live = new Set(skillNames());

  assert.deepEqual(SEVEN.filter((name) => !live.has(name)), [],
    'each name in the list is a skill in the tree');

  // The set is smaller than the corpus, which is the whole claim. If the two ever match, the list
  // has stopped being a choice and this test should be read again rather than updated.
  assert.ok(live.size > SEVEN.length,
    `the corpus holds ${live.size} skills and FR7 names ${SEVEN.length} of them`);
});
