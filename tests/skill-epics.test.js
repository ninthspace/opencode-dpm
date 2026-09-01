/**
 * Epic 47-06 Story 2 — the converted `epics`, and the five claims made about it.
 *
 * - "An epics run allocates every epic number through the allocation tool, and writes stories,
 *   tasks, criteria and coverage rows through create tools" [feature]
 * - "The coverage matrix is a projection of `coverage` rows, not a file the skill writes — the
 *   skill emits no markdown table" [integration]
 * - "A story the run marks for planning is written with the `plan` argument set, and its title
 *   carries no marker" [feature]
 * - "The facilitation survives: the run still gates on the epic grouping before writing any story,
 *   still carries every must-NOT the source spec states into a story criterion, and still refuses
 *   to attach a criterion it cannot trace to spec text" [feature]
 * - "must NOT — the skill recovers an entity by reading a generated markdown file rather than by
 *   calling a read tool" [unit]
 *
 * **The `spec` fixture below is what `spec` leaves behind, not a convenience.** Story 2's whole
 * subject is the handoff: `epics` reads requirements, their criteria, their polarities and their
 * approach tags, and binds them to story criteria it writes. A fixture that seeded only
 * requirements would let the propagation assertions pass over nothing.
 *
 * **The binding to the file is the same three directions `skill-spec.test.js` uses** — every tool
 * the file names is real, every tool the run drove is named, and every fixed-vocabulary argument
 * the run supplied is named. See `support/skills.js` for why the third exists.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import { renderDocument } from '../src/projection/index.ts';
import {
  skillSource, frontMatter, section, recorder, recoveries, sweep, bindings, reachable, seedStartup,
  driveStartup,
} from './support/skills.js';

const SKILL = 'dpm-epics';
const source = skillSource(SKILL);

/**
 * A requirement whose two halves are separable, written as its two halves.
 *
 * `CONNECTIVE` positions the requirement and requires nothing; `OBLIGATION` is what it requires.
 * Both are verbatim slices of the text below, so Step 3d's substring rule accepts either and the
 * choice between them is the whole of what this story is about — which is why the halves are named
 * here rather than sliced out of a finished sentence at the assertion. A test that carved the
 * clause back out would be re-deriving the split it is checking the skill made.
 */
const CONNECTIVE = 'Building on the session work above,';
const OBLIGATION = 'the store refuses a second write of the same binding';

/** The step that binds, read once — four tests below ask different things of the same prose. */
const BINDING_STEP = section(source, 'Step 3d');

/** A requirement's text, quoted so `spec_fragment` can be a verbatim slice of it. */
const REQUIREMENTS = [
  {
    label: 'FR1',
    class: 'functional',
    moscow: 'must',
    text: 'A user creates a session by submitting valid credentials, and reaches the dashboard.',
  },
  {
    label: 'FR2',
    class: 'functional',
    moscow: 'should',
    text: 'A dump of the store is byte-stable across machines.',
  },
  {
    label: 'ENV1',
    class: 'environmental_requirement',
    text: 'A test runner is available with no install step.',
  },
  // Last, so the three requirements above keep the positions the fixture's criteria index by.
  {
    label: 'FR3',
    class: 'functional',
    moscow: 'must',
    text: `${CONNECTIVE} ${OBLIGATION}.`,
  },
];

/**
 * The project an epics run starts in: a spec written the way `spec` writes one, plus the library,
 * decision and retro rows the startup discoveries look for.
 *
 * Written with the raw handlers rather than the recorded ones — none of it is this skill's work,
 * and a fixture write counted as a run write would demand the file name `create_spec`.
 */
function project(tools) {
  const seed = handlers(tools);

  const spec = seed.create_spec({ slug: 'sessions', title: 'Sessions' });
  seed.create_document_section({
    document_id: spec.id,
    heading: 'Scope Boundary',
    body: 'In scope: the session lifecycle. Out of scope: a password reset flow.',
    position: 0,
  });

  const requirements = REQUIREMENTS.map((fields, position) =>
    seed.create_requirement({ spec_id: spec.id, position, ...fields }));

  // FR1 carries a positive criterion and a rejection; the rejection is the one Step 3 has to
  // propagate, and it is the whole of what the second facilitation clause asserts.
  const criteria = [
    { requirement: requirements[0], text: 'A valid credential pair returns a session token', tag: 'integration' },
    {
      requirement: requirements[0],
      text: 'a credential reaches a log line',
      polarity: 'must_not',
      tag: 'unit',
    },
    { requirement: requirements[1], text: 'Two dumps of one state are identical', tag: 'unit' },
    { requirement: requirements[2], text: 'The suite runs from one command', tag: 'feature' },
  ].map(({ requirement, tag, ...fields }, position) => {
    const criterion = seed.create_acceptance_criterion({
      requirement_id: requirement.id,
      position,
      ...fields,
    });
    seed.create_criterion_approach({ criterion_id: criterion.id, tag });
    return criterion;
  });

  // Created proposed, given its chosen option, then promoted — the order `create_adr` now requires,
  // because an ADR has no options at the moment it is created and an accepted one must have a
  // chosen option. What this test asserts about the ADR is only that `epics` lists it.
  const adr = seed.create_adr({
    slug: 'token-store',
    title: 'Tokens in the session table',
    parent_id: spec.id,
    decision: 'A session token is a row, not a signed blob.',
  });

  seed.create_adr_option({ adr_id: adr.id, name: 'A row', chosen: true, position: 0 });
  seed.update_adr({ id: adr.id, decision_status: 'accepted' });

  const startup = seedStartup(seed, {
    scope: 'epics',
    skill: 'dpm:epics',
    phase: 'Step 2',
    live: ['A story spanning four components ran to twice its estimate.'],
  });

  return { spec, requirements, criteria, adr, ...startup };
}

/**
 * The run the SKILL.md prescribes, start to finish, through the recorded dispatcher.
 *
 * Two epics, because the number the second one gets is the whole of the allocation claim: a run
 * producing one epic cannot tell an allocated sequence from a constant.
 */
function run(call, fixture) {
  // Startup: session, library and retro awareness. No roster — this skill runs no Perspectives
  // step, so `list_agent` is a call it would never make.
  const startup = driveStartup(call, fixture, {
    scope: 'epics', skill: 'dpm:epics', roster: false,
  });

  const observations = startup.observations.map((entry) => entry.observation);

  // Step 1: the source, read as rows.
  call.list_spec({});
  const spec = call.read_spec({ id: fixture.spec.id });
  call.list_adr({ parent_id: spec.id });
  call.list_document_section({ document_id: spec.id, include_body: true });

  const requirements = call.list_requirement({ spec_id: spec.id, limit: 100 }).items;

  // The spec side of the handoff: each requirement's criteria, their polarities and their tags.
  const specCriteria = requirements.flatMap((requirement) =>
    call.list_acceptance_criterion({ requirement_id: requirement.id, include_body: true }).items
      .map((criterion) => ({
        requirement,
        criterion,
        tags: call.list_criterion_approach({ criterion_id: criterion.id }).items.map((row) => row.tag),
      })));

  call.list_test_approach({});

  // Step 2: the grouping is gated, then each epic is created — number allocated, never supplied.
  const epics = [
    { slug: 'session-lifecycle', title: 'Session lifecycle' },
    { slug: 'store-durability', title: 'Store durability' },
  ].map((fields) => call.create_epic({ parent_id: spec.id, ...fields }));

  const matrices = epics.map((epic) =>
    call.create_coverage_matrix({
      parent_id: epic.id,
      slug: `${epic.slug}-coverage`,
      title: `Coverage Matrix: ${epic.title}`,
    }));

  call.create_dependency({
    kind: 'blocks',
    source_document_id: epics[0].id,
    target_document_id: epics[1].id,
  });

  call.create_document_section({
    document_id: epics[0].id,
    heading: 'Context',
    body: 'The lifecycle lands first; durability builds on the rows it writes.',
    position: 0,
  });

  // Step 3: stories. The first is marked for planning — a value, and nothing in its title.
  const planned = call.create_story({
    epic_id: epics[0].id,
    number: 1,
    title: 'Issue a session on valid credentials',
    position: 0,
    plan: 1,
  });
  const plain = call.create_story({
    epic_id: epics[0].id,
    number: 2,
    title: 'Reach the dashboard from a live session',
    position: 1,
  });

  call.create_dependency({
    kind: 'blocks',
    source_story_id: planned.id,
    target_story_id: plain.id,
  });

  // Criteria: the spec's own, propagated with their polarity and their tags intact.
  const storyCriteria = [];

  for (const [position, { criterion, tags }] of specCriteria
    .filter(({ requirement }) => requirement.label === 'FR1').entries()) {
    const written = call.create_story_criterion({
      story_id: planned.id,
      text: criterion.text,
      polarity: criterion.polarity,
      position,
    });

    for (const tag of tags) {
      call.create_story_criterion_approach({ story_criterion_id: written.id, tag });
    }

    storyCriteria.push({ written, source: criterion, requirement: 'FR1' });
  }

  // One criterion the story adds beyond the spec's, tagged by the default rather than propagated.
  const affordance = call.create_story_criterion({
    story_id: planned.id,
    text: 'The sign-in page posts to the session route and renders its errors in place',
    position: storyCriteria.length,
  });
  call.create_story_criterion_approach({ story_criterion_id: affordance.id, tag: 'feature' });

  // The criterion delivering FR3, whose requirement positions itself in one clause and obliges
  // something in another. It is bound below to the obligation, which is the choice Step 3d steers.
  const obligation = call.create_story_criterion({
    story_id: plain.id,
    text: 'A second write of the same binding is refused, and the first stays readable',
    position: 0,
  });
  call.create_story_criterion_approach({ story_criterion_id: obligation.id, tag: 'integration' });

  // Step 3b: tasks, and the testing task the automated tags earn.
  call.create_task({
    story_id: planned.id,
    number: 1,
    title: 'Add the session route',
    description: 'Covers the token criterion, not the affordance one.',
    position: 0,
  });
  call.create_task({
    story_id: planned.id,
    number: 2,
    title: 'Write tests for Issue a session on valid credentials',
    description: 'Covers the criteria tagged unit, integration or feature.',
    position: 1,
  });

  // Step 3d: the bindings. Every fragment is a verbatim slice of its requirement's own text.
  const fr1 = requirements.find((row) => row.label === 'FR1');

  const coverage = [
    {
      criterion: storyCriteria[0].written,
      fragment: 'submitting valid credentials',
    },
    {
      criterion: storyCriteria[1].written,
      fragment: 'submitting valid credentials',
    },
    {
      criterion: affordance,
      fragment: 'reaches the dashboard',
    },
  ].map(({ criterion, fragment }, position) => call.create_coverage({
    requirement_id: fr1.id,
    spec_fragment: fragment,
    story_criterion_id: criterion.id,
    position,
  }));

  // FR3's binding, quoted from the clause that carries the obligation rather than from the one
  // that positions the requirement. Both are verbatim slices of the same sentence, so the write
  // accepts either and the difference is entirely the step's judgement.
  const fr3 = requirements.find((row) => row.label === 'FR3');
  const obligationBinding = call.create_coverage({
    requirement_id: fr3.id,
    spec_fragment: 'refuses a second write of the same binding',
    story_criterion_id: obligation.id,
    position: 0,
  });

  // One row a second story also delivers — the rare case the join exists for.
  call.create_coverage_story({ coverage_id: coverage[2].id, story_id: plain.id });

  call.update_session({ id: startup.session, phase: 'Step 4', state: '{"epics":2}' });

  // Step 4: the gap check, as a query over the spec rather than a sum of what was just written.
  const gaps = requirements
    .filter((requirement) => requirement.moscow === 'must'
      || requirement.class.startsWith('environmental_'))
    .filter((requirement) => call.list_coverage({ requirement_id: requirement.id }).items.length === 0);

  // And the tree read back off the rows rather than repeated from what was sent.
  const tree = epics.map((epic) => ({
    epic,
    stories: call.list_story({ epic_id: epic.id }).items.map((story) => ({
      story,
      tasks: call.list_task({ story_id: story.id }).items,
      criteria: call.list_story_criterion({ story_id: story.id, include_body: true }).items,
    })),
  }));

  return {
    spec, requirements, specCriteria, epics, matrices, planned, plain, storyCriteria, affordance,
    coverage, gaps, observations, tree, fr3, obligation, obligationBinding,
  };
}

test('an epics run allocates its epic numbers and writes the breakdown through create tools', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used, passed } = recorder(tools);

  const fixture = project(tools);
  const result = run(call, fixture);

  // The number is allocated, and the claim is checked at the boundary as well as in the result:
  // a tool that cannot accept a number cannot be handed one by a future edit either.
  const create = tools.find((tool) => tool.name === 'create_epic');
  for (const column of ['number', 'sequence']) {
    assert.ok(!(column in create.inputSchema.properties),
      `create_epic accepts ${column} — a caller could hand back one already issued`);
  }
  assert.ok(!passed.get('create_epic').has('number'));
  assert.deepEqual(result.epics.map((epic) => epic.sequence), [1, 2],
    'the second epic got the next number, so the counter is doing the work');

  // The startup discovery found what a directory read used to find.
  assert.equal(result.observations.length, 1,
    'the retired observation was left out by its own row, with nothing parsed to find out');

  // The graph reads back whole through the read tools — the tree Step 4 presents.
  const [lifecycle] = result.tree;
  assert.deepEqual(lifecycle.stories.map((entry) => entry.story.number), [1, 2]);
  assert.equal(lifecycle.stories[0].tasks.length, 2);
  assert.equal(lifecycle.stories[0].criteria.length, 3);

  const bound = call.list_coverage({ requirement_id: result.requirements[0].id }).items;
  assert.equal(bound.length, 3, 'three criteria bound to FR1, each independently verifiable');
  for (const row of bound) {
    assert.equal(row.verified_at, null, 'a fresh binding is unverified — the mark is execution\'s');
  }

  // The gap check is a query, and it answers correctly: FR2 and ENV1 have no bindings, and only
  // ENV1 is a gap by class since FR2 is a should-have.
  assert.deepEqual(result.gaps.map((row) => row.label), ['ENV1']);

  // The three directions of the binding to the file, all reported at once.
  assert.deepEqual(bindings(source, tools, { used, passed }), []);
});

test('the coverage matrix is a projection of the rows, and the skill emits no table', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);

  const fixture = project(tools);
  const result = run(call, fixture);

  const { text } = renderDocument(db, result.matrices[0].id);

  // The rendered matrix carries what the skill would otherwise have composed: the requirement,
  // a verbatim fragment, the criterion, the delivering stories, the tags and the ✓ column.
  assert.match(text, /\| Requirement \| Spec Text \| Story Criterion \| Covered by \| Test Approach \| Verified \|/);
  assert.match(text, /submitting valid credentials/);
  assert.match(text, /A valid credential pair returns a session token/);
  assert.match(text, /Story 1, Story 2/, 'the second delivering story reached the row');
  assert.match(text, /`\[integration\]`/);

  // The ✓ is the verification pair rendered, and nothing has been verified yet.
  assert.doesNotMatch(text, /✓/);

  // And the other half of the criterion: the step that owns the matrix writes rows and nothing
  // else. Scoped to that step rather than swept over the file, because a facilitation table the
  // skill *shows the user* is legitimate and a check that cannot tell the two apart would be
  // silenced by deleting one.
  const step = BINDING_STEP;
  assert.notEqual(step, '', 'Step 3d still exists');
  assert.doesNotMatch(step, /\|\s*-{3}/, 'the step composes no table');
  assert.doesNotMatch(step, /✓/, 'and records no verification mark');
  assert.match(step, /create_coverage\b/, 'it writes rows');
  assert.match(source, /create_coverage_matrix/,
    'and the matrix document exists, so the rows have somewhere to render');
});

test('a story marked for planning carries it as a value, and its title carries no marker', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);

  const fixture = project(tools);
  const result = run(call, fixture);

  assert.equal(call.read_story({ id: result.planned.id }).plan, 1);
  assert.equal(call.read_story({ id: result.plain.id }).plan, 0, 'the default is off, not absent');

  for (const story of [result.planned, result.plain]) {
    const read = call.read_story({ id: story.id });
    assert.equal(read.title, story.title);
    assert.doesNotMatch(read.title, /\[plan\]/, 'the mark is a column, never a suffix on the title');
  }

  // The projected epic renders the story heading, which is where a marker would surface if the
  // title had ever carried one.
  const { text } = renderDocument(db, result.epics[0].id);
  assert.match(text, /## Story 1 — Issue a session on valid credentials\s*$/m);

  // And the file instructs the run to set it, in the step that writes the story.
  assert.match(section(source, 'Step 3'), /`plan: 1`/,
    'Step 3 still marks a story for planning as an argument');
});

test('the facilitation survives: the grouping gates, rejections propagate, and an untraceable binding is refused', (t) => {
  const front = frontMatter(source);
  assert.equal(front.name, SKILL);
  // The v2 invocation form is `skill-invocation.test.js`'s, over all twenty-three descriptions and
  // with the control this pair had no room for; the slash form is `skill-port.test.js`'s corpus
  // sweep. Neither is repeated here.

  // The grouping gate, and that it comes before any story is written — which is the part that
  // makes it worth having, and the part a reordering would quietly lose.
  const grouping = section(source, 'Step 2');
  assert.match(grouping, /\bgate\b/i);
  assert.match(grouping, /before any story is written/i);
  assert.match(grouping, /Approve.*Request changes.*Stop/);

  // The rejection-propagation rule, in the step that writes criteria.
  const stories = section(source, 'Step 3');
  assert.match(stories, /must_not/, 'a rejection is still a polarity rather than a prefix');
  assert.match(stories, /list_acceptance_criterion/,
    'and the spec\'s own rejections are still read back before stories are written');

  // The refusal, in the step that binds.
  assert.match(BINDING_STEP, /\brefuse\b/i);
  assert.match(BINDING_STEP, /verbatim/i,
    'and the refusal is about a fragment that cannot be traced, not some other failure');

  // The other refusal the conversion had to keep: a criterion nobody can check.
  assert.match(stories, /\brefuse\b/i);
});

// --- Epic 04-05 Story 2: the fragment is quoted from the clause that obliges ---------------------

/**
 * The phrasings that would turn the steer into a relaxation of the refusal above it.
 *
 * The steer and the refusal sit in the same step and pull the same way — *prefer this traceable
 * fragment to that one* is not *a fragment need not be traceable* — but they are one edit apart,
 * and the edit reads as a clarification while it is being made. Held as patterns rather than as
 * one `doesNotMatch`, so a failure names the sentence that did it.
 */
const WEAKENED = [
  { pattern: /need not be (a )?verbatim/i, why: 'a fragment excused from being verbatim' },
  { pattern: /paraphras\w*\s+(is|are)\s+(acceptable|allowed|fine|permitted)/i, why: 'a paraphrase admitted as a fragment' },
  { pattern: /approximate\w*\s+quot/i, why: 'a quotation that need not match' },
  { pattern: /close enough to the (requirement|text)/i, why: 'a fragment judged by resemblance' },
];

test('Step 3d steers the fragment to the obligation and says what connective wording costs', () => {
  const step = BINDING_STEP;

  assert.match(step, /Quote the clause that carries the obligation/,
    'the step does not say which clause to quote');
  assert.match(step, /Connective\s+phrasing is scaffolding around the requirement/,
    'the step names the preference without saying what makes the two halves differ');
  assert.match(step, /the first\s+thing a later pivot rewrites/,
    'the reason is not that connective wording is worse writing — it is that it is what gets amended');
  assert.match(step, /goes stale on an\s+amendment that changed nothing the story delivers/,
    'the consequence a reader is being asked to avoid is not stated');
});

test('a run binds the clause that obliges, over a clause the substring rule would equally accept', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);

  const fixture = project(tools);
  const result = run(call, fixture);

  const bound = call.read_coverage({ id: result.obligationBinding.id, include_body: true });
  const text = call.read_requirement({ id: result.fr3.id, include_body: true }).text;

  assert.ok(OBLIGATION.includes(bound.spec_fragment),
    'the bound fragment is not inside the clause that carries the obligation');
  assert.ok(!CONNECTIVE.includes(bound.spec_fragment),
    'the bound fragment came from the wording that positions the requirement');

  // **The control, and the reason the two lines above are a judgement rather than an accident.**
  // A fragment taken from the connective half is a verbatim substring of the same requirement, so
  // Step 3d's existing rule accepts it and the integrity register never reports it. Nothing but the
  // steer separates the two, which is what makes the steer worth writing.
  assert.ok(text.includes(CONNECTIVE),
    'the connective half is not verbatim text, so the fixture poses no choice');
  assert.ok(text.includes(bound.spec_fragment),
    'and the bound fragment is verbatim too — both halves satisfy the rule');

  // The run's own binding is live and sound, which is what integrity entry 9 asks of it.
  assert.equal(bound.retired_at, null);
});

test('must NOT — the steer does not excuse a fragment from being traceable to spec text', () => {
  const step = BINDING_STEP;

  // The refusal the steer sits beside, still stated in the step that binds.
  assert.match(step, /\brefuse\b/i, 'the untraceable-fragment refusal has gone');
  assert.match(step, /A fragment appearing nowhere in its requirement/,
    'the refusal no longer says what it refuses');
  assert.match(step, /steer between traceable fragments and not a loosening/,
    'nothing in the step says which of the two rules gives way, so a reader has to guess');

  assert.deepEqual(sweep(step, WEAKENED), [], 'the step admits a fragment that is not spec text');

  // The control. Assembled rather than written, so this file does not contain the sentence it
  // forbids — and run through the same reading, so a pattern that stopped matching is not
  // indistinguishable from a step that stayed clean.
  const relaxed = `${step}\n\nWhere no clause fits, a fragment `
    + 'need not be verbatim: an approximate quotation of the obligation is enough.';

  assert.equal(sweep(relaxed, WEAKENED).length, 2,
    'the sweep passed a step excusing a fragment from being verbatim and admitting an approximation');
});

test('the run carries every rejection the spec states into a story criterion', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);

  const fixture = project(tools);
  const result = run(call, fixture);

  const rejected = result.specCriteria
    .filter(({ criterion }) => criterion.polarity === 'must_not')
    .filter(({ requirement }) => requirement.label === 'FR1');

  assert.equal(rejected.length, 1, 'the fixture states one, so there is something to lose');

  const written = result.tree[0].stories.find((entry) => entry.story.id === result.planned.id).criteria;
  const carried = written.filter((row) => row.polarity === 'must_not');

  assert.equal(carried.length, rejected.length);
  assert.deepEqual(carried.map((row) => row.text), rejected.map(({ criterion }) => criterion.text),
    'propagating a rejection is transcription — the wording is the boundary someone argued for');

  for (const row of carried) {
    assert.doesNotMatch(row.text, /must\s*NOT/i,
      'and the rejection is carried by the column, so the text does not have to state it');
  }
});

test('must NOT — the skill recovers an entity by reading a generated markdown file', () => {
  assert.deepEqual(recoveries(source), []);

  // The positive half: every discovery the skill makes goes through a list or read tool. The step is
  // read through `reachable`, because a step that delegates to a shared procedure names the tools by
  // citing it — and a citation the run cannot follow to a named tool is the failure this catches.
  for (const step of ['Session', 'Library', 'Prior decisions', 'Retro awareness', 'Step 1', 'Step 4']) {
    assert.match(reachable(section(source, step)), /(list|read)_[a-z_]+/,
      `${step} recovers what it needs by calling a tool`);
  }
});
