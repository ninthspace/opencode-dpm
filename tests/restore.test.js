/**
 * Story 2 — restoring a dump, and refusing one that does not hold together.
 *
 * The restore path is the only place in dpm where a database can reach a state FR2 rules out
 * everywhere else: enforcement has to come off, because a dump ordered by natural key is not in
 * topological order. So the interesting tests here are the ones that prove the *checks* run
 * rather than the ones that prove a good dump restores — a restorer that skipped every check
 * would pass the happy path and every round-trip assertion in the suite.
 *
 * The violating states come from `support/violations.js`, shared with the live-database suite in
 * `integrity.test.js`. What differs is the claim: there, that the tool reports each entry; here,
 * that a *dump carrying* it is refused and rolled back.
 *
 * **An advisory entry is the exception, and it is asserted rather than skipped.** Its state is a
 * decision somebody recorded, so a dump holding it restores — and the test below says so, with
 * the entry still reported in the returned report. Skipping it would leave the flag's only
 * consequence untested, which is the one thing a refusal loop cannot show by passing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openPlanningDatabase } from './support/planning-database.js';
import { foreignKeysEnabled } from './support/database.js';
import { corpus, VIOLATIONS } from './support/violations.js';
import { dump } from '../src/dump/index.ts';
import { restore, RestoreFailed } from '../src/restore/index.ts';
import { checkIntegrity } from '../src/integrity/check.ts';
import { REGISTER } from '../src/integrity/register.ts';
import { create } from './fixtures/index.js';
import { rootDocument, childDocument } from './fixtures/planning.js';

/** An empty, enforcing database — what a restore target actually is. */
function target(t) {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  t.after(() => db.close());

  return db;
}

/**
 * Run `attempt`, require it to be refused, and hand back the error.
 *
 * `assert.throws` returns nothing, so the report a refusal carries — which is the whole of
 * "naming the rows" — is unreachable through it. The `assert.fail` is what stops this becoming
 * a test that passes when nothing was thrown.
 */
function refused(attempt) {
  try {
    attempt();
  } catch (error) {
    assert.ok(error instanceof RestoreFailed, `refused with ${error.name}: ${error.message}`);

    return error;
  }

  assert.fail('the restore was accepted');
}

/** A dump of a clean planning corpus, plus the source it came from. */
function cleanDump(t) {
  const source = openPlanningDatabase(t);
  const context = corpus(source);

  return { source, context, sql: dump(source).sql };
}

// --- The mechanism: a transaction, and enforcement that is off for exactly its duration --------

test('a clean dump restores, and the result is the database it came from', (t) => {
  const { sql } = cleanDump(t);
  const db = target(t);

  const report = restore(db, sql);

  assert.equal(report.ok, true);
  assert.equal(report.checked, REGISTER.length + 1, 'every register entry ran, plus the orphan sweep');
  assert.equal(dump(db).sql, sql, 'and the restored database dumps to the same bytes');
});

test('enforcement is off during the restore and on again after it', (t) => {
  const { sql } = cleanDump(t);
  const db = target(t);

  assert.equal(foreignKeysEnabled(db), true, 'the target enforces before the restore');
  restore(db, sql);
  assert.equal(foreignKeysEnabled(db), true, 'and enforces again after it');

  // Asserted on the same connection the restore ran on, because `PRAGMA foreign_keys` is
  // per-connection: a check made anywhere else would be about a different database handle and
  // would pass whatever this one did.
  assert.equal(
    db.prepare('PRAGMA foreign_keys').get().foreign_keys,
    1,
    'the pragma is read back rather than assumed',
  );
});

test('a forward reference restores, which is the whole reason enforcement comes off', (t) => {
  const source = openPlanningDatabase(t);

  // The ids are chosen so the child sorts *before* its parent, which is what puts the
  // reference forward in a dump ordered by primary key. Left to generated ULIDs it never
  // happens in a fixture — a spec is created before its epic, so its id is always lower and
  // the parent is always emitted first. This test passed against a restorer that set the
  // pragma inside its transaction (where SQLite ignores it) until the ids were made explicit.
  const spec = rootDocument(source, 'spec', { id: 'z-spec', number: 47, slug: 'substrate' });
  const epic = childDocument(source, 'epic', spec, { id: 'a-epic', sequence: 1, slug: 'epic-1' });

  const sql = dump(source).sql;
  const rows = sql.split('\n').filter((line) => line.startsWith('INSERT INTO "document" '));

  // Anchored to the first value, which is the id. A bare `includes` matches the *parent's* id
  // in the child's own row — both rows contain `'z-spec'` — so it reports the same line twice.
  const emitted = rows.map((line) => line.match(/VALUES \('([^']+)'/)[1]);

  assert.deepEqual(
    emitted,
    ['a-epic', 'z-spec'],
    'the child really is emitted before the parent it references',
  );

  const db = target(t);
  restore(db, sql);

  assert.equal(db.prepare('SELECT parent_id FROM document WHERE id = ?').get(epic.id).parent_id, spec.id);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('the restore refuses to run inside a caller-opened transaction rather than failing later', (t) => {
  const { sql } = cleanDump(t);
  const db = target(t);

  db.exec('BEGIN');

  // The failure this prevents is a `FOREIGN KEY constraint failed` three hundred statements
  // into the file, because the pragma is a silent no-op inside a transaction.
  assert.throws(() => restore(db, sql), /must not run inside a transaction/);

  db.exec('ROLLBACK');
});

// --- Criterion 1: a dangling reference is reported, naming the row -----------------------------

test('a dump carrying a dangling reference is refused, naming the row and the column', (t) => {
  const { sql } = cleanDump(t);
  const db = target(t);

  // The dump is edited as text, which is what a merge conflict resolved badly actually
  // produces — the failure mode AD4 accepts in exchange for a diffable format.
  const broken = sql.replace(
    /INSERT INTO "document" \("id", "kind", "numbering", "number", "sequence", "slug", "title", "parent_id"/,
    (match) => match,
  );
  const dangling = sql.replace(
    /(INSERT INTO "document_kind_parent" \("kind", "parent_kind"\) VALUES \('[^']+', ')[^']+('\);)/,
    '$1no-such-kind$2',
  );

  assert.notEqual(dangling, sql, 'the mutation applied — otherwise this asserts nothing');
  assert.equal(broken, sql);

  const error = refused(() => restore(db, dangling));

  assert.equal(error.report.orphans.length, 1);
  assert.deepEqual(
    {
      table: error.report.orphans[0].table,
      columns: error.report.orphans[0].columns,
      parent: error.report.orphans[0].parent,
    },
    { table: 'document_kind_parent', columns: 'parent_kind', parent: 'document_kind' },
    'the row is located, not merely counted',
  );
  assert.match(error.message, /which is not there/);
});

test('a refused restore leaves the target untouched', (t) => {
  const { sql } = cleanDump(t);
  const db = target(t);

  const dangling = sql.replace(
    /(INSERT INTO "document_kind_parent" \("kind", "parent_kind"\) VALUES \('[^']+', ')[^']+('\);)/,
    '$1no-such-kind$2',
  );

  assert.throws(() => restore(db, dangling), RestoreFailed);

  // The checks run before the commit. A restore that reported the problem after committing it
  // would have told the user their database is broken and left it that way.
  assert.equal(
    db.prepare("SELECT count(*) AS n FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").get().n,
    0,
    'not one object survived the rollback',
  );
  assert.equal(foreignKeysEnabled(db), true, 'and enforcement is back on despite the failure');
});

// --- Criterion 2: each register entry in turn --------------------------------------------------

for (const { entry, summary } of VIOLATIONS.filter((violation) => !violation.advisory)) {
  test(`entry ${entry} — ${summary} — is refused on restore, naming the rows`, (t) => {
    const source = openPlanningDatabase(t);
    const context = corpus(source);

    // The clean dump first, so the violation is what changed. Without it a restorer that
    // rejected everything would pass all thirteen of these.
    assert.equal(checkIntegrity(source).ok, true, 'the source is clean before the injection');
    assert.equal(restore(target(t), dump(source).sql).ok, true, 'and its dump restores');

    VIOLATIONS.find((candidate) => candidate.entry === entry).inject(source, context);

    const error = refused(() => restore(target(t), dump(source).sql));
    const found = error.report.violations.find((violation) => violation.entry === entry);

    assert.ok(found, `reported under entry ${entry}, not merely reported`);
    assert.ok(found.rows.length > 0, 'and the rows are named');
    assert.deepEqual(
      error.report.violations.map((violation) => violation.entry),
      [entry],
      'one entry at a time — nothing else fires, so the injection is what this saw',
    );
    assert.match(error.message, new RegExp(`register entry ${entry}\\b`));
  });
}

for (const { entry, summary } of VIOLATIONS.filter((violation) => violation.advisory)) {
  test(`entry ${entry} — ${summary} — restores, and is reported rather than refused`, (t) => {
    const source = openPlanningDatabase(t);
    const context = corpus(source);

    assert.equal(checkIntegrity(source).ok, true, 'the source is clean before the injection');

    VIOLATIONS.find((candidate) => candidate.entry === entry).inject(source, context);

    // The whole of the flag's consequence: the same dump, through the same restorer, arriving
    // rather than being rolled back. A blocking entry in this position throws, which is what the
    // loop above asserts thirteen times over.
    const report = restore(target(t), dump(source).sql);
    const found = report.violations.find((violation) => violation.entry === entry);

    assert.equal(report.ok, true, 'an advisory finding does not make the restored database broken');
    assert.ok(found, `and entry ${entry} is still reported, under its own number`);
    assert.equal(found.advisory, true, 'carrying the flag that says why it did not refuse');
    assert.ok(found.rows.length > 0, 'and the rows are named, exactly as a refusal would name them');
  });
}

test('every register entry has a restore-path fixture, in both directions', () => {
  assert.deepEqual(
    VIOLATIONS.map((violation) => violation.entry),
    REGISTER.map((entry) => entry.entry),
    'an entry with no fixture, or a fixture with no entry, is the same gap read from either end',
  );
});

// --- The must-NOT the checks exist for ---------------------------------------------------------

test('a restore does not report success on a database it never checked', (t) => {
  const { sql } = cleanDump(t);
  const db = target(t);

  const report = restore(db, sql);

  // `checked` is the count, and it is what separates a clean report from one that ran nothing:
  // a register that failed to load would report 1 rather than 0 and read as a pass.
  assert.equal(report.checked, REGISTER.length + 1);
  assert.ok(REGISTER.length > 0, 'and the register is not empty, which is what makes the count mean anything');
});

test('the derived index is rebuilt by the data, with no reindex step in the restore', (t) => {
  const source = openPlanningDatabase(t);

  source.exec(`
    CREATE VIRTUAL TABLE probe_fts USING fts5(heading, body, section_id UNINDEXED);

    CREATE TRIGGER probe_fts_insert AFTER INSERT ON document_section BEGIN
      INSERT INTO probe_fts (heading, body, section_id)
        VALUES (new.heading, new.body, new.id);
    END;
  `);

  const { epic } = corpus(source);
  create(source, 'document_section', {
    document_id: epic.id,
    heading: 'Restore',
    body: 'The triggers rebuild the index as the rows arrive.',
    position: 1,
  });

  const db = target(t);
  restore(db, dump(source).sql);

  assert.equal(
    db.prepare("SELECT count(*) AS n FROM probe_fts WHERE probe_fts MATCH 'rebuild'").get().n,
    1,
    'the index answers a query it was never given rows for directly',
  );
});
