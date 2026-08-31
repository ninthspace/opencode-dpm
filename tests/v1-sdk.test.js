/**
 * Epic 02-01 Story 1 — the second SDK, typed against both hosts.
 *
 * **What this file is for, and what it deliberately leaves to others.** Four of the story's five
 * criteria name a *planted control* — "a planted runtime entry fails the check", "a planted
 * `--import` in a package script fails the check" — and a control is the one thing the existing
 * suites do not have for these rules. They assert the tree passes; none of them has ever seen its
 * own check fail, which is the state this project keeps rediscovering as a false pass. So the
 * readings here are the real ones, driven against planted manifests rather than restated.
 *
 * What is **not** here, because it is already asserted where the reading lives:
 *
 * - The alias's manifest entry and what it resolved to — `dependency-isolation.test.js`, beside
 *   the pin rule it is a case of.
 * - `dependencies` deep-equalling `{}` — nine suites, through `unsanctionedDependencies`.
 * - A value import of either SDK failing the sweep, and a type-only import of an unsanctioned
 *   package failing it — `module-sweep.test.js`, beside the rule itself.
 * - `tsc --noEmit` exiting zero over the whole tree — `typescript-conversion.test.js`.
 *
 * Repeating any of those here would be the second reading retro 02 recorded six times in one epic.
 * What remains is the half none of them can speak for: that both hosts are actually *in* the type
 * graph `tsc` checked, which is a fact about `src/plugin/hosts.ts` naming two specifiers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LIFECYCLE_SCRIPTS, SDK_PACKAGES, lifecycleScripts, nodeRuntimeArguments, packageManifest,
  typeOnlyImports, unsanctionedDependencies,
} from './support/sources.js';

const ROOT = join(import.meta.dirname, '..');

/** The manifest with one field replaced, for driving a reading against something that must fail. */
const planted = (field, value) => ({ ...packageManifest(), [field]: value });

// --- Criterion 1: both SDK versions in the type graph --------------------------------------------

test('one module names both host SDKs, which is what puts both in the type graph [unit]', () => {
  // **The claim `tsc --noEmit` cannot make on its own.** It exits zero over whatever program it was
  // given, and a program containing one SDK exits zero exactly as readily as one containing two. So
  // the check is which specifiers the tree actually names, read through `typeOnlyImports` rather
  // than by grepping for the strings — the two disagree on `import { type X }`, and a grep would
  // count a mention in a comment.
  const source = readFileSync(join(ROOT, 'src', 'plugin', 'hosts.ts'), 'utf8');
  const named = typeOnlyImports(source);

  assert.deepEqual([...named].sort(), [...SDK_PACKAGES].sort(),
    'the module that exists to name both hosts does not name exactly both');

  // And type-only, which is the half that keeps `dependencies` empty: a value import of either
  // would be a runtime dependency on an SDK whose `define` is the identity function.
  assert.deepEqual(
    typeOnlyImports("import { Plugin } from '@opencode-ai/plugin';"), [],
    'the reading counts a value import as type-only, so the assertion above proves nothing',
  );
  assert.deepEqual(
    typeOnlyImports("import type { Plugin } from '@opencode-ai/plugin';"), ['@opencode-ai/plugin'],
    'the reading no longer sees a type-only import at all',
  );
});

// --- Criterion 2: `dependencies` empty, both SDKs under `devDependencies` -------------------------

test('both SDK entries are development ones, and a planted runtime entry fails the check [unit]', () => {
  const manifest = packageManifest();

  for (const sdk of SDK_PACKAGES) {
    assert.ok(manifest.devDependencies[sdk], `${sdk} is not declared as a development dependency`);
    assert.equal(manifest.dependencies[sdk], undefined, `${sdk} is declared to install for a user`);
  }

  // **The control, driven through the real reading against a planted manifest.** Without it the
  // assertions above hold for a `unsanctionedDependencies` that returns `[]` unconditionally —
  // and an empty answer is what both a clean manifest and a broken reading produce.
  assert.deepEqual(unsanctionedDependencies(), [], 'the tree itself declares something unsanctioned');

  assert.deepEqual(
    unsanctionedDependencies(planted('dependencies', { '@opencode-ai/plugin': '0.0.0-beta-18684' })),
    ['@opencode-ai/plugin@0.0.0-beta-18684'],
    'an SDK moved to `dependencies` is not reported, so nothing is watching the one field NFR2 names',
  );

  // A *sanctioned* name is still a finding when it is declared to install, which is the case a
  // rule written as "is this name allowed" would wave through — the field is the subject here.
  assert.deepEqual(
    unsanctionedDependencies(planted('dependencies', { marked: '^12.0.0' })),
    ['marked@^12.0.0'],
    'an unsanctioned runtime dependency is not reported',
  );
});

// --- Criterion 4 (must NOT): no loader, no transpiler, no argument before the entry path ----------

test('must NOT — a package script hands node an argument before its entry path [unit]', () => {
  // **Every script, not the test one.** ADR 01-03's rule is that dpm runs TypeScript natively under
  // plain `node`; a loader would arrive in whichever script needed it, and `modules` and `skills`
  // each invoke `node` on a `.ts` file with no flag between. `--test` is the runner ENVR2 names and
  // is excluded by name in the reading, which is why the control below plants a flag beside it.
  assert.deepEqual(nodeRuntimeArguments(), [],
    'a package script passes node an argument beyond the file it runs');

  for (const [where, scripts] of [
    ['before an entry path', { modules: 'node --import=./register.mjs scripts/module-sweep.ts' }],
    ['beside the runner', { test: 'node --test --experimental-strip-types' }],
    ['as a transpiler', { skills: 'node --experimental-transform-types scripts/skill-body-check.ts' }],
  ]) {
    assert.notDeepEqual(nodeRuntimeArguments(planted('scripts', scripts)), [],
      `a flag planted ${where} is not reported, so the rule is guarding nothing`);
  }

  // The other side, and it is the half that stops the reading from complaining unconditionally:
  // the runner's own flag is not a finding, and neither is an argument the *script* receives.
  assert.deepEqual(nodeRuntimeArguments(planted('scripts', { test: 'node --test' })), []);
  assert.deepEqual(nodeRuntimeArguments(planted('scripts', { m: 'node scripts/x.ts --verbose' })), [],
    'an argument to the script is read as an argument to node');
  assert.deepEqual(nodeRuntimeArguments(planted('scripts', { typecheck: 'tsc --noEmit' })), [],
    'a command that is not node is judged by a rule about how node loads modules');
});

// --- Criterion 5: no build script, and `tsc` stays a check ---------------------------------------

test('there is no build step, and a planted build script fails the check [unit]', () => {
  assert.deepEqual(lifecycleScripts(), [],
    'installing or publishing dpm now runs something, so there is a step to forget');

  // `tsc --noEmit` is the whole of the type check, and `--noEmit` is what keeps it a check: without
  // it the same command becomes a build producing output nobody installs.
  assert.equal(packageManifest().scripts.typecheck, 'tsc --noEmit');

  // The control, one per script name rather than one for the set — a reading that had stopped
  // seeing `prepare` would still report `build`, and the loop above would look like it was working.
  // Driven from `LIFECYCLE_SCRIPTS` rather than from a list written out here, because a second copy
  // of that list is the defect this reading was extracted to end: four suites held one each, they
  // disagreed on `prepack`, `prepublish` and `build`, and every one of them passed.
  assert.ok(LIFECYCLE_SCRIPTS.length >= 7,
    `LIFECYCLE_SCRIPTS holds ${LIFECYCLE_SCRIPTS.length} names, so the loop below drives almost nothing`);

  for (const name of LIFECYCLE_SCRIPTS) {
    assert.deepEqual(lifecycleScripts(planted('scripts', { [name]: 'tsc' })), [name],
      `a planted ${name} script is not reported`);
  }
});
