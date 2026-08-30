/**
 * Epic 47-06 Story 1 — the converted `spec`, and the three claims made about it.
 *
 * - "A spec run writes the document, its requirements with `class` and MoSCoW band, and its
 *   acceptance-criteria coverage rows, all through create tools" [feature]
 * - "The facilitation survives: the run still gates on scope, still produces a testing strategy,
 *   and still refuses an untestable criterion" [feature]
 * - "must NOT — the skill recovers an entity by reading a generated markdown file rather than by
 *   calling a read tool" [unit]
 *
 * **"Acceptance-criteria coverage rows" are `acceptance_criterion` plus `criterion_approach`,
 * not `coverage`.** The name comes from the section CPM's `spec` writes — *Acceptance Criteria
 * Coverage*, whose columns are requirement, criterion and tag. The `coverage` table is a
 * different thing with a colliding name: it binds a requirement to a **story** criterion, so
 * `create_coverage` requires a `story_criterion_id` that does not exist until `epics` has
 * run. Reading the criterion the other way would make it unsatisfiable by the skill it is
 * written about, so the run below writes the pair and Story 2 owns the binding.
 *
 * **The first test is bound to the file in both directions** — see `support/skills.js` for why
 * that is the load-bearing part rather than the assertions on the graph.
 *
 * **What this leaves to the review at the end of the story.** The retention test asserts the
 * three named behaviours are present in the steps that own them. It cannot assess whether they
 * are *well* facilitated; the spec's Testing Strategy says as much, and puts thinness under
 * `[manual]`. CPM's own `SKILL.md` is not consulted here in either direction — it is a name
 * oracle for the corpus and nothing more.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import {
  skillSource, frontMatter, section, recorder, recoveries, bindings, reachable, seedStartup,
  driveStartup, CALLABLE, ungated,
} from './support/skills.js';

const SKILL = 'spec';
const source = skillSource(SKILL);

/**
 * The project a spec run starts in: a brief chain, a scoped library document, a prior decision
 * and a retro with an observation. Written with the raw handlers rather than the recorded ones,
 * because none of it is the skill's own work — a fixture write counted as a run write would put
 * `create_problem_brief` in the used set and demand the skill name a tool it never calls.
 */
function project(tools) {
  const seed = handlers(tools);

  const problem = seed.create_problem_brief({ slug: 'planning-drift', title: 'Planning drift' });
  seed.create_document_section({
    document_id: problem.id,
    heading: 'Constraints',
    body: 'The store has to survive a machine with no package manager.',
    position: 0,
  });

  const product = seed.create_product_brief({ slug: 'dpm', title: 'dpm' });

  const startup = seedStartup(seed, {
    scope: 'spec',
    skill: 'dpm:spec',
    phase: 'Section 2',
    live: ['A criterion tagged manual was automatable all along.'],
  });

  return { problem, product, ...startup };
}

/**
 * The run the SKILL.md prescribes, start to finish, through the recorded dispatcher.
 *
 * The startup discoveries are here rather than assumed because they are the half of the
 * conversion that FR25 is about: each one was a glob, and a run that skipped them would leave
 * the tools that replaced them unexercised and unnamed.
 */
function run(call, fixture) {
  // Startup: session, roster, library and retro awareness are the four every skill runs; the
  // prior decisions and the constraint inheritance below are this skill's own.
  const startup = driveStartup(call, fixture, { scope: 'spec', skill: 'dpm:spec' });

  // Prior decisions: listed, then read, because the decision itself is not on the list row.
  for (const decision of call.list_adr({}).items) call.read_adr({ id: decision.id });

  call.list_product_brief({});
  const briefs = call.list_problem_brief({});
  const brief = briefs.items.find((item) => item.id === fixture.problem.id);
  const constraints = call.list_document_section({ document_id: brief.id, include_body: true })
    .items.find((entry) => entry.heading === 'Constraints');

  const observations = startup.observations.map((entry) => entry.observation);

  // Section 1: the spec exists from here on, and its lineage is an edge.
  const spec = call.create_spec({ slug: 'dpm-persistence', title: 'dpm SQLite persistence' });
  call.create_dependency({
    kind: 'builds_on',
    source_document_id: spec.id,
    target_document_id: fixture.problem.id,
  });
  call.create_document_section({
    document_id: spec.id,
    heading: 'Problem Statement',
    body: 'Planning artefacts are markdown, so every skill parses what the last one wrote.',
    position: 0,
  });

  // Section 2 and Section 3: class is passed, never read back out of the label.
  const requirements = [
    { label: 'FR1', class: 'functional', moscow: 'must', text: 'Skills write through typed tools' },
    { label: 'FR2', class: 'functional', moscow: 'could', text: 'A dump is byte-stable' },
    { label: 'FR3', class: 'functional', moscow: 'wont', exclusion: 'deferred', text: 'A web view' },
    { label: 'NFR1', class: 'non_functional', text: 'A read answers in under a second' },
    {
      label: 'ENV1',
      class: 'environmental_requirement',
      text: 'A test runner is available with no install step',
    },
    {
      label: 'ENVX1',
      class: 'environmental_restriction',
      text: 'No dependency whose install requires compilation',
    },
  ].map((fields, position) => call.create_requirement({ spec_id: spec.id, position, ...fields }));

  // Section 6a and 6b: the vocabulary is read, then each criterion is written with its polarity
  // and its tag as arguments.
  const approaches = call.list_test_approach({}).items.map((entry) => entry.tag);

  const criteria = [
    { requirement: requirements[0], text: 'A create tool rejects a call with no class', tag: 'unit' },
    {
      requirement: requirements[0],
      text: 'a skill composes a statement rather than calling a tool',
      polarity: 'must_not',
      tag: 'unit',
    },
    { requirement: requirements[3], text: 'A read of one spec returns within a second', tag: 'integration' },
    { requirement: requirements[4], text: 'The suite runs from one command', tag: 'feature' },
    { requirement: requirements[5], text: 'The manifest declares no dependencies', tag: 'unit' },
  ].map(({ requirement, tag, ...fields }, position) => {
    const criterion = call.create_acceptance_criterion({
      requirement_id: requirement.id,
      position,
      ...fields,
    });
    call.create_criterion_approach({ criterion_id: criterion.id, tag });
    return { criterion, tag };
  });

  // Section 4: the decision, its options and the axes they were weighed on.
  const adr = call.create_adr({
    slug: 'sqlite-store',
    title: 'SQLite as the store',
    parent_id: spec.id,
    decision: 'Planning state lives in one SQLite database, rendered one way to markdown.',
  });
  const chosen = call.create_adr_option({
    adr_id: adr.id,
    name: 'SQLite',
    chosen: true,
    rationale: 'It ships with the runtime.',
    position: 0,
  });
  call.create_adr_option({ adr_id: adr.id, name: 'Markdown', position: 1 });
  call.create_adr_option_tradeoff({
    option_id: chosen.id,
    axis: 'Install cost',
    assessment: 'None — no package to add.',
  });

  // Accepted once an option is chosen, which is the order the guard on `DETAIL.adr` requires.
  call.update_adr({ id: adr.id, decision_status: 'accepted' });

  // Section 5 and Step 6c: the prose sections.
  call.create_document_section({
    document_id: spec.id,
    heading: 'Scope Boundary',
    body: 'In scope: the store and the tools. Out of scope: a web view.',
    position: 1,
  });
  call.create_document_section({
    document_id: spec.id,
    heading: 'Integration Boundaries',
    body: 'The tool schemas are the write contract.',
    position: 2,
  });

  call.update_session({ id: startup.session, phase: 'Section 7', state: '{"sections":7}' });

  // Section 7: the review reads rows.
  const review = {
    spec: call.read_spec({ id: spec.id }),
    requirements: call.list_requirement({ spec_id: spec.id, limit: 100 }).items,
    criteria: requirements.flatMap((requirement) =>
      call.list_acceptance_criterion({ requirement_id: requirement.id, include_body: true }).items),
    decisions: call.list_adr({ parent_id: spec.id }).items,
    sections: call.list_document_section({ document_id: spec.id, include_body: true }).items,
  };

  call.update_spec({ id: spec.id, status: 'complete' });
  const approved = call.read_spec({ id: spec.id });

  // A published companion, recorded only once it has an address.
  const artifact = call.create_artifact({
    url: 'https://example.invalid/spec',
    title: 'Requirement explorer',
    published_at: '2026-08-09T00:00:00.000Z',
  });
  call.create_artifact_document({ artifact_id: artifact.id, document_id: spec.id });

  return { spec, requirements, criteria, approaches, adr, review, approved, constraints, observations };
}

test('a spec run writes the document, its classed requirements and its tagged criteria through create tools', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used, passed } = recorder(tools);

  const fixture = project(tools);
  const result = { ...run(call, fixture), passed };

  // The startup discoveries found what a glob used to find.
  assert.equal(result.constraints.heading, 'Constraints');
  assert.match(result.constraints.body, /no package manager/,
    'the problem brief\'s constraints reached the run, so Step 3a starts from what was captured');
  assert.equal(result.observations.length, 1,
    'the retired observation was left out by its own row, with nothing parsed to find out');

  // Class and band are values on the row, and survive a label that says nothing about either.
  const byLabel = Object.fromEntries(result.review.requirements.map((row) => [row.label, row]));
  assert.equal(byLabel.FR1.class, 'functional');
  assert.equal(byLabel.FR1.moscow, 'must');
  assert.equal(byLabel.NFR1.class, 'non_functional');
  assert.equal(byLabel.ENV1.class, 'environmental_requirement');
  assert.equal(byLabel.ENVX1.class, 'environmental_restriction');
  assert.equal(byLabel.FR3.moscow, 'wont');
  assert.equal(byLabel.FR3.exclusion, 'deferred',
    'a deferred requirement is recognisable as one, rather than counting as an outstanding gap');

  // A rejected behaviour is a polarity, not the words "must NOT" at the front of the text.
  const rejected = result.review.criteria.filter((row) => row.polarity === 'must_not');
  assert.equal(rejected.length, 1);
  assert.doesNotMatch(rejected[0].text, /must\s*NOT/i,
    'the rejection is carried by the column, so the text does not have to state it');

  // Every criterion carries a tag drawn from the project's own vocabulary.
  const tags = db.prepare('SELECT criterion_id, tag FROM criterion_approach').all();
  assert.equal(tags.length, result.criteria.length);
  for (const { tag } of tags) {
    assert.ok(result.approaches.includes(tag), `${tag} is a term list_test_approach offered`);
  }

  // The graph reads back whole through the read tools. The review sees `pending` because the
  // status is what the gate decides — approval is the write, not a formality after one.
  assert.equal(result.review.spec.status, 'pending');
  assert.equal(result.approved.status, 'complete');
  assert.equal(result.review.requirements.length, 6);
  assert.equal(result.review.criteria.length, 5);
  assert.equal(result.review.decisions.length, 1);
  assert.deepEqual(result.review.sections.map((row) => row.heading),
    ['Problem Statement', 'Scope Boundary', 'Integration Boundaries']);

  // The three directions of the binding to the file, all reported at once.
  assert.deepEqual(bindings(source, tools, { used, passed: result.passed }), []);
});

test('the facilitation survives: scope gates, the testing strategy is produced, and an untestable criterion is refused', () => {
  const front = frontMatter(source);
  assert.equal(front.name, SKILL);
  // **The invocation form is read across all twenty-three, not here.** Under Claude Code this line
  // said `Triggers on "/dpm:spec"`; `skill-invocation.test.js` now holds every description to the
  // sentence naming its own registered id, with the control that the reading tells a wrong id from
  // a right one, and `skill-port.test.js` sweeps the corpus for the slash form. A per-skill copy of
  // either was a second place to keep in step and a weaker claim than both.

  const scope = section(source, 'Scope boundary');
  assert.match(scope, /in scope[\s\S]*out of scope[\s\S]*deferred/i,
    'the three-way boundary is still what the section produces');
  assert.match(scope, /\bgate\b/i, 'and it is still gated before anything is recorded');

  const strategy = section(source, 'Testing strategy');
  assert.notEqual(strategy, '', 'Section 6 is still a section');
  for (const step of ['Step 6a', 'Step 6b', 'Step 6c', 'Step 6d']) {
    assert.notEqual(section(source, step), '', `${step} still exists`);
  }
  assert.match(section(source, 'Step 6a'), /list_test_approach/,
    'the vocabulary is still confirmed with the user before tags are assigned');
  assert.match(section(source, 'Step 6b'), /create_criterion_approach/,
    'and every criterion still gets a tag written as a row');

  // The refusal is asserted in the two steps that own one, because a refusal stated once in a
  // guideline and absent from the step is a refusal the run reaches and does not make.
  for (const step of ['Step 6b', 'Step 3a']) {
    assert.match(section(source, step), /\brefuse\b/i,
      `${step} still refuses rather than recording something nobody can check`);
  }
  assert.match(section(source, 'Step 6b'), /vague|cannot be checked/i,
    'and the refusal is about a criterion that cannot be checked, not about some other failure');
  assert.match(section(source, 'Step 3a'), /blocks this step/i,
    'Step 3a still fails closed rather than proceeding');
});

/**
 * `spec` is where this defect was found, so its own file keeps the check as well as the corpus.
 *
 * `spec` gates at **section** granularity — *"Gate each section with `AskUserQuestion`"* — and its
 * `####` steps sit inside sections rather than being them, so that rule reaches none of the six.
 * Steps 6a and 6d record nothing and are gateless on purpose; 3a, 6b and 6c write, and each carries
 * its own gate. `skills-gates.test.js` holds the property and its controls, this holds the file.
 */
test('every one of spec\'s #### steps that records rows gates first', () => {
  assert.deepEqual(ungated(source), []);

  // Planted, per retro 41: with every step gated, a gateless one has to be manufactured for the
  // complaint to be observable at all. A comment claiming it would fire is not evidence.
  const planted = `${source}\n#### Step 6f: Record the leftovers\n\n`
    + `Present them, **propose** an order, then record with \`${CALLABLE}create_document_section\`.\n`;

  assert.deepEqual(ungated(planted), [{ heading: 'Step 6f: Record the leftovers', depth: 4 }]);
});

test('must NOT — the skill recovers an entity by reading a generated markdown file', () => {
  // `RECOVERY` in `support/skills.js` carries the patterns and the reason a markdown-table check
  // is deliberately not among them — Step 3a's requirement/restriction grid is exactly the
  // facilitation aid such a check would fail.
  assert.deepEqual(recoveries(source), []);

  // The positive half: every discovery the skill does make goes through a list or read tool. The
  // step is read through `reachable`, because a step that delegates to a shared procedure names the
  // tools by citing it — and a citation the run cannot follow to a named tool is what this catches.
  for (const step of ['Prior decisions', 'Constraint inheritance', 'Retro awareness', 'Library']) {
    assert.match(reachable(section(source, step)), /(list|read)_[a-z_]+/,
      `${step} recovers what it needs by calling a tool`);
  }
});
