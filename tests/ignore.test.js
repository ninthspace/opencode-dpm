/**
 * Epic 49-01 Story 4 — the generated database is ignored without the user doing anything (FR4,
 * FR9, ENV3, AD15).
 *
 * **Asserted through `git`, not through the file's contents.** A test that read `.dpm/.gitignore`
 * back and matched it against `dpm.db*` would be checking that two constants agree — the pattern is
 * exported by the module that writes it, so both sides of that comparison move together. What the
 * requirement is about is whether *git* ignores the database, and the only thing that knows is git.
 * So every criterion here runs `git check-ignore` in a real repository, and reads its `-v` output to
 * confirm the verdict came from the file dpm wrote rather than from the machine's global excludes.
 *
 * **The over-reach must-NOT is the one that matters most.** `.dpm/dpm.sql` is the committed
 * artefact AD4 says carries the text; a pattern that swallowed it would break every clone while
 * every other criterion in this file passed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitRepository, ignoreCheck, initRepository, twoBranches, DUMP } from './support/git.js';
import { ownedDirectory } from './support/scratch.js';
import { runNode } from './support/run-node.js';
import { BIN, call, HELLO, NO_OVERRIDE, wire } from './support/session.js';
import { IGNORE_FILE, IGNORE_PATTERN } from '../src/server/ignore.ts';

const ROOT = join(import.meta.dirname, '..');
const IGNORE_PATH = `.dpm/${IGNORE_FILE}`;

/**
 * An empty git repository, and a session run inside it that made one tool call.
 *
 * The session is the real `bin/dpm-mcp.ts` in a directory it has never seen, because the criterion
 * is about what a *user's first run* leaves behind — and it makes one tool call, because that is
 * what brings the database into existence at all (FR1).
 */
async function repositoryAfterAFirstRun(t, { before } = {}) {
  const root = ownedDirectory(t, 'dpm-ignore-');

  initRepository(root);

  before?.(root);

  const session = await runNode([BIN], wire([HELLO, call(2, 'list_spec')]), NO_OVERRIDE, { cwd: root });

  assert.equal(session.code, 0, `the server exited ${session.code}: ${session.stderr}`);

  const checkIgnore = ignoreCheck(root);

  const status = () => spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
    .stdout.split('\n').filter(Boolean);

  return { root, session, checkIgnore, status };
}

// --- Criteria 1 and 2, and the must-NOT, in one repository ---------------------------------------

test('a first run leaves the database ignored, and the committed dump not [integration]', async (t) => {
  const repo = await repositoryAfterAFirstRun(t);

  // The precondition, stated rather than assumed: the run really did create the database. Without
  // it every `check-ignore` below would still pass — check-ignore answers about a path, not a file —
  // and this file would be asserting that a pattern matches a string.
  assert.equal(existsSync(join(repo.root, '.dpm', 'dpm.db')), true,
    'the session created no database, so there is nothing here to have ignored');

  const database = repo.checkIgnore('.dpm/dpm.db');

  assert.equal(database.ignored, true, 'the generated database is not ignored');
  assert.ok(database.source.includes(IGNORE_PATH),
    `the verdict came from somewhere other than the file dpm wrote: ${database.source}`);
  assert.ok(database.source.includes(IGNORE_PATTERN),
    `a pattern other than dpm's decided it: ${database.source}`);

  // Nothing about the database in the porcelain either. `check-ignore` and `status` are two
  // different questions and only the second is the one a user sees: a path can be ignored and still
  // be listed if it was tracked before it was ignored.
  assert.deepEqual(repo.status().filter((line) => line.includes('dpm.db')), []);

  // **Criterion 2 — the siblings, which are why the star is in the pattern.** `dpm.db-wal` is what
  // SQLite writes beside the database and `merge/main.js` already looks for; `dpm.db.synced` is the
  // marker 49-03 introduces. Both are asserted here rather than when they arrive, because the
  // pattern that has to cover them is being written now.
  for (const sibling of ['.dpm/dpm.db-wal', '.dpm/dpm.db-journal', '.dpm/dpm.db.synced']) {
    assert.equal(repo.checkIgnore(sibling).ignored, true, `${sibling} is not ignored`);
  }

  // **The must-NOT.** `.dpm/dpm.sql` is the committed text form. A pattern broad enough to catch it
  // would leave every clone without the artefact the database is restored from.
  const dump = repo.checkIgnore('.dpm/dpm.sql');

  assert.equal(dump.ignored, false,
    `the committed dump is ignored, by ${dump.source || 'an unnamed rule'}`);

  // And the ignore file itself is committable — an untracked one reaches no clone, which is the
  // whole of AD15's "once".
  assert.equal(repo.checkIgnore(IGNORE_PATH).ignored, false, 'dpm ignored its own ignore file');
});

// --- Criterion 3: an ignore file the user owns -------------------------------------------------

test('an existing .dpm/.gitignore is left byte-identical [integration]', async (t) => {
  const MINE = `# mine\n${IGNORE_PATTERN}\n!dpm.db.keep\n`;

  const repo = await repositoryAfterAFirstRun(t, {
    before(root) {
      mkdirSync(join(root, '.dpm'), { recursive: true });
      writeFileSync(join(root, '.dpm', IGNORE_FILE), MINE, 'utf8');
    },
  });

  assert.equal(readFileSync(join(repo.root, '.dpm', IGNORE_FILE), 'utf8'), MINE,
    'the server rewrote an ignore file the user owns');

  // The control, and it is what stops the assertion above from being satisfied by a server that did
  // nothing at all: the run still created the database, and the user's own file still ignores it.
  assert.equal(existsSync(join(repo.root, '.dpm', 'dpm.db')), true);
  assert.equal(repo.checkIgnore('.dpm/dpm.db').ignored, true);
});

// --- Criterion 4: the README's first-run steps --------------------------------------------------

test('the README carries the hook step and no ignore-line step [unit]', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');

  // The negative first, because it is the change: no instruction to append an ignore line to
  // anything. Matched on the shape of the shell command rather than the word "ignore", so the prose
  // explaining that the database *is* ignored is not what this trips on.
  assert.doesNotMatch(readme, /echo\s+'[^']*dpm\.db[^']*'\s*>>/,
    'the README still tells the user to write an ignore line the server now writes');
  assert.doesNotMatch(readme, />>\s*\.gitignore/,
    'the README still appends to a .gitignore');

  // And the paired positive, because deleting the whole section would satisfy the negative: the
  // step that is still the user's is still there.
  assert.match(readme, /ln -s [^\n]*dpm\/hooks\/pre-commit [^\n]*\.git\/hooks\/pre-commit/,
    'the README no longer says how to install the hook');
});

// --- Criterion 5: the fixture ENV3 asks for -----------------------------------------------------

test('the git fixture is a repository with a commit, and produces a conflicted dump [integration]', (t) => {
  const repo = gitRepository(t);

  // A repository with a commit, read back from git rather than from the fixture's own return value.
  const log = execFileSync('git', ['log', '--oneline'], { cwd: repo.root, encoding: 'utf8' });

  assert.equal(log.trim().split('\n').length, 1, 'the fixture left other than one commit');
  assert.ok(execFileSync('git', ['ls-files'], { cwd: repo.root, encoding: 'utf8' }).includes(DUMP),
    'the commit does not carry the dump the branches conflict on');

  const spec = (slug, title) => (db, call) => call.create_spec({ slug, title });

  const merged = twoBranches(repo, { ours: spec('search', 'Search'), theirs: spec('export', 'Export') });

  assert.equal(merged.conflicted, true, `the merge did not conflict:\n${merged.output}`);

  // The conflict is *in the dump*, which is the half that matters: a merge conflicting on some other
  // file would set the flag above and leave 49-03 nothing to resolve.
  const conflicted = execFileSync('git', ['diff', '--name-only', '--diff-filter=U'],
    { cwd: repo.root, encoding: 'utf8' }).split('\n').filter(Boolean);

  assert.ok(conflicted.includes(DUMP), `the conflicted files were ${conflicted.join(', ') || 'none'}`);
  assert.match(readFileSync(join(repo.root, DUMP), 'utf8'), /^<{7} /m,
    'the working tree holds no conflict markers');
});
