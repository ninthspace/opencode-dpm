/**
 * Story 0 — the two criteria about how dpm installs and how its suite runs:
 *
 * - "The whole suite runs from one command that needs no install step and no compiled
 *   dependency" [integration]
 * - "must NOT — a dependency is added whose install requires compilation" [unit]
 *
 * The must-NOT is asserted at the strongest point available: not "no dependency needing
 * compilation" but **no dependency at all**, plus every import under `dpm/` resolving to a
 * Node builtin or a file in this tree. A rule stated as "nothing non-stdlib is imported"
 * fails the moment a package arrives, whichever kind it is, and needs no list of which
 * packages compile.
 *
 * The remaining criterion — "`dpm/` is installable from the marketplace manifest as a plugin
 * alongside `cpm/`, with no build step" — is `[target]`: it needs a real install to assess,
 * and nothing here claims it. What is checked below is the half that can be: that the manifests
 * describe the same plugin and that no build step exists to run.
 *
 * **The marketplace half of that is gone, and it is gone rather than broken.** At v0.7.0 the plugin
 * sat inside the marketplace repository and the sibling `marketplace.json` listed it beside `cpm`,
 * so "the two manifests agree" was a check with two manifests to compare. This is a standalone fork
 * that takes no dependency on the marketplace — the file is not missing from this repository, it
 * was never part of it — so the comparison has lost its second term. Reading it from `..` is the
 * mistake `corpus.test.js` documents at length: a path out of the checkout answers with whatever
 * the developer happens to have on disk. What survives is the agreement between the two manifests
 * this repository does hold, which is where every version skew this test ever caught actually was.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  filesUnder, lifecycleScripts, moduleFilesUnder, packageManifest as readPackageManifest,
  sweepSourcesUnder, unsanctionedDependencies,
} from './support/sources.js';
import { auditImports } from './support/sweeps.js';

const DPM = join(import.meta.dirname, '..');

const json = (path) => JSON.parse(readFileSync(path, 'utf8'));

// **Through the shared reader**, which `sources.js` exists to be and which this file had a private
// copy of. Its own doc says five suites had each written their own read of this file; this was the
// sixth, and story 1 of this epic spent an afternoon on what a copy left behind does when the
// shared one learns something.
const packageManifest = readPackageManifest();
const pluginManifest = json(join(DPM, '.claude-plugin', 'plugin.json'));

/** Every module file dpm ships, tests included. */
const sourceFiles = () => moduleFilesUnder(DPM);

test('the plugin manifest and the package manifest describe the same plugin', () => {
  // The version skew this test exists to catch: two manifests in one repository, edited one at a
  // time. It was the marketplace entry and the plugin manifest at v0.7.0 and it is these two now,
  // and it is the same skew — a release bumped in one file and shipped from the other.
  assert.equal(pluginManifest.name, 'dpm');
  assert.equal(pluginManifest.version, packageManifest.version,
    'the plugin manifest and package.json name different versions of the same release');

  // **The entry point is a path, so it is asserted as one.** A plugin manifest naming a file that
  // is not there installs and then fails at the first tool call, which is the furthest possible
  // point from the edit that caused it. `${CLAUDE_PLUGIN_ROOT}` is the host's substitution for the
  // directory this manifest sits in, so stripping it resolves against `DPM`.
  const [command] = pluginManifest.mcpServers.dpm.args;
  const entryPoint = join(DPM, command.replace('${CLAUDE_PLUGIN_ROOT}/', ''));

  assert.notEqual(command, entryPoint, 'the specifier carries no plugin-root prefix to strip, so '
    + 'the path below is being resolved from something other than the manifest');
  assert.ok(existsSync(entryPoint), `the manifest starts ${command}, which is not in this tree`);
  assert.match(command, /\.ts$/, 'the entry point is the TypeScript source Node type-strips');
});

test('dpm declares no runtime dependency, and no development one ENVR3 does not require', () => {
  // **Narrowed, and the narrowing is a supersession rather than a relaxation.** This asserted
  // `devDependencies` deep-equals `{}`, which was true of v0.7.0 and is the state ENVR3 replaced:
  // the port is TypeScript that Node type-strips, and the type check that keeps it honest is
  // `tsc`, which has to come from somewhere. What the criterion protects is that *dpm itself* needs
  // no install — nothing it runs resolves out of `node_modules` — and that is asserted below and
  // in `reference-environment.test.js`, over the imports rather than over the manifest.
  assert.deepEqual(packageManifest.dependencies, {}, 'no runtime dependency');
  assert.deepEqual(unsanctionedDependencies(packageManifest), [],
    'a development dependency arrived that is neither the type checker nor its type definitions');

  // ENVR2's surviving half, asserted by name: whatever else is sanctioned, the runner is not.
  assert.equal(packageManifest.scripts.test, 'node --test');

  for (const field of ['peerDependencies', 'optionalDependencies', 'bundledDependencies']) {
    assert.equal(packageManifest[field], undefined, `${field} is absent, not merely empty`);
  }

  // The `node_modules` and lockfile assertions went the same way and for the same reason: both read
  // "nothing is installed", which stopped being the claim the moment ENVR3 required a compiler.
  // A lockfile is now wanted rather than forbidden — the type checker is pinned, and pinning it in
  // `devDependencies` without one leaves the version the check ran under unrecorded.
  assert.ok(existsSync(join(DPM, 'package-lock.json')),
    'the sanctioned development dependencies are not locked to the versions the check ran under');
});

test('there is no install step and nothing to compile', () => {
  // Read through `lifecycleScripts` rather than looped here, so the list of names lives in one
  // place: `v1-sdk.test.js` drives the same reading against a manifest carrying each of them in
  // turn, which is the only run in which this check has ever been seen to fail.
  assert.deepEqual(lifecycleScripts(packageManifest), [],
    'installing or publishing dpm runs something, so there is a step to forget');

  assert.equal(existsSync(join(DPM, 'binding.gyp')), false, 'no node-gyp build description');

  // **The walk skips `node_modules`, and the narrowing is what the sentence below already said.**
  // The claim is that dpm ships no native binary, and `dependencies` is `{}` — so a user
  // installing this plugin installs nothing at all and there is no binary for them to receive.
  // What a contributor's `node_modules` holds is a different question: `@opencode-ai/plugin` pulls
  // `effect`, which pulls `msgpackr`, which ships prebuilt `.node` binaries per platform. Reading
  // those as "dpm ships a native binary" would report a development install as a published one.
  //
  // The stronger half of the claim — that nothing *compiled* to produce them — is the assertion
  // after this one, and CI's isolated job runs the whole install in an image with no compiler and
  // no Python, which is the only place an absence like that can actually be shown.
  const shipped = filesUnder(DPM).filter((path) => path.endsWith('.node'));

  assert.deepEqual(shipped, [], 'no prebuilt native binary is shipped');

  // The control, because an empty list is what a walk that read nothing also returns: the same
  // reading finds a `.node` when there is one, and finds it through the same filter.
  assert.deepEqual([...filesUnder(DPM), join(DPM, 'planted.node')].filter((p) => p.endsWith('.node')),
    [join(DPM, 'planted.node')], 'the sweep cannot see a native binary when one is there');

  // And nothing compiled to produce what a development install *does* hold. `build/Release` is
  // node-gyp's output directory and is the artefact a compile leaves behind — the prebuilt
  // packages msgpackr selects between carry their binary at the package root instead.
  const built = readdirSync(join(DPM, 'node_modules'), { recursive: true })
    .map(String)
    .filter((entry) => entry.endsWith('/build/Release'));

  assert.deepEqual(built, [], 'a dependency compiled a native module during install');
});

test('every import under dpm resolves to a Node builtin or to this tree', () => {
  // **Reads through the shared sweep rather than a private one.** This file carried its own set of
  // four regexes over the raw text, and the port is what exposed the difference: they matched
  // inside string literals and regex literals, so `typescript-conversion.test.js` — whose fixtures
  // are TypeScript sources written as strings — reported three bare specifiers that no runtime ever
  // resolves. `auditImports` strips comments first and reads import statements rather than
  // quote-delimited text, and it is the reading `reference-environment.test.js` already trusts for
  // the same claim over `src/` and `bin/`.
  const { complaints, examined } = auditImports(sweepSourcesUnder(DPM));

  assert.deepEqual(complaints, [],
    'a bare specifier is a package, and a package is an install step — whether or not it compiles');
  assert.ok(examined > 500, `only ${examined} imports were examined, so the sweep is not looking`);

  // Planted through the real sweep, because the assertion above is an absence: this is the shape a
  // package arriving would take, and the shape the private regexes were reporting on a string is
  // not one — which is the whole of why they were replaced.
  assert.deepEqual(
    auditImports([{ name: 'planted.js', text: "import { x } from 'left-pad';" }]).complaints,
    ['planted.js imports left-pad, which is neither a node: builtin nor relative'],
  );
  assert.deepEqual(
    auditImports([{ name: 'planted.js', text: "const source = \"import x from 'left-pad';\";" }])
      .complaints,
    [], 'a specifier inside a string literal is reported as an import',
  );
});

test('the suite runs from one command, and it is a plain node --test invocation', () => {
  assert.equal(packageManifest.scripts.test, 'node --test');

  // The command has to reach every test file. `node --test` recurses from the working
  // directory, so the check is that no test file sits outside the tree it walks.
  const testFiles = sourceFiles().filter((path) => path.endsWith('.test.js'));
  assert.ok(testFiles.length > 0, 'there are test files for the command to find');
  for (const path of testFiles) {
    assert.ok(path.startsWith(DPM), `${path} is inside dpm/, so one run reaches it`);
  }
});

/**
 * Every tracked file under `dpm/`, as `{path, mode}` — the mode **git records**, not the one on
 * this disk.
 *
 * The distinction is the whole point of the test below. The plugin reaches a user as a clone, so
 * the executable bit that matters is the one in the index; a local `chmod` fixes a working tree
 * and ships nothing. A `statSync` check would pass on this machine and go on passing while every
 * install got a file it could not run.
 */
function trackedFiles() {
  // `cwd` and the pathspec are both `DPM` since the port: the plugin is the repository now, where
  // it used to be one directory inside the marketplace's. Left pointing at the parent, `git
  // ls-files` runs in whatever repository happens to contain this checkout — or in none.
  return execFileSync('git', ['ls-files', '-s', '--', DPM], { cwd: DPM, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((line) => ({ mode: line.split(' ')[0], path: line.slice(line.indexOf('\t') + 1) }));
}

test('a file with a shebang is executable in the index, and nothing else is', () => {
  const files = trackedFiles();

  assert.ok(files.length > 0, 'the check found tracked files to read');

  // **Two failures this could be, and they want different sentences.** The one the test is for is a
  // mode that drifted from a shebang. The one a fresh fork hits first is that the tree it is asking
  // about has not been committed at all — the modes are right on disk and recorded nowhere, which
  // is precisely the state this test says a `statSync` check could not tell apart from success.
  // Reported as its own assertion so the failure names the commit rather than the modes.
  assert.ok(files.some(({ path }) => path.startsWith('bin/')),
    `the index holds ${files.length} files and none under bin/, so the executables are untracked `
    + 'and the mode that ships is not recorded yet — commit the tree and this reads it');

  // **A third failure, and it wants its own sentence too.** The index and the working tree are
  // different things: a file deleted but not yet staged is still tracked, and reading it threw
  // `ENOENT: no such file or directory` — an error naming a path and nothing about why it was
  // being read. The mode question is moot for a file that is going away, so it is named here and
  // excluded below rather than crashed on.
  const missing = files.filter(({ path }) => !existsSync(join(DPM, path))).map(({ path }) => path);

  assert.deepEqual(missing, [],
    'the index tracks a file the working tree no longer has — stage the deletion and this reads '
    + 'the rest');

  // **Derived from the shebang rather than from a list of paths**, so a fifth binary added
  // without its mode fails here instead of being absent from a list nobody updated. `dpm-merge.ts`
  // shipped mode 644 for two epics precisely because nothing was watching, and every caller
  // reaches these files as an argument to `node`, which is why nothing ever failed.
  const present = files.filter(({ path }) => existsSync(join(DPM, path)));
  const shebanged = present
    .filter(({ path }) => readFileSync(join(DPM, path), 'utf8').startsWith('#!'))
    .map(({ path }) => path)
    .sort();
  const executable = present
    .filter(({ mode }) => mode === '100755')
    .map(({ path }) => path)
    .sort();

  assert.ok(shebanged.length > 0, 'there are files declaring an interpreter');

  // Both directions in one reading. A shebang without the bit is a file that cannot be run as
  // written; the bit without a shebang is a mode nothing asked for, and the pair that would drift
  // apart silently is exactly the pair the equality holds together.
  assert.deepEqual(executable, shebanged);

  // The control, and the reason the equality above is a fact about modes rather than about a
  // reading that returns the same list twice: an ordinary source file is tracked as 644.
  assert.equal(
    files.find(({ path }) => path === 'package.json').mode,
    '100644',
    'the reading distinguishes the two modes, so 100755 above was found rather than assumed',
  );
});

test('the running Node meets the floor the manifest declares', () => {
  const floor = packageManifest.engines.node;
  assert.match(floor, /^>=\d+\.\d+\.\d+$/, 'the floor is stated as a minimum version');

  const parse = (version) => version.replace(/^>=/, '').split('.').map(Number);
  const [wantMajor, wantMinor, wantPatch] = parse(floor);
  const [haveMajor, haveMinor, havePatch] = parse(process.versions.node);

  const meets =
    haveMajor > wantMajor ||
    (haveMajor === wantMajor &&
      (haveMinor > wantMinor || (haveMinor === wantMinor && havePatch >= wantPatch)));

  assert.ok(meets, `node ${process.versions.node} is below the declared floor ${floor}`);
});
