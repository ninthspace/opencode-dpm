/**
 * Epic 01-02 Story 5 — the registrations across a host reload.
 *
 * **Rewritten twice, and each rewrite asserted less than the last. Both reductions are findings.**
 *
 * Under v2 the entry's `setup` returned a cleanup, so dpm could dispose what it had registered and
 * a reload that re-ran `setup` left one of everything *because of code in this repository*. Epic
 * 02-01 retargeted the plugin at v1 alone, whose object route types `setup` as returning
 * `Promise<void> | void` — there is nowhere to hand a cleanup back to — and the property became one
 * about the host rather than about dpm: the `Registration` that `skill.transform` resolves with is
 * released by the host when the scope it was acquired in closes.
 *
 * **Epic 02-05 story 2 removed the question entirely for the skills.** The object route is fed by a
 * `plugins` config key that 1.18.25 strips, so the entry that carried it had no loader and was
 * deleted. The skills reach the host through its own `skills` key, pointed at `skills/` — a
 * directory the host walks itself. There is no registration to duplicate, nothing to dispose, and
 * no scope to reason about: a reload re-walks a directory, and a directory that has not changed
 * yields what it yielded before. The three tests that drove the append, the disposal and the
 * per-load profile selection went with the code they were about.
 *
 * What is left is the half that was always dpm's own, and it is the half a reload could still get
 * wrong:
 *
 * - **The MCP registration is keyed and therefore idempotent.** `config.mcp[SERVER_NAME] = entry`
 *   replaces, so a reload cannot duplicate the server whatever the host does with the hook.
 * - **The skills carry no such risk, and that is checkable rather than merely asserted.** Two walks
 *   of the tree agree, and nothing dpm ships holds state between them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as tools from '../src/plugin/index.ts';
import { SERVER_NAME } from '../src/plugin/registration.ts';
import { registerServer } from './support/host-contexts.js';
import { registeredSkills } from './support/skills.js';

/** Names appearing more than once — the shape a duplicate registration would take. */
const duplicates = (names) => names.filter((name, index, all) => all.indexOf(name) !== index);

test('the MCP registration is keyed, so a reload cannot leave two [integration]', async () => {
  // The host resolves its configuration and runs the hook; a reload does it again. The registry is
  // an object keyed by server name, so the second write replaces the first — which is why the
  // server needs no unwinding.
  const config = {};

  await registerServer(tools, config);
  const first = { ...config.mcp[SERVER_NAME] };

  await registerServer(tools, config);

  assert.deepEqual(Object.keys(config.mcp), [SERVER_NAME], 'the reload left more than one server entry');
  assert.deepEqual(config.mcp[SERVER_NAME], first, 'and the registration is the same one, not merely one');

  // The control on that reading: a registry that appended would show it, so the single key above is
  // a property of `config.mcp` being keyed rather than of this test never looking.
  const appended = { mcp: { [SERVER_NAME]: first, 'dpm-2': first } };

  assert.equal(Object.keys(appended.mcp).length, 2,
    'the reading cannot see a second entry, so the assertion above proves nothing');
});

test('a second walk of the skills tree yields exactly what the first did [unit]', () => {
  // **What replaced the disposal test, and it is a weaker claim about a stronger arrangement.** The
  // old one drove an append and then unwound it, because a registration that accumulates is a
  // registration a reload can double. A directory walk cannot accumulate — but it *could* still
  // carry state between calls, through a cached read or a module-level array, and that is the
  // failure this can still see.
  const first = registeredSkills();
  const second = registeredSkills();

  assert.equal(first.length, 23, `${first.length} skills discovered, and there are 23`);
  assert.deepEqual(duplicates(first.map(({ name }) => name)), [],
    'one walk of the tree already yields a name twice');
  assert.deepEqual(second.map(({ name }) => name), first.map(({ name }) => name),
    'two walks of an unchanged tree disagree, so something is held between them');
  assert.deepEqual(duplicates([...first, ...second].map(({ name }) => name)).sort(),
    first.map(({ name }) => name).sort(),
    'the two walks are not the same set, which is what an accumulating read would look like');

  // The control: `duplicates` can find one. Without it the empty list above is also what a reading
  // that compares nothing returns.
  assert.deepEqual(duplicates(['dpm-do', 'dpm-review', 'dpm-do']), ['dpm-do'],
    'the duplicate reading finds nothing in a list that holds one');
});
