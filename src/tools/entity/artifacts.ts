/**
 * `artifact` and the join that replaces CPM's index-plus-backlinks pair.
 *
 * `cpm:artifact` today maintains an index file **and** backlinks written into each source
 * document — the same relationship recorded twice, by hand, with no diagnostic when one side is
 * updated and the other is not. One join table cannot hold a disagreement, because there is only
 * one place for the fact to live. These tools write the row; the index file and the in-document
 * backlinks are both Epic 47-04 projections of it.
 *
 * `artifact_document` gets no update tool, and that is the factory's rule rather than an omission:
 * both its columns are its key, so changing either is deleting one row and creating another.
 */

import type { Context, Tool } from '../convention.ts';

import { entityTools } from '../entity.ts';

/**
 * @param {object} context
 * @returns {object[]}
 */
export function artifactTools(context: Context): Tool[] {
  return [
    ...entityTools(context, {
      table: 'artifact',
      noun: 'a published artifact',
      fields: {
        url: { type: 'string', minLength: 1, description: 'unique; the artifact is the URL' },
        title: { type: 'string', minLength: 1 },
        description: { type: 'string' },
        published_at: { type: 'string', minLength: 1, description: 'ISO 8601' },
        retired_at: {
          type: 'string',
          description: 'ISO 8601; no longer pointed at. Set with a reason. Still readable',
        },
        retired_reason: {
          type: 'string',
          description: 'Superseded, replaced, or gone — the register answers which',
        },
      },
      required: ['url', 'title', 'published_at'],
      body: ['description'],
    }),

    ...entityTools(context, {
      table: 'artifact_document',
      noun: 'the record that an artifact was published from a document',
      key: ['artifact_id', 'document_id'],
      fields: {
        artifact_id: { type: 'string', minLength: 1 },
        document_id: { type: 'string', minLength: 1, description: 'any kind of document' },
      },
    }),
  ];
}
