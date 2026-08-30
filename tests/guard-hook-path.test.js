/**
 * Epic 01-04 Story 1 — the guard at OpenCode's hook path (FR6, ENVR6, ENVR10).
 *
 * The guard itself is unchanged in kind and four earlier files already hold it to that: it
 * regenerates, compares bytes, repairs nothing and names a fix. What the port changes is thinner
 * and easier to miss — the sentence it ends on named a Claude Code slash command, and nothing in
 * `src/` was ever swept for those the way `skills/` now is.
 *
 * **So this file is about the two ends of the guard rather than its middle.** At one end, the
 * environment: git new enough to have hooks, and a hook at the path git actually invokes, driven
 * by a real commit in a temporary repository rather than by calling the executable directly —
 * which is how the hook's own `$0` bug survived a suite that tested the guard thoroughly. At the
 * other, the output: four refusals that have to stay four, and none of them naming a mechanism the
 * host no longer has.
 *
 * **Every absence here has a control**, per retro 01. A repository that commits without a guard is
 * asserted beside the one that refuses; the host-mechanism sweep is run against a planted breach;
 * the four explanations are compared to each other rather than each to a string, because four
 * assertions that each pass against one constant is the shape that reports a distinguishable
 * refusal for a guard that has stopped distinguishing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { committer } from './support/commit.js';
import { initRepository } from './support/git.js';
import { ownedDirectory } from './support/scratch.js';
import { sweep } from './support/skills.js';
import { stderrDuring } from './support/stderr.js';
import { HOST_MECHANISM } from '../scripts/skill-body-check.ts';
import { UNGUARDED } from '../src/server/hook-check.ts';
import { open } from '../src/server/index.ts';
import {
  describe, DIVERGENCE, DUMP_PATH, IMPORT_COMMAND, MERGE_COMMAND, PUBLISH_COMMAND,
  PUBLISH_INVOCATION, PUBLISH_SKILL,
} from '../src/guard/index.ts';
import { VERDICT } from '../src/sync/verdict.ts';

const ROOT = join(import.meta.dirname, '..');
const HOOK = join(ROOT, 'hooks', 'pre-commit');

// --- ENVR6: git is new enough to have the mechanism the whole story rests on ----------------------

/**
 * `git --version`'s numbers, as `[major, minor]`.
 *
 * Parsed rather than string-compared, because `2.39.5` sorts below `2.9.0` as text and the
 * comparison that matters is the one a reader would do by hand.
 */
function gitVersion(reported) {
  const [, major, minor] = reported.match(/(\d+)\.(\d+)/) ?? [];

  return [Number(major), Number(minor)];
}

/** Whether `[major, minor]` is at or above ENVR6's floor. */
const meetsFloor = ([major, minor]) => major > 2 || (major === 2 && minor >= 9);

test('git reports 2.9 or above, which is the release that made hooks reliable [integration]', () => {
  const reported = execFileSync('git', ['--version'], { encoding: 'utf8' });
  const version = gitVersion(reported);

  assert.ok(Number.isFinite(version[0]) && Number.isFinite(version[1]),
    `git did not report a version this could read: ${reported.trim()}`);
  assert.ok(meetsFloor(version),
    `ENVR6 asks for git 2.9 or above and this machine has ${reported.trim()}`);

  // **The control, and without it the assertion above is a claim about `meetsFloor` returning
  // true.** A comparison that always passed would satisfy the line above on every machine and
  // report an environment nobody checked.
  assert.equal(meetsFloor(gitVersion('git version 2.8.6')), false);
  assert.equal(meetsFloor(gitVersion('git version 1.9.0')), false);
  assert.equal(meetsFloor(gitVersion('git version 2.39.5 (Apple Git-154)')), true);
  assert.equal(meetsFloor(gitVersion('git version 3.0.0')), true);
});

// --- ENVR6 and ENVR10: the hook installs where git looks, and fires ------------------------------

/**
 * A git repository with a file to commit, and optionally dpm's hook linked into it.
 *
 * **Linked to this checkout's `hooks/pre-commit`, absolute**, which is the form the README gives
 * and the form the hook's own comment explains: a symlink resolves its target from the directory
 * holding the link, so a relative one lands two levels below the repository root and git skips a
 * hook it cannot resolve without saying so.
 */
function repository(t, { guarded }) {
  const root = ownedDirectory(t, 'dpm-hook-path-');
  const git = initRepository(root);

  if (guarded) symlinkSync(HOOK, join(root, '.git', 'hooks', 'pre-commit'));

  writeFileSync(join(root, 'a-file.txt'), 'something to commit\n', 'utf8');

  return { root, git };
}

test('a hook at .git/hooks/pre-commit fires on commit, and its absence is silent [integration]', (t) => {
  // **The guarded half is asserted by `committer`**, which refuses to report an outcome the guard
  // never produced: a commit whose combined output carries no `dpm:` line is a fixture failure
  // rather than a pass. That is the whole of ENVR6's second limb — the hook at that path ran.
  const guarded = repository(t, { guarded: true });
  const commit = committer(guarded.root);
  const refused = commit('A tree with no database in it');

  assert.equal(refused.ok, false, `the guard approved a repository with no database:\n${refused.output}`);
  assert.match(refused.output, /there is no database there/,
    `the hook ran and reported something else:\n${refused.output}`);

  // **The control, and it is the case the whole check exists to tell apart.** git skips a hook that
  // is not there without a warning and without failing the commit, so an unguarded repository and a
  // guarded one are indistinguishable from the exit code alone. Committing the same tree with no
  // hook has to succeed, or the refusal above is attributable to something other than the hook.
  const bare = repository(t, { guarded: false });

  execFileSync('git', ['add', '-A'], { cwd: bare.root, encoding: 'utf8' });
  const accepted = execFileSync('git', ['commit', '--quiet', '-m', 'The same tree, unguarded'],
    { cwd: bare.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  assert.doesNotMatch(String(accepted), /^dpm: /m,
    'a repository with no hook produced the guard report, so the refusal above was not the hook');
});

// --- FR6: the missing-symlink warning, through the real check ------------------------------------

/** Everything `open` writes to stderr, which is where a report has to land (49-01 NFR1). */
const opening = (location) => stderrDuring(() => open(location));

test('starting the server in a repository with no hook warns, and in a guarded one does not [integration]', (t) => {
  // **`hook-check.test.js` drives `open` with the check injected, and that is a different claim.**
  // It establishes that whatever the check says reaches stderr. This establishes that the real
  // check, reached the way a session reaches it, says something — which is the composition the
  // criterion names and the one an injected double cannot show.
  const unguarded = ownedDirectory(t, 'dpm-unguarded-');

  mkdirSync(join(unguarded, '.git', 'hooks'), { recursive: true });

  const reported = opening(join(unguarded, '.dpm', 'dpm.db'));

  assert.match(reported, new RegExp(UNGUARDED),
    `an unguarded repository was opened without a word about it:\n${reported}`);
  assert.match(reported, /is not there/, 'the report does not distinguish absent from dangling');

  // The control: the same open, the same real check, a repository that *is* guarded. Without it the
  // line above is satisfied by a check that warns unconditionally — and a warning every session is
  // one a reader learns to skip, taking the true ones with it.
  const guarded = ownedDirectory(t, 'dpm-guarded-');

  mkdirSync(join(guarded, '.git', 'hooks'), { recursive: true });
  symlinkSync(HOOK, join(guarded, '.git', 'hooks', 'pre-commit'));

  const quiet = opening(join(guarded, '.dpm', 'dpm.db'));

  assert.doesNotMatch(quiet, new RegExp(UNGUARDED),
    `a guarded repository was reported as unguarded:\n${quiet}`);
});

// --- FR6: four refusals, and they have to stay four ----------------------------------------------

/** One divergence report at a given verdict. The message is the subject; the verdict is an input. */
const report = (state) => describe({
  diverged: [{ path: 'docs/specs/01-spec.md', reason: DIVERGENCE.differs }],
  checked: { files: 1, dump: DUMP_PATH },
  verdict: state,
});

/** The four states a refused commit can be in, in the order the guard's `fix` handles them. */
const REFUSALS = [
  ['the dump moved', VERDICT.dumpMoved],
  ['both moved', VERDICT.bothMoved],
  ['neither, with no sync point', VERDICT.unknown],
  ['the database moved', VERDICT.databaseMoved],
];

test('each of the four refusals explains itself differently from the other three [integration]', () => {
  const explanations = REFUSALS.map(([, state]) => report(state));

  // **Compared to each other rather than each to a string.** Four assertions that a message
  // contains the right words all pass against a `fix` that returned one constant — which is exactly
  // what "distinguishable from the other three" is written to rule out.
  const distinct = new Set(explanations);

  assert.equal(distinct.size, REFUSALS.length,
    `two refusals produced the same explanation:\n${explanations.join('\n---\n')}`);

  // And each names the fix that belongs to it and not the ones that would discard the other side.
  // Written as the full command set per state, so a message that quietly gained a second fix fails
  // here rather than passing a containment check.
  const named = (text) => [
    ...(text.includes(PUBLISH_COMMAND) ? ['publish'] : []),
    ...(text.includes(IMPORT_COMMAND) ? ['import'] : []),
    ...(text.includes(MERGE_COMMAND) ? ['merge'] : []),
  ];

  assert.deepEqual(explanations.map(named), [
    ['import'],
    ['merge'],
    ['publish', 'import'],
    ['publish'],
  ], 'a refusal named a fix that belongs to a different state');

  // The skill goes with publish and only with publish — a reader inside a session gets the gated
  // route to the same operation, and never to one that would discard what a pull brought.
  //
  // **Matched on the phrase and not on the id**, which this assertion is the reason for: `dpm-publish`
  // is a substring of `bin/dpm-publish.ts`, so the bare id is present in every refusal that names
  // the binary and the unknown case reported the skill it does not offer.
  assert.deepEqual(explanations.map((text) => text.includes(PUBLISH_INVOCATION)),
    [false, false, false, true]);
  assert.ok(PUBLISH_INVOCATION.includes(PUBLISH_SKILL),
    'the phrase stopped naming the id, so the assertion above is about some other sentence');

  // Every one of them is still a diagnostic rather than an instruction, which is the property the
  // four have in common and the one a rewrite of any single branch could drop.
  for (const [what, state] of REFUSALS) {
    assert.match(report(state), /Nothing was written/, `${what} stopped saying nothing was written`);
    assert.match(report(state), /is not an input/, `${what} stopped saying why the edit was left`);
  }
});

// --- The port's own property: no refusal names a host mechanism ----------------------------------

test('no refusal the guard writes names a Claude Code mechanism [integration]', () => {
  // **The same patterns CI sweeps `skills/` with, imported rather than restated.** The guard is
  // the one place in `src/` that writes prose a user acts on, and it carried `/dpm:publish` through
  // three epics of the port — a slash command v2 does not mint, printed at the moment a reader is
  // most likely to type what they are told.
  for (const [what, state] of REFUSALS) {
    assert.deepEqual(sweep(report(state), HOST_MECHANISM), [],
      `the ${what} refusal names a mechanism the host no longer has`);
  }

  // The clean line too, which is the output of every accepted commit and so the one most read.
  assert.deepEqual(
    sweep(describe({ diverged: [], checked: { files: 12, dump: DUMP_PATH }, verdict: VERDICT.clean }),
      HOST_MECHANISM),
    [],
  );

  // **The control**: the same reading, over the sentence this story replaced. Without it a sweep
  // whose patterns had all stopped matching reports a clean guard in the voice of a real one.
  assert.deepEqual(
    sweep('or run /dpm:publish if you are already in a session.', HOST_MECHANISM),
    ['a /dpm: slash-command invocation — "or run /dpm:publish if you are already in a session."'],
  );
});
