/**
 * The contract every entity tool follows.
 *
 * Written first and separately because Stories 3 through 7 all assert against it, and because
 * AD10 chose a conformance test over codegen — which means the tool schemas and the DDL are two
 * hand-written definitions and the test is the only thing holding them together. A test is only
 * as sharp as the declaration it reads, so what a tool declares about itself is the whole
 * mechanism, not bookkeeping around it.
 *
 * **`inputSchema` is written by hand and must stay that way.** Deriving the enums from
 * `PRAGMA table_info` at registration would close the seam structurally, and it is genuinely the
 * better property — AD10 says so, and rejected it on cost rather than merit. Taking it here by
 * the back door would not deliver that benefit: it would leave Story 7's conformance test
 * comparing the live schema against itself, passing unconditionally, while looking exactly like a
 * test that checks something. That is the shape of AD10's own must-NOT.
 *
 * **What `serverSupplied` is for.** AD10 requires every `NOT NULL` column without a default to be
 * a required argument on its create tool. Read against the live schema, that set includes `id`,
 * `created_at` and `updated_at` — a ULID this server mints and its own clock — plus the columns
 * denormalised from a parent and pinned by a composite foreign key. Making those caller arguments
 * would be faithful to the sentence and useless in practice. So a tool declares which columns it
 * fills itself, and Story 7 asserts that every `NOT NULL`-without-default column is *either* a
 * required argument *or* declared here, in both directions. A column added later must be
 * consciously classified; what it cannot be is neither, silently.
 */

// FR2: the reference a tool returns is `identifierOf`'s answer, reached through the map builder
// beside it. `src/tools/` reaching into `src/projection/` closes no cycle — that module imports
// nothing at all, which is what makes it the one authority on the numbering rule.
import type { DatabaseSync } from 'node:sqlite';
import type { currentSkew } from '../server/neighbour.ts';
import type { stampSkew } from '../server/stamp.ts';

import { identifiers } from '../projection/naming.ts';
import { RPC_ERRORS } from '../server/rpc.ts';

/**
 * Arguments as they arrive and as `validate` hands them on.
 *
 * `any` for the reason the projection's `Row` is: every handler destructures the columns it wants
 * and passes them to SQL, and the shapes are each tool's own `inputSchema` rather than anything
 * this file could name. An `unknown` would be a cast at every handler, none of them checking
 * anything — `validate` is the check, and it runs before a handler sees these.
 */
export type Args = Record<string, any>;

/** A row as this layer handles one — whatever columns the table has. `any` for `Args`'s reason. */
export type Row = Record<string, any>;

/**
 * What every tool builder is handed: the connection, and the things only the server can supply.
 *
 * `skew` and `stamp` are threaded through rather than imported at each use so a test can hand in
 * its own — the same reason `now` and `newId` are here rather than called directly.
 */
export type Context = {
  db: DatabaseSync;
  now: () => string;
  newId: () => string;
  root: string;
  skew: typeof currentSkew;
  stamp: typeof stampSkew;
};

/** One property's rule, restricted to the JSON Schema keywords `KEYWORDS` lists below. */
export type Rule = {
  type?: string;
  enum?: unknown[];
  description?: string;
  default?: unknown;
  minLength?: number;
  minimum?: number;
};

/** A tool's declared arguments. An object schema, always — `defineTool` refuses anything else. */
export type InputSchema = {
  type: string;
  additionalProperties: boolean;
  properties?: Record<string, Rule>;
  required?: string[];
};

/** What a tool declares about itself. `defineTool` checks every field of it at load. */
export type ToolDefinition = {
  name: string;
  table: string;
  description: string;
  reads: string[];
  mutates: boolean;
  inputSchema: InputSchema;
  handler: (args: Args) => unknown;
  body?: string[];
  paged?: boolean;
  writes?: string[];
  db?: DatabaseSync | null;
  documentRows?: boolean;
  derived?: ((value: unknown) => unknown) | null;
  serverSupplied?: Record<string, unknown>;
  /**
   * Declared by the list builder and read by the parity tests rather than by `defineTool`: the
   * page's total order, and the column whose non-NULL value takes a row out of the live set.
   */
  order?: string[];
  live?: string;
};

/**
 * A tool refusing its arguments.
 *
 * Carries `rpc` so `dispatch` renders it as a JSON-RPC error rather than an internal one
 * (`src/server/mcp.js`). FR3 puts rejection at the tool boundary, and a caller cannot tell a
 * boundary rejection from a crash unless the code says which it was.
 */
export class ToolError extends Error {
  /**
   * @param {string} message
   * @param {{code: number, message: string}} [rpc]
   */
  // Declared rather than assigned in the signature: a parameter property is TypeScript syntax with
  // a runtime effect, which Node's type-stripping refuses (ADR 01-03).
  rpc: { code: number; message: string };

  constructor(message: string, rpc = RPC_ERRORS.invalidParams) {
    super(message);
    this.name = 'ToolError';
    this.rpc = rpc;
  }
}

/**
 * How a column this server fills gets its value. The keys are what Story 7 reads; the values are
 * for whoever is reading the tool six months from now and wants to know where a column came from.
 */
export const SUPPLIED = {
  /** A ULID from `src/id/ulid.js`. */
  ulid: 'ulid',
  /** The server's clock, as an ISO 8601 string. */
  clock: 'clock',
  /** `allocateNumber` — see `src/numbering/allocate.js`. */
  allocated: 'allocated',
  /** Read from another argument's row, or fixed by the column's own `CHECK`. */
  derived: (from: string) => `derived from ${from}`,
};

/**
 * How many rows a list-returning tool hands back when the caller does not say.
 *
 * **A default, not a ceiling.** FR13 asks for the bound and then says what kind of bound it is:
 * "The bound is a default that costs nothing to override, not a limit." So `limit` declares this
 * as its `default` and declares no `maximum` — a caller who wants two thousand rows asks for two
 * thousand and gets them. A ceiling here would be a boundary on what dpm can be asked for, which
 * is the thing the requirement's must-NOT forbids.
 */
export const DEFAULT_LIMIT = 50;

/**
 * The argument a tool with a body grows, and the columns it governs.
 *
 * Injected by `defineTool` rather than written on each tool, for the reason validation is wrapped
 * on: a tool that declared `body` and forgot the argument would advertise a summary/body split it
 * did not have, and one that declared the argument and forgot to filter would advertise a bound it
 * never applied. Declaring the columns is the whole of what a tool has to do.
 */
const bodyArgument = (body: string[]) => ({
  include_body: {
    type: 'boolean',
    default: false,
    description: `Return ${body.join(', ')} as well. Withheld unless asked for.`,
  },
});

/**
 * The two arguments every paged tool takes.
 *
 * `offset` is here because a default page size without a way past the first page is not a bound,
 * it is a truncation — the caller would have raised `limit` purely to reach row 51, which turns
 * every deep read into a full one.
 */
const PAGE_ARGUMENTS = {
  limit: {
    type: 'integer',
    minimum: 1,
    default: DEFAULT_LIMIT,
    description: 'Rows to return. Raise it as far as you like — there is no ceiling.',
  },
  offset: { type: 'integer', minimum: 0, default: 0, description: 'Rows to skip first.' },
};

/**
 * Apply a per-row transform to whatever a handler returned.
 *
 * **The two shapes a dpm tool returns — one row, or a page of them — and nothing else.** A tool
 * returning a third shape passes through untransformed, which is why `defineTool` only ever hands
 * this the result of a tool that declared the thing being applied. Both wrappers below take that
 * same risk on the same terms, so the walk lives here once rather than being written twice and
 * gaining a third shape in only one of them.
 *
 * Exported for the third such wrapper, `withAccountedFor`, which lives in `src/coverage/` because
 * what it computes is a fact about coverage rather than about tools. The shape it walks is this
 * file's, though, and a copy of the walk over there is exactly the divergence this note warns
 * about — a paragraph explaining the risk is not the same thing as taking it once.
 *
 * @param {object} value
 * @param {(row: object) => object} row
 * @returns {unknown}
 */
export const overRows = (value: any, row: (r: any) => any) => (Array.isArray(value.items)
  ? { ...value, items: value.items.map(row) }
  : row(value));

/**
 * Drop the body columns from whatever a handler returned.
 *
 * @param {unknown} value
 * @param {string[]} body
 * @returns {unknown}
 */
export function withoutBody(value: unknown, body: string[]) {
  // The early return is load-bearing beyond speed: rebuilding a row here would turn `node:sqlite`'s
  // null-prototype rows into plain objects for every tool, body or no body, and strict deep-equal
  // treats those as different however identical their contents.
  if (body.length === 0 || value === null || typeof value !== 'object') return value;

  return overRows(value, (row) => Object.fromEntries(
    Object.entries(row).filter(([column]) => !body.includes(column)),
  ));
}

/**
 * The field a document row's human identifier arrives on.
 *
 * **Named because it is read somewhere other than where it is written.** It is not a column of any
 * table — FR1 asks for a field on the returned row and ENVX4 forbids a migration — so anything
 * needing to know dpm's returned-row vocabulary has nowhere else to look. `naming.test.js` is the
 * first such reader: NFR5 requires every tool name to be a whole word the schema holds, its check
 * builds that vocabulary from `PRAGMA table_info`, and `resolve_reference` is named for a word
 * that is real and is not a column. The rule was right and its reading was one epic out of date.
 */
export const REFERENCE_FIELD = 'reference';

/**
 * Put each document row's human identifier on it as `reference` (FR1).
 *
 * **The map is the argument, not the database.** The identifier of every document is one query
 * (`identifiers`), and computing it here per row would make a fifty-row page fifty-one round
 * trips — NFR1's bound, and the one criterion a per-row lookup would fail while satisfying every
 * other. Taking the map already built is what makes that impossible to get wrong here.
 *
 * **A document that cannot be named comes back with `null`, and the call returns normally**
 * (FR3). `identifiers` omits the rows it cannot derive — a `numbering = 'none'` document, a child
 * with no root-numbered ancestor, a parentage cycle — so an absent entry is the expected case
 * rather than an error, and a list never loses a row or raises because one row among its rows has
 * no name.
 *
 * @param {Map<string, string>} references id → identifier, from `identifiers(db)`.
 * @param {unknown} value One row, or a page of them.
 * @returns {unknown}
 */
export function withReference(references: Map<string, string>, value: unknown) {
  if (value === null || typeof value !== 'object') return value;

  return overRows(value, (row) => ({ ...row, [REFERENCE_FIELD]: references.get(row.id) ?? null }));
}

/** The JSON Schema keywords `validate` understands. Anything else in a schema is a mistake. */
const KEYWORDS = new Set(['type', 'properties', 'required', 'additionalProperties', 'enum',
  'description', 'default', 'minLength', 'minimum']);

const TYPES: Record<string, (value: unknown) => boolean> = {
  string: (value) => typeof value === 'string',
  integer: (value) => Number.isInteger(value),
  boolean: (value) => typeof value === 'boolean',
  object: (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
};

/**
 * Check arguments against a tool's `inputSchema` before any SQL runs.
 *
 * Deliberately a small validator over the subset of JSON Schema the tools use, rather than a
 * general one. A general validator is a dependency, and `package.json` declares none (NFR1); a
 * hand-rolled general validator is a large amount of code whose bugs would be silent. The
 * `KEYWORDS` guard is what keeps the subset honest — a schema reaching for a keyword this does
 * not implement fails loudly at registration instead of being ignored at call time, which is the
 * failure mode that makes partial validators worse than none.
 *
 * @param {object} schema
 * @param {object} args
 * @param {string} where The tool name, for the message.
 * @returns {object} The arguments, with defaults applied.
 * @throws {ToolError}
 */
export function validate(schema: InputSchema, args: Args, where: string): Args {
  if (!TYPES.object(args)) throw new ToolError(`${where}: arguments must be an object`);

  const properties = schema.properties ?? {};
  const required = schema.required ?? [];
  const checked: Args = {};

  for (const name of Object.keys(args)) {
    if (!Object.hasOwn(properties, name)) {
      throw new ToolError(`${where}: unknown argument '${name}'`);
    }
  }

  for (const name of required) {
    // `undefined` and absent are the same thing here, and both are the must-NOT's shape: a
    // caller that omits `class` must be refused, not defaulted into one. An explicit `null` is
    // refused with them: below it means *clear this column*, and a required column is one there
    // is no legal way to clear — caught here, naming the argument, rather than arriving as a
    // `NOT NULL` failure that names a column the caller never wrote.
    if (args[name] === undefined || args[name] === null) {
      throw new ToolError(`${where}: '${name}' is required`);
    }
  }

  for (const [name, rule] of Object.entries(properties)) {
    // **`default` is advertised, not applied.** JSON Schema's `default` is advisory — it tells a
    // client what omitting the argument will get them — and materialising it here would make an
    // absent argument indistinguishable from a supplied one by the time a handler sees it. On a
    // create tool that is merely redundant, since the handler supplies the same fallback. On an
    // *update* tool it is a silent data loss: `update_story_criterion({id})` would arrive
    // carrying `polarity: 'must'` and reset a `must_not` criterion nobody asked to change.
    const value = args[name];

    if (value === undefined) continue;

    // **An explicit `null` is a value, and it means clear this column.** Dropped here, as it was,
    // it reached the handler as an argument the caller had never sent: `update_x({id, title: 'New',
    // note: null})` moved the title, ignored the clear, and returned the updated row — success
    // reported, the field still holding what it held, and no error at any point. That is entry #15
    // of the false-pass register, and it is closed by carrying the null through rather than by a
    // check further down, because every check further down is reading arguments this function
    // decides the shape of. Type, enum, length and minimum are all skipped for it: none of them
    // describes a clear, and a `null` failing `type: 'string'` would refuse the very call this
    // exists to allow. What a clear may *not* do is empty a required argument — refused above —
    // or a `NOT NULL` column, which the database refuses by name.
    if (value === null) {
      checked[name] = null;
      continue;
    }

    if (rule.type && !TYPES[rule.type](value)) {
      throw new ToolError(`${where}: '${name}' must be ${rule.type}, got ${typeof value}`);
    }

    if (rule.enum && !rule.enum.includes(value)) {
      throw new ToolError(
        `${where}: '${name}' must be one of ${rule.enum.join(', ')} — got '${value}'`,
      );
    }

    if (rule.minLength !== undefined && value.length < rule.minLength) {
      throw new ToolError(`${where}: '${name}' must not be empty`);
    }

    if (rule.minimum !== undefined && value < rule.minimum) {
      throw new ToolError(`${where}: '${name}' must be at least ${rule.minimum}`);
    }

    checked[name] = value;
  }

  return checked;
}

/**
 * Register a tool, checking that it declares what the later stories will read.
 *
 * The checks here are cheap and they run at import time, so a descriptor missing a field fails
 * the moment the registry is built rather than when Story 5 or Story 7 reaches for it. That
 * matters more than it looks: `reads` and `serverSupplied` are consumed by assertions in other
 * stories, and a tool that quietly omitted one would make those assertions pass by covering less.
 *
 * @param {object} tool
 * @param {string} tool.name The **exported** name, `create_spec` — the harness makes it callable as
 *   `mcp__plugin_dpm_dpm__create_spec` (FR29). Matches NFR5's `[a-z]{3,}(_[a-z]{3,})*`; the word rule, that
 *   every part after the verb is schema vocabulary, is asserted in `naming.test.js`.
 * @param {string} tool.table The table the tool writes, or the primary one it reads.
 * @param {string[]} [tool.writes] Every table this tool inserts into or updates, where that is
 *   more than `table` alone. Four document kinds carry a detail table whose primary key **is**
 *   their document's (AD7), and their create tool writes both rows in one transaction — so
 *   `table` names one of the two and `writes` names both. It exists because the two checks that
 *   read a tool's tables would otherwise see half of what it writes: AD10's conformance seam
 *   would leave `adr.decision` unaccounted for, and the parity enumeration would report a detail
 *   table as having no create tool while a tool was creating its rows.
 *
 *   **On a tool that writes nothing it defaults to empty, and must stay empty.** Read, list and
 *   search tools declare `mutates: false`, and a `writes` naming their `table` would be a claim
 *   no call could make true — read by the parity enumeration as coverage a create tool has to
 *   supply. It went unnoticed while every non-mutating tool happened to declare a table that some
 *   create tool also wrote; `search` is the first that does not, since nothing may ever
 *   insert into an FTS index by hand.
 * @param {string} tool.description Shown by `tools/list`.
 * @param {object} tool.inputSchema Hand-written. See the note at the head of this file.
 * @param {string[]} tool.reads Tables this tool can return rows from — Story 5's reachability.
 * @param {Record<string, string>} [tool.serverSupplied] Columns the server fills, and how.
 * @param {string[]} [tool.body] Columns withheld unless `include_body` asks for them.
 * @param {boolean} [tool.paged] Whether the tool returns a page, and so takes `limit`/`offset`.
 * @param {boolean} tool.mutates Whether the tool writes. Required, and deliberately not derived
 *   from the verb in the name: NFR7 keeps a database from a newer plugin readable by serving its
 *   read tools and refusing its write ones, and the default a forgotten declaration would fall
 *   into is the one that writes to a schema this server does not understand.
 * @param {boolean} [tool.documentRows] Whether the rows this tool returns are `document` rows, and
 *   so carry a `reference` (FR1). Declared rather than inferred from `table`, because `table` names
 *   the table a tool *reads or writes* and a tool can read `document` while returning something
 *   else — a count, a preview, a hit. What the caller receives is the question here, and only the
 *   tool knows it.
 * @param {import('node:sqlite').DatabaseSync} [tool.db] The handle the reference is derived
 *   against. Required with `documentRows` and refused without it.
 * @param {(value: unknown) => unknown} [tool.derived] A field this tool computes rather than
 *   stores, applied to whatever the handler returned. It takes one row or a page of them, because
 *   a read and a list declare the same one — which is the point: a derived field that reached only
 *   one of them would be a field whose absence means two different things. Applied after the body
 *   strip, for `reference`'s reason: nothing derived is a body column, and a summary read still has
 *   to carry it.
 * @param {(args: object) => unknown} tool.handler Receives arguments already validated against
 *   `inputSchema` — see the wrapping below.
 * @returns {object} The tool, frozen.
 */
export function defineTool(tool: ToolDefinition) {
  const {
    name, table, description, reads, handler, body = [], paged = false, mutates,
    db = null, documentRows = false, derived = null,
  } = tool;
  const writes = tool.writes ?? (tool.mutates ? [table] : []);

  // Exported names carry no server prefix: the harness dispatches
  // `mcp__plugin_dpm_dpm__create_spec`, and it supplies everything up to the last `__` itself
  // (FR29) — the plugin name and the server key, which is why `dpm` appears in it twice. A `dpm`
  // part here would be a third, so the shape check refuses one rather than merely not requiring it.
  if (!/^[a-z]{3,}(_[a-z]{3,})*$/.test(name ?? '')) throw new Error(`not a dpm tool name: ${name}`);
  if (name.split('_').includes('dpm')) {
    throw new Error(`${name}: exported names carry no 'dpm' part — the harness prefixes them`);
  }
  if (!table) throw new Error(`${name}: no table declared`);
  if (!description) throw new Error(`${name}: no description — tools/list is how a caller finds it`);
  if (!Array.isArray(reads) || reads.length === 0) {
    throw new Error(`${name}: 'reads' is empty — Story 5 asserts reachability from it`);
  }
  if (typeof handler !== 'function') throw new Error(`${name}: no handler`);
  if (!Array.isArray(writes)) throw new Error(`${name}: 'writes' must be an array of table names`);
  // On a mutating tool `table` has to be among them, so the two declarations cannot describe
  // different tools. On a non-mutating one the list has to be empty, because anything in it is a
  // write the tool cannot perform and the parity enumeration will read as coverage.
  if (mutates && !writes.includes(table)) {
    throw new Error(`${name}: 'writes' must be an array of tables including '${table}'`);
  }
  if (!mutates && writes.length > 0) {
    throw new Error(`${name}: declares mutates: false and writes ${writes.join(', ')}`);
  }
  if (!Array.isArray(body)) throw new Error(`${name}: 'body' must be an array of column names`);
  // The two halves of FR1's declaration, refused apart rather than merged over. A tool claiming
  // document rows with no handle would attach nothing and look exactly like a tool that had no
  // documents to name; a handle on a tool that attaches nothing is a dependency it does not have,
  // and the next reader would take it as evidence the tool reads the database when it does not.
  if (documentRows && !db) {
    throw new Error(`${name}: declares documentRows and was given no 'db' to derive them from`);
  }
  if (db && !documentRows) {
    throw new Error(`${name}: takes a 'db' but does not declare documentRows — nothing uses it`);
  }
  if (typeof mutates !== 'boolean') {
    throw new Error(`${name}: 'mutates' must be declared — NFR7 serves reads to a database this `
      + 'server is too old for, and an undeclared tool would be served as one');
  }

  if (tool.inputSchema?.type !== 'object' || tool.inputSchema.additionalProperties !== false) {
    throw new Error(`${name}: inputSchema must be an object schema with additionalProperties false`);
  }

  // FR13's two arguments are added here rather than by each tool, so what a tool declares about
  // itself and what a caller may send cannot disagree. A tool that had written either by hand
  // would be redeclaring a convention, so it is refused rather than merged over.
  const supplied = {
    ...(body.length > 0 ? bodyArgument(body) : {}),
    ...(paged ? PAGE_ARGUMENTS : {}),
  };

  const declared = tool.inputSchema.properties ?? {};

  for (const property of Object.keys(supplied)) {
    if (Object.hasOwn(declared, property)) {
      throw new Error(`${name}: '${property}' comes from the convention — do not declare it`);
    }
  }

  const inputSchema = { ...tool.inputSchema, properties: { ...declared, ...supplied } };

  for (const [property, rule] of Object.entries(inputSchema.properties)) {
    for (const keyword of Object.keys(rule)) {
      if (!KEYWORDS.has(keyword)) {
        throw new Error(`${name}.${property}: '${keyword}' is not validated — see convention.js`);
      }
    }
  }

  // **Validation is wrapped on, not left to the handler.** Written the other way round, each
  // handler would call `validate` with a schema of its own — a second copy of `inputSchema` free
  // to drift from the declared one, and a handler that simply forgot the call would accept
  // anything while `tools/list` advertised a contract it did not keep. Here a tool cannot skip
  // it, and the schema a caller is checked against is by construction the schema it was shown.
  return Object.freeze({
    serverSupplied: {},
    ...tool,
    body,
    paged,
    writes,
    // The augmented schema, not the declared one: `tools/list` publishes this, and a caller
    // checked against a schema they were never shown is the drift the wrapping exists to prevent.
    inputSchema,
    handler: (args: Args) => {
      const checked = validate(inputSchema, args ?? {}, name);
      const result = handler(checked);

      // The default is the summary, and it is applied here rather than materialised in `validate`
      // — an absent argument and an explicit `false` mean the same thing to a read, and neither
      // may become a `true` the caller did not send.
      const shown = checked.include_body ? result : withoutBody(result, body);

      // **After the body strip, and once per call.** `reference` is derived rather than stored, so
      // it is not a body column and must survive a summary read — a caller that did not ask for
      // the bodies still needs to be able to name what came back. `identifiers` is called here
      // rather than per row: it is one query for the whole corpus, so the statement count for a
      // fifty-row page is the same as for a single read, and the same against a corpus of two
      // hundred documents as against one of ten.
      // Alongside `reference` and for the same reasons — derived rather than stored, so past the
      // body strip and once per call over whatever shape came back.
      const answered = derived ? derived(shown) : shown;

      // `!` because `documentRows` without a `db` was refused at load, several checks above.
      return documentRows ? withReference(identifiers(db!), answered) : answered;
    },
  });
}

/** A tool as `defineTool` returns one — derived from the function so the two cannot drift. */
export type Tool = ReturnType<typeof defineTool>;
