/**
 * Story 1 — every column that holds prose is judged, and the judgement is checked against the
 * schema rather than kept beside it.
 *
 * FR9's rule decides what earns a place in the search index and nothing enforced it. The failure
 * it leaves has no error in it: a search over a column nothing indexes is accepted, ranked against
 * what the index does hold, and returns nothing — which reads exactly like the row not being
 * there. Register entry #26.
 *
 * **Both enumerations come from the live schema, and that is asserted rather than asserted about.**
 * A column added by `ALTER TABLE` inside the test appears in the enumeration and is complained
 * about as unjudged, which is the property the criterion asks for. A list transcribed from the
 * schema would pass every other test in this file.
 *
 * **The reconciliation is one function returning complaints**, so the controls below drive it on
 * planted inputs rather than restating its rules in a second place. A control that reimplements
 * what it guards tests the reimplementation — which is the same defect this story closes, one
 * level up (retro 40).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase } from './support/planning-database.js';
import { spineTools } from '../src/tools/index.ts';
import {
  classification, lapsedExclusions, liveFacts, proseColumns, textColumns,
} from './support/prose-columns.js';

/**
 * Floors, because every per-item check in `audit` is satisfied by having no items.
 *
 * Set below what the schema holds rather than at it: these guard against an enumeration that
 * collapsed, not against the schema growing. `indexed` is the one Story 2 raises.
 */
const FLOOR = { columns: 190, indexed: 20, prose: 20 };

/**
 * The reconciliation. Every complaint is one way the classification and the schema disagree.
 *
 * @param {{table: string, column: string, key: string}[]} columns
 * @param {{indexed: Set<string>, tools: Set<string>, keys: Map<string, string[]>}} facts
 * @param {Map<string, {prose: boolean, reason: string, depends: object|null}>} judged
 * @returns {string[]}
 */
function audit(columns, facts, judged) {
  const complaints = [];
  const present = new Set(columns.map((column) => column.key));
  const prose = [...judged].filter(([, entry]) => entry.prose).map(([key]) => key);
  const indexed = facts.indexed;

  if (columns.length < FLOOR.columns) {
    complaints.push(`the schema yielded ${columns.length} TEXT columns, below the ${FLOOR.columns} it holds`);
  }

  if (indexed.size < FLOOR.indexed) {
    complaints.push(`the triggers yielded ${indexed.size} indexed columns, below the ${FLOOR.indexed} they index`);
  }

  if (prose.length < FLOOR.prose) {
    complaints.push(`${prose.length} columns are judged to hold prose, below the ${FLOOR.prose} that do`);
  }

  for (const { key } of columns) {
    const entry = judged.get(key);

    if (!entry) {
      complaints.push(`${key} is a TEXT column with no recorded judgement`);
      continue;
    }

    if (!entry.reason?.trim()) complaints.push(`${key} is judged with no reason`);
  }

  for (const key of judged.keys()) {
    if (!present.has(key)) complaints.push(`${key} is judged and the schema has no such column`);
  }

  for (const key of indexed) {
    if (!judged.get(key)?.prose) {
      complaints.push(`${key} is indexed and is not judged to hold prose`);
    }
  }

  // The other direction, and the one register entry #26 names. Its failure is the silent one: an
  // indexed column nobody judged is visible to anyone who reads the two lists together, whereas a
  // prose column nothing indexes shows up only as a search that answers, ranks, and returns
  // nothing. A column may leave this set, but only by being judged `prose: false` with a reason —
  // which is the same thing said the other way round.
  for (const key of prose) {
    if (!indexed.has(key)) complaints.push(`${key} holds prose and nothing indexes it`);
  }

  return [...complaints, ...lapsedExclusions(facts, judged)];
}

/** The live inputs, which every test starts from. */
function schema(t) {
  const db = openPlanningDatabase(t);

  return {
    db,
    columns: textColumns(db),
    facts: liveFacts(db, spineTools(db)),
    judged: classification(),
  };
}

test('every TEXT column carries a judgement, enumerated from the schema and not from a list', (t) => {
  const { db, columns, facts, judged } = schema(t);

  assert.deepEqual(audit(columns, facts, judged), []);

  // The enumeration is the schema's, not a transcription of it: a column that did not exist when
  // this file was written arrives in it, and arrives unjudged.
  db.exec('ALTER TABLE story ADD COLUMN scratch TEXT');

  const grown = textColumns(db);

  assert.ok(grown.some((column) => column.key === 'story.scratch'));
  assert.equal(grown.length, columns.length + 1);
  assert.ok(audit(grown, facts, judged)
    .includes('story.scratch is a TEXT column with no recorded judgement'));
});

test('the reconciliation runs in both directions, and over an enumeration that has anything in it', (t) => {
  const { columns, facts, judged } = schema(t);
  const empty = { indexed: new Set(), tools: new Set(), keys: new Map() };

  // A column the schema has and nobody judged.
  const unjudged = new Map(judged);
  unjudged.delete('finding.summary');
  assert.ok(audit(columns, facts, unjudged)
    .includes('finding.summary is a TEXT column with no recorded judgement'));
  assert.ok(audit(columns, facts, unjudged)
    .includes('finding.summary is indexed and is not judged to hold prose'));

  // An entry for a column the schema no longer has.
  const ghost = new Map(judged);
  ghost.set('finding.headline', { prose: true, reason: 'gone', depends: null });
  assert.ok(audit(columns, facts, ghost)
    .includes('finding.headline is judged and the schema has no such column'));

  // An entry with no reason on it.
  const mute = new Map(judged);
  mute.set('adr.decision', { prose: true, reason: '   ', depends: null });
  assert.ok(audit(columns, facts, mute).includes('adr.decision is judged with no reason'));

  // An indexed column judged not to hold prose — the direction that fails silently in the field,
  // because the index goes on answering either way.
  const denied = new Map(judged);
  denied.set('requirement.text', { prose: false, reason: 'a label', depends: null });
  assert.ok(audit(columns, facts, denied)
    .includes('requirement.text is indexed and is not judged to hold prose'));

  // The floors. Each per-column check above is satisfied by having no columns, so an enumeration
  // that collapsed reads as full agreement without them (retro 40).
  assert.ok(audit([], empty, new Map()).some((each) => each.includes('TEXT columns, below')));
  assert.ok(audit([], empty, new Map()).some((each) => each.includes('indexed columns, below')));
  assert.ok(audit([], empty, new Map()).some((each) => each.includes('hold prose, below')));
});

test('every column holding prose is indexed, or excluded for a reason the schema still bears out', (t) => {
  const { columns, facts, judged } = schema(t);
  const empty = { indexed: new Set(), tools: new Set(), keys: new Map() };

  // Register entry #26's condition, put to the live schema: no column holding prose is left
  // unindexed, and no exclusion rests on a fact that has stopped being true. Checked over the
  // schema as it is at test time rather than against a set transcribed when this was written — a
  // transcription is the thing the entry is about.
  assert.deepEqual(audit(columns, facts, judged), []);

  // Planted, because nothing has lapsed as things stand and a check that can only be run on inputs
  // that pass cannot be shown to fail (retro 41). `audit_finding.summary` is the column the entry
  // names by name.
  const unindexed = {
    ...facts,
    indexed: new Set([...facts.indexed].filter((key) => key !== 'audit_finding.summary')),
  };

  assert.ok(audit(columns, unindexed, judged)
    .includes('audit_finding.summary holds prose and nothing indexes it'));

  // A column *excluded* with no reason. The exclusions are how a prose column legitimately leaves
  // the indexed set, so a blank one is a column leaving it with nobody having decided anything —
  // and it would satisfy every count above.
  const silent = new Map(judged);
  silent.set('observation.note', { ...judged.get('observation.note'), reason: '   ' });

  assert.ok(audit(columns, facts, silent).includes('observation.note is judged with no reason'));

  // must NOT — the reconciliation passing over an empty enumeration. Every check above is a "for
  // each", and a schema read that yielded nothing satisfies all of them by having nothing to
  // check, which reads as full coverage. Both enumerations are guarded, because either one
  // collapsing alone produces the same clean result.
  assert.ok(audit([], empty, new Map()).some((each) => each.includes('TEXT columns, below')));
  assert.ok(audit([], empty, new Map()).some((each) => each.includes('indexed columns, below')));
  assert.ok(audit([], empty, new Map()).some((each) => each.includes('hold prose, below')));

  // And the case where only the *indexed* side reads nothing, which the floors above catch by
  // count and this catches by name — a schema whose triggers stopped parsing would otherwise have
  // to shed two columns before anything complained.
  assert.ok(audit(columns, empty, judged)
    .some((each) => each.endsWith('holds prose and nothing indexes it')));
});

test('an exclusion fails when the fact it named stops being true', (t) => {
  const { facts, judged } = schema(t);

  // Nothing has lapsed as things stand — which is exactly why every limb below is driven on a
  // planted fact rather than on the live one. A check that can only be run on inputs that pass
  // cannot be shown to fail (retro 41).
  assert.deepEqual(lapsedExclusions(facts, judged), []);

  // `indexed-column`: `observation.note` rests on `observation.text` being indexed.
  assert.deepEqual(judged.get('observation.note').depends,
    { on: 'indexed-column', target: 'observation.text' });

  const unindexed = {
    ...facts,
    indexed: new Set([...facts.indexed].filter((key) => key !== 'observation.text')),
  };

  assert.ok(lapsedExclusions(unindexed, judged)
    .some((each) => each.startsWith('observation.note')));
  assert.ok(lapsedExclusions(unindexed, judged)
    .some((each) => each.startsWith('observation.retired_reason')));

  // `absent-tool`: `document.status_note` rests on there being no `read_document`. The day one
  // exists the entity is openable and the exclusion is wrong — so the fact is asserted both ways.
  assert.equal(facts.tools.has('read_document'), false);
  assert.ok(facts.tools.has('read_story'), 'the registry read returned nothing recognisable');

  const opened = { ...facts, tools: new Set([...facts.tools, 'read_document']) };

  assert.deepEqual(lapsedExclusions(opened, judged).sort(), [
    'document.retro_waived_reason is excluded on absent-tool, and `read_document` now exists, '
    + 'so the entity is openable after all',
    'document.status_note is excluded on absent-tool, and `read_document` now exists, '
    + 'so the entity is openable after all',
  ]);

  // `composite-key`: `adr_option_tradeoff.assessment` rests on the key having two columns.
  assert.deepEqual(facts.keys.get('adr_option_tradeoff'), ['option_id', 'axis']);

  const single = { ...facts, keys: new Map([...facts.keys, ['adr_option_tradeoff', ['id']]]) };

  assert.ok(lapsedExclusions(single, judged)
    .some((each) => each.startsWith('adr_option_tradeoff.assessment')));
});

test('must NOT — the judgement follows the column name or its declared type', (t) => {
  const { db, columns, judged } = schema(t);

  // The declared type decides nothing: all 194 are TEXT and the judgement splits both ways.
  const declared = new Set(columns.map(({ table, column }) => db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .find((each) => each.name === column).type));

  assert.deepEqual([...declared], ['TEXT']);
  assert.ok(proseColumns().length > 0);
  assert.ok(proseColumns().length < columns.length);

  // Nor does the name. Three names are borne by more than one table and judged differently on
  // different tables, and each is asserted by name rather than counted — a count is satisfied by
  // any disagreement, including one nobody meant.
  assert.equal(judged.get('retro_application.note').prose, true);
  assert.equal(judged.get('observation.note').prose, false);
  assert.equal(judged.get('quick_criterion.note').prose, false);

  assert.equal(judged.get('artifact.retired_reason').prose, true);
  assert.equal(judged.get('observation.retired_reason').prose, false);

  assert.equal(judged.get('story.status_note').prose, true);
  assert.equal(judged.get('task.status_note').prose, true);
  assert.equal(judged.get('document.status_note').prose, false);

  // And the general form, so a later schema that removed those pairs does not leave the property
  // asserted only about columns that no longer exist.
  const byName = new Map();

  // `?.` rather than `.`: an unjudged column is test 1's complaint, and this one should fail on
  // the property it names or not at all.
  for (const { column, key } of columns) {
    if (judged.has(key)) byName.set(column, [...(byName.get(column) ?? []), judged.get(key).prose]);
  }

  const split = [...byName]
    .filter(([, verdicts]) => verdicts.length > 1 && new Set(verdicts).size > 1)
    .map(([name]) => name);

  assert.ok(split.length > 0, 'no column name is judged differently on different tables');
});

// --- Supersession's own columns, judged and reconciled in both directions ----------------------

/**
 * The TEXT columns coverage supersession added, and what each was judged.
 *
 * Named, because the claim is about *these two* rather than about the schema growing — which the
 * tests above already cover. A column added by a change nobody reconciled is invisible to a count.
 */
const SUPERSESSION = {
  'coverage.retired_reason': true,
  'story_criterion.superseded_reason': false,
};

test('the columns supersession added are judged, and the sweep names them in both directions', (t) => {
  const { columns, facts, judged } = schema(t);

  for (const [key, prose] of Object.entries(SUPERSESSION)) {
    // The schema's own enumeration holds it, so what follows judges a column that exists.
    assert.ok(columns.some((column) => column.key === key), `${key} is not a TEXT column here`);
    assert.equal(judged.get(key)?.prose, prose);
    assert.ok(judged.get(key).reason.trim(), `${key} is judged with no reason`);

    // Direction one, driven rather than described: without its entry the sweep names it.
    const without = new Map(judged);
    without.delete(key);

    assert.ok(audit(columns, facts, without)
      .includes(`${key} is a TEXT column with no recorded judgement`));

    // Direction two: an entry for a column the schema does not have is named too.
    const ghost = new Map(judged);
    ghost.set(`${key}_withdrawn`, { prose: true, reason: 'a column nobody added', depends: null });

    assert.ok(audit(columns, facts, ghost)
      .includes(`${key}_withdrawn is judged and the schema has no such column`));
  }

  // `story_criterion.superseded_reason` is excluded rather than not-prose, so its reason is a fact
  // the schema can be asked about — and it lapses when that fact stops holding.
  assert.deepEqual(judged.get('story_criterion.superseded_reason').depends,
    { on: 'indexed-column', target: 'story_criterion.text' });

  const unindexed = {
    ...facts,
    indexed: new Set([...facts.indexed].filter((key) => key !== 'story_criterion.text')),
  };

  assert.ok(lapsedExclusions(unindexed, judged)
    .some((each) => each.startsWith('story_criterion.superseded_reason')));
});
