/**
 * Epic 04-01 Story 2 — what migration 025 has to leave exactly as it found it.
 *
 * 025 is the first migration in dpm to rebuild a table, and a rebuild is the one shape that can
 * lose data while reporting success: `DROP TABLE coverage` cascades to `coverage_story`, and
 * `ALTER TABLE … RENAME TO` reparses every trigger in the schema. Both failures are silent — the
 * migration commits, the schema is structurally correct, and rows and guards are gone.
 *
 * **A database built from DDL alone cannot see any of that.** With no rows, "nothing was lost" is
 * satisfied by a migration that dropped every table, so the fixture here is a corpus at the
 * previous version, written before the migration runs and read after it. That is the whole of task
 * 1, and it is why this file is separate from `coverage-retirement.test.js`: that one asserts the
 * shape the migration produces, this one asserts the state it preserves.
 *
 * `migrate` rather than `start`, deliberately. `start` also seeds vocabularies and regenerates the
 * retirement guards, and both are real changes that an "everything else is untouched" comparison
 * would then have to except — and an exception list is how such a comparison stops meaning
 * anything.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { databaseAtVersion, versionBefore, vocabularyAsOf } from './support/migration.js';
import { registerCreators } from './support/creators.js';
import { columnNames, triggerNames } from './support/introspection.js';
import { claimDigestOverEveryBoundRow } from './support/hashes.js';
import { applyVocabulary } from '../src/schema/seeds/index.ts';
import { schemaDirectory, schemaFiles } from '../src/schema/files.ts';
import { migrate, targetVersion, versionOf } from '../src/schema/migrate.ts';
import { claimHash, claimState } from '../src/coverage/claim.ts';
import { create } from './fixtures/index.js';
import { childDocument, rootDocument } from './fixtures/planning.js';

/** The version immediately before this epic's migration, derived from its filename. */
const PREVIOUS = versionBefore('coverage-retirement');

const AT = '2026-08-27T00:00:00Z';


/**
 * A database at `PREVIOUS`, holding the state the rebuild has to carry across.
 *
 * Two coverage rows so the natural key is exercised by more than one row; a `coverage_story` row
 * because it is what the rescue exists for; a verified binding because `verified_at` and
 * `binding_hash` cross the rebuild as data rather than being recomputed; and a standing claim on
 * the requirement, which is the value criterion 2 is about.
 *
 * @param {import('node:test').TestContext} t
 */
function corpusAtPreviousVersion(t) {
  const file = databaseAtVersion(t, PREVIOUS);
  const db = file.connect();

  registerCreators();
  applyVocabulary(db, { vocabularies: vocabularyAsOf(db) });

  const spec = rootDocument(db, 'spec', { number: 4, slug: 'supersession' });
  const epic = childDocument(db, 'epic', spec, { sequence: 1, slug: 'schema', title: 'Schema' });
  const story = create(db, 'story', { epic_id: epic.id, number: 1 });
  const other = create(db, 'story', { epic_id: epic.id, number: 2 });

  const requirement = create(db, 'requirement', {
    spec_id: spec.id, text: 'Every binding retires in place and stays readable afterwards.',
  });
  const criteria = ['A row survives.', 'A guard survives.'].map((text, index) =>
    create(db, 'story_criterion', { story_id: story.id, text, position: index }));

  const bindings = [
    create(db, 'coverage', {
      requirement_id: requirement.id,
      story_criterion_id: criteria[0].id,
      spec_fragment: 'Every binding retires in place',
      position: 0,
      verified_at: AT,
      binding_hash: 'a-digest-from-before-the-rebuild',
    }),
    create(db, 'coverage', {
      requirement_id: requirement.id,
      story_criterion_id: criteria[1].id,
      spec_fragment: 'stays readable afterwards',
      position: 1,
    }),
  ];

  // The row the rescue is for: it cascades from `coverage`, and with enforcement off during a
  // rebuild the implicit delete is what would take it.
  create(db, 'coverage_story', { coverage_id: bindings[0].id, story_id: other.id });

  // A claim made against the set as it stands, so criterion 2 compares a stored digest rather than
  // one this test computed twice.
  //
  // **Computed by the pre-025 definition and not by `claimHash`.** That function now carries
  // `AND retired_at IS NULL`, which is a column this database does not have — so calling it here
  // fails outright, and a version of it that tolerated the absence would be computing today's
  // answer against yesterday's schema. The digest a real pre-025 database holds was made by the
  // unqualified query, and that is the value the migration has to leave describing the same set.
  const claim = claimDigestOverEveryBoundRow(db, requirement.id);

  db.prepare(`UPDATE requirement SET coverage_claimed_at = ?, coverage_claim_hash = ?
    WHERE id = ?`).run(AT, claim, requirement.id);

  return { file, db, requirement, criteria, bindings, claim, story: other };
}

test('every row migrates live — nothing arrives retired or superseded [integration]', (t) => {
  const { db } = corpusAtPreviousVersion(t);

  assert.equal(columnNames(db, 'coverage').includes('retired_at'), false,
    'the fixture is not at the previous version — it already has the column');

  const applied = migrate(db, { now: AT });

  assert.ok(applied.applied.includes(PREVIOUS + 1), 'the migration under test did not run');

  const count = (sql) => db.prepare(sql).get().n;

  assert.equal(count('SELECT count(*) AS n FROM coverage'), 2, 'a binding was lost in the rebuild');
  assert.equal(count('SELECT count(*) AS n FROM coverage WHERE retired_at IS NOT NULL'), 0);
  assert.equal(count('SELECT count(*) AS n FROM coverage WHERE retired_reason IS NOT NULL'), 0);
  assert.equal(count('SELECT count(*) AS n FROM story_criterion WHERE superseded_at IS NOT NULL'), 0);
  assert.equal(count('SELECT count(*) AS n FROM story_criterion WHERE warrant_adr_id IS NOT NULL'), 0);

  // The verification crosses as data. A rebuild that copied the key columns and recomputed the rest
  // would pass every count above and silently unverify the corpus.
  const verified = db
    .prepare('SELECT verified_at, binding_hash FROM coverage WHERE verified_at IS NOT NULL')
    .all()
    // `node:sqlite` returns null-prototype rows, which `deepStrictEqual` will not match against an
    // object literal. Spread rather than switch to a looser comparison: the prototype is the only
    // difference, and a looser assertion would stop noticing an extra column.
    .map((row) => ({ ...row }));

  assert.deepEqual(verified, [{ verified_at: AT, binding_hash: 'a-digest-from-before-the-rebuild' }]);
});

test('a standing claim survives the migration, digest for digest [integration]', (t) => {
  const { db, requirement, claim } = corpusAtPreviousVersion(t);

  // Read off the columns rather than through `claimState`, because this database is at the previous
  // version and `claimState` now reads `retired_at`. That is not a limitation to work around: a
  // reader compiled against schema 25 has no business answering questions about a schema-24
  // database, and the pair of columns is the whole of what a stored claim is.
  const stored = db.prepare('SELECT coverage_claimed_at, coverage_claim_hash FROM requirement WHERE id = ?')
    .get(requirement.id);

  assert.equal(stored.coverage_claimed_at, AT, 'the fixture made no claim, so there is none to keep');
  assert.equal(stored.coverage_claim_hash, claim);

  migrate(db, { now: AT });

  assert.equal(claimHash(db, requirement.id), claim,
    'the bound set hashes differently after the migration, so every stored claim is now stale');

  // Read through `claimState` as well as the hash, because `current` is the value a roll-up acts
  // on and the two could disagree if the migration had cleared the stored digest rather than the
  // set it describes.
  assert.deepEqual(claimState(db, requirement.id), { claimed: true, current: true, bound: 2 });
});

test('the rebuild drops no coverage_story row, no index and no trigger [integration]', (t) => {
  const { db, bindings, story } = corpusAtPreviousVersion(t);

  const objects = (type) => db
    .prepare(`SELECT name FROM sqlite_schema WHERE type = ? AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all(type)
    .map((row) => row.name);

  const indexesBefore = objects('index');
  const triggersBefore = triggerNames(db);

  migrate(db, { now: AT });

  // Named differences in both directions, so a failure says which object went. The migration adds
  // objects deliberately — `coverage_binding` and the three `entry_fts_coverage_*` triggers — so
  // the assertion is that nothing was *lost*, not that the sets are equal.
  const lostIndexes = indexesBefore.filter((name) => !objects('index').includes(name));
  const lostTriggers = triggersBefore.filter((name) => !triggerNames(db).includes(name));

  assert.deepEqual(lostIndexes, [], 'the rebuild dropped an index it did not put back');
  assert.deepEqual(lostTriggers, [], 'the rebuild dropped a trigger it did not put back');

  // The control on that sweep. Both lists have to be non-trivially large, or "nothing was lost"
  // is a statement about two empty sets.
  assert.ok(indexesBefore.length > 5, `only ${indexesBefore.length} indexes compared`);
  assert.ok(triggersBefore.length > 20, `only ${triggersBefore.length} triggers compared`);

  // The trigger that the rebuild is most likely to have lost, because it is defined on another
  // table and names `coverage` only in its body — so `ALTER TABLE … RENAME TO` reparses it while
  // `coverage` does not exist. Asserted by name rather than by count.
  assert.ok(triggerNames(db).includes('requirement_unclaim_on_coverage_insert'));
  assert.ok(triggerNames(db).includes('coverage_unverify_on_criterion_edit'));

  assert.deepEqual(
    db.prepare('SELECT coverage_id, story_id FROM coverage_story').all().map((row) => ({ ...row })),
    [{ coverage_id: bindings[0].id, story_id: story.id }],
    'the rescue did not put back what it took aside',
  );
});

test('the recreated triggers still fire after the rebuild [integration]', (t) => {
  const { db, bindings, criteria, requirement } = corpusAtPreviousVersion(t);

  migrate(db, { now: AT });

  // A trigger present by name and hollow in behaviour is the failure a schema comparison cannot
  // see, and it is the one a rebuild produces: recreating a trigger from the wrong source text
  // leaves the name in `sqlite_schema` either way.
  db.prepare('UPDATE story_criterion SET text = ? WHERE id = ?')
    .run('A row survives, differently.', criteria[0].id);

  assert.deepEqual(
    { ...db.prepare('SELECT verified_at, binding_hash FROM coverage WHERE id = ?').get(bindings[0].id) },
    { verified_at: null, binding_hash: null },
    'editing the bound criterion left the verification standing',
  );

  // The claim is untouched by that edit, and the two levels are different questions rather than
  // one enforced twice. A row's ✓ is about the *text* it was verified against, so it decays; a
  // claim is about the *set* that is bound, and `claimHash` hashes fragment and criterion id — so
  // rewording a criterion moves no member of the set. Asserted because the intuitive reading is
  // that both decay together, and a later change that made them do so would look like a fix.
  assert.deepEqual(claimState(db, requirement.id), { claimed: true, current: true, bound: 2 });

  // The unclaim triggers survived the rebuild too, and this is what shows it: adding a binding
  // does change the set, and the claim goes.
  create(db, 'coverage', {
    requirement_id: requirement.id,
    story_criterion_id: criteria[1].id,
    spec_fragment: 'stays readable',
    position: 2,
  });

  assert.equal(claimState(db, requirement.id).claimed, false,
    'requirement_unclaim_on_coverage_insert did not survive the rename');
});

test('everything above migration 025 is additive, so a failure here localises to the rebuild', () => {
  // **This began as "025 is the newest", and that was the wrong claim.** What the fixture needs is
  // not that nothing has landed above 025 — something has, `026-retired-claim.sql` — but that a
  // failure in this file still points at the rebuild rather than at whatever ran after it. A
  // `CREATE TRIGGER` cannot move a row or drop an index, so it cannot be the cause of any assertion
  // above. What could is another *rebuild*, and `-- dpm:rebuild` is exactly the marker that names
  // one. Asserting the newest version would have gone red on every future migration for a reason
  // that has nothing to do with what this file tests.
  assert.ok(targetVersion() >= PREVIOUS + 1, 'migration 025 is not in the schema at all');

  // The marker as `migrate.js` matches it — anchored at the start of a line, copied by hand from
  // `REBUILD` there. A bare `includes` would have flagged `026-retired-claim.sql`, whose docblock
  // explains that it deliberately does *not* carry the marker.
  const marker = /^-- dpm:rebuild\b/m;

  const above = schemaFiles()
    .filter((name) => versionOf(name) > PREVIOUS + 1)
    .filter((name) => marker.test(readFileSync(join(schemaDirectory(), name), 'utf8')));

  assert.deepEqual(above, [],
    'a rebuild migration has landed above 025, so the fixture now migrates through two table '
    + 'rebuilds and a failure in this file no longer localises to the one it names');
});
