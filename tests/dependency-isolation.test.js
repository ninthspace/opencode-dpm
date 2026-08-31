/**
 * Epic 01-02 Story 4 — zero runtime dependencies, and nothing that compiles.
 *
 * **The strongest fact here is one the story did not anticipate: there is no production install
 * tree at all.** The story was written expecting `dependencies` to hold `@opencode-ai/plugin` and
 * the checks to be about what that one entry drags in. It holds nothing — the SDK's `define` is
 * the identity function, so it is taken `import type` and erased before evaluation — and every one
 * of the 107 packages in the lockfile is marked `dev`. A user installing dpm installs nothing, so
 * "no native binary in the production tree" is not a sweep that came back empty, it is a tree that
 * does not exist. The epic records that amendment with its citation.
 *
 * **What this file does not re-check.** `plugin.test.js` already sweeps the tree for a shipped
 * `.node` and for `build/Release` under `node_modules`, both with controls, and `ci.test.js`
 * already asserts the isolated job runs the clean install inside an image with no compiler and no
 * Python. Repeating either here would put a second reading beside a working one, which is the
 * failure story 1 spent an afternoon on. What is added below is the *lockfile* — the one artefact
 * that says what an install would do before anyone runs one.
 *
 * **Why the clean install is not run from a test.** ENVX4 says the suite must not require network
 * access, and an `npm ci` inside it would. So the run itself happens in CI's isolated job and, on
 * a developer's machine, by hand: performed for this story with `PATH` cut down to Node's own
 * `bin`, so no `cc`, `gcc`, `g++`, `make`, `python`, `python3` or `node-gyp` was reachable. It
 * completed — 98 packages, exit 0 — with no `gyp info`, no `node-gyp rebuild`, no
 * `prebuild-install`, no `build/Release` and no `.node` anywhere in the tree. That is a run, and
 * the assertions below are what remain true of it afterwards.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SANCTIONED_DEV_DEPENDENCIES, lifecycleScripts, packageLock, packageManifest,
  unsanctionedDependencies,
} from './support/sources.js';

/** The lockfile's package map, minus the root entry, which describes this project rather than a dependency. */
const lockedPackages = () => Object.entries(packageLock().packages).filter(([path]) => path !== '');

/**
 * A version that names one build — no range operator, no dist-tag, no wildcard.
 *
 * The prerelease part allows a hyphen, which is not fussiness: the SDK's own version is
 * `0.0.0-beta-18684`, so a class of `[\w.]` rejects the one pin this story exists to check.
 */
const exact = (version) => /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version);

/**
 * The version half of a dependency spec: the spec itself, or the version an npm alias names.
 *
 * **Split structurally rather than matched, and the distinction has cost this project four false
 * results.** `npm:@opencode-ai/plugin@1.18.25` carries two `@` characters — one opening the scope
 * and one introducing the version — so anything asking whether the spec *contains* a version, or
 * splitting on the first `@`, answers a different question from the one being asked. The last `@`
 * is the only one that can introduce a version, because a package name may not contain one after
 * position zero.
 *
 * An alias naming no version falls out of that correctly rather than by a special case:
 * `npm:@opencode-ai/plugin` yields `opencode-ai/plugin`, which `exact` rejects — which is the right
 * answer, since an alias without a version is no more a pin than a dist-tag is.
 */
const versionOf = (spec) => (spec.startsWith('npm:') ? spec.slice(spec.lastIndexOf('@') + 1) : spec);

// --- Criterion 1: `dependencies` is empty, and the production install tree with it ---------------

test('the package declares no runtime dependency [unit]', () => {
  const manifest = packageManifest();

  assert.deepEqual(manifest.dependencies, {}, 'a runtime dependency arrived');
  assert.deepEqual(unsanctionedDependencies(manifest), [],
    'a development dependency arrived that no requirement sanctions');

  // The SDK is here and is here *for its types*. Named on both sides so the sanction and the
  // manifest cannot drift apart silently — the sanction list is what eleven tests read through.
  assert.ok(SANCTIONED_DEV_DEPENDENCIES.includes('@opencode-ai/plugin'));
  assert.ok(manifest.devDependencies['@opencode-ai/plugin'],
    'the SDK is not a development dependency, so the entry has nothing to type-check against');
  assert.equal(manifest.dependencies['@opencode-ai/plugin'], undefined,
    'the SDK moved to dependencies, which fetches its eight transitive packages for every user');

  for (const field of ['peerDependencies', 'optionalDependencies', 'bundledDependencies']) {
    assert.equal(manifest[field], undefined, `${field} is absent, not merely empty`);
  }
});

test('every package the lockfile holds is a development one, so a user installs nothing [unit]', () => {
  const locked = lockedPackages();

  // The control first, and it is the one this whole test turns on: an empty lockfile would satisfy
  // the assertion below without anything having been checked.
  assert.ok(locked.length > 50,
    `the lockfile holds ${locked.length} packages, so the sweep below examined almost nothing`);

  assert.deepEqual(locked.filter(([, entry]) => !entry.dev).map(([path]) => path), [],
    'a package would be installed by `npm ci --omit=dev`, so there is a production tree after all');

  // And the second control: the reading can tell a production entry from a development one. Without
  // it, a lockfile format that stopped emitting `dev` would report every package as production-free.
  assert.deepEqual([['node_modules/planted', { dev: false }], ...locked]
    .filter(([, entry]) => !entry.dev).map(([path]) => path), ['node_modules/planted'],
    'the reading cannot see a production dependency when one is there');
});

// --- Criterion 4: pinned to the version the tag resolves to, not to the tag ----------------------

test('every development dependency names one build rather than a range [unit]', () => {
  const { devDependencies } = packageManifest();

  for (const [name, version] of Object.entries(devDependencies)) {
    assert.ok(exact(versionOf(version)),
      `${name} is pinned to ${version}, which resolves to different builds on different days`);
  }

  // **The amendment this story made, asserted.** The criterion said "pinned to the `beta` tag"; a
  // manifest naming a tag is not a pin, and what is written down is the version the tag resolved
  // to when it was checked.
  assert.equal(devDependencies['@opencode-ai/plugin'], '0.0.0-beta-18684');
  assert.notEqual(devDependencies['@opencode-ai/plugin'], 'beta');

  // The control on `exact`, both ways, because a predicate that returned true for everything would
  // make the loop above unconditional.
  assert.equal(exact('0.0.0-beta-18684'), true);
  assert.equal(exact('5.9.3'), true);
  for (const range of ['^5.9.3', '~5.9.3', 'beta', 'latest', '*', '>=5', '5.x']) {
    assert.equal(exact(range), false, `${range} is read as an exact version`);
  }

  // And the manifest agrees with what was actually installed, which is the half a pin exists for.
  assert.equal(packageLock().packages['node_modules/@opencode-ai/plugin'].version, '0.0.0-beta-18684',
    'the lockfile resolved a different build from the one the manifest pins');

  // --- The alias, which is the same package at a second version (ADR 02-05) ---------------------

  // **The loop above now passes through `versionOf`, and that widened what it accepts** — so the
  // controls on the widening come first, before the alias is asserted through it. Without these,
  // a `versionOf` that returned something `exact` always liked would make the loop unconditional
  // for every aliased entry, which is the one entry class it was extended to cover.
  assert.equal(versionOf('npm:@opencode-ai/plugin@1.18.25'), '1.18.25');
  assert.equal(versionOf('5.9.3'), '5.9.3', 'a plain version is not read as an alias');
  for (const unpinned of ['npm:@opencode-ai/plugin@latest', 'npm:@opencode-ai/plugin@^1.18.25',
    'npm:@opencode-ai/plugin', 'npm:some-fork@beta']) {
    assert.equal(exact(versionOf(unpinned)), false,
      `${unpinned} is read as naming one build, so an alias could float`);
  }

  assert.equal(devDependencies['@opencode-ai/plugin-v1'], 'npm:@opencode-ai/plugin@1.18.25');

  // **What the alias resolved to, read from the lockfile's `name` rather than from the specifier.**
  // The manifest says where the alias was pointed; only the lockfile says where it landed, and the
  // `name` field is the package it actually is. Matching the resolved URL instead would be a
  // substring test over a string that contains the aliased path — the reading this project has had
  // go wrong four times.
  const aliased = packageLock().packages['node_modules/@opencode-ai/plugin-v1'];

  assert.ok(aliased, 'the alias is declared but nothing was installed under it');
  assert.equal(aliased.name, '@opencode-ai/plugin',
    'the alias resolved to some other package than the one it names');
  assert.equal(aliased.version, '1.18.25',
    'the lockfile resolved a different build from the one the alias pins');
  assert.equal(aliased.dev, true, 'the v1 SDK is not a development dependency, so a user fetches it');

  // And the two are genuinely two: one package name cannot be installed twice, which is the whole
  // reason ADR 02-05 reached for an alias rather than a second plain entry.
  assert.notEqual(aliased.version,
    packageLock().packages['node_modules/@opencode-ai/plugin'].version,
    'both SDK entries resolved to the same build, so one host is being typed against the other');
});

// --- Criterion 2 (must NOT): nothing in a production install compiles or ships a binary ----------

test('must NOT — a compile step reaches an install of this package [integration]', () => {
  const locked = lockedPackages();
  const withScripts = locked.filter(([, entry]) => entry.hasInstallScript);

  // **Named rather than counted, and not forbidden outright.** One package declares an install
  // script — `msgpackr-extract`, reached through `effect` from the SDK — and the honest claim is
  // not that it never runs but that it never runs for a user: it is `dev`, so `npm ci --omit=dev`
  // never fetches it. Asserting "no install scripts anywhere" would have been the stronger-sounding
  // sentence and a false one, and it would have failed the day the SDK arrived.
  for (const [path, entry] of withScripts) {
    assert.equal(entry.dev, true,
      `${path} declares an install script and is not a development dependency, so it runs for users`);
  }

  // What that script actually is, because the name is the thing that misled CI's grep for a whole
  // story: `node-gyp-build-optional-packages` *selects* a prebuilt for the platform and compiles
  // only when none matches. The prebuilts are in the lockfile as optional platform packages, which
  // is what makes the selection succeed with no compiler present.
  const prebuilts = locked.filter(([path]) => path.startsWith('node_modules/@msgpackr-extract/'));

  if (withScripts.length > 0) {
    assert.ok(prebuilts.length > 1,
      'a package compiles at install time with no prebuilt to select instead');
    assert.deepEqual(prebuilts.filter(([, entry]) => !entry.optional).map(([path]) => path), [],
      'a per-platform prebuilt is not optional, so an install on another platform would build it');
  }

  // The control: the reading sees an install script when there is one. `withScripts` being empty is
  // the passing answer to the loop above, and would be the wrong reason for it.
  assert.deepEqual([...locked, ['node_modules/planted', { hasInstallScript: true, dev: false }]]
    .filter(([, entry]) => entry.hasInstallScript).map(([path]) => path),
    [...withScripts.map(([path]) => path), 'node_modules/planted'],
    'the reading cannot see an install script when one is declared');
});

// --- Criterion 3: the clean install, and why it is not run from here -----------------------------

test('a clean production install has nothing to fetch, so it needs no toolchain [integration]', () => {
  // The argument this criterion actually rests on, made from the artefacts rather than from a run
  // the suite cannot perform offline: `dependencies` is empty and every locked package is `dev`, so
  // what `npm ci --omit=dev` installs is nothing. An install that fetches nothing cannot reach for
  // a compiler, and the environment it runs in stops mattering.
  const manifest = packageManifest();
  const locked = lockedPackages();

  assert.deepEqual(manifest.dependencies, {});
  assert.equal(locked.filter(([, entry]) => !entry.dev).length, 0);

  // The *development* install is the one that has something to do, and it is the one CI runs in an
  // image with no compiler and no Python. That job is asserted by `ci.test.js`; what is checked
  // here is that the project it runs against still declares the scripts it invokes, so a rename
  // would break loudly rather than leave the job checking a project that no longer exists.
  for (const script of ['test', 'typecheck', 'modules']) {
    assert.ok(manifest.scripts[script], `the isolated job runs npm run ${script}, which is not declared`);
  }

  // And nothing runs at install time on either path, which is the other way a toolchain gets
  // reached for — a `prepare` script is the one that fires on a git-URL install. Read through
  // `lifecycleScripts`, whose list is the union of the four this suite and three others each held
  // separately; this one had neither `prepublish` nor `build`.
  assert.deepEqual(lifecycleScripts(manifest), [],
    'a script runs during installation, so the install can reach for a toolchain after all');
});
