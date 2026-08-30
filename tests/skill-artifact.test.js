/**
 * Epic 47-08 Story 5 — the converted `artifact`, and the four claims made about it.
 *
 * - "An artifact run writes one `artifact_document` row per link; the index file and the
 *   in-document backlinks are both projections of it, so the two cannot disagree" [integration]
 * - "Publishing updates the artifact row's URL in place, and a republish to the same file path
 *   resolves to the same row" [feature]
 * - "The facilitation survives: the run still refuses to invent any of an entry's facts, and a
 *   proposed name is still confirmed rather than assigned" [feature]
 * - "must NOT — the skill recovers an entity by reading a generated markdown file rather than by
 *   calling a read tool" [unit]
 *
 * **This is the story the spec opens with**, so criterion 1 is asserted as the property rather than
 * as two coincidences. The register and the per-document backlink are rendered from one row set, and
 * the test drives both renders from the same database and compares them — a pair that agreed because
 * the fixture was small would be caught by the *unassociated* document, which must appear in
 * neither, and by the source that belongs to two artifacts, which must appear in both.
 *
 * **Both halves of criterion 2 are one function driven twice**, as in Story 3: a first registration
 * against a project that has none must create, and a re-registration must update. Asserting only the
 * second would pass a skill that always reuses the first artifact it finds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import { renderDocument, project } from '../src/projection/index.ts';
import { REGISTER_PATH, renderArtifactIndex } from '../src/projection/templates/artifacts.ts';
import { identifiers } from '../src/projection/naming.ts';
import {
  skillSource, toolNames, reachable, prose, section, recorder, recoveries, bindings,
  seedStartup, driveStartup,
} from './support/skills.js';

const SKILL = 'artifact';
const source = skillSource(SKILL);

/** The recoveries this file in particular would reach for, on top of the shared sweep. */
const PARSES = [
  // The register read as a file — Steps 1, 3 and 5 of CPM's flow, all three of which go.
  {
    pattern: /index\.md|artifacts\/|the register file/i,
    why: 'the register read as a file, when it is a render',
  },
  // The backlink field CPM edits into each source document. The join row is the backlink.
  { pattern: /\*\*Artifacts\*\*:|backlink field/, why: 'a backlink written into a document' },
  // The strikethrough, which was an editing convention and is now a column.
  { pattern: /~~/, why: 'a strikethrough applied by editing rather than rendered from a column' },
  // The table shape, which belongs to the projection template and not to the skill.
  { pattern: /\| Artifact \||table header/i, why: 'the register\'s own table shape' },
];

/** Above what any of these fixtures holds. */
const BOUND = 200;

/**
 * Three documents, two of which an artifact is published from, and a decoy artifact over one.
 *
 * - `spec` and `epic` are this run's sources.
 * - `retro` is associated with nothing, and is what a run that wrote a backlink everywhere trips on.
 * - `partial` is published from `spec` alone — the union-versus-intersection decoy, as in `present`.
 * - `shared` is published from both, and exists only when `published`.
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
    description: 'An earlier page, from the spec alone.', published_at: '2026-07-01T00:00:00.000Z',
  });
  seed.create_artifact_document({ artifact_id: partial.id, document_id: spec.id });

  const shared = published
    ? seed.create_artifact({
      url: 'https://example.test/shared', title: 'Schema map',
      description: 'The page this run re-registers.', published_at: '2026-07-03T00:00:00.000Z',
    })
    : null;

  if (shared) {
    for (const document of [spec, epic]) {
      seed.create_artifact_document({ artifact_id: shared.id, document_id: document.id });
    }
  }

  const startup = seedStartup(seed, { scope: 'artifact', skill: 'dpm:artifact', phase: 'register' });

  return { spec, epic, retro, partial, shared, ...startup };
}

/**
 * The registration the SKILL.md prescribes: offer the corpus, resolve, then create or update.
 *
 * `session: false` and `retro: false` are claims about the file and are checked against it below —
 * this skill opens no session, having no step to resume, and consumes no retro, a register entry
 * being a record rather than a decision.
 */
function run(call, fixture, { url = 'https://example.test/minted' } = {}) {
  const startup = driveStartup(call, fixture, {
    scope: 'artifact', skill: 'dpm:artifact', roster: false, session: false, retro: false,
  });

  const offered = [
    ...call.list_spec({ limit: BOUND }).items,
    ...call.list_epic({ limit: BOUND }).items,
    ...call.list_problem_brief({ limit: BOUND }).items,
    ...call.list_product_brief({ limit: BOUND }).items,
    ...call.list_adr({ limit: BOUND }).items,
    ...call.list_review({ limit: BOUND }).items,
    ...call.list_retro({ limit: BOUND }).items,
    ...call.list_quick({ limit: BOUND }).items,
    ...call.list_audit({ limit: BOUND }).items,
  ];

  const sources = [fixture.spec.id, fixture.epic.id];

  // Resolve, both ways round. By URL first, since it is unique and the cheaper question.
  const byUrl = call.list_artifact({ limit: BOUND }).items.filter((row) => row.url === url);

  const common = sources
    .map((document_id) => new Set(call.list_artifact_document({ document_id, limit: BOUND }).items
      .map((row) => row.artifact_id)))
    .reduce((left, right) => new Set([...left].filter((id) => right.has(id))));

  const existing = [...new Set([...byUrl.map((row) => row.id), ...common])]
    .map((id) => call.read_artifact({ id, include_body: true }));

  const artifact = existing.length > 0
    ? call.update_artifact({
      id: existing[0].id,
      url,
      title: 'Schema map',
      description: 'Re-registered over the same sources.',
      published_at: '2026-08-10T00:00:00.000Z',
    })
    : call.create_artifact({
      url,
      title: 'Schema map',
      description: 'Published from the spec and its epic.',
      published_at: '2026-08-10T00:00:00.000Z',
    });

  if (existing.length === 0) {
    for (const document_id of sources) {
      call.create_artifact_document({ artifact_id: artifact.id, document_id });
    }
  }

  return { startup, offered, sources, existing, artifact };
}

// --- Criterion 1: one row set, two renders, no way for them to disagree --------------------------

test('an artifact run writes one `artifact_document` row per link, and both renders read it', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call, used, passed } = recorder(tools);

  const fixture = workspace(tools);
  const result = run(call, fixture);

  const raw = handlers(tools);

  // One row per link, and no more.
  const links = raw.list_artifact_document({
    artifact_id: result.artifact.id, limit: BOUND,
  }).items;

  assert.deepEqual(links.map((row) => row.document_id).sort(), [...result.sources].sort());

  // **The backlink render.** Both sources carry the artifact at the foot of their own file; the
  // third document carries nothing, which is what a run that wrote a backlink everywhere trips on.
  const names = identifiers(db);

  for (const document of [fixture.spec, fixture.epic]) {
    const { text } = renderDocument(db, document.id, names);

    assert.match(text, /## Published Artifacts/);
    assert.match(text, /Schema map/, 'a source document does not carry its own artifact');
  }

  const unassociated = renderDocument(db, fixture.retro.id, names).text;

  assert.ok(!unassociated.includes('Published Artifacts'),
    'a document with no artifact_document row rendered a backlink anyway');

  // **The index render**, from the same rows. `partial` is here too, so the register is not merely
  // echoing this run's single artifact back.
  const register = renderArtifactIndex(db, names);

  assert.match(register, /# Artifact Register/);
  assert.match(register, /Schema map/);
  assert.match(register, /Persistence, for the board/);

  // And the pairing agrees in both directions: the register names exactly the sources the backlinks
  // appeared in. This is the property — one row set, read twice — rather than two coincidences.
  const row = register.split('\n').find((line) => line.includes('Schema map'));
  const cited = row.split('|')[4].trim().split(', ');

  assert.deepEqual(cited.sort(), result.sources.map((id) => names.get(id)).sort());
  assert.ok(!cited.includes(names.get(fixture.retro.id)),
    'the register cites a document the backlinks do not');

  // The register is one of the files the projection writes, so the guard covers it.
  const { written } = project(db, { write: false });

  assert.ok(written.some((file) => file.path === REGISTER_PATH),
    'the register is not among the projected files, so nothing checks it against the rows');

  // A source that does not exist is refused at write time rather than rendering as a dead citation.
  assert.throws(
    () => raw.create_artifact_document({ artifact_id: result.artifact.id, document_id: 'no-such-id' }),
    /FOREIGN KEY|foreign key/i,
  );

  // **The file has to say no backlink is written**, because a run that also edited one in still
  // produces a correct row set — the duplication is in the documents, which nothing here reads.
  assert.match(prose(source, '2. Confirm, then write'),
    /\*\*No backlink is written into anything\.\*\*/);
  assert.match(prose(source, '2. Confirm, then write'),
    /recording one relationship twice, which is the defect this register exists to remove/);

  for (const name of ['list_spec', 'list_epic', 'list_retro', 'list_artifact',
    'list_artifact_document']) {
    assert.ok(passed.get(name)?.has('limit'), `${name} was called without a limit`);
  }

  assert.deepEqual(bindings(source, tools, { used, passed }), []);
});

// --- Criterion 2: one row per artifact, resolved rather than remembered --------------------------

test('a republish resolves to the same row and updates it in place', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);

  const fixture = workspace(tools, { published: true });
  const raw = handlers(tools);
  const before = raw.list_artifact({ limit: BOUND }).items.length;

  // A republish that moved the URL. The sources are the same, so the resolution has to find the row
  // without the URL to match on — which is the half `url`'s UNIQUE constraint cannot do.
  const result = run(call, fixture, { url: 'https://example.test/moved' });

  assert.deepEqual(result.existing.map((row) => row.id), [fixture.shared.id]);
  assert.equal(result.artifact.id, fixture.shared.id);
  assert.equal(result.artifact.url, 'https://example.test/moved');
  assert.equal(raw.list_artifact({ limit: BOUND }).items.length, before,
    'the run registered a second artifact over sources that already had one');

  // The neighbour it could have taken instead is untouched — `partial` shares one source, so a run
  // taking the union rather than the intersection had something to find.
  assert.equal(raw.read_artifact({ id: fixture.partial.id, include_body: true }).description,
    'An earlier page, from the spec alone.');
  assert.equal(raw.read_artifact({ id: fixture.partial.id }).url, 'https://example.test/partial');

  // **The intersection is stated, because no run can hold it.** The test performs the set
  // operation, so the recorder sees the right answer whatever the file says.
  const resolve = prose(source, '1. Resolve before creating');
  assert.match(resolve, /\*\*Common to all, not held by any\.\*\*/);
  assert.match(resolve, /offering to overwrite it is the same mistake as registering a duplicate/);
  assert.match(resolve, /Either hit means the same row, updated\. One row per artifact/);

  // Retirement: the row stops being offered, stays readable, and renders struck through.
  raw.update_artifact({
    id: fixture.partial.id,
    retired_at: '2026-08-10T00:00:00.000Z',
    retired_reason: 'superseded by the schema map',
  });

  assert.ok(!raw.list_artifact({ limit: BOUND }).items.some((r) => r.id === fixture.partial.id));
  assert.ok(raw.list_artifact({ include_retired: true, limit: BOUND }).items
    .some((r) => r.id === fixture.partial.id), 'a retired artifact is unreachable, not unoffered');

  const register = renderArtifactIndex(db, identifiers(db));

  assert.match(register, /~~Persistence, for the board~~/);
  assert.match(register, /superseded by the schema map/);

  // And a retirement without a reason is refused, so the register cannot hold a decision with no
  // record of why it was made.
  assert.throws(
    () => raw.update_artifact({ id: result.artifact.id, retired_at: '2026-08-10T00:00:00.000Z' }),
    /CHECK|constraint/i,
  );
});

// --- Criterion 3: the facilitation survives ------------------------------------------------------

test('no fact is invented, the name is proposed rather than assigned, and a scan says it is one', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  // The four facts, each named, and the rule that covers all of them.
  const facts = section(source, 'The four facts');

  assert.match(facts, /\*\*none of them is ever invented — ask\*\*/);
  for (const fact of ['`url`', '`title`', '`description`', 'The sources']) {
    assert.ok(facts.includes(`**${fact}**`), `the four facts do not include ${fact}`);
  }

  // The name is proposed and confirmed, never assumed from the page.
  assert.match(prose(source, 'The four facts'),
    /\*\*propose its own title and confirm it\*\* rather than assuming/);
  assert.match(prose(source, 'The four facts'),
    /a page's title is often not how its author would describe it/);

  // An association is never forced, and the reason is about where a wrong one sends a reader.
  assert.match(prose(source, 'The four facts'),
    /\*\*An artifact that genuinely stands alone records no sources\.\*\* Do not force one/);
  assert.match(prose(source, 'The four facts'),
    /it sends a future reader to the wrong document/);

  // The gate precedes the write, which no recorder observes.
  assert.ok(source.indexOf('1. Resolve before creating') < source.indexOf('2. Confirm, then write'));
  assert.match(prose(source, '2. Confirm, then write'),
    /Render the four facts in the message body and gate them/);

  // **The search is declared a scan.** It returns the right rows either way on any fixture, so only
  // the file can tell a reader that the match happens in the run rather than in an index.
  assert.match(prose(source, 'Input'), /\*\*That is a scan, not a query, and it is worth saying so\*\*/);
  assert.match(prose(source, 'Input'), /the search index does not cover this table/);

  // Retirement keeps its reason, and the reason carries a fact the date cannot.
  const retiring = prose(source, 'Retiring');
  assert.match(retiring, /\*\*retired, not removed\*\*/);
  assert.match(retiring, /cannot answer \*"what happened to that page\?"\*/);
  assert.match(retiring, /only the second means the URL is dead/);

  // It opens no session, and says why — the same subtraction `status` makes, for the same reason.
  assert.match(source, /\*\*It opens no session\.\*\*/);
  assert.match(source, /a resumable run that cannot be resumed is worse than none/);
  assert.match(source, /\*\*No retro awareness\.\*\*/);

  for (const name of toolNames(source)) {
    assert.ok(!/session/.test(name), `the skill names ${name} while claiming to open no session`);
  }

  // The degradation table answers every absence with a behaviour rather than a failure.
  const table = prose(source, 'Degradation');
  for (const missing of ['No artifacts registered yet', 'The page cannot be read to propose a title',
    'The user offers no description', 'A named source does not exist',
    'Two artifacts share every source']) {
    assert.ok(table.includes(missing), `the table does not answer: ${missing}`);
  }

  // Two artifacts over one source set is ambiguous, and the run asks rather than picking.
  assert.match(table, /Show both and ask which is being amended\. Do not pick the first/);

  // It writes no file, which is the claim the whole story rests on.
  assert.match(prose(source, 'Output'), /\*\*Nothing here writes a file\.\*\*/);
  assert.match(prose(source, 'Output'),
    /structurally unable to disagree rather than kept in step by hand/);

  // And nothing it names writes a document row — the register is rows about pages, not documents.
  const known = new Map(tools.map((tool) => [tool.name, tool]));

  for (const name of toolNames(source)) {
    const tool = known.get(name);

    assert.ok(!tool?.mutates || /artifact/.test(name),
      `the skill names ${name}, which writes something other than an artifact`);
  }
});

// --- Criterion 4 (must NOT): no recovery by reading what was written -----------------------------

test('must NOT — the skill recovers an entity by reading a generated markdown file', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  assert.deepEqual(recoveries(source, PARSES), []);

  const known = new Set(tools.map((tool) => tool.name));
  const named = toolNames(reachable(source));

  for (const required of ['list_library', 'list_library_scope', 'list_document_section',
    'read_document_section', 'list_spec', 'list_epic', 'list_problem_brief', 'list_product_brief',
    'list_adr', 'list_review', 'list_retro', 'list_quick', 'list_audit',
    'list_artifact', 'read_artifact', 'create_artifact', 'update_artifact',
    'list_artifact_document', 'create_artifact_document']) {
    assert.ok(named.includes(required), `the skill never names ${required}`);
    assert.ok(known.has(required), `${required} is not a tool`);
  }

  // The control: a file that reaches for the old two-files-by-hand shape is caught by the same read.
  const regressed = `${source}\n\nRead docs/artifacts/index.md, append a row immediately under the `
    + 'table header (| Artifact | URL |), add an **Artifacts**: field to each associated document, '
    + 'and strike a retired entry through as ~~name~~.';

  assert.ok(recoveries(regressed, PARSES).length >= 4,
    'the sweep passed a file that reads the index, writes a backlink and edits a strikethrough');
});
