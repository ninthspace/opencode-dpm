/**
 * Epic 01-02 Story 2 — the effective MCP tool naming under v2, and the surface underneath it.
 *
 * Two claims that sound alike and are not. **How a tool is addressed** changed with the host:
 * Claude Code dispatched a plugin-bundled server's tools as `mcp__plugin_<plugin>_<server>__<tool>`
 * and v2 renders `<server key>_<tool>`. **What the tools are** did not change at all, and that is
 * the one this file can check hardest.
 *
 * The naming itself was established by running a beta host — its criterion is tagged `manual` for
 * that reason, and a test that asserted a prefix string would be asserting what somebody typed.
 * What is checkable here is the second-order thing: that the observation was written down before
 * the twenty-three skill bodies get rewritten against it, and that the rendering rule the section
 * records is applied consistently by the code that has to apply it.
 *
 * **The surface comparison has a real oracle, and that is the whole of its value.**
 * `tests/fixtures/v070-tool-surface.json` is what the *released* v0.7.0 advertises — captured by
 * running `bin/dpm-mcp.js` out of the installed marketplace package, not by writing down what this
 * repository produces. Every other schema test in this suite compares the port against itself and
 * would go on passing if a description had been reworded consistently. `parity-v070.test.js` holds
 * the must-NOT that stops this fixture being rewritten when it disagrees.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SERVER_NAME } from '../src/plugin/index.ts';
import { spineTools } from '../src/tools/index.ts';
import { openPlanningDatabase } from './support/planning-database.js';

const ROOT = join(import.meta.dirname, '..');
const ORACLE = join(ROOT, 'tests', 'fixtures', 'v070-tool-surface.json');

/**
 * The rendering v2 performs, as the recorded section states it.
 *
 * Written here as code because the section is prose and prose cannot be run. What makes this more
 * than a restatement is the substitution: it was **observed**, by registering a second server under
 * the key `dpm-odd.name x` and reading back `dpm-odd_name_x_adopt_session`. The hyphen survived and
 * the dot and the space did not, which is the rule below and is not what a reader would guess from
 * "identifier-safe".
 */
const rendered = (server, tool) => `${server.replaceAll(/[^A-Za-z0-9_-]/g, '_')}_${tool}`;

test('the rendering rule is the one observed against the beta host [integration]', () => {
  // The observation, in the two cases that establish it. Both are quoted from the probe's output.
  assert.equal(rendered('dpm', 'adopt_session'), 'dpm_adopt_session');
  assert.equal(rendered('dpm-odd.name x', 'adopt_session'), 'dpm-odd_name_x_adopt_session');

  // The hyphen is the half a reader gets wrong, so it is asserted on its own rather than left
  // inside the compound case above.
  assert.equal(rendered('a-b', 'x'), 'a-b_x', 'the hyphen was replaced, and the host does not');
  assert.equal(rendered('a.b', 'x'), 'a_b_x');

  // And the name dpm registers under is the one the prefix is built from, read from the entry
  // rather than written out — a rename there is a rename of every tool the skills call.
  assert.equal(SERVER_NAME, 'dpm');
  assert.equal(rendered(SERVER_NAME, 'create_spec'), 'dpm_create_spec');

  // **Not the old form.** This is what the skill port has to change, and stating it here means the
  // difference is recorded in something that runs rather than only in prose.
  assert.notEqual(rendered(SERVER_NAME, 'create_spec'), 'mcp__plugin_dpm_dpm__create_spec');
});

test('the naming is recorded on the epic before any skill prose is rewritten [integration]', () => {
  // **Read from the projection rather than from the database**, because the projection is what a
  // reader rewriting the skills will actually open, and a section recorded but never published
  // would satisfy a database read while being invisible to the person it was written for.
  const projection = readFileSync(
    join(ROOT, 'docs', 'epics', '01-02-epic-plugin-entry.md'), 'utf8',
  );

  assert.match(projection, /effective MCP tool naming under OpenCode v2/,
    'the epic carries no section recording the naming');
  assert.match(projection, /dpm-odd_name_x_adopt_session/,
    'the section does not carry the observation the substitution rule was read from');
  assert.match(projection, /mcp__plugin_dpm_dpm__create_spec/,
    'the section does not say what the old form was, so a rewrite has nothing to rewrite from');

  // **The half that said "before", and it has been spent.** This used to assert that the skill
  // prose still named the old form, so the section above was genuinely ahead of the rewrite rather
  // than a note written afterwards — with a comment saying the rewrite is what would fail it. Epic
  // 01-03 story 2 rewrote all twenty-three bodies and the shared conventions with them, and the
  // assertion failed exactly as written. What replaces it is the opposite claim, which is the one
  // worth keeping now: nothing in the prose names the old form any more.
  const conventions = readFileSync(join(ROOT, 'shared', 'skill-conventions.md'), 'utf8');

  assert.doesNotMatch(conventions, /mcp__plugin_dpm_dpm__/,
    'the shared conventions still name Claude Code\'s prefix');
  assert.match(conventions, new RegExp(rendered(SERVER_NAME, 'list_taxonomy')),
    'and they name no v2 tool either, so the reading above found nothing in either direction');
});

// --- The surface itself, against v0.7.0's own output ---------------------------------------------

test('the advertised tool set and every schema match v0.7.0 exactly [integration]', (t) => {
  const oracle = JSON.parse(readFileSync(ORACLE, 'utf8'));
  const ported = spineTools(openPlanningDatabase(t))
    .map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Controls first, because a deep-equal of two empty lists is the passing answer here too.
  assert.equal(oracle.length, 183, `the oracle holds ${oracle.length} tools, and v0.7.0 advertised 183`);
  assert.ok(ported.length > 0, 'the registry built nothing to compare');

  // **The set, before the schemas.** Compared as names first so a tool that was added or lost is
  // reported as that, rather than as a diff of two 168KB structures with one entry out of step.
  assert.deepEqual(ported.map((tool) => tool.name), oracle.map((tool) => tool.name),
    'the advertised tool set differs from the one v0.7.0 advertised');

  // Then everything: description text and input schema, tool by tool, so a failure names the tool.
  for (const [index, expected] of oracle.entries()) {
    assert.deepEqual(ported[index], expected,
      `${expected.name} differs from what v0.7.0 advertised`);
  }

  // The control on the comparison, and it is the one that matters: the reading can tell two
  // surfaces apart. Without it, a `deepEqual` over structures that had both become `undefined`
  // would report perfect parity.
  const disturbed = ported.map((tool, index) => (index === 0
    ? { ...tool, description: `${tool.description} (planted)` }
    : tool));

  assert.notDeepEqual(disturbed, oracle, 'a reworded description is not noticed by this comparison');
});

test('the oracle is v0.7.0 output rather than a copy of this repository [unit]', () => {
  const oracle = JSON.parse(readFileSync(ORACLE, 'utf8'));

  // It cannot be *proved* from inside the tree that a fixture was captured from the release — what
  // can be checked is that it is a full surface rather than a stub, and that it carries the shape
  // a real `tools/list` reply has. `parity-v070.test.js` carries the part with teeth: the file may
  // never be modified or deleted, which is how a disagreement would otherwise be disposed of.
  for (const tool of oracle) {
    assert.ok(tool.name, 'a tool in the oracle has no name');
    assert.ok(tool.description, `${tool.name} has no description`);
    assert.equal(tool.inputSchema.type, 'object', `${tool.name} has no object input schema`);
    assert.equal(tool.inputSchema.additionalProperties, false,
      `${tool.name} accepts additional properties, which no dpm tool does`);
  }

  // And it is sorted, which is what makes the index-wise comparison above legitimate.
  assert.deepEqual(oracle.map((tool) => tool.name),
    [...oracle.map((tool) => tool.name)].sort((a, b) => a.localeCompare(b)));
});
