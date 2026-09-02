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
 *
 * ## Epic 02-05 story 3 — this file read the wrong shape, and so did the README
 *
 * Everything above was written against `permissions`: an **array** of `{ action, resource, effect }`
 * objects. That is OpenCode 2's shape. v1 takes `permission` — **singular, an object** keyed by
 * `skill`, `bash`, `edit` or a tool's own name, whose value is either a bare action or an object of
 * `pattern: action`. And v1 does not ignore the array: it refuses the whole configuration, so a
 * reader who pasted the recommended block got a host that would not start.
 *
 * **Nothing caught it, and the reason is worth keeping.** This file read the section's fenced JSON
 * with `JSON.parse(block).permissions ?? []` — and `?? []` over a block that has no such key is an
 * empty list, which every loop below passes over. `readme-v2.test.js` checked the same blocks for
 * being non-empty JSON, which the wrong shape is. Four tests and a rule, all green, over a
 * recommendation that could not load. The `?? []` is now `?? {}` on the key that has to be there,
 * and the well-formedness test asserts the plural key is **absent**, which is the assertion whose
 * absence let this stand.
 *
 * The vocabulary below is v1's throughout — `key`, `pattern`, and `effect` for what the host's own
 * documentation calls the action (`"allow"`, `"ask"`, `"deny"`). Keeping v2's `action`/`resource`
 * while reading v1's object is how the two shapes got confused in the first place.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basename, join } from 'node:path';
import { CALLABLE, PREFIX, frontMatter, section, skillSource, sweep } from './support/skills.js';
import { packageManifest, pluginSources, withoutComments } from './support/sources.js';
import { README, configBlocks, refusedBlocks } from './support/readme.js';
import { discoverSkills, SKILL_FILE } from '../src/plugin/skills.ts';
import { start } from '../src/start.ts';
import { spineTools } from '../src/tools/index.ts';

const ROOT = join(import.meta.dirname, '..');

/** The section under test, addressed by its heading rather than by a line range. */
const permissions = () => section(README, 'Permissions');

/**
 * The host's resource matcher, transcribed.
 *
 * @param {string} value The concrete id or tool name a request carries.
 * @param {string} pattern The rule's key or pattern, which may hold `*` and `?`.
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
 * **A bare action is expanded, because the host expands it.** `"dpm_publish": "ask"` is v1's
 * shorthand for `{ "*": "ask" }`, and reading it as a rule with no pattern would leave the
 * shorthand form of every recommendation unchecked by the two partitions below.
 *
 * @param {string} [source] Overridden by the controls, which drive the same reader over a planted
 *   block to show it reports what is in front of it.
 * @returns {Array<{key: string, pattern: string, effect: string}>}
 */
function documented(source = permissions()) {
  return configBlocks(source)
    .flatMap((parsed) => Object.entries(parsed.permission ?? {}))
    .flatMap(([key, value]) => (typeof value === 'string'
      ? [{ key, pattern: '*', effect: value }]
      : Object.entries(value).map(([pattern, effect]) => ({ key, pattern, effect }))));
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
    assert.deepEqual(Object.keys(rule).sort(), ['effect', 'key', 'pattern'],
      `a documented rule has the wrong keys: ${JSON.stringify(rule)}`);
    assert.ok(['allow', 'deny', 'ask'].includes(rule.effect),
      `a documented rule declares effect "${rule.effect}", which the host does not accept`);
  }

  // **The assertion whose absence let the section ship OpenCode 2's shape through four stories of a
  // v1-only README.** Every loop in this file is satisfied by a block written in the other shape,
  // because there are then no rules in it to be wrong — so the shape itself has to be asserted, and
  // it has to be asserted as an absence rather than inferred from the rules being found.
  assert.deepEqual(refusedBlocks(permissions()), [],
    'the section recommends a `permissions` array, which is the other host\'s shape — v1 refuses '
    + 'the whole configuration on it and the session does not start');

  // And the reader is a reader: over a planted block it reports what the block says, including an
  // effect the host would refuse. Without this, "every rule is well-formed" is also what an
  // extractor that silently found nothing would report.
  assert.deepEqual(documented('```json\n{"permission":{"a":{"b":"maybe"},"c":"deny"}}\n```'),
    [{ key: 'a', pattern: 'b', effect: 'maybe' }, { key: 'c', pattern: '*', effect: 'deny' }]);

  // The control on the absence above, driven rather than argued: the same reading over a block in
  // the shape that is refused reports it, and reports no rules at all — which is the pair of facts
  // that made the old reading silent.
  const wrong = '```json\n{"permissions":[{"action":"skill","resource":"dpm-*","effect":"allow"}]}\n```';

  assert.equal(refusedBlocks(wrong).length, 1, 'the reading does not see the plural key in a block that uses it');
  assert.deepEqual(documented(wrong), [], 'a block in the refused shape yields rules, so this is not the trap it was');
});

// --- Every skill the section names is a skill this package registers ------------------------

test('every skill pattern the README names resolves to a registered skill [unit]', () => {
  const ids = discoverSkills(ROOT).map((skill) => skill.name);

  assert.ok(ids.length > 20, `only ${ids.length} skills discovered, so matching against them proves little`);

  const named = documented().filter((rule) => rule.key === 'skill').map((rule) => rule.pattern);

  assert.ok(named.length > 0, 'the section names no skill pattern at all');

  for (const pattern of named) {
    assert.ok(ids.some((id) => matches(id, pattern)),
      `the README recommends a rule for skill pattern "${pattern}", which matches no skill this `
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
    .filter((rule) => rule.key === 'skill' && rule.effect === 'allow')
    .map((rule) => rule.pattern);

  assert.ok(allowed.length > 0, 'the README recommends no allow rule under the skill key at all');

  const uncovered = ids.filter((id) => !allowed.some((pattern) => matches(id, pattern)));

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
 * The permission keys the section names that belong to the **host** rather than to dpm.
 *
 * **Empty, and it was not.** It held `external_directory` — one of v1's own keys, gating a read
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

test('every tool key the README names resolves to a registered tool [unit]', () => {
  const actions = registeredActions();

  assert.ok(actions.length > 100, `only ${actions.length} tools registered — the server did not build`);

  const named = documented().filter((rule) => rule.key !== 'skill').map((rule) => rule.key);

  assert.ok(named.length > 0, 'the section names no tool key at all');

  const host = named.filter((key) => HOST_ACTIONS.includes(key));

  assert.deepEqual([...new Set(host)].sort(), [...HOST_ACTIONS].sort(),
    'the section names a host key this file has not classified, or has stopped naming one it had');

  // **The control the empty list needs.** With nothing to find, the assertion above is satisfied by
  // a reader that cannot find anything — which is the state a broken block parser would leave it
  // in, silently, for as long as no host key is recommended. Driven over a planted block naming
  // the key that used to be there.
  const planted = '```json\n{"permission":{"external_directory":{"*":"allow"}}}\n```';

  assert.deepEqual(documented(planted).map((rule) => rule.key), ['external_directory'],
    'the reader does not see a host key in a block that names one');

  // And the recommendation really is gone from the README rather than moved out of a JSON block —
  // the prose above it explains the removal and names the key while doing so, which a check on
  // the raw text would report as the thing it is describing.
  assert.deepEqual(documented().map((rule) => rule.key).filter((key) => key === 'external_directory'),
    [], 'the README still recommends an external_directory rule for a read dpm no longer performs');

  for (const key of named.filter((candidate) => !HOST_ACTIONS.includes(candidate))) {
    assert.ok(key.startsWith(CALLABLE),
      `the README recommends a rule under key "${key}", which is neither "skill", a dpm tool, `
      + `nor one of the host's own (${HOST_ACTIONS.join(', ')})`);
    assert.ok(actions.some((registered) => matches(registered, key)),
      `the README recommends a rule under key "${key}", which matches no registered tool`);
  }

  assert.equal(actions.some((registered) => matches(registered, `${CALLABLE}not_a_tool`)), false);

  // The partition has to be capable of rejecting, or naming one host key opened the door to any
  // string at all: a near-miss on the host key falls through to the dpm check and fails there.
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
