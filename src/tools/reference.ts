/**
 * `resolve_reference` — the reference a person typed, back to the document it names (FR7–FR9).
 *
 * Epic 03-01 put the reference on every document row a `list_*` or `read_*` tool returns, which
 * made `47-03` printable. This is the other direction, and without it the feature is half done:
 * FR7 names seven skills whose argument contract reads *names a document id*, so a command one
 * skill recommends by reference is a command the receiving skill cannot run. The reference was
 * readable and untypeable.
 *
 * **One tool rather than a rule each skill implements**, which is ADR 03-03's decision and the
 * same argument `search` records for itself. Seven skills resolving references would be seven
 * places for the numbering rule to be re-derived and seven refusal messages to keep in step, and
 * FR9 asks for one tool call rather than a listing matched inside a skill's own run.
 *
 * **The lookup is `documentsByIdentifier`, and nothing here parses a reference.** Splitting
 * `47-03` into a number and a sequence would be a second derivation of the rule `identifierOf`
 * owns — it would keep answering after that rule changed, with the wrong document, which is the
 * failure FR2 exists to foreclose. `src/projection/naming.js` records why the map is built rather
 * than queried.
 *
 * **Two statements, whatever the corpus holds.** One builds the map, one reads the row. NFR1's
 * bound is a property of that shape rather than something this module is careful about: there is
 * no per-candidate query to accidentally write.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Tool } from './convention.ts';

import { documentsByIdentifier } from '../projection/naming.ts';
import { readById } from './crud.ts';
import { defineTool, ToolError } from './convention.ts';

/** The map `documentsByIdentifier` returns: a reference, and every document claiming it. */
type ByIdentifier = Map<string, Array<{ id: string; kind: string }>>;

/** How many references a refusal prints before it says how many more there are. */
const SHOWN = 10;

/**
 * The sentence that turns a refusal into a correction (FR10).
 *
 * **A refusal that only says *no* leaves the caller where they started**, and the thing they need
 * is almost always one character away: `47-3` for `47-03`, an epic number for a spec's. The
 * references exist in the map that was just built, so naming them costs nothing beyond the string.
 *
 * **Bounded, and honest about the bound.** A corpus of four hundred documents would otherwise put
 * four hundred references into an error message — unreadable, and expensive to carry through a
 * transport that has to serialise it. Ten and a count is a list a person can scan; the count is
 * what stops the truncation reading as *that is all there is*.
 *
 * @param {Map<string, Array<{id: string, kind: string}>>} byIdentifier
 * @param {string|undefined} kind Present when the caller narrowed, and then the list narrows too.
 * @returns {string}
 */
function existing(byIdentifier: ByIdentifier, kind: string | undefined): string {
  const references = [...byIdentifier]
    .filter(([, rows]) => !kind || rows.some((row) => row.kind === kind))
    .map(([identifier]) => identifier)
    .sort();

  if (references.length === 0) {
    return kind ? `No document of kind '${kind}' has a reference.` : 'No document has a reference.';
  }

  const shown = references.slice(0, SHOWN).join(', ');
  const rest = references.length - SHOWN;

  return `Existing${kind ? ` ${kind}` : ''} references: ${shown}`
    + `${rest > 0 ? `, and ${rest} more` : ''}.`;
}

/**
 * @param {object} context
 * @param {import('node:sqlite').DatabaseSync} context.db
 * @returns {object[]}
 */
export function referenceTools({ db }: { db: DatabaseSync }): Tool[] {
  const name = 'resolve_reference';

  return [
    defineTool({
      name,
      // Named for the table it returns rows of, so it takes no part in the schema-spanning
      // exemption `check_integrity`, `publish` and `search` hold — each of those is named for no
      // table at all, and this one is.
      table: 'document',
      description:
        'Resolve a human reference — `47`, `47-03` — to the document it names, returning that '
        + "document's row. Pass `kind` to choose between documents that share a reference: an "
        + 'epic and its coverage matrix take the same one by design. A reference printed by any '
        + 'list or read tool is accepted here verbatim.',
      reads: ['document'],
      mutates: false,
      // The returned row carries its own reference, like every other row a read tool hands back —
      // which is what makes a reference taken from one call and given to this one a round trip
      // rather than two unrelated strings that happen to match.
      db,
      documentRows: true,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          reference: {
            type: 'string',
            minLength: 1,
            description: 'As printed: `47` for a root document, `47-03` for a child',
          },
          kind: {
            type: 'string',
            minLength: 1,
            description:
              'Narrow to one kind. Only needed where a reference names more than one document',
          },
        },
        required: ['reference'],
      },
      handler: (args) => {
        const byIdentifier = documentsByIdentifier(db);
        const found = byIdentifier.get(args.reference) ?? [];
        const candidates = args.kind ? found.filter((row) => row.kind === args.kind) : found;

        if (candidates.length === 0) {
          throw new ToolError(
            `${name}: nothing matches '${args.reference}'`
            + `${args.kind ? ` for kind '${args.kind}'` : ''}. ${existing(byIdentifier, args.kind)}`,
          );
        }

        // **Neither candidate, and no rule for choosing between them** (FR8). Every way of picking
        // one is available here and every one of them guesses: the first the walk reached, the
        // newest, the epic over its matrix. The refusal names the kinds instead, because `kind` is
        // the argument that resolves this and a message that did not say so would leave the caller
        // with a refusal and no next move.
        if (candidates.length > 1) {
          const kinds = candidates.map((row) => row.kind).sort();

          throw new ToolError(
            `${name}: '${args.reference}' names ${candidates.length} documents — `
            + `${kinds.join(', ')}. Pass kind to choose one.`,
          );
        }

        return readById(db, 'document', candidates[0].id, name);
      },
    }),
  ];
}
