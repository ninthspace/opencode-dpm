/**
 * Epic 03-03 Story 4 — the join: what one skill recommends is what the next one runs (FR7).
 *
 * **No story in this epic observes this, which is why it has one of its own.** Story 2 checks the
 * status skill recommends by reference; Story 3 checks the seven accept one; epic 03-02 checks a
 * reference resolves. Each of the three passes with the other two broken, and the failure FR7 was
 * written for lives in the seams between them — a reference printed in one form and expected in
 * another, a command recommending a skill whose Input never learned to take it.
 *
 * So this runs the whole path on one document: the reference comes from a tool's own output, goes
 * through the sentence the status table tells a person to type, and arrives at the receiving
 * skill's contract and the resolver. Nothing here recomputes an identifier, because an expectation
 * derived a second way agrees with a broken resolver whenever both are broken the same way.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openPlanningDatabase, handlers } from './support/planning-database.js';
import { childDocument, rootDocument } from './fixtures/planning.js';
import { prose, skillSource, section, toolNames } from './support/skills.js';
import { spineTools } from '../src/tools/index.ts';

/** The rows of the table a person reads, keyed by the skill each recommends. */
function recommended(source) {
  const marker = source.indexOf('**Recommended next steps**');
  const rows = source.slice(marker).split('\n').filter((line) => line.startsWith('|'));
  const found = new Map();

  for (const row of rows) {
    const skill = row.match(/`dpm-([a-z]+)`/);

    if (skill) found.set(skill[1], row);
  }

  return found;
}

test('a reference the tools printed survives the recommendation and comes back as the document', (t) => {
  const db = openPlanningDatabase(t);
  const spec = rootDocument(db, 'spec', { number: 47, slug: 'substrate' });
  const epic = childDocument(db, 'epic', spec, { sequence: 3, slug: 'reference-handoff' });
  const call = handlers(spineTools(db));

  // 1. What a person is shown. `list_epic` is the call the status skill makes in Phase 1, and the
  //    reference arrives on the row it returns — not from a second lookup, and not recomputed here.
  const listed = call.list_epic({ limit: 50 }).items.find((row) => row.id === epic.id);

  assert.ok(listed, 'the epic the status skill would report is in the list it would read');
  assert.ok(listed.reference, 'and the row carries the reference the table is told to print');

  // 2. What the table tells them to run. Read from the live skill, so a table rewritten to stop
  //    recommending a target breaks this rather than passing on a stale expectation.
  const row = recommended(skillSource('status')).get('do');

  assert.ok(row, 'the status table still recommends dpm-do for a ready epic');
  assert.match(row, /reference/,
    'and tells the reader to pass the epic\'s reference rather than anything else');

  // 3. What the receiving skill accepts. The contract is prose, so this is what a run reads — and
  //    it names the resolver, which is the step between the sentence and the row.
  const input = prose(skillSource('do'), 'Input');

  assert.match(input, /human reference/i, 'dpm-do says it takes a reference');
  assert.ok(toolNames(section(skillSource('do'), 'Input')).includes('resolve_reference'),
    'and names the tool that turns one into a document');

  // 4. What running it produces. The string that came off the row in step 1, passed verbatim.
  const resolved = call.resolve_reference({ reference: listed.reference, kind: 'epic' });

  assert.equal(resolved.id, epic.id,
    `'${listed.reference}' recommended for the epic resolved to ${resolved.kind} '${resolved.id}'`);
  assert.equal(resolved.reference, listed.reference,
    'and came back naming itself the same way, so the round trip is closed rather than merely ending somewhere');
});

test('the join is over a document the run built, not a reference written into the test', () => {
  const code = readFileSync(new URL(import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));

  // A literal reference here would make every assertion above agree with itself: the test would
  // pass whether or not any tool ever printed that string. The expectation has to come off a row.
  assert.deepEqual(code.filter((line) => /reference: '\d/.test(line)), [],
    'no reference is typed into this file — each one is read from what a tool returned');
});
