/**
 * Planning-corpus fixtures, built by calling the tool surface.
 *
 * Every function here is a sequence of `create()` calls in dependency order — the same
 * sequence of tool calls a skill would have made. There is no SQL in this file and no
 * database opened; `fixtureDisciplineBypasses()` fails the suite if that ever stops being
 * true.
 *
 * These fixtures build documents; the kind vocabulary they build against is the seeded one
 * from `src/schema/seeds/`, applied by `openPlanningDatabase`. It used to be a working subset
 * declared here, which was right while Story 1 owned no seed — a test bed that keeps its own
 * vocabulary after one exists is asserting against a corpus dpm does not ship.
 */

import { create } from './tool-surface.js';

/**
 * A root-numbered document — a spec, a review, a library document.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} kind
 * @param {object} [attributes] Overrides, including deliberately illegal ones.
 */
export function rootDocument(db, kind, attributes = {}) {
  return create(db, 'document', { kind, numbering: 'root', number: 1, ...attributes });
}

/**
 * A child-numbered document — an epic under a spec, an ADR inside one.
 *
 * `parent_kind` defaults to the parent's actual kind but is overridable, because the
 * criterion about a `parent_kind` that misdescribes its parent needs to set the two
 * independently.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} kind
 * @param {{id: string, kind: string}} parent
 * @param {object} [attributes]
 */
export function childDocument(db, kind, parent, attributes = {}) {
  return create(db, 'document', {
    kind,
    numbering: 'child',
    sequence: 1,
    parent_id: parent.id,
    parent_kind: parent.kind,
    ...attributes,
  });
}

/**
 * A retro, which is root-numbered *and* parented — the combination that makes numbering and
 * lineage separate columns rather than one.
 *
 * `docs/retros/` numbers globally, so a retro is not counted within the epic it reviews; it
 * still hangs off it. `rootDocument` with an explicit parent says both, and the default
 * `number: 1` means a test that wants two retros has to say which is which.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{id: string, kind: string}} parent
 * @param {object} [attributes]
 */
export function retroDocument(db, parent, attributes = {}) {
  return rootDocument(db, 'retro', {
    parent_id: parent.id,
    parent_kind: parent.kind,
    ...attributes,
  });
}

/**
 * A spec with one epic under it — the pairing most of these tests need before they can say
 * anything about a child row.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{spec: object, epic: object}}
 */
export function specWithEpic(db) {
  const spec = rootDocument(db, 'spec', { number: 47, slug: 'substrate' });
  const epic = childDocument(db, 'epic', spec, { slug: 'identity' });

  return { spec, epic };
}

/**
 * A coverage matrix under an epic under a spec — the only two-deep chain the seeded parentage
 * allows, and the one shape that tells the two derivations apart.
 *
 * **The epic's sequence is deliberately not 1.** `identifierOf` takes a child's number from the
 * document immediately below the root — the *epic's* sequence — while `document_child_number`
 * allocates per parent, so every matrix is sequence 1 under its own epic. A chain whose epic is
 * also sequence 1 makes the right derivation and the wrong one agree, and a comparison over it
 * passes whichever the implementation does. With the epic at 3 the matrix is `47-03` derived from
 * its epic and `47-01` derived from itself, so the wrong answer is visible.
 *
 * `specWithEpic` is left alone rather than extended: its epic at sequence 1 is what a dozen other
 * tests already assert against.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{spec: object, epic: object, matrix: object}}
 */
export function matrixUnderEpic(db) {
  const spec = rootDocument(db, 'spec', { number: 47, slug: 'substrate' });
  const epic = childDocument(db, 'epic', spec, { sequence: 3, slug: 'identity' });
  const matrix = childDocument(db, 'coverage_matrix', epic, { sequence: 1, slug: 'identity' });

  return { spec, epic, matrix };
}

/**
 * The two documents that have no human identifier, and the kinds they need to exist at all.
 *
 * **Neither can be built from the seeded vocabulary, which is the finding worth stating.** All
 * fourteen seeded kinds are `root` or `child`, and `document.numbering` is pinned to its kind's by
 * a foreign key — so there is no seeded kind a `numbering = 'none'` row could take. The same
 * pinning rules out a child with no root-numbered ancestor: every child kind's allowed parents
 * are root-numbered, so the chain always terminates at a number. Both cases are legal in the
 * schema and unreachable through the seeds, so the fixture registers two kinds of its own.
 *
 * They exist to be unnameable rather than to be read, so nothing else should come to depend on
 * them: a test that wants an ordinary document wants `rootDocument` or `childDocument`.
 *
 * **`scratch_leaf` is allowed under a spec as well as under `scratch`**, so the one kind has both
 * a nameable and an unnameable row and a single list can hold the two together. Without the second
 * parentage there is no such list anywhere in the schema — every unnameable row would be the only
 * row of its kind — and "a list must not lose rows or raise when one row among them cannot be
 * named" would have nothing to be checked against.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{unnumbered: object, orphan: object}} A `numbering = 'none'` document, and a
 *   child-numbered document whose only ancestor is that one.
 */
export function unnameableDocuments(db) {
  create(db, 'document_kind', { kind: 'scratch', dir: 'scratch', numbering: 'none' });
  create(db, 'document_kind', { kind: 'scratch_leaf', dir: 'scratch', numbering: 'child' });
  create(db, 'document_kind_parent', { kind: 'scratch_leaf', parent_kind: 'scratch' });
  create(db, 'document_kind_parent', { kind: 'scratch_leaf', parent_kind: 'spec' });

  const unnumbered = create(db, 'document', {
    kind: 'scratch',
    numbering: 'none',
    number: null,
    sequence: null,
    slug: 'unnumbered',
    title: 'A document with no number by construction',
  });

  const orphan = childDocument(db, 'scratch_leaf', unnumbered, {
    slug: 'orphan',
    title: 'A child whose chain reaches no root',
  });

  return { unnumbered, orphan };
}

/**
 * A requirement, a story criterion, and the arguments that bind them.
 *
 * `binding()` returns the arguments rather than a row, which is the whole reason this is shared: the
 * key tests make the same call two and three times, and the retirement tests make it once. A
 * fixture that created the row would leave every caller with a differently-shaped one to re-derive.
 *
 * **`requirement.text` contains the fragment by construction.** Integrity register #9 holds that a
 * bound fragment is a substring of its requirement's own text, so a fixture pairing them freely
 * would describe a database no tool produces — and a test asserting one invariant on a corpus that
 * breaks another says nothing about either. The default text is built from the fragment for that
 * reason, and an override should keep the property.
 *
 * Three suites had grown a copy of this: the schema-level retirement tests, the `retire_coverage`
 * tool tests and the natural-key tests, each differing only in the strings. What is not here is
 * `decay.test.js`'s `boundCoverage` or `integration.test.js`'s `planningCorpus` — both create a
 * verified row and return no factory, so folding them in would mean a parameter deciding whether
 * the fixture writes to the table at all.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} [texts]
 * @param {string} [texts.fragment] The bound fragment, verbatim from the requirement.
 * @param {string} [texts.requirement] Must contain `fragment`.
 * @param {string} [texts.criterion]
 */
export function boundCoverage(db, {
  fragment = 'Every binding retires in place',
  requirement: requirementText = `${fragment} and stays readable afterwards.`,
  criterion: criterionText = 'A row survives.',
} = {}) {
  const spec = rootDocument(db, 'spec', { number: 4, slug: 'supersession' });
  const epic = childDocument(db, 'epic', spec, { sequence: 1, slug: 'schema', title: 'Schema' });
  const story = create(db, 'story', { epic_id: epic.id, number: 1 });
  const criterion = create(db, 'story_criterion', { story_id: story.id, text: criterionText });
  const requirement = create(db, 'requirement', { spec_id: spec.id, text: requirementText });

  return {
    spec,
    epic,
    story,
    criterion,
    requirement,
    binding: () => ({
      requirement_id: requirement.id,
      story_criterion_id: criterion.id,
      spec_fragment: fragment,
      position: 0,
    }),
  };
}
