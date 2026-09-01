/**
 * Epic 02-03 Story 2 — the twenty-four references, routed through the tool.
 *
 * Story 1 built `read_shared_document`. This is the half that makes it load-bearing: until every
 * body calls it, the tool is a thing that exists and the conventions still reach the model — or
 * fail to — by the path form that has no hook to run in on v1 and is rejected as
 * `external_directory` on v2.
 *
 * **The must-NOT direction is the one to write carefully.** "Every body names the tool" is
 * satisfied by a body that names the tool *and* still names the path, which is the state a
 * half-finished rewrite leaves behind and the state in which nothing has actually changed: the
 * model would follow whichever it read first. So the criterion has two halves and both are
 * asserted, in both directions, over the tree rather than over a list of twenty-three names.
 *
 * The third criterion is broader than the other two and belongs here rather than beside them: a
 * body naming a host is the fork NFR1 forbids, and the shared documents are the surface where that
 * fork would most naturally appear — one sentence for v1, one for v2. There is exactly one
 * exemption and it is the one already on the record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RECORDED_GAP } from '../scripts/skill-body-check.ts';
import {
  CALLABLE, SHARED_DOCUMENT_TOOL, conventions, skillNames, skillSource, sweep,
} from './support/skills.js';

const ROOT = join(import.meta.dirname, '..');
const SKILLS = skillNames();

/** The call, as a body has to write it for an agent to be able to make it. */
const CALL = new RegExp(`\`${CALLABLE}${SHARED_DOCUMENT_TOOL}\``);

/**
 * A filesystem path into the shared directory, in any of the forms a body could name one.
 *
 * **Not anchored on `dpm/shared/`**, which is the one form the corpus happened to use. The rewrite
 * that replaced it could as easily have left `shared/skill-conventions.md`, or the absolute path
 * `resolveSupportingPaths` used to substitute, and a check written against the old spelling would
 * pass over both. Library lesson 04's rule, in the direction that matters here: after a rename,
 * the predicate that filtered on the old form is part of the rename.
 */
const PATH_FORM = [
  { pattern: /\bshared\/[A-Za-z0-9_-]+\.md\b/, why: 'a filesystem path into the shared directory' },
  { pattern: /\bskill-conventions\.md\b/, why: 'the conventions file named as a file' },
  { pattern: /\bstatus-model\.md\b/, why: 'the status model named as a file' },
];

const named = (predicate) => SKILLS.filter((name) => predicate(skillSource(name))).sort();

// --- Criterion 1: through the tool, and by no other route ----------------------------------------

test('every skill body reaches the shared conventions through the tool [unit]', () => {
  // The count first, so an empty walk cannot be the reason the lists below are clean.
  assert.equal(SKILLS.length, 23, `${SKILLS.length} skills on disk, and the corpus is twenty-three`);

  assert.deepEqual(named((source) => !CALL.test(source)), [],
    'a skill body does not call for its shared document, so it opens without its conventions');
  assert.deepEqual(named((source) => !/`name: "skill-conventions"`/.test(source)), [],
    'a skill body calls the tool without naming the conventions, so what it receives is unstated');
});

test('no skill body names a filesystem path into the shared directory [unit]', () => {
  const offenders = SKILLS
    .map((name) => ({ name, found: sweep(skillSource(name), PATH_FORM) }))
    .filter(({ found }) => found.length > 0);

  // **Reported by name**, as the criterion asks — and with what was found, because "dpm-status
  // names a path" sends a reader to a four-hundred-line file with no line number in the message.
  assert.deepEqual(offenders, [],
    'a skill body still names the shared documents as files, so the old route is still open');

  // The shared conventions are inside the sweep too. They are read by every skill and would carry
  // a stale path to all twenty-three at once — the widest possible place for one to survive.
  assert.deepEqual(sweep(conventions(), PATH_FORM), [],
    'the shared conventions name a shared document as a file');
});

test('control — a body carrying the old path form is reported, by name [unit]', () => {
  // **The control the criterion names.** Both assertions above are empty lists, and an empty list
  // is what a sweep that matches nothing returns too. This plants the exact sentence the corpus
  // carried before this story and requires it back out, attributed.
  const planted = 'Follow the shared conventions in `dpm/shared/skill-conventions.md` — read that '
    + 'file at startup.';
  const offenders = [
    { name: 'dpm-planted', source: `# A skill\n\n${planted}\n` },
    { name: 'dpm-innocent', source: `# A skill\n\nCall \`${CALLABLE}${SHARED_DOCUMENT_TOOL}\`.\n` },
  ]
    .map(({ name, source }) => ({ name, found: sweep(source, PATH_FORM).length }))
    .filter(({ found }) => found > 0)
    .map(({ name }) => name);

  assert.deepEqual(offenders, ['dpm-planted'],
    'the sweep either missed the sentence it was written against or fired on one that is fine');

  // And the other half of the same control: a body naming the tool is not thereby exempt. A
  // half-rewritten body carries both, and it is the state in which nothing has changed.
  assert.ok(sweep(`${planted}\n\nCall \`${CALLABLE}${SHARED_DOCUMENT_TOOL}\`.`, PATH_FORM).length > 0,
    'a body naming the tool passes the sweep whatever else it names, so a half-rewrite is invisible');
});

// --- Criterion 2: the twenty-fourth reference, through the same tool -------------------------------

test('the status model is reached through the same tool as the conventions [unit]', () => {
  // One reference in one body, which is why it has a criterion of its own: a single site is what a
  // rewrite of twenty-three loses. Found by searching the corpus rather than by opening the file
  // it is known to be in — the point is that it is the only one, and a test that went straight to
  // `dpm-status` could not say so.
  const asking = named((source) => /`name: "status-model"`/.test(source));

  assert.deepEqual(asking, ['dpm-status'], 'the status model is asked for by a different set of skills');

  // Through the same tool, which is the criterion's actual claim — a second tool for the second
  // document would satisfy "reaches it" and defeat the decision ADR 02-01 records.
  const source = skillSource('dpm-status');
  const calls = [...source.matchAll(new RegExp(`\`${CALLABLE}([a-z_]+)\`[^\`]*\`name: "([a-z-]+)"\``, 'g'))];

  assert.deepEqual([...new Set(calls.map(([, tool]) => tool))], [SHARED_DOCUMENT_TOOL],
    'a shared document is asked for through some other tool');
  assert.deepEqual([...new Set(calls.map(([, , document]) => document))].sort(),
    ['skill-conventions', 'status-model']);
});

// --- Criterion 3 (must NOT): a body naming a host -------------------------------------------------

/**
 * The two hosts, by name, and the configuration directory that names one without saying so.
 *
 * **Distinct from `HOST_MECHANISM`**, which sweeps for things only Claude Code *has* — a dispatch
 * prefix, an argument substitution. This sweeps for a body that says which host it is running on at
 * all, because that is the fork NFR1 forbids and it does not require a mechanism to commit: one
 * sentence beginning "under v1" is enough, and it would read as helpful.
 */
const HOST_NAME = [
  { pattern: /\bClaude Code\b/, why: 'one of the two hosts, by name' },
  { pattern: /\bOpenCode\b/, why: 'the other host, by name' },
  { pattern: /\.claude\//, why: "Claude Code's configuration directory" },
];

test('must NOT — a skill body names a host [unit]', () => {
  // The recorded gap, subtracted rather than ignored, and imported from the check that records it
  // rather than restated here. `dpm-ralph` drives its loop by writing a file a Claude Code stop
  // hook reads; the hook has no equivalent on either supported host, so the reference is a missing
  // capability kept visible on purpose. Rewriting it would satisfy this test by destroying what it
  // is for.
  const offenders = SKILLS
    .map((name) => ({
      name,
      found: sweep(name === RECORDED_GAP.skill
        ? skillSource(name).replaceAll(RECORDED_GAP.pattern, '')
        : skillSource(name), HOST_NAME),
    }))
    .filter(({ found }) => found.length > 0)
    .map(({ name, found }) => `${name}: ${found.map(({ why }) => why).join(', ')}`);

  assert.deepEqual(offenders, [],
    'a skill body names the host it is running on, which is the per-host fork NFR1 forbids');

  // The shared documents, on the same terms and for the stronger reason: they are what every body
  // reads, so a host named in them is a host named twenty-three times.
  assert.deepEqual(sweep(conventions(), HOST_NAME), []);
  assert.deepEqual(sweep(readFileSync(join(ROOT, 'shared', 'status-model.md'), 'utf8'), HOST_NAME), []);
});

test('control — a planted host name is reported, by skill [unit]', () => {
  // Without this the must-NOT above is an assertion rather than a verification: three patterns that
  // matched nothing would produce the same empty list.
  const planted = [
    { name: 'dpm-one', source: 'Under Claude Code the session is adopted differently.' },
    { name: 'dpm-two', source: 'OpenCode registers the skill from the package.' },
    { name: 'dpm-three', source: 'Write the marker to `.claude/state.md` first.' },
    { name: 'dpm-clean', source: 'The session row carries the phase, whatever is running it.' },
  ]
    .filter(({ source }) => sweep(source, HOST_NAME).length > 0)
    .map(({ name }) => name);

  assert.deepEqual(planted, ['dpm-one', 'dpm-two', 'dpm-three'],
    'the sweep missed a host it is written to catch, or fired on a host-neutral sentence');

  // And the subtraction the must-NOT applies is over something real: `dpm-ralph` fails this sweep
  // without it, which is why the exemption exists and why it is stated rather than assumed.
  assert.ok(sweep(skillSource(RECORDED_GAP.skill), HOST_NAME).length > 0,
    `${RECORDED_GAP.skill} no longer names the recorded gap, so the exemption is hiding nothing `
    + 'and should be removed along with the gap');
});
