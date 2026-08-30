/**
 * The `spec` template — the renderer's worked example (FR6, FR10).
 *
 * It carries the widest set of shapes the machinery has: a repeated collection, a nested one, a
 * grouping, a child document with no file of its own, and prose carrying markers. Three of the
 * parity list's non-document types render here and nowhere else — `requirement`, its
 * `acceptance_criterion` children, and `milestone`.
 *
 * **Every prose column goes through `resolve`.** Not `document_section.body` alone: the reference
 * model the spec rejected was exactly the one that reached sections only, because a retro
 * observation citing a spec lives in `observation.text` and a requirement naming another
 * requirement lives in `requirement.text`. A template that resolved one column and not the next
 * would ship `{{ref:01J…}}` to a reader from whichever one it forgot.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { DocumentTree, Row } from '../load.ts';
import type { Ref } from '../markers.ts';

import { resolve } from '../markers.ts';
import { bullet, heading, paragraph, table } from '../text.ts';
import { adrSection } from './adr.ts';
import { document, sections } from './common.ts';

/**
 * `class` values in the order they render, with the heading each gets.
 *
 * A declared order and not `sorted()`, because the reading order of a requirements section is not
 * alphabetical — functional first is how every spec in the corpus reads. Declaring it here also
 * means a `class` value added to the DDL renders nowhere until someone decides where it goes,
 * which is louder than appending it to the end.
 */
const CLASSES = [
  ['functional', 'Functional Requirements'],
  ['non_functional', 'Non-Functional Requirements'],
  ['environmental_requirement', 'Environmental Requirements'],
  ['environmental_restriction', 'Environmental Restrictions'],
];

/** `FR1 (must)` / `FR1` — the band is a column, so it renders only when one was set. */
const label = (requirement: Row) =>
  (requirement.moscow ? `${requirement.label} (${requirement.moscow})` : requirement.label);

/** ` [unit] [integration]` — the criterion's declared test approaches, or nothing. */
export const approaches = (row: Row) =>
  (row.approaches.length > 0
    ? ` ${row.approaches.map((tag: string) => `\`[${tag}]\``).join(' ')}`
    : '');

/**
 * `must NOT — …` / `control — …` — the polarity prefix the corpus writes.
 *
 * A column here and a prefix in the projection, which is the direction that works: the DDL's own
 * comment records that `polarity` used to be carried *only* by that prefix, recognised by string
 * matching in the one artefact whose purpose is deciding whether the work is done.
 */
export const polarity = (row: Row) => {
  if (row.polarity === 'must_not') return 'must NOT — ';

  return row.polarity === 'control' ? 'control — ' : '';
};

/**
 * One requirement and its acceptance criteria.
 *
 * `exclusion` is rendered rather than filtered on. A deferred requirement is part of the spec's
 * record — it says what was considered and set aside — and dropping it from the projection would
 * make the markdown a smaller document than the database, which is the fidelity criterion's
 * failure in the direction nobody checks.
 */
function requirement(row: Row, ref: Ref) {
  const criteria = row.criteria.map((criterion: Row) => bullet(
    `${polarity(criterion)}${ref(criterion.text)}${approaches(criterion)}`,
  ));

  return [
    heading(3, `${label(row)}${row.exclusion ? ` — ${row.exclusion}` : ''}`),
    paragraph(ref(row.text)),
    ...(criteria.length > 0 ? [criteria.join('\n')] : []),
  ];
}

/**
 * Render one spec to markdown.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} tree From `loadDocument`.
 * @param {Map<string, string>} identifiers From `naming.js`.
 * @param {string} where The path being written, so a marker failure names the file.
 * @returns {string}
 */
export function renderSpec(
  db: DatabaseSync, tree: DocumentTree, identifiers: Map<string, string>, where: string,
): string {
  const { requirements, milestones } = tree;
  const ref = (text: any) => resolve(text, identifiers, where);

  return document(tree, ref, identifiers, [
    ...sections(tree.sections, ref),

    ...(milestones.length > 0 ? [
      heading(2, 'Milestones'),
      table(['Milestone', 'Title', 'Summary'],
        milestones.map((milestone) => [
          milestone.label, ref(milestone.title), ref(milestone.summary ?? ''),
        ])),
    ] : []),

    // Grouped by class, and the group heading is emitted only when the group has members — an
    // empty "Environmental Restrictions" heading is a section that says nothing and whose
    // presence depends on which rows happen to exist, which is diff noise on every commit.
    ...CLASSES.flatMap(([className, title]) => {
      const group = requirements.filter((row) => row.class === className);

      if (group.length === 0) return [];

      return [heading(2, title), ...group.flatMap((row) => requirement(row, ref))];
    }),

    ...adrSection(db, tree, ref),
  ]);
}
