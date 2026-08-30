/**
 * `publish` — regenerating the two committed artefacts, callable without a shell (AD11).
 *
 * The third of AD11's three entry points, and the one a skill uses. It sits with `check_integrity`
 * and `search` rather than with the entity tools because it names no table and writes no row: what
 * it changes is a working tree.
 *
 * **It takes no path, and the absence is the point.** A `root` argument would let a caller name a
 * path, and naming paths under `docs/` is exactly the filename construction FR25 removes from
 * skills — a skill that could pass a root could pass the wrong one, and the failure would be a
 * projection written into a directory nobody was looking at. The root is the server's, resolved
 * where its database already resolves from.
 *
 * **`dry_run` is the one argument, and it is not a path.** Removal is the only irreversible thing
 * publishing does, so the `publish` skill shows a user what is about to be deleted before deleting
 * it — and the write and the unlink are one call by design, so there is no other way to ask. What
 * FR25 removes from skills is the construction of names; being able to say "not yet" is the
 * opposite of that.
 *
 * **`mutates: true`, though it inserts into no table**, and the two halves of that declaration
 * disagree here for the only time in the registry. `writes` is derived from it and names
 * `sqlite_schema`, which is not a claim about rows — it is what `table` already says for a tool
 * that spans the schema. What `mutates` buys is NFR7's refusal: on a database from a newer plugin
 * this server serves reads and refuses writes, and publishing is the operation that most needs to
 * be among the refused. An older renderer over a newer schema produces a projection missing
 * whatever the new columns hold, and then deletes the files that projection no longer accounts for
 * — a downgrade that silently discards planning history, which is the outcome NFR7 exists to
 * prevent. Declared `mutates: false` it would be served happily to exactly the database it must
 * not touch.
 */

import type { Context, Tool } from '../convention.ts';

import { publish, describe } from '../../publish/index.ts';
import { ProjectionError } from '../../projection/naming.ts';
import { defineTool, ToolError } from '../convention.ts';

/**
 * @param {object} context
 * @param {import('node:sqlite').DatabaseSync} context.db
 * @param {string} [context.root] The repository root, injected for the reason `now` and `newId`
 *   are: a test that cannot pin it has to publish into the process's own working directory.
 * @returns {object[]}
 */
export function publishTools({ db, root = '.' }: Context): Tool[] {
  return [
    defineTool({
      name: 'publish',
      // The exemption `check_integrity` and `search` take, and for the same reason: NFR5's rule is
      // that every part after the verb is schema vocabulary, and there is no schema word for a
      // tool that spans the schema. `naming.test.js` names the tools taking it, one line each.
      table: 'sqlite_schema',
      description:
        'Regenerate the markdown projection and .dpm/dpm.sql from the database, removing generated '
        + 'files no document produces any more. Returns what was written, rewritten, left unchanged '
        + 'and removed.',
      reads: ['sqlite_schema'],
      mutates: true,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          dry_run: {
            type: 'boolean',
            default: false,
            description:
              'Report what a publish would write, rewrite, leave unchanged and remove, without '
              + 'touching anything. Ask before removing; a removal cannot be undone.',
          },
        },
      },
      handler: ({ dry_run: dryRun = false }) => {
        let record;

        try {
          record = publish(db, { root, dryRun });
        } catch (error) {
          // **A refusal is an error, not a success carrying an empty record.** Returning
          // `{written: [], ...}` here would be true — nothing was written — and would read to a
          // caller as a tree already current, which is NFR6's false pass with the tool that
          // regenerates saying it. `ToolError` so the harness renders it as a JSON-RPC error
          // rather than an internal one; the message is the projection's own, naming every
          // document that refused rather than the first.
          if (error instanceof ProjectionError) {
            throw new ToolError(`publish: nothing was published — ${error.message}`);
          }

          throw error;
        }

        // **`describe` rather than a summary written here.** The CLI prints this same string from
        // this same function, so the two cannot describe one publish differently — and a caller
        // reading the record and a user reading a terminal are looking at one report. A sentence
        // composed in this file would be a second implementation of the wording, and the drift
        // would show up as a skill and a shell disagreeing about what a run did.
        return { ...record, report: describe(record) };
      },
    }),
  ];
}
