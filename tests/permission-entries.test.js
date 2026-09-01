/**
 * Epic 01-04 Story 5 — the permission entries the README recommends (FR9).
 *
 * The story's other two criteria are `manual`, and rightly: behaviour under the host's permission
 * engine is a fact about a running OpenCode, and the evidence for it is the probe recorded on
 * task 1 — the real `skill` tool driven under real `allow`, `deny` and `ask` rules. Nothing here
 * re-enacts that. A test asserting the host's own semantics would be asserting a transcription of
 * them, which passes exactly as well when the transcription is wrong.
 *
 * **What this file checks is the one thing a test can check better than a person: that the
 * documented entries name things that exist.** A README rule is a string a reader will paste into
 * their config, and every way it can be wrong is silent — `dpm-spec` renamed, `dpm_publish` split
 * in two, the prefix changed by an ADR. A wrong rule does not error; it simply never matches, and
 * the effect it was written to have quietly stops happening.
 *
 * The glob semantics below are the host's, transcribed from its matcher: escape the pattern, `*`
 * becomes `.*`, `?` becomes `.`, anchored at both ends. That transcription is the one thing here
 * taken on trust, and it is narrow enough to be read against the source in a minute.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { CALLABLE, PREFIX, frontMatter, section, skillSource, sweep } from './support/skills.js';
import { packageManifest, pluginSources, withoutComments } from './support/sources.js';
import { discoverSkills, SKILL_FILE } from '../src/plugin/skills.ts';
import { start } from '../src/start.ts';
import { spineTools } from '../src/tools/index.ts';

const ROOT = join(import.meta.dirname, '..');
const README = readFileSync(join(ROOT, 'README.md'), 'utf8');

/** The section under test, addressed by its heading rather than by a line range. */
const permissions = () => section(README, 'Permissions');

/**
 * The host's resource matcher, transcribed.
 *
 * @param {string} value The concrete id or action a request carries.
 * @param {string} pattern The rule's `resource` or `action`, which may hold `*` and `?`.
 * @returns {boolean}
 */
const matches = (value, pattern) => new RegExp(`^${pattern
  .replaceAll(/[.+^${}()|[\]\\]/g, '\\$&')
  .replaceAll('*', '.*')
  .replaceAll('?', '.')}$`, 's').test(value);

/**
 * Every rule the section's fenced JSON blocks declare, flattened.
 *
 * Read out of the blocks rather than listed here, so a rule added to the README is a rule this
 * file checks. A list would make the opposite true — the entry nobody thought about is exactly the
 * one that would go unlisted.
 *
 * @param {string} [source] Overridden by the controls, which drive the same reader over a planted
 *   block to show it reports what is in front of it.
 * @returns {Array<{action: string, resource: string, effect: string}>}
 */
function documented(source = permissions()) {
  return [...source.matchAll(/```json\n([\s\S]*?)```/g)]
    .flatMap(([, block]) => JSON.parse(block).permissions ?? []);
}

/**
 * The registered tools, handed to `read` with the database closed behind it.
 *
 * Built rather than listed, in the same spirit as everything else here: the actions a rule has to
 * match are whatever the server registers on the day it runs.
 *
 * @param {(tools: object[]) => T} read
 * @returns {T}
 * @template T
 */
function withTools(read) {
  const db = start(':memory:').db;

  try {
    return read(spineTools(db));
  } finally {
    db.close();
  }
}

/** The tool names as the host names them for permission purposes: `<server>_<tool>`. */
const registeredActions = () => withTools((tools) => tools.map((tool) => `${CALLABLE}${tool.name}`));

// --- The rules are rules, and they parse ---------------------------------------------------

test('the README recommends permission entries, and every one is a well-formed rule [unit]', () => {
  const body = permissions();

  // **The control, first.** Every assertion below is satisfied by an empty section: no blocks, no
  // rules, nothing to be wrong. The section has to be shown to be there and to carry something.
  assert.notEqual(body, '', 'README has no ## Permissions section, so this file checks nothing');

  const rules = documented();

  assert.ok(rules.length >= 3, `only ${rules.length} documented rules — the reader found nothing`);

  for (const rule of rules) {
    assert.deepEqual(Object.keys(rule).sort(), ['action', 'effect', 'resource'],
      `a documented rule has the wrong keys: ${JSON.stringify(rule)}`);
    assert.ok(['allow', 'deny', 'ask'].includes(rule.effect),
      `a documented rule declares effect "${rule.effect}", which the host does not accept`);
  }

  // And the reader is a reader: over a planted block it reports what the block says, including an
  // effect the host would refuse. Without this, "every rule is well-formed" is also what an
  // extractor that silently found nothing would report.
  assert.deepEqual(documented('```json\n{"permissions":[{"action":"a","resource":"b","effect":"maybe"}]}\n```'),
    [{ action: 'a', resource: 'b', effect: 'maybe' }]);
});

// --- Every skill the section names is a skill this package registers ------------------------

test('every skill resource the README names resolves to a registered skill [unit]', () => {
  const ids = discoverSkills(ROOT).map((skill) => skill.name);

  assert.ok(ids.length > 20, `only ${ids.length} skills discovered, so matching against them proves little`);

  const named = documented().filter((rule) => rule.action === 'skill').map((rule) => rule.resource);

  assert.ok(named.length > 0, 'the section names no skill resource at all');

  for (const resource of named) {
    assert.ok(ids.some((id) => matches(id, resource)),
      `the README recommends a rule for skill resource "${resource}", which matches no skill this `
      + 'package registers — a rule that never fires, and nothing would report it but this');
  }

  // The matcher has to be capable of failing, or the loop above passes on any string at all.
  assert.equal(ids.some((id) => matches(id, `${PREFIX}not-a-skill`)), false);
  assert.equal(matches(`${PREFIX}spec`, `${PREFIX}*`), true);
});

// --- Epic 02-04 story 2: and every skill is covered by one of them ---------------------------

/**
 * The other direction, and the half that was missing.
 *
 * The test above asks whether each recommended rule finds a skill. This one asks whether each
 * skill finds a rule — and the two together are the partition, which is the reading retro 06 named
 * after four green files each checked one side of one. A recommendation can name only skills that
 * exist and still leave a reader with a configuration that denies half the method: the rule matches
 * something, so the first test passes, and the skills it does not reach are invisible from there.
 *
 * **What the engine matches against is the front-matter `name`,** which is why this reads
 * `discoverSkills` rather than the directory listing — it returns the string the host is handed and
 * therefore the string a `skill` rule is tested against. Before ADR 02-04 the prefix was composed
 * at registration and the two differed, which is exactly the state in which `dpm-*` matches every
 * registration and nothing a reader can find in the tree.
 */
test('every skill the package registers is covered by a rule the README recommends [unit]', () => {
  const ids = discoverSkills(ROOT).map((skill) => skill.name);

  // **The floor, and criterion 1 asks for it by name.** Everything below is a filter that comes
  // back empty over an empty corpus, which is the shape that passes by doing nothing. The count is
  // written down rather than derived; what the twenty-three *are* is held against `corpus.test.js`'s
  // transcribed list by `suite-skill-names.test.js`, and a fourth copy here would be a fourth thing
  // to keep in step rather than a second opinion.
  assert.equal(ids.length, 23, `${ids.length} skills discovered, and the recommendation is for 23`);

  const allowed = documented()
    .filter((rule) => rule.action === 'skill' && rule.effect === 'allow')
    .map((rule) => rule.resource);

  assert.ok(allowed.length > 0, 'the README recommends no allow rule for the skill action at all');

  const uncovered = ids.filter((id) => !allowed.some((resource) => matches(id, resource)));

  assert.deepEqual(uncovered, [],
    'a skill this package registers is matched by no rule the README recommends — a reader who '
    + 'pasted the block would have DPM working except for these');
});

test('control — a recommendation that reaches no skill fails rather than passing empty [unit]', () => {
  const ids = discoverSkills(ROOT).map((skill) => skill.name);

  // A plausible wrong recommendation: the *tool* glob written into the skill slot. It is a rule, it
  // is well formed, and it matches none of the twenty-three — and criterion 1 asks that this be a
  // failure rather than an empty match set nobody looks at.
  assert.equal(ids.filter((id) => !matches(id, `${CALLABLE}*`)).length, ids.length,
    'a rule matching no skill was read as covering them');

  // The unprefixed form, which is what the recommendation was before ADR 02-04 moved the prefix
  // onto the front matter and the reason that ADR has a permission clause at all.
  assert.equal(ids.some((id) => matches(id, 'spec')), false,
    'an unprefixed resource matches a registered skill, so the prefix is not where this thinks');

  // And the direction the floor above guards: with nothing discovered, the sweep is empty and says
  // exactly as much as a clean pass.
  assert.deepEqual([].filter((id) => !matches(id, 'nothing-at-all')), [],
    'an empty corpus reports uncovered skills, so the floor is not the thing holding this up');
});

test('the section says what a skill rule is matched against, and it is true [unit]', () => {
  const body = permissions();

  // Criterion 2: a reader must be able to tell *why* one `dpm-*` covers everything, rather than
  // being handed a glob that happens to work.
  assert.match(body, /front matter/,
    'the section does not say what the permission engine matches a skill rule against');
  assert.match(body, /skills\/dpm-<skill>\/SKILL\.md/,
    'the section says the id is in the front matter without saying which file to open');

  // **And the claim is checked against the tree, not just found in the prose.** A README sentence
  // about where a name comes from is the kind that stays after the mechanism moves — this one is
  // here *because* the mechanism moved, and epic 02-02 is the epic that moved it.
  const registered = discoverSkills(ROOT);
  const disagree = registered
    .filter(({ name, location }) => frontMatter(skillSource(basename(location))).name !== name)
    .map(({ name }) => name);

  assert.deepEqual(disagree, [],
    'the README says a registered id is the front-matter name, and for these two it is not');
  assert.equal(registered.length, 23, 'the check above ran over a corpus that is not this one');
});

/**
 * Claims the section used to make that DPM has since stopped making true.
 *
 * **This exists because a test held the last one in place.** Epic 02-03 removed the
 * `external_directory` rule and `permission-entries.test.js` had been asserting that block was
 * *present* — so the instruction survived in the checks after it stopped being true in the product.
 * The paragraphs framing the rule then outlived the rule itself by an epic: the section opened by
 * telling a reader that one entry was worth setting whatever their configuration looked like, three
 * paragraphs above the text saying nothing DPM does reads outside the project.
 *
 * Matched on the claim rather than on the wording, so a rephrasing of the same false thing is
 * caught: a present-tense sentence saying DPM reads outside the project, and any sentence urging a
 * rule be set regardless of configuration.
 *
 * **Every space here is `\s+`, and the control is what established that it had to be.** The first
 * pattern was written line-anchored, which reads naturally and cannot work: the README is
 * hard-wrapped, the sentence it was written against breaks between `package` and `directory`, and
 * a `[^\n]*` pattern therefore stepped straight over the exact paragraph it exists to find. It
 * passed against the current section, where there is nothing to find, and would have gone on
 * passing. `tests/support/skills.js` records the same trap for skill bodies; it is a property of
 * every wrapped document in this repository and not of that corpus.
 */
const CONTRADICTED = [
  {
    pattern: /\b(?:reads?|opens?)\s+a\s+file\s+(?:from|in)\s+the\s+package\s+directory/,
    why: 'a present-tense claim that a skill reads outside the project',
  },
  {
    pattern: /\bworth\s+setting\s+whatever\s+your\s+configuration\b/,
    why: 'an entry urged on every reader, when none is needed any more',
  },
  {
    pattern: /\bOne\s+entry\s+here\s+is\s+a\s+step\b/,
    why: 'the section still opening on a step it no longer has',
  },
];

test('must NOT — the section makes a claim DPM has stopped making true [unit]', () => {
  assert.deepEqual(sweep(permissions(), CONTRADICTED), [],
    'the Permissions section says something about DPM that is no longer so');

  // The negative claim that replaced them is still there, so this did not pass by the section
  // having lost the subject altogether.
  assert.match(permissions(), /Nothing DPM does reads outside the project/,
    'the section no longer says what it does instead');
});

test('control — the paragraph this replaced is reported, by line [unit]', () => {
  // The actual text that stood here until this story, planted verbatim. A sweep written against a
  // remembered paraphrase is one that passes over the thing it was written for.
  const planted = 'One entry here is a step, and the rest is not. Every skill reads a file from '
    + 'the package\ndirectory, which the host treats as outside your project and asks about by '
    + 'default — so\nthat one rule is worth setting whatever your configuration looks like.';

  const found = sweep(planted, CONTRADICTED);

  assert.deepEqual(found.map((report) => report.split(' — ')[0]).sort(),
    CONTRADICTED.map(({ why }) => why).sort(),
    'the reading does not see every claim in the paragraph it was written against');

  assert.ok(found.every((report) => report.includes('"')), 'the report does not quote the line');

  // And the history is allowed to stay: the section still explains what the rule was for, and that
  // explanation must not be what this sweep finds.
  assert.deepEqual(sweep(section(README, 'Permissions'), CONTRADICTED), [],
    'the account of why the rule existed reads as the rule being recommended');
});

// --- Every tool action the section names is a tool the server registers ----------------------

/**
 * The actions the section names that belong to the **host** rather than to dpm.
 *
 * **Empty, and it was not.** It held `external_directory` — OpenCode's own action, gating a read
 * that leaves the project — because every skill body opened by reading the conventions file out of
 * the package directory, which is outside whatever repository the session is running in. The README
 * had to recommend a rule for an action no dpm tool would ever be registered under, so this file's
 * two-way partition needed a third case.
 *
 * Epic 02-03 removed the read. The conventions arrive through `dpm_read_shared_document`, which is
 * an ordinary dpm tool served in the server's own process, so nothing dpm does leaves the project
 * and the recommendation went with the mechanism. The list stays, empty, because the next host
 * action to be recommended needs somewhere to be classified — and because an empty list with this
 * paragraph attached says *we checked* where a deleted list would say nothing at all.
 *
 * **Asserted as an exact set in both directions, which is why the control below matters more now.**
 * A predicate — "not the dpm prefix, so presumably the host's" — would wave through
 * `externl_directory` exactly as readily as the real thing, and a mistyped action is a rule that
 * never fires. An exact set over an empty list is satisfied by a reading that finds nothing at all,
 * so the reading is driven over a planted block that names one.
 */
const HOST_ACTIONS = [];

test('every tool action the README names resolves to a registered tool [unit]', () => {
  const actions = registeredActions();

  assert.ok(actions.length > 100, `only ${actions.length} tools registered — the server did not build`);

  const named = documented().filter((rule) => rule.action !== 'skill').map((rule) => rule.action);

  assert.ok(named.length > 0, 'the section names no tool action at all');

  const host = named.filter((action) => HOST_ACTIONS.includes(action));

  assert.deepEqual([...new Set(host)].sort(), [...HOST_ACTIONS].sort(),
    'the section names a host action this file has not classified, or has stopped naming one it had');

  // **The control the empty list needs.** With nothing to find, the assertion above is satisfied by
  // a reader that cannot find anything — which is the state a broken block parser would leave it
  // in, silently, for as long as no host action is recommended. Driven over a planted block naming
  // the action that used to be there.
  const planted = '```json\n{"permissions":[{"action":"external_directory","resource":"*",'
    + '"effect":"allow"}]}\n```';

  assert.deepEqual(documented(planted).map((rule) => rule.action), ['external_directory'],
    'the reader does not see a host action in a block that names one');

  // And the recommendation really is gone from the README rather than moved out of a JSON block —
  // the prose above it explains the removal and names the action while doing so, which a check on
  // the raw text would report as the thing it is describing.
  assert.deepEqual(documented().map((rule) => rule.action).filter((action) => action === 'external_directory'),
    [], 'the README still recommends an external_directory rule for a read dpm no longer performs');

  for (const action of named.filter((candidate) => !HOST_ACTIONS.includes(candidate))) {
    assert.ok(action.startsWith(CALLABLE),
      `the README recommends a rule for action "${action}", which is neither "skill", a dpm tool, `
      + `nor one of the host's own (${HOST_ACTIONS.join(', ')})`);
    assert.ok(actions.some((registered) => matches(registered, action)),
      `the README recommends a rule for action "${action}", which matches no registered tool`);
  }

  assert.equal(actions.some((registered) => matches(registered, `${CALLABLE}not_a_tool`)), false);

  // The partition has to be capable of rejecting, or naming one host action opened the door to any
  // string at all: a near-miss on the host action falls through to the dpm check and fails there.
  assert.equal(HOST_ACTIONS.includes('externl_directory'), false);
});

// --- The claim the section is built around --------------------------------------------------

test('the removal the README sends you to gate is the one that tool performs [unit]', () => {
  const publish = withTools((tools) => tools.find((tool) => tool.name === 'publish'));

  // The section tells a reader to put the confirmation on `dpm_publish` because that is where the
  // deletion happens. If publish stopped being a mutating tool — or stopped being the only one
  // that unlinks — the advice would be wrong while still naming something that exists, which is
  // the failure the two tests above cannot see.
  assert.ok(publish, `${CALLABLE}publish is not a registered tool, and the README names it`);
  assert.equal(publish.mutates, true, 'publish no longer declares itself a mutating tool');

  const unlinks = pluginSources()
    .filter(({ text }) => /\bunlinkSync\s*\(/.test(withoutComments(text)))
    .map(({ name }) => name);

  assert.deepEqual(unlinks, ['src/publish/index.ts'],
    'something other than publish removes files, so "publish is the only DPM operation that '
    + 'deletes a file" is no longer true and the section says it is');
});

test('must NOT — a skill body is reachable other than through the skill the host gates [unit]', () => {
  // The section tells a reader that a denied skill has no second route to its instructions. Three
  // checkable halves of that, each of which would make it false on its own.
  const ids = discoverSkills(ROOT).map((skill) => skill.name);

  assert.deepEqual(ids, [...new Set(ids)],
    'two skills register under the same id, so one of them is reachable under a name the other '
    + "rule does not cover — and the host's registry is last-source-wins, so one is also lost");

  assert.equal(Object.hasOwn(packageManifest(), 'bin'), false,
    'package.json declares bin, which puts an executable on the user\'s PATH — a route to a '
    + "skill's work that no permission rule passes through");

  const readers = pluginSources()
    .filter(({ text }) => withoutComments(text).includes(SKILL_FILE))
    .map(({ name }) => name);

  assert.deepEqual(readers, ['src/plugin/skills.ts'],
    `something other than the registrar reads ${SKILL_FILE}; if it returns that text to a caller, `
    + 'a denied skill is readable through a tool the deny does not cover');

  // **The control.** Each assertion above is an absence, and all three would hold over a sweep that
  // read nothing. The one reader that must be there has to be found.
  assert.ok(pluginSources().length > 50, 'the sweep walked too few files to have read the package');
  assert.equal(readers.length, 1, 'the registrar itself was not found, so the sweep read nothing');
});
