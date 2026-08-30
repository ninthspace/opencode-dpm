/**
 * Every skill that puts a proposal to the user gates it before the rows exist.
 *
 * - "Every skill is checked, and an uncovered proposing write is reported by skill and heading"
 *   [unit]
 * - "Coverage is derived from the file — a self-gate, or a blanket rule in the `## Process`
 *   preamble reaching `###` and no deeper — rather than from a transcribed list" [unit]
 * - "An exempt block is exempt for a reason the file still bears out, and lapses when it stops
 *   being true" [unit]
 * - "must NOT — the check passes over a corpus it failed to read, so a source that parses to
 *   nothing reads as full compliance" [unit]
 *
 * **The defect this exists for has no error in it.** A run that renders its proposal and ends the
 * turn looks, from the transcript, like a run waiting for the user; the user is waiting for it. And
 * where the block writes before it presents, the rows are already there — so the question, when it
 * finally arrives, is about a decision the run has made. Both were reached in `spec` before anything
 * checked for them.
 *
 * **Why a corpus check and not four per-skill ones.** The per-skill files each assert the behaviours
 * their own conversion named. This is a property of *how a skill is constructed*, so the skill that
 * breaks it next is the one nobody has written yet — which is `skillNames()`'s own argument, applied
 * one level up.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skillNames, skillSource, ungated, blocks } from './support/skills.js';

/**
 * Blocks that reach a gate the check cannot see, each with the reason it does and a `bears_out`
 * that says what would have to stay true. An exemption whose premise has lapsed is a complaint, so
 * this cannot quietly become a list of blocks somebody once waved through.
 */
const EXEMPT = new Map([
  ['present ### 5. Record it', {
    reason: 'confirmation is delegated to the shared Artifact Publishing procedure, which is '
      + 'separately confirmed and never assumed from the draft having been approved',
    bears_out: (source) => /Follow the shared \*\*Artifact Publishing\*\* procedure/.test(source),
  }],
]);

/**
 * The corpus reconciled in both directions: every uncovered block is exempt, and every exemption
 * still names a block that is uncovered and whose reason still holds.
 *
 * @param {Map<string, string>} corpus
 * @returns {string[]}
 */
function audit(corpus) {
  const complaints = [];
  const found = new Map();

  if (!corpus.size) complaints.push('no skills read, so nothing was checked');

  let seen = 0;
  for (const [skill, source] of corpus) {
    seen += blocks(source).length;
    for (const { heading, depth } of ungated(source)) {
      found.set(`${skill} ${'#'.repeat(depth)} ${heading}`, skill);
    }
  }

  // The floor, because a parse matching nothing satisfies every per-block check above and reads
  // exactly like a corpus in which every block gates.
  if (seen < corpus.size) complaints.push(`${seen} heading blocks parsed across ${corpus.size} skills`);

  for (const key of found.keys()) {
    if (!EXEMPT.has(key)) complaints.push(`${key} proposes and writes with no gate`);
  }

  // An exemption is judged only where its skill is in the corpus, so a control can hand this a
  // synthetic corpus and test one mechanism without the live files' state reaching the assertion.
  for (const [key, { bears_out }] of EXEMPT) {
    const skill = key.split(' ')[0];
    if (!corpus.has(skill)) continue;
    if (!found.has(key)) complaints.push(`${key} is exempt and no longer needs to be`);
    else if (!bears_out(corpus.get(skill))) complaints.push(`${key} is exempt for a reason the file no longer bears out`);
  }

  return complaints;
}

const corpus = () => new Map(skillNames().map((name) => [name, skillSource(name)]));

test('every proposing write in the corpus is gated, or exempt for a reason that still holds', () => {
  assert.deepEqual(audit(corpus()), []);
});

test('an ungated proposing write is reported by skill and heading', () => {
  // Planted, because every block in the live corpus is now covered: with the defect fixed
  // everywhere, only a manufactured source can show the per-block complaint firing at all.
  //
  // **On its own corpus rather than added to the live one.** A control built by copying the real
  // corpus and appending to it asserts the live files are clean a second time, so a genuine
  // regression fails it too and the message says nothing about the mechanism it was written for.
  const planted = new Map([
    ['invented', '## Process\n\nNo rule here.\n\n'
      + '### Step 1: Decide the thing\n\nPresent the options and **propose** one, then record it '
      + 'with `mcp__plugin_dpm_dpm__create_requirement`.\n'],
    ['gated', '## Process\n\nNo rule here either.\n\n'
      + '### Step 1: Decide the other thing\n\nPresent them, **propose** one, gate with '
      + '`AskUserQuestion`, then record with `mcp__plugin_dpm_dpm__create_requirement`.\n'],
  ]);

  assert.deepEqual(audit(planted), ['invented ### Step 1: Decide the thing proposes and writes with no gate'],
    'the ungated one is named and the gated one beside it is not');
});

test('coverage is read off the file, so a blanket rule reaches a section and not a sub-block', () => {
  const body = 'Present the draft, **propose** the rows, then write them with '
    + '`mcp__plugin_dpm_dpm__create_requirement`.';
  const ruled = `## Process\n\nGate each section with \`AskUserQuestion\`.\n\n### Section 1: A section\n\n${body}\n`;

  assert.deepEqual(ungated(ruled), [], 'a ### block is reached by the preamble rule');

  assert.deepEqual(ungated(`${ruled}\n#### Step 1a: A sub-block\n\n${body}\n`),
    [{ heading: 'Step 1a: A sub-block', depth: 4 }],
    'and a #### block beneath it is not');

  const unruled = ruled.replace('Gate each section with `AskUserQuestion`.', 'Work through the sections in order.');
  assert.equal(ungated(unruled).length, 1, 'a skill with no blanket rule leaves its sections uncovered');

  assert.deepEqual(ungated(`${ruled.trimEnd()} Then gate with \`AskUserQuestion\`.\n`), [],
    'and a block that gates itself needs no rule above it');
});

test('an exemption whose premise has lapsed is a complaint, not a pass', () => {
  // One skill, so what the assertions see is the exemption mechanism and nothing else.
  const only = (source) => new Map([['present', source]]);
  const present = skillSource('present');

  assert.deepEqual(audit(only(present)), [], 'the exemption holds on the file as it stands');

  assert.deepEqual(
    audit(only(present.replace('Follow the shared **Artifact Publishing** procedure', 'Publish it'))),
    ['present ### 5. Record it is exempt for a reason the file no longer bears out'],
  );

  // The other direction: an exemption for a block that now gates is a stale entry, and stale is
  // how a list of waved-through blocks starts.
  assert.deepEqual(
    audit(only(present.replace('### 5. Record it', '### 5. Record it\n\nGate with `AskUserQuestion` first.'))),
    ['present ### 5. Record it is exempt and no longer needs to be'],
  );
});

test('must NOT — a corpus that parses to nothing reads as full compliance', () => {
  assert.ok(audit(new Map()).includes('no skills read, so nothing was checked'));

  const unreadable = new Map([['invented', ''], ['also-invented', '']]);
  assert.ok(audit(unreadable).some((each) => each.includes('heading blocks parsed across 2 skills')));
});
