/**
 * Create, read and update for a table that is neither a document nor one of the spine's own.
 *
 * **One factory rather than fifteen modules, and the columns are what differ.** `criterionTools`
 * and `deliveryTools` already make this choice for two tables each, on the argument that a second
 * hand-written copy of these statements is a second place for a `CHECK` set to drift from the DDL.
 * The remaining tables make the argument fifteen times over: an ADR option, a quick record's
 * criterion, a finding, a milestone and an artifact all have a parent, some columns and a
 * position, and the differences between them are a list of column names — which is a parameter.
 *
 * What genuinely varies is captured rather than flattened:
 *
 * - **`key`** — `id` for a table with a ULID of its own, or the column list for one whose identity
 *   *is* its parents. A join table has no surrogate key to read back by, and pretending otherwise
 *   was what made the first draft of `insert` unable to return the row it had just written.
 * - **`derive`** — the columns this server fills from another argument. `observation.retro_kind`
 *   is NULL exactly when `retro_id` is, held by a `CHECK`, and asking a caller for it would be
 *   asking them to assert the thing the pairing exists to check.
 * - **`guard`** — a rule the schema cannot express, run before the write on create *and* on update.
 *   `document_milestone`'s register entry #12 and `adr_option`'s register entry #8.
 *
 * **A guard sees the resolved row, not the arguments.** On create that is what is about to be
 * written; on update it is the stored row with the changes merged over it. Written that way a guard
 * never asks which call it is running under — which matters because the two calls carry different
 * arguments for the same rule: `update_adr_option` may be passed nothing but an `id` and `chosen`,
 * and the rule it breaks is about the `adr_id` it did not mention. The tool name arrives separately,
 * so a refusal can still say which call was refused.
 *
 * **A `boolean` argument is written as 0 or 1.** SQLite has no boolean type and `node:sqlite`
 * refuses to bind one, so the choice is between a tool surface that says `chosen: true` and one
 * that says `chosen: 1`. The first is the honest description of the column; the conversion belongs
 * here, once, rather than in each handler that has such a column.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { Args, Row, Rule, Tool } from './convention.ts';

import { defineTool, SUPPLIED } from './convention.ts';
import { insert, readByKey, updateByKey } from './crud.ts';

/** What an entity declares about itself — the JSDoc on `entityTools` written out. */
export type EntitySpec = {
  table: string;
  noun: string;
  key?: string[] | null;
  fields: Record<string, Rule>;
  required?: string[];
  mutable?: string[] | null;
  body?: string[];
  supplied?: Record<string, unknown>;
  derive?: ((args: Args) => Record<string, unknown>) | null;
  guard?: ((row: Row, where: string) => void) | null;
};

/** SQLite stores no booleans. See the note above. */
const toColumn = (value: unknown) => (typeof value === 'boolean' ? Number(value) : value);

/**
 * Build create, read and update for one table.
 *
 * @param {object} context
 * @param {import('node:sqlite').DatabaseSync} context.db
 * @param {() => string} context.newId
 * @param {object} options
 * @param {string} options.table
 * @param {string} options.noun What a row is, for the tool descriptions.
 * @param {string[]} [options.key] The primary key columns. Omitted means a surrogate `id` this
 *   server mints; given, they are caller arguments and are required on create.
 * @param {Record<string, object>} options.fields Every column a caller may set, as JSON Schema.
 * @param {string[]} [options.required] Which of them a create call must carry. The key columns
 *   are added automatically.
 * @param {string[]} [options.mutable] Which of them an update call may change. Defaults to
 *   everything but the key columns; a parent is named here only when re-parenting is meaningful.
 * @param {string[]} [options.body] Columns withheld unless `include_body` asks for them.
 * @param {Record<string, string>} [options.supplied] What `derive` fills, declared for Story 7.
 * @param {(args: object) => object} [options.derive] Columns derived from the arguments.
 * @param {(row: object, where: string) => void} [options.guard] A rule no constraint can hold, run
 *   before the write on create and on update, so a refusal happens instead of a row. It receives
 *   the resolved row and the name of the tool that is being refused.
 * @returns {object[]}
 */
export function entityTools({ db, newId }: { db: DatabaseSync; newId: () => string }, {
  table,
  noun,
  key = null,
  fields,
  required = [],
  mutable = null,
  body = [],
  supplied = {},
  derive = null,
  guard = null,
}: EntitySpec): Tool[] {
  const keys = key ?? ['id'];
  const surrogate = key === null;
  const columns = Object.keys(fields);
  const changeable = mutable ?? columns.filter((column) => !keys.includes(column));

  // On create there is nothing to leave alone, so a derived column the caller gave nothing to
  // derive from is NULL — which is what `undefined` and an explicit clear both come to here.
  const values = (args: Args) => ({
    ...Object.fromEntries(
      columns
        .filter((column) => args[column] !== undefined)
        .map((column) => [column, toColumn(args[column])]),
    ),
    ...Object.fromEntries(
      Object.entries(derive ? derive(args) : {}).map(([column, value]) => [column, value ?? null]),
    ),
  });

  const readKey = (args: Args) => Object.fromEntries(keys.map((column) => [column, args[column]]));

  const keyProperties = Object.fromEntries(
    keys.map((column) => [column, fields[column] ?? { type: 'string', minLength: 1 }]),
  );

  const tools = [
    defineTool({
      name: `create_${table}`,
      table,
      description: `Create ${noun}.`,
      reads: [table],
      mutates: true,
      serverSupplied: { ...(surrogate ? { id: SUPPLIED.ulid } : {}), ...supplied },
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: fields,
        required: [...new Set([...(surrogate ? [] : keys), ...required])],
      },
      handler: (args) => {
        // **A column the caller omitted is left out of the `INSERT` rather than written NULL.**
        // The spine factories write every column explicitly, which is right where the omitted ones
        // are nullable — and wrong here, because `retro_application.theme` and `.note` are
        // `NOT NULL DEFAULT ''`. Writing NULL over a defaulted column turns an omitted argument
        // into a constraint violation. `insert` reads the row back, so what was stored is visible
        // either way.
        const row = { ...(surrogate ? { id: newId() } : {}), ...values(args) };

        if (guard) guard(row, `create_${table}`);

        return insert(db, table, row, `create_${table}`, keys);
      },
    }),

    defineTool({
      name: `read_${table}`,
      table,
      description: `Read one ${noun} by ${keys.join(' and ')}.`,
      reads: [table],
      mutates: false,
      body,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: keyProperties,
        required: keys,
      },
      handler: (args) => readByKey(db, table, readKey(args), `read_${table}`),
    }),
  ];

  // **A table whose every column is its own key gets no update tool, and that is not an omission.**
  // `artifact_document` holds an artifact id and a document id and nothing else; changing either
  // is deleting one row and writing another, which `create_*` already does. An update tool
  // there would take an id, have nothing to set, and refuse every call it received.
  if (changeable.length > 0) {
    const changeableFields = Object.fromEntries(
      changeable.map((column) => [column, fields[column]]),
    );

    tools.push(defineTool({
      name: `update_${table}`,
      table,
      description: `Update ${noun}'s ${changeable.join(', ')}.`,
      reads: [table],
      mutates: true,
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { ...keyProperties, ...changeableFields },
        required: keys,
      },
      handler: (args) => {
        const changes = Object.fromEntries(
          changeable
            .filter((column) => args[column] !== undefined)
            .map((column) => [column, toColumn(args[column])]),
        );

        // **The derived columns come along with whatever they are derived from, and only then.**
        // Setting `retro_id` without `retro_kind` fails a `CHECK` that pairs them; setting neither
        // must leave both alone, which is the story's "must not clear one to set the other".
        //
        // Three states, not two, since a caller may now clear the reference as well as set it:
        // `undefined` from `derive` is *nothing to do*, and a `null` is a clear that has to be
        // written. Skipping nulls here — as this did while a clear could not reach a handler at all
        // — would clear `retro_id` and leave `retro_kind` saying 'retro', which is the paired
        // `CHECK` refusing a call the caller had every right to make.
        const derived = derive ? derive(args) : {};

        for (const [column, value] of Object.entries(derived)) {
          if (value !== undefined) changes[column] = value;
        }

        // The stored row with the changes over it, so the guard sees the state this call would
        // leave behind rather than the fragment it was passed. Read before the `UPDATE` and not
        // after: a guard consulted afterwards would be describing a row it had already allowed.
        if (guard) {
          const stored = readByKey(db, table, readKey(args), `update_${table}`);

          guard({ ...stored, ...changes }, `update_${table}`);
        }

        return updateByKey(db, table, readKey(args), changes, `update_${table}`);
      },
    }));
  }

  return tools;
}
