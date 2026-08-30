/**
 * Epic 47-09 Story 9 — the retrofit, and the eight claims made about it.
 *
 * - "A `present` run told to keep its output local writes a `communication` document with its
 *   sections, and writes no `artifact` row" [feature]
 * - "must NOT — an unpublished communication is recorded as an `artifact`, with a placeholder URL
 *   or any other stand-in for one" [unit]
 * - "A `library` run records an imported document's provenance in `library_document.source`, and a
 *   locally written one leaves it unset" [integration]
 * - "must NOT — a library document's provenance is written into a section body rather than into its
 *   column" [unit]
 * - "A `review`, a `consult` and a `party` run each record their participants as `document_agent`
 *   rows" [integration]
 * - "must NOT — a run with participants to record names them only in the document's prose" [unit]
 * - "`status`, `inspect` and `do` report a `superseded` or `withdrawn` item as retired rather than
 *   as pending or done, and `do` does not select work whose blocker is retired" [feature]
 * - "The shared **Perspectives** procedure loads the roster with `include_body`, so a voice rendered
 *   from it is rendered from the row's traits rather than from nothing" [unit]
 *
 * **One file for eight skills and one shared procedure, because the story is one substrate.** Story
 * 8 added the columns and this is the half that writes to them; splitting the tests by skill would
 * put the `communication` claim in one file and the `artifact` claim it is the other half of in
 * another, and neither would carry the pairing that makes either one mean something.
 *
 * **Two of the four must-NOTs are driven rather than swept, and that is deliberate.** A pattern
 * sweep asks whether a file *mentions* the workaround, and each of these files forbids the
 * workaround by naming it — so a sweep reports the prohibition as the offence. What the criteria
 * actually claim is about rows: no artifact row exists for an unpublished communication, and no
 * section body holds what the column holds. Both are checkable against the rows a run wrote, and
 * both carry a control that is wrong on purpose.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import {
  skillSource, conventions, prose, section, instructions, recorder, bindings,
  seedStartup, driveStartup,
} from './support/skills.js';

/** Above what any of these fixtures holds, which is what each file asks a run to pass. */
const BOUND = 200;

// --- Criterion 1: a local communication is a document ---------------------------------------------

/** The draft, as the sections it becomes. Three, so "wrote one section" is not indistinguishable. */
const DRAFT = [
  ['Where the project stands', 'The substrate is in, and the skills write through it.'],
  ['What it cost', 'Nine epics, and one schema that did not have to be guessed at twice.'],
  ['What happens next', 'The corpus closes, and dpm holds its own planning rows.'],
];

/** Two sources with sections, and the startup any dpm skill finds. No artifacts: nothing published. */
function presentWorkspace(tools) {
  const seed = handlers(tools);

  const spec = seed.create_spec({ slug: 'persistence', title: 'Persistence' });
  const epic = seed.create_epic({ parent_id: spec.id, slug: 'substrate', title: 'Substrate' });

  for (const [document, heading, body] of [
    [spec, 'Problem', 'Every relationship is spelled into prose and parsed back.'],
    [epic, 'Story 1', 'The tables, and the constraints that make them worth having.'],
  ]) {
    seed.create_document_section({ document_id: document.id, heading, body, position: 0 });
  }

  return { spec, epic, ...seedStartup(seed, { scope: 'present', skill: 'dpm:present', phase: 'Step 1' }) };
}

/** The run its file prescribes when publishing is declined: select, read, check, then store. */
function presentLocal(call, fixture) {
  const startup = driveStartup(call, fixture, {
    scope: 'present', skill: 'dpm:present', roster: false,
  });

  const sources = [fixture.spec.id, fixture.epic.id];

  const sections = sources.flatMap((document_id) =>
    call.list_document_section({ document_id, limit: BOUND }).items
      .map((heading) => call.read_document_section({ id: heading.id, include_body: true })));

  // Step 5 still asks whether one already exists — the local branch is the answer to the *gate*,
  // not a route around the check.
  const common = sources
    .map((document_id) => new Set(call.list_artifact_document({ document_id, limit: BOUND }).items
      .map((row) => row.artifact_id)))
    .reduce((left, right) => new Set([...left].filter((id) => right.has(id))));

  const communication = call.create_communication({
    slug: 'where-we-stand', title: 'Where we stand',
  });

  const written = DRAFT.map(([heading, body], position) => call.create_document_section({
    document_id: communication.id, heading, body, position,
  }));

  return { startup, sources, sections, common, communication, written };
}

test('a declined publication is stored as a communication and mints no artifact', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used, passed } = recorder(tools);
  const source = skillSource('present');

  const fixture = presentWorkspace(tools);
  const result = presentLocal(call, fixture);
  const raw = handlers(tools);

  // The gate was reached with nothing to update — this run declined, it did not fail to look.
  assert.deepEqual([...result.common], []);
  assert.equal(result.sections.length, 2);

  // A document of the kind Story 8 seeded for exactly this, carrying the draft.
  const stored = raw.read_communication({ id: result.communication.id });
  assert.equal(stored.kind, 'communication');
  assert.equal(stored.parent_id, null, 'an audience was recorded as a lineage');

  const held = raw.list_document_section({ document_id: stored.id, limit: BOUND }).items
    .map((heading) => raw.read_document_section({ id: heading.id, include_body: true }));

  assert.deepEqual(held.map((row) => row.heading), DRAFT.map(([heading]) => heading));
  for (const row of held) assert.ok(row.body.length > 0, 'a section was stored with no text');

  // **Nothing was published, and the corpus says so by holding no artifact at all.** This is the
  // pairing the criterion is about: the document exists *and* the artifact does not.
  assert.deepEqual(raw.list_artifact({ limit: BOUND }).items, []);

  // The file carries both halves in the step that runs them.
  const record = prose(source, '5. Record it');
  assert.match(record, /\*\*Where publishing is declined or refused, the draft is kept as a `communication`\.\*\*/);
  assert.match(record, /`mcp__plugin_dpm_dpm__create_communication` with the title the draft was gated under/);
  assert.match(prose(source, 'Output'), /\*\*The two are exclusive, and which one exists is the answer to whether this went out\.\*\*/);

  assert.deepEqual(bindings(source, tools, { used, passed }), []);
});

// --- Criterion 2 (must NOT): no artifact stands in for a publication that did not happen ----------

test('must NOT — an unpublished communication is recorded as an artifact', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);
  const source = skillSource('present');

  const fixture = presentWorkspace(tools);
  const result = presentLocal(call, fixture);
  const raw = handlers(tools);

  // No artifact, and nothing pointing at the communication from the join either — the two ways a
  // run could record a publication that did not happen.
  assert.deepEqual(raw.list_artifact({ limit: BOUND }).items, []);
  assert.deepEqual(
    raw.list_artifact_document({ document_id: result.communication.id, limit: BOUND }).items, [],
  );

  // **The only way to record one is to invent a URL, which is why the rule is about the URL.**
  // `artifact.url` is NOT NULL, so there is no honest artifact row for something unpublished: the
  // must-NOT is unreachable except by making a link up.
  assert.throws(() => raw.create_artifact({
    title: 'Where we stand',
    description: 'Kept local.',
    published_at: '2026-08-10T00:00:00.000Z',
  }), /url/i);

  // A placeholder satisfies the column, which is exactly why the file has to forbid it in words.
  const invented = raw.create_artifact({
    url: 'pending', title: 'Where we stand', description: 'Kept local.',
    published_at: '2026-08-10T00:00:00.000Z',
  });
  assert.equal(raw.list_artifact({ limit: BOUND }).items.length, 1,
    'the control did not reach the state the rule forbids');
  assert.equal(invented.url, 'pending');

  const record = prose(source, '5. Record it');
  assert.match(record, /\*\*Never write an `artifact` row for a communication that was not published\.\*\*/);
  assert.match(record, /recording one means inventing a URL/);
  assert.match(record, /The absence of an artifact is how the corpus says this was never published/);
});

// --- Criterion 3: provenance is a column, set when there is one -----------------------------------

/** Where the imported document came from — used as the value, and as what must not reach the prose. */
const ORIGIN = 'https://standards.example.test/php/style';

function libraryWorkspace(tools) {
  return seedStartup(handlers(tools), { scope: 'library', skill: 'dpm:library', phase: 'Intake 1' });
}

/** Intake, as step 3 orders it: the document, its scopes, then its sections. */
function intake(call, { slug, title, docType, origin }) {
  const document = call.create_library({
    slug, title, doc_type: docType, ...(origin ? { source: origin } : {}),
  });

  call.create_library_scope({ document_id: document.id, scope: 'do' });

  call.create_document_section({
    document_id: document.id, heading: 'Summary',
    body: 'PSR-12, enforced by Pint. No inline SQL outside migrations.', position: 0,
  });
  call.create_document_section({
    document_id: document.id, heading: 'Naming',
    body: 'Classes are nouns; methods are verbs.', position: 1,
  });

  return document;
}

test('an imported library document carries its provenance and a local one carries none', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used, passed } = recorder(tools);
  const source = skillSource('library');

  const fixture = libraryWorkspace(tools);
  driveStartup(call, fixture, { scope: 'library', skill: 'dpm:library', roster: false });

  const imported = intake(call, {
    slug: 'php-style', title: 'PHP style', docType: 'coding-standards', origin: ORIGIN,
  });
  const written = intake(call, {
    slug: 'our-domain', title: 'Our domain', docType: 'domain',
  });

  const raw = handlers(tools);

  // The column, both ways round. **The unset case is the half a one-sided test would miss**: a run
  // that stamped every intake with the path it read would pass an assertion on the imported one
  // alone, and the answer "written here" would never be recoverable again.
  assert.equal(raw.read_library({ id: imported.id }).source, ORIGIN);
  assert.equal(raw.read_library({ id: written.id }).source, null);

  // Both are ordinary library documents otherwise — the provenance is not what makes it findable.
  for (const document of [imported, written]) {
    assert.equal(raw.read_library({ id: document.id }).doc_type,
      document.id === imported.id ? 'coding-standards' : 'domain');
    assert.equal(raw.list_library_scope({ document_id: document.id, limit: BOUND }).items.length, 1);
  }

  // The file asks for it at the derivation and passes it at the write — one without the other is a
  // field confirmed and never stored, or stored and never confirmed.
  const derive = section(source, '2. Derive what the library needs');
  assert.ok(derive.includes('- **`source`**'), 'the derivation step does not name `source`');
  assert.match(prose(source, '2. Derive what the library needs'),
    /\*\*Left unset for a document written here\*\*, and that absence is the answer/);
  assert.match(instructions(source, '3. Write it'),
    /`mcp__plugin_dpm_dpm__create_library` with the `slug`, `title`, `doc_type` and, for an imported document,\s+`source`/);

  assert.deepEqual(bindings(source, tools, { used, passed }), []);
});

// --- Criterion 4 (must NOT): the provenance is not written into the prose -------------------------

/**
 * Where a document's own sections say where it came from — the workaround the column replaces.
 *
 * Returned as problems rather than asserted, so the same reading can be driven over a document that
 * is wrong on purpose. A check of this shape is worth nothing until it has been seen to fire.
 */
function provenanceInProse(raw, documentId, origin) {
  return raw.list_document_section({ document_id: documentId, limit: BOUND }).items
    .map((heading) => raw.read_document_section({ id: heading.id, include_body: true }))
    .flatMap((entry) => {
      const text = `${entry.heading}\n${entry.body ?? ''}`;
      if (text.includes(origin)) return [`section '${entry.heading}' quotes the origin`];
      if (/^\s*(\*\*)?Source(\*\*)?\s*:/im.test(text)) return [`section '${entry.heading}' opens with a source line`];
      if (/^provenance$/i.test(entry.heading)) return [`section '${entry.heading}' is a provenance heading`];

      return [];
    });
}

test('must NOT — a library document records its provenance in a section body', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);
  const source = skillSource('library');

  const fixture = libraryWorkspace(tools);
  driveStartup(call, fixture, { scope: 'library', skill: 'dpm:library', roster: false });

  const imported = intake(call, {
    slug: 'php-style', title: 'PHP style', docType: 'coding-standards', origin: ORIGIN,
  });

  const raw = handlers(tools);

  // The run put it in the column, so its sections say nothing about where it came from.
  assert.deepEqual(provenanceInProse(raw, imported.id, ORIGIN), []);
  assert.equal(raw.read_library({ id: imported.id }).source, ORIGIN);

  // **The control, three ways.** Each is a shape a run reaches for when the column is not to hand,
  // and a check that cannot see them is a check that passes on a document holding all three.
  const regressed = raw.create_library({ slug: 'copied', title: 'Copied', doc_type: 'domain' });
  for (const [position, heading, body] of [
    [0, 'Summary', `Adopted wholesale from ${ORIGIN}, unchanged.`],
    [1, 'Naming', '**Source**: a vendor guide, name withheld.'],
    [2, 'Provenance', 'Brought in from elsewhere.'],
  ]) {
    raw.create_document_section({ document_id: regressed.id, heading, body, position });
  }

  assert.equal(provenanceInProse(raw, regressed.id, ORIGIN).length, 3,
    'the control did not trip every shape the check claims to catch');

  assert.match(prose(source, '3. Write it'),
    /\*\*Provenance is the column and never a section\.\*\*/);
  assert.match(prose(source, '3. Write it'),
    /a second copy that disagrees with `source` the first time either is edited/);
});

// --- Criterion 5: participants are rows, on both kinds that have them ----------------------------

/** The panel, and the room — two agents each, from the seeded roster. */
const PANEL = ['pm', 'architect'];
const ROOM = ['dev', 'qa'];

test('a review, a consult and a party each record their participants as rows', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const seed = handlers(tools);

  const spec = seed.create_spec({ slug: 'persistence', title: 'Persistence' });
  const epic = seed.create_epic({ parent_id: spec.id, slug: 'substrate', title: 'Substrate' });

  // Every roster name used below is one the seeded table actually holds — the join's foreign key
  // would refuse an invented one, which is the point, but a fixture that relied on that would be
  // testing the constraint rather than the skills.
  const roster = new Set(seed.list_agent({ limit: BOUND }).items.map((row) => row.name));
  for (const name of [...PANEL, ...ROOM]) assert.ok(roster.has(name), `${name} is not a seeded agent`);

  const written = {};

  // `review` — the kind that already had the join, under a table that now serves two kinds.
  {
    const { call, used, passed } = recorder(tools);
    const source = skillSource('review');

    call.list_agent({});
    const review = call.create_review({
      parent_id: epic.id, slug: 'substrate', title: 'Substrate, reviewed',
    });
    for (const agent of PANEL) {
      call.create_document_agent({ document_id: review.id, document_kind: 'review', agent });
    }

    written.review = review;
    assert.match(instructions(source, 'Step 4: Write the review'),
      /`mcp__plugin_dpm_dpm__create_document_agent` per panel member, with `document_kind: 'review'`/);
    assert.deepEqual(bindings(source, tools, { used, passed }), []);
  }

  // `consult` and `party` — the two skills that convene personas and both write a `discussion`.
  for (const [skill, slug, agents] of [['consult', 'one-to-one', ROOM], ['party', 'the-room', PANEL]]) {
    const { call, used, passed } = recorder(tools);
    const source = skillSource(skill);

    const discussion = call.create_discussion({ slug, title: `A ${skill}` });
    call.create_document_section({
      document_id: discussion.id, heading: 'Key points', body: 'What the room settled.', position: 0,
    });
    for (const agent of agents) {
      call.create_document_agent({ document_id: discussion.id, document_kind: 'discussion', agent });
    }

    written[skill] = discussion;

    assert.match(instructions(source, 'Saving the discussion'),
      /`mcp__plugin_dpm_dpm__create_document_agent` per agent who (took part|spoke), with `document_kind` set to\s+`discussion`/);
    assert.deepEqual(bindings(source, tools, { used, passed }), []);
  }

  const raw = handlers(tools);

  // One join, two kinds, and each row still knows which — the widening kept the discriminator.
  assert.deepEqual(
    raw.list_document_agent({ document_id: written.review.id, limit: BOUND }).items
      .map((row) => `${row.document_kind}:${row.agent}`).sort(),
    PANEL.map((agent) => `review:${agent}`).sort(),
  );
  assert.deepEqual(
    raw.list_document_agent({ document_id: written.consult.id, limit: BOUND }).items
      .map((row) => `${row.document_kind}:${row.agent}`).sort(),
    ROOM.map((agent) => `discussion:${agent}`).sort(),
  );
  assert.deepEqual(
    raw.list_document_agent({ document_id: written.party.id, limit: BOUND }).items
      .map((row) => `${row.document_kind}:${row.agent}`).sort(),
    PANEL.map((agent) => `discussion:${agent}`).sort(),
  );

  // **One persona, two documents of different kinds — the question prose cannot answer at all.**
  // `list_document_agent` scopes by document and not by agent, so this is the read a run makes
  // across the documents it is looking at rather than a lookup from the agent's end.
  const appearances = [written.review, written.consult, written.party]
    .filter((document) => raw.list_document_agent({ document_id: document.id, limit: BOUND }).items
      .some((row) => row.agent === 'pm'))
    .map((document) => document.id);

  assert.deepEqual(appearances.sort(), [written.review.id, written.party.id].sort());
});

// --- Criterion 6 (must NOT): a name in a paragraph is not a record --------------------------------

test('must NOT — a run names its participants only in the document prose', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const raw = handlers(tools);

  // Two discussions that read identically to someone opening them, and differ in the only place
  // anything can query: one wrote the rows, the other put the names in a paragraph.
  const recorded = raw.create_discussion({ slug: 'recorded', title: 'Recorded' });
  const prosed = raw.create_discussion({ slug: 'prosed', title: 'In prose only' });

  for (const document of [recorded, prosed]) {
    raw.create_document_section({
      document_id: document.id, heading: 'Key points',
      body: 'Jordan and Priya disagreed about the cutover, and Priya carried it.', position: 0,
    });
  }

  for (const agent of ROOM) {
    raw.create_document_agent({ document_id: recorded.id, document_kind: 'discussion', agent });
  }

  assert.equal(raw.list_document_agent({ document_id: recorded.id, limit: BOUND }).items.length, 2);
  assert.deepEqual(raw.list_document_agent({ document_id: prosed.id, limit: BOUND }).items, [],
    'the control has rows, so prose and record are not distinguishable here');

  // The names are in both documents' text, so the prose is not what the two disagree about.
  for (const document of [recorded, prosed]) {
    const [entry] = raw.list_document_section({ document_id: document.id, limit: BOUND }).items
      .map((heading) => raw.read_document_section({ id: heading.id, include_body: true }));
    assert.match(entry.body, /Jordan and Priya/);
  }

  // Each of the three files says which of the two is the record.
  for (const skill of ['consult', 'party']) {
    const saving = prose(skillSource(skill), 'Saving the discussion');
    assert.match(saving,
      /\*\*Who was in the room is a row, and naming them in the prose is not the same fact\.\*\*/);
    assert.match(saving, /a persona mentioned in a paragraph is invisible to it/);
  }
  assert.match(prose(skillSource('review'), 'Step 2: Select the panel'),
    /the row references the `agent` by name rather than copying the persona into the finding/);
});

// --- Criterion 7: retired is a third answer, in the query and in the report -----------------------

/**
 * An epic whose four stories are one of each thing a story can be, plus a retired epic beside it.
 *
 * `held` is the row the criterion's second half is about: its blocker is `superseded`, so under a
 * clause reading "not pending" as satisfaction it would be offered as ready — abandoned work
 * clearing the way for what was waiting on it.
 */
function board(tools) {
  const seed = handlers(tools);

  const spec = seed.create_spec({ slug: 'persistence', title: 'Persistence' });
  const epic = seed.create_epic({ parent_id: spec.id, slug: 'substrate', title: 'Substrate' });
  const retired = seed.create_epic({
    parent_id: spec.id, slug: 'abandoned', title: 'Abandoned', status: 'withdrawn',
  });

  const story = (number, title, status) => seed.create_story({
    epic_id: epic.id, number, title, position: number - 1, ...(status ? { status } : {}),
  });

  const done = story(1, 'Done', 'complete');
  const replaced = story(2, 'Replaced', 'superseded');
  const dropped = story(3, 'Dropped', 'withdrawn');
  const held = story(4, 'Held');
  const next = story(5, 'Next');

  seed.create_dependency({
    source_story_id: replaced.id, target_story_id: held.id, kind: 'blocks',
  });

  return { spec, epic, retired, done, replaced, dropped, held, next };
}

test('retired work is neither selected nor reported as pending or done', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used, passed } = recorder(tools);
  const source = skillSource('do');

  const fixture = board(tools);

  // Epic selection, as `do` opens: a retired epic is not offered.
  const readyEpics = call.list_epic({ ready: true, limit: BOUND }).items.map((row) => row.id);
  assert.deepEqual(readyEpics, [fixture.epic.id]);

  // Story selection. **Two exclusions, and they come from opposite readings of the same column.**
  // `dropped` and `replaced` are excluded as rows — terminal, so not workable. `held` is excluded
  // by its blocker, which is `superseded` and therefore has not delivered.
  const ready = call.list_story({ epic_id: fixture.epic.id, ready: true, limit: BOUND }).items;
  assert.deepEqual(ready.map((row) => row.title), ['Next']);

  // …and the answer to *why not*, which is the edge rather than a status on the row.
  const blockers = call.list_dependency({ target_story_id: fixture.held.id, limit: BOUND }).items;
  assert.deepEqual(blockers.map((row) => row.source_story_id), [fixture.replaced.id]);

  // The report: three groups, and every story lands in exactly one of them.
  const all = call.list_story({ epic_id: fixture.epic.id, limit: BOUND }).items;
  const grouped = (status) => all.filter((row) => row.status === status).map((row) => row.title);
  assert.deepEqual(grouped('complete'), ['Done']);
  assert.deepEqual([...grouped('superseded'), ...grouped('withdrawn')].sort(), ['Dropped', 'Replaced']);
  assert.deepEqual(grouped('pending'), ['Held', 'Next']);

  // **The control, which is what makes the blocker half a claim rather than a coincidence.**
  // Complete the same blocker and `held` becomes ready — so the exclusion above was its status and
  // not the edge merely existing.
  call.update_story({ id: fixture.replaced.id, status: 'complete' });
  const after = call.list_story({ epic_id: fixture.epic.id, ready: true, limit: BOUND }).items;
  assert.deepEqual(after.map((row) => row.title), ['Held', 'Next']);

  // Each of the three reporting skills says retired out loud rather than folding it into a column
  // it does not belong in.
  assert.match(prose(source, 'Input'),
    /\*\*three\s+answers, and saying the wrong one is how a project loses track of what it decided to stop\*\*/);
  assert.match(prose(source, 'Story selection'),
    /a `superseded` or `withdrawn` one is never offered/);
  assert.match(prose(source, 'Story selection'),
    /a story retired halfway goes on gating what\s+was waiting on it/);

  const status = skillSource('status');
  assert.match(prose(status, 'Phase 3: Report'),
    /Report them as \*\*retired\*\*, on a\s+line of their own/);
  assert.match(prose(status, 'Phase 3: Report'),
    /Folded into "complete" they overstate what was built; folded into "pending" they\s+are work somebody will pick up/);
  assert.match(prose(status, 'Phase 1'),
    /\*\*Retired stories leave the count rather than joining either side of it\.\*\*/);

  assert.match(prose(skillSource('inspect'), '3.'),
    /\*\*A retired item is reported as retired, in both directions\.\*\*/);

  assert.deepEqual(bindings(source, tools, { used, passed }), []);
});

// --- Criterion 8: the roster arrives with its traits ---------------------------------------------

test('the shared Perspectives procedure loads the roster with its body columns', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const raw = handlers(tools);

  // The substrate half: without the argument the traits are simply absent, and a voice woven from
  // what came back is woven from a name and a role.
  const [bare] = raw.list_agent({ limit: BOUND }).items;
  const [full] = raw.list_agent({ include_body: true, limit: BOUND }).items;

  assert.equal(bare.name, full.name);
  assert.equal(bare.personality, undefined);
  assert.equal(bare.communication_style, undefined);
  assert.ok(full.personality.length > 0);
  assert.ok(full.communication_style.length > 0);

  // The procedure asks for it in the numbered step that makes the call, not in a note below it —
  // `instructions` is not reachable here, because a shared section's steps sit under no heading of
  // their own, so the same filter is applied to the fragment.
  const perspectives = section(conventions(), 'Perspectives');
  const steps = perspectives.split('\n').filter((row) => /^\d+\. |^ {3}/.test(row)).join(' ');

  assert.match(steps, /`mcp__plugin_dpm_dpm__list_agent`, passing `include_body`/);
  assert.match(steps, /\*\*the last two are body\s+columns\*\*/);
  assert.match(steps, /the voices below\s+are woven from nothing/);

  // The four skills that weave perspectives reach the procedure — matched on collapsed text, since
  // the citation sits across a wrap in two of them.
  for (const skill of ['discover', 'spec', 'architect', 'brief']) {
    assert.match(skillSource(skill).replace(/\s+/g, ' '),
      /follow the shared \*\*Perspectives\*\* procedure/i, `${skill} does not reach the procedure`);
  }

  // **And each loads the roster itself at startup, which is where the load actually happens.** The
  // procedure's step is the second statement of it: a skill whose own `list_agent` withheld the
  // traits would reach Perspectives with a roster already flattened, and the shared fix would
  // arrive too late to matter. `review` weaves no perspectives and is here for the same reason —
  // its panel renders a lens per persona from the same two columns.
  for (const skill of ['discover', 'spec', 'architect', 'brief', 'review']) {
    assert.match(prose(skillSource(skill), 'Roster'),
      /`mcp__plugin_dpm_dpm__list_agent` with `include_body`/, `${skill} loads the roster without its traits`);
  }
});
