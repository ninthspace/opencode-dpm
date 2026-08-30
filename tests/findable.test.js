/**
 * Epic 49-04 Story 3 — the commands the guard names can be found before it names them (FR11).
 *
 * `dpm-merge` shipped in epic 47-04 and was documented nowhere: no `.gitattributes`, no mention in
 * the README, `MIGRATION.md` or `hooks/pre-commit`. Git never invoked it and no reader could find
 * it. That was survivable while the guard said only that two artefacts differed; it stopped being
 * survivable when 49-03 gave the guard verdicts that name tools by name, because a diagnostic
 * naming a tool findable only by reading the source is worse than the `differs` it replaced — the
 * reader has now been told to do something specific, and cannot.
 *
 * **The criteria are about a shared constant, not a matching string**, and that distinction is the
 * whole of what is asserted here. A test comparing the README's text against the guard's message
 * passes on two copies that happen to agree today and goes on passing until one of them is edited,
 * which is precisely what FR11 forbids. So what is checked is that one definition —
 * `COMMANDS` in `src/guard/index.js` — reaches both surfaces: the guard resolves it to the absolute
 * path it prints, and the README carries it verbatim.
 *
 * **`[unit]`, because none of it needs a repository.** The guard's verdicts are asserted to name
 * these constants in `guard-verdict.test.js` and `import.test.js`, against real trees. What is left
 * for this file is the join between the constant and the documentation, and a filesystem adds
 * nothing to it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMMANDS, IMPORT_COMMAND, MERGE_COMMAND, PUBLISH_COMMAND } from '../src/guard/index.ts';

const ROOT = join(import.meta.dirname, '..');
const README = readFileSync(join(ROOT, 'README.md'), 'utf8');

/** The heading the two criteria are about, sliced to the next one. */
function section(heading) {
  const opens = README.indexOf(`## ${heading}`);

  assert.notEqual(opens, -1, `the README has no "${heading}" section`);

  const after = README.indexOf('\n## ', opens + 1);

  return README.slice(opens, after === -1 ? README.length : after);
}

/**
 * The section's paragraphs, one per bold lead-in.
 *
 * The section opens with an unbolded paragraph of framing; everything after it is one case per
 * lead, and the split is what lets each case be asserted to name *its own* command and no other.
 */
function cases(text) {
  return text.split(/\n\n(?=\*\*)/).filter((block) => block.startsWith('**'));
}

// --- Criteria 1 and 2: both commands, from the constant, with the condition that calls for them ---

test('the README names each fix, its condition, and no command a constant does not define [unit]', () => {
  const refuses = section('When the guard refuses');

  // **Every command the guard can name is documented.** Read off `COMMANDS` rather than listed
  // here, so a fourth fix added to the guard fails this line rather than arriving undocumented —
  // which is the state `dpm-merge` was in for two epics.
  for (const [fix, command] of Object.entries(COMMANDS)) {
    assert.ok(refuses.includes(command), `the ${fix} fix is not documented: ${command}`);
  }

  // **And nothing else, which is the half that makes the line above about a shared constant.** A
  // README naming `bin/dpm-whatever.ts` would satisfy every containment check while sending a
  // reader to a file no constant defines and nothing asserts the existence of.
  //
  // `.ts` since the port: the executables are TypeScript that Node type-strips. The bound below is
  // what caught this pattern when the extension moved — it went to zero matches, which would
  // otherwise have made the equality that follows an assertion about two empty lists.
  const named = [...README.matchAll(/bin\/dpm-[a-z-]+\.ts/g)].map(([path]) => path);

  assert.ok(named.length >= Object.keys(COMMANDS).length,
    `the sweep found ${named.length} command strings, so it is not reading the README`);
  assert.deepEqual([...new Set(named)].sort(), Object.values(COMMANDS).sort(),
    'the README names a command no constant defines, or has stopped naming one that exists');

  // **Each case names its own fix and not another's.** This is 49-03's defect arriving one surface
  // over: the guard used to send every reader to publish, including the one whose dump had just
  // come out of a pull, for whom publishing is the operation that destroys it. Documentation that
  // put the publish command in the pull paragraph would do the same damage more slowly.
  const expected = [
    { lead: 'The database moved', command: COMMANDS.publish, when: /did not publish/ },
    { lead: 'The dump moved', command: COMMANDS.import, when: /You pulled/ },
    { lead: 'Both moved', command: COMMANDS.merge, when: /conflicted `git merge`/ },
  ];

  const blocks = cases(refuses);

  assert.equal(blocks.length, expected.length,
    `the section has ${blocks.length} cases and the guard has ${expected.length} fixes`);

  for (const [at, { lead, command, when }] of expected.entries()) {
    const block = blocks[at];

    assert.match(block, new RegExp(`^\\*\\*${lead}`), `case ${at + 1} is not ${lead}`);
    assert.match(block, when, `${lead} does not say when to run it:\n${block}`);
    assert.ok(block.includes(command), `${lead} does not name ${command}:\n${block}`);

    for (const other of Object.values(COMMANDS).filter((path) => path !== command)) {
      assert.equal(block.includes(other), false,
        `${lead} also names ${other}, which is the fix for a different verdict:\n${block}`);
    }
  }
});

// --- The one refusal whose fix is not a command --------------------------------------------

test('the stale-guard refusal is documented, and kept out of the command map [unit]', () => {
  // The same requirement one refusal over: a reader told the guard is out of date has to be able
  // to find what to do about it. It is asserted separately because its fix is an `ln -s` rather
  // than one of `COMMANDS`, and folding it into the section above would break the one-to-one the
  // previous test exists to hold — a case with no command would have to be excused there, and the
  // excusing is what would let a genuinely undocumented fix through later.
  const stale = section('When the guard is out of date');

  assert.match(stale, /ln -s/, 'the section does not name the fix');
  assert.match(stale, /\.git\/hooks\/pre-commit/, 'the section does not say what is stale');

  // And it stays out of the command map: no `bin/dpm-*.js` here, or the sweep above would see a
  // command in a section whose fix is not one.
  assert.doesNotMatch(stale, /bin\/dpm-[a-z-]+\.js/,
    'the stale-guard section names a command, which is not how this one is fixed');

  // The guard's own message carries the same two things, so the refusal and the section agree
  // about what happened. Read from the source rather than run, because reaching the refusal needs
  // a database from a release that does not exist yet — `guard.test.js` drives that end.
  const main = readFileSync(join(ROOT, 'src', 'guard', 'main.ts'), 'utf8');

  assert.match(main, /\.git\/hooks\/pre-commit/, 'the refusal does not name the stale link');
  assert.match(main, /symlink/, 'the refusal does not say what to re-make');
});

test('the path the guard prints and the one the README carries are one constant [unit]', () => {
  // **This is the join, and without it the test above is a test of the README against itself.**
  // The guard prints an absolute path — a fact about one machine, which no README can carry — so
  // the shared part is the tail. A rename that edits the constant moves both surfaces together; one
  // that edits only `COMMANDS` breaks the guard's resolution and one that edits only a binary's
  // name breaks the existence assertions in `guard-fix.test.js` and `import.test.js`.
  assert.ok(PUBLISH_COMMAND.endsWith(COMMANDS.publish),
    `${PUBLISH_COMMAND} is not resolved from ${COMMANDS.publish}`);
  assert.ok(IMPORT_COMMAND.endsWith(COMMANDS.import),
    `${IMPORT_COMMAND} is not resolved from ${COMMANDS.import}`);
  assert.ok(MERGE_COMMAND.endsWith(COMMANDS.merge),
    `${MERGE_COMMAND} is not resolved from ${COMMANDS.merge}`);

  // The control: `endsWith` is capable of saying no. Without it the three lines above hold for a
  // reading that compares nothing — and they would go on holding if `COMMANDS` were emptied to
  // three empty strings, which every one of them ends with.
  assert.equal(PUBLISH_COMMAND.endsWith(COMMANDS.merge), false);
  assert.equal(Object.values(COMMANDS).some((command) => command === ''), false,
    'a command is the empty string, which every path ends with');
});
