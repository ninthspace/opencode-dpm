/**
 * The `quick` template (FR10, AD7).
 *
 * `quick_criterion.met` is a tri-state and renders as one: `✓`, `✗`, or blank while the record is
 * open. A two-state rendering would have to choose which of "not met" and "not yet decided" to
 * show as unticked, and both readings are wrong — which is the DDL's reason for the nullable
 * INTEGER rather than a status word in the first place.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { DocumentTree } from '../load.ts';

import { resolve } from '../markers.ts';
import { collection, detailOf } from '../load.ts';
import { field, heading, table } from '../text.ts';
import { document, sections } from './common.ts';

/** `✓` met, `✗` not met, blank while open. */
const met = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '';

  return value === 0 ? '✗' : '✓';
};

/**
 * Render one quick record to markdown.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} tree From `loadDocument`.
 * @param {Map<string, string>} identifiers
 * @param {string} where
 * @returns {string}
 */
export function renderQuick(
  db: DatabaseSync, tree: DocumentTree, identifiers: Map<string, string>, where: string,
): string {
  const ref = (text: any) => resolve(text, identifiers, where);
  const detail = detailOf(db, 'quick', tree.document.id);
  const criteria = collection(db, 'quickCriteria', tree.document.id);

  return document(tree, ref, identifiers, [
    detail && detail.closed_at !== null ? field('Closed', detail.closed_at) : null,

    ...sections(tree.sections, ref),

    ...(criteria.length > 0 ? [
      heading(2, 'Acceptance Criteria'),
      table(['Met', 'Criterion', 'Note'], criteria.map((criterion) => [
        met(criterion.met),
        ref(criterion.text),
        ref(criterion.note ?? ''),
      ])),
    ] : []),
  ]);
}
