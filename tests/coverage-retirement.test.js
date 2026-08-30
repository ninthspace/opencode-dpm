/**
 * Epic 04-01 Story 1 — the columns that make a binding retirable and a criterion supersedable.
 *
 * The schema half of spec 04 and nothing else: `coverage` gains the retirement pair and loses its
 * table-level `UNIQUE` to a partial index over live rows; `story_criterion` gains the supersession
 * pair and `warrant_adr_id`. **The tool arms that write any of it are stories 4 and 5 of this
 * epic** — what is asserted here is the shape, the derivation, and the note the migration leaves
 * behind.
 *
 * Three of the four criteria are read out of the live database rather than transcribed, and the
 * reason is the same one `prose-columns.js` gives: a transcription is a second description of the
 * schema, and the drift arrives silently. The fourth reads the migration file, because a statement
 * a migration makes to whoever runs it is not in any table.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openPlanningDatabase as planning, handlers } from './support/planning-database.js';
import { authoredTables, columnNames } from './support/introspection.js';
import { spineTools } from '../src/tools/index.ts';
import { create } from './fixtures/index.js';
import { boundCoverage as bound } from './fixtures/planning.js';

/**
 * The `CHECK` clauses one table declares, as normalised source text.
 *
 * Read from `sqlite_schema` and whitespace-collapsed, so a clause reformatted across two lines by
 * one migration and one line by another compares equal. Nothing here parses SQL: a `CHECK (` and
 * the text to its matching close is enough to compare two tables' pairing rules, and a parser would
 * be a second implementation of SQLite in the file asserting SQLite's behaviour.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} table
 * @returns {string[]}
 */
function checks(db, table) {
  const sql = db
    .prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?")
    .get(table).sql;

  return [...sql.matchAll(/CHECK\s*\(((?:[^()]|\([^()]*\))*)\)/gi)]
    .map((match) => match[1].replace(/\s+/g, ' ').trim());
}

/** The pairing clause over one `_at`/`_reason` pair, in the form every migration writes it. */
const paired = (column) => `(${column}_at IS NULL) = (${column}_reason IS NULL)`;

const RETIRED = "retired_at = '2026-08-27T00:00:00Z', retired_reason = 'bound to the wrong fragment'";
const SUPERSEDED =
  "superseded_at = '2026-08-27T00:00:00Z', superseded_reason = 'the requirement was amended'";


test('coverage pairs its retirement columns exactly as artifact and observation pair theirs', (t) => {
  const db = planning(t);

  // The precedents, read rather than quoted. If `artifact` and `observation` ever disagree with
  // each other this fails on them first, which is the right place for it to fail.
  const precedents = ['artifact', 'observation'].map((table) => checks(db, table)
    .filter((clause) => clause.includes('retired_at')));

  for (const clauses of precedents) {
    assert.deepEqual(clauses, [paired('retired')]);
  }

  assert.deepEqual(
    checks(db, 'coverage').filter((clause) => clause.includes('retired_at')),
    [paired('retired')],
    'coverage must carry the same paired CHECK, not a variant of it',
  );

  // `story_criterion`'s supersession pair is the same rule under the other word. `018` left
  // `document_section.superseded_at` unpaired because a reconciled body *is* the reason and is a
  // row; a criterion has no such row, so the pairing is what stops a supersession with no record.
  assert.deepEqual(
    checks(db, 'story_criterion').filter((clause) => clause.includes('superseded_at')),
    [paired('superseded')],
  );
});

test('the CHECK is enforced and not merely declared', (t) => {
  const db = planning(t);
  const { criterion, binding } = bound(db);
  const coverage = create(db, 'coverage', binding());

  // Half a retirement, in both directions. Asserted through SQL rather than a tool, because the
  // tool that writes these columns is story 4 and this criterion is about the column.
  const half = (sql, id) => assert.throws(() => db.prepare(sql).run(id), /CHECK/);

  half("UPDATE coverage SET retired_at = '2026-08-27T00:00:00Z' WHERE id = ?", coverage.id);
  half("UPDATE coverage SET retired_reason = 'the fragment was wrong' WHERE id = ?", coverage.id);
  half(
    "UPDATE story_criterion SET superseded_at = '2026-08-27T00:00:00Z' WHERE id = ?",
    criterion.id,
  );

  db.prepare(`UPDATE coverage SET ${RETIRED} WHERE id = ?`).run(coverage.id);

  assert.equal(
    db.prepare('SELECT retired_reason FROM coverage WHERE id = ?').get(coverage.id).retired_reason,
    'bound to the wrong fragment',
  );
});

test('the partial index frees the natural key for a replacement binding', (t) => {
  const db = planning(t);
  const { binding } = bound(db);
  const first = create(db, 'coverage', binding());

  // Live, the key still holds — the point of the rebuild was to narrow the constraint, not to drop
  // it, and a rebuild that dropped it would pass every retirement assertion above.
  assert.throws(() => create(db, 'coverage', binding()), /UNIQUE/);

  db.prepare(`UPDATE coverage SET ${RETIRED} WHERE id = ?`).run(first.id);

  const replacement = create(db, 'coverage', binding());

  assert.notEqual(replacement.id, first.id);
  assert.equal(db.prepare('SELECT count(*) AS n FROM coverage').get().n, 2);
});

test('the two include flags are derived from the column names, not declared', (t) => {
  const db = planning(t);
  const tools = spineTools(db);
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

  for (const [name, flag] of [
    ['list_coverage', 'include_retired'],
    ['list_story_criterion', 'include_superseded'],
  ]) {
    const properties = byName[name].inputSchema.properties;

    assert.ok(properties[flag], `${name} must offer ${flag}`);
    // The other word must not appear. `retired` and `superseded` are not interchangeable in this
    // schema, and a caller who asked for one and received the other would find out at the write.
    const other = flag === 'include_retired' ? 'include_superseded' : 'include_retired';
    assert.equal(properties[other], undefined, `${name} must not offer ${other}`);
  }

  // Neither flag is written as a string. `list.js` declares a column name and `includeFlag` builds
  // the argument from it — which is the criterion, and the check is that the string the caller
  // passes appears in neither file as code.
  //
  // **A quoted-literal test rather than a substring one, and the distinction is load-bearing.**
  // Both files name both flags in their commentary, and rightly: `query.js`'s docblock is where the
  // reason `retired` and `archived` are not interchangeable is written down. A sweep for the bare
  // word would have to be satisfied by deleting that paragraph, which is the opposite of what this
  // criterion is protecting.
  const source = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

  const literal = (flag) => new RegExp(`['"]${flag}['"]`);

  // The control on that sweep: a pattern matching nothing would pass it for the wrong reason.
  assert.ok(literal('include_retired').test("properties: { 'include_retired': {} }"));

  for (const path of ['../src/tools/list.ts', '../src/tools/query.ts']) {
    for (const flag of ['include_retired', 'include_superseded']) {
      assert.ok(
        !literal(flag).test(source(path)),
        `${path} must not spell ${flag} as a string literal — it is derived from the column name`,
      );
    }
  }
});

test('a retired binding leaves the live set and comes back when asked for', (t) => {
  const db = planning(t);
  const call = handlers(spineTools(db));

  const { story, criterion, requirement, binding } = bound(db);
  const coverage = create(db, 'coverage', binding());

  const live = () => call.list_coverage({ requirement_id: requirement.id }).items;
  const all = () => call.list_coverage({ requirement_id: requirement.id, include_retired: true }).items;

  assert.equal(live().length, 1);

  db.prepare(`UPDATE coverage SET ${RETIRED} WHERE id = ?`).run(coverage.id);

  assert.deepEqual(live(), [], 'a retired binding must not be offered as live');
  assert.equal(all().length, 1, 'and must still be readable by the reader auditing the withdrawal');

  // The same clause under the other word, on the other table.
  const criteria = () => call.list_story_criterion({ story_id: story.id }).items;

  db.prepare(`UPDATE story_criterion SET ${SUPERSEDED} WHERE id = ?`).run(criterion.id);

  assert.deepEqual(criteria(), []);
  assert.equal(
    call.list_story_criterion({ story_id: story.id, include_superseded: true }).items.length,
    1,
  );
});

/**
 * A column name that reads as retirement or supersession under any word but the schema's own.
 *
 * `archived` is deliberately absent: an archived document is not retired, and `query.js` says so
 * where it matters. `waived` is absent for the same reason — a waived retro is a decision about a
 * retro, not a withdrawn row.
 */
const RETIREMENT_SHAPED =
  /retire|supersed|withdraw|revoke|obsolete|deprecat|cancel|void|expire|invalidat|removed|deleted|disabled|inactive/i;

/** The spellings this schema has decided on. Anything else matching the pattern is a third one. */
const SPELLINGS = new Set([
  'retired_at', 'retired_reason', 'superseded_at', 'superseded_reason',
  // `session.superseded_by` is the pointer at the session that replaced this one, and it predates
  // this change. It is the same word rather than a third spelling of it.
  'superseded_by',
]);

/** Every retirement-shaped column in the live schema, as `table.column`. */
function retirementShaped(db) {
  return authoredTables(db)
    .flatMap((table) => columnNames(db, table).map((column) => `${table}.${column}`))
    .filter((key) => RETIREMENT_SHAPED.test(key.split('.')[1]))
    .sort();
}

test('no column introduces a third spelling of retirement or of supersession', (t) => {
  const db = planning(t);

  const wrong = retirementShaped(db).filter((key) => !SPELLINGS.has(key.split('.')[1]));

  assert.deepEqual(wrong, [], 'every retirement-shaped column must use a spelling the schema owns');

  // Both of this change's own columns are in the swept set, so the sweep is looking at them rather
  // than passing because it looked at nothing.
  const swept = retirementShaped(db);

  assert.ok(swept.includes('coverage.retired_at'));
  assert.ok(swept.includes('coverage.retired_reason'));
  assert.ok(swept.includes('story_criterion.superseded_at'));
  assert.ok(swept.includes('story_criterion.superseded_reason'));
});

test('the sweep flags a third spelling when one is planted', (t) => {
  const db = planning(t);

  // The control. Without it, a sweep whose pattern matched nothing would pass the assertion above
  // in exactly the same way as one that matched every column and found them all correct — which is
  // false-pass register territory and is why a must-NOT needs something that would have caught it.
  db.exec('ALTER TABLE coverage ADD COLUMN withdrawn_at TEXT');

  const wrong = retirementShaped(db).filter((key) => !SPELLINGS.has(key.split('.')[1]));

  assert.deepEqual(wrong, ['coverage.withdrawn_at']);
});

test('migration 025 states what the claim hash excludes and what it leaves standing', (t) => {
  const source = readFileSync(
    fileURLToPath(new URL('../src/schema/025-coverage-retirement.sql', import.meta.url)),
    'utf8',
  );

  // The prose the file has to carry, not the wording of it. Each of these is a phrase the note
  // cannot make its point without: the exclusion, and the reason no stored claim moves today.
  const note = source.replace(/\s+/g, ' ');

  assert.match(note, /claim hash/i, 'the file must say what the claim hash now excludes');
  assert.match(note, /claimHash/, 'and name the function, so a reader can go and read it');
  assert.match(note, /No existing claim is invalidated by this migration/i);
  assert.match(note, /retires nothing/i, 'with the reason: no row is retired at migration time');

  // The claim about existing claims has to be true of the migration and not only stated by it, so
  // the assertion pairs the sentence with the behaviour: nothing arrives retired.
  const db = planning(t);

  assert.equal(
    db.prepare('SELECT count(*) AS n FROM coverage WHERE retired_at IS NOT NULL').get().n,
    0,
  );
});
