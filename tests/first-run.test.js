/**
 * Epic 47-10 Story 7 — a fresh project, start to commit (FR6, FR7, NFR6).
 *
 * Every other criterion in this epic is checked against a *component*: `publish()` writes,
 * `bin/dpm-publish.ts` exits, the tool returns the same record, the guard names the command. This
 * file is checked against the *sequence a new user performs* — empty repository, a run that writes,
 * a publish, a commit — which is the only place the gap the epic exists to close would still be
 * visible if it were open.
 *
 * **Nothing here is stubbed, and that is the story's must-NOT rather than a stylistic preference.**
 * The publish is a spawned process and the guard is reached by `git commit` firing the installed
 * hook, so what passes is the thing a user runs. A version of this file calling `publish()` and
 * `guard()` in process would assert that two functions agree, which four earlier files already
 * establish and which is not what "start to commit" means.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { committer } from './support/commit.js';
import { initRepository } from './support/git.js';
import { runNode } from './support/run-node.js';
import { fullCorpus } from './support/corpus.js';
import { IGNORE_FILE, writeIgnore } from '../src/server/ignore.ts';
import { start } from '../src/start.ts';
import { spineTools } from '../src/tools/index.ts';
import { project } from '../src/projection/index.ts';
import { DUMP_PATH, PUBLISH_COMMAND } from '../src/guard/index.ts';

const ROOT = join(import.meta.dirname, '..');
const BIN = join(ROOT, 'bin', 'dpm-publish.ts');

/**
 * A repository that has just performed the README's step 1, and nothing after it.
 *
 * **Deliberately not `guard-fix.test.js`'s fixture, which is otherwise nearly identical.** That one
 * publishes and commits before it returns, because its subject is a repository already in
 * agreement. Here the un-published, un-committed state *is* the subject, so sharing would mean a
 * flag deciding whether the thing under test has already happened.
 *
 * There is no initial commit for the same reason: the first commit is the one being asserted.
 */
function freshProject(t) {
  const root = mkdtempSync(join(tmpdir(), 'dpm-first-run-'));

  t.after(() => rmSync(root, { recursive: true, force: true }));

  const git = initRepository(root);

  // Step 1 of the README, performed exactly as it is written there — and it is now one line, not
  // two. The ignore step came out when the server started writing `.dpm/.gitignore` itself (FR9),
  // so a fixture still typing it would be performing an instruction the README no longer gives.
  // Nothing sets the hook's mode, deliberately: the README does not either, so a fixture that did
  // would supply the one thing a real install has to have arrived with. `plugin.test.js` holds it
  // to `100755`.
  symlinkSync(join(ROOT, 'hooks', 'pre-commit'), join(root, '.git', 'hooks', 'pre-commit'));

  // The database is created here rather than by the CLI, because `publish/main.js` opens and never
  // starts: a publish that migrated would resolve a refused commit by changing the thing being
  // checked. Starting the server is what a user does, and this is what the server's `open()` does
  // on the first tool call — the ignore file first, then `start` — reached through the shipped
  // writer rather than a transcribed pattern, so the fixture cannot drift from what ships.
  const location = join(root, '.dpm', 'dpm.db');

  mkdirSync(dirname(location), { recursive: true });
  writeIgnore(dirname(location));

  const { db } = start(location);

  t.after(() => db.close());

  const call = Object.fromEntries(spineTools(db).map((tool) => [tool.name, tool.handler]));

  // Asserts the guard ran, on both paths — see `support/commit.js`. Without that, criterion 1's
  // accepted commit reads the same whether the hook approved the tree or was never invoked.
  const commit = committer(root);

  /** Everything the commit carries. `ls-files` and not `readdir` — an untracked file is not in it. */
  const tracked = () => git('ls-files').split('\n').filter(Boolean).sort();

  return { root, location, db, call, git, commit, tracked };
}

// --- Criterion 1: the sequence is accepted, and the tree holds nothing else ----------------------

test('a fresh repository, a run that writes, a publish and a commit [feature]', async (t) => {
  const repo = freshProject(t);

  fullCorpus(repo.db, repo.call);

  const published = await runNode([BIN, repo.root]);

  assert.equal(published.code, 0, `the publish failed:\n${published.stderr}`);

  const committed = repo.commit('The first commit');

  assert.ok(committed.ok, `the hook refused a published tree:\n${committed.output}`);

  // **Set equality, not containment, because "and nothing else" is the half containment misses.**
  // A tree holding every generated file *plus* a stale one satisfies every check that only walks
  // what the database produces — which is the orphan failure FR6's clause exists to name, and the
  // one a first-run test is most likely to pass over.
  // `.dpm/.gitignore` is in the list because it is *committed*: AD15's guarantee is that a clone
  // arrives already ignoring the database, and an untracked ignore file reaches no clone at all.
  const expected = [
    ...project(repo.db, { write: false }).written.map((file) => file.path),
    DUMP_PATH,
    `.dpm/${IGNORE_FILE}`,
  ].sort();

  assert.deepEqual(repo.tracked(), expected, 'the commit carries something the database does not');
});

// --- Criterion 2: the same sequence with the publish omitted -------------------------------------

test('the same sequence without the publish is refused, and named [feature]', async (t) => {
  const repo = freshProject(t);

  fullCorpus(repo.db, repo.call);

  const refused = repo.commit('Committing what I never published');

  assert.equal(refused.ok, false, 'an unpublished tree was committed');

  // Both artefacts, because a write moves them together and the dump is the half that passes every
  // check aimed at the markdown.
  assert.match(refused.output, /do(es)? not match the database/);
  assert.match(refused.output, /\.dpm\/dpm\.sql/, 'the refusal did not name the dump');
  assert.match(refused.output, /docs\//, 'the refusal did not name the projection');
  assert.ok(refused.output.includes(PUBLISH_COMMAND),
    `the refusal did not name the command that fixes it:\n${refused.output}`);

  // The control, and the reason the assertion above is about this tree rather than about a hook
  // that refuses everything: run the step that was skipped, and the same commit goes through.
  const published = await runNode([BIN, repo.root]);

  assert.equal(published.code, 0, `the publish failed:\n${published.stderr}`);
  assert.ok(repo.commit('Committing what I published').ok,
    'the tree was still refused after the step the message asked for');
});

// --- Criterion 3: the steps are discoverable ----------------------------------------------------

test('the README names both first-run steps [unit]', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');

  // **Containment, and nothing beyond it.** The criterion is that two steps are findable without
  // opening the hook; how well they are written is not a thing a test should have an opinion about.
  // Both ends of the link, because either alone is satisfied by prose that mentions the hook
  // without saying where it goes — and `.git/hooks/pre-commit` is the end git actually invokes.
  assert.match(readme, /ln -s [^\n]*dpm\/hooks\/pre-commit [^\n]*\.git\/hooks\/pre-commit/,
    'the README does not say how to install the hook');
  assert.match(readme, /dpm-publish\.ts/,
    'the README does not name the publish step, so it is discoverable only from a refused commit');
});

// --- Criterion 4 (must NOT): stubs, or a corpus too small to have an orphan ----------------------

test('must NOT — the run passes against stubs, or a corpus with nothing to orphan [feature]', async (t) => {
  const repo = freshProject(t);
  const documents = fullCorpus(repo.db, repo.call);

  // **Not a stubbed guard.** What accepted the commit below is the file this repository ships, and
  // the only way to know that is to resolve the link git will invoke and compare it. A fixture that
  // called `guard()` itself would satisfy every other assertion in this file.
  assert.equal(realpathSync(join(repo.root, '.git', 'hooks', 'pre-commit')),
    realpathSync(join(ROOT, 'hooks', 'pre-commit')),
    'the hook under test is not the hook this repository ships');

  // **Not a stubbed publish.** A spawned process with an exit code and a report on stdout — the two
  // things an in-process call cannot produce, which is why it is spawned rather than imported.
  const published = await runNode([BIN, repo.root]);

  assert.equal(published.code, 0, `the publish failed:\n${published.stderr}`);
  assert.match(published.stdout, /^dpm: \d+ generated files? — /,
    `the publish wrote no report:\n${published.stdout}`);
  assert.ok(repo.commit('The first commit').ok);

  // **Not a one-document corpus.** This is the limb the criterion is really about: with one
  // document there is no orphan and no ordering, so the sequence is asserted on the only case where
  // nothing can go wrong. A renumber has to move a file that is already committed.
  const count = repo.db.prepare('SELECT count(*) AS n FROM document').get().n;

  assert.ok(count > 1, `the corpus carries ${count} document — a renumber can orphan nothing`);

  const before = repo.db.prepare('SELECT number, slug FROM document WHERE id = ?')
    .get(documents.spec.id);
  const stale = `docs/specifications/${String(before.number).padStart(2, '0')}-spec-${before.slug}.md`;

  assert.ok(repo.tracked().includes(stale), `${stale} is not in the commit, so nothing is orphaned`);

  repo.db.prepare('UPDATE document SET number = 77 WHERE id = ?').run(documents.spec.id);

  const again = await runNode([BIN, repo.root]);

  assert.equal(again.code, 0, `the second publish failed:\n${again.stderr}`);
  assert.ok(again.stdout.includes(`  removed    ${stale}`),
    `the report did not name the orphan it removed:\n${again.stdout}`);
  assert.equal(existsSync(join(repo.root, stale)), false, 'the renumber left the old file on disk');

  assert.ok(repo.commit('The renumbered spec').ok);
  assert.equal(repo.tracked().includes(stale), false, 'the old path is still in the commit');
});
