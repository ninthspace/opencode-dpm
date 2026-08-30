/**
 * Epic 03-02 Story 1 — `resolve_reference` returns the one document.
 *
 * Every assertion goes through `spineTools(db)` and the handlers it returns. Nothing calls
 * `documentsByIdentifier` directly, and that is the point rather than a style: the map is what the
 * tool is built on, so a test that checked the map would pass whether or not any tool was wired to
 * it — and a tool that was never registered is exactly the failure this story could produce.
 *
 * **What the expected value is compared against decides whether these tests mean anything.** The
 * reference a document resolves by is taken from *what a read tool returned for that document*,
 * never recomputed here. That is criterion 4's own wording — "a reference read from any tool's
 * output is accepted verbatim" — and it is also the only comparison that can fail: an expectation
 * built by calling `identifierOf` a second time would agree with a broken resolver whenever both
 * were broken the same way, which is every way they can be broken at once.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { fullCorpus } from './support/corpus.js';
import { counting } from './support/statements.js';
import { documentRowTools, kindOf } from './support/document-tools.js';
import { childDocument, matrixUnderEpic, rootDocument } from './fixtures/planning.js';
import { spineTools } from '../src/tools/index.ts';

/** A database holding one document of every seeded kind, plus the colliding epic/matrix pair. */
function everyShape(t) {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);
  const call = handlers(tools);

  return { db, tools, call, documents: fullCorpus(db, call), pair: matrixUnderEpic(db) };
}

// --- Criterion 1: the single match ---------------------------------------------------------------

test('every document in the corpus resolves by the reference its own read tool printed', (t) => {
  const { call, documents } = everyShape(t);
  const kinds = Object.entries(documents);

  assert.ok(kinds.length > 10, `only ${kinds.length} kinds were built, so little was resolved`);

  for (const [kind, document] of kinds) {
    const read = call[`read_${kind}`]({ id: document.id });

    assert.ok(read.reference, `read_${kind} printed no reference to resolve by`);

    const resolved = call.resolve_reference({ reference: read.reference, kind });

    assert.equal(resolved.id, document.id,
      `'${read.reference}' resolved to ${resolved.kind} '${resolved.id}' rather than the ${kind} `
      + 'it was printed for');
  }
});

// --- Criterion 2: the kind narrows a shared reference --------------------------------------------

test('a reference two documents share resolves to whichever kind the caller named', (t) => {
  const { call, pair } = everyShape(t);
  const shared = call.read_epic({ id: pair.epic.id }).reference;

  // The pair exists because `identifierOf` gives a coverage matrix its epic's number by design —
  // both are `47-03` here — and the kind in the filename is what keeps the two files apart. That
  // is the collision `kind` exists for, and it is real rather than contrived.
  assert.equal(call.read_coverage_matrix({ id: pair.matrix.id }).reference, shared,
    'the fixture pair does not actually share a reference, so this test narrows nothing');

  assert.equal(call.resolve_reference({ reference: shared, kind: 'epic' }).id, pair.epic.id);
  assert.equal(
    call.resolve_reference({ reference: shared, kind: 'coverage_matrix' }).id, pair.matrix.id,
  );

  // **Both directions, because one of them passes for the wrong reason.** A resolver that ignored
  // `kind` and returned whichever candidate came first would satisfy whichever assertion happened
  // to name that one. Only asking for the other kind and getting the other document says the
  // argument was read.
});

// --- Criterion 3: the bound ----------------------------------------------------------------------

test('resolving costs the same number of statements whatever the corpus holds', (t) => {
  // The corpora are built here rather than taken from the fixture, and deliberately: a threshold
  // quantified over a shared fixture is a threshold on that fixture's size, and this fixture is
  // kept small on purpose.
  const measure = (epics) => {
    const counted = counting(openPlanningDatabase(t));
    const spec = rootDocument(counted.db, 'spec', { number: 47, slug: 'substrate' });

    for (let sequence = 1; sequence <= epics; sequence += 1) {
      childDocument(counted.db, 'epic', spec, { sequence, slug: `epic-${sequence}` });
    }

    const call = handlers(spineTools(counted.db));

    counted.reset();

    // The last epic, so the answer is never the first row the walk happens to reach.
    const resolved = call.resolve_reference({ reference: `47-${String(epics).padStart(2, '0')}` });

    return { statements: counted.statements(), kind: resolved.kind };
  };

  const small = measure(9);
  const large = measure(199);

  assert.equal(small.kind, 'epic', 'the small corpus resolved something');
  assert.equal(large.kind, 'epic', 'and so did the large one');
  assert.equal(large.statements, small.statements,
    `resolving cost ${large.statements} statements against 200 documents and ${small.statements} `
    + 'against 10 — a lookup per candidate document would make the first two hundred');
});

// --- Criterion 4: the verbatim round trip --------------------------------------------------------

test('a reference from any document-row tool is accepted back with no transformation', (t) => {
  const { call, tools, documents } = everyShape(t);
  const reached = documentRowTools(tools);

  assert.ok(reached.length > 20, `only ${reached.length} document-row tools were enumerated`);

  const checked = [];

  for (const tool of reached) {
    const kind = kindOf(tool);
    const document = documents[kind];

    if (!document) continue;

    // A page and a single row, because the reference arrives on both and criterion 4 says "any
    // tool's output". A list whose rows carried a different reference from the read tool's would
    // be invisible to a test that only ever read one row.
    const printed = tool.name.startsWith('list_')
      ? call[tool.name]({ limit: 50 }).items.find((row) => row.id === document.id)?.reference
      : call[tool.name]({ id: document.id }).reference;

    assert.ok(printed, `${tool.name} printed no reference for its ${kind}`);

    const resolved = call.resolve_reference({ reference: printed, kind });

    assert.equal(resolved.id, document.id, `${tool.name}'s '${printed}' did not round-trip`);

    // The verbatim half, asserted rather than assumed: what came back on the row is the string
    // that was passed in, so nothing between the two normalised, padded or case-folded it.
    assert.equal(resolved.reference, printed,
      `${tool.name}'s reference changed on the way through resolve_reference`);

    checked.push(tool.name);
  }

  assert.ok(checked.length > 20, `only ${checked.length} tools had a document to round-trip`);
});
