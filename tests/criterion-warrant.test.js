/**
 * Epic 04-03 Story 3 — the criterion an accepted decision warrants.
 *
 * A coverage row binds a criterion to a *requirement*, so a criterion written because an ADR
 * constrains the story has nothing to quote and nothing to bind. FR7's claim is that such a
 * criterion is finished work rather than a gap, and that a roll-up can tell the two apart.
 *
 * **Two halves, and each is worthless without the other.** `warrant_adr_id` says what warrants the
 * criterion, and the tool refuses one that names a decision nobody accepted — a warrant pointing at
 * a proposal would exempt a criterion from the gap list on the strength of an argument still being
 * had. `accounted_for` is the judgement itself, derived rather than stored, because two skills ask
 * it and prose is the one place two copies of a rule cannot be compared.
 *
 * **The must-NOT here is an exemption, which is the most dangerous shape a must-NOT takes.** "A
 * warranted criterion is not reported as a gap" is satisfied perfectly by a field that is always
 * true, and by a report that names nothing at all. Criterion 4 is the control that fails in both
 * those worlds, and it was checked against a deliberately broken derivation before it was written.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase as planning, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import { skillSource } from './support/skills.js';

const AT = '2026-08-27T00:00:00Z';

/** The tool surface, by name. */
function surface(t) {
  const db = planning(t);

  return { db, call: handlers(spineTools(db)) };
}

/**
 * A spec, an epic, a story and a requirement — and three ADRs, one per decision status this story
 * has to tell apart.
 *
 * **The accepted one is promoted rather than created accepted**, because `create_adr` cannot carry
 * `accepted`: `DETAIL.adr`'s guard requires exactly one chosen option and an ADR has none at the
 * moment it is created. That is the shape the surface intends — a decision is proposed, its options
 * are explored, one is chosen — and a fixture that fought it would be testing against a database
 * this project cannot produce.
 */
function project(call) {
  const spec = call.create_spec({ slug: 'supersession', title: 'Coverage binding supersession' });
  const epic = call.create_epic({ parent_id: spec.id, slug: 'warrant', title: 'Warrant' });
  const story = call.create_story({ epic_id: epic.id, number: 1, title: 'Warrant it', position: 0 });
  const requirement = call.create_requirement({
    spec_id: spec.id, label: 'FR7', class: 'functional', position: 0,
    text: 'A story criterion whose warrant is an accepted decision rather than requirement text is traceable.',
  });

  const adr = (slug, decision_status) => call.create_adr({
    parent_id: spec.id, slug, title: `Decision ${slug}`, decision: 'The decision itself.',
    ...(decision_status === 'proposed' ? {} : { decision_status }),
  });

  const proposed = adr('proposed', 'proposed');
  const rejected = adr('rejected', 'rejected');
  const accepted = adr('accepted', 'proposed');

  call.create_adr_option({ adr_id: accepted.id, name: 'The one taken', chosen: true, position: 0 });
  call.update_adr({ id: accepted.id, decision_status: 'accepted' });

  return { spec, epic, story, requirement, proposed, rejected, accepted };
}

/** A criterion under this story, at the next free position. */
const criterion = (call, story, position, args = {}) => call.create_story_criterion({
  story_id: story.id, text: `Criterion ${position}`, position, ...args,
});

/** A live binding from a criterion to the requirement, quoting a fragment of its text. */
const bind = (call, requirement, subject, spec_fragment, position) => call.create_coverage({
  requirement_id: requirement.id, spec_fragment, story_criterion_id: subject.id, position,
});

/** Run something that must be refused, and hand back the error so its message can be read. */
function refused(run, message) {
  let caught;

  try {
    run();
  } catch (error) {
    caught = error;
  }

  assert.ok(caught, message ?? 'the call was accepted when it should have been refused');

  return caught;
}

// --- Criterion 1: the warrant names an accepted decision, or the write is refused ------------------

test('create and update set a warrant naming an accepted decision [integration]', (t) => {
  const { call } = surface(t);
  const { story, accepted } = project(call);

  const created = criterion(call, story, 0, { warrant_adr_id: accepted.id });

  assert.equal(created.warrant_adr_id, accepted.id);

  // And through the update arm, on a criterion that was created without one — which is the path a
  // pivot takes when an amendment leaves a criterion warranted by a decision rather than by text.
  const later = criterion(call, story, 1);

  assert.equal(call.update_story_criterion({ id: later.id, warrant_adr_id: accepted.id })
    .warrant_adr_id, accepted.id);
});

test('a warrant naming anything short of an accepted decision is refused [integration]', (t) => {
  const { call } = surface(t);
  const { spec, story, proposed, rejected, accepted } = project(call);

  // Each case names a different remedy, which is why the message distinguishes them: accept the
  // decision, choose a different one, or find the right id.
  const wrong = [
    { id: proposed.id, says: /names a proposed decision/ },
    { id: rejected.id, says: /names a rejected decision/ },
    { id: spec.id, says: /names no ADR/, why: 'a document that is not an ADR was accepted as one' },
    { id: '01M000000000000000000000', says: /names no ADR/ },
  ];

  for (const { id, says, why } of wrong) {
    const error = refused(() => criterion(call, story, 0, { warrant_adr_id: id }), why);

    assert.match(error.message, says);
    assert.match(error.message, /^create_story_criterion:/, 'the refusal does not name the tool');
    assert.match(error.message, /accepted one/, 'and does not say what would be accepted');
  }

  // The same refusal from the update arm, on a stored criterion — and the row is unchanged after,
  // because a guard that refused *after* writing would leave the warrant it rejected.
  const stored = criterion(call, story, 0);

  assert.match(
    refused(() => call.update_story_criterion({ id: stored.id, warrant_adr_id: proposed.id })).message,
    /^update_story_criterion:.*names a proposed decision/,
  );
  assert.equal(call.read_story_criterion({ id: stored.id }).warrant_adr_id, null);

  // **The control on all of it**: the same call shape with the accepted decision succeeds. Without
  // this the refusals above are satisfied by a guard that refuses every warrant there is.
  assert.equal(call.update_story_criterion({ id: stored.id, warrant_adr_id: accepted.id })
    .warrant_adr_id, accepted.id);
});

test('a criterion carrying no warrant is not judged on one [integration]', (t) => {
  const { call } = surface(t);
  const { story } = project(call);
  const plain = criterion(call, story, 0);

  // The overwhelmingly common call: an update that mentions only `text`. The guard sees the stored
  // row with the changes over it, so it has a `warrant_adr_id` in hand on every call — and must
  // stay quiet when it is null rather than refusing a column the caller never named.
  assert.equal(call.update_story_criterion({ id: plain.id, text: 'Reworded.' }).text, 'Reworded.');
  assert.equal(call.update_story_criterion({ id: plain.id, position: 3 }).position, 3);
});

// --- Criteria 2 and 3: what accounts for a criterion, and the exemption ---------------------------

test('a warrant with no binding reads as accounted for, and neither does not [integration]', (t) => {
  const { call } = surface(t);
  const { story, requirement, accepted } = project(call);

  const warranted = criterion(call, story, 0, { warrant_adr_id: accepted.id });
  const bound = criterion(call, story, 1);
  const neither = criterion(call, story, 2);

  bind(call, requirement, bound, 'A story criterion whose warrant', 0);

  const accountedFor = (row) => call.read_story_criterion({ id: row.id }).accounted_for;

  assert.equal(accountedFor(warranted), true, 'a warranted criterion reads as an unbound gap');
  assert.equal(accountedFor(bound), true, 'a bound criterion reads as an unbound gap');

  // **Criterion 4, the control, and the reason the two above mean anything.** A derivation hardwired
  // true satisfies every positive assertion in this file. This is the one that fails when it is.
  assert.equal(accountedFor(neither), false,
    'a criterion with neither a binding nor a warrant reads as accounted for, so the field is not '
    + 'deriving anything');

  // The list carries the same field as the read, and carries it for the whole page. A roll-up walks
  // a story's criteria rather than reading them one at a time, so a field that reached only the
  // read would be a field the report never sees.
  const listed = call.list_story_criterion({ story_id: story.id }).items;

  assert.deepEqual(
    listed.map((row) => [row.id, row.accounted_for]),
    [[warranted.id, true], [bound.id, true], [neither.id, false]],
  );

  // Criterion 3, as the set a report is built from rather than as a report: the unaccounted-for
  // criteria are exactly the one carrying neither anchor.
  assert.deepEqual(listed.filter((row) => !row.accounted_for).map((row) => row.id), [neither.id]);
});

// --- Criterion 5: a warrant does not stand in for a binding ---------------------------------------

test('a criterion carrying both still counts its binding [integration]', (t) => {
  const { call } = surface(t);
  const { story, requirement, accepted } = project(call);

  const both = criterion(call, story, 0, { warrant_adr_id: accepted.id });
  const binding = bind(call, requirement, both, 'A story criterion whose warrant', 0);

  assert.equal(call.read_story_criterion({ id: both.id }).accounted_for, true);

  // The binding is a row of its own and goes on being one — a warrant that displaced it would take
  // the fragment, the ✓ and the matrix row with it.
  assert.deepEqual(call.list_coverage({ story_criterion_id: both.id }).items.map((row) => row.id),
    [binding.id]);

  // **The interaction with story 2, which is where the `or` earns its keep.** Superseding the
  // criterion retires its binding, so the binding stops accounting for it — and the warrant is then
  // the only thing left holding it out of the gap list.
  call.update_story_criterion({
    id: both.id, superseded_at: AT, superseded_reason: 'The amendment moved the obligation.',
  });

  assert.deepEqual(call.list_coverage({ story_criterion_id: both.id }).items, [],
    'the supersession did not retire the binding, so this asserts nothing about the warrant');
  assert.equal(call.read_story_criterion({ id: both.id }).accounted_for, true,
    'a retired binding took the warrant with it, so the two anchors are not independent');

  // And the control on that: the same supersession on a criterion with no warrant leaves it
  // unaccounted-for, which is what says the `true` above came from the warrant rather than from the
  // field ignoring retirement.
  const bare = criterion(call, story, 1);

  bind(call, requirement, bare, 'is traceable', 1);
  call.update_story_criterion({
    id: bare.id, superseded_at: AT, superseded_reason: 'The amendment moved this one too.',
  });

  assert.equal(call.read_story_criterion({ id: bare.id }).accounted_for, false);
});

// --- The two roll-ups that read it ----------------------------------------------------------------

test('both roll-ups read the field rather than deriving the rule [unit]', () => {
  for (const skill of ['do', 'epics']) {
    const source = skillSource(skill);

    assert.match(source, /accounted_for/,
      `${skill} does not name the field, so its roll-up is still counting coverage rows`);
    assert.match(source, /warrant/,
      `${skill} names the field without saying what it is for`);
  }
});
