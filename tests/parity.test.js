/**
 * Story 1's enumeration — the live table list against the live registry, in both directions.
 *
 * FR3 makes the tool surface the only write path, so a table with no create tool is storage
 * nothing can put a row in. FR10 asks for every artefact type CPM produces to be modelled from the
 * outset, and AD6 accepted a large schema up front on exactly that basis. What closes the gap
 * between the two is a comparison where **neither side is a hand-kept enumeration**: the tables
 * come from `sqlite_master` and the coverage comes from what the registry declares it writes.
 *
 * **Why the table-level check is not enough on its own, and this is not hindsight.** It enumerates
 * *tables*, and thirteen document kinds share one. Through Epic 47-03 the `document` table had
 * create tools — `spec` and `epic` — while eleven kinds had none, and the table-level check would
 * have reported that as covered. The breakdown that was written to close it named ten of the
 * eleven. So there is a second check over `document_kind`, and the mutation at the foot of this
 * file drives that exact state through both to show which one catches it.
 *
 * **Every exemption is spent-checked.** `NO_CREATE_TOOL` carries a reason per table and is
 * asserted to name only tables that still have no tool. A deferral that outlives the work it
 * defers to is how an exemption list becomes permanent without anyone deciding that it should.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase } from './support/planning-database.js';
import { authoredTables } from './support/introspection.js';
import { spineTools } from '../src/tools/index.ts';
import { documentTools } from '../src/tools/spine/document.ts';
import { DETAIL } from '../src/tools/spine/detail.ts';

function surface(t) {
  const db = openPlanningDatabase(t);

  return { db, tools: spineTools(db) };
}

/**
 * The tables no `create_*` tool writes, and why.
 *
 * Every entry is checked to be **unspent** below: an exemption naming a table that has acquired a
 * tool fails until it is deleted. That is what lets a *deferral* be written here safely — Story 1
 * left seven entries naming Story 2's vocabularies, and when Story 2 registered their tools this
 * check failed and the entries went. A deferral that cannot outlive the work it defers to is the
 * difference between deferring and quietly exempting.
 *
 * What is left is five standing exemptions, and each names why a caller must never write the
 * table at all.
 */
const NO_CREATE_TOOL = Object.freeze({
  schema_version:
    'standing — the migration runner writes it. A create tool would let a caller declare a '
    + 'schema version the database does not have, which is the one row NFR7 reads to decide '
    + 'whether it may write at all.',
  number_sequence:
    'standing — FR5 allocates numbers and never accepts one. A create tool here is the '
    + 'reuse the requirement exists to prevent, offered as an argument.',
  document_kind:
    'standing — seeded structure, not a vocabulary. A kind\'s create tool is *named for the '
    + 'kind*, so a kind added by a caller would have no tool and would fail the kind-level '
    + 'check below. This table is the parity contract the enumeration reads, not something '
    + 'the enumeration covers.',
  document_kind_parent:
    'standing — the allow-list the composite foreign key resolves against, seeded with the '
    + 'kinds it constrains. It is meaningless without a `document_kind` row it can name.',
  dependency_kind_endpoint:
    'standing — the allow-list register entry 6 resolves an edge\'s ends against, seeded with the '
    + 'pairs the skills write. Like `document_kind_parent` it is meaningless without the rows it '
    + 'constrains, and a caller able to add a pair could admit the edge it was about to make.',
  plugin_stamp:
    'standing — the server writes it on start, from its own version. A create tool would let a '
    + 'caller declare a plugin version that never wrote to this database, which is the one value '
    + 'the backward-skew check reads to decide whether it is stale.',
});

/**
 * Every table a create tool could write, which is every table dpm authored.
 *
 * Delegated to `authoredTables` rather than kept as a second query, because the exclusion this
 * needs is not obvious and is easy to get subtly wrong: Epic 47-05 Story 3 added `document_fts`
 * and SQLite added five shadow tables beside it, and *none* of the six can have a create tool —
 * an index is derived from the table it indexes, and FR3's "the tool surface is the only write
 * path" is about rows a person authors. Enumerated here with its own query, this check reported
 * six tables with no create tool and no stated exemption, which would have been closed either by
 * six exemptions that are not exemptions or by six tools that must not exist.
 */
const liveTables = (db) => authoredTables(db);

/**
 * The tables some create tool writes, read off the registry.
 *
 * `writes` and not `table`, because a create tool for one of AD7's structured kinds writes its
 * `document` row and its detail row together and says so. Read off `table` alone this would report
 * `adr` as having no create tool while `create_adr` was creating its rows.
 */
const created = (tools) => new Set(
  tools.filter((tool) => tool.name.startsWith('create_')).flatMap((tool) => tool.writes),
);

/** The kinds some `create_<kind>` tool names, read off the registry. */
const createdKinds = (tools) => new Set(
  tools
    .filter((tool) => tool.name.startsWith('create_') && tool.table === 'document')
    .map((tool) => tool.name.replace('create_', '')),
);

const seededKinds = (db) =>
  db.prepare('SELECT kind FROM document_kind ORDER BY kind').all().map((row) => row.kind);

/**
 * The detail tables, found in the schema rather than listed here.
 *
 * A detail table is one whose composite foreign key is `(document_id, document_kind)` into
 * `document(id, kind)` **and whose whole primary key is `document_id`** — the shape
 * `002-detail.sql` uses to make the one-to-one structural. The kind it is pinned to is its
 * `document_kind` default, which is the same value its `CHECK` admits.
 *
 * **The primary key is what separates a detail table from a child table with a pinned parent.**
 * `document_agent` carries the same composite key into `document` and is not detail: its primary
 * key is `(document_id, agent)`, so a document has any number of the rows rather than exactly one,
 * and its `CHECK` admits two kinds rather than defaulting to one. Matching on the foreign key
 * alone counted it as a fifth detail table, which is the reading AD7 does not support — a detail
 * row cannot exist without its document, cannot outlive it, and *cannot be duplicated*, and only
 * the key delivers the third of those.
 */
function detailTables(db) {
  const found = new Map();

  for (const table of liveTables(db)) {
    const references = db.prepare(`PRAGMA foreign_key_list(${table})`).all();
    const composite = new Map();

    for (const key of references) {
      if (key.table !== 'document') continue;
      if (!composite.has(key.id)) composite.set(key.id, []);
      composite.get(key.id).push(key.from);
    }

    const pairs = [...composite.values()].filter((columns) =>
      columns.length === 2
      && columns.includes('document_id')
      && columns.includes('document_kind'));

    if (pairs.length === 0) continue;

    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    const primary = columns.filter((column) => column.pk > 0).map((column) => column.name);

    if (primary.length !== 1 || primary[0] !== 'document_id') continue;

    const pinned = columns.find((column) => column.name === 'document_kind')?.dflt_value;

    found.set(table, pinned?.replace(/^'|'$/g, '') ?? null);
  }

  return found;
}

// --- Criterion 1: every table has a create tool -------------------------------------------------

test('every table in sqlite_master is written by some create tool', (t) => {
  const { db, tools } = surface(t);
  const covered = created(tools);
  const tables = liveTables(db);

  assert.ok(tables.length > 30, `only ${tables.length} tables were enumerated`);

  const uncovered = tables
    .filter((table) => !covered.has(table))
    .filter((table) => !Object.hasOwn(NO_CREATE_TOOL, table))
    .sort();

  assert.deepEqual(uncovered, [], 'these tables have no create tool and no stated exemption');
});

test('every stated exemption is unspent and names a table that exists', (t) => {
  const { db, tools } = surface(t);
  const covered = created(tools);
  const tables = new Set(liveTables(db));

  for (const [table, reason] of Object.entries(NO_CREATE_TOOL)) {
    // The spent check. A deferral whose story has landed is covered, and this fails until the
    // entry is deleted — which is the difference between deferring work and exempting a table.
    assert.equal(covered.has(table), false,
      `'${table}' now has a create tool, so its exemption is spent and should be deleted — ${reason}`);

    // And a name that no longer matches a table is an exemption for something that has been
    // renamed or dropped, which reads as coverage while covering nothing.
    assert.ok(tables.has(table), `'${table}' is exempted and is not a table in this schema — ${reason}`);
  }
});

// --- Criterion 1, second reading: every kind has a create tool ----------------------------------

test('every seeded document kind has a create tool named for it', (t) => {
  const { db, tools } = surface(t);
  const tooled = createdKinds(tools);
  const kinds = seededKinds(db);

  assert.ok(kinds.length >= 13, `only ${kinds.length} document kinds were enumerated`);

  assert.deepEqual(kinds.filter((kind) => !tooled.has(kind)), [],
    'these document kinds have no create tool, and the table-level check cannot see them');
});

test('the four kinds with a detail table are wired to it, and no fifth is unwired', (t) => {
  const { db } = surface(t);
  const detail = detailTables(db);

  assert.equal(detail.size, 4, `expected four detail tables, found ${[...detail.keys()].join(', ')}`);

  // From the schema to the map: a kind that gains a detail table and no `DETAIL` entry would have
  // its document created and its detail row left unwritten — legal by every constraint, and a
  // half-made artefact every reader has to guess at. This is what the kind-level check above
  // cannot see, because such a kind still has all three of its tools.
  for (const [table, kind] of detail) {
    assert.ok(kind, `${table} pins no document_kind, so nothing can say which kind it belongs to`);
    assert.ok(DETAIL[kind], `${table} is a detail table and kind '${kind}' has no DETAIL entry`);
    assert.equal(DETAIL[kind].table, table, `DETAIL['${kind}'] names ${DETAIL[kind].table}, not ${table}`);
  }

  // And back: an entry naming a table that is not one of these is a mapping to nothing.
  for (const [kind, entry] of Object.entries(DETAIL)) {
    assert.equal(detail.get(entry.table), kind,
      `DETAIL['${kind}'] names ${entry.table}, which the schema does not pin to '${kind}'`);
  }
});

// --- The reverse: nothing declares a table or a kind that is not there --------------------------

test('no tool declares a table or a kind the database does not have', (t) => {
  const { db, tools } = surface(t);
  const kinds = new Set(seededKinds(db));

  // Existence asked of the connection rather than of the table list above, because that list
  // deliberately excludes SQLite's own — and `check_integrity` legitimately reads
  // `sqlite_schema`, which is not a row in `sqlite_master` under any name.
  const exists = (name) => db.prepare(`PRAGMA table_info(${name})`).all().length > 0;

  for (const tool of tools) {
    for (const table of [tool.table, ...tool.writes, ...tool.reads]) {
      assert.ok(exists(table), `${tool.name} declares '${table}', which is not a table`);
    }
  }

  for (const kind of createdKinds(tools)) {
    assert.ok(kinds.has(kind), `create_${kind} names a kind that is not seeded`);
  }
});

// --- The mutation: the state Epic 47-03 left, driven through both checks -------------------------

test('a registry that tools two kinds passes the table check and fails the kind check', (t) => {
  const { db } = surface(t);
  const context = { db, now: () => '2026-08-09T00:00:00.000Z', newId: () => 'x' };

  // The registry as it stood before this story: `document` reachable through two kinds, and every
  // other kind with no tool at all. Built by hand here precisely because `spineTools` no longer can —
  // it reads the kinds from `document_kind`, which is what makes the omission unrepeatable.
  const partial = [
    ...documentTools(context, { kind: 'spec' }),
    ...documentTools(context, { kind: 'epic' }),
  ];

  // The table-level check sees nothing wrong, because `document` has create tools.
  assert.equal(created(partial).has('document'), true);

  // The kind-level check names every one of them. This asymmetry is the whole reason the second
  // check exists, and asserting it here is what stops the second check being mistaken for a
  // restatement of the first.
  //
  // Counted against the seeded set rather than pinned to a number, because the number is not what
  // the check is about: a kind seeded tomorrow gets tools from `spineTools` and no tools from this
  // hand-built pair, so a literal here would fail on a correct change and teach the next reader to
  // bump it. The two named kinds are the ones with tools; everything else must be missing.
  const missing = seededKinds(db).filter((kind) => !createdKinds(partial).has(kind));

  assert.equal(missing.length, seededKinds(db).length - 2,
    `every kind but spec and epic should be untooled, got ${missing.join(', ')}`);
  assert.ok(missing.includes('coverage_matrix'),
    'coverage_matrix is the kind this story\'s own breakdown omitted, and the check must name it');
});

test('a create tool that stops declaring a detail table it writes is caught', (t) => {
  const { db, tools } = surface(t);

  // `create_adr` writes `document` and `adr`. Narrowed to `document` alone — the shape the
  // registry would have if `writes` were dropped and `table` read instead — `adr` becomes a table
  // with no create tool, and the enumeration says so.
  const narrowed = tools.map((tool) => (tool.name === 'create_adr'
    ? { ...tool, writes: ['document'] }
    : tool));

  const uncovered = liveTables(db)
    .filter((table) => !created(narrowed).has(table))
    .filter((table) => !Object.hasOwn(NO_CREATE_TOOL, table));

  assert.deepEqual(uncovered, ['adr']);

  // The control: undisturbed, the same sweep reports nothing.
  assert.deepEqual(
    liveTables(db)
      .filter((table) => !created(tools).has(table))
      .filter((table) => !Object.hasOwn(NO_CREATE_TOOL, table)),
    [],
  );
});
