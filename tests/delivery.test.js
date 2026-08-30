/**
 * Story 1 — the child rows, the detail tables, milestones and coverage identity.
 *
 * The criteria here are mostly must-NOTs, so every one of them is written with the
 * acceptance it must leave standing. `requirement` rejecting an epic parent is worth nothing
 * on its own; `requirement` accepting a spec parent and rejecting an epic one is the claim.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase as planning } from './support/planning-database.js';
import { create } from './fixtures/index.js';
import { childDocument, retroDocument, rootDocument, specWithEpic } from './fixtures/planning.js';

test('a child row lands only under the kind it belongs to', (t) => {
  const db = planning(t);
  const { spec, epic } = specWithEpic(db);

  assert.ok(create(db, 'story', { epic_id: epic.id }), 'a story under an epic');
  assert.throws(
    () => create(db, 'story', { epic_id: spec.id, number: 2 }),
    /FOREIGN KEY constraint failed/,
    'and not under a spec — epic_kind is CHECK-pinned to epic, so (epic_id, epic_kind) cannot resolve',
  );

  assert.ok(create(db, 'requirement', { spec_id: spec.id }), 'a requirement under a spec');
  assert.throws(
    () => create(db, 'requirement', { spec_id: epic.id, label: 'FR2' }),
    /FOREIGN KEY constraint failed/,
    'and not under an epic',
  );
});

test('a detail row lands only on a document of its own kind', (t) => {
  const db = planning(t);
  const spec = rootDocument(db, 'spec', { number: 47 });
  const library = rootDocument(db, 'library', { number: 1 });

  const detail = create(db, 'library_document', { document_id: library.id });
  assert.equal(detail.document_id, library.id);
  assert.equal(detail.document_kind, 'library', 'the pinned kind is a stored column, not an assumption');

  assert.throws(
    () => create(db, 'library_document', { document_id: spec.id }),
    /FOREIGN KEY constraint failed/,
    'a library detail row cannot attach to a spec',
  );
  assert.throws(
    () => create(db, 'adr', { document_id: spec.id }),
    /FOREIGN KEY constraint failed/,
    'nor an ADR detail row',
  );

  // The primary key is the document's, which is what makes AD7's one-to-one structural.
  assert.throws(
    () => create(db, 'library_document', { document_id: library.id, doc_type: 'domain' }),
    /UNIQUE constraint failed|PRIMARY KEY/,
    'and a document cannot carry two detail rows',
  );
});

test('two specs may each hold an M1; one spec may not hold two', (t) => {
  const db = planning(t);
  const specA = rootDocument(db, 'spec', { number: 47 });
  const specB = rootDocument(db, 'spec', { number: 48 });

  create(db, 'milestone', { spec_id: specA.id, label: 'M1', position: 1 });
  assert.ok(
    create(db, 'milestone', { spec_id: specB.id, label: 'M1', position: 1 }),
    'milestones are one specification\'s build order, so M1 means different things in two specs',
  );

  assert.throws(
    () => create(db, 'milestone', { spec_id: specA.id, label: 'M1', position: 2 }),
    /UNIQUE constraint failed: milestone\.spec_id, milestone\.label/,
  );
  assert.throws(
    () => create(db, 'milestone', { spec_id: specA.id, label: 'M2', position: 1 }),
    /UNIQUE constraint failed: milestone\.spec_id, milestone\.position/,
    'and the order stays total within each spec',
  );
});

test('an epic delivers two milestones without being filed under one', (t) => {
  const db = planning(t);
  const { spec, epic } = specWithEpic(db);

  const m2 = create(db, 'milestone', { spec_id: spec.id, label: 'M2', title: 'Tools', position: 2 });
  const m4 = create(db, 'milestone', { spec_id: spec.id, label: 'M4', title: 'Merge', position: 4 });

  create(db, 'document_milestone', { document_id: epic.id, milestone_id: m2.id });
  create(db, 'document_milestone', { document_id: epic.id, milestone_id: m4.id });

  assert.equal(
    db.prepare('SELECT count(*) AS n FROM document_milestone WHERE document_id = ?').get(epic.id).n,
    2,
  );

  // The must-NOT is about the shape, not about a rejected write: a `milestone_id` column on
  // `document` would force the choice, and nothing afterwards could tell "delivers M2" from
  // "delivers M2 and M4 but was filed under M2".
  assert.ok(
    !db.prepare('PRAGMA table_info(document)').all().some((c) => c.name === 'milestone_id'),
    'document carries no milestone column for that choice to be made in',
  );
});

test('an observation is promoted only to a library document', (t) => {
  const db = planning(t);
  const { spec, epic } = specWithEpic(db);
  const retro = retroDocument(db, epic);
  const library = rootDocument(db, 'library', { number: 1 });

  // Positions are distinct throughout. Sharing one lets `observation_retro_position` reject
  // the row before the kind pin is ever consulted — a rejection that reads correct and tests
  // nothing, which is how this criterion first appeared to pass.
  assert.ok(
    create(db, 'observation', {
      retro_id: retro.id, retro_kind: 'retro', position: 1,
      library_doc_id: library.id, library_doc_kind: 'library',
    }),
    'promotion to a library document is recorded',
  );

  assert.throws(
    () => create(db, 'observation', {
      retro_id: retro.id, retro_kind: 'retro', position: 2,
      library_doc_id: spec.id, library_doc_kind: 'library',
    }),
    /FOREIGN KEY constraint failed/,
    'a spec declared as library fails against document(id, kind)',
  );

  assert.throws(
    () => create(db, 'observation', {
      retro_id: retro.id, retro_kind: 'retro', position: 3,
      library_doc_id: spec.id, library_doc_kind: 'spec',
    }),
    /CHECK constraint failed: library_doc_kind = 'library'/,
    'and declaring the true kind fails the CHECK instead — neither route reaches a stored row',
  );
});

test('an observation gathered into a retro keeps the story it came from', (t) => {
  const db = planning(t);
  const { epic } = specWithEpic(db);
  const retro = retroDocument(db, epic);
  const story = create(db, 'story', { epic_id: epic.id });

  assert.ok(create(db, 'observation', { story_id: story.id, position: 1 }), 'written against a story');
  assert.ok(
    create(db, 'observation', { story_id: story.id, retro_id: retro.id, retro_kind: 'retro', position: 2 }),
    'and still naming that story once gathered — an exclusive CHECK would make gathering erase the origin',
  );
  assert.throws(
    () => create(db, 'observation', { position: 3 }),
    /CHECK constraint failed/,
    'while an observation belonging to neither has no origin to record',
  );
});

test('coverage identity is the fragment, and position is no part of it', (t) => {
  const db = planning(t);
  const { spec, epic } = specWithEpic(db);
  const requirement = create(db, 'requirement', { spec_id: spec.id, text: 'FR4 text' });
  const story = create(db, 'story', { epic_id: epic.id });
  const criterion = create(db, 'story_criterion', { story_id: story.id });

  const bind = (spec_fragment, position) =>
    create(db, 'coverage', {
      requirement_id: requirement.id,
      spec_fragment,
      story_criterion_id: criterion.id,
      position,
    });

  bind('the first obligation', 1);

  assert.throws(
    () => bind('the first obligation', 2),
    /UNIQUE constraint failed: coverage\.requirement_id, coverage\.spec_fragment, coverage\.story_criterion_id/,
    'the same fragment against the same criterion is one binding, at whatever position',
  );

  assert.ok(bind('the second obligation', 2), 'a different fragment is a different row');
  assert.ok(
    bind('the third obligation', 2),
    'even at a position already taken — display order is not identity, and keying on it ' +
      'would reject this row while admitting the duplicate above',
  );

  assert.equal(db.prepare('SELECT count(*) AS n FROM coverage').get().n, 3);
});

test('verified_at and binding_hash are set together or not at all', (t) => {
  const db = planning(t);
  const { spec, epic } = specWithEpic(db);
  const requirement = create(db, 'requirement', { spec_id: spec.id });
  const story = create(db, 'story', { epic_id: epic.id });
  const criterion = create(db, 'story_criterion', { story_id: story.id });

  const row = {
    requirement_id: requirement.id,
    spec_fragment: 'a fragment',
    story_criterion_id: criterion.id,
  };

  assert.throws(
    () => create(db, 'coverage', { ...row, verified_at: '2026-08-08T00:00:00Z' }),
    /CHECK constraint failed/,
    'a ✓ with no record of what was verified is the false pass the column pair exists to prevent',
  );
  assert.ok(create(db, 'coverage', { ...row, verified_at: '2026-08-08T00:00:00Z', binding_hash: 'h' }));
});
