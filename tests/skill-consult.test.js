/**
 * Epic 47-08 Story 7 — the converted `consult`, and the four claims made about it.
 *
 * - "A consult run retrieves prior context through the search tool rather than by reading files,
 *   and a term held only on a child row is reachable" [feature]
 * - "The facilitation survives: an inferred agent is still confirmed before the consultation
 *   begins, the voice is still rendered from that agent's stored traits without inventing beyond
 *   them, and the exit is still offered rather than assumed" [feature]
 * - "A consult run loads its roster from the `agent` table with no YAML parse, so a persona a
 *   project added and the plugin never shipped can be consulted by name with no plugin change and
 *   no file edit" [feature]
 * - "must NOT — the skill recovers an entity by reading a generated markdown file rather than by
 *   calling a read tool" [unit]
 *
 * **The child-row half of criterion 1 is the half that can pass by accident**, so the fixture puts
 * the searched term *only* on a criterion and puts a different term in every section body. A run
 * reaching one index finds nothing and cannot mistake that for a corpus that holds nothing — which
 * is what a fixture repeating the term in a section would have let it do.
 *
 * **Criterion 3's persona is created rather than seeded**, and the assertion is that the run reaches
 * it by the same call it reaches the plugin's own by. A test that looked the new agent up directly
 * would be checking that a row exists, which was never in doubt; what is in doubt is whether the
 * roster is a query.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import {
  skillSource, toolNames, reachable, prose, section, recorder, recoveries, bindings,
  seedStartup, driveStartup,
} from './support/skills.js';

const SKILL = 'consult';
const source = skillSource(SKILL);

/** The recoveries this file in particular would reach for, on top of the shared sweep. */
const PARSES = [
  // The roster file, which is the whole of criterion 3's must-not half.
  { pattern: /roster\.ya?ml|agents\/roster/i, why: 'a roster file, when the roster is a table' },
  // CPM's exit writes `docs/discussions/{nn}-discussion-{slug}.md` by transforming the progress file.
  { pattern: /discussion record header|transform the progress file/i, why: 'a record assembled as a file' },
  // The `**Agents**:` header line, which has no column and must not be invented as prose metadata.
  { pattern: /\*\*Agents\*\*:/, why: 'a participant list written as a metadata field' },
  // The file-path input case, which criterion 1 replaces with a search.
  { pattern: /read the file and use its contents/i, why: 'a file read in place of a corpus search' },
];

/** Above what any of these fixtures holds. */
const BOUND = 200;

/**
 * A corpus where the interesting term lives on a child row and nowhere else.
 *
 * `shard` appears once, in a story criterion. Every section body says `partition` instead, so a run
 * that searched only `document_fts` comes back empty rather than coming back with something.
 * `roan` is the project-added persona; `spent` is a retired one, which must stay readable and stop
 * being offered.
 */
function workspace(tools) {
  const seed = handlers(tools);

  const spec = seed.create_spec({ slug: 'persistence', title: 'Persistence' });
  const epic = seed.create_epic({ parent_id: spec.id, slug: 'substrate', title: 'Substrate' });
  const story = seed.create_story({ epic_id: epic.id, number: 1, title: 'Tables', position: 1 });

  seed.create_document_section({
    document_id: spec.id, heading: 'Problem', body: 'Every partition is written by hand.',
    position: 0,
  });
  seed.create_document_section({
    document_id: epic.id, heading: 'Overview', body: 'The partition boundaries, and their cost.',
    position: 0,
  });

  const criterion = seed.create_story_criterion({
    story_id: story.id, position: 1,
    text: 'No shard boundary is decided outside this story.',
  });

  const requirement = seed.create_requirement({
    spec_id: spec.id, label: 'FR1', class: 'functional', position: 1,
    text: 'Every partition shall be one row.',
  });

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

  const startup = seedStartup(seed, { scope: 'consult', skill: 'dpm:consult', phase: 'roster' });

  return { spec, epic, story, criterion, requirement, roan, spent, ...startup };
}

/**
 * The run the SKILL.md prescribes: startup, resolve an agent, search for context, then the record.
 *
 * `roster: true` and `session: true` are claims about the file and are checked against it below —
 * this skill reads the roster because a persona *is* its subject, and opens a session because a
 * consultation is the one thing in this epic genuinely worth resuming. `retro: false` because CPM's
 * consult consumes none and adding one would be an addition to a conversion defined by subtraction.
 */
function run(call, fixture, { term = 'shard', save = true } = {}) {
  const startup = driveStartup(call, fixture, {
    scope: 'consult', skill: 'dpm:consult', roster: true, session: true, retro: false,
  });

  // Resolution is over what the roster returned, by display name and role — never by a lookup the
  // test performs on the database behind the tool's back.
  const wanted = 'Data Steward';
  const chosen = startup.roster.find((agent) =>
    agent.display_name.toLowerCase() === wanted.toLowerCase()
    || agent.role.toLowerCase() === wanted.toLowerCase());

  const traits = chosen ? call.read_agent({ name: chosen.name, include_body: true }) : null;

  const hits = call.search({ query: term, limit: BOUND }).items;

  const READS = {
    document_section: 'read_document_section',
    story_criterion: 'read_story_criterion',
    requirement: 'read_requirement',
    finding: 'read_finding',
    observation: 'read_observation',
    task: 'read_task',
  };

  const context = hits.map((hit) => ({
    entity: hit.entity,
    row: call[READS[hit.entity]]({ id: hit.entity_id, include_body: true }),
  }));

  if (!save) return { startup, chosen, traits, hits, context, discussion: null };

  const discussion = call.create_discussion({ slug: 'sharding', title: 'Sharding, and its cost' });

  for (const [position, [heading, body]] of [
    ['Key points', 'What the consultation established, at length rather than as bullets.'],
    ['Decisions', 'What was settled, and the reasoning that settled it.'],
    ['Open thread', 'What was being discussed when it ended.'],
  ].entries()) {
    call.create_document_section({ document_id: discussion.id, heading, body, position });
  }

  call.update_session({ id: startup.session, phase: 'saved' });

  return { startup, chosen, traits, hits, context, discussion };
}

// --- Criterion 1: the search tool, over both indexes ---------------------------------------------

test('prior context comes through the search tool, and a term held only on a child row is found', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used, passed } = recorder(tools);

  const fixture = workspace(tools);
  const result = run(call, fixture);

  // **The child-row half.** `shard` is on one story criterion and in no section body, so this hit
  // can only have come from `entry_fts`.
  assert.deepEqual(result.hits.map((hit) => hit.entity), ['story_criterion']);
  assert.equal(result.hits[0].entity_id, fixture.criterion.id);
  assert.equal(result.context[0].row.text, 'No shard boundary is decided outside this story.');

  // And the control that makes it mean something: the section index really was reachable and really
  // did hold nothing for this term. A search over a term the sections *do* hold reaches both.
  const both = call.search({ query: 'partition', limit: BOUND }).items;

  assert.deepEqual([...new Set(both.map((hit) => hit.entity))].sort(),
    ['document_section', 'requirement']);
  assert.ok(both.length >= 3, 'the second index returned less than the fixture put in it');

  // The body is asked for on every read, because a hit gives an excerpt and the row gives the text —
  // and a read without it comes back as a heading a run then reports on having never seen.
  for (const entity of ['read_story_criterion', 'read_document_section']) {
    assert.ok(passed.get(entity)?.has('include_body'), `${entity} was read without its body`);
  }
  assert.ok(passed.get('search')?.has('limit'), 'the search was unbounded');

  // **Scoped to the step, because `bindings` is scoped to the file.** The shared Library Check this
  // skill cites names `include_body` for its own reads, so a file-wide grep is satisfied whatever
  // the search step says — and dropping it here survived a mutation until this assertion existed.
  assert.match(prose(source, 'Input'), /passing `include_body`/);
  assert.match(prose(source, 'Input'), /a `limit` above what\s*the project plausibly holds/);

  // **The file has to say the index reaches child rows**, because a run that only ever searched
  // section bodies returns a plausible answer on any corpus where the term appears in one.
  assert.match(prose(source, 'Input'),
    /\*\*The index covers requirement, criterion, finding, observation and task text as well as section bodies\*\*/);
  assert.match(prose(source, 'Input'), /a term used once inside a criterion is reachable/);
  assert.match(prose(source, 'Input'), /Hits come back as an `entity` and an `entity_id`/);

  // Nothing was written before the exit, which is what makes the record a record of a conversation
  // that happened rather than a document opened at the start and filled in.
  assert.ok(result.discussion.id);
  assert.deepEqual(bindings(source, tools, { used, passed }), []);
});

// --- Criterion 2: the facilitation ---------------------------------------------------------------

test('an inferred agent is confirmed, the voice comes off the row, and the exit is offered', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  const input = prose(source, 'Input');

  // Confirmed before starting, with the sentence a user actually sees.
  assert.match(input, /\*\*confirm the choice before starting\*\*/);
  assert.match(input, /I'd suggest \{icon\} \*\*\{display_name\}\*\* \(\{role\}\)/);
  assert.match(input, /starting on it unasked spends the first exchange correcting it/);

  // The voice comes from the row's own columns and stops there.
  const responses = prose(source, 'Responses');

  assert.match(responses, /stored `personality` and `communication_style`/);
  assert.match(responses, /\*\*from nothing else\*\* — a trait not on the row is a trait invented for them/);

  // The exit is offered rather than assumed, and the exit word is the one that does not kill the
  // session — which a run cannot discover and a user finds out the hard way.
  assert.match(responses, /After each round, offer the exit quietly/);
  assert.match(prose(source, 'Commands'),
    /\*\*Use "wrap up" as the exit word\.\*\* `exit` and `quit` are the CLI's/);
  assert.match(prose(source, 'Commands'), /would leave the consultation unsaved/);

  // Dismissing the last agent does not end the consultation — the plausible wrong behaviour, since
  // an empty room reads like a finished conversation.
  assert.match(prose(source, 'Commands'),
    /\*\*Dismissing the last agent does not end the consultation\*\*/);

  // The record keeps the substance. A summariser passes every structural check and loses the thing
  // the record exists for, so the rule is stated rather than left to judgement.
  const saving = prose(source, 'Saving the discussion');

  assert.match(saving, /\*\*Write the substance, not a summary of it\.\*\*/);
  assert.match(saving, /Length is the wrong economy here/);
  assert.match(saving, /\*\*offer, and do not run\*\*/);

  // The number is allocated, which is the one instruction that stops a run inventing one.
  assert.match(saving, /The number is allocated; do not supply one/);

  // Degradation refuses the two silent improvisations: a near-match persona, and an invented one.
  const table = prose(source, 'Degradation');

  assert.match(table, /Do not consult the nearest match/);
  assert.match(table, /inventing one is the failure this skill is defined against/);
  assert.match(table, /An empty result is an answer/);

  assert.ok(tools.length > 100, 'the registry was not built');
});

// --- Criterion 3: the roster is a table ----------------------------------------------------------

test('a persona the project added is consultable by name, and a retired one is not offered', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used, passed } = recorder(tools);

  const fixture = workspace(tools);
  const result = run(call, fixture, { save: false });

  // **Reached by the same call the plugin's own personas come back on.** `roan` is in no seed and in
  // no file; the run found it because the roster is a query.
  assert.equal(result.chosen.name, 'roan');
  assert.equal(result.traits.personality, 'Sceptical about anything that cannot be counted.');
  assert.equal(result.traits.communication_style, 'Short sentences, and a number in every one.');
  assert.equal(result.traits.icon, '🜂');

  const offered = result.startup.roster.map((agent) => agent.name);

  assert.ok(offered.includes('roan'), 'the project-added persona was not offered');
  assert.ok(offered.length > 5, 'the plugin\'s own personas came back too');

  // The retired one is excluded by the tool's own `WHERE`, not by a filter in the run — and stays
  // readable, because a discussion that names it must still resolve the name.
  assert.ok(!offered.includes('spent'), 'a retired persona was offered');

  const raw = handlers(tools);

  assert.ok(raw.list_agent({ include_retired: true, limit: BOUND }).items
    .some((agent) => agent.name === 'spent'), 'a retired persona is unreachable, not unoffered');
  assert.equal(raw.read_agent({ name: fixture.spent.name }).display_name, 'Spent');

  // The traits are body columns, so the roster list withholds them and the run has to ask — a run
  // that rendered a voice off the list alone would render it off nothing.
  assert.equal(Object.hasOwn(result.startup.roster[0], 'personality'), false,
    'the roster list handed over traits without being asked, so `read_agent` proves nothing');
  assert.ok(passed.get('read_agent')?.has('include_body'));

  // Step-scoped for the same reason as the search step's: the file names `include_body` in three
  // places and the binding cannot tell which of them the roster read is answerable for.
  assert.match(prose(source, 'Startup'),
    /`mcp__plugin_dpm_dpm__read_agent` with `include_body` for each\s*agent brought into the room/);
  assert.match(prose(source, 'Startup'),
    /\*\*The traits are body columns\*\*.*rendering a persona off the list alone is rendering it\s*off nothing/);

  // And the file says the roster is rows, which is the half no fixture shows: a run reading a file
  // would find the plugin's personas there and look entirely correct on this project.
  assert.match(prose(source, 'Startup'),
    /\*\*The roster is rows, so a persona this project added and the plugin never shipped is\s*consultable by name\*\*/);
  assert.match(prose(source, 'Startup'), /with no file edit anywhere/);

  // Resolution is by the roster's own columns, not by a name convention.
  assert.match(prose(source, 'Input'), /against `display_name` and `role`/);

  assert.ok(used.has('list_agent') && used.has('read_agent'));
  assert.deepEqual(bindings(source, tools, { used, passed }), []);
});

// --- Criterion 4 (must NOT): no recovery by reading what was written -----------------------------

test('must NOT — the skill recovers an entity by reading a generated markdown file', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  assert.deepEqual(recoveries(source, PARSES), []);

  const known = new Set(tools.map((tool) => tool.name));
  const named = toolNames(reachable(source));

  for (const required of ['list_session', 'adopt_session', 'create_session', 'update_session',
    'list_agent', 'read_agent', 'list_library', 'list_library_scope', 'list_document_section',
    'read_document_section', 'search', 'create_discussion']) {
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

  // The control: CPM's own exit flow trips the sweep in four places at once.
  const regressed = `${source}\n\nLoad the roster from agents/roster.yaml. On a file path, read the `
    + 'file and use its contents as context. On exit, transform the progress file into the output '
    + 'artifact at docs/discussions/{nn}-discussion-{slug}.md, replacing the header with a '
    + 'discussion record header carrying **Agents**: the participants.';

  assert.ok(recoveries(regressed, PARSES).length >= 4,
    'the sweep passed a file that reads a roster file and assembles the record by hand');

  // And it composes no table of its own beyond the degradation one, which is a facilitation aid
  // rather than a generated artefact.
  assert.equal(section(source, 'Saving the discussion').includes('| --- |'), false);
});
