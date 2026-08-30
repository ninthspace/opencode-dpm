/**
 * Epic 03-04 Story 1 — a live document's bare ULID is refused at the write (FR16, FR19).
 *
 * **The refusal is exercised through the tools wherever a tool can reach it**, and through
 * `refuseBareUlids` directly only where the claim is about a column no tool takes as prose. A test
 * that called the predicate everywhere would pass with the two `crud.js` call sites deleted, which
 * is the one failure this story exists to prevent.
 *
 * The exemptions are the part that can go quietly wrong, so they have controls rather than
 * assertions: each is observed refusing once the exemption is removed. Without that, three
 * exemptions and no exemptions look identical from a suite that only writes prose.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { rootDocument, childDocument } from './fixtures/planning.js';
import { proseColumns } from './support/prose-columns.js';
import { refuseBareUlids, nothingExempt } from '../src/tools/prose-refusal.ts';
import { spineTools } from '../src/tools/index.ts';

/** A well-formed ULID naming nothing. Crockford's alphabet, and not any fixture's id. */
const ABSENT = '01JZZZZZZZZZZZZZZZZZZZZZZZ';

/** The refusal a call raises, as a message — or `null` where the call was allowed through. */
function refusalOf(run) {
  try {
    run();

    return null;
  } catch (error) {
    return error.message;
  }
}

/** A spec, an epic beneath it, and the tool dispatcher — the shape every case below needs. */
function corpus(t) {
  const db = openPlanningDatabase(t);
  const spec = rootDocument(db, 'spec', { number: 47, slug: 'substrate' });
  const epic = childDocument(db, 'epic', spec, { sequence: 4, slug: 'no-bare-ulid' });

  return { db, spec, epic, call: handlers(spineTools(db)) };
}

test('a section body naming a document by its id is refused, and told what to write', (t) => {
  const { spec, epic, call } = corpus(t);

  const message = refusalOf(() => call.create_document_section({
    document_id: epic.id,
    heading: 'Context',
    body: `This epic follows on from ${spec.id}, which settled the numbering.`,
    position: 1,
  }));

  assert.ok(message, 'the write was refused rather than stored');

  // Which tool, so the caller knows which of their calls it was.
  assert.match(message, /create_document_section/, 'the refusal names the tool that was called');

  // Which column, which is criterion 1's first half: a caller passing three strings needs to be
  // told which one carries the id, not that one of them does.
  assert.match(message, /document_section\.body/, 'and the column the id was found in');

  // The id, and the string to write instead — criterion 1's second half. A refusal that says only
  // "not allowed" leaves the writer guessing at a form they have evidently not met.
  assert.match(message, new RegExp(spec.id), 'and the id it found');
  assert.match(message, new RegExp(`\\{\\{ref:${spec.id}\\}\\}`), 'and the marker form to use instead');
});

test('an update carrying one is refused the same way a create is', (t) => {
  const { spec, epic, call } = corpus(t);
  const section = call.create_document_section({
    document_id: epic.id, heading: 'Context', body: 'Nothing named yet.', position: 1,
  });

  // The commoner arrival: prose amended after the document it names already exists.
  const message = refusalOf(() => call.update_document_section({
    id: section.id, body: `Superseded by ${spec.id}.`,
  }));

  assert.ok(message, 'the amendment was refused');
  assert.match(message, /document_section\.body/, 'naming the column, as the create does');
});

test('the marker form is not refused — the correct way to name a document still writes', (t) => {
  const { spec, epic, call } = corpus(t);

  const written = call.create_document_section({
    document_id: epic.id,
    heading: 'Context',
    body: `This epic follows on from {{ref:${spec.id}}}, which settled the numbering.`,
    position: 1,
  });

  assert.match(written.body, new RegExp(`\\{\\{ref:${spec.id}\\}\\}`),
    'the marker was stored as written');
});

test('the marker exemption is by shape and by order, observed on each path it could take', (t) => {
  const { db, spec, epic, call } = corpus(t);

  // **Arm 1 — the strip is what makes the marker invisible, not the pattern.** A scan with no
  // strip is written out here and observed finding the id inside the marker, so the passing case
  // above is a decision the implementation takes rather than a shape the regex happens to miss.
  const unstripped = `See {{ref:${spec.id}}}.`.match(/[0-9A-HJKMNP-TV-Z]{26}/g);

  assert.deepEqual(unstripped, [spec.id],
    'a scan that did not strip the marker first would find the id inside it, and refuse the one form allowed');

  // **Arm 2 — the exemption is derived from the column's role, not from how it is spelled.** Two
  // columns planted the wrong way round: a foreign key named nothing like an id, and a plain TEXT
  // column named as though it were one. A name-keyed exemption gets both backwards.
  db.exec(`CREATE TABLE planted (
             id TEXT PRIMARY KEY,
             owner TEXT REFERENCES document(id),
             body_id TEXT
           )`);

  assert.equal(refusalOf(() => refuseBareUlids(db, 'planted', { owner: spec.id }, 'control')), null,
    'the foreign key is exempt though its name says nothing about ids');
  assert.match(refusalOf(() => refuseBareUlids(db, 'planted', { body_id: spec.id }, 'control')),
    /planted\.body_id/, 'and the TEXT column is scanned though its name looks like a key');

  // **Arm 3 — the strip is applied to the text, not to the candidate list.** Filtering out ids
  // that appear in a marker *somewhere* would accept a body carrying both forms of the same id,
  // which is exactly the body an unfinished edit produces.
  const message = refusalOf(() => call.create_document_section({
    document_id: epic.id,
    heading: 'Context',
    body: `Follows {{ref:${spec.id}}}, and see also ${spec.id}.`,
    position: 1,
  }));

  assert.match(message, new RegExp(spec.id),
    'a body holding both the marker and the bare id is still refused for the bare one');
});

test('every column judged to hold prose is scanned, and the seam every write goes through calls it', (t) => {
  const { db, spec } = corpus(t);
  const columns = proseColumns();

  assert.ok(columns.length > 0, 'there are prose columns to enumerate');

  // The enumeration is the search index's judgement about what a person reads, taken as given —
  // criterion 3 pins the coverage claim to that list rather than to one written here, so a column
  // that becomes prose is covered by the file that already had to be told.
  const missed = columns.filter((key) => {
    const [table, column] = key.split('.');

    return refusalOf(() => refuseBareUlids(db, table, { [column]: `see ${spec.id}` }, 'sweep')) === null;
  });

  assert.deepEqual(missed, [], 'no prose column accepts a live document id written bare');

  // And the structural half. The per-column sweep above is over the predicate; this is what makes
  // it a claim about *tools*, since a tool cannot write except through these two functions.
  // **`.ts` since the port renamed every module under `src/`.** Filtering on `.js` after that would
  // have matched nothing here. This test survives that better than most — the equality on `writers`
  // below names a file, so an empty listing fails it, and the `find` after that would dereference
  // `undefined` — but it survives by accident rather than by design, and the two lines that catch it
  // are worth knowing about before someone simplifies either into a subset check.
  const sources = readdirSync(new URL('../src/tools/', import.meta.url), { recursive: true })
    .filter((entry) => entry.endsWith('.ts'))
    .map((entry) => [entry, readFileSync(new URL(`../src/tools/${entry}`, import.meta.url), 'utf8')])
    // Comments stripped, because `session.js` *describes* its adoption statement in prose and a
    // scan over the raw text reads that as a second write site. A doc comment naming SQL is what
    // this repository does everywhere; a check that cannot tell it from SQL would find one here
    // every time somebody explained a query.
    .map(([entry, source]) => [entry, source.split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n')]);

  const writers = sources
    .filter(([, source]) => /INSERT INTO |UPDATE \$\{table\}|UPDATE [a-z_]+ SET /.test(source))
    .map(([entry]) => entry);

  assert.deepEqual(writers, ['crud.ts'],
    'every write in the server is still built in crud.ts, so wiring the check there covers all of them');

  const crud = sources.find(([entry]) => entry === 'crud.ts')[1];

  assert.equal((crud.match(/refuseBareUlids\(db, table, values, where\)/g) ?? []).length, 2,
    'and both of its statement builders call the refusal before building the statement');
});

test('a foreign key holds a document id because that is what a foreign key is', (t) => {
  const { spec, epic, call } = corpus(t);

  const edge = call.create_dependency({
    kind: 'blocks', source_document_id: epic.id, target_document_id: spec.id,
  });

  assert.equal(edge.source_document_id, epic.id, 'the edge was written with the id it was given');
});

test("a session's state blob may carry one, because dpm never reads it as prose", (t) => {
  const { spec, call } = corpus(t);

  call.create_session({ id: '8d95ddc6-0000-0000-0000-000000000000', skill: 'dpm:do' });

  const updated = call.update_session({
    id: '8d95ddc6-0000-0000-0000-000000000000',
    phase: 'Story 1, task 5',
    state: JSON.stringify({ epic: spec.id }),
  });

  assert.match(updated.state, new RegExp(spec.id),
    'the blob was stored as the skill wrote it — there is no marker form for a value nothing renders');
});

test('a well-formed ULID naming no document is prose like any other string', (t) => {
  const { epic, call } = corpus(t);

  // A session id quoted in an observation is the real case. It is shaped like a document id and
  // names nothing renderable, so refusing it would reject prose with no correct form to offer.
  const written = call.create_document_section({
    document_id: epic.id,
    heading: 'Context',
    body: `Resumed from session ${ABSENT}, which the harness issued.`,
    position: 1,
  });

  assert.match(written.body, new RegExp(ABSENT), 'the unresolvable id was stored as written');
});

test('with the exemptions removed, each of the three is observed being refused', (t) => {
  const { db, spec, epic } = corpus(t);

  // The control the story is built on: three exemptions are only a finding if the check would
  // otherwise catch what they let through. Run per exemption rather than once, because a single
  // case passing says nothing about the other two.
  const foreignKey = refusalOf(
    () => refuseBareUlids(db, 'dependency', { source_document_id: epic.id }, 'control', nothingExempt),
  );

  assert.match(foreignKey, /dependency\.source_document_id/,
    'without the foreign-key exemption an edge between two documents cannot be written');

  const primaryKey = refusalOf(
    () => refuseBareUlids(db, 'document', { id: spec.id }, 'control', nothingExempt),
  );

  assert.match(primaryKey, /document\.id/,
    "without the primary-key exemption no row could carry its own id");

  const state = refusalOf(
    () => refuseBareUlids(db, 'session', { state: `{"epic":"${spec.id}"}` }, 'control', nothingExempt),
  );

  assert.match(state, /session\.state/,
    'without the named exemption a skill could not record which epic it was working');

  // And the exemptions are narrow: the same call with them in place lets all three through, so
  // what is shown above is the exemption doing the work rather than the corpus being empty.
  for (const [table, values] of [
    ['dependency', { source_document_id: epic.id }],
    ['document', { id: spec.id }],
    ['session', { state: `{"epic":"${spec.id}"}` }],
  ]) {
    assert.equal(refusalOf(() => refuseBareUlids(db, table, values, 'control')), null,
      `${table} writes normally with the derivation in place`);
  }
});
