/**
 * Epic 01-01 Story 4 — the inherited suite runs green under Node 24, and runs on nothing.
 *
 * Four of this story's five criteria are about the *conditions* the suite runs under rather than
 * about any behaviour it checks: plain `node`, no loader, no transpiler, no network, no Claude Code
 * and no `CLAUDE_`-prefixed variable, and not one of the 133 inherited files deleted, skipped or
 * quarantined to get there. Three of the four are absences.
 *
 * **An absence is asserted structurally, and every one here carries a control.** "The suite needs no
 * network" is not shown by a run that passes on a connected machine — it passes on one either way.
 * What shows it is that nothing in the tree can reach a socket, which is a claim about the code.
 * `reference-environment.test.js` makes the same argument at length for its own five restrictions
 * and this file follows it; where the two overlap, the overlap is deliberate and noted.
 *
 * **Every sweep here reads import statements or an argument list, never a token in the text.** The
 * first draft of this file swept for the *presence* of names like `vitest` and `--loader`, and it
 * reported four files: `reference-environment.test.js`, which plants a `vitest` import to control
 * its own sweep; `executables-typescript.test.js`, whose subject is the list of transpiler flags;
 * and itself, twice. A check on prose cannot tell a rule from a breach of it, and three of those
 * four files exist to state the rule.
 *
 * **The one criterion this file cannot assert is the first.** "The full suite passes" is a fact
 * about a run, and a test inside that run asserting it would be reporting on itself. It is verified
 * by running the suite; what is here instead is the half a run cannot check — that the run reached
 * every file it was supposed to.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  SANCTIONED_DEV_DEPENDENCIES, packageManifest, pluginSources, staticImports, sweepSourcesUnder,
  unsanctionedDependencies, withoutComments,
} from './support/sources.js';
import { runNode } from './support/run-node.js';

const ROOT = join(import.meta.dirname, '..');
const TESTS = join(ROOT, 'tests');

/**
 * The suite's files as the sweeps take them. The plugin's own come from `sources.js`, which is
 * where they moved once a second suite needed the same `src/` + `bin/` reading and the same
 * exclusion of `scripts/`.
 */
const suiteSources = () => sweepSourcesUnder(TESTS);

/**
 * Everything in this repository that Node runs, which is the plugin, the suite, and `scripts/`.
 *
 * **`scripts/` is in here and out of `pluginSources`, and the split is the point.** Story 6's module
 * sweep is real code that a developer runs, so a third-party runner or a socket arriving in it is a
 * finding — but it is not part of what installs as a plugin, so the claims about `CLAUDE_` variables
 * and the host's installation are not made against it.
 */
const everySource = () => [
  ...pluginSources(), ...suiteSources(), ...sweepSourcesUnder(join(ROOT, 'scripts')),
];

const testFiles = () => readdirSync(TESTS).filter((name) => name.endsWith('.test.js')).sort();

/**
 * Every static import across the tree that `wanted` accepts, as `"<file> imports <specifier>"`.
 *
 * Two criteria below are the same reading with a different list — no third-party runner, and no
 * builtin that opens a socket — and both are absences, so both return an empty array when they hold
 * and when they are broken. Sharing the reading is what stops the two drifting into disagreeing
 * about what an import is, which is the argument `sources.js` makes for `staticImports` itself.
 *
 * Sentences rather than booleans, for that helper's reason: "a source imports something it should
 * not" is a failure nobody can act on.
 *
 * @param {(specifier: string) => boolean} wanted
 * @returns {string[]}
 */
const importsMatching = (wanted) => everySource().flatMap(({ name, text }) => staticImports(text)
  .filter(wanted).map((specifier) => `${name} imports ${specifier}`));

test('the shared import reading walks the tree, so an empty answer means an empty answer', () => {
  // **One reading now carries two must-NOTs, and both of them pass on an empty array.** A
  // `sweepSourcesUnder` that returned nothing — a moved directory, a changed extension list —
  // would report the suite free of test runners and free of sockets in the same run, and nothing
  // else in this file would notice. Asserted once, here, against a specifier every module has.
  const found = importsMatching((specifier) => specifier === 'node:assert/strict');

  assert.ok(found.length > 100, `the reading found ${found.length} imports of node:assert/strict, `
    + 'so it is not walking the tree and every absence below is vacuous');
  assert.ok(found.some((sentence) => sentence.startsWith('tests/')), 'the walk reached no test file');
  assert.ok(everySource().some(({ name }) => name.startsWith('src/')), 'the walk reached no module');

  // And the other direction: it says no when the answer is no.
  assert.deepEqual(importsMatching((specifier) => specifier === 'node:nothing-of-the-sort'), []);
});

// --- Criterion 5: not one inherited file lost -----------------------------------------------------

/**
 * **The 133 test files v0.7.0 shipped, written down.**
 *
 * The must-NOT is that no file was deleted, skipped or quarantined to reach a green suite, and a
 * count cannot say it: files arrived during the port, so `133` is already the wrong total and
 * `>= 133` is satisfied by a suite that dropped four and added seven. What the criterion is about is
 * *these* files, by name, so these files are what is named.
 *
 * It is written here rather than read from the release for the reason `corpus.test.js` records at
 * length about CPM's stages: the v0.7.0 tree exists only in the host's plugin cache, and ENVX3
 * forbids a test from reading it — a check that resolved the cache would pass or fail on which
 * releases the developer happens to have installed. A list this long is the cost of the fork having
 * no second copy of itself to compare against, and it is a cost paid once: the inherited set is
 * frozen by definition, so nothing legitimately edits this array again.
 */
const INHERITED = [
  'baseline.test.js', 'body-asks.test.js', 'body-corpus.test.js', 'body-reads.test.js',
  'capability.test.js', 'conformance.test.js', 'corpus.test.js', 'coverage-key-reuse.test.js',
  'coverage-retirement-environment.test.js', 'coverage-retirement-migration.test.js',
  'coverage-retirement-reason.test.js', 'coverage-retirement-tool.test.js',
  'coverage-retirement.test.js', 'cpm-corpus.test.js', 'criterion-supersession.test.js',
  'criterion-warrant.test.js', 'cross-tools.test.js', 'decay.test.js',
  'deferred-integration.test.js', 'delivery.test.js', 'dependency-endpoints.test.js',
  'dependency.test.js', 'dump.test.js', 'entity-tools.test.js', 'entry-index.test.js',
  'false-pass.test.js', 'findable.test.js', 'first-run.test.js', 'fixtures.test.js',
  'guard-fix.test.js', 'guard-verdict.test.js', 'guard.test.js', 'harness.test.js',
  'hook-check.test.js', 'identity.test.js', 'ignore.test.js', 'import.test.js',
  'integration.test.js', 'integrity-advisory.test.js', 'integrity-live-bindings.test.js',
  'integrity.test.js', 'journeys.test.js', 'marker.test.js', 'merge.test.js', 'migration.test.js',
  'naming-convention.test.js', 'naming.test.js', 'neighbour.test.js', 'numbering.test.js',
  'parity-integration.test.js', 'parity.test.js', 'plugin-stamp.test.js', 'plugin-version.test.js',
  'plugin.test.js', 'projection-integration.test.js', 'projection.test.js',
  'prose-columns.test.js', 'prose-index.test.js', 'prose-refusal.test.js', 'publish-cli.test.js',
  'publish-tool.test.js', 'publish.test.js', 'published-prose.test.js', 'reachability.test.js',
  'read-only-deferred.test.js', 'read-only-skew.test.js', 'read-only.test.js', 'reading.test.js',
  'rebuild.test.js', 'reference-additive.test.js', 'reference-environment.test.js',
  'reference-fixture.test.js', 'reference-handoff.test.js', 'reference-refusal.test.js',
  'reference-resolution.test.js', 'reference.test.js', 'restore-on-create.test.js',
  'restore.test.js', 'retired-claim.test.js', 'round-trip.test.js', 'scaffolding.test.js',
  'schema.test.js', 'search-index.test.js', 'search-limits.test.js', 'search.test.js',
  'self-hosting.test.js', 'server.test.js', 'session.test.js', 'skill-architect.test.js',
  'skill-archive.test.js', 'skill-artifact.test.js', 'skill-audit.test.js', 'skill-brief.test.js',
  'skill-clean.test.js', 'skill-consult.test.js', 'skill-discover.test.js', 'skill-do.test.js',
  'skill-epics.test.js', 'skill-inspect.test.js', 'skill-library.test.js', 'skill-naming.test.js',
  'skill-party.test.js', 'skill-pivot.test.js', 'skill-present.test.js', 'skill-publish.test.js',
  'skill-quick.test.js', 'skill-ralph.test.js', 'skill-reference-input.test.js',
  'skill-retro.test.js', 'skill-retrofit.test.js', 'skill-review.test.js', 'skill-spec.test.js',
  'skill-status.test.js', 'skill-templates.test.js', 'skills-authoring.test.js',
  'skills-corpus.test.js', 'skills-gates.test.js', 'skills-reading.test.js',
  'skills-resume.test.js', 'sparse.test.js', 'spine-integration.test.js',
  'stamp-integration.test.js', 'stamp-report.test.js', 'stamp-skew.test.js', 'stamp.test.js',
  'substrate-amendments.test.js', 'supersession-retirement.test.js', 'templates.test.js',
  'tools.test.js', 'ulid.test.js', 'verdict.test.js', 'vocabulary-tools.test.js',
  'vocabulary.test.js',
];

/** What this epic added, one line per story, so a seventh file is a decision somebody writes here. */
const ADDED = [
  'ci-skill-body.test.js', //          01-03 story 4 — the build check, driven against planted breaches
  'ci.test.js', //                     story 7 — the workflow, and the environment two absences need
  'dependency-isolation.test.js', //   01-02 story 4 — the empty production tree, read off the lockfile
  'executables-typescript.test.js', // story 3 — the five binaries under plain node
  'guard-hook-path.test.js', //        01-04 story 1 — the hook fires, and no refusal names a host mechanism
  'module-sweep.test.js', //           story 6 — every specifier resolves, and the sweep can fail
  'package-cache.test.js', //          01-04 story 2 — the README's link instruction, run against a built cache
  'parity-v070.test.js', //            story 5 — the port against v0.7.0's own dump and allocator
  'permission-entries.test.js', //     01-04 story 5 — the README's rules name skills and tools that exist
  'plugin-entry.test.js', //           01-02 story 1 — registration, the profile seam, the root
  'plugin-reload.test.js', //          01-02 story 5 — a reload leaves one of everything
  'readme-v2.test.js', //              01-04 story 4 — every documented block, classified and run
  'session-scratch.test.js', //        01-04 story 3 — the environment audit, and nothing loose in the tree
  'skill-invocation.test.js', //       01-03 story 3 — the descriptions, and $ARGUMENTS retired
  'skill-pilot.test.js', //            01-03 story 1 — one body ported, and the transition's tripwire
  'skill-port.test.js', //             01-03 story 2 — no Claude Code mechanism, and ralph's recorded gap
  'skill-supporting-files.test.js', // 01-02 story 3 — the conventions file, and the recorded go/no-go
  'suite-integrity.test.js', //        story 4 — this file
  'tool-naming.test.js', //            01-02 story 2 — the v2 rendering, and v0.7.0's own surface
  'typescript-conversion.test.js', //  story 2 — erasable syntax, and node's refusal of the rest
  'vendoring.test.js', //              story 1 — the v0.7.0 tree arrived whole
];

test('every test file v0.7.0 shipped is still in the suite', () => {
  const present = testFiles();

  // **Named rather than counted**, so the failure says which file went. `deepEqual` on the two
  // arrays would report the additions as failures too, which is why the reading is a subset in one
  // direction — the port is allowed to add files and is not allowed to lose one.
  assert.deepEqual(INHERITED.filter((name) => !present.includes(name)), [],
    'a test file the release shipped is no longer in the suite');

  // Two controls, because that emptiness has two uninteresting explanations: a list that holds
  // nothing to look for, and a reading that cannot notice something missing.
  assert.equal(INHERITED.length, 133, `INHERITED holds ${INHERITED.length} names, and the release `
    + 'shipped 133 — the subset check above is over the wrong set');
  assert.deepEqual([...INHERITED, 'deleted-in-the-port.test.js'].filter((n) => !present.includes(n)),
    ['deleted-in-the-port.test.js'], 'the reading does not notice a file that is not there');

  // And the other half of the same criterion: what the port added is what the port added.
  assert.deepEqual(present.filter((name) => !INHERITED.includes(name)), ADDED,
    'a test file arrived that no story in this epic accounts for');
});

test('must NOT — a test file is skipped, quarantined, or left out of the run', () => {
  // **Anchored on the call, not on the word.** `.skip` and `.only` are properties on the runner's
  // own functions, so the shape is a statement opening with one; and the options-object form is a
  // key inside a `test(...)` argument list. A regex for the bare words matches `readOnly` in a
  // helper and every string in this file — which is what the first draft did.
  const MARKERS = [
    /^\s*(?:test|it|describe|suite)\s*\.\s*(?:skip|todo|only)\s*\(/m,
    /^\s*(?:test|it|describe|suite)\s*\([^)]*\{[^}]*\b(?:skip|todo|only)\s*:\s*true/m,
  ];
  const marked = (source) => MARKERS.some((marker) => marker.test(withoutComments(source)));

  assert.deepEqual(suiteSources().filter(({ text }) => marked(text)).map(({ name }) => name), [],
    'a test is skipped, marked todo, or narrowed to with only');

  // One control per shape, driven through the same reading. Indented into a template so the literal
  // sits at a line start the way a real one would, and so this file does not match itself.
  for (const planted of ['test.skip("x", () => {});', 'it .only ("x", () => {});',
    'test("x", { todo: true }, () => {});', 'describe.only("x", () => {});']) {
    assert.equal(marked(`\n${planted}\n`), true, `the reading does not recognise ${planted}`);
  }

  // And the shapes it must *not* recognise, which is what keeps the sweep above from reporting the
  // rule as a breach: a property named for something else, and a marker inside a comment.
  assert.equal(marked('\nconst x = options?.readOnly ? 1 : 2;\n'), false);
  assert.equal(marked('\n// test.skip is what this file forbids\n'), false);

  // The fourth way a file stops checking, and it is not a marker: `node --test` recurses from the
  // working directory, so a test file outside the tree it walks is never reached and never fails.
  assert.deepEqual(suiteSources().filter(({ name }) => !name.startsWith('tests/')), [],
    'a suite file sits outside the directory the runner walks');
});

// --- Criterion 3: the runner ---------------------------------------------------------------------

/** Every third-party runner and assertion library a suite could be made to depend on. */
const RUNNERS = ['vitest', 'jest', '@jest/globals', 'mocha', 'ava', 'tape', 'jasmine', 'chai',
  'expect', 'sinon'];

test('the test script is node --test, and no third-party runner is installed or imported', () => {
  const manifest = packageManifest();

  // The command itself, exactly: a flag added here is a flag every run carries, which is the shape
  // criterion 2's must-NOT takes when it arrives for real.
  assert.equal(manifest.scripts.test, 'node --test',
    'the runner is the one built into Node, invoked with no flags');

  // **Absent from the manifest and absent from the imports, because either alone is half a claim.**
  // A runner could be declared and unused, or resolved from a transitive install and never
  // declared. `reference-environment.test.js` asserts the second half as "no bare specifier
  // anywhere"; what is added here is the runner by name, since a sweep that reports `vitest` and
  // `left-pad` in the same sentence leaves a reader to work out which criterion just broke.
  assert.deepEqual(unsanctionedDependencies(manifest), [],
    'a dependency arrived that is neither the type checker ENVR3 requires nor its type definitions');
  // **The tripwire, and it has fired once — deliberately.** `@opencode-ai/plugin` joined the set
  // when the plugin entry landed, and the point of writing the members out here is that widening
  // the set is an edit someone has to make and explain rather than a silence. What it bought is in
  // `sources.js`: the SDK is taken `import type` only, so `dependencies` stayed `{}` and the
  // assertion above kept the meaning it had. A fourth name arriving still fails this line.
  assert.deepEqual([...SANCTIONED_DEV_DEPENDENCIES].sort(),
    ['@opencode-ai/plugin', '@types/node', 'typescript'],
    'the sanctioned set grew, so the assertion above now permits something it did not');

  // The package, not the specifier: `jest/globals` and `chai/register` are the same dependency
  // arriving through a subpath, and a list of exact specifiers would miss both.
  const packageOf = (specifier) => (specifier.startsWith('@')
    ? specifier.split('/').slice(0, 2).join('/')
    : specifier.split('/')[0]);

  assert.deepEqual(importsMatching((specifier) => RUNNERS.includes(packageOf(specifier))), [],
    'a source imports a third-party test runner');

  // The control, through the real reading rather than a regex written out beside it — and the
  // second line is the half that matters, because `staticImports` is what makes this sweep able to
  // pass at all: `reference-environment.test.js` carries the string `from 'vitest'` inside a
  // planted fixture, and a reading that could not tell a string from a statement would report it.
  assert.deepEqual(staticImports("\nimport { describe } from 'vitest';\n"), ['vitest']);
  assert.deepEqual(staticImports(`const planted = "import { describe } from 'vitest';";`), []);
});

// --- Criterion 2: no loader, no transpiler, no network -------------------------------------------

test('must NOT — a test requires a loader or a transpiler in order to pass', () => {
  // **Asserted over the arguments a process is actually given, not over the words in the tree.**
  // `executables-typescript.test.js` holds the flag names as its subject and this file holds them
  // twice; a sweep for their presence reports all three and calls the rule a breach of itself.
  const command = packageManifest().scripts.test;

  for (const flag of ['loader', 'experimental-loader', 'experimental-strip-types',
    'experimental-transform-types', 'require', 'import']) {
    assert.equal(command.includes(`--${flag}`), false, `the test command carries --${flag}`);
  }

  // **`NODE_OPTIONS`, because that is the vector that hides.** A flag written into a spawn's
  // argument list is visible at the call site and `executables-typescript.test.js` already sweeps
  // `bin/` for exactly those strings; `NODE_OPTIONS` is the one that reaches every child of the
  // process without appearing in any argv, and it is how a loader would arrive and stay.
  const INJECTED = new RegExp(`NODE_${'OPTIONS'}[^\\n]*--`);

  const spawning = everySource()
    .filter(({ text }) => INJECTED.test(withoutComments(text)))
    .map(({ name }) => name);

  // **One, and it is the FTS5 fixture.** `capability.test.js` passes `--import` to a child it
  // spawns so that the machine's real FTS5 support can be forced absent — the shim is the test's
  // subject rather than a requirement of the run. It uses Node's own `module.registerHooks`, it
  // patches one function in one child, and the suite command carries no flag. Named rather than
  // exempted, so a second one arriving for some other reason fails here.
  assert.deepEqual(spawning, ['tests/capability.test.js'],
    'a source other than the FTS5 fixture injects a flag into every child it spawns');

  // The controls, with the variable name assembled so this file is not one of its own findings —
  // the mistake the header records, and one a literal here would reintroduce silently.
  const shape = (body) => INJECTED.test(`const env = { NODE_${'OPTIONS'}: ${body} };`);

  assert.equal(shape("'--import=./register.mjs'"), true);
  assert.equal(shape("'--max-old-space-size=4096'"), true, 'the reading is about flags, not loaders');
  assert.equal(INJECTED.test("await runNode(['--test', '--test-reporter=tap']);"), false);
});

/** Every builtin through which a process can reach off the machine. */
const OUTBOUND = ['node:http', 'node:https', 'node:net', 'node:tls', 'node:dns', 'node:dgram',
  'node:http2', 'node:cluster', 'node:perf_hooks'];

test('must NOT — a test requires a network connection in order to pass', () => {
  // `node:child_process` is deliberately not on that list: the suite spawns `git` and `sh` against
  // temporary directories, and `journeys.test.js` clones and pulls between two of them. Those are
  // local paths, so the claim is stated over the sockets rather than over the ability to run
  // anything at all — a check that forbade spawning would forbid the guard's own integration tests.
  assert.deepEqual(importsMatching((specifier) => OUTBOUND.includes(specifier)), [],
    'a source imports a builtin that can open a connection');

  // The global APIs, which need no import and so would pass the reading above however careful it is.
  const CONNECTS = /\b(?:fetch|WebSocket|XMLHttpRequest|EventSource)\s*\(/;
  const globals = everySource()
    .filter(({ text }) => CONNECTS.test(withoutComments(text)))
    .map(({ name }) => name);

  assert.deepEqual(globals, [], 'a source calls a global that opens a connection');

  // Both controls through the real readings. The `node:fs` line is the half that matters: a sweep
  // matching every import would report the first assertion clean for the wrong reason.
  assert.deepEqual(staticImports("\nimport https from 'node:https';\n"), ['node:https']);
  assert.equal(OUTBOUND.includes('node:fs'), false, 'the list forbids reading the filesystem');

  // Assembled, so the control does not make this file a finding of its own sweep. Both halves
  // matter: the call is recognised, and a longer identifier ending in the same letters is not.
  assert.equal(CONNECTS.test(`const body = await ${'fet' + 'ch'}(url);`), true);
  assert.equal(CONNECTS.test(`const rows = pre${'fet' + 'ch'}(db);`), false);
});

// --- Criterion 4: no Claude Code, and no CLAUDE_ variable ----------------------------------------

test('the plugin reads nothing from a CLAUDE_ variable, and a scrubbed run agrees [integration]', async (t) => {
  // **The structural half, over `src/` and `bin/`.** A run on this machine passes with the
  // variables set, so passing proves nothing; what proves it is that nothing the plugin runs reads
  // one. `src/server/neighbour.ts` and `src/server/plugin-version.ts` each carry a doc comment
  // saying so for ENVX3, which is why the reading strips comments before looking.
  const CLAUDE_ENV = /process\.env(?:\.CLAUDE|\[\s*['"`]CLAUDE)/;

  assert.deepEqual(
    pluginSources().filter(({ text }) => CLAUDE_ENV.test(withoutComments(text)))
      .map(({ name }) => name),
    [], 'a module the plugin runs reads a CLAUDE_-prefixed variable',
  );

  // **The suite is a separate question and gets a separate answer**, because two of its files name
  // the variable and neither depends on it: `neighbour.test.js` and `plugin-version.test.js` each
  // *set* `CLAUDE_PLUGIN_ROOT` to a bogus path and assert the code ignores it, restoring it after.
  // That is this criterion's own evidence, and a sweep that could not tell it from a dependency
  // would demand the deletion of the two tests that prove the point.
  assert.deepEqual(
    suiteSources().filter(({ text }) => CLAUDE_ENV.test(withoutComments(text)))
      .map(({ name }) => name).sort(),
    ['tests/neighbour.test.js', 'tests/plugin-version.test.js'],
    'a suite file reads a CLAUDE_ variable, and only the two that plant a bogus one may name it',
  );

  // Assembled, so this file is not a third name in the list above — the same reason the two
  // readings in `reference-environment.test.js` compose their needles rather than writing them.
  const named = (variable) => CLAUDE_ENV.test(`const at = process.env.${variable};`);

  assert.equal(named(`${'CLA' + 'UDE'}_PLUGIN_ROOT`), true,
    'the reading does not recognise the variable it exists to find');
  assert.equal(named('DPM_DATABASE'), false, 'the reading complains about any variable at all');

  // **And the run, because the structural half cannot see an indirect read.** A helper resolving
  // `process.env[name]` from a computed string passes every sweep above. The child is handed an
  // environment with no `CLAUDE_` variable in it at all and asked to open a database and count the
  // vocabulary — the same start-up path every suite file goes through.
  const inherited = Object.keys(process.env).filter((name) => name.startsWith('CLAUDE'));
  const scrubbed = Object.fromEntries(inherited.map((name) => [name, undefined]));

  // **Reported, not asserted, and that distinction is this criterion arriving at its own test.**
  // Written as `assert.ok(inherited.length > 0)` — the control saying the scrub removed something —
  // this failed in precisely the environment the criterion is about: a machine with no Claude Code
  // has no variables to strip, so the demand that some be stripped turns "the criterion holds
  // already" into a failure. The child's own check below runs either way and is the real assertion;
  // what changes is only whether this run had anything to prove it against.
  t.diagnostic(inherited.length > 0
    ? `${inherited.length} CLAUDE_ variables removed from the child`
    : 'this environment carries no CLAUDE_ variables, so the child was already clean');

  const { code, stdout, stderr } = await runNode(['-e', [
    "const { start } = await import('./src/start.ts');",
    'const leaked = Object.keys(process.env).filter((name) => name.startsWith("CLAUDE"));',
    'if (leaked.length) throw new Error(`the child inherited ${leaked.join(", ")}`);',
    "const { db } = start(':memory:');",
    "const { kinds } = db.prepare('SELECT count(*) AS kinds FROM document_kind').get();",
    'process.stdout.write(String(kinds));',
  ].join('\n')], '', scrubbed, { cwd: ROOT });

  assert.equal(code, 0, stderr);
  assert.ok(Number(stdout.trim()) > 0, `the child opened a database with no kinds in it: ${stdout}`);
});

test('the plugin resolves neither the Claude Code executable nor its configuration directory', () => {
  // The other way a dependency on an installed Claude Code arrives: not a variable but a path.
  // Assembled rather than written out, because this file is one the sweep reads — the same answer
  // `reference-environment.test.js` reaches for `HOST_CACHE`, and for the same reason.
  const CONFIG = new RegExp(['\\.claude', 'plugins'].join('/'));
  const EXECUTABLE = /\bwhich\s+claude\b|execFileSync\(\s*['"]claude['"]/;

  assert.deepEqual(
    pluginSources().filter(({ text }) => CONFIG.test(withoutComments(text))
      || EXECUTABLE.test(withoutComments(text))).map(({ name }) => name),
    [], 'a module the plugin runs resolves the host Claude Code installation',
  );

  // The suite's half of the same claim is ENVX3's, asserted in `reference-environment.test.js` over
  // the plugin cache path. Not repeated here: two readings of one rule drift, and that file's is
  // the one with the scratch-tree fixture behind it.
  const planted = `const root = '~/${['.claude', 'plugins'].join('/')}/cache';`;

  assert.equal(CONFIG.test(planted), true, 'the reading does not recognise the configuration path');
  assert.equal(EXECUTABLE.test(`execFileSync('claude', ['--version'])`), true,
    'the reading does not recognise the executable');
  assert.equal(CONFIG.test("const root = '~/.config/dpm';"), false);
});

// --- The run this file cannot make, named so its absence is a decision ---------------------------

test('every test file is reachable by the one command, and the count is what it is', (t) => {
  // Criterion 1 — "the full suite runs under plain `node` and passes" — is a fact about a run, and
  // a test inside that run cannot assert it without reporting on itself. What is checkable is that
  // the command reaches every file: `node --test` recurses from the working directory, so a file
  // it does not walk is one that never fails.
  const present = testFiles();

  assert.equal(present.length, INHERITED.length + ADDED.length,
    `the suite holds ${present.length} test files against ${INHERITED.length} inherited `
    + `and ${ADDED.length} added`);

  // Recorded rather than asserted, because the number moves as later epics add files and the fact
  // worth carrying forward is what it was when this story closed.
  t.diagnostic(`${present.length} test files: ${INHERITED.length} inherited, ${ADDED.length} added`);
});
