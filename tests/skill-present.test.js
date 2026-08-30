/**
 * Epic 47-08 Story 3 — the converted `present`, and the three claims made about it.
 *
 * - "A present run resolves its sources through the artifact join rather than by reading an index
 *   file, and a source that does not exist is a foreign-key failure rather than a broken link"
 *   [feature]
 * - "The facilitation survives: the run still gates audience, then format, then draft in turn, and
 *   a regeneration over an existing artifact still offers update-in-place rather than silently
 *   minting a second one" [feature]
 * - "must NOT — the skill recovers an entity by reading a generated markdown file rather than by
 *   calling a read tool" [unit]
 *
 * **The regeneration check is an intersection, and the fixture is built so that a union passes
 * nothing.** `partial` is published from one of the two sources and `other` from neither; a run
 * that asked "which artifacts mention any of my sources" finds `partial` and offers to overwrite a
 * communication that was never this one. Both mistakes — minting a second artifact, and updating
 * somebody else's — are invisible without a source that two artifacts do not share, so the fixture
 * carries one and both tests assert against it (retro 37, and the disposition on this epic).
 *
 * The two halves of criterion 2's regeneration clause are one function driven twice: the same run
 * against a project where the artifact does not yet exist has to create, and against one where it
 * does has to update. Asserting only the second would pass a skill that always updates the first
 * artifact it finds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import {
  skillSource, toolNames, reachable, prose, section, recorder, recoveries, bindings,
  seedStartup, driveStartup,
} from './support/skills.js';

const SKILL = 'present';
const source = skillSource(SKILL);

/** The recoveries this file in particular would reach for, on top of the shared sweep. */
const PARSES = [
  // The output path and its number, both of which the artifact row replaces.
  { pattern: /communications\//, why: 'an output directory, which is the projection\'s to choose' },
  { pattern: /\{format\}/, why: 'a filename template built from a gate answer' },
  // The two prose fields CPM regenerated from, which are now the join and the row.
  {
    pattern: /\*\*Source artifacts\*\*|\*\*Artifact\*\*:|\*\*Artifacts\*\*:/,
    why: 'a source list or a URL written into the text it describes',
  },
  // A format template read off disk. dpm renders from projection templates and nothing else.
  { pattern: /templates\/present|format-specific template/i, why: 'a template file read at run time' },
  // The index CPM kept beside the backlinks — the pair this join exists to collapse.
  { pattern: /index file|index\.md/, why: 'an index read as a source of truth' },
];

/**
 * A project with three publishable documents and two artifacts that do not agree about them.
 *
 * - `spec` and `epic` are the sources this run selects.
 * - `shared` is published from both, and exists only when `published` — it is what a regeneration
 *   must find, and its absence is what a first run must not mistake for `partial`.
 * - `partial` is published from `spec` alone. A run taking the union of its sources' artifacts
 *   finds it, and cannot tell it apart from the one it is looking for.
 * - `other` is published from `retro`, which is not a source here at all.
 */
function workspace(tools, { published = false } = {}) {
  const seed = handlers(tools);

  const spec = seed.create_spec({ slug: 'persistence', title: 'Persistence' });
  const epic = seed.create_epic({ parent_id: spec.id, slug: 'substrate', title: 'Substrate' });
  const retro = seed.create_retro({ parent_id: epic.id, slug: 'substrate', title: 'Substrate' });

  for (const [document, heading, body] of [
    [spec, 'Problem', 'Every relationship is spelled into prose and parsed back.'],
    [epic, 'Story 1', 'The tables, and the constraints that make them worth having.'],
    [retro, 'What held', 'The conversion was mechanical once the schema was right.'],
  ]) {
    seed.create_document_section({ document_id: document.id, heading, body, position: 0 });
  }

  const partial = seed.create_artifact({
    url: 'https://example.test/partial', title: 'Persistence, for the board',
    description: 'An earlier memo, from the spec alone.', published_at: '2026-07-01T00:00:00.000Z',
  });
  seed.create_artifact_document({ artifact_id: partial.id, document_id: spec.id });

  const other = seed.create_artifact({
    url: 'https://example.test/other', title: 'What we learned',
    description: 'A write-up of the retro.', published_at: '2026-07-02T00:00:00.000Z',
  });
  seed.create_artifact_document({ artifact_id: other.id, document_id: retro.id });

  const shared = published
    ? seed.create_artifact({
      url: 'https://example.test/shared', title: 'Persistence, so far',
      description: 'The memo this run regenerates.', published_at: '2026-07-03T00:00:00.000Z',
    })
    : null;

  if (shared) {
    for (const document of [spec, epic]) {
      seed.create_artifact_document({ artifact_id: shared.id, document_id: document.id });
    }
  }

  const startup = seedStartup(seed, { scope: 'present', skill: 'dpm:present', phase: 'Step 1' });

  return { spec, epic, retro, partial, other, shared, ...startup };
}

/** More than the corpus holds, which is what the file asks for rather than a page of it. */
const BOUND = 200;

/**
 * The run the SKILL.md prescribes: select, read, gate, then record against the join.
 *
 * The gates themselves are the user's, so what a run can be driven through is the read either side
 * of each — which is why criterion 2's assertions are on the file and criterion 1's are on the rows.
 */
function run(call, fixture, { attempt = 1 } = {}) {
  const startup = driveStartup(call, fixture, {
    scope: 'present', skill: 'dpm:present', roster: false, attempt,
  });

  // Step 1. One call per kind the selection could draw on, bounded above the corpus.
  const offered = [
    ...call.list_spec({ limit: BOUND }).items,
    ...call.list_epic({ limit: BOUND }).items,
    ...call.list_problem_brief({ limit: BOUND }).items,
    ...call.list_product_brief({ limit: BOUND }).items,
    ...call.list_adr({ limit: BOUND }).items,
    ...call.list_retro({ limit: BOUND }).items,
    ...call.list_review({ limit: BOUND }).items,
    ...call.list_quick({ limit: BOUND }).items,
    ...call.list_audit({ limit: BOUND }).items,
  ];

  // The user's selection, which the test stands in for.
  const sources = [fixture.spec.id, fixture.epic.id];

  const sections = sources.flatMap((document_id) =>
    call.list_document_section({ document_id, limit: BOUND }).items
      .map((heading) => call.read_document_section({ id: heading.id, include_body: true })));

  // Step 5. Which artifacts every source already has in common — not which any of them has.
  const common = sources
    .map((document_id) => new Set(call.list_artifact_document({ document_id, limit: BOUND }).items
      .map((row) => row.artifact_id)))
    .reduce((left, right) => new Set([...left].filter((id) => right.has(id))));

  const existing = [...common].map((id) => call.read_artifact({ id, include_body: true }));

  const artifact = existing.length > 0
    ? call.update_artifact({
      id: existing[0].id,
      title: 'Persistence, so far',
      description: 'Regenerated over the same sources.',
      published_at: '2026-08-10T00:00:00.000Z',
    })
    : call.create_artifact({
      url: 'https://example.test/minted',
      title: 'Persistence, so far',
      description: 'Derived from the spec and its epic.',
      published_at: '2026-08-10T00:00:00.000Z',
    });

  if (existing.length === 0) {
    for (const document_id of sources) {
      call.create_artifact_document({ artifact_id: artifact.id, document_id });
    }
  }

  return { startup, offered, sources, sections, existing, artifact };
}

// --- Criterion 1: the sources are the join, and a missing one fails at write time ----------------

test('a present run resolves its sources through the artifact join', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used, passed } = recorder(tools);

  const fixture = workspace(tools);
  const result = run(call, fixture);

  // The corpus was offered from queries, not from a walk — every kind the file names came back.
  assert.ok(result.offered.some((row) => row.id === fixture.spec.id));
  assert.ok(result.offered.some((row) => row.id === fixture.epic.id));
  assert.ok(result.offered.some((row) => row.id === fixture.retro.id));

  // The draft's material is section bodies, which only `include_body` returns.
  assert.equal(result.sections.length, 2);
  for (const entry of result.sections) {
    assert.ok(entry.body && entry.body.length > 0, 'a section came back as a heading with no text');
  }

  // Nothing existed over both sources, so the run minted one rather than reusing `partial`.
  assert.deepEqual(result.existing, []);
  assert.notEqual(result.artifact.id, fixture.partial.id);
  assert.notEqual(result.artifact.id, fixture.other.id);

  // **`partial` is why this assertion is worth making.** It is published from one of the two
  // sources, so a run that took the union rather than the intersection had an artifact to find and
  // would have updated a memo that was never this communication.
  const raw = handlers(tools);
  const union = raw.list_artifact_document({ document_id: fixture.spec.id, limit: BOUND }).items;
  assert.ok(union.some((row) => row.artifact_id === fixture.partial.id),
    'the decoy is not reachable from a source, so the intersection proves nothing');
  assert.equal(raw.read_artifact({ id: fixture.partial.id }).title, 'Persistence, for the board');

  // The join is written, one row per source, and it is what makes the run findable next time.
  const links = raw.list_artifact_document({ artifact_id: result.artifact.id, limit: BOUND }).items;
  assert.deepEqual(links.map((row) => row.document_id).sort(), [...result.sources].sort());

  // Read from the other end, which is the direction the substrate gained for this story.
  for (const document_id of result.sources) {
    const reachableFrom = raw.list_artifact_document({ document_id, limit: BOUND }).items;
    assert.ok(reachableFrom.some((row) => row.artifact_id === result.artifact.id),
      'the artifact is not reachable from its own source');
  }

  // **A source that does not exist fails here rather than surviving as a dead link.** This is the
  // whole of FR2 for this skill: the row is refused at write time, so there is no state in which
  // the artifact claims a source the project does not have.
  assert.throws(
    () => raw.create_artifact_document({ artifact_id: result.artifact.id, document_id: 'no-such-id' }),
    /FOREIGN KEY|foreign key/i,
  );

  // And the file says the join is always written, because a run that skipped it still succeeds.
  assert.match(prose(source, '5. Record it'), /\*\*Write the join, always\.\*\*/);
  assert.match(prose(source, '5. Record it'),
    /a source that has been deleted fails here rather than surviving as a link a reader follows into nothing/);

  // The bound is named in the step that runs the corpus queries, not merely somewhere in the file.
  assert.match(prose(source, '1. Select the sources'),
    /\*\*Pass a `limit` above what the project plausibly holds\*\*/);
  for (const name of ['list_spec', 'list_epic', 'list_retro', 'list_review', 'list_quick',
    'list_audit', 'list_adr', 'list_problem_brief', 'list_product_brief',
    'list_document_section', 'list_artifact_document']) {
    assert.ok(passed.get(name)?.has('limit'), `${name} was called without a limit`);
  }

  assert.deepEqual(bindings(source, tools, { used, passed }), []);
});

// --- Criterion 2: the facilitation survives ------------------------------------------------------

test('the gates run in turn, and a regeneration updates in place rather than minting a second', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);

  const fixture = workspace(tools, { published: true });
  const before = handlers(tools).list_artifact({ limit: BOUND }).items.length;

  const result = run(call, fixture);

  // The regeneration found exactly the artifact published from *both* sources.
  assert.deepEqual(result.existing.map((row) => row.id), [fixture.shared.id]);
  assert.equal(result.artifact.id, fixture.shared.id);

  // In place: the URL every already-shared link points at is unchanged, and no row was added.
  assert.equal(result.artifact.url, fixture.shared.url);
  const raw = handlers(tools);
  assert.equal(raw.list_artifact({ limit: BOUND }).items.length, before,
    'the run minted a second artifact over sources that already had one');
  // `include_body` because `description` is the artifact's body column — without it the comparison
  // is `undefined` against `undefined` for every artifact in the project, which is a pass by
  // withholding rather than by agreement.
  assert.equal(raw.read_artifact({ id: fixture.shared.id, include_body: true }).description,
    'Regenerated over the same sources.');

  // And the neighbour it could have taken instead is untouched.
  assert.equal(raw.read_artifact({ id: fixture.partial.id, include_body: true }).description,
    'An earlier memo, from the spec alone.');

  // **Both halves are the same run.** Criterion 1 drove it against a project with no such artifact
  // and it created; here it updated. A skill that always reused the first artifact it found would
  // pass this test alone.
  assert.notEqual(fixture.shared.id, fixture.partial.id);

  // The gates are in turn, and the order is the file's rather than an accident of drafting.
  assert.ok(source.indexOf('2. Gate the audience') < source.indexOf('3. Gate the format'));
  assert.ok(source.indexOf('3. Gate the format') < source.indexOf('4. Derive the draft'));
  assert.match(prose(source, '3. Gate the format'), /Then, and not before/);
  assert.match(prose(source, '3. Gate the format'),
    /offering both at once asks the user to hold two decisions that only make sense in order/);
  assert.match(prose(source, '3. Gate the format'), /Say which formats fit the audience just chosen/);

  // Each gate offers a real choice rather than a confirmation of one already taken.
  const audience = section(source, '2. Gate the audience');
  for (const option of ['Executive', 'Client', 'Technical stakeholder', 'Team onboarding', 'Custom']) {
    assert.ok(audience.includes(`**${option}**`), `the audience gate does not offer ${option}`);
  }
  const format = section(source, '3. Gate the format');
  for (const option of ['Summary memo', 'Status update', 'Presentation outline', 'Changelog',
    'Onboarding guide']) {
    assert.ok(format.includes(`**${option}**`), `the format gate does not offer ${option}`);
  }

  // The draft is a gate of its own, and it goes in the body rather than into the question.
  const draft = prose(source, '4. Derive the draft');
  assert.match(draft, /Render the full draft in the message body, then gate it/);
  assert.match(draft, /approve, request changes, or stop/);
  assert.match(draft, /a gap in the sources is reported as a gap rather than filled in/);
  assert.match(draft, /A draft that reproduces a source's own headings in its own order has transformed nothing/);

  // **Publishing is separate from approving the draft**, which is the gate a conversion loses by
  // treating the approved draft as consent to put it on a URL.
  const record = prose(source, '5. Record it');
  assert.match(record, /separately confirmed, and never assumed from the draft having been approved/);
  assert.match(record, /\*\*offer update-in-place\*\*/);
  assert.match(record, /the person holding that link has no way to find out/);

  // **The intersection is stated, because no run can hold it.** A fixture where every artifact
  // shares every source returns the same rows either way; only the instruction distinguishes them.
  assert.match(record, /\*\*The artifacts common to every source, not the ones any source has\.\*\*/);
  assert.match(record, /offering to overwrite it is the same mistake as minting a duplicate/);

  // A declined publication says which of the two things happened — a quiet end reads as either one.
  assert.match(record, /Say that it was stored and not published/);
  assert.match(record, /a run that ends quietly reads as one that did neither/);
  assert.match(record, /keep it local, do not offer publishing/);

  // The degradation table answers every absence with a behaviour rather than a failure.
  const table = prose(source, 'Degradation');
  for (const missing of ['The corpus is empty', 'A chosen source has no sections',
    'The Artifact tool is absent', 'An existing artifact\'s URL no longer resolves',
    'A source was deleted after selection']) {
    assert.ok(table.includes(missing), `the table does not answer: ${missing}`);
  }

  // A published communication writes no document row, and the reason is the one the whole design
  // rests on. Story 9 gave the *unpublished* case a row of its own; this half is unchanged by that,
  // because what makes a second copy stale is the page that already holds the first one.
  assert.match(prose(source, 'Output'), /an `artifact` row with\s+one `artifact_document` per source and \*\*no document row\*\*/);
  assert.match(prose(source, 'Output'),
    /a second copy of its content in `document_section` goes stale/);
});

// --- Criterion 3 (must NOT): no recovery by reading what was written -----------------------------

test('must NOT — the skill recovers an entity by reading a generated markdown file', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  assert.deepEqual(recoveries(source, PARSES), []);

  const known = new Set(tools.map((tool) => tool.name));
  const named = toolNames(reachable(source));

  for (const required of ['list_session', 'adopt_session', 'create_session', 'update_session',
    'list_library', 'list_library_scope', 'list_document_section', 'read_document_section',
    'list_retro', 'list_observation', 'list_observation_category', 'list_taxonomy',
    'list_spec', 'list_epic', 'list_problem_brief', 'list_product_brief', 'list_adr',
    'list_review', 'list_quick', 'list_audit',
    'list_artifact_document', 'read_artifact', 'create_artifact', 'update_artifact',
    'create_artifact_document']) {
    assert.ok(named.includes(required), `the skill never names ${required}`);
    assert.ok(known.has(required), `${required} is not a tool`);
  }

  // The control: a file that reaches for the old path-and-field shape is caught by the same reading.
  const regressed = `${source}\n\nSave to docs/communications/{nn}-{format}-{slug}.md, read the `
    + '**Source artifacts** field back to regenerate, republish to the URL in **Artifact**:, and '
    + 'apply the override at docs/templates/present/{format}.md over the index file.';

  assert.ok(recoveries(regressed, PARSES).length >= 5,
    'the sweep passed a file that constructs a path, parses two fields and reads a template');
});
