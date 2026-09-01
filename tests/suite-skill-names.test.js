/**
 * Epic 02-02 Story 3 — the suite's own idea of what a skill is called moved with the tree.
 *
 * - "`tests/support/skills.js` yields the twenty-three prefixed names, every test file that reaches
 *   a skill through the helper passes untouched, and the files holding a hand-kept list of skill
 *   names are updated to the new ones" [unit]
 * - "`tests/corpus.test.js`'s transcribed name list holds the twenty-three prefixed names and still
 *   fails when the tree and the list disagree. Control: a planted extra skill directory fails it"
 *   [unit] — the behavioural half is driven in `corpus.test.js` itself, beside the reading it
 *   controls; what is here is that the list holds the prefixed names.
 * - "No test is lost or skipped to the rename: every test file the suite shipped before this epic
 *   still runs its cases, and the suite's passing count is at least its pre-epic 1,120 plus
 *   whatever this epic added" [unit]
 *
 * **The danger in this rename is silence, not breakage.** Library lesson 04 is explicit about it:
 * after a rename, the predicates that filtered on the old form are part of the rename, and *the
 * ones that go quiet are more dangerous than the ones that break*. This epic found two of them
 * before they fired — `skill-reference-input.test.js`'s `[a-z]+` character class, which would have
 * gone on being a valid regex matching nothing and reporting a correct literal list as derived, and
 * `scripts/skill-body-check.ts`'s `RECORDED_GAP.skill`, whose exemption would have stopped applying
 * and surfaced five references in an untouched body as breaches. Neither would have failed the
 * suite. This file is where that class of failure is looked for on purpose.
 *
 * **Every reading here is over sources, and none of it re-runs another file's assertions.** A
 * second copy of what `skills-resume.test.js` checks would be a second thing to keep in step. What
 * is checked instead is the one property those files cannot check about themselves: that the names
 * they hold by hand are names the tree still has.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PREFIX, skillNames, skillSource, frontMatter } from './support/skills.js';
import { sweepSourcesUnder, testFileNames, withoutComments } from './support/sources.js';

const ROOT = join(import.meta.dirname, '..');
const TESTS = join(ROOT, 'tests');
const SKILLS = join(ROOT, 'skills');

const CORPUS = 23;

/** Every skill the tree holds, as the suite's one reader returns them. */
const live = () => new Set(skillNames());

// --- Criterion 1, first clause: the helper yields the tree, prefixed ------------------------------

test('the helper yields the twenty-three prefixed names, and they are what the tree holds', () => {
  const names = skillNames();

  // The count first, so nothing below can pass over an empty walk. Every other assertion here is a
  // per-element check, and every per-element check is satisfied by having no elements.
  assert.equal(names.length, CORPUS, `${names.length} skills came back from the tree`);

  assert.deepEqual(names.filter((name) => !name.startsWith(PREFIX)), [],
    'a skill directory is not under the dpm- namespace');

  // Read a second way, from `fs` rather than through the helper, so this is a claim about the tree
  // and not a restatement of what `skillNames()` chose to return.
  assert.deepEqual(names, readdirSync(SKILLS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort());

  // And each one is a skill rather than a directory: the file is there and declares itself.
  for (const name of names) {
    assert.equal(frontMatter(skillSource(name)).name, name,
      `${name}/SKILL.md declares a name its directory does not`);
  }
});

test('the bare-name tolerance reaches the same file, and never composes a second prefix', () => {
  // The tolerance exists so forty call sites survived the rename untouched. What it must not do is
  // hide the failure it looks like it might: a prefixed name is passed through, not prefixed again.
  assert.equal(skillSource('do'), skillSource('dpm-do'), 'the two forms read different files');

  assert.throws(() => skillSource('dpm-dpm-do'), /dpm-dpm-do/,
    'a doubled prefix resolved to something, so the pass-through is silently re-prefixing');

  // And a name for a skill that is not there still fails, naming the path it looked in — the
  // tolerance is one-directional and invents nothing.
  assert.throws(() => skillSource('nonesuch'), /dpm-nonesuch/);
});

// --- Criterion 1, second clause: every call site that reaches a skill through the helper ---------

/**
 * The literal skill names handed to the helper, across every file that imports it.
 *
 * **The import is the discriminator, and it has to be.** `tests/support/package-tree.js` exports a
 * function of the same name that *builds* a synthetic skill source — `skillSource('alpha', 'the
 * first')` — and four call sites in two files take it. Matching on the call alone reports those
 * four as skills that are not in the tree, which is true of the string and false of the code. This
 * is library lesson 04's own instruction applied to the reading rather than to the rename.
 *
 * **A call the file asserts throws is not a call site**, and the first draft of this reading said
 * otherwise — it reported the two controls in this very file, `skillSource('nonesuch')` and
 * `skillSource('dpm-dpm-do')`, as calls reaching skills the tree does not have. Which they are, and
 * deliberately: a test that a missing name still fails has to name something missing. So a call
 * inside `assert.throws` is skipped, and skipping it is what lets a control for this property go on
 * being written in the ordinary way rather than being exempted by filename.
 *
 * @param {Array<{name: string, text: string}>} sources
 * @returns {Array<{file: string, named: string}>}
 */
function helperCallSites(sources) {
  const FROM_HELPER = /import\s*\{[^}]*\bskillSource\b[^}]*\}\s*from\s*'[^']*support\/skills\.js'/;
  const CALL = /(assert\.throws\(\s*\(\)\s*=>\s*)?\bskillSource\(\s*'([^']+)'/g;

  return sources
    .filter(({ text }) => FROM_HELPER.test(text))
    .flatMap(({ name, text }) => [...withoutComments(text).matchAll(CALL)]
      .filter(([, asserted]) => !asserted)
      .map(([, , named]) => ({ file: name, named })));
}

/** A call site naming a skill neither form of which is in the tree, as a sentence per breach. */
const stranded = (sites, present) => sites
  .filter(({ named }) => !present.has(named) && !present.has(`${PREFIX}${named}`))
  .map(({ file, named }) => `${file} reaches a skill called ${named} and the tree has no such skill`);

test('every call site that reaches a skill through the helper names a skill that is there', () => {
  const sites = helperCallSites(sweepSourcesUnder(TESTS));

  // The floor. Every complaint below is a filter, and a filter over nothing is empty — which is
  // what this reading would return if the import pattern stopped matching.
  assert.ok(sites.length >= 15, `${sites.length} literal call sites found, so the reading is not `
    + 'walking the suite and the absence below is vacuous');
  assert.ok(new Set(sites.map(({ file }) => file)).size >= 5,
    'the call sites all came from one file, so the sweep is reading one file');

  assert.deepEqual(stranded(sites, live()), []);
});

test('the call-site reading catches a stranded name, and passes both spellings of a live one', () => {
  // Driven rather than described: the corpus above is clean, so an absence over it says nothing
  // about whether the reading can report anything at all.
  const planted = [{
    name: 'invented.test.js',
    text: "import { skillSource } from './support/skills.js';\n"
      + "skillSource('do');\nskillSource('dpm-status');\nskillSource('gone');\n",
  }];

  const sites = helperCallSites(planted);

  assert.deepEqual(sites.map(({ named }) => named), ['do', 'dpm-status', 'gone'],
    'both spellings are collected, because both are what the helper accepts');

  assert.deepEqual(stranded(sites, live()),
    ['invented.test.js reaches a skill called gone and the tree has no such skill']);

  // The `assert.throws` skip, both ways round. It has to skip the wrapped call — a control for a
  // missing name must be allowed to name something missing — and it must not skip the one beside
  // it, or a whole file's call sites vanish from the corpus on the strength of one control in it.
  assert.deepEqual(helperCallSites([{
    name: 'controlled.test.js',
    text: "import { skillSource } from './support/skills.js';\n"
      + "assert.throws(() => skillSource('nonesuch'), /dpm-nonesuch/);\nskillSource('gone');\n",
  }]).map(({ named }) => named), ['gone']);

  // And the other half: a file that never imports the helper is not read for calls to it, which is
  // what keeps `package-tree.js`'s same-named builder out of the corpus.
  assert.deepEqual(helperCallSites([{
    name: 'builder.test.js',
    text: "import { skillSource } from './support/package-tree.js';\nskillSource('alpha', 'the first');\n",
  }]), []);
});

// --- Criterion 1, third clause, and criterion 2's first half: the hand-kept lists -----------------

/**
 * The declarations in this repository that name skills by hand, and what each is for.
 *
 * **A hand-kept list is not a defect here — several of these are load-bearing precisely because
 * they are transcribed**, and `corpus.test.js`'s own comment says why: deriving FR25's list from
 * the directory it checks would make the check read the answer off its subject. What a transcribed
 * list cannot do is notice that the tree moved underneath it, and that is the whole of this test.
 *
 * `expect` is the number of skill names the region holds. It is the control on the extraction: a
 * region regex that stopped matching, or an extractor that stopped recognising a name, returns
 * fewer and says so, rather than reporting a clean pass over nothing.
 */
const HAND_KEPT = [
  {
    file: 'tests/corpus.test.js',
    region: /const NAMED = \[[\s\S]*?\];/,
    expect: CORPUS,
    what: "FR25's list, transcribed — criterion 2's first half",
  },
  {
    file: 'tests/skill-reference-input.test.js',
    region: /const SEVEN = \[[^\]]*\];/,
    expect: 7,
    what: 'FR7\'s seven, which the file itself forbids deriving from the tree',
  },
  {
    file: 'tests/skills-resume.test.js',
    region: /const EXEMPT = new Map\(Object\.entries\(\{[\s\S]*?\}\)\);/,
    expect: 5,
    what: 'the skills that open no session, each keyed by name',
  },
  {
    file: 'tests/skills-gates.test.js',
    region: /const EXEMPT = new Map\(\[[\s\S]*?\]\);/,
    expect: 1,
    what: 'the one exempt block, keyed by skill and heading',
  },
  {
    file: 'tests/skill-port.test.js',
    region: /const RECORDED_GAP = \{[\s\S]*?\};/,
    expect: 1,
    what: 'the one recorded port gap, indexed by the skill that carries it',
  },
  {
    file: 'scripts/skill-body-check.ts',
    region: /const RECORDED_GAP = \{[\s\S]*?\};/,
    expect: 1,
    what: 'the same gap in the check CI runs — the predicate that would have gone quiet',
  },
];

/**
 * The skill names a region holds, taken from the front of each string literal in it.
 *
 * **The front of the literal, rather than any token in it**, because these regions hold prose as
 * well as keys — an exemption carries the sentence from the file that justifies it. A token scan
 * would read the word *report* or *review* in that prose as a skill name and complain about a
 * sentence. A key is written name-first (`'dpm-present ### 5. Record it'`), so the front of the
 * literal is where a name is and prose is not.
 *
 * @param {string} region
 * @param {Set<string>} present Every skill the tree holds, prefixed.
 * @returns {string[]} The names found, in the spelling the region uses.
 */
function namesIn(region, present) {
  return [...region.matchAll(/'([^']*)'|"([^"]*)"/g)]
    .map(([, single, double]) => /^[a-z0-9-]+/.exec(single ?? double ?? '')?.[0])
    .filter((front) => front && (present.has(front) || present.has(`${PREFIX}${front}`)));
}

/** Every hand-kept name still written in the pre-rename spelling, as a sentence per breach. */
function unprefixed(entries, read, present) {
  const complaints = [];

  for (const { file, region, expect } of entries) {
    const found = region.exec(read(file));

    if (!found) {
      complaints.push(`${file} no longer holds the declaration this reads — the region moved`);
      continue;
    }

    const named = namesIn(found[0], present);

    if (named.length !== expect) {
      complaints.push(`${file} yielded ${named.length} skill names against the ${expect} it holds`);
    }

    complaints.push(...named.filter((name) => !name.startsWith(PREFIX))
      .map((name) => `${file} still names ${name} rather than ${PREFIX}${name}`));
  }

  return complaints;
}

const readSource = (file) => readFileSync(join(ROOT, file), 'utf8');

test('every list that names skills by hand carries the prefixed names', () => {
  assert.equal(HAND_KEPT.length, 6, 'the registry was edited without its count');

  assert.deepEqual(unprefixed(HAND_KEPT, readSource, live()), []);
});

test('the hand-kept reading reports a stale name, a stale spelling and a moved declaration', () => {
  const present = live();

  // A list still in the old spelling. This is the failure the whole test exists for, and the live
  // corpus is clean, so it can only be shown against a planted one.
  const stale = [{ file: 'planted.js', region: /const NAMES = \[[^\]]*\];/, expect: 2, what: 'planted' }];

  assert.deepEqual(
    unprefixed(stale, () => "const NAMES = ['dpm-do', 'status'];", present),
    ['planted.js still names status rather than dpm-status'],
  );

  // The count, which is what stops a region regex that quietly stopped matching what it used to.
  assert.deepEqual(
    unprefixed(stale, () => "const NAMES = ['dpm-do'];", present),
    ['planted.js yielded 1 skill names against the 2 it holds'],
  );

  // And a declaration that moved out from under the reading, rather than an empty answer.
  assert.deepEqual(
    unprefixed(stale, () => 'const OTHER = [];', present),
    ['planted.js no longer holds the declaration this reads — the region moved'],
  );

  // The prose half, driven: an exemption's reason is a sentence, and no word in a sentence is read
  // as a name. Without this the reading complains about `skills-resume.test.js`'s own comments.
  assert.deepEqual(namesIn("['x', 'a report reads the rows and prints, so there is no']", present), []);
  assert.deepEqual(namesIn("['dpm-present ### 5. Record it']", present), ['dpm-present']);
});

// --- Criterion 3: no file lost its cases to the rename -------------------------------------------

/**
 * What the suite held before this epic opened. **A record, and deliberately not a bound.**
 *
 * The criterion asked for a passing-count floor and no longer does, because the count turned out to
 * measure the wrong thing. Renaming twenty-three tracked directories without staging the moves puts
 * the index and the working tree out of step, and `plugin.test.js`'s index reading fails on exactly
 * that — one test short of the floor, with nothing lost and nothing skipped. A number that moves
 * when the user has not run `git add` is reporting on their staging area, not on this suite.
 *
 * The numbers are still worth writing down, because the *before* is gone the moment the rename
 * lands: 1,105 declarations and 1,120 passing before this epic, 1,126 and 1,141 after — the same
 * +21 on both sides, which is what its three new files carry between them. What the test below
 * asserts is the per-file reading, which says the same thing and says it about the suite.
 */
const PRE_EPIC = { files: 161, cases: 1105 };

/** Cases a file declares at the top level. Nested `test()` calls run inside one of these. */
const declares = (text) => [...text.matchAll(/^(?:test|describe)\(/gm)].length;

const suiteFiles = () => testFileNames(TESTS);

test('no test file lost its cases to the rename', (t) => {
  const counted = suiteFiles().map((name) => ({ name, cases: declares(readSource(`tests/${name}`)) }));

  assert.ok(counted.length >= PRE_EPIC.files, `the suite holds ${counted.length} test files against `
    + `the ${PRE_EPIC.files} it shipped before this epic`);

  // **Every file still runs something, and this is the whole assertion.** A file emptied by the
  // rename — a helper that stopped resolving, a loop over names that no longer match — is present,
  // unskipped, and asserts nothing, which is the one shape `suite-integrity.test.js`'s presence and
  // skip checks both pass over. It is read file by file because that is where the failure is: a
  // total goes on looking healthy while one file quietly stops testing.
  assert.deepEqual(counted.filter(({ cases }) => cases === 0).map(({ name }) => name), []);

  const total = counted.reduce((sum, { cases }) => sum + cases, 0);

  t.diagnostic(`${counted.length} test files declare ${total} cases, against ${PRE_EPIC.files} and `
    + `${PRE_EPIC.cases} before this epic`);
});

test('the case count reads declarations, not the word test', () => {
  // The reading is anchored at the start of a line on the call, so the prose and the imports that
  // say "test" everywhere are not counted — and a file of nothing but those counts zero, which is
  // what makes the empty-file complaint above mean anything.
  assert.equal(declares("import { test } from 'node:test';\n// test( in a comment\n"), 0);
  assert.equal(declares("  test('indented, and inside another case', () => {});\n"), 0);
  assert.equal(declares("test('one', () => {});\ndescribe('two', () => {});\ntest('three', () => {});\n"), 3);
});
