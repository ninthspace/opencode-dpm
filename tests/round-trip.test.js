/**
 * Story 3 — the dumper and the restorer, checked against each other.
 *
 * Stories 1 and 2 each satisfy their own criteria without either one ever being compared to the
 * other, and that is a gap with a shape this project has already seen: Epic 47-01's DDL and its
 * migration runner both passed, separately, while producing different schemas. A dumper that
 * quietly normalises — trims a string, re-cases a keyword, drops a NULL — satisfies every
 * criterion in Story 1, and a restorer that silently skips an object satisfies every criterion
 * in Story 2. Only putting one through the other finds it.
 *
 * **The round trip goes through a file, not through memory**, because the criterion says "into
 * an empty file" and because a `:memory:` target shares a process with its source. A file is
 * also the only way to close the connection and reopen it, which is what proves the bytes rather
 * than the handle carried the state.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openPlanningDatabase } from './support/planning-database.js';
import { openDatabaseFile } from './support/database.js';
import { corpus } from './support/violations.js';
import { authoredTables } from './support/introspection.js';
import { create } from './fixtures/index.js';
import { rootDocument, childDocument } from './fixtures/planning.js';
import { dump } from '../src/dump/index.ts';
import { restore } from '../src/restore/index.ts';

/**
 * A corpus with something in every shape the round trip could lose: a derived index, a trigger
 * that maintains it, a partial index, prose holding characters that need escaping, and a NULL
 * next to a value in the same column.
 */
function populated(db) {
  db.exec(`
    CREATE VIRTUAL TABLE probe_fts USING fts5(heading, body, section_id UNINDEXED);

    CREATE TRIGGER probe_fts_insert AFTER INSERT ON document_section BEGIN
      INSERT INTO probe_fts (heading, body, section_id)
        VALUES (new.heading, new.body, new.id);
    END;
  `);

  const { spec, epic, story } = corpus(db);

  create(db, 'document_section', {
    document_id: epic.id,
    heading: "Quotes ' and \\ backslashes",
    body: 'Text with a newline\nand a tab\there, plus unicode ✓.',
    position: 1,
  });
  create(db, 'document_section', {
    document_id: spec.id,
    heading: 'Plain',
    body: 'Ordinary prose.',
    position: 1,
  });

  // A NULL beside a value in the same column, so a dumper that dropped NULLs would shorten one
  // row and not the other rather than failing uniformly.
  create(db, 'story_criterion', { story_id: story.id, text: 'A criterion.' });

  return { spec, epic, story };
}

/** Every table's row count, so a lost row is a diff rather than a silence. */
const rowCounts = (db) =>
  Object.fromEntries(
    authoredTables(db)
      .map((table) => [table, db.prepare(`SELECT count(*) AS n FROM "${table}"`).get().n])
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );

/** Every schema object SQLite holds, by type and name — the things a round trip can drop. */
const objects = (db) =>
  db
    .prepare(
      `SELECT type, name FROM sqlite_schema
        WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
    )
    .all()
    .map((row) => `${row.type} ${row.name}`);

test('a database dumped, restored into an empty file, and dumped again is byte-identical', (t) => {
  const source = openPlanningDatabase(t);
  populated(source);

  const first = dump(source).sql;

  const file = openDatabaseFile(t);
  const target = file.connect();
  restore(target, first);
  target.close();

  // Reopened rather than reused: a second dump from the same handle could be reproducing
  // connection state, and what the criterion is about is the file.
  const reopened = file.connect();
  assert.equal(dump(reopened).sql, first);
});

test('a dump taken before and after a no-op read produces identical bytes', (t) => {
  const source = openPlanningDatabase(t);
  populated(source);

  const before = dump(source).sql;

  // Reads of the kinds dpm actually performs: a scan, an indexed lookup, a search through the
  // derived index, and an aggregate. None writes, and none may reorder what a dump emits.
  source.prepare('SELECT * FROM document ORDER BY created_at').all();
  source.prepare('SELECT * FROM document WHERE id = ?').get('nothing');
  source.prepare("SELECT * FROM probe_fts WHERE probe_fts MATCH 'prose'").all();
  source.prepare('SELECT count(*) AS n FROM document_section').get();

  assert.equal(dump(source).sql, before, 'reading is not a write, and dump order does not drift');
});

test('a round trip loses no row, no index and no trigger — and would fail if it did', (t) => {
  const source = openPlanningDatabase(t);
  populated(source);

  const expectedRows = rowCounts(source);
  const expectedObjects = objects(source);

  const file = openDatabaseFile(t);
  const target = file.connect();
  restore(target, dump(source).sql);

  // Counted per table and listed per object rather than compared as whole dumps. Byte equality
  // already holds above; what this adds is that a *failure* says which table lost rows or which
  // trigger went missing, instead of reporting that two large strings differ.
  assert.deepEqual(rowCounts(target), expectedRows);
  assert.deepEqual(objects(target), expectedObjects);

  // The fixture has to contain one of each for the comparison to mean anything — a round trip
  // preserves zero triggers perfectly.
  assert.ok(expectedObjects.some((entry) => entry.startsWith('trigger ')), 'triggers exist to lose');
  assert.ok(expectedObjects.some((entry) => entry.startsWith('index ')), 'indexes exist to lose');
  assert.ok(Object.values(expectedRows).some((n) => n > 0), 'rows exist to lose');
});

test('the derived index survives the round trip by being rebuilt, not carried', (t) => {
  const source = openPlanningDatabase(t);
  populated(source);

  const sql = dump(source).sql;

  // The index's own rows are not in the file — that is Story 1's exclusion. What restores it is
  // the trigger firing as each section arrives, so an assertion that it is populated afterwards
  // is an assertion about the mechanism and not about the copy.
  assert.ok(!sql.includes('INSERT INTO "probe_fts"'), 'the index contributes no rows to the dump');

  const file = openDatabaseFile(t);
  const target = file.connect();
  restore(target, sql);

  assert.equal(
    target.prepare("SELECT count(*) AS n FROM probe_fts WHERE probe_fts MATCH 'prose'").get().n,
    1,
    'and it answers a query after a restore that never carried it',
  );
});

test('prose survives the round trip exactly, including what needed escaping', (t) => {
  const source = openPlanningDatabase(t);
  populated(source);

  const original = source
    .prepare('SELECT heading, body FROM document_section ORDER BY id')
    .all()
    .map((row) => ({ ...row }));

  const file = openDatabaseFile(t);
  const target = file.connect();
  restore(target, dump(source).sql);

  const restored = target
    .prepare('SELECT heading, body FROM document_section ORDER BY id')
    .all()
    .map((row) => ({ ...row }));

  assert.deepEqual(restored, original);
  assert.ok(
    original.some((row) => row.heading.includes("'") && row.heading.includes('\\')),
    'the corpus does contain characters a naive literal would break on',
  );
});

test('a second round trip changes nothing, so the format has reached a fixed point', (t) => {
  const source = openPlanningDatabase(t);
  populated(source);

  const first = dump(source).sql;

  const one = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  t.after(() => one.close());
  restore(one, first);
  const second = dump(one).sql;

  const two = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  t.after(() => two.close());
  restore(two, second);

  // A transformation that is stable once can still drift on the next pass — a re-quoting that
  // happens to be idempotent at the first hop but not the second. Three dumps is what rules it
  // out rather than argues about it.
  assert.equal(dump(two).sql, first);
});

test('the round trip is not a no-op — an emptied target really was rebuilt from the file', (t) => {
  const source = openPlanningDatabase(t);
  populated(source);

  const file = openDatabaseFile(t);
  const target = file.connect();

  assert.deepEqual(objects(target), [], 'the target starts genuinely empty');

  restore(target, dump(source).sql);

  // Without this, every assertion above is satisfied by comparing a database to itself.
  assert.ok(objects(target).length > 40, 'and ends holding the whole schema');
});

test('a document with a parent restores with the parent it had', (t) => {
  const source = openPlanningDatabase(t);
  const spec = rootDocument(source, 'spec', { id: 'z-spec', number: 47, slug: 's' });
  childDocument(source, 'epic', spec, { id: 'a-epic', sequence: 1, slug: 'e' });

  const file = openDatabaseFile(t);
  const target = file.connect();
  restore(target, dump(source).sql);

  // The self-referential key is the one the dump cannot order topologically, so it is the one
  // worth reading back by value rather than trusting `foreign_key_check` to have covered.
  assert.equal(target.prepare('SELECT parent_id FROM document WHERE id = ?').get('a-epic').parent_id, 'z-spec');
});
