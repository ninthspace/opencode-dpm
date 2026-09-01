/**
 * Epic 02-02 Story 2 — registration copies the name it is given and composes nothing.
 *
 * The prefix ADR 01-05 turns on used to be applied here, at registration: `ID_PREFIX` in
 * `src/plugin/skills.ts` prepended `dpm-` to a directory called `do`, and `registration.ts`
 * registered the result. A skill's identity was therefore half on disk and half in a constant, and
 * nothing on disk said what a skill was called. Story 1 put the name on the tree; this story takes
 * the constant out.
 *
 * **The decision is unchanged and the string is unchanged, which is the only reason this is safe.**
 * ADR 01-05 records that a registered name is effectively permanent from the first publish, because
 * renaming it breaks every invocation of it. So the criterion that matters most here is not that
 * the constant is gone — it is that removing it moved nothing.
 *
 * **Reading for the constant is the trap this file is written around.** `ID_PREFIX` still appears
 * five times under `src/`, in the doc comments explaining why it no longer exists. A sweep for the
 * word would report those and be silenced by deleting the explanations, which is a check that
 * destroys the thing worth keeping. So the sweep strips comments first — `withoutComments`, the
 * same one four other suites use — and what it looks for is a *declaration*, not a mention. Library
 * lesson 04: never match on a string another string can contain.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { PREFIX, skillNames } from './support/skills.js';
import { sweepSourcesUnder, withoutComments } from './support/sources.js';
import { packageTree, skillSource as plantedSkill } from './support/package-tree.js';
import { discoverSkills } from '../src/plugin/skills.ts';
import { skillSources } from '../src/plugin/registration.ts';

const ROOT = join(import.meta.dirname, '..');
const PLUGIN = join(ROOT, 'src', 'plugin');

/** What dpm ships, named so a reading that walked nothing is reported rather than passed. */
const CORPUS = 23;

/**
 * A constant being *declared* with a namespace prefix as its value, in code rather than prose.
 *
 * Two halves, and both are needed. The name half is deliberately not `ID_PREFIX` — the criterion
 * says "any other registration-time prefixing constant", and a check naming the old identifier
 * would be passed by the same constant called `SKILL_PREFIX`, which is the reintroduction anyone
 * would actually write. The value half is what keeps it from firing on every constant in the tree:
 * what is forbidden is binding a namespace fragment to a name, ready to be composed onto something.
 */
const DECLARES_PREFIX = /(?:const|let|var)\s+[A-Z_]*(?:PREFIX|NAMESPACE)[A-Z_]*\s*(?::[^=]+)?=\s*['"`]/;

/** The same reading over a directory, as `{name, text}` with the prose taken out. */
const declarations = (directory) => sweepSourcesUnder(directory)
  .filter(({ text }) => DECLARES_PREFIX.test(withoutComments(text)))
  .map(({ name }) => name);

// --- Criterion 1: the name comes off the front matter, uncomposed ---------------------------------

test('registration registers each skill under the name its front matter declares [unit]', () => {
  const sources = skillSources({});
  const discovered = discoverSkills(ROOT);

  assert.equal(discovered.length, CORPUS, `${discovered.length} skills were discovered`);
  assert.equal(sources.length, CORPUS, `${sources.length} skills were registered`);

  // **Pairwise, not as two sorted lists.** Two lists that agree as sets would also agree if
  // registration paired every name with the wrong body — and a skill registered under a
  // neighbour's name is exactly the failure a composition bug produces.
  for (const skill of discovered) {
    const registered = sources.filter((source) => source.skill.name === skill.name);

    assert.equal(registered.length, 1, `${skill.name} registered ${registered.length} times`);
    assert.equal(registered[0].skill.location, skill.location,
      `${skill.name} registered against a body that is not its own`);
  }
});

test('the registered name is the declared name, added to and stripped of nothing [unit]', () => {
  // The composition, if one had survived, is what this catches: `dpm-dpm-do` and `do` both fail a
  // strict equality against the declared name, and neither would fail a `startsWith(PREFIX)`.
  const wrong = skillSources({})
    .map(({ skill }) => skill.name)
    .filter((name) => !skillNames().includes(name));

  assert.deepEqual(wrong, [],
    'a registered name is not a name the tree declares, so something is still composing it');
});

// --- Criterion 2: the string that comes out is the string that came out before --------------------

test('every registered name is the one ADR 01-05 made permanent at the first publish [unit]', () => {
  // **Transcribed, and it has to be.** This is the one list in the epic that may not be derived:
  // deriving it from the tree would make the check read its answer off the thing it is checking,
  // and what the criterion asks is whether the *new* route produces the *old* strings. These are
  // the twenty-three ids v0.7.0 published and every description still tells a reader to invoke.
  const published = [
    'dpm-architect', 'dpm-archive', 'dpm-artifact', 'dpm-audit', 'dpm-brief', 'dpm-clean',
    'dpm-consult', 'dpm-discover', 'dpm-do', 'dpm-epics', 'dpm-inspect', 'dpm-library',
    'dpm-party', 'dpm-pivot', 'dpm-present', 'dpm-publish', 'dpm-quick', 'dpm-ralph',
    'dpm-retro', 'dpm-review', 'dpm-spec', 'dpm-status', 'dpm-templates',
  ];

  assert.equal(published.length, CORPUS, 'the transcribed list is not the corpus');
  assert.deepEqual(skillSources({}).map(({ skill }) => skill.name).sort(), published,
    'the set of registered names changed, and ADR 01-05 records a registered name as permanent');
});

// --- Criterion 3: the constant is gone, and a reintroduction is caught -----------------------------

test('no registration-time prefixing constant is declared under src/plugin [unit]', () => {
  const swept = sweepSourcesUnder(PLUGIN);

  // Named before it is judged, because a sweep over an empty walk reports clean.
  assert.ok(swept.length >= 6, `${swept.length} modules were swept, which is not src/plugin`);

  assert.deepEqual(declarations(PLUGIN), [],
    'a module under src/plugin declares a prefix constant, and the prefix belongs on the tree');
});

test('the sweep finds a reintroduction, and is not fooled by the prose about it [unit, control]', () => {
  // **The planted reintroduction the criterion names**, in each of the two shapes it would take:
  // the old name back, and a new name doing the same job. Both are declarations of a namespace
  // fragment waiting to be composed onto something.
  for (const planted of [
    "export const ID_PREFIX = 'dpm-';",
    "const SKILL_PREFIX = 'dpm-';",
    'const NAME_PREFIX: string = "dpm-";',
    "let CATALOGUE_NAMESPACE = 'dpm-'",
  ]) {
    assert.equal(DECLARES_PREFIX.test(withoutComments(planted)), true,
      `a reintroduction was not caught: ${planted}`);
  }

  // **And the other half, which is the one that matters.** Five doc comments under `src/` explain
  // that `ID_PREFIX` was removed and name it while doing so. A sweep that reported those would be
  // silenced by deleting the explanation — a check that passes by destroying the record of why it
  // exists. It is also what `src/plugin/` actually contains right now, so this is not hypothetical.
  for (const innocent of [
    ' * `ID_PREFIX` is a registration decision that used to live here.',
    "// This used to be `const ID_PREFIX = 'dpm-'` and epic 02-02 deleted it.",
    "/* const SKILL_PREFIX = 'dpm-'; */",
    "export const SHARED_DIRECTORY = 'shared';",
    "export const SKILL_FILE = 'SKILL.md';",
  ]) {
    assert.equal(DECLARES_PREFIX.test(withoutComments(innocent)), false,
      `the sweep fired on something that composes nothing: ${innocent}`);
  }
});

test('discovery hands back what the tree declares, whatever the tree declares [unit, control]', (t) => {
  // **The control on criterion 1**, and it needs a tree dpm does not own. Against the real corpus
  // every declared name already carries the prefix, so a discoverer that had gone on prepending one
  // would produce `dpm-dpm-do` — visible — but one that *stripped* to a bare word, or that fell
  // back to the directory, would be invisible where the two agree. Here they disagree on purpose.
  const root = packageTree(t, {
    'oddly-named': plantedSkill('dpm-declared', 'A skill whose directory and name differ.'),
    'dpm-plain': plantedSkill('dpm-plain', 'A skill whose directory and name agree.'),
  });

  assert.deepEqual(discoverSkills(root).map((skill) => skill.name).sort(),
    ['dpm-declared', 'dpm-plain'],
    'discovery returned something other than the names the front matter declares');

  // And nothing was prepended to either, which is the same reading stated as the absence.
  assert.deepEqual(
    discoverSkills(root).filter((skill) => skill.name.startsWith(`${PREFIX}${PREFIX}`)), [],
    'discovery prefixed a name that already carried the prefix',
  );
});
