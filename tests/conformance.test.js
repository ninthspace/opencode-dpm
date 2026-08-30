/**
 * Story 7 — AD10's seam, and the ways a conformance test can be a decoration.
 *
 * AD10 rejected code generation on cost and named what that costs instead: two hand-written
 * definitions, and a test as the only thing holding them together. A test in that position has
 * two failure modes that look identical to passing, and both are asserted against here rather
 * than assumed away.
 *
 * **It can read the wrong thing.** Compared against the `.sql` files, the check compares a copy
 * of the DDL with the DDL — two texts in one working tree, agreeing by construction on any
 * machine that runs the suite, saying nothing about the database a project actually has. That is
 * the story's must-NOT, and the test for it below does not inspect how the checker is written: it
 * hands it a database whose live schema differs from the files and asserts it notices.
 *
 * **It can check nothing.** A sweep over an empty set passes. So the counts the checker returns
 * are asserted too, and the mutation guard at the end drives a real disagreement through it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openPlanningDatabase } from './support/planning-database.js';
import {
  checkSets, columnsOf, conformance, foreignKeyColumns, notNullNoDefault,
} from './support/conformance.js';
import { spineTools } from '../src/tools/index.ts';

function surface(t) {
  const db = openPlanningDatabase(t);

  return { db, tools: spineTools(db) };
}

// --- The report ------------------------------------------------------------------------------------

test('every tool conforms to the schema the live database holds', (t) => {
  const { db, tools } = surface(t);
  const { problems, checked } = conformance(db, tools);

  assert.deepEqual(problems, []);

  // The counts, because an empty report and a comparison with nothing in it are the same
  // observation otherwise — and "nothing in it" is what this check degrades to if a registry
  // stops declaring `table`, or if every tool's table stops matching a live one.
  assert.ok(checked.tools >= 40, `only ${checked.tools} tools reached the check`);
  assert.ok(checked.tables >= 9, `only ${checked.tables} tables were compared`);
  assert.ok(checked.enums >= 15, `only ${checked.enums} enums were compared`);
});

test('the check reads the schema through PRAGMA and sqlite_schema, not through the files', (t) => {
  const { db, tools } = surface(t);

  // Read back out of the connection and compared with what the pragmas say, so the two sources
  // this check is built from are shown agreeing about the same table.
  const columns = columnsOf(db, 'requirement').map((column) => column.name);

  assert.ok(columns.includes('class') && columns.includes('moscow'));
  assert.deepEqual(notNullNoDefault(db, 'requirement').sort(),
    ['class', 'id', 'label', 'position', 'spec_id', 'text']);
  assert.deepEqual(foreignKeyColumns(db, 'requirement').sort(),
    ['parent_id', 'spec_id', 'spec_kind']);

  assert.deepEqual([...checkSets(db, 'requirement').get('moscow')].sort(),
    ['could', 'must', 'should', 'wont']);

  // A `CHECK` that constrains without enumerating is deliberately not a set: there is nothing for
  // a tool's `enum` to be equal to, and treating `spec_kind = 'spec'` as a one-value enum would
  // demand an argument the column exists to make impossible.
  assert.equal(checkSets(db, 'requirement').has('spec_kind'), false);

  assert.ok(conformance(db, tools).checked.enums > 0);
});

// --- must NOT: comparing against a second copy of the DDL ------------------------------------------

test('a live schema that differs from the files is caught, which a copy could not be', (t) => {
  const { tools } = surface(t);

  // A database built by hand whose `requirement` table admits three classes where the shipped DDL
  // admits four. Nothing on disk changed, so a check reading the `.sql` files would compare the
  // tools against the shipped set and report conformance — which is precisely the false pass the
  // must-NOT describes. Reading `sqlite_schema` sees the table that is actually there.
  const drifted = new DatabaseSync(':memory:');
  t.after(() => drifted.close());

  drifted.exec(`CREATE TABLE requirement (
    id TEXT NOT NULL PRIMARY KEY,
    spec_id TEXT NOT NULL,
    label TEXT NOT NULL,
    class TEXT NOT NULL CHECK (class IN ('functional','non_functional','environmental_requirement')),
    moscow TEXT CHECK (moscow IN ('must','should','could','wont')),
    exclusion TEXT CHECK (exclusion IN ('deferred','out_of_scope')),
    parent_id TEXT,
    text TEXT NOT NULL,
    position INTEGER NOT NULL
  )`);

  // Scoped to the create tool: `update_requirement` declares the same `class` enum, so the
  // whole table's registry would report the same drift twice and say nothing more.
  const requirementTools = tools.filter((tool) => tool.name === 'create_requirement');
  const { problems, checked } = conformance(drifted, requirementTools);

  assert.ok(checked.enums > 0, 'the drifted table was not compared at all');
  assert.equal(problems.length, 1, `expected one disagreement, got: ${problems.join(' | ')}`);
  assert.match(problems[0], /create_requirement: 'class' declares \[.*environmental_restriction/);
  assert.match(problems[0], /requirement\.class admits \[/);

  // The control: against the real schema the same tools report nothing, so the failure above is
  // the drift and not the tools being unconformant everywhere.
  const { db } = surface(t);
  assert.deepEqual(conformance(db, requirementTools).problems, []);
});

test('a column added to the live schema and to no tool is reported', (t) => {
  const { db, tools } = surface(t);

  // The case a copy of the DDL cannot see at all: a migration this server has not caught up with.
  // `ALTER TABLE` needs a default for a NOT NULL column, so the drift is driven through a table
  // built to have one — the shape a later release's new column arrives in.
  const drifted = new DatabaseSync(':memory:');
  t.after(() => drifted.close());

  drifted.exec(`CREATE TABLE story_criterion (
    id TEXT NOT NULL PRIMARY KEY,
    story_id TEXT NOT NULL,
    text TEXT NOT NULL,
    polarity TEXT NOT NULL DEFAULT 'must' CHECK (polarity IN ('must','must_not','control')),
    position INTEGER NOT NULL,
    approach TEXT NOT NULL
  )`);

  const { problems } = conformance(drifted,
    tools.filter((tool) => tool.name === 'create_story_criterion'));

  assert.equal(problems.length, 1);
  assert.match(problems[0], /story_criterion\.approach is NOT NULL with no default/);

  assert.deepEqual(
    conformance(db, tools.filter((tool) => tool.name === 'create_story_criterion')).problems,
    [],
  );
});

// --- The mutation Story 2 could not catch ----------------------------------------------------------

test('a required argument dropped from a create tool fails here, as Story 2 said it must', (t) => {
  const { db, tools } = surface(t);

  // **The escape recorded on Story 2, verified at the story that owns the guard.** Dropping
  // `spec_fragment` from `create_coverage`'s `required` survived a sweep that refuses each
  // declared required argument in turn, because the sweep reads `required` and the mutation
  // removed the entry it would have tested. A test that reads the *table* cannot be evaded that
  // way: the column is `NOT NULL` with no default whatever the tool says about it.
  const coverage = tools.find((tool) => tool.name === 'create_coverage');
  const mutated = {
    ...coverage,
    inputSchema: {
      ...coverage.inputSchema,
      required: coverage.inputSchema.required.filter((name) => name !== 'spec_fragment'),
    },
  };

  const { problems } = conformance(db, [mutated]);

  assert.equal(problems.length, 1, problems.join(' | '));
  assert.match(problems[0], /coverage\.spec_fragment is NOT NULL with no default/);

  // The control: the tool as written reports nothing, so the failure is the dropped entry.
  assert.deepEqual(conformance(db, [coverage]).problems, []);

  // And the same holds for every other required argument on every spine create tool — one at a
  // time, so a rule that only caught `spec_fragment` would fail here.
  const creates = tools.filter((tool) => tool.name.startsWith('create_'));
  let caught = 0;

  for (const tool of creates) {
    const nonNull = new Set(notNullNoDefault(db, tool.table));

    for (const argument of tool.inputSchema.required.filter((name) => nonNull.has(name))) {
      const without = {
        ...tool,
        inputSchema: {
          ...tool.inputSchema,
          required: tool.inputSchema.required.filter((name) => name !== argument),
        },
      };

      assert.ok(conformance(db, [without]).problems.length > 0,
        `${tool.name} without '${argument}' was reported conformant`);
      caught += 1;
    }
  }

  assert.ok(caught >= 15, `only ${caught} required arguments were dropped and re-checked`);
});

test('an enum that drifts from its column is caught in both directions', (t) => {
  const { db, tools } = surface(t);
  const criterion = tools.find((tool) => tool.name === 'create_story_criterion');

  const withEnum = (values) => ({
    ...criterion,
    inputSchema: {
      ...criterion.inputSchema,
      properties: {
        ...criterion.inputSchema.properties,
        polarity: { ...criterion.inputSchema.properties.polarity, enum: values },
      },
    },
  });

  // A value the tool offers and the `CHECK` rejects: validation in the wrong layer, and a call
  // the boundary accepts only for the database to refuse it.
  const tooWide = conformance(db, [withEnum(['must', 'must_not', 'control', 'maybe'])]).problems;
  assert.equal(tooWide.length, 1);
  assert.match(tooWide[0], /declares \[control,maybe,must,must_not\]/);

  // A value the `CHECK` admits and no tool offers: a column the pipeline cannot reach. The same
  // assertion catches it, which is what "in both directions" means here.
  const tooNarrow = conformance(db, [withEnum(['must', 'must_not'])]).problems;
  assert.equal(tooNarrow.length, 1);
  assert.match(tooNarrow[0], /story_criterion\.polarity admits \[control,must,must_not\]/);

  // And an enum declared on something that is not a column at all — the typo that is otherwise
  // invisible, because `validate` passes the argument through and the insert names a column the
  // caller never heard of.
  const stray = conformance(db, [{
    ...criterion,
    inputSchema: {
      ...criterion.inputSchema,
      properties: { ...criterion.inputSchema.properties, polarityy: { type: 'string', enum: ['must'] } },
    },
  }]).problems;

  assert.equal(stray.length, 1);
  assert.match(stray[0], /'polarityy' declares an enum but is not a column of story_criterion/);

  assert.deepEqual(conformance(db, [criterion]).problems, []);
});

test('a foreign key no tool can set is reported', (t) => {
  const { db, tools } = surface(t);
  const create = tools.find((tool) => tool.name === 'create_epic');

  // `parent_id` is how an epic names its spec. Removed from both the arguments and the declared
  // server-supplied set, the column becomes one nothing in the registry admits to filling — the
  // state `create_spec` was actually in until this story found it.
  const { parent_id: dropped, ...properties } = create.inputSchema.properties;
  const { parent_kind: alsoDropped, ...serverSupplied } = create.serverSupplied;

  const { problems } = conformance(db, [{
    ...create,
    serverSupplied,
    inputSchema: {
      ...create.inputSchema,
      properties,
      required: create.inputSchema.required.filter((name) => name !== 'parent_id'),
    },
  }]);

  assert.ok(problems.some((problem) => /document\.parent_id is a foreign key with no argument/.test(problem)),
    problems.join(' | '));
  assert.ok(problems.some((problem) => /document\.parent_kind/.test(problem)));

  assert.deepEqual(conformance(db, [create]).problems, []);
});
