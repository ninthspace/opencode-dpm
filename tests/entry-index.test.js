/**
 * Story 4 — the child-row index, and the triple that has to be complete on every table.
 *
 * `document_fts` had one indexed table, so "are the triggers right" was a question about one
 * answer. `entry_fts` has five, and the failure mode changes shape with the number: a table with
 * an insert trigger and no delete trigger indexes correctly on the day it is written and drifts
 * from the first deletion, while every search keeps answering. Nothing about the *search* looks
 * wrong; the index simply holds rows the table does not.
 *
 * **So the first criterion is structural and the second is behavioural, and neither substitutes
 * for the other.** The structural one enumerates the indexed tables out of `sqlite_schema` — from
 * the triggers that reference `entry_fts`, not from a list here — and asserts three of the right
 * kind on each. It catches the sixth table someone indexes with two triggers, which no
 * behavioural sweep written today can see. The behavioural one drives update and delete on every
 * one of the five and compares `MATCH` against a `LIKE` scan, which is what catches a trigger
 * that exists and is wrong.
 *
 * **The tag column is what makes one index serve five tables.** `entity` is indexed, so FTS5's
 * own column syntax does the scoping: `entity:requirement AND helpers` narrows to requirements,
 * and a query with no `entity:` term spans everything.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import { proseColumns } from './support/prose-columns.js';

function surface(t) {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  return { db, call: handlers(tools) };
}

/**
 * The tables `entry_fts` indexes, read out of the triggers that maintain it.
 *
 * `tbl_name` is the table a trigger fires on, and the `sql LIKE` finds the triggers that touch
 * the index — so a table indexed by a trigger named anything at all is still found, and a table
 * that acquires an index without acquiring all three triggers is *still enumerated here* and then
 * fails the count. Enumerating from a list in this file would have the opposite property: the
 * table nobody remembered to add would be the table nobody remembered to check.
 */
function indexedTables(db) {
  const triggers = db
    .prepare(`SELECT name, tbl_name, sql FROM sqlite_schema
               WHERE type = 'trigger' AND sql LIKE '%entry_fts%' ORDER BY name`)
    .all();

  const byTable = new Map();

  for (const trigger of triggers) {
    if (!byTable.has(trigger.tbl_name)) byTable.set(trigger.tbl_name, []);
    byTable.get(trigger.tbl_name).push(trigger);
  }

  return byTable;
}

/** Which event a trigger fires on, taken from its own SQL. */
const eventOf = (sql) => sql.match(/AFTER\s+(INSERT|UPDATE|DELETE)/i)[1].toUpperCase();

/** The entity/id pairs the index returns for `term`. */
const matched = (db, term) => db
  .prepare('SELECT entity, entity_id FROM entry_fts WHERE entry_fts MATCH ? '
    + 'ORDER BY entity, entity_id')
  .all(term)
  .map((row) => `${row.entity}:${row.entity_id}`);

/**
 * The same set, found without the index.
 *
 * **Written by hand and not derived from the triggers**, which is the point: the expression per
 * table is the trigger's own, so a scan read out of the trigger would agree with an index that had
 * stopped tracking a column. `observation` concatenates two columns, and a scan of `text` alone
 * would pass against an index that had dropped `synthesis`.
 *
 * The fourth field is the row's id column, which is not `id` everywhere — `adr` is keyed by
 * `document_id` and `agent` by `name`, and both are what `read_<entity>` takes.
 *
 * `SCANS_COVER_THE_INDEX` below asserts this list names exactly the tables `entry_fts` indexes, so
 * a table added by a later migration fails here rather than going unswept.
 */
const SCANS = [
  ['acceptance_criterion', 'acceptance_criterion', 'text', 'id'],
  ['adr', 'adr', 'decision', 'document_id'],
  ['adr_option', 'adr_option', "coalesce(rationale, '')", 'id'],
  ['agent', 'agent', "personality || ' ' || communication_style", 'name'],
  ['artifact', 'artifact', "coalesce(description, '') || ' ' || coalesce(retired_reason, '')", 'id'],
  ['audit_finding', 'audit_finding', "summary || ' ' || coalesce(recommendation, '')", 'id'],
  // The trigger indexes only the rows whose reason is set, where every other entity here indexes
  // all of them. The scan needs no such condition and must not have one: a row with no reason
  // coalesces to the empty string, which no term matches, so the two agree by the terms rather than
  // by both being written the same way.
  ['coverage', 'coverage', "coalesce(retired_reason, '')", 'id'],
  ['finding', 'finding', 'summary', 'id'],
  ['milestone', 'milestone', "coalesce(summary, '')", 'id'],
  ['observation', 'observation', "text || ' ' || coalesce(synthesis, '')", 'id'],
  ['quick_criterion', 'quick_criterion', 'text', 'id'],
  ['requirement', 'requirement', 'text', 'id'],
  ['retro_application', 'retro_application', 'note', 'id'],
  ['story', 'story', "coalesce(status_note, '')", 'id'],
  ['story_criterion', 'story_criterion', 'text', 'id'],
  ['task', 'task', "coalesce(description, '') || ' ' || coalesce(status_note, '')", 'id'],
];

const scanned = (db, term) => SCANS
  .flatMap(([entity, table, expression, key]) => db
    .prepare(`SELECT ${key} AS id FROM ${table} WHERE lower(${expression}) LIKE '%' || ? || '%'`)
    .all(term)
    .map((row) => `${entity}:${row.id}`))
  .sort();

/** Every term the sweep below writes, so each comparison covers what the others left behind. */
const TERMS = [
  'quartzite', 'hornbeam', 'sarsaparilla', 'wolframite', 'cinnabar', 'malachite', 'siltstone',
  'chalcedony', 'peridot', 'tanzanite', 'kunzite', 'aventurine', 'rhodonite', 'serpentine',
  'labradorite', 'sodalite', 'carnelian', 'moonstone', 'amazonite', 'jadeite', 'obsidian',

  // The three rows whose *second* prose column is NULL, each carrying its term in the column that
  // is set. Without `coalesce` the concatenation is NULL, the whole row is indexed as the empty
  // string, and every search for its text returns nothing while reporting success.
  'hematite', 'azurite', 'spinel',
];

function agree(db, where) {
  for (const term of TERMS) {
    assert.deepEqual(matched(db, term), scanned(db, term),
      `${where}: the index and the tables disagree about '${term}'`);
  }
}

/** One row of every indexed type, each carrying a term of its own. */
function corpus(call) {
  const spec = call.create_spec({ slug: 'search', title: 'Search' });
  const epic = call.create_epic({ parent_id: spec.id, slug: 'index', title: 'Index' });
  const story = call.create_story({
    epic_id: epic.id, number: 4, title: 'Index child rows', position: 0,
  });

  const requirement = call.create_requirement({
    spec_id: spec.id, label: 'FR9', class: 'functional', position: 0,
    text: 'Hand-written text on child rows is indexed, quartzite included.',
  });

  const acceptance_criterion = call.create_acceptance_criterion({
    requirement_id: requirement.id, position: 0,
    text: 'A term held only on a child row is found, hornbeam for instance.',
  });

  const story_criterion = call.create_story_criterion({
    story_id: story.id, position: 0,
    text: 'Every indexed table has three triggers, sarsaparilla notwithstanding.',
  });

  const retro = call.create_retro({ parent_id: epic.id, slug: 'index', title: 'Index retro' });
  const observation = call.create_observation({
    retro_id: retro.id, position: 0,
    text: 'The triple is the unit, wolframite.',
    synthesis: 'Enumerate the tables from the schema, malachite.',
  });

  // An observation written against a story and not yet gathered into a retro, so `synthesis` is
  // NULL. It is in the corpus rather than in a test of its own because every `agree` sweep then
  // covers it: `a || NULL` is NULL in SQLite, so a concatenation without `coalesce` indexes the
  // *empty string* for this row — the whole observation unfindable, no error, and a search that
  // reports success. That is NFR6's false pass, and it survived four tests before this row existed.
  const ungathered = call.create_observation({
    story_id: story.id, position: 1,
    text: 'Written against the story and not yet gathered, siltstone.',
  });

  const review = call.create_review({
    parent_id: spec.id, slug: 'index', title: 'Review of the index',
  });
  const finding = call.create_finding({
    review_id: review.id, position: 0,
    category_id: 'finding:testability-concerns', severity_id: 'severity:warning',
    summary: 'A missing delete trigger is invisible to search, cinnabar.',
  });

  // --- the ten tables `022-prose-index.sql` added ----------------------------------------------
  //
  // One row each, carrying a term of its own. Where a table has two prose columns both are
  // written, and where the second is nullable a row is written without it — that is the case
  // `coalesce` exists for, and the one that indexes the empty string and reports success without.

  const adr = call.create_adr({
    parent_id: spec.id, slug: 'index', title: 'How the index is maintained',
    decision: 'Triggers rather than a reindex step, chalcedony.',
  });

  const adr_option = call.create_adr_option({
    adr_id: adr.id, name: 'Rebuild on demand', position: 0,
    rationale: 'Cheaper to write and impossible to forget to run, peridot.',
  });

  // A second option with no rationale at all — the nullable column, left null.
  const bare_option = call.create_adr_option({
    adr_id: adr.id, name: 'Do nothing', position: 1,
  });

  const agent = call.create_agent({
    name: 'lapidary', display_name: 'Lapidary', icon: '💎', role: 'Index keeper', position: 20,
    personality: 'Sceptical about anything that reports success, tanzanite.',
    communication_style: 'Short sentences and a worked example, kunzite.',
  });

  const artifact = call.create_artifact({
    url: 'https://example.invalid/index', title: 'The index', published_at: '2026-08-11T00:00:00Z',
    description: 'A page about what search reaches, aventurine.',
    retired_at: '2026-08-11T00:00:00Z',
    retired_reason: 'Superseded by the derived version, rhodonite.',
  });

  // A live artifact: `retired_reason` is NULL, which is the ordinary case. Its term sits in the
  // column that *is* set, so a concatenation missing `coalesce` on the other one loses it.
  const live_artifact = call.create_artifact({
    url: 'https://example.invalid/live', title: 'Live', published_at: '2026-08-11T00:00:00Z',
    description: 'Still published, and still findable, hematite.',
  });

  const audit = call.create_audit({ slug: 'index', title: 'Audit of the index' });
  const audit_finding = call.create_audit_finding({
    audit_id: audit.id, position: 0, dimension_id: 'audit_dimension:test-debt',
    file: 'dpm/src/schema/013-entry-search.sql', severity_id: 'severity:warning',
    summary: 'Six columns were listed as excluded and never revisited, serpentine.',
    recommendation: 'Derive the set and reconcile it, labradorite.',
  });

  // A finding with no recommendation — the same nullable-second-column case one table over.
  const bare_finding = call.create_audit_finding({
    audit_id: audit.id, position: 1, dimension_id: 'audit_dimension:documentation-drift',
    file: 'dpm/src/schema/022-prose-index.sql', severity_id: 'severity:suggestion',
    summary: 'Nothing to recommend yet, azurite.',
  });

  const milestone = call.create_milestone({
    spec_id: spec.id, label: 'M1', title: 'Substrate', position: 0,
    summary: 'The schema and the tools that write it, sodalite.',
  });

  const quick = call.create_quick({ slug: 'index', title: 'A quick change to the index' });
  const quick_criterion = call.create_quick_criterion({
    quick_id: quick.id, position: 0,
    text: 'The criterion nobody indexed, carnelian.',
  });

  const retro_application = call.create_retro_application({
    retro_id: retro.id, applied_to_id: epic.id, theme: 'Testing gaps',
    disposition: 'applied', note: 'Planted the input rather than settling for a comment, moonstone.',
  });

  // `status_note` is set through the update tool, which is also what exercises the update trigger.
  call.update_story({ id: story.id, status_note: 'Waiting on the migration, amazonite.' });

  const task = call.create_task({
    story_id: story.id, number: 1, title: 'Write the migration', position: 0,
    description: 'Three triggers per table, jadeite.',
    status_note: 'Blocked on the classification, obsidian.',
  });

  // A task with `status_note` unset — the second half of the concatenation, and the term is in
  // the first half so the row is findable unless `coalesce` is missing.
  const bare_task = call.create_task({
    story_id: story.id, number: 2, title: 'Backfill', position: 1,
    description: 'Index the rows written before the migration, spinel.',
  });

  // A withdrawn binding, and a live one beside it. `coverage`'s insert trigger is the only
  // conditional one in the index — a coverage row holds no prose until it is retired, so indexing
  // every row would fill `entry_fts` with empty strings for the whole matrix. The pair is what makes
  // the condition observable: `retired` is findable and `live` is absent, and a trigger that dropped
  // the `WHEN` would put both in.
  const live_coverage = call.create_coverage({
    requirement_id: requirement.id, story_criterion_id: story_criterion.id, position: 0,
    spec_fragment: 'Hand-written text on child rows is indexed',
  });

  const coverage = call.create_coverage({
    requirement_id: requirement.id, story_criterion_id: story_criterion.id, position: 1,
    spec_fragment: 'Hand-written text on child rows',
  });

  call.retire_coverage({
    id: coverage.id,
    reason: 'The fragment stopped short of the obligation, chalcedony.',
  });

  return {
    spec, epic, story, requirement, acceptance_criterion, story_criterion, retro, observation,
    ungathered, review, finding, coverage, live_coverage,
    adr, adr_option, bare_option, agent, artifact, live_artifact, audit, audit_finding,
    bare_finding, milestone, quick, quick_criterion, retro_application, task, bare_task,
  };
}

// --- Criterion 1: three triggers per indexed table, enumerated from the schema ------------------

test('every table entry_fts indexes has all three triggers, and none has fewer', (t) => {
  const { db } = surface(t);
  const byTable = indexedTables(db);

  // The control, and it used to be a written list of five. A list is what goes stale — FR9's rule
  // was applied to five tables in 013 and to fifteen in 022 — so the set is now reconciled against
  // the classification that decides it, with a floor beneath. An enumeration that found nothing
  // would satisfy every "for each" below, which is the shape this takes if the `sql LIKE` stops
  // matching.
  const classified = new Set(proseColumns()
    .map((key) => key.split('.')[0])
    .filter((table) => table !== 'document_section')); // that one is `document_fts`'s

  assert.ok(byTable.size >= 15, `only ${byTable.size} tables are indexed — the enumeration is wrong`);
  assert.deepEqual([...byTable.keys()].sort(), [...classified].sort(),
    'the tables entry_fts indexes are not the tables the classification says hold prose');

  for (const [table, triggers] of byTable) {
    assert.deepEqual(triggers.map((trigger) => eventOf(trigger.sql)).sort(),
      ['DELETE', 'INSERT', 'UPDATE'],
      `${table} is indexed by ${triggers.length} trigger(s), not by the full triple`);
  }
});

test('the LIKE scans cover exactly the tables the index does', (t) => {
  const { db } = surface(t);

  // `agree()` is only as good as `SCANS`: a table missing from it is a table whose index nothing
  // compares against, and every sweep still passes. So the list is reconciled with the schema
  // rather than trusted, and a floor guards the case where both read nothing.
  assert.ok(SCANS.length >= 15, `only ${SCANS.length} scans — the list read nothing`);
  assert.deepEqual(SCANS.map(([entity]) => entity).sort(), [...indexedTables(db).keys()].sort(),
    'SCANS and the index disagree about which tables are indexed');
});

test('every update trigger is scoped to the columns it indexes, and names all of them', (t) => {
  const { db } = surface(t);

  for (const [table, triggers] of indexedTables(db)) {
    const update = triggers.find((trigger) => eventOf(trigger.sql) === 'UPDATE');

    // `UPDATE OF` and not a bare `AFTER UPDATE`: an edit to a position or a status has no business
    // rewriting an index entry, and `updateByKey` writes only the columns a caller supplied.
    assert.match(update.sql, /AFTER\s+UPDATE\s+OF\s/i,
      `${update.name} fires on any update, so unindexed edits churn the index`);

    // And the columns it names are exactly the ones the insert trigger reads. Written this way
    // rather than against a list here, so a table that gains a prose column and indexes it in
    // `INSERT` while forgetting `UPDATE OF` is named — the drift that leaves an edit unindexed.
    const insert = triggers.find((trigger) => eventOf(trigger.sql) === 'INSERT');
    const read = new Set([...insert.sql.matchAll(/NEW\.(\w+)/g)].map((m) => m[1]));

    // The insert trigger also reads the row's key, to write `entity_id`. That column is not
    // indexed and must not be watched. It was `id` on all five tables in 013 and is `document_id`
    // on `adr` and `name` on `agent` since 022, so it comes from the schema rather than a literal.
    for (const column of db.prepare(`PRAGMA table_info(${table})`).all().filter((c) => c.pk > 0)) {
      read.delete(column.name);
    }

    const watched = new Set(update.sql.match(/AFTER\s+UPDATE\s+OF\s+([^\n]+?)\s+ON\s/i)[1]
      .split(',')
      .map((column) => column.trim()));

    assert.deepEqual([...watched].sort(), [...read].sort(),
      `${table}: the update trigger watches columns the insert trigger does not read, or misses one`);
  }
});

test('the tag column scopes a search, and an untagged query spans every table', (t) => {
  const { db, call } = surface(t);
  const rows = corpus(call);

  // Every entity carries the same word, so the only thing separating the answers is the tag.
  for (const key of ['requirement', 'acceptance_criterion', 'story_criterion', 'finding']) {
    call[`update_${key}`]({
      id: rows[key].id,
      [key === 'finding' ? 'summary' : 'text']: `A shared word: basalt. (${key})`,
    });
  }

  call.update_observation({ id: rows.observation.id, text: 'A shared word: basalt.' });

  assert.equal(matched(db, 'basalt').length, 5, 'an untagged query did not span every table');
  assert.deepEqual(matched(db, 'entity:requirement AND basalt'),
    [`requirement:${rows.requirement.id}`]);
  assert.deepEqual(matched(db, 'entity:finding AND basalt'), [`finding:${rows.finding.id}`]);
});

// --- Criterion 2: update and delete leave the index consistent, on every indexed table ----------

test('one row of every indexed type is written, indexed, and found under its own term', (t) => {
  const { db, call } = surface(t);
  const rows = corpus(call);

  assert.deepEqual(matched(db, 'quartzite'), [`requirement:${rows.requirement.id}`]);
  assert.deepEqual(matched(db, 'hornbeam'),
    [`acceptance_criterion:${rows.acceptance_criterion.id}`]);
  assert.deepEqual(matched(db, 'sarsaparilla'), [`story_criterion:${rows.story_criterion.id}`]);
  assert.deepEqual(matched(db, 'wolframite'), [`observation:${rows.observation.id}`]);
  assert.deepEqual(matched(db, 'cinnabar'), [`finding:${rows.finding.id}`]);

  // The observation's second indexed column, which is the one a single-column scan would miss.
  assert.deepEqual(matched(db, 'malachite'), [`observation:${rows.observation.id}`]);

  // And the row whose second column is NULL. Without `coalesce` the concatenation is NULL, this
  // observation is indexed as the empty string, and every search for its text returns nothing —
  // reporting success the whole time.
  assert.deepEqual(matched(db, 'siltstone'), [`observation:${rows.ungathered.id}`]);

  agree(db, 'after the corpus is written');
});

test('editing the indexed column of every type replaces its entry rather than adding one', (t) => {
  const { db, call } = surface(t);
  const rows = corpus(call);

  call.update_requirement({ id: rows.requirement.id, text: 'Now mentions gypsum.' });
  call.update_acceptance_criterion({
    id: rows.acceptance_criterion.id, text: 'Now mentions gypsum.',
  });
  call.update_story_criterion({ id: rows.story_criterion.id, text: 'Now mentions gypsum.' });
  call.update_observation({ id: rows.observation.id, text: 'Now mentions gypsum.' });
  call.update_finding({ id: rows.finding.id, summary: 'Now mentions gypsum.' });

  assert.equal(matched(db, 'gypsum').length, 5);

  // The half a search for the new text cannot see. Each old term is gone from the index because
  // the update trigger deleted before it inserted; an insert-only trigger passes the line above.
  for (const gone of ['quartzite', 'hornbeam', 'sarsaparilla', 'wolframite', 'cinnabar']) {
    assert.deepEqual(matched(db, gone), [], `'${gone}' survives its own row's edit`);
  }

  agree(db, 'after editing every indexed column');
});

test('editing an observation synthesis alone still replaces the entry', (t) => {
  const { db, call } = surface(t);
  const rows = corpus(call);

  call.update_observation({ id: rows.observation.id, synthesis: 'Replaced by feldspar.' });

  // `AFTER UPDATE OF text, synthesis` and not `OF text`: an observation gathered into a retro
  // acquires its synthesis in a second write, which is the common path rather than an edge case.
  assert.deepEqual(matched(db, 'malachite'), []);
  assert.deepEqual(matched(db, 'wolframite'), [`observation:${rows.observation.id}`],
    'the untouched half of the concatenation was dropped');

  agree(db, 'after a synthesis-only edit');
});

test('editing an unindexed column leaves the index untouched', (t) => {
  const { db, call } = surface(t);
  const rows = corpus(call);

  const before = db.prepare('SELECT rowid, entity, text, entity_id FROM entry_fts '
    + 'ORDER BY rowid').all();

  call.update_requirement({ id: rows.requirement.id, position: 4 });
  call.update_finding({ id: rows.finding.id, status: 'accepted' });

  assert.deepEqual(
    db.prepare('SELECT rowid, entity, text, entity_id FROM entry_fts ORDER BY rowid').all(),
    before,
    'an edit to a position or a status rewrote index entries',
  );
});

test('deleting a row of every indexed type takes it out of the index', (t) => {
  const { db, call } = surface(t);
  const rows = corpus(call);

  // Leaf-first, and by the key the table actually declares — several of these cascade into one
  // another, and `story` takes its tasks, its criteria and the ungathered observation with it.
  const deletions = [
    ['adr_option', 'id', rows.adr_option.id],
    ['adr_option', 'id', rows.bare_option.id],
    ['adr', 'document_id', rows.adr.id],
    ['agent', 'name', rows.agent.name],
    ['artifact', 'id', rows.artifact.id],
    ['artifact', 'id', rows.live_artifact.id],
    ['audit_finding', 'id', rows.audit_finding.id],
    ['audit_finding', 'id', rows.bare_finding.id],
    ['coverage', 'id', rows.coverage.id],
    ['coverage', 'id', rows.live_coverage.id],
    ['milestone', 'id', rows.milestone.id],
    ['quick_criterion', 'id', rows.quick_criterion.id],
    ['retro_application', 'id', rows.retro_application.id],
    ['task', 'id', rows.task.id],
    ['task', 'id', rows.bare_task.id],
    ['story_criterion', 'id', rows.story_criterion.id],
    ['observation', 'id', rows.observation.id],
    ['observation', 'id', rows.ungathered.id],
    ['story', 'id', rows.story.id],
    ['acceptance_criterion', 'id', rows.acceptance_criterion.id],
    ['requirement', 'id', rows.requirement.id],
    ['finding', 'id', rows.finding.id],
  ];

  // Reconciled rather than written and trusted: a table indexed later and not deleted here would
  // leave this test claiming to cover every indexed type while covering all but one.
  assert.deepEqual([...new Set(deletions.map(([table]) => table))].sort(),
    [...indexedTables(db).keys()].sort(),
    'the deletions and the index disagree about which tables are indexed');

  for (const [table, key, id] of deletions) {
    db.prepare(`DELETE FROM ${table} WHERE ${key} = ?`).run(id);
  }

  // Not `COUNT(*) = 0`. `applyVocabulary` seeds the agent roster on every start and those rows are
  // indexed, so an empty index is not what a correct delete produces here and asserting one would
  // fail on a working schema. The property is that every term the corpus wrote has gone and the
  // index still agrees with the tables — which a count cannot distinguish from a truncation.
  for (const term of TERMS) {
    assert.deepEqual(matched(db, term), [], `'${term}' survived the delete of the row holding it`);
  }

  assert.ok(db.prepare('SELECT COUNT(*) AS rows FROM entry_fts').get().rows > 0,
    'the index emptied, so the sweep above passed by truncation rather than by delete triggers');

  agree(db, 'after deleting one row of every type');
});

test('deleting a spec takes its requirements and their criteria out through two cascades', (t) => {
  const { db, call } = surface(t);
  const rows = corpus(call);

  // A spec of its own, because `document.parent_id` carries **no** `ON DELETE` action — deleting
  // a document that other documents hang off is refused rather than orphaning them, so `rows.spec`
  // cannot be the subject here while its epic, review and ADR exist. That refusal is asserted
  // below rather than worked around silently.
  const alone = call.create_spec({ slug: 'alone', title: 'Alone' });
  const requirement = call.create_requirement({
    spec_id: alone.id, label: 'FR1', class: 'functional', position: 0,
    text: 'Prose that goes when its spec does, feldspar.',
  });
  const criterion = call.create_acceptance_criterion({
    requirement_id: requirement.id, position: 0,
    text: 'And so does this, gypsum.',
  });

  assert.deepEqual(matched(db, 'feldspar'), [`requirement:${requirement.id}`]);
  assert.deepEqual(matched(db, 'gypsum'), [`acceptance_criterion:${criterion.id}`]);

  // `acceptance_criterion` cascades from `requirement`, which cascades from `document` — so the
  // criterion's trigger fires on a row removed by a cascade *of a cascade*. Asserted rather than
  // assumed, for the same reason Story 3 asserts the single-level case.
  db.prepare('DELETE FROM document WHERE id = ?').run(alone.id);

  assert.deepEqual(matched(db, 'feldspar'), []);
  assert.deepEqual(matched(db, 'gypsum'), [], 'the second cascade left its index entry behind');

  // The control, and the reason the corpus is still here: the index emptying would satisfy the
  // two lines above for the wrong reason. Everything the first spec wrote is untouched.
  assert.deepEqual(matched(db, 'quartzite'), [`requirement:${rows.requirement.id}`]);
  assert.deepEqual(matched(db, 'cinnabar'), [`finding:${rows.finding.id}`]);

  agree(db, 'after a two-level cascade');
});

test('a document other documents hang off refuses to be deleted rather than orphaning them', (t) => {
  const { db, call } = surface(t);
  const rows = corpus(call);

  // The premise the test above had to work around, stated where it can fail. If this ever starts
  // succeeding, that test stops exercising a two-level cascade and starts exercising a one-level
  // one without saying so.
  assert.throws(() => db.prepare('DELETE FROM document WHERE id = ?').run(rows.spec.id),
    /FOREIGN KEY constraint failed/);
});
