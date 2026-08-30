/**
 * Story 5 — the upgrade path, which is the only part of the schema a test can only reach
 * from behind.
 *
 * Every criterion here is about what a *change* does to a database that already exists, so
 * every test builds an old one, closes it, and starts it again against a release description
 * that differs. A test that seeded the new state directly would assert that the new state is
 * the new state, which is true of an implementation that does nothing at all.
 *
 * The vocabulary tests use `release()` to substitute one table's rows into the real shipped
 * list, rather than writing a list from scratch — see `support/migration.js` for why a
 * hand-written release is a release that could never ship.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { databaseAtVersion, release } from './support/migration.js';
import { openDatabaseFile } from './support/database.js';
import { registerCreators } from './support/creators.js';
import { start } from '../src/start.ts';
import { currentVersion, targetVersion, versionOf } from '../src/schema/migrate.ts';
import { schemaFiles } from '../src/schema/files.ts';
import { VOCABULARIES } from '../src/schema/seeds/index.ts';
import { create } from './fixtures/index.js';
import { rootDocument } from './fixtures/planning.js';

const tableExists = (db, name) =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(name));

const taxonomyRow = (db, id) => ({ ...db.prepare('SELECT * FROM taxonomy WHERE id = ?').get(id) });

/** Where a version-7 database stops: the last file whose tables Story 2 had not yet added. */
const OLD = 7;

/** Spec 50's dispositions in render order, transcribed rather than imported from the seed. */
const DISPOSITION = [
  'disposition:fixed', 'disposition:left-alone', 'disposition:unverified', 'disposition:needs-you',
];

test('a database behind the release is migrated forward on start, with no user action', (t) => {
  const file = databaseAtVersion(t, OLD);

  const before = file.connect();
  assert.equal(currentVersion(before), OLD);
  assert.equal(tableExists(before, 'taxonomy'), false, 'the tables the later files add are absent');
  assert.equal(tableExists(before, 'dependency'), false);
  before.close();

  // The whole of "no user action": one call, the same one a server makes to open its database.
  const { db, migrated } = start(file.path, { now: '2026-08-08T00:00:00Z' });

  assert.deepEqual(
    migrated.applied,
    schemaFiles().map(versionOf).filter((version) => version > OLD),
    'exactly the migrations this database had not seen, in order',
  );
  assert.equal(migrated.from, OLD);
  assert.equal(migrated.to, targetVersion());
  assert.equal(currentVersion(db), targetVersion());
  assert.ok(tableExists(db, 'taxonomy') && tableExists(db, 'dependency'), 'and their tables exist');

  assert.deepEqual(
    db.prepare('SELECT applied_at FROM schema_version WHERE version = ?').get(targetVersion()).applied_at,
    '2026-08-08T00:00:00Z',
    'each migration records when it ran, not just that it did',
  );

  // The guards are derived from the finished schema rather than written into the files, so an
  // upgrade that added referencing tables has to have re-derived them. Nothing in migrations
  // 008–010 mentions a trigger.
  assert.ok(
    migrated.guards.includes('finding_category_id_category_domain_not_retired_on_insert'),
    'the retirement guards cover tables that did not exist when this database was last guarded',
  );
});

test('starting an already-current database applies nothing and writes nothing', (t) => {
  const file = openDatabaseFile(t);

  const first = start(file.path);
  const applied = first.migrated.applied;
  first.db.close();

  const second = start(file.path);

  assert.equal(applied.length, targetVersion(), 'the first start is the one that did the work');
  assert.deepEqual(second.migrated.applied, [], 'and the second has nothing to apply');
  assert.deepEqual(
    Object.values(second.vocabulary.inserted).map((count) => count.inserted),
    Object.values(second.vocabulary.inserted).map(() => 0),
    'nor any term to insert — both operations are idempotent, which is what lets them run every start',
  );
  assert.equal(
    second.db.prepare('SELECT count(*) AS n FROM schema_version').get().n,
    targetVersion(),
    'and one row per migration, not one per start',
  );
});

test('a term the release adds arrives on the next start; one the project holds is left alone', (t) => {
  const file = openDatabaseFile(t);

  const first = start(file.path);
  registerCreators();

  // The project adds its own term, under an id a later release will also ship.
  first.db.prepare(`
    INSERT INTO taxonomy (id, domain, name, singular, position, retired_at)
    VALUES ('observation:tooling', 'observation', 'Our Tooling Notes', NULL, 8, NULL)
  `).run();
  first.db.close();

  // The next release: one genuinely new term, and one that collides with the project's.
  const next = release(VOCABULARIES, 'taxonomy', (rows) => [
    ...rows,
    { id: 'observation:tooling', domain: 'observation', name: 'Tooling', singular: null, position: 8, retired_at: null },
    { id: 'observation:security', domain: 'observation', name: 'Security', singular: null, position: 9, retired_at: null },
  ]);

  const { db, vocabulary } = start(file.path, { vocabularies: next });

  assert.equal(vocabulary.inserted.taxonomy.inserted, 1, 'one of the two arrived');
  assert.equal(
    taxonomyRow(db, 'observation:security').name,
    'Security',
    'a default the plugin added after this database was created appears in it',
  );
  assert.equal(
    taxonomyRow(db, 'observation:tooling').name,
    'Our Tooling Notes',
    'and the project\'s term under the same id keeps its own text',
  );
});

test('a term the release retires is retired here, and the rows using it stay readable', (t) => {
  const file = openDatabaseFile(t);

  const first = start(file.path);
  registerCreators();

  const spec = rootDocument(first.db, 'spec', { number: 47 });
  const review = rootDocument(first.db, 'review', { number: 1, parent_id: spec.id, parent_kind: 'spec' });
  const finding = create(first.db, 'finding', {
    review_id: review.id,
    category_id: 'finding:scope-creep',
    severity_id: 'severity:warning',
    summary: 'filed while the term was live',
  });
  first.db.close();

  const { db, vocabulary } = start(file.path, {
    retirements: [{ table: 'taxonomy', key: 'finding:scope-creep', at: '2026-09-01T00:00:00Z' }],
  });

  assert.deepEqual(vocabulary.retired, { retired: 1, alreadyRetired: 0, absent: 0 });
  assert.equal(taxonomyRow(db, 'finding:scope-creep').retired_at, '2026-09-01T00:00:00Z');

  // Half one of FR24's promise, across an upgrade: the row is not orphaned, not cascaded, and
  // still joins to the term it was filed against.
  assert.deepEqual(
    {
      ...db.prepare(`
        SELECT finding.summary, taxonomy.name
          FROM finding JOIN taxonomy ON taxonomy.id = finding.category_id
         WHERE finding.id = ?
      `).get(finding.id),
    },
    { summary: 'filed while the term was live', name: 'Scope Creep' },
  );

  // Half two, which the upgrade did not have to do anything for — the derived guard was
  // already there and the retirement is what switched it on.
  assert.throws(
    () => create(db, 'finding', {
      review_id: review.id, position: 2,
      category_id: 'finding:scope-creep', severity_id: 'severity:warning',
    }),
    /retired: finding\.category_id, finding\.category_domain references a retired taxonomy row/,
  );
});

test('an upgrade never resurrects a term the project retired', (t) => {
  const file = openDatabaseFile(t);

  const first = start(file.path);

  // What a project does when a default does not suit it — and note that the row stays, which
  // is exactly why an insert guarded on *live* terms would find nothing and put it back.
  first.db.prepare("UPDATE taxonomy SET retired_at = '2026-02-01T00:00:00Z' WHERE id = 'severity:suggestion'").run();
  // And a term it removed outright, which is the control: without it, an `insertIfAbsent` that
  // silently inserted nothing at all would pass this test.
  first.db.prepare("DELETE FROM taxonomy WHERE id = 'audit_dimension:performance'").run();
  first.db.close();

  // The release retires the same term the project already did, on its own later date. This is
  // what makes `WHERE retired_at IS NULL` load-bearing rather than decorative: without it the
  // upgrade would overwrite a date describing what happened in *this* project with one
  // describing a release note.
  const { db, vocabulary } = start(file.path, {
    retirements: [{ table: 'taxonomy', key: 'severity:suggestion', at: '2026-09-01T00:00:00Z' }],
  });

  assert.deepEqual(
    vocabulary.retired,
    { retired: 0, alreadyRetired: 1, absent: 0 },
    'a term already retired is reported as such, not as a retirement that happened',
  );
  assert.equal(
    taxonomyRow(db, 'severity:suggestion').retired_at,
    '2026-02-01T00:00:00Z',
    'the retired term is still retired, and still carries the project\'s own date',
  );
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM taxonomy WHERE id = 'severity:suggestion'").get().n,
    1,
    'and there is one of it — a second row would be the same resurrection wearing a duplicate',
  );
  assert.equal(vocabulary.inserted.taxonomy.inserted, 1, 'while the absent term was inserted');
  assert.ok(taxonomyRow(db, 'audit_dimension:performance').name, 'which is the control');
});

test('a database from before spec 50 gains the disposition terms on its next open', (t) => {
  // **The DDL and nothing else** — `databaseAtVersion` applies every schema file and never runs
  // the vocabulary pass. That makes the emptiness below a statement about where the terms come
  // from, which is ENVX3's actual claim. A pinned version number would say only that the release
  // is the version it is, and would go stale on the next unrelated migration.
  const file = databaseAtVersion(t, targetVersion());

  const before = file.connect();
  assert.ok(tableExists(before, 'taxonomy'), 'a fully migrated database, not one missing the table');
  assert.equal(
    before.prepare("SELECT count(*) AS n FROM taxonomy WHERE domain = 'disposition'").get().n,
    0,
    'and no .sql file put a disposition in it, so what arrives below arrived from the seed',
  );
  before.close();

  const first = start(file.path);

  assert.deepEqual(
    first.db.prepare("SELECT id FROM taxonomy WHERE domain = 'disposition' ORDER BY position").all()
      .map((row) => row.id),
    DISPOSITION,
    'the four terms arrive on open — no migration to write, no user action to take',
  );

  // A project that removed one it did not want, and added one of its own. The second is the
  // control, and it is the stronger of the two: a pass that reset the domain to the shipped list
  // would restore the deleted term — satisfying a naive test — while deleting the project's.
  first.db.prepare("DELETE FROM taxonomy WHERE id = 'disposition:needs-you'").run();
  first.db.prepare(
    "INSERT INTO taxonomy (id, domain, name, position) VALUES ('disposition:escalated', 'disposition', 'Escalated', 5)",
  ).run();
  first.db.close();

  const { db, vocabulary } = start(file.path);

  assert.ok(taxonomyRow(db, 'disposition:needs-you').name, 'the removed term is put back');
  assert.equal(vocabulary.inserted.taxonomy.inserted, 1, 'and it is the only one the pass wrote');
  assert.ok(
    taxonomyRow(db, 'disposition:escalated').name,
    'while the project\'s own disposition survives, which is what makes this a vocabulary and not a list',
  );
});

test('an upgrade does not rewrite the text of a term rows already reference', (t) => {
  const file = openDatabaseFile(t);

  const first = start(file.path);
  registerCreators();

  const spec = rootDocument(first.db, 'spec', { number: 47 });
  const review = rootDocument(first.db, 'review', { number: 1, parent_id: spec.id, parent_kind: 'spec' });
  create(first.db, 'finding', {
    review_id: review.id, category_id: 'finding:hidden-complexity',
    severity_id: 'severity:critical', agent: 'pm', summary: 'referencing both edited terms',
  });

  first.db.prepare("UPDATE taxonomy SET name = 'Complexity We Missed' WHERE id = 'finding:hidden-complexity'").run();
  first.db.prepare("UPDATE agent SET display_name = 'Sam' WHERE name = 'pm'").run();
  first.db.close();

  // The release still ships the original text for both.
  const { db } = start(file.path);

  assert.equal(
    taxonomyRow(db, 'finding:hidden-complexity').name,
    'Complexity We Missed',
    'a name the release would restore is what makes the finding mean something else',
  );
  assert.equal(
    db.prepare("SELECT display_name FROM agent WHERE name = 'pm'").get().display_name,
    'Sam',
    'and the same for display_name, which is the other column the criterion names',
  );
});

test('the vocabulary channel contains no statement that could rewrite a term', (t) => {
  // The behavioural test above passes for an implementation that merely happens not to touch
  // those rows today. This is the half that stops a third operation being added: the module is
  // the only thing that writes a vocabulary outside the tool surface, and two statement shapes
  // are all it is allowed to hold.
  // Comments are stripped first, and that is not tidiness. This module's prose explains at
  // length which operations are banned and names them to do it; scanning the file whole would
  // fail on a comment saying `DO UPDATE` is wrong, and pass on nothing extra.
  const source = readFileSync(new URL('../src/schema/seeds/index.ts', import.meta.url), 'utf8')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll(/^\s*\/\/.*$/gm, '');

  const updates = [...source.matchAll(/UPDATE\s+\$\{?\w+\}?\s+SET\s+([\w.]+)/gi)].map((match) => match[1]);

  assert.deepEqual(updates, ['retired_at'], 'retirement is the only update the channel performs');
  assert.equal(
    /ON CONFLICT \(\$\{primaryKeyOf/.test(source),
    true,
    'and the insert is guarded on the primary key, not on which terms are live',
  );
  assert.equal(
    /\bDO UPDATE\b/i.test(source),
    false,
    'an upsert that updated on conflict would rewrite every project edit on every start',
  );
});
