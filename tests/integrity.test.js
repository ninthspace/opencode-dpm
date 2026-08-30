/**
 * Story 6 — the invariants SQLite cannot hold, and the tool that reports them.
 *
 * Every test here is the same shape: a database the tool passes, one deliberate violation, and
 * the tool failing *on that entry* while naming rows. Both halves matter and the story's
 * must-NOT says why — "reports a violation it cannot locate, **or** passes a database holding
 * one". A check that reported everything would satisfy the second half and be worthless, so
 * every injection is preceded by the same database passing clean.
 *
 * The parity test holds its **own** enumeration of the thirteen, transcribed from the Data
 * Model rather than read from `REGISTER`. A test comparing the register against itself asserts
 * that a list equals itself; the point of the criterion is that a check and a documented
 * invariant can disagree, and this is what notices.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase as planning } from './support/planning-database.js';
import { checkIntegrity, orphans } from '../src/integrity/check.ts';
import { REGISTER } from '../src/integrity/register.ts';
import { create } from './fixtures/index.js';
import { corpus, forEntry, violation } from './support/violations.js';
import { ulid } from '../src/id/ulid.ts';

/**
 * The thirteen, by number, transcribed from the Data Model's register table.
 *
 * Kept as short phrases rather than the register's full sentences: what the parity criterion
 * is about is that thirteen numbered invariants exist and each has a check, and copying the
 * prose verbatim would make this fail on a reworded sentence, which is not a parity failure.
 */
const REGISTER_ENTRIES = new Map([
  [1, 'gates_work cycle'],
  [2, 'superseded ADR implies a supersedes edge'],
  [3, 'coverage requirement and criterion share a spec'],
  [4, 'coverage_story story is in the coverage row\'s epic'],
  [5, 'number_sequence.next_value exceeds every allocation'],
  [6, 'dependency ends are kinds that edge admits'],
  [7, 'review scope_story is inside the epic reviewed'],
  [8, 'accepted ADR has exactly one chosen option'],
  [9, 'spec_fragment is a substring of the requirement text'],
  [10, 'no row references an already-retired vocabulary row'],
  [11, 'session.superseded_by forms no cycle'],
  [12, 'document_milestone document and milestone share a spec'],
  [13, '{{ref:}} markers resolve to live documents'],
  [14, 'a binding retired while sound is a judgement, not a fault'],
]);

/** The entries that settle whether the database is broken — every one but the advisory ones. */
const BLOCKING = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);

/**
 * The corpus and the thirteen injections come from `support/violations.js`, because Epic 47-02
 * Story 2 needs the same violating states on the restore path. What stays here is every
 * per-entry assertion — the shared module builds the violation and makes no claim about it.
 */

/**
 * Assert that `inject` turns a clean database into one failing exactly `entry`, with rows.
 *
 * Bundling the three assertions is what keeps the thirteen readable, and each is load-bearing:
 * the clean pass first, so the injection is what changed; the entry, so a check that fires on
 * everything cannot stand in for the right one; and the rows, because a located violation is
 * the difference between a report and an alarm.
 */
function reportsOnly(t, entry, inject) {
  const db = planning(t);
  const context = corpus(db);

  assert.equal(
    checkIntegrity(db).ok,
    true,
    `entry ${entry}: the database passes before the violation is injected`,
  );

  const detail = inject(db, context);

  const report = checkIntegrity(db);
  const found = forEntry(report, entry);

  assert.equal(report.ok, false, `entry ${entry}: the tool does not pass a database holding it`);
  assert.ok(found, `entry ${entry}: reported under its own number, not merely reported`);
  assert.ok(found.rows.length > 0, `entry ${entry}: names the rows — a located violation, not an alarm`);
  assert.deepEqual(
    report.violations.map((violation) => violation.entry),
    [entry],
    `entry ${entry}: and nothing else fires, so the injection is what this check saw`,
  );

  return { db, report, rows: found.rows, detail };
}

/** Inject register entry `n`'s violation from the shared fixtures, and assert it is reported. */
const reportsEntry = (t, n) => reportsOnly(t, n, violation(n).inject);

test('the register and the checks name each other, in both directions', () => {
  assert.deepEqual(
    REGISTER.map((entry) => entry.entry),
    [...REGISTER_ENTRIES.keys()],
    'an entry with no check, or a check with no entry, is the same failure read from either end',
  );
  // Counted against the transcription rather than against a number written here. The map above
  // is the independent copy — the whole point of the criterion — so it is what the count is owed
  // to; a literal would be a third copy, and the one that goes stale silently.
  assert.equal(REGISTER.length, REGISTER_ENTRIES.size, 'the register and the transcription differ in length');

  const uncallable = REGISTER.filter((entry) => typeof entry.check !== 'function');
  assert.deepEqual(uncallable, [], 'an entry whose check is not callable is an entry with no check');

  // Numbers are the join key between a table in a document and a function in a file, so a gap
  // or a repeat breaks the parity claim even when the counts agree.
  assert.equal(new Set(REGISTER.map((entry) => entry.entry)).size, REGISTER_ENTRIES.size);

  // An entry is blocking unless it says otherwise, and which are which is a decision rather than
  // a detail: an entry that quietly became advisory would stop refusing dumps it should refuse,
  // and nothing else in the suite would notice.
  assert.deepEqual(
    REGISTER.filter((entry) => entry.advisory !== true).map((entry) => entry.entry),
    [...BLOCKING],
    'an entry changed class without the change being decided here',
  );
});

test('a freshly seeded database passes, and the pass is a real sweep', (t) => {
  const db = planning(t);
  corpus(db);

  const report = checkIntegrity(db);

  assert.equal(report.ok, true);
  assert.deepEqual(report.violations, []);
  assert.deepEqual(report.orphans, []);
  // A register that failed to load would report `ok` with nothing checked, which is the shape
  // NFR6 exists to refuse: a pass and a no-op are otherwise the same observation.
  assert.equal(report.checked, REGISTER.length + 1, 'thirteen checks and the orphan sweep');
});

test('entry 1 — a cycle among gates_work edges', (t) => {
  const { rows } = reportsEntry(t, 1);

  assert.equal(rows.length, 2, 'both ends of the cycle are named, since either is a place to break it');
});

test('entry 2 — a superseded ADR with no supersedes edge out of it', (t) => {
  reportsEntry(t, 2);
});

test('entry 3 — coverage joining one spec\'s requirement to another spec\'s criterion', (t) => {
  const { rows } = reportsEntry(t, 3);

  assert.notEqual(
    rows[0].requirement_spec,
    rows[0].criterion_spec,
    'the report names both specs — the entry that renders plausibly is the one worth locating',
  );
});

test('entry 4 — a coverage_story naming a story from another epic', (t) => {
  reportsEntry(t, 4);
});

test('entry 5 — a sequence that would reissue a number already allocated', (t) => {
  reportsEntry(t, 5);
});

test('entry 6 — a builds_on edge between two epics', (t) => {
  reportsEntry(t, 6);
});

test('entry 7 — a review scoped to a story in an epic it does not review', (t) => {
  reportsEntry(t, 7);
});

test('entry 8 — an accepted ADR with no chosen option', (t) => {
  const { rows } = reportsEntry(t, 8);

  assert.equal(rows[0].chosen, 0, 'the count is reported, since "not exactly one" is two failures');
});

test('entry 9 — a spec_fragment that appears nowhere in its requirement', (t) => {
  reportsEntry(t, 9);
});

test('entry 10 — a vocabulary reference no guard covers', (t) => {
  const { rows, detail } = reportsEntry(t, 10);

  assert.deepEqual(
    rows.map((row) => row.missing),
    [detail],
    'the guard is named, because "some reference is unguarded" is not something anyone can fix',
  );
});

test('entry 11 — a cycle in session.superseded_by', (t) => {
  reportsEntry(t, 11);
});

test('entry 12 — a document assigned to a milestone belonging to another spec', (t) => {
  reportsEntry(t, 12);
});

test('entry 13 — a {{ref:}} marker naming a document that is not there', (t) => {
  const { rows, detail: missing } = reportsEntry(t, 13);

  assert.deepEqual(
    { table: rows[0].table, column: rows[0].column, reference: rows[0].reference },
    { table: 'document_section', column: 'body', reference: missing },
    'the column is named as well as the row — a marker sweep that could not say where is unactionable',
  );
});

test('a marker in a column nobody would call prose is still swept', (t) => {
  const db = planning(t);
  const { epic } = corpus(db);
  const missing = ulid();

  // The sweep derives its columns from `PRAGMA table_info` rather than from a list of the
  // prose ones, so this is not a special case — it is the property that makes a column added
  // later impossible to forget. A declared list is what entry 13 exists to avoid needing.
  db.prepare('UPDATE document SET title = ? WHERE id = ?').run(`Epic {{ref:${missing}}}`, epic.id);

  const found = forEntry(checkIntegrity(db), 13);
  assert.deepEqual(
    { table: found.rows[0].table, column: found.rows[0].column },
    { table: 'document', column: 'title' },
  );
});

test('a resolvable marker is not a violation', (t) => {
  const db = planning(t);
  const { spec, epic } = corpus(db);

  create(db, 'document_section', {
    document_id: epic.id, heading: 'Context', position: 1,
    body: `Derived from {{ref:${spec.id}}}, and from {{ref:${epic.id}}} itself.`,
  });

  // The control. A sweep that reported every marker would satisfy the test above and be
  // useless, and the failure would look exactly like a corpus full of broken references.
  assert.equal(checkIntegrity(db).ok, true, 'two markers, both resolving, and nothing reported');
});

test('an orphaned row is reported, and located', (t) => {
  const db = planning(t);
  const { epic } = corpus(db);

  assert.deepEqual(orphans(db), [], 'nothing is orphaned while foreign keys are enforced');

  // The one path this state arrives by: a restore, which opens with `foreign_keys=OFF` because
  // no dump sorted by natural key is in topological order. Reproduced here rather than
  // described, since a check for a state no test can create is a check nothing exercises.
  db.exec('PRAGMA foreign_keys = OFF');
  db.prepare('DELETE FROM document WHERE id = ?').run(epic.id);
  db.exec('PRAGMA foreign_keys = ON');

  const report = checkIntegrity(db);
  const found = report.orphans.find((row) => row.table === 'story');

  assert.equal(report.ok, false, 'a database holding an orphan does not pass');
  assert.ok(found, 'the story left behind by the deleted epic is reported');
  assert.equal(
    found.columns,
    'epic_id, epic_kind',
    'named by column rather than by foreign-key index, and a composite key named whole',
  );
  assert.equal(found.parent, 'document', 'and by the table its reference failed to reach');
});
