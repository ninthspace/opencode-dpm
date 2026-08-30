/**
 * One search tool over both indexes (FR9).
 *
 * Stories 3 and 4 built `document_fts` over section bodies and `entry_fts` over the prose held on
 * child rows. **A tool over one of them is the requirement's own counter-example**: the spec's
 * measurement is that "which requirement mentioned the coverage helpers" returns nothing from a
 * section sweep while the answer sits in `requirement.text` — a search that reports success and
 * covers half the corpus. So there is one tool and it queries both, and the must-NOT is the state
 * where it does not.
 *
 * **Every hit names its entity and its row id, and that is what makes it a result.** A ranked list
 * of excerpts a caller cannot open is a search that answers a question and withholds the answer;
 * NFR7 asks that every piece of state be reachable through a read tool, and the pair
 * `(entity, entity_id)` is what a caller turns into `read_<entity>({id})`.
 *
 * **The entity vocabulary is read out of the schema, not written here.** The names come from the
 * tables `entry_fts`'s triggers fire on, which is the same enumeration Story 4's structural
 * criterion uses — so a table indexed by a later migration becomes scopable by name with no edit
 * to this file, and a name this tool would accept is always a name something actually indexes.
 *
 * **On merging two rankings.** `rank` is bm25 within one index, so the two sides are scored on
 * independent scales and interleaving them is an approximation rather than a global ordering.
 * That is stated rather than hidden: what the criterion asks for is ranked results, and within
 * each index the ranking is real. A single index over everything would rank globally and would
 * cost the `entity:` scoping that makes `entry_fts` usable — the trade was taken deliberately.
 *
 * **The limits are in the `description`, not in this comment, and that is the point.** The caller
 * is a model reading the tool list; a limitation recorded where only a maintainer sees it is a
 * limitation the caller will discover by getting an empty result and reading it as absence. Three
 * of them are real sources of that false negative — whole-token matching, no stemming, and the
 * interleaved ranking above — so all three are stated where the query is written.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Row, Tool } from './convention.ts';

import { defineTool, DEFAULT_LIMIT, ToolError } from './convention.ts';

/** The kind `document_fts` indexes. It is a document's own prose, so it is named for the table. */
const SECTION = 'document_section';

/**
 * The entities `entry_fts` holds, taken from the tables its triggers fire on.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {string[]}
 */
function entryEntities(db: DatabaseSync): string[] {
  return (db
    .prepare(`SELECT DISTINCT tbl_name FROM sqlite_schema
               WHERE type = 'trigger' AND sql LIKE '%entry_fts%' ORDER BY tbl_name`)
    .all() as Row[])
    .map((row) => row.tbl_name);
}

/**
 * The `entity:` term a caller wrote, if any.
 *
 * FTS5 resolves `entity:requirement` itself against `entry_fts`, which has that column — and
 * *errors* against `document_fts`, which does not. So the term has to be read here to decide which
 * indexes the query can even be put to, rather than passed to both and one failure swallowed. A
 * swallowed failure is the must-NOT wearing a different hat: half the corpus unreachable while the
 * tool reports success.
 */
const SCOPE = /(?:^|\s)entity:([A-Za-z_]+)(?=\s|$)/;

/**
 * The two shapes a scoped query may take, and the terms left when the scope is lifted out.
 *
 * **Scoping is conjunctive, and that is enforced rather than left to whichever index can express
 * it.** `entry_fts` has an `entity` column, so FTS5 would happily evaluate
 * `entity:requirement OR helpers` there; `document_fts` has no such column and the same query
 * cannot be written against it at all. Accepting the disjunctive form would give a tool whose
 * meaning depends on which index a scope happens to name — the worst kind of inconsistency,
 * because every individual call looks correct.
 */
const CONJUNCTIVE = [
  /^\s*entity:[A-Za-z_]+\s+AND\s+(.+)$/i,
  /^(.+?)\s+AND\s+entity:[A-Za-z_]+\s*$/i,
];

export function searchTools({ db }: { db: DatabaseSync }): Tool[] {
  const entities = [SECTION, ...entryEntities(db)];

  const both = `
    SELECT * FROM (
      SELECT '${SECTION}' AS entity, section_id AS entity_id, heading AS heading,
             snippet(document_fts, 1, '', '', '…', 12) AS excerpt, rank AS score
        FROM document_fts WHERE document_fts MATCH :section_query
      UNION ALL
      SELECT entity, entity_id, NULL,
             snippet(entry_fts, 1, '', '', '…', 12), rank
        FROM entry_fts WHERE entry_fts MATCH :entry_query
    )
    ORDER BY score, entity, entity_id LIMIT :limit OFFSET :offset`;

  const one = (table: string, columns: string, query: string) => `
    SELECT ${columns} FROM ${table} WHERE ${table} MATCH ${query}
     ORDER BY rank, 2 LIMIT :limit OFFSET :offset`;

  const sectionsOnly = one(
    'document_fts',
    `'${SECTION}' AS entity, section_id AS entity_id, heading AS heading, `
    + "snippet(document_fts, 1, '', '', '…', 12) AS excerpt, rank AS score",
    ':section_query',
  );

  const entriesOnly = one(
    'entry_fts',
    "entity, entity_id, NULL AS heading, snippet(entry_fts, 1, '', '', '…', 12) AS excerpt, "
    + 'rank AS score',
    ':entry_query',
  );

  return [
    defineTool({
      name: 'search',
      table: 'document_fts',
      description:
        'Search every indexed artefact — document section bodies and the prose held on the child '
        + 'rows beneath them. Each hit names the entity and the row id, so it can be opened with '
        + 'that entity\'s read tool. Scope with an `entity:` term in the query, e.g. '
        + '`entity:requirement AND helpers`. '
        + 'What it cannot do, because an empty result is not evidence of absence: matching is by '
        + 'whole token, so `index` does not find `reindexing` and only a trailing `prefix*` '
        + 'widens it; there is no stemming, so `index` does not find `indexed` or `indexing`; '
        + 'and `rank` is bm25 within one index, so an unscoped query interleaves two rankings '
        + `rather than ordering across both. Entities: ${entities.join(', ')}.`,
      reads: ['document_fts', 'entry_fts'],
      // `writes` is empty and not defaulted to `table`: this tool creates nothing, and the parity
      // enumeration reads `writes` to decide which tables a create tool covers.
      writes: [],
      mutates: false,
      paged: true,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          query: {
            type: 'string',
            minLength: 1,
            description: 'An FTS5 query. Bare words are ANDed; `OR`, `NOT`, `"phrases"` and '
              + '`prefix*` work as FTS5 defines them.',
          },
        },
        required: ['query'],
      },
      handler: (args) => {
        const limit = args.limit ?? DEFAULT_LIMIT;
        const offset = args.offset ?? 0;
        const scope = SCOPE.exec(args.query)?.[1] ?? null;

        if (scope !== null && !entities.includes(scope)) {
          throw new ToolError(
            `search: nothing indexes '${scope}'. The entities are ${entities.join(', ')}. `
            + 'An unknown scope is reported rather than answered with an empty result, which '
            + 'reads as "no matches" and is not.',
          );
        }

        const [sql, parameters] = (() => {
          if (scope === null) {
            return [both, { section_query: args.query, entry_query: args.query }];
          }

          // The terms either side of the scope, which is also the check that there are any: a
          // query of nothing but `entity:requirement` is a listing rather than a search, and
          // `list_requirement` is the tool for that.
          const terms = CONJUNCTIVE.map((shape) => shape.exec(args.query)?.[1]).find(Boolean);

          if (!terms) {
            throw new ToolError(
              `search: '${args.query}' scopes to '${scope}' and gives nothing to search for. `
              + 'Write `entity:<name> AND <terms>`. Scoping is conjunctive on purpose — '
              + '`document_fts` has no `entity` column, so a disjunctive scope would mean one '
              + 'thing over the entry index and be unwritable over the section index.',
            );
          }

          // `document_fts` has no `entity` column, so a scope naming sections is answered by
          // lifting the term out and querying that index alone. Any other scope names something
          // only `entry_fts` holds, and FTS5 does the narrowing itself.
          return scope === SECTION
            ? [sectionsOnly, { section_query: terms }]
            : [entriesOnly, { entry_query: args.query }];
        })();

        // One row past the bound, so `more` is answered by whether it arrived — the same rule
        // `selectPage` follows, and the reason a count is not taken here either.
        const rows = db.prepare(sql).all({ ...parameters, limit: limit + 1, offset }) as Row[];
        const more = rows.length > limit;
        const items = (more ? rows.slice(0, limit) : rows)
          .map(({ score, ...hit }: Row) => ({ ...hit, score }));

        return { items, limit, offset, returned: items.length, more };
      },
    }),
  ];
}
