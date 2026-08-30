/**
 * Epic 47-07 Story 1 — the converted `discover`, and the three claims made about it.
 *
 * - "A discover run writes a problem brief document and its sections through create tools"
 *   [feature]
 * - "The facilitation survives: the run still explores the problem before proposing, and still
 *   refuses to produce a brief from an unexamined premise" [feature]
 * - "must NOT — the skill recovers an entity by reading a generated markdown file rather than by
 *   calling a read tool" [unit]
 *
 * **`discover` is the first skill in the corpus with nothing upstream of it**, so the fixture
 * seeds only what a project already holds when someone starts — a roster, a scoped library
 * document, a retro to consume, and a session to resume. There is no brief to read, because
 * producing the first one is the whole of what this skill does.
 *
 * **The second claim is driven twice against the same run function**, once approved and once
 * refused. A single approved run cannot distinguish "writes after the gate" from "writes
 * whenever" — both leave the same rows behind. The refused run is what makes the ordering
 * observable, and it is the shape the third phrase of the claim actually names.
 *
 * **The binding to the file is the three directions every conversion uses** — every tool the file
 * names is real, every tool the run drove is named, and every fixed-vocabulary argument the run
 * supplied is named. See `support/skills.js`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import {
  skillSource, toolNames, reachable, section, recorder, recoveries, bindings,
  seedStartup, driveStartup,
} from './support/skills.js';

const SKILL = 'discover';
const source = skillSource(SKILL);

/**
 * The recoveries this file in particular would reach for, on top of the shared sweep.
 *
 * Hoisted so the control at the end reads the source with the same patterns the assertion does —
 * a control run over a narrower list proves only that the narrower list works.
 */
const PARSES = [
  { pattern: /save the brief|write the brief to/i, why: 'a file write standing in for the rows' },
  { pattern: /`{3}markdown/, why: 'a document template, which is the projection’s to own' },
];

/** The six headings a problem brief carries, in the order the phases settle them. */
const HEADINGS = ['Why', 'Who', 'Current State', 'Success Criteria', 'Constraints', 'Scope Boundaries'];

/**
 * What a project holds before its first brief exists — the shared startup fixture and nothing
 * else, because `discover` is the one skill in the corpus with no upstream artefact to seed.
 */
function project(tools) {
  const seed = handlers(tools);

  return seedStartup(seed, {
    scope: 'discover',
    skill: 'dpm:discover',
    phase: 'Phase 2: Who',
    live: ['The onboarding story ran to twice its estimate.'],
  });
}

/** A dispatcher that also keeps the order, which is the half `recorder` deliberately drops. */
function ordered(call, log) {
  return Object.fromEntries(Object.entries(call).map(([name, handler]) => [
    name,
    (args) => {
      log.push(name);
      return handler(args);
    },
  ]));
}

/**
 * The run the SKILL.md prescribes: startup, five phases of facilitation, then the Phase 6 gate.
 *
 * `approved` is the answer at that gate. A refused run does everything an approved one does up to
 * the gate and writes nothing, which is the claim's third phrase expressed as a return value.
 *
 * `attempt` distinguishes two runs against one database. A session id is a primary key and an
 * adoption is recorded on the row it supersedes, so a second run reusing either would fail on the
 * store rather than on anything the skill does — and the refusal test needs both runs.
 */
function run(call, fixture, { approved = true, attempt = 1 } = {}) {
  const order = [];
  const step = ordered(call, order);

  // --- Startup -----------------------------------------------------------------------------
  const { roster, consulted, observations, session } = driveStartup(step, fixture, {
    scope: 'discover', skill: 'dpm:discover', attempt, adopt: attempt === 1,
  });

  // --- Phases 1 to 5 -----------------------------------------------------------------------
  // Each phase closes into the session row, which is the whole of the run's memory. Nothing is
  // written to a document here: the brief does not exist until the Phase 6 gate approves it.
  const settled = {};
  HEADINGS.slice(0, 5).forEach((heading, index) => {
    settled[heading] = `what phase ${index + 1} settled about ${heading.toLowerCase()}`;
    step.update_session({ id: session, phase: `Phase ${index + 2}`, state: JSON.stringify(settled) });
  });

  settled['Scope Boundaries'] = 'in: the first run; out: migration of anything existing';

  // --- Phase 6: the gate -------------------------------------------------------------------
  if (!approved) return { order, roster, consulted, observations, brief: null, sections: [] };

  const brief = step.create_problem_brief({ slug: 'onboarding', title: 'Onboarding takes four days' });

  const sections = HEADINGS.map((heading, position) => step.create_document_section({
    document_id: brief.id, heading, body: settled[heading], position,
  }));

  step.update_problem_brief({ id: brief.id, status: 'complete' });

  return { order, roster, consulted, observations, brief, sections };
}

// --- Criterion 1: the brief and its sections are create calls -------------------------------------

test('a discover run writes the brief and its sections through create tools', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used, passed } = recorder(tools);

  const fixture = project(tools);
  const result = run(call, fixture);

  // The assertions below read through the raw handlers, never the recorded ones: a read this test
  // performs to check the run is the *test's* verification, and counting it as the run's would
  // demand the file prescribe a call nothing in the run makes.
  const raw = handlers(tools);

  const stored = raw.read_problem_brief({ id: result.brief.id });

  assert.equal(stored.kind, 'problem_brief');
  assert.equal(stored.status, 'complete');
  assert.equal(stored.title, 'Onboarding takes four days');

  // **The number came from the call, not from the run.** It is not an argument the tool accepts,
  // so the numbering procedure this conversion deletes has nowhere to reappear.
  assert.equal(stored.number, 1);
  assert.ok(!passed.get('create_problem_brief').has('number'),
    'the run allocated the number the tool exists to allocate');
  assert.ok(!('number' in tools.find((tool) => tool.name === 'create_problem_brief').inputSchema.properties),
    'the number is offered as an argument, which is the allocation put back within reach');

  // Six sections, each a row with its heading and its place, read back off the store.
  const sections = raw.list_document_section({ document_id: result.brief.id }).items;

  assert.deepEqual(sections.map((row) => row.heading), HEADINGS);
  assert.deepEqual(sections.map((row) => row.position), [0, 1, 2, 3, 4, 5]);

  for (const row of sections) {
    const body = raw.read_document_section({ id: row.id, include_body: true }).body;
    assert.ok(body && body.length > 0, `${row.heading} reached a row with no prose in it`);
  }

  // The three directions of the binding to the file, all reported at once.
  assert.deepEqual(bindings(source, tools, { used, passed }), []);
});

// --- Criterion 2: the facilitation survives -------------------------------------------------------

test('the run explores before it proposes, and a refused gate writes nothing', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);

  const fixture = project(tools);
  const raw = handlers(tools);

  // **The refused run is the load-bearing half.** An approved run leaves the same rows behind
  // whether it wrote them at the gate or before it, so only a refusal can tell the two apart.
  const refused = run(call, fixture, { approved: false });

  assert.equal(refused.brief, null);
  assert.deepEqual(raw.list_problem_brief({}).items, [],
    'a brief exists after a gate that refused one');

  // It still explored: the roster, the scoped library and the retro were all read before the
  // gate that produced nothing, so exploration is not a side effect of deciding to write.
  assert.ok(refused.roster.length > 0);
  assert.equal(refused.consulted.length, 1, 'the library read was unscoped, or did not happen');
  assert.equal(refused.observations.length, 1, 'the retired observation reached the selection');
  assert.ok(refused.observations[0].categories.every(Boolean),
    'an observation reached the selection without its category');

  // And in order: every read precedes every write, in the approved run too.
  const approved = run(call, fixture, { attempt: 2 });
  const firstWrite = approved.order.findIndex((name) => name.startsWith('create_problem_brief'));
  const lastRead = approved.order.reduce(
    (last, name, index) => (name.startsWith('list_') || name.startsWith('read_') ? index : last),
    -1,
  );

  assert.ok(firstWrite > 0, 'the brief was never written');
  assert.ok(lastRead < firstWrite,
    'the run read something after it had already begun proposing');

  // The file's own shape: five phases of exploration, then a gate, and the rule that the rows
  // wait for it. Matched as the construction rather than as the words — an assertion on `approved`
  // alone is satisfied by three other sentences in the same file.
  const summary = section(source, 'Phase 6: Summary');
  assert.notEqual(summary, '', 'the summary phase still exists');
  assert.match(summary, /Write the rows only once the brief is approved/);
  assert.match(summary, /`Approve` \/ `Request changes` \/ `Stop`/);
  assert.match(summary, /mcp__plugin_dpm_dpm__create_problem_brief/);

  for (const phase of ['Phase 1: Why', 'Phase 3: Current State', 'Phase 5: Constraints']) {
    assert.notEqual(section(source, phase), '', `${phase} no longer exists`);
    assert.ok(source.indexOf(phase) < source.indexOf('Phase 6: Summary'),
      `${phase} runs after the summary that is supposed to conclude it`);
  }

  // The premise is examined rather than taken: the startup grounds in the code, and Phase 4
  // refuses an outcome nobody can check rather than recording it.
  const grounding = section(source, 'Codebase grounding');
  assert.notEqual(grounding, '', 'the codebase grounding step still exists');

  const outcomes = section(source, 'Phase 4: Success Criteria');
  assert.match(outcomes, /An outcome nobody can check is worth less than a missing one/);
  assert.match(outcomes, /offer the checkable form/);
});

// --- Criterion 3 (must NOT): no recovery by reading what was written -------------------------------

test('the skill recovers nothing by reading a generated file', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  // The shared FR25 sweep, plus the two this file in particular would reach for: the brief saved
  // to a path, and the markdown template that used to define its shape.
  assert.deepEqual(recoveries(source, PARSES), []);

  // The positive half, which is what makes the sweep more than an absence: every discovery the
  // startup makes goes through a tool, and the tools it names are real.
  const known = new Set(tools.map((tool) => tool.name));
  const named = toolNames(reachable(source));

  for (const required of ['list_session', 'list_agent', 'list_library', 'list_library_scope',
    'list_retro', 'list_observation', 'create_problem_brief', 'create_document_section',
    'update_problem_brief']) {
    assert.ok(named.includes(required), `the skill never names ${required}`);
    assert.ok(known.has(required), `${required} is not a tool`);
  }

  // The control: the sweep is not so narrow that anything passes. A file with the constructions
  // this skill is most likely to regain is caught by the same reading.
  const regressed = `${source}\n\nSave the brief to docs/plans/{nn}-plan-{slug}.md, then glob `
    + 'docs/plans/*.md and read its front matter.';

  assert.ok(recoveries(regressed, PARSES).length >= 4,
    'the sweep passed a file that names a path, a template, a glob and a front-matter read');
});
