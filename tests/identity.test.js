/**
 * Story 1 — parentage, numbering, and the connection the whole schema rests on.
 *
 * Every rejection below is paired with the acceptance it is supposed to leave alone. A
 * constraint that rejects everything satisfies every must-NOT in this story, and would read
 * in a green run exactly like one that works.
 *
 * Where the reason for a rejection is the point — a kind-pin rather than a unique index, say
 * — the assertion names it. A test that only asserts *that* something threw will keep passing
 * when a different constraint starts doing the work, which happened once while these tables
 * were being probed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabaseFile } from './support/database.js';
import { openPlanningDatabase as planning } from './support/planning-database.js';
import { applySchema } from '../src/schema/index.ts';
import { openConnection } from '../src/db/connection.ts';
import { ulid } from '../src/id/ulid.ts';
import { registerCreators } from './support/creators.js';
import { create } from './fixtures/index.js';
import { applyVocabulary } from '../src/schema/seeds/index.ts';
import { childDocument, retroDocument, rootDocument, specWithEpic } from './fixtures/planning.js';

test('an epic parents onto a spec and not onto a review', (t) => {
  const db = planning(t);
  const spec = rootDocument(db, 'spec', { number: 47 });
  const review = rootDocument(db, 'review', { number: 1 });

  const epic = childDocument(db, 'epic', spec);
  assert.equal(epic.parent_id, spec.id, 'an epic under a spec is written');

  assert.throws(
    () => childDocument(db, 'epic', review, { sequence: 2 }),
    /FOREIGN KEY constraint failed/,
    'document_kind_parent has no (epic, review) row, so the pairing is unsatisfiable',
  );
});

test('a review parents onto either a spec or an epic, and onto a runbook not at all', (t) => {
  const db = planning(t);
  const { spec, epic } = specWithEpic(db);
  const runbook = rootDocument(db, 'runbook', { number: 1 });

  assert.ok(rootDocument(db, 'review', { number: 1, parent_id: spec.id, parent_kind: 'spec' }));
  assert.ok(rootDocument(db, 'review', { number: 2, parent_id: epic.id, parent_kind: 'epic' }));

  assert.throws(
    () => rootDocument(db, 'review', { number: 3, parent_id: runbook.id, parent_kind: 'runbook' }),
    /FOREIGN KEY constraint failed/,
    'two allow-listed parents, and a third that is not, from the same table',
  );
});

test('a parent_kind cannot misdescribe the parent it points at', (t) => {
  const db = planning(t);
  const { spec, epic } = specWithEpic(db);
  const review = rootDocument(db, 'review', { number: 1, parent_id: spec.id, parent_kind: 'spec' });

  // (retro, epic) and (retro, spec) are both allow-listed, so the allow-list foreign key is
  // satisfied by this row and cannot be what rejects it. What rejects it is
  // (parent_id, parent_kind) against document(id, kind): the claim is checked against the
  // parent's own row, so it cannot be satisfied by lying.
  assert.throws(
    () => retroDocument(db, epic, { parent_id: review.id, parent_kind: 'epic' }),
    /FOREIGN KEY constraint failed/,
    'a retro claiming an epic parent while pointing at a review',
  );

  assert.ok(
    retroDocument(db, epic),
    'and the same row with the two agreeing is accepted',
  );
});

test('a kind whose dir is NULL renders inside its parent and still takes documents', (t) => {
  const db = planning(t);
  const spec = rootDocument(db, 'spec', { number: 47 });

  const adrKind = db.prepare("SELECT dir FROM document_kind WHERE kind = 'adr'").get();
  assert.equal(adrKind.dir, null, 'an ADR produces no file of its own');

  const adr = childDocument(db, 'adr', spec, { sequence: 5, slug: 'node-sqlite' });
  assert.equal(adr.sequence, 5, 'and is numbered within the spec that prompted it');

  const filed = db.prepare("SELECT count(*) AS n FROM document_kind WHERE dir IS NOT NULL").get().n;
  assert.ok(filed > 0, 'while the kinds that do produce files are unaffected');
});

test('numbering follows the kind, and each scheme rejects the others', (t) => {
  const db = planning(t);
  const spec = rootDocument(db, 'spec', { number: 47 });

  assert.throws(
    () => rootDocument(db, 'spec', { number: null, sequence: 3 }),
    /CHECK constraint failed/,
    "a kind declared 'root' cannot store a sequence instead",
  );
  assert.throws(
    () => create(db, 'document', { kind: 'epic', numbering: 'child', sequence: 1 }),
    /CHECK constraint failed/,
    'and a child-numbered row needs a parent to be counted within',
  );
  assert.throws(
    () => childDocument(db, 'epic', spec, { parent_kind: null }),
    /CHECK constraint failed/,
    'parent_id and parent_kind are set together or not at all',
  );
});

test('a spec is numbered globally and an epic within its spec', (t) => {
  const db = planning(t);
  const specA = rootDocument(db, 'spec', { number: 47 });
  const specB = rootDocument(db, 'spec', { number: 48 });

  assert.throws(
    () => rootDocument(db, 'spec', { number: 47 }),
    /UNIQUE constraint failed: document\.kind, document\.number/,
    'two specs cannot share a number',
  );

  childDocument(db, 'epic', specA, { sequence: 1 });
  assert.ok(childDocument(db, 'epic', specB, { sequence: 1 }), 'every spec restarts its epics at 1');

  assert.throws(
    () => childDocument(db, 'epic', specA, { sequence: 1 }),
    /UNIQUE constraint failed: document\.kind, document\.parent_id, document\.sequence/,
    'but not within one spec — which a single UNIQUE (kind, number) could not express',
  );
});

test('creating an epic with a non-existent spec_id fails, and no row is written', (t) => {
  const db = planning(t);
  const before = db.prepare('SELECT count(*) AS n FROM document').get().n;

  assert.throws(
    () => create(db, 'document', {
      kind: 'epic',
      numbering: 'child',
      sequence: 1,
      parent_id: ulid(),        // well-formed, and names nothing
      parent_kind: 'spec',
    }),
    /FOREIGN KEY constraint failed/,
  );

  assert.equal(
    db.prepare('SELECT count(*) AS n FROM document').get().n,
    before,
    'the failed write left nothing behind — the violation is an error, not a discrepancy found later',
  );
});

test('a connection dpm opens enforces foreign keys, whatever the default was', (t) => {
  // This is the one test here that builds its own database rather than taking a prepared one,
  // because the criterion is about a *connection* and needs a file two of them can share.
  registerCreators();
  const file = openDatabaseFile(t);

  const setup = openConnection(file.path);
  t.after(() => setup.close());
  applySchema(setup);
  applyVocabulary(setup);
  const spec = rootDocument(setup, 'spec', { number: 47 });

  const dangling = {
    kind: 'epic',
    numbering: 'child',
    sequence: 1,
    parent_id: ulid(),
    parent_kind: 'spec',
  };

  // The control, and the half that makes this test able to fail: a connection opened without
  // going through `openConnection` accepts the identical row. The schema alone guarantees
  // nothing — `PRAGMA foreign_keys` is per-connection.
  const loose = file.connect({ foreignKeys: false });
  assert.ok(create(loose, 'document', { ...dangling, slug: 'accepted-by-a-loose-connection' }));

  const fresh = openConnection(file.path);
  t.after(() => fresh.close());
  assert.throws(
    () => create(fresh, 'document', { ...dangling, sequence: 2 }),
    /FOREIGN KEY constraint failed/,
    'a fresh connection through openConnection rejects what the loose one took',
  );

  assert.equal(
    fresh.prepare('PRAGMA foreign_key_check').all().length,
    1,
    'and reports the row the loose connection let through, rather than inheriting its silence',
  );
  assert.ok(spec.id);
});
