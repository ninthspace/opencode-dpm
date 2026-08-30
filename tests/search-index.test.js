/**
 * Story 3 — the section index, and the two ways an index can be wrong while search still works.
 *
 * FR9 asks that artefact bodies be searchable. The failure this story has to rule out is not
 * "search returns nothing" — that one announces itself — but the index drifting behind the table
 * while every query still answers: a renamed section found under its old heading, an edited body
 * found under text that is no longer there, a deleted section still returned. Each of those passes
 * a bare `MATCH` for the text you expect to find, which is why the criterion asks for something
 * else.
 *
 * **`MATCH` against `LIKE` is the assertion shape, and it is not a convenience.** The `LIKE` scan
 * over `document_section` is the answer the table itself gives; the `MATCH` is the answer the
 * index gives. Comparing the two sets fails on every drift above, including the ones where the
 * index holds *more* than it should — which no assertion phrased as "the new text is findable"
 * can see.
 *
 * **Deletes go through SQL and not through a tool, because there is no delete tool.** dpm has
 * none, by design: nothing in the requirements asks to remove an artefact. The triggers still have
 * to be right, because `document_section` cascades from `document` and because a delete tool would
 * arrive on top of a trigger that had never been exercised.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';

function surface(t) {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  return { db, call: handlers(tools) };
}

/** A spec to hang sections off. */
const home = (call) => call.create_spec({ slug: 'search', title: 'Search' });

/** The section ids the index returns for `term`. */
const matched = (db, term) => db
  .prepare('SELECT section_id FROM document_fts WHERE document_fts MATCH ? ORDER BY section_id')
  .all(term)
  .map((row) => row.section_id);

/**
 * The section ids the *table* holds `term` in, found without the index.
 *
 * Both indexed columns are scanned, because the index covers both and a comparison over one of
 * them would agree with a `document_fts` that had stopped tracking the other.
 */
const scanned = (db, term) => db
  .prepare(`SELECT id FROM document_section
             WHERE lower(heading) LIKE '%' || ? || '%' OR lower(body) LIKE '%' || ? || '%'
             ORDER BY id`)
  .all(term, term)
  .map((row) => row.id);

/**
 * The index and the table agree about every term.
 *
 * Terms are single lower-case words chosen so that FTS5's tokenizer and `LIKE`'s substring match
 * cannot disagree for a reason that is not the index being stale — no punctuation, no word that is
 * a prefix of another word in the corpus.
 */
function agree(db, terms, where) {
  for (const term of terms) {
    assert.deepEqual(matched(db, term), scanned(db, term),
      `${where}: the index and the table disagree about '${term}'`);
  }
}

/** Every term any test below writes, so each comparison covers what the others left behind. */
const TERMS = ['quartzite', 'hornbeam', 'sarsaparilla', 'wolframite', 'cinnabar'];

// --- Criterion 1: retrievable by MATCH, and no external content ---------------------------------

test('a section written through the tool is retrievable by MATCH under its ULID', (t) => {
  const { db, call } = surface(t);
  const spec = home(call);

  const section = call.create_document_section({
    document_id: spec.id,
    heading: 'Quartzite',
    body: 'The prose a reader put here, holding the word hornbeam and nothing else notable.',
    position: 0,
  });

  // The id is the tool's, not one this test chose — which is the half of the criterion about
  // ULIDs. An index keyed on anything SQLite had to coerce would not have this value back.
  assert.match(section.id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.deepEqual(matched(db, 'hornbeam'), [section.id]);
  assert.deepEqual(matched(db, 'quartzite'), [section.id], 'the heading is not indexed');

  agree(db, TERMS, 'after one write');
});

test('document_fts declares no content= option, and the external form is why', (t) => {
  const { db } = surface(t);

  const sql = db
    .prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'document_fts'")
    .get().sql;

  assert.match(sql, /CREATE VIRTUAL TABLE document_fts USING fts5\(/);
  assert.equal(/content\s*=/.test(sql), false, 'document_fts is external-content');

  // The consequence, driven rather than described. The external form is *accepted* at CREATE and
  // fails at the first write, so the absence above is not a style preference — it is the only
  // form that works with AD9's ULIDs, and this is the error the other one gives.
  const probe = new DatabaseSync(':memory:');

  t.after(() => probe.close());
  probe.exec('CREATE TABLE section (id TEXT PRIMARY KEY, heading TEXT, body TEXT)');
  probe.exec("CREATE VIRTUAL TABLE probe_fts USING fts5(heading, body, "
    + "content='section', content_rowid='id')");

  probe.exec("INSERT INTO section VALUES ('01J0000000000000000000000A', 'H', 'body text')");

  let caught;
  try {
    probe.exec('INSERT INTO probe_fts (rowid, heading, body) '
      + 'SELECT id, heading, body FROM section');
  } catch (error) {
    caught = error;
  }

  assert.ok(caught, 'the external-content form accepted a ULID rowid');
  assert.match(caught.message, /datatype mismatch/);
});

test('the three triggers carry the names the dumper reads', (t) => {
  const { db } = surface(t);

  const triggers = db
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger' AND name LIKE 'document_fts%' "
      + 'ORDER BY name')
    .all()
    .map((row) => row.name);

  // `dump/objects.js` scopes its shadow-table filter to `type = 'table'` precisely so these three
  // survive a dump; a rename here would leave that filter guarding nothing and a restored database
  // holding every row with an empty index. The pair is recorded in `docs/maintenance/README.md`.
  assert.deepEqual(triggers,
    ['document_fts_delete', 'document_fts_insert', 'document_fts_update']);
});

// --- Criterion 2: update and delete leave the index consistent ----------------------------------

test('editing a body replaces the index entry rather than adding to it', (t) => {
  const { db, call } = surface(t);
  const spec = home(call);

  const section = call.create_document_section({
    document_id: spec.id, heading: 'Minerals', position: 0,
    body: 'The first draft mentions quartzite.',
  });

  call.update_document_section({ id: section.id, body: 'The second draft mentions cinnabar.' });

  assert.deepEqual(matched(db, 'cinnabar'), [section.id]);

  // The half a bare `MATCH` for the new text cannot see: the old entry is gone. An update trigger
  // that inserted without deleting would pass the line above and fail this one.
  assert.deepEqual(matched(db, 'quartzite'), []);

  agree(db, TERMS, 'after a body edit');
});

test('editing a heading replaces the index entry too', (t) => {
  const { db, call } = surface(t);
  const spec = home(call);

  const section = call.create_document_section({
    document_id: spec.id, heading: 'Wolframite', position: 0,
    body: 'A body that does not change, so only the heading can account for the difference.',
  });

  call.update_document_section({ id: section.id, heading: 'Sarsaparilla' });

  // This is the case that makes `AFTER UPDATE OF heading, body` a decision rather than a habit:
  // narrowed to `body`, the section stays findable under a heading it no longer has.
  assert.deepEqual(matched(db, 'sarsaparilla'), [section.id]);
  assert.deepEqual(matched(db, 'wolframite'), []);

  agree(db, TERMS, 'after a heading edit');
});

test('editing only the position touches neither the index nor its agreement with the table', (t) => {
  const { db, call } = surface(t);
  const spec = home(call);

  const section = call.create_document_section({
    document_id: spec.id, heading: 'Hornbeam', position: 0,
    body: 'Text that stays exactly as written while the section moves.',
  });

  const before = db.prepare('SELECT rowid, heading, body, section_id FROM document_fts').all();

  call.update_document_section({ id: section.id, position: 3 });

  // The rowid is asserted along with the content, because a trigger that fired and rewrote the
  // same values would leave the index correct and the rowid changed — a distinction that costs
  // nothing to keep and is the difference between `AFTER UPDATE OF` doing something and not.
  assert.deepEqual(db.prepare('SELECT rowid, heading, body, section_id FROM document_fts').all(),
    before);

  agree(db, TERMS, 'after a position-only edit');
});

test('deleting a section removes it from the index', (t) => {
  const { db, call } = surface(t);
  const spec = home(call);

  const kept = call.create_document_section({
    document_id: spec.id, heading: 'Kept', position: 0, body: 'This one mentions hornbeam.',
  });
  const going = call.create_document_section({
    document_id: spec.id, heading: 'Going', position: 1, body: 'This one mentions cinnabar.',
  });

  db.prepare('DELETE FROM document_section WHERE id = ?').run(going.id);

  assert.deepEqual(matched(db, 'cinnabar'), []);

  // The control. Without it a delete trigger that emptied the whole index would pass the line
  // above, which is the worst available way to keep a search consistent.
  assert.deepEqual(matched(db, 'hornbeam'), [kept.id]);

  agree(db, TERMS, 'after a delete');
});

test('deleting a document takes its sections out of the index through the cascade', (t) => {
  const { db, call } = surface(t);
  const spec = home(call);
  const other = call.create_spec({ slug: 'elsewhere', title: 'Elsewhere' });

  call.create_document_section({
    document_id: spec.id, heading: 'One', position: 0, body: 'Mentions quartzite.',
  });
  call.create_document_section({
    document_id: spec.id, heading: 'Two', position: 1, body: 'Mentions wolframite.',
  });
  const survivor = call.create_document_section({
    document_id: other.id, heading: 'Three', position: 0, body: 'Mentions sarsaparilla.',
  });

  db.prepare('DELETE FROM document WHERE id = ?').run(spec.id);

  // SQLite fires delete triggers on rows removed by a foreign-key cascade, and does so with
  // `recursive_triggers` both off and on — measured, not assumed, and asserted here rather than
  // stated in a comment because it is a property of the SQLite in use.
  assert.equal(db.prepare('SELECT COUNT(*) AS rows FROM document_section').get().rows, 1);
  assert.deepEqual(matched(db, 'quartzite'), []);
  assert.deepEqual(matched(db, 'wolframite'), []);
  assert.deepEqual(matched(db, 'sarsaparilla'), [survivor.id]);

  agree(db, TERMS, 'after a cascading delete');
});
