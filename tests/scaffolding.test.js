/**
 * Epic 1 story 1 — the test scaffolding the neighbour check is built against.
 *
 * The helpers here are themselves test machinery, which is why they need cover of their own. A
 * fixture builder that silently built nothing would hand every test above it an empty directory,
 * and a check reading an empty directory finds no newer sibling — so the whole suite would go green
 * while proving nothing. Reading the sibling names back is what distinguishes the two.
 *
 * `ownedDirectory` predates this story and had no test at all, despite ten files importing it. It
 * gets one here for the same reason: nothing had ever confirmed that the directory it promises to
 * remove is actually removed, so every suite relying on that promise was relying on a reading of the
 * source.
 *
 * The removal pair follows `harness.test.js`: `node --test` runs a file's tests sequentially and a
 * test's `after` hooks run before the next one starts, so the work happens in the first test and the
 * observation in the second. The observing test states that dependence rather than assuming it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ownedDirectory } from './support/scratch.js';
import { pluginCache as cacheOf } from './support/plugin-cache.js';

/** Every cache this file builds is named for it, so an orphan left by a crashed run is traceable. */
const pluginCache = (t, versions, options = {}) =>
  cacheOf(t, versions, { prefix: 'dpm-scaffold-', ...options });

// --- ENV3: a stand-in for the plugin cache layout --------------------------------------------------

test('a constructed cache holds the siblings it was given, and names the one being run from [unit]',
  (t) => {
    const { cache, root, versions } = pluginCache(t, ['0.2.0', '0.3.0', '0.4.0'], {
      running: '0.3.0',
    });

    // The criterion: the names go in and the same names come back off disk. An assertion that the
    // directory merely exists would hold over an empty one, which is the failure this fixture would
    // cause everywhere else and nowhere visibly.
    assert.deepEqual(readdirSync(cache).sort(), ['0.2.0', '0.3.0', '0.4.0']);
    assert.deepEqual(versions, ['0.2.0', '0.3.0', '0.4.0'], 'and are reported as given');

    assert.equal(root, join(cache, '0.3.0'), 'the root is the nominated sibling, not the newest');
    assert.ok(statSync(root).isDirectory(), 'and it is a directory that is really there');
  });

test('the running sibling defaults to the last one given [unit]', (t) => {
  const { cache, root } = pluginCache(t, ['0.3.0', '0.4.0']);

  assert.equal(root, join(cache, '0.4.0'));

  // **The path is a string, and a string is not a directory.** Written without the line below, this
  // test survived a builder mutated to create nothing at all — it was asserting how `pluginCache`
  // composes a path, which is true whether or not anything was ever made.
  assert.ok(statSync(root).isDirectory(), 'the default root is a directory that exists');
});

test('a cache can hold something that is not a plugin [unit]', (t) => {
  const { cache } = pluginCache(t, ['0.4.0'], { files: ['.last_inuse_sweep'] });

  assert.deepEqual(readdirSync(cache).sort(), ['.last_inuse_sweep', '0.4.0']);
  assert.equal(statSync(join(cache, '.last_inuse_sweep')).isDirectory(), false,
    'the sibling that is not a directory is not a directory');
});

/**
 * The control on all three above.
 *
 * A fixture builder is only trustworthy if it refuses to build the wrong thing, and the wrong thing
 * here is a root that no sibling backs. Were `pluginCache` to create the directory instead, a caller
 * that mistyped a version would get a cache whose siblings do not include the one it thinks it is
 * running from — the check under test would then compare against a set it was never meant to see and
 * report a skew, or fail to, for a reason having nothing to do with its own logic.
 */
test('a running directory that no sibling backs is refused rather than created [unit]', (t) => {
  assert.throws(
    () => pluginCache(t, ['0.3.0', '0.4.0'], { running: '0.5.0' }),
    /0\.5\.0 is not among the siblings/,
    'the builder makes a directory the caller did not ask for',
  );

  assert.throws(
    () => pluginCache(t, []),
    /is not among the siblings/,
    'an empty cache resolves its running directory to undefined and fails about a path instead',
  );
});

// --- ENV6: a temporary location the suite creates, writes to, and removes ---------------------------

let writtenFile = null;
let writtenDirectory = null;

test('a test creates a temporary location and writes into it [unit]', (t) => {
  writtenDirectory = ownedDirectory(t, 'dpm-scaffold-owned-');
  writtenFile = join(writtenDirectory, 'written.txt');

  writeFileSync(writtenFile, 'content this test put there');

  assert.equal(existsSync(writtenFile), true, 'the write landed inside the temporary location');
});

test('that location and everything in it is gone once the test has ended [unit]', () => {
  assert.ok(writtenDirectory, 'these tests depend on running in order, in one process');

  assert.equal(existsSync(writtenFile), false, 'the file the previous test wrote was removed');
  assert.equal(existsSync(writtenDirectory), false, 'and so was the directory holding it');
});
