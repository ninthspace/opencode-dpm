/**
 * Epic 47-10 Story 4 — the `publish` skill, and the six claims made about it.
 *
 * The twenty-third skill and the first with no CPM counterpart, so there is no conversion to check
 * a facilitation survived: what this file asserts is that the facilitation is *there*, which is a
 * different claim reached the same way — drive the run the file prescribes, and read the file for
 * the steps a run cannot demonstrate the absence of.
 *
 * **The gate is the whole story.** Publishing is the one operation in dpm that deletes a file, and
 * a deletion is not undone by running again — the database still holds what produced a *written*
 * file, and holds nothing that would put a removed one back. So the ordering claim is behavioural
 * and driven: the preview happens before the destructive call, from the same call, and declining
 * leaves the tree as it was.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fullCorpus } from './support/corpus.js';
import { start } from '../src/start.ts';
import { spineTools } from '../src/tools/index.ts';
import {
  skillSource, prose, section, recorder, recoveries, sweep, bindings,
  SQL, CONSTRUCTIONS, toolNames,
} from './support/skills.js';

const SKILL = 'publish';
const source = skillSource(SKILL);

/** A dispatcher that records the order of calls as well as which were made. */
function ordered(tools) {
  const base = recorder(tools);
  const calls = [];

  const call = Object.fromEntries(Object.entries(base.call).map(([name, handler]) => [
    name,
    (args) => {
      calls.push({ name, args: args ?? {} });

      return handler(args);
    },
  ]));

  return { ...base, call, calls };
}

/** A real database and a real empty tree, because this skill's whole subject is files on a disk. */
function project(t) {
  const home = mkdtempSync(join(tmpdir(), 'dpm-skill-publish-'));

  t.after(() => rmSync(home, { recursive: true, force: true }));

  const root = join(home, 'repo');
  const location = join(root, '.dpm', 'dpm.db');

  mkdirSync(dirname(location), { recursive: true });

  const { db } = start(location);

  t.after(() => db.close());

  const tools = spineTools(db, { root });
  const seed = Object.fromEntries(tools.map((tool) => [tool.name, tool.handler]));

  fullCorpus(db, seed);

  return { db, root, tools, seed };
}

// --- Criterion 1: the run calls the tool and reports the three groups ---------------------------

test('a publish run calls the tool and has three groups to report, not a description of the tree', (t) => {
  const { root, tools } = project(t);
  const run = ordered(tools);

  // The run the file prescribes: preview, then publish. Nothing else — no read of the database to
  // find out what it holds, which is the last must-NOT below.
  run.call.publish({ dry_run: true });

  const record = run.call.publish({});

  assert.deepEqual(run.calls.map((entry) => entry.name), ['publish', 'publish'],
    'the run reached for something other than the tool');

  // Grouped, and each group distinguishable. A record whose three groups could not be told apart
  // would satisfy "reports what changed" while leaving the reader unable to see which files were
  // created and which were overwritten — the distinction the record carries `rewritten` for.
  for (const group of ['written', 'rewritten', 'removed', 'unchanged']) {
    assert.ok(Array.isArray(record[group]), `the record has no ${group} to report`);
  }

  assert.ok(record.written.length > 1, 'nothing was published, so there is nothing to report');
  assert.equal(record.rewritten.length, 0, 'a first publish rewrote something');
  assert.ok(readdirSync(root).length > 0);

  // The file names the groups it reports, so the wording in the skill and the shape of the record
  // are one thing. A skill naming groups the record does not carry would prescribe a report nobody
  // can produce.
  const step = prose(source, 'Step 3');

  for (const group of ['New', 'Rewritten', 'Removed']) {
    assert.match(step, new RegExp(`\\*\\*${group}\\*\\*`), `the report step does not name ${group}`);
  }
});

// --- Criterion 2: the removal gate ---------------------------------------------------------------

test('a run that would remove a file previews it first, and declining leaves the file alone', (t) => {
  const { db, root, tools } = project(t);
  const run = ordered(tools);

  run.call.publish({});

  // A real renumber, so the orphan is what a rename leaves behind — the case the gate is written
  // for, where the file about to go is one that was open under a name that has since moved.
  db.prepare('UPDATE document SET number = 77 WHERE kind = ?').run('spec');

  const preview = run.call.publish({ dry_run: true });

  assert.ok(preview.removed.length > 0, 'the renumber orphaned nothing, so the gate has no subject');

  // **The gate is only worth having if declining is a real outcome.** The run stops here; nothing
  // further is called, and every file the preview named is still on disk. A preview that had
  // already removed them would report identically and leave the user approving a fait accompli.
  for (const path of preview.removed) {
    assert.equal(existsSync(join(root, path)), true, `${path} was removed by the preview itself`);
  }

  assert.deepEqual(run.calls.map((entry) => entry.args.dry_run), [undefined, true],
    'the destructive call did not come first, so the preview is not what gates it');

  // And the other half: approving reaches the same removals rather than a fresh opinion about them.
  const published = run.call.publish({});

  assert.deepEqual(published.removed, preview.removed,
    'the gate showed one set of removals and the publish performed another');

  for (const path of published.removed) {
    assert.equal(existsSync(join(root, path)), false, `${path} was named as removed and is on disk`);
  }
});

test('the preview the gate rests on is the one the file asks for', () => {
  // **Found by driving it: deleting `dry_run` from step 1 passed the whole suite.** The behavioural
  // test above supplies the argument whatever the file says, so it goes on proving that a preview
  // *can* precede a publish while the file it claims to exercise stops asking for one. `bindings`
  // does not reach this: its argument direction covers create, update and read verbs, and `publish`
  // is none of them. So the argument is asserted here, directly, the way skills.js records the
  // other three survivors of the same shape being closed.
  assert.match(prose(source, 'Step 1'), /`dry_run` set to true/,
    'the step the gate rests on does not ask for a preview');

  // The control that makes it an ordering claim rather than a word count: the step that publishes
  // must *not* ask for one, or there is no run that ever writes anything.
  assert.doesNotMatch(prose(source, 'Step 3'), /dry_run/,
    'the publishing step asks for a dry run, so nothing is ever written');
  assert.match(prose(source, 'Step 3'), /with no arguments/);
});

test('the file gates on removal and only on removal, and says why', () => {
  const step = section(source, 'Step 2');

  // **Scoped to the step rather than found anywhere in the file**, because a rule that appears in a
  // guideline and not in the step a run follows is a rule the run does not reach.
  assert.match(step, /skip this step entirely/,
    'nothing tells a run with no removals to pass straight through');
  assert.match(step, /ask before continuing/i, 'the step does not gate');

  // The reason, which is the part that stops the gate being widened into a habit: writes are
  // reversible because the database still holds what produced them, and removals are not.
  const why = prose(source, 'Step 2');

  assert.match(why, /reversible/, 'the step gates without saying why this step and not the others');
  assert.match(why, /renumber/i, 'the step does not say what a removal usually means');

  // Stopping is an outcome, not an error — the failure this prevents is a gate that only really
  // offers one answer.
  assert.match(why, /Stopping is a complete outcome/);

  // The control: the same reading over a step that gates on nothing finds nothing. Without it these
  // assertions pass on any file long enough to contain the words somewhere.
  assert.doesNotMatch(prose(source, 'Step 4'), /ask before continuing/i);
});

// --- Criterion 3: it names what to commit, and commits nothing -----------------------------------

test('the run ends by naming the two artefacts and commits nothing itself', () => {
  const step = prose(source, 'Step 4');

  assert.match(step, /Commit nothing/i, 'the closing step does not refuse to commit');
  assert.match(step, /projection/i);
  assert.match(step, /committed text form/i, 'the closing step names only one of the two artefacts');

  // **No git anywhere in the file**, not merely a refusal in the closing step. A skill that refused
  // to commit at the end and ran `git add` in the middle would satisfy the sentence above.
  assert.doesNotMatch(source, /\bgit\s+(add|commit|push|stage)\b/i,
    'the skill runs a version-control command');

  // The control: the sweep can find one, so its silence above is a fact about the file.
  assert.match('then run git commit -am "publish"', /\bgit\s+(add|commit|push|stage)\b/i);
});

// --- Criterion 4: FR25's subtractions hold over a skill that is an addition ----------------------

test('the skill names no path, no glob, no allocation, no progress file and no SQL', () => {
  // FR25's subtractions apply unchanged even though this skill is dpm's own rather than a
  // conversion: what they remove is the construction of names, and an original skill can construct
  // one as easily as a converted one.
  assert.deepEqual(recoveries(source), []);
  assert.deepEqual(sweep(source, SQL), []);
  assert.deepEqual(sweep(source, CONSTRUCTIONS), []);

  // **The controls, which are the whole credibility of three empty arrays.** Each is a sentence
  // this skill might plausibly have contained — and the first is one it did contain, until the
  // corpus sweep caught it.
  assert.equal(recoveries('Name the projection under `docs/` and the dump beside it.').length, 1);
  assert.equal(sweep('Run sqlite3 on the database to see what changed.', SQL).length, 1);
  assert.equal(sweep('Take the next available number for the new file.', CONSTRUCTIONS).length, 1);
});

// --- Criterion 5 (must NOT): the skill writes or deletes a file itself ---------------------------

test('must NOT — the skill writes or removes a file rather than calling the tool', (t) => {
  const { tools } = project(t);
  const run = ordered(tools);

  run.call.publish({ dry_run: true });
  run.call.publish({});

  // The behavioural half: every file operation in the run went through a tool. The dispatcher is
  // the only way this test can touch anything, so a step the file prescribed that wrote a file
  // itself would have to appear as an instruction rather than as a call — which is the half below.
  assert.deepEqual([...run.used], ['publish'], 'the run reached beyond the tool');

  // The textual half, and it is the one that matters: a run cannot demonstrate the absence of a
  // step it was never written to take. What is refused is the vocabulary of doing it by hand.
  assert.doesNotMatch(source, /\b(Write|Edit|MultiEdit) tool\b/, 'the skill names a file-writing tool');
  assert.doesNotMatch(source, /\b(rm|unlink|mkdir|writeFileSync)\b/, 'the skill names a file operation');
  assert.doesNotMatch(source, /\bdelete the file\b/i);

  // And it says so, rather than merely not doing it — the sentence is what stops the next editor
  // adding a convenience step. Read from the preamble rather than through `section`, which finds
  // `## ` headings and would resolve "Publish" to `### Step 3: Publish`.
  assert.match(source.split('\n## ')[0], /writes no file itself/i);

  // The control: the sweep bites on the sentence it is written against.
  assert.match('Use the Write tool to save the file.', /\b(Write|Edit|MultiEdit) tool\b/);
});

// --- Criterion 6 (must NOT): reporting a tree it did not publish ---------------------------------

test('must NOT — the run reports the database\'s contents rather than what it published', (t) => {
  const { root, tools } = project(t);
  const run = ordered(tools);

  run.call.publish({});

  const second = ordered(tools).call.publish({});

  // **The state where the two answers differ**, which is any tree already current: the database
  // still holds a full corpus, and the run changed nothing. A report describing the contents says
  // the same thing both times; a report of the record does not, and only the second is an answer to
  // what this run did.
  assert.deepEqual(second.written, [], 'the second publish rewrote the tree, so the two agree here');
  assert.ok(second.unchanged.length > 1, 'nothing was found current, so the distinction is vacuous');
  assert.ok(readdirSync(root).length > 0, 'the tree is empty, so contents and record agree trivially');

  // The instruction that keeps them apart, in the step that reports.
  const step = prose(source, 'Step 3');

  assert.match(step, /Describe the run, never the database/i,
    'the report step does not separate what this run did from what the project holds');
  assert.match(step, /indistinguishable/,
    'the step forbids it without saying why the two look the same');

  // Nothing in the file instructs a run to go and ask what the project contains. `list_document`
  // and the rest are how a report of contents would be built, and naming one would be the drift.
  // The set, not the occurrences — how many times the file says `publish` is an editing detail,
  // and which tools it names is the claim.
  assert.deepEqual(
    toolNames(source),
    ['publish'],
    'the skill names a tool other than publish, which is how a report of contents gets built',
  );
});

// --- The binding, in both directions ------------------------------------------------------------

test('every tool the file names exists, and every tool the run drove is named', (t) => {
  const { tools } = project(t);
  const run = ordered(tools);

  run.call.publish({ dry_run: true });
  run.call.publish({});

  assert.deepEqual(bindings(source, tools, run), []);
});
