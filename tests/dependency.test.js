/**
 * Story 4 — edges, and the query that makes them worth having.
 *
 * Blocking as a `status` value can say that work is blocked. It cannot say by what, cannot be
 * traversed to find what is ready, and cannot be invalidated when the blocker finishes. Each
 * of those is a test below, and each would be unwritable against the column.
 *
 * The uniqueness tests are the ones with a trap in them: three of `dependency`'s four end
 * columns are NULL in every row, and a plain `UNIQUE` over columns that are usually NULL
 * constrains nothing whatsoever — so a test that stores an edge twice and sees it rejected
 * has to be sure it was rejected by the index and not by something else.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase as planning } from './support/planning-database.js';
import { retire } from './support/vocabulary.js';
import { blockedBy, readyDocuments } from '../src/dependency/readiness.ts';
import { create } from './fixtures/index.js';
import { childDocument, rootDocument } from './fixtures/planning.js';

/**
 * A spec with `count` epics under it, numbered in order and **individually titled**.
 *
 * The titles matter: the document creator defaults every row to `'Title'`, so a first draft
 * of these tests compared readiness results by title and matched the wrong rows — an
 * `includes(blocked.title)` was true whichever epics came back, and two of the three failures
 * that flushed it out looked like readiness bugs rather than test bugs. Assertions here key on
 * `id`, which is unique by construction; the titles are for the failure message.
 */
function specWithEpics(db, count, attributes = {}) {
  const spec = rootDocument(db, 'spec', { number: 47, slug: 'substrate', ...attributes });
  const epics = Array.from({ length: count }, (unused, index) =>
    childDocument(db, 'epic', spec, {
      sequence: index + 1,
      slug: `epic-${index + 1}`,
      title: `Epic ${index + 1}`,
    }));

  return { spec, epics };
}

const complete = (db, document) =>
  db.prepare("UPDATE document SET status = 'complete' WHERE id = ?").run(document.id);

const ids = (rows) => rows.map((row) => row.id);

test('one table carries a story-to-story edge and a spec-to-spec edge alike', (t) => {
  const db = planning(t);
  const { spec, epics } = specWithEpics(db, 1);
  const other = rootDocument(db, 'spec', { number: 48, slug: 'successor' });
  const first = create(db, 'story', { epic_id: epics[0].id, number: 1 });
  const second = create(db, 'story', { epic_id: epics[0].id, number: 2, position: 2 });

  const storyEdge = create(db, 'dependency', {
    kind: 'blocks', source_story_id: first.id, target_story_id: second.id,
  });
  const specEdge = create(db, 'dependency', {
    kind: 'builds_on', source_document_id: spec.id, target_document_id: other.id,
  });

  assert.deepEqual(
    { ...db.prepare('SELECT kind, source_story_id, target_story_id FROM dependency WHERE id = ?').get(storyEdge.id) },
    { kind: 'blocks', source_story_id: first.id, target_story_id: second.id },
    'a story-to-story blocks edge round-trips',
  );
  assert.deepEqual(
    { ...db.prepare('SELECT kind, source_document_id, target_document_id FROM dependency WHERE id = ?').get(specEdge.id) },
    { kind: 'builds_on', source_document_id: spec.id, target_document_id: other.id },
    'and a spec-to-spec builds_on edge, through the same four columns',
  );
});

test('an end is a document or a story, never both and never neither', (t) => {
  const db = planning(t);
  const { spec, epics } = specWithEpics(db, 1);
  const story = create(db, 'story', { epic_id: epics[0].id });

  assert.throws(
    () => create(db, 'dependency', {
      source_document_id: spec.id, source_story_id: story.id, target_document_id: epics[0].id,
    }),
    /CHECK constraint failed/,
    'both at one end would make every downstream query decide what that meant',
  );
  assert.throws(
    () => create(db, 'dependency', { source_document_id: spec.id }),
    /CHECK constraint failed/,
    'and neither at the other end is an edge with one end',
  );
});

test('nothing depends on itself, at either level', (t) => {
  const db = planning(t);
  const { epics } = specWithEpics(db, 1);
  const story = create(db, 'story', { epic_id: epics[0].id });

  assert.throws(
    () => create(db, 'dependency', { source_document_id: epics[0].id, target_document_id: epics[0].id }),
    /CHECK constraint failed/,
    'a document blocking itself',
  );
  assert.throws(
    () => create(db, 'dependency', { source_story_id: story.id, target_story_id: story.id }),
    /CHECK constraint failed/,
    'and a story blocking itself — two CHECKs, because the pair of columns differs',
  );
});

test('the same edge cannot be stored twice, whichever ends it uses', (t) => {
  const db = planning(t);
  const { spec, epics } = specWithEpics(db, 2);
  const other = rootDocument(db, 'spec', { number: 48, slug: 'successor' });
  const a = create(db, 'story', { epic_id: epics[0].id, number: 1 });
  const b = create(db, 'story', { epic_id: epics[0].id, number: 2, position: 2 });

  // Document ends: two of the four columns NULL.
  create(db, 'dependency', { source_document_id: epics[0].id, target_document_id: epics[1].id });
  assert.throws(
    () => create(db, 'dependency', { source_document_id: epics[0].id, target_document_id: epics[1].id }),
    /UNIQUE constraint failed: index 'dependency_edge'/,
    'the coalesce index is what rejects it — a plain UNIQUE over these columns would not',
  );

  // Story ends: the *other* two NULL, which is the combination a partial index on the
  // document columns would have missed entirely.
  create(db, 'dependency', { source_story_id: a.id, target_story_id: b.id });
  assert.throws(
    () => create(db, 'dependency', { source_story_id: a.id, target_story_id: b.id }),
    /UNIQUE constraint failed: index 'dependency_edge'/,
    'and the same for two story ends',
  );

  // Mixed ends: one document, one story — one NULL on each side.
  create(db, 'dependency', { source_document_id: epics[0].id, target_story_id: b.id });
  assert.throws(
    () => create(db, 'dependency', { source_document_id: epics[0].id, target_story_id: b.id }),
    /UNIQUE constraint failed: index 'dependency_edge'/,
    'and for a mixed edge, which is the case with a NULL in each pair',
  );

  // The controls. Uniqueness that rejected everything would satisfy all three above.
  assert.ok(
    create(db, 'dependency', { kind: 'builds_on', source_document_id: epics[0].id, target_document_id: epics[1].id }),
    'the same two ends under a different kind is a different edge',
  );
  assert.ok(
    create(db, 'dependency', { source_document_id: epics[1].id, target_document_id: epics[0].id }),
    'and so is the same kind reversed — edges are directional',
  );
  assert.ok(
    create(db, 'dependency', { kind: 'builds_on', source_document_id: spec.id, target_document_id: other.id }),
    'while an unrelated edge is unaffected',
  );
});

test('a blocks edge gates readiness and a builds_on edge does not', (t) => {
  const db = planning(t);
  const { spec, epics } = specWithEpics(db, 3);
  const [substrate, tools, search] = epics;
  const other = rootDocument(db, 'spec', { number: 48, slug: 'successor' });

  create(db, 'dependency', { kind: 'blocks', source_document_id: substrate.id, target_document_id: tools.id });
  create(db, 'dependency', { kind: 'builds_on', source_document_id: substrate.id, target_document_id: search.id });
  create(db, 'dependency', { kind: 'builds_on', source_document_id: spec.id, target_document_id: other.id });

  assert.deepEqual(
    ids(readyDocuments(db)),
    [substrate.id, search.id],
    'the epic behind a blocks edge is held; the one behind a builds_on edge is not',
  );

  // Same two edges, same shape, one flag apart — which is the claim `gates_work` makes.
  assert.deepEqual(
    blockedBy(db, tools.id).map((row) => row.blocker_id),
    [substrate.id],
    'and the query can say what is holding it, which a status column could not',
  );
  assert.deepEqual(blockedBy(db, search.id), [], 'while lineage holds nothing up');
});

/**
 * The test above passes against an implementation that reads `WHERE kind = 'blocks'`, because
 * `blocks` is the only seeded kind with the flag set — a mutation proved it, surviving the
 * whole suite. So gating is asserted here by moving the *flag* and leaving the kinds alone,
 * which is the only way the two implementations differ. A project that adds a fifth edge kind
 * and marks it gating is this test's real subject.
 */
test('readiness follows the flag, not the kind name', (t) => {
  const db = planning(t);
  const { epics } = specWithEpics(db, 3);
  const [blocker, viaBlocks, viaBuildsOn] = epics;

  create(db, 'dependency', { kind: 'blocks', source_document_id: blocker.id, target_document_id: viaBlocks.id });
  create(db, 'dependency', { kind: 'builds_on', source_document_id: blocker.id, target_document_id: viaBuildsOn.id });

  const setFlag = (kind, value) =>
    db.prepare('UPDATE dependency_kind SET gates_work = ? WHERE kind = ?').run(value, kind);

  setFlag('builds_on', 1);
  assert.deepEqual(
    ids(readyDocuments(db)),
    [blocker.id],
    'a builds_on edge gates once its kind row says it does — the edge did not change, the flag did',
  );
  assert.deepEqual(
    blockedBy(db, viaBuildsOn.id).map((row) => row.blocker_id),
    [blocker.id],
    'and the same flag decides what the "why not" query reports',
  );

  setFlag('blocks', 0);
  setFlag('builds_on', 0);
  assert.deepEqual(
    ids(readyDocuments(db)),
    [blocker.id, viaBlocks.id, viaBuildsOn.id],
    'and clearing the flag on blocks releases its edge, which a hardcoded kind name could not do',
  );
  assert.deepEqual(blockedBy(db, viaBlocks.id), [], 'nothing gating means nothing to report');
});

test('an epic blocked by two epics needs both of them, and reports both', (t) => {
  const db = planning(t);
  const { epics } = specWithEpics(db, 3);
  const [first, second, blocked] = epics;

  create(db, 'dependency', { source_document_id: first.id, target_document_id: blocked.id });
  create(db, 'dependency', { source_document_id: second.id, target_document_id: blocked.id });

  assert.equal(
    db.prepare('SELECT count(*) AS n FROM dependency WHERE target_document_id = ?').get(blocked.id).n,
    2,
    'two blockers are two rows, not one field that had to choose',
  );
  assert.deepEqual(blockedBy(db, blocked.id).map((row) => row.blocker_id), [first.id, second.id]);
  assert.ok(!ids(readyDocuments(db)).includes(blocked.id), 'and it is not ready');

  complete(db, first);
  assert.deepEqual(
    blockedBy(db, blocked.id).map((row) => row.blocker_id),
    [second.id],
    'completing one blocker leaves the other — the edge is invalidated by the blocker, not by hand',
  );
  assert.ok(!ids(readyDocuments(db)).includes(blocked.id), 'so it is still not ready');

  complete(db, second);
  assert.deepEqual(blockedBy(db, blocked.id), []);
  assert.deepEqual(ids(readyDocuments(db)), [blocked.id], 'and now it is the only one left');
});

test('a builds_on cycle is accepted, because no readiness query traverses it', (t) => {
  const db = planning(t);
  const first = rootDocument(db, 'spec', { number: 47, slug: 'first' });
  const second = rootDocument(db, 'spec', { number: 48, slug: 'second' });

  create(db, 'dependency', { kind: 'builds_on', source_document_id: first.id, target_document_id: second.id });
  assert.ok(
    create(db, 'dependency', { kind: 'builds_on', source_document_id: second.id, target_document_id: first.id }),
    'meaningless but harmless — nothing waits on lineage',
  );

  assert.deepEqual(
    ids(readyDocuments(db, { kind: 'spec' })),
    [first.id, second.id],
    'both specs remain ready, which is what "no query traverses it" means in practice',
  );

  // The same two rows over a gating kind are equally legal, and that is the gap the schema
  // cannot close: readiness over them returns nothing, which reads exactly like all done.
  const { epics } = specWithEpics(db, 2, { number: 49, slug: 'cyclic' });
  create(db, 'dependency', { kind: 'blocks', source_document_id: epics[0].id, target_document_id: epics[1].id });
  create(db, 'dependency', { kind: 'blocks', source_document_id: epics[1].id, target_document_id: epics[0].id });

  assert.deepEqual(
    readyDocuments(db),
    [],
    'a gates_work cycle silently empties the result — closed by the link tool and FR14, not here',
  );
});

test('an epic delivering two milestones is found under either and reports both', (t) => {
  const db = planning(t);
  const { spec, epics } = specWithEpics(db, 2);
  const [spanning, single] = epics;

  const milestones = ['Substrate', 'Tools', 'Search'].map((title, index) =>
    create(db, 'milestone', {
      spec_id: spec.id, label: `M${index + 1}`, title, position: index + 1,
    }));

  create(db, 'document_milestone', { document_id: spanning.id, milestone_id: milestones[1].id });
  create(db, 'document_milestone', { document_id: spanning.id, milestone_id: milestones[2].id });
  create(db, 'document_milestone', { document_id: single.id, milestone_id: milestones[1].id });

  const underM2 = readyDocuments(db, { milestone: 'M2' });
  const underM3 = readyDocuments(db, { milestone: 'M3' });

  assert.deepEqual(ids(underM2), [spanning.id, single.id], 'both epics are in M2');
  assert.deepEqual(ids(underM3), [spanning.id], 'and only one is in M3');

  const reported = (rows, document) => rows.find((row) => row.id === document.id).milestones.map((m) => m.label);
  assert.deepEqual(
    reported(underM3, spanning),
    ['M2', 'M3'],
    'found under M3 and still reporting M2 — a result carrying one milestone would re-impose the column FR27 removed',
  );
  assert.deepEqual(reported(underM2, single), ['M2'], 'while an epic in one reports one');
});

test('a retired edge kind still gates the work its edges were already holding', (t) => {
  const db = planning(t);
  const { epics } = specWithEpics(db, 2);

  create(db, 'dependency', { source_document_id: epics[0].id, target_document_id: epics[1].id });
  retire(db, 'dependency_kind', 'blocks');

  assert.deepEqual(
    ids(readyDocuments(db)),
    [epics[0].id],
    'retirement stops new edges arriving; it does not release work an existing edge holds',
  );
  assert.throws(
    () => create(db, 'dependency', { source_document_id: epics[1].id, target_document_id: epics[0].id }),
    /retired: dependency\.kind references a retired dependency_kind row/,
    'and the guard covering it was generated when Task 4.1 created the table, with no new code',
  );
});
