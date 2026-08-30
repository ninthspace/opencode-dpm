/**
 * A real repository holding a published corpus — the settled state a guard test departs from.
 *
 * Two suites had built this: `guard-fix.test.js`, which then installs the hook and commits, and
 * `guard-verdict.test.js`, which moves one side or the other to reach a verdict. They are the same
 * seven steps, and the reason to collect them is not the seven steps: **what a guard test departs
 * from has to be a state the release actually produces.** Every one of these steps is a thing the
 * release does — `start` migrates and seeds, `publish` writes both artefacts *and* the sync marker —
 * and a fixture that assembled the same files some other way would leave a suite asserting that the
 * guard agrees with the fixture.
 *
 * The marker is the newest of those and the easiest to leave out of a hand-built tree, and a tree
 * without one is a different AD13 state from a settled one: every test written against it would be
 * exercising the adopt path while reading as though it were exercising the others.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DUMP_PATH } from '../../src/guard/index.ts';
import { publish } from '../../src/publish/index.ts';
import { start } from '../../src/start.ts';
import { fullCorpus } from './corpus.js';
import { dumpHolding } from './dumps.js';
import { initRepository, surface } from './git.js';
import { handlers, openPlanningDatabase } from './planning-database.js';
import { ownedDirectory } from './scratch.js';
import { spineTools } from '../../src/tools/index.ts';

/**
 * Bring up a git repository with the full corpus published into it.
 *
 * @param {import('node:test').TestContext} t
 * @param {string} [prefix] Names the temp directory, so a failing run says which suite made it.
 * @returns {{root: string, git: (...args: string[]) => string,
 *   db: import('node:sqlite').DatabaseSync, call: Record<string, Function>,
 *   documents: object, location: string}}
 */
export function publishedRepository(t, prefix = 'dpm-published-') {
  const root = ownedDirectory(t, prefix);
  const git = initRepository(root);
  const location = join(root, '.dpm', 'dpm.db');

  mkdirSync(dirname(location), { recursive: true });

  const { db } = start(location);

  t.after(() => db.close());

  const call = surface(db);
  const documents = fullCorpus(db, call);

  // **Published by the thing under test**, not by a hand-rolled regenerate. A fixture that wrote
  // the tree some other way would be asserting that the guard agrees with the fixture.
  publish(db, { root });

  return { root, git, db, call, documents, location };
}

/**
 * The corpus rendered into a scratch tree, and nothing else (ENVR5).
 *
 * **`publishedRepository` above is the same idea with a repository around it**, and the
 * difference is the point rather than an economy. A check over what the *renderer wrote* — that
 * no rendered file carries a bare ULID, that a document's filename embeds its identifier — has
 * nothing to say about git, and a fixture that initialised a repository and opened a database on
 * disk would put two failure modes in front of it that its subject cannot cause. This gives it a
 * directory, a corpus and the files, and takes the directory back afterwards.
 *
 * Reading the rendered files rather than the renderer's return value is the whole reason it
 * exists: a scan of what a function returned is a claim about that function, and FR17's claim is
 * about the tree a reader opens.
 *
 * @param {import('node:test').TestContext} t
 * @param {string} [prefix] Names the temp directory, so an orphan says which suite made it.
 * @returns {{root: string, db: import('node:sqlite').DatabaseSync,
 *   call: Record<string, Function>, documents: object}}
 */
export function publishedTree(t, prefix = 'dpm-tree-') {
  const root = ownedDirectory(t, prefix);
  const db = openPlanningDatabase(t);
  const call = handlers(spineTools(db));
  const documents = fullCorpus(db, call);

  publish(db, { root });

  return { root, db, call, documents };
}

/**
 * A pull, applied to a settled repository: the dump on disk is replaced by one written elsewhere,
 * and nothing local moves.
 *
 * **Three lines that are a state rather than an edit**, which is why they are here and not written
 * out at each use. This is the exact shape AD13 exists for — the local database is now silently
 * behind a file that arrived with no other trace — and a fixture that also touched the database, or
 * the marker, would be a different verdict wearing this one's name.
 *
 * @param {string} root
 * @param {string} [slug] Names a row nothing else in the suite creates, so "the pulled rows are
 *   present" is a claim about this dump rather than about any dump.
 * @returns {string} The dump text now on disk.
 */
export function pull(root, slug = 'arrived-in-a-pull') {
  const sql = dumpHolding(slug);

  writeFileSync(join(root, DUMP_PATH), sql, 'utf8');

  return sql;
}
