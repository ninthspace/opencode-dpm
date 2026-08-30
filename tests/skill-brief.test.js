/**
 * Epic 47-07 Story 2 — the converted `brief`, and the three claims made about it.
 *
 * - "A brief run writes a product brief whose `parent_id` names the problem brief, read through a
 *   read tool rather than resolved by slug matching" [feature]
 * - "The facilitation survives: the run still gates on scope and still separates the problem from
 *   the proposed shape" [feature]
 * - "must NOT — the skill recovers an entity by reading a generated markdown file rather than by
 *   calling a read tool" [unit]
 *
 * **The first claim is about a refusal as much as a write.** A `parent_id` that merely stores is
 * no better than the slug it replaces; what makes it stronger is that the composite key refuses a
 * parent of the wrong kind at write time. The fixture therefore seeds a spec and a second problem
 * brief, so the test can offer both a wrong-kind parent and a right-kind-but-wrong-one.
 *
 * **`['product_brief', 'problem_brief']` was seeded as part of this story.** Before it,
 * `document_kind_parent` held no pair for this kind, `parentageOf` reported `mode: 'none'`, and
 * `create_product_brief` refused `parent_id` as an unknown argument — the criterion had no route
 * through the surface at all. Found by the consumer walk before the file was written.
 *
 * **The binding to the file is the three directions every conversion uses.** See
 * `support/skills.js`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import {
  skillSource, toolNames, reachable, prose, recorder, recoveries, bindings,
  seedStartup, driveStartup,
} from './support/skills.js';

const SKILL = 'brief';
const source = skillSource(SKILL);

/** The recoveries this file in particular would reach for, on top of the shared sweep. */
const PARSES = [
  { pattern: /slug match/i, why: 'slug matching, which is the chain discovery this story removes' },
  { pattern: /`{3}markdown/, why: 'a document template, which is the projection’s to own' },
];

/** The six headings a product brief carries, in the order the phases settle them. */
const HEADINGS = [
  'Vision', 'Value Propositions', 'Key Features', 'Constraints', 'Differentiation', 'User Journeys',
];

/**
 * What a project holds when someone runs `brief`: two problem briefs, so the run has to be told
 * which — and a spec, so a wrong-kind parent is offerable rather than hypothetical.
 */
function project(tools) {
  const seed = handlers(tools);

  const problem = seed.create_problem_brief({ slug: 'planning-drift', title: 'Planning drift' });
  seed.create_document_section({
    document_id: problem.id,
    heading: 'Constraints',
    body: 'One host, and no queue worker.',
    position: 0,
  });

  // A second problem brief, newer than the one the run is told to use. A run that reached for the
  // most recent would pick this one and every assertion on lineage would still find *a* parent.
  const decoy = seed.create_problem_brief({ slug: 'later-work', title: 'A later, unrelated problem' });

  const spec = seed.create_spec({ slug: 'unrelated', title: 'Unrelated spec' });

  const startup = seedStartup(seed, {
    scope: 'brief',
    skill: 'dpm:brief',
    phase: 'Phase 2',
    live: ['A value claim nobody could test survived two rounds.'],
  });

  return { problem, decoy, spec, ...startup };
}

/**
 * The run the SKILL.md prescribes: startup, the problem brief chosen by id, seven phases, then the
 * Phase 8 gate.
 *
 * `approved` is the answer at that gate; `parent` is which document the run names as the source,
 * so a test can drive the refusal the composite key exists for.
 */
function run(call, fixture, { approved = true, attempt = 1, parent = fixture.problem.id } = {}) {
  const startup = driveStartup(call, fixture, { scope: 'brief', skill: 'dpm:brief', attempt });

  // Input: the problem brief is chosen from the list by id, and read through a read tool. Nothing
  // matches a slug and nothing takes the newest.
  const offered = call.list_problem_brief({}).items;
  const chosen = parent === null ? null : call.read_problem_brief({ id: parent });

  // Phase 1: the constraints come off the source's own rows.
  const constraints = chosen === null ? [] : call.list_document_section({ document_id: chosen.id }).items
    .filter((row) => row.heading === 'Constraints')
    .map((row) => call.read_document_section({ id: row.id, include_body: true }));

  const settled = {};
  HEADINGS.forEach((heading, index) => {
    settled[heading] = `what phase ${index + 1} settled about ${heading.toLowerCase()}`;
    call.update_session({ id: startup.session, phase: `Phase ${index + 2}`, state: JSON.stringify(settled) });
  });

  if (!approved) return { startup, offered, chosen, constraints, brief: null, sections: [] };

  const brief = call.create_product_brief({
    slug: 'dpm', title: 'dpm', ...(parent === null ? {} : { parent_id: parent }),
  });

  const sections = HEADINGS.map((heading, position) => call.create_document_section({
    document_id: brief.id, heading, body: settled[heading], position,
  }));

  call.update_product_brief({ id: brief.id, status: 'complete' });

  return { startup, offered, chosen, constraints, brief, sections };
}

// --- Criterion 1: lineage is a checked parent, not a matched slug ---------------------------------

test('the brief names its problem brief as a parent, and a wrong kind is refused at write time', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used, passed } = recorder(tools);

  const fixture = project(tools);
  const result = run(call, fixture);

  const raw = handlers(tools);
  const stored = raw.read_product_brief({ id: result.brief.id });

  assert.equal(stored.kind, 'product_brief');
  assert.equal(stored.parent_id, fixture.problem.id);
  assert.equal(stored.parent_kind, 'problem_brief');

  // **The parent is the one the run was told to use, not the newest.** Both were offered; a run
  // reaching for recency would have taken the decoy and still stored a valid-looking lineage.
  assert.equal(result.offered.length, 2, 'the choice was never a choice');
  assert.notEqual(stored.parent_id, fixture.decoy.id);

  // The run passes the id it was given, so the run alone cannot show *how* the file says to choose
  // — that half is the instruction, asserted as its construction rather than as its words.
  const input = prose(source, 'Input');
  assert.match(input, /never take the most recent/i,
    'the file lets a run substitute recency for the question it is supposed to ask');
  assert.match(input, /no chain to discover and no slug to match/i);

  // **And the write step still says the lineage is a column.** `parent_id` is not an enum, so the
  // binding's valued-argument direction cannot see it: a file that demoted the lineage to a
  // sentence of prose in the Vision section passed all three tests until this assertion existed.
  const summary = prose(source, 'Phase 8: Summary');
  assert.match(summary, /passing the problem brief resolved in Input as `parent_id`/);
  assert.match(summary, /`parent_id` is the lineage, and it is checked as it is written/);
  assert.match(summary, /refused rather than stored/);

  // The number came from the call, and is not an argument the tool accepts.
  assert.ok(!('number' in tools.find((tool) => tool.name === 'create_product_brief').inputSchema.properties));
  assert.ok(!passed.get('create_product_brief').has('number'));

  // **The refusal is what makes this stronger than a slug**, so it is asserted rather than
  // assumed: the wrong kind of parent, and an id that names nothing, are both rejected.
  assert.throws(
    () => raw.create_product_brief({ slug: 'wrong', title: 'Wrong', parent_id: fixture.spec.id }),
    /FOREIGN KEY|parent/i,
    'a product brief hung off a spec was stored',
  );
  assert.throws(
    () => raw.create_product_brief({ slug: 'ghost', title: 'Ghost', parent_id: 'no-such-id' }),
    /no document/i,
    'a product brief named a parent that does not exist',
  );

  // A brief with no problem behind it is a legal brief, not an error — the argument is optional.
  const standalone = raw.create_product_brief({ slug: 'standalone', title: 'Standalone' });
  assert.equal(standalone.parent_id, null);

  // Six sections, each a row with its heading and its place.
  const sections = raw.list_document_section({ document_id: result.brief.id }).items;
  assert.deepEqual(sections.map((row) => row.heading), HEADINGS);
  assert.deepEqual(sections.map((row) => row.position), [0, 1, 2, 3, 4, 5]);

  assert.deepEqual(bindings(source, tools, { used, passed }), []);
});

// --- Criterion 2: the facilitation survives -------------------------------------------------------

test('the run separates the problem from the shape, and a refused gate writes nothing', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);

  const fixture = project(tools);
  const raw = handlers(tools);

  // The refused run: everything an approved one does up to the gate, and no rows.
  const refused = run(call, fixture, { approved: false });

  assert.equal(refused.brief, null);
  assert.deepEqual(raw.list_product_brief({}).items, [], 'a brief exists after a gate that refused one');

  // It still read the problem it was given, and the constraints off that problem's own rows —
  // the separation the claim names, driven before anything was proposed.
  assert.equal(refused.chosen.id, fixture.problem.id);
  assert.equal(refused.constraints.length, 1);
  assert.match(refused.constraints[0].body, /no queue worker/);

  // The file's own shape: the problem is recapped and its constraints restated before approaches
  // are explored, and the approaches phase comes before the vision that follows from one.
  const recap = prose(source, 'Phase 1: Problem recap');
  assert.notEqual(recap, '', 'the problem recap still exists');
  assert.match(recap, /restate them for confirmation rather than asking again/);
  assert.match(recap, /Constraints are collected here and nowhere else/);

  const approaches = prose(source, 'Phase 2: Solution approaches');
  assert.match(approaches, /2–4 distinct approaches/);
  assert.match(approaches, /plausible path rather than a strawman/);

  for (const [earlier, later] of [
    ['Phase 1: Problem recap', 'Phase 2: Solution approaches'],
    ['Phase 2: Solution approaches', 'Phase 3: Vision'],
    ['Phase 7: User journeys', 'Phase 8: Summary'],
  ]) {
    assert.ok(source.indexOf(earlier) < source.indexOf(later), `${earlier} runs after ${later}`);
  }

  // The scope gate: essential against enhancing, and a feature tracing to no proposition named as
  // the thing the question exists to surface.
  const features = prose(source, 'Phase 5: Key features');
  assert.match(features, /\*\*essential\*\*/i);
  assert.match(features, /enhancing/i);
  assert.match(features, /traces to none/);

  // And the rows wait for approval, which the refused run above is the behavioural half of.
  const summary = prose(source, 'Phase 8: Summary');
  assert.match(summary, /Write the rows only once the brief is approved/);
  assert.match(summary, /`Approve` \/ `Request changes` \/ `Stop`/);
});

// --- Criterion 3 (must NOT): no recovery by reading what was written -------------------------------

test('the skill recovers nothing by reading a generated file', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  assert.deepEqual(recoveries(source, PARSES), []);

  const known = new Set(tools.map((tool) => tool.name));
  const named = toolNames(reachable(source));

  for (const required of ['list_problem_brief', 'read_problem_brief', 'create_product_brief',
    'update_product_brief', 'create_document_section', 'list_document_section',
    'read_document_section']) {
    assert.ok(named.includes(required), `the skill never names ${required}`);
    assert.ok(known.has(required), `${required} is not a tool`);
  }

  // The control: a file that reaches for the old chain discovery is caught by the same reading.
  const regressed = `${source}\n\nGlob docs/plans/[0-9]*-plan-*.md and slug match the filename `
    + 'against docs/briefs/{nn}-brief-{slug}.md.';

  assert.ok(recoveries(regressed, PARSES).length >= 4,
    'the sweep passed a file that globs, names a path, matches a slug and builds a filename');
});
