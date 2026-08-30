/**
 * One statement, for every tool that returns more than one row.
 *
 * `crud.js` holds the three statements a single artefact is built from; this holds the fourth.
 * Kept apart from them because it is the only one that answers to FR13, and because a paged read
 * has two properties neither of the others needs: a deterministic order, and a way for the caller
 * to know there is more.
 *
 * **`more` is a row, not a count.** The obvious shape is a second `SELECT COUNT(*)` beside the
 * page, and it is the wrong trade — a count scans the whole matching set to answer a question the
 * caller asked in order to avoid scanning the whole matching set, and on the largest tables (where
 * the bound actually earns its keep) it is the expensive half of the call. Asking for one row more
 * than the limit and reporting whether it arrived costs nothing and answers what a caller does
 * with the number anyway. What it does not give is a total, deliberately.
 */

import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { Args, Row } from './convention.ts';

import { DEFAULT_LIMIT } from './convention.ts';
import { readyClause } from '../dependency/readiness.ts';

/** The three clause forms a page may take, as the JSDoc on `selectPage` sets them out. */
export type Query = {
  table: string;
  filters?: Record<string, unknown>;
  before?: { column: string; value: unknown };
  gated?: string;
  live?: string;
  order: string[];
  where: string;
};

/**
 * The argument that opts out of a `live` clause, derived from the column the clause is over.
 *
 * `retired_at` yields `include_retired` and `archived_at` yields `include_archived`, which is the
 * whole rule. It is derived rather than declared because the two words are not interchangeable in
 * this schema: a vocabulary term is *retired* and keeps its existing rows while refusing new ones,
 * and a document is *archived* while staying complete and true. A single flag spelled one way would
 * make a caller ask for one and receive the other, in the surface skills are written against.
 *
 * @param {string} column
 * @returns {string}
 */
export function includeFlag(column: string) {
  return `include_${column.replace(/_at$/, '')}`;
}

/**
 * Read one bounded page of a table.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object} query
 * @param {string} query.table
 * @param {Record<string, unknown>} query.filters Columns to match. An `undefined` or `null` value
 *   is not a filter matching NULL — it is the caller declining to scope, so the column is dropped.
 * @param {{column: string, value: unknown}} [query.before] A strict `<` bound, dropped when the
 *   value is absent. FR11's staleness is an age, and an age is `updated_at < ?` rather than an
 *   equality.
 * @param {'document'|'story'} [query.gated] The table whose readiness clause applies when the
 *   caller passes `ready`. FR22's "which epics are ready" is not expressible as an equality —
 *   the answer depends on other rows' statuses over edges of a kind the project can extend — so
 *   it is a clause form rather than a filter, and the clause itself comes from
 *   `src/dependency/readiness.js` so the list and `readyDocuments` cannot drift apart.
 * @param {string} [query.live] A column whose non-NULL value takes the row out of the live set.
 *   Such rows are left out unless the caller passes the column's own opt-out flag — see
 *   `includeFlag`. FR24's guarantee is that a retired term keeps its rows and refuses new ones —
 *   so a list that went on offering one would be handing the caller a choice the database will
 *   reject, and the rejection would arrive at the write rather than at the choice. `document`'s
 *   `archived_at` is the same clause over a different word: an archived document is not wrong and
 *   not incomplete, it is simply out of the working set, and a roll-up that counted it would report
 *   swept work as outstanding.
 * @param {string[]} query.order Columns, in precedence order.
 * @param {string} query.where The tool name, for messages.
 * @param {object} args Already validated: `limit` and `offset` may be absent, never malformed.
 * @returns {{items: object[], limit: number, offset: number, returned: number, more: boolean}}
 *
 * The three clause forms above are named and closed, not a filter language. Each is here because
 * a requirement asks for that shape and no equality can express it; a fourth needs the same
 * justification, because a general operator parameter would be a query builder in the file that
 * exists to avoid having one.
 */
export function selectPage(
  db: DatabaseSync,
  { table, filters = {}, before, gated, live, order, where }: Query,
  args: Args,
) {
  if (!Array.isArray(order) || order.length === 0) {
    throw new Error(`${where}: a page with no order is a page that can repeat and skip rows`);
  }

  const limit = args.limit ?? DEFAULT_LIMIT;
  const offset = args.offset ?? 0;

  const clauses: string[] = [];
  const values: SQLInputValue[] = [];

  for (const [column, value] of Object.entries(filters)) {
    // An `undefined` or `null` value is not a filter matching NULL — it is the caller declining
    // to scope, so the column is dropped.
    if (value === undefined || value === null) continue;

    clauses.push(`${column} = ?`);
    values.push(value as SQLInputValue);
  }

  if (before && before.value !== undefined && before.value !== null) {
    clauses.push(`${before.column} < ?`);
    values.push(before.value as SQLInputValue);
  }

  if (live && args[includeFlag(live)] !== true) {
    clauses.push(`${live} IS NULL`);
  }

  // Only when asked. A list that returned ready rows by default would answer a different question
  // from the one its name asks, and a caller enumerating an epic's stories to render them would
  // silently lose the blocked ones.
  if (gated && args.ready === true) {
    clauses.push(readyClause(gated));
  }

  const sql = `SELECT * FROM ${table}`
    + (clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '')
    + ` ORDER BY ${order.join(', ')} LIMIT ? OFFSET ?`;

  // One row past the bound, so `more` is answered by whether it arrived.
  const rows = db.prepare(sql).all(...values, limit + 1, offset) as Row[];
  const more = rows.length > limit;
  const items = more ? rows.slice(0, limit) : rows;

  return { items, limit, offset, returned: items.length, more };
}
