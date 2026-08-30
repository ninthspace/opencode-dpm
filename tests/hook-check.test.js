/**
 * The absence of the pre-commit guard, reported by the one thing that runs in the repository.
 *
 * **Every case here is a silence or a sentence, and the silences are the hard half.** A check that
 * warned on everything would satisfy any assertion that a missing hook is reported, so each of the
 * four quiet cases — no repository, a linked worktree, a moved hooks directory, a hook that is
 * there — is asserted beside a control that turns it back into a sentence. Without the control the
 * silence is unattributable: a module that returned `null` unconditionally passes all four.
 *
 * **Nothing here reads the checkout the suite is running in.** The real `.git/hooks/` of whoever
 * runs this is guarded on a developer's machine and empty in CI, so a test that reached it would
 * assert on the environment. Every repository below is a temporary directory the test builds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { UNGUARDED, unguardedMessage } from '../src/server/hook-check.ts';
import { open } from '../src/server/index.ts';
import { ownedDirectory as scratch } from './support/scratch.js';

const ownedDirectory = (t) => scratch(t, 'dpm-hook-');

/**
 * A repository root with a `.dpm/` under it, and no pre-commit hook.
 *
 * Built by hand rather than by `git init`, because every state under test is a property of the
 * files' arrangement and `git init` supplies a `hooks/` full of samples that would have to be
 * cleared again. The one case that needs real git is not here: whether git skips an unresolvable
 * hook silently is git's behaviour, and the README is where that is recorded.
 */
function repository(t) {
  const root = ownedDirectory(t);

  mkdirSync(join(root, '.git', 'hooks'), { recursive: true });
  mkdirSync(join(root, '.dpm'), { recursive: true });

  return { root, database: join(root, '.dpm'), hook: join(root, '.git', 'hooks', 'pre-commit') };
}

// --- The case the check exists for ----------------------------------------------------------------

test('a repository with no pre-commit hook is reported, and one with a hook is not', (t) => {
  const { root, database, hook } = repository(t);

  const message = unguardedMessage(database);

  assert.match(message ?? '', new RegExp(UNGUARDED), `the absence went unreported: ${message}`);
  assert.ok(message.includes(root), `the report does not name the repository: ${message}`);
  assert.ok(message.includes(hook), `the report does not name the path to fix: ${message}`);

  // **The control, and it is what stops this being a function that returns a sentence.** Same
  // repository, same database directory — the only change is that a hook is now there.
  writeFileSync(hook, '#!/bin/sh\nexit 0\n', 'utf8');

  assert.equal(unguardedMessage(database), null, 'a repository with a hook was reported anyway');
});

test('a symlink to nothing is reported as one, because the fix is a different fix', (t) => {
  const { database, hook } = repository(t);

  symlinkSync('/nowhere/dpm/hooks/pre-commit', hook);

  const message = unguardedMessage(database);

  assert.match(message ?? '', /symlink to nothing/, `a dangling link read as absent: ${message}`);

  // The two wordings differ, which is the whole point of distinguishing them — a link to nothing
  // is re-made with `ln -sf`, and nothing at all is made with `ln -s`, and the README sends those
  // two readers to different lines.
  rmSync(hook);

  assert.match(unguardedMessage(database) ?? '', /is not there/,
    'absence and a dangling link produce the same sentence, so the distinction is not made');
});

// --- The silences, each with the control that makes it attributable --------------------------------

test('a database outside any repository is not reported, and the same directory inside one is', (t) => {
  const loose = ownedDirectory(t);

  mkdirSync(join(loose, '.dpm'), { recursive: true });

  assert.equal(unguardedMessage(join(loose, '.dpm')), null,
    'a directory in no repository was told it has no guard');

  // The control: the only thing that changes is that there is now something to guard.
  mkdirSync(join(loose, '.git', 'hooks'), { recursive: true });

  assert.match(unguardedMessage(join(loose, '.dpm')) ?? '', new RegExp(UNGUARDED),
    'a repository appeared above it and nothing was reported, so the check is inert');
});

test('a linked worktree is left alone, because its hooks are not in the .git beside it', (t) => {
  const root = ownedDirectory(t);

  mkdirSync(join(root, '.dpm'), { recursive: true });
  writeFileSync(join(root, '.git'), 'gitdir: /somewhere/else/.git/worktrees/one\n', 'utf8');

  assert.equal(unguardedMessage(join(root, '.dpm')), null,
    'a worktree was judged on a hooks directory it does not use');

  // The control, and it is the same file made into a directory: the check is looking at what
  // `.git` *is*, rather than declining on anything it finds hard.
  rmSync(join(root, '.git'));
  mkdirSync(join(root, '.git', 'hooks'), { recursive: true });

  assert.match(unguardedMessage(join(root, '.dpm')) ?? '', new RegExp(UNGUARDED),
    'an ordinary repository was treated as a worktree, so nothing is ever reported');
});

test('a moved hooks directory is left alone, because .git/hooks is then not where git looks', (t) => {
  const { root, database } = repository(t);
  const config = join(root, '.git', 'config');

  writeFileSync(config, '[core]\n\trepositoryformatversion = 0\n\thooksPath = .husky\n', 'utf8');

  assert.equal(unguardedMessage(database), null,
    'a repository whose hooks live elsewhere was judged on the directory git ignores');

  // The control: the same config without that one line. `hooksPath` is doing the work, not the
  // presence of a config file.
  writeFileSync(config, '[core]\n\trepositoryformatversion = 0\n', 'utf8');

  assert.match(unguardedMessage(database) ?? '', new RegExp(UNGUARDED),
    'any config file at all silenced the check');
});

test('a relative database directory is answered, because the default one is relative', (t) => {
  const { root } = repository(t);
  const cwd = process.cwd();

  t.after(() => process.chdir(cwd));
  process.chdir(root);

  // **This test's real subject is that the call returns.** The default location is
  // repository-relative, so `.dpm` is what arrives here in every ordinary session; the walk up
  // from a relative path never meets `parse().root`, and before it was resolved this hung for
  // ever — taking every integration test in the suite with it, since each one spawns a server
  // that opens a database by the default path.
  assert.match(unguardedMessage('.dpm') ?? '', new RegExp(UNGUARDED),
    'a relative directory did not find the repository it is inside');
});

// --- Reached from the open, on the same terms as the restore report --------------------------------

test('the open puts what the check says on stderr, and puts nothing there when it says nothing', (t) => {
  /** Everything `open` writes to stderr, since that is where the report has to land (49-01 NFR1). */
  function opening(location, checkHook) {
    const written = [];
    const real = process.stderr.write.bind(process.stderr);

    process.stderr.write = (chunk, ...rest) => {
      written.push(String(chunk));

      return real(chunk, ...rest);
    };

    try {
      open(location, { checkHook });
    } finally {
      process.stderr.write = real;
    }

    return written.join('');
  }

  const consulted = [];
  const directory = ownedDirectory(t);

  const reported = opening(join(directory, '.dpm', 'dpm.db'), (given) => {
    consulted.push(given);

    return 'nothing is guarding this';
  });

  assert.deepEqual(consulted, [join(directory, '.dpm')],
    'the check was not asked about the database directory, or was not asked at all');
  assert.match(reported, /nothing is guarding this/,
    'the check spoke and the open swallowed it, so the report can never reach a user');

  // **The other half, and it is what makes the line above mean "because the check said so".** Same
  // open, same kind of directory — the check returns `null`, and an ordinary session in a guarded
  // repository has to stay silent or the ones that are not guarded stop standing out.
  const quiet = opening(join(ownedDirectory(t), '.dpm', 'dpm.db'), () => null);

  assert.equal(quiet, '', `a check with nothing to say still produced output: ${quiet}`);
});
