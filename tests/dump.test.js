/**
 * Story 1 — the deterministic dumper, whose defects are all invisible by inspection.
 *
 * A dump is a large file in which a missing table looks exactly like a table with no rows, an
 * unstable ordering looks exactly like a stable one until a second machine runs it, and an
 * excluded index looks exactly like an index that restored empty. So almost nothing here reads
 * the SQL text for a verdict: the tests assert against the structured record `dump()` returns —
 * what it kept, what it excluded and why, how each table was ordered, which values it rewrote —
 * and use the text only where the text *is* the contract (LF endings, `X'` blobs, column names).
 *
 * **Every check that could pass vacuously is paired with the control that makes it fail.** The
 * schema contains no BLOB column and no FTS5 table, so "the dump carries no hex blob" and "the
 * shadow tables are excluded" are both true of a dumper that does nothing at all. The fixtures
 * here create a real BLOB column and a real `CREATE VIRTUAL TABLE … USING fts5(…)` for exactly
 * that reason — a filter written against a name that is never present passes forever.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from './support/database.js';
import { openPlanningDatabase } from './support/planning-database.js';
import { authoredTables } from './support/introspection.js';
import { moduleFilesUnder } from './support/sources.js';
import { applySchema } from '../src/schema/index.ts';
import { migrate } from '../src/schema/migrate.ts';
import { rootDocument, childDocument } from './fixtures/planning.js';
import { create } from './fixtures/index.js';
import { dump } from '../src/dump/index.ts';
import { orderingOf, dumpRows } from '../src/dump/rows.ts';
import { dumpableObjects } from '../src/dump/objects.ts';
import { literal, number, text, blob } from '../src/dump/literal.ts';

const SOURCE = join(import.meta.dirname, '..', 'src');

/** The five objects FTS5 creates beside a standalone virtual table, verified empirically. */
const SHADOW_SUFFIXES = ['_config', '_content', '_data', '_docsize', '_idx'];

/**
 * A real FTS5 index over `document_section`, maintained by a trigger — the shape Epic 47-05
 * builds for `document_fts`, created here so this epic can assert the dumper's behaviour
 * against an index that exists rather than against a name that does not.
 *
 * The trigger is the point of the fixture as much as the virtual table is. The dump excludes
 * the shadow tables *because* the trigger rebuilds the index from the rows, so a test that
 * created the table without the trigger would assert the exclusion and never notice that the
 * exclusion had made the index unrecoverable.
 */
function withSearchIndex(db) {
  db.exec(`
    CREATE VIRTUAL TABLE probe_fts USING fts5(heading, body, section_id UNINDEXED);

    CREATE TRIGGER probe_fts_insert AFTER INSERT ON document_section BEGIN
      INSERT INTO probe_fts (heading, body, section_id)
        VALUES (new.heading, new.body, new.id);
    END;
  `);

  return db;
}

/** A table with a genuine BLOB column, so the no-hex-blob check has something to be wrong about. */
function withBlobTable(db) {
  db.exec('CREATE TABLE probe_blob (id TEXT NOT NULL PRIMARY KEY, payload BLOB NOT NULL)');
  db.prepare('INSERT INTO probe_blob (id, payload) VALUES (?, ?)').run(
    'row-1',
    new Uint8Array([0x00, 0x0f, 0xff, 0xde, 0xad]),
  );

  return db;
}

/**
 * A populated planning corpus: two documents and the sections the index is built over.
 *
 * **Every id is fixed rather than generated, and that is what makes "the same state" a thing a
 * test can build twice.** `create()` mints a fresh ULID per row, so two independently built
 * corpora differ in every primary key — they are genuinely different content, and comparing
 * their dumps tests nothing about the dumper. Supplying the ids is also the only way to order
 * rows differently from how they were inserted: a ULID is monotonic within a generator, so
 * primary-key order and insertion order coincide by construction and a dump sorted by neither
 * would still pass.
 */
function corpus(db) {
  const spec = rootDocument(db, 'spec', { id: 'doc-spec', number: 47, slug: 'substrate' });
  const epic = childDocument(db, 'epic', spec, { id: 'doc-epic', slug: 'identity' });

  create(db, 'document_section', {
    id: 'sec-2',
    document_id: spec.id,
    heading: 'Persistence',
    body: 'The committed form of the database is text.',
    position: 1,
  });
  create(db, 'document_section', {
    id: 'sec-1',
    document_id: epic.id,
    heading: 'Dump',
    body: 'Ordered rows, no timestamps, no locale dependence.',
    position: 1,
  });

  return { spec, epic };
}

const insertLines = (sql) => sql.split('\n').filter((line) => line.startsWith('INSERT INTO'));

const insertsFor = (sql, table) =>
  insertLines(sql).filter((line) => line.startsWith(`INSERT INTO "${table}" `));

/**
 * Hex-blob literals in a statement.
 *
 * Anchored to a value boundary rather than searching for `X'` loose in the line, because a
 * ULID ending in `X` puts those two characters next to each other in ordinary text — the first
 * version of this scan reported every row whose id happened to end in the last letter of
 * Crockford base32.
 */
const hexBlobsIn = (line) => line.match(/[(,]\s*X'[0-9A-F]*'/g) ?? [];

// --- Criterion 1: FTS5 shadow tables out, the virtual table and its triggers in ---------------

test('the five shadow tables of an FTS5 index are excluded, by name and with a reason', (t) => {
  const db = withSearchIndex(openPlanningDatabase(t));
  corpus(db);

  const { sql, kept, excluded } = dump(db);

  for (const suffix of SHADOW_SUFFIXES) {
    const shadow = `probe_fts${suffix}`;

    assert.ok(
      db.prepare("SELECT 1 FROM sqlite_schema WHERE name = ?").get(shadow),
      `${shadow} exists in the database — otherwise this test excludes nothing`,
    );
    assert.ok(!kept.includes(shadow), `${shadow} is not dumped`);
    assert.ok(!sql.includes(shadow), `${shadow} appears nowhere in the file`);
    assert.ok(
      excluded.some((entry) => entry.name === shadow && entry.reason),
      `${shadow} is excluded with a stated reason, not silently absent`,
    );
  }
});

test('the virtual table and the triggers that maintain it are kept', (t) => {
  const db = withSearchIndex(openPlanningDatabase(t));
  corpus(db);

  const { sql, kept } = dump(db);

  // The opposite direction from the test above, and the one a too-broad filter fails: the
  // shadow tables go, the table itself stays.
  assert.ok(kept.includes('probe_fts'));
  assert.match(sql, /CREATE VIRTUAL TABLE probe_fts USING fts5\(/);

  // The trigger is named for the index it maintains, so a prefix rule applied to every object
  // type rather than to tables alone drops it — and a dump missing it restores every row into
  // an empty index and reports success.
  assert.ok(kept.includes('probe_fts_insert'), 'the maintaining trigger survives the name filter');
  assert.match(sql, /CREATE TRIGGER probe_fts_insert/);
});

test('a restored dump rebuilds the search index from the data, with no reindex step', (t) => {
  const db = withSearchIndex(openPlanningDatabase(t));
  corpus(db);

  const indexed = (connection) =>
    connection.prepare('SELECT count(*) AS n FROM probe_fts').get().n;
  const matching = (connection, term) =>
    connection.prepare('SELECT count(*) AS n FROM probe_fts WHERE probe_fts MATCH ?').get(term).n;

  assert.equal(indexed(db), 2, 'the fixture populated the index through its trigger');
  assert.equal(matching(db, 'locale'), 1);

  const restored = new DatabaseSync(':memory:');
  t.after(() => restored.close());
  restored.exec(dump(db).sql);

  // Nothing in the file carries the index; the triggers ran as the sections arrived.
  assert.equal(indexed(restored), 2, 'the index is populated after a restore that never dumped it');
  assert.equal(matching(restored, 'locale'), 1, 'and it answers the same query');
});

test('the dump carries no hex blob for a shadow table, and does emit a real one', (t) => {
  const db = withBlobTable(withSearchIndex(openPlanningDatabase(t)));
  corpus(db);

  const { sql } = dump(db);

  // The control comes first: without it, the assertion below is satisfied by a schema that has
  // no blobs to emit, which is exactly the schema dpm ships — every column it declares is
  // INTEGER or TEXT, so "no hex blob" is true of a dumper that cannot write one at all.
  assert.deepEqual(
    insertsFor(sql, 'probe_blob').flatMap(hexBlobsIn),
    [", X'000FFFDEAD'"],
    'a genuine BLOB column round-trips as an upper-case hex literal',
  );

  const elsewhere = insertLines(sql)
    .filter((line) => !line.startsWith('INSERT INTO "probe_blob" '))
    .flatMap(hexBlobsIn);
  assert.deepEqual(elsewhere, [], 'no other table contributes a hex blob');
});

// --- Criterion 2: column-named INSERTs in a total order ---------------------------------------

test('every INSERT names its columns', (t) => {
  const db = withBlobTable(withSearchIndex(openPlanningDatabase(t)));
  corpus(db);

  const lines = insertLines(dump(db).sql);

  assert.ok(lines.length > 0, 'there are rows to check');
  for (const line of lines) {
    assert.match(line, /^INSERT INTO "[^"]+" \("[^)]+\) VALUES \(/, line);
  }
});

test('rows are emitted in primary-key order regardless of the order they were written', (t) => {
  const db = openPlanningDatabase(t);
  const spec = rootDocument(db, 'spec', { id: 'doc-spec', number: 47 });

  // Ids that disagree with insertion order, which is the only arrangement that can tell the
  // two apart. Left to `create()`'s generated ULIDs they would agree — a ULID is monotonic, so
  // a dump sorted by insertion would pass a primary-key assertion without ever sorting.
  for (const [index, id] of ['sec-c', 'sec-a', 'sec-b'].entries()) {
    create(db, 'document_section', {
      id,
      document_id: spec.id,
      heading: id,
      body: 'b',
      position: index + 1,
    });
  }

  const headings = insertsFor(dump(db).sql, 'document_section').map(
    (line) => line.match(/'(sec-[abc])', 'doc-spec'/)[1],
  );

  assert.deepEqual(headings, ['sec-a', 'sec-b', 'sec-c'], 'key order, not insertion order');
});

test('a table with no primary key falls back to a declared ordering, and it is a total one', (t) => {
  const db = openPlanningDatabase(t);
  const { orderings } = dump(db);

  assert.equal(orderings.schema_version, 'unique-index: version');
  assert.equal(
    orderings.number_sequence,
    'all-columns: kind, parent_id, next_value',
    'both of its unique indexes are partial, so neither can order the whole table',
  );

  // The reason, asserted rather than described: a partial index covers one side of its
  // predicate. `number_sequence_root` indexes `kind` alone WHERE parent_id IS NULL, so taking
  // it would order the child rows — which all share a kind — not at all.
  const partial = db
    .prepare('PRAGMA index_list(number_sequence)')
    .all()
    .filter((index) => index.unique === 1);

  assert.ok(partial.length > 0);
  assert.ok(
    partial.every((index) => index.partial === 1),
    'every unique index on this table is partial, which is why the fallback goes further',
  );
});

test('rows sharing a key prefix are ordered by the rest of it, not by insertion', (t) => {
  // The case the partial-index fallback exists for: same `kind`, different `parent_id`.
  const seeded = (rows) => {
    const db = applySchema(new DatabaseSync(':memory:', { enableForeignKeyConstraints: false }));
    for (const row of rows) {
      db.prepare('INSERT INTO number_sequence (kind, parent_id, next_value) VALUES (?, ?, ?)')
        .run(row.kind, row.parent, row.next);
    }
    const sql = dump(db).sql;
    db.close();

    return insertsFor(sql, 'number_sequence');
  };

  const rows = [
    { kind: 'epic', parent: 'B', next: 2 },
    { kind: 'epic', parent: 'A', next: 7 },
  ];

  assert.deepEqual(seeded(rows), seeded([...rows].reverse()));
});

test('orderingOf prefers the primary key, and reports which source it used', (t) => {
  const db = openPlanningDatabase(t);

  assert.deepEqual(orderingOf(db, 'document'), { columns: ['id'], source: 'primary-key' });
  assert.deepEqual(orderingOf(db, 'document_kind'), { columns: ['kind'], source: 'primary-key' });

  // A composite key orders by the whole key, in declaration order.
  assert.deepEqual(orderingOf(db, 'document_kind_parent'), {
    columns: ['kind', 'parent_kind'],
    source: 'primary-key',
  });
});

// --- Criteria 3 and 4: byte-stability across machines, runs and locales ------------------------

test('two databases migrated at different times dump to identical bytes', (t) => {
  const build = (now) => {
    const db = new DatabaseSync(':memory:');
    migrate(db, { now });
    const sql = dump(db).sql;
    db.close();

    return sql;
  };

  // The cross-machine case in the only form one process can produce it: the same logical state
  // reached at two different wall-clock times, which is what two developers always have.
  assert.equal(build('2020-01-01T00:00:00Z'), build('2026-08-08T12:34:56Z'));
});

test('the migration timestamp is normalised, and the substitution is declared', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  migrate(db, { now: '2026-08-08T12:34:56Z' });

  const { sql, normalised } = dump(db);

  assert.ok(!sql.includes('2026-08-08T12:34:56Z'), 'the wall-clock stamp does not reach the file');
  assert.deepEqual(normalised, [
    { table: 'schema_version', column: 'applied_at', value: "'1970-01-01T00:00:00Z'" },
  ]);

  // The ledger itself is kept — a restored database that reads as version 0 replays every
  // migration against a schema that already has the tables.
  const versions = insertsFor(sql, 'schema_version');
  assert.equal(
    versions.length,
    db.prepare('SELECT count(*) AS n FROM schema_version').get().n,
    'every version row survives; only the stamp is rewritten',
  );
});

test('dumping the same state twice from independent databases is byte-stable', (t) => {
  const build = () => {
    const db = openPlanningDatabase({ after: () => {} });
    corpus(db);
    const sql = dump(db).sql;
    db.close();

    return sql;
  };

  // Independent builds rather than one database dumped twice: dumping the same handle twice is
  // stable by construction and would pass against a dumper that reads the clock.
  assert.equal(build(), build());
});

test('nothing in the pipeline consults a locale', (t) => {
  const db = openPlanningDatabase(t);

  // SQLite's side: no COLLATE in any object's DDL, so every TEXT comparison is BINARY — a byte
  // comparison, identical under every locale. A column that acquires NOCASE later fails here.
  const collated = db
    .prepare('SELECT name, sql FROM sqlite_schema WHERE sql IS NOT NULL')
    .all()
    .filter((object) => /\bCOLLATE\b/i.test(object.sql));

  assert.deepEqual(collated.map((object) => object.name), []);

  // JavaScript's side: the formatting layer is where a locale actually could get in.
  const offenders = moduleFilesUnder(SOURCE)
    .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
    .flatMap(({ file, source }) =>
      source
        .split('\n')
        .map((line, index) => ({ file, line: index + 1, source: line }))
        .filter(({ source: line }) => !line.trimStart().startsWith('*'))
        .filter(({ source: line }) => /toLocale[A-Z]|localeCompare|\bIntl\./.test(line)),
    );

  assert.deepEqual(offenders, []);
});

// --- Criterion 5: the must-NOT about delegation ------------------------------------------------

test('no part of dpm shells out, so the dumper cannot be sqlite3 .dump in disguise', (t) => {
  // `exec` and `spawn` are matched only as bare calls, never as `something.exec(…)` — the
  // obvious pattern catches `db.exec('PRAGMA …')`, which is SQLite's own method and the way
  // this codebase applies every migration. A rule that fires on the normal path gets widened
  // until it fires on nothing, so it is narrowed here instead. The import rule is what
  // actually closes the door: no process starts in Node without it.
  const DELEGATION = [
    { rule: 'imports child_process', pattern: /['"]node:child_process['"]/ },
    { rule: 'spawns a process', pattern: /(?<![.\w])(execSync|execFileSync|spawnSync|execFile|exec|spawn|fork)\s*\(/ },
    { rule: 'names the sqlite3 binary', pattern: /\bsqlite3\b(?!['"])/ },
  ];

  const scan = (source) =>
    source
      .split('\n')
      .map((line, index) => ({ line: index + 1, source: line }))
      .filter(({ source: line }) => !line.trimStart().startsWith('*'))
      .flatMap(({ line, source: text }) =>
        DELEGATION.filter(({ pattern }) => pattern.test(text)).map(({ rule }) => ({ line, rule })),
      );

  // Every rule is checked against a line that must trip it, so a pattern that silently stopped
  // matching cannot read as a clean tree — this is a claim about absence, and absence is what a
  // broken detector always reports. The control is the delegation itself, written out.
  const control = [
    "import { execSync } from 'node:child_process';",
    "execSync('sqlite3 planning.db .dump > planning.sql');",
  ].join('\n');

  assert.deepEqual(
    [...new Set(scan(control).map((hit) => hit.rule))].sort(),
    DELEGATION.map(({ rule }) => rule).sort(),
    'every rule fires on the code it exists to catch',
  );

  // **One module starts a process, and it is named here rather than exempted by a wildcard.**
  // `src/merge/main.js` reads the three sides of a conflict out of git's index — `git ls-files -u`
  // and `git cat-file blob` — which is not a delegation of dpm's own work but the only way to
  // reach input that lives in git and nowhere else. The allowance is per-rule, so the third rule
  // still holds everywhere with no exception: a merge tool that reached for the `sqlite3` binary
  // would fail here exactly as the dumper would.
  const ALLOWED = {
    'src/merge/main.ts': ['imports child_process', 'spawns a process'],
  };

  assert.ok(
    !Object.values(ALLOWED).some((rules) => rules.includes('names the sqlite3 binary')),
    'the rule the criterion is actually about must have no exceptions',
  );

  const hits = moduleFilesUnder(SOURCE).flatMap((file) => {
    const name = `src/${relative(SOURCE, file)}`;

    return scan(readFileSync(file, 'utf8'))
      .map((hit) => ({ ...hit, name, allowed: (ALLOWED[name] ?? []).includes(hit.rule) }));
  });

  assert.deepEqual(
    hits.filter((hit) => !hit.allowed).map((hit) => `${hit.name}:${hit.line} ${hit.rule}`),
    [],
  );

  // **The allowance has to be spent.** An exception for a file that stopped shelling out is an
  // exception waiting to cover the next thing that does, and nothing else in this test would ever
  // notice it had gone quiet.
  for (const [name, rules] of Object.entries(ALLOWED)) {
    for (const rule of rules) {
      assert.ok(
        hits.some((hit) => hit.name === name && hit.rule === rule),
        `${name} is allowed to '${rule}' and no longer does — remove the allowance`,
      );
    }
  }
});

// --- Criterion 6: the must-NOT about silent omission -------------------------------------------

test('every authored table is either dumped or excluded with a reason — none merely absent', (t) => {
  const db = withBlobTable(withSearchIndex(openPlanningDatabase(t)));
  corpus(db);

  const { kept, excluded } = dump(db);
  const accounted = new Set([...kept, ...excluded.map((entry) => entry.name)]);

  // The partition is the criterion: a table that appears in neither list is one the dump
  // dropped without saying so, and a restored database missing its rows reports success.
  const unaccounted = authoredTables(db).filter((table) => !accounted.has(table));
  assert.deepEqual(unaccounted, [], 'no authored table is silently missing');

  for (const table of authoredTables(db)) {
    assert.ok(kept.includes(table), `${table} is dumped`);
  }

  assert.ok(excluded.length > 0, 'and the exclusion list is not empty, so the check has teeth');
  for (const entry of excluded) {
    assert.match(entry.reason, /\S/, `${entry.name} states why it was excluded`);
  }
});

test('a dump with no objects at all fails rather than producing an empty file', (t) => {
  const empty = new DatabaseSync(':memory:');
  t.after(() => empty.close());

  // An empty database and a dumper that filtered everything out produce the same zero bytes.
  assert.throws(() => dumpableObjects(empty), /no dumpable objects/i);
});

test('a normalised column that no longer exists fails the dump', (t) => {
  const db = openPlanningDatabase(t);
  const objects = dumpableObjects(db);

  // The declaration is keyed by column name, so a migration that renames `applied_at` would
  // otherwise leave an entry that silently stops applying and a dump that is machine-dependent
  // again. Renaming it here is the mutation that proves the guard fires.
  db.exec('ALTER TABLE schema_version RENAME COLUMN applied_at TO stamped_at');

  assert.throws(
    () => dumpRows(db, dumpableObjects(db).objects, objects.owners),
    /schema_version\.applied_at is normalised .* no longer exists/,
  );
});

// --- The file's own shape ----------------------------------------------------------------------

test('the dump is LF-only and ends in exactly one newline', (t) => {
  const db = withBlobTable(withSearchIndex(openPlanningDatabase(t)));
  corpus(db);

  const { sql } = dump(db);

  assert.ok(!sql.includes('\r'), 'no CR anywhere, so the file is LF-only on every platform');
  assert.ok(sql.endsWith('\n'));
  assert.ok(!sql.endsWith('\n\n'), 'exactly one trailing newline');
  assert.ok(sql.startsWith('PRAGMA foreign_keys=OFF;\n'), 'and it opens by disabling enforcement');
});

test('a round trip through the file reproduces it byte for byte', (t) => {
  const db = withBlobTable(withSearchIndex(openPlanningDatabase(t)));
  corpus(db);

  const first = dump(db).sql;

  const restored = new DatabaseSync(':memory:');
  t.after(() => restored.close());
  restored.exec(first);

  // A dumper that quietly normalises — trimming, re-casing, dropping a NULL — satisfies every
  // criterion above and fails here, which is why this smoke check sits in Story 1 rather than
  // waiting for Story 3's fuller round-trip suite.
  assert.equal(dump(restored).sql, first);
});

// --- The literal formatter -----------------------------------------------------------------

test('text literals double their quotes rather than escaping them', () => {
  assert.equal(text('plain'), "'plain'");
  assert.equal(text("it's"), "'it''s'");
  assert.equal(text("''"), "''''''");

  // A backslash is not an escape character inside a SQLite string, so it must survive verbatim.
  assert.equal(text('a\\b'), "'a\\b'");
});

test('numbers are emitted without shortening, and non-finite ones are refused', () => {
  assert.equal(number(0), '0');
  assert.equal(number(-42), '-42');
  assert.equal(number(9007199254740993n), '9007199254740993');

  // `String(0.1)` is '0.1' — the shortest form that round-trips in JavaScript, which is a
  // property of the runtime. Seventeen significant digits is the width at which an IEEE-754
  // double round-trips exactly, and it is the same on every engine.
  assert.equal(number(0.1), '0.10000000000000001');

  for (const value of [Infinity, -Infinity, NaN]) {
    assert.throws(() => number(value), /non-finite/);
  }
});

test('blobs are upper-case hex, zero-padded per byte', () => {
  assert.equal(blob(new Uint8Array([0x00, 0x0f, 0xff])), "X'000FFF'");
  assert.equal(blob(new Uint8Array([])), "X''");
});

test('an unrecognised value stops the dump instead of being stringified', () => {
  assert.equal(literal(null), 'NULL');

  // A default branch here would put something plausible in the file and fail on restore — or
  // worse, restore to a different value.
  for (const value of [undefined, true, {}, [], Symbol('x')]) {
    assert.throws(() => literal(value), /no SQL literal/);
  }
});

test('a value survives the round trip through its own literal', (t) => {
  const db = openDatabase(t);
  db.exec('CREATE TABLE probe (id INTEGER PRIMARY KEY, t TEXT, b BLOB)');

  const awkward = "quote ' backslash \\ newline \n tab \t unicode ✓";
  const bytes = new Uint8Array([0, 255, 16, 32]);

  db.exec(
    `INSERT INTO probe (id, t, b) VALUES (1, ${literal(awkward)}, ${literal(bytes)})`,
  );

  const row = db.prepare('SELECT t, b FROM probe WHERE id = 1').get();
  assert.equal(row.t, awkward);
  assert.deepEqual(new Uint8Array(row.b), bytes);
});
