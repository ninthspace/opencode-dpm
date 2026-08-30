/**
 * Epic 49-04 Story 2 — the import (FR8, AD13).
 *
 * The clean pull is the common case and until now it had no operation at all: `.dpm/dpm.sql` arrives
 * rewritten, the local database is silently behind it, and the only tool that rebuilt a database from
 * a dump was reachable only from inside a conflicted merge. `bin/dpm-import.ts` is that sequence with
 * the three-way merge taken out, and it is the command the guard's dump-moved verdict names.
 *
 * **Driven as a process, through the path the guard prints.** The criterion is that the command the
 * diagnostic names rebuilds the database — so the test runs `IMPORT_COMMAND` itself rather than the
 * module behind it. A test that imported `run()` and separately asserted the constant's shape would
 * pass on a guard naming a file that does not exist, which is NFR6's failure class and the exact
 * check epic 49-03 deferred to this one.
 *
 * **The marker criterion is checked against a digest computed here**, never against `hashDump`. Both
 * sides of the equality coming out of one function is an equality that holds over the wrong text as
 * readily as the right one, and hashing the wrong text is the only way a marker is ever wrong.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, guard, DUMP_PATH, IMPORT_COMMAND } from '../src/guard/index.ts';
import { run } from '../src/import/main.ts';
import { rebuild, RebuildError } from '../src/rebuild/index.ts';
import { readMarker } from '../src/sync/marker.ts';
import { VERDICT } from '../src/sync/verdict.ts';
import { emptyDump } from './support/dumps.js';
import { sha256 } from './support/hashes.js';
import { openConnectionAt, slugsIn } from './support/inspect.js';
import { publishedRepository, pull } from './support/published.js';
import { runNode } from './support/run-node.js';
import { ownedDirectory } from './support/scratch.js';
import { capture } from './support/streams.js';

/** A settled, published repository — the state a pull arrives into. */
const repository = (t) => publishedRepository(t, 'dpm-import-');

// --- Criterion 1: the command the dump-moved verdict names rebuilds the database ------------------

test('the import rebuilds the database from the committed dump [integration]', async (t) => {
  const repo = repository(t);

  // **The premise, established from the guard rather than assumed.** The state under test is the one
  // a pull leaves; if the guard does not call it dump-moved, whatever the import then does is not
  // the thing this criterion is about.
  pull(repo.root);

  const pulled = guard(repo.db, { root: repo.root });

  assert.equal(pulled.verdict, VERDICT.dumpMoved, `the fixture is not the pulled state:\n${
    describe(pulled)}`);

  // **The command is taken from the guard's constant and it has to be on disk.** `guard-fix.test.js`
  // established this rule for publish and 49-03 could only assert `IMPORT_COMMAND`'s shape, because
  // the file it names is this story's. This is that deferred check, landing with the binary.
  assert.ok(describe(pulled).includes(IMPORT_COMMAND), `the verdict did not name the import:\n${
    describe(pulled)}`);
  assert.equal(existsSync(IMPORT_COMMAND), true,
    `the guard names ${IMPORT_COMMAND} and there is nothing there`);

  const imported = await runNode([IMPORT_COMMAND, repo.root], '', { DPM_DATABASE: repo.location });

  assert.equal(imported.code, 0, `the import failed:\n${imported.stderr}${imported.stdout}`);

  // The rows the pull brought are in the database, which is the whole point of the operation — and
  // the corpus the fixture published is not, because the dump that arrived does not describe it.
  assert.deepEqual(slugsIn(repo.location), ['arrived-in-a-pull'],
    `the import left the database describing something else:\n${imported.stdout}`);

  // **The control: the same command over a settled tree leaves the corpus where it is.** Without it
  // the rows asserted above are satisfied by a command that empties the database and happens to be
  // pointed at a dump holding one row — and by any number of other things that are not an import.
  const settled = repository(t);
  const corpus = slugsIn(settled.location);
  const before = readFileSync(join(settled.root, DUMP_PATH), 'utf8');

  assert.ok(corpus.length > 1, 'the control repository has nothing to preserve');

  const again = await runNode([IMPORT_COMMAND, settled.root], '', {
    DPM_DATABASE: settled.location,
  });

  assert.equal(again.code, 0, `the import refused a settled tree:\n${again.stderr}`);
  assert.deepEqual(slugsIn(settled.location), corpus,
    'the import discarded a corpus its own dump describes');
  assert.equal(readFileSync(join(settled.root, DUMP_PATH), 'utf8'), before,
    'the import rewrote the dump it was importing');
});

// --- Coverage row 1's other caller: one message, from one implementation -------------------------

test('the import reports the shared refusal verbatim rather than one of its own [integration]', (t) => {
  const root = ownedDirectory(t, 'dpm-import-refusal-');

  // The dump has to exist for the import to reach the shared implementation at all — its own
  // missing-dump refusal fires first, and that one is shared with nobody.
  const sql = emptyDump();

  mkdirSync(join(root, '.dpm'), { recursive: true });
  writeFileSync(join(root, DUMP_PATH), sql, 'utf8');
  writeFileSync(join(root, 'nowhere'), 'not a directory\n', 'utf8');

  // **The fault is inside the shared implementation, reached identically by both callers.** A
  // regular file where the database's directory has to be: `mkdirSync` refuses, which is the first
  // thing `rebuild` does and happens before either caller's own arguments are looked at.
  const location = join('nowhere', 'dpm.db');
  const written = capture();
  const code = run({ root, location, streams: written.streams });

  assert.equal(code, 2, `the import did not refuse:\n${written.err}${written.out}`);

  let direct;

  try {
    rebuild(sql, { root, location });
    assert.fail('the shared rebuild returned rather than refusing');
  } catch (error) {
    assert.ok(error instanceof RebuildError, `raised a ${error.name}: ${error.message}`);
    direct = error;
  }

  // **Compared to each other, never to a transcription** — the same rule `rebuild.test.js` applies
  // to the merge. Two expected strings written out here would agree with two implementations that
  // agree today and drift the moment one is edited, which is what FR8's "one message from one
  // implementation" is about.
  assert.equal(written.err, `${direct.message}\n`,
    `the import reworded the shared refusal:\n  import: ${written.err.trim()}\n  shared: ${
      direct.message}`);

  // And it is worded for neither caller. Read from the prose half only: everything after the ` — `
  // is the underlying error, which carries a filesystem path this fixture put the word "import"
  // into — an assertion matching *that* would be about the temp directory's name.
  const [prose] = written.err.split(' — ');

  assert.doesNotMatch(prose, /import(ed|ing|s)?\b/i,
    `the shared refusal is worded for one caller: ${prose}`);

  // **The control, and it is what makes the equality above sharing rather than a command with one
  // sentence.** Its own refusal — a tree with no dump — is a message the rebuild never produces,
  // so the tool demonstrably has more than one thing to say.
  const bare = ownedDirectory(t, 'dpm-import-empty-');
  const alone = capture();
  const missing = run({ root: bare, location: '.dpm/dpm.db', streams: alone.streams });

  assert.equal(missing, 2, 'a tree with no dump was imported anyway');
  assert.match(alone.err, /there is no dump there/, `refused for some other reason: ${alone.err}`);
  assert.notEqual(alone.err, written.err, 'every refusal is the same sentence');
});

// --- Criterion 2: the sync point, and the run that follows ---------------------------------------

test('after an import the marker is the dump on disk and the next guard run is clean [integration]', (t) => {
  const repo = repository(t);
  const arrived = pull(repo.root);

  const written = capture();
  const code = run({ root: repo.root, location: repo.location, streams: written.streams });

  assert.equal(code, 0, `the import failed:\n${written.err}`);

  // **The marker is the hash of the dump on disk**, checked against a digest computed here — so a
  // marker recording the wrong text cannot satisfy this by agreeing with the function that wrote it.
  // Read off the file rather than from `arrived`, because the two being equal is itself part of the
  // claim: an import that rewrote the dump from the database it just built would pass a comparison
  // against whichever of them the test happened to hold.
  const onDisk = readFileSync(join(repo.root, DUMP_PATH), 'utf8');

  assert.equal(onDisk, arrived, 'the import rewrote the dump it was importing');
  assert.equal(readMarker({ root: repo.root }), sha256(onDisk),
    'the marker is not the hash of the dump beside it');

  // **This asserts the marker's value, not who wrote it, and it cannot assert the second.** The
  // rebuild publishes and then re-guards, and the guard adopts a marker that disagrees with two
  // artefacts that agree — which is exactly the state a broken publish would leave. So a publish
  // recording the wrong digest is repaired one line later and this equality still holds. Found by
  // driving it: hashing `dumped + '\n'` in `publish` leaves this line green. What fails instead is
  // `a publish records the sync point, and the guard that follows reports clean` in
  // `publish.test.js`, which is where that attribution belongs and where 49-03 put it.

  // **The run that follows, through a fresh connection.** The fixture's handle is on the inode the
  // import replaced, so a guard run through it would report on the database that was discarded —
  // green or red, it would be answering about the wrong file.
  const after = openConnectionAt(repo.location, (db) => guard(db, { root: repo.root }));

  assert.equal(after.verdict, VERDICT.clean, `the tree is not settled after an import:\n${
    describe(after)}`);
  assert.deepEqual(after.diverged, [], describe(after));

  // **The control.** The identical repository *without* the import reports dump-moved, so the clean
  // verdict above is the import having settled the tree rather than a guard that reports clean on a
  // pulled tree — which is the defect 49-03 closed and the one this criterion sits downstream of.
  const untouched = repository(t);

  pull(untouched.root);

  const stale = guard(untouched.db, { root: untouched.root });

  assert.equal(stale.verdict, VERDICT.dumpMoved,
    'a pulled tree reports clean without an import, so the verdict above proves nothing');
});
