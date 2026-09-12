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
 * And the second half of the same property, because a gate can be present and still decide nothing:
 *
 * - "Every gate that puts a proposal to the user renders it in the message body first, or is a
 *   selection whose options are the whole of the choice" [unit]
 * - "The render is required at the gate rather than in a `## Process` preamble, which is the one
 *   place `unrendered` deliberately differs from `ungated`" [unit]
 * - "A selection-only exemption lapses when the file stops bearing it out, in both directions"
 *   [unit]
 * - "must NOT — a corpus with no gates in it reads as every gate rendering" [unit]
 *
 * **The defect this exists for has no error in it.** A run that renders its proposal and ends the
 * turn looks, from the transcript, like a run waiting for the user; the user is waiting for it. And
 * where the block writes before it presents, the rows are already there — so the question, when it
 * finally arrives, is about a decision the run has made. Both were reached in `spec` before anything
 * checked for them.
 *
 * **The third shape was reached in `brief`, on a host small enough to drop a clause.** The gate
 * fired, correctly formed, at Phase 6 — and the brief it asked about had been rendered nowhere,
 * because Phase 8's instruction to render it was a subordinate clause of the sentence that named
 * the gate. Nothing is written until approval, so the document existed in neither the message nor
 * the database. That is what `unrendered` reads for, and why it reads for it per block.
 *
 * **Why a corpus check and not four per-skill ones.** The per-skill files each assert the behaviours
 * their own conversion named. This is a property of *how a skill is constructed*, so the skill that
 * breaks it next is the one nobody has written yet — which is `skillNames()`'s own argument, applied
 * one level up.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skillNames, skillSource, ungated, unrendered, blocks } from './support/skills.js';

/**
 * Blocks that reach a gate the check cannot see, each with the reason it does and a `bears_out`
 * that says what would have to stay true. An exemption whose premise has lapsed is a complaint, so
 * this cannot quietly become a list of blocks somebody once waved through.
 */
const EXEMPT = new Map([
  ['dpm-present ### 5. Record it', {
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
      + 'with `dpm_create_requirement`.\n'],
    ['gated', '## Process\n\nNo rule here either.\n\n'
      + '### Step 1: Decide the other thing\n\nPresent them, **propose** one, gate with '
      + 'the `question` tool, then record with `dpm_create_requirement`.\n'],
  ]);

  assert.deepEqual(audit(planted), ['invented ### Step 1: Decide the thing proposes and writes with no gate'],
    'the ungated one is named and the gated one beside it is not');
});

test('coverage is read off the file, so a blanket rule reaches a section and not a sub-block', () => {
  const body = 'Present the draft, **propose** the rows, then write them with '
    + '`dpm_create_requirement`.';
  const ruled = `## Process\n\nGate each section with the \`question\` tool.\n\n### Section 1: A section\n\n${body}\n`;

  assert.deepEqual(ungated(ruled), [], 'a ### block is reached by the preamble rule');

  assert.deepEqual(ungated(`${ruled}\n#### Step 1a: A sub-block\n\n${body}\n`),
    [{ heading: 'Step 1a: A sub-block', depth: 4 }],
    'and a #### block beneath it is not');

  const unruled = ruled.replace('Gate each section with the `question` tool.', 'Work through the sections in order.');
  assert.equal(ungated(unruled).length, 1, 'a skill with no blanket rule leaves its sections uncovered');

  assert.deepEqual(ungated(`${ruled.trimEnd()} Then gate with the \`question\` tool.\n`), [],
    'and a block that gates itself needs no rule above it');
});

test('an exemption whose premise has lapsed is a complaint, not a pass', () => {
  // One skill, so what the assertions see is the exemption mechanism and nothing else.
  const only = (source) => new Map([['dpm-present', source]]);
  const present = skillSource('dpm-present');

  assert.deepEqual(audit(only(present)), [], 'the exemption holds on the file as it stands');

  assert.deepEqual(
    audit(only(present.replace('Follow the shared **Artifact Publishing** procedure', 'Publish it'))),
    ['dpm-present ### 5. Record it is exempt for a reason the file no longer bears out'],
  );

  // The other direction: an exemption for a block that now gates is a stale entry, and stale is
  // how a list of waved-through blocks starts.
  assert.deepEqual(
    audit(only(present.replace('### 5. Record it', '### 5. Record it\n\nGate with the `question` tool first.'))),
    ['dpm-present ### 5. Record it is exempt and no longer needs to be'],
  );
});

test('must NOT — a corpus that parses to nothing reads as full compliance', () => {
  assert.ok(audit(new Map()).includes('no skills read, so nothing was checked'));

  const unreadable = new Map([['invented', ''], ['also-invented', '']]);
  assert.ok(audit(unreadable).some((each) => each.includes('heading blocks parsed across 2 skills')));
});

/**
 * Selection-only gates, which put every choice in `options` and so have no separate artefact to
 * render. Each carries what would have to stay true for it to go on being exempt, so the list
 * cannot quietly become a set of blocks somebody once waved through.
 */
const SELECTION_ONLY = new Map([
  ['dpm-architect ## Input', {
    reason: 'the gate offers the documents an ADR could hang off and the titles are the options; '
      + 'there is no proposal, and a body repeating the labels is noise',
    bears_out: (source) => /offer the results with the `question` tool/.test(source),
  }],
  ['dpm-audit ### Step 1: Orient', {
    reason: 'the gate asks for a sweep weighting — focus somewhere specific, or sweep evenly — '
      + 'which is a preference between the two options and refers to no artefact',
    bears_out: (source) => /one `question` call: focus somewhere specific, or sweep evenly/.test(source),
  }],
]);

/**
 * The corpus reconciled in both directions, as `audit` does it for gates: every gate that proposes
 * renders first or is selection-only, and every exemption still names a block that needs one.
 *
 * @param {Map<string, string>} corpus
 * @returns {string[]}
 */
function renders(corpus) {
  const complaints = [];
  const found = new Map();

  if (!corpus.size) complaints.push('no skills read, so nothing was checked');

  let gates = 0;
  for (const [skill, source] of corpus) {
    gates += blocks(source).filter(({ body }) => /`question`/.test(body)).length;
    for (const { heading, depth } of unrendered(source)) {
      found.set(`${skill} ${'#'.repeat(depth)} ${heading}`, skill);
    }
  }

  // The floor. A corpus in which nothing gates satisfies every per-block check below, and reads
  // identically to one in which every gate renders first.
  if (gates < corpus.size) complaints.push(`${gates} gating blocks parsed across ${corpus.size} skills`);

  for (const key of found.keys()) {
    if (!SELECTION_ONLY.has(key)) complaints.push(`${key} gates a proposal it never renders`);
  }

  for (const [key, { bears_out }] of SELECTION_ONLY) {
    const skill = key.split(' ')[0];
    if (!corpus.has(skill)) continue;
    if (!found.has(key)) complaints.push(`${key} is exempt and no longer needs to be`);
    else if (!bears_out(corpus.get(skill))) complaints.push(`${key} is exempt for a reason the file no longer bears out`);
  }

  return complaints;
}

test('every gate that puts a proposal to the user renders it in the message body first', () => {
  assert.deepEqual(renders(corpus()), []);
});

test('a gate whose proposal goes nowhere is reported by skill and heading', () => {
  // Planted, for `audit`'s reason one test up: with the defect fixed everywhere, only a
  // manufactured source shows the per-block complaint firing at all. On its own corpus, so a
  // genuine regression fails the live check rather than this one.
  const planted = new Map([
    ['invented', '### Phase 8: Summary\n\nPresent the draft, then gate it with the `question` '
      + 'tool: `Approve` / `Stop`.\n'],
    ['rendered', '### Phase 8: Summary\n\nRender the draft in the message body, then gate it with '
      + 'the `question` tool: `Approve` / `Stop`.\n'],
  ]);

  assert.deepEqual(renders(planted), ['invented ### Phase 8: Summary gates a proposal it never renders'],
    'the one that only presents is named and the one that renders beside it is not');
});

test('the render is required at the gate, not in a preamble four hundred lines above it', () => {
  // The asymmetry with `ungated`, asserted rather than described. A blanket rule covers a `###`
  // block for *gating*; it must not cover the same block for *rendering*, because a rule that far
  // from the gate is the one the defect consisted of skipping.
  const preamble = '## Process\n\nGate each phase with the `question` tool, rendering what is '
    + 'decided in the message body first.\n\n';
  const block = '### Phase 8: Summary\n\nPresent the draft, then gate it with the `question` '
    + 'tool.\n';

  assert.deepEqual(ungated(`${preamble}${block}`), [],
    'the blanket rule reaches the block for gating, which is `ungated`\'s existing behaviour');

  assert.deepEqual(unrendered(`${preamble}${block}`), [{ heading: 'Phase 8: Summary', depth: 3 }],
    'and does not reach it for rendering, which is the whole of this check');
});

test('a selection-only exemption whose premise has lapsed is a complaint, not a pass', () => {
  const only = (source) => new Map([['dpm-audit', source]]);
  const audited = skillSource('dpm-audit');

  assert.deepEqual(renders(only(audited)), [], 'the exemption holds on the file as it stands');

  assert.deepEqual(
    renders(only(audited.replace('one `question` call: focus somewhere specific, or sweep evenly',
      'one `question` call: choose a weighting'))),
    ['dpm-audit ### Step 1: Orient is exempt for a reason the file no longer bears out'],
  );

  assert.deepEqual(
    renders(only(audited.replace('### Step 1: Orient',
      '### Step 1: Orient\n\nRender the survey in the message body first.'))),
    ['dpm-audit ### Step 1: Orient is exempt and no longer needs to be'],
  );
});

test('must NOT — a corpus with no gates in it reads as every gate rendering', () => {
  assert.ok(renders(new Map()).includes('no skills read, so nothing was checked'));

  const ungating = new Map([['invented', '### A step\n\nPresent the draft.\n'], ['also', '### B step\n\nPresent it.\n']]);
  assert.ok(renders(ungating).some((each) => each.includes('gating blocks parsed across 2 skills')));
});
