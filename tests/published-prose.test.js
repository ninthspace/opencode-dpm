/**
 * Epic 03-04 Story 2 — nothing published carries a bare ULID (FR17).
 *
 * **Stated separately from the refusal that produces it, and checked separately.** Story 1 asserts
 * that a bare id cannot be written; this asserts what a reader actually meets, which is a different
 * claim by one step: prose could be clean at the boundary and a renderer could still emit an id of
 * its own — from a template, from a fallback where a marker did not resolve, from any value the
 * projection interpolates without being told it is prose. So the scan is over the rendered tree
 * rather than over what the renderer returned.
 *
 * `publishedTree` is the fixture, and it was built for this: its own note says a check over what
 * the renderer wrote has nothing to say about git, and a fixture with a repository around it would
 * put two failure modes in front of this one that its subject cannot cause. Publishing into a
 * scratch root is also what keeps this suite away from `docs/`, which is generated output the
 * pre-commit guard holds against the database and which no test has any business regenerating.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { publishedTree } from './support/published.js';
import { filesUnder } from './support/sources.js';
import { proseColumns } from './support/prose-columns.js';

/** Crockford's alphabet, as `src/id/ulid.js` encodes it. */
const ULID = /[0-9A-HJKMNP-TV-Z]{26}/g;

/** Every file under `docs/` in a published tree, as `[relative path, contents]`. */
function rendered(root) {
  return filesUnder(join(root, 'docs'))
    .map((path) => [path.slice(root.length + 1), readFileSync(path, 'utf8')]);
}

/** Where a live document's id appears in a set of files, as complaints. */
function bareIds(db, files) {
  const live = db.prepare('SELECT id FROM document WHERE id = ?');

  return files.flatMap(([path, contents]) =>
    [...new Set(contents.match(ULID) ?? [])]
      .filter((id) => live.get(id) !== undefined)
      .map((id) => `${path} names document '${id}' by its id`));
}

test('a published corpus carries no document id anywhere a reader will meet one', (t) => {
  const { root, db } = publishedTree(t, 'dpm-published-prose-');
  const files = rendered(root);

  assert.ok(files.length > 0, 'the publish produced files to scan');

  assert.deepEqual(bareIds(db, files), [],
    'no file under docs/ names a live document by its id');

  // **And the corpus does name documents**, which is what stops the assertion above passing on an
  // empty result: a corpus with no cross-references satisfies FR17 by carrying nothing to get
  // wrong. Swept over every prose column rather than over `document_section.body`, which is where
  // the first draft looked and found nothing — this corpus names documents from a criterion, a
  // matrix note and an ADR consequence, and none of them is a section. It is the same enumeration
  // Story 1's coverage check reads, so the two agree about what prose is by construction.
  const markers = proseColumns()
    .map((key) => key.split('.'))
    .reduce((total, [table, column]) => total + db
      .prepare(`SELECT count(*) AS n FROM ${table} WHERE ${column} LIKE '%{{ref:%'`).get().n, 0);

  assert.ok(markers > 0, 'the corpus holds prose that names other documents');

  // Each one resolved. A marker left verbatim is a reference nobody can follow either, and it is
  // the shape a scan for bare ids cannot see.
  assert.deepEqual(files.filter(([, contents]) => contents.includes('{{ref:')).map(([path]) => path),
    [], 'every marker resolved — none reached the published tree as written');
});

test('the scan finds a bare id when there is one to find', (t) => {
  const { root, db, documents } = publishedTree(t, 'dpm-published-prose-control-');

  assert.deepEqual(bareIds(db, rendered(root)), [], 'the tree starts clean');

  // The control. Without it the first test passes against a scanner that matches nothing — a
  // broken pattern, a wrong root, a walk that returned directories — and reports that as a clean
  // tree, which is the one failure a must-criterion over an absence cannot otherwise catch.
  writeFileSync(join(root, 'docs', 'planted.md'),
    `Superseded by ${documents.spec.id}, which is exactly what FR17 forbids.\n`);

  assert.deepEqual(bareIds(db, rendered(root)),
    [`docs/planted.md names document '${documents.spec.id}' by its id`],
    'the planted id is found and named by its file, and nothing else in the tree is');
});
