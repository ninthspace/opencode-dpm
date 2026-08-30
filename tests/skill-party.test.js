/**
 * Epic 47-08 Story 8 — the converted `party`, and the three claims made about it.
 *
 * - "A party run loads its roster from the `agent` table and reads the artifact under discussion
 *   through read tools, with no YAML parse and no roster file on disk" [feature]
 * - "The facilitation survives: agents are still selected from the topic rather than fixed, each
 *   voice is still rendered from that agent's stored traits alone, and the run still ends in a
 *   direction of travel rather than a transcript" [feature]
 * - "must NOT — the skill recovers an entity by reading a generated markdown file rather than by
 *   calling a read tool" [unit]
 *
 * **The roster half is the half that can pass by accident**, because the plugin's own personas are
 * seeded and a run that read them from anywhere at all comes back with a plausible roster. So the
 * fixture adds one persona the seeds do not hold and retires another, and every assertion about
 * selection is made against what the *run* was handed rather than against the database behind it.
 *
 * **"Selected from the topic rather than fixed" is asserted behaviourally**, by driving the same
 * run twice with different topics and requiring the two selections to differ. A file that says
 * "choose by role" and a run that always answers with the first three agents read identically to
 * every grep; only two topics tell them apart.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import {
  skillSource, toolNames, reachable, prose, section, recorder, recoveries, bindings,
  seedStartup, driveStartup, CALLABLE,
} from './support/skills.js';

const SKILL = 'party';
const source = skillSource(SKILL);

/** The recoveries this file in particular would reach for, on top of the shared sweep. */
const PARSES = [
  // The roster file, which is the whole of criterion 1's must-not half.
  { pattern: /roster\.ya?ml|agents\/roster/i, why: 'a roster file, when the roster is a table' },
  // CPM's exit writes `docs/discussions/{nn}-discussion-{slug}.md` from the progress file.
  { pattern: /discussion record header|transform the progress file/i, why: 'a record assembled as a file' },
  // The `**Agents**:` header line, which has no column and must not be invented as prose metadata.
  { pattern: /\*\*Agents\*\*:/, why: 'a participant list written as a metadata field' },
  // The file-path input case, which criterion 1 replaces with reads over the corpus.
  { pattern: /read the file and use its contents/i, why: 'a file read in place of a corpus read' },
];

/** Above what any of these fixtures holds. */
const BOUND = 200;

/**
 * A corpus with one document under discussion, one that is not, and a roster with an edge at each
 * end.
 *
 * The second spec exists to be left alone: a run that listed every section rather than the sections
 * of the document it was handed comes back with `decoy` in its context, which no assertion about
 * counts would notice.
 */
function workspace(tools) {
  const seed = handlers(tools);

  const subject = seed.create_spec({ slug: 'persistence', title: 'Persistence' });
  const elsewhere = seed.create_spec({ slug: 'decoy', title: 'Something else entirely' });

  for (const [position, [heading, body]] of [
    ['Problem', 'Every relationship is recorded twice, by hand.'],
    ['Approach', 'One row, and two renders of it.'],
  ].entries()) {
    seed.create_document_section({ document_id: subject.id, heading, body, position });
  }

  seed.create_document_section({
    document_id: elsewhere.id, heading: 'Unrelated', body: 'Nothing to do with the topic.',
    position: 0,
  });

  const requirement = seed.create_requirement({
    spec_id: subject.id, label: 'FR1', class: 'functional', position: 1,
    text: 'Every relationship shall be one row.',
  });

  // The persona the plugin never shipped. Its `role` is what the second topic selects on, so the
  // selection assertion turns on a row that exists in no seed and in no file.
  const roan = seed.create_agent({
    name: 'roan', display_name: 'Roan', icon: '🜂', role: 'Data Steward',
    personality: 'Sceptical about anything that cannot be counted.',
    communication_style: 'Short sentences, and a number in every one.',
    position: 99,
  });

  // Retired through the verb rather than by writing the column: `create_agent` does not take it,
  // and a fixture that reached round the tool would be seeding a state the surface cannot produce.
  const spent = seed.create_agent({
    name: 'spent', display_name: 'Spent', icon: '🕯', role: 'Retired Persona',
    personality: 'Gone.', communication_style: 'Gone.', position: 100,
  });

  seed.retire_agent({ name: spent.name });

  const startup = seedStartup(seed, { scope: 'party', skill: 'dpm:party', phase: 'roster' });

  return { subject, elsewhere, requirement, roan, spent, ...startup };
}

/**
 * The run the SKILL.md prescribes: startup, the roster in one call, the artifact under discussion,
 * then a selection made from the topic.
 *
 * `roster: false` is passed to `driveStartup` and the roster is loaded here instead, because this
 * skill's load is not the shared one — it asks for the body, and the shared helper does not. Driving
 * it through the helper would have satisfied every binding while asserting nothing about the one
 * argument the voices depend on.
 */
function run(call, fixture, {
  topic = 'the shape of the persistence problem', wants, attempt = 1,
} = {}) {
  const startup = driveStartup(call, fixture, {
    scope: 'party',
    skill: 'dpm:party',
    roster: false,
    session: true,
    retro: false,
    attempt,
    // The predecessor can only be adopted once, so a second run in one test resumes nothing.
    adopt: attempt === 1,
  });

  // One call, with the body, because `personality` and `communication_style` are body columns and a
  // voice rendered off the list alone is rendered off nothing.
  const roster = call.list_agent({ include_body: true, limit: BOUND }).items;

  const hits = call.search({ query: 'relationship', limit: BOUND }).items;

  const READS = {
    document_section: 'read_document_section',
    requirement: 'read_requirement',
    story_criterion: 'read_story_criterion',
    acceptance_criterion: 'read_acceptance_criterion',
    finding: 'read_finding',
    observation: 'read_observation',
    task: 'read_task',
  };

  const found = hits.map((hit) => ({
    entity: hit.entity,
    row: call[READS[hit.entity]]({ id: hit.entity_id, include_body: true }),
  }));

  // The artifact under discussion, read rather than opened: a section hit carries the `document_id`
  // of the document it belongs to, and that is what the whole document is listed by.
  const document = found.find((entry) => entry.entity === 'document_section').row.document_id;

  const context = call
    .list_document_section({ document_id: document, include_body: true, limit: BOUND }).items;

  // Selection: two or three whose `role` bears on what was just said. Over the roster the run was
  // handed, never over a lookup the test performs behind the tool.
  const terms = (wants ?? topic).toLowerCase().split(/\W+/).filter((word) => word.length > 3);
  const speaking = roster
    .filter((agent) => terms.some((term) => `${agent.role} ${agent.personality}`.toLowerCase()
      .includes(term)))
    .slice(0, 3);

  return { startup, roster, document, context, hits, found, speaking };
}

// --- Criterion 1: the roster is a table, and the artifact is read --------------------------------

test('the roster comes from the `agent` table and the artifact through read tools', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used, passed } = recorder(tools);

  const fixture = workspace(tools);
  const result = run(call, fixture);

  // **Reached by the same call the plugin's own personas come back on.** `roan` is in no seed and
  // in no file; the run found it because the roster is a query.
  const offered = result.roster.map((agent) => agent.name);

  assert.ok(offered.includes('roan'), 'the project-added persona was not offered');
  assert.ok(offered.length > 5, 'the plugin\'s own personas came back too');

  // The retired one is excluded by the tool's own `WHERE`, not by a filter in the run — and stays
  // readable, because a record naming it must still resolve the name.
  assert.ok(!offered.includes('spent'), 'a retired persona was offered');

  const raw = handlers(tools);

  assert.ok(raw.list_agent({ include_retired: true, limit: BOUND }).items
    .some((agent) => agent.name === 'spent'), 'a retired persona is unreachable, not unoffered');
  assert.equal(raw.read_agent({ name: fixture.spent.name }).display_name, 'Spent');

  // The traits arrived, and they arrived because they were asked for. The control is the same list
  // without the flag: it withholds them, so a run that skipped it renders a voice off nothing.
  assert.equal(result.roster.find((agent) => agent.name === 'roan').personality,
    'Sceptical about anything that cannot be counted.');
  assert.equal(Object.hasOwn(raw.list_agent({ limit: BOUND }).items[0], 'personality'), false,
    'the roster list hands over traits unasked, so `include_body` proves nothing');
  assert.ok(passed.get('list_agent')?.has('include_body'), 'the roster was loaded without its body');
  assert.ok(passed.get('list_agent')?.has('limit'), 'the roster load was unbounded');

  // **The artifact under discussion.** Its sections came through the section tool scoped to the one
  // document — and the decoy spec's section did not, which is what "the artifact" means.
  assert.deepEqual(result.context.map((row) => row.heading), ['Problem', 'Approach']);
  assert.ok(result.context.every((row) => row.body), 'the sections came back without their bodies');
  assert.ok(!result.context.some((row) => row.heading === 'Unrelated'),
    'a section of a document nobody was discussing arrived in the context');

  // And the search half reaches the child rows, not only the section index.
  assert.ok(result.found.some((entry) => entry.entity === 'requirement'
    && entry.row.text === 'Every relationship shall be one row.'),
  'the requirement text was not reachable');

  // **Scoped to the step, because `bindings` is scoped to the file.** The shared Library Check this
  // skill cites names `include_body` for its own reads, so a file-wide grep is satisfied whatever
  // the roster step says.
  assert.match(prose(source, 'Startup'),
    new RegExp(`\`${CALLABLE}list_agent\` with \`include_body\` and a \`limit\``));
  assert.match(prose(source, 'Startup'),
    /\*\*One call, and it must carry the body\*\*/);
  assert.match(prose(source, 'Startup'),
    /`personality` and `communication_style` are body columns/);

  // The file says the roster is rows, which is the half no fixture shows: a run reading a file would
  // find the plugin's personas there and look entirely correct on this project.
  assert.match(prose(source, 'Startup'),
    /\*\*A persona this project added and the plugin never shipped\s*is in that list\*\*/);
  assert.match(prose(source, 'Startup'), /with no file edit anywhere/);

  // And it says how a whole document is put in front of the room, which is the step a run would
  // otherwise satisfy by opening the rendered file.
  assert.match(prose(source, 'Input'),
    new RegExp('take the\\s*`document_id` the read gave back and call '
      + `\`${CALLABLE}list_document_section\` with it`));
  assert.match(prose(source, 'Input'),
    /\*\*The artifact under discussion is read\s*through those tools and through nothing else\*\*/);

  assert.deepEqual(bindings(source, tools, { used, passed }), []);
});

// --- Criterion 2: the facilitation ---------------------------------------------------------------

test('agents are selected from the topic, voiced from their rows, and land on a direction', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);

  const fixture = workspace(tools);

  // **Two topics, because one cannot tell selection from a fixed cast.** The second names a role no
  // seed holds, so a run answering with its usual voices returns nobody rather than the wrong body.
  const first = run(call, fixture, {
    wants: 'an architect and a developer on structural risk', attempt: 1,
  });
  const second = run(call, fixture, { wants: 'data steward counting rows', attempt: 2 });

  assert.ok(first.speaking.length > 0 && first.speaking.length <= 3);
  assert.ok(second.speaking.some((agent) => agent.name === 'roan'),
    'the project-added persona was never selected, whatever the topic said');
  assert.notDeepEqual(first.speaking.map((agent) => agent.name),
    second.speaking.map((agent) => agent.name),
    'the same agents answered two unrelated topics — the cast is fixed, not selected');

  // Selection is over columns the roster carries, so the file has to say which.
  const selecting = prose(source, 'Selecting agents');

  assert.match(selecting, /the closest `role` and `personality` match/);
  assert.match(selecting, /\*\*An agent addressed by name responds\*\*/);
  assert.match(selecting, /\*\*Rotate\*\*/);
  assert.match(selecting, /Three voices that agree are worth less than two that\s*differ/);
  assert.match(selecting, /A retired agent is not offered/);

  // The voice comes from the row's own columns and stops there.
  const responses = prose(source, 'Responses');

  assert.match(responses, /stored `personality` and `communication_style`/);
  assert.match(responses, /\*\*from nothing else\*\* — a trait not on the row is a trait invented for them/);
  assert.match(responses, /the roster is the only\s*thing keeping these voices apart/);

  // **A direction of travel rather than a transcript**, which is the one thing that makes the record
  // worth keeping — and the phase has to be the one the conversation is in, not the one that ends it.
  const direction = prose(source, 'Direction of travel');

  assert.match(direction, /\*\*Exploring\*\*/);
  assert.match(direction, /\*\*Converging\*\*/);
  assert.match(direction, /\*\*Ready to recommend\*\*/);
  assert.match(direction, /🧭 \*\*Emerging direction\*\*/);
  assert.match(direction, /💡 \*\*The team recommends\*\*/);
  assert.match(direction, /\*\*Let convergence be earned\.\*\*/);
  assert.match(direction, /Signal the phase the\s*conversation is in, not the one that would let it end/);

  // The exit is offered rather than assumed, and the exit word is the one that does not kill the
  // session — which a run cannot discover and a user finds out the hard way.
  assert.match(direction, /offer the exit quietly/);
  assert.match(direction, /\*\*Use "wrap up" as the exit word\.\*\* `exit` and `quit` are the CLI's/);
  assert.match(direction, /would leave the discussion unsaved/);

  // Disagreement is preserved rather than smoothed, which is the whole reason for a second voice.
  assert.match(responses, /\*\*Disagree where you genuinely differ\.\*\*/);
  assert.match(responses, /let it stand rather than resolving it politely/);
  assert.match(responses, /\*\*Be opinionated\.\*\*/);

  // The record keeps the substance. A summariser passes every structural check and loses the thing
  // the record exists for, so the rule is stated rather than left to judgement.
  const saving = prose(source, 'Saving the discussion');

  assert.match(saving, /\*\*Write the substance, not a summary of it\.\*\*/);
  assert.match(saving, /keeps the direction and throws away the reasoning/);
  assert.match(saving, /The number is allocated; do not supply one/);
  assert.match(saving, /\*\*offer, and do not run\*\*/);

  // Degradation refuses the two silent improvisations: a near-match persona, and an invented one.
  const table = prose(source, 'Degradation');

  assert.match(table, /inventing one is the failure this skill is defined against/);
  assert.match(table, /Do not substitute the nearest role/);
  assert.match(table, /An empty result is an answer/);

  assert.ok(tools.length > 100, 'the registry was not built');
});

// --- Criterion 3 (must NOT): no recovery by reading what was written -----------------------------

test('must NOT — the skill recovers an entity by reading a generated markdown file', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  assert.deepEqual(recoveries(source, PARSES), []);

  const known = new Set(tools.map((tool) => tool.name));
  const named = toolNames(reachable(source));

  for (const required of ['list_session', 'adopt_session', 'create_session', 'update_session',
    'list_agent', 'list_library', 'list_library_scope', 'list_document_section',
    'read_document_section', 'search', 'create_discussion', 'create_document_section']) {
    assert.ok(named.includes(required), `the skill never names ${required}`);
    assert.ok(known.has(required), `${required} is not a tool`);
  }

  // The one external read it keeps is a URL, and it is marked as external rather than left to look
  // like the corpus reads around it.
  assert.match(prose(source, 'Input'), /External, so it is read rather than queried/);

  // Participants are a row. Story 9 gave this the join it had been stating the absence of, and the
  // rule the file carries is the one that survives either way: a relationship named in prose is not
  // recorded, which is the defect FR1 opens the spec with.
  assert.match(prose(source, 'Saving the discussion'),
    /\*\*Who was in the room is a row, and naming them in the prose is not the same fact\.\*\*/);
  assert.match(prose(source, 'Saving the discussion'),
    /a persona mentioned in a paragraph is invisible to it/);

  // The control: CPM's own roster load and exit flow trip the sweep in four places at once.
  const regressed = `${source}\n\nFollow the Roster Loading procedure, reading agents/roster.yaml. `
    + 'On a file path, read the file and use its contents as context. On exit, transform the '
    + 'progress file into the output artifact at docs/discussions/{nn}-discussion-{slug}.md, '
    + 'replacing the header with a discussion record header carrying **Agents**: the participants.';

  assert.ok(recoveries(regressed, PARSES).length >= 4,
    'the sweep passed a file that reads a roster file and assembles the record by hand');

  // And it composes no table of its own beyond the degradation one, which is a facilitation aid
  // rather than a generated artefact.
  assert.equal(section(source, 'Saving the discussion').includes('| --- |'), false);
});
