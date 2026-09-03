/**
 * The document tree a template renders, with an explicit `ORDER BY` on every collection (FR6).
 *
 * FR6's determinism criterion has a must-NOT attached to it — "a projected collection has no
 * ordering column and no declared tiebreak, so its render order is whatever the query returns" —
 * and that failure is the quiet kind. A `SELECT` with no `ORDER BY` is not random; SQLite returns
 * rows in whatever order the query plan happens to produce, which is usually stable and is under
 * no obligation to be. It changes when an index is added, when the table is rebuilt by a
 * migration, or when the row count crosses whatever threshold flips the plan. So the projection
 * regenerates identically for months and then produces a spurious conflict on a commit that
 * touched nothing.
 *
 * **Every collection therefore declares its order, and every order ends on the primary key.**
 * AD9's ULIDs are what make that a total order wherever no `position` column exists: an ordering
 * that ends on a unique column has no ties left to break, so nothing is left to the query plan.
 * `position` alone is not enough even where it is `UNIQUE (parent, position)` — the uniqueness is
 * per parent, and a collection loaded across parents would still tie.
 *
 * **Sorting happens in SQLite and never in JavaScript.** A `.sort()` in the render path is where
 * a locale collator gets reintroduced, and `localeCompare` on two strings that differ only in
 * case or accent gives a different answer under a different `LANG`. The DDL declares no `COLLATE`
 * anywhere, so every TEXT column sorts BINARY, which is a byte comparison and identical under
 * every locale.
 */

import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { Row } from './naming.ts';

import { ancestryOf } from './naming.ts';

// Re-exported because this is where the rest of the projection meets a row. It is declared one
// module down so that `naming.ts`, which everything else here sits on, does not import upwards.
export type { Row };

/** One projected collection: the table it reads, the column it joins on, and its total ordering. */
type Descriptor = { table: string; parent: string; order: string[]; live?: string };

/**
 * Every collection a template may project, and the order it comes back in.
 *
 * Declared as data rather than written into each query so that the must-NOT is checkable: the
 * test reads `PRAGMA table_info` for each `table` and asserts the last column of `order` is the
 * one SQLite marks `pk`. A collection added without an ordering fails there rather than in a
 * merge conflict six weeks later.
 *
 * @type {Record<string, {table: string, parent: string, order: string[]}>}
 */
export const COLLECTIONS: Record<string, Descriptor> = {
  // `live` is the one optional field, and only this collection has it. A section superseded by a
  // consolidation stays readable through `list_document_section` with `include_superseded` — the
  // record of how the document came to say what it says — and must not render, because rendering
  // it beside the body it was folded into is the duplication the column exists to end. The
  // exclusion belongs here rather than in a template: it is a fact about which rows *are* the
  // document, and a per-template filter is a rule seven renderers each have to remember.
  sections: {
    table: 'document_section', parent: 'document_id', live: 'superseded_at',
    order: ['position', 'id'],
  },
  requirements: { table: 'requirement', parent: 'spec_id', order: ['position', 'id'] },
  criteria: { table: 'acceptance_criterion', parent: 'requirement_id', order: ['position', 'id'] },
  milestones: { table: 'milestone', parent: 'spec_id', order: ['position', 'id'] },
  children: { table: 'document', parent: 'parent_id', order: ['sequence', 'id'] },
  options: { table: 'adr_option', parent: 'adr_id', order: ['position', 'id'] },
  // No `position` column and none wanted: the axes are a set, and `axis` is half this table's
  // composite primary key, so ordering by it within one option is already total. It is declared
  // here rather than ordered inline so the structural check covers it like the rest — a
  // collection outside the descriptor is a collection nothing asserts an ordering for.
  tradeoffs: { table: 'adr_option_tradeoff', parent: 'option_id', order: ['axis'] },

  // Delivery — the epic's shape.
  stories: { table: 'story', parent: 'epic_id', order: ['position', 'id'] },
  tasks: { table: 'task', parent: 'story_id', order: ['position', 'id'] },
  storyCriteria: { table: 'story_criterion', parent: 'story_id', order: ['position', 'id'] },
  criterionApproaches: { table: 'criterion_approach', parent: 'criterion_id', order: ['tag'] },
  storyCriterionApproaches: {
    table: 'story_criterion_approach', parent: 'story_criterion_id', order: ['tag'],
  },

  // Coverage — scoped to the requirement, which is where the row's identity starts. The matrix
  // reaches them through its epic's spec rather than through itself; see `coverageFor` below.
  coverage: { table: 'coverage', parent: 'requirement_id', order: ['position', 'id'] },
  coverageStories: { table: 'coverage_story', parent: 'coverage_id', order: ['story_id'] },

  // Review, retro and audit.
  findings: { table: 'finding', parent: 'review_id', order: ['position', 'id'] },
  // Keyed by the document rather than by the review, because the table spans two kinds: a
  // discussion's participants load through this same descriptor.
  documentAgents: { table: 'document_agent', parent: 'document_id', order: ['agent'] },
  observations: { table: 'observation', parent: 'retro_id', order: ['position', 'id'] },
  storyObservations: { table: 'observation', parent: 'story_id', order: ['position', 'id'] },
  observationCategories: {
    table: 'observation_category', parent: 'observation_id', order: ['taxonomy_id'],
  },
  auditFindings: { table: 'audit_finding', parent: 'audit_id', order: ['position', 'id'] },

  // `retro_application` is loaded by the document it was applied *to*, not by the retro that
  // recorded it, because that is where a reader meets it: CPM writes the breadcrumb on the epic.
  // The retro keeps the rows; the epic renders them.
  retroApplications: {
    table: 'retro_application', parent: 'applied_to_id', order: ['theme', 'note', 'id'],
  },

  // Quick and library detail.
  quickCriteria: { table: 'quick_criterion', parent: 'quick_id', order: ['position', 'id'] },
  libraryScopes: { table: 'library_scope', parent: 'document_id', order: ['scope'] },

  // Cross-cutting joins. Both ends of a dependency are nullable and exclusive, so the two
  // descriptors are one table read two ways rather than two tables.
  //
  // **They read it from opposite ends, and that is the whole of what each renders.** An edge reads
  // source-blocks-target, as `dependency/readiness.ts` says, so a document's *outgoing* edges are
  // what it holds up and a story's *incoming* edges are what hold it up. `common.ts` renders the
  // first under `## Dependencies` with the kind and an arrow, which is direction-honest either way
  // round; `epic.ts` renders the second under `**Blocked by**`, which is not — a label naming a
  // direction has to be read from the end it names. Quick 01 is what happens when it is not:
  // `storyDependencies` was `source_story_id` and every story in every epic file named the stories
  // it blocked under a heading saying the reverse.
  //
  // Parenting on `target_story_id` also picks up the pairing the source-keyed read could not see
  // at all — `source_document_id` with `target_story_id`, a story waiting on a whole epic, which
  // `readiness.ts` names as one of the two ways a story is held.
  artifactLinks: { table: 'artifact_document', parent: 'document_id', order: ['artifact_id'] },
  delivers: { table: 'document_milestone', parent: 'document_id', order: ['milestone_id'] },
  dependencies: { table: 'dependency', parent: 'source_document_id', order: ['kind', 'id'] },
  storyBlockers: { table: 'dependency', parent: 'target_story_id', order: ['kind', 'id'] },
};

/**
 * Read one collection for one parent.
 *
 * The table and column names come from `COLLECTIONS` and never from a caller, which is what makes
 * the interpolation safe — they are this schema's own identifiers, the same footing `dump/rows.js`
 * builds its statements on. The parent id is bound.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} name A key of `COLLECTIONS`.
 * @param {string} parentId
 * @returns {object[]}
 */
export function collection(db: DatabaseSync, name: string, parentId: SQLInputValue): Row[] {
  // The descriptor is checked before it is destructured rather than after, which is the same test
  // the falsy `table` was: a name outside `COLLECTIONS` is the only way either is absent.
  const descriptor = COLLECTIONS[name];

  if (!descriptor) throw new Error(`no such projected collection: ${name}`);

  const { table, parent, order, live } = descriptor;

  return db
    .prepare(`SELECT * FROM ${table} WHERE ${parent} = ?`
      + (live ? ` AND ${live} IS NULL` : '')
      + ` ORDER BY ${order.join(', ')}`)
    .all(parentId)
    .map((row) => ({ ...row }));
}

/**
 * Load a document, its ancestry, and the collections every kind has.
 *
 * **What a template may not do is write its own `ORDER BY`** — thirteen of them by the end of
 * Story 2, each free to forget one. Reaching for `collection(db, name, id)` is fine and is how the
 * kind-specific loaders below work; what is centralised is the *order*, not the query.
 *
 * The universal set is loaded here: sections, child documents, and the three cross-cutting joins
 * that hang off any kind — published artifacts, delivered milestones, and applied retro lessons.
 * `requirements` and `milestones` stay because the spec template wants them and they cost one empty
 * query on every other kind; the kind-specific structure belongs to the per-kind loaders.
 *
 * **`children` is every document hanging off this one**, not only the ones that render inline. A
 * template takes what it wants; the ADR is the case that matters, since `document_kind.dir IS
 * NULL` means it has no file and appears only inside its parent's output.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} id
 * @returns {object} The tree, with `ancestry` nearest-first and `parent` its first element.
 */
export function loadDocument(db: DatabaseSync, id: string) {
  const document = db.prepare('SELECT * FROM document WHERE id = ?').get(id) as Row | undefined;

  if (!document) throw new Error(`no document with id '${id}'`);

  const rows = db.prepare('SELECT * FROM document ORDER BY id').all() as Row[];
  const ancestry = ancestryOf(new Map(rows.map((row) => [row.id, row])), document)
    .map((row) => ({ ...row }));

  // The `: Row` annotations here and in `storiesOf` are not decoration: spreading a row into an
  // object literal drops its index signature, so without them the nested shapes lose every column
  // they came in with and keep only the key this line adds.
  const requirements = collection(db, 'requirements', id).map((requirement): Row => ({
    ...requirement,
    criteria: collection(db, 'criteria', requirement.id).map((criterion): Row => ({
      ...criterion,
      approaches: collection(db, 'criterionApproaches', criterion.id).map((row) => row.tag),
    })),
  }));

  return {
    document: { ...document },
    ancestry,
    parent: ancestry[0],
    sections: collection(db, 'sections', id),
    requirements,
    milestones: collection(db, 'milestones', id),
    children: collection(db, 'children', id),
    artifacts: collection(db, 'artifactLinks', id).map(({ artifact_id: artifactId }) => ({
      ...db.prepare('SELECT * FROM artifact WHERE id = ?').get(artifactId),
    })),
    delivers: collection(db, 'delivers', id).map(({ milestone_id: milestoneId }) => ({
      ...db.prepare('SELECT * FROM milestone WHERE id = ?').get(milestoneId),
    })),
    retroApplications: collection(db, 'retroApplications', id),
    dependencies: collection(db, 'dependencies', id),
  };
}

/**
 * The detail row a kind carries beside its document, or `undefined` when it has none (AD7).
 *
 * Four kinds have one — `adr`, `review`, `quick` and `library` — and each detail table's primary
 * key *is* its document's, so the lookup is by id in every case and the table name is the only
 * thing that varies. A map rather than four near-identical functions, because four of those is
 * where the fifth gets written slightly differently.
 */
const DETAIL_TABLES: Record<string, string> = {
  adr: 'adr',
  review: 'review',
  quick: 'quick',
  library: 'library_document',
};

/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} kind
 * @param {string} documentId
 * @returns {object|undefined}
 */
export function detailOf(db: DatabaseSync, kind: string, documentId: string) {
  const table = DETAIL_TABLES[kind];

  if (!table) return undefined;

  const row = db.prepare(`SELECT * FROM ${table} WHERE document_id = ?`)
    .get(documentId) as Row | undefined;

  return row ? { ...row } : undefined;
}

/**
 * An epic's stories, each with its tasks, criteria and story-scoped observations.
 *
 * `story_criterion` carries the test-approach tags through a join table, and they are folded into
 * the row here rather than in the template — a template that joined would be a template that
 * ordered, which is the one thing this module exists to keep out of them.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} epicId
 * @returns {object[]}
 */
export function storiesOf(db: DatabaseSync, epicId: string) {
  return collection(db, 'stories', epicId).map((story): Row => ({
    ...story,
    tasks: collection(db, 'tasks', story.id),
    criteria: collection(db, 'storyCriteria', story.id).map((criterion): Row => ({
      ...criterion,
      approaches: collection(db, 'storyCriterionApproaches', criterion.id).map((row) => row.tag),
    })),
    observations: collection(db, 'storyObservations', story.id),
    blockers: collection(db, 'storyBlockers', story.id),
  }));
}

/**
 * The coverage rows a coverage matrix renders — reached through its epic, not through itself.
 *
 * **A `coverage` row is scoped to a requirement, and a matrix is scoped to an epic**, so there is
 * no column joining the two. The path is the long way round: the matrix's parent epic, that epic's
 * parent spec, the spec's requirements, and the coverage rows on those requirements filtered to
 * the ones whose `story_criterion` belongs to a story of *this* epic. Any shorter route would mean
 * a matrix rendering another epic's rows, which is precisely the mis-binding FR21 exists to make
 * visible.
 *
 * The order is requirement position, then coverage position within it — both declared, and both
 * ending on a primary key. That is also the corpus's reading order, so the matrix's row numbering
 * is stable under everything except a requirement being reordered.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} epic The matrix's parent.
 * @param {object} spec The epic's parent.
 * @returns {object[]} Coverage rows, each carrying its `requirement`, `criterion` and `stories`.
 */
export function coverageFor(db: DatabaseSync, epic: Row, spec: Row) {
  const stories = storiesOf(db, epic.id);
  const criteria = new Map<string, { criterion: Row; story: Row }>();

  for (const story of stories) {
    for (const criterion of story.criteria) criteria.set(criterion.id, { criterion, story });
  }

  const rows: Row[] = [];

  for (const requirement of collection(db, 'requirements', spec.id)) {
    for (const row of collection(db, 'coverage', requirement.id)) {
      const bound = criteria.get(row.story_criterion_id);

      if (!bound) continue;

      rows.push({
        ...row,
        requirement,
        criterion: bound.criterion,
        // The declaring story comes first and is not repeated, so "Covered by" reads as the corpus
        // writes it — the story that owns the criterion, then any others that also deliver it.
        stories: [
          bound.story,
          ...collection(db, 'coverageStories', row.id)
            .map(({ story_id: storyId }) => stories.find((story) => story.id === storyId))
            .filter((story) => story && story.id !== bound.story.id),
        ],
      });
    }
  }

  return rows;
}

/**
 * A retro's observations, each with its categories resolved to their taxonomy labels.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} retroId
 * @returns {object[]}
 */
export function observationsOf(db: DatabaseSync, retroId: string) {
  return collection(db, 'observations', retroId).map((observation) => ({
    ...observation,
    categories: collection(db, 'observationCategories', observation.id)
      .map(({ taxonomy_id: taxonomyId }) => taxonomyLabel(db, taxonomyId)),
  }));
}

/**
 * A vocabulary term's display form: `singular` where the term has one, `name` otherwise.
 *
 * Findings, audit findings and observation categories all reference `taxonomy`, and all three want
 * the per-item form — "Pattern worth reusing" reads correctly against one observation where the
 * canonical "Patterns Worth Reusing" is a section heading. `singular` is nullable, so `name` is the
 * fallback rather than a second lookup.
 *
 * **The id is returned when the term is missing, rather than an empty cell.** A dangling taxonomy
 * reference is an integrity failure the register reports; a blank cell here would hide it behind
 * something that looks like an unset optional column.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string|null} taxonomyId
 * @returns {string}
 */
export function taxonomyLabel(db: DatabaseSync, taxonomyId: string | null | undefined): string {
  if (taxonomyId === null || taxonomyId === undefined) return '';

  const term = db.prepare('SELECT name, singular FROM taxonomy WHERE id = ?')
    .get(taxonomyId) as { name: string; singular: string | null } | undefined;

  return term ? (term.singular ?? term.name) : taxonomyId;
}

/**
 * An agent's display name, or its roster key when the roster no longer holds it.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string|null} name
 * @returns {string}
 */
export function agentLabel(db: DatabaseSync, name: string | null | undefined): string {
  if (name === null || name === undefined) return '';

  const agent = db.prepare('SELECT display_name, role FROM agent WHERE name = ?')
    .get(name) as { display_name: string; role: string } | undefined;

  return agent ? `${agent.display_name} (${agent.role})` : name;
}

/**
 * The ADR detail for a child document, or `undefined` when it has none.
 *
 * Separate from `loadDocument` because it is one kind's structure rather than every kind's: `adr`,
 * `review`, `quick` and `library_document` each carry a detail table whose primary key *is* the
 * document's (AD7) — `detailOf` above reads the flat row for all four, and this adds the ADR's
 * nested options and their tradeoff axes, which no other detail table has.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} documentId
 * @returns {{decision_status: string, decision: string, options: object[]}|undefined}
 */
export function adrDetail(db: DatabaseSync, documentId: string): Row | undefined {
  const detail = db.prepare('SELECT * FROM adr WHERE document_id = ?')
    .get(documentId) as Row | undefined;

  if (!detail) return undefined;

  return {
    ...detail,
    options: collection(db, 'options', documentId).map((option): Row => ({
      ...option,
      tradeoffs: collection(db, 'tradeoffs', option.id),
    })),
  };
}

/** What `loadDocument` hands a template. Derived from the function so the two cannot drift. */
export type DocumentTree = ReturnType<typeof loadDocument>;

/**
 * The signature every projection template has, and the contract `TEMPLATES` is keyed by.
 *
 * `where` is the document's path, or a description of it for a kind with none — it is what a
 * refusal names, so a marker that resolves to nothing says which file it was in.
 */
export type Template = (
  db: DatabaseSync,
  tree: DocumentTree,
  names: Map<string, string>,
  where: string,
) => string;
