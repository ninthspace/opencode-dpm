/**
 * The per-skill tool allow-list — that it is derived, that it is ordered, and that it is written.
 *
 * dpm registers 184 tools and their schema is 116.5 KB, which on a small local model is the
 * difference between a skill that runs and one that never answers. `allowlist.ts` narrows the
 * session's permission to the tools the skill about to run actually names. The properties worth
 * holding are not "it produced a list" — a list of nothing passes that — but these:
 *
 * - **Derived, not declared.** Every tool a skill's body names is in its allowance, checked against
 *   the tree rather than against a fixture, so a skill that starts calling a new tool is covered
 *   without anyone remembering to say so.
 * - **The shared floor.** Every skill reads `skill-conventions` at startup and calls the procedures
 *   in it, so `dpm_create_session` and its neighbours are in all twenty-three allowances. This is
 *   the half a body-only derivation silently loses, and losing it breaks every skill's first step.
 * - **Ordered for `findLast`.** The host merges rulesets by concatenation and takes the last match,
 *   and drops a tool only on `pattern: '*'` with `action: 'deny'`. So the wildcard deny must come
 *   first and every allow after it. Reversed, the allow-list denies everything.
 * - **Smaller than the registry.** The whole point is the narrowing; an allowance that happened to
 *   cover every tool would satisfy every check above and deliver nothing.
 * - **Written, and only for dpm's own commands.** The hook calls the session route for `/dpm-spec`
 *   and leaves someone else's `/deploy` alone.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { allowances, restrictTools, ruleset, SHARED_CONVENTIONS, toolsNamed } from '../src/plugin/allowlist.ts';
import { packageRoot, SHARED_DIRECTORY } from '../src/plugin/root.ts';
import { discoverSkills } from '../src/plugin/skills.ts';

const root = packageRoot();
const skills = discoverSkills(root);
const derived = allowances(root);

/** A client that records what it was asked to write rather than writing it. */
const recorder = () => {
  const writes = [];

  return { writes, update: async (options) => void writes.push(options) };
};

describe('the tools a skill is left holding', () => {
  it('covers every dpm tool the skill body names', () => {
    assert.ok(skills.length > 0, 'no skills were discovered, so the sweep below asserts nothing');

    for (const skill of skills) {
      const named = [...toolsNamed(skill.content)];
      assert.ok(named.length > 0, `${skill.name} names no dpm tool at all, which no skill does`);

      const missing = named.filter((tool) => !derived[skill.name].includes(tool));
      assert.deepEqual(missing, [], `${skill.name} calls these and would be denied them`);
    }
  });

  it('carries the shared procedures every skill opens with', () => {
    const shared = [...toolsNamed(
      readFileSync(join(root, SHARED_DIRECTORY, SHARED_CONVENTIONS), 'utf8'),
    )];

    // Named rather than counted: these are the ones a skill's own body never mentions, because it
    // says "follow the shared Session Startup procedure" and the tools are in the procedure.
    for (const tool of ['dpm_read_shared_document', 'dpm_create_session', 'dpm_list_library']) {
      assert.ok(shared.includes(tool), `${tool} is not in ${SHARED_CONVENTIONS} any more`);
    }

    for (const skill of skills) {
      const missing = shared.filter((tool) => !derived[skill.name].includes(tool));
      assert.deepEqual(missing, [], `${skill.name} could not complete its own startup`);
    }
  });

  it('leaves every skill far short of the whole registry', () => {
    // The largest allowance today is 46 against 184 registered. The bound is loose on purpose — it
    // is here to fail when a derivation change quietly starts returning everything, not to pin a
    // number that moves whenever a skill gains a tool.
    for (const [name, tools] of Object.entries(derived)) {
      assert.ok(tools.length < 80, `${name} would carry ${tools.length} tools, which narrows little`);
    }
  });
});

describe('the ruleset handed to the host', () => {
  it('denies the wildcard before it allows anything, because the last match wins', () => {
    const rules = ruleset(['dpm_create_spec', 'dpm_list_requirement']);

    assert.deepEqual(rules[0], { permission: 'dpm_*', pattern: '*', action: 'deny' },
      'the wildcard deny is not first, so it would override the allows that precede it');
    assert.deepEqual(rules.slice(1).map((rule) => rule.action), ['allow', 'allow']);
  });

  it('writes every pattern as the wildcard, which is the only one that drops a tool', () => {
    // The host's filter is `rule.pattern === '*' && rule.action === 'deny'`. A narrower pattern on
    // the deny leaves all 184 tools in the request while looking like a restriction.
    for (const rule of ruleset(['dpm_create_spec'])) {
      assert.equal(rule.pattern, '*', `${rule.permission} was written with a narrower pattern`);
    }
  });

  it('names no tool outside dpm, so the host keeps read, edit, bash and question', () => {
    const rules = ruleset(derived['dpm-spec']);
    const foreign = rules.filter((rule) => !rule.permission.startsWith('dpm_'));

    assert.deepEqual(foreign, [], 'a rule reaches a tool that is not dpm\'s to restrict');
  });
});

describe('what the hook writes', () => {
  it('narrows the session to the command that is running', async () => {
    const client = recorder();
    await restrictTools(client, derived)({ command: 'dpm-spec', sessionID: 'ses_probe' }, { parts: [] });

    assert.equal(client.writes.length, 1, 'the session was not narrowed');

    const [write] = client.writes;
    assert.equal(write.path.id, 'ses_probe');
    assert.deepEqual(write.body.permission, ruleset(derived['dpm-spec']));
  });

  it('leaves a command that is not dpm\'s alone', async () => {
    const client = recorder();
    await restrictTools(client, derived)({ command: 'deploy', sessionID: 'ses_probe' }, { parts: [] });

    assert.deepEqual(client.writes, [], 'dpm narrowed a session for somebody else\'s command');
  });

  it('lets the command run when the route refuses the write', async () => {
    // The narrowing is an optimisation: a run that keeps the whole registry is slow, and a command
    // that throws is broken. This is the choice, held to by a test so it is not reversed by
    // accident.
    const refusing = { update: async () => { throw new Error('410 Gone'); } };

    await assert.doesNotReject(
      restrictTools(refusing, derived)({ command: 'dpm-spec', sessionID: 'ses_probe' }, { parts: [] }),
    );
  });
});
