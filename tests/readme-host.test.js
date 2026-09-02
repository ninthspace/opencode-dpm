/**
 * Epic 02-04 Story 1 — the README's account of the one host DPM runs under (FR6).
 *
 * **The criteria this file checks were amended before it was written, and the amendment is the
 * reason it exists.** All three were written as "the README gives both the v1 and the v2 form",
 * "the plugin-package location is stated per host", "the README names one host's binary where the
 * sentence is true of either" — a two-host document with a pair in every section. The port stopped
 * being that during epic 02-01, which retargeted at one host mid-run and recorded the reversal on
 * its own status note. So the pair has no second member, and each criterion was amended to the
 * property the pair was a mechanism for: the account is complete for the host DPM *does* support,
 * the location is stated as the thing it now is, and no second host's name survives.
 *
 * That inverts the must-NOT. It used to guard against a sentence true of either host naming only
 * one; it now guards against a host DPM does not run under being named at all, which is the live
 * failure — the residue of a pivot rather than the omission of a variant.
 *
 * **What this file does not do is claim the instructions work.** Running them is
 * `readme-v2.test.js`'s job, and it does it properly: every fenced block is classified by a rule
 * and executed, an unmatched block fails, and a rule matching nothing fails too. Nothing here
 * duplicates that. What is here is the reading that file cannot give — whether the prose *around*
 * the blocks still describes this package, which is where documentation goes stale first and where
 * a suite of executable checks is blind by construction. The Status section proved that twice over:
 * it named the host the port had left and listed half the epics that built it, and every command in
 * the file ran.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { section, sweep } from './support/skills.js';
import { CLONE_PLACEHOLDER as CLONE } from './support/dpm-clone.js';
import { COMMANDS } from '../src/guard/index.ts';

const ROOT = join(import.meta.dirname, '..');
const README = readFileSync(join(ROOT, 'README.md'), 'utf8');

// --- Criterion 1: the account is complete, section by section --------------------------------

/**
 * What each section has to carry for a reader to be able to act on it.
 *
 * **Keyed on the instruction, not on the section's length.** A section that still exists and has
 * lost the command it was written to give reads as fine from any distance — the heading is there,
 * the prose explains what to do — and is useless. So each entry names the one thing a reader
 * actually copies, and the failure names the subject rather than the heading, because two of these
 * live under one heading and "First run is wrong" would not say which.
 */
const ACCOUNT = [
  {
    subject: 'the clone',
    heading: 'Installation',
    carries: /^git clone https:\/\/\S+\.git \S+$/m,
    what: 'the clone command, which is the whole of the install',
  },
  {
    subject: 'the plugin entry',
    heading: 'Installation',
    carries: /"plugin":\s*\[[^\]]*src\/plugin\/index\.ts/,
    what: 'the entry file, which is what registers the MCP server',
  },
  {
    // The second half of the install stopped being a plugin entry in epic 02-05 story 2: the route
    // that carried it is fed by a `plugins` config key 1.18.25 strips. A reader who copies only the
    // `plugin` array gets the tools and no skills, which is exactly the half-install this list of
    // subjects exists to prevent — so the key is pinned as its own subject rather than folded into
    // the one above.
    subject: 'the skills directory',
    heading: 'Installation',
    carries: /"skills":\s*\[[^\]]*\/skills"/,
    what: 'the skills key, without which the host registers no dpm skill at all',
  },
  {
    subject: 'the ordering hazard',
    heading: 'Installation',
    carries: /last-one-wins/,
    what: 'that a later skills entry replaces DPM\'s silently, which the host does not log',
  },
  {
    // Epic 02-05 story 3. The section shipped OpenCode 2's `permissions` array through four
    // stories of a v1-only README, and nothing here read it: the fenced blocks were checked for
    // being non-empty JSON, which the wrong shape is. 1.18.25 refuses the whole configuration on
    // it, so the singular key is pinned as its own subject.
    subject: 'the permission key',
    heading: 'Permissions',
    carries: /"permission":\s*\{\s*"skill":\s*\{\s*"dpm-\*":\s*"allow"/,
    what: 'the singular key v1 takes, in place of the `permissions` array v1 refuses outright',
  },
  {
    subject: 'the guard symlink',
    heading: 'First run',
    carries: /^ln -s \S+\/hooks\/pre-commit \.git\/hooks\/pre-commit$/m,
    what: 'the symlink that installs the guard',
  },
  {
    subject: 'the checks after the link',
    heading: 'First run',
    carries: /^git config core\.hooksPath$/m,
    what: 'the check for the setting that makes a correct-looking link inert',
  },
  {
    subject: 'the refusal',
    heading: 'When the guard refuses',
    carries: new RegExp(Object.values(COMMANDS)
      .map((command) => `node ${CLONE}/${command.replaceAll('.', '\\.')}`).join('[\\s\\S]*')),
    what: 'a command for each of the three ways the two artefacts fall out of step',
  },
  {
    subject: 'the status',
    heading: 'Status',
    carries: /\bepics are in `docs\/epics\/`/,
    what: 'the pointer to the epics, which is what the table under it is',
  },
];

test('every section a reader acts on still carries the instruction [unit]', () => {
  // **The floor.** Every check below reads a section by heading and an absent heading returns the
  // empty string, so a README that lost all five would satisfy a naive loop silently.
  const missing = ACCOUNT.filter(({ heading }) => section(README, heading) === '')
    .map(({ heading }) => heading);

  assert.deepEqual([...new Set(missing)], [], 'the README no longer has a section this file reads');

  const lost = ACCOUNT
    .filter(({ heading, carries }) => !carries.test(section(README, heading)))
    .map(({ subject, heading, what }) => `${heading} / ${subject}: ${what}`);

  assert.deepEqual(lost, [], 'a section a reader acts on no longer carries what they act on');
});

test('control — a section stripped of its instruction is reported by heading [unit]', () => {
  // Without this the sweep above passes over any README whose headings happen to exist, and the
  // patterns are the fragile half: they read prose and fenced blocks that get reworded.
  for (const { subject, heading, carries } of ACCOUNT) {
    const body = section(README, heading);
    const stripped = body.replace(carries, 'a sentence about it instead');

    assert.notEqual(stripped, body, `${heading} / ${subject}: the pattern did not match to begin with`);
    assert.equal(carries.test(stripped), false,
      `${heading} / ${subject}: the section still reads as carrying its instruction once removed`);
  }
});

// --- Criterion 1, second half: Status describes this package ---------------------------------

/** Every epic the projection holds, which is the set the table has to account for. */
const epicDocuments = () => readdirSync(join(ROOT, 'docs', 'epics'))
  .filter((file) => file.includes('-epic-'))
  .sort();

test('the Status table accounts for every epic, and names no epic that is not there [unit]', () => {
  const status = section(README, 'Status');
  const documents = epicDocuments();

  // **Derived from the tree in both directions, which is the reading that was missing.** The table
  // listed spec 01's five epics and went on listing them while a second specification delivered
  // four more — correct on the day it was written, never wrong in a way any check could see, and
  // wrong to a reader deciding whether the thing is finished. A hand-kept list here would have the
  // same failure: it is only ever edited by whoever remembers to.
  assert.ok(documents.length > 5, `${documents.length} epic documents found — the reading missed the projection`);

  const unlisted = documents.filter((file) => !status.includes(file));

  assert.deepEqual(unlisted, [], 'the Status table does not account for an epic the project has');

  const named = [...status.matchAll(/`(\d\d-\d\d-epic-[a-z0-9-]+\.md)`/g)].map(([, file]) => file);

  assert.deepEqual(named.filter((file) => !documents.includes(file)), [],
    'the Status table names an epic document that is not in docs/epics/');

  // The two agreeing is only worth something if the table was read at all.
  assert.deepEqual(named.sort(), documents, 'the table and the projection hold different epics');
});

test('Status says which work is not delivered rather than listing everything alike [unit]', () => {
  const status = section(README, 'Status');

  // A table that renders delivered and undelivered work identically is the version of this section
  // that is hardest to catch: every row is true of *something*, and the reader is the one who ends
  // up wrong. So the undelivered epic is required to say so where it is listed.
  assert.match(status, /\bNot delivered yet\b/,
    'Status lists every epic as though each had shipped');

  assert.match(status, /^\| `02-05-epic-v1-walk\.md` \| \*\*Not delivered yet\*\*/m,
    'the epic that has not been delivered is not the one marked as such');

  // And the unfinished items are still stated, because the table replacing them would read as a
  // completed project with one row outstanding rather than as a young one.
  assert.match(status, /What is not settled/, 'Status no longer says what is unfinished');
});

// --- Criterion 2: where DPM lives is stated as what it now is --------------------------------

test('the clone placeholder is defined where it is first used [unit]', () => {
  const first = README.indexOf(CLONE);

  assert.notEqual(first, -1, `the README no longer uses ${CLONE}, which every command block needs`);

  // **Defined at first use, not somewhere.** It was defined four sections after its first
  // appearance, inside *When something else owns the hook* — a section a reader arriving from a
  // guard refusal has no reason to open, which is exactly the reader who meets the placeholder in
  // a command they are about to run. So the definition has to sit at or before the first use, and
  // the paragraph holding it is where this looks.
  const defining = [...README.matchAll(new RegExp(`${CLONE}[^.]*\\b(is|stands for)\\b[^.]*\\.`, 'g'))];

  assert.ok(defining.length > 0, `${CLONE} is used and never said to be anything`);
  assert.ok(defining[0].index <= first + README.slice(first).indexOf('\n\n'),
    `${CLONE} is used before the README says what it stands for`);

  // It stands for a checkout the reader chose, and saying so is the point of the rename.
  assert.match(defining[0][0], /checkout|clone/,
    `${CLONE} is defined as something other than the tree DPM is loaded from`);
});

/** Ways a location that is no longer DPM's could be presented as though it were. */
const RETIRED_LOCATION = [
  {
    pattern: /^(?![^\n]*not the install)[^\n]*DPM (?:lives|is installed|sits) (?:at|under|in) [^\n]*node_modules/m,
    why: 'a node_modules path presented as where DPM lives',
  },
  {
    pattern: /^[^\n]*\bthe\b[^\n]*\bpackage (?:path|directory)\b[^\n]*$/m,
    why: 'a package path spoken of as the location, which the clone install retired',
  },
];

test('no retired install location is presented as where DPM lives [unit]', () => {
  assert.deepEqual(sweep(README, RETIRED_LOCATION), [],
    'the README presents a location DPM is no longer installed at');

  // **The cache path is allowed exactly once and only where it is being ruled out.** Removing it
  // would take the explanation with it — a reader who tries `plugin add` gets twenty-three skills
  // and no tools, and the paragraph saying why is the only thing that turns that into a diagnosis.
  const cached = [...README.matchAll(/XDG_CACHE_HOME/g)];

  assert.equal(cached.length, 1, `${cached.length} mentions of the package cache, and one is the account of why it is not used`);
  assert.match(section(README, 'Installation'), /is not the install[\s\S]*XDG_CACHE_HOME/,
    'the package cache is named somewhere other than the paragraph ruling it out');
});

test('control — a planted location sentence is reported by line [unit]', () => {
  const planted = `${README}\n\nDPM lives at \`$XDG_CACHE_HOME/opencode/packages/x/node_modules/opencode-dpm/\`.\n`;
  const found = sweep(planted, RETIRED_LOCATION);

  assert.equal(found.length, 1, 'the reading does not see a retired location in a document that has one');
  assert.match(found[0], /node_modules path presented as where DPM lives/);
  assert.match(found[0], /DPM lives at/, 'the report does not quote the line it found');

  // The other pattern, driven separately, so one of the two carrying the whole reading is visible.
  assert.deepEqual(sweep(`${README}\n\nRun it from the package directory.\n`, RETIRED_LOCATION).length, 1);
});

// --- Criterion 3 (must NOT): a host DPM does not run under ------------------------------------

/**
 * Names for a host this package does not support.
 *
 * **Over the README and nowhere else.** `opencode2` is correct history in four test doc comments
 * and in `tests/fixtures/v070-dump.sql`, which `parity-v070.test.js` forbids modifying — a
 * whole-tree sweep would be red for reasons that are all right, and the cheapest way to quiet it
 * would be to edit a protected fixture.
 *
 * **One line is exempt, the way `XDG_CACHE_HOME` is exempt above: the host's own diagnostic.**
 * Epic 02-05 story 3 found the Permissions section written in the other host's `permissions`
 * array, which 1.18.25 refuses outright, and the README now quotes the refusal so a reader can
 * recognise it. That line names `opencode2` because the host names it, and paraphrasing output a
 * reader will match character-for-character would be the more expensive mistake. The exemption is
 * anchored on the diagnostic's own words rather than on a fence, so it covers that line and
 * nothing else — and the planted control below still lands outside it.
 */
const OTHER_HOST = [
  {
    pattern: /^(?![^\n]*V2 permissions are not supported)[^\n]*\bopencode2\b/m,
    why: "the second host's binary, which nothing here is run with",
  },
  { pattern: /\bv2\b/, why: 'a version of the host DPM does not run under' },
  { pattern: /\bOpenCode 2\b/, why: 'the same version spelled out' },
];

test('must NOT — the README names a host DPM does not run under [unit]', () => {
  assert.deepEqual(sweep(README, OTHER_HOST), [],
    'the README names a host binary or version DPM does not run under');

  // **The control, and it is not optional here.** Three patterns finding nothing is also what three
  // broken patterns find, and this assertion is expected to be empty for the rest of the project's
  // life — which is precisely the shape that goes quiet without anyone noticing.
  const planted = `${README}\n\nInstall it with \`opencode2 plugin add\`, because it was ported to OpenCode v2.\n`;
  const found = sweep(planted, OTHER_HOST);

  assert.deepEqual(found.map((report) => report.split(' — ')[0]).sort(),
    OTHER_HOST.map(({ why }) => why).sort().filter((why) => !why.includes('spelled out')),
    'the reading does not see both forms in a document that carries both');

  assert.ok(found.every((report) => report.includes('opencode2 plugin add')),
    'the report does not quote the line it found');

  assert.equal(sweep(`${README}\n\nIt runs under OpenCode 2.\n`, OTHER_HOST).length, 1,
    'the spelled-out form is not read');

  // And the host it *does* name is still named, so this is a document about a host rather than one
  // that solved the sweep by mentioning none.
  assert.match(README, /\bOpenCode v1\b/, 'the README no longer names the host it is written against');
});
