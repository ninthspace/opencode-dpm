/**
 * Epic 47-07 Story 3 — the converted `architect`, and the five claims made about it.
 *
 * - "An architect run writes `adr` rows with `decision_status`, plus `adr_option` and
 *   `adr_option_tradeoff` rows — the options and their axes are columns, not prose the skill
 *   formats" [feature]
 * - "Exactly one option per accepted ADR carries `chosen`, enforced at write time rather than by
 *   the integrity check finding it later" [integration]
 * - "An ADR is created as a child document of a spec, brief or discussion and renders inside its
 *   parent, with no number allocated and no path under `docs/architecture/`" [feature]
 * - "The facilitation survives: the run still works one phase at a time, still explores trade-offs
 *   across options before choosing, and still gates each decision before writing it" [feature]
 * - "must NOT — the skill recovers an entity by reading a generated markdown file rather than by
 *   calling a read tool" [unit]
 *
 * **The second claim is about two refusals, not one.** Choosing a second option is the obvious
 * violation; *un*choosing the only one is the same violation reached from the other side, and an
 * accepted ADR is left with none. Both are driven below, in both the create and the update
 * direction, because `entityTools` ran its guard on create alone until this story.
 *
 * **The third claim is checked against the projection and not only against the row.** `number:
 * null` says a number was not allocated; only rendering the parent shows that the ADR reaches a
 * reader at all, which is the half that would silently fail if a template forgot to splice it in.
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
  skillSource, toolNames, reachable, section, prose, recorder, recoveries, bindings,
  seedStartup, driveStartup,
} from './support/skills.js';

const SKILL = 'architect';
const source = skillSource(SKILL);

/** The recoveries this file in particular would reach for, on top of the shared sweep. */
const PARSES = [
  { pattern: /`{3}markdown/, why: 'a document template, which is the projection’s to own' },
  { pattern: /architecture\/assets/, why: 'a companion-asset path' },
  { pattern: /Numbering\*\* procedure/, why: 'the numbering procedure, which allocates nothing here' },
];

/** The axes one decision was weighed on. The same five for every option, which is the point. */
const AXES = ['complexity', 'scalability', 'team capability', 'operational cost', 'time to market'];

/** The two prose sections an ADR carries, in the order Phase 6 writes them. */
const SECTIONS = ['Context', 'Consequences'];

/**
 * What a project holds when someone runs `architect`: a product brief with the constraints that
 * make a decision this product's, and a second brief so the parent is chosen rather than assumed.
 */
function workspace(tools) {
  const seed = handlers(tools);

  const brief = seed.create_product_brief({ slug: 'dpm', title: 'dpm' });
  seed.create_document_section({
    document_id: brief.id,
    heading: 'Constraints',
    body: 'One host, and no queue worker.',
    position: 0,
  });

  // A second, newer parent. A run reaching for recency would hang its decisions off this one and
  // every assertion about lineage would still find *a* parent.
  const decoy = seed.create_product_brief({ slug: 'later-work', title: 'A later product' });

  const startup = seedStartup(seed, {
    scope: 'architect',
    skill: 'dpm:architect',
    phase: 'Phase 3',
    live: ['A decision nobody could trace to a requirement turned out to be boilerplate.'],
  });

  return { brief, decoy, ...startup };
}

/**
 * The run the SKILL.md prescribes: startup, the parent chosen by id, five phases, then one gated
 * write per decision.
 *
 * `approved` is the answer at the Phase 6 gate. `parent` is the document the decisions hang off,
 * so a test can drive the refusal the composite key exists for.
 */
function run(call, fixture, { approved = true, attempt = 1, parent = fixture.brief.id } = {}) {
  const startup = driveStartup(call, fixture, { scope: 'architect', skill: 'dpm:architect', attempt });

  // Input: the parent is chosen from the list by id and read through a read tool, and its prose is
  // read off its own rows rather than off anything rendered from them.
  const offered = call.list_product_brief({}).items;
  const chosen = call.read_product_brief({ id: parent });
  const constraints = call.list_document_section({ document_id: chosen.id }).items
    .map((row) => call.read_document_section({ id: row.id, include_body: true }));

  // The decisions already recorded against it — none, on a first run, which is still the call the
  // file prescribes rather than one a run may skip because it expects nothing.
  const existing = call.list_adr({ parent_id: chosen.id }).items
    .map((row) => call.read_adr({ id: row.id }));

  for (const phase of ['Phase 2', 'Phase 3', 'Phase 4', 'Phase 5', 'Phase 6']) {
    call.update_session({ id: startup.session, phase, state: JSON.stringify({ parent, phase }) });
  }

  if (!approved) return { startup, offered, chosen, constraints, existing, adr: null, options: [] };

  // Phase 6, in the order the tools require: the ADR proposed, its prose, its options, their axes,
  // and only then the status.
  const adr = call.create_adr({
    parent_id: parent,
    slug: 'availability',
    title: 'Where booking availability is held',
    decision: 'Availability is a row per slot, written under a transaction.',
  });

  SECTIONS.forEach((heading, position) => call.create_document_section({
    document_id: adr.id, heading, body: `what phase 3 settled about ${heading.toLowerCase()}`, position,
  }));

  const options = ['A row per slot', 'A cached window'].map((name, position) => {
    const option = call.create_adr_option({
      adr_id: adr.id,
      name,
      position,
      rationale: `why ${name} was or was not taken`,
      ...(position === 0 ? { chosen: true } : {}),
    });

    for (const axis of AXES) {
      call.create_adr_option_tradeoff({
        option_id: option.id, axis, assessment: `${name} against ${axis}`,
      });
    }

    return option;
  });

  call.update_adr({ id: adr.id, decision_status: 'accepted' });

  // Phase 5's relationships, written after the decisions they relate.
  const second = call.create_adr({
    parent_id: parent, slug: 'retention', title: 'How long a released slot is held',
    decision: 'A released slot is available immediately.',
  });

  call.list_dependency_kind({});
  call.create_dependency({
    kind: 'constrains', source_document_id: adr.id, target_document_id: second.id,
  });

  return { startup, offered, chosen, constraints, existing, adr, second, options };
}

// --- Criterion 1: the options and their axes are rows ----------------------------------------------

test('an architect run writes the decision, its options and their axes as typed rows', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used, passed } = recorder(tools);

  const fixture = workspace(tools);
  const result = run(call, fixture);

  const raw = handlers(tools);
  const stored = raw.read_adr({ id: result.adr.id });

  assert.equal(stored.kind, 'adr');
  assert.equal(stored.decision_status, 'accepted');
  assert.equal(stored.decision, 'Availability is a row per slot, written under a transaction.');

  // Two options, one chosen, each carrying its own reasoning — including the one not taken, which
  // is the half a prose record loses first.
  const options = raw.list_adr_option({ adr_id: stored.id, include_body: true }).items;
  assert.deepEqual(options.map((row) => row.name), ['A row per slot', 'A cached window']);
  assert.deepEqual(options.map((row) => row.chosen), [1, 0]);
  assert.ok(options.every((row) => row.rationale !== null), 'a rejected option carries no reasoning');

  // **The same axes across both options, which is what makes them comparable.** An option assessed
  // on axes the other was not is the prose table this conversion replaces, arrived at through rows.
  for (const option of options) {
    const tradeoffs = raw.list_adr_option_tradeoff({ option_id: option.id, include_body: true }).items;
    assert.deepEqual(tradeoffs.map((row) => row.axis).sort(), [...AXES].sort(),
      `${option.name} was weighed on a different set of axes`);
    assert.ok(tradeoffs.every((row) => row.assessment.length > 0));
  }

  // **The write step names `chosen` as a column, and that is asserted rather than assumed.**
  // `chosen` is a boolean and not an enum, so the binding's valued-argument direction cannot see
  // it: a file that told a run to say which option was taken *in the rationale* passed all five
  // tests until this assertion existed, and the projection would have rendered no chosen option.
  assert.match(prose(source, 'Phase 6: Record the decisions'), /`chosen` goes on the one taken/);
  assert.ok(passed.get('create_adr_option').has('chosen'));

  // The axes are a default set the file names, and it says so rather than fixing them.
  const phase = prose(source, 'Phase 3: Options and trade-offs');
  assert.match(phase, /\*\*Default axes\*\*/);
  assert.match(phase, /starting set rather than a schema/);
  assert.match(phase, /same axes across the options/);

  // And Phase 6 says the axes are rows rather than something to lay out — the instruction whose
  // absence would let a run write one `assessment` holding a formatted table.
  const record = prose(source, 'Phase 6: Record the decisions');
  assert.match(record, /The axes are rows, not a layout/);
  assert.match(record, /Do not format a table/);

  // Scoped to the step that must compose none, per the note on `RECOVERY`: a table a skill shows
  // the user while facilitating is neither generated nor read back, so a file-wide ban is wrong.
  assert.doesNotMatch(section(source, 'Phase 6: Record the decisions'), /\|\s*-{3}/);

  assert.deepEqual(bindings(source, tools, { used, passed }), []);
});

// --- Criterion 2: exactly one chosen, refused at write time ----------------------------------------

test('a second chosen option is refused, and so is emptying an accepted ADR of its choice', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const raw = handlers(tools);

  const brief = raw.create_product_brief({ slug: 'dpm', title: 'dpm' });
  const adr = raw.create_adr({
    parent_id: brief.id, slug: 'availability', title: 'Availability', decision: 'A row per slot.',
  });

  // **An ADR cannot be created accepted**, because it has no options at the moment it is created.
  assert.throws(
    () => raw.create_adr({
      parent_id: brief.id, slug: 'premature', title: 'Premature',
      decision: 'Settled before anything was weighed.', decision_status: 'accepted',
    }),
    /0 chosen options/,
    'an ADR was accepted with nothing chosen',
  );

  const first = raw.create_adr_option({ adr_id: adr.id, name: 'A row', chosen: true, position: 0 });
  const second = raw.create_adr_option({ adr_id: adr.id, name: 'A window', position: 1 });

  // Refused on create...
  assert.throws(
    () => raw.create_adr_option({ adr_id: adr.id, name: 'A queue', chosen: true, position: 2 }),
    /already the chosen option/,
    'a second option was chosen at create time',
  );

  // ...and on update, which is the direction the guard could not reach until this story.
  assert.throws(
    () => raw.update_adr_option({ id: second.id, chosen: true }),
    /already the chosen option/,
    'a second option was chosen by update',
  );

  raw.update_adr({ id: adr.id, decision_status: 'accepted' });

  // Now the other side of "exactly one": clearing the choice an accepted ADR depends on.
  assert.throws(
    () => raw.update_adr_option({ id: first.id, chosen: false }),
    /accepted and this would leave it with 0/,
    'an accepted ADR was emptied of its chosen option',
  );

  // The legal route through, which is what the refusal's message tells the caller to take.
  raw.update_adr({ id: adr.id, decision_status: 'proposed' });
  raw.update_adr_option({ id: first.id, chosen: false });
  raw.update_adr_option({ id: second.id, chosen: true });
  assert.equal(raw.update_adr({ id: adr.id, decision_status: 'accepted' }).decision_status, 'accepted');

  // **An unrelated edit is not refused on the strength of a state it did not cause.** A title
  // change on a document whose detail is untouched leaves the guard nothing to judge.
  assert.equal(raw.update_adr({ id: adr.id, title: 'Availability, revisited' }).title,
    'Availability, revisited');

  // And the file says the order the guard requires, so a run is not left to discover it by refusal.
  const record = prose(source, 'Phase 6: Record the decisions');
  assert.match(record, /The order matters and the tool enforces it/);
  assert.match(record, /the status is written last/);
  assert.match(record, /a second `chosen` is refused rather than stored/);
});

// --- Criterion 3: a child document, rendered inside its parent -------------------------------------

test('the ADR is a child document with no number, and it renders inside its parent', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);

  const fixture = workspace(tools);
  const result = run(call, fixture);

  const raw = handlers(tools);
  const stored = raw.read_adr({ id: result.adr.id });

  assert.equal(stored.parent_id, fixture.brief.id);
  assert.equal(stored.parent_kind, 'product_brief');
  assert.notEqual(stored.parent_id, fixture.decoy.id, 'the decisions hung off the newest brief');

  // No number allocated, and none accepted as an argument either.
  assert.equal(stored.number, null);
  assert.equal(stored.numbering, 'child');
  const create = tools.find((tool) => tool.name === 'create_adr').inputSchema.properties;
  assert.ok(!('number' in create) && !('sequence' in create));

  // A parent of the wrong kind is refused rather than stored.
  const epic = raw.create_epic({ parent_id: raw.create_spec({ slug: 's', title: 'S' }).id, slug: 'e', title: 'E' });
  assert.throws(
    () => raw.create_adr({ parent_id: epic.id, slug: 'x', title: 'X', decision: 'd' }),
    /FOREIGN KEY|parent/i,
    'an ADR was hung off an epic',
  );

  // **The projection is where "renders inside its parent" is actually checked.** The row could be
  // perfect and the ADR still reach nobody.
  const files = project(db, { write: false });
  assert.ok(!files.written.some((file) => file.path.includes('architecture')),
    'the projection wrote a file under an architecture directory');

  const parent = files.written.find((file) => file.text.includes('Where booking availability is held'));
  assert.ok(parent, 'the ADR is rendered in no file at all');
  assert.ok(parent.path.includes(fixture.brief.slug), 'the ADR renders somewhere other than its parent');

  // Its decision, its options, the axes as a table, and the prose sections the gate added here.
  assert.match(parent.text, /A row per slot — chosen/);
  assert.match(parent.text, /A cached window/);
  assert.match(parent.text, /\|\s*Axis\s*\|\s*Assessment\s*\|/);
  for (const heading of SECTIONS) assert.match(parent.text, new RegExp(heading));

  // And the file tells no one a path, because there is none to tell.
  const output = prose(source, 'Output');
  assert.match(output, /Do not tell the user a path/);
  assert.match(output, /no number of its own/);
});

// --- Criterion 4: the facilitation survives --------------------------------------------------------

test('the run explores options before choosing, and a refused gate writes nothing', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);

  const fixture = workspace(tools);
  const raw = handlers(tools);

  const refused = run(call, fixture, { approved: false });

  assert.equal(refused.adr, null);
  assert.deepEqual(raw.list_adr({}).items, [], 'an ADR exists after a gate that refused one');

  // It still read the parent it was given and the constraints off that parent's own rows.
  assert.equal(refused.chosen.id, fixture.brief.id);
  assert.match(refused.constraints[0].body, /no queue worker/);

  // The phase order, and that options and their axes come before anything is chosen.
  for (const [earlier, later] of [
    ['Phase 1: Context', 'Phase 2: Identify the decisions'],
    ['Phase 2: Identify the decisions', 'Phase 3: Options and trade-offs'],
    ['Phase 3: Options and trade-offs', 'Phase 5: Dependencies'],
    ['Phase 5: Dependencies', 'Phase 6: Record the decisions'],
  ]) {
    assert.ok(source.indexOf(earlier) < source.indexOf(later), `${earlier} runs after ${later}`);
  }

  const identify = prose(source, 'Phase 2: Identify the decisions');
  assert.match(identify, /could be asked of any product is boilerplate/);
  assert.match(identify, /driving requirement cannot be named/);

  const options = prose(source, 'Phase 3: Options and trade-offs');
  assert.match(options, /One decision at a time/);
  assert.match(options, /two to four options/i);
  assert.match(options, /Gate each decision before moving to the next/);

  // The write gate, and that nothing is written before it answers.
  const record = prose(source, 'Phase 6: Record the decisions');
  assert.match(record, /`Approve` \/ `Request changes` \/ `Stop`/);
  assert.match(record, /Write nothing until the decision is approved/);

  // Supersession is an edge and a status, and explicitly not a sentence — the step that keeps
  // register entry 2 unproduceable by this skill.
  const revisit = prose(source, 'Revisiting a decision');
  // The direction is named by column, because an edge written the other way round is a superseded
  // ADR pointing at its replacement — which reads as the replacement being the abandoned one.
  assert.match(revisit, /`kind: 'supersedes'`, the new ADR as `source_document_id` and the old one as `target_document_id`/);
  assert.match(revisit, /The edge comes before the status/);
  assert.match(revisit, /Do not edit the old ADR's prose to say it was superseded/);
});

// --- Criterion 5 (must NOT): no recovery by reading what was written --------------------------------

test('the skill recovers nothing by reading a generated file', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  assert.deepEqual(recoveries(source, PARSES), []);

  const known = new Set(tools.map((tool) => tool.name));
  const named = toolNames(reachable(source));

  for (const required of ['list_product_brief', 'read_product_brief', 'list_adr', 'read_adr',
    'create_adr', 'update_adr', 'create_adr_option', 'create_adr_option_tradeoff',
    'create_dependency', 'list_dependency_kind', 'create_document_section',
    'list_document_section', 'read_document_section']) {
    assert.ok(named.includes(required), `the skill never names ${required}`);
    assert.ok(known.has(required), `${required} is not a tool`);
  }

  // The control: a file that reaches for the old file-per-ADR shape is caught by the same reading.
  const regressed = `${source}\n\nSave each ADR to docs/architecture/{nn}-adr-{slug}.md, and glob `
    + 'docs/architecture/[0-9]*-adr-*.md to find the others.';

  assert.ok(recoveries(regressed, PARSES).length >= 3,
    'the sweep passed a file that globs, names a path and builds a filename');
});
