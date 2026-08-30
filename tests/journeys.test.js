/**
 * Epic 49-04 Story 4 — the two journeys, end to end (FR8).
 *
 * Every other file in spec 49 checks a component: the verdict function routes, the guard names a
 * fix, the rebuild refuses, the import writes a marker. These two check the *sequences a user
 * performs*, and they cross four epics to do it — the lazy open (49-01), restore-on-create (49-02),
 * the marker and the verdict (49-03), and the import (49-04). No one story owns either of them, and
 * a suite of green component tests is exactly what the spec started from: every piece worked and
 * the pull still ended with the pulled rows discarded.
 *
 * **The second journey's last clause is the whole spec in one assertion.** *And the pulled rows are
 * present.* Before this line of work, that sequence ended with a guard reporting `differs` and
 * naming publish, a reader publishing, and the rows the pull brought regenerated out of existence
 * by the tool that was supposed to be protecting them.
 *
 * **Nothing is stubbed, for the reason `first-run.test.js` gives.** The clone is a real `git clone`,
 * the first open is `bin/dpm-mcp.ts` as a process, the refusal comes from `git commit` firing the
 * installed hook, and the import is `bin/dpm-import.ts` spawned. A version of this file calling
 * `open()` and `guard()` in process would assert that some functions agree, which the rest of the
 * suite already establishes and which is not what "clone to commit" means.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DUMP_PATH, IMPORT_COMMAND, PUBLISH_COMMAND } from '../src/guard/index.ts';
import { publish } from '../src/publish/index.ts';
import { writeIgnore } from '../src/server/ignore.ts';
import { MARKER_PATH, readMarker } from '../src/sync/marker.ts';
import { committer } from './support/commit.js';
import { sha256 } from './support/hashes.js';
import { slugsIn } from './support/inspect.js';
import { publishedRepository } from './support/published.js';
import { runNode } from './support/run-node.js';
import { ownedDirectory } from './support/scratch.js';
import { BIN as SERVER, HELLO, NO_OVERRIDE, call, repliesFrom, wire } from './support/session.js';

const ROOT = join(import.meta.dirname, '..');
const PUBLISH = join(ROOT, 'bin', 'dpm-publish.ts');
const IMPORT = join(ROOT, 'bin', 'dpm-import.ts');

// **`bin/dpm-guard.ts` is deliberately absent from that list.** The guard is reached here by
// `git commit` firing the installed hook, which is the only route a user takes to it — and the one
// that would still be broken if the hook's symlink resolution regressed, with every direct
// invocation of the binary passing.

/**
 * A repository somebody else has been working in: the corpus published, ignored and committed.
 *
 * The ignore file is written through the shipped writer rather than transcribed, because AD15's
 * guarantee is that a *clone* arrives already ignoring the database — which is a property of what
 * was committed, and an untracked ignore file reaches no clone at all.
 */
function origin(t) {
  const repo = publishedRepository(t, 'dpm-journey-origin-');

  writeIgnore(join(repo.root, '.dpm'));
  repo.git('add', '-A');
  repo.git('commit', '--quiet', '-m', 'The corpus');

  return repo;
}

/** `git clone` of `from`, with dpm's hook installed the way the README says to install it. */
function cloneOf(t, from, prefix) {
  const root = ownedDirectory(t, prefix);

  execFileSync('git', ['clone', '--quiet', from, root], { encoding: 'utf8' });
  execFileSync('git', ['config', 'user.email', 'clone@example.invalid'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Clone'], { cwd: root });

  symlinkSync(join(ROOT, 'hooks', 'pre-commit'), join(root, '.git', 'hooks', 'pre-commit'));

  return root;
}

/** One MCP session in `root`, over the real entry point. */
function session(root, messages) {
  return runNode([SERVER], wire([HELLO, ...messages]), NO_OVERRIDE, { cwd: root });
}

// --- Criterion 1: clone → first open restores → publish → commit ---------------------------------

test('a clone, a first open that restores, a publish and a commit [feature]', async (t) => {
  const upstream = origin(t);
  const root = cloneOf(t, upstream.root, 'dpm-journey-clone-');
  const location = join(root, '.dpm', 'dpm.db');

  // **The premise: a clone carries the text and not the database.** If the database came across,
  // the restore under test never runs and every assertion below holds for the wrong reason.
  assert.equal(existsSync(join(root, DUMP_PATH)), true, 'the clone has no dump to restore from');
  assert.equal(existsSync(location), false, 'the clone carries a database, so it is not a clone');

  const first = await session(root, [
    call(2, 'create_spec', { slug: 'written-in-the-clone', title: 'Written in the clone' }),
  ]);

  assert.equal(first.code, 0, `the session exited ${first.code}: ${first.stderr}`);

  const reply = repliesFrom(first.stdout).find((message) => message.id === 2);

  assert.equal(reply?.error, undefined, `the write was refused: ${JSON.stringify(reply?.error)}`);

  // **The restore says so on stderr** (FR10). It is the one unusual thing a first open does, and a
  // session that silently produced the right rows would be indistinguishable from one that found a
  // database already there — which is the state this test spent two assertions ruling out.
  assert.match(first.stderr, /restored it from the dpm\.sql beside it/,
    `the first open did not report a restore:\n${first.stderr}`);

  // The rows came from the dump rather than from nothing: everything upstream published is here,
  // and so is the one this session wrote.
  assert.deepEqual(slugsIn(location),
    [...slugsIn(upstream.location), 'written-in-the-clone'].sort(),
    'the restored database is not the corpus the clone carried plus the local write');

  // The publish, as a process — the README's step 2.
  const published = await runNode([PUBLISH, root], '', NO_OVERRIDE);

  assert.equal(published.code, 0, `the publish failed:\n${published.stderr}`);

  const committed = committer(root)('A spec written in the clone');

  assert.ok(committed.ok, `the hook refused a published tree:\n${committed.output}`);

  // The projection for the new spec is committed, not merely written — a `git add -A` that missed
  // it would leave the next clone with a dump and no markdown, and the guard has no opinion about
  // what is staged.
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });

  assert.match(tracked, /docs\/specifications\/\d+-spec-written-in-the-clone\.md/,
    `the new spec's projection was not committed:\n${tracked}`);

  // And the database is not, which is AD15 arriving through a clone rather than through a fixture
  // that wrote the ignore file itself.
  assert.doesNotMatch(tracked, /\.dpm\/dpm\.db/, 'the clone committed its database');
  assert.match(tracked, /\.dpm\/\.gitignore/, 'the ignore file did not reach the clone');
});

// --- Criterion 2: pull → guard names import → import → commit, with the rows intact --------------

test('a pull, a guard that names the import, an import and a commit [feature]', async (t) => {
  const upstream = origin(t);
  const root = cloneOf(t, upstream.root, 'dpm-journey-pull-');
  const location = join(root, '.dpm', 'dpm.db');

  // Settle the clone the way a first session does — the open restores, and the publish that follows
  // records the sync point. Without a marker there is no verdict to be had: the guard would report
  // `unknown` and name both fixes, which is a different criterion in a different story.
  await session(root, [call(2, 'list_specs')]);

  const settled = await runNode([PUBLISH, root], '', NO_OVERRIDE);

  assert.equal(settled.code, 0, `settling the clone failed:\n${settled.stderr}`);
  assert.equal(readMarker({ root }), sha256(readFileSync(join(root, DUMP_PATH), 'utf8')),
    'the clone is not at a sync point, so nothing here can attribute a divergence');

  // **Upstream moves, and the clone does not.** This is the shape of a clean pull and the reason
  // AD13 exists: the dump arrives rewritten and nothing local has changed, so there is nothing in
  // either artefact that says which of them moved.
  upstream.call.create_spec({ slug: 'arrived-in-the-pull', title: 'Written upstream' });
  publish(upstream.db, { root: upstream.root });
  upstream.git('add', '-A');
  upstream.git('commit', '--quiet', '-m', 'A spec written upstream');

  execFileSync('git', ['pull', '--quiet', '--no-rebase'], { cwd: root, encoding: 'utf8' });

  assert.match(readFileSync(join(root, DUMP_PATH), 'utf8'), /arrived-in-the-pull/,
    'the pull brought nothing, so there is no divergence to report');
  assert.deepEqual(slugsIn(location).includes('arrived-in-the-pull'), false,
    'the local database already has the pulled rows, so the import has nothing to do');

  const commit = committer(root);

  writeFileSync(join(root, 'NOTES.md'), 'A file dpm does not generate.\n', 'utf8');

  const refused = commit('Work on top of the pull');

  // **The refusal names the import and does not name publish, which is the defect this spec
  // exists to remove.** Publishing here regenerates the dump from a database that is behind it,
  // so the reader who followed that instruction would destroy exactly what they had just pulled —
  // and the commit would then pass, with nothing left to report it.
  assert.equal(refused.ok, false, `the pulled tree was committed:\n${refused.output}`);
  assert.ok(refused.output.includes(IMPORT_COMMAND),
    `the guard did not name the import:\n${refused.output}`);
  assert.equal(refused.output.includes(PUBLISH_COMMAND), false,
    `the guard sent the reader to the command that would discard the pull:\n${refused.output}`);

  const imported = await runNode([IMPORT, root], '', NO_OVERRIDE);

  assert.equal(imported.code, 0, `the import failed:\n${imported.stderr}`);

  // **The clause the whole spec is about.** Today, before this work, the sequence above ended here
  // with these rows gone.
  assert.deepEqual(slugsIn(location), slugsIn(upstream.location),
    'the imported database is not the one the pull described');
  assert.ok(slugsIn(location).includes('arrived-in-the-pull'), 'the pulled rows are not present');

  const accepted = commit('Work on top of the pull');

  assert.ok(accepted.ok, `the hook refused an imported tree:\n${accepted.output}`);

  // The marker moved with it, so the next guard run has a sync point rather than the pre-pull one —
  // which would report this settled tree as diverged the moment anything else moved.
  assert.equal(readMarker({ root }), sha256(readFileSync(join(root, DUMP_PATH), 'utf8')),
    'the import left the marker naming the pre-pull dump');
  assert.equal(existsSync(join(root, MARKER_PATH)), true);
});
