/**
 * One document of every seeded kind, and one row of every projectable non-document type.
 *
 * Epic 47-04 Story 2's criterion is over the *whole* template set — thirteen kinds, and the nine
 * non-document types that render inside a parent — so the fixture has to be the whole set too. A
 * per-kind fixture written beside each per-kind test would let a kind be forgotten in both places
 * at once, which is the shape FR10's enumeration exists to catch.
 *
 * **Written through the Epic 47-03 create tools wherever one exists, and by statement where none
 * does.** The tools cover the spine — spec, epic, requirement, criterion, story, task, story
 * criterion, coverage, dependency — and that is the seam the projection sits downstream of, so a
 * renderer that agreed with hand-written rows and disagreed with tool-written ones would pass a
 * fidelity test built the other way round. The remaining kinds are Epic 47-05's tool surface;
 * inventing tools for them here would be this epic writing another's.
 *
 * Every id is a literal, and every timestamp is a constant. AD9's ULIDs give production a total
 * order for free; a fixture wants a *stated* one, so the ids below sort in the order the documents
 * are meant to render and nothing depends on when the test ran.
 */

import { columnNames } from './introspection.js';

const AT = '2026-01-01T00:00:00Z';

/** A `document` row, by statement. Only the spine has create tools; see the module note. */
function insertDocument(db, row) {
  db.prepare(`INSERT INTO document
      (id, kind, numbering, number, sequence, slug, title, status, status_note,
       parent_id, parent_kind, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(row.id, row.kind, row.numbering, row.number ?? null, row.sequence ?? null,
      row.slug, row.title, row.status ?? 'pending', row.status_note ?? null,
      row.parent_id ?? null, row.parent_kind ?? null, AT, AT);

  return { id: row.id };
}

/** `document_section` rows for a document, in the order given. */
function insertSections(db, documentId, sections) {
  sections.forEach((section, position) => {
    db.prepare(`INSERT INTO document_section (id, document_id, heading, body, position)
                VALUES (?, ?, ?, ?, ?)`)
      .run(`${documentId}-sec-${position}`, documentId, section.heading, section.body, position);
  });
}

/**
 * Build the corpus.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {Record<string, Function>} call The spine tools, by name.
 * @returns {Record<string, {id: string}>} Every document created, keyed by kind.
 */
export function fullCorpus(db, call) {
  // --- The spine, through its tools ----------------------------------------------------------
  const spec = call.create_spec({ slug: 'persistence', title: 'Artefact persistence' });
  const epic = call.create_epic({
    parent_id: spec.id, slug: 'projection', title: 'Projection and guard',
  });

  const requirement = call.create_requirement({
    spec_id: spec.id, label: 'FR10', class: 'functional', moscow: 'must', position: 0,
    text: `Every kind has a template. Superseded by spec {{ref:${spec.id}}}.`,
  });

  call.create_acceptance_criterion({
    requirement_id: requirement.id, text: 'Thirteen kinds, thirteen templates',
    polarity: 'must', position: 0,
  });

  const story = call.create_story({
    epic_id: epic.id, number: 1, title: 'Write a template for every kind', position: 0,
  });
  const blocked = call.create_story({
    epic_id: epic.id, number: 2, title: 'Guard the generated tree', position: 1,
  });

  call.create_task({
    story_id: story.id, number: 1, title: 'Write the templates',
    description: 'One per seeded kind — a | pipe here, on purpose.', position: 0,
  });

  const criterion = call.create_story_criterion({
    story_id: story.id, text: 'Each kind renders', polarity: 'must', position: 0,
  });

  call.create_coverage({
    requirement_id: requirement.id, spec_fragment: 'Every kind has a template',
    story_criterion_id: criterion.id, position: 0,
  });

  // **A withdrawn binding, because a state no corpus reaches is a state nothing has ever
  // rendered.** Three sweeps read this corpus to answer whether every state the schema admits is
  // reachable — `sparse.test.js`'s declared-state walk, `entry-index.test.js`'s scan, and
  // `parity-integration.test.js`'s round trip over every indexed type — and `coverage.retired_at`
  // and `coverage.retired_reason` are unreachable from a corpus that only ever binds. The row is
  // retired through the tool rather than by statement, which is the whole point: what the sweeps
  // are checking is that the surface can produce the state, not that SQLite can hold it.
  // **Guarded on the column, because this corpus is also filled on databases older than it.**
  // `plugin-stamp.test.js` builds one at a pre-025 version and fills it, so that "no other table's
  // contents changed" is a comparison over rows rather than over empty tables. Against that
  // database `coverage` has no `retired_at`, and a corpus that reached for it unconditionally would
  // fail there for a reason with nothing to do with what that test is checking. The guard is the
  // schema's own answer, not a version number written here.
  if (columnNames(db, 'coverage').includes('retired_at')) {
    const withdrawn = call.create_coverage({
      requirement_id: requirement.id, spec_fragment: 'Every kind has a',
      story_criterion_id: criterion.id, position: 1,
    });

    call.retire_coverage({
      id: withdrawn.id,
      reason: 'The fragment stopped mid-clause and bound half an obligation.',
    });
  }

  call.create_dependency({
    kind: 'blocks', source_story_id: blocked.id, target_story_id: story.id,
  });

  db.prepare(`INSERT INTO story_criterion_approach (story_criterion_id, tag)
              VALUES (?, 'integration')`).run(criterion.id);

  db.prepare(`INSERT INTO milestone (id, spec_id, label, title, summary, position)
              VALUES ('ms-1', ?, 'M1', 'Substrate', 'The schema and its guards', 0)`).run(spec.id);
  db.prepare("INSERT INTO document_milestone (document_id, milestone_id) VALUES (?, 'ms-1')")
    .run(epic.id);

  insertSections(db, spec.id, [
    { heading: 'Context', body: 'One database, one schema.' },
    { heading: 'Scope', body: 'The projection is one-way.' },
  ]);
  insertSections(db, epic.id, [{ heading: 'Notes', body: 'Story 1 settled the filenames.' }]);

  // --- The remaining kinds, by statement ------------------------------------------------------
  const documents = { spec, epic };

  documents.coverage_matrix = insertDocument(db, {
    id: 'doc-matrix', kind: 'coverage_matrix', numbering: 'child', sequence: 1,
    slug: 'projection', title: 'Coverage: Projection and guard',
    parent_id: epic.id, parent_kind: 'epic',
  });

  documents.problem_brief = insertDocument(db, {
    id: 'doc-plan', kind: 'problem_brief', numbering: 'root', number: 1,
    slug: 'persistence', title: 'Artefacts are files',
  });
  insertSections(db, 'doc-plan', [{ heading: 'Problem', body: 'Prose is not queryable.' }]);

  documents.product_brief = insertDocument(db, {
    id: 'doc-brief', kind: 'product_brief', numbering: 'root', number: 1,
    slug: 'persistence', title: 'A database for artefacts',
  });
  insertSections(db, 'doc-brief', [{ heading: 'Outcome', body: 'A query, not a grep.' }]);

  documents.discussion = insertDocument(db, {
    id: 'doc-disc', kind: 'discussion', numbering: 'root', number: 1,
    slug: 'schema-shape', title: 'How wide should the schema be?',
  });
  insertSections(db, 'doc-disc', [{ heading: 'Positions', body: 'Parity from the outset.' }]);

  // The one kind with no CPM file behind it: a `present` run told to keep its output local. It
  // takes no parent, so it is also the corpus's check that a parentless root kind renders.
  documents.communication = insertDocument(db, {
    id: 'doc-comm', kind: 'communication', numbering: 'root', number: 1,
    slug: 'launch-note', title: 'What the persistence work changes',
  });
  insertSections(db, 'doc-comm', [
    { heading: 'Audience', body: 'Everyone who runs a planning skill.' },
    { heading: 'What changes', body: 'Artefacts are rows; the files are a projection.' },
  ]);

  documents.runbook = insertDocument(db, {
    id: 'doc-run', kind: 'runbook', numbering: 'root', number: 1,
    slug: 'restore', title: 'Restoring from the dump',
  });
  insertSections(db, 'doc-run', [{ heading: 'Steps', body: 'Restore, then check integrity.' }]);

  documents.review = insertDocument(db, {
    id: 'doc-review', kind: 'review', numbering: 'root', number: 1,
    slug: 'projection', title: 'Review: the projection',
    parent_id: epic.id, parent_kind: 'epic',
  });
  db.prepare(`INSERT INTO review (document_id, scope, scope_story_id) VALUES ('doc-review', ?, ?)`)
    .run('story', story.id);
  db.prepare(`INSERT INTO document_agent (document_id, document_kind, agent)
      VALUES ('doc-review', 'review', 'architect')`)
    .run();
  db.prepare(`INSERT INTO finding
      (id, review_id, position, agent, category_id, severity_id, summary, status)
      VALUES ('find-1', 'doc-review', 0, 'architect', 'finding:hidden-complexity',
              'severity:critical', ?, 'open')`)
    .run(`The matrix reaches its rows through spec {{ref:${spec.id}}}.`);

  documents.retro = insertDocument(db, {
    id: 'doc-retro', kind: 'retro', numbering: 'root', number: 1,
    slug: 'projection', title: 'Retro: the projection',
    parent_id: epic.id, parent_kind: 'epic',
  });
  db.prepare(`INSERT INTO observation (id, retro_id, retro_kind, story_id, position, text, note)
              VALUES ('obs-1', 'doc-retro', 'retro', ?, 0, ?, 'Held structurally.')`)
    .run(story.id, 'A structural check has nothing to be lucky about.');
  db.prepare(`INSERT INTO observation_category (observation_id, taxonomy_id)
              VALUES ('obs-1', 'observation:testing-gaps')`).run();
  db.prepare(`INSERT INTO retro_application
      (id, retro_id, applied_to_id, theme, disposition, note)
      VALUES ('app-1', 'doc-retro', ?, 'Testing gaps', 'applied', 'Structural guard added.')`)
    .run(epic.id);

  documents.quick = insertDocument(db, {
    id: 'doc-quick', kind: 'quick', numbering: 'root', number: 1,
    slug: 'pipe-escape', title: 'Escape pipes in table cells',
  });
  db.prepare("INSERT INTO quick (document_id, closed_at) VALUES ('doc-quick', ?)").run(AT);
  db.prepare(`INSERT INTO quick_criterion (id, quick_id, text, met, note, position)
              VALUES ('qc-1', 'doc-quick', 'A cell with a | renders as one cell', 1, NULL, 0),
                     ('qc-2', 'doc-quick', 'A cell with a newline stays one row', NULL, 'open', 1)`)
    .run();

  documents.audit = insertDocument(db, {
    id: 'doc-audit', kind: 'audit', numbering: 'root', number: 1,
    slug: 'projection', title: 'Audit: the render path',
  });
  db.prepare(`INSERT INTO audit_finding
      (id, audit_id, position, dimension_id, file, line, symbol, severity_id)
      VALUES ('af-1', 'doc-audit', 0, 'audit_dimension:test-debt',
              'src/projection/text.js', 100, 'table', 'severity:suggestion')`).run();

  documents.library = insertDocument(db, {
    id: 'doc-lib', kind: 'library', numbering: 'root', number: 1,
    slug: 'standards', title: 'Coding standards',
  });
  db.prepare(`INSERT INTO library_document (document_id, doc_type)
              VALUES ('doc-lib', 'coding-standards')`).run();
  db.prepare(`INSERT INTO library_scope (document_id, scope)
              VALUES ('doc-lib', 'all'), ('doc-lib', 'do')`).run();
  insertSections(db, 'doc-lib', [{ heading: 'Rules', body: 'Edit file-by-file.' }]);

  documents.adr = insertDocument(db, {
    id: 'doc-adr', kind: 'adr', numbering: 'child', sequence: 1,
    slug: 'one-way', title: 'The projection is one-way',
    parent_id: spec.id, parent_kind: 'spec',
  });
  db.prepare(`INSERT INTO adr (document_id, decision_status, decision)
              VALUES ('doc-adr', 'accepted', ?)`)
    .run(`Markdown is committed, never read. See spec {{ref:${spec.id}}}.`);
  db.prepare(`INSERT INTO adr_option (id, adr_id, name, chosen, rationale, position)
              VALUES ('opt-0', 'doc-adr', 'Reimportable projection', 0, 'Attractive', 0),
                     ('opt-1', 'doc-adr', 'One-way projection', 1, 'Chosen', 1)`).run();
  db.prepare(`INSERT INTO adr_option_tradeoff (option_id, axis, assessment)
              VALUES ('opt-0', 'cost', 'high'), ('opt-1', 'cost', 'low')`).run();

  // `artifact` has no parent of its own beyond this join, which is why it renders in the shared
  // foot rather than in any one kind's template.
  db.prepare(`INSERT INTO artifact (id, url, title, description, published_at)
              VALUES ('art-1', 'https://example.invalid/a', 'The projection, illustrated',
                      'A walk through the render path', ?)`).run(AT);
  db.prepare("INSERT INTO artifact_document (artifact_id, document_id) VALUES ('art-1', ?)")
    .run(spec.id);

  return documents;
}

/**
 * The nine parity-list types that render inside a parent, and the table each one lives in.
 *
 * **`session` is the tenth and is named here as unreachable rather than left out.** It has no
 * `document_id`, so no parent's template can hold it, and projecting session state into `docs/`
 * would put back the `.cpm-*` leak FR11 removed. Excluding it from the list would make the
 * assertion pass by shrinking its own input, which proves nothing — so it is carried with the
 * reason, and the test asserts the reason rather than the absence.
 */
export const PROJECTED_TYPES = {
  requirement: { table: 'requirement', parent: 'spec' },
  milestone: { table: 'milestone', parent: 'spec' },
  story: { table: 'story', parent: 'epic' },
  task: { table: 'task', parent: 'epic' },
  story_criterion: { table: 'story_criterion', parent: 'epic' },
  coverage: { table: 'coverage', parent: 'coverage_matrix' },
  finding: { table: 'finding', parent: 'review' },
  observation: { table: 'observation', parent: 'retro' },
  artifact: { table: 'artifact', parent: 'spec' },
};

/** The one parity-list non-document type no template can reach, and why. */
export const UNPROJECTED_TYPES = {
  session: 'has no document_id — no parent can hold it, and FR11 removed the file it used to be',
};
