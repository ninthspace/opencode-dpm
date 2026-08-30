/**
 * A throwaway repository with two branches that both allocated the same number.
 *
 * Epic 47-04 Story 4 tags three of its five criteria `[feature]`, and the subject of two of them is
 * the conflict itself — that git leaves `.dpm/dpm.sql` conflicted, and that the tool resolves it.
 * Neither is assertable against a simulated conflict: a fabricated three-way input proves the merge
 * function works and says nothing about whether git ever produces that input. So the fixture runs
 * real `git`, in a temp directory it removes afterwards.
 *
 * **The staging commands here are the fixture's, not the project's.** CPM's rule that version
 * control stays with the user is about the repository the work is happening in; this one is created
 * by the test, lives under `os.tmpdir()`, and is deleted when the test ends.
 *
 * **Nothing here writes an ignore file.** It used to write one at the root, transcribing what the
 * README told a user to type; the server now writes `.dpm/.gitignore` itself (FR4, AD15) and the
 * README no longer names the step. Nothing needs ignoring in this fixture either way — every
 * database it opens is `:memory:`, so no `dpm.db` is ever on disk to be staged.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openConnection } from '../../src/db/connection.ts';
import { dump } from '../../src/dump/index.ts';
import { project } from '../../src/projection/index.ts';
import { restore } from '../../src/restore/index.ts';
import { applySchema } from '../../src/schema/index.ts';
import { applyVocabulary } from '../../src/schema/seeds/index.ts';
import { spineTools } from '../../src/tools/index.ts';

/** The committed text form of the database — the file every branch here conflicts on. */
export const DUMP = '.dpm/dpm.sql';

/**
 * `git check-ignore -v` against `root`, as a verdict *and* its provenance.
 *
 * Exit 0 means ignored and 1 means not — and the `-v` line names the file and the pattern that
 * decided it. Reading that back is the whole value: without it, a machine-level `core.excludesFile`
 * on whoever is running the suite passes every positive ignore assertion for the wrong reason, and
 * the suite is green on a project that would commit its database.
 *
 * `spawnSync` rather than `execFileSync` because exit 1 is an *answer* here, not a failure.
 *
 * @param {string} root A git repository.
 * @returns {(path: string) => {ignored: boolean, source: string}}
 */
export function ignoreCheck(root) {
  return (path) => {
    const { status, stdout } = spawnSync('git', ['check-ignore', '-v', path],
      { cwd: root, encoding: 'utf8' });

    return { ignored: status === 0, source: stdout.trim() };
  };
}

/** The tool surface, by name. The spine is written through it and never by statement. */
export const surface = (db) => Object.fromEntries(spineTools(db).map((tool) => [tool.name, tool.handler]));

/**
 * An empty repository at `root`, and a `git` bound to it.
 *
 * Identity is set on the repository rather than read from the machine, so every fixture here works
 * on a checkout with no global git config — and produces the same commits on every one. This is the
 * only part three otherwise-unlike fixtures share; what each does *next* is what makes it its own.
 *
 * @param {string} root An existing directory.
 * @returns {(...args: string[]) => string}
 */
export function initRepository(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });

  git('init', '--quiet', '--initial-branch', 'main');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Fixture');

  return git;
}

/**
 * A repository with `.dpm/dpm.sql` and a projection committed on its default branch.
 *
 * Identity is set on the repository rather than read from the machine, so the fixture works on a
 * checkout with no global git config — and produces the same commits on every one.
 *
 * @param {import('node:test').TestContext} t
 * @returns {{root: string, git: (...args: string[]) => string,
 *   write: (change: (db: object, call: object) => unknown) => unknown}}
 */
export function gitRepository(t) {
  const root = mkdtempSync(join(tmpdir(), 'dpm-merge-'));

  t.after(() => rmSync(root, { recursive: true, force: true }));

  const git = initRepository(root);

  mkdirSync(join(root, '.dpm'), { recursive: true });

  /**
   * Apply `change` to the committed database and rewrite both generated artefacts.
   *
   * The database is rebuilt from the dump on every call rather than kept open across them, because
   * that is what a branch does: the working tree carries the text, and whoever picks it up restores
   * it. A fixture holding one long-lived connection would never exercise the round trip the merge
   * depends on.
   */
  const write = (change) => {
    const db = openConnection(':memory:');

    try {
      const existing = readFileSync(join(root, DUMP), 'utf8');

      restore(db, existing);
      const made = change(db, surface(db));

      writeFileSync(join(root, DUMP), dump(db).sql, 'utf8');
      project(db, { root });

      return made;
    } finally {
      db.close();
    }
  };

  // The first dump is written from an empty schema, so `write()` has something to restore.
  const seed = applySchema(openConnection(':memory:'));

  try {
    applyVocabulary(seed);
    writeFileSync(join(root, DUMP), dump(seed).sql, 'utf8');
  } finally {
    seed.close();
  }

  git('add', '-A');
  git('commit', '--quiet', '-m', 'The empty database');

  return { root, git, write };
}

/**
 * Two branches, each adding one spec, merged with `git merge`.
 *
 * Returns before resolving anything: the working tree is left exactly as git left it, which is the
 * state `dpm merge` is written to be run in.
 *
 * @param {ReturnType<typeof gitRepository>} repo
 * @param {object} branches
 * @param {(db: object, call: object) => unknown} branches.ours
 * @param {(db: object, call: object) => unknown} branches.theirs
 * @returns {{ours: unknown, theirs: unknown, conflicted: boolean, output: string}}
 */
export function twoBranches(repo, { ours, theirs }) {
  const { git, write } = repo;

  git('checkout', '--quiet', '-b', 'theirs');
  const made = { theirs: write(theirs) };
  git('add', '-A');
  git('commit', '--quiet', '-m', 'Their artefact');

  git('checkout', '--quiet', 'main');
  made.ours = write(ours);
  git('add', '-A');
  git('commit', '--quiet', '-m', 'Our artefact');

  let output = '';
  let conflicted = false;

  try {
    output = git('merge', '--no-edit', 'theirs');
  } catch (error) {
    // A conflicting merge exits 1 and writes its report to stdout. That is the expected path here,
    // so it is captured rather than raised — and `conflicted` is returned so a test asserts the
    // conflict happened instead of inferring it from the tool's later success.
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    conflicted = true;
  }

  return { ...made, conflicted, output };
}
