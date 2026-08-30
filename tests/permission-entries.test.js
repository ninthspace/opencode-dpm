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
import { join } from 'node:path';
import { CALLABLE, section } from './support/skills.js';
import { packageManifest, pluginSources, withoutComments } from './support/sources.js';
import { discoverSkills, ID_PREFIX, SKILL_FILE } from '../src/plugin/skills.ts';
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
  const ids = discoverSkills(ROOT).map((skill) => skill.id);

  assert.ok(ids.length > 20, `only ${ids.length} skills discovered, so matching against them proves little`);

  const named = documented().filter((rule) => rule.action === 'skill').map((rule) => rule.resource);

  assert.ok(named.length > 0, 'the section names no skill resource at all');

  for (const resource of named) {
    assert.ok(ids.some((id) => matches(id, resource)),
      `the README recommends a rule for skill resource "${resource}", which matches no skill this `
      + 'package registers — a rule that never fires, and nothing would report it but this');
  }

  // The matcher has to be capable of failing, or the loop above passes on any string at all.
  assert.equal(ids.some((id) => matches(id, `${ID_PREFIX}not-a-skill`)), false);
  assert.equal(matches(`${ID_PREFIX}spec`, `${ID_PREFIX}*`), true);
});

// --- Every tool action the section names is a tool the server registers ----------------------

/**
 * The actions the section names that belong to the **host** rather than to dpm.
 *
 * `external_directory` is OpenCode's own. It gates a read that leaves the project, and every skill
 * body opens by reading the conventions file out of the package directory — which is outside
 * whatever repository the session is running in, wherever the package was installed. So the
 * section has to recommend a rule for an action no dpm tool will ever be registered under, and
 * the two-way partition this file was written around no longer covers what the README says.
 *
 * **Named individually, and asserted as an exact set in both directions.** A predicate — "not the
 * dpm prefix, so presumably the host's" — would wave through `externl_directory` exactly as
 * readily as the real thing, and a mistyped action is a rule that never fires, which is the one
 * failure this whole file exists to catch. An exact set fails until somebody classifies a new
 * arrival, and fails again if the guidance is deleted from the README, so the entry cannot quietly
 * stop being documented either. Same shape `suite-integrity.test.js` uses for its own exceptions,
 * and for the same reason: a rule loosened to admit one thing admits the next one silently.
 */
const HOST_ACTIONS = ['external_directory'];

test('every tool action the README names resolves to a registered tool [unit]', () => {
  const actions = registeredActions();

  assert.ok(actions.length > 100, `only ${actions.length} tools registered — the server did not build`);

  const named = documented().filter((rule) => rule.action !== 'skill').map((rule) => rule.action);

  assert.ok(named.length > 0, 'the section names no tool action at all');

  const host = named.filter((action) => HOST_ACTIONS.includes(action));

  assert.deepEqual([...new Set(host)].sort(), [...HOST_ACTIONS].sort(),
    'the section stopped naming a host action this file knows about — the rule a reader needs '
    + 'before any skill can read its conventions is the one most easily lost in an edit');

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
  const ids = discoverSkills(ROOT).map((skill) => skill.id);

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
