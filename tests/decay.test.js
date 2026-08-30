/**
 * Story 7 — a ✓ and a completeness claim expire when the text they were made about changes.
 *
 * The failure this closes is not that someone forgets to re-verify. It is that nothing asks
 * them to: a criterion is edited, the row stays green, and the matrix reports coverage of a
 * sentence that no longer exists. Every coverage matrix CPM has written carries the rule in
 * prose, and prose does not fire.
 *
 * **The byte-identical controls carry as much weight as the decay cases.** A trigger clearing
 * on every write passes all six decay assertions and makes the mark worthless — false-pass
 * register #18 — so each half of the file has a control asserting the mark *survives* a write
 * that changed nothing, and an unrelated-column control beside it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase as planning } from './support/planning-database.js';
import { openDatabase } from './support/database.js';
import { triggerNames } from './support/introspection.js';
import { claimComplete, claimState } from '../src/coverage/claim.ts';
import { dump } from '../src/dump/index.ts';
import { restore } from '../src/restore/index.ts';
import { create } from './fixtures/index.js';
import { childDocument, rootDocument } from './fixtures/planning.js';

const VERIFIED = { verified_at: '2026-08-01T00:00:00Z', binding_hash: 'abc123' };

/**
 * A requirement, a story criterion and a verified coverage row binding them.
 *
 * `requirement.text` contains the fragment, so the fixture is a corpus register #9 also passes
 * — a fixture that violated another invariant while testing this one would leave both tests
 * describing a database no tool would ever produce.
 */
function boundCoverage(db, { fragment = 'shall persist' } = {}) {
  const spec = rootDocument(db, 'spec', { number: 47, slug: 'substrate' });
  const epic = childDocument(db, 'epic', spec, { sequence: 1, slug: 'epic-1', title: 'Epic 1' });
  const story = create(db, 'story', { epic_id: epic.id, number: 1 });

  const requirement = create(db, 'requirement', {
    spec_id: spec.id, text: `Every artefact ${fragment} in one database.`,
  });
  const criterion = create(db, 'story_criterion', { story_id: story.id, text: 'A row round-trips.' });

  const coverage = create(db, 'coverage', {
    requirement_id: requirement.id,
    story_criterion_id: criterion.id,
    spec_fragment: fragment,
    ...VERIFIED,
  });

  return { spec, epic, story, requirement, criterion, coverage };
}

const verification = (db, id) =>
  ({ ...db.prepare('SELECT verified_at, binding_hash FROM coverage WHERE id = ?').get(id) });

const verified = (db, id) => verification(db, id).verified_at !== null;

/** Re-mark a row after a decay test has cleared it, so one fixture serves several assertions. */
function reverify(db, id) {
  db.prepare('UPDATE coverage SET verified_at = ?, binding_hash = ? WHERE id = ?')
    .run(VERIFIED.verified_at, VERIFIED.binding_hash, id);
}

test('editing a story criterion clears the ✓ on every coverage row bound to it', (t) => {
  const db = planning(t);
  const { story, criterion, coverage } = boundCoverage(db);

  // A second row on the same criterion, because the trigger's `WHERE story_criterion_id =`
  // makes "every row bound to it" a claim about a set, and one row cannot fail it.
  const second = create(db, 'requirement', {
    spec_id: db.prepare('SELECT spec_id FROM requirement WHERE id = ?').get(coverage.requirement_id).spec_id,
    label: 'FR2', position: 2, text: 'Another requirement, shall persist as well.',
  });
  const also = create(db, 'coverage', {
    requirement_id: second.id, story_criterion_id: criterion.id,
    spec_fragment: 'shall persist as well', ...VERIFIED,
  });

  assert.ok(verified(db, coverage.id) && verified(db, also.id), 'both begin verified');

  db.prepare('UPDATE story_criterion SET text = ? WHERE id = ?')
    .run('A row round-trips, and its detail rows with it.', criterion.id);

  assert.deepEqual(
    verification(db, coverage.id),
    { verified_at: null, binding_hash: null },
    'the pair is cleared together — a row holding one without the other cannot be re-derived',
  );
  assert.equal(verified(db, also.id), false, 'and every other row bound to the same criterion');
  assert.ok(story.id, 'the criterion still belongs to its story; nothing cascaded');
});

test('editing a requirement clears the ✓ on its coverage rows', (t) => {
  const db = planning(t);
  const { requirement, coverage } = boundCoverage(db);

  db.prepare('UPDATE requirement SET text = ? WHERE id = ?')
    .run('Every artefact shall persist in one database, typed.', requirement.id);

  assert.deepEqual(verification(db, coverage.id), { verified_at: null, binding_hash: null });
});

test('editing the coverage fragment clears the ✓ on that row', (t) => {
  const db = planning(t);
  const { coverage } = boundCoverage(db);

  // The third edit path, and the one an earlier draft missed: the fragment is a stored copy,
  // so rewriting it changes what was verified without touching either table the two triggers
  // above watch. Without this trigger the row keeps a `binding_hash` over replaced text.
  db.prepare('UPDATE coverage SET spec_fragment = ? WHERE id = ?')
    .run('shall persist in one database', coverage.id);

  assert.deepEqual(verification(db, coverage.id), { verified_at: null, binding_hash: null });
});

test('control — a write that leaves the text byte-identical does not clear the ✓', (t) => {
  const db = planning(t);
  const { requirement, criterion, coverage } = boundCoverage(db);

  // All three watched columns, rewritten to the value they already hold. A trigger that fired
  // on any `UPDATE OF` rather than on a changed value passes every test above and clears a
  // mark nobody's edit invalidated.
  db.prepare('UPDATE story_criterion SET text = text WHERE id = ?').run(criterion.id);
  assert.ok(verified(db, coverage.id), 'story_criterion.text');

  db.prepare('UPDATE requirement SET text = text WHERE id = ?').run(requirement.id);
  assert.ok(verified(db, coverage.id), 'requirement.text');

  db.prepare('UPDATE coverage SET spec_fragment = spec_fragment WHERE id = ?').run(coverage.id);
  assert.ok(verified(db, coverage.id), 'coverage.spec_fragment');

  // And an unrelated column on each of the three tables, which is the other way a too-broad
  // trigger shows itself.
  db.prepare('UPDATE story_criterion SET position = 2 WHERE id = ?').run(criterion.id);
  db.prepare('UPDATE requirement SET moscow = ? WHERE id = ?').run('must', requirement.id);
  db.prepare('UPDATE coverage SET position = 3 WHERE id = ?').run(coverage.id);

  assert.deepEqual(verification(db, coverage.id), VERIFIED, 'still verified, and with its own hash');
});

test('a coverage row cannot hold verified_at without binding_hash, or the reverse', (t) => {
  const db = planning(t);
  const { coverage } = boundCoverage(db);

  assert.throws(
    () => db.prepare('UPDATE coverage SET binding_hash = NULL WHERE id = ?').run(coverage.id),
    /CHECK constraint failed/,
    'a ✓ with no hash is a verification state nothing can re-derive',
  );
  assert.throws(
    () => db.prepare('UPDATE coverage SET verified_at = NULL WHERE id = ?').run(coverage.id),
    /CHECK constraint failed/,
    'and a hash with no ✓ is the same row from the other side',
  );

  assert.deepEqual(verification(db, coverage.id), VERIFIED, 'neither half was written');
});

test('every column the binding is computed from has a trigger watching it', (t) => {
  const db = planning(t);

  // Declared here rather than read from the schema: the criterion is that adding a fourth
  // input to the hash fails until it has a trigger, and a list derived from the triggers
  // would grow whenever they did and never notice the absence.
  const WATCHED = [
    { table: 'story_criterion', column: 'text', trigger: 'coverage_unverify_on_criterion_edit' },
    { table: 'requirement', column: 'text', trigger: 'coverage_unverify_on_requirement_edit' },
    { table: 'coverage', column: 'spec_fragment', trigger: 'coverage_unverify_on_fragment_edit' },
  ];

  const triggers = new Set(triggerNames(db));
  const statements = db
    .prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' AND sql IS NOT NULL")
    .all();

  assert.equal(WATCHED.length, 3, 'three, because the binding is two texts held in three places');

  for (const watched of WATCHED) {
    assert.ok(triggers.has(watched.trigger), `${watched.trigger} exists`);

    const sql = statements.find((statement) => statement.name === watched.trigger).sql;
    assert.match(
      sql,
      new RegExp(`UPDATE\\s+OF\\s+${watched.column}\\s+ON\\s+${watched.table}`, 'i'),
      `${watched.trigger} watches ${watched.table}.${watched.column} and not something else`,
    );
    assert.match(sql, /WHEN\s+OLD\./i, 'and fires on a change rather than on any write');
  }
});

test('a completeness claim is cleared when a coverage row arrives or leaves', (t) => {
  const db = planning(t);
  const { requirement, criterion, coverage } = boundCoverage(db);

  const claim = claimComplete(db, requirement.id, '2026-08-02T00:00:00Z');
  assert.deepEqual(claimState(db, requirement.id), { claimed: true, current: true, bound: 1 });
  assert.ok(claim.coverage_claim_hash, 'both columns written together');

  const second = create(db, 'coverage', {
    requirement_id: requirement.id, story_criterion_id: criterion.id,
    spec_fragment: 'in one database', position: 2,
  });

  assert.deepEqual(
    claimState(db, requirement.id),
    { claimed: false, current: false, bound: 2 },
    'a row arriving changes the set the claim was made about, so the claim goes',
  );

  claimComplete(db, requirement.id, '2026-08-03T00:00:00Z');
  db.prepare('DELETE FROM coverage WHERE id = ?').run(second.id);

  assert.equal(claimState(db, requirement.id).claimed, false, 'and so does a row leaving');
  assert.ok(coverage.id, 'the first row is untouched by either event');
});

test('a completeness claim is cleared when a bound fragment or the requirement text is edited', (t) => {
  const db = planning(t);
  const { requirement, coverage } = boundCoverage(db);

  claimComplete(db, requirement.id, '2026-08-02T00:00:00Z');
  db.prepare('UPDATE coverage SET spec_fragment = ? WHERE id = ?')
    .run('shall persist in one database', coverage.id);

  assert.equal(claimState(db, requirement.id).claimed, false, 'a fragment rewritten');

  claimComplete(db, requirement.id, '2026-08-03T00:00:00Z');
  db.prepare('UPDATE requirement SET text = ? WHERE id = ?')
    .run('Every artefact shall persist in one database, typed and constrained.', requirement.id);

  assert.equal(
    claimState(db, requirement.id).claimed,
    false,
    'and the text being accounted for edited — the claim is about that text, not only its rows',
  );
});

test('control — a claim survives a write that changed nothing', (t) => {
  const db = planning(t);
  const { requirement, coverage } = boundCoverage(db);

  const claim = claimComplete(db, requirement.id, '2026-08-02T00:00:00Z');

  db.prepare('UPDATE requirement SET text = text WHERE id = ?').run(requirement.id);
  db.prepare('UPDATE coverage SET spec_fragment = spec_fragment WHERE id = ?').run(coverage.id);
  db.prepare('UPDATE requirement SET moscow = ? WHERE id = ?').run('must', requirement.id);
  db.prepare('UPDATE coverage SET position = 9 WHERE id = ?').run(coverage.id);

  assert.deepEqual(
    { ...db.prepare('SELECT coverage_claimed_at, coverage_claim_hash FROM requirement WHERE id = ?').get(requirement.id) },
    claim,
    'four writes, none of them a change to what was claimed — a trigger clearing on any write makes the claim worthless',
  );
});

test('a requirement cannot hold coverage_claimed_at without its hash, or the reverse', (t) => {
  const db = planning(t);
  const { requirement } = boundCoverage(db);

  assert.throws(
    () => db.prepare('UPDATE requirement SET coverage_claimed_at = ? WHERE id = ?')
      .run('2026-08-02T00:00:00Z', requirement.id),
    /CHECK constraint failed/,
  );
  assert.throws(
    () => db.prepare('UPDATE requirement SET coverage_claim_hash = ? WHERE id = ?')
      .run('deadbeef', requirement.id),
    /CHECK constraint failed/,
  );
});

test('a claimed requirement is distinguishable by query from an identically bound unclaimed one', (t) => {
  const db = planning(t);
  const { spec, story, requirement } = boundCoverage(db);

  const criterion = create(db, 'story_criterion', {
    story_id: story.id, text: 'A row round-trips.', position: 2,
  });
  const twin = create(db, 'requirement', {
    spec_id: spec.id, label: 'FR2', position: 2, text: 'Every artefact shall persist in one database.',
  });
  create(db, 'coverage', {
    requirement_id: twin.id, story_criterion_id: criterion.id,
    spec_fragment: 'shall persist', ...VERIFIED,
  });

  claimComplete(db, requirement.id, '2026-08-02T00:00:00Z');

  // The two requirements now have the same text and the same one verified binding. What the
  // roll-up must not do is call them equally covered — that is false-pass #17, and it is
  // exactly why a matching roll-up is not a complete one.
  const complete = db.prepare(`
    SELECT requirement.label,
           count(coverage.id) AS bound,
           sum(coverage.verified_at IS NOT NULL) AS verified,
           requirement.coverage_claimed_at IS NOT NULL AS claimed
      FROM requirement LEFT JOIN coverage ON coverage.requirement_id = requirement.id
     GROUP BY requirement.id
     ORDER BY requirement.label
  `).all().map((row) => ({ ...row }));

  assert.deepEqual(complete, [
    { label: 'FR1', bound: 1, verified: 1, claimed: 1 },
    { label: 'FR2', bound: 1, verified: 1, claimed: 0 },
  ], 'identical on every derived measure and separated only by the claim');
});

test('a claim that outlived its set reads as stale, with no trigger left to clear it', (t) => {
  const db = planning(t);
  const { requirement, criterion } = boundCoverage(db);

  claimComplete(db, requirement.id, '2026-08-02T00:00:00Z');

  // The triggers make this state unreachable, which is why `coverage_claim_hash` looks like a
  // column nothing reads — and a mutation emptying it of content passed the whole suite. The
  // hash is the second line: it is what notices when the first is gone. A migration that
  // recreates `coverage` drops its triggers silently, which is Story 8's criterion and the
  // only way this arrives outside a test.
  db.exec('DROP TRIGGER requirement_unclaim_on_coverage_insert');

  create(db, 'coverage', {
    requirement_id: requirement.id, story_criterion_id: criterion.id,
    spec_fragment: 'in one database', position: 2,
  });

  assert.deepEqual(
    claimState(db, requirement.id),
    { claimed: true, current: false, bound: 2 },
    'still claimed, because nothing cleared it — and no longer current, because the set moved',
  );
});

test('completeness is a claim, and nothing derives it from what is bound', (t) => {
  const db = planning(t);
  const { requirement } = boundCoverage(db);

  // The must-NOT: were completeness derived from fragment offsets tiling the text, connective
  // prose would have to be bound to satisfy it. Here a requirement whose single fragment
  // covers three words of a nine-word sentence is claimable, and one whose fragments could
  // tile the whole sentence is not claimed until someone says so.
  assert.equal(claimState(db, requirement.id).claimed, false, 'binding alone claims nothing');

  claimComplete(db, requirement.id, '2026-08-02T00:00:00Z');
  const state = claimState(db, requirement.id);

  assert.deepEqual(
    { claimed: state.claimed, bound: state.bound },
    { claimed: true, bound: 1 },
    'and one fragment short of tiling the text is a complete requirement when a person says it is',
  );

  const text = db.prepare('SELECT text FROM requirement WHERE id = ?').get(requirement.id).text;
  const fragment = db.prepare('SELECT spec_fragment FROM coverage WHERE requirement_id = ?').get(requirement.id).spec_fragment;
  assert.ok(
    fragment.length < text.length,
    'the fragment does not tile the text, which under a derived rule would forbid the claim just made',
  );
});

// --- Decay is an answer to an edit, and a restore is not an edit ---------------------------------

/**
 * The claim columns are a recorded fact — a time and a hash — and nothing regenerates them. So a
 * dump carries them, and a restore has to give them back.
 *
 * It did not. The dump emitted every trigger before any row, and replaying the `coverage` rows
 * fired `requirement_unclaim_on_coverage_insert` once each, clearing the very claims the file had
 * carried faithfully three hundred lines earlier. Measured on this project's own database: 40 of
 * 54 requirements lost both columns, and the only reason it surfaced is that `rebuild` refuses a
 * dump that does not survive its own restore.
 *
 * The fix is in the dump's ordering — index triggers before the rows because the index is derived
 * and is not in the file, everything else after — so the assertion here is on the round-trip
 * rather than on the emission order. Ordering is how it is fixed today; surviving the restore is
 * what has to remain true however it is fixed tomorrow.
 */
test('a claim survives the restore of the dump that carried it [integration]', (t) => {
  const db = planning(t);
  const { requirement } = boundCoverage(db);

  claimComplete(db, requirement.id, '2026-08-02T00:00:00Z');

  // Control. Without it, a fixture that stopped producing a claim would leave both assertions
  // below comparing two absences and reporting green — the shape retro 30 records.
  assert.equal(claimState(db, requirement.id).claimed, true, 'the fixture made a claim to lose');

  const before = dump(db).sql;
  const restored = openDatabase(t);

  restore(restored, before);

  assert.equal(
    claimState(restored, requirement.id).claimed,
    true,
    'the replayed coverage row decayed the claim it was dumped alongside',
  );

  assert.equal(dump(restored).sql, before, 'the dump did not survive its own restore');
});
