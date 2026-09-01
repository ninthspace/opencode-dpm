/**
 * Epic 01-04 Story 4 — the README as a v2 document (FR12).
 *
 * Three of the story's four criteria are checkable and one is not. Whether the rewrite reads
 * *well* for an `opencode2` audience is editorial and tagged `manual`; what a test can hold is
 * that the commands work, that the beta statement is present, and that the CPM guide is gone.
 *
 * **"Every command the README gives runs as written" is enumerated, never asserted.** A test that
 * ran the commands it happened to recognise would report a clean README while ignoring the block
 * added last week, and the shape of that failure is a sweep that passes because it examined
 * nothing. So every fenced block is matched against a rule below, an unmatched block is a failure,
 * and a rule matching nothing is a failure too — the second because a rewrite that removed a
 * command would otherwise leave a rule quietly guarding an empty set.
 *
 * **A command that cannot be run says so, by name, with the reason.** `opencode2 plugin add`
 * reaches the network and rewrites the reader's configuration; the three `bin/` invocations are
 * exercised against real trees by `first-run.test.js`, `import.test.js` and `merge.test.js`, and
 * running them again here would be running someone else's test badly. Those are recorded as
 * dispositions rather than skipped, so the set of commands nothing executes is visible rather than
 * implied.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { initRepository } from './support/git.js';
import { CLONE_PLACEHOLDER, DOCUMENTED_CLONE, follow } from './support/dpm-clone.js';
import { ownedDirectory } from './support/scratch.js';
import { COMMANDS } from '../src/guard/index.ts';

const ROOT = join(import.meta.dirname, '..');
const README = readFileSync(join(ROOT, 'README.md'), 'utf8');

/** The placeholder the README uses for the checkout DPM is loaded from. */
const PLACEHOLDER = CLONE_PLACEHOLDER;

/** Every fenced block, with the language it declares. */
const blocks = (source = README) => [...source.matchAll(/```(\w*)\n([\s\S]*?)```/g)]
  .map(([, language, body]) => ({ language, body }));

/** The CPM directories the corpus move names, so block 17 has something to move. */
const CPM_DIRECTORIES = [
  'plans', 'briefs', 'specifications', 'epics', 'retros', 'quick',
  'discussions', 'communications', 'reviews', 'audits', 'runbooks', 'library',
];

/**
 * How each block is treated, in order — first match wins.
 *
 * `run` is the default and the point; `why` is required wherever it is false, so declining to run
 * a command is a sentence somebody wrote rather than a gap. `prepare` records the state the README
 * gives the command *in*: `git config --unset core.hooksPath` is offered to a reader who has one
 * set, and a wrapper that moves the incumbent hook aside needs an incumbent.
 */
const RULES = [
  {
    what: 'the clone command',
    matches: ({ body }) => body.startsWith('git clone '),
    run: false,
    why: 'it reaches the network and would write a second checkout of this repository',
    check: (body) => {
      // What is checkable without running it: it clones *this* repository, and it clones it to the
      // path every link instruction and the permission entry then name.
      assert.match(body.trim(), /^git clone https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git \S+$/,
        `the install command is not a clone of a github repository: ${body.trim()}`);
      assert.ok(body.includes(`/${JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name}.git`),
        'the clone command does not name the repository this package is published from');
      assert.ok(body.trim().endsWith(DOCUMENTED_CLONE),
        `the clone lands somewhere the rest of the README does not name: ${body.trim()}`);
    },
  },
  {
    what: 'a configuration block',
    matches: ({ language }) => language === 'json',
    run: false,
    why: 'it is a file to edit rather than a command to run',
    check: (body) => {
      const parsed = JSON.parse(body);

      assert.ok(Object.keys(parsed).length > 0, `a documented JSON block is empty: ${body}`);
    },
  },
  {
    what: 'the pre-commit framework entry',
    matches: ({ language }) => language === 'yaml',
    run: false,
    why: 'it is a file to edit rather than a command to run',
    check: (body) => {
      assert.ok(body.includes(`${PLACEHOLDER}/hooks/pre-commit`),
        'the framework entry does not name the shipped hook');
      assert.equal(existsSync(join(ROOT, 'hooks', 'pre-commit')), true,
        'the hook the framework entry names is not in this package');
    },
  },
  {
    what: 'a guard fix naming one of the executables',
    matches: ({ body }) => body.startsWith('node '),
    run: false,
    why: 'publishing, importing and merging are driven against real trees by first-run.test.js, '
      + 'import.test.js and merge.test.js',
    check: (body) => {
      const relative = body.trim().replace(`node ${PLACEHOLDER}/`, '');

      assert.ok(Object.values(COMMANDS).includes(relative),
        `the README names ${relative}, which is not one of the guard's own COMMANDS`);
      assert.equal(existsSync(join(ROOT, relative)), true, `${relative} is not in this package`);
    },
  },
  {
    what: 'the wrapper that keeps an incumbent hook',
    matches: ({ body }) => body.includes('pre-commit.local'),
    substitute: (body) => body.replaceAll(PLACEHOLDER, ROOT),
    prepare: (project) => {
      writeFileSync(join(project, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    },
  },
  {
    what: 'the two shell functions',
    matches: ({ body }) => body.includes('dpm-link()'),
    // Defining a function exits zero whatever is inside it, so the block is followed by the call a
    // reader would make. Without that this rule would assert that a function body parses.
    substitute: (body) => `${body}\ndpm-link\ndpm-relink\n`,
    // **`sh` rejects these before running a line of them.** POSIX allows only alphanumerics and
    // underscore in a function name, so a hyphen is a syntax error there — `dash` and `sh` refuse
    // it, `bash` and `zsh` accept it. This block is addressed to a reader's `.bashrc` or `.zshrc`,
    // which the README now says, so it is run under the shell it is written for. Running it under
    // `sh` would fail it for not being a language it was never written in.
    shell: 'bash',
  },
  {
    what: 'the hooksPath fix',
    matches: ({ body }) => body.includes('--unset core.hooksPath'),
    prepare: (project) => {
      execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: project });
    },
  },
  {
    what: 'the CPM corpus move',
    matches: ({ body }) => body.includes('git mv docs/'),
    prepare: (project) => {
      for (const directory of CPM_DIRECTORIES) {
        mkdirSync(join(project, 'docs', directory), { recursive: true });
        writeFileSync(join(project, 'docs', directory, '01-a-document.md'), '# CPM wrote this\n');
      }

      execFileSync('git', ['add', '-A'], { cwd: project });
      execFileSync('git', ['commit', '-m', 'a CPM corpus'], { cwd: project });
    },
  },
  {
    what: 'the install-and-check block',
    matches: ({ body }) => body.trimEnd().endsWith('git config core.hooksPath'),
    // **`git config <key>` exits 1 when the key is unset, and unset is the answer step 1 wants.**
    // Treating that as a failed command would fail the README for documenting a check whose good
    // outcome is silence — so the status is declared here with its reason rather than absorbed.
    exits: [0, 1],
    why: 'it ends on a query whose empty result is the outcome the reader is looking for',
  },
  {
    what: 'a shell command run as written',
    matches: ({ language }) => language === 'sh',
  },
];

/** Statuses a block may exit with. Zero unless its rule says otherwise, and it must say why. */
const accepted = (rule) => rule.exits ?? [0];

/** The rule that governs a block, and the failure when none does. */
const ruleFor = (block) => RULES.find((rule) => rule.matches(block));

/** A fresh git repository, as a reader following *First run* would have. */
function project(t) {
  const root = ownedDirectory(t, 'dpm-readme-project-');

  initRepository(root);

  return root;
}

// --- Criterion 2: every command the README gives runs as written -----------------------------

test('every fenced block in the README is accounted for by a rule [unit]', () => {
  const found = blocks();

  // **The floor.** Every loop below is satisfied by an empty README, and the regex reads prose this
  // epic spent five stories rewriting.
  assert.ok(found.length > 10, `the reading found ${found.length} fenced blocks, which is not this README`);

  const unmatched = found.filter((block) => ruleFor(block) === undefined)
    .map(({ body }) => body.split('\n')[0]);

  assert.deepEqual(unmatched, [],
    'the README gives a command block this file neither runs nor accounts for — add a rule, and '
    + 'if it cannot be run, say why');

  // And the other direction, which is what stops a rule outliving the command it was written for.
  const idle = RULES.filter((rule) => !found.some((block) => ruleFor(block) === rule)).map(({ what }) => what);

  assert.deepEqual(idle, [], 'a rule matches no block, so it is guarding a command that has gone');

  // Every rule that declines to run — or accepts a non-zero exit — says why, and the ones that do
  // not run are named rather than counted, so the set of documented commands nothing executes is
  // readable from the failure rather than inferred from its absence.
  for (const rule of RULES) {
    if (rule.run === false) assert.ok(rule.why, `${rule.what} declines to run without a reason`);
    if (rule.exits) assert.ok(rule.why, `${rule.what} accepts a non-zero exit without a reason`);

    // **A block this file runs under something other than `sh` is a block the README has to
    // place.** A reader who pastes non-POSIX syntax into a POSIX shell gets a syntax error and no
    // explanation, and a rule that quietly switched shells to make a block pass would have hidden
    // exactly that — so the shell the block needs has to be named where the reader is.
    if (rule.shell) {
      assert.match(README, new RegExp(`\\b${rule.shell}\\b`),
        `${rule.what} is run under ${rule.shell}, and the README never tells the reader that`);
    }
  }

  assert.deepEqual(RULES.filter((rule) => rule.run === false).map(({ what }) => what), [
    'the clone command',
    'a configuration block',
    'the pre-commit framework entry',
    'a guard fix naming one of the executables',
  ], 'the set of documented commands nothing runs has changed');
});

test('every runnable command the README gives succeeds in a fresh project [integration]', (t) => {
  const runnable = blocks().filter((block) => ruleFor(block).run !== false);

  assert.ok(runnable.length >= 6, `only ${runnable.length} runnable blocks — the reading found little`);

  for (const block of runnable) {
    const rule = ruleFor(block);
    const root = project(t);
    const command = rule.substitute ? rule.substitute(block.body) : block.body;

    rule.prepare?.(root);

    // `execFileSync` throws on a non-zero exit, so the status is read off the error rather than
    // from a flag — and compared against what the rule says this block may exit with.
    let status = 0;
    let output = '';

    try {
      // `into` is this checkout, which is what the documented clone path stands for: a DPM tree
      // with a `hooks/pre-commit` in it. A test linking at the author's actual home directory
      // would be reading that machine rather than the instruction.
      follow(command, { cwd: root, into: ROOT, shell: rule.shell });
    } catch (error) {
      status = error.status ?? -1;
      output = String(error.stderr ?? error.message);
    }

    assert.ok(accepted(rule).includes(status),
      `a documented command exited ${status} (${rule.what}):\n${command}\n${output}`);
  }
});

test('a documented command that stopped working is reported [integration]', (t) => {
  // **The control on the runner**, and the reason the test above is an observation rather than a
  // loop that cannot fail. `follow` has to surface a non-zero exit, or every command "passes".
  const root = project(t);

  assert.throws(() => follow('ls /a/path/that/is/not/there', { cwd: root, into: ROOT }));

  // And the fixture is a fixture: a fresh project is a git repository with hooks to install into.
  assert.equal(existsSync(join(root, '.git', 'hooks')), true, 'the fresh project has no .git/hooks');
});

test('the blocks that are checked rather than run hold up [unit]', () => {
  const checked = blocks().filter((block) => ruleFor(block).check !== undefined);

  assert.ok(checked.length >= 5, `only ${checked.length} blocks are checked rather than run`);

  for (const block of checked) ruleFor(block).check(block.body);
});

// --- Criterion 3: the beta statement ----------------------------------------------------------

test('the README names the host it is written against and warns that it moves [unit]', () => {
  // **The criterion was written when the host was a beta and the warning was about that.** Epic
  // 02-01 retargeted the plugin at OpenCode v1, which is not a beta — so what survives is the half
  // that was load-bearing: the plugin API is one the host is free to change, and a reader whose
  // commands stop matching should suspect the host before suspecting DPM.
  //
  // Blockquote markers come out with the line breaks: the statement is inside a `>` callout, and a
  // collapse that kept the `>` would read "Entrypoints may > move" and match nothing. Assertions
  // about a sentence have to be made about the sentence.
  const collapsed = README.replace(/^\s*>\s?/gm, '').replace(/\s+/g, ' ');

  assert.match(collapsed, /OpenCode v1/, 'the README does not name the host it is written against');
  assert.match(collapsed, /[Ee]ntrypoints may move/,
    'the README does not warn that entrypoints may move under it');

  // **Both in one place, not two facts a reader has to join.** A host notice somewhere near the
  // top and a moving-target warning three hundred lines later is two statements; what the
  // criterion asks for is one, so both have to sit in the same callout.
  //
  // **The callout is taken as a blockquote rather than matched from the first "OpenCode v1".** The
  // TL;DR and *Requirements* both name the host, on purpose — a reader who stops at the summary
  // should still know — and a search anchored on the phrase finds one of those, reports the
  // warning missing from it, and is right about the wrong paragraph. So the run of `>` lines is
  // what is read, and the assertion that there is exactly one of them keeps that unambiguous.
  const callouts = [...README.matchAll(/(?:^>.*\n)+/gm)]
    .map(([block]) => block.replace(/^>\s?/gm, '').replace(/\s+/g, ' ').trim());

  assert.equal(callouts.length, 1,
    `the README has ${callouts.length} blockquotes, and this reading expects the host callout alone`);
  assert.match(callouts[0], /still free to change/,
    'the README\'s callout is not the statement about the host moving');
  assert.match(callouts[0], /[Ee]ntrypoints may move/,
    'the host statement and the warning that entrypoints may move are in different places');
});

// --- Criterion 4: the CPM guide is gone -------------------------------------------------------

test('must NOT — the repository contains a CPM MIGRATION.md [unit]', () => {
  assert.equal(existsSync(join(ROOT, 'MIGRATION.md')), false,
    'MIGRATION.md is back; the CPM migration happens under Claude Code, and a second copy here is '
    + 'a second thing to keep current');

  // **The control.** `existsSync` returning false is also what a wrong path returns, so the reading
  // has to be shown to find a file that is there.
  assert.equal(existsSync(join(ROOT, 'README.md')), true, 'the reading cannot find README.md either');

  // And nothing still sends a reader to it. A dead link in the one document that replaced it would
  // be the same failure wearing a different shape.
  assert.doesNotMatch(README, /\]\(MIGRATION\.md\)/, 'the README still links to MIGRATION.md');
});
