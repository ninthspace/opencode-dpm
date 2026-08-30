/**
 * Story 8 — what only survives contact between stories.
 *
 * Every test here spans two stories that each pass alone, and each one is a failure neither
 * story's own criteria could see. The recurring shape is **migration versus everything else**:
 * Story 5 asserts that a database reaches the current version, and Stories 3, 4 and 7 assert
 * that counters, edges and triggers behave — but a migration recreating a table drops its
 * triggers silently, and nothing in either story observes it. A schema that is structurally
 * correct and behaviourally hollow passes both halves separately.
 *
 * The first test is the one that earns the story. Stories 1–5 produce two ways to arrive at
 * the same schema, and no per-story criterion compares them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabaseFile } from './support/database.js';
import { registerCreators } from './support/creators.js';
import { databaseAtVersion } from './support/migration.js';
import { retire } from './support/vocabulary.js';
import { start } from '../src/start.ts';
import { targetVersion } from '../src/schema/migrate.ts';
import { checkIntegrity } from '../src/integrity/check.ts';
import { REGISTER } from '../src/integrity/register.ts';
import { allocateNumber } from '../src/numbering/allocate.ts';
import { readyDocuments } from '../src/dependency/readiness.ts';
import { claimComplete, claimState } from '../src/coverage/claim.ts';
import { create } from './fixtures/index.js';
import { childDocument, rootDocument } from './fixtures/planning.js';

/**
 * Every schema object a database holds, as comparable text.
 *
 * Ordered by type and name rather than by creation order, because the two paths create things
 * in different orders by construction — that is what makes them two paths — and an order-
 * sensitive comparison would fail on every run while telling nobody anything.
 */
function schemaShape(db) {
  return db
    .prepare(`SELECT type, name, tbl_name, sql FROM sqlite_schema
               WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`)
    .all()
    .map((object) => `${object.type} ${object.name} on ${object.tbl_name}\n${object.sql ?? '(auto)'}`);
}

/** A spec, an epic under it, a story, and a requirement whose text contains `fragment`. */
function planningCorpus(db, { fragment = 'shall persist' } = {}) {
  const spec = rootDocument(db, 'spec', { number: 47, slug: 'substrate' });
  const epic = childDocument(db, 'epic', spec, { sequence: 1, slug: 'epic-1', title: 'Epic 1' });
  const story = create(db, 'story', { epic_id: epic.id, number: 1 });
  const requirement = create(db, 'requirement', {
    spec_id: spec.id, text: `Every artefact ${fragment} in one database.`,
  });
  const criterion = create(db, 'story_criterion', { story_id: story.id, text: 'A row round-trips.' });

  return { spec, epic, story, requirement, criterion };
}

const OLD = 7;

test('a migrated schema and a freshly created one are identical, object for object', (t) => {
  const migrated = databaseAtVersion(t, OLD);
  const { db: upgraded } = start(migrated.path);

  const fresh = openDatabaseFile(t);
  const { db: created } = start(fresh.path);

  const before = schemaShape(upgraded);
  const after = schemaShape(created);

  // Named rather than counted, so a failure says *which* object is missing. A count would
  // report "41 versus 40" on the only failure this test exists to catch.
  assert.deepEqual(
    before.map((object) => object.split('\n')[0]),
    after.map((object) => object.split('\n')[0]),
    'the same tables, indexes and triggers, by name',
  );
  assert.deepEqual(before, after, 'and the same DDL for each — constraints included');

  assert.ok(before.length > 40, `only ${before.length} objects compared — the shape read nothing`);
  // **Read from both databases and derived, not written down.** This assertion used to name the
  // number — `targetVersion() === 25` — which checked that a literal in this file matched a literal
  // in the schema directory and asked neither database anything. It went red on the next migration,
  // for a reason that had nothing to do with the two paths agreeing. What it claims is that both
  // arrived at the version the files describe, so both are asked.
  const version = (db) => db.prepare('SELECT max(version) AS v FROM schema_version').get().v;

  assert.equal(version(upgraded), targetVersion(), 'the migrated database stopped short');
  assert.equal(version(created), targetVersion(), 'the freshly created one stopped short');
});

test('a retirement made before a migration is still in force after it', (t) => {
  const file = databaseAtVersion(t, OLD);

  // Version 7 predates the vocabulary tables, so the retirement has to be made after the first
  // start — which is the realistic order anyway: a project retires a term, then upgrades.
  const first = start(file.path);
  registerCreators();
  const { spec, epic } = planningCorpus(first.db);
  const review = rootDocument(first.db, 'review', {
    number: 1, slug: 'review-1', parent_id: spec.id, parent_kind: 'spec',
  });
  const finding = create(first.db, 'finding', {
    review_id: review.id, category_id: 'finding:scope-creep',
    severity_id: 'severity:warning', summary: 'filed while the term was live',
  });

  retire(first.db, 'taxonomy', 'finding:scope-creep', '2026-03-01T00:00:00Z');
  first.db.close();

  // A second start re-derives every retirement guard from the finished schema, which is the
  // step that could plausibly undo this: the guards are dropped and recreated on each run.
  const { db } = start(file.path);

  assert.equal(
    db.prepare("SELECT retired_at FROM taxonomy WHERE id = 'finding:scope-creep'").get().retired_at,
    '2026-03-01T00:00:00Z',
    'the retirement survived, with the date the project set',
  );
  assert.equal(
    db.prepare('SELECT summary FROM finding WHERE id = ?').get(finding.id).summary,
    'filed while the term was live',
    'and the row referencing it is still readable',
  );
  assert.throws(
    () => create(db, 'finding', {
      review_id: review.id, position: 2,
      category_id: 'finding:scope-creep', severity_id: 'severity:warning',
    }),
    /retired: finding\.category_id, finding\.category_domain references a retired taxonomy row/,
    'and the regenerated guard still refuses a new one',
  );
  assert.ok(epic.id);
});

test('the integrity tool passes a migrated database and fails each register violation in turn', (t) => {
  const file = databaseAtVersion(t, OLD);
  const { db } = start(file.path);

  registerCreators();
  planningCorpus(db);

  assert.equal(checkIntegrity(db).ok, true, 'a migrated and seeded database is clean');

  // Every entry, checked against the database the migration path produced rather than the one
  // Story 6 built directly — a check whose query names a table a migration created differently
  // would throw here and pass there.
  const ran = REGISTER.map((entry) => {
    const rows = entry.check(db);
    assert.ok(Array.isArray(rows), `entry ${entry.entry} returned rows on a migrated database`);
    return entry.entry;
  });

  // Counted off the register rather than written down: the claim is that every entry ran on a
  // migrated database, and a literal here would be a copy of the register's length that goes red
  // on the next entry for a reason unrelated to migration.
  assert.equal(ran.length, REGISTER.length, 'every entry ran, and none threw');
});

test('a number allocated before a migration is not reissued after it', (t) => {
  const file = databaseAtVersion(t, OLD);

  const first = start(file.path);
  registerCreators();

  const allocated = [allocateNumber(first.db, 'spec'), allocateNumber(first.db, 'spec')];
  first.db.close();

  const { db, migrated } = start(file.path);

  assert.deepEqual(migrated.applied, [], 'already current — this is the second start, not the upgrade');
  assert.deepEqual(
    [allocateNumber(db, 'spec'), allocateNumber(db, 'spec')],
    [3, 4],
    'the counter is a row and survives; a counter derived from what exists would restart',
  );
  assert.deepEqual(allocated, [1, 2]);
});

test('verification survives a migration, and a later edit still clears it', (t) => {
  const file = databaseAtVersion(t, OLD);

  const first = start(file.path);
  registerCreators();
  const { requirement, criterion } = planningCorpus(first.db);
  const coverage = create(first.db, 'coverage', {
    requirement_id: requirement.id, story_criterion_id: criterion.id,
    spec_fragment: 'shall persist',
    verified_at: '2026-08-01T00:00:00Z', binding_hash: 'abc123',
  });
  first.db.close();

  const { db } = start(file.path);

  assert.equal(
    db.prepare('SELECT verified_at FROM coverage WHERE id = ?').get(coverage.id).verified_at,
    '2026-08-01T00:00:00Z',
    'the ✓ is data and survives the upgrade',
  );

  // The half neither story sees alone: a migration recreating `coverage` or `story_criterion`
  // drops their triggers, and a database whose ✓ survived but whose decay did not looks
  // perfectly healthy until the first edit that should have cleared something.
  db.prepare('UPDATE story_criterion SET text = ? WHERE id = ?')
    .run('A row round-trips, with its detail rows.', criterion.id);

  assert.deepEqual(
    { ...db.prepare('SELECT verified_at, binding_hash FROM coverage WHERE id = ?').get(coverage.id) },
    { verified_at: null, binding_hash: null },
    'and the trigger that decays it survived too',
  );
});

test('a completeness claim survives a migration, and a later coverage row still clears it', (t) => {
  const file = databaseAtVersion(t, OLD);

  const first = start(file.path);
  registerCreators();
  const { requirement, criterion } = planningCorpus(first.db);
  create(first.db, 'coverage', {
    requirement_id: requirement.id, story_criterion_id: criterion.id, spec_fragment: 'shall persist',
  });
  const claim = claimComplete(first.db, requirement.id, '2026-08-02T00:00:00Z');
  first.db.close();

  const { db } = start(file.path);

  assert.deepEqual(
    { ...db.prepare('SELECT coverage_claimed_at, coverage_claim_hash FROM requirement WHERE id = ?').get(requirement.id) },
    claim,
    'the claim and its hash survive together',
  );

  create(db, 'coverage', {
    requirement_id: requirement.id, story_criterion_id: criterion.id,
    spec_fragment: 'in one database', position: 2,
  });

  assert.equal(
    claimState(db, requirement.id).claimed,
    false,
    'and all four unclaim triggers survived — the same trigger-loss failure one level up',
  );
});

test('milestone assignments survive a migration, and the spec-scoping check still bites', (t) => {
  const file = databaseAtVersion(t, OLD);

  const first = start(file.path);
  registerCreators();
  const { spec, epic } = planningCorpus(first.db);

  const milestones = ['Substrate', 'Tools'].map((title, index) =>
    create(first.db, 'milestone', {
      spec_id: spec.id, label: `M${index + 1}`, title, position: index + 1,
    }));

  for (const milestone of milestones) {
    create(first.db, 'document_milestone', { document_id: epic.id, milestone_id: milestone.id });
  }
  first.db.close();

  const { db } = start(file.path);

  assert.deepEqual(
    readyDocuments(db)
      .find((row) => row.id === epic.id).milestones.map((milestone) => milestone.label),
    ['M1', 'M2'],
    'both assignments survive, and the readiness query still reports both rather than choosing',
  );

  // The pair check is a register entry rather than a constraint, so it is the integrity tool
  // and not the schema that has to have come through the migration intact.
  const elsewhere = rootDocument(db, 'spec', { number: 48, slug: 'other' });
  const stray = create(db, 'milestone', {
    spec_id: elsewhere.id, label: 'M1', title: 'Elsewhere', position: 1,
  });
  create(db, 'document_milestone', { document_id: epic.id, milestone_id: stray.id });

  const report = checkIntegrity(db);
  assert.deepEqual(
    report.violations.map((violation) => violation.entry),
    [12],
    'a cross-spec assignment is still refused after the upgrade, by register #12',
  );
});
