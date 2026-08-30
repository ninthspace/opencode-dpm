/**
 * Epic 47-10 Story 2 — publishing as a command (FR6, AD11, NFR2).
 *
 * **The subject here is the process, not the function.** `publish.test.js` already establishes what
 * gets written; nothing below re-asserts that. What a command adds is the part a shell can see —
 * an exit code, two streams, and a report someone reads — and each of those has a failure the
 * function-level tests cannot reach: a refusal that exits 0, a message on the wrong stream, a
 * binary that crashes before its own version check runs.
 *
 * Both streams are captured separately throughout. A test reading them merged passes whichever one
 * carries the message, which is exactly the criterion this story states as a must-NOT.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runNode } from './support/run-node.js';
import { reachesBySpecifier, staticImports } from './support/sources.js';
import { fullCorpus } from './support/corpus.js';
import { start } from '../src/start.ts';
import { spineTools } from '../src/tools/index.ts';
import { DUMP_PATH } from '../src/guard/index.ts';
import { run } from '../src/publish/main.ts';

const ROOT = join(import.meta.dirname, '..');
const BIN = join(ROOT, 'bin', 'dpm-publish.ts');

/** A repository with a real database on disk and nothing generated yet. File-backed, because a */
/** command's whole subject is a process acting on a disk. */
function repository(t) {
  const root = mkdtempSync(join(tmpdir(), 'dpm-publish-cli-'));

  t.after(() => rmSync(root, { recursive: true, force: true }));

  const location = join(root, '.dpm', 'dpm.db');

  mkdirSync(dirname(location), { recursive: true });

  const { db } = start(location);

  t.after(() => db.close());

  const call = Object.fromEntries(spineTools(db).map((tool) => [tool.name, tool.handler]));
  const documents = fullCorpus(db, call);

  return { root, location, db, call, documents };
}

/** Run the command in-process and capture both streams alongside the exit code. */
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

/**
 * Every generated file under `root`, relative path to contents. The tree as a comparable value.
 *
 * **The database is skipped, because it is the input rather than the tree.** These repositories are
 * file-backed and the database lives inside `root`, so a comparison that included it would report a
 * difference for every test that writes a row — which is every test here that arranges a refusal.
 * The claim being made is about what publishing left behind, and `.dpm/dpm.db` is what it read.
 */
function snapshot(root, at = '', into = new Map()) {
  for (const entry of readdirSync(join(root, at), { withFileTypes: true })) {
    const path = at === '' ? entry.name : `${at}/${entry.name}`;

    if (entry.isDirectory()) snapshot(root, path, into);
    else if (!/\.db(-wal|-shm)?$/.test(entry.name)) into.set(path, readFileSync(join(root, path), 'utf8'));
  }

  return into;
}

// --- Criterion 1: it publishes the tree it is given, exits 0, and prints what changed -----------

test('the executable publishes the tree rooted at the path it is given and exits zero', async (t) => {
  const repo = repository(t);

  // The wrong answer: a binary that exits 0 having done nothing at all satisfies the exit code and
  // prints a report describing an empty corpus, so the tree is asserted as well as the code — and
  // the guard is then run over the result, because "files exist" and "files match the database"
  // are different claims and only the second is what publishing owes.
  const first = await runNode([BIN, repo.root], '', { DPM_DATABASE: repo.location });

  assert.equal(first.code, 0, first.stderr);
  assert.equal(first.stderr, '', 'a successful publish said something on stderr');
  assert.match(first.stdout, /new\s+docs\/specifications\/.*\.md/, 'the report named no document');
  assert.match(first.stdout, new RegExp(`new\\s+${DUMP_PATH.replace('.', '\\.')}`));

  assert.ok(existsSync(join(repo.root, DUMP_PATH)), 'the dump was reported and not written');
  assert.ok(readdirSync(join(repo.root, 'docs')).length > 0, 'no projection reached the tree');

  const checked = await runNode([join(ROOT, 'bin', 'dpm-guard.ts'), repo.root], '',
    { DPM_DATABASE: repo.location });

  assert.equal(checked.code, 0, `the guard rejected what publish wrote:\n${checked.stderr}`);
});

test('a second run prints that there was nothing to do, rather than repeating the first report', async (t) => {
  const repo = repository(t);

  await runNode([BIN, repo.root], '', { DPM_DATABASE: repo.location });

  // **"Prints what changed" is only a claim if a run that changed nothing prints something else.**
  // A report listing every generated file every time is not a report of what changed; it reads
  // identically whether the run did everything or nothing, which is the same indistinguishability
  // the record's four lists exist to remove, arriving one layer up.
  const second = await runNode([BIN, repo.root], '', { DPM_DATABASE: repo.location });

  assert.equal(second.code, 0, second.stderr);
  assert.match(second.stdout, /nothing to publish/);
  assert.doesNotMatch(second.stdout, /^\s+(new|rewritten|removed)\s/m,
    'the second run listed files it did not touch');
});

test('a document whose text moved is reported as rewritten, and a new one as new', (t) => {
  const repo = repository(t);

  const first = invoke(repo);

  assert.equal(first.code, 0, first.err);
  assert.doesNotMatch(first.out, /rewritten\s+docs\//,
    'a file was called rewritten on a run that published into an empty tree');

  // **"What changed" is two different things, and collapsing them loses the one a reader acts on.**
  // A document that arrived and a document whose text moved leave the same file on disk, so the
  // distinction is destroyed at the moment of writing and cannot be recovered afterwards — which is
  // why the record carries it rather than deriving it. The wrong answer here reports every write as
  // new, and reads as a tree being created each time it is republished.
  const specs = readdirSync(join(repo.root, 'docs', 'specifications'));

  assert.equal(specs.length, 1, 'the corpus no longer has exactly one spec to edit');

  repo.db.prepare('UPDATE document SET title = ? WHERE kind = ?')
    .run('Artefact persistence, revised', 'spec');

  const second = invoke(repo);

  assert.equal(second.code, 0, second.err);
  assert.match(second.out, new RegExp(`rewritten\\s+docs/specifications/${specs[0]}`),
    'an edited document was not reported as rewritten');
  assert.match(second.out, new RegExp(`rewritten\\s+${DUMP_PATH.replace('.', '\\.')}`),
    'the dump changed with the database and was not reported as rewritten');
  assert.doesNotMatch(second.out, /\bnew\s+docs\//, 'an existing file was reported as new');
  assert.match(second.out, /0 new, 2 rewritten/, 'the counts do not match the lines beneath them');
});

// --- Criterion 2: the floor, and the hoisting hazard the entry point is shaped around ----------

test('the entry point refuses to run below its floor, as a process, and exits 2', async () => {
  // Exercised through a fixture because the real floor cannot be failed on a machine that clears
  // it — and every machine running this suite clears it, since the suite needs `node:sqlite`. The
  // fixture differs from `bin/dpm-publish.ts` in one constant; the message and the refusal come
  // from the module under test.
  const fixture = join(ROOT, 'tests', 'fixtures', 'floor-publish.mjs');

  const refused = await runNode([fixture, '999.0.0']);

  assert.equal(refused.code, 2, 'the floor failure did not exit 2');
  assert.match(refused.stderr, /requires Node >=999\.0\.0/, 'it did not name the version it wants');
  assert.match(refused.stderr, /node:sqlite/, 'it did not say why the version is needed');
  assert.doesNotMatch(refused.stderr, /ERR_UNKNOWN_BUILTIN_MODULE/);
  assert.equal(refused.stdout, '', 'the refusal reached stdout');

  // The control. Without it this passes against an entry point that refuses unconditionally.
  const started = await runNode([fixture, '0.0.1']);

  assert.equal(started.code, 0);
  assert.equal(started.stdout, 'published\n');
});

test('each binary refuses with the exit code its fixture stands in for', () => {
  // **The fixture proves the block behaves; nothing proved the binary had that block.** Found by
  // driving it: changing `bin/dpm-publish.ts`'s floor exit from 2 to 1 passed the whole suite,
  // because the only test of the refusal path runs `floor-publish.mjs` — a copy. The same hole sits
  // under `floor-entry.mjs` and `bin/dpm-mcp.ts`, and has since the server shipped.
  //
  // Reading source rather than running it, because the refusal cannot be run on a machine above
  // the floor and that is the whole reason the fixtures exist. This is not a proxy for whether the
  // code is right — the fixtures establish that — it is the join between a file and its stand-in,
  // which is the one thing a copy can never assert about itself.
  //
  // **1 for the server and 2 for the commands**, and the split is not cosmetic: the commands have
  // already spent 1 on an outcome the user causes — divergence for the guard, a refusal for
  // publish — so a floor failure sharing that code would send someone to fix their templates when
  // the answer is to upgrade Node.
  const expected = {
    'dpm-guard.ts': 2, 'dpm-import.ts': 2, 'dpm-mcp.ts': 1, 'dpm-merge.ts': 2, 'dpm-publish.ts': 2,
  };

  const floorExit = (source) =>
    source.match(/assertNodeFloor\([^)]*\);?\s*\}\s*catch[^{]*\{[\s\S]*?process\.exit\((\d+)\)/)?.[1];

  for (const [name, code] of Object.entries(expected)) {
    const found = floorExit(readFileSync(join(ROOT, 'bin', name), 'utf8'));

    assert.equal(found, String(code), `${name} does not exit ${code} when it is below the floor`);
  }

  // Two controls, because the extractor returning `undefined` for everything would satisfy nothing
  // above only by accident of `String(code)` never being `undefined`. The first proves it reads a
  // floor block; the second proves it is reading *that* block and not the first `process.exit` in
  // the file — `dpm-mcp.ts` has two, and they differ in neither value nor spelling.
  assert.equal(floorExit('try { assertNodeFloor(); } catch (e) { process.exit(7); }'), '7');
  assert.equal(floorExit('process.exit(9);\ntry { assertNodeFloor(); } catch (e) { process.exit(4); }'),
    '4', 'the extractor matched an exit outside the floor block');
});

test('no binary reaches node:sqlite through a static import, publish included', () => {
  // **The floor check can only replace `ERR_UNKNOWN_BUILTIN_MODULE` if it runs first**, and ES
  // imports are evaluated before any statement in the file that wrote them — so a single static
  // import reaching `node:sqlite` moves the crash *before* the check and silently un-implements
  // NFR2 in a file where nothing looks wrong.
  //
  // Swept over every binary rather than asserted of the new one, because the criterion is "the
  // same as the others": a sweep is what makes a new binary's conformance a property of the
  // directory rather than a fact about one file. It caught the fifth, which is what it was written
  // for — `bin/dpm-import.ts` arrived with epic 49-04 and failed the enumeration below.
  //
  // The walk and its type-only exclusion live in `support/sources.js`, because `server.test.js`
  // asserts the same thing over the MCP entry point and the two must not disagree about what an
  // import edge is. Each call gets its own visited set, so one binary's walk cannot mark a shared
  // module seen and leave the next binary's walk stopping short of `node:sqlite`.
  const reaches = (file) => reachesBySpecifier(file, 'node:sqlite');

  // `.ts` since the port: the executables are TypeScript that Node type-strips, not compiled
  // output. The equality below is what caught this filter when the extension moved — it went to
  // an empty list, and the sweep would otherwise have enumerated nothing and reported clean.
  const binaries = readdirSync(join(ROOT, 'bin')).filter((name) => name.endsWith('.ts')).sort();

  assert.deepEqual(binaries,
    ['dpm-guard.ts', 'dpm-import.ts', 'dpm-mcp.ts', 'dpm-merge.ts', 'dpm-publish.ts'],
    'the set of binaries moved — the sweep below is enumerating something else now');

  for (const name of binaries) {
    assert.deepEqual(reaches(join(ROOT, 'bin', name)), [], `${name} would crash before its check`);
  }

  // The control: the walker must be able to find one, or its empty answer means nothing.
  assert.deepEqual(reaches(join(ROOT, 'src', 'db', 'connection.ts')), [
    `${join(ROOT, 'src', 'db', 'connection.ts')} imports node:sqlite`,
  ]);

  // The control on the exclusion itself, since the sweep above would now be equally quiet if the
  // lookahead had swallowed every import rather than the type-only ones.
  assert.deepEqual(staticImports("import { DatabaseSync } from 'node:sqlite';"), ['node:sqlite'],
    'a value import is still counted');
  assert.deepEqual(staticImports("import type { DatabaseSync } from 'node:sqlite';"), [],
    'a type-only import is erased before evaluation, so it reaches nothing');
  assert.deepEqual(staticImports("import { type Row, insert } from './crud.ts';"), ['./crud.ts'],
    'a mixed import still loads the module for its value binding');
});

// --- Criterion 3: a refusal exits non-zero, names every document, and leaves the tree alone -----

test('a publish that cannot render exits non-zero, names every refusal, and touches nothing', (t) => {
  const repo = repository(t);

  assert.equal(invoke(repo).code, 0, 'the tree could not be published before it was broken');

  const before = snapshot(repo.root);

  // Two refusals, not one. A command that raised on the first would exit non-zero and name a
  // document, satisfying every part of this criterion except the one it turns on — a user fixing
  // a template at a time, running again, and finding the next one.
  repo.db.prepare("INSERT INTO document_kind (kind, dir, numbering) VALUES ('ledger', 'ledgers', 'root')")
    .run();

  for (const [id, slug, title] of [['led-1', 'costs', 'Costs'], ['led-2', 'hours', 'Hours']]) {
    repo.db.prepare(`INSERT INTO document
        (id, kind, numbering, number, slug, title, status, created_at, updated_at)
        VALUES (?, 'ledger', 'root', ?, ?, ?, 'pending',
                '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`)
      .run(id, id === 'led-1' ? 9 : 10, slug, title);
  }

  const { code, out, err } = invoke(repo);

  assert.equal(code, 1, 'a refusal did not exit 1');
  assert.match(err, /costs/, 'the first refusing document was not named');
  assert.match(err, /hours/, 'only one refusal was reported — the rest are found one run at a time');
  assert.equal(out, '', 'a failed publish wrote a report to stdout');

  // Untouched, not merely "no new file". The command's exit code is worth nothing if the tree it
  // left behind is a stale projection the guard subsequently diffs clean.
  assert.deepEqual([...snapshot(repo.root).entries()].sort(), [...before.entries()].sort());
});

// --- Criterion 4 (must NOT): no failure is reported on stdout ----------------------------------

test('every failure reports on stderr and exits non-zero, so a shell can separate the two', (t) => {
  const repo = repository(t);

  // Both failure modes, because they take different paths out of `run` and only one of them is a
  // refusal: a missing database returns before anything is opened, a refusal returns from the
  // catch. A must-NOT satisfied on one path and not the other is satisfied nowhere.
  const absent = invoke({ root: repo.root, location: join(repo.root, '.dpm', 'nothing.db') });

  assert.equal(absent.code, 2, 'a missing database is not a divergence and is not a refusal');
  assert.equal(absent.out, '', 'the missing-database failure reached stdout');
  assert.match(absent.err, /there is no database there/);

  // And it created nothing on the way past. Opening a database that is not there makes one, and a
  // publish over an empty database removes every generated file in the tree as an orphan — the one
  // failure here that destroys work rather than reporting it.
  assert.equal(existsSync(join(repo.root, '.dpm', 'nothing.db')), false,
    'checking for a database created one');

  // The control that stops the pair above passing for a command that always fails: the same
  // repository, published properly, says its piece on stdout and nothing on stderr.
  const published = invoke(repo);

  assert.equal(published.code, 0);
  assert.equal(published.err, '');
  assert.match(published.out, /generated files/);
});
