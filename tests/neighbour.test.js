/**
 * Epic 1 story 2 — resolving the running plugin's directory, and reading what sits beside it.
 *
 * The four rejections here are the load-bearing half of the story: a resolver that reached for the
 * environment, recursed, spawned something or wrote anything would still return the right sibling
 * names, and every positive criterion would go on passing. So each is closed the way the library
 * says a must-NOT has to be — by arranging the condition that would produce the refused thing and
 * watching the check report its absence, rather than by reading the source and being satisfied.
 *
 * Where a source scan is used it is used for a claim a scan can actually make. An ES module reaches
 * `node:child_process` or `node:net` only through an import, so the absence of such an import is a
 * structural fact. Writing nothing is not that kind of claim, and is checked against a real
 * directory before and after instead.
 *
 * Note for anyone adding to this file: `plugin.test.js` sweeps the tree for import specifiers, and
 * its reader is not a parser. A quoted phrase downstream of the word from — in prose, in a comment,
 * in a regex — is read as a dependency on a package by that name, and fails the whole suite. Keep
 * quoted phrases out of the prose here and assemble any pattern that needs the sequence.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { currentSkew, neighbourSkew, pluginRoot, siblingNames } from '../src/server/neighbour.ts';
import { SKEW, SOURCE, skewMessage } from '../src/server/skew.ts';
import { pluginCache as cacheOf } from './support/plugin-cache.js';
import {
  filesUnder, moduleFilesUnder, packageManifest, unsanctionedDependencies, withoutComments,
} from './support/sources.js';

const pluginCache = (t, versions, options = {}) =>
  cacheOf(t, versions, { prefix: 'dpm-neighbour-', ...options });

const RESOLVER = fileURLToPath(new URL('../src/server/neighbour.ts', import.meta.url));
const source = readFileSync(RESOLVER, 'utf8');

/**
 * Where the sentences live, which is no longer where the resolver does.
 *
 * Epic 2 moved the vocabulary and the composer to `skew.js` when the database stamp became the
 * second detector — a module named for the plugin cache had no business composing a sentence about
 * the database. The sweep below still asserts *one* composer; what changed is which file it is.
 */
const COMPOSER = fileURLToPath(new URL('../src/server/skew.ts', import.meta.url));

const code = withoutComments(source);

/** A reader that answers like `readdirSync` and remembers every call made to it. */
function countingReader(entries) {
  const calls = [];
  const read = (path, options) => {
    calls.push({ path, options });
    return entries.map((entry) => ({ ...entry, isDirectory: () => entry.directory }));
  };

  return { read, calls };
}

/** Every path under `root`, relative and sorted — enough to see a file or directory appear. */
function tree(root) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .map((entry) => join(entry.parentPath, entry.name).slice(root.length))
    .sort();
}

// --- ENV5: the running plugin's directory, from the module's own URL --------------------------------

test('resolving from the module URL names the directory the module was loaded from [unit]', () => {
  // `<root>/src/server/neighbour.ts` — built by walking up from the source rather than written as a
  // literal, so moving the file fails this with an arithmetic mismatch instead of passing quietly.
  const expected = dirname(dirname(dirname(RESOLVER)));

  assert.equal(pluginRoot(), expected);
  assert.equal(
    pluginRoot(new URL('file:///somewhere/0.4.0/src/server/neighbour.ts').href),
    '/somewhere/0.4.0',
    'a synthetic URL resolves the same way, so this is arithmetic and not a lucky cwd',
  );
});

// --- ENVX3: no value from the process environment ---------------------------------------------------

test('the resolver reads no value from process.env [unit]', (t) => {
  // The behavioural half. A resolver reaching for the host's placeholder variable would answer this
  // call with `/not/the/plugin/root`; the arithmetic one cannot see it at all.
  const previous = process.env.CLAUDE_PLUGIN_ROOT;
  process.env.CLAUDE_PLUGIN_ROOT = '/not/the/plugin/root';
  t.after(() => {
    if (previous === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
    else process.env.CLAUDE_PLUGIN_ROOT = previous;
  });

  assert.equal(pluginRoot(), dirname(dirname(dirname(RESOLVER))));
  assert.notEqual(pluginRoot(), '/not/the/plugin/root');

  // And the structural half, which catches a read of some other variable the behavioural half never
  // thought to set.
  assert.equal(code.includes('process.env'), false, 'the module reads process.env');

  // The control on the stripping: the string really is in the file, in the comment that explains why
  // it is not in the code. Without this line the assertion above would also pass over an empty
  // string, which is what a regex that stripped too much would leave.
  assert.equal(source.includes('process.env'), true, 'the comment explaining ENVX3 has gone');
  assert.ok(code.includes('fileURLToPath'), 'stripping comments removed the code as well');
});

// --- ENVX2 and NFR1: one read, of the path it was given ----------------------------------------------

test('the check reads only the path it was given, exactly once [unit]', () => {
  const { read, calls } = countingReader([
    { name: '0.3.0', directory: true },
    { name: '0.4.0', directory: true },
  ]);

  const names = siblingNames('/cache/dpm/0.3.0', read);

  assert.deepEqual(names, ['0.3.0', '0.4.0']);
  assert.equal(calls.length, 1, 'exactly one directory read per invocation');
  assert.deepEqual(calls.map((call) => call.path), ['/cache/dpm'],
    'and the only path read is the parent of the root it was given');
});

test('a sibling that is not a directory is not reported as a plugin [unit]', () => {
  const { read } = countingReader([
    { name: '0.4.0', directory: true },
    { name: '.last_inuse_sweep', directory: false },
  ]);

  assert.deepEqual(siblingNames('/cache/dpm/0.4.0', read), ['0.4.0']);
});

/**
 * The recursion rejection, closed behaviourally.
 *
 * The fixture puts a directory *inside* a sibling. A recursive read would surface `nested` in the
 * result — so its absence is evidence about what the read did, rather than about what the source
 * looks like. The options assertion beside it catches the other way in: `readdirSync` recurses when
 * asked to, and asking is a flag rather than a different call.
 */
test('the check does not recurse into subdirectories [unit]', (t) => {
  const { cache, root } = pluginCache(t, ['0.3.0', '0.4.0']);
  mkdirSync(join(cache, '0.4.0', 'nested'));

  const names = siblingNames(root);

  assert.deepEqual(names.sort(), ['0.3.0', '0.4.0']);
  assert.equal(names.includes('nested'), false, 'a directory one level down was reported');

  const { read, calls } = countingReader([]);
  siblingNames(root, read);
  assert.notEqual(calls[0].options?.recursive, true, 'the read asked the filesystem to recurse');
});

// --- ENVX4 and NFR4: no outbound call, and nothing written -------------------------------------------

test('no path this module adds makes an outbound call or spawns a process [unit]', () => {
  // An ES module reaches these only by importing them, so their absence from the import list is the
  // whole claim rather than a token sweep standing in for one.
  // **Assembled rather than written as a literal.** `plugin.test.js` scans every file in the tree
  // for import specifiers using this very shape, and a regex spelling it out is indistinguishable
  // from an import to that scanner — it read this line as a dependency on a package named `([^` and
  // failed the whole suite. Composing the pattern keeps the sequence out of the source.
  const specifier = new RegExp(`${'fr' + 'om'} '([^']+)'`, 'g');
  const imports = [...code.matchAll(specifier)].map((match) => match[1]);

  // **Which builtins, not how many imports.** Written first as an exact list of three, this failed
  // the moment story 3 reused the version parser from a sibling module — a local relative import is
  // not an outbound call, and a test that cannot tell the two apart reports a reuse as a breach. The
  // claim is about what the module can reach outside this process, so it is stated over the builtins.
  const builtins = imports.filter((name) => name.startsWith('node:'));

  assert.deepEqual(builtins.sort(), ['node:fs', 'node:path', 'node:url'],
    'the module reaches a builtin beyond reading the filesystem and joining paths');

  for (const forbidden of ['node:net', 'node:http', 'node:https', 'node:child_process', 'node:dgram']) {
    assert.equal(imports.includes(forbidden), false, `the module imports ${forbidden}`);
  }

  // Everything else is inside this project, so nothing arrives from a package that could.
  for (const name of imports.filter((entry) => !entry.startsWith('node:'))) {
    assert.ok(name.startsWith('./') || name.startsWith('../'), `${name} is not a module of this project`);
  }
});

test('the filesystem beneath and beside the plugin root is unchanged by a read [integration]', (t) => {
  const { cache, root } = pluginCache(t, ['0.2.0', '0.3.0', '0.4.0']);
  const before = tree(cache);

  siblingNames(root);
  siblingNames(root);

  assert.deepEqual(tree(cache), before, 'reading the cache changed what is in it');

  // The control on the comparison: `tree` can see a change, so the equality above is a finding
  // rather than two readings of a snapshot that never varies.
  writeFileSync(join(cache, 'planted'), '');
  assert.notDeepEqual(tree(cache), before, 'the snapshot cannot detect a file appearing');
});

// --- ENVX2 again: nothing a test resolves runs through the user's home directory ----------------------

test('no path any of these tests resolves runs through the home directory [unit]', (t) => {
  const { cache, root } = pluginCache(t, ['0.4.0']);
  const home = homedir();

  for (const path of [cache, root]) {
    assert.equal(path.startsWith(home), false,
      `${path} is under ${home}, so this suite is reading the real machine`);
  }

  // The control: the comparison is capable of saying yes, so the two "no"s above are answers rather
  // than a check that always passes.
  assert.equal(join(home, 'anything').startsWith(home), true);
});

// --- Epic 1 story 3 — the verdict -------------------------------------------------------------------
//
// Everything below is about the three-state answer rather than about the listing. The listing is
// story 2's and is tested above; what is new here is that a set of sibling names becomes exactly one
// of found, none or unknown, and that the two ways of finding nothing stay apart.

test('a higher sibling is reported as a skew naming it [unit]', (t) => {
  const { root } = pluginCache(t, ['0.3.0', '0.4.0'], { running: '0.3.0' });

  // `source` is part of the verdict rather than added by whoever renders it: the composer picks its
  // sentence table from this field, so a verdict without it is one the composer cannot speak for.
  assert.deepEqual(neighbourSkew(root),
    { source: SOURCE.neighbour, state: SKEW.found, running: '0.3.0', newest: '0.4.0' });
});

test('the version reported is the highest installed, compared numerically [unit]', (t) => {
  // `0.10.0` sorts below `0.4.0` as a string and above it as a version. A check that took the first
  // sibling above the running one, or that compared lexically, names the wrong release here — and
  // names it in the message telling someone to restart, which is the one place being wrong is worse
  // than being silent.
  const { root } = pluginCache(t, ['0.3.0', '0.10.0', '0.4.0'], { running: '0.3.0' });

  const skew = neighbourSkew(root);

  assert.equal(skew.state, SKEW.found);
  assert.equal(skew.newest, '0.10.0', 'the highest sibling was not the one reported');

  // **The order is pinned, because the fixture above cannot pin it.** The real directory came back
  // alphabetically, which puts `0.10.0` first — so a check that took the *first* sibling above the
  // running one passed this test by coincidence, and passed it on this filesystem only. Reading the
  // same three names in the order that makes the coincidence unavailable is what closes it.
  const { read } = countingReader(
    ['0.3.0', '0.4.0', '0.10.0'].map((name) => ({ name, directory: true })),
  );

  assert.equal(neighbourSkew(root, read).newest, '0.10.0',
    'the first sibling above the running version was reported instead of the highest');
});

test('siblings at or below the running version are no skew [unit]', (t) => {
  const { root } = pluginCache(t, ['0.2.0', '0.3.0', '0.4.0'], { running: '0.4.0' });

  assert.deepEqual(neighbourSkew(root), { source: SOURCE.neighbour, state: SKEW.none, running: '0.4.0' });
});

test('a root that is not a version directory could not be checked [unit]', (t) => {
  // The `--plugin-dir` case (FR1b): the plugin is loaded from a working tree, so the directory is
  // named for the checkout. Nothing is wrong and nothing can be concluded.
  const { root } = pluginCache(t, ['main'], { running: 'main' });
  const { read, calls } = countingReader([{ name: 'main', directory: true }]);

  const skew = neighbourSkew(root, read);

  assert.equal(skew.state, SKEW.unknown);
  assert.equal(skew.running, 'main');
  assert.match(skew.reason, /not a version directory/);
  assert.equal(calls.length, 0, 'a root it cannot read still cost a directory read');
});

test('a parent that lists no directories could not be checked [unit]', (t) => {
  const { root } = pluginCache(t, ['0.4.0']);

  // Not the same as one sibling — a listing with nothing in it means the layout is not the one this
  // check reads, because a running plugin's own directory is always in its parent. Reporting that as
  // "you are up to date" is the failure the whole spec exists to stop.
  for (const entries of [[], [{ name: '.last_inuse_sweep', directory: false }]]) {
    const { read } = countingReader(entries);
    const skew = neighbourSkew(root, read);

    assert.equal(skew.state, SKEW.unknown, `${entries.length} entries answered something else`);
    assert.match(skew.reason, /beside the plugin root/);
  }
});

test('the three states are distinguishable without reading a sentence [unit]', (t) => {
  const found = neighbourSkew(pluginCache(t, ['0.3.0', '0.4.0'], { running: '0.3.0' }).root);
  const none = neighbourSkew(pluginCache(t, ['0.3.0', '0.4.0'], { running: '0.4.0' }).root);
  const unknown = neighbourSkew(pluginCache(t, ['main'], { running: 'main' }).root);

  const states = [found.state, none.state, unknown.state];

  assert.equal(new Set(states).size, 3, 'two of the three states are the same value');
  assert.deepEqual([...states].sort(), [SKEW.found, SKEW.none, SKEW.unknown].sort(),
    'a state was returned that is not one of the three the module names');

  // And each is a plain value a caller can switch on, rather than a sentence to be matched against.
  for (const state of states) assert.equal(typeof state, 'string');
});

test('the package this check ships in declares no dependencies [unit]', () => {
  // ENVX1. Restated here rather than left to `baseline.test.js` because it is a criterion of this
  // story: the verdict reuses the version parser this repository already has, and the alternative
  // anyone reaches for first is a semver package.
  const manifest = packageManifest();

  assert.deepEqual(manifest.dependencies ?? {}, {});
  assert.deepEqual(unsanctionedDependencies(manifest), [],
    'and nothing installed for development but the type checker — a semver package would show here');
});

// --- The rejections ---------------------------------------------------------------------------------

test('a sibling below the running version is not reported as a skew [unit]', (t) => {
  const { root } = pluginCache(t, ['0.3.0', '0.4.0'], { running: '0.4.0' });

  const skew = neighbourSkew(root);

  assert.notEqual(skew.state, SKEW.found, 'an older sibling was reported as a newer one');
  assert.equal(skew.newest, undefined, 'and it named a version to upgrade to');

  // **The control, and the reason this criterion exists separately from the first.** A comparison
  // written the wrong way round satisfies "reports a skew when a higher sibling exists" on any
  // machine with two versions installed — both tests pass, and the check tells everyone running the
  // newest release to upgrade to the oldest. The same fixture, read from the other end, is what
  // tells the two apart.
  const { root: older } = pluginCache(t, ['0.3.0', '0.4.0'], { running: '0.3.0' });
  assert.equal(neighbourSkew(older).state, SKEW.found,
    'the check cannot report a skew at all, so the assertion above is not about direction');
});

test('an unreadable or unparseable root is answered rather than thrown [unit]', (t) => {
  const { root } = pluginCache(t, ['0.4.0']);
  const angry = () => { throw new Error('EACCES: permission denied'); };

  // The control comes first: the reader really does throw, so the absence below is the module
  // catching something rather than nothing having happened.
  assert.throws(angry, /EACCES/, 'the reader used to provoke a throw does not throw');

  let skew;
  assert.doesNotThrow(() => { skew = neighbourSkew(root, angry); });
  assert.equal(skew.state, SKEW.unknown);
  assert.match(skew.reason, /EACCES/, 'the answer does not carry what stopped it');

  // The other unreadable shape: a name no parser accepts. Also an answer, from a different branch.
  const { root: named } = pluginCache(t, ['not-a-version'], { running: 'not-a-version' });
  assert.doesNotThrow(() => neighbourSkew(named));
});

test('a check that could not run is not reported as no skew [unit]', (t) => {
  const unknown = neighbourSkew(pluginCache(t, ['main'], { running: 'main' }).root);
  const none = neighbourSkew(pluginCache(t, ['0.3.0', '0.4.0'], { running: '0.4.0' }).root);

  assert.notEqual(unknown.state, none.state, 'could-not-check and no-skew are the same value');
  assert.notEqual(unknown.state, SKEW.none);

  // A caller that branches on `state` therefore cannot conflate them, and one that renders a report
  // has a `reason` to render for exactly one of the two.
  assert.equal(typeof unknown.reason, 'string');
  assert.equal(none.reason, undefined, 'a completed check carries a reason it could not complete');
});

// --- Epic 1 story 4 — evaluated per report, never carried over --------------------------------------

test('two reports across an upgrade return different verdicts [integration]', (t) => {
  const { cache, root } = pluginCache(t, ['0.3.0']);

  const before = neighbourSkew(root);

  // The upgrade, as the host performs it: a new version directory appears beside the running one
  // while the server goes on running. Nothing tells the process this happened, which is the entire
  // reason the check has to look again rather than remember.
  mkdirSync(join(cache, '0.4.0'));

  const after = neighbourSkew(root);

  assert.equal(before.state, SKEW.none, 'the first report already saw a sibling that was not there');
  assert.deepEqual(after, { source: SOURCE.neighbour, state: SKEW.found, running: '0.3.0', newest: '0.4.0' });
  assert.notDeepEqual(before, after, 'the second report returned the first one');
});

/**
 * The control, kept rather than run once.
 *
 * The criterion asks for the memoised failure to be observed rather than assumed, and a mutation
 * observed during one session is a claim about that session. Memoising a local copy puts the
 * observation in the suite: the wrapped check goes on answering `none` after the upgrade, which is
 * exactly the failure, and the bare check beside it does not. If the assertion below ever stops
 * failing for the wrapped copy, the fixture has stopped being able to detect a cache at all.
 */
test('a memoised check fails this criterion, which is what makes the criterion mean something [integration]',
  (t) => {
    const { cache, root } = pluginCache(t, ['0.3.0']);

    const cached = new Map();
    const memoised = (path) => {
      if (!cached.has(path)) cached.set(path, neighbourSkew(path));
      return cached.get(path);
    };

    const before = memoised(root);
    mkdirSync(join(cache, '0.4.0'));
    const after = memoised(root);

    assert.deepEqual(after, before, 'the memoised copy noticed the upgrade, so it is not memoising');
    assert.equal(after.state, SKEW.none, 'and the stale answer it holds is the reassuring one');

    // And the check itself, over the same directory in the same state, disagrees with it.
    assert.equal(neighbourSkew(root).state, SKEW.found,
      'the unmemoised check gives the same answer as the cache, so this control proves nothing');
  });

test('the entry point answers from scratch on each call [integration]', () => {
  const first = currentSkew();
  const second = currentSkew();

  // **Two equal answers that are not the same answer.** A memoised entry point returns the identical
  // object every time, so reference inequality is the property that separates "computed twice" from
  // "computed once and kept" — and it is a property the values themselves cannot show, because a
  // correct check over an unchanged directory gives the same verdict both times.
  assert.deepEqual(first, second, 'the same directory gave two different answers');
  assert.notEqual(first, second, 'the entry point returned a held object rather than a fresh answer');

  // And it looked at the directory this module is loaded from, rather than one passed in at start.
  assert.equal(first.running, basename(pluginRoot()));

  // Run from a working tree, that name is a checkout rather than a release, so the verdict is
  // `unknown` — FR1b, and the reason this assertion is about the state rather than about a version.
  assert.equal(first.state, SKEW.unknown);
});

// --- Epic 1 story 5: one composer for the sentence ---------------------------------------------------

test('the skew sentence is composed in exactly one place [unit]', () => {
  // FR4's rejection, and the one a reviewer is least likely to catch by reading. Two channels — a
  // tool response and a stderr line — and two detectors to come, the neighbour and the database
  // stamp, is four chances to write this sentence four times. Nothing breaks when they drift; the
  // reports just stop agreeing about what happened, which nobody notices until they disagree in
  // front of someone trying to work out why their session is behaving oddly.
  const REMEDY = 'Restart the session';

  const composing = moduleFilesUnder(fileURLToPath(new URL('../src', import.meta.url)))
    .filter((file) => readFileSync(file, 'utf8').includes(REMEDY));

  assert.deepEqual(composing, [COMPOSER], 'the remedy sentence is written outside the one composer');

  // The control on the sweep. Without it, a search whose phrase had drifted out of the source would
  // return an empty list and read as a clean pass — the same false negative NFR6 forbids from an
  // integrity report, arriving here through a test instead.
  assert.ok(composing.length > 0, 'the sweep found no composer at all, so it is matching nothing');
  assert.ok(readFileSync(COMPOSER, 'utf8').includes(`${REMEDY} to`),
    'the phrase this sweep looks for is no longer the phrase the composer writes');
});

test('every state gets a sentence, and the two empty answers do not share one [unit]', () => {
  const sentences = [
    skewMessage({ source: SOURCE.neighbour, state: SKEW.found, running: '0.3.0', newest: '0.4.0' }),
    skewMessage({ source: SOURCE.neighbour, state: SKEW.none, running: '0.4.0' }),
    skewMessage({ source: SOURCE.neighbour, state: SKEW.unknown, running: 'main', reason: 'it is a working tree' }),
  ];

  for (const sentence of sentences) assert.ok(sentence.length > 0);

  // The two that report no skew have to read differently, or FR5's distinction survives in the
  // state and is thrown away by the only part of the report a human actually reads.
  assert.equal(new Set(sentences).size, 3, 'two states are described by the same sentence');
  assert.match(sentences[2], /it is a working tree/, 'the reason it could not check is not carried');
});

// --- Epic 1 story 6: the coupling is recorded, and no skill pays for the pointer --------------------

test('no file under the skills directory names the maintenance record [unit]', () => {
  // NFR5's rejection. The record itself is judged by reading it — no test tells a passage that
  // documents the layout from one that mentions it. What a test can hold is the cost: a SKILL.md is
  // read in full on every invocation of that skill, in every project the plugin is installed in, so
  // a pointer to a maintainer's document is a line paid for forever by runs that will never open it.
  //
  // The whole tree, not the SKILL.md files — a reference smuggled into a reference file beside one
  // is the same line, arriving by a path a narrower sweep would not look down.
  const files = filesUnder(fileURLToPath(new URL('../skills', import.meta.url)));
  const naming = files.filter((file) => readFileSync(file, 'utf8').includes('docs/maintenance'));

  assert.deepEqual(naming, [], 'a skill file names the maintenance record, which every run pays for');

  // Two controls, because the emptiness above has two uninteresting explanations. The sweep found
  // files at all, and it can see the phrase when the phrase is there.
  assert.ok(files.length > 10, 'the sweep walked no skills, so it would report clean over anything');
  assert.ok(files.some((file) => readFileSync(file, 'utf8').includes('dpm')),
    'the reader returned nothing readable, so the filter above never ran on real content');
});

test('the coupling to the host plugin cache is recorded outside the plugin [unit]', () => {
  // The positive half, and deliberately shallow. Whether the record explains the layout well is a
  // judgement a reader makes; what is checkable is that the record exists, is reachable from the
  // file's own contents list, and says the two things the criterion names — the layout assumed, and
  // what breaks when the host changes it.
  //
  // **`../docs`, not `../../docs`, and "outside the plugin" narrowed with it.** At v0.7.0 the
  // plugin was `dpm/` inside the marketplace repository and the record sat beside it, so the path
  // left the plugin and stayed in the repository. This fork is the repository: `../../` leaves the
  // checkout entirely and reads whatever is above it, which is the mistake `corpus.test.js`
  // documents. What the criterion is protecting is unchanged and is asserted by the test above —
  // the record is out of the skills tree, where a line is paid for on every invocation. `docs/` is
  // outside it, and is where `src/schema/012-search.sql` and its two siblings already point.
  const record = readFileSync(
    fileURLToPath(new URL('../docs/maintenance/README.md', import.meta.url)), 'utf8',
  );

  const heading = '## `dpm` ↔ the harness — the plugin cache layout the neighbour check reads';
  assert.ok(record.includes(heading), 'the maintenance record has no entry for the plugin cache');

  const entry = record.slice(record.indexOf(heading));
  assert.match(entry, /\*\*The record\.\*\*/, 'the entry does not state what layout is assumed');
  assert.match(entry, /\*\*What can break it\.\*\*/, 'the entry does not say what breaks it');

  // Reachable rather than merely present: an entry missing from the contents list is one nobody
  // finds, and this file is long enough for that to be the same as not writing it.
  const contents = record.slice(0, record.indexOf('\n---\n'));
  assert.ok(contents.includes('the plugin cache layout the neighbour check reads'),
    'the entry is not listed in the contents');
});
