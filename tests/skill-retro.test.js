/**
 * Epic 47-07 Story 5 — the converted `retro`, and the four claims made about it.
 *
 * - "A retro run gathers `observation` rows already written against stories by setting `retro_id`,
 *   leaving `story_id` intact, so an observation's origin survives promotion" [feature]
 * - "`learn` and `retire` set the retirement columns on the observation rather than editing a
 *   marker into prose; a retired observation is excluded from candidate gathering by a `WHERE`
 *   clause" [integration]
 * - "The facilitation survives: the four modes stay mutually exclusive, a `learn` still previews
 *   both the library entry and the retirement before either is written, and promotion still retires
 *   at the source in the same operation" [feature]
 * - "must NOT — the skill recovers an entity by reading a generated markdown file rather than by
 *   calling a read tool" [unit]
 *
 * **The first claim is asserted twice over, because one assertion cannot catch its failure.** That
 * every gathered row still carries `story_id` is true of a run that *created* fresh observations on
 * the retro and left the originals where they were — the new rows have no `story_id` to lose, and
 * the old ones were never touched. So the count is asserted alongside it: gathering moves no row
 * and creates none, and only the pair distinguishes it from a rewrite.
 *
 * **The third claim's "same operation" is asserted as an unreachable state.** A run's call log
 * unions its arguments per tool, so "these two travelled together" is not visible in it. What is
 * visible is that no observation ends up promoted-but-not-retired, which is the state splitting the
 * call would produce.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import {
  skillSource, toolNames, reachable, section, prose, instructions, recorder, recoveries, bindings,
  seedStartup, driveStartup,
} from './support/skills.js';

const SKILL = 'retro';
const source = skillSource(SKILL);

/** The recoveries this file in particular would reach for, on top of the shared sweep. */
const PARSES = [
  { pattern: /`{3}markdown/, why: 'a document template, which is the projection’s to own' },
  { pattern: /\*\*Retired\b/, why: 'the prose retirement marker, which is now two columns' },
  { pattern: /\*\*Retro waived\b/, why: 'the prose waiver marker, which is now two columns' },
  { pattern: /docs\/(retros|library|epics)\//, why: 'a directory this skill no longer names' },
  { pattern: /modification time|filename prefix/i, why: 'ordering by filename, which is allocation read backwards' },
];

/** A retirement stamp, so the tests read the same date they assert on. */
const SPENT = '2026-02-01T00:00:00.000Z';

/**
 * What a project holds when someone runs `retro`: a finished epic whose stories carry observations
 * written during the work, one of them already retired, plus the startup corpus.
 */
function workspace(tools) {
  const seed = handlers(tools);

  const spec = seed.create_spec({ slug: 'persistence', title: 'Persistence' });
  const epic = seed.create_epic({
    parent_id: spec.id, slug: 'spine', title: 'Spine', status: 'complete',
  });
  const stories = ['Substrate', 'Tools'].map((title, position) => seed.create_story({
    epic_id: epic.id, number: position + 1, title, position, status: 'complete',
  }));

  const terms = seed.list_taxonomy({ domain: 'observation', limit: 100 }).items;

  // Written by `do` during the work, against the story that raised each. No retro exists yet — the
  // whole point of the inclusive parentage is that this row is legal before there is one.
  const written = [
    { story: stories[0], text: 'A criterion nobody could test reached implementation.' },
    { story: stories[0], text: 'The conformance seam only checks one direction.' },
    { story: stories[1], text: 'Asserting each layer that can refuse a call is worth repeating.' },
  ].map(({ story, text }, position) => {
    const observation = seed.create_observation({ story_id: story.id, position, text });
    seed.create_observation_category({
      observation_id: observation.id, taxonomy_id: terms[position % terms.length].id,
    });
    return observation;
  });

  // One already spent, so candidate gathering has something it must not offer.
  const spent = seed.create_observation({
    story_id: stories[1].id, position: 3, text: 'Beware the module that no longer exists.',
  });
  seed.update_observation({
    id: spent.id, retired_at: SPENT, retired_reason: 'the module it warned about is gone',
  });

  // A second epic that finished clean, for triage: complete, no retro, no observations.
  const clean = seed.create_epic({
    parent_id: spec.id, slug: 'tidy', title: 'Tidy', status: 'complete',
  });

  const startup = seedStartup(seed, {
    scope: 'retro',
    skill: 'dpm:retro',
    phase: 'Step 2',
    live: ['A lesson from the round before.'],
  });

  return { spec, epic, stories, written, spent, clean, terms, ...startup };
}

/**
 * The synthesis run the SKILL.md prescribes: startup, the observations gathered off their stories,
 * a synthesis per category, then the Step 3 gate.
 *
 * `approved` is the answer at the gate.
 */
function synthesise(call, fixture, { approved = true, attempt = 1, adopt = true } = {}) {
  const startup = driveStartup(call, fixture, {
    scope: 'retro', skill: 'dpm:retro', attempt, adopt, roster: false,
  });

  const offered = call.list_epic({}).items;
  const epic = call.read_epic({ id: fixture.epic.id });

  // Step 1: every observation reached through the story that raised it. The retired one is not
  // returned, and no filter here does that — the list does.
  const stories = call.list_story({ epic_id: epic.id }).items;
  const gathered = stories.flatMap((story) => call
    .list_observation({ story_id: story.id, include_body: true }).items
    .map((observation) => ({
      story,
      observation,
      categories: call.list_observation_category({ observation_id: observation.id }).items,
    })));

  const terms = call.list_taxonomy({ domain: 'observation', limit: 100 }).items;

  call.update_session({
    id: startup.session, phase: 'Step 3', state: JSON.stringify({ mode: 'synthesis' }),
  });

  if (!approved) return { startup, offered, epic, stories, gathered, terms, retro: null };

  const retro = call.create_retro({ parent_id: epic.id, slug: 'spine', title: 'Retro: spine' });

  gathered.forEach(({ observation }, position) => {
    call.update_observation({
      id: observation.id,
      retro_id: retro.id,
      position,
      synthesis: 'The gap was found late in each case.',
    });
  });

  return { startup, offered, epic, stories, gathered, terms, retro };
}

// --- Criterion 1: gathering sets `retro_id` and the origin survives -------------------------------

test('a retro run gathers observations by setting retro_id and leaves story_id where it was', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used, passed } = recorder(tools);

  const fixture = workspace(tools);
  const raw = handlers(tools);

  const before = raw.list_observation({ include_retired: true, limit: 100 }).items.length;
  const result = synthesise(call, fixture);
  const after = raw.list_observation({ include_retired: true, limit: 100 }).items;

  assert.equal(after.length, before, 'the run created observations instead of gathering them');

  const stored = raw.list_observation({ retro_id: result.retro.id, include_body: true }).items;
  assert.equal(stored.length, fixture.written.length);

  // **The origin survived the gathering.** Each row is the one `do` wrote, still pointing at its
  // story, now also pointing at the retro.
  const origins = new Map(fixture.written.map((row) => [row.id, row.story_id]));
  for (const observation of stored) {
    assert.ok(origins.has(observation.id), 'the retro holds a row that was not one of the originals');
    assert.equal(observation.story_id, origins.get(observation.id), 'an origin was cleared');
    assert.equal(observation.retro_id, result.retro.id);
  }

  // And the origin is queryable from the story side, which is what FR10 is actually about.
  const fromStory = raw.list_observation({ story_id: fixture.stories[0].id }).items;
  assert.equal(fromStory.length, 2);
  assert.ok(fromStory.every((row) => row.retro_id === result.retro.id));

  // The number came from the call, and is not an argument the tool accepts.
  assert.ok(!('number' in tools.find((tool) => tool.name === 'create_retro').inputSchema.properties));
  assert.ok(!passed.get('create_retro').has('number'));

  // **The rationale and the instruction are asserted separately, because a mutation reaches one
  // without the other.** Both survivors here had the same shape: the numbered step was changed to
  // create a fresh row, or to null `story_id` as it gathered, and the paragraph underneath went on
  // saying the opposite — so a check over the whole section passed while the step it governs had
  // reversed. The paragraph is the reason a maintainer keeps the rule; the line is the rule.
  const write = prose(source, 'Step 3: Write the retro');
  assert.match(write, /Setting `retro_id` is the gathering, and nothing else changes/);

  // **Both origins, named.** Epic 47-07 Story 7 gave `observation` a second origin column so a
  // quick record's lesson could be written where the work happened; a rule that names only
  // `story_id` leaves the newer path to be inferred, and the inference a reader makes when
  // gathering is that the unnamed column is the one to tidy up.
  assert.match(write, /`story_id` and `quick_id` are\s+where the observation came from/);
  assert.match(write, /neither is cleared, re-supplied, or moved/);
  assert.match(write, /Do not create a new observation on the retro/);

  const instruction = instructions(source, 'Step 3: Write the retro');
  assert.match(instruction, /`mcp__plugin_dpm_dpm__update_observation` per observation, setting `retro_id`/);
  assert.doesNotMatch(instruction, /create_observation/, 'the write step creates rather than gathers');
  assert.doesNotMatch(instruction, /`story_id`/, 'the write step touches the origin');

  assert.ok(passed.get('update_observation').has('retro_id'));
  assert.ok(!passed.get('update_observation').has('story_id'), 'the run re-supplied the origin');

  assert.deepEqual(bindings(source, tools, { used, passed }), []);
});

// --- Criterion 2: retirement is columns, and exclusion is a predicate ------------------------------

test('retirement is two columns and the list omits what they mark', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const raw = handlers(tools);

  const fixture = workspace(tools);

  // The spent observation is on the same story as a live one, so what excludes it is the columns
  // and not the scope.
  const live = raw.list_observation({ story_id: fixture.stories[1].id, include_body: true }).items;
  assert.equal(live.length, 1);
  assert.equal(live[0].retired_at, null);

  const all = raw.list_observation({
    story_id: fixture.stories[1].id, include_retired: true, include_body: true,
  }).items;
  assert.equal(all.length, 2, 'the retired row is gone rather than withheld');

  const spent = all.find((row) => row.id === fixture.spent.id);
  assert.equal(spent.retired_at, SPENT);
  assert.equal(spent.retired_reason, 'the module it warned about is gone');
  assert.match(spent.text, /Beware the module/, 'retirement deleted the observation');

  // **Both columns or neither.** A date with no reason is a decision with no record of why.
  assert.throws(
    () => raw.update_observation({ id: fixture.written[0].id, retired_at: SPENT }),
    /CHECK constraint/,
    'an observation was retired without a reason',
  );

  // **The pair holds in both directions**: clearing one end and leaving the other is the same
  // half-state the `CHECK` refuses on the way in.
  assert.throws(
    () => raw.update_observation({ id: fixture.spent.id, retired_at: null }),
    /CHECK constraint/,
    'a retirement was left with a reason and no date',
  );

  // **Retirement is durable because no skill undoes it, not because the tools cannot.** Story 8
  // made an explicit null distinguishable from an omitted argument, which is what closes false-pass
  // register #22 — and an update that accepts a clear, reports success and changes nothing is that
  // entry exactly. This assertion used to read the other way round and pinned the defect in place,
  // citing `entityTools` dropping nulls as the mechanism. Clearing both columns together is now an
  // ordinary edit, and what carries the durability is that nothing is *named* for it: the skill's
  // own prose, asserted below, and the absence of an un-retire tool on the surface.
  assert.equal(
    raw.update_observation({
      id: fixture.spent.id, retired_at: null, retired_reason: null,
    }).retired_at,
    null,
    'the ordinary update path could not clear a nullable pair',
  );
  assert.equal(raw.list_observation({ story_id: fixture.stories[1].id }).items.length, 2,
    'and the row is live again, which is what clearing the columns means');

  assert.equal(tools.some((tool) => /unretire|un_retire|restore_/.test(tool.name)), false,
    'the surface grew a tool named for lifting a retirement');

  const durable = prose(source, 'Lesson retirement (`retire`)');
  assert.match(durable, /Retiring is durable and this skill does not undo it/);
  assert.match(durable, /stay readable under `include_retired`/);

  // The exclusion is the tool's, so the file says so rather than instructing a scan.
  const step = prose(source, 'Step 1: Gather the observations');
  assert.match(step, /A retired observation is not returned, and that is the tool's doing/);
  assert.match(step, /unless a caller passes `include_retired`/);
  assert.match(step, /no marker to look for in the text/);

  const select = prose(source, 'Step L1: Select');
  assert.match(select, /a promoted lesson is not among them/);
  assert.match(select, /cannot be offered twice/);

  // And the argument that would defeat it is not one the file ever tells a run to pass in a
  // candidate step — `include_retired` appears only where the audit trail is the question.
  assert.doesNotMatch(select, /include_retired: true|pass `include_retired`/);
});

// --- Criterion 3: the facilitation survives --------------------------------------------------------

test('the four modes stay apart, a preview writes nothing, and promotion retires in the same call', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);

  const fixture = workspace(tools);
  const raw = handlers(tools);

  // A refused synthesis gate writes no retro and gathers nothing.
  const refused = synthesise(call, fixture, { approved: false });
  assert.equal(refused.retro, null);
  assert.deepEqual(raw.list_retro({}).items.filter((row) => row.slug === 'spine'), []);
  assert.ok(raw.list_observation({ story_id: fixture.stories[0].id }).items
    .every((row) => row.retro_id === null), 'observations were gathered before the gate answered');

  // It still read what it needed to.
  assert.equal(refused.stories.length, 2);
  assert.equal(refused.gathered.length, 3);

  // The second run is the same session lineage, so it does not adopt again — the predecessor was
  // adopted by the refused run above, and a second adoption of one row is refused by the tool.
  const result = synthesise(call, fixture, { attempt: 2, adopt: false });

  // `learn`, stopped at the preview: nothing at all is written.
  const librariesBefore = raw.list_library({}).items.length;
  const candidates = raw.list_observation({ retro_id: result.retro.id, include_body: true }).items;
  assert.equal(raw.list_library({}).items.length, librariesBefore);
  assert.ok(candidates.every((row) => row.library_doc_id === null && row.retired_at === null));

  // `learn`, confirmed: the library entry, its scopes, its body, then one call carrying the link
  // and the retirement together.
  const chosen = candidates[0];
  const entry = call.create_library({
    slug: 'testable-criteria', title: 'Criteria must be testable', doc_type: 'lesson',
  });
  for (const scope of ['do', 'epics']) call.create_library_scope({ document_id: entry.id, scope });
  call.create_document_section({
    document_id: entry.id, heading: 'Criteria must be testable', position: 0,
    body: 'A criterion two implementers would satisfy differently is not a criterion.',
  });
  call.update_observation({
    id: chosen.id, library_doc_id: entry.id, retired_at: SPENT, retired_reason: 'promoted',
  });

  // **The promoted-but-not-retired state is unreachable**, which is what "same operation" means
  // when there is no transaction to point at.
  const promoted = raw.list_observation({ include_retired: true, limit: 100 }).items;
  assert.ok(!promoted.some((row) => row.library_doc_id !== null && row.retired_at === null),
    'a lesson is promoted and still on offer');

  const graduated = promoted.find((row) => row.id === chosen.id);
  assert.equal(graduated.library_doc_id, entry.id);
  assert.equal(graduated.library_doc_kind, 'library');
  assert.equal(graduated.story_id, chosen.story_id, 'promotion lost the origin');

  // Provenance is kind-pinned, so it cannot point at the epic it came out of.
  assert.throws(
    () => raw.update_observation({ id: candidates[1].id, library_doc_id: fixture.epic.id }),
    /FOREIGN KEY/,
    'an observation was promoted into something that is not a library document',
  );

  // And it is no longer a candidate, without anything checking whether it was promoted before.
  assert.ok(!raw.list_observation({ retro_id: result.retro.id }).items
    .some((row) => row.id === chosen.id));

  // `triage`: the clean epic is waived by columns, and waiving writes no retro.
  const retrosBefore = raw.list_retro({}).items.length;
  call.update_epic({
    id: fixture.clean.id, retro_waived_at: SPENT, retro_waived_reason: 'clean epic, no lessons',
  });
  assert.equal(raw.list_retro({}).items.length, retrosBefore, 'triage synthesised a retro');

  const waived = raw.read_epic({ id: fixture.clean.id });
  assert.equal(waived.retro_waived_at, SPENT);
  assert.equal(waived.retro_waived_reason, 'clean epic, no lessons');

  assert.throws(
    () => raw.update_epic({ id: fixture.epic.id, retro_waived_at: SPENT }),
    /CHECK constraint/,
    'an epic was waived with no reason recorded',
  );

  // The four modes, and that they are exclusive rather than merely listed.
  const input = prose(source, 'Input');
  assert.match(input, /Four modes, and they never run together/);
  assert.match(input, /The four are separate because their terminus differs/);
  assert.match(input, /A run does one/);
  for (const mode of ['learn', 'retire', 'triage']) {
    assert.ok(section(source, 'Input').includes(`**\`${mode}\`**`), `${mode} is not offered`);
  }

  // The preview covers both halves, before either is written.
  const promote = prose(source, 'Step L2: Preview, then promote');
  assert.match(promote, /Preview both halves before writing either/);
  assert.match(promote, /Nothing is written until this is confirmed/);
  assert.match(promote, /with `retired_at` and `retired_reason` \*\*in the same call\*\*/);
  assert.match(promote, /splitting step 4 into two calls is what would create it/);
  assert.ok(promote.indexOf('create_library`') < promote.indexOf('setting `library_doc_id`'),
    'the retirement is prescribed before the entry it points at');

  // The synthesis gate, and triage's pairing.
  assert.match(prose(source, 'Step 3: Write the retro'), /`Approve` \/ `Request changes` \/ `Stop`/);
  const waive = prose(source, 'Step T2: Confirm and waive');
  assert.match(waive, /Both or neither — the database refuses one without the other/);
  assert.match(waive, /never a marker in prose/);

  // The confirmation is in the step that writes, not only in the step that classifies. T1 already
  // says never to waive an epic holding observations; a T2 told to waive everything the scan
  // classified as clean obeys that and still waives without asking.
  assert.match(waive, /support waiving some of\s*them rather than all/);
  assert.match(waive, /confirm before waiving/);
  assert.match(prose(source, 'Step T1: Classify'), /Report these; never waive\s*them/);
});

// --- Criterion 4 (must NOT): no recovery by reading what was written --------------------------------

test('the skill recovers nothing by reading a generated file', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  assert.deepEqual(recoveries(source, PARSES), []);

  const known = new Set(tools.map((tool) => tool.name));
  const named = toolNames(reachable(source));

  for (const required of ['list_epic', 'read_epic', 'list_quick', 'read_quick', 'list_story',
    'list_observation', 'list_observation_category', 'list_taxonomy', 'create_retro',
    'update_observation', 'create_library', 'create_library_scope', 'create_document_section',
    'list_library', 'list_library_scope', 'list_retro', 'update_epic']) {
    assert.ok(named.includes(required), `the skill never names ${required}`);
    assert.ok(known.has(required), `${required} is not a tool`);
  }

  // The control: a file that reaches for the old marker-and-glob shape is caught by the same reading.
  const regressed = `${source}\n\nGlob docs/retros/[0-9]*-retro-*.md, skip any observation carrying `
    + 'a **Retired marker, and write **Retro waived**: to the epic, ordering by modification time.';

  assert.ok(recoveries(regressed, PARSES).length >= 4,
    'the sweep passed a file that globs a directory, scans for two prose markers and orders by mtime');
});
