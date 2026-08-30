/**
 * Epic 47-11 Story 3 — every skill that records a session reaches the resume path.
 *
 * - "Every skill that records a session reaches the resume path on startup, checked over the
 *   corpus; and the shared convention it reaches carries adoption rather than each file restating
 *   it" [unit]
 * - "`artifact`, `status` and `templates` are each either brought under the convention or named as
 *   exempt with the reason, and an exempt skill that records a session fails the check" [unit]
 * - "must NOT — the check passes over a corpus it failed to read, so a glob matching no skills
 *   reads as full compliance" [unit]
 *
 * **The instruction, not the mention** — retro 38's lesson, and it is not hypothetical here. A
 * file-scoped search for "Session Startup" reports `clean` as compliant, and the sentence it
 * matches says *"It uses **Session Startup** for nothing, being stateless"*. So the check looks for
 * the instruction that follows the procedure, and looks for it in the step that runs at startup.
 *
 * **The epic named three skills and the corpus holds five.** `clean` and `publish` were already
 * exempt in their own words before this story was written. They are dispositioned on the same terms
 * as the three: an exemption carries a fragment of the file that justifies it, so an exemption
 * outliving its reason fails here rather than sitting quietly.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blocks, stepAt } from './support/body-reads.js';
import { conventions, skillNames, skillSource } from './support/skills.js';

/** The instruction that reaches the shared procedure. A mention of the name is not this. */
const FOLLOWS = 'shared **Session Startup** procedure';

/** Where a startup step is allowed to be headed, so the instruction is bound to the step. */
const STARTUP = new Set(['Session', 'Startup']);

/**
 * What makes a skill one that records a session, and therefore one with something to resume.
 *
 * **No leading `\b`.** Skills write the callable form, `mcp__plugin_dpm_dpm__create_session`, and the
 * character before the verb is an underscore — a word character, so a word boundary never matches
 * there. The first draft carried one and found nothing anywhere, which made every exemption below
 * pass by never being tested. The planted control is what said so.
 */
const RECORDS = /(create_session|update_session)\b/;

/** Below this the corpus was not read, whatever the check went on to report. */
const FLOOR = 23;

/**
 * The skills that open no session, each with a verbatim fragment of its own file saying why.
 *
 * The fragment is the control on the exemption — retro 38's exemption-with-a-control shape. An
 * exemption listed here and nowhere else is a decision that lives only in the test, and it goes on
 * holding after the skill it describes has changed underneath it.
 */
const EXEMPT = new Map(Object.entries({
  artifact: 'each action here is one write — register an entry, or retire one — settled in the',
  clean: 'It uses **Session Startup** for nothing, being stateless',
  publish: 'It opens no session. There is nothing to resume',
  status: 'a report reads the rows and prints, so there is no',
  templates: 'both actions are one read and one render, and neither carries anything from the',
}));

/**
 * Everything wrong with the corpus, as a list of complaints.
 *
 * A function rather than a run of assertions, so the controls drive **this** on a corpus written to
 * be wrong instead of restating its rules beside it.
 *
 * @param {Map<string, string>} corpus Skill name to its SKILL.md source.
 * @param {Map<string, string>} exempt Skill name to the fragment justifying its exemption.
 * @returns {string[]} Empty when every skill either follows the procedure or is properly exempt.
 */
function audit(corpus, exempt) {
  const complaints = [];

  // **The must-NOT.** Every check below iterates the corpus, so an empty one satisfies all of them
  // and a glob that matched nothing reads as full compliance. This is the complaint that arrives.
  if (corpus.size < FLOOR) {
    complaints.push(`the corpus read ${corpus.size} skills, below the ${FLOOR} it holds`);
  }

  for (const [name, source] of corpus) {
    // The instruction has to sit in the step that runs at startup, because a skill reaching the
    // resume path halfway through its work has already done the work it would have resumed.
    const reached = blocks(source)
      .filter((block) => block.text.includes(FOLLOWS))
      .some((block) => STARTUP.has(stepAt(source, block.start)));

    if (reached && exempt.has(name)) {
      complaints.push(`${name} both follows the procedure and claims exemption from it`);
    }

    if (reached) continue;

    if (!exempt.has(name)) {
      complaints.push(`${name} neither follows the Session Startup procedure at startup nor is exempt`);
      continue;
    }

    // The criterion's own control: an exemption is a claim that there is nothing to resume, and a
    // skill writing a session row has contradicted it in its own file.
    if (RECORDS.test(source)) {
      complaints.push(`${name} is exempt from Session Startup and records a session anyway`);
    }

    if (!source.includes(exempt.get(name))) {
      complaints.push(`${name}'s exemption cites a reason its file no longer gives`);
    }
  }

  for (const name of exempt.keys()) {
    if (!corpus.has(name)) complaints.push(`${name} is exempt and is not a skill`);
  }

  return complaints;
}

/** The corpus as the check reads it: every skill directory, with its file. */
function corpus() {
  return new Map(skillNames().map((name) => [name, skillSource(name)]));
}

// --- Criterion 1: the corpus reaches the resume path, and the convention carries adoption --------

test('every skill reaches the resume path at startup, or is exempt with its reason', () => {
  assert.deepEqual(audit(corpus(), EXEMPT), []);

  // Non-vacuity in the other direction: the exemptions must be the minority, or the check is
  // reporting compliance over a corpus that mostly opted out of it.
  const read = corpus();

  assert.ok(read.size >= FLOOR, `only ${read.size} skills read`);
  assert.ok(read.size - EXEMPT.size >= 15,
    `only ${read.size - EXEMPT.size} skills follow the procedure, so the rule reaches almost nobody`);

  // **The convention carries adoption, which is what makes reaching it worth anything.** A skill
  // that follows a procedure with no resume step has reached a create-only startup and would begin
  // again on every invocation — the failure this story exists to make visible, one level up.
  const shared = conventions();
  const section = shared.slice(shared.indexOf('## Session Startup'),
    shared.indexOf('## Library Check'));

  assert.ok(section.length > 200, 'the Session Startup section did not slice — the headings moved');
  assert.match(section, /adopt_session/, 'the shared procedure no longer adopts a prior session');
  assert.match(section, /include_body/,
    'the shared adoption stopped asking for the body, so the state comes back empty');
  assert.match(section, /list_session/, 'the shared procedure never looks for a session to resume');
});

// --- Criterion 2: the exempt skills, and the control on the exemption ----------------------------

test('an exempt skill that records a session fails the check', () => {
  // The three the epic names, asserted individually — a count would pass if a later edit exempted
  // one skill and brought another under the convention.
  for (const name of ['artifact', 'status', 'templates']) {
    assert.ok(EXEMPT.has(name), `${name} is neither following the procedure nor recorded as exempt`);
    assert.ok(skillSource(name).includes(EXEMPT.get(name)),
      `${name}'s exemption cites a reason its file no longer gives`);
    assert.equal(RECORDS.test(skillSource(name)), false, `${name} is exempt and records a session`);
  }

  // **The control the criterion asks for**, driven rather than described: a skill that claims the
  // exemption and writes a session row is caught.
  const planted = new Map([
    ['pretender', '## Startup\n\n**No session**: nothing to resume.\n\n## Work\n\n'
      + 'Then `mcp__plugin_dpm_dpm__create_session` with the harness\'s id.\n'],
  ]);

  assert.deepEqual(
    audit(planted, new Map([['pretender', '**No session**: nothing to resume.']]))
      .filter((complaint) => complaint.includes('records a session anyway')),
    ['pretender is exempt from Session Startup and records a session anyway'],
  );

  // And an exemption whose reason has gone from the file.
  assert.ok(audit(new Map([['drifted', '## Startup\n\nNothing here.\n']]),
    new Map([['drifted', 'a reason it used to give']]))
    .some((complaint) => complaint.includes('cites a reason its file no longer gives')));

  // And a skill that mentions the convention without following it — `clean`'s exact shape, which a
  // file-scoped check reports as compliant.
  const mentions = '## Startup\n\nIt uses **Session Startup** for nothing, being stateless.\n';

  assert.deepEqual(audit(new Map([['mentioner', mentions]]), new Map()).filter((complaint) =>
    complaint.includes('neither follows')), ['mentioner neither follows the Session Startup procedure at startup nor is exempt']);
});

// --- must NOT: a corpus the check failed to read ------------------------------------------------

test('a corpus the check failed to read is refused, not read as full compliance', () => {
  // Each of these satisfies every per-skill check by having no skills to check.
  for (const [what, read] of [
    ['an empty corpus', new Map()],
    ['a glob that matched one directory', new Map([['do', skillSource('do')]])],
  ]) {
    const complaints = audit(read, EXEMPT);

    assert.ok(complaints.some((complaint) => complaint.includes(`read ${read.size} skills`)),
      `${what} read as full compliance — the floor did not fire`);
  }

  // The premise, so the floor is not the only thing this test can ever report: a corpus of the
  // right size, all following, produces no complaint.
  const wholesome = new Map(Array.from({ length: FLOOR }, (unused, index) =>
    [`skill${index}`, `## Startup\n\nFollow the ${FOLLOWS} with \`skill: 'dpm:x'\`.\n`]));

  assert.deepEqual(audit(wholesome, new Map()), []);

  // And the step-scoping, driven: the same instruction under a heading that is not the startup step
  // does not count, because a resume reached after the work is not a resume.
  const late = new Map([['tardy', `## Startup\n\nNothing.\n\n## Phase 4\n\nFollow the ${FOLLOWS}.\n`]]);

  assert.deepEqual(audit(late, new Map()).filter((complaint) => complaint.includes('neither follows')),
    ['tardy neither follows the Session Startup procedure at startup nor is exempt']);
});
