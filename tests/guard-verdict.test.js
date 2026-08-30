/**
 * Epic 49-03 Story 4 — the guard names the fix belonging to each verdict (FR7, AD13).
 *
 * The defect: the guard reported `differs` and ended by naming `bin/dpm-publish.ts`, whatever had
 * happened. A clean pull rewrites `.dpm/dpm.sql` and touches nothing else, so the reader who had
 * just pulled was being sent to the one operation that regenerates the dump from the stale database
 * and discards everything the pull brought. The guard was right that something was wrong and wrong
 * about which direction, and the direction is the whole of what the reader needs.
 *
 * **Driven in a real repository, on the real published tree.** Each state below is reached the way
 * a user reaches it — publish, then move one side, or both, or remove the marker — rather than by
 * handing `describe()` a constructed result. A message assembled from a fabricated verdict proves
 * the renderer works and says nothing about whether the guard ever produces that verdict.
 *
 * **The commands are read from the guard's own constants, never transcribed.** A test spelling
 * `bin/dpm-import.ts` agrees with itself forever, including after a rename, which is NFR6's failure
 * class — help that looks like help and sends the reader nowhere.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  describe, guard, DUMP_PATH, IMPORT_COMMAND, MERGE_COMMAND, MOVED, PUBLISH_COMMAND,
  PUBLISH_INVOCATION,
} from '../src/guard/index.ts';
import { MARKER_PATH, readMarker } from '../src/sync/marker.ts';
import { VERDICT } from '../src/sync/verdict.ts';
import { sha256 } from './support/hashes.js';
import { publishedRepository, pull } from './support/published.js';

/**
 * The settled state every verdict below is a departure from: published, with the marker that
 * publish wrote. Shared, because a guard test that departs from a hand-built tree is departing from
 * a state the release does not produce.
 */
const repository = (t) => publishedRepository(t, 'dpm-guard-verdict-');

/** Local work after the last publish: the database moves and the dump on disk does not. */
function workLocally(call, slug) {
  call.create_spec({ slug, title: `The ${slug}` });
}

// --- Criterion 1: each verdict names its own fix -------------------------------------------------

test('each verdict names the fix that belongs to it [integration]', (t) => {
  // **Database moved** — the settled tree with local work on top of it.
  const ahead = repository(t);

  workLocally(ahead.call, 'written-after-publishing');

  const database = guard(ahead.db, { root: ahead.root });

  assert.equal(database.verdict, VERDICT.databaseMoved);
  assert.ok(describe(database).includes(PUBLISH_COMMAND), 'the database moved and publish was '
    + `not named:\n${describe(database)}`);

  // **Dump moved** — the pull, and the case the old guard got exactly backwards.
  const pulled = repository(t);

  pull(pulled.root);

  const dumpAhead = guard(pulled.db, { root: pulled.root });

  assert.equal(dumpAhead.verdict, VERDICT.dumpMoved);
  assert.ok(describe(dumpAhead).includes(IMPORT_COMMAND), 'the dump moved and the import was not '
    + `named:\n${describe(dumpAhead)}`);

  // **Both moved** — a pull on top of local work, which is neither side's fix.
  const conflicted = repository(t);

  pull(conflicted.root);
  workLocally(conflicted.call, 'written-before-the-pull-landed');

  const both = guard(conflicted.db, { root: conflicted.root });

  assert.equal(both.verdict, VERDICT.bothMoved);
  assert.ok(describe(both).includes(MERGE_COMMAND), `both moved and the reconcile was not named:\n${
    describe(both)}`);

  // And the dump line says which one moved, rather than only that they differ. Three states that
  // used to produce one sentence.
  const reasons = [database, dumpAhead, both]
    .map((result) => result.diverged.find((file) => file.path === DUMP_PATH).reason);

  assert.deepEqual(reasons, [MOVED[VERDICT.databaseMoved], MOVED[VERDICT.dumpMoved],
    MOVED[VERDICT.bothMoved]]);
  assert.equal(new Set(reasons).size, 3, 'two verdicts report the dump with the same sentence');

  // **The commands are on disk, or they are not fixes.** The rule `guard-fix.test.js` established
  // for publish, applied to the one this story adds that exists today. `IMPORT_COMMAND` is asserted
  // by shape only: the binary it names is built by epic 49-04, which is blocked on this one so that
  // the verdict exists to be named by, and the existence assertion lands there with the file.
  assert.equal(existsSync(MERGE_COMMAND), true,
    `the guard names ${MERGE_COMMAND} and there is nothing there`);
  assert.match(IMPORT_COMMAND, /[/\\]bin[/\\]dpm-import\.ts$/);
});

// --- Criterion 2: the upgrade path -----------------------------------------------------------

test('an absent marker over a database that agrees with the dump is adopted [integration]', (t) => {
  const repo = repository(t);
  const marker = join(repo.root, MARKER_PATH);

  // Every database that exists today is in this state, and it is reached here by removing the
  // marker publish wrote rather than by skipping the publish — the tree has to be *settled* for
  // adoption to be the right answer, and a tree that was never published is not.
  rmSync(marker, { force: true });
  assert.equal(readMarker({ root: repo.root }), null, 'the marker was not removed');

  const adopted = guard(repo.db, { root: repo.root });

  assert.deepEqual(adopted.diverged, [], `an agreeing tree was reported as diverged:\n${
    describe(adopted)}`);
  assert.equal(adopted.verdict, VERDICT.adopt);

  // The marker is written, and it is the hash of the dump *on disk* — checked against a digest
  // computed here, so a marker recording the wrong text cannot satisfy this by agreeing with the
  // function that wrote it.
  assert.equal(readMarker({ root: repo.root }),
    sha256(readFileSync(join(repo.root, DUMP_PATH), 'utf8')),
    'the adopted marker is not the hash of the dump beside it');

  // And the run that follows reports `clean` rather than adopting again, which is what makes this
  // an upgrade path rather than a write on every commit.
  const settled = guard(repo.db, { root: repo.root });

  assert.equal(settled.verdict, VERDICT.clean);
  assert.deepEqual(settled.diverged, []);

  // The control: the guard is capable of *not* adopting on this tree, so the lines above are the
  // adopt rule firing rather than a guard that writes a marker whatever it finds.
  rmSync(marker, { force: true });
  pull(repo.root);

  const divergent = guard(repo.db, { root: repo.root });

  assert.equal(divergent.verdict, VERDICT.unknown);
  assert.equal(existsSync(marker), false,
    'a marker was recorded for a tree whose two sides disagree');
});

// --- Criterion 3 (must NOT): publish, when the dump is what moved --------------------------------

test('must NOT — publish is named when the dump is what moved [integration]', (t) => {
  const repo = repository(t);

  pull(repo.root);

  const message = describe(guard(repo.db, { root: repo.root }));

  // **The criterion, asserted first.** Publishing here regenerates the dump from a database that is
  // behind it, so the pulled rows are gone and the commit passes — silent loss delivered by the
  // tool built to prevent it.
  assert.ok(!message.includes(PUBLISH_COMMAND),
    `the dump moved and the guard named the command that would discard it:\n${message}`);
  // The phrase and not the id: `dpm-publish` is a substring of `bin/dpm-publish.ts`, so matching the
  // id would make this assertion a second reading of the line above rather than its own.
  assert.ok(!message.includes(PUBLISH_INVOCATION),
    `the dump moved and the guard named the publish skill:\n${message}`);
  assert.ok(message.includes(IMPORT_COMMAND), `no fix was named at all:\n${message}`);

  // **The control, in the same test.** Without it every line above is satisfied by a guard that
  // names nothing, or by one that has lost the ability to name publish at all — and the second is a
  // regression that would otherwise ship green.
  const moved = repository(t);

  workLocally(moved.call, 'written-after-publishing');

  const named = describe(guard(moved.db, { root: moved.root }));

  assert.ok(named.includes(PUBLISH_COMMAND),
    `the database moved and publish was not named:\n${named}`);
  assert.ok(named.includes(PUBLISH_INVOCATION), 'the skill went with it');
  assert.ok(!named.includes(IMPORT_COMMAND),
    `the database moved and the import was named as well:\n${named}`);
});

// --- Criterion 4 (must NOT): one fix, when nothing records which side moved ----------------------

test('must NOT — a single fix is named when no marker says which side moved [integration]', (t) => {
  const repo = repository(t);

  rmSync(join(repo.root, MARKER_PATH), { force: true });
  pull(repo.root);

  const message = describe(guard(repo.db, { root: repo.root }));

  // **Both are named, and each with what it would do.** A marker-less divergence carries no
  // information about direction, so naming one fix is a guess presented as a diagnosis. Naming both
  // without their consequences is barely better — the reader has to choose, and the thing they need
  // in order to choose is which rows each one destroys.
  assert.ok(message.includes(PUBLISH_COMMAND), `publish was not named:\n${message}`);
  assert.ok(message.includes(IMPORT_COMMAND), `the import was not named:\n${message}`);
  assert.match(message, /discards whatever the dump holds/,
    `publish was named without saying what it would discard:\n${message}`);
  assert.match(message, /discards rows created since the dump was/,
    `the import was named without saying what it would discard:\n${message}`);

  // **The control.** A state that *does* have a direction names exactly one command, so the pair
  // above is the unknown verdict refusing to choose rather than a guard that lists everything it
  // knows on every divergence.
  const conflicted = repository(t);

  pull(conflicted.root);
  workLocally(conflicted.call, 'written-before-the-pull-landed');

  const one = describe(guard(conflicted.db, { root: conflicted.root }));

  assert.ok(one.includes(MERGE_COMMAND), `both moved and the reconcile was not named:\n${one}`);
  assert.ok(!one.includes(PUBLISH_COMMAND), `a single-fix verdict also named publish:\n${one}`);
  assert.ok(!one.includes(IMPORT_COMMAND), `a single-fix verdict also named the import:\n${one}`);
});
