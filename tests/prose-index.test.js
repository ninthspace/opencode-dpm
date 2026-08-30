/**
 * Story 2 — the columns the classification says hold prose are the columns the index carries.
 *
 * Story 1 judged all 194 TEXT columns against FR9's rule and reconciled the judgement with the
 * schema. This story makes the judgement true: `022-prose-index.sql` adds thirty triggers across
 * ten tables and backfills the rows written before it.
 *
 * **The failure being closed has no error in it.** A search over a column nothing indexes is
 * accepted, ranked against what the index does hold, and returns nothing — which reads exactly
 * like the row not being there. That is why the two inconsistencies below are asserted *by name*
 * rather than left to the general criterion: `audit_finding.summary` was unfindable while
 * `finding.summary` beside it was findable, and a migration written in general terms can satisfy
 * "every prose column is indexed" and still leave a named pair split.
 *
 * **The backfill needs a database that has not had 022 applied.** Every ordinary fixture applies
 * the whole schema, so a test written on one of those cannot distinguish a working backfill from
 * working triggers — it passes either way. The one below starts at version 21, writes rows through
 * the tools, and only then migrates.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { openDatabaseFile } from './support/database.js';
import { databaseAtVersion, vocabularyAsOf } from './support/migration.js';
import { registerCreators } from './support/creators.js';
import { spineTools } from '../src/tools/index.ts';
import { applyVocabulary } from '../src/schema/seeds/index.ts';
import { start } from '../src/start.ts';
import { dump } from '../src/dump/index.ts';
import { restore } from '../src/restore/index.ts';

function surface(t) {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  return { db, tools, call: handlers(tools) };
}

/** The `entity:id` pairs `entry_fts` returns for `term`. */
const matched = (db, term) => db
  .prepare('SELECT entity, entity_id FROM entry_fts WHERE entry_fts MATCH ? ORDER BY entity, entity_id')
  .all(term)
  .map((row) => `${row.entity}:${row.entity_id}`);

/** The ten tables `022-prose-index.sql` added, which is what every count below is against. */
const ADDED = [
  'adr', 'adr_option', 'agent', 'artifact', 'audit_finding', 'milestone', 'quick_criterion',
  'retro_application', 'story', 'task',
];

/**
 * One row of each newly indexed table, plus the already-indexed rows the two named inconsistencies
 * were inconsistent *with*. Each row carries a term of its own, and the members of each named pair
 * additionally share a word — so "beside" is asserted as one search returning both rows rather
 * than as two searches that each happen to work.
 */
function corpus(call) {
  const spec = call.create_spec({ slug: 'prose', title: 'Prose' });
  const epic = call.create_epic({ parent_id: spec.id, slug: 'index', title: 'Index' });
  const story = call.create_story({
    epic_id: epic.id, number: 2, title: 'Index the prose columns', position: 0,
  });
  const review = call.create_review({ parent_id: spec.id, slug: 'index', title: 'Review' });
  const retro = call.create_retro({ parent_id: epic.id, slug: 'index', title: 'Retro' });

  const requirement = call.create_requirement({
    spec_id: spec.id, label: 'FR9', class: 'functional', position: 0,
    text: 'Hand-written prose is searchable wherever it is held.',
  });

  const acceptance_criterion = call.create_acceptance_criterion({
    requirement_id: requirement.id, position: 0,
    text: 'Found by its own term, rhodonite. Shared: gypsum.',
  });
  const story_criterion = call.create_story_criterion({
    story_id: story.id, position: 0,
    text: 'Three triggers per table, serpentine. Shared: gypsum.',
  });
  const finding = call.create_finding({
    review_id: review.id, position: 0,
    category_id: 'finding:testability-concerns', severity_id: 'severity:warning',
    summary: 'A missing delete trigger, aventurine. Shared: basalt.',
  });

  const adr = call.create_adr({
    parent_id: spec.id, slug: 'index', title: 'How the index is maintained',
    decision: 'Triggers rather than a reindex step, wolframite.',
  });
  const adr_option = call.create_adr_option({
    adr_id: adr.id, name: 'Rebuild on demand', position: 0,
    rationale: 'Cheaper to write and easy to forget to run, cinnabar.',
  });
  const agent = call.create_agent({
    name: 'lapidary', display_name: 'Lapidary', icon: '💎', role: 'Index keeper', position: 20,
    personality: 'Sceptical about anything that reports success, malachite.',
    communication_style: 'Short sentences and a worked example.',
  });
  const artifact = call.create_artifact({
    url: 'https://example.invalid/prose', title: 'The index',
    published_at: '2026-08-11T00:00:00Z',
    description: 'A page about what search reaches, siltstone.',
  });

  const audit = call.create_audit({ slug: 'index', title: 'Audit of the index' });
  const audit_finding = call.create_audit_finding({
    audit_id: audit.id, position: 0, dimension_id: 'audit_dimension:test-debt',
    file: 'dpm/src/schema/013-entry-search.sql', severity_id: 'severity:warning',
    summary: 'Six columns were never revisited, quartzite. Shared: basalt.',
    recommendation: 'Derive the set and reconcile it, hornbeam.',
  });

  const milestone = call.create_milestone({
    spec_id: spec.id, label: 'M1', title: 'Substrate', position: 0,
    summary: 'The schema and the tools that write it, sarsaparilla.',
  });

  const quick = call.create_quick({ slug: 'index', title: 'A quick change' });
  const quick_criterion = call.create_quick_criterion({
    quick_id: quick.id, position: 0,
    text: 'The criterion nobody indexed, chalcedony. Shared: gypsum.',
  });

  const retro_application = call.create_retro_application({
    retro_id: retro.id, applied_to_id: epic.id, theme: 'Testing gaps', disposition: 'applied',
    note: 'Planted the input rather than settling for a comment, peridot.',
  });

  // `story.status_note` has no create parameter, so the row reaches the index through the update
  // trigger — which is also the path a caller uses.
  call.update_story({ id: story.id, status_note: 'Waiting on the migration, tanzanite.' });

  const task = call.create_task({
    story_id: story.id, number: 1, title: 'Write the migration', position: 0,
    description: 'Three triggers per table, kunzite.',
  });

  return {
    spec, epic, story, review, retro, requirement, acceptance_criterion, story_criterion, finding,
    adr, adr_option, agent, artifact, audit, audit_finding, milestone, quick, quick_criterion,
    retro_application, task,
  };
}

// --- The two named inconsistencies -------------------------------------------------------------

test('audit_finding.summary is indexed, and one search returns it beside finding.summary', (t) => {
  const { db, call } = surface(t);
  const rows = corpus(call);

  // Its own term first — that half fails on a migration that missed the table entirely.
  assert.deepEqual(matched(db, 'quartzite'), [`audit_finding:${rows.audit_finding.id}`]);

  // And the pair, which is what the inconsistency was: the same word on both summaries, and a
  // single search that has to return both rows. Before 022 this returned the finding alone, and
  // nothing about that result said the other row existed.
  assert.deepEqual(matched(db, 'basalt'), [
    `audit_finding:${rows.audit_finding.id}`,
    `finding:${rows.finding.id}`,
  ]);

  // The second prose column on the same table, which a single-column trigger would miss while
  // every assertion above still passed.
  assert.deepEqual(matched(db, 'hornbeam'), [`audit_finding:${rows.audit_finding.id}`]);
});

test('quick_criterion.text is indexed, and one search returns it beside the other criteria', (t) => {
  const { db, call } = surface(t);
  const rows = corpus(call);

  assert.deepEqual(matched(db, 'chalcedony'), [`quick_criterion:${rows.quick_criterion.id}`]);

  assert.deepEqual(matched(db, 'gypsum'), [
    `acceptance_criterion:${rows.acceptance_criterion.id}`,
    `quick_criterion:${rows.quick_criterion.id}`,
    `story_criterion:${rows.story_criterion.id}`,
  ]);
});

test('every table 022 added carries a term of its own into the index', (t) => {
  const { db, call } = surface(t);
  const rows = corpus(call);

  const found = {
    adr: ['wolframite', rows.adr.id],
    adr_option: ['cinnabar', rows.adr_option.id],
    agent: ['malachite', rows.agent.name],
    artifact: ['siltstone', rows.artifact.id],
    audit_finding: ['quartzite', rows.audit_finding.id],
    milestone: ['sarsaparilla', rows.milestone.id],
    quick_criterion: ['chalcedony', rows.quick_criterion.id],
    retro_application: ['peridot', rows.retro_application.id],
    story: ['tanzanite', rows.story.id],
    task: ['kunzite', rows.task.id],
  };

  // Keyed by table name and reconciled against the list, so a table added to 022 and left out of
  // the corpus is a failure here rather than a row nobody wrote and nobody missed.
  assert.deepEqual(Object.keys(found).sort(), [...ADDED].sort());

  for (const [entity, [term, id]] of Object.entries(found)) {
    assert.deepEqual(matched(db, term), [`${entity}:${id}`],
      `${entity} did not reach the index under its own term`);
  }
});

// --- The backfill ------------------------------------------------------------------------------

test('rows written before the migration are indexed by it, not left behind', (t) => {
  const file = databaseAtVersion(t, 21);

  const before = file.connect();
  registerCreators();
  // Version 21's own vocabulary — the tables it had. See `vocabularyAsOf`.
  applyVocabulary(before, { vocabularies: vocabularyAsOf(before) });
  const call = handlers(spineTools(before));

  const spec = call.create_spec({ slug: 'backfill', title: 'Backfill' });
  const adr = call.create_adr({
    parent_id: spec.id, slug: 'b', title: 'ADR',
    decision: 'Written before the migration, wolframite.',
  });
  const milestone = call.create_milestone({
    spec_id: spec.id, label: 'M1', title: 'M', position: 0,
    summary: 'Also written before it, cinnabar.',
  });

  // The premise, asserted rather than assumed: nothing indexes these yet. A test whose starting
  // state already held them would pass against a migration that added only triggers, which is the
  // half-working index this criterion exists to rule out (retro 41).
  const entries = (db, entity) => db
    .prepare('SELECT COUNT(*) AS n FROM entry_fts WHERE entity = ?').get(entity).n;

  assert.equal(entries(before, 'adr'), 0);
  assert.equal(entries(before, 'milestone'), 0);

  const seeded = before.prepare('SELECT COUNT(*) AS n FROM agent').get().n;
  assert.ok(seeded > 0, 'the roster seeded nothing, so the agent half of this proves nothing');
  before.close();

  const { db, migrated } = start(file.path);

  assert.ok(migrated.applied.includes(22),
    `the migration under test did not run — applied ${migrated.applied.join(', ')}`);

  assert.deepEqual(matched(db, 'wolframite'), [`adr:${adr.id}`]);
  assert.deepEqual(matched(db, 'cinnabar'), [`milestone:${milestone.id}`]);

  // The roster was in `agent` before the migration too, so the backfill indexes it — and `start`
  // re-seeds immediately afterwards. `ON CONFLICT DO NOTHING` fires no insert trigger on a skipped
  // row, so each agent is indexed once; `INSERT OR REPLACE` would put every one of them in twice
  // and no search would report anything wrong.
  assert.equal(entries(db, 'agent'), seeded,
    'the roster is indexed once per row — a second copy means the re-seed wrote through a trigger');
});

// --- FR8: the round trip rebuilds the index rather than carrying it ----------------------------

test('a dump and restore rebuilds the index for every newly indexed table', (t) => {
  const source = openPlanningDatabase(t);
  const call = handlers(spineTools(source));
  const rows = corpus(call);

  const TERMS = ['wolframite', 'cinnabar', 'malachite', 'siltstone', 'quartzite', 'hornbeam',
    'sarsaparilla', 'chalcedony', 'peridot', 'tanzanite', 'kunzite'];

  const expected = Object.fromEntries(TERMS.map((term) => [term, matched(source, term)]));
  assert.ok(Object.values(expected).every((hits) => hits.length === 1),
    'the fixture is not indexed in the source, so the comparison below proves nothing');

  const file = openDatabaseFile(t);
  const target = file.connect();
  restore(target, dump(source).sql);

  // `dump/objects.js` excludes FTS shadow tables and keeps triggers, so the restored index is
  // rebuilt from the rows as they arrive rather than copied. Retro 33's lesson is why this is a
  // criterion and not an assumption: a decision taken elsewhere — ULID ids — silently invalidated
  // `document_fts`'s external-content form, and nothing said so.
  assert.deepEqual(Object.fromEntries(TERMS.map((term) => [term, matched(target, term)])), expected);

  assert.equal(
    target.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type = 'trigger' "
      + "AND sql LIKE '%entry_fts%'").get().n,
    source.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type = 'trigger' "
      + "AND sql LIKE '%entry_fts%'").get().n,
    'the restored database has a different number of index triggers than the one dumped',
  );

  assert.ok(rows.adr.id);
});

// --- The search tool's entity vocabulary -------------------------------------------------------

test('the ten tables become scopable entities with no edit to the search tool', (t) => {
  const { db, tools, call } = surface(t);
  const rows = corpus(call);

  const search = tools.find((tool) => tool.name === 'search');

  // The vocabulary is derived from the triggers, so this asserts a consequence of 022 rather than
  // a list somebody remembered to extend. `src/tools/search.js` was not touched by this story.
  for (const entity of ADDED) {
    assert.match(search.description, new RegExp(`\\b${entity}\\b`),
      `the search tool does not offer '${entity}' as a scope`);
  }

  const hits = (query) => call.search({ query })
    .items.map((hit) => `${hit.entity}:${hit.entity_id}`);

  assert.deepEqual(hits('entity:task AND kunzite'), [`task:${rows.task.id}`]);
  assert.deepEqual(hits('entity:agent AND malachite'), [`agent:${rows.agent.name}`]);

  // And a scope nothing indexes is still refused rather than answered with an empty result. This
  // is the entity Story 1's classification excluded on exactly that ground — `document` has prose
  // and no read tool — so the two halves are checked against each other here.
  assert.throws(() => call.search({ query: 'entity:document AND kunzite' }),
    /nothing indexes 'document'/);

  assert.ok(db);
});
