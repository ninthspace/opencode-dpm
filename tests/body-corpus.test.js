/**
 * Epic 47-12 Story 3 — the rule, asserted over the corpus.
 *
 * - "Every skill mention of a tool that withholds a body either requests the body or is recorded as
 *   not needing it, checked over the corpus against the live tool registry rather than a
 *   transcribed list" [unit]
 * - "The check matches the construction that binds a read to its step, rather than the proximity of
 *   `include_body` to a tool name" [unit]
 * - "The residual gap the check cannot close is stated in the test rather than left implied" [unit]
 * - "must NOT — the check passes over an empty enumeration, so a registry yielding no body-carrying
 *   tools or a glob matching no skills reads as full compliance" [unit]
 *
 * Stories 1 and 2 classified every site and fixed the ones that needed fixing. This is the standing
 * rule that keeps them fixed: **nothing here is a list**. The tools come from the live registry, the
 * files from the skills directory, and the sites from the files — so a tool that starts withholding,
 * a skill added tomorrow, or a step that gains a read all arrive in the check without anyone
 * remembering to add them. That is also why every count below is guarded: an enumeration derived
 * from three live sources has three ways to yield nothing, and each of them would read as
 * compliance.
 *
 * This is register entry #25's mechanism. `false-pass.test.js` cites the first test below.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openPlanningDatabase } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import { CALLABLE, skillNames } from './support/skills.js';
import { CLASSIFICATION, SHARED, asks, corpus, key, sites, withheld } from './support/body-reads.js';

/** Floors below which a derivation yielded nothing rather than found nothing. */
const FLOOR = { tools: 30, files: 24, sites: 100 };

/**
 * Everything wrong with the corpus, as a list of complaints.
 *
 * A function rather than a run of assertions, so the controls drive **this** on enumerations
 * written to be empty instead of restating its guards beside it.
 *
 * @param {Set<string>} names Tools that withhold a body, from the live registry.
 * @param {ReturnType<typeof corpus>} walked File to its source and the sites found in it.
 * @param {Map<string, [boolean, string]>} classification Site key to `[needs, why]`.
 * @returns {string[]} Empty when every site either asks for the body or is recorded as not needing it.
 */
function audit(names, walked, classification) {
  const complaints = [];

  if (names.size < FLOOR.tools) {
    complaints.push(`the registry yielded ${names.size} body-carrying tools, below the ${FLOOR.tools} it declares`);
  }

  if (walked.size < FLOOR.files) {
    complaints.push(`the corpus read ${walked.size} files, below the ${FLOOR.files} it holds`);
  }

  const seen = new Set();

  for (const [file, { sites: found }] of walked) {
    for (const site of found) {
      const name = key(file, site);

      seen.add(name);

      const judgement = classification.get(name);

      if (!judgement) {
        complaints.push(`${name} is a read of a withholding tool with no recorded judgement`);
        continue;
      }

      // **The rule.** A step that renders or quotes stored text asks for it; one that needs only
      // identity or a typed column is recorded as not needing it, and that record is the exemption.
      if (judgement[0] && !asks(site)) {
        complaints.push(`${name} renders stored text from a read whose step never asks for it`);
      }
    }
  }

  if (seen.size < FLOOR.sites) {
    complaints.push(`only ${seen.size} sites were found, below the ${FLOOR.sites} the corpus holds`);
  }

  for (const name of classification.keys()) {
    if (!seen.has(name)) complaints.push(`${name} is judged and is no longer a site`);
  }

  return complaints;
}

/** The three live sources, read as the rule reads them. */
function live(t) {
  const names = withheld(spineTools(openPlanningDatabase(t)));

  return { names, walked: corpus(names) };
}

// --- Criteria 1 and 2: the rule, over an enumeration nothing transcribed -------------------------

test('every read of a withholding tool asks for the body or is recorded as not needing it', (t) => {
  const { names, walked } = live(t);

  assert.deepEqual(audit(names, walked, CLASSIFICATION), []);

  // **Derived, and asserted to be.** Each of these would still pass with a transcribed list, so
  // they are stated as facts about where the three enumerations came from.
  assert.deepEqual([...walked.keys()], [...skillNames(), SHARED],
    'the files checked are not the skills directory plus the shared conventions');
  assert.ok(names.has('list_requirement') && names.has('read_requirement'),
    'the generated half of the body declarations is missing — `list.js` copies from the read tools');
  assert.equal(names.has('read_spec'), false,
    '`body: []` is being read as withholding, which buries the real sites under the document kinds');

  // The rule is only interesting where both outcomes occur. A corpus in which every site needs a
  // body, or none does, would satisfy the check without it having decided anything.
  const judged = [...walked].flatMap(([file, { sites: found }]) =>
    found.map((site) => CLASSIFICATION.get(key(file, site))[0]));

  assert.ok(judged.filter(Boolean).length >= 60, 'almost no site needs a body, so the rule reaches nobody');
  assert.ok(judged.filter((needs) => !needs).length >= 20, 'almost every site needs one, so nothing is exempt');
});

// --- Criterion 2, driven: the construction, not the proximity ------------------------------------

test('a site passes on its own step, never on an `include_body` sitting near it', (t) => {
  const { names, walked } = live(t);

  // Every site that needs a body asks for one, so the rule holds — and it must hold for the right
  // reason. Planted sources are the only way to say so: on the real corpus a block-scoped and a
  // file-scoped reading now agree everywhere the answer is `true`.
  const planted = [
    '1. Call `<T>list_requirement` with `include_body`, then render each one.',
    '2. Call `<T>list_story_criterion` for the criteria, in `position` order.',
    '',
    'A paragraph naming `<T>list_task` and nothing else.',
  ].join('\n').replaceAll('<T>', CALLABLE);

  const found = sites(planted, names);
  const at = (tool) => found.find((site) => site.tool === tool);

  assert.equal(found.length, 3, 'the planted source did not yield the three sites it holds');
  assert.equal(asks(at('list_requirement')), true, 'the block that names the argument');
  assert.equal(asks(at('list_story_criterion')), false,
    'a numbered item after one that names the argument counted as asking');
  assert.equal(asks(at('list_task')), false,
    'a later paragraph counted as asking, so the construction is the file rather than the block');

  // And the same source run through the rule: two of the three are defects, and both are named.
  const judged = new Map(found.map((site) => [key('planted', site), [true, 'renders it']]));
  const complaints = audit(names, new Map([['planted', { source: planted, sites: found }]]), judged);

  assert.deepEqual(complaints.filter((complaint) => complaint.includes('never asks')), [
    'planted · list_story_criterion · (preamble) renders stored text from a read whose step never asks for it',
    'planted · list_task · (preamble) renders stored text from a read whose step never asks for it',
  ]);

  assert.equal(walked.size >= FLOOR.files, true);
});

// --- Criterion 3: the residual gap, stated rather than implied -----------------------------------

test('the check states what it cannot see, and the statement is in the file', () => {
  // Retro 36: where a sweep *is* the requirement, what it cannot see has to be written down, or the
  // green mark is read as coverage it does not have. Four things, and each is a real hole:
  //
  // 1. **`asks` sees the word, not the call.** A block naming `include_body` while telling the run
  //    to omit it — or passing `false` — reads as asking. Nothing here executes a skill.
  // 2. **The judgement is recorded, not derived.** The rule checks that every site *has* one and
  //    that needing sites ask. A site wrongly recorded as not needing a body is invisible to it,
  //    permanently: its exemption is the thing being trusted. `body-reads.test.js` guards this with
  //    a reason per entry and a quote-expiry check; that catches a reason going stale, not a
  //    judgement that was wrong when it was made.
  // 3. **A read reached through a shared procedure is attributed to the shared file.** A skill that
  //    follows *Session Startup* or *Perspectives* inherits their reads, and the site is recorded
  //    against `shared/skill-conventions.md`. If a skill restates such a read in its own words
  //    without naming the tool, no site exists for it here.
  // 4. **The corpus is `dpm/skills/`.** A prompt, an agent definition or a hook that calls a
  //    withholding tool is not swept, because nothing walks those.
  //
  // Stated in the test rather than in a document, because the test is what a reader reaches for
  // when the green mark is what they are trying to interpret.
  const source = readFileSync(new URL(import.meta.url), 'utf8');
  const stated = source.slice(source.indexOf('Retro 36:'), source.indexOf('const source ='));

  for (const gap of ['sees the word, not the call', 'recorded, not derived',
    'attributed to the shared file', 'corpus is `dpm/skills/`']) {
    assert.ok(stated.includes(gap), `the residual gap "${gap}" is no longer stated`);
  }

  assert.ok(stated.split('\n').length > 15, 'the statement has shrunk to a heading with nothing under it');
});

// --- must NOT: an empty enumeration reads as full compliance --------------------------------------

test('an enumeration that yielded nothing is refused, not read as full compliance', (t) => {
  const { names, walked } = live(t);

  // **Three live sources, three ways to yield nothing.** Each of these satisfies every per-site
  // check by having no sites to check, and each is what a real breakage would look like: a registry
  // whose `body` declarations moved, a glob matching no skills, a `sites()` that stopped matching.
  const empty = new Map([...walked].map(([file, held]) => [file, { ...held, sites: [] }]));

  for (const [what, complaint, run] of [
    ['a registry yielding no body-carrying tools', 'body-carrying tools',
      () => audit(new Set(), corpus(new Set()), new Map())],
    ['a glob matching no skills', 'files', () => audit(names, new Map(), new Map())],
    ['a corpus in which nothing matched', 'sites were found', () => audit(names, empty, new Map())],
  ]) {
    const complaints = run();

    assert.ok(complaints.some((each) => each.includes(complaint)),
      `${what} read as full compliance — the guard did not fire`);
  }

  // The premise, so the guards are not the only thing this test can ever report: the live
  // enumeration clears all three floors.
  assert.deepEqual(audit(names, walked, CLASSIFICATION).filter((complaint) =>
    complaint.includes('below the')), []);
});
