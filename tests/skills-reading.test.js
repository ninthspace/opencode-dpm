/**
 * Epic 47-08 Story 9 — the eight converted read-surface skills as a corpus.
 *
 * - "None of the eight skill files contains a filename pattern under `docs/`, a glob, a
 *   number-allocation procedure, or a progress-file lifecycle" [unit]
 * - "None of the eight skill files contains a SQL keyword or a `sqlite3` invocation" [unit]
 * - "Every list-returning call any of the eight skills makes supplies or inherits a `limit`,
 *   asserted over the call sites" [unit]
 * - "Deleting the entire `docs/` tree and regenerating it leaves all eight skills producing
 *   identical output, since none of them reads it" [feature]
 * - "must NOT — a read skill reports an empty result where the data exists, because it queried one
 *   index or one table where the state spans two" [integration]
 *
 * **The fourth criterion is why this story exists.** Each conversion test proves its own skill reads
 * through tools; only deleting the tree those skills used to read proves it. The run below writes a
 * real projection to disk, drives the corpus reads, deletes the tree, drives them again, and
 * compares. It would pass vacuously against a suite that never touches the filesystem, so a control
 * run *does* read a projected file and is required to differ — without it, "identical either side"
 * is a statement about the test rather than about the skills.
 *
 * **The fifth is the failure this epic is most exposed to.** A query returning nothing reads as
 * "nothing to report" and raises no error, so every place where the corpus's state spans two tables
 * or two indexes gets a fixture that puts the answer *only* on the far half. A read that stopped at
 * the near half comes back empty, and empty is the wrong answer rather than an error.
 *
 * **The last test is the projection sweep**, carried here from Epic 47-07's retro: every column
 * these eight skills cause to be written has to reach a reader somewhere. A column written and
 * never rendered is a fact the tool accepted and nothing shows, which is how the audit
 * `Recommendation` survivor got in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import { project } from '../src/projection/index.ts';
import {
  skillSource, toolNames, reachable, recorder, recoveries, sweep, SQL, CONSTRUCTIONS,
} from './support/skills.js';

/** The epic's corpus. Named here because the epic's scope is these eight, not the twenty-two. */
const CORPUS = ['status', 'inspect', 'present', 'library', 'artifact', 'templates', 'consult', 'party'];

const sources = new Map(CORPUS.map((name) => [name, skillSource(name)]));

/** Above what any of these fixtures holds. */
const BOUND = 200;

// --- Criterion 1: no filename pattern, glob, allocation procedure or progress file ---------------

test('no read skill names a path, a glob, an allocation or a progress file', () => {
  assert.equal(sources.size, 8, 'the corpus is not the eight files this epic converts');

  for (const [name, source] of sources) {
    assert.deepEqual(sweep(source, CONSTRUCTIONS), [], `${name} carries a construction FR25 removes`);
    assert.deepEqual(recoveries(source), [], `${name} recovers something rather than calling a tool`);
  }

  // The control, and the reason the sweep above means anything: the same reading applied to the
  // constructions themselves finds every one of them. Without it a typo'd pattern reports a clean
  // corpus indistinguishably from a clean one.
  const planted = 'Glob docs/reviews/*-review-*.md, take the next available number, increment it '
    + 'and zero-pad it, then read the progress file at docs/plans/.cpm-progress-{session_id}.md '
    + 'and parse the front matter.';

  assert.ok(sweep(planted, CONSTRUCTIONS).length >= 3, 'the construction sweep is not reading');
  assert.ok(recoveries(planted).length >= 2, 'the recovery sweep is not reading');
});

// --- Criterion 2: no SQL keyword, no sqlite3 -----------------------------------------------------

test('no read skill contains a SQL statement or a sqlite invocation', () => {
  for (const [name, source] of sources) {
    assert.deepEqual(sweep(source, SQL), [], `${name} reaches past the tool boundary FR3 draws`);
  }

  // Real statements, which must be caught.
  for (const statement of [
    'SELECT * FROM artifact ORDER BY published_at DESC',
    'sqlite3 .dpm/planning.db',
    'INSERT INTO artifact_document (artifact_id, document_id) VALUES (?, ?)',
    'UPDATE agent SET retired_at = ? WHERE name = ?',
  ]) {
    assert.ok(sweep(statement, SQL).length >= 1, `${statement} passed the SQL sweep`);
  }

  // And the half that cannot be shared, because it is what *this* corpus is made of: real sentences
  // from these eight files, which must not be caught. Every one of them uses a SQL keyword as
  // English, which is why the sweep matches statement shapes rather than a word list.
  for (const prose of [
    'Select two or three whose `role` and `personality` bear on the decision at hand.',
    'the Library Check\'s scope filter is a `WHERE` clause rather than a front-matter parse',
    'Order the rows the way a reader would want them, newest first.',
    'a table a project can update without a plugin change',
    'Where it is ambiguous, treat it as conversation.',
  ]) {
    assert.deepEqual(sweep(prose, SQL), [], `the SQL sweep fires on this corpus's own prose: ${prose}`);
  }
});

// --- Criterion 3: every list call the corpus makes is bounded ------------------------------------

test('every list tool the corpus names carries a default limit, so no call is unbounded', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const registry = new Map(tools.map((tool) => [tool.name, tool]));

  // The call sites: every tool any of the eight files names, kept to the ones that return a list.
  const sites = [...new Set([...sources.values()].flatMap((source) => toolNames(reachable(source))))]
    .filter((name) => name.startsWith('list_') || name === 'search')
    .sort();

  // A count, so a broken extractor cannot report a bounded corpus by finding no call sites at all.
  assert.ok(sites.length >= 25, `only ${sites.length} list call sites — the extraction has drifted`);

  for (const name of sites) {
    const tool = registry.get(name);

    assert.ok(tool, `${name} is named by a skill and is not a tool`);

    const limit = tool.inputSchema.properties?.limit;

    // **"Supplies or inherits" resolves to the same guarantee**: a call site that names no `limit`
    // is bounded only if the tool declares one, and a call site that names one is overriding a
    // default that already existed. Either way the default is what makes the unbounded call
    // unreachable, so that is what this asserts.
    assert.ok(limit, `${name} is called by a skill and takes no limit`);
    assert.equal(typeof limit.default, 'number', `${name}'s limit has no default to inherit`);
    assert.ok(limit.default > 0, `${name}'s default limit is not a bound`);
    assert.equal(limit.maximum, undefined, `${name} caps its limit, which FR13 forbids`);
  }

  // The control: a tool outside the corpus's call sites that genuinely has no limit, so the
  // assertion above is discriminating rather than true of every tool in the registry.
  assert.equal(registry.get('read_artifact').inputSchema.properties.limit, undefined,
    'every tool takes a limit, so requiring one of the list tools proves nothing');

  // And where a file tells a run to raise the bound, it says so rather than leaving the reader to
  // guess whether the default was a choice — the two are indistinguishable at the call site.
  const raising = [...sources.values()]
    .filter((source) => /a `limit` above what\s*the project plausibly holds/.test(source));

  assert.ok(raising.length >= 3, 'no file in the corpus says when to raise the bound');
});

// --- Criterion 4: delete `docs/` and regenerate, and nothing the skills do changes ---------------

/**
 * A corpus with something for each of the eight to read, and a projection worth deleting.
 */
function workspace(tools) {
  const seed = handlers(tools);

  const spec = seed.create_spec({ slug: 'persistence', title: 'Persistence' });
  const epic = seed.create_epic({ parent_id: spec.id, slug: 'substrate', title: 'Substrate' });
  const story = seed.create_story({ epic_id: epic.id, number: 1, title: 'Tables', position: 1 });

  seed.create_document_section({
    document_id: spec.id, heading: 'Problem', body: 'Every relationship is recorded twice.',
    position: 0,
  });

  const requirement = seed.create_requirement({
    spec_id: spec.id, label: 'FR1', class: 'functional', position: 1,
    text: 'Every relationship shall be one row.',
  });

  const criterion = seed.create_story_criterion({
    story_id: story.id, position: 1, text: 'No shard boundary is decided outside this story.',
  });

  seed.create_task({ story_id: story.id, number: 1, title: 'Write the migration', position: 1 });

  const library = seed.create_library({ slug: 'standards', title: 'Standards', doc_type: 'reference' });

  seed.create_library_scope({ document_id: library.id, scope: 'present' });
  seed.create_document_section({
    document_id: library.id, heading: 'Standard', body: 'One host, no queue worker.', position: 0,
  });

  const artifact = seed.create_artifact({
    url: 'https://example.test/persistence', title: 'The persistence write-up',
    description: 'Where the relationship went.', published_at: '2026-08-10T00:00:00.000Z',
  });

  seed.create_artifact_document({ artifact_id: artifact.id, document_id: spec.id });

  return { spec, epic, story, requirement, criterion, library, artifact };
}

/**
 * What the corpus reads, as one function, so it can be driven twice against the same database.
 *
 * Every read here is one an actual skill's step makes. The result is stringified and compared
 * verbatim: a run that had reached the tree for any part of this would come back different once the
 * tree is gone, or would throw.
 */
function reads(call, fixture) {
  return JSON.stringify({
    // `status`, `inspect` — the planning graph.
    specs: call.list_spec({ limit: BOUND }).items.map((row) => row.title),
    stories: call.list_story({ epic_id: fixture.epic.id, limit: BOUND }).items
      .map((row) => row.title),
    tasks: call.list_task({ story_id: fixture.story.id, limit: BOUND }).items
      .map((row) => row.title),
    // `library` — the scope filter.
    scopes: call.list_library_scope({ document_id: fixture.library.id, limit: BOUND }).items
      .map((row) => row.scope),
    // `present`, `artifact` — the register and its join.
    artifacts: call.list_artifact({ limit: BOUND }).items.map((row) => row.url),
    links: call.list_artifact_document({ document_id: fixture.spec.id, limit: BOUND }).items.length,
    // `consult`, `party` — the roster and the search.
    roster: call.list_agent({ include_body: true, limit: BOUND }).items.map((row) => row.name),
    hits: call.search({ query: 'relationship', limit: BOUND }).items.map((hit) => hit.entity),
    // `templates` — the kind roster and a rendered preview.
    kinds: call.list_document_kind({ limit: BOUND }).items.length,
    preview: call.preview_document_kind({ kind: 'spec' }).text.length,
  });
}

test('deleting the projected tree and regenerating it changes nothing the corpus reads', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);

  const fixture = workspace(tools);

  const root = mkdtempSync(join(tmpdir(), 'dpm-corpus-'));

  t.after(() => rmSync(root, { recursive: true, force: true }));

  const written = project(db, { root, write: true });

  assert.ok(written.written.length > 3, 'nothing was projected, so there is no tree to delete');
  assert.ok(existsSync(join(root, 'docs')), 'the projection wrote no `docs/` tree');

  const before = reads(call, fixture);

  // **The control.** A reader that genuinely depends on the tree, driven against the same tree, so
  // "identical either side" is a claim about the skills rather than about a test that never
  // touched the filesystem.
  const dependent = () => readFileSync(join(root, written.written[0].path), 'utf8');
  const dependentBefore = dependent();

  assert.ok(dependentBefore.length > 0);

  rmSync(join(root, 'docs'), { recursive: true, force: true });

  assert.equal(existsSync(join(root, 'docs')), false, 'the tree is still there');

  const during = reads(call, fixture);

  assert.equal(during, before, 'a corpus read changed when the tree was deleted');
  assert.throws(dependent, /ENOENT/,
    'the control read survived the deletion, so the deletion proved nothing');

  // Regenerated, and still identical — the other half of the criterion, since a skill could in
  // principle depend on the tree's *absence* just as easily as on its presence.
  const again = project(db, { root, write: true });

  assert.deepEqual(again.written.map((file) => file.path), written.written.map((file) => file.path));
  assert.equal(reads(call, fixture), before, 'a corpus read changed when the tree came back');

  // And the regenerated bytes are the bytes that were there, which is what makes the tree a render
  // rather than a store (AD3).
  assert.equal(dependent(), dependentBefore, 'the regenerated tree is not the tree that was deleted');
});

// --- Criterion 5 (must NOT): an empty result where the state spans two -------------------------

test('must NOT — a corpus read reports empty where the state spans two indexes or two tables', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const { call } = recorder(tools);
  const seed = handlers(tools);

  // **Each fixture below puts the answer only on the far half of a two-part state.** A read that
  // stopped at the near half returns nothing and raises nothing, which is the failure NFR7 names.

  const spec = seed.create_spec({ slug: 'sharding', title: 'Sharding' });
  const epic = seed.create_epic({ parent_id: spec.id, slug: 'boundaries', title: 'Boundaries' });
  const story = seed.create_story({ epic_id: epic.id, number: 1, title: 'Split', position: 1 });

  // (a) **The search index spans two.** `shard` is on a story criterion and in no section body.
  seed.create_document_section({
    document_id: spec.id, heading: 'Problem', body: 'Partitions, everywhere.', position: 0,
  });

  const criterion = seed.create_story_criterion({
    story_id: story.id, position: 1, text: 'No shard is decided outside this story.',
  });

  const hits = call.search({ query: 'shard', limit: BOUND }).items;

  assert.deepEqual(hits.map((hit) => hit.entity), ['story_criterion'],
    'the search reported nothing for a term the corpus holds on a child row');
  assert.equal(hits[0].entity_id, criterion.id);

  // (b) **The library check spans two.** The document is in `library`, the scope in `library_scope`.
  const library = seed.create_library({ slug: 'standards', title: 'Standards', doc_type: 'reference' });

  seed.create_library_scope({ document_id: library.id, scope: 'all' });

  const scoped = call.list_library({ limit: BOUND }).items
    .filter((document) => call.list_library_scope({ document_id: document.id, limit: BOUND }).items
      .some((row) => row.scope === 'present' || row.scope === 'all'));

  assert.equal(scoped.length, 1,
    'the library check reported no scoped document where an `all`-scoped one exists');

  // (c) **The register spans two.** The artifact is one row, its association another, and a reader
  // asking "what came out of this document?" has to reach the second.
  const artifact = seed.create_artifact({
    url: 'https://example.test/sharding', title: 'On sharding', description: 'Why.',
    published_at: '2026-08-10T00:00:00.000Z',
  });

  seed.create_artifact_document({ artifact_id: artifact.id, document_id: spec.id });

  const links = call.list_artifact_document({ document_id: spec.id, limit: BOUND }).items;

  assert.equal(links.length, 1, 'the register reported no artifact for a document that has one');
  assert.equal(call.read_artifact({ id: links[0].artifact_id }).title, 'On sharding');

  // (d) **Coverage spans two.** A criterion's verification lives on `coverage`, not on the criterion.
  const requirement = seed.create_requirement({
    spec_id: spec.id, label: 'FR1', class: 'functional', position: 1, text: 'One shard per row.',
  });

  seed.create_coverage({
    story_criterion_id: criterion.id, requirement_id: requirement.id,
    spec_fragment: 'One shard per row.', position: 1,
  });

  const coverage = call.list_coverage({ requirement_id: requirement.id, limit: BOUND }).items;

  assert.equal(coverage.length, 1, 'coverage reported nothing for a requirement that is covered');

  // **The control that makes every assertion above discriminating**: a term, a scope, a document and
  // a requirement that genuinely hold nothing. Empty has to be reachable, or "not empty" is a
  // property of the fixture rather than of the read.
  assert.deepEqual(call.search({ query: 'zzzznothing', limit: BOUND }).items, []);
  assert.deepEqual(call.list_artifact_document({ document_id: epic.id, limit: BOUND }).items, []);
  assert.deepEqual(call.list_coverage({ requirement_id: requirement.id, limit: BOUND, offset: 9 })
    .items, []);
});

// --- The projection sweep: every column the corpus writes reaches a reader -----------------------

/**
 * Columns these eight cause to be written that reach no rendered file, and why each is allowed to.
 *
 * The list is short on purpose. A column added here without a reason is the survivor this sweep
 * exists to catch, wearing an exemption.
 */
const UNRENDERED = new Map([
  ['session.state', 'run state, closed at the end of a run and never a reader\'s concern'],
  ['session.phase', 'run state, for the same reason as `session.state` above'],
  ['artifact.retired_reason', 'rendered only beside a retirement, which this fixture does not have'],
]);

test('every column the corpus writes renders somewhere a reader can see it', (t) => {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const seed = handlers(tools);

  // Each value is a sentinel, so "it rendered" is a substring search rather than a judgement about
  // which field a rendered string came from. Where a column takes a vocabulary value the sentinel
  // cannot be invented, so the pair carries the *rendered* field instead — `runbook` on its own
  // would be found in a corpus that never rendered this document's type at all.
  //
  // **The third element is a path, and it is what makes "somewhere" strong enough.** A column with
  // two renders passes a corpus-wide search with either one deleted: dropping `description` from
  // the register left it visible in the backlink table and survived the whole suite until this
  // existed. So the four `artifact` columns are pinned to the register, which is the render nothing
  // else asserts the *content* of — Story 5's criterion 1 compares the two renders' pairing, not
  // their columns, and catches the backlink half on its own.
  const marks = {
    'discussion.title': ['Sentinel discussion title'],
    'document_section.heading': ['Sentinel heading'],
    'document_section.body': ['Sentinel body prose.'],
    'library.title': ['Sentinel library title'],
    'library.doc_type': ['runbook', '**Type**: runbook'],
    'library_scope.scope': ['sentinel-scope'],
    'artifact.title': ['Sentinel artifact title', null, 'docs/artifacts/index.md'],
    'artifact.url': ['https://example.test/sentinel', null, 'docs/artifacts/index.md'],
    'artifact.description': ['Sentinel artifact description.', null, 'docs/artifacts/index.md'],
    'artifact.published_at': ['2019-03-07', null, 'docs/artifacts/index.md'],
    'session.state': ['{"sentinel":true}'],
    'session.phase': ['sentinel-phase'],
    'artifact.retired_reason': ['superseded by the sentinel'],
  };

  /** What the column was written as, and what a reader would have to see for it to have rendered. */
  const written = (column) => marks[column][0];
  const shown = (column) => marks[column][1] ?? marks[column][0];

  /** Which file it has to reach, where reaching any of them is not enough. */
  const home = (column) => marks[column][2] ?? null;

  const discussion = seed.create_discussion({
    slug: 'sentinel', title: written('discussion.title'),
  });

  seed.create_document_section({
    document_id: discussion.id, heading: written('document_section.heading'),
    body: written('document_section.body'), position: 0,
  });

  const library = seed.create_library({
    slug: 'sentinel-library', title: written('library.title'), doc_type: written('library.doc_type'),
  });

  seed.create_library_scope({ document_id: library.id, scope: written('library_scope.scope') });

  const artifact = seed.create_artifact({
    url: written('artifact.url'), title: written('artifact.title'),
    description: written('artifact.description'),
    published_at: `${written('artifact.published_at')}T00:00:00.000Z`,
  });

  seed.create_artifact_document({ artifact_id: artifact.id, document_id: discussion.id });

  seed.create_session({
    id: 'sentinel-session', skill: 'dpm:party', phase: written('session.phase'),
    state: written('session.state'),
  });

  const files = project(db, { write: false }).written;
  const rendered = files.map((file) => file.text).join('\n');

  assert.ok(rendered.length > 0, 'nothing was projected, so the sweep is reading an empty string');
  assert.ok(files.some((file) => file.path === 'docs/artifacts/index.md'),
    'the register was not projected, so pinning a column to it proves nothing');

  for (const column of Object.keys(marks)) {
    const exempt = UNRENDERED.get(column);

    if (exempt) {
      assert.equal(rendered.includes(shown(column)), false,
        `${column} is exempted as unrendered and rendered anyway — the exemption is stale`);
      assert.ok(exempt.length > 20, `${column}'s exemption carries no reason`);
      continue;
    }

    const path = home(column);
    const where = path
      ? files.find((file) => file.path === path)?.text ?? ''
      : rendered;

    assert.ok(where.includes(shown(column)),
      `${column} is written by a skill in this corpus and reaches no reader${path ? ` in ${path}` : ''}`);
  }

  // The exemptions are the interesting part of this test, so their count is pinned: a sweep that
  // grew a fourth quietly would be a column that stopped rendering and was waved through.
  assert.equal(UNRENDERED.size, 3, 'the unrendered set changed without the sweep being revisited');

  // And the control: a value nothing wrote must not be found, or `includes` is matching on
  // something other than what was seeded.
  assert.equal(rendered.includes('Sentinel value nothing wrote'), false);
});
