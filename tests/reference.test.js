/**
 * Epic 03-01 Story 2 — the reference on every document row.
 *
 * Every assertion here goes through `spineTools(db)` and the handlers it returns. **Nothing calls
 * `defineTool`**, which is one of this story's two must-NOTs and the reason the module imports
 * nothing from `src/tools/convention.js`: a wrapper exercised in isolation passes whether or not
 * any tool was ever wired to it, and the failure that would hide — a tool built without the
 * declaration — is the one worth catching. The third test below reads this file to hold that.
 *
 * The other must-NOT governs what the expected value is compared against. `identifierOf` is what
 * the wrapper calls, so an assertion recomputing the expectation with it has two outcomes that
 * produce the same observed value and passes forever. The comparison is against `pathOf`'s
 * filename instead — the other consumer of the same rule, and the one a reader of `docs/` sees.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { fullCorpus } from './support/corpus.js';
import { counting } from './support/statements.js';
import { documentRowTools } from './support/document-tools.js';
import {
  childDocument, matrixUnderEpic, rootDocument, unnameableDocuments,
} from './fixtures/planning.js';
import { ancestryOf, pathOf } from '../src/projection/naming.ts';
import { spineTools } from '../src/tools/index.ts';

/** Every document row, keyed by id — what `ancestryOf` walks. */
const corpus = (db) => new Map(
  db.prepare('SELECT id, kind, numbering, number, sequence, slug, parent_id FROM document').all()
    .map((row) => [row.id, row]),
);

/**
 * The identifier `pathOf` embedded in a document's filename, or `null` where it writes no file.
 *
 * The kind and the slug are stripped off the end rather than the identifier split off the front,
 * because an identifier contains a hyphen of its own — `47-03` — and splitting on the first one
 * would take half of it.
 */
function identifierInFilename(db, byId, document) {
  const path = pathOf(db, document, ...ancestryOf(byId, document));

  if (path === null) return null;

  return basename(path).replace(new RegExp(`-${document.kind}-${document.slug}\\.md$`), '');
}

/** A database with one document of every seeded kind, plus the shapes Story 1 added. */
function everyShape(t) {
  const db = openPlanningDatabase(t);
  const tools = spineTools(db);

  fullCorpus(db, handlers(tools));
  matrixUnderEpic(db);

  return { db, tools, call: handlers(tools) };
}

test('every list and read tool over document rows carries a reference', (t) => {
  const { db, tools, call } = everyShape(t);
  const documents = corpus(db);

  // Enumerated from the built registry by what a tool reads, which is independent of the
  // `documentRows` declaration the wrapper acts on — see `support/document-tools.js`.
  const overDocuments = documentRowTools(tools);

  assert.ok(overDocuments.length >= 28, `found ${overDocuments.length} document tools to check`);

  for (const tool of overDocuments) {
    const kind = tool.name.replace(/^(list|read)_/, '');

    if (tool.name.startsWith('list_')) {
      const { items } = call[tool.name]({});

      assert.ok(items.length > 0, `${tool.name} returned rows to check`);
      for (const row of items) {
        assert.ok('reference' in row, `${tool.name} rows carry a reference`);
      }

      continue;
    }

    const [row] = [...documents.values()].filter((document) => document.kind === kind);

    assert.ok(row, `the corpus holds a ${kind} for ${tool.name} to read`);
    assert.ok('reference' in call[tool.name]({ id: row.id }), `${tool.name} carries a reference`);
  }
});

test('the reference is the identifier the projection filename embeds', (t) => {
  const { db, call } = everyShape(t);
  const byId = corpus(db);

  const compared = [];
  const noFile = [];

  for (const document of byId.values()) {
    const expected = identifierInFilename(db, byId, document);

    if (expected === null) {
      noFile.push(document.kind);
      continue;
    }

    const { reference } = call[`read_${document.kind}`]({ id: document.id });

    assert.equal(reference, expected, `${document.kind} '${document.id}' is named ${expected}`);
    compared.push(document.kind);
  }

  assert.ok(compared.length > 10, `compared ${compared.length} documents against their filenames`);
  assert.ok(compared.includes('coverage_matrix'),
    'including the matrix, which is the only shape where the wrong derivation differs');
  assert.deepEqual(noFile, ['adr'],
    'and the one kind excluded is the ADR, which renders inside its parent and has no filename');
});

test('the checks above are against the tools, not against the wrapper or the rule', () => {
  // Comments are read out first: both must-NOTs are explained in the prose above, and a check
  // over the raw text would be failed by the sentence describing what it forbids.
  const code = readFileSync(new URL(import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));

  assert.equal(
    code.some((line) => /convention\.js/.test(line)), false,
    'nothing here reaches defineTool — a wrapper never wired to a tool would pass',
  );
  // Assembled rather than written out, because the check is over this file and a literal here
  // would be the one occurrence it found — a check that can only ever fail on itself.
  const theRule = new RegExp(['identifier', 'Of'].join(''));

  assert.equal(
    code.some((line) => theRule.test(line)), false,
    'and nothing recomputes the expectation with the function the wrapper calls',
  );
  assert.ok(
    code.some((line) => /pathOf/.test(line)),
    'the expectation comes from pathOf instead, so the check read something',
  );
});

test('a document that cannot be named comes back with a null reference', (t) => {
  const db = openPlanningDatabase(t);
  const { unnumbered, orphan } = unnameableDocuments(db);
  const call = handlers(spineTools(db));

  assert.equal(call.read_scratch({ id: unnumbered.id }).reference, null,
    'a numbering = none document is named null rather than refused');
  assert.equal(call.read_scratch_leaf({ id: orphan.id }).reference, null,
    'and so is a child whose chain reaches no root');
});

test('a list holding an unnameable row among nameable ones loses nothing', (t) => {
  const db = openPlanningDatabase(t);
  const { orphan } = unnameableDocuments(db);
  const spec = rootDocument(db, 'spec', { number: 47, slug: 'substrate' });
  const named = childDocument(db, 'scratch_leaf', spec, { sequence: 2, slug: 'named' });

  const call = handlers(spineTools(db));
  const { items } = call.list_scratch_leaf({});

  assert.equal(items.length, 2, 'both rows come back — the unnameable one is not dropped');

  const references = Object.fromEntries(items.map((row) => [row.id, row.reference]));

  assert.equal(references[named.id], '47-02', 'the nameable row is named');
  assert.equal(references[orphan.id], null, 'and only the unnameable one carries null');
});

test('the statement count for a page does not move with the size of the corpus', (t) => {
  const measure = (epics) => {
    const counted = counting(openPlanningDatabase(t));
    const spec = rootDocument(counted.db, 'spec', { number: 47, slug: 'substrate' });

    for (let sequence = 1; sequence <= epics; sequence += 1) {
      childDocument(counted.db, 'epic', spec, { sequence, slug: `epic-${sequence}` });
    }

    const call = handlers(spineTools(counted.db));

    counted.reset();
    const { items } = call.list_epic({ limit: 50 });

    return { statements: counted.statements(), returned: items.length };
  };

  const small = measure(9);
  const large = measure(199);

  assert.equal(small.returned, 9, 'the small corpus returns every epic it has');
  assert.equal(large.returned, 50, 'the large one returns a full page rather than all 199');
  assert.equal(large.statements, small.statements,
    `a fifty-row page cost ${large.statements} statements against 200 documents and `
    + `${small.statements} against 10 — a per-row lookup would make the first fifty-one`);
});
