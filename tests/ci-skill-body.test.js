/**
 * Epic 01-03 Story 4 — the prohibition is enforced by the build, and the enforcement can fail.
 *
 * - "A CI check fails the build when a skill body names `mcp__plugin_`, `/dpm:`,
 *   `CLAUDE_PLUGIN_ROOT` or `.claude/`" [integration]
 * - "A CI check fails the build when a skill body contains a SQL statement" [integration]
 * - "Introducing a Claude Code mechanism into a skill body makes the CI check fail" [integration,
 *   control]
 *
 * **The third criterion is why this file runs a process rather than calling a function.** A check
 * that is never seen to fail is a check nobody has evidence works, and the two most common ways for
 * one to be useless — every pattern silently stopping matching, and a non-zero result that never
 * reaches the exit code — are both invisible to an in-process assertion on the return value. So
 * each breach is planted in a tree of its own and the script is spawned against it, and what is
 * read is the exit status CI reads.
 *
 * **The trees are built rather than borrowed.** Running the check against the real corpus proves
 * only that today's corpus is clean; a planted breach has to go somewhere, and putting it in
 * `skills/` and taking it out again is how a repository ends up with a `/dpm:` reference nobody
 * meant to commit. `packageTree` gives each case its own root under `tmpdir`, cleaned up by the
 * test context.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageTree } from './support/package-tree.js';

const ROOT = join(import.meta.dirname, '..');
const CHECK = join(ROOT, 'scripts', 'skill-body-check.ts');

/** A body with nothing wrong with it, plus whatever line the case is about. */
const body = (name, extra = '') => `---
name: ${name}
description: A skill. Invoke with the skill tool, id "dpm-${name}".
---

# ${name.replace(/^./, (c) => c.toUpperCase())}

Call \`dpm_list_epic\` and report what comes back.
${extra}
`;

/**
 * A corpus large enough to clear the script's own floor, with one body carrying the planted line.
 *
 * The floor matters here as much as in the script: a tree of three skills would be refused for
 * being too small, and a case that failed for *that* reason would look exactly like a case that
 * caught its breach.
 */
function corpus(t, planted = '', conventions = '# Conventions\n\nRead this at startup.\n') {
  const skills = Object.fromEntries(
    Array.from({ length: 23 }, (_, index) => {
      const name = `skill${String(index).padStart(2, '0')}`;

      return [name, body(name, index === 7 ? planted : '')];
    }),
  );

  return packageTree(t, skills, { 'skill-conventions.md': conventions });
}

/** The script as CI runs it: a process, against one root, read by its exit status. */
const check = (root) => spawnSync(process.execPath, [CHECK, root], { encoding: 'utf8' });

// --- The control, first, because everything below depends on it ----------------------------------

test('a clean corpus passes, so a failure below is the breach and not the harness [integration]', (t) => {
  const result = check(corpus(t));

  assert.equal(result.status, 0,
    `a corpus with nothing wrong with it was refused:\n${result.stderr}`);
  assert.match(result.stdout, /name no host mechanism and no SQL/);
});

test('a tree too small to be the corpus is refused rather than reported clean [integration]', (t) => {
  // **An empty corpus trips no pattern.** Without this floor the check's happiest output — no
  // problems found — is also what it prints when it read nothing at all, and a `skills/` that
  // moved would pass the build silently.
  const root = packageTree(t, { alone: body('alone') }, { 'skill-conventions.md': '# Conventions\n' });
  const result = check(root);

  assert.equal(result.status, 1, 'a two-file tree was accepted as the corpus');
  assert.match(result.stderr, /almost nothing was checked/);
});

// --- Criterion 1 and 3: each host mechanism, planted, fails the build -----------------------------

test('each Claude Code mechanism planted in a body fails the check [integration]', (t) => {
  // Every pattern gets its own case rather than one body carrying all five, so a pattern that
  // stopped matching is named by its own failure instead of hidden behind its neighbours.
  const breaches = [
    ['the MCP prefix', 'Call `mcp__plugin_dpm_dpm__list_epic` with `ready: true`.', /MCP tool-dispatch prefix/],
    ['the slash command', 'Then hand off to `/dpm:architect`.', /slash-command invocation/],
    ['the plugin root', 'Read `${CLAUDE_PLUGIN_ROOT}/shared/skill-conventions.md`.', /plugin-root variable/],
    ['the harness directory', 'The progress file is `.claude/dpm-progress.local.md`.', /harness directory/],
    ['the argument substitution', '`$ARGUMENTS` is the change description.', /argument substitution/],
  ];

  for (const [what, planted, reported] of breaches) {
    const result = check(corpus(t, planted));

    assert.equal(result.status, 1, `${what} did not fail the check:\n${result.stdout}`);
    assert.match(result.stderr, reported, `${what} failed the check without saying what it found`);

    // The failure names the file, which is the difference between a check somebody can act on and
    // a check that reports a corpus is wrong somewhere.
    assert.match(result.stderr, /skill07[/\\]SKILL\.md/,
      `${what} was reported without naming the body it is in`);
  }
});

test('a mechanism in the shared file fails too, though no body carries one [integration]', (t) => {
  // Every skill reads that file at startup, so a mechanism moved into it reaches all twenty-three
  // while leaving each body clean — the shape a per-body sweep passes and this one must not.
  const result = check(corpus(t, '', '# Conventions\n\nRun `/dpm:status` when unsure.\n'));

  assert.equal(result.status, 1, 'a mechanism in the shared conventions passed the check');
  assert.match(result.stderr, /shared[/\\]skill-conventions\.md/);
});

// --- Criterion 2: SQL ----------------------------------------------------------------------------

test('a SQL statement planted in a body fails the check [integration]', (t) => {
  const statements = [
    'SELECT id FROM story WHERE epic_id = ?',
    'INSERT INTO coverage (id, requirement_id) VALUES (?, ?)',
    'UPDATE story SET status = ?',
    'DELETE FROM dependency WHERE id = ?',
    'Run `sqlite3 .dpm/dpm.db` to read it directly.',
  ];

  for (const statement of statements) {
    const result = check(corpus(t, statement));

    assert.equal(result.status, 1, `this passed the check: ${statement}`);
    assert.match(result.stderr, /reaches past the tool boundary/,
      `${statement} failed for some reason other than being SQL`);
  }
});

// --- The wiring: the step exists, and runs the same command a contributor runs -------------------

test('CI runs the check as a named step, by the script package.json declares [integration]', () => {
  const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

  // **The command, not merely a step.** A workflow that inlined `node scripts/skill-body-check.ts`
  // would run something a contributor cannot run the same way, which is the drift the existing
  // three steps are written to avoid.
  assert.equal(manifest.scripts.skills, 'node scripts/skill-body-check.ts');
  assert.match(workflow, /run: npm run skills/,
    'the workflow does not run the skill-body check');

  // And it is in the ordinary job beside the other three, rather than in the isolated one — which
  // builds containers and is the wrong place for a check that reads two directories.
  const checks = workflow.slice(workflow.indexOf('  checks:'), workflow.indexOf('  isolated:'));

  assert.match(checks, /npm run skills/, 'the check is not in the job that runs on every push');
  for (const command of ['npm test', 'npm run typecheck', 'npm run modules']) {
    assert.match(checks, new RegExp(`run: ${command.replaceAll(' ', '\\s')}`),
      `${command} left the checks job, so this reading is no longer about the right one`);
  }
});
