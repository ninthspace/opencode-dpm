/**
 * Epic 03-01 Story 4 — the environment the work assumes.
 *
 * Eleven claims, and not one of them is `target`: every one is about the machine this work
 * happens on, so every one is checkable here rather than only against a deployment nobody in this
 * run has. That is why they are worth writing down — an environmental requirement that can only
 * be asserted is one nobody has checked, and five of these eleven are restrictions whose whole
 * content is that something is *absent*.
 *
 * **An absence needs a control, and the controls here are structural.** "The suite runs with no
 * `node_modules`" is not shown by running the suite — it passes on a machine that has one. What
 * shows it is that nothing is declared to install and no source imports anything but a `node:`
 * builtin or a relative path, which is a claim about the code rather than about this run of it.
 * The same argument applies to the plugin cache and to CI.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REQUIRED_NODE, parseVersion } from '../src/server/node-floor.ts';
import { targetVersion } from '../src/schema/migrate.ts';
import {
  moduleFilesUnder, packageManifest, sweepSourcesUnder, unsanctionedDependencies, withoutComments,
} from './support/sources.js';
import { auditImports } from './support/sweeps.js';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { publishedTree } from './support/published.js';
import { matrixUnderEpic } from './fixtures/planning.js';
import { spineTools } from '../src/tools/index.ts';

const DPM = join(import.meta.dirname, '..');

/**
 * The git repository the working tree belongs to — the same directory as `DPM` since the port.
 *
 * At v0.7.0 the plugin lived at `<marketplace>/dpm/`, so the repository was one level above it and
 * this was `join(DPM, '..')`. The fork is a standalone repository: `.git`, `.github` and `hooks/`
 * are all at the same root as `src/`. Kept as its own name rather than folded into `DPM` because
 * the two mean different things — one is the plugin, the other is what git tracks — and they were
 * only ever equal by the port's doing.
 *
 * **Left as `join(DPM, '..')` it does not fail, it passes for the wrong reason.** What it reaches
 * for is `existsSync` on a path outside the checkout, which is reliably absent — so "there is no
 * CI" held over a directory that was never this project's, and the ENVR7 assertion below, which is
 * the last reader of this constant, would have been answering about somebody's home directory.
 */
const REPOSITORY = DPM;
const TESTS = join(DPM, 'tests');

/** The suite's sources as the sweeps take them. */
const suiteSources = () => sweepSourcesUnder(TESTS);

// --- ENVR1, ENVR2: the runtime and the runner ---------------------------------------------------

test('the running Node satisfies the floor, and package.json declares the same one', () => {
  const [major, minor, patch] = parseVersion(process.versions.node);
  const [floorMajor, floorMinor, floorPatch] = parseVersion(REQUIRED_NODE);

  const above = major > floorMajor
    || (major === floorMajor && minor > floorMinor)
    || (major === floorMajor && minor === floorMinor && patch >= floorPatch);

  assert.ok(above, `this Node is ${process.versions.node}, below the ${REQUIRED_NODE} floor`);
  assert.equal(packageManifest().engines.node, `>=${REQUIRED_NODE}`,
    'and the manifest names the floor the code enforces, rather than one of its own');
});

test('npm test is node --test, and no runner is resolved from node_modules', () => {
  assert.equal(packageManifest().scripts.test, 'node --test',
    'the runner is the one built into Node');

  // **The restriction, not the convenience**: a runner could be installed and unused, so what is
  // asserted is that nothing in the suite imports one. `baseline.test.js` already makes this claim
  // over `src/` and `bin/` for ENVX1; the criterion here is about the *runner*, which is reached
  // from a test file and from nowhere else, so this is the half of the tree that one does not walk.
  const { complaints, examined } = auditImports(suiteSources());

  assert.deepEqual(complaints, [],
    'a test imports something that is neither a node: builtin nor a relative path');
  assert.ok(examined > 200, `only ${examined} imports were examined, so the sweep is not looking`);

  // Planted, through the real sweep: the shape a `describe`/`expect` runner would arrive as.
  assert.deepEqual(
    auditImports([{ name: 'planted.js', text: "import { describe } from 'vitest';" }]).complaints,
    ['planted.js imports vitest, which is neither a node: builtin nor relative'],
  );
});

// --- The checkout the sweeps are anchored in ----------------------------------------------------

/**
 * Untagged, because no requirement in this specification asks for it.
 *
 * This section carried `ENVR3` from upstream, where that tag meant something else. In this fork
 * ENVR3 is the type checker — which the `nothing to install` test below names correctly, in this
 * same file. A stale tag is worse than no tag: it reads as a criterion somebody bound, and there is
 * no coverage row anywhere to disagree with it.
 *
 * What is left is the control for `DPM` itself. Half this file sweeps `join(DPM, 'src')` and
 * `join(DPM, 'tests')`, and a misresolved constant makes every one of those sweeps read an empty
 * directory and pass. The `examined > 500` floors catch most of that; these two catch it at the
 * source, and name the constant rather than the sweep that came up short.
 *
 * **The hook assertion that sat here is gone deliberately.** It pinned `.git/hooks/pre-commit` at
 * this working tree, and this repository commits through the installed dpm release instead: the
 * tool that writes `.dpm/dpm.db` is the tool that should check the projection built from it, and
 * an artefact under port does not belong in its own commit path. That is a decision, recorded in
 * the README, and not a criterion — so it is not asserted here in either direction.
 */
test('src and skills are in the working tree, so the constant the sweeps use resolves', () => {
  assert.ok(existsSync(join(DPM, 'src')), 'dpm/src is in the working tree');
  assert.ok(existsSync(join(DPM, 'skills')), 'and so is dpm/skills');
});

// --- Where the test data comes from, and where it does not --------------------------------------
//
// Untagged. This carried `ENVR4` from upstream, where that tag meant something else; this fork's
// ENVR4 is the OpenCode v2 beta CLI on the contributor's machine, and no requirement here asks for
// the property below. It is worth keeping on its own merits — a suite that reads the project's own
// database is one whose results depend on the project's own state — but it is nobody's criterion,
// and a tag naming one it does not serve reads as coverage that does not exist.

/**
 * A path the suite resolved from its own location up out of `dpm/` — the only way a test can reach
 * this project's own `.dpm/`, since everything else it opens is a scratch root it just made.
 *
 * That distinction is the whole check. Six suite files name `.dpm/dpm.db`, and every one of them
 * means a database inside a temporary directory the test created a line earlier; a sweep that
 * matched the *string* would report all six and be wrong about all six. What is forbidden is
 * reaching the project's, and reaching the project's means anchoring at the project.
 */
const anchored = (code) => [...code.matchAll(
  /join\(\s*import\.meta\.dirname\s*,((?:\s*'[^']*'\s*,?)+)\)/g,
)].map(([, parts]) => parts.match(/'[^']*'/g).map((part) => part.slice(1, -1)))
  .filter((parts) => parts.includes('.dpm'))
  .map((parts) => parts.at(-1));

test('no test opens this project own database, and the fixture is what they build from', () => {
  const reached = suiteSources().flatMap(({ text }) => anchored(withoutComments(text)));

  // **Exactly one, and it is not a database.** `self-hosting.test.js` reads the committed dump,
  // which is its subject — the release's vocabulary is compared against what `.dpm/dpm.sql` holds.
  // Listing what was found rather than asserting a count says which file would have to change.
  assert.deepEqual(reached, ['dpm.sql'],
    'a test resolves a path into this project own .dpm/, and the dump is the only one allowed');

  // The other half: the fixture the criterion names is the one the suite actually builds from.
  const users = moduleFilesUnder(TESTS)
    .filter((path) => /planning-database\.js/.test(readFileSync(path, 'utf8')));

  assert.ok(users.length > 40, `only ${users.length} suite files build from the fixture`);

  // **Planted, so the answer above means the reading looked** — assembled rather than written out,
  // because this file is one the sweep reads and a literal here would be found in it. Story 2 hit
  // the same wall with `identifierOf` and answered it the same way; exempting the file by name
  // would go on hiding a genuine reach into `.dpm/` planted in it afterwards.
  const forbidden = `const db = ${['join(import.meta', 'dirname'].join('.')}, '..', '.dpm', 'dpm.db');`;

  assert.deepEqual(anchored(forbidden), ['dpm.db'],
    'the reading does not find the shape it exists to find');
});

// --- ENVX3: the plugin cache -------------------------------------------------------------------

/** The host's cache, named in code rather than in prose. Assembled for the reason `anchored` is. */
const HOST_CACHE = new RegExp(['plugins', 'cache'].join('/'));

const reachesCache = (sources) => sources
  .filter(({ text }) => HOST_CACHE.test(withoutComments(text)))
  .map(({ name }) => name);

test('no test reaches the host plugin cache, so an absent or read-only one changes nothing', () => {
  // `support/plugin-cache.js` builds sibling version directories in a scratch tree for exactly this
  // reason, and names the real path only in the prose explaining why it does not use it — which is
  // why the reading strips comments before looking, and why that stripping is asserted below.
  assert.deepEqual(reachesCache(suiteSources()), [],
    'the cache is stood in for by a scratch fixture, never read from the host');

  const planted = `const cache = '~/.claude/${['plugins', 'cache'].join('/')}/x';`;

  assert.deepEqual(reachesCache([{ name: 'planted.js', text: planted }]), ['planted.js']);
  assert.deepEqual(reachesCache([{ name: 'planted.js', text: `// ${planted}` }]), [],
    'the reading complains about prose that explains the rule');
});

// --- The scratch tree ---------------------------------------------------------------------------
//
// Untagged, and inherited the same way. This fork's ENVR5 is a scratch OpenCode *project* to
// register the plugin into, whose criterion is `[manual]` and whose evidence is a run in a real
// host — not a corpus published into a temporary directory by the suite. The two share the word
// "scratch" and nothing else.

test('the suite can publish a corpus into a scratch tree and read the files back', (t) => {
  const { root, documents } = publishedTree(t);

  const written = readdirSync(join(root, 'docs'), { recursive: true }).map(String)
    .filter((entry) => entry.endsWith('.md'));

  assert.ok(written.length > 10, `${written.length} markdown files were rendered into the tree`);
  assert.ok(
    written.some((entry) => entry.includes(`-spec-${documents.spec.slug}.md`)),
    'including the spec, found by the name the renderer gave it rather than by a path built here',
  );
});

// --- NFR2, ENVX1: nothing to install -------------------------------------------------------------

test('nothing is declared to install, and there is nothing installed', () => {
  const manifest = packageManifest();

  assert.deepEqual(manifest.dependencies ?? {}, {}, 'no runtime dependency');
  assert.deepEqual(unsanctionedDependencies(manifest), [],
    'and no development one beyond the type checker ENVR3 requires');

  // **The `node_modules` assertion is gone, and its work moved rather than lapsed.** It read this
  // very run as the clean checkout — true while dpm declared nothing to install, false now that
  // ENVR3's type check installs a compiler. What it was protecting is that nothing dpm runs
  // *resolves* out of an install, and an install that exists makes that the sharper question: the
  // one package now on disk must be reachable from the type check and from nothing else.
  const { complaints, examined } = auditImports([
    ...sweepSourcesUnder(join(DPM, 'src')),
    ...sweepSourcesUnder(join(DPM, 'bin')),
    ...suiteSources(),
  ]);

  assert.deepEqual(complaints, [],
    'something dpm runs resolves a package out of an install');
  assert.ok(examined > 500, `only ${examined} imports were examined, so the sweep is not looking`);

  // The type checker is a command, never an import: `tsc --noEmit` is spawned by `npm run
  // typecheck` and no module reaches it. Planted through the real sweep, because the assertion
  // above is an absence and this is the shape the absence is about.
  assert.deepEqual(
    auditImports([{ name: 'planted.ts', text: "import ts from 'typescript';" }]).complaints,
    ['planted.ts imports typescript, which is neither a node: builtin nor relative'],
  );
});

// --- ENVR7: CI, and what it may not become -------------------------------------------------------

/**
 * **This assertion used to say the opposite, and it was superseded rather than wrong.**
 *
 * It read `assert.equal(existsSync(join(REPOSITORY, '.github', 'workflows')), false)` under the
 * heading "ENVX2: no CI" — the *v0.7.0* ENVX2, whose content was that the marketplace repository
 * had no CI and so no criterion there could depend on one. The specification this fork works from
 * replaces both halves. Its ENVX2 is a different restriction entirely (`01M191PJJS5APQC7DK4P73CR1G`
 * — "a loader or transpiler must not be required"), and CI is now **required**: ENVR7
 * (`01M191PB5ZT101VW751N9HTCER`) asks for "a CI job running the full `node --test` suite on Node 24
 * under plain `node`, plus the type check and the module sweep, on every push", which Epic 01-01
 * Story 7's criterion `01M193GQM0AB6H2KSCW4MRT30V` builds.
 *
 * So the restriction narrows to the part of it that survives: a criterion may not become
 * *unreachable from a local run*. CI runs the same commands a contributor runs, and that is what is
 * asserted here — `tests/ci.test.js` holds the rest of the workflow's reading.
 */
test('CI runs the commands a contributor runs, so nothing is checkable only there', () => {
  const workflow = join(REPOSITORY, '.github', 'workflows', 'ci.yml');

  assert.ok(existsSync(workflow), 'ENVR7 asks for CI on every push, and there is no workflow');

  const { scripts } = packageManifest();
  const text = readFileSync(workflow, 'utf8');

  // Each of the three is `npm run <name>`, so what CI runs and what `package.json` declares are the
  // same string. A workflow that inlined `node --test` would drift from `npm test` silently, and
  // the drift would read as CI checking something the contributor cannot.
  for (const command of ['npm test', 'npm run typecheck', 'npm run modules']) {
    assert.ok(text.includes(command), `the workflow does not run ${command}`);
  }

  for (const name of ['test', 'typecheck', 'modules']) {
    assert.ok(scripts[name], `${name} is run in CI and is not a command anyone can run locally`);
  }

  // The control: the reading above is a substring search, and one that matched anything would pass
  // three times over. A command that is not there is not found.
  assert.equal(text.includes('npm run coverage'), false,
    'the workflow text search matches commands that are not in it');
});

// --- ENVX4, ENVX5: no migration, and no published tree required ---------------------------------

test('the reference is computed from columns that already exist', (t) => {
  const db = openPlanningDatabase(t);
  const columns = db.prepare('PRAGMA table_info(document)').all().map((column) => column.name);

  assert.equal(columns.includes('reference'), false,
    'no column was added — the reference is derived from numbering, parentage and the kind');
  assert.equal(readdirSync(join(DPM, 'src', 'schema')).filter((f) => f.endsWith('.sql')).length,
    targetVersion() + 1,
    'and the migration set is the one the release already targets, with nothing added to it');
});

test('a reference is answered against a database whose docs tree was never published', (t) => {
  const db = openPlanningDatabase(t);
  const { matrix } = matrixUnderEpic(db);
  const call = handlers(spineTools(db));

  // Nothing has been published: this database has no root, no tree and no marker.
  assert.equal(call.read_coverage_matrix({ id: matrix.id }).reference, '47-03',
    'the answer comes from the rows, so an unpublished project is answered the same as any other');
});
