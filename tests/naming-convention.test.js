/**
 * Epic 03-03 Story 1 — the convention governing what a skill says about a document (FR4, FR18).
 *
 * **These check the rule is stated, and that is all they can check.** Whether any skill obeys it is
 * Story 2's sweep over the corpus, and the separation is deliberate rather than a split for
 * convenience: a criterion asserting a section exists reads as the natural test of a convention and
 * has no purchase on the behaviour the convention exists to produce. Saying so here is what stops
 * the pair being read as one check with a redundant half.
 *
 * The assertions go through `prose()` rather than the raw text, because the file is hard-wrapped —
 * a phrase sits on one line today and across two the moment a word above it changes, and an
 * assertion written with a wrap in it stops constraining anything the moment the wrap moves.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conventions, prose, section } from './support/skills.js';

const HEADING = 'Naming a Document';
const SIBLING = 'Cross-References';

test('the shared conventions carry a section on what a skill says about a document', () => {
  const source = conventions();
  const body = prose(source, HEADING);

  assert.ok(body.length > 0, `there is a ${HEADING} section to read`);

  // The rule itself: the pair a person is given, and where the id keeps working.
  assert.match(body, /reference and the title/i, 'it says to name a document by reference and title');
  assert.match(body, /tool argument/i, 'and says where the id is still the right value');

  // The null case, which is the half a rule stated only for the happy path leaves a run to invent.
  assert.match(body, /`null`/, 'it names the unnamed row');
  assert.match(body, /no reference yet/i, 'and says what to say about one');

  // The reading, watched failing. Without this the two assertions above pass against any file that
  // happens to contain the words, including one where the heading was never added.
  assert.equal(prose(source.replace(`## ${HEADING}`, '## Something Else'), HEADING), '',
    'the reading finds the section by its heading rather than by its words');
});

test('it is a section beside Cross-References rather than a paragraph inside it', () => {
  const source = conventions();

  assert.match(source, new RegExp(`^## ${HEADING}$`, 'm'), `${HEADING} is a top-level section`);
  assert.match(source, new RegExp(`^## ${SIBLING}$`, 'm'), `and so is ${SIBLING}`);

  // Neither body contains the other's heading, which is what "beside" means once the file is read
  // rather than looked at: `section()` stops at the next heading of the same level or higher, so a
  // subsection would put one inside the other's body and this would say so.
  assert.doesNotMatch(section(source, HEADING), new RegExp(`^#+ ${SIBLING}$`, 'm'),
    `${SIBLING} does not sit inside ${HEADING}`);
  assert.doesNotMatch(section(source, SIBLING), new RegExp(`^#+ ${HEADING}$`, 'm'),
    'and it does not sit inside Cross-References either');

  // What separates them is stated, not just structural. Two sections a reader cannot tell apart get
  // merged by the next person to tidy the file, and the merge loses the distinction FR4 turns on.
  assert.match(prose(source, HEADING), /governs what is said/i,
    'the section says which of the two governs speech');
  assert.match(prose(source, HEADING), new RegExp(`${SIBLING} governs what is stored`, 'i'),
    'and which governs what is written to the database');
});

test('the same section states the stored-prose rule, not only the spoken one', () => {
  const body = prose(conventions(), HEADING);

  // FR18: the convention covers a document named inside a body as well as one named to a person.
  assert.match(body, /\{\{ref:<id>\}\}/, 'it names the marker form stored prose takes');
  assert.match(body, /body|observation|decision/i, 'and says where stored prose is found');

  // The two rules are stated as one, which is the claim FR2 makes about the derivation. A section
  // presenting them as unrelated conventions would be true sentence by sentence and wrong about the
  // thing that makes both of them safe.
  assert.match(body, /same rule|one derivation/i,
    'the spoken rule and the stored rule are joined rather than listed');
});
