/**
 * Epic 2 Story 1 — the table the database stamp lives in, and the migration that adds it.
 *
 * The neighbour check in Epic 1 sees a newer release installed beside the running one. It sees
 * nothing when a colleague publishes from a newer plugin and the project is pulled and opened on an
 * older one, because nothing in the filesystem beside *your* plugin records what wrote the file.
 * The database is the only witness, and `plugin_stamp` is where it keeps what it saw.
 *
 * **This story builds storage and nothing else.** Nothing writes the row (Story 3) and nothing
 * compares it (Story 4), so every assertion here is about the table's existence, its shape, and
 * what the migration does and does not do on the way to creating it.
 *
 * **Two of the six criteria are absences**, and an absence is what a broken check always reports.
 * Each is paired below with a control that would have caught the thing said not to happen: a
 * constraint-free twin for the second-row rejection, and a hand-written row for the count. The
 * mutation runs — dropping the `CHECK`, adding an `INSERT` to the migration — are done at
 * verification and recorded in the story's observation; what is committed is the pair.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase, openDatabaseFile } from './support/database.js';
import { registerCreators } from './support/creators.js';
import { databaseAtVersion, vocabularyAsOf, versionBefore } from './support/migration.js';
import { handlers, openPlanningDatabase } from './support/planning-database.js';
import { authoredTables } from './support/introspection.js';
import { fullCorpus } from './support/corpus.js';
import { schemaDirectory, schemaFiles } from '../src/schema/files.ts';
import { migrate, targetVersion, versionOf } from '../src/schema/migrate.ts';
import { applyVocabulary } from '../src/schema/seeds/index.ts';
import { spineTools } from '../src/tools/index.ts';
import { open } from '../src/server/index.ts';
import { start } from '../src/start.ts';

const AT = '2026-01-01T00:00:00Z';

/** The table this story exists to create. Named once so a rename fails here rather than everywhere. */
const STAMP = 'plugin_stamp';

/**
 * The version before the stamp's own migration.
 *
 * **Not `previousVersion()`, which this used to be.** That reads "the version before the newest
 * one", which was the same number while `023-plugin-stamp.sql` *was* the newest and stopped being
 * it the moment another migration landed — at which point the fixture came with the stamp table
 * already in it and the criterion below had nothing to observe.
 */
const PREVIOUS = versionBefore('plugin-stamp');

/** The versions a database at `from` still has to apply, in order. */
const pendingFrom = (from) =>
  schemaFiles().map(versionOf).filter((version) => version > from).sort((a, b) => a - b);

/**
 * The tables the migrations at `versions` create **and leave behind**, read out of their own DDL.
 *
 * The alternative is a list in this file naming the tables a migration is allowed to add, which is
 * a second description of the DDL and the copy nothing keeps in step — and this test's whole claim
 * is that the upgrade added *nothing else*, so what counts as "else" has to come from the files.
 *
 * **A rebuild creates two tables it does not leave.** SQLite cannot alter a table-level constraint,
 * so `025-coverage-retirement.sql` builds `coverage_rebuilt`, copies `coverage_story` aside into
 * `coverage_story_rescue`, and drops both before it ends — one by name and one by the rename that
 * puts it back as `coverage`. Counting them as added reports two tables that are not in the
 * database, which is the reading being wrong rather than the migration. So the drops and the
 * renames are read out of the same text, and what is left is what the file actually adds.
 */
const tablesCreatedBy = (versions) => versions
  .map((version) => schemaFiles().find((name) => versionOf(name) === version))
  .flatMap((name) => {
    const sql = readFileSync(join(schemaDirectory(), name), 'utf8');
    const gone = new Set([
      ...[...sql.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)/gi)].map((found) => found[1]),
      ...[...sql.matchAll(/ALTER\s+TABLE\s+(\w+)\s+RENAME\s+TO/gi)].map((found) => found[1]),
    ]);

    return [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi)]
      .map((found) => found[1])
      .filter((table) => !gone.has(table));
  })
  .sort();

/** The DDL SQLite holds for a table, or `undefined` if it has none. */
const ddlFor = (db, table) =>
  db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table)?.sql;

/**
 * The stamp table's rows as ordinary objects.
 *
 * `node:sqlite` hands back null-prototype rows, which `deepStrictEqual` will not match against an
 * object literal — so the mapping is what lets the expectation be written as the row it describes
 * rather than as a shape assembled to satisfy the comparison.
 */
const stampRows = (db) => db
  .prepare(`SELECT singleton, version FROM "${STAMP}"`)
  .all()
  .map(({ singleton, version }) => ({ singleton, version }));

/**
 * Every row of every table dpm authored, keyed by table.
 *
 * Rows are compared as sorted JSON rather than in a queried order, because the claim is about
 * *contents* and an ordering choice would make the comparison depend on something the criterion
 * says nothing about. `authoredTables` excludes the FTS virtual tables and their shadow storage,
 * whose contents are derived from the tables beside them and are rebuilt by trigger.
 *
 * **`columns` is what keeps this a claim about contents rather than about shape.** A migration that
 * adds a column to a populated table changes every row's JSON without touching a single value, and
 * read whole that is indistinguishable from a migration that rewrote the data. Passing the column
 * sets read *before* the upgrade projects each row onto the columns that existed then, so a new
 * column is invisible here — where it is the business of the object-for-object comparison in
 * `integration.test.js` — and a changed value is not.
 */
function contents(db, columns = columnsBefore(db)) {
  return Object.fromEntries(authoredTables(db).map((table) => [
    table,
    db
      .prepare(`SELECT * FROM "${table}"`)
      .all()
      .map((row) => JSON.stringify(Object.fromEntries(
        (columns[table] ?? Object.keys(row)).map((column) => [column, row[column]]),
      )))
      .sort(),
  ]));
}

/** Each authored table's columns, as they stand — the shape a later `contents` is projected onto. */
function columnsBefore(db) {
  return Object.fromEntries(authoredTables(db).map((table) => [
    table,
    db.prepare(`PRAGMA table_info("${table}")`).all().map((column) => column.name),
  ]));
}

// --- Criterion 1: the table exists after a migration --------------------------------------------

test('a migrated empty database has the stamp table [integration]', (t) => {
  const db = openDatabase(t);

  assert.equal(ddlFor(db, STAMP), undefined, 'the table was there before the migration ran');

  migrate(db, { now: AT });

  const ddl = ddlFor(db, STAMP);

  assert.ok(ddl, `${STAMP} is not in the schema after migrating`);

  // The two columns by name, read off the live table rather than off the DDL text — a column
  // renamed in a later migration would leave the `CREATE` statement above saying otherwise.
  assert.deepEqual(
    db.prepare(`PRAGMA table_info("${STAMP}")`).all().map((column) => column.name),
    ['singleton', 'version'],
  );

  // The `CHECK`, asserted from the DDL because SQLite exposes constraints nowhere else, and the
  // unique index beside it, asserted from the live schema. The two together are what make this a
  // *one-row* table; either alone admits a second row, which is criterion 5's must-NOT.
  assert.match(ddl, /CHECK \(singleton = 1\)/);
  assert.ok(
    db.prepare(`PRAGMA index_list("${STAMP}")`).all()
      .some((index) => index.unique === 1 && index.partial === 0),
    'nothing enforces that there is only one row',
  );
});

// --- Criterion 2: twice applies once, and leaves the contents alone ------------------------------

test('migrating twice applies the stamp migration once and leaves its rows alone [integration]', (t) => {
  const db = openDatabase(t);
  const first = migrate(db, { now: AT });

  assert.ok(first.applied.includes(targetVersion()), 'the first run did not apply the new migration');

  // **A row written by hand, because the migration writes none.** Without it "the contents are
  // unchanged" is a comparison of nothing against nothing, which a second run that dropped and
  // recreated the table would satisfy exactly as well as one that skipped it.
  db.prepare(`INSERT INTO "${STAMP}" (version) VALUES ('0.4.0')`).run();

  const second = migrate(db, { now: '2026-02-02T00:00:00Z' });

  assert.deepEqual(second.applied, [], 'the second run applied a migration again');
  assert.equal(second.from, second.to);
  assert.equal(second.to, targetVersion());

  assert.deepEqual(stampRows(db), [{ singleton: 1, version: '0.4.0' }],
    'the second run rewrote the stamp');

  // One `schema_version` row for the migration, not two — `max(version)` reads correctly either
  // way, so a double application is invisible in the only column anyone would check.
  assert.equal(
    db.prepare('SELECT count(*) AS n FROM schema_version WHERE version = ?').get(targetVersion()).n,
    1,
  );
});

// --- Criterion 3: a database at the previous version gains it, and nothing else moves ------------

test('a database at the previous version gains the stamp table and nothing else changes [integration]', (t) => {
  // No `t.after` closing this one: `databaseAtVersion` builds on `openDatabaseFile`, which closes
  // every connection it hands out and removes the directory when the test ends.
  const db = databaseAtVersion(t, PREVIOUS).connect();

  assert.notEqual(PREVIOUS, targetVersion(), 'there is only one schema version, so nothing is behind');
  assert.equal(ddlFor(db, STAMP), undefined, 'the previous version already had the stamp table');

  // **The corpus is what makes the second half of this criterion mean anything.** A database built
  // from DDL alone holds no rows, so "no other table's contents changed" is satisfied by any
  // migration whatsoever — including one that dropped every table in the schema.
  registerCreators();
  applyVocabulary(db, { vocabularies: vocabularyAsOf(db) });
  fullCorpus(db, handlers(spineTools(db)));

  const shape = columnsBefore(db);
  const before = contents(db, shape);

  assert.ok(Object.values(before).filter((rows) => rows.length > 0).length > 20,
    'the corpus filled too few tables for this comparison to discriminate');

  // `migrate` rather than `start`, deliberately: `start` also seeds the vocabularies and
  // regenerates the retirement guards, and both are real changes that would have to be excluded
  // here. Excluding them is how an "everything else is untouched" assertion stops meaning anything.
  const migrated = migrate(db, { now: AT });

  // Every migration from the stamp's own to the newest, since the fixture starts below the first
  // of them. Derived rather than written as a list: the set grows by one each time a file lands,
  // and a written one would send this test red for the wrong reason on every future migration.
  assert.deepEqual(
    migrated.applied,
    pendingFrom(PREVIOUS),
    'the migrations that ran are not the ones pending from the fixture\'s version',
  );
  assert.ok(migrated.applied.includes(versionBefore('plugin-stamp') + 1),
    'the stamp\'s own migration was not among them, so nothing here is about the stamp');
  assert.ok(ddlFor(db, STAMP), `${STAMP} is not in the schema after the upgrade`);

  const after = contents(db, shape);

  // `schema_version` gained a row per migration, and the tables those migrations create did not
  // exist before. Every other table, contents included, is compared whole — and the tables allowed
  // to be new are read out of the DDL that ran rather than named here, so a migration that created
  // something its own file does not create still fails.
  assert.deepEqual(after[STAMP], [], 'the migration put a row in the stamp table');
  assert.deepEqual(
    Object.keys(after).filter((table) => !Object.hasOwn(before, table)).sort(),
    tablesCreatedBy(migrated.applied),
    'a migration added a table its own DDL does not create',
  );

  delete before.schema_version;
  delete after.schema_version;

  for (const table of tablesCreatedBy(migrated.applied)) delete after[table];

  assert.deepEqual(after, before, 'the upgrade changed a table it should not have touched');
});

// --- Criterion 4: a server whose target is below the database's version serves read-only ---------

/**
 * A database migrated to this server's target and then stamped one version above it, **closed**.
 *
 * **Not `naming.test.js`'s `fromTheFuture` and not `server.test.js`'s `aheadDatabase`.** Those two
 * are already deliberately unshared from each other, each carrying a comment saying why; a third
 * caller with a third need is exactly what turns one of them into a fixture with a mode flag. What
 * this one needs and neither offers is the relation *one above the current target* rather than an
 * unreachable constant — because the situation under test is not a hypothetical far-future
 * database, it is the one AD2 accepted: a server from the release before this one, meeting a
 * project this release has opened.
 */
function oneVersionAhead(t) {
  const file = openDatabaseFile(t);
  const { db } = start(file.path);
  const supported = targetVersion();

  db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)')
    .run(supported + 1, '2027-01-01T00:00:00Z');
  db.close();

  return { path: file.path, supported, found: supported + 1 };
}

test('a database one version above this server is served read-only [integration]', (t) => {
  const ahead = oneVersionAhead(t);

  const again = start(ahead.path);

  t.after(() => again.db.close());

  assert.equal(again.migrated.ahead, true, 'the skew was not noticed');
  assert.equal(again.migrated.from, ahead.found);
  assert.equal(again.migrated.target, ahead.supported);
  assert.deepEqual(again.migrated.applied, [], 'the older server migrated a database ahead of it');

  const table = open(ahead.path);
  const writes = table.filter((tool) => tool.mutates);

  assert.ok(writes.length > 0, 'the table has no write tools, so refusing them proves nothing');

  for (const tool of writes) {
    assert.throws(() => tool.handler({}), new RegExp(`\\b${ahead.found}\\b`),
      `${tool.name} was not refused`);
  }

  assert.equal(table.find((tool) => tool.name === 'list_spec').handler({}).returned, 0,
    'a read tool was refused along with the writes');
});

test('the same database without the stamp serves its writes [integration]', (t) => {
  // **The control.** Every assertion above is that something was refused, and a server that
  // refused every write unconditionally would pass all of them. This is the same fixture, built
  // the same way, with the one row that puts it ahead left out.
  const file = openDatabaseFile(t);
  const { db } = start(file.path);

  db.close();

  const again = start(file.path);

  t.after(() => again.db.close());

  assert.equal(again.migrated.ahead, false, 'a database at the current version reported as ahead');

  const table = open(file.path);
  const create = table.find((tool) => tool.name === 'create_spec');

  assert.ok(create.handler({ slug: 'served', title: 'Served' }).id,
    'the write was refused without a version above the target, so the refusal above proves nothing');
});

// --- Criterion 5 (must NOT): the table admits a second row ---------------------------------------

test('the stamp table refuses a second row [integration]', (t) => {
  const db = openDatabase(t);

  migrate(db, { now: AT });

  db.prepare(`INSERT INTO "${STAMP}" (version) VALUES ('0.4.0')`).run();

  // **Both ways in, and each is refused by a different constraint.** An insert naming no
  // `singleton` takes the default and collides on the unique index; one naming a different value
  // fails the `CHECK` before it gets there. Either constraint alone leaves the other door open,
  // which is why the assertions name the two messages rather than merely that something threw.
  assert.throws(() => db.prepare(`INSERT INTO "${STAMP}" (version) VALUES ('0.5.0')`).run(),
    /UNIQUE constraint failed/);
  assert.throws(
    () => db.prepare(`INSERT INTO "${STAMP}" (singleton, version) VALUES (2, '0.5.0')`).run(),
    /CHECK constraint failed/,
  );

  assert.deepEqual(stampRows(db), [{ singleton: 1, version: '0.4.0' }]);

  // **The control**: the same three inserts against the same columns with neither constraint
  // declared. Without it, "the second row was refused" is equally true of a table that refuses
  // everything, of a driver that throws on every write, and of a `prepare` that never ran.
  const control = new DatabaseSync(':memory:');

  t.after(() => control.close());

  control.exec(`CREATE TABLE control_stamp (
    singleton  INTEGER NOT NULL DEFAULT 1,
    version    TEXT    NOT NULL
  )`);
  control.prepare("INSERT INTO control_stamp (version) VALUES ('0.4.0')").run();
  control.prepare("INSERT INTO control_stamp (version) VALUES ('0.5.0')").run();
  control.prepare("INSERT INTO control_stamp (singleton, version) VALUES (2, '0.6.0')").run();

  assert.equal(control.prepare('SELECT count(*) AS n FROM control_stamp').get().n, 3,
    'the constraint-free twin refused the rows too, so the refusals above are not about the '
    + 'constraints this table declares');
});

// --- Criterion 6 (must NOT): the migration inserts a row -----------------------------------------

test('the stamp migration writes no row of its own [integration]', (t) => {
  const db = openDatabase(t);

  migrate(db, { now: AT });

  assert.equal(db.prepare(`SELECT count(*) AS n FROM "${STAMP}"`).get().n, 0,
    'the migration inserted a row, so the first comparison would read a placeholder as an answer');

  // **The control**: the same count against the same table with a row in it. An assertion that a
  // count is zero passes just as well against a table the query cannot see, a name that no longer
  // exists, and a connection that never ran the migration.
  db.prepare(`INSERT INTO "${STAMP}" (version) VALUES ('0.4.0')`).run();

  assert.equal(db.prepare(`SELECT count(*) AS n FROM "${STAMP}"`).get().n, 1,
    'the count did not move when a row was added, so zero was not evidence of an empty table');
});

// --- The whole surface, once: a planning database has it too -------------------------------------

test('the schema applied directly carries the stamp table as the migrations do [integration]', (t) => {
  // `applySchema` and `migrate` are the same files applied by two paths, and `integration.test.js`
  // compares them object for object. This is the cheap direct reading of the same claim for the one
  // table this story adds — a migration numbered outside the range one path reads would fail here.
  const db = openPlanningDatabase(t);

  assert.ok(ddlFor(db, STAMP), `${STAMP} is missing from a directly applied schema`);
  assert.equal(db.prepare(`SELECT count(*) AS n FROM "${STAMP}"`).get().n, 0);
});
