/**
 * `read_document_kind` and `preview_document_kind` — the two questions `/dpm:templates` asks (FR6).
 *
 * **Why a preview needs a tool at all.** A skill reaches the database through tools and through
 * nothing else, so "what does an epic look like?" has no route unless something renders one. The
 * alternative a skill would reach for is to describe the format in its own prose, and that is a
 * second copy of the format — right on the day it is written and silently wrong after the next
 * template change, with no diagnostic. It is the defect FR1 opens the spec with, one directory
 * over.
 *
 * **So the preview renders, and renders through `TEMPLATES`.** The bytes come from the same
 * function the projection calls for a real document. No skeleton is stored anywhere as text, which
 * is what makes "a template and its preview cannot drift" a property rather than a promise.
 *
 * **The example is built in a scratch database, not in the caller's.** `start(':memory:')` runs the
 * migrations and the seeds and is thrown away when the handler returns, so `mutates: false` is true
 * at the storage level and not only at the API: no row of the project is written, no counter moves,
 * no trigger fires. Rendering the example *into* the caller's database inside a rolled-back
 * transaction would be the cheaper build and a worse claim — a read tool that writes and undoes it
 * is a read tool whose failure mode is a half-undone write.
 *
 * `spineTools` arrives as an argument rather than an import: the registry builds these tools, so
 * importing it here would close a cycle back through the module that is mid-construction. The
 * argument is a builder and is called only inside a handler, long after the registry exists.
 *
 * **`list_document_kind` is not here.** It is one line of `LISTS` in `../list.js`, which is what
 * gives it the bound, the paging, the declared order and the response shape every other list tool
 * has. A hand-rolled list beside these two was the first cut and the suite refused it three ways
 * over: it ignored its own default, reported no bound, and sat outside the tiebreaker check. That
 * is the machinery working — a list tool written by hand is a list tool exempt from every guarantee
 * FR13 makes about lists.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Row, Tool } from '../convention.ts';

import { renderDocument } from '../../projection/index.ts';
import { EXAMPLE_KINDS, exampleDocument } from '../../preview/example.ts';
import { start } from '../../start.ts';
import { defineTool, ToolError } from '../convention.ts';

/**
 * @param {object} context
 * @param {import('node:sqlite').DatabaseSync} context.db
 * @param {(db: import('node:sqlite').DatabaseSync) => object[]} build The registry builder, so the
 *   example is seeded through the ordinary create tools against a scratch database.
 * @returns {object[]}
 */
export function templateTools(
  { db }: { db: DatabaseSync },
  build: (db: DatabaseSync) => Tool[],
): Tool[] {
  return [
    defineTool({
      name: 'read_document_kind',
      table: 'document_kind',
      description:
        'One document kind: the directory its files land in, whether it is numbered from the '
        + 'root or within a parent, and its parentage in both directions. A null directory means '
        + 'the kind renders inside its parent and has no file of its own. `parents` names the '
        + 'kinds this one may hang off; `children` names the kinds that may hang off it, which '
        + 'is what a cascade walks.',
      reads: ['document_kind', 'document_kind_parent'],
      mutates: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          // Keyed on `kind` rather than on an `id`, because `kind` *is* this table's primary key —
          // the same shape `read_dependency_kind` and the other vocabularies already have.
          kind: { type: 'string', minLength: 1, description: 'A seeded document_kind.kind' },
        },
        required: ['kind'],
      },
      handler: ({ kind }) => {
        const row = db.prepare('SELECT * FROM document_kind WHERE kind = ?').get(kind);

        if (!row) throw new ToolError(`read_document_kind: no kind '${kind}' in this project`);

        // **Both directions, because the two answer different questions and only one of them was
        // reachable.** `documentTools` already reads the upward half to decide whether a kind takes
        // a parent, so `parents` is that same answer made available to a caller. The downward half
        // had no route at all: `document_kind_parent` is keyed `(kind, parent_kind)` and nothing
        // queried it by the second column, so a run holding a document could not ask what hangs off
        // it. That is the edge list a cascade traverses, and a cascade that cannot read it carries
        // a copy of this table in its own prose — the hand-kept mapping FR1 opens the spec with,
        // one directory over from where it was found.
        //
        // Ordered on the returned column so two calls agree. Empty is a real answer both ways: a
        // root kind nothing may parent, and a leaf nothing hangs off.
        const parents = db
          .prepare('SELECT parent_kind FROM document_kind_parent WHERE kind = ? ORDER BY parent_kind')
          .all(kind)
          .map((entry: Row) => entry.parent_kind);
        const children = db
          .prepare('SELECT kind FROM document_kind_parent WHERE parent_kind = ? ORDER BY kind')
          .all(kind)
          .map((entry: Row) => entry.kind);

        return { ...row, parents, children };
      },
    }),

    defineTool({
      name: 'preview_document_kind',
      table: 'document_kind',
      description:
        'Render an example document of one kind and return its markdown. The bytes come from the '
        + 'projection template the kind actually uses, so the preview cannot differ from what a '
        + 'real document of that kind produces. Writes nothing.',
      reads: ['document_kind'],
      mutates: false,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', minLength: 1, description: 'A seeded document_kind.kind' },
        },
        required: ['kind'],
      },
      handler: ({ kind }) => {
        // Checked against the caller's own database before `EXAMPLE_KINDS`, so a kind this project
        // seeded and the plugin never shipped is refused as "no example" rather than as "no such
        // kind" — two different problems wanting two different fixes.
        const seeded = db.prepare('SELECT kind FROM document_kind WHERE kind = ?').get(kind);

        if (!seeded) {
          throw new ToolError(
            `preview_document_kind: '${kind}' is not a document kind in this project`,
          );
        }

        if (!EXAMPLE_KINDS.includes(kind)) {
          throw new ToolError(`preview_document_kind: no example is defined for '${kind}', so `
            + 'there is nothing to render. The kind exists; the plugin ships no example for it.');
        }

        const { db: scratch } = start(':memory:');
        const call = Object.fromEntries(build(scratch).map((tool) => [tool.name, tool.handler]));
        const { path, text } = renderDocument(scratch, exampleDocument(call, kind));

        // `path` is the example's own path, which is what makes the naming convention visible
        // without the skill having to state one — and `null` for a kind that renders inside its
        // parent, which is the same fact `read_document_kind` reports as a null directory.
        return { kind, path, text };
      },
    }),
  ];
}
