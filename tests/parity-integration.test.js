/**
 * Story 6 — the five seams no story in this epic can see from inside itself.
 *
 * Every story here was checkable alone and each of them was. What none of them observes is the
 * *other*: Story 1 built create tools and Epic 47-04 built templates, and FR10 is the conjunction
 * of the two; Story 2 built retirement guards and Epic 47-03 built the refusal translation, and a
 * caller only ever meets the composition; Stories 3–5 built two indexes, a tool over them and a
 * dump that carries them, and the seam between those is a hit that opens nothing.
 *
 * **Three real defects came out of this file, and none of them was findable one story earlier.**
 * A retirement abort reached the caller as *Internal error* because `RAISE(ABORT, …)` carries no
 * word the translation layer was matching on. The epic template rendered `**Blocked by**: —` for
 * an edge of a project-added kind, because it filtered on the name `blocks` while `readiness.js`
 * — whose own docblock warns against exactly that — read `gates_work`. And the refusal named the
 * column and never the item, so a caller had to work out what they had done from their own call.
 * All three passed 399 tests. That is the argument for a cross-story story existing at all.
 *
 * **The fixture writes through tools and only through tools.** `corpus.js` writes eleven kinds by
 * `INSERT` and was right to when it was written; using it here would satisfy the template half of
 * FR10 while saying nothing about the create-tool half, which is the half this epic built. See
 * `support/tool-corpus.js`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { openDatabaseFile } from './support/database.js';
import { authoredTables } from './support/introspection.js';
import { toolCorpus, WITNESS } from './support/tool-corpus.js';
import { dump } from '../src/dump/index.ts';
import { restore } from '../src/restore/index.ts';
import { project, renderDocument } from '../src/projection/index.ts';
import { spineTools } from '../src/tools/index.ts';

function surface(t) {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  return { db, tools, call: handlers(tools) };
}

function refused(run) {
  let caught;

  try {
    run();
  } catch (error) {
    caught = error;
  }

  assert.ok(caught, 'the call was accepted when it should have been refused');
  return caught;
}

/**
 * Everything the projection produces, as one string.
 *
 * The ADR is rendered explicitly and appended. It is the one seeded kind with no file of its own,
 * so `project` never returns it — and a criterion that says "or inside its parent's, for the ten
 * that produce no file **and for the ADR**" is not satisfied by output that never contained it.
 */
function projectedText(db) {
  const { written } = project(db, { write: false });
  const inline = db
    .prepare("SELECT id FROM document WHERE kind = 'adr' ORDER BY id")
    .all()
    .map((row) => renderDocument(db, row.id).text);

  return [...written.map((file) => file.text), ...inline].join('\n');
}

/** The entities `entry_fts` tags, read off the triggers — Story 4's enumeration, reused. */
const entryEntities = (db) => db
  .prepare(`SELECT DISTINCT tbl_name FROM sqlite_schema
             WHERE type = 'trigger' AND sql LIKE '%entry_fts%' ORDER BY tbl_name`)
  .all()
  .map((row) => row.tbl_name);

// --- Criterion 1: every indexed type, written by a tool and found by one search -----------------

test('one row of every indexed type is written by its tool and found by a single search', (t) => {
  const { db, call } = surface(t);

  // The enumeration is the schema's, not a list here: `document_section` plus whatever `entry_fts`
  // tags. A table indexed by a later migration joins this set on the day it lands, and a table
  // indexed with no create tool to write it fails at the write rather than being skipped.
  const indexed = ['document_section', ...entryEntities(db)];

  assert.ok(indexed.length >= 16, `only ${indexed.length} indexed types — the enumeration is wrong`);

  const spec = call.create_spec({ slug: 'lodestone', title: 'Lodestone' });
  const epic = call.create_epic({ parent_id: spec.id, slug: 'find', title: 'Find' });
  const story = call.create_story({
    epic_id: epic.id, number: 1, title: 'Find', position: 0,
  });
  const requirement = call.create_requirement({
    spec_id: spec.id, label: 'FR9', class: 'functional', position: 0, text: 'lodestone requirement',
  });
  const review = call.create_review({ parent_id: spec.id, slug: 'find', title: 'Review' });
  const retro = call.create_retro({ parent_id: epic.id, slug: 'find', title: 'Retro' });
  const adr = call.create_adr({
    parent_id: spec.id, slug: 'find', title: 'ADR', decision: 'a lodestone decision',
  });
  const audit = call.create_audit({ slug: 'find', title: 'Audit' });
  const quick = call.create_quick({ slug: 'find', title: 'Quick' });

  // A second criterion, for `coverage` to bind. The map's own `story_criterion` entry takes
  // position 0 and `UNIQUE (story_id, position)` will not have it twice, so the binding gets one of
  // its own rather than depending on the order the map happens to be walked in.
  const bound = call.create_story_criterion({
    story_id: story.id, position: 1, text: 'a bound story criterion',
  });

  // One row per indexed type, each through the type's own create tool and each carrying the same
  // term. Written as a map keyed by the enumerated name so a type nobody wrote is a failure here
  // rather than an entity quietly missing from the search below. Each entry returns the value the
  // hit will carry as `entity_id`, which is the row's key as declared and is not `id` everywhere —
  // `adr` is keyed by its document and `agent` by its name.
  const written = {
    document_section: () => call.create_document_section({
      document_id: spec.id, heading: 'Body', position: 0, body: 'a lodestone section',
    }).id,
    requirement: () => requirement.id,
    acceptance_criterion: () => call.create_acceptance_criterion({
      requirement_id: requirement.id, position: 0, text: 'a lodestone criterion',
    }).id,
    story_criterion: () => call.create_story_criterion({
      story_id: story.id, position: 0, text: 'a lodestone story criterion',
    }).id,
    observation: () => call.create_observation({
      retro_id: retro.id, position: 0, text: 'a lodestone observation',
    }).id,
    finding: () => call.create_finding({
      review_id: review.id, position: 0, category_id: 'finding:hidden-complexity',
      severity_id: 'severity:warning', summary: 'a lodestone finding',
    }).id,
    adr: () => adr.id,
    adr_option: () => call.create_adr_option({
      adr_id: adr.id, name: 'Rebuild', position: 0, rationale: 'a lodestone rationale',
    }).id,
    agent: () => call.create_agent({
      name: 'lodestone-keeper', display_name: 'Keeper', icon: '🧭', role: 'Keeper', position: 20,
      personality: 'a lodestone personality', communication_style: 'Short sentences.',
    }).name,
    artifact: () => call.create_artifact({
      url: 'https://example.invalid/lodestone', title: 'Artifact',
      published_at: '2026-08-11T00:00:00Z', description: 'a lodestone artifact',
    }).id,
    audit_finding: () => call.create_audit_finding({
      audit_id: audit.id, position: 0, dimension_id: 'audit_dimension:test-debt',
      file: 'dpm/src/schema/022-prose-index.sql', severity_id: 'severity:warning',
      summary: 'a lodestone audit finding',
    }).id,
    milestone: () => call.create_milestone({
      spec_id: spec.id, label: 'M1', title: 'Milestone', position: 0,
      summary: 'a lodestone milestone',
    }).id,
    quick_criterion: () => call.create_quick_criterion({
      quick_id: quick.id, position: 0, text: 'a lodestone quick criterion',
    }).id,
    retro_application: () => call.create_retro_application({
      retro_id: retro.id, applied_to_id: epic.id, theme: 'Testing gaps', disposition: 'applied',
      note: 'a lodestone note',
    }).id,

    // The one whose only indexed prose is the reason it was withdrawn. A live binding carries none
    // — `spec_fragment` is half the row's identity rather than text about it — so the row reaches
    // the index by being retired, and `retire_coverage` is the only path a caller has to that.
    coverage: () => {
      const row = call.create_coverage({
        requirement_id: requirement.id, spec_fragment: 'lodestone requirement',
        story_criterion_id: bound.id, position: 0,
      });

      return call.retire_coverage({ id: row.id, reason: 'a lodestone withdrawal' }).id;
    },

    // The two whose only prose column is a status note, which no create tool takes — so the row
    // reaches the index through the update trigger, on the path a caller actually uses.
    story: () => call.update_story({ id: story.id, status_note: 'a lodestone status note' }).id,
    task: () => call.create_task({
      story_id: story.id, number: 1, title: 'Task', position: 0,
      description: 'a lodestone task',
    }).id,
  };

  assert.deepEqual(Object.keys(written).sort(), [...indexed].sort(),
    'the fixture and the schema disagree about which types are indexed');

  const rows = Object.fromEntries(
    Object.entries(written).map(([entity, write]) => [entity, write()]),
  );

  // One search, and it has to reach every one of them. The tools are Story 1's and Story 2's, the
  // triggers are Stories 3's and 4's, and the query is Story 5's — three stories that pass in
  // isolation against a database where one of the types was never wired up.
  const page = call.search({ query: 'lodestone', limit: 50 });
  const found = new Map(page.items.map((hit) => [hit.entity, hit.entity_id]));

  assert.deepEqual([...found.keys()].sort(), [...indexed].sort(),
    'a type was written through its tool and did not reach the index');

  for (const entity of indexed) {
    assert.equal(found.get(entity), rows[entity],
      `${entity} was found, but the hit names a different row than the one written`);
  }
});

// --- Criterion 2: a retired term is refused by the create tool, by name ------------------------

test('a create tool refuses a term retired through the retire tool, and names the item', (t) => {
  const { db, call } = surface(t);

  const spec = call.create_spec({ slug: 'retired', title: 'Retired' });
  const epic = call.create_epic({ parent_id: spec.id, slug: 'retired', title: 'Retired' });
  const review = call.create_review({ parent_id: spec.id, slug: 'r', title: 'Review' });
  const story = call.create_story({ epic_id: epic.id, number: 1, title: 'S', position: 0 });
  const criterion = call.create_story_criterion({
    story_id: story.id, position: 0, text: 'A criterion',
  });

  // One per vocabulary, so the criterion is checked over the set rather than over whichever one
  // came to mind — the four retire verbs Story 2 wrote, each against a tool that references it.
  const cases = [
    {
      vocabulary: 'taxonomy',
      retire: () => call.retire_taxonomy({ id: 'finding:hidden-complexity' }),
      item: 'finding:hidden-complexity',
      create: () => call.create_finding({
        review_id: review.id, position: 0, category_id: 'finding:hidden-complexity',
        severity_id: 'severity:warning', summary: 'A finding',
      }),
    },
    {
      vocabulary: 'agent',
      retire: () => call.retire_agent({ name: 'architect' }),
      item: 'architect',
      create: () => call.create_document_agent({
        document_id: review.id, document_kind: 'review', agent: 'architect',
      }),
    },
    {
      vocabulary: 'test_approach',
      retire: () => call.retire_test_approach({ tag: 'integration' }),
      item: 'integration',
      create: () => call.create_story_criterion_approach({
        story_criterion_id: criterion.id, tag: 'integration',
      }),
    },
    {
      vocabulary: 'dependency_kind',
      retire: () => call.retire_dependency_kind({ kind: 'blocks' }),
      item: 'blocks',
      create: () => {
        const other = call.create_story({
          epic_id: epic.id, number: 2, title: 'T', position: 1,
        });

        return call.create_dependency({
          kind: 'blocks', source_story_id: other.id, target_story_id: story.id,
        });
      },
    },
  ];

  for (const scenario of cases) {
    scenario.retire();

    const error = refused(scenario.create);

    // **A `ToolError` and not merely an error.** The guards are `RAISE(ABORT, …)`, whose message
    // contains none of the words `attempt` was matching on, so until Story 6 every one of these
    // fell through untranslated: a bare `Error` with `ERR_SQLITE_ERROR`, no `rpc` code, and
    // *Internal error* at the MCP boundary. The row was correctly refused and the caller was told
    // the server had broken. `assert.throws` alone passes against exactly that, which is why the
    // class and the code are asserted and not just the fact of a refusal.
    assert.equal(error.name, 'ToolError', `${scenario.vocabulary}: ${error.message}`);
    assert.equal(error.rpc?.code, -32602,
      `${scenario.vocabulary}: refused as a server fault rather than a bad call`);

    // And it names the item, not only the column it arrived in. A trigger cannot do this —
    // `RAISE` takes a string literal — so the naming is completed at the tool boundary.
    assert.match(error.message, /retired/);
    assert.ok(error.message.includes(`'${scenario.item}'`),
      `${scenario.vocabulary}: the refusal never names '${scenario.item}' — ${error.message}`);

    // The other half of FR24's promise, in the same breath: the term is still there, still
    // readable, and the rows already pointing at it are untouched.
    const read = db.prepare(`SELECT count(*) AS n FROM ${scenario.vocabulary}`).get().n;

    assert.ok(read > 0, `${scenario.vocabulary}: retirement removed rows instead of marking them`);
  }
});

// --- Criterion 3: the parity closure ------------------------------------------------------------

/**
 * The tables that hold no artefact state, and why no template could render them.
 *
 * Carried with reasons rather than filtered out of the enumeration. A sweep that shortened its own
 * input until the assertion held would prove nothing, and this is the one place in the epic where
 * that temptation is strongest — the enumeration is over every table in the schema.
 */
const UNPROJECTED = {
  schema_version: 'the migration ledger — state about the database, not about any artefact',
  document_kind: 'the kind registry the templates are keyed by; it describes the projection',
  document_kind_parent: 'which kinds may parent which, checked at write time and never rendered',
  dependency_kind_endpoint:
    'which kinds an edge may join, checked at write time and by the register, and never rendered',
  number_sequence: 'the allocator\'s counter; what it hands out renders, and it does not',
  session: 'has no document_id — FR11 removed the file it used to be, and no parent can hold it',
  plugin_stamp:
    'the version of the plugin that last wrote this database — state about the reader, not about '
    + 'any artefact, and it is the one row a stale server reads to find out that it is one',
};

test('every table populated through its own tool reaches the projection, or is accounted for', (t) => {
  const { db, call } = surface(t);

  toolCorpus(call);

  const tables = authoredTables(db);
  const text = projectedText(db);

  // **The corpus is checked before the projection is.** Every assertion below is of the form "a
  // value from this table appears in the output", and every one of them is vacuously satisfiable
  // by a table with no rows. This is the guard that makes the sweep mean something, and it is
  // also what makes the fixture's completeness a property of the enumeration rather than of
  // whoever last edited it.
  const empty = tables
    .filter((table) => !Object.hasOwn(UNPROJECTED, table))
    .filter((table) => db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n === 0);

  assert.deepEqual(empty, [], 'the fixture wrote no rows here, so any appearance check is vacuous');

  // Every table is either witnessed in the output or named above with a reason. The two sets are
  // compared against the schema in both directions, so a table added tomorrow fails here until
  // someone decides which it is — which is the same closure FR10's create-tool half already has.
  assert.deepEqual(
    [...Object.keys(WITNESS), ...Object.keys(UNPROJECTED)].sort(),
    [...tables].sort(),
    'a table is in neither the witness set nor the unprojected set, or is in both',
  );

  const missing = Object.entries(WITNESS)
    .filter(([, witness]) => !text.includes(witness))
    .map(([table, witness]) => `${table} (looked for '${witness}')`);

  assert.deepEqual(missing, [], 'a table was written through its tool and reached no template');
});

test('the tables that reach no template say why, and the reason is checkable', (t) => {
  const { db, call } = surface(t);

  toolCorpus(call);

  // The reasons above are prose; these are the same claims as queries. `session` is the one that
  // matters most, because it is the only one of the five that holds a row a caller wrote — the
  // other four are the database describing itself.
  const linked = (table) => db.prepare(`PRAGMA table_info(${table})`).all()
    .some((column) => column.name === 'document_id');

  assert.ok(!linked('session'), UNPROJECTED.session);
  assert.ok(db.prepare('SELECT count(*) AS n FROM session').get().n > 0,
    'no session row was written, so its absence from the projection proves nothing');

  // The remaining five are reachable by no create tool at all, which is the structural form of
  // "not artefact state": Story 1's parity test exempts exactly these, and this is the same set
  // seen from the projection's end.
  const writable = new Set(
    spineTools(db)
      .filter((tool) => tool.name.startsWith('create_'))
      .flatMap((tool) => tool.writes),
  );

  assert.deepEqual(
    Object.keys(UNPROJECTED).filter((table) => !writable.has(table)).sort(),
    ['dependency_kind_endpoint', 'document_kind', 'document_kind_parent', 'number_sequence',
      'plugin_stamp', 'schema_version'],
    'the unprojected set no longer matches the set no create tool writes',
  );
});

test('a template that drops a collection fails the sweep, so the sweep is not self-satisfying', (t) => {
  const { db, call } = surface(t);

  toolCorpus(call);

  // The control. Without it, "every witness appears in the concatenation of fourteen files" is a
  // claim that could hold because the strings are common rather than because the rows rendered —
  // and the sweep above would go on passing after a template stopped emitting a whole table.
  assert.ok(projectedText(db).includes(WITNESS.finding));
  assert.ok(projectedText(db).includes(WITNESS.observation_category));

  db.prepare('DELETE FROM finding').run();
  db.prepare('DELETE FROM observation_category').run();

  const after = projectedText(db);

  assert.ok(!after.includes(WITNESS.finding), 'the finding witness survives its rows');
  assert.ok(!after.includes(WITNESS.observation_category),
    'the category witness survives its rows, so it is being matched against something else');
});

// --- Criterion 4: must NOT — a hit that opens nothing -------------------------------------------

test('every search hit opens through its own read tool, across the whole corpus', (t) => {
  const { call } = surface(t);

  toolCorpus(call);

  // A term every indexed type carries would make this one query; the corpus deliberately does not
  // have one, so the sweep runs over each indexed entity's own witness and unions the hits. That
  // is the harder version: it covers hits from both indexes and from every tagged table.
  const hits = ['peridotite', 'andesite', 'pumice', 'scoria', 'phonolite', 'trachyte']
    .flatMap((term) => call.search({ query: term, limit: 50 }).items);

  assert.ok(hits.length >= 6, `only ${hits.length} hits — the corpus is not being searched`);

  for (const hit of hits) {
    const read = call[`read_${hit.entity}`];

    assert.ok(read, `nothing reads '${hit.entity}' — the hit names an entity a caller cannot open`);
    assert.equal(read({ id: hit.entity_id }).id, hit.entity_id);
  }
});

test('must NOT — the index outlives its rows, and the hit that survives opens nothing', (t) => {
  const { db, call } = surface(t);

  toolCorpus(call);

  const before = call.search({ query: 'andesite', limit: 50 });

  assert.equal(before.returned, 1);

  // **The must-NOT built rather than described.** `entry_fts` is an ordinary table to SQL, so a
  // write that goes around the tool surface can put a row in it naming nothing — which is exactly
  // the state FR3 exists to make unreachable and NFR7 exists to forbid. Done here on purpose, so
  // the failure has a shape rather than a description.
  db.prepare('INSERT INTO entry_fts (entity, text, entity_id) VALUES (?, ?, ?)')
    .run('requirement', 'andesite, but for a row that is not there', 'no-such-requirement');

  const after = call.search({ query: 'andesite', limit: 50 });

  // It returns. It is ranked. It has an excerpt. Nothing about it looks like a failure — and one
  // of its two hits cannot be opened.
  assert.equal(after.returned, 2);

  const orphan = after.items.find((hit) => hit.entity_id === 'no-such-requirement');

  assert.ok(orphan, 'the drifted row did not come back, so this test is asserting nothing');
  assert.ok(orphan.excerpt.length > 0);
  assert.match(refused(() => call.read_requirement({ id: orphan.entity_id })).message,
    /no requirement with/);

  // And the reason it cannot happen through the surface: nothing writes `entry_fts`. Not "no
  // tool happens to", but no tool declares it — which is the property Story 1's parity test reads
  // and the one that would have to change for this state to become reachable.
  const writers = spineTools(db).filter((tool) => (tool.writes ?? []).includes('entry_fts'));

  assert.deepEqual(writers.map((tool) => tool.name), [],
    'a tool writes entry_fts directly, so the index is no longer maintained only by trigger');
});

// --- Criterion 6: the round trip carries both indexes -------------------------------------------

test('a restored database answers both MATCH queries exactly as the source did', (t) => {
  const { db, call } = surface(t);
  const file = openDatabaseFile(t);

  toolCorpus(call);

  // One term in a section body and one held only on a child row: the pair the criterion names,
  // and the pair that separates the two indexes. A restore that rebuilt one and not the other
  // answers the first identically and the second not at all.
  const queries = {
    document_fts: "SELECT section_id AS id FROM document_fts WHERE document_fts MATCH 'peridotite'",
    entry_fts: "SELECT entity, entity_id AS id FROM entry_fts WHERE entry_fts MATCH 'andesite'",
  };

  const answers = (database) => Object.fromEntries(
    Object.entries(queries).map(([index, sql]) => [index, database.prepare(sql).all()]),
  );

  const source = answers(db);

  assert.ok(source.document_fts.length > 0 && source.entry_fts.length > 0,
    'the source database answers one of these with nothing, so equality below is vacuous');

  const restored = new DatabaseSync(file.path);

  restore(restored, dump(db).sql);

  assert.deepEqual(answers(restored), source,
    'the restored database disagrees with the source about what is in its indexes');

  // Through the file and not only through the handle: the criterion is about a database rebuilt
  // from bytes, and a connection that never closed proves the process still remembers.
  restored.close();

  const reopened = new DatabaseSync(file.path);

  assert.deepEqual(answers(reopened), source, 'the indexes did not survive the connection closing');
  reopened.close();
});
