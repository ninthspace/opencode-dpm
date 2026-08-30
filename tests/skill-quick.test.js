/**
 * Epic 47-07 Story 7 — the converted `quick`, and the four claims made about it.
 *
 * - "A quick run writes a `quick` row with its `quick_criterion` rows and its single-category retro
 *   observation, all typed" [feature]
 * - "Promotion to a completion record is a status update, not a rewrite of the file" [feature]
 * - "The facilitation survives: a fix still has its root cause investigated and its diagnosis
 *   confirmed before any change is proposed, and implementation still refuses to begin without the
 *   written change description" [feature]
 * - "must NOT — the skill recovers an entity by reading a generated markdown file rather than by
 *   calling a read tool" [unit]
 *
 * **The second claim is asserted on identity, not on content.** CPM writes a spec file and then
 * overwrites it with a completion record at the same path, so "promoted rather than rewritten" is a
 * claim about there being one artefact with a history. The test therefore holds the row's `id` and
 * `created_at` across the close and checks the same row came back changed — a rewrite would satisfy
 * every assertion about the *final* state and none about that.
 *
 * **The third is the pair of gates in order.** A diagnosis confirmed after a proposal is not a
 * diagnosis, and criteria read from the conversation rather than from the record are the copy that
 * drifts — so the run reads them back through the tools, and the test asserts it did.
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
  skillSource, toolNames, reachable, section, prose, instructions, recorder, recoveries, bindings,
  seedStartup, driveStartup,
} from './support/skills.js';
import { dispositionProblems } from './support/vocabulary.js';

const SKILL = 'quick';
const source = skillSource(SKILL);

/** The recoveries this file in particular would reach for, on top of the shared sweep. */
const PARSES = [
  { pattern: /`{3}markdown/, why: 'a document template, which is the projection’s to own' },
  // **The two-path shape is the recovery here.** CPM writes a spec file and later reads it back to
  // find the criteria, then overwrites it; either half named in prose is the file round-trip this
  // conversion removes.
  { pattern: /-spec\.md|spec file/i, why: 'a spec file written then read back, which is one row' },
  { pattern: /\*\*Retro\*\*:/, why: 'a retro field written as prose rather than as an observation' },
  { pattern: /replaces the (spec )?file|overwrit/i, why: 'a rewrite, where promotion is a status change' },
];

/** What a project holds when someone runs `quick`: an ADR the change has to respect, and startup. */
function workspace(tools) {
  const seed = handlers(tools);

  const spec = seed.create_spec({ slug: 'persistence', title: 'Persistence' });
  seed.create_adr({
    parent_id: spec.id, slug: 'store', title: 'One database per project',
    decision: 'Planning state lives in one SQLite file.',
  });

  const startup = seedStartup(seed, {
    scope: 'quick',
    skill: 'dpm:quick',
    phase: 'Step 2',
    live: ['A config loader returning null on a missing file hid two bugs before anyone looked.'],
  });

  return { spec, ...startup };
}

/**
 * The run the SKILL.md prescribes: startup, classify, diagnose on the fix path, propose, write the
 * record, read it back, execute, close.
 *
 * `path` is `fix` or `change`; `confirmed` is the answer at the diagnosis gate and `approved` the
 * answer at the proposal gate; `close` stops before Step 4 when false. `met` decides the criteria.
 */
function run(call, fixture, {
  path = 'fix', confirmed = true, approved = true, close = true, met = [true, true], attempt = 1,
} = {}) {
  // Adoption is once per database: the predecessor row can only be superseded by one successor, so
  // a test driving several runs against one project adopts on the first and not after.
  const startup = driveStartup(call, fixture, {
    scope: 'quick', skill: 'dpm:quick', attempt, roster: false, adopt: attempt === 1,
  });

  // Step 1a: on the fix path the diagnosis is formed and gated before anything is proposed.
  const diagnosis = path === 'fix'
    ? { cause: 'the config loader returns null when the file is missing', confidence: 'High' }
    : null;

  call.update_session({
    id: startup.session, phase: 'Step 1b', state: JSON.stringify({ path, diagnosis }),
  });

  if (path === 'fix' && !confirmed) {
    return { startup, diagnosis, quick: null, criteria: [], observation: null };
  }

  const proposed = path === 'fix'
    ? ['The loader raises on a missing file', 'A missing file cannot fail silently again']
    : ['The deploy script accepts --verbose', 'The flag is documented in its help output'];

  if (!approved) return { startup, diagnosis, proposed, quick: null, criteria: [], observation: null };

  // Step 2: the record and its criteria, confirmed and awaiting execution.
  const quick = call.create_quick({
    slug: path === 'fix' ? 'config-loader-silence' : 'verbose-flag',
    title: path === 'fix' ? 'Fix the silent config loader' : 'Add a --verbose flag',
    status_note: 'confirmed — awaiting execution',
  });

  const criteria = proposed.map((text, position) =>
    call.create_quick_criterion({ quick_id: quick.id, text, position }));

  call.create_document_section({
    document_id: quick.id, heading: 'Change', position: 0,
    body: path === 'fix' ? 'The loader raises rather than returning null.' : 'A --verbose flag.',
  });

  if (!close) return { startup, diagnosis, proposed, quick, criteria, observation: null };

  // Step 3's hard gate: the criteria are read back through the tools, not carried in the head.
  const readBack = {
    record: call.read_quick({ id: quick.id }),
    criteria: call.list_quick_criterion({ quick_id: quick.id, include_body: true }).items,
  };

  call.list_adr({ parent_id: fixture.spec.id }).items.forEach((row) => call.read_adr({ id: row.id }));

  // Step 4: decide each criterion, record what happened, observe, then move the status.
  criteria.forEach((criterion, index) => call.update_quick_criterion({
    id: criterion.id,
    met: met[index],
    note: met[index] ? 'covered by a test' : 'left for a follow-up',
  }));

  call.create_document_section({
    document_id: quick.id, heading: 'Verification', position: 1,
    body: 'The suite was run and each criterion inspected against the code.',
  });

  const terms = call.list_taxonomy({ domain: 'observation', limit: 100 }).items;
  const observation = call.create_observation({
    quick_id: quick.id,
    text: 'The silent-null path existed in two other loaders as well.',
    position: 0,
  });
  call.create_observation_category({
    observation_id: observation.id,
    taxonomy_id: terms.find((term) => term.id.includes('codebase')).id,
  });

  const closed = call.update_quick({
    id: quick.id, status: 'complete', closed_at: '2026-08-10T00:00:00.000Z',
  });

  return { startup, diagnosis, proposed, quick, criteria, readBack, observation, closed };
}

// --- Criterion 1: the record, its criteria and its observation are typed rows ----------------------

test('a quick run writes the record, its criteria and one categorised observation', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used, passed } = recorder(tools);

  const fixture = workspace(tools);
  const result = run(call, fixture);

  const raw = handlers(tools);
  const stored = raw.read_quick({ id: result.quick.id });

  assert.equal(stored.kind, 'quick');
  assert.equal(stored.number, 1, 'the number was not allocated by the call');

  const criteria = raw.list_quick_criterion({ quick_id: stored.id, include_body: true }).items;
  assert.equal(criteria.length, 2);
  assert.deepEqual(criteria.map((row) => row.met), [1, 1]);
  assert.ok(criteria.every((row) => row.note), 'a decided criterion carries no note');

  // **The observation hangs off the record, and its origin is the record.** This is the column the
  // story's migration added: before it, a quick's lesson had nowhere to live but a retro, and one
  // that arrives already grouped is one no retro can gather.
  const observations = raw.list_observation({ quick_id: stored.id, include_body: true }).items;
  assert.equal(observations.length, 1, 'the mandatory observation is missing or duplicated');
  assert.equal(observations[0].quick_id, stored.id);
  assert.equal(observations[0].retro_id, null, 'the observation arrived already gathered');
  assert.equal(observations[0].story_id, null);

  // Exactly one category, drawn from the observation domain and refused from any other.
  const categories = raw.list_observation_category({ observation_id: observations[0].id }).items;
  assert.equal(categories.length, 1);
  const domain = new Set(raw.list_taxonomy({ domain: 'observation', limit: 100 }).items.map((r) => r.id));
  assert.ok(domain.has(categories[0].taxonomy_id));
  assert.throws(
    () => raw.create_observation_category({
      observation_id: observations[0].id, taxonomy_id: 'severity:warning',
    }),
    /FOREIGN KEY/,
    'a severity was accepted as an observation category',
  );

  // **And `retro` can still gather it, without the origin moving.** The whole point of the second
  // origin column is that the gathering is non-destructive on this path as it is on the story one.
  const retro = raw.create_retro({ parent_id: stored.id, slug: 'after', title: 'After the fix' });
  const gathered = raw.update_observation({ id: observations[0].id, retro_id: retro.id });
  assert.equal(gathered.retro_id, retro.id);
  assert.equal(gathered.quick_id, stored.id, 'gathering cleared the origin');

  // An observation with no origin at all is still refused — the CHECK was widened, not dropped.
  assert.throws(
    () => raw.create_observation({ text: 'from nowhere', position: 9 }),
    /CHECK constraint failed/,
    'an observation belonging to nothing was accepted',
  );

  const close = prose(source, 'Step 4: Close the record');
  assert.match(close, /The observation is mandatory, carries exactly one category, and hangs off this/);
  assert.match(close, /`quick_id` is its origin/);
  assert.match(close, /Do not create a retro here to hold it/);
  assert.ok(passed.get('create_observation').has('quick_id'));

  // The numbered step asserted apart from the paragraph that explains it — the rule `instructions`
  // exists for, and this is the survivor that put it there.
  const instruction = instructions(source, 'Step 4: Close the record');
  assert.match(instruction, /`mcp__plugin_dpm_dpm__create_observation` with the quick record as `quick_id`/);
  assert.doesNotMatch(instruction, /create_retro/,
    'the close step opens a retro to hold the observation, which is the gathering it must not do');

  assert.deepEqual(bindings(source, tools, { used, passed }), []);
});

// --- Criterion 2: promotion is a status update, not a rewrite -------------------------------------

test('the confirmed record and the completion record are one row with a history', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);

  const fixture = workspace(tools);
  const raw = handlers(tools);

  // Stop before the close, and take the record as it stands: confirmed, open, undecided.
  const open = run(call, fixture, { close: false });
  const before = raw.read_quick({ id: open.quick.id });

  assert.equal(before.status, 'pending');
  assert.equal(before.closed_at, null);
  assert.deepEqual(
    raw.list_quick_criterion({ quick_id: before.id }).items.map((row) => row.met),
    [null, null],
    'a criterion was decided before the work was done',
  );

  // Now close the same record, with one criterion met and one not.
  raw.list_quick_criterion({ quick_id: before.id }).items.forEach((criterion, index) =>
    raw.update_quick_criterion({
      id: criterion.id, met: index === 0, note: index === 0 ? 'covered' : 'left for a follow-up',
    }));
  const after = raw.update_quick({
    id: before.id, status: 'complete', closed_at: '2026-08-10T00:00:00.000Z',
  });

  // **Same row, same identity, same origin date.** A rewrite would satisfy every assertion about the
  // closed state and fail these three.
  assert.equal(after.id, before.id);
  assert.equal(after.number, before.number);
  assert.equal(after.created_at, before.created_at);
  assert.equal(after.slug, before.slug, 'the record was re-slugged on close');
  assert.equal(after.status, 'complete');
  assert.equal(after.closed_at, '2026-08-10T00:00:00.000Z');

  // Only one record exists — a promotion that wrote a second document would leave two.
  assert.equal(raw.list_quick({}).items.length, 1);

  // **`met` is a tri-state and the refusal is recorded rather than dropped.**
  assert.deepEqual(raw.list_quick_criterion({ quick_id: after.id }).items.map((row) => row.met), [1, 0]);

  // And the projection shows the decision, both ways round.
  const files = project(db, { write: false });
  const rendered = files.written.find((file) => file.text.includes(after.title));
  assert.ok(rendered, 'the record is rendered in no file at all');
  assert.match(rendered.text, /\| ✓ \|/, 'a met criterion is not marked met');
  assert.match(rendered.text, /Closed/, 'the close date reached no reader');

  const close = prose(source, 'Step 4: Close the record');
  assert.match(close, /The record is not replaced when it ships; its status moves/);
  assert.match(close, /one artefact with a history rather than two documents/);
  assert.match(close, /`met` is a tri-state and the third state is the useful one/);
});

// --- Criterion 3: the facilitation survives -------------------------------------------------------

test('a fix is diagnosed before it is proposed, and execution reads the record back', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used } = recorder(tools);

  const fixture = workspace(tools);
  const raw = handlers(tools);

  // A diagnosis the user rejects stops the run: nothing is proposed and nothing is written.
  const rejected = run(call, fixture, { confirmed: false });
  assert.equal(rejected.quick, null);
  assert.deepEqual(raw.list_quick({}).items, [], 'a record exists after an unconfirmed diagnosis');

  // A refused proposal writes nothing either, though the diagnosis was reached.
  const unapproved = run(call, fixture, { approved: false, attempt: 2 });
  assert.ok(unapproved.diagnosis, 'the fix path skipped its diagnosis');
  assert.deepEqual(raw.list_quick({}).items, [], 'a record exists after a refused proposal');

  // A completed run reads its criteria back through the tools rather than from the conversation.
  const done = run(call, fixture, { attempt: 3 });
  assert.equal(done.readBack.criteria.length, 2);
  assert.ok(used.has('read_quick'), 'execution never read the record back');
  assert.ok(used.has('list_quick_criterion'), 'execution never read the criteria back');

  // The diagnosis is the fix path's and not the change path's.
  const diagnose = prose(source, 'Step 1a: Diagnose — the fix path only');
  assert.match(diagnose, /A fix is not started until its cause is found/);
  assert.match(diagnose, /`Confirmed` \/\s*`Partially right` \/ `Wrong`/);
  assert.match(diagnose, /Nothing is proposed before this gate passes/);

  const write = prose(source, 'Step 2: Propose, confirm, and write the record');
  assert.match(write, /`Execute` \/ `Adjust`/);
  assert.match(write, /The written record is a hard gate on Step 3/);
  assert.match(write, /`mcp__plugin_dpm_dpm__read_quick` returns the record/);
  assert.match(write, /read them back rather than\s+working from the conversation/);

  // The regression half of a fix's criteria, which a happy-path check misses.
  assert.match(write, /what proves the specific failure cannot recur/);

  for (const [earlier, later] of [
    ['Step 1a: Diagnose', 'Step 1b: Assess the scope'],
    ['Step 1b: Assess the scope', 'Step 2: Propose, confirm, and write the record'],
    ['Step 2: Propose, confirm, and write the record', 'Step 3: Execute'],
    ['Step 3: Execute', 'Step 4: Close the record'],
  ]) {
    assert.ok(source.indexOf(earlier) < source.indexOf(later), `${earlier} runs after ${later}`);
  }

  // Escalation is offered once, and the decision is the user's.
  const assess = prose(source, 'Step 1b: Assess the scope');
  assert.match(assess, /offer escalation \*\*once\*\*/);
  assert.match(assess, /raised once and not again/);
});

// --- Criterion 4 (must NOT): no recovery by reading what was written --------------------------------

test('the skill recovers nothing by reading a generated file', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  assert.deepEqual(recoveries(source, PARSES), []);

  const known = new Set(tools.map((tool) => tool.name));
  const named = toolNames(reachable(source));

  for (const required of ['list_session', 'adopt_session', 'create_session', 'update_session',
    'list_library', 'list_library_scope', 'list_document_section', 'read_document_section',
    'list_retro', 'list_observation', 'list_observation_category', 'list_taxonomy',
    'list_adr', 'read_adr', 'create_quick', 'read_quick', 'update_quick',
    'create_quick_criterion', 'list_quick_criterion', 'update_quick_criterion',
    'create_document_section', 'create_observation', 'create_observation_category']) {
    assert.ok(named.includes(required), `the skill never names ${required}`);
    assert.ok(known.has(required), `${required} is not a tool`);
  }

  // The completion path names no second artefact, because there is no second artefact.
  const output = prose(source, 'Output');
  assert.match(output, /Do not tell the user a path/);
  assert.match(output, /no second path for the completion record/);

  // The control: a file that reaches for the write-then-overwrite shape is caught by the same reading.
  const regressed = `${source}\n\nWrite the spec file to docs/quick/{nn}-quick-{slug}-spec.md, read `
    + 'it back with the Read tool before executing, then the completion record replaces the file at '
    + 'the same path, with a **Retro**: line at the end.';

  assert.ok(recoveries(regressed, PARSES).length >= 5,
    'the sweep passed a file that names a path, builds a filename, reads a file back and overwrites it');
});

// --- Spec 50 FR6: the closing report is derived from `met` ---------------------------------------

test('the close reports each criterion under the disposition its `met` column gives it', () => {
  const step = section(source, 'Step 4: Close the record');

  assert.notEqual(step, '', 'the closing step still exists');
  assert.deepEqual(dispositionProblems(step, 'quick Step 4'), []);

  // The site-specific half: the tri-state is what decides, and all three of its states are routed.
  // Without this the shared reading above is satisfied by a step that names the domain and then
  // leaves the writer to sort the criteria by feel.
  assert.match(step, /`met` true/, 'a met criterion is not routed');
  assert.match(step, /`met` false/, 'a criterion decided against is not routed');
  assert.match(step, /`met` still unset at close/, 'the undecided third state is not routed');
  assert.match(step, /The column decides, not the sentence/,
    'the dispositions are described beside the column rather than derived from it');

  // The control on the label sweep, which is the assertion most likely to pass for the wrong
  // reason: it has to be shown catching a label before an empty result means anything.
  assert.ok(dispositionProblems(`${step}\nEach one is Fixed.`, 'planted').length >= 1,
    'the sweep passed a step that writes a label out');
});
