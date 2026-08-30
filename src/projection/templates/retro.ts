/**
 * The `retro` template (FR10, FR24).
 *
 * `observation` — the parity list's "lesson" — renders here, and also on the epic that recorded it
 * first. That is not duplication to remove: `observation.story_id` is the origin and survives
 * promotion, `retro_id` is the grouping and is set when the retro is written, and the DDL is
 * explicit that an exclusive constraint between them would make gathering an observation destroy
 * where it came from. Both places render the same row because the row genuinely belongs to both.
 *
 * **Retirement is rendered, not filtered.** A retired observation stays readable and stays
 * referenced — that is what `retired_at` means everywhere else in this schema — and the shared
 * Retro Awareness procedure skips it by reading the marker, which it cannot do if the projection
 * has dropped the bullet. Removing it from the file would also make the retirement invisible in
 * the diff that performed it.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { DocumentTree, Row } from '../load.ts';
import type { Ref } from '../markers.ts';

import { resolve } from '../markers.ts';
import { observationsOf } from '../load.ts';
import { bullet, heading, paragraph } from '../text.ts';
import { document, sections } from './common.ts';

/**
 * One observation: its categories, its text, and whatever qualifiers it carries.
 */
function observation(row: Row, ref: Ref) {
  const categories = row.categories.length > 0 ? `${row.categories.join(' · ')} — ` : '';

  return [
    bullet(`${categories}${ref(row.text)}`),
    row.synthesis === null ? null : paragraph(ref(row.synthesis)),
    row.note === null ? null : paragraph(ref(row.note)),
    row.retired_at === null
      ? null
      : `**Retired ${row.retired_at}**: ${ref(row.retired_reason)}`,
  ];
}

/**
 * Render one retro to markdown.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} tree From `loadDocument`.
 * @param {Map<string, string>} identifiers
 * @param {string} where
 * @returns {string}
 */
export function renderRetro(
  db: DatabaseSync, tree: DocumentTree, identifiers: Map<string, string>, where: string,
): string {
  const ref = (text: any) => resolve(text, identifiers, where);
  const observations = observationsOf(db, tree.document.id);

  return document(tree, ref, identifiers, [
    ...sections(tree.sections, ref),

    ...(observations.length > 0 ? [
      heading(2, 'Observations'),
      ...observations.flatMap((row) => observation(row, ref)),
    ] : []),
  ]);
}
