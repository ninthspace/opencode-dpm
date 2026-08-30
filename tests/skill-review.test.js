/**
 * Epic 47-07 Story 4 — the converted `review`, and the five claims made about it.
 *
 * - "A review run writes `review` with its `scope` and `scope_story_id`, `document_agent` rows
 *   referencing `agent` rows rather than carrying persona names as text, and `finding` rows with
 *   severity and category as taxonomy references" [feature]
 * - "A story-scoped review parents onto the epic and narrows by `scope_story_id`, rather than
 *   appending `-s2` to a filename" [integration]
 * - "The facilitation survives: agent selection still includes one reviewer challenging business
 *   value and one challenging technical approach, and the finding stage still reports
 *   comprehensively before the ranking stage curates" [feature]
 * - "A review run loads its roster from the `agent` table with no YAML parse, so a persona a
 *   project added and the plugin never shipped is offered to agent selection with no plugin change
 *   and no file edit" [feature]
 * - "must NOT — the skill recovers an entity by reading a generated markdown file rather than by
 *   calling a read tool" [unit]
 *
 * **The fourth claim is this epic's share of FR24's persona sentence.** Epic 47-05 built and
 * verified the tool half; what this asserts is the skill half — that a run's panel comes from the
 * table it queries and not from a list the file carries. The fixture therefore adds a persona no
 * seed contains, and the run has to reach it without being told it is there.
 *
 * **The second claim is checked against the projection as well as the row.** `scope_story_id` says
 * the review narrowed; only rendering shows that the narrowing did not become a filename, which is
 * the thing the criterion is actually about.
 *
 * **The binding to the file is the three directions every conversion uses.** See
 * `support/skills.js`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import { project } from '../src/projection/index.ts';
import {
  skillSource, toolNames, section, prose, recorder, recoveries, bindings, reachable, seedStartup,
  driveStartup,
} from './support/skills.js';
import { dispositionProblems } from './support/vocabulary.js';

const SKILL = 'review';
const source = skillSource(SKILL);

/** The recoveries this file in particular would reach for, on top of the shared sweep. */
const PARSES = [
  { pattern: /`{3}markdown/, why: 'a document template, which is the projection’s to own' },
  // **The placeholder counts as much as the digit.** A file that says to suffix a slug `-s2` and one
  // that says to suffix it `-s{n}` prescribe the same thing, and only the first has a digit in it —
  // so a pattern anchored on `\d` reads the instruction as absent when it is merely generalised.
  { pattern: /-s(\d|\{\s*\w+\s*\})/, why: 'a story suffix on a slug, which is what `scope_story_id` replaces' },
  { pattern: /roster\.ya?ml|agents\/roster/i, why: 'a roster file, which is a table' },
  { pattern: /highest `?\*?\*?Story/i, why: 'a scan for the highest story number, which is allocation' },
];

/** The persona no seed contains. A run that carried a list of its own would never offer it. */
const ADDED = {
  name: 'roan',
  display_name: 'Roan',
  icon: '🦉',
  role: 'Accessibility specialist',
  personality: 'patient, concrete',
  communication_style: 'plain, one example at a time',
  position: 99,
};

/**
 * What a project holds when someone runs `review`: a spec with a requirement and its criterion, an
 * epic with two stories, a coverage row joining them, an ADR the stories have to respect — and a
 * persona this plugin never shipped.
 */
function workspace(tools) {
  const seed = handlers(tools);

  const spec = seed.create_spec({ slug: 'persistence', title: 'Persistence' });
  const requirement = seed.create_requirement({
    spec_id: spec.id, label: 'FR1', text: 'The system shall persist planning state.',
    class: 'functional', moscow: 'must', position: 0,
  });
  seed.create_acceptance_criterion({
    requirement_id: requirement.id, text: 'A restart loses nothing.', position: 0,
  });

  const adr = seed.create_adr({
    parent_id: spec.id, slug: 'store', title: 'One database per project',
    decision: 'Planning state lives in one SQLite file.',
  });
  seed.create_adr_option({ adr_id: adr.id, name: 'SQLite', chosen: true, position: 0 });
  seed.update_adr({ id: adr.id, decision_status: 'accepted' });

  const epic = seed.create_epic({ parent_id: spec.id, slug: 'spine', title: 'Spine' });
  const stories = ['Substrate', 'Tools'].map((title, position) => seed.create_story({
    epic_id: epic.id, number: position + 1, title, position,
  }));

  seed.create_task({
    story_id: stories[0].id, number: 1, title: 'Write the schema', description: 'The tables.',
    position: 0,
  });
  const criterion = seed.create_story_criterion({
    story_id: stories[0].id, text: 'The schema applies cleanly.', position: 0,
  });
  seed.create_story_criterion_approach({ story_criterion_id: criterion.id, tag: 'unit' });
  seed.create_coverage({
    requirement_id: requirement.id, story_criterion_id: criterion.id, position: 0,
    spec_fragment: 'shall persist planning state',
  });
  seed.create_dependency({ kind: 'blocks', source_story_id: stories[0].id, target_story_id: stories[1].id });

  // The persona the plugin never shipped. Added as a row, exactly as a project would.
  seed.create_agent(ADDED);

  const startup = seedStartup(seed, {
    scope: 'review',
    skill: 'dpm:review',
    phase: 'Step 3',
    live: ['A criterion nobody could test reached implementation before anyone noticed.'],
  });

  return { spec, requirement, adr, epic, stories, criterion, ...startup };
}

/**
 * The run the SKILL.md prescribes: startup, the epic read through its rows, a panel, findings, then
 * the Step 4 gate and the Step 5 remediation.
 *
 * `story` is the story to scope to, or `null` for a whole-epic review. `approved` is the answer at
 * the gate; `remediate` is the answer in Step 5.
 */
function run(call, fixture, { story = null, approved = true, remediate = true, attempt = 1 } = {}) {
  const startup = driveStartup(call, fixture, { scope: 'review', skill: 'dpm:review', attempt });

  // Input: the epic is chosen from the list by id and read through a read tool.
  const offered = call.list_epic({}).items;
  const epic = call.read_epic({ id: fixture.epic.id });

  // Step 1: the artefact through its own rows, then its lineage — nothing matched by name.
  const stories = call.list_story({ epic_id: epic.id }).items.map((row) => ({
    story: row,
    tasks: call.list_task({ story_id: row.id }).items,
    criteria: call.list_story_criterion({ story_id: row.id, include_body: true }).items
      .map((entry) => ({
        criterion: entry,
        approaches: call.list_story_criterion_approach({ story_criterion_id: entry.id }).items,
      })),
  }));

  call.list_dependency({ source_story_id: fixture.stories[0].id });

  const spec = call.read_spec({ id: epic.parent_id });
  const requirements = call.list_requirement({ spec_id: spec.id }).items.map((row) => ({
    requirement: row,
    criteria: call.list_acceptance_criterion({ requirement_id: row.id, include_body: true }).items,
  }));
  const coverage = call.list_coverage({ requirement_id: fixture.requirement.id }).items;
  const decisions = call.list_adr({ parent_id: spec.id }).items.map((row) => call.read_adr({ id: row.id }));

  // Step 2: the panel comes off the roster the startup loaded, and nowhere else.
  const panel = startup.roster.filter((agent) => !agent.retired_at).slice(0, 3);

  // Step 3: categories and severities read rather than remembered.
  const categories = call.list_taxonomy({ domain: 'finding', limit: 50 }).items;
  const severities = call.list_taxonomy({ domain: 'severity', limit: 50 }).items;

  const found = panel.map((agent, index) => ({
    agent: agent.name,
    summary: `Story 1's criterion ${index + 1} cannot be checked as written`,
    category_id: categories[index % categories.length].id,
    severity_id: severities[index % severities.length].id,
  }));

  call.update_session({
    id: startup.session, phase: 'Step 4', state: JSON.stringify({ found: found.length }),
  });

  if (!approved) {
    return { startup, offered, epic, stories, requirements, coverage, decisions, panel, found, review: null };
  }

  const review = call.create_review({
    parent_id: epic.id,
    slug: story === null ? 'spine' : 'spine-substrate',
    title: story === null ? 'Review: spine' : 'Review: Substrate',
    ...(story === null ? {} : { scope: 'story', scope_story_id: story }),
  });

  for (const agent of panel) {
    call.create_document_agent({
      document_id: review.id, document_kind: 'review', agent: agent.name,
    });
  }

  const findings = found.map((finding, position) => call.create_finding({
    review_id: review.id, position, ...finding,
  }));

  if (!remediate) return { startup, offered, epic, stories, requirements, coverage, decisions, panel, found, review, findings, remediation: null };

  // Step 5: the work goes on the epic, and each finding points at the task that answers it.
  const remediation = call.create_story({
    epic_id: epic.id, number: 3, title: 'Address review findings', position: 2,
  });

  const tasks = findings.map((finding, position) => {
    const task = call.create_task({
      story_id: remediation.id, number: position + 1, title: `Fix: ${finding.summary}`,
      description: finding.summary, position,
    });
    call.update_finding({ id: finding.id, remediation_task_id: task.id });
    return task;
  });

  return {
    startup, offered, epic, stories, requirements, coverage, decisions, panel, found, review,
    findings, remediation, tasks,
  };
}

// --- Criterion 1: the review, its panel and its findings are typed rows ----------------------------

test('a review run writes its scope, its panel by reference and its findings by vocabulary', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used, passed } = recorder(tools);

  const fixture = workspace(tools);
  const result = run(call, fixture);

  const raw = handlers(tools);
  const stored = raw.read_review({ id: result.review.id });

  assert.equal(stored.kind, 'review');
  assert.equal(stored.parent_id, fixture.epic.id);
  assert.equal(stored.scope, 'whole');
  assert.equal(stored.scope_story_id, null);

  // **The panel is a reference, not a copy.** Each row names an `agent`, so a persona renamed in
  // the table does not orphan the reviews that cited it.
  const agents = raw.list_document_agent({ document_id: stored.id }).items;
  assert.equal(agents.length, result.panel.length);
  const roster = new Set(raw.list_agent({}).items.map((row) => row.name));
  for (const row of agents) assert.ok(roster.has(row.agent), `${row.agent} is not on the roster`);

  // An agent nobody added is refused rather than stored as text.
  assert.throws(
    () => raw.create_document_agent({
      document_id: stored.id, document_kind: 'review', agent: 'nobody',
    }),
    /FOREIGN KEY/,
    'a review credited a persona that does not exist',
  );

  // **The two vocabularies are separate and the tool knows which is which.**
  const findings = raw.list_finding({ review_id: stored.id, include_body: true }).items;
  assert.equal(findings.length, result.found.length);

  const severity = new Set(raw.list_taxonomy({ domain: 'severity', limit: 50 }).items.map((r) => r.id));
  const category = new Set(raw.list_taxonomy({ domain: 'finding', limit: 50 }).items.map((r) => r.id));

  for (const finding of findings) {
    assert.ok(severity.has(finding.severity_id), `${finding.severity_id} is not a severity`);
    assert.ok(category.has(finding.category_id), `${finding.category_id} is not a finding category`);
    assert.equal(finding.status, 'open', 'a finding was written already dispositioned');
  }

  // A severity in the category slot is refused — the mistake that makes findings unsortable.
  assert.throws(
    () => raw.create_finding({
      review_id: stored.id, position: 99, summary: 'Wrong vocabulary',
      severity_id: [...category][0], category_id: [...severity][0],
    }),
    /FOREIGN KEY/,
    'a severity was accepted in a category slot',
  );

  // Remediation: the finding points at the task, which is both halves of what a table carried.
  const linked = raw.list_finding({ review_id: stored.id }).items;
  assert.ok(linked.every((row) => row.remediation_task_id !== null));
  const tasks = new Set(raw.list_task({ story_id: result.remediation.id }).items.map((row) => row.id));
  for (const row of linked) assert.ok(tasks.has(row.remediation_task_id));

  // **The link is asserted against the file as well as the rows**, because the rows cannot speak for
  // it. `remediation_task_id` is a foreign key rather than an enum, so the binding's valued-argument
  // direction cannot see it, and `mcp__plugin_dpm_dpm__update_finding` is named again two paragraphs later for
  // the rejection path — so a Step 5 that told a run to *tabulate* the pairing instead of writing it
  // passed every test in this file while the run linked the rows regardless of what it was told.
  const remediation = prose(source, 'Step 5: Remediation');
  assert.match(remediation, /`mcp__plugin_dpm_dpm__update_finding` setting `remediation_task_id`/);
  assert.match(remediation, /That link is the whole of the record/);
  assert.ok(passed.get('update_finding').has('remediation_task_id'));

  // And the pairing is the edge and nothing else — a table here is the artefact the edge replaced.
  assert.doesNotMatch(
    section(source, 'Step 5: Remediation'), /\|\s*-{3}/,
    'Step 5 composes a table pairing findings to tasks',
  );

  // The number came from the call, and is not an argument the tool accepts.
  assert.ok(!('number' in tools.find((tool) => tool.name === 'create_review').inputSchema.properties));
  assert.ok(!passed.get('create_review').has('number'));

  // And the write step says the vocabularies are read rather than remembered — a claim no run can
  // make on its own, because a run that hard-coded a term would still have passed a real id.
  const write = prose(source, 'Step 4: Write the review');
  assert.match(write, /come from different vocabularies and the tool knows which/);
  assert.match(write, /refused rather than stored/);
  assert.match(write, /Read the terms rather than remembering them/);

  assert.deepEqual(bindings(source, tools, { used, passed }), []);
});

// --- Criterion 2: scope is a column pair, not a filename suffix ------------------------------------

test('a story-scoped review parents onto the epic and narrows by column', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, passed } = recorder(tools);

  const fixture = workspace(tools);
  const result = run(call, fixture, { story: fixture.stories[0].id });

  const raw = handlers(tools);
  const stored = raw.read_review({ id: result.review.id });

  // Same parent as a whole-epic review would have; the narrowing is elsewhere.
  assert.equal(stored.parent_id, fixture.epic.id);
  assert.equal(stored.parent_kind, 'epic');
  assert.equal(stored.scope, 'story');
  assert.equal(stored.scope_story_id, fixture.stories[0].id);

  // **The pair is set together or not at all**, so a review cannot claim a narrowing it lacks.
  assert.throws(
    () => raw.create_review({ parent_id: fixture.epic.id, slug: 'half', title: 'Half', scope: 'story' }),
    /CHECK constraint/,
    'a story-scoped review was stored without a story',
  );
  assert.throws(
    () => raw.create_review({
      parent_id: fixture.epic.id, slug: 'other', title: 'Other',
      scope_story_id: fixture.stories[1].id,
    }),
    /CHECK constraint/,
    'a whole-epic review was stored carrying a story',
  );

  // And the scope reached no filename: the projection names the review, never the story.
  const files = project(db, { write: false });
  const written = files.written.find((file) => file.text.includes('Review: Substrate'));
  assert.ok(written, 'the review is rendered in no file at all');
  assert.doesNotMatch(written.path, /-s\d/, 'the story scope became a filename suffix');

  const input = prose(source, 'Input');
  assert.match(input, /Scope is a column pair, not a name/);
  assert.match(input, /Both are set together or neither is/);

  // **The write step has to name the pair, not just the Input paragraph that explains it.** `scope`
  // is only supplied on a story-scoped call and `scope_story_id` is a foreign key, so neither
  // direction of the binding sees them here — a Step 4 that told a run to suffix the *slug* instead
  // left every assertion above intact, because the run narrows by column whatever the file says.
  const write = prose(source, 'Step 4: Write the review');
  assert.match(write, /`scope: 'story'` with `scope_story_id`/);
  assert.ok(passed.get('create_review').has('scope_story_id'));
  assert.ok(passed.get('create_review').has('scope'));
});

// --- Criterion 3: the facilitation survives --------------------------------------------------------

test('the panel carries both questions, the finding stage precedes the ranking, and a refused gate writes nothing', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);

  const fixture = workspace(tools);
  const raw = handlers(tools);

  const refused = run(call, fixture, { approved: false });

  assert.equal(refused.review, null);
  assert.deepEqual(raw.list_review({}).items, [], 'a review exists after a gate that refused one');
  assert.deepEqual(raw.list_finding({}).items, [], 'findings were written before the gate answered');

  // It still read the epic through its rows and its lineage through its parent.
  assert.equal(refused.stories.length, 2);
  assert.equal(refused.decisions.length, 1);
  assert.equal(refused.coverage.length, 1);

  // The two mandatory lenses, and that they are mandatory rather than suggested.
  const panel = prose(source, 'Step 2: Select the panel');
  assert.match(panel, /Two are not optional/);
  assert.match(panel, /business value/);
  assert.match(panel, /technical approach/);
  assert.match(panel, /panel of four technical reviewers is a panel with one question/);

  // Find before rank, and the cap on the ranking rather than on the finding.
  const stage = prose(source, 'Step 3: Find, then rank');
  assert.match(stage, /reports \*\*everything\*\* it surfaces/);
  assert.match(stage, /Not curated, not pre-ranked/);
  assert.match(stage, /The cap belongs here and not in the finding stage/);
  assert.match(stage, /what goes unfound cannot be curated back/);
  assert.ok(stage.indexOf('**Find.**') < stage.indexOf('**Rank.**'), 'the ranking precedes the finding');

  for (const [earlier, later] of [
    ['Step 1: Read what is under review', 'Step 2: Select the panel'],
    ['Step 2: Select the panel', 'Step 3: Find, then rank'],
    ['Step 3: Find, then rank', 'Step 4: Write the review'],
    ['Step 4: Write the review', 'Step 5: Remediation'],
  ]) {
    assert.ok(source.indexOf(earlier) < source.indexOf(later), `${earlier} runs after ${later}`);
  }

  const write = prose(source, 'Step 4: Write the review');
  assert.match(write, /`Approve` \/ `Request changes` \/ `Stop`/);
});

// --- Criterion 4: the roster is a table, so a project can add to it --------------------------------

test('a persona the plugin never shipped reaches agent selection', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used } = recorder(tools);

  const fixture = workspace(tools);
  const raw = handlers(tools);

  // The added persona is on the roster the run loads, in the position its row asked for, with no
  // plugin change and no file edit between the insert and the run.
  const roster = raw.list_agent({}).items;
  const added = roster.find((agent) => agent.name === ADDED.name);
  assert.ok(added, 'a persona added to the table never reached the roster');
  assert.equal(added.role, ADDED.role);
  assert.equal(roster.at(-1).name, ADDED.name, 'the added persona did not sort into position');

  // And the run reaches it through the same call, not through a list of its own.
  const result = run(call, fixture);
  assert.ok(used.has('list_agent'), 'the run never asked the table who is available');
  assert.ok(result.startup.roster.some((agent) => agent.name === ADDED.name),
    'the run loaded a roster that does not contain the added persona');

  // A retired persona is skipped because the row says so, not because a file was edited — and
  // retirement is its own tool, so it cannot be reached by an ordinary update.
  assert.ok(!('retired_at' in tools.find((tool) => tool.name === 'update_agent').inputSchema.properties));
  raw.retire_agent({ name: ADDED.name });
  const after = raw.list_agent({}).items.find((agent) => agent.name === ADDED.name);
  assert.ok(after === undefined || after.retired_at !== null,
    'a retired persona is still offered as available');

  // The file says the roster is the whole of the panel, which is what stops one being carried.
  const startup = prose(source, 'Roster');
  assert.match(startup, /The roster is rows, so a project can add to it/);
  assert.match(startup, /no plugin change and no file edit/);
  assert.match(startup, /Do not invent a trait/);
});

// --- Criterion 5 (must NOT): no recovery by reading what was written --------------------------------

test('the skill recovers nothing by reading a generated file', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  assert.deepEqual(recoveries(source, PARSES), []);

  const known = new Set(tools.map((tool) => tool.name));
  const named = toolNames(reachable(source));

  for (const required of ['list_epic', 'read_epic', 'list_story', 'list_task',
    'list_story_criterion', 'read_spec', 'list_requirement', 'list_coverage', 'list_adr',
    'list_agent', 'list_taxonomy', 'create_review', 'create_document_agent', 'create_finding',
    'update_finding', 'create_story', 'create_task']) {
    assert.ok(named.includes(required), `the skill never names ${required}`);
    assert.ok(known.has(required), `${required} is not a tool`);
  }

  // The control: a file that reaches for the old file-and-suffix shape is caught by the same reading.
  const regressed = `${source}\n\nSave to docs/reviews/{nn}-review-{slug}.md, appending -s2 for a `
    + 'story review, and read the roster from agents/roster.yaml.';

  assert.ok(recoveries(regressed, PARSES).length >= 4,
    'the sweep passed a file that names a path, builds a filename, suffixes a story and parses a roster');
});

// --- Spec 50 FR6: each finding's disposition comes from its own two columns ----------------------

test('remediation reports each finding under the disposition its columns give it', () => {
  const step = section(source, 'Step 5: Remediation');

  assert.notEqual(step, '', 'the remediation step still exists');
  assert.deepEqual(dispositionProblems(step, 'review Step 5'), []);

  // The site-specific half: all three states the step already distinguishes are routed, and it is
  // the *link* that decides rather than the severity — a review that sorted by severity would put
  // an actioned critical above an unanswered warning, which is the ordering FR4 exists to stop.
  assert.match(step, /carrying a `remediation_task_id`/, 'an actioned finding is not routed');
  assert.match(step, /`rejected` finding/, 'a rejected finding is not routed');
  assert.match(step, /left `open` with no task/, 'the finding still awaiting a decision is not routed');
  assert.match(step, /Derived from the rows rather than said alongside them/,
    'the dispositions sit beside the columns rather than being derived from them');

  assert.ok(dispositionProblems(`${step}\nEach one is Fixed.`, 'planted').length >= 1,
    'the sweep passed a step that writes a label out');
});
