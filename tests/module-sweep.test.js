/**
 * Epic 01-01 Story 6 — the module sweep, and the control that says it can fail.
 *
 * Three criteria: every import under `src/` and `bin/` resolves; the sweep runs as a step separate
 * from the suite; and a deliberately extension-less internal import makes it fail.
 *
 * **The third is the one that gives the first any weight, and it is a criterion in its own right
 * rather than a control somebody remembered to add.** A sweep reporting nothing wrong and a sweep
 * that walked an empty directory produce the same output, and the second is the more likely of the
 * two after a port that moved every file: `tests/support/sources.js` filtered on `.endsWith('.js')`
 * and would have returned zero modules for `src/` the moment the rename landed. So the failures are
 * planted into a scratch tree and driven through the real `sweep`, not described.
 *
 * **`[integration]`, because the separation is the point.** The sweep's whole reason for existing is
 * that a test suite reaches a module by importing it and therefore says nothing about a module
 * nothing imports — so this file asserts *that the sweep exists and works*, and does not reimplement
 * what it does. A test that walked `src/` itself would be the thing NFR5 says cannot make this
 * claim.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageManifest } from './support/sources.js';
import { runNode } from './support/run-node.js';
import { sweep, specifiersIn, typeSpecifiersIn } from '../scripts/module-sweep.ts';

const ROOT = join(import.meta.dirname, '..');
const SWEEP = join(ROOT, 'scripts', 'module-sweep.ts');

/**
 * A scratch tree with `src/` and `bin/`, written from `files` as `{ 'src/x.ts': 'source' }`.
 *
 * Built rather than copied from this repository: a control has to be able to hold a *broken*
 * import, and the one place this project may not put one is in its own `src/`.
 */
function planted(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'dpm-sweep-'));

  t.after(() => rmSync(root, { recursive: true, force: true }));

  for (const [path, source] of Object.entries(files)) {
    const at = join(root, path);

    mkdirSync(join(at, '..'), { recursive: true });
    writeFileSync(at, source);
  }

  return root;
}

const GOOD = {
  'src/leaf.ts': 'export const value = 1;\n',
  'src/branch.ts': "import { value } from './leaf.ts';\nexport const doubled = value * 2;\n",
  'bin/entry.ts': "const { doubled } = await import('../src/branch.ts');\nexport default doubled;\n",
};

// --- Criterion 1: every import under src/ and bin/ resolves ---------------------------------------

test('every import under src/ and bin/ resolves in this repository [integration]', async () => {
  const complaints = await sweep();

  assert.deepEqual(complaints, [], 'a specifier under src/ or bin/ does not resolve');
});

test('the sweep reads dynamic imports, which is how all five executables reach src/ [unit]', () => {
  // **The reading that a static-only sweep gets wrong, and gets wrong silently.** Each executable
  // imports the plugin through `await import(...)`, deliberately — a static import would be hoisted
  // above the Node-floor check and crash before it ran. A sweep blind to the dynamic form would
  // report all five as naming no internal import at all, and pass.
  assert.deepEqual(specifiersIn("const { run } = await import('../src/guard/main.ts');"),
    ['../src/guard/main.ts']);
  assert.deepEqual(specifiersIn("import { x } from './a.ts';\nawait import('./b.ts');"),
    ['./a.ts', './b.ts']);

  // And the two it must not read: a comment, and a specifier that is not a literal. The second is a
  // stated limit rather than an oversight — nothing in this tree writes one, and `sources.js` makes
  // the same argument for the same reason.
  assert.deepEqual(specifiersIn("// await import('./commented.ts');"), []);
  assert.deepEqual(specifiersIn('await import(computed);'), []);
});

// --- Criterion 3: the control, driven rather than described ---------------------------------------

test('an extension-less internal import makes the sweep fail [integration]', async (t) => {
  const root = planted(t, {
    ...GOOD,
    'src/broken.ts': "import { value } from './leaf';\nexport const twice = value * 2;\n",
  });

  const complaints = await sweep({ root });
  const named = complaints.filter(({ specifier }) => specifier === './leaf');

  assert.equal(named.length, 1, `the sweep did not report './leaf':\n${JSON.stringify(complaints)}`);
  assert.equal(named[0].file, 'src/broken.ts', 'the complaint does not say which file names it');
  assert.match(named[0].reason, /no extension/, 'the complaint does not say what is wrong with it');
});

test('a stale .js specifier pointing at a .ts file makes the sweep fail [integration]', async (t) => {
  // **The failure the port could actually have left behind**, and the one the suite is least able
  // to catch: 630 specifiers were rewritten, and a `.js` surviving in a module nothing imports
  // resolves to nothing on the day someone runs the command that loads it. Asserted in `bin/`,
  // which the sweep resolves without importing — so this is also the evidence that the resolve-only
  // half is doing work rather than passing everything.
  const root = planted(t, {
    ...GOOD,
    'bin/stale.ts': "const { value } = await import('../src/leaf.js');\nexport default value;\n",
  });

  const complaints = await sweep({ root });

  assert.deepEqual(complaints.map(({ file, specifier }) => `${file} → ${specifier}`),
    ['bin/stale.ts → ../src/leaf.js'], 'the sweep did not report the stale extension, or reported '
    + 'something else as well');
  assert.match(complaints[0].reason, /not there/);
});

test('a bare specifier makes the sweep fail, even though node_modules would resolve it [integration]', async (t) => {
  // ENVX1 arriving through the sweep, and the one complaint that is *not* about a file being
  // absent. It matters in **this** repository rather than in the scratch tree: `typescript` is
  // installed here, so a sweep that only tried to resolve would find it under `node_modules` and
  // report the plugin clean while it had grown a dependency it must not have. The bare-specifier
  // rule is what closes that, and it is checked here because a planted import in this repository's
  // own `src/` is the one thing this story may not write.
  const root = planted(t, {
    ...GOOD,
    'src/packaged.ts': "import ts from 'typescript';\nexport default ts;\n",
  });

  const bare = (await sweep({ root })).filter(({ specifier }) => specifier === 'typescript');

  assert.equal(bare.length, 1, 'the sweep did not report the bare specifier');
  assert.match(bare[0].reason, /is a package/);
  assert.equal(bare[0].file, 'src/packaged.ts');

  // The load failure that accompanies it is a second, weaker reading of the same file — the scratch
  // tree has no `node_modules` above it, so the import fails there too. Asserted so the count is
  // accounted for rather than filtered past: in this repository only the first would fire, which is
  // exactly why the rule cannot be left to resolution.
  assert.deepEqual((await sweep({ root })).map(({ file }) => file),
    ['src/packaged.ts', 'src/packaged.ts']);
});

// --- The type-only recognition rule (Epic 02-01 Story 1, NFR2) -------------------------------------

test('a type-only import of an unsanctioned package makes the sweep fail [integration]', async (t) => {
  // **The rule exists because nothing else in this project can see this line.** `import type` is
  // erased before evaluation, so the bare-specifier rule never receives it, `staticImports` skips
  // it, and `dependencies` staying empty says nothing about it — all correct, and between them
  // they leave the specifier unread. Once two SDKs publish under one package name at two versions,
  // that specifier is the only thing saying which host a module is typed against.
  const root = planted(t, {
    ...GOOD,
    'src/typed.ts': "import type { Token } from 'marked';\nexport type T = Token;\n",
  });

  const complaints = await sweep({ root });

  // Exactly one, and that is the assertion rather than a filter: the file loads cleanly, because
  // the import it names is erased. A second complaint here would mean the tree was broken for some
  // other reason and this test was reading that instead.
  assert.equal(complaints.length, 1, JSON.stringify(complaints));
  assert.equal(complaints[0].file, 'src/typed.ts');
  assert.equal(complaints[0].specifier, 'marked');
  assert.match(complaints[0].reason, /imported for its types/);
});

test('a type-only import of a host SDK passes, through the root and through a subpath [integration]', async (t) => {
  // The other direction, and without it the test above holds for a rule that complains about every
  // type-only import — which would pass that assertion and fail this repository.
  const root = planted(t, {
    ...GOOD,
    'src/v2.ts': "import type { Plugin } from '@opencode-ai/plugin';\nexport type A = Plugin;\n",
    'src/v1.ts': "import type { Plugin } from '@opencode-ai/plugin-v1';\nexport type B = Plugin;\n",
    'src/sub.ts': "import type { Skill } from '@opencode-ai/schema/skill';\nexport type C = Skill;\n",
  });

  assert.deepEqual(await sweep({ root }), [],
    'a sanctioned host type surface was reported, so the rule cannot be satisfied');
});

test('a value import of either SDK still fails, which the type rule must not have relaxed [integration]', async (t) => {
  // **Both SDKs, because the point of the alias is that they are one package at two versions** —
  // and a rule that learned to permit an SDK *name* could permit it in the wrong half. What makes
  // this safe is that the two readings are separate: `unresolved` judges what is evaluated and
  // never consults the SDK list, so permitting a type import cannot widen the runtime rule.
  const root = planted(t, {
    ...GOOD,
    'src/value-v2.ts': "import { Plugin } from '@opencode-ai/plugin';\nexport default Plugin;\n",
    'src/value-v1.ts': "import { Plugin } from '@opencode-ai/plugin-v1';\nexport default Plugin;\n",
  });

  const bare = (await sweep({ root })).filter(({ reason }) => /is a package/.test(reason));

  assert.deepEqual(bare.map(({ specifier }) => specifier).sort(),
    ['@opencode-ai/plugin', '@opencode-ai/plugin-v1'],
    'a runtime import of an SDK stopped being reported once its types were sanctioned');
});

test('the two import readings partition the static imports between them [unit]', () => {
  // **The property the type rule rests on, driven rather than described.** Every static import is
  // either evaluated or erased; if the two readings ever overlap, a specifier is judged twice by
  // rules that disagree, and if they ever leave a gap, a specifier is judged by nothing at all. The
  // gap is the dangerous one because it is silent — which is the whole reason this rule exists.
  const lines = [
    ["import { a } from 'x';", ['x'], []],
    ["import type { a } from 'x';", [], ['x']],
    ["import type from './x.ts';", ['./x.ts'], []],
    ["import { type a, b } from './x.ts';", ['./x.ts'], []],
    ["import a, { type b } from 'x';", ['x'], []],
  ];

  for (const [source, evaluated, erased] of lines) {
    assert.deepEqual(specifiersIn(source), evaluated, `evaluated half misread: ${source}`);
    assert.deepEqual(typeSpecifiersIn(source), erased, `erased half misread: ${source}`);
    assert.equal(specifiersIn(source).length + typeSpecifiersIn(source).length, 1,
      `${source} was read by both halves or by neither`);
  }
});

test('a module that throws while loading makes the sweep fail [integration]', async (t) => {
  // The half resolution cannot reach, and the reason `src/` is imported as well as resolved.
  const root = planted(t, {
    ...GOOD,
    'src/explodes.ts': "throw new Error('this module cannot be loaded');\n",
  });

  const complaints = await sweep({ root });

  assert.equal(complaints.length, 1, JSON.stringify(complaints));
  assert.equal(complaints[0].file, 'src/explodes.ts');
  assert.match(complaints[0].reason, /fails to load: this module cannot be loaded/);
});

test('must NOT — the sweep reports success on a tree it did not walk [integration]', async (t) => {
  // **The false pass this whole story is protecting against.** A sweep whose walker returns nothing
  // reports no complaints, which is indistinguishable from a clean tree — and is exactly the state
  // `tests/support/sources.js` was left in by the rename, where a `.js` filter met a `.ts` tree.
  const empty = planted(t, { 'src/.keep': '', 'bin/.keep': '' });

  const nothing = await sweep({ root: empty });

  assert.equal(nothing.length, 1, 'an empty tree produced no complaint, so nothing distinguishes it '
    + 'from a tree in which every import resolves');
  assert.match(nothing[0].reason, /checked nothing/);

  // A missing root is the other shape of the same thing, and `readdirSync` throws on it rather than
  // returning empty — so it needs its own answer or the sweep crashes instead of reporting.
  const gone = await sweep({ root: join(empty, 'no-such-tree') });

  assert.ok(gone.some(({ reason }) => /not a directory/.test(reason)),
    `a missing root was not reported: ${JSON.stringify(gone)}`);

  // The control on the control: the same reading over a tree that *is* populated says nothing is
  // wrong. Without it every assertion above holds for a sweep that complains unconditionally.
  assert.deepEqual(await sweep({ root: planted(t, GOOD) }), []);
});

// --- Criterion 2: a step separate from the suite ---------------------------------------------------

test('the sweep is its own command, and is not part of npm test [integration]', async () => {
  const { scripts } = packageManifest();

  assert.equal(scripts.modules, 'node scripts/module-sweep.ts',
    'the sweep has no command of its own, so nothing runs it');
  assert.equal(scripts.test, 'node --test',
    'the suite command changed, and NFR5 asks for the two to stay separate');
  assert.equal(scripts.test.includes('module-sweep'), false,
    'the sweep was folded into the suite, which is the separation NFR5 rules out');

  // **Plain `node`, with the `.ts` entry and no flag between them** — the same shape the pre-commit
  // hook uses, and for ADR 01-03's reason: a `--import` or `--loader` here would put a build step in
  // front of a check that is supposed to run on the sources as they are.
  assert.deepEqual(scripts.modules.split(' '), ['node', 'scripts/module-sweep.ts'],
    'the sweep is run with a flag, a loader, or something other than node');
});

test('the sweep runs as a process and says what it found [integration]', async () => {
  // Run rather than imported, because a script that works when imported and crashes when executed
  // is a check nobody has. This is the invocation `npm run modules` makes.
  const { code, stdout, stderr } = await runNode([SWEEP], '', {}, { cwd: ROOT });

  assert.equal(code, 0, stderr);
  assert.match(stdout, /every import under src\/ and bin\/ resolves/,
    'the sweep exited clean without saying what it checked');

  // And the failing path, so the exit code is known to be capable of being non-zero. Driven through
  // the same executable against a planted tree, since a zero that is always zero reports nothing.
  const root = mkdtempSync(join(tmpdir(), 'dpm-sweep-run-'));

  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'bin'), { recursive: true });
    writeFileSync(join(root, 'src', 'broken.ts'), "import x from './nowhere';\nexport default x;\n");

    const failed = await runNode([SWEEP, root], '', {}, { cwd: ROOT });

    assert.equal(failed.code, 1, `the sweep exited ${failed.code} on a tree with a broken import`);
    assert.match(failed.stderr, /^dpm: src\/broken\.ts imports \.\/nowhere/m,
      `the diagnostic does not name the file and the specifier: ${failed.stderr}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
