/**
 * The five kinds whose whole structure is narrative sections (FR10).
 *
 * `problem_brief`, `product_brief`, `discussion`, `runbook` and `communication` have no detail
 * table and no child table of their own. AD7's rule is that structure earns a table by being
 * queried, and nothing queries a brief's sections by anything but their order — so
 * `document_section` is the entire shape, and a template that invented headings for them would be
 * projecting a structure the database does not hold. A `communication` is the clearest case: it is
 * a title, an audience and prose, and modelling the audience as anything but a section would be
 * inventing structure the artefact does not have.
 *
 * **Five registry entries, one function, and that is not the fallback FR10 forbids.** The must-NOT
 * is about reachability: a kind with no entry must fail, not land somewhere generic. Each of these
 * five names this function explicitly, so a fifteenth kind seeded tomorrow reaches nothing. What
 * makes the difference checkable rather than a claim is that the registry is enumerated against
 * `document_kind` — an unlisted kind has no entry to share.
 *
 * Three of the five may parent an ADR; `runbook` and `communication` may not. `adrSection` is
 * called for all five anyway, because it renders what `children` holds and the parentage
 * allow-list is what decides whether that is ever non-empty. A template asking a second time would
 * be a second place for the two to disagree.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { DocumentTree } from '../load.ts';

import { resolve } from '../markers.ts';
import { adrSection } from './adr.ts';
import { document, sections } from './common.ts';

/**
 * Render a section-only document to markdown.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} tree From `loadDocument`.
 * @param {Map<string, string>} identifiers
 * @param {string} where
 * @returns {string}
 */
export function renderProse(
  db: DatabaseSync, tree: DocumentTree, identifiers: Map<string, string>, where: string,
): string {
  const ref = (text: any) => resolve(text, identifiers, where);

  return document(tree, ref, identifiers, [
    ...sections(tree.sections, ref),
    ...adrSection(db, tree, ref),
  ]);
}
