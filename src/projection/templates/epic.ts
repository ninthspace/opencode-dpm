/**
 * The `epic` template (FR10).
 *
 * Four of the parity list's nine projectable non-document types render here and nowhere else:
 * `story`, `task`, `story_criterion`, and the story-scoped half of `observation` — the
 * `**Retro**:` field CPM writes against a story, which is the same row a retro later gathers.
 * That inclusive parentage is the schema's, not this template's: `observation.story_id` survives
 * promotion to a retro, so a story's lesson renders on the epic whether or not a retro has
 * collected it.
 *
 * A story's blocking edges come from `dependency` with `source_story_id` set, which is the other
 * half of the pair `common.js` renders for documents. Both ends of that table are exclusive, so a
 * story edge and a document edge are the same table read two ways rather than two kinds of row.
 *
 * **Which of those edges block is read from `dependency_kind.gates_work`, never from the name of
 * a kind.** This filtered on `kind === 'blocks'` until Epic 47-05 Story 6, which is the same
 * mistake `readiness.js`'s own docblock exists to warn against — and the two disagreed in the way
 * that is hardest to see: a project adding a gating kind under FR24 got a readiness query that
 * held work back and an epic file that rendered `**Blocked by**: —`. Neither is wrong on its own
 * terms, both report success, and the reader believes the file.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { DocumentTree, Row } from '../load.ts';
import type { Ref } from '../markers.ts';

import { resolve } from '../markers.ts';
import { storiesOf } from '../load.ts';
import { bullet, field, heading, paragraph } from '../text.ts';
import { approaches, polarity } from './spec.ts';
import { document, sections } from './common.ts';

/**
 * `Story 3` — a story's human handle, which is its number within its epic and not an id.
 *
 * Stories have no `{{ref:<id>}}` identity of their own: FR28's markers resolve documents, and a
 * story is not one. A dependency naming a story therefore renders the number, which is what a
 * reader of the corpus already looks for.
 */
const storyLabel = (story: Row) => `Story ${story.number}`;

/**
 * The far end of a dependency edge, named so a reader can find it.
 *
 * A story in another epic is qualified with that epic's identifier — `47-03 Story 2` — because
 * `Story 2` alone is ambiguous the moment the edge leaves the epic, and cross-epic story blocking
 * is one of the two directions `010-dependency.sql` says occurs in real epics.
 */
function edgeTarget(db: DatabaseSync, edge: Row, identifiers: Map<string, string>, epicId: string) {
  if (edge.target_document_id !== null) {
    return identifiers.get(edge.target_document_id) ?? edge.target_document_id;
  }

  const target = db.prepare('SELECT number, epic_id FROM story WHERE id = ?')
    .get(edge.target_story_id) as Row | undefined;

  if (!target) return edge.target_story_id;

  const label = `Story ${target.number}`;

  if (target.epic_id === epicId) return label;

  return `${identifiers.get(target.epic_id) ?? target.epic_id} ${label}`;
}

/**
 * The kinds of edge that hold work back, as the vocabulary currently says.
 *
 * Read once per epic rather than per story: it is a three-row table and a per-story query would
 * be the same answer several times over, but the reason it is a query at all is FR24 — a kind
 * added tomorrow gates or does not according to its own column, with nothing here to edit.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Set<string>}
 */
const gatingKinds = (db: DatabaseSync) => new Set(
  (db.prepare('SELECT kind FROM dependency_kind WHERE gates_work = 1').all() as Row[])
    .map((row) => row.kind),
);

/**
 * One story: its metadata, its acceptance criteria, its tasks and its recorded lessons.
 */
function story(
  db: DatabaseSync,
  row: Row,
  ref: Ref,
  identifiers: Map<string, string>,
  epicId: string,
  gating: Set<string>,
) {
  const blockedBy = row.dependencies
    .filter((edge: Row) => gating.has(edge.kind))
    .map((edge: Row) => edgeTarget(db, edge, identifiers, epicId));

  return [
    heading(2, `${storyLabel(row)} — ${ref(row.title)}`),

    [
      field('Status', row.status_note ? `${row.status} — ${ref(row.status_note)}` : row.status),
      field('Blocked by', blockedBy.length > 0 ? blockedBy.join(', ') : '—'),
    ].join('\n'),

    ...(row.criteria.length > 0 ? [
      heading(3, 'Acceptance Criteria'),
      row.criteria.map((criterion: Row) => bullet(
        `${polarity(criterion)}${ref(criterion.text)}${approaches(criterion)}`,
      )).join('\n'),
    ] : []),

    ...row.tasks.flatMap((task: Row) => [
      heading(3, `Task ${task.number} — ${ref(task.title)}`),
      field('Status', task.status_note
        ? `${task.status} — ${ref(task.status_note)}`
        : task.status),
      task.description === null ? null : paragraph(ref(task.description)),
    ]),

    // **Under a heading of their own, and not as a bare `**Retro**:` field.** CPM writes the bare
    // field, and reproducing it here put the story's lesson directly beneath `### Task 1`, where
    // it reads as that task's. The tasks are headed sections in this projection and the corpus's
    // are not, so the shape that works there does not work here — and nothing in dpm reads these
    // files back, so the corpus's spelling is a courtesy rather than a contract.
    ...(row.observations.length > 0 ? [
      heading(3, 'Retro'),
      ...row.observations.flatMap((observation: Row) => [
        bullet(ref(observation.text)),
        observation.note === null ? null : paragraph(ref(observation.note)),
      ]),
    ] : []),
  ];
}

/**
 * Render one epic to markdown.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} tree From `loadDocument`.
 * @param {Map<string, string>} identifiers
 * @param {string} where
 * @returns {string}
 */
export function renderEpic(
  db: DatabaseSync, tree: DocumentTree, identifiers: Map<string, string>, where: string,
): string {
  const ref = (text: any) => resolve(text, identifiers, where);
  const epicId = tree.document.id;
  const gating = gatingKinds(db);

  return document(tree, ref, identifiers, [
    ...sections(tree.sections, ref),
    ...storiesOf(db, epicId).flatMap((row) => story(db, row, ref, identifiers, epicId, gating)),
  ]);
}
