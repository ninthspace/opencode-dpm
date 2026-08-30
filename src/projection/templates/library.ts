/**
 * The `library` template (FR10, AD7).
 *
 * `library_scope` is the one field in this schema that a *skill* reads rather than a human: every
 * Library Check filters documents by scope before deciding what to load. The DDL's comment says
 * being queryable is the entire feature — so the projection's job here is to make the stored value
 * visible to a reader, not to become the thing that is parsed. Nothing reads this file back; the
 * scopes rendered below are a report of rows, and the rows are what the check queries.
 *
 * Scopes render in the order `COLLECTIONS.libraryScopes` declares, which is `scope` — half the
 * table's composite primary key, so the ordering is already total.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { DocumentTree } from '../load.ts';

import { resolve } from '../markers.ts';
import { collection, detailOf } from '../load.ts';
import { field } from '../text.ts';
import { document, sections } from './common.ts';

/**
 * Render one library document to markdown.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} tree From `loadDocument`.
 * @param {Map<string, string>} identifiers
 * @param {string} where
 * @returns {string}
 */
export function renderLibrary(
  db: DatabaseSync, tree: DocumentTree, identifiers: Map<string, string>, where: string,
): string {
  const ref = (text: any) => resolve(text, identifiers, where);
  const detail = detailOf(db, 'library', tree.document.id);
  const scopes = collection(db, 'libraryScopes', tree.document.id);

  return document(tree, ref, identifiers, [
    [
      detail ? field('Type', detail.doc_type) : null,

      // Rendered only when there is one, because the NULL is the answer for a document written
      // here rather than a value missing from one imported. A rendered `**Source**: —` invites the
      // reader to fill it in, which is the prose field the column exists to replace.
      detail?.source ? field('Source', detail.source) : null,

      scopes.length === 0
        ? null
        : field('Scope', scopes.map(({ scope }) => scope).join(', ')),
    ].filter(Boolean).join('\n'),

    ...sections(tree.sections, ref),
  ]);
}
