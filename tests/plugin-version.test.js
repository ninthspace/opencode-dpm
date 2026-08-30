/**
 * Epic 2 Story 2 — which release of dpm this process is.
 *
 * The stamp records the version of the plugin that last wrote, so a server has to be able to name
 * its own before it can write one. The neighbour check cannot supply it: that one reads the
 * *directory name* the plugin was loaded from, which is a version under the host's cache and is the
 * checkout's name in a working tree. Under `--plugin-dir` it yields nothing, honestly — and a
 * server developing dpm still writes rows, so a stamp it declined to write would leave the one
 * database most likely to meet two releases with nothing recorded.
 *
 * **Two of the four criteria are rejections, and both name a mechanism rather than an outcome** —
 * no derivation from the directory name, no read of `process.env`. Each is paired below with the
 * thing that would have caught it: a root whose directory name is a version and whose manifest says
 * something else, and a sweep of the module's own source with its comments stripped.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pluginRoot } from '../src/server/neighbour.ts';
import { pluginVersion } from '../src/server/plugin-version.ts';
import { packageManifest, withoutComments } from './support/sources.js';

const SOURCE = fileURLToPath(new URL('../src/server/plugin-version.ts', import.meta.url));
const source = readFileSync(SOURCE, 'utf8');

const code = withoutComments(source);

/** A reader answering like `readFileSync`, remembering the paths it was asked for. */
function manifestReader(contents) {
  const paths = [];

  const read = (path) => {
    paths.push(path);

    if (contents === null) throw new Error(`ENOENT: no such file or directory, open '${path}'`);

    return contents;
  };

  return { read, paths };
}

/** A manifest holding whatever `version` is given, including none. */
const manifest = (version) =>
  JSON.stringify(version === undefined ? { name: 'dpm' } : { name: 'dpm', version });

// --- Criterion 1: the version the manifest states ------------------------------------------------

test('the resolver returns the version the manifest states [unit]', () => {
  const reader = manifestReader(manifest('1.2.3'));

  assert.equal(pluginVersion('/cache/plugins/dpm/1.2.3', reader.read), '1.2.3');

  // One file, and it is the manifest beside the root it was handed — not a search upward, and not
  // a path assembled from anything else this process knows (ENVX2).
  assert.deepEqual(reader.paths, ['/cache/plugins/dpm/1.2.3/package.json']);
});

// --- Criterion 2: a working tree, where no version directory exists ------------------------------

test('the resolver answers from a working tree, where the root is not a version [unit]', () => {
  const root = pluginRoot();

  // The premise, asserted rather than assumed. This suite runs from a checkout, so the plugin root
  // is named for the directory dpm is developed in — and if that ever became a version string the
  // test below would be exercising the cache case while claiming to exercise this one.
  assert.match(basename(root), /^[a-z]/,
    'the working tree is named like a version, so this is not the case the criterion is about');

  const version = pluginVersion();

  assert.equal(typeof version, 'string');
  assert.equal(version, packageManifest().version,
    'the resolver and the manifest disagree about what this release is');

  // And it is a version rather than merely a non-empty string, which is what the resolver's own
  // type check would still admit.
  assert.match(version, /^\d+\.\d+\.\d+/);
});

// --- Criterion 3 (must NOT): the version derived from the directory's name -----------------------

test('the resolver ignores the directory name and reads the manifest [unit]', () => {
  // **A root whose name is a version and whose manifest says something else.** The two agree in
  // every real layout, which is exactly why a resolver reading the wrong one passes everywhere
  // until it meets a working tree. Here they are made to disagree, so only one answer is available.
  const reader = manifestReader(manifest('9.9.9'));

  assert.equal(pluginVersion('/cache/plugins/dpm/0.3.0', reader.read), '9.9.9');

  // **Two controls, because there are two ways for the manifest to say nothing and a fallback
  // could be reached by either.** Without them, "it did not return the directory name" is equally
  // true of a resolver that returns a constant, one that returns nothing at all, and one that
  // never ran; with only the first, a fallback sitting *after* the parse goes unseen, because a
  // reader that throws never reaches it. That is not hypothetical — the mutation run for this
  // criterion put the fallback exactly there, and the first control alone passed over it.
  const missing = manifestReader(null);

  assert.equal(pluginVersion('/cache/plugins/dpm/0.3.0', missing.read), null,
    'a resolver with no manifest to read still produced a version');
  assert.deepEqual(missing.paths, ['/cache/plugins/dpm/0.3.0/package.json'],
    'the resolver looked somewhere other than the manifest when the manifest was gone');

  const stateless = manifestReader(manifest(undefined));

  assert.equal(pluginVersion('/cache/plugins/dpm/0.3.0', stateless.read), null,
    'a manifest that parses and states no version fell back to the directory name');
});

test('a manifest that cannot yield a version yields null rather than a guess [unit]', () => {
  // Every way the file can fail to state a version, arriving as the one answer a caller can act
  // on. NFR2: a check that cannot complete degrades to could-not-check rather than throwing.
  for (const [label, contents] of [
    ['not JSON', 'this is not a manifest'],
    ['no version key', manifest(undefined)],
    ['a version that is not a string', JSON.stringify({ version: 3 })],
    ['an empty version', manifest('')],
    ['null', 'null'],
  ]) {
    assert.equal(pluginVersion('/cache/plugins/dpm/0.3.0', manifestReader(contents).read), null,
      `a manifest that is ${label} produced a version`);
  }

  // The control on the loop: the same call with a manifest that does state one. Without it, every
  // assertion above is satisfied by a resolver that returns null unconditionally.
  assert.equal(pluginVersion('/cache/plugins/dpm/0.3.0', manifestReader(manifest('0.4.0')).read),
    '0.4.0', 'the resolver returned null for a good manifest, so the nulls above mean nothing');
});

// --- Criterion 4 (must NOT): a value taken from the environment ----------------------------------

test('the resolver reads nothing from the environment [unit]', () => {
  assert.equal(code.includes('process.env'), false, 'the module reads process.env');

  // The control on the stripping: the string really is in the file, in the comment that explains
  // why it is not in the code. Without this line the assertion above would also pass over an empty
  // string, which is what a regex that stripped too much would leave.
  assert.equal(source.includes('process.env'), true, 'the comment explaining ENVX3 has gone');
  assert.ok(code.includes('readFileSync'), 'stripping comments removed the code as well');

  // And the behavioural half. A variable naming a root the resolver must not consult is set to a
  // directory that does not exist; the resolver still answers from the root it was given.
  const reader = manifestReader(manifest('5.6.7'));

  process.env.DPM_PLUGIN_ROOT = '/nowhere/at/all';
  process.env.CLAUDE_PLUGIN_ROOT = '/nowhere/at/all';

  try {
    assert.equal(pluginVersion('/cache/plugins/dpm/0.3.0', reader.read), '5.6.7');
    assert.deepEqual(reader.paths, [join('/cache/plugins/dpm/0.3.0', 'package.json')]);
  } finally {
    delete process.env.DPM_PLUGIN_ROOT;
    delete process.env.CLAUDE_PLUGIN_ROOT;
  }
});
