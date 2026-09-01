/**
 * Epic 02-03 Story 1 — `read_shared_document`, the tool ADR 02-01 puts the shared documents behind.
 *
 * Twenty-four references in twenty-three skill bodies open by reading `dpm/shared/*.md`, and the
 * mechanism that made those resolve — `resolveSupportingPaths`, a registration-time rewrite of the
 * reference to an absolute path — cannot run on v1, which reads `SKILL.md` verbatim off disk. It is
 * already rejected on v2 as `external_directory`. So the conventions are reaching the model on
 * neither host, and the shape of that failure is what these tests are aimed at: **an absent file
 * read returns nothing and raises nothing**, and a skill carries on without its conventions.
 *
 * The tool replaces it because a tool call is loud. That property is only worth what its refusal is
 * worth, which is why criterion 1 is half about the content and half about what happens to a name
 * that names nothing — a tool answering an unknown name with empty content would have reproduced
 * the silent omission one layer in, and every test here would still have passed.
 *
 * **The tests take a `root` rather than reading this checkout wherever they can.** Asserting the
 * real `shared/` against the real `shared/` says only that `readFileSync` works twice. What says
 * the tool is a name-to-document mechanism is a directory whose contents the test chose — a third
 * document that exists in no source file, served by the same call with no line added for it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import { SHARED_DIRECTORY } from '../src/plugin/root.ts';
import { sharedDocumentTools } from '../src/tools/shared.ts';
import { spineTools } from '../src/tools/index.ts';
import { openPlanningDatabase } from './support/planning-database.js';
import { filesUnder } from './support/sources.js';
import { packageTree } from './support/package-tree.js';

const ROOT = join(import.meta.dirname, '..');
const SHARED = join(ROOT, SHARED_DIRECTORY);

/** The two documents the package ships, read from the directory rather than named here. */
const NAMED = ['skill-conventions', 'status-model'];

/** The tool, built over a root of the caller's choosing. */
const built = (root) => sharedDocumentTools(root ? { root } : {})[0];

const read = (name, root) => built(root).handler({ name });

// --- Criterion 1: the bytes, and the refusal ------------------------------------------------------

test('the tool returns the byte content of the named shared document [unit]', () => {
  // **The oracle is the file**, not a snippet of it — a test asserting that the answer contains a
  // remembered heading passes for a truncated read, which is precisely the half-answer this
  // mechanism exists to make impossible.
  const answer = read('skill-conventions');

  assert.equal(answer.content, readFileSync(join(SHARED, 'skill-conventions.md'), 'utf8'));
  assert.equal(answer.name, 'skill-conventions');

  // The control on that equality: it is over something, and it can come out false. Without this a
  // tool returning `undefined` against a file read that also returned `undefined` would pass.
  assert.ok(answer.content.length > 1000,
    `the conventions came back as ${answer.content.length} characters, which is not a document`);
  assert.notEqual(answer.content, read('status-model').content);
});

test('an unknown name is refused, and the refusal names what exists [unit]', () => {
  // **This is the criterion, not an edge case.** A tool answering an unknown name with empty
  // content puts the silent omission back — inside the tool boundary this time, where the loudness
  // the tool was chosen for was supposed to live.
  assert.throws(() => read('conventions'), (error) => {
    assert.match(error.message, /no shared document is called 'conventions'/);

    // Named rather than counted, and both of them: a caller told only *no* is left exactly where a
    // failed file read would have left them.
    for (const name of NAMED) assert.match(error.message, new RegExp(name));

    return true;
  });

  // Not an empty answer, not a null, not a resolved promise — the three ways a refusal decays into
  // the thing it was written to prevent.
  for (const unknown of ['conventions', '', 'status_model', 'skill-conventions.md']) {
    assert.throws(() => read(unknown), Error, `'${unknown}' was answered rather than refused`);
  }

  // And the refusal is not so wide that everything is refused, which is the way this test passes
  // while the tool is broken.
  for (const name of NAMED) assert.ok(read(name).content.length > 0);
});

test('a name that climbs out of the shared directory is refused [unit]', () => {
  // `name` becomes part of a path, so `../README` has to go somewhere. The interesting case is the
  // one that names a file **that exists** — a check filtering on odd characters passes every test
  // written with a path that was never going to resolve anyway.
  assert.ok(readFileSync(join(ROOT, 'README.md'), 'utf8').length > 0,
    'the escape below aims at a file that is not there, so it proves nothing');

  for (const escape of ['../README', '../../README', join(ROOT, 'README')]) {
    assert.throws(() => read(escape), /no shared document is called/);
  }
});

// --- Criterion 2: one mechanism, not one tool and one special case --------------------------------

test('both shipped documents are served by the identical call [unit]', () => {
  // Driven from the directory's own contents rather than from two hand-written cases. If the second
  // document had needed a line of its own, this loop is where the missing line would show.
  for (const name of NAMED) {
    const answer = read(name);

    assert.equal(answer.name, name);
    assert.equal(answer.content, readFileSync(join(SHARED, `${name}.md`), 'utf8'), name);
  }

  // The reading is over the directory and not over `NAMED`: a third document arriving in `shared/`
  // and never reaching the tool is the failure this criterion is really about, and a loop over a
  // hand-kept pair could not see it.
  assert.throws(() => read('nothing-of-the-sort'));
});

test('a document this package has never held is served with no line added for it [unit]', (t) => {
  // **The control that makes criterion 2 mean something.** Against the real `shared/` a tool with
  // two hard-coded branches is indistinguishable from a name-to-document mechanism — both answer
  // both names. Here the directory holds a third document that appears in no source file, so only
  // the mechanism can answer.
  const root = packageTree(t, {}, {
    'skill-conventions.md': 'planted conventions\n',
    'status-model.md': 'planted statuses\n',
    'invented-here.md': 'a document no branch was written for\n',
  });

  assert.equal(read('invented-here', root).content, 'a document no branch was written for\n');

  // And it serves the planted copies rather than this checkout's, which is the other half: the tool
  // reads the root it was given rather than reciting what it was built beside.
  assert.equal(read('skill-conventions', root).content, 'planted conventions\n');

  // The refusal follows the directory too — it lists what is there, not what this package ships.
  assert.throws(() => read('nothing-here', root), /invented-here/);
});

// --- Criterion 3: the same answer under both hosts ------------------------------------------------

test('the answer does not depend on the working directory the host spawned the server in [unit]', (t) => {
  // **This is what "identical under both hosts" reduces to on one machine.** The server process is
  // the same on v1 and v2 — ADR 01-02 — so the axis that actually differs is what the host hands
  // it, and the working directory is the part of that this tool could accidentally read. It resolves
  // its own package root instead.
  const before = read('skill-conventions').content;
  const elsewhere = tmpdir();
  const here = process.cwd();

  t.after(() => process.chdir(here));
  process.chdir(elsewhere);

  assert.equal(read('skill-conventions').content, before,
    'the tool answered differently from another working directory, so it is reading a host fact');

  // **The control, and without it the equality above is unfalsifiable.** `Context.root` defaults to
  // `'.'` — the working directory — which is exactly the root this tool would have taken had it
  // used the one every other tool is handed. Resolved across the same two directories it gives two
  // different answers, so the comparison above is over an axis that genuinely moved.
  assert.notEqual(join(here, SHARED_DIRECTORY), join(process.cwd(), SHARED_DIRECTORY),
    'the chdir did not move anything, so nothing above was tested');
});

test('the registry builds it with no host context at all [unit]', (t) => {
  // The other half of the same claim, read off the registry rather than the module: `spineTools`
  // is handed a `root`, and two wildly different ones must not reach this tool.
  const registered = (root) => spineTools(openPlanningDatabase(t), { root })
    .find((tool) => tool.name === 'read_shared_document');

  const one = registered('/some/project');
  const other = registered('/a/completely/different/project');

  assert.ok(one, 'read_shared_document is not in the registry');
  assert.equal(one.handler({ name: 'status-model' }).content,
    other.handler({ name: 'status-model' }).content);

  // Which is the same answer the module gives standing alone — so the registry adds nothing and
  // takes nothing away.
  assert.equal(one.handler({ name: 'status-model' }).content, read('status-model').content);
});

// --- Criterion 4 (must NOT): a second copy of either shared document ------------------------------

/**
 * Every file under a root whose content is byte-identical to one of the shared documents.
 *
 * **By content, not by filename.** A copy renamed is still a copy, and it is the worse kind: a
 * second `skill-conventions.md` is visible to anyone listing the tree, where `conventions-old.txt`
 * drifts for a year without being noticed. So the reading hashes and the filename plays no part.
 *
 * @param root The tree to sweep.
 * @param shared The shared directory within it, whose own files are the originals.
 * @returns {string[]} Root-relative paths of the duplicates, sorted.
 */
function duplicatesOf(root, shared) {
  const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
  const originals = new Map();

  for (const path of filesUnder(shared)) originals.set(digest(path), path);

  return filesUnder(root)
    .filter((path) => dirname(path) !== shared && originals.has(digest(path)))
    .map((path) => relative(root, path))
    .sort();
}

test('the duplicate reading finds a renamed second copy, by path [unit]', (t) => {
  // **Red first.** A must-NOT asserted against a tree that has never held the thing is an assertion
  // rather than a verification: the reading has to be seen finding what it is looking for before
  // its silence over the real tree means anything.
  const root = packageTree(t, {}, {
    'skill-conventions.md': readFileSync(join(SHARED, 'skill-conventions.md'), 'utf8'),
  });

  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'conventions-old.txt'),
    readFileSync(join(SHARED, 'skill-conventions.md')));

  assert.deepEqual(duplicatesOf(root, join(root, SHARED_DIRECTORY)),
    [join('docs', 'conventions-old.txt')],
    'the reading missed a byte-identical copy under a different name');

  // And it is quiet over the same tree once the copy is gone — otherwise it reports every file.
  writeFileSync(join(root, 'docs', 'conventions-old.txt'), 'something else entirely\n');
  assert.deepEqual(duplicatesOf(root, join(root, SHARED_DIRECTORY)), []);
});

test('must NOT — a second copy of either shared document exists anywhere in the tree [unit]', () => {
  // Reported by path, as the criterion asks. A count would say a duplicate exists and leave the
  // reader to find it, which is the position `shared/` was in before this epic.
  assert.deepEqual(duplicatesOf(ROOT, SHARED), [],
    'a byte-identical copy of a shared document is in the tree — the tool is one reader of two files');

  // The controls on that emptiness, both directions. The sweep reaches a lot of files, and the
  // originals it compares against are the two that exist.
  assert.ok(filesUnder(ROOT).length > 100, 'the sweep walked almost nothing');
  assert.deepEqual(filesUnder(SHARED).map((path) => relative(SHARED, path)).sort(),
    NAMED.map((name) => `${name}.md`));
});
