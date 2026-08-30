/**
 * NFR6's register, and what makes it a criterion rather than a sentiment.
 *
 * "Every condition capable of producing a false pass blocks rather than warns" has no set to
 * check against, so a suite with one such test passes as readily as a suite with ten. The
 * spec enumerates twenty-three conditions for that reason, and NFR6's criterion is checked against
 * the table rather than against a reading of the code.
 *
 * This file is that check. Each condition is listed with **one** of two dispositions:
 *
 * - `test` — the name of a test in this suite that asserts the condition is refused. The name
 *   is verified to exist, so a renamed or deleted test fails here rather than quietly leaving
 *   a condition uncovered. That is the entire mechanism: a citation nobody resolves is how a
 *   register goes stale without anyone noticing.
 * - `closedIn` — the epic that closes it, for the conditions whose blocking mechanism this
 *   epic does not build. Six of the first twenty were like that, and pretending otherwise would
 *   have made this file the thing it exists to prevent.
 *
 * **The second disposition is unused as it stands, and that is the register being satisfied rather
 * than the mechanism being retired.** The branch stays because the register outlives any one epic:
 * a condition whose mechanism nobody has built yet needs somewhere honest to sit rather than a
 * citation to a test that does not exist. #25 is the round trip it exists for — deferred to 47-12
 * while FR13's corpus check was unbuilt, converted to a citation once that epic built it. The
 * assertion below passes over an empty set precisely because nothing is deferred, not because
 * nothing checks, so it is driven on planted deferrals rather than left to say so.
 *
 * **A citation resolves a name and cannot read what the test asserts.** That gap is entry #18's
 * own shape turned on the register — a claim outliving what makes it true — and no assertion in
 * this file can close it. Each of the six conversions was therefore mutation-checked at its
 * source: the guard the condition names was broken, the cited test was confirmed to fail, and the
 * source reverted. The record is in Epic 47-05's Notes.
 *
 * **The register is itself under test, and now actually is.** The count, the numbering and the
 * conditions are read from the spec's table at test time rather than transcribed here, so a
 * condition added to the spec fails this file until it has a disposition. Until Epic 47-11 they
 * were a hand-kept array: it asserted count and contiguity over its own copy, stayed internally
 * consistent, and said twenty-three while the spec said twenty-five.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { moduleFilesUnder } from './support/sources.js';
import { register } from './support/register.js';

const TESTS_DIRECTORY = new URL('.', import.meta.url).pathname;

/**
 * Where a `closedIn` deferral has to resolve to, so "later" cannot name an epic nobody wrote.
 *
 * The frozen spec-47 corpus under `tests/fixtures/`, not the repository's `docs/`. Every epic a
 * disposition defers to was written under CPM and is finished; the repository has since migrated to
 * dpm and parked that corpus. See `tests/corpus-snapshot/README.md`.
 */
const EPICS = join(import.meta.dirname, 'corpus-snapshot', 'epics');

/**
 * What the spec cannot say: which test closes each condition, keyed by the register's number.
 *
 * The number is the join key — "a new condition is appended, and the number it gets is never
 * reused", which the spec's table says in as many words — so this map resolves against the parse
 * in both directions. A condition with no disposition fails, and a disposition naming no condition
 * fails, which is what makes the pair a reconciliation rather than a lookup.
 */
const DISPOSITIONS = new Map(Object.entries({
  1: { test: 'coverage identity is the fragment, and position is no part of it' },
  2: { test: 'editing a story criterion clears the ✓ on every coverage row bound to it' },
  3: { test: 'a row written in the same call sequence is searchable immediately' },
  4: { test: 'a hand-edited generated file fails the guard, naming the file' },
  5: { test: 'an allocation never reports success without a number' },
  6: { test: 'entry 1 — a cycle among gates_work edges' },
  7: { test: 'a connection dpm opens enforces foreign keys, whatever the default was' },
  8: { test: 'a term from the wrong domain is rejected in every slot that draws from taxonomy' },
  // **Not `dumping the same state twice from independent databases is byte-stable`**, which is
  // the obvious citation and is the *claim* rather than the guard. Dropping the `ORDER BY` from
  // the row select leaves it green — two databases built by the same statements in the same order
  // hand back the same unordered scan — while the ordering test below fails at once. Determinism
  // is only observable where the inputs differ, so the citation has to be the test that varies
  // them. Found by driving the mutation; nothing about the two names says which is which.
  9: { test: 'rows are emitted in primary-key order regardless of the order they were written' },
  10: { test: 'a label of any shape is stored against the class it was given, never one read off it' },
  11: { test: "entry 3 — coverage joining one spec's requirement to another spec's criterion" },
  12: { test: 'every foreign key into document is kind-pinned, except the ones the Data Model names' },
  13: { test: 'editing the coverage fragment clears the ✓ on that row' },
  14: { test: 'retiring a term leaves the rows that reference it intact and stops new ones arriving' },
  15: { test: 'a search covering sections alone misses five of the six, and says nothing about it' },
  16: { test: 'every table entry_fts indexes has all three triggers, and none has fewer' },
  17: { test: 'a claimed requirement is distinguishable by query from an identically bound unclaimed one' },
  18: { test: 'a completeness claim is cleared when a bound fragment or the requirement text is edited' },
  19: { test: 'entry 13 — a {{ref:}} marker naming a document that is not there' },
  20: { test: 'entry 12 — a document assigned to a milestone belonging to another spec' },
  21: { test: 'the plugin manifest declares a server whose entry point exists' },
  22: { test: 'an update clears a nullable column when told to, and leaves it alone when not' },
  23: { test: 'a retired blocker goes on blocking, where the same blocker completed does not' },
  24: { test: 'every binary refuses to open a database on a runtime without FTS5' },
  // **A deferral converted, which is the branch working rather than the branch being retired.**
  // #25 sat on `closedIn: '47-12'` while its mechanism was unbuilt; 47-12 Story 3 built it, so the
  // disposition is now a citation like every other. The cited test reads the corpus against the
  // live registry, so it fails on a skill that renders stored text from a read that never asked.
  25: { test: 'every read of a withholding tool asks for the body or is recorded as not needing it' },
  // **Not `every table entry_fts indexes has all three triggers, and none has fewer`**, which is
  // #16's citation and is the obvious neighbour. That test asserts the index is maintained for the
  // tables it covers, and #26 is the entry about a column the index never covered — it stays green
  // on a schema that grows a prose column and indexes nothing. The citation has to be the
  // reconciliation, which reads both enumerations off the live schema and fails on the column
  // rather than on the trigger.
  26: { test: 'every column holding prose is indexed, or excluded for a reason the schema still bears out' },
}).map(([entry, disposition]) => [Number(entry), disposition]));

/** Every `test('…')` name the suite declares, read from the files rather than from a list. */
function declaredTests() {
  const names = new Set();

  for (const file of moduleFilesUnder(TESTS_DIRECTORY).filter((path) => path.endsWith('.test.js'))) {
    // Group 1 is the quote, group 2 is the name — reading the first capture instead of the
    // second builds a set of two quote characters against which every citation fails to
    // resolve, and it was the size guard below that said so rather than any citation.
    for (const [, , name] of readFileSync(file, 'utf8').matchAll(/^test\(\s*(['"])((?:\\.|(?!\1).)*)\1/gm)) {
      names.add(name.replaceAll('\\\'', "'"));
    }
  }

  return names;
}

/** The count below which a parse is not a short register but a broken read. */
const FLOOR = 26;

/**
 * Everything wrong with a register and its dispositions, as a list of complaints.
 *
 * A function rather than a run of assertions, so the controls can drive **this** on inputs written
 * to be wrong instead of restating its rules in a second place. A control that reimplements what it
 * guards tests the reimplementation — which is the shape of the very defect this story is closing.
 *
 * @param {ReturnType<typeof register>} conditions
 * @param {Map<number, {test?: string, closedIn?: string}>} dispositions
 * @returns {string[]} Empty when the register is fully and unambiguously disposed.
 */
function audit(conditions, dispositions) {
  const complaints = [];

  // **The non-vacuity guard, and it is the point rather than ceremony.** Every check below is over
  // the parse, so a parse returning nothing satisfies all of them and an empty or unrecognised
  // table reads as a fully disposed register. This is the complaint that arrives instead.
  if (conditions.length < FLOOR) {
    complaints.push(`the register parsed to ${conditions.length} conditions, below the ${FLOOR} it holds`);
  }

  const numbers = conditions.map((condition) => condition.entry);
  const contiguous = Array.from({ length: conditions.length }, (unused, index) => index + 1);

  if (numbers.join() !== contiguous.join()) {
    complaints.push(`the numbering is not contiguous: ${numbers.join(', ')}`);
  }

  for (const condition of conditions) {
    if (condition.condition.length <= 3) {
      complaints.push(`#${condition.entry} parsed with an empty summary — the columns have moved`);
    }

    // The criterion: a condition added to the spec fails until it has a disposition.
    if (!dispositions.has(condition.entry)) {
      complaints.push(`#${condition.entry} has no disposition: ${condition.condition}`);
    }
  }

  const registered = new Set(numbers);

  for (const [entry, disposition] of dispositions) {
    // The other direction, so a disposition cannot outlive the condition it was written for.
    if (!registered.has(entry)) complaints.push(`#${entry} is disposed and the spec does not carry it`);

    if (!disposition.test && !disposition.closedIn) {
      complaints.push(`#${entry} has neither a test nor a home, which is not a disposition`);
    }

    if (disposition.test && disposition.closedIn) {
      complaints.push(`#${entry} has both, which is a claim that has not decided what it is`);
    }

    // A deferral is a disposition only while it names somewhere that exists. `closedIn: ''` is what
    // "we'll get to it" looks like written down, and falls to the complaint above; an epic nobody
    // wrote is the same evasion with a number on it, and falls here.
    if (disposition.closedIn
      && !readdirSync(EPICS).some((file) => file.startsWith(`${disposition.closedIn}-epic-`))) {
      complaints.push(`#${entry} defers to epic ${disposition.closedIn}, and no such epic exists`);
    }
  }

  return complaints;
}

test('every condition the spec registers has a disposition, and every disposition a condition', () => {
  assert.deepEqual(audit(register(), DISPOSITIONS), []);
});

test('every condition this epic closes names a test that exists', () => {
  const declared = declaredTests();

  // The guard on the guard: if the scan found nothing, every citation below would resolve
  // against an empty set and the assertion would still be checking something — but against
  // nothing. A suite this size has far more than fifty.
  assert.ok(declared.size > 50, `only ${declared.size} tests found — the scan is not reading the suite`);

  const cited = [...DISPOSITIONS].filter(([, disposition]) => disposition.test);

  assert.ok(cited.length >= 25, `only ${cited.length} conditions cite a test, so this checks almost nothing`);

  const unresolved = cited
    .filter(([, disposition]) => !declared.has(disposition.test))
    .map(([entry, disposition]) => `#${entry}: ${disposition.test}`);

  assert.deepEqual(unresolved, [], 'a citation nobody resolves is how a register goes stale unnoticed');
});

test('nothing is deferred, and a deferral is still only a disposition where it lands somewhere', () => {
  const deferred = [...DISPOSITIONS].filter(([, disposition]) => disposition.closedIn);

  // **Empty, and #25 is why it is empty rather than why it was not.** Six of twenty were deferred
  // when Epic 47-01 wrote this file; Epic 47-05 Story 6 closed the last of those, 47-11 deferred
  // #25 to 47-12 because FR13's corpus check was unbuilt, and 47-12 built it. Every condition the
  // spec registers now cites a test that runs.
  assert.deepEqual(deferred.map(([entry]) => entry), [],
    'the set of deferred conditions has changed — each one is a mechanism nobody has built');

  // Which leaves the branch asserted over nothing, so it is driven on planted deferrals instead.
  // The distinction is the whole value of `closedIn`: a home that exists is a disposition, and one
  // that does not is "later" with a number attached.
  const lands = new Map([...DISPOSITIONS, [25, { closedIn: '47-12' }]]);
  const nowhere = new Map([...DISPOSITIONS, [25, { closedIn: '47-99' }]]);

  assert.deepEqual(audit(register(), lands), [],
    'a deferral naming an epic that exists was refused');
  assert.deepEqual(audit(register(), nowhere),
    ['#25 defers to epic 47-99, and no such epic exists']);

  // NFR6's criterion is over the register entire, so every condition is disposed one way or the
  // other — the count below is the parse's, not this file's, which is what makes it a claim about
  // the register rather than about the map.
  assert.equal(DISPOSITIONS.size, register().length,
    'NFR6\'s criterion is over the register entire, so anything short of all of it fails');
});

// --- must NOT: a parse matching no rows reads as a satisfied register ----------------------------

test('a register that failed to parse is refused, not read as fully disposed', () => {
  const table = (...rows) => [
    '### The false-pass register',
    '',
    '| # | Condition | Where it would look like success | Blocked by |',
    '|---|---|---|---|',
    ...rows,
    '',
    '### Integration Boundaries',
  ].join('\n');

  const every = Array.from({ length: FLOOR }, (unused, index) =>
    `| ${index + 1} | Condition ${index + 1} | Somewhere | Something |`);

  // The premise: a well-formed table of the right size, fully disposed, produces no complaint.
  // Without this the assertions below could be satisfied by an `audit` that complains about
  // everything, and each of them would still read as a control.
  const disposed = new Map(every.map((unused, index) => [index + 1, { test: 'a name' }]));

  assert.deepEqual(audit(register(table(...every)), disposed), []);

  // **The must-NOT itself.** Each of these parses to nothing, and each would satisfy every check in
  // `audit` that iterates the register — which is all of them but the floor.
  for (const [what, source] of [
    ['an empty document', ''],
    ['a document with no register heading', '## Something else\n\n| 1 | A condition | x | y |\n'],
    ['a heading whose table has been reworded away', table('The conditions are listed in prose now.')],
    ['a table whose rows lost their numbers', table('| — | A condition | Somewhere | Something |')],
  ]) {
    assert.deepEqual(register(source), [], `${what} parsed to rows it does not have`);

    const complaints = audit(register(source), disposed);

    assert.ok(complaints.some((complaint) => complaint.includes('parsed to 0 conditions')),
      `${what} read as a satisfied register — the floor did not fire`);
  }

  // **The blank line inside the table is the live hazard, not a hypothetical one.** #25 was
  // appended after a paragraph break, so a parse bounded by the first blank line returns twenty-four
  // rows, is internally consistent, and hides the newest condition — this story's own defect, one
  // layer down. Driven here because the real spec would still pass a parser that got this wrong on
  // the day before #25 was added.
  const split = register(table(...every.slice(0, -1), '', every.at(-1)));

  assert.equal(split.length, FLOOR, 'a blank line inside the table truncated the parse');
  assert.equal(split.at(-1).entry, FLOOR);
});

// --- must NOT: a condition in the spec with no disposition ---------------------------------------

test('a condition the spec adds fails until it has a disposition', () => {
  const conditions = register();

  // Drop #25's disposition and nothing else: the register is unchanged and the map is one short,
  // which is exactly the state the spec's amendment of 2026-08-11 left this suite in.
  const short = new Map([...DISPOSITIONS].filter(([entry]) => entry !== 25));
  const complaints = audit(conditions, short);

  assert.equal(complaints.length, 1, `expected one complaint, got: ${complaints.join(' / ')}`);
  assert.match(complaints[0], /^#25 has no disposition:/);

  // And the other direction — a disposition for a condition the spec does not carry.
  const extra = new Map([...DISPOSITIONS, [99, { test: 'a name' }]]);

  assert.deepEqual(audit(conditions, extra).filter((complaint) => complaint.startsWith('#99')),
    ['#99 is disposed and the spec does not carry it']);

  // And a disposition that has not decided what it is, in both of its shapes.
  const undecided = new Map([...DISPOSITIONS, [25, { test: 'a name', closedIn: '47-12' }]]);
  const empty = new Map([...DISPOSITIONS, [25, {}]]);

  assert.ok(audit(conditions, undecided).some((complaint) => complaint.includes('#25 has both')));
  assert.ok(audit(conditions, empty).some((complaint) => complaint.includes('#25 has neither')));
});
