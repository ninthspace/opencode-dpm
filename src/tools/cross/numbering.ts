/**
 * `allocate_number` — a boundary over the allocation statement, and nothing else.
 *
 * The statement is Epic 47-01's (`src/numbering/allocate.js`) and holds FR5 by construction: it
 * is an upsert whose `RETURNING next_value` reads the value after the increment, so the counter
 * never consults the documents and cannot hand back a number it has handed back before. None of
 * that is re-implemented here, and re-implementing it would be the mistake — two statements
 * counting the same sequence is exactly the drift the table exists to remove.
 *
 * **`create_spec` and `create_epic` allocate for themselves**, so this tool is not how
 * those get their numbers. It exists for the kinds that have no create tool yet — `retro`,
 * `adr`, `quick` and the rest arrive in Epic 47-05 — and for a caller that needs a number before
 * it has a row to put it on. Two callers of one statement, which is the arrangement that keeps
 * the guarantee single-sourced.
 *
 * **The criterion this satisfies is about the failure, not the success.** "Allocating a number
 * through its tool returns the value and never a success without one" — so the thing that must
 * not happen is a response shaped like success with no number in it. `allocateNumber` throws when
 * the upsert returns no row; all this tool has to do is not catch it, and return a body that
 * cannot be mistaken for a result when it is empty.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Tool } from '../convention.ts';

import { allocateNumber } from '../../numbering/allocate.ts';
import { defineTool, ToolError } from '../convention.ts';

/**
 * @param {object} context
 * @param {import('node:sqlite').DatabaseSync} context.db
 * @returns {object[]}
 */
export function numberingTools({ db }: { db: DatabaseSync }): Tool[] {
  return [
    defineTool({
      name: 'read_number_sequence',
      table: 'number_sequence',
      description:
        'Read the counter for a kind, or for a kind within one parent. Reports what the next '
        + 'allocation will return without taking it.',
      reads: ['number_sequence'],
      mutates: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', minLength: 1, description: 'A seeded document_kind.kind' },
          parent_id: {
            type: 'string',
            minLength: 1,
            description: 'Omit for a root-numbered kind, whose counter has no parent',
          },
        },
        required: ['kind'],
      },
      // **NFR7's reason for existing, not a convenience.** Story 5's reachability assertion found
      // this table written by `allocate_number` and readable by nothing, which is precisely
      // the shape NFR7 forbids: a counter a caller can move but not inspect leaves "what number
      // will this get?" answerable only by allocating one, and allocation is not reversible.
      //
      // Two partial unique indexes rather than one primary key, so the lookup is written out:
      // `parent_id IS NULL` is the root counter and `= ?` is a child's, and the two are different
      // statements because SQL's `=` never matches NULL.
      handler: (args) => {
        // Nullish, because omitting the parent and naming it as null are the same statement here:
        // this counter has no parent. The two branches are different SQL, not a filter.
        const row = args.parent_id == null
          ? db.prepare('SELECT * FROM number_sequence WHERE kind = ? AND parent_id IS NULL')
            .get(args.kind)
          : db.prepare('SELECT * FROM number_sequence WHERE kind = ? AND parent_id = ?')
            .get(args.kind, args.parent_id);

        if (!row) {
          throw new ToolError(`read_number_sequence: nothing has been allocated for '`
            + `${args.kind}'${args.parent_id ? ` under '${args.parent_id}'` : ''} yet`);
        }

        return row;
      },
    }),

    defineTool({
      name: 'allocate_number',
      table: 'number_sequence',
      description:
        'Allocate the next number for a document kind, within a parent for child-numbered kinds. '
        + 'Numbers are never reused, including after archival.',
      reads: ['number_sequence'],
      // Allocation is a write — the counter moves whether or not a row is ever written against it.
      mutates: true,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', minLength: 1, description: 'A seeded document_kind.kind' },
          parent_id: {
            type: 'string',
            minLength: 1,
            description: 'Omit for a root-numbered kind; required for a child-numbered one',
          },
        },
        required: ['kind'],
      },
      handler: (args) => {
        let allocated;

        try {
          allocated = allocateNumber(db, args.kind, args.parent_id ?? null);
        } catch (error) {
          const { message } = error as Error;

          // `number_sequence.kind` references `document_kind(kind)`, so an unseeded kind fails
          // here rather than needing a check of its own — but the foreign key's message names
          // neither the argument nor the tool, so it is translated the way `crud.ts` translates
          // the rest. A raw constraint error would reach the caller as an internal one.
          if (/constraint/i.test(message)) {
            throw new ToolError(`allocate_number: ${message}`);
          }
          throw error;
        }

        // Belt and braces over `allocateNumber`'s own guard, and deliberately so: this is the
        // one register entry whose failure mode is a *returned nothing* rather than a thrown
        // error, and the tool boundary is where a caller stops being able to see which happened.
        if (typeof allocated !== 'number') {
          throw new Error(
            `allocate_number: allocation for '${args.kind}' produced no number — refusing to `
            + 'report success without one',
          );
        }

        return { kind: args.kind, parent_id: args.parent_id ?? null, number: allocated };
      },
    }),
  ];
}
