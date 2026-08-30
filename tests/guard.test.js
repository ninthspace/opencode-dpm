/**
 * Epic 47-04 Story 3 — the pre-commit divergence guard (FR7, AD8).
 *
 * **The load-bearing tests here are the ones a parse-and-compare guard would pass.** AD8's must-NOT
 * forbids checking a generated file by parsing it, and the reason a structural assertion is not
 * enough is that "no parser imported" is satisfied by a guard that normalises whitespace itself,
 * or reads a metadata block into a map, or compares line sets. So the edits below are chosen to be
 * *semantically invisible*: two spaces removed from the end of a hard-break line, two metadata
 * lines swapped. Every one of them is a byte difference that the next regeneration silently
 * destroys, and every one of them is a change a parser would call equal.
 *
 * The other half is composition. A commit carrying a fresh projection and a stale dump passes every
 * check aimed at the markdown — the prose diff reads current — and leaves the committed database
 * behind it, which is the failure FR7 names second and the one no per-artefact test catches.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runNode } from './support/run-node.js';
import { moduleFilesUnder } from './support/sources.js';
import { fullCorpus } from './support/corpus.js';
import { start } from '../src/start.ts';
import { spineTools } from '../src/tools/index.ts';
import { dump } from '../src/dump/index.ts';
import { project } from '../src/projection/index.ts';
import { DIVERGENCE, DUMP_PATH, guard } from '../src/guard/index.ts';
import { run } from '../src/guard/main.ts';
import { targetVersion } from '../src/schema/migrate.ts';

const ROOT = join(import.meta.dirname, '..');
const BIN = join(ROOT, 'bin', 'dpm-guard.ts');

/**
 * A repository whose generated artefacts are current: a real database on disk, the projection
 * written under `docs/`, and `.dpm/dpm.sql` beside the database.
 *
 * File-backed rather than `:memory:`, because the guard's whole subject is what is on a disk.
 */
function repository(t) {
  const root = mkdtempSync(join(tmpdir(), 'dpm-guard-'));

  t.after(() => rmSync(root, { recursive: true, force: true }));

  const location = join(root, '.dpm', 'dpm.db');

  mkdirSync(dirname(location), { recursive: true });

  const { db } = start(location);

  t.after(() => db.close());

  const call = Object.fromEntries(spineTools(db).map((tool) => [tool.name, tool.handler]));
  const documents = fullCorpus(db, call);

  const regenerate = () => {
    project(db, { root });
    writeFileSync(join(root, DUMP_PATH), dump(db).sql, 'utf8');
  };

  regenerate();

  return { root, location, db, call, documents, regenerate };
}

/** A generated file's path within the repository, and its current bytes. */
function generated(root, name) {
  const path = join(root, name);

  return { path, text: readFileSync(path, 'utf8') };
}

/** Run the guard in-process and capture both streams alongside the exit code. */
function invoke({ root, location }) {
  let out = '';
  let err = '';

  const code = run({
    root,
    location,
    streams: { out: (text) => { out += text; }, err: (text) => { err += text; } },
  });

  return { code, out, err };
}

// --- A clean tree, and the control that keeps every failure below honest ----------------------

test('a tree whose generated files match the database passes, and says what it checked', (t) => {
  const repo = repository(t);
  const { code, out, err } = invoke(repo);

  assert.equal(code, 0, err);
  // Thirteen documents with a file of their own, plus the artifact register — the one projected
  // file that is not a document, and so the one the per-document loop cannot produce.
  assert.match(out, /14 projected files and \.dpm\/dpm\.sql match the database/);

  // `checked` is returned so a pass over nothing is distinguishable from a pass. An empty
  // `diverged` says nothing on its own — NFR6's shape exactly.
  const result = guard(repo.db, { root: repo.root });

  assert.equal(result.diverged.length, 0);
  assert.equal(result.checked.files, 14);
});

// --- Hand-edits (criterion 1, and the must-NOT beside it) ------------------------------------

test('a hand-edited generated file fails the guard, naming the file', (t) => {
  const repo = repository(t);
  const file = generated(repo.root, 'docs/specifications/01-spec-persistence.md');

  writeFileSync(file.path, file.text.replace('One database, one schema.', 'Two databases.'));

  const { code, err } = invoke(repo);

  assert.equal(code, 1);
  assert.match(err, /docs\/specifications\/01-spec-persistence\.md — differs/);
  assert.match(err, /Nothing was written/);
});

test('must NOT — a hand-edit is silently overwritten with no diagnostic', (t) => {
  const repo = repository(t);
  const file = generated(repo.root, 'docs/epics/01-01-epic-projection.md');
  const edited = file.text.replace('Story 1 settled the filenames.', 'A note I wrote by hand.');

  writeFileSync(file.path, edited);

  const { code, err } = invoke(repo);

  // Two halves, and the second is the one this criterion is about. The guard reports — and the
  // edit is still there afterwards, byte for byte. A guard that regenerated on the way past would
  // pass its own check on the second run and the user would meet the loss in a diff they did not
  // write.
  assert.equal(code, 1);
  assert.ok(err.length > 0, 'the guard failed silently');
  assert.equal(readFileSync(file.path, 'utf8'), edited, 'the guard overwrote the hand-edit');

  // And nothing else moved either: the dump is untouched and no file appeared.
  assert.equal(readFileSync(join(repo.root, DUMP_PATH), 'utf8'), dump(repo.db).sql);
  assert.deepEqual(readdirSync(join(repo.root, 'docs', 'epics')).sort(),
    ['01-01-coverage_matrix-projection.md', '01-01-epic-projection.md']);
});

// --- must NOT — parse and compare (criterion 5) ----------------------------------------------

test('an edit that changes bytes and not meaning still fails', (t) => {
  const repo = repository(t);
  const file = generated(repo.root, 'docs/specifications/01-spec-persistence.md');

  // `field()` emits two trailing spaces on purpose — markdown's hard line break — and an editor
  // configured to strip trailing whitespace removes them on save. Nothing about the document
  // changes; every byte comparison does. This is the edit a normalising guard calls clean and the
  // next regeneration silently undoes.
  const stripped = file.text.replaceAll('  \n', '\n');

  assert.notEqual(stripped, file.text, 'the fixture has no hard breaks, so nothing was stripped');

  writeFileSync(file.path, stripped);

  const { code, err } = invoke(repo);

  assert.equal(code, 1, 'a whitespace-only edit was accepted');
  assert.match(err, /01-spec-persistence\.md — differs/);
});

test('reordering two metadata lines fails, though every field survives', (t) => {
  const repo = repository(t);
  const file = generated(repo.root, 'docs/epics/01-01-epic-projection.md');

  const lines = file.text.split('\n');
  const number = lines.findIndex((line) => line.startsWith('**Number**'));
  const source = lines.findIndex((line) => line.startsWith('**Source spec**'));

  assert.ok(number >= 0 && source === number + 1, 'the header shape moved');

  [lines[number], lines[source]] = [lines[source], lines[number]];
  writeFileSync(file.path, lines.join('\n'));

  // A guard that read the header into a map — which is the shape "parse and compare" takes in
  // practice, long before anyone imports a markdown library — sees the same three fields with the
  // same three values and reports clean.
  const { code, err } = invoke(repo);

  assert.equal(code, 1, 'a reordered metadata block was accepted');
  assert.match(err, /01-01-epic-projection\.md — differs/);
});

test('the guard reads generated files whole and compares them to regenerated bytes', () => {
  const files = moduleFilesUnder(join(ROOT, 'src/guard'));

  assert.ok(files.length >= 2, `only ${files.length} guard modules were swept`);

  const code = (file) => readFileSync(file, 'utf8')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
    .join('\n');

  // The structural half. It is the weaker of the two and is kept because it fails earlier: a
  // parser arriving as a dependency is caught here rather than by whichever semantic edit happens
  // to slip past it. The behavioural tests above are what the criterion actually rests on.
  const parsing = /marked|remark|markdown-it|unified|micromark|\.split\(['"]\\n['"]\)/;

  for (const file of files) {
    assert.doesNotMatch(code(file), parsing, `${file} takes a generated file apart`);
  }

  assert.match("const lines = body.split('\\n')", parsing, 'the positive control matched nothing');
});

// --- The dump, and the composition (criteria 2 and 4) ----------------------------------------

test('a write since the last regeneration leaves the dump stale, and the guard names it', (t) => {
  const repo = repository(t);

  repo.call.create_spec({ slug: 'search', title: 'Full-text search' });

  const { code, err } = invoke(repo);

  assert.equal(code, 1);
  assert.match(err, /\.dpm\/dpm\.sql — differs/);

  // The new spec's file is missing too, which is the other half of the same write — and both are
  // reported from one run rather than one at a time.
  assert.match(err, /docs\/specifications\/02-spec-search\.md — is not on disk/);
  assert.match(err, /2 generated files do not match/);
});

test('must NOT — a commit is accepted carrying a fresh projection and an unregenerated dump', (t) => {
  const repo = repository(t);

  repo.call.create_spec({ slug: 'search', title: 'Full-text search' });

  // **The projection alone is regenerated, and the dump is left behind.** This is the state a
  // guard that only walked `docs/` reports clean: every markdown file matches the database, the
  // pull request's prose diff reads current, and the committed database is a write behind it.
  project(repo.db, { root: repo.root });

  const { code, err } = invoke(repo);

  assert.equal(code, 1, 'a stale dump passed behind a fresh projection');
  assert.match(err, /\.dpm\/dpm\.sql — differs/);
  assert.match(err, /1 generated file does not match/,
    'the projection half is clean, so the dump is the only finding');

  // The control: regenerating both is what clears it.
  repo.regenerate();
  assert.equal(invoke(repo).code, 0);
});

test('a missing dump is reported as missing rather than as differing', (t) => {
  const repo = repository(t);

  rmSync(join(repo.root, DUMP_PATH));

  const { code, err } = invoke(repo);

  assert.equal(code, 1);
  assert.match(err, new RegExp(`\\.dpm/dpm\\.sql — ${DIVERGENCE.missing}`));
});

// --- Orphans -----------------------------------------------------------------------------------

test('a generated file no document produces is reported, and a hand-kept one is not', (t) => {
  const repo = repository(t);

  // Deleting a document removes no file. Without this the guard walks only what the projection
  // produces, every one of those matches, and the leftover is never looked at — a stale projection
  // wearing a passing check, reached from the direction a partial write does not cover.
  // Named the way the renderer names things, padding included, because that is what a file left
  // behind by a deleted document looks like. An orphan spelled some other way would also be
  // reported, and would leave the harder case — one indistinguishable from live output — untested.
  const orphan = join(repo.root, 'docs', 'retros', '09-retro-gone.md');

  writeFileSync(orphan, '# A retro whose document was deleted\n');

  // And a file that is not this renderer's output, in the same directory. Reporting it would make
  // the guard unusable in any tree that holds a hand-kept note.
  writeFileSync(join(repo.root, 'docs', 'retros', 'README.md'), '# How we write retros\n');

  const { code, err } = invoke(repo);

  assert.equal(code, 1);
  assert.match(err, new RegExp(`docs/retros/09-retro-gone\\.md — ${DIVERGENCE.orphaned}`));
  assert.doesNotMatch(err, /README\.md/, 'a hand-kept file was reported as generated output');
  assert.match(err, /1 generated file does not match/);
});

// --- The command (criterion 1, over the executable a hook runs) ------------------------------

test('the executable exits zero on a clean tree and non-zero on a diverged one', async (t) => {
  const repo = repository(t);

  const clean = await runNode([BIN, repo.root], '', { DPM_DATABASE: repo.location });

  assert.equal(clean.code, 0, clean.stderr);
  assert.match(clean.stdout, /match the database/);
  assert.equal(clean.stderr, '');

  const file = generated(repo.root, 'docs/runbooks/01-runbook-restore.md');

  writeFileSync(file.path, `${file.text}\nAnd a line I added.\n`);

  const diverged = await runNode([BIN, repo.root], '', { DPM_DATABASE: repo.location });

  assert.equal(diverged.code, 1);
  assert.match(diverged.stderr, /01-runbook-restore\.md — differs/);
  assert.equal(diverged.stdout, '', 'the failure report reached stdout, where a hook logs nothing');
});

test('the guard cannot run without a database, and creates none in the process', (t) => {
  const repo = repository(t);
  const absent = join(repo.root, '.dpm', 'absent.db');

  const { code, err } = invoke({ root: repo.root, location: absent });

  // Exit 2, not 1. "The guard could not run" sends a user to fix the setup; "the tree diverged"
  // sends them to regenerate files against a database that is not there.
  assert.equal(code, 2);
  assert.match(err, /there is no database there/);

  // **And the file is still absent.** `DatabaseSync` creates an empty database at a path that has
  // none, so the obvious shape — open, then let the failure fall out — writes a `.dpm/dpm.db` into
  // the repository as a side effect of checking one, and then reports `no such table: document`.
  // The guard writes nothing, and that has to include the database.
  assert.ok(!readdirSync(join(repo.root, '.dpm')).includes('absent.db'),
    'the guard created the database it was checking for');
});

test('a database from a newer release is refused rather than compared against', (t) => {
  const repo = repository(t);

  // The tree is clean, so every *other* reason to fail is excluded — what this asserts is that a
  // guard which would otherwise pass refuses anyway. That is the whole hazard: the stale guard's
  // verdict on a newer database is a pass, and a pass is what nobody looks into.
  assert.equal(invoke(repo).code, 0);

  repo.db
    .prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
    .run(targetVersion() + 1, new Date().toISOString());

  const { code, out, err } = invoke(repo);

  // Exit 2 and not 1 — the setup is wrong, the tree is not.
  assert.equal(code, 2);
  assert.match(err, /older release/);
  assert.equal(out, '', 'a refusal reached stdout, where a hook logs nothing');

  // The two things the message has to carry to be actionable: where the hook is still wired, and
  // that re-pointing it is the fix.
  assert.match(err, /\.git\/hooks\/pre-commit/);
  assert.match(err, /symlink/);
});

test('the shipped pre-commit hook runs the guard and repairs nothing', () => {
  const hook = readFileSync(join(ROOT, 'hooks', 'pre-commit'), 'utf8');

  assert.match(hook, /bin\/dpm-guard\.ts/);

  // The hook must not stage or regenerate. A hook that did would silently overwrite a hand-edit
  // and then pass its own check, which is the must-NOT above reached through the installer rather
  // than through the guard.
  assert.doesNotMatch(hook, /git\s+add|git\s+stash|dpm-project|--fix/);
});
