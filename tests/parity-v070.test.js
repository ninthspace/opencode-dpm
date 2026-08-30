/**
 * Epic 01-01 Story 5 — the ported code against v0.7.0's own output.
 *
 * The inherited suite already holds most of this story: `round-trip.test.js` proves a dump survives
 * its own restore byte-for-byte, `restore.test.js` the empty/populated asymmetry, `read-only.test.js`
 * that every tool declaring a mutation refuses and no read does, `projection.test.js` that
 * regenerating twice yields identical bytes. **All of those compare the port against itself.** They
 * would go on passing if the port had changed the dump format, the sort order or the allocator, so
 * long as it changed them consistently — which is exactly the shape a 100-module conversion takes.
 *
 * What is missing is an oracle written by v0.7.0, and this repository has one. `.dpm/dpm.sql` at
 * commit `1123bc7` was produced by v0.7.0's dumper against v0.7.0's allocator, before a line of the
 * port existed. It is frozen here as `tests/fixtures/v070-dump.sql` for the reason
 * `tests/corpus-snapshot/README.md` gives for its own fixtures: an oracle that is regenerated is not
 * an oracle. **Nothing may rewrite this file** — a failure here means the port changed behaviour,
 * and rewriting the fixture is how that finding would be disposed of instead of read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openConnection } from '../src/db/connection.ts';
import { dump } from '../src/dump/index.ts';
import { start } from '../src/start.ts';
import { spineTools } from '../src/tools/index.ts';
import { handlers } from './support/planning-database.js';
import { runNode } from './support/run-node.js';
import { sweepSourcesUnder, withoutComments } from './support/sources.js';

const ROOT = join(import.meta.dirname, '..');
const ORACLE = join(ROOT, 'tests', 'fixtures', 'v070-dump.sql');
const SERVER = join(ROOT, 'bin', 'dpm-mcp.ts');

/** A fresh clone: the committed dump and no database, which is how the restore path is entered. */
function clone(t, dumpPath = ORACLE) {
  const root = mkdtempSync(join(tmpdir(), 'dpm-parity-'));

  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.dpm'), { recursive: true });
  copyFileSync(dumpPath, join(root, '.dpm', 'dpm.sql'));

  return root;
}

/**
 * Bring a clone up by talking to the server, because **`start()` does not restore.**
 *
 * The restore is a step in the server's bring-up rather than part of opening a connection, and a
 * test that called `start()` on the clone would get a freshly seeded database, find its content
 * tables empty, and have no way to tell that from a dump that restored nothing. That is not
 * hypothetical: it is what the first attempt at this file did, and the 19 tables it reported as
 * empty looked exactly like a broken restore.
 */
async function restored(root) {
  const wire = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'parity', version: '1' } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_spec', arguments: {} } },
  ].map((message) => `${JSON.stringify(message)}\n`).join('');

  const session = await runNode([SERVER], wire, {}, { cwd: root });

  assert.equal(session.code, 0, session.stderr);
  assert.match(session.stderr, /restored it from the dpm\.sql beside it/,
    `the server did not restore, so nothing below is about a restored database:\n${session.stderr}`);

  return openConnection(join(root, '.dpm', 'dpm.db'));
}

// --- Criterion 1: a fresh-clone restore reproduces the database, and dumps back identically -------

test('a fresh clone restores v0.7.0 output and dumps back byte-identically [integration]', async (t) => {
  const db = await restored(clone(t));
  const original = readFileSync(ORACLE, 'utf8');

  // **The whole story in one line.** The ported restorer read 296KB written by v0.7.0's dumper, and
  // the ported dumper wrote it back unchanged — every table order, every column order, every
  // literal escape, every row order within every table.
  assert.equal(dump(db).sql, original,
    'the ported dump of a restored v0.7.0 database differs from what v0.7.0 wrote');

  // Two controls, because equality between two strings is also what happens when both are empty or
  // when the comparison is against the same read twice.
  assert.ok(original.length > 200000, `the oracle is ${original.length} bytes, so it is not the dump`);
  assert.equal(db.prepare('SELECT count(*) AS n FROM document').get().n, 21,
    'the restore did not load the corpus, so the dump above is of an empty database');
});

test('the corpus that came back is the corpus that went in, table by table [integration]', async (t) => {
  const db = await restored(clone(t));
  const oracle = readFileSync(ORACLE, 'utf8');

  // **Row counts per table, both directions.** The byte comparison above subsumes this and says
  // nothing useful when it fails — "296061 bytes differ" is not a finding. This one names the table.
  const counted = (text) => {
    const per = new Map();

    for (const [, table] of text.matchAll(/^INSERT INTO "([^"]+)"/gm)) {
      per.set(table, (per.get(table) ?? 0) + 1);
    }

    return per;
  };

  const before = counted(oracle);
  const after = counted(dump(db).sql);

  assert.ok(before.size > 20, `the oracle names ${before.size} tables, so it is not being read`);
  assert.deepEqual(
    [...before].filter(([table, rows]) => after.get(table) !== rows)
      .map(([table, rows]) => `${table}: ${rows} in v0.7.0, ${after.get(table) ?? 0} after the port`),
    [], 'a table came back with a different number of rows than v0.7.0 wrote',
  );
});

// --- Criterion 7: the allocator produces v0.7.0's numbers for v0.7.0's inputs ---------------------

/**
 * The 21 documents v0.7.0 allocated, in ULID order — which is creation order — with the number it
 * gave each one.
 *
 * Read from the oracle rather than written out, so this cannot drift from the fixture it is a claim
 * about. Root kinds carry `number`; child kinds carry `sequence`, restarting per parent.
 */
function allocationsIn(db) {
  return db.prepare(
    'SELECT kind, parent_id, number, sequence, numbering FROM document ORDER BY id',
  ).all().map(({ kind, parent_id: parent, number, sequence, numbering }) => ({
    kind, parent, numbering, allocated: numbering === 'root' ? number : sequence,
  }));
}

test('replaying v0.7.0 creates in v0.7.0 order allocates v0.7.0 numbers [integration]', async (t) => {
  const expected = allocationsIn(await restored(clone(t)));

  assert.equal(expected.length, 21, `the oracle holds ${expected.length} documents, not 21`);

  // A database with nothing in it but the seeds, and the ported allocator asked for the same
  // sequence of creates. Nothing is copied across: the numbers below are allocated here and now.
  const { db } = start(':memory:');

  t.after(() => db.close());

  const call = handlers(spineTools(db));
  const made = [];
  const parents = { spec: null, epics: [] };

  const create = (kind, arguments_) => {
    const row = call[`create_${kind}`](arguments_);

    made.push(row);

    return row;
  };

  create('library', { slug: 'a-library', title: 'A library', doc_type: 'reference' });
  create('discussion', { slug: 'a-discussion', title: 'A discussion' });
  parents.spec = create('spec', { slug: 'a-spec', title: 'A spec' }).id;

  for (let at = 1; at <= 8; at += 1) {
    create('adr', {
      parent_id: parents.spec, slug: `adr-${at}`, title: `ADR ${at}`, decision: `Decision ${at}`,
    });
  }

  for (let at = 1; at <= 5; at += 1) {
    parents.epics.push(create('epic', {
      parent_id: parents.spec, slug: `epic-${at}`, title: `Epic ${at}`,
    }).id);
  }

  for (const [at, epic] of parents.epics.entries()) {
    create('coverage_matrix', {
      parent_id: epic, slug: `matrix-${at + 1}`, title: `Matrix ${at + 1}`,
    });
  }

  // **Compared as the numbers, not as the rows.** The slugs and titles are this test's, the ULIDs
  // are this run's, and the parent ids are different objects entirely — the only thing that can be
  // the same is what the allocator decided, which is the whole claim.
  const replayed = allocationsIn(db);

  assert.deepEqual(
    replayed.map(({ kind, numbering, allocated }) => `${kind}/${numbering}=${allocated}`),
    expected.map(({ kind, numbering, allocated }) => `${kind}/${numbering}=${allocated}`),
    'the ported allocator gave different numbers than v0.7.0 for the same sequence of creates',
  );

  // **The control, and this one is load-bearing**: every child sequence in the oracle restarts at 1
  // per parent, so a comparison that ignored parentage would pass on an allocator that numbered the
  // five matrices 1 to 5. Asserted as the shape rather than trusted.
  const matrices = replayed.filter(({ kind }) => kind === 'coverage_matrix');

  assert.equal(matrices.length, 5);
  assert.deepEqual([...new Set(matrices.map(({ allocated }) => allocated))], [1],
    'the five coverage matrices are not each 1 under their own epic, so the sequences did not '
    + 'restart and the comparison above is about a flat counter');
  assert.deepEqual(replayed.filter(({ kind }) => kind === 'adr').map(({ allocated }) => allocated),
    [1, 2, 3, 4, 5, 6, 7, 8], 'the eight ADRs under one parent are not 1..8');
});

test('the allocator continues a restored sequence where v0.7.0 left it [integration]', async (t) => {
  // The other half of parity, and the one a fresh-database replay cannot reach: a sequence that
  // *already holds* v0.7.0's counter. This is what every real session does — open a restored clone
  // and allocate the next number — and it is where an off-by-one between the two releases would
  // reissue a number that is already taken.
  const db = await restored(clone(t));
  const call = handlers(spineTools(db));

  const spec = db.prepare("SELECT id FROM document WHERE kind = 'spec'").get().id;
  const before = db.prepare("SELECT max(sequence) AS top FROM document WHERE kind = 'epic'").get().top;

  assert.equal(before, 5, `v0.7.0 left the epic sequence at ${before}, not 5`);

  const next = call.create_epic({ parent_id: spec, slug: 'the-sixth-epic', title: 'The sixth' });

  assert.equal(next.sequence, 6,
    `the ported allocator issued ${next.sequence} after v0.7.0's 5, which either reissues a number `
    + 'or skips one');

  // The control: it is the *restored* counter being continued, not a coincidence of counting rows.
  // Deleting an epic must not make the next allocation reuse its number — `numbering.test.js` owns
  // that rule, and this is the same rule reached through a v0.7.0 database.
  db.exec(`DELETE FROM document WHERE id = '${next.id}'`);

  assert.equal(call.create_epic({ parent_id: spec, slug: 'the-seventh', title: 'Seventh' }).sequence,
    7, 'a number was reissued after the row holding it was deleted');
});

// --- Criterion 8: the output depends on the rows and on nothing else -------------------------------

test('must NOT — dump output varies with wall-clock time or row insertion order [integration]', async (t) => {
  const db = await restored(clone(t));
  const first = dump(db).sql;

  // **Wall-clock.** Taken twice with real time passing between them: a dumper that stamped the file,
  // or ordered by anything derived from `now`, differs here and nowhere else in the suite.
  await new Promise((resolve) => { setTimeout(resolve, 1100); });

  assert.equal(dump(db).sql, first, 'two dumps of one unchanged database differ, so something in '
    + 'the output is derived from the clock rather than from the rows');

  // **Insertion order.** The same rows written in a different order, into a different file, dumped
  // by the same code. `projection.test.js:202` makes this claim for the projection; this is the
  // dump, and the two are separate renderers.
  const shuffled = mkdtempSync(join(tmpdir(), 'dpm-order-'));

  t.after(() => rmSync(shuffled, { recursive: true, force: true }));

  const statements = readFileSync(ORACLE, 'utf8').split('\n');
  const inserts = statements.filter((line) => line.startsWith('INSERT INTO "document"'));

  assert.ok(inserts.length > 10, `only ${inserts.length} single-line document inserts were found, `
    + 'so the reordering below has almost nothing to reorder');

  const reordered = statements.map((line) => line).join('\n')
    .replace(inserts.join('\n'), [...inserts].reverse().join('\n'));

  assert.notEqual(reordered, readFileSync(ORACLE, 'utf8'), 'the reordering changed nothing');

  const path = join(shuffled, 'dpm.sql');

  writeFileSync(path, reordered);

  const other = openConnection(join(shuffled, 'dpm.db'));

  t.after(() => other.close());
  other.exec(reordered);

  assert.equal(dump(other).sql, first,
    'the same rows inserted in a different order dump differently, so the output depends on '
    + 'physical row order rather than on a sort the dumper applies');
});

test('must NOT — the v0.7.0 oracle or the corpus snapshot is regenerated to make a test pass', () => {
  // **The disposal this story is most exposed to.** Every comparison above is against a committed
  // fixture, and the cheapest way to make any of them pass is to rewrite the fixture — at which
  // point the suite is comparing the port against itself again and the story has been undone
  // without a line of it being deleted.
  // **Rewritten or deleted, which is not the same as changed.** `git status` reports a file's first
  // appearance as `A`, and this story is what adds the oracle — an assertion that the path is
  // entirely clean fails on the commit that introduces it and would have to be relaxed a day later,
  // which is how a check stops checking. What may never happen is `M` or `D` on a fixture that is
  // already committed: those are the two shapes "make the failure go away" takes.
  const REWRITTEN = /^[ MARC]?[MD]|^[MD]/;

  const disturbed = (path) => execFileSync('git', ['status', '--porcelain', '--', path],
    { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
    .filter((line) => REWRITTEN.test(line.slice(0, 2)));

  assert.deepEqual(disturbed('tests/fixtures/v070-dump.sql'), [],
    'the v0.7.0 oracle was rewritten — it is v0.7.0 output, and a failure against it is a finding '
    + 'about the port rather than something to edit away');

  // **The second oracle, added by epic 01-02 and protected the same way.** It is the tool surface
  // the released v0.7.0 advertises — 183 names, descriptions and schemas, captured by running
  // `bin/dpm-mcp.js` out of the installed marketplace package. It is exposed to exactly the
  // disposal above: a schema that drifted in the port is one `cp` away from never being noticed.
  assert.deepEqual(disturbed('tests/fixtures/v070-tool-surface.json'), [],
    'the v0.7.0 tool-surface oracle was rewritten, so the port is being compared against itself');
  assert.deepEqual(disturbed('tests/corpus-snapshot'), [],
    'a corpus snapshot fixture was rewritten, so criterion 6 is being met by editing the expected '
    + 'output rather than by the sources producing it');

  // The control: the reading is capable of saying yes. Without it both assertions hold for a regex
  // that matches nothing, which is the state a tightened status code would leave it in.
  assert.equal(REWRITTEN.test(' M'), true, 'a modified file is not recognised');
  assert.equal(REWRITTEN.test('M '), true, 'a staged modification is not recognised');
  assert.equal(REWRITTEN.test(' D'), true, 'a deletion is not recognised');
  assert.equal(REWRITTEN.test('A '), false, 'a first appearance is reported as a rewrite');
  assert.equal(REWRITTEN.test('??'), false, 'an untracked file is reported as a rewrite');

  // And no test writes into either fixture directory, which is how one would be regenerated by a
  // run rather than by hand. Read through the suite's own walker rather than `git grep`, which
  // exits non-zero when it matches nothing and would turn "no test does this" into a thrown error.
  const FIXTURE = /corpus-snapshot|v070-dump|v070-tool-surface/;
  const WRITE = /writeFileSync|copyFileSync|createWriteStream|rmSync|appendFileSync/;

  const writing = sweepSourcesUnder(join(ROOT, 'tests'))
    .filter(({ text }) => withoutComments(text).split('\n')
      .some((line) => FIXTURE.test(line) && WRITE.test(line)))
    .map(({ name }) => name);

  assert.deepEqual(writing, [], 'a test names a fixture path on the same line as a write');

  // The control, because that is an emptiness over two regexes: both halves recognise their shape,
  // and a line carrying only one of them is not a finding.
  //
  // **Assembled, or this file becomes its own only finding.** A control written as a literal puts
  // the fixture name and the write verb on one line, which is precisely the shape being hunted —
  // the same self-match `suite-integrity.test.js` records, arriving for the third time. Exempting
  // this file by name would instead hide a genuine write planted in it later.
  const recognised = (line) => FIXTURE.test(line) && WRITE.test(line);
  const fixture = ['corpus', 'snapshot'].join('-');
  const verb = `write${'File'}Sync`;

  assert.equal(recognised(`${verb}(join(AT, '${fixture}', 'x.md'), rendered);`), true);
  assert.equal(recognised(`const ORACLE = join(ROOT, 'fixtures', 'v070${'-dump'}.sql');`), false,
    'a line naming a fixture without writing to it is reported');
  assert.equal(recognised(`${verb}(join(scratch, 'ordinary.md'), text);`), false,
    'a write that touches no fixture is reported');
});
