/**
 * A corpus of absence and endings — the complement to `self-hosting.test.js`.
 *
 * Every other fixture in this tree exercises presence: populated columns, non-empty collections,
 * documents in their working state. The templates are full of branches that only run on the other
 * side of that — `x === null ? null : …`, `x.length > 0 ? … : null` — and until this corpus
 * existed nothing reached them. The same holds for the status vocabularies: `pending` arrives free
 * on creation, and every other value in every `CHECK` needs a write that no fixture was making.
 *
 * **Every claim here is derived from the live schema or the live tool surface**, in the same way
 * and for the same reason as the self-hosting checks: a hand-kept list of "the states we cover" is
 * satisfied by editing the list. What is read here is `inputSchema.required` (which fields are
 * optional), the `status` `CHECK` constraints (which states exist), and `PRAGMA table_info` (which
 * retirement columns exist). A new optional field, a new status value or a new `retired_at` is
 * covered the day it is declared, and fails this file until the corpus reaches it.
 *
 * **Exceptions are proven, not asserted.** Two create tools cannot be called with required fields
 * only, and both are named below with the reason. The test does not take that on trust — it makes
 * the bare call and requires it to be refused, so an exception that stops being true fails here
 * rather than quietly excusing a tool that no longer needs excusing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { sparseCorpus } from './support/sparse.js';
import { spineTools } from '../src/tools/index.ts';
import { project, renderDocument } from '../src/projection/index.ts';
import { identifiers } from '../src/projection/naming.ts';

function loaded(t) {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const call = handlers(tools);

  return { db, tools, call, corpus: sparseCorpus(call) };
}

/** The fields a tool declares that its caller may leave out. */
function optionalFields(tool) {
  const schema = tool.inputSchema ?? {};
  const required = new Set(schema.required ?? []);

  return Object.keys(schema.properties ?? {}).filter((field) => !required.has(field));
}

// --- Absence -------------------------------------------------------------------------------------

/**
 * The create tools that cannot be called with required fields only, and why.
 *
 * Both are the same underlying shape: a constraint of the form "at least one of these" that lives
 * in a `CHECK` and cannot be expressed by JSON Schema's `required`. A caller reading either input
 * schema sees several optional fields and nothing saying one of them is mandatory — the refusal
 * arrives at the write. That is worth knowing about the surface, which is why they are named here
 * rather than skipped.
 */
const NO_BARE_CALL = new Map([
  ['create_dependency', {
    why: 'all four optional fields are the edge\'s ends, and an edge needs one of each',
    // The fields whose descriptions must carry the rule, and the phrase that carries it. A caller
    // reads the schema, not this file — so the rule being true is not enough, it has to be visible
    // where the decision to omit a field is made.
    fields: ['source_document_id', 'source_story_id', 'target_document_id', 'target_story_id'],
    says: /exactly one of/i,
  }],
  ['create_observation', {
    why: 'retro_id/story_id/quick_id are individually optional, but a CHECK requires one',
    fields: ['retro_id', 'story_id', 'quick_id'],
    says: /at least one of/i,
  }],
]);

test('every create tool has a call that sets none of its optional fields', (t) => {
  const { tools, call, corpus } = loaded(t);

  const creates = tools.filter((tool) => tool.name.startsWith('create_'));

  assert.ok(creates.length >= 30,
    `only ${creates.length} create tools found — the derivation is reading the wrong surface`);

  const uncovered = creates
    .filter((tool) => !NO_BARE_CALL.has(tool.name))
    .filter((tool) => {
      const optional = optionalFields(tool);

      return !corpus.calls.filter((made) => made.name === tool.name)
        .some((made) => optional.every((field) => made.args[field] === undefined));
    })
    .map((tool) => `${tool.name} (optional: ${optionalFields(tool).join(', ') || 'none'})`);

  assert.deepEqual(uncovered, [],
    'a create tool is never called with its optional fields left out, so nothing exercises the '
    + 'absence of those columns');

  // **The exceptions are proven here.** An excepted tool that has quietly become callable bare is
  // an exception that should be deleted, and nothing else in this file would notice.
  for (const [name, { why, fields, says }] of NO_BARE_CALL) {
    const tool = creates.find((candidate) => candidate.name === name);

    assert.ok(tool, `${name} is excepted but no longer exists`);

    const required = Object.fromEntries((tool.inputSchema?.required ?? [])
      .map((field) => [field, requiredValue(tool, field)]));

    assert.throws(() => call[name](required),
      `${name} is excepted from the bare-call claim (${why}) but accepted one — delete the exception`);

    // And the rule is where a caller will look. Both of these are "at least one of these
    // otherwise-optional fields", which JSON Schema's `required` cannot say — so if the field
    // descriptions do not say it, nothing the caller reads does, and the refusal arrives from a
    // constraint name at write time.
    for (const field of fields) {
      const description = tool.inputSchema?.properties?.[field]?.description ?? '';

      assert.match(description, says,
        `${name}.${field} does not tell the caller that ${why} — the schema cannot express it, so `
        + 'the description is the only place it can be said');
    }
  }
});

/** A value of the right type for a required field, so the bare call fails on the CHECK, not the type. */
function requiredValue(tool, field) {
  const property = tool.inputSchema?.properties?.[field] ?? {};

  if (property.type === 'integer' || property.type === 'number') return 0;
  if (property.type === 'boolean') return false;
  if (field === 'kind') return 'blocks';

  return `sparse-${field}`;
}

test('every parent renders with its child collections empty, and empty is shorter than populated', (t) => {
  const { db } = loaded(t);

  const names = identifiers(db);
  const documents = db.prepare('SELECT id, kind, slug FROM document').all();
  const rendered = new Map(documents.map(({ id }) => [id, renderDocument(db, id, names).text]));

  // Nothing threw, and nothing rendered empty — a childless parent is still a document.
  for (const { id, kind, slug } of documents) {
    assert.ok(rendered.get(id).length > 0, `${kind} ${slug} rendered nothing`);
  }

  // **The comparison is what makes the first assertion mean something.** "It renders fine with no
  // children" is also true of a template that never renders children at all, and that template
  // would be losing content on every populated document in the project. Pairing each barren
  // document with a populated one of the same kind separates the two.
  const barren = new Map(documents.filter((row) => row.slug.startsWith('barren-'))
    .map((row) => [row.kind, row.id]));

  // **The fullest of each kind, not just any non-barren one.** The endings half of this corpus adds
  // childless specs too — superseded, withdrawn, archived — so "a populated spec" picked at random
  // is as likely to be one of those, and the comparison then holds nothing against nothing.
  const fullest = new Map();

  for (const { id, kind, slug } of documents) {
    if (slug.startsWith('barren-')) continue;

    const best = fullest.get(kind);

    if (!best || rendered.get(id).length > rendered.get(best).length) fullest.set(kind, id);
  }

  const pairs = [...barren].filter(([kind]) => fullest.has(kind));

  assert.ok(pairs.length >= 8,
    `only ${pairs.length} kinds appear both barren and populated — too few for the comparison to `
    + 'say much about the template set');

  const notShorter = pairs
    .filter(([kind, id]) => rendered.get(id).length >= rendered.get(fullest.get(kind)).length)
    .map(([kind]) => kind);

  assert.deepEqual(notShorter, [],
    'a kind renders no smaller with its collections empty than with them full, so the template is '
    + 'not rendering those collections at all');
});

// --- Endings -------------------------------------------------------------------------------------

/**
 * Every state the schema admits, as `table.column=value` for status vocabularies and
 * `table.column` for the columns whose presence *is* the state.
 *
 * Read off `sqlite_schema` and `PRAGMA table_info` rather than listed, so a status value added to a
 * `CHECK` or a new `retired_at` column is covered without this file being edited — which is the
 * property that makes this a check on the corpus rather than on someone's memory of the corpus.
 */
function declaredStates(db) {
  const states = [];

  for (const { name, sql } of db.prepare("SELECT name, sql FROM sqlite_schema WHERE type='table'").all()) {
    const vocabulary = (sql ?? '')
      .match(/(\w*status)\s+TEXT[^,]*?CHECK\s*\(\s*\1\s+IN\s*\(([^)]*)\)/i);

    if (vocabulary) {
      for (const value of vocabulary[2].split(',').map((raw) => raw.trim().replace(/'/g, ''))) {
        states.push({ table: name, column: vocabulary[1], value });
      }
    }

    for (const { name: column } of db.prepare(`PRAGMA table_info(${name})`).all()) {
      if (/^(retired_at|archived_at|superseded_at|closed_at|superseded_by)$/.test(column)) {
        states.push({ table: name, column });
      }
    }
  }

  return states;
}

test('every state in every status vocabulary and every retirement column is reached', (t) => {
  const { db } = loaded(t);

  const states = declaredStates(db);

  assert.ok(states.length >= 25,
    `only ${states.length} declared states found — the schema reading is not finding them`);

  const unreached = states.filter(({ table, column, value }) => {
    const rows = value === undefined
      ? db.prepare(`SELECT count(*) AS rows FROM ${table} WHERE ${column} IS NOT NULL`).get().rows
      : db.prepare(`SELECT count(*) AS rows FROM ${table} WHERE ${column} = ?`).get(value).rows;

    return rows === 0;
  }).map(({ table, column, value }) => `${table}.${column}${value === undefined ? '' : `=${value}`}`);

  assert.deepEqual(unreached, [],
    'a state the schema admits is never reached by the corpus, so nothing has ever rendered it');
});

test('the whole corpus in its ended state still projects and holds every invariant', (t) => {
  const { db, call } = loaded(t);

  const { written, inline } = project(db, { write: false });
  const documents = db.prepare('SELECT count(*) AS rows FROM document').get().rows;

  assert.equal(written.length + inline.length, documents + 1,
    'a document rendered to neither a file nor an inline block');

  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);

  const report = call.check_integrity({});

  // Advisory entries are excluded, and the corpus fires one: it retires a binding whose fragment
  // still matched, which is a decision rather than a fault. That it fires here is the evidence
  // the entry is about a reachable state — `integrity-advisory.test.js` asserts what it reports.
  assert.deepEqual(report.entries.filter((entry) => !entry.held && !entry.advisory), [],
    'the ended corpus violates a cross-row invariant');
  assert.equal(report.ok, true, 'and an advisory finding does not make the corpus broken');
  assert.deepEqual(report.orphans, [], 'the ended corpus carries an orphaned row');
});

test('retiring a vocabulary term preserves the rows pointing at it and refuses new ones', (t) => {
  const { db, call, corpus } = loaded(t);

  // Every retirement in the corpus happens *after* rows reference the term, which is the order the
  // guard is about — retiring something nothing uses proves neither half.
  const { taxonomy, agent, test_approach: approach, dependency_kind: edge } = corpus.retiredTerms;

  for (const [what, rows] of [
    ['taxonomy', db.prepare('SELECT count(*) AS rows FROM finding WHERE category_id = ?').get(taxonomy).rows],
    ['agent', db.prepare('SELECT count(*) AS rows FROM document_agent WHERE agent = ?').get(agent).rows],
    ['test_approach', db.prepare('SELECT count(*) AS rows FROM criterion_approach WHERE tag = ?').get(approach).rows],
    ['dependency_kind', db.prepare('SELECT count(*) AS rows FROM dependency WHERE kind = ?').get(edge).rows],
  ]) {
    assert.ok(rows > 0,
      `nothing references the retired ${what}, so its retirement preserves nothing and the check is vacuous`);
  }

  // The preserved half: the rows are still readable, and the documents holding them still render.
  const names = identifiers(db);

  for (const { id, kind } of db.prepare('SELECT id, kind FROM document').all()) {
    assert.ok(renderDocument(db, id, names).text.length > 0,
      `${kind} stopped rendering once a term it references was retired`);
  }

  // The refusing half: a new row naming any retired term is turned away at the boundary.
  assert.throws(() => call.create_finding({
    review_id: corpus.review.id, position: 90, category_id: taxonomy,
    severity_id: call.list_taxonomy({ limit: 200 }).items.find((term) => term.domain === 'severity').id,
    summary: 'A finding filed against a retired category.',
  }), /retired/i, 'a new row was accepted against a retired taxonomy term');

  assert.throws(() => call.create_criterion_approach({
    criterion_id: corpus.criterion.id, tag: approach,
  }), /retired/i, 'a new row was accepted against a retired test approach');
});

// --- must NOT ------------------------------------------------------------------------------------

/** The strings that mean a value was absent and something rendered it anyway. */
const PLACEHOLDERS = ['undefined', 'null', 'NaN', '[object Object]', 'Invalid Date', '{{ref:'];

/**
 * Headings a template emits with nothing beneath them, which are allowed to be empty.
 *
 * A heading whose only content is its own subsections is not empty — that rule is in `emptyHeadings`
 * below. This map is for the genuine cases, and it has one member. Each carries a reason, and the
 * test proves the case still occurs rather than trusting the entry.
 */
const ALLOWED_EMPTY = new Map([
  ['adr_option', 'an option with no rationale and no tradeoffs is a name and a chosen marker, and '
    + 'the heading carries both'],
]);

/**
 * Headings with no non-heading content before the next heading of the same or higher level.
 *
 * The level test is what makes this usable: a section whose only content is subsections is
 * populated, and a rule that ignored levels would report every parent heading in every document.
 */
function emptyHeadings(text) {
  const lines = text.split('\n');
  const empty = [];

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^(#{1,6}) /);
    if (!heading) continue;

    const level = heading[1].length;
    let content = false;

    for (let ahead = index + 1; ahead < lines.length; ahead += 1) {
      const next = lines[ahead].match(/^(#{1,6}) /);

      if (next && next[1].length <= level) break;
      if (next) continue;
      if (lines[ahead].trim() !== '') { content = true; break; }
    }

    if (!content) empty.push(lines[index]);
  }

  return empty;
}

test('must NOT — an absent value renders as something that reads like content', (t) => {
  const { db } = loaded(t);

  const names = identifiers(db);
  const documents = db.prepare('SELECT id, kind, slug FROM document').all();

  // The option headings allowed to stand empty, and the ADR each belongs to — derived by asking
  // which options have neither a rationale nor a tradeoff, rather than by naming one.
  const bareOptions = db.prepare(`
    SELECT adr_option.name, adr_option.adr_id
      FROM adr_option
     WHERE adr_option.rationale IS NULL
       AND NOT EXISTS (SELECT 1 FROM adr_option_tradeoff WHERE option_id = adr_option.id)
  `).all();

  const optionHeadings = new Set(db.prepare('SELECT name FROM adr_option').all()
    .map((row) => row.name));

  // The corpus leaves optional columns unset everywhere. A template that interpolates without
  // guarding turns that into the word `null` or `undefined` in a published document — which reads
  // as a value rather than as an absence, and is the false pass this corpus is built to refuse.
  const leaked = [];
  const empty = [];

  for (const { id, kind, slug } of documents) {
    const { text } = renderDocument(db, id, names);

    for (const placeholder of PLACEHOLDERS) {
      if (text.includes(placeholder)) leaked.push(`${kind} ${slug}: ${placeholder}`);
    }

    // The one allowed empty heading is the ADR option's, matched by its text rather than by
    // position — an option renders as a heading carrying its name.
    for (const heading of emptyHeadings(text)) {
      const isOption = [...optionHeadings].some((name) => heading.includes(name));

      if (!isOption) empty.push(`${kind} ${slug}: ${heading.trim()}`);
    }
  }

  assert.deepEqual(leaked, [],
    'an absent value reached a projection as a placeholder string');

  assert.deepEqual(empty, [],
    'a template emitted a heading with nothing beneath it, which promises content that absence '
    + 'did not supply');

  // **The allowed exception is proven, not trusted.** If ADR options stop rendering empty, the
  // entry above should go — and nothing else here would notice, because an exception that never
  // matches is indistinguishable from one that always does.
  assert.ok(ALLOWED_EMPTY.has('adr_option'));
  assert.ok(bareOptions.length > 0,
    'the corpus holds no option without a rationale or a tradeoff, so the exception covers nothing');

  for (const option of bareOptions) {
    const inParent = renderDocument(db, option.adr_id, names).text;

    assert.ok(emptyHeadings(inParent).some((heading) => heading.includes(option.name)),
      `option "${option.name}" has neither rationale nor tradeoffs but no longer renders as an `
      + 'empty heading — remove adr_option from ALLOWED_EMPTY');
  }

  // And the control: the sweep reads. A document with a heading and nothing under it is found.
  assert.deepEqual(emptyHeadings('# Title\n\n## Empty\n\n## Full\n\nSomething.\n'), ['## Empty']);
  assert.deepEqual(emptyHeadings('# Title\n\n## Parent\n\n### Child\n\nSomething.\n'), []);
});
