/**
 * `milestone` and `document_milestone` — FR27's tool half, and register entry #12.
 *
 * A milestone is one specification's build order, so two specs may both have an `M1` meaning
 * different things; `UNIQUE (spec_id, label)` permits that and `UNIQUE (spec_id, position)` keeps
 * the order total within each. The join is a table and not a column on `document` because an epic
 * really does span two — this spec's own breakdown has one delivering part of M2 and part of M4,
 * and a `milestone_id` column would force that epic into one of them unrecoverably.
 *
 * **Register entry #12 is enforced here because no foreign key can express it.** A document under
 * spec A joined to a milestone of spec B satisfies both references and is nonsense: the join says
 * "this artefact delivers that milestone" and the two belong to different builds. Establishing
 * that they share a spec means walking `document.parent_id` to the root, which is not row-local
 * and so is not a `CHECK`. The walk is `ancestryOf`, reused rather than rewritten — a second
 * implementation of "which spec does this belong to" is a second answer, and the projection's
 * filenames and this refusal have to agree about it.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Row } from '../../projection/naming.ts';
import type { Context, Tool } from '../convention.ts';

import { ancestryOf, ProjectionError } from '../../projection/naming.ts';
import { ToolError } from '../convention.ts';
import { entityTools } from '../entity.ts';
import { readById } from '../crud.ts';

/**
 * The root-most document above this one — itself, when it has no parent.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} id
 * @param {string} where
 * @returns {object}
 */
function rootOf(db: DatabaseSync, id: string, where: string): Row {
  const rows = db
    .prepare('SELECT id, kind, numbering, number, sequence, parent_id FROM document')
    .all() as Row[];
  // Annotated rather than inferred: a `map` producing pairs gives back an array of arrays, and the
  // `Map` built from one is keyed `unknown` unless the constructor is told what it is being handed.
  const byId = new Map<string, Row>(rows.map((row) => [row.id, row]));
  const document = byId.get(id);

  if (!document) throw new ToolError(`${where}: no document with id '${id}'`);

  try {
    const chain = ancestryOf(byId, document);

    return chain.length > 0 ? chain[chain.length - 1] : document;
  } catch (error) {
    // A parentage cycle makes the question unanswerable rather than answered wrongly. Reported as
    // a refusal, since the caller's edge is not what is broken and the integrity register is where
    // the cycle itself is reported.
    if (error instanceof ProjectionError) throw new ToolError(`${where}: ${error.message}`);
    throw error;
  }
}

/**
 * @param {object} context
 * @param {import('node:sqlite').DatabaseSync} context.db
 * @returns {object[]}
 */
export function milestoneTools(context: Context): Tool[] {
  const { db } = context;

  return [
    ...entityTools(context, {
      table: 'milestone',
      noun: "one milestone of a specification's build order",
      fields: {
        spec_id: { type: 'string', minLength: 1 },
        label: { type: 'string', minLength: 1, description: "'M1' — unique within the spec, not globally" },
        title: { type: 'string', minLength: 1, description: "'Substrate'" },
        summary: { type: 'string' },
        position: { type: 'integer', minimum: 0 },
      },
      required: ['spec_id', 'label', 'title', 'position'],
      mutable: ['label', 'title', 'summary', 'position'],
      body: ['summary'],
    }),

    ...entityTools(context, {
      table: 'document_milestone',
      noun: 'the record that a document delivers a milestone',
      key: ['document_id', 'milestone_id'],
      fields: {
        document_id: { type: 'string', minLength: 1, description: 'any kind of document' },
        milestone_id: { type: 'string', minLength: 1 },
      },
      guard: (row, where) => {
        const milestone = readById(db, 'milestone', row.milestone_id, where);
        const root = rootOf(db, row.document_id, where);

        if (root.id !== milestone.spec_id) {
          throw new ToolError(
            `${where}: milestone '${milestone.label}' belongs to spec '${milestone.spec_id}' and `
            + `document '${row.document_id}' sits under '${root.id}' — a document may only `
            + 'deliver a milestone of its own spec (integrity register entry 12)',
          );
        }
      },
    }),
  ];
}
