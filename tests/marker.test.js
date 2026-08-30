/**
 * Epic 49-03 Story 1 — the sync marker (AD13).
 *
 * **The hash is never compared against `hashDump`.** Both sides of that equality come out of one
 * function, so it holds for any digest at all — including one taken over the wrong text, which is
 * the only way a marker is ever wrong. The expected value is computed here from `node:crypto`
 * directly, and the *meaning* of the value is pinned separately: two dumps differing by one byte
 * must not share a marker. What ties the written hash to the value the guard will read is Story 2's
 * criterion, which follows a publish with a guard run that has to report clean.
 *
 * **And the ignore coverage is asked of git, not of the pattern.** `dpm.db*` was written for the
 * database and its WAL sibling; that it also covers `dpm.db.synced` is a consequence, and a test
 * that matched the marker's name against the exported constant would be checking that two constants
 * agree. `git check-ignore -v` returns the verdict *and* names the file and pattern that produced
 * it, so a machine-level `core.excludesFile` cannot pass this for the wrong reason.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IGNORE_FILE, IGNORE_PATTERN, writeIgnore } from '../src/server/ignore.ts';
import { MARKER_PATH, readMarker, writeMarker } from '../src/sync/marker.ts';
import { emptyDump } from './support/dumps.js';
import { ignoreCheck, initRepository } from './support/git.js';
import { sha256 } from './support/hashes.js';
import { ownedDirectory } from './support/scratch.js';

// --- Criterion 1: one module writes it and reads it back -----------------------------------------

test('the marker holds the hash of the dump text, and one module writes and reads it [unit]', (t) => {
  const root = ownedDirectory(t, 'dpm-marker-');
  const sql = emptyDump();

  // No `.dpm/` yet: the marker's writer creates the directory it needs rather than assuming a
  // publish put one there, so the module is usable by whichever caller reaches the sync point first.
  assert.equal(existsSync(join(root, '.dpm')), false);

  const written = writeMarker(sql, { root });

  assert.equal(written, sha256(sql), 'the marker is not the hash of the dump it was handed');
  assert.equal(readFileSync(join(root, MARKER_PATH), 'utf8'), `${sha256(sql)}\n`,
    'the file holds something other than the hash and a newline');
  assert.equal(readMarker({ root }), written, 'the reader did not return what the writer wrote');

  // **The hash is over the bytes, with no normalisation** — which is what keeps the marker on the
  // same footing as the guard's regenerate-and-diff-bytes rule (AD8). A marker that agreed with a
  // dump the byte comparison calls different is a marker that reports clean on a divergence.
  const rewritten = writeMarker(`${sql}\n`, { root });

  assert.notEqual(rewritten, written, 'two dumps differing by one byte share a marker');
  assert.equal(readMarker({ root }), rewritten, 'the second write did not replace the first');
});

// --- Criterion 1, the absent case: two of AD13's five states -------------------------------------

test('an absent marker reads as null rather than raising [unit]', (t) => {
  const bare = ownedDirectory(t, 'dpm-marker-');

  // Absence is a finding, not an error: it is the state every database that exists today will be in
  // on its first run after this ships, and the guard has two verdicts for it.
  assert.equal(readMarker({ root: bare }), null, 'a root with no marker in it did not read as absent');
  assert.equal(readMarker({ root: join(bare, 'not-a-directory') }), null,
    'a root that does not exist did not read as absent');

  // The control, and it is what stops the two lines above being satisfied by a reader that returns
  // `null` unconditionally.
  writeMarker('anything at all', { root: bare });

  assert.equal(readMarker({ root: bare }), sha256('anything at all'));
});

// --- Criterion 2: git ignores it, and the verdict comes from the file dpm wrote -------------------

test('the marker is ignored by the pattern dpm wrote, and the dump still is not [integration]', (t) => {
  const root = ownedDirectory(t, 'dpm-marker-git-');

  initRepository(root);

  // Both files through the production writers: the ignore file by the module that writes it on a
  // first open (AD15), the marker by the module under test. Nothing here hand-writes a pattern.
  // The directory is the test's to create, exactly as it is `open()`'s in production — `writeIgnore`
  // takes a directory that already exists, because in production the ignore file has to land inside
  // one the caller made a moment earlier.
  mkdirSync(join(root, '.dpm'), { recursive: true });
  writeIgnore(join(root, '.dpm'));
  writeMarker(emptyDump(), { root });

  // The precondition, stated rather than assumed. `check-ignore` answers about a *path*, so without
  // this line every assertion below would pass against a marker that was never written and this
  // test would be checking that a pattern matches a string.
  assert.equal(existsSync(join(root, MARKER_PATH)), true, 'no marker was written to ignore');

  const checkIgnore = ignoreCheck(root);
  const marker = checkIgnore(MARKER_PATH);

  assert.equal(marker.ignored, true, 'the sync marker is not ignored');
  assert.ok(marker.source.includes(`.dpm/${IGNORE_FILE}`),
    `the verdict came from somewhere other than the file dpm wrote: ${marker.source}`);
  assert.ok(marker.source.includes(IGNORE_PATTERN),
    `a pattern other than dpm's decided it: ${marker.source}`);

  // And nothing about it in the porcelain, which is the question a user actually sees — a path can
  // be ignored and still be listed if it was tracked before it was ignored.
  const porcelain = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
    .stdout.split('\n').filter(Boolean);

  assert.deepEqual(porcelain.filter((line) => line.includes('dpm.db.synced')), [],
    `git reports the marker: ${porcelain.join(' | ')}`);

  // **The paired must-NOT, because the cheap way to satisfy every line above is a broader pattern.**
  // `.dpm/dpm.sql` is the committed artefact a clone restores from; swallowing it would break every
  // checkout while this test stayed green.
  const committed = checkIgnore('.dpm/dpm.sql');

  assert.equal(committed.ignored, false,
    `the committed dump is ignored, by ${committed.source || 'an unnamed rule'}`);
});
