/**
 * Epic 01-01 Story 3 — the five executables as TypeScript, run rather than built.
 *
 * The executables are where ADR 01-03's "ship sources, not artefacts" is either true or a story
 * somebody tells. `src/` being TypeScript is invisible to a user; a plugin whose entry point needs
 * `--loader` in front of it is a build step wearing a flag, and one that needs a `dist/` to exist
 * first is a build step with no flag at all. Both are what this file is looking for.
 *
 * **What is deliberately not re-asserted here.** Each executable's own behaviour has a suite —
 * `guard.test.js`, `publish-cli.test.js`, `merge.test.js`, `import.test.js`,
 * `spine-integration.test.js` — and every one of them now spawns a `.ts` path. Restating what a
 * publish writes or what the guard compares would be a second, worse copy of those. The claim this
 * file owns is narrower and is the one none of them makes: that the *conversion* left each binary
 * runnable by plain `node`, with the argument list visible in the source of the test.
 *
 * **The argument lists below are the assertions.** Every spawn is written as `[path, …its own
 * arguments]` and passes nothing else, so a `--loader` or `--experimental-strip-types` added later
 * to make something green would appear in the diff rather than hide behind a helper. `runNode`
 * spawns `process.execPath` directly and adds no flags of its own — which is why it is the helper
 * used and why that fact is worth writing down.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { runNode } from './support/run-node.js';
import { moduleFilesUnder, packageManifest, sweepSourcesUnder } from './support/sources.js';
import { fullCorpus } from './support/corpus.js';
import { HELLO, repliesFrom, wire } from './support/session.js';
import { DUMP_PATH } from '../src/guard/index.ts';
import { start } from '../src/start.ts';
import { spineTools } from '../src/tools/index.ts';

const ROOT = join(import.meta.dirname, '..');
const BIN = join(ROOT, 'bin');

/**
 * The five, named rather than discovered.
 *
 * `vendoring.test.js` makes the same list for the same reason: an executable arriving after this
 * was written changes what the criterion counts, and an equality is how that surfaces. Here it also
 * carries the extension, which is the whole subject.
 */
const EXECUTABLES = [
  'dpm-guard.ts', 'dpm-import.ts', 'dpm-mcp.ts', 'dpm-merge.ts', 'dpm-publish.ts',
];

/** The flags that would mean a transpiler stands between `node` and the source. */
const TRANSPILED = [
  '--loader', '--experimental-loader', '--import', '--experimental-strip-types',
  '--experimental-transform-types', 'ts-node', 'tsx', '@swc', 'babel',
];

/** A repository with a real database on disk and nothing generated yet. */
function repository(t) {
  const root = mkdtempSync(join(tmpdir(), 'dpm-executables-'));

  t.after(() => rmSync(root, { recursive: true, force: true }));

  const location = join(root, '.dpm', 'dpm.db');

  mkdirSync(dirname(location), { recursive: true });

  const { db } = start(location);

  fullCorpus(db, Object.fromEntries(spineTools(db).map((tool) => [tool.name, tool.handler])));

  // Closed here rather than in an `after` hook: every assertion below is about a *child process*
  // reading this file, and an open handle in the parent is a write that may not have landed yet.
  db.close();

  return { root, location };
}

// --- The sources on disk, and nothing beside them ------------------------------------------------

test('bin/ holds five .ts executables and no compiled sibling [unit]', () => {
  // A directory listing rather than a filtered walk, because what this is looking for is precisely
  // the file a filter would drop: a `dpm-guard.js` emitted next to `dpm-guard.ts`, or a `.js.map`.
  assert.deepEqual(readdirSync(BIN).sort(), EXECUTABLES,
    'bin/ holds exactly the five TypeScript executables, by name and not merely by count');

  for (const name of EXECUTABLES) {
    const source = readFileSync(join(BIN, name), 'utf8');

    assert.ok(source.startsWith('#!/usr/bin/env node\n'),
      `${name} keeps its shebang — Node strips one from a .ts file as it does from a .js file`);
  }
});

test('every internal import specifier under bin/ carries an explicit .ts extension [unit]', () => {
  const sources = sweepSourcesUnder(BIN);

  // Two controls: the walk read something, and the pattern found something in it. An empty
  // `without` means nothing when either could be empty for its own reasons.
  assert.equal(sources.length, EXECUTABLES.length, 'the walk read all five');

  const specifiers = sources.flatMap(({ name, text }) => [
    ...text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*'([^']+)'/g),
  ].map(([, specifier]) => ({ file: name, specifier }))
    .filter(({ specifier }) => specifier.startsWith('.')));

  assert.ok(specifiers.length >= 10,
    `the pattern found relative specifiers to check, not ${specifiers.length}`);
  assert.ok(specifiers.some(({ specifier }) => specifier === '../src/server/node-floor.ts'),
    'the pattern finds a specifier known to be there — the floor check every binary imports');

  const without = specifiers.filter(({ specifier }) => !specifier.endsWith('.ts'));

  assert.deepEqual(without, [],
    'Node does not map a .js specifier onto a .ts file; every relative one names its extension');
});

// --- Criterion 3: nothing documented puts a transpiler in front of node --------------------------

test('no documented invocation passes a loader or transpiler flag [unit]', () => {
  const { scripts } = packageManifest();
  const hook = readFileSync(join(ROOT, 'hooks', 'pre-commit'), 'utf8');

  // **The hook is read whole rather than grepped for its `exec` line**, because a flag could just
  // as well arrive in a variable two lines above it. The README is the fourth documented surface
  // and this fork does not vendor one yet; `first-run.test.js` is where it is asserted when it
  // lands.
  //
  // **CI is the third, added by story 7.** A workflow is a documented invocation in exactly the
  // sense this sweep means: it is the one every contributor's change is run through, and a
  // `--loader` reaching `node` there would make the green run a green run of something else. It
  // arrives with the same comment-stripping as the hook, and for the same reason — the workflow's
  // own header explains that no loader is passed.
  const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  const documented = [
    ...Object.entries(scripts).map(([name, command]) => [`package.json scripts.${name}`, command]),
    // The comment prose is stripped, because the line explaining that no loader is needed says the
    // word `--loader` and would otherwise read to this sweep as a use of one.
    ['hooks/pre-commit', hook.replaceAll(/^#.*$/gm, '')],
    ['.github/workflows/ci.yml', workflow.replaceAll(/^\s*#.*$/gm, '')],
  ];

  assert.ok(documented.length > 1, 'there are invocations to check');

  for (const [where, command] of documented) {
    for (const flag of TRANSPILED) {
      assert.ok(!command.includes(flag), `${where} runs node through ${flag}`);
    }
  }

  // The control: the sweep must be able to see one. Without this the loop above is satisfied by a
  // `TRANSPILED` that had been emptied, or by strings nothing could ever match.
  for (const flag of TRANSPILED) {
    assert.ok(`node ${flag} bin/dpm-guard.ts`.includes(flag),
      `the sweep can see ${flag} when it is there`);
  }

  assert.equal(scripts.test, 'node --test',
    'the test script is the runner and nothing in front of it');
});

// --- Criterion 2 (must NOT): nothing has to be built first ---------------------------------------

test('must NOT — no executable requires a build artefact to exist before it runs [integration]', async (t) => {
  const manifest = packageManifest();

  for (const name of ['build', 'prepare', 'prepack', 'prepublishOnly']) {
    assert.equal(manifest.scripts[name], undefined, `no ${name} script could have produced one`);
  }

  for (const directory of ['dist', 'build', 'out', 'lib']) {
    assert.ok(!existsSync(join(ROOT, directory)), `no ${directory}/ for anything to depend on`);
  }

  // **The assertion with teeth, and it is a spawn rather than a file check.** "No build directory
  // exists" is satisfied by a repository that was simply never built; what the criterion forbids is
  // an executable that *needs* one. So the binary is run from a directory that is not the
  // repository, with `DPM_DATABASE` unset, and asked to do its job — if it resolved anything from a
  // build output it would fail here, and the failure would name the missing path.
  const repo = repository(t);
  const elsewhere = mkdtempSync(join(tmpdir(), 'dpm-elsewhere-'));

  t.after(() => rmSync(elsewhere, { recursive: true, force: true }));

  const published = await runNode(
    [join(BIN, 'dpm-publish.ts'), repo.root], '',
    { DPM_DATABASE: repo.location }, { cwd: elsewhere },
  );

  assert.equal(published.code, 0, `publish needed something that is not in the tree:\n${published.stderr}`);
  assert.ok(existsSync(join(repo.root, DUMP_PATH)), 'and it did the work rather than exiting early');

  // The control on the control: `moduleFilesUnder` is the walk the "no compiled sibling" test uses,
  // and it reports a corpus rather than silence.
  assert.equal(moduleFilesUnder(BIN).length, EXECUTABLES.length);
});

// --- Criterion 1: each of the five runs under plain node and does its own work -------------------

test('each of the five runs under plain node and performs its own responsibility [integration]', async (t) => {
  const repo = repository(t);
  const environment = { DPM_DATABASE: repo.location };

  // 1. publish — regenerates the projection and the dump.
  const published = await runNode([join(BIN, 'dpm-publish.ts'), repo.root], '', environment);

  assert.equal(published.code, 0, published.stderr);
  assert.ok(readdirSync(join(repo.root, 'docs')).length > 0, 'publish wrote no projection');
  assert.ok(existsSync(join(repo.root, DUMP_PATH)), 'publish wrote no dump');

  // 2. guard — compares the tree against the database, and agrees with what publish just wrote.
  const guarded = await runNode([join(BIN, 'dpm-guard.ts'), repo.root], '', environment);

  assert.equal(guarded.code, 0, `the guard rejected what publish wrote:\n${guarded.stderr}`);

  // 3. merge — asked to resolve a directory that is not a conflicted merge, it refuses in its own
  // voice. **The `dpm:` prefix is the assertion, not the sentence after it.** What separates this
  // from a bare non-zero exit is that the message is the tool's own: a binary that died at load
  // would also exit non-zero, and would say something from Node instead. Resolving a real conflict
  // is `merge.test.js`'s subject, fixture and all, and is not rebuilt here.
  const merged = await runNode([join(BIN, 'dpm-merge.ts'), repo.root], '', environment);

  assert.equal(merged.code, 2, merged.stderr);
  assert.match(merged.stderr, /^dpm: /m, 'merge exited without reaching its own diagnostic');

  // 4. import — rebuilds the database from the dump publish wrote.
  const imported = await runNode([join(BIN, 'dpm-import.ts'), repo.root], '', environment);

  assert.equal(imported.code, 0, imported.stderr);
  assert.ok(existsSync(repo.location), 'import left no database behind');

  // 5. mcp — speaks protocol on stdout, which is the only responsibility it has.
  const served = await runNode([join(BIN, 'dpm-mcp.ts')], wire([HELLO]), environment);

  assert.equal(served.code, 0, served.stderr);

  const [reply] = repliesFrom(served.stdout);

  assert.equal(reply.id, 1, 'the server answered the handshake');
  assert.ok(reply.result?.serverInfo, 'and answered it with a server identity');
});
