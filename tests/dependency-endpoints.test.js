/**
 * Quick 1 — which document kinds each edge kind admits, and the two places it is enforced.
 *
 * Register entry 6 used to state the matrix itself: `builds_on` spec→spec, `constrains` ADR→ADR,
 * everything else passed over. Three shipped skills write `builds_on` between other kinds — a spec
 * and the brief it came from, a spec and the discussion it came from, a library wrapper and the
 * audit that produced it — so the check reported the lineage it was there to protect, and did it
 * in this project's own database.
 *
 * **The pairs are rows now, and the first test below is the one that would have caught it**: it
 * writes every edge the skills instruct, through the tool, and asks the register what it thinks.
 * A test naming the pairs it expects to be admitted would have agreed with the old rule just as
 * happily — what makes this one different is that its list comes from `skills/`.
 *
 * The rule is enforced at the write as well as at the audit, so each rejection is driven at both:
 * a refusal is not the same claim as a report, and a database can acquire an edge by restore.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handlers, openPlanningDatabase } from './support/planning-database.js';
import { create } from './fixtures/index.js';
import { childDocument, rootDocument } from './fixtures/planning.js';
import { spineTools } from '../src/tools/index.ts';
import { REGISTER } from '../src/integrity/register.ts';

const ENDPOINTS = REGISTER.find((entry) => entry.entry === 6);

function surface(t) {
  const db = openPlanningDatabase(t);

  return { db, call: handlers(spineTools(db)) };
}

/** One document of each kind these tests join, created directly so the tool under test is alone. */
function corpus(db) {
  const spec = rootDocument(db, 'spec', { number: 1, slug: 'spec' });

  return {
    spec,
    other: rootDocument(db, 'spec', { number: 2, slug: 'successor' }),
    problem: rootDocument(db, 'problem_brief', { number: 1, slug: 'problem' }),
    product: rootDocument(db, 'product_brief', { number: 1, slug: 'product' }),
    discussion: rootDocument(db, 'discussion', { number: 1, slug: 'discussion' }),
    library: rootDocument(db, 'library', { number: 1, slug: 'lessons' }),
    audit: rootDocument(db, 'audit', { number: 1, slug: 'audit' }),
    epic: childDocument(db, 'epic', spec, { sequence: 1, slug: 'epic' }),
    adr: childDocument(db, 'adr', spec, { sequence: 1, slug: 'first' }),
    second: childDocument(db, 'adr', spec, { sequence: 2, slug: 'second' }),
  };
}

const edges = (db) => db.prepare('SELECT count(*) AS n FROM dependency').get().n;

/** The pairs `skills/` instructs, named by the skill that writes each one. */
const INSTRUCTED = [
  ['dpm:spec, spec-to-spec lineage', 'builds_on', 'spec', 'other'],
  ['dpm:spec Section 1, from a problem brief', 'builds_on', 'spec', 'problem'],
  ['dpm:spec Section 1, from a product brief', 'builds_on', 'spec', 'product'],
  ['dpm:consult handing a discussion to dpm:spec', 'builds_on', 'spec', 'discussion'],
  ['dpm:audit Step 5, the library wrapper', 'builds_on', 'library', 'audit'],
  ['dpm:architect Phase 5', 'constrains', 'adr', 'second'],
  ['dpm:architect superseding a decision', 'supersedes', 'adr', 'second'],
];

test('every edge a shipped skill instructs is admitted, at the write and by the register', (t) => {
  const { db, call } = surface(t);
  const documents = corpus(db);

  for (const [instruction, kind, source, target] of INSTRUCTED) {
    const written = call.create_dependency({
      kind,
      source_document_id: documents[source].id,
      target_document_id: documents[target].id,
    });

    assert.ok(written.id, `${instruction} was refused at the write`);
  }

  // Both halves, because they are two rules reading one table and either could be the one that is
  // wrong. An edge accepted at the write and reported afterwards is the state this whole change
  // exists to remove.
  assert.equal(edges(db), INSTRUCTED.length, 'an instructed edge did not reach the table');
  assert.deepEqual(ENDPOINTS.check(db), [], 'an edge a skill instructs is reported as a violation');
});

test('a pair the kind does not admit is refused at the write, and says what it admits', (t) => {
  const { db, call } = surface(t);
  const documents = corpus(db);
  const before = edges(db);

  let caught;

  try {
    call.create_dependency({
      kind: 'builds_on',
      source_document_id: documents.epic.id,
      target_document_id: documents.spec.id,
    });
  } catch (error) {
    caught = error;
  }

  assert.ok(caught, 'an epic-to-spec builds_on edge was accepted');
  assert.match(caught.message, /epic → spec/, 'the refusal does not name the pair it refused');
  assert.match(caught.message, /spec → discussion/, 'the refusal does not say what the kind admits');

  // **Asserted against the table**, as the cycle refusal beside it is: a message thrown after the
  // insert would satisfy every assertion above and leave the edge in place, which is the shape a
  // refusal fails in when it fails quietly.
  assert.equal(edges(db), before, 'the refused edge was left in the table');
});

test('an edge that arrives by other means is reported, named by its id and both ends', (t) => {
  const { db } = surface(t);
  const documents = corpus(db);

  // Written past the tool, which is what a restore does: FR14's check exists for the rows that
  // predate the rule or arrive without going through it.
  const edge = create(db, 'dependency', {
    kind: 'constrains',
    source_document_id: documents.spec.id,
    target_document_id: documents.other.id,
  });

  assert.deepEqual(ENDPOINTS.check(db), [{
    edge_id: edge.id, kind: 'constrains', source_kind: 'spec', target_kind: 'spec',
  }], 'the report does not locate the edge and name what is wrong with it');
});

test('a kind with no endpoint rows is unconstrained, at both its ends', (t) => {
  const { db, call } = surface(t);
  const documents = corpus(db);
  const first = create(db, 'story', { epic_id: documents.epic.id, number: 1 });
  const second = create(db, 'story', { epic_id: documents.epic.id, number: 2, position: 2 });

  assert.equal(
    db.prepare('SELECT count(*) AS n FROM dependency_kind_endpoint WHERE kind = ?')
      .get('blocks').n,
    0,
    'blocks has endpoint rows, so nothing below is about a kind that has none',
  );

  // The reason it has none: a story is not a document kind, so no pair over that table can say
  // what `blocks` admits. Reading the absence as "admit nothing" would refuse both of these.
  assert.ok(call.create_dependency({
    kind: 'blocks', source_story_id: first.id, target_story_id: second.id,
  }).id);
  assert.ok(call.create_dependency({
    kind: 'blocks', source_document_id: documents.epic.id, target_document_id: documents.spec.id,
  }).id);

  assert.deepEqual(ENDPOINTS.check(db), []);
});

test('a constrained kind with a story at one end is passed over rather than refused', (t) => {
  const { db, call } = surface(t);
  const documents = corpus(db);
  const story = create(db, 'story', { epic_id: documents.epic.id, number: 1 });

  // `dpm:do`'s own fixtures write this: a document built on a story. The endpoint rule is over
  // document kinds and a story has none, so the edge is outside what the rule can say — which is
  // what the register's `document` join has always done at both ends.
  assert.ok(call.create_dependency({
    kind: 'builds_on', source_document_id: documents.library.id, target_story_id: story.id,
  }).id);

  assert.deepEqual(ENDPOINTS.check(db), []);
});

test('the rule comes from the rows: removing them admits the pair that was refused', (t) => {
  const { db, call } = surface(t);
  const documents = corpus(db);

  const link = () => call.create_dependency({
    kind: 'builds_on',
    source_document_id: documents.epic.id,
    target_document_id: documents.spec.id,
  });

  assert.throws(link, /does not admit/, 'the refusal under test is not happening');

  // The control, and it is the claim the whole change turns on: the pairs are data. With
  // `builds_on`'s rows gone the kind is unconstrained, exactly as `blocks` is — so the same call
  // is accepted, and the register agrees with the tool about it rather than reporting what the
  // tool just allowed.
  db.prepare('DELETE FROM dependency_kind_endpoint WHERE kind = ?').run('builds_on');

  assert.ok(link().id, 'the refusal survived the rows it is supposed to come from');
  assert.deepEqual(ENDPOINTS.check(db), [], 'the register still reports an edge no rule refuses');
});
