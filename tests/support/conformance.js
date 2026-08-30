/**
 * AD10's seam, read from the database rather than from a second copy of the DDL.
 *
 * AD10 chose a conformance test over code generation, on cost rather than merit, and named the
 * consequence: the tool schemas and the DDL are two hand-written definitions and this is the only
 * thing holding them together. That makes *where the comparison reads from* the whole of the
 * decision. Against the `.sql` files it would be a second copy of the DDL compared with a first —
 * two texts in one working tree, which agree by construction on any machine running the suite and
 * say nothing about the database a project actually has. Against the open connection it is the
 * schema as SQLite holds it, after every migration that has been applied to it.
 *
 * So everything here comes from one of three places, all of them the live connection:
 * `PRAGMA table_info` for nullability and defaults, `PRAGMA foreign_key_list` for the references,
 * and `sqlite_schema.sql` for the `CHECK` sets — which the pragmas do not expose, and which is
 * still the database's own record of itself rather than a file beside it.
 *
 * It lives in `support/` because it opens nothing and asserts nothing: it reads a schema and a
 * registry and reports what disagrees. Story 7 asserts the report is empty; Story 8 asserts it is
 * empty against the tools the server actually registered.
 */

/** Every column of a table, as SQLite describes it. */
export function columnsOf(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all();
}

/** The columns that must be supplied on an insert: `NOT NULL` and no default to fall back on. */
export function notNullNoDefault(db, table) {
  return columnsOf(db, table)
    .filter((column) => column.notnull === 1 && column.dflt_value === null)
    .map((column) => column.name);
}

/** Every column on this table that references another, from the live foreign key list. */
export function foreignKeyColumns(db, table) {
  // Deduplicated: a column carried by two references — `document.parent_kind` is in the composite
  // key and in its own — is one column to account for, not two.
  return [...new Set(db.prepare(`PRAGMA foreign_key_list(${table})`).all().map((key) => key.from))];
}

/**
 * The `CHECK (column IN (…))` sets a table declares, as `{column: Set<value>}`.
 *
 * Parsed out of `sqlite_schema.sql` because no pragma reports constraints — and that text is what
 * the database holds, not a file this test could have read instead. A `CHECK` of another shape
 * (`spec_kind = 'spec'`, or the paired-null checks) is deliberately not matched: it constrains a
 * column without enumerating it, so there is no set for a tool's `enum` to be equal to.
 */
export function checkSets(db, table) {
  const { sql } = db.prepare('SELECT sql FROM sqlite_schema WHERE name = ?').get(table) ?? {};
  const sets = new Map();

  if (!sql) return sets;

  for (const [, column, list] of sql.matchAll(/CHECK\s*\(\s*(\w+)\s+IN\s*\(([^)]*)\)\s*\)/g)) {
    sets.set(column, new Set(
      list.split(',')
        .map((value) => value.trim().replace(/^'|'$/g, ''))
        .filter((value) => value.length > 0),
    ));
  }

  return sets;
}

const sorted = (values) => [...values].sort();

/**
 * Compare a registry against the schema it writes, and report every disagreement.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {object[]} tools
 * @returns {{problems: string[], checked: {tools: number, tables: number, enums: number}}}
 *   The counts are returned so a caller can tell an empty report from a comparison that had
 *   nothing to compare — which is the shape a conformance test fails silently in.
 */
export function conformance(db, tools) {
  const problems = [];
  const live = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all()
    .map((row) => row.name));

  const tables = new Set();
  let enums = 0;

  for (const tool of tools) {
    if (!live.has(tool.table)) continue;

    // **Every table the tool writes, not only the one it is filed under.** A create tool for one
    // of AD7's four structured kinds writes its `document` row and its detail row in a single
    // transaction, and `writes` is where it says so. Read against `table` alone this check would
    // pass over `adr.decision` — `NOT NULL` with no default, filled by a tool the check had
    // decided writes only `document`. Tools that write one table declare `writes: [table]` by
    // default, so nothing below behaves differently for them.
    const written = (tool.writes ?? [tool.table]).filter((name) => live.has(name));

    for (const name of written) tables.add(name);

    const properties = tool.inputSchema.properties ?? {};
    const columns = new Map(written.flatMap((name) =>
      columnsOf(db, name).map((column) => [column.name, { ...column, table: name }])));
    const sets = new Map(written.flatMap((name) =>
      [...checkSets(db, name)].map(([column, values]) => [column, { values, table: name }])));

    // **Every argument that names a column must name one that exists.** A typo here is otherwise
    // invisible: the argument is accepted, `validate` passes it through, and the insert fails on a
    // column the caller never heard of.
    for (const [name, rule] of Object.entries(properties)) {
      if (['limit', 'offset', 'include_body'].includes(name)) continue;

      // An argument may legitimately not be a column — `predecessor_id`, `parent_id` on a
      // document create — so an unknown name is only a problem when it carries an enum, which
      // is a claim about a column's `CHECK` set.
      if (rule.enum && !columns.has(name)) {
        problems.push(`${tool.name}: '${name}' declares an enum but is not a column of ${written.join(', ')}`);
        continue;
      }

      if (!rule.enum || !columns.has(name)) continue;

      enums += 1;

      const owner = columns.get(name).table;
      const declared = sorted(rule.enum);
      const constrained = sorted(sets.get(name)?.values ?? []);

      if (constrained.length === 0) {
        problems.push(`${tool.name}: '${name}' declares an enum but ${owner}.${name} has no CHECK set`);
      } else if (declared.join('|') !== constrained.join('|')) {
        // Both directions in one comparison: a value the tool offers and the `CHECK` rejects is
        // validation in the wrong layer, and a value the `CHECK` admits and no tool offers is a
        // column the pipeline cannot reach. Neither is acceptable, so it is equality.
        problems.push(`${tool.name}: '${name}' declares [${declared}] but `
          + `${owner}.${name} admits [${constrained}]`);
      }
    }

    if (!tool.name.startsWith('create_')) continue;

    const required = new Set(tool.inputSchema.required ?? []);
    const supplied = new Set(Object.keys(tool.serverSupplied ?? {}));

    for (const name of written) {
      // AD10's rule, with `serverSupplied` as the declared other half. A column that is `NOT NULL`
      // with no default has to come from somewhere, and there are exactly two somewheres: the
      // caller, or this server. What it may not be is neither, silently — which is what a column
      // added to a table by a later migration would be.
      for (const column of notNullNoDefault(db, name)) {
        if (!required.has(column) && !supplied.has(column)) {
          problems.push(`${tool.name}: ${name}.${column} is NOT NULL with no default and is `
            + 'neither a required argument nor declared serverSupplied');
        }
      }

      // Every reference reachable. A foreign key nothing can set is a row that can only ever point
      // at whatever its default happens to be — and where that default is the only legal value, the
      // column is pinned rather than unreachable, which is why a default counts as an answer here.
      for (const column of foreignKeyColumns(db, name)) {
        const defaulted = columns.get(column)?.dflt_value !== null;

        if (!Object.hasOwn(properties, column) && !supplied.has(column) && !defaulted) {
          problems.push(`${tool.name}: ${name}.${column} is a foreign key with no argument, `
            + 'no serverSupplied declaration and no default');
        }
      }
    }
  }

  return { problems, checked: { tools: tools.length, tables: tables.size, enums } };
}
