/**
 * A live document's bare ULID, refused before it is written (FR16, FR19).
 *
 * **The refusal is here rather than at render, and that is the requirement rather than a preference.**
 * An id inside a rendered document is a reference nobody can follow and nobody can repair: by the
 * time a reader meets it the row it names may be gone, and a ULID in a sentence is indistinguishable
 * from every other ULID in that sentence. Catching it at the write means the bad prose never enters
 * the database — which is also why there is no integrity-register entry for it, because there is
 * nothing for a later sweep to find.
 *
 * **Wired into `crud.js` rather than into `defineTool`.** The wrapper looks like the seam and cannot
 * be one: three of the tool definitions pass `db` and the rest do not, so it has no connection to
 * resolve a candidate against. Every write in this server goes through `insert` and `updateByKey` —
 * `INSERT INTO` and `UPDATE … SET` appear in that file and nowhere else under `src/tools/` — and
 * both already hold the table, the values and the tool name the message has to quote. So the
 * coverage claim is structural: a write tool added later is covered because it cannot write without
 * passing through here.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Args } from './convention.ts';

import { ToolError } from './convention.ts';

/** Crockford's alphabet, as `src/id/ulid.js` encodes it. Case-sensitive, because that encoder is. */
const ULID = /[0-9A-HJKMNP-TV-Z]{26}/g;

/** The correct form, removed before candidates are collected. See `bareUlids`. */
const MARKER = /\{\{ref:[0-9A-HJKMNP-TV-Z]{26}\}\}/g;

/**
 * The one exemption no schema fact produces.
 *
 * `session.state` is a blob a skill defines, dpm does not interpret and nothing renders, so a ULID
 * in it is neither wrong nor rewritable — there is no marker form for a value that is never read as
 * prose. FR19 names it, and it is written out here because nothing in `PRAGMA` distinguishes it from
 * any other TEXT column: it is a fact about what the column is *for*.
 */
const UNINTERPRETED = new Set(['session.state']);

/**
 * Which columns of a table a ULID may legitimately sit in, derived from the schema.
 *
 * **Two roles, both asked of the database rather than listed.** A foreign key holds an id because
 * that is what a foreign key is, and a primary key holds the row's own. Everything else is scanned,
 * including columns that could not hold a ULID anyway — a timestamp, a status, a slug — because the
 * rule is then *what a column is for* rather than a list of column names to keep in step with the
 * schema. The spec's own trial of the version without these exemptions flagged 390 columns.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} table
 * @returns {Set<string>}
 */
function idColumns(db: DatabaseSync, table: string): Set<string> {
  const exempt = new Set(
    (db.prepare(`PRAGMA foreign_key_list(${table})`).all() as Array<{ from: string }>)
      .map((row) => row.from),
  );

  for (const column of db.prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ pk: number; name: string }>) {
    if (column.pk > 0) exempt.add(column.name);
    if (UNINTERPRETED.has(`${table}.${column.name}`)) exempt.add(column.name);
  }

  return exempt;
}

/**
 * The live document ids a value names outside a marker.
 *
 * **The marker is removed first, and the order is the whole of criterion 2.** `{{ref:<id>}}` is the
 * correct way to name a document in prose, and it contains a ULID — so a scan that ran before the
 * strip would refuse the only form the convention allows, and would then be silenced by exempting
 * the column, which is how a check stops being one.
 *
 * **A candidate is put to the `document` table, not accepted on its shape.** A session id quoted in
 * an observation is well-formed and names nothing renderable; it has no marker form, so refusing it
 * would reject prose with no correct alternative to offer. FR19 says so, and this is where it holds.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} value
 * @returns {string[]} Distinct ids, in the order they appear.
 */
function bareUlids(db: DatabaseSync, value: string) {
  const candidates = [...new Set(value.replace(MARKER, '').match(ULID) ?? [])];

  if (candidates.length === 0) return [];

  const live = db.prepare('SELECT id FROM document WHERE id = ?');

  return candidates.filter((id) => live.get(id) !== undefined);
}

/**
 * Refuse the write if any value carries a live document's bare ULID.
 *
 * The message names the tool, the column and the id, and shows the string to write instead — a
 * refusal saying only *no* leaves the writer to guess at a form they have evidently not met.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} table
 * @param {Record<string, unknown>} values The columns about to be written.
 * @param {string} where The tool name, for the message.
 * @param {(db: import('node:sqlite').DatabaseSync, table: string) => Set<string>} [exempt] Which
 *   columns a ULID may sit in. Injected rather than fixed so the control can remove the exemptions
 *   and observe the foreign-key case being refused — a control that copied this function instead
 *   would be watching its own copy fail.
 * @throws {ToolError}
 */
export function refuseBareUlids(
  db: DatabaseSync,
  table: string,
  values: Args,
  where: string,
  exempt: (db: DatabaseSync, table: string) => Set<string> = idColumns,
) {
  const allowed = exempt(db, table);

  for (const [column, value] of Object.entries(values)) {
    if (typeof value !== 'string' || allowed.has(column)) continue;

    const [found] = bareUlids(db, value);

    if (found === undefined) continue;

    throw new ToolError(
      `${where}: ${table}.${column} names document '${found}' by its id. Write it as `
      + `{{ref:${found}}}, which renders as that document's reference and follows it if it moves.`,
    );
  }
}

/** No column is exempt. The control's argument to `refuseBareUlids`, and its only caller. */
export const nothingExempt = () => new Set<string>();
